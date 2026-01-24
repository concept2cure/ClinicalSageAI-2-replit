-- Result review workflow
alter table stab_results
  add column if not exists status text not null default 'PENDING' check (status in ('PENDING','REVIEWED','APPROVED','REJECTED')),
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reject_reason text;

-- CAPA records (ties to OOS/OOT or excursions)
create table if not exists stab_capa (
  capa_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  title text not null,
  why text,
  actions jsonb not null default '[]'::jsonb,   -- ["recalibrate", "repeat run", ...]
  owner text,
  due_date date,
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
  linked_result_id uuid references stab_results(result_id) on delete set null,
  linked_oot jsonb,  -- store {cond,test,label} if applicable
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_stab_capa_study on stab_capa(study_id, status);

-- Chamber excursions
create table if not exists stab_excursions (
  exc_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  cond_id uuid references stab_conditions(cond_id) on delete set null,
  ts timestamptz not null default now(),
  metric text not null,           -- 'TEMP'|'RH'
  value numeric,
  limit_low numeric,
  limit_high numeric,
  duration_min int,
  severity text,                  -- 'MINOR'|'MAJOR'|'CRITICAL'
  raw_json jsonb default '{}'::jsonb
);
create index if not exists idx_stab_excursions_study on stab_excursions(study_id);

-- Protocol templates
create table if not exists stab_protocols (
  proto_id uuid primary key default gen_random_uuid(),
  name text not null,
  product_scope text,             -- 'DP', 'DS', or null
  payload_json jsonb not null,    -- {conditions:[...],timepoints:[...],tests:[...]}
  created_at timestamptz default now()
);
create unique index if not exists uq_stab_protocols_name on stab_protocols(lower(name));

-- Simple score cache (optional)
create table if not exists stab_score_cache (
  study_id uuid primary key references stab_studies(study_id) on delete cascade,
  score numeric not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);