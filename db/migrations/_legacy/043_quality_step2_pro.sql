-- Freeze on release, traceability
alter table qc_batches
  add column if not exists released_at timestamptz,
  add column if not exists released_by text,
  add column if not exists release_frozen boolean not null default false,
  add column if not exists coa_hash text;

-- Results metadata
alter table qc_results
  add column if not exists instrument_file_url text,
  add column if not exists raw_json jsonb default '{}'::jsonb;

-- qc_rules provenance
alter table qc_rules
  add column if not exists monograph_source text;

-- Alert severity
alter table qc_alerts
  add column if not exists severity text default 'INFO';

-- Optional SPC cache
create table if not exists qc_spc_cache (
  spc_id uuid primary key default gen_random_uuid(),
  test_id uuid not null references qc_tests(test_id) on delete cascade,
  payload_json jsonb not null,
  created_at timestamptz default now()
);
create index if not exists idx_qc_spc_cache_test on qc_spc_cache(test_id);