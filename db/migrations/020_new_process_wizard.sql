-- DRAFTS: a safe workspace before creating a real process
create table if not exists cmc_process_drafts (
  draft_id uuid primary key default gen_random_uuid(),
  product_id text not null,
  name text not null,
  scope text not null check (scope in ('DP','DS')),
  status text not null default 'DRAFT' check (status in ('DRAFT','IN_PROGRESS','READY')),
  overview_json jsonb not null default '{}'::jsonb,         -- dosage_form, dosage_strength, target_markets, notes
  cqas_json jsonb not null default '[]'::jsonb,             -- selected CQAs (assay, CU, dissolution, micro, etc.)
  units_json jsonb not null default '[]'::jsonb,            -- [{unit_id?, name, type, pos, parameters:[{name,kind,target,low,high,unit}]}]
  control_strategy_json jsonb not null default '{}'::jsonb, -- paramName -> { test, limit, methodHint }
  design_space_json jsonb not null default '{}'::jsonb,     -- { factors:[{name,low,high,unit}], status }
  validation_plan_json jsonb not null default '{}'::jsonb,  -- PPQ plan, CPV rules brief
  team_json jsonb not null default '[]'::jsonb,             -- [{user_id, role, duty}]
  regions_json jsonb not null default '[]'::jsonb,          -- ['FDA','EMA','PMDA',...]
  lineage_json jsonb not null default '[]'::jsonb,          -- [{ ts, src:'AI'|'Clone'|'User', action, payload }]
  created_by text,                                          -- users.user_id (from auth)
  owner_user_id text,
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);
create index if not exists idx_drafts_product_status on cmc_process_drafts(product_id, status);

-- ASSIGNMENTS: drafts or processes
DO $$
BEGIN
  IF to_regclass('public.cmc_processes') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS cmc_assignments (
      assignment_id uuid primary key default gen_random_uuid(),
      process_id uuid references cmc_processes(process_id) on delete cascade,
      draft_id uuid references cmc_process_drafts(draft_id) on delete cascade,
      user_id text not null,
      role text not null check (role in ('Owner','ProcessEng','Analyst','QA','RegCMC','Reviewer')),
      due_date date,
      status text not null default 'OPEN' check (status in ('OPEN','DONE','CANCELLED')),
      created_at timestamptz default now()
    );
    CREATE INDEX IF NOT EXISTS idx_assign_draft ON cmc_assignments(draft_id);
    CREATE INDEX IF NOT EXISTS idx_assign_proc ON cmc_assignments(process_id);
  END IF;
END $$;

-- DATA LINEAGE: immutable edges for transparency
create table if not exists cmc_lineage (
  edge_id uuid primary key default gen_random_uuid(),
  src_type text not null,   -- 'DRAFT'|'PROCESS'|'AI'|'USER'|'TEMPLATE'
  src_id text not null,
  dst_type text not null,   -- 'UNIT'|'PARAM'|'DOC'|'METHOD'|'SECTION'|'TASK'
  dst_id text not null,
  action text not null,     -- 'created'|'updated'|'linked'|'accepted_ai'
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_lineage_dst on cmc_lineage(dst_type, dst_id);

-- Unique active draft name per product (optional)
create unique index if not exists uq_draft_name_active
  on cmc_process_drafts (product_id, lower(name))
  where status != 'READY';