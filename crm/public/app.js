// Outreach CRM – frontend (vanilla JS)
const STATUS = {
  new: 'Új', qualified: 'Ellenőrizve', demo_built: 'Demo kész', drafted: 'Piszkozat', sent: 'Kiküldve',
  replied: 'Válaszolt', negotiating: 'Egyeztetés', won: 'Megnyert', lost: 'Elvesztett', on_hold: 'Várakozik',
  opt_out: 'Leiratkozott', excluded: 'Kizárva',
};
const PIPE_COLS = ['qualified','demo_built','drafted','sent','replied','negotiating','won','lost'];
const ACT = {
  note: ['📝','Jegyzet'], call: ['📞','Hívás'], email_sent: ['📤','Email küldve'], email_received: ['📥','Email jött'],
  meeting: ['🤝','Találkozó'], status_change: ['🔀','Státusz'], followup_done: ['✅','Utókövetés kész'], system: ['⚙️','Rendszer'],
};
const CAT = {
  hair_salon: 'Fodrász', barber_shop: 'Barber', beauty_salon: 'Szépségszalon', beautician: 'Kozmetikus', massage: 'Masszázs',
  electrician: 'Villanyszerelő', painter: 'Festő', pet_care: 'Kutyakozmetika', service: 'Szolgáltatás', point_of_interest: 'Egyéb',
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pill = (s) => `<span class="pill st-${s}">${STATUS[s] || s}</span>`;
const cat = (c) => CAT[c] || c || '–';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' }) : '';
const fmtDT = (d) => d ? new Date(d).toLocaleString('hu-HU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const actText = (a) => a.type === 'status_change' && a.meta ? `${STATUS[a.meta.from] || a.meta.from} → ${STATUS[a.meta.to] || a.meta.to}` : (a.body || ACT[a.type]?.[1] || '');
const huf = (n) => (n || 0).toLocaleString('hu-HU') + ' Ft';

async function api(path, opts = {}) {
  const r = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' }, ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2200);
}
function dueInfo(d) {
  if (!d) return '';
  const now = new Date(); const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dt = new Date(d); const diff = Math.floor((dt - start) / 86400000);
  if (diff < 0) return `<span class="due over">⏰ ${-diff} napja lejárt</span>`;
  if (diff === 0) return `<span class="due today">⏰ ma</span>`;
  if (diff === 1) return `<span class="due">holnap</span>`;
  return `<span class="due">${fmtDate(d)}</span>`;
}
const isoLocal = (d) => { if (!d) return ''; const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
const daysFromNow = (n, h = 9) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, 0, 0, 0); return d.toISOString(); };

// ---------- Router ----------
let current = 'dashboard';
const state = { list: { q: '', status: '', category: '', hideClosed: true, sort: 'score_total', dir: -1 } };
document.querySelectorAll('.side nav button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
function show(view) {
  current = view;
  document.querySelectorAll('.side nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => (v.hidden = v.id !== 'view-' + view));
  location.hash = view;
  render();
}
window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1);
  if (v !== current && ['dashboard', 'pipeline', 'list', 'followups'].includes(v)) show(v);
});
function render() {
  ({ dashboard: renderDashboard, pipeline: renderPipeline, list: renderList, followups: renderFollowups })[current]();
  refreshBadge();
}
async function refreshBadge() {
  try {
    const s = await api('/stats');
    const n = s.overdue + s.today; const b = $('#badge-follow');
    b.hidden = !n; b.textContent = n;
  } catch {}
}

// ---------- Dashboard ----------
async function renderDashboard() {
  const el = $('#view-dashboard');
  const s = await api('/stats');
  const bs = s.byStatus;
  const active = ['qualified','demo_built','drafted','sent','replied','negotiating'].reduce((a, k) => a + (bs[k] || 0), 0);
  const replied = (bs.replied || 0) + (bs.negotiating || 0) + (bs.won || 0) + (bs.lost || 0);
  const contacted = replied + (bs.sent || 0);
  const funnelKeys = ['new','qualified','demo_built','drafted','sent','replied','negotiating','won'];
  const max = Math.max(1, ...funnelKeys.map((k) => bs[k] || 0));
  el.innerHTML = `
    <h1>Áttekintés</h1><p class="sub">${new Date().toLocaleDateString('hu-HU', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    <div class="kpis">
      <div class="kpi ${s.overdue ? 'alert' : ''}"><div class="l">Lejárt utókövetés</div><div class="v">${s.overdue}</div></div>
      <div class="kpi"><div class="l">Mai teendő</div><div class="v">${s.today}</div></div>
      <div class="kpi"><div class="l">Aktív folyamatban</div><div class="v">${active}</div></div>
      <div class="kpi"><div class="l">Válaszarány</div><div class="v">${contacted ? Math.round((replied / contacted) * 100) : 0}%</div></div>
      <div class="kpi"><div class="l">Megnyert</div><div class="v">${bs.won || 0}</div></div>
      <div class="kpi"><div class="l">Bevétel (megnyert)</div><div class="v">${huf(s.won_value)}</div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2>Tölcsér</h2><div class="funnel">
        ${funnelKeys.map((k) => `<div class="f"><span>${STATUS[k]}</span><div class="bar"><i style="width:${((bs[k] || 0) / max) * 100}%"></i></div><span class="n">${bs[k] || 0}</span></div>`).join('')}
      </div>
      <h2 style="margin-top:22px">Utolsó napi futások</h2>
      ${s.runs.length ? `<ul class="feed">${s.runs.map((r) => `<li><div class="ico">⚙️</div><div><b>${fmtDate(r.created_at)}</b> · ${r.leads_new ?? 0} új lead, ${r.drafted ?? 0} piszkozat<div class="t">${esc(r.log || '')}</div></div></li>`).join('')}</ul>` : '<p class="small-muted">Még nem futott.</p>'}
      </div>
      <div class="card"><h2>Legutóbbi események</h2>
        ${s.recent.length ? `<ul class="feed">${s.recent.map((a) => `<li data-id="${a.lead_id}" style="cursor:pointer"><div class="ico">${(ACT[a.type] || ['•'])[0]}</div><div><b>${esc(a.business_name)}</b> – ${esc(actText(a))}<div class="t">${fmtDT(a.created_at)}</div></div></li>`).join('')}</ul>` : '<p class="small-muted">Nincs még esemény.</p>'}
      </div>
    </div>`;
  el.querySelectorAll('[data-id]').forEach((li) => li.addEventListener('click', () => openLead(li.dataset.id)));
}

// ---------- Pipeline (kanban) ----------
async function renderPipeline() {
  const el = $('#view-pipeline');
  const leads = await api('/leads?status=' + PIPE_COLS.join(','));
  el.innerHTML = `<h1>Pipeline</h1><p class="sub">Húzd át a kártyát másik oszlopba a státusz módosításához.</p>
    <div class="board">${PIPE_COLS.map((s) => {
      const items = leads.filter((l) => l.status === s);
      return `<div class="col" data-status="${s}"><header><span>${STATUS[s]}</span><span class="n">${items.length}</span></header>
        <div class="cards">${items.map(cardHtml).join('')}</div></div>`;
    }).join('')}</div>`;
  el.querySelectorAll('.lcard').forEach((c) => {
    c.addEventListener('click', () => openLead(c.dataset.id));
    c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.id); c.classList.add('dragging'); });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
  });
  el.querySelectorAll('.col').forEach((col) => {
    col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', () => col.classList.remove('drop'));
    col.addEventListener('drop', async (e) => {
      e.preventDefault(); col.classList.remove('drop');
      const id = e.dataTransfer.getData('text/plain');
      await setStatus(id, col.dataset.status);
      renderPipeline();
    });
  });
}
const cardHtml = (l) => `<div class="lcard" draggable="true" data-id="${l.id}">
  <div class="ttl">${esc(l.business_name)}</div>
  <div class="meta"><span>${cat(l.category)}${l.rating ? ` · ${l.rating}★` : ''}</span>${dueInfo(l.next_followup_at) || `<span>${l.score_total ? Math.round(l.score_total) + ' p' : ''}</span>`}</div>
  ${l.deal_value ? `<div class="meta" style="margin-top:4px"><span>${huf(l.deal_value)}</span></div>` : ''}
</div>`;

// ---------- Lista ----------
async function renderList() {
  const el = $('#view-list'); const f = state.list;
  if (!el.dataset.init) {
    const cats = await api('/categories');
    el.innerHTML = `<h1>Ügyfelek</h1><p class="sub">Minden felkutatott vállalkozás, pontszám szerint rendezve.</p>
      <div class="toolbar">
        <input type="search" id="f-q" placeholder="Keresés név, cím, telefon, jegyzet…">
        <select id="f-status"><option value="">Minden státusz</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <select id="f-cat"><option value="">Minden kategória</option>${cats.map((c) => `<option value="${esc(c.category)}">${esc(cat(c.category))} (${c.n})</option>`).join('')}</select>
        <label><input type="checkbox" id="f-hide" checked> Lezártak elrejtése</label>
        <span class="small-muted" id="f-count"></span>
      </div><div id="list-table"></div>`;
    el.dataset.init = 1;
    $('#f-q').addEventListener('input', debounce((e) => { f.q = e.target.value; loadList(); }, 250));
    $('#f-status').addEventListener('change', (e) => { f.status = e.target.value; loadList(); });
    $('#f-cat').addEventListener('change', (e) => { f.category = e.target.value; loadList(); });
    $('#f-hide').addEventListener('change', (e) => { f.hideClosed = e.target.checked; loadList(); });
  }
  loadList();
}
async function loadList() {
  const f = state.list;
  const qs = new URLSearchParams({ q: f.q, status: f.status, category: f.category, hideClosed: f.hideClosed && !f.status ? '1' : '' });
  let rows = await api('/leads?' + qs);
  const key = f.sort;
  rows.sort((a, b) => {
    const x = a[key] ?? (typeof b[key] === 'number' ? -Infinity : ''); const y = b[key] ?? (typeof a[key] === 'number' ? -Infinity : '');
    return (x > y ? 1 : x < y ? -1 : 0) * f.dir;
  });
  $('#f-count').textContent = `${rows.length} találat`;
  const cols = [['business_name','Név'],['category','Kategória'],['status','Státusz'],['rating','Értékelés'],['score_total','Pont'],['next_followup_at','Utókövetés'],['phone','Kapcsolat']];
  $('#list-table').innerHTML = rows.length ? `<table class="leads"><thead><tr>${cols.map(([k, v]) => `<th data-k="${k}">${v}${f.sort === k ? (f.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((l) => `<tr data-id="${l.id}">
      <td><div class="name">${esc(l.business_name)}</div><div class="small-muted">${esc((l.address || '').replace(', Hungary', ''))}</div></td>
      <td>${esc(cat(l.category))}</td>
      <td>${pill(l.status)}</td>
      <td class="num">${l.rating ? `${l.rating}★ <span class="small-muted">(${l.review_count})</span>` : '–'}</td>
      <td class="num"><b>${l.score_total != null ? Math.round(l.score_total) : '–'}</b></td>
      <td>${dueInfo(l.next_followup_at) || '<span class="small-muted">–</span>'}</td>
      <td class="small-muted">${esc(l.email || l.phone || '–')}</td>
    </tr>`).join('')}</tbody></table>` : '<div class="empty">Nincs találat.</div>';
  $('#list-table').querySelectorAll('tbody tr').forEach((tr) => tr.addEventListener('click', () => openLead(tr.dataset.id)));
  $('#list-table').querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
    if (f.sort === th.dataset.k) f.dir *= -1; else { f.sort = th.dataset.k; f.dir = th.dataset.k === 'business_name' ? 1 : -1; }
    loadList();
  }));
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// ---------- Utókövetés ----------
async function renderFollowups() {
  const el = $('#view-followups');
  const rows = (await api('/leads?due=week')).filter((l) => !['won','lost','opt_out','excluded'].includes(l.status));
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const groups = [
    ['Lejárt', rows.filter((l) => new Date(l.next_followup_at) < start)],
    ['Ma', rows.filter((l) => { const d = new Date(l.next_followup_at); return d >= start && d < end; })],
    ['A héten', rows.filter((l) => new Date(l.next_followup_at) >= end)],
  ];
  el.innerHTML = `<h1>Utókövetés</h1><p class="sub">A következő 7 nap teendői. Kattints egy sorra a részletekért.</p>
    ${groups.map(([title, list]) => `<div class="card" style="margin-bottom:16px"><h2>${title} <span class="small-muted">(${list.length})</span></h2>
      ${list.length ? `<table class="leads"><tbody>${list.map((l) => `<tr data-id="${l.id}">
        <td style="width:34%"><div class="name">${esc(l.business_name)}</div><div class="small-muted">${esc(cat(l.category))}</div></td>
        <td>${pill(l.status)}</td>
        <td>${esc(l.followup_note || '')}</td>
        <td>${dueInfo(l.next_followup_at)}</td>
        <td style="text-align:right;white-space:nowrap">
          ${l.phone ? `<a class="btn small" href="tel:${esc(l.phone.replace(/\s/g, ''))}" onclick="event.stopPropagation()">📞</a>` : ''}
          <button class="btn small" data-done="${l.id}">Kész</button>
          <button class="btn small" data-snooze="${l.id}">+3 nap</button>
        </td></tr>`).join('')}</tbody></table>` : '<p class="small-muted">Nincs teendő.</p>'}
    </div>`).join('')}`;
  el.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', () => openLead(tr.dataset.id)));
  el.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation(); await api(`/leads/${b.dataset.done}/followup-done`, { method: 'POST', body: {} }); toast('Utókövetés lezárva'); render();
  }));
  el.querySelectorAll('[data-snooze]').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation(); await api(`/leads/${b.dataset.snooze}`, { method: 'PATCH', body: { next_followup_at: daysFromNow(3) } }); toast('Áttéve 3 nappal'); render();
  }));
}

// ---------- Részletek (oldalpanel) ----------
async function setStatus(id, status) {
  let extra = {};
  if (status === 'lost') { const r = prompt('Miért veszett el? (opcionális)'); if (r) extra.lost_reason = r; }
  if (status === 'won') { const v = prompt('Megbízás értéke (Ft)?', '50000'); if (v) extra.deal_value = Number(String(v).replace(/\D/g, '')); }
  await api(`/leads/${id}`, { method: 'PATCH', body: { status, ...extra } });
  toast(`Státusz: ${STATUS[status]}`);
}
function closeDrawer() { $('#drawer').hidden = true; $('#drawer-backdrop').hidden = true; render(); }
$('#drawer-backdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#drawer').hidden) closeDrawer(); });

async function openLead(id) {
  const l = await api('/leads/' + id);
  const d = $('#drawer'); d.hidden = false; $('#drawer-backdrop').hidden = false;
  const o = l.outreach[0];
  const domains = (o?.suggested_domains || []).map((x) => x.domain).join(', ');
  d.innerHTML = `
    <div class="d-head"><div><h2>${esc(l.business_name)}</h2><div class="small-muted">${esc(cat(l.category))} · ${esc((l.address || '').replace(', Hungary', ''))}</div></div>
      <button class="btn ghost" id="d-close">✕</button></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <select id="d-status" class="btn">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === l.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
      ${l.rating ? `<span>${l.rating}★ <span class="small-muted">(${l.review_count} vélemény)</span></span>` : ''}
      <span class="small-muted">Felvéve: ${fmtDate(l.found_at)}</span>
    </div>
    <div class="d-links">
      ${o?.demo_url ? `<a class="btn small" target="_blank" href="${esc(o.demo_url)}">🌐 Demo oldal</a>` : ''}
      ${o?.gmail_draft_id ? `<a class="btn small" target="_blank" href="https://mail.google.com/mail/u/0/#drafts">✉️ Gmail piszkozatok</a>` : ''}
      ${l.google_maps_url ? `<a class="btn small" target="_blank" href="${esc(l.google_maps_url)}">📍 Google Maps</a>` : ''}
      ${l.phone ? `<a class="btn small" href="tel:${esc(l.phone.replace(/\s/g, ''))}">📞 ${esc(l.phone)}</a>` : ''}
      ${l.email ? `<a class="btn small" href="mailto:${esc(l.email)}">📧 ${esc(l.email)}</a>` : ''}
      ${l.facebook_url ? `<a class="btn small" target="_blank" href="${esc(l.facebook_url)}">Facebook</a>` : ''}
      ${l.instagram_url ? `<a class="btn small" target="_blank" href="${esc(l.instagram_url)}">Instagram</a>` : ''}
    </div>
    ${l.status === 'drafted' ? `<button class="btn primary" id="d-sent" style="margin-bottom:6px">Kiküldtem az emailt ✓</button><div class="small-muted">A kiküldés jelölése után 4 nap múlva automatikus utókövetés jön létre.</div>` : ''}

    <div class="d-sec"><h3>Utókövetés</h3>
      <div class="follow-box ${l.next_followup_at ? '' : 'none'}">
        ${l.next_followup_at ? `<div><b>${fmtDT(l.next_followup_at)}</b> ${dueInfo(l.next_followup_at)}</div><div>${esc(l.followup_note || '')}</div>
          <div class="quick"><button class="btn small primary" id="d-fdone">Kész</button></div>` : '<div class="small-muted">Nincs ütemezett utókövetés.</div>'}
        <div class="quick">
          <span class="small-muted" style="align-self:center">Ütemezés:</span>
          <button class="btn small" data-days="1">holnap</button><button class="btn small" data-days="3">+3 nap</button>
          <button class="btn small" data-days="7">+1 hét</button><button class="btn small" data-days="14">+2 hét</button>
        </div>
        <div class="fields"><label>Pontos időpont<input type="datetime-local" id="d-fdate" value="${isoLocal(l.next_followup_at)}"></label>
          <label>Teendő<input id="d-fnote" value="${esc(l.followup_note || '')}" placeholder="pl. visszahívni"></label></div>
      </div>
    </div>

    <div class="d-sec"><h3>Adatok</h3>
      <div class="fields">
        <label>Kapcsolattartó<input data-f="contact_person" value="${esc(l.contact_person || '')}"></label>
        <label>Cégforma<select data-f="legal_form">${['', 'ev', 'kft', 'bt', 'egyeb'].map((v) => `<option value="${v}" ${v === (l.legal_form || '') ? 'selected' : ''}>${{ '': '–', ev: 'Egyéni vállalkozó', kft: 'Kft.', bt: 'Bt.', egyeb: 'Egyéb' }[v]}</option>`).join('')}</select></label>
        <label>Email<input data-f="email" type="email" value="${esc(l.email || '')}"></label>
        <label>Telefon<input data-f="phone" value="${esc(l.phone || '')}"></label>
        <label>Facebook<input data-f="facebook_url" value="${esc(l.facebook_url || '')}"></label>
        <label>Instagram<input data-f="instagram_url" value="${esc(l.instagram_url || '')}"></label>
        <label>Megbízás értéke (Ft)<input data-f="deal_value" type="number" value="${l.deal_value ?? ''}"></label>
        <label>Prioritás<select data-f="priority">${[0, 1, 2].map((p) => `<option value="${p}" ${p === (l.priority || 0) ? 'selected' : ''}>${['Normál', 'Magas', 'Sürgős'][p]}</option>`).join('')}</select></label>
        ${l.status === 'lost' ? `<label class="wide">Elvesztés oka<input data-f="lost_reason" value="${esc(l.lost_reason || '')}"></label>` : ''}
        <label class="wide">Megjegyzés<textarea data-f="notes" rows="3">${esc(l.notes || '')}</textarea></label>
      </div>
      <div class="score" style="margin-top:12px">
        <span>Össz: <b>${l.score_total != null ? Math.round(l.score_total) : '–'}</b></span><span>Minőség: ${l.score_quality ?? '–'}</span>
        <span>Web-hiány: ${l.score_digital_gap ?? '–'}</span><span>Növekedés: ${l.score_growth ?? '–'}</span><span>Elérhetőség: ${l.score_contactability ?? '–'}</span>
      </div>
      ${domains ? `<p class="small-muted" style="margin-top:10px">Ajánlott domainek: ${esc(domains)}</p>` : ''}
    </div>

    <div class="d-sec"><h3>Előzmények</h3>
      <div class="add-act">
        <textarea id="d-act" placeholder="Mi történt? (hívás, válasz, megbeszélés…)"></textarea>
        <div class="row"><select id="d-act-type">${['note', 'call', 'email_received', 'email_sent', 'meeting'].map((t) => `<option value="${t}">${ACT[t][0]} ${ACT[t][1]}</option>`).join('')}</select>
          <button class="btn primary" id="d-act-add">Hozzáadás</button></div>
      </div>
      <ul class="timeline">${l.activities.map((a) => `<li><div class="ico">${(ACT[a.type] || ['•'])[0]}</div><div><div class="b">${esc(actText(a))}</div><div class="small-muted">${ACT[a.type]?.[1] || a.type} · ${fmtDT(a.created_at)}</div></div></li>`).join('') || '<li class="small-muted">Nincs még esemény.</li>'}</ul>
    </div>`;

  $('#d-close').onclick = closeDrawer;
  $('#d-status').onchange = async (e) => { await setStatus(id, e.target.value); openLead(id); };
  if ($('#d-sent')) $('#d-sent').onclick = async () => { await setStatus(id, 'sent'); openLead(id); };
  if ($('#d-fdone')) $('#d-fdone').onclick = async () => { await api(`/leads/${id}/followup-done`, { method: 'POST', body: {} }); toast('Utókövetés lezárva'); openLead(id); };
  d.querySelectorAll('[data-days]').forEach((b) => b.onclick = async () => {
    await api(`/leads/${id}`, { method: 'PATCH', body: { next_followup_at: daysFromNow(Number(b.dataset.days)), followup_note: $('#d-fnote').value || 'Utókövetés' } });
    toast('Utókövetés ütemezve'); openLead(id);
  });
  $('#d-fdate').onchange = async (e) => {
    await api(`/leads/${id}`, { method: 'PATCH', body: { next_followup_at: e.target.value ? new Date(e.target.value).toISOString() : null, followup_note: $('#d-fnote').value || null } });
    toast('Mentve'); openLead(id);
  };
  $('#d-fnote').onchange = async (e) => { await api(`/leads/${id}`, { method: 'PATCH', body: { followup_note: e.target.value } }); toast('Mentve'); };
  d.querySelectorAll('[data-f]').forEach((inp) => inp.onchange = async () => {
    let v = inp.value; if (inp.dataset.f === 'deal_value' || inp.dataset.f === 'priority') v = v === '' ? null : Number(v);
    await api(`/leads/${id}`, { method: 'PATCH', body: { [inp.dataset.f]: v } }); toast('Mentve');
  });
  $('#d-act-add').onclick = async () => {
    const body = $('#d-act').value.trim(); if (!body) return;
    await api(`/leads/${id}/activities`, { method: 'POST', body: { type: $('#d-act-type').value, body } });
    toast('Hozzáadva'); openLead(id);
  };
}

// ---------- Új ügyfél ----------
$('#btn-new').onclick = () => { $('#form-new').reset(); $('#dlg-new').showModal(); };
$('#dlg-new').addEventListener('close', async () => {
  if ($('#dlg-new').returnValue !== 'ok') return;
  const data = Object.fromEntries(new FormData($('#form-new')));
  const l = await api('/leads', { method: 'POST', body: data });
  toast('Ügyfél felvéve'); openLead(l.id);
});

// ---------- Indítás ----------
(async () => {
  try { await api('/health'); $('#conn').textContent = '● Supabase kapcsolat OK'; }
  catch (e) { $('#conn').textContent = '● Nincs DB kapcsolat'; $('#conn').style.color = '#e88'; }
  const v = location.hash.slice(1);
  show(['dashboard', 'pipeline', 'list', 'followups'].includes(v) ? v : 'dashboard');
})();
