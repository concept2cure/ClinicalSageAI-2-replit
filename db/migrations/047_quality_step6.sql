-- ERP import job log
create table if not exists qc_import_jobs (
  job_id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('GENEALOGY','INSTRUMENT','RULES')),
  source text not null,                        -- 'ERP','CSV','API'
  status text not null default 'RECEIVED' check (status in ('RECEIVED','PARSED','IMPORTED','FAILED')),
  meta_json jsonb not null default '{}'::jsonb,
  error_text text,
  created_at timestamptz default now()
);

-- QC digest subscriptions
create table if not exists qc_digest_subscriptions (
  sub_id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('SLACK','EMAIL')),
  target text not null,                        -- webhook or email address
  filter_json jsonb not null default '{}'::jsonb,  -- e.g., {"product_id":"DP-001"}
  created_at timestamptz default now()
);
create index if not exists idx_qc_digest_target on qc_digest_subscriptions(channel,target);