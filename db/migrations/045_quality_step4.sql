-- SST templates per test (enforce automatically)
create table if not exists qc_sst_templates (
  tpl_id uuid primary key default gen_random_uuid(),
  product_id text not null,
  test_name text not null,
  valid_hours int not null default 8,
  thresholds_json jsonb not null default '{}'::jsonb, -- e.g., {"plates":{"min":3000},"tailing":{"max":2.0},"r2":{"min":0.999}}
  created_at timestamptz default now()
);
create unique index if not exists uq_qc_sst_template on qc_sst_templates(product_id, lower(test_name));

-- Optional eCTD sequence registry for QC exports
create table if not exists qc_ectd_sequences (
  seq_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references qc_batches(batch_id) on delete cascade,
  region text not null check (region in ('FDA','EMA','PMDA')),
  seq_number int not null,
  operation text not null check (operation in ('new','replace','append','delete')),
  created_at timestamptz default now()
);
create unique index if not exists uq_qc_ectd_seq on qc_ectd_sequences(batch_id, region, seq_number);