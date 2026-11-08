// leadgen-imap-draft
// Kész outreach levelet tesz a céges postafiók (daniel.arpadfalvi@redpunk.hu) Piszkozatok mappájába IMAP APPEND-del.
// A linkekhez senki nem nyúl, a demo előnézeti kép beágyazva (cid:demo-preview) kerül a levélbe.
//
// Titkok (Supabase → Edge Functions → Secrets): IMAP_PASS (kötelező), IMAP_HOST, IMAP_PORT, IMAP_USER, MAIL_FROM_NAME
// Hívás: POST, fejléc: x-leadgen-token = leadgen.config 'fn_token' értéke
// Body: { mode?: "check" | "append", to?: string, subject, html, text, image_url?, folder? }
import { createClient } from "jsr:@supabase/supabase-js@2";

const HOST = Deno.env.get("IMAP_HOST") ?? "mail.redpunk.hu";
const PORT = Number(Deno.env.get("IMAP_PORT") ?? "993");
const USER = Deno.env.get("IMAP_USER") ?? "daniel.arpadfalvi@redpunk.hu";
const PASS = Deno.env.get("IMAP_PASS") ?? "";
const FROM_NAME = Deno.env.get("MAIL_FROM_NAME") ?? "Árpádfalvi Dániel – Redpunk Studio";

const enc = new TextEncoder();
const dec = new TextDecoder();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// ---------- MIME ----------
const b64 = (bytes: Uint8Array) => {
  let bin = ""; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/.{1,76}/g, "$&\r\n");
};
const encWord = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(String.fromCharCode(...enc.encode(s)))}?=`;
const encHeaderLong = (s: string) => {
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  // UTF-8 karakterhatáron tördelve, max ~45 bájtos darabokban
  const parts: string[] = []; let cur = "";
  for (const ch of s) { if (enc.encode(cur + ch).length > 45) { parts.push(cur); cur = ch; } else cur += ch; }
  if (cur) parts.push(cur);
  return parts.map((p) => `=?UTF-8?B?${btoa(String.fromCharCode(...enc.encode(p)))}?=`).join("\r\n ");
};

function buildMime(o: { to?: string; subject: string; html: string; text: string; image?: Uint8Array }) {
  const id = crypto.randomUUID();
  const rel = `rel_${id}`, alt = `alt_${id}`;
  const headers = [
    `From: ${encWord(FROM_NAME)} <${USER}>`,
    o.to ? `To: ${o.to}` : null,
    `Subject: ${encHeaderLong(o.subject)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}@redpunk.hu>`,
    `MIME-Version: 1.0`,
    o.image ? `Content-Type: multipart/related; boundary="${rel}"; type="multipart/alternative"` : `Content-Type: multipart/alternative; boundary="${alt}"`,
  ].filter(Boolean).join("\r\n");
  const altPart = [
    `--${alt}`, `Content-Type: text/plain; charset=UTF-8`, `Content-Transfer-Encoding: base64`, ``, b64(enc.encode(o.text)),
    `--${alt}`, `Content-Type: text/html; charset=UTF-8`, `Content-Transfer-Encoding: base64`, ``, b64(enc.encode(o.html)),
    `--${alt}--`, ``,
  ].join("\r\n");
  if (!o.image) return `${headers}\r\n\r\n${altPart}`;
  return [
    headers, ``,
    `--${rel}`, `Content-Type: multipart/alternative; boundary="${alt}"`, ``, altPart,
    `--${rel}`, `Content-Type: image/jpeg; name="demo-elonezet.jpg"`, `Content-Transfer-Encoding: base64`,
    `Content-ID: <demo-preview>`, `Content-Disposition: inline; filename="demo-elonezet.jpg"`, ``, b64(o.image),
    `--${rel}--`, ``,
  ].join("\r\n");
}

// ---------- minimális IMAP kliens ----------
class Imap {
  conn!: Deno.TlsConn; buf = ""; n = 0;
  async open() {
    this.conn = await Deno.connectTls({ hostname: HOST, port: PORT });
    return await this.readLine();
  }
  async fill() {
    const chunk = new Uint8Array(16384);
    const r = await this.conn.read(chunk);
    if (r === null) throw new Error("IMAP kapcsolat lezárult");
    this.buf += dec.decode(chunk.subarray(0, r));
  }
  async readLine(): Promise<string> {
    while (!this.buf.includes("\r\n")) await this.fill();
    const i = this.buf.indexOf("\r\n"); const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2); return line;
  }
  async write(s: string | Uint8Array) { const b = typeof s === "string" ? enc.encode(s) : s; let o = 0; while (o < b.length) o += await this.conn.write(b.subarray(o)); }
  async cmd(c: string): Promise<string[]> {
    const tag = `a${++this.n}`; await this.write(`${tag} ${c}\r\n`);
    const lines: string[] = [];
    for (;;) {
      const l = await this.readLine(); lines.push(l);
      if (l.startsWith(tag + " ")) { if (!/^\S+ OK/i.test(l)) throw new Error(`IMAP hiba (${c.split(" ")[0]}): ${l}`); return lines; }
    }
  }
  async append(folder: string, msg: Uint8Array) {
    const tag = `a${++this.n}`;
    await this.write(`${tag} APPEND ${q(folder)} (\\Draft \\Seen) {${msg.length}}\r\n`);
    const cont = await this.readLine();
    if (!cont.startsWith("+")) throw new Error(`IMAP APPEND elutasítva: ${cont}`);
    await this.write(msg); await this.write("\r\n");
    for (;;) { const l = await this.readLine(); if (l.startsWith(tag + " ")) { if (!/OK/i.test(l)) throw new Error(`IMAP APPEND hiba: ${l}`); return l; } }
  }
  close() { try { this.conn.close(); } catch { /* */ } }
}
const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

async function draftsFolder(imap: Imap): Promise<{ folder: string; all: string[] }> {
  const lines = await imap.cmd(`LIST "" "*"`);
  const all: string[] = []; let special = "";
  for (const l of lines) {
    const m = l.match(/^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.+)$/i); if (!m) continue;
    const name = m[2].startsWith('"') ? m[2].slice(1, -1).replace(/\\"/g, '"') : m[2];
    all.push(name); if (/\\Drafts/i.test(m[1])) special = name;
  }
  const folder = special || all.find((f) => /(^|[./])drafts$/i.test(f)) || all.find((f) => /draft|piszkozat/i.test(f)) || "Drafts";
  return { folder, all };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST kell" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: okToken } = await sb.rpc("leadgen_check_token", { t: req.headers.get("x-leadgen-token") ?? "" });
  if (okToken !== true) return json({ error: "Nincs jogosultság" }, 401);
  if (!PASS) return json({ error: "Hiányzik az IMAP_PASS titok (Supabase → Edge Functions → Secrets)" }, 500);

  const body = await req.json().catch(() => ({}));
  const imap = new Imap();
  try {
    const greeting = await imap.open();
    await imap.cmd(`LOGIN ${q(USER)} ${q(PASS)}`);
    const { folder, all } = await draftsFolder(imap);
    if (body.mode === "check") { await imap.cmd("LOGOUT").catch(() => {}); return json({ ok: true, greeting, drafts_folder: folder, folders: all }); }

    if (!body.subject || !body.html) return json({ error: "subject és html kötelező" }, 400);
    let image: Uint8Array | undefined;
    if (body.image_url) {
      const r = await fetch(body.image_url);
      if (!r.ok) throw new Error(`A kép nem tölthető le (${r.status}): ${body.image_url}`);
      image = new Uint8Array(await r.arrayBuffer());
    }
    const mime = buildMime({ to: body.to || undefined, subject: body.subject, html: body.html, text: body.text || "", image });
    const res = await imap.append(body.folder || folder, enc.encode(mime));
    await imap.cmd("LOGOUT").catch(() => {});
    return json({ ok: true, folder: body.folder || folder, result: res, bytes: mime.length, with_image: !!image });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  } finally { imap.close(); }
});
