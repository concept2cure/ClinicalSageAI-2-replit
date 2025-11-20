-- PAT configs per process
create table if not exists strategy_pat (
  pat_id uuid primary key default gen_random_uuid(),
  process_id uuid not null,
  param_id uuid not null,                         -- CPP under PAT
  probe text not null,                            -- e.g., "NIR", "Acoustic", "Torque"
  variables jsonb not null default '[]'::jsonb,   -- ["moisture","blend uniformity"]
  model jsonb not null default '{}'::jsonb,       -- {type:"PLS", version:"v1", metrics:{r2:0.98}}
  status text not null default 'DRAFT' check (status in ('DRAFT','QUALIFIED','RETIRED')),
  owner text,
  created_at timestamptz default now()
);
create index if not exists idx_strategy_pat_proc on strategy_pat(process_id, param_id);

-- Change proposals (Strategy delta)
create table if not exists strategy_changes (
  change_id uuid primary key default gen_random_uuid(),
  process_id uuid not null,
  title text not null,
  rationale text,
  delta_json jsonb not null,                      -- { add:[controls], update:[{ctrl_id,fields}], retire:[ctrl_id...] }
  impact_json jsonb not null default '[]'::jsonb, -- computed impact list
  status text not null default 'OPEN' check (status in ('OPEN','APPLIED','CANCELLED')),
  created_by text,
  created_at timestamptz default now(),
  applied_at timestamptz
);
create index if not exists idx_strategy_changes_proc on strategy_changes(process_id, status);

-- 3.2.P.3.4 exports/snapshots
create table if not exists strategy_p34_exports (
  export_id uuid primary key default gen_random_uuid(),
  process_id uuid not null,
  fmt text not null check (fmt in ('pdf','docx','md')),
  tokens_json jsonb not null default '{}'::jsonb,
  markdown text,
  created_by text,
  created_at timestamptz default now()
);
create index if not exists idx_strategy_p34_exports_proc on strategy_p34_exports(process_id, created_at desc);

-- Strategy sign-offs (Part 11-lite)
create table if not exists strategy_signoffs (
  sign_id uuid primary key default gen_random_uuid(),
  process_id uuid not null,
  stage text not null check (stage in ('DRAFT','LOCKED','REVIEWED','APPROVED')),
  signer_name text not null,
  signer_role text not null,
  reason text,
  hash text,
  payload_json jsonb not null default '{}'::jsonb,
  signed_at timestamptz default now()
);
create index if not exists idx_strategy_signoffs_proc on strategy_signoffs(process_id, signed_at desc);