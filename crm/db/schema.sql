-- leadgen séma (a Supabase-ben már él; ez a fájl dokumentáció + helyi teszt DB-hez)
create extension if not exists pgcrypto;
create schema if not exists leadgen;

create table if not exists leadgen.leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  category text,
  city text default 'Szeged',
  address text,
  phone text,
  email text,
  legal_form text,
  owner_name text,
  google_maps_url text,
  facebook_url text,
  instagram_url text,
  other_listing_url text,
  has_website boolean default false,
  rating numeric(2,1),
  review_count int,
  last_activity date,
  notes text,
  score_quality numeric,
  score_activity numeric,
  score_digital_gap numeric,
  score_contactability numeric,
  score_growth numeric,
  score_total numeric,
  status text not null default 'new' check (status in
    ('new','qualified','demo_built','drafted','sent','replied','negotiating','won','lost','on_hold','opt_out','excluded')),
  dedupe_key text unique,
  source text,
  found_at timestamptz default now(),
  updated_at timestamptz default now(),
  contact_person text,
  next_followup_at timestamptz,
  followup_note text,
  deal_value int,
  priority smallint default 0,
  lost_reason text,
  tags text[] default '{}'
);

create table if not exists leadgen.outreach (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leadgen.leads(id) on delete cascade,
  demo_url text,
  suggested_domains jsonb,
  email_subject text,
  email_body text,
  gmail_draft_id text,
  sent_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists leadgen.opt_outs (
  email text primary key,
  reason text,
  created_at timestamptz default now()
);

create table if not exists leadgen.runs (
  id uuid primary key default gen_random_uuid(),
  run_date date default current_date,
  leads_found int,
  leads_new int,
  drafted int,
  log text,
  created_at timestamptz default now()
);

create table if not exists leadgen.activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leadgen.leads(id) on delete cascade,
  type text not null check (type in ('note','call','email_sent','email_received','meeting','status_change','followup_done','system')),
  body text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create or replace function leadgen.tg_leads_audit() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into leadgen.activities (lead_id, type, body, meta)
    values (new.id, 'status_change', old.status || ' → ' || new.status, jsonb_build_object('from', old.status, 'to', new.status));
    if new.status = 'sent' and new.next_followup_at is null then
      new.next_followup_at := (date_trunc('day', now() at time zone 'Europe/Budapest') + interval '4 days 9 hours') at time zone 'Europe/Budapest';
      new.followup_note := coalesce(new.followup_note, 'Rákérdezni, megnézte-e a demót');
    end if;
    if new.status in ('won','lost','opt_out','excluded') then
      new.next_followup_at := null;
    end if;
    if new.status = 'opt_out' and new.email is not null then
      insert into leadgen.opt_outs (email, reason) values (lower(new.email), 'CRM-ben jelölve') on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists leads_audit on leadgen.leads;
create trigger leads_audit before update on leadgen.leads for each row execute function leadgen.tg_leads_audit();
