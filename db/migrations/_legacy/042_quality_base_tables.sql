-- Create base quality control tables
create table if not exists qc_batches (
  batch_id uuid primary key default gen_random_uuid(),
  lot_no text not null,
  product_id text not null,
  mfg_date date,
  exp_date date,
  batch_size text,
  status text default 'In Progress',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists qc_tests (
  test_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references qc_batches(batch_id) on delete cascade,
  test_name text not null,
  test_type text,
  spec_low text,
  spec_high text,
  unit text,
  status text default 'Pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists qc_results (
  result_id uuid primary key default gen_random_uuid(),
  test_id uuid not null references qc_tests(test_id) on delete cascade,
  value text,
  unit text,
  pass boolean,
  operator text,
  tested_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists qc_rules (
  rule_id uuid primary key default gen_random_uuid(),
  product_id text not null,
  test_name text not null,
  rule_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  unique(product_id, test_name)
);

create table if not exists qc_alerts (
  alert_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references qc_batches(batch_id) on delete cascade,
  test_id uuid references qc_tests(test_id) on delete cascade,
  alert_type text not null,
  message text not null,
  resolved boolean default false,
  created_at timestamptz default now()
);

-- Add indexes for performance
create index if not exists idx_qc_batches_product on qc_batches(product_id);
create index if not exists idx_qc_batches_status on qc_batches(status);
create index if not exists idx_qc_tests_batch on qc_tests(batch_id);
create index if not exists idx_qc_results_test on qc_results(test_id);
create index if not exists idx_qc_alerts_batch on qc_alerts(batch_id);