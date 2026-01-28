-- CQAs (product-level)
create table if not exists strategy_cqas (
  cqa_id uuid primary key default gen_random_uuid(),
  product_id text not null,
  name text not null,
  criticality text not null default 'Critical' check (criticality in ('Critical','Key','Other')),
  acceptance_criteria text,
  rationale text,
  linked_method_ids uuid[] default '{}',
  created_at timestamptz default now()
);
create unique index if not exists uq_cqa_name_product on strategy_cqas(product_id, lower(name));

-- Controls (map CPPs to CQAs via control types)
DO $$
BEGIN
  IF to_regclass('public.cmc_parameters') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS strategy_controls (
      ctrl_id uuid primary key default gen_random_uuid(),
      process_id uuid not null,
      param_id uuid not null references cmc_parameters(param_id) on delete cascade,
      cqa_id uuid references strategy_cqas(cqa_id) on delete set null,
      control_type text not null check (control_type in ('IPC','Release','Alarm','PAT')),
      test_name text,
      method_id uuid,
      spec_low text,
      spec_high text,
      frequency text,              -- e.g., "per batch", "every 30 min"
      sampling_plan text,          -- e.g., "n=10 locations"
      action_on_fail text,
      status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
      rationale text,
      owner text,
      created_at timestamptz default now()
    );
    CREATE INDEX IF NOT EXISTS idx_ctrl_process_param ON strategy_controls(process_id, param_id);
    CREATE INDEX IF NOT EXISTS idx_ctrl_cqa ON strategy_controls(cqa_id);
  END IF;
END $$;

-- Audit
create table if not exists strategy_audit (
  event_id uuid primary key default gen_random_uuid(),
  process_id uuid,
  actor text,
  action text not null,        -- 'cqa_add','ctrl_add','ctrl_update','ai_propose','p34_export'
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_strategy_audit_proc on strategy_audit(process_id, created_at desc);

-- P.3.4 tokens/drafts
create table if not exists strategy_p34 (
  p34_id uuid primary key default gen_random_uuid(),
  process_id uuid not null,
  tokens_json jsonb not null default '{}'::jsonb,
  markdown text,
  created_at timestamptz default now()
);
create index if not exists idx_strategy_p34_proc on strategy_p34(process_id, created_at desc);