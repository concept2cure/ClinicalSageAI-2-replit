-- Track SST validity windows per rule/test (optional; if not in qc_rules.rule_json)
alter table qc_rules
  add column if not exists sst_valid_hours int;

-- Genealogy edges: parent lots feeding a QC batch
create table if not exists qc_genealogy (
  edge_id uuid primary key default gen_random_uuid(),
  child_batch_id uuid not null references qc_batches(batch_id) on delete cascade,
  parent_type text not null check (parent_type in ('RAW','INTERMEDIATE','BULK','PACK')),
  parent_code text not null,      -- material code or batch/lot code
  parent_lot text,                -- supplier or internal lot
  qty numeric,
  unit text,
  note text,
  created_at timestamptz default now()
);
create index if not exists idx_qc_genealogy_child on qc_genealogy(child_batch_id);