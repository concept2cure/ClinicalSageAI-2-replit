-- QUALITY STEP 5: Enterprise+ AI & Lineage Migration
-- Data lineage (provenance/versioning)
create table if not exists qc_lineage (
  lin_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references qc_batches(batch_id) on delete cascade,
  entity_type text not null,          -- 'TEST','RESULT','SST','RULE','CAPA','DEVIATION','PACK','ECTD'
  entity_id text not null,
  action text not null,               -- 'CREATE','UPDATE','DELETE','IMPORT','SIGN','EXPORT','PUSH'
  source text not null,               -- 'UI','AI','INSTRUMENT','ERP','API'
  payload_json jsonb not null default '{}'::jsonb,
  parent_entity_type text,
  parent_entity_id text,
  prev_hash text,
  hash text,
  rev int not null default 1,
  actor text,
  created_at timestamptz default now()
);
create index if not exists idx_qc_lineage_batch on qc_lineage(batch_id, created_at desc);
create index if not exists idx_qc_lineage_entity on qc_lineage(entity_type, entity_id);

-- Upstream/downstream links (for flow verification)
create table if not exists qc_linkages (
  batch_id uuid primary key references qc_batches(batch_id) on delete cascade,
  process_id uuid,                    -- cmc_processes.process_id
  stability_study_id uuid,            -- stab_studies.study_id
  notes text,
  updated_at timestamptz default now()
);

-- AI recommendations (coach suggestions)
create table if not exists qc_ai_recos (
  reco_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references qc_batches(batch_id) on delete cascade,
  kind text not null,                 -- 'LINK_METHOD','RECORD_SST','OPEN_CAPA','ADD_TEST','SET_RULE','EVAL_DISS','MICRO_EVAL','APPROVE_RESULTS'
  title text not null,
  details_json jsonb not null default '{}'::jsonb,  -- payload for apply
  severity text not null default 'INFO',            -- 'INFO','WARN','CRITICAL'
  status text not null default 'OPEN' check (status in ('OPEN','APPLIED','DISMISSED')),
  created_at timestamptz default now(),
  applied_at timestamptz
);
create index if not exists idx_qc_ai_recos_batch on qc_ai_recos(batch_id,status);