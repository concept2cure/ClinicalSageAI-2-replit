-- Audit trail (Part 11-lite for stability)
create table if not exists stab_audit (
  event_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  actor text,              -- from header or auth cookie
  action text not null,    -- e.g., 'condition_add','tp_update','test_link_method','p8_export'
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_stab_audit_study on stab_audit(study_id, created_at desc);

-- OOT/OOS rules per test or per study default
create table if not exists stab_oot_rules (
  rule_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  test_id uuid,                 -- null => applies to all tests
  rules jsonb not null default '["WE1","WE2"]'::jsonb  -- ["WE1","WE2","WE3","WE4"]
);

create unique index if not exists idx_stab_oot_rules_unique 
on stab_oot_rules(study_id, coalesce(test_id, '00000000-0000-0000-0000-000000000000'));

-- In-use metadata (optional)
create table if not exists stab_inuse (
  inuse_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  multi_dose boolean not null default false,
  opened_frequency text,       -- e.g., "daily", "BID"
  hold_time_days int,          -- e.g., 7, 14, 28
  microbial_limits text,       -- summary target (if applicable)
  notes text,
  start_on date,
  preservative text,
  updated_at timestamptz default now()
);

-- (Optional) speed: indexes on FK columns we'll query often
create index if not exists idx_stab_res_cond_test on stab_results(cond_id, test_id);