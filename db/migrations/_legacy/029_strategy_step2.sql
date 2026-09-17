-- ============================================================================
-- ARCHIVED 2026-09-10 (WO-1, ADR-0006) — NO APPLIER RUNS THIS FILE.
-- ============================================================================
-- It is in none of C2C_MIGRATION_FILES (deploy-migrate), the root migrations/
-- overlay, PRE_OVERLAY_CREATORS, AUTHORING_SUBSYSTEM_FILES, or the *_gcc_*
-- tree. The only glob that would match it belongs to scripts/db_migrate.sh,
-- which has no automated caller.
--
-- Defined a second time here: strategy_p34_exports — and with a shape the live table does not have
-- Real creator: db/migrations/030_stability_results.sql (deploy-migrate #72). See the README: 029's other three tables exist on no database and nothing reads them.
--
-- Verified against a database built from empty by
-- scripts/db/provision-test-db.sh before archiving: nothing this file
-- uniquely creates was present, and every ALTER ... ADD COLUMN target it
-- carries already exists. Full reasoning, and why that check is mandatory
-- rather than a formality, in db/migrations/_legacy/README.md
-- (see the 2026-09-10 section).
-- ============================================================================

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