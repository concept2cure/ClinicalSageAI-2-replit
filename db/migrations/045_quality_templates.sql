-- SST templates library (validated rule sets per method family/instrument)
drop table if exists qc_sst_templates cascade;
create table qc_sst_templates (
  template_id uuid primary key default gen_random_uuid(),
  name text not null,                  -- e.g., "HPLC Assay (C18, 5 µm)"
  method_family text not null,         -- e.g., 'HPLC', 'UPLC', 'GC', 'KF', 'UV', 'DISSOLUTION'
  rules_json jsonb not null,           -- {plates>=, tailing<=, r2>=, %RSD<=, system_peaks:[], etc.}
  valid_hours int not null default 8,  -- SST validity window
  notes text,
  created_by text,
  created_at timestamptz default now()
);
create index idx_qc_sst_templates_family on qc_sst_templates(method_family);

-- Microbiology templates (limits per dosage-form/region)
drop table if exists qc_micro_templates cascade;
create table qc_micro_templates (
  micro_template_id uuid primary key default gen_random_uuid(),
  dosage_form text not null,          -- e.g., 'Oral Solid', 'Topical', 'Non-sterile Aqueous', 'Parenteral'
  region text not null,               -- 'GLOBAL','USP','EP','JP'
  limits_json jsonb not null,         -- {TAMC:{limit,unit}, TYMC:{limit,unit}, specified_absence:[{org, per, amount}], endotoxin?}
  notes text,
  created_at timestamptz default now()
);
create index idx_qc_micro_templates_form on qc_micro_templates(dosage_form, region);

-- Tie latest SST template used to a test (optional) - qc_tests table already exists
alter table qc_tests
  add column if not exists sst_template_id uuid references qc_sst_templates(template_id);

-- qc_batches table already exists

-- eCTD push bookkeeping (optional snapshot)
drop table if exists qc_ectd_push cascade;
create table qc_ectd_push (
  push_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references qc_batches(batch_id) on delete cascade,
  region text not null,             -- FDA/EMA/PMDA
  sequence text not null,           -- e.g., '0001'
  operation text not null,          -- new/replace/append/delete
  leaf_path text not null,          -- e.g., 'm3/32-p/32-p-5/coa/COA_<lot>.pdf'
  created_at timestamptz default now()
);
create index idx_qc_ectd_push_batch on qc_ectd_push(batch_id, created_at desc);