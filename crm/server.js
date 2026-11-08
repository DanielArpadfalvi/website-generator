// Weboldal-outreach CRM – helyi szerver
// Indítás: npm start  (a .env-ben kell lennie a DATABASE_URL-nek)
import express from 'express';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4310);

if (!process.env.DATABASE_URL) {
  console.error('\n[HIBA] Hiányzik a DATABASE_URL. Másold le a .env.example fájlt .env néven, és írd bele a Supabase connection stringet.\n');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  max: 5,
});

export const STATUSES = ['new','qualified','demo_built','drafted','sent','replied','negotiating','won','lost','on_hold','opt_out','excluded'];
const ACTIVITY_TYPES = ['note','call','email_sent','email_received','meeting','followup_done','system'];
const EDITABLE = ['business_name','category','address','phone','email','contact_person','legal_form','facebook_url','instagram_url',
  'other_listing_url','notes','status','next_followup_at','followup_note','deal_value','priority','lost_reason','tags','has_website'];

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const wrap = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message });
});

const LEAD_SELECT = `
  select l.*,
    o.demo_url, o.gmail_draft_id, o.sent_at, o.suggested_domains,
    (select max(created_at) from leadgen.activities a where a.lead_id = l.id) as last_activity_at
  from leadgen.leads l
  left join lateral (
    select * from leadgen.outreach o where o.lead_id = l.id order by created_at desc limit 1
  ) o on true`;

// Lista szűrőkkel
app.get('/api/leads', wrap(async (req, res) => {
  const { status, q, category, due, hideClosed } = req.query;
  const where = []; const args = [];
  if (status) { args.push(String(status).split(',')); where.push(`l.status = any($${args.length})`); }
  if (category) { args.push(category); where.push(`l.category = $${args.length}`); }
  if (q) { args.push(`%${q}%`); where.push(`(l.business_name ilike $${args.length} or l.address ilike $${args.length} or l.phone ilike $${args.length} or l.email ilike $${args.length} or l.notes ilike $${args.length})`); }
  if (due === 'overdue') where.push(`l.next_followup_at < date_trunc('day', now())`);
  if (due === 'today') where.push(`l.next_followup_at < date_trunc('day', now()) + interval '1 day'`);
  if (due === 'week') where.push(`l.next_followup_at < date_trunc('day', now()) + interval '7 days'`);
  if (hideClosed === '1') where.push(`l.status not in ('excluded','opt_out','lost')`);
  const sql = `${LEAD_SELECT} ${where.length ? 'where ' + where.join(' and ') : ''}
    order by l.priority desc, l.next_followup_at asc nulls last, l.score_total desc nulls last limit 1000`;
  const { rows } = await pool.query(sql, args);
  res.json(rows);
}));

// Egy lead részletei
app.get('/api/leads/:id', wrap(async (req, res) => {
  const { rows } = await pool.query(`${LEAD_SELECT} where l.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Nincs ilyen ügyfél' });
  const acts = await pool.query(`select * from leadgen.activities where lead_id = $1 order by created_at desc`, [req.params.id]);
  const outs = await pool.query(`select * from leadgen.outreach where lead_id = $1 order by created_at desc`, [req.params.id]);
  res.json({ ...rows[0], activities: acts.rows, outreach: outs.rows });
}));

// Új lead kézzel
app.post('/api/leads', wrap(async (req, res) => {
  const b = req.body || {};
  if (!b.business_name) return res.status(400).json({ error: 'A név kötelező' });
  const { rows } = await pool.query(
    `insert into leadgen.leads (business_name, category, address, phone, email, notes, source, status, dedupe_key)
     values ($1,$2,$3,$4,$5,$6,'manual',coalesce($7,'new'), $8) returning *`,
    [b.business_name, b.category || null, b.address || null, b.phone || null, b.email || null, b.notes || null,
     STATUSES.includes(b.status) ? b.status : null,
     (b.business_name + (b.phone || '')).toLowerCase().replace(/\W/g, '').slice(0, 60) + '-m' + Date.now()]);
  await pool.query(`insert into leadgen.activities (lead_id, type, body) values ($1,'system','Kézzel felvéve a CRM-ben')`, [rows[0].id]);
  res.status(201).json(rows[0]);
}));

// Módosítás
app.patch('/api/leads/:id', wrap(async (req, res) => {
  const b = req.body || {};
  const sets = []; const args = [];
  for (const k of EDITABLE) {
    if (k in b) {
      if (k === 'status' && !STATUSES.includes(b[k])) return res.status(400).json({ error: 'Ismeretlen státusz' });
      let v = b[k];
      if (v === '') v = null;
      args.push(v); sets.push(`${k} = $${args.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'Nincs módosítandó mező' });
  args.push(req.params.id);
  const { rows } = await pool.query(`update leadgen.leads set ${sets.join(', ')} where id = $${args.length} returning *`, args);
  if (b.status === 'sent') {
    await pool.query(`update leadgen.outreach set sent_at = coalesce(sent_at, now())
                      where id = (select id from leadgen.outreach where lead_id = $1 order by created_at desc limit 1)`, [req.params.id]);
  }
  res.json(rows[0]);
}));

// Aktivitás (jegyzet, hívás, stb.)
app.post('/api/leads/:id/activities', wrap(async (req, res) => {
  const { type, body } = req.body || {};
  if (!ACTIVITY_TYPES.includes(type)) return res.status(400).json({ error: 'Ismeretlen típus' });
  const { rows } = await pool.query(
    `insert into leadgen.activities (lead_id, type, body) values ($1,$2,$3) returning *`, [req.params.id, type, body || null]);
  res.status(201).json(rows[0]);
}));

// Utókövetés lezárása (+ opcionálisan következő időpont)
app.post('/api/leads/:id/followup-done', wrap(async (req, res) => {
  const { body, next_followup_at, followup_note } = req.body || {};
  const cur = await pool.query(`select followup_note from leadgen.leads where id = $1`, [req.params.id]);
  await pool.query(`insert into leadgen.activities (lead_id, type, body) values ($1,'followup_done',$2)`,
    [req.params.id, body || cur.rows[0]?.followup_note || 'Utókövetés kész']);
  const { rows } = await pool.query(
    `update leadgen.leads set next_followup_at = $2, followup_note = $3 where id = $1 returning *`,
    [req.params.id, next_followup_at || null, next_followup_at ? (followup_note || null) : null]);
  res.json(rows[0]);
}));

// Dashboard statisztika
app.get('/api/stats', wrap(async (_req, res) => {
  const byStatus = await pool.query(`select status, count(*)::int n from leadgen.leads group by status`);
  const f = await pool.query(`select
      count(*) filter (where next_followup_at < date_trunc('day', now()))::int as overdue,
      count(*) filter (where next_followup_at >= date_trunc('day', now()) and next_followup_at < date_trunc('day', now()) + interval '1 day')::int as today,
      count(*) filter (where next_followup_at >= date_trunc('day', now()) + interval '1 day' and next_followup_at < date_trunc('day', now()) + interval '7 days')::int as week,
      coalesce(sum(deal_value) filter (where status = 'won'),0)::int as won_value,
      coalesce(sum(deal_value) filter (where status in ('replied','negotiating')),0)::int as pipeline_value,
      count(*) filter (where found_at > now() - interval '7 days')::int as new_7d
    from leadgen.leads`);
  const sent = await pool.query(`select count(*)::int n from leadgen.outreach where sent_at > now() - interval '30 days'`);
  const runs = await pool.query(`select run_date, leads_found, leads_new, drafted, log, created_at from leadgen.runs order by created_at desc limit 7`);
  const recent = await pool.query(`select a.*, l.business_name from leadgen.activities a join leadgen.leads l on l.id = a.lead_id
                                    order by a.created_at desc limit 15`);
  res.json({ byStatus: Object.fromEntries(byStatus.rows.map(r => [r.status, r.n])), ...f.rows[0],
             sent_30d: sent.rows[0].n, runs: runs.rows, recent: recent.rows });
}));

app.get('/api/categories', wrap(async (_req, res) => {
  const { rows } = await pool.query(`select category, count(*)::int n from leadgen.leads where category is not null group by 1 order by 2 desc`);
  res.json(rows);
}));

app.get('/api/health', wrap(async (_req, res) => {
  await pool.query('select 1 from leadgen.leads limit 1');
  res.json({ ok: true });
}));

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Outreach CRM fut:  http://localhost:${PORT}\n`);
});
