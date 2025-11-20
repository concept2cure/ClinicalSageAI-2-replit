-- Studies
create table if not exists stab_studies (
  study_id uuid primary key default gen_random_uuid(),
  product_id text not null,
  code text not null,               -- 'SS-2025-001'
  name text not null,               -- 'Product A 10mg Tablets'
  scope text not null default 'DP', -- DP/DS
  dosage_form text,                 -- Tablet/Capsule/Injection…
  strength text,                    -- '10 mg'
  climatic_zone text,               -- 'IVa','IVb','II','I', etc.
  duration_months int not null default 24,
  start_date date not null default current_date,
  status text not null default 'ONGOING' check (status in ('ONGOING','ON_HOLD','COMPLETED')),
  next_sampling_date date,
  owner_user_id uuid,
  created_by uuid,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create unique index if not exists uq_stab_code_v2 on stab_studies(lower(code));
create index if not exists idx_stab_product_v2 on stab_studies(product_id);

-- Conditions (normalized; many per study)
create table if not exists stab_conditions (
  cond_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  kind text not null check (kind in ('LT','ACC','INT','INUSE','STRESS')), -- long-term/accelerated/intermediate/in-use/stress
  temp text not null,        -- '25°C'/'30°C'/'40°C'
  rh text,                   -- '60% RH'/'75% RH'/null
  description text
);
create index if not exists idx_stab_cond_study on stab_conditions(study_id);

-- Timepoints
create table if not exists stab_timepoints (
  tp_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  cond_id uuid not null references stab_conditions(cond_id) on delete cascade,
  label text not null,     -- '0M','3M','6M','9M','12M','18M','24M'
  month int not null,
  planned_date date,
  actual_date date
);
create index if not exists idx_stab_tp_study_cond on stab_timepoints(study_id,cond_id);

-- Tests (linked to Analytical methods if available)
create table if not exists stab_tests (
  test_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  name text not null,              -- Assay/Dissolution/Impurities/Appearance/Water
  method_id uuid,                  -- references cmc_methods.id
  unit text,
  spec_low text,
  spec_high text,
  is_cqa boolean not null default true
);
create index if not exists idx_stab_tests_study_v2 on stab_tests(study_id);

-- Results (we'll import in step 2)
create table if not exists stab_results (
  result_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  cond_id uuid not null references stab_conditions(cond_id) on delete cascade,
  tp_id uuid not null references stab_timepoints(tp_id) on delete cascade,
  test_id uuid not null references stab_tests(test_id) on delete cascade,
  value text, unit text, pass boolean, remarks text,
  raw_json jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Lineage for transparency (AI/clone/user actions)
create table if not exists stab_lineage (
  edge_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  src text not null,   -- 'AI'|'USER'|'CLONE'
  action text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);