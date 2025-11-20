-- e-sign approvals for stage changes and key actions
create table if not exists cmc_approvals (
  approval_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  stage text not null check (stage in ('DESIGN','QUAL','VALIDATED')),
  action text not null default 'stage_change',
  signer_name text not null,
  signer_role text not null,
  reason text,
  signed_at timestamptz not null default now(),
  hash text                      -- placeholder for Part 11 hash/signature
);

-- CPV rule config per parameter
create table if not exists cmc_cpv_rules (
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  param_name text not null,
  rules jsonb not null default '["WE1","WE2"]'::jsonb,   -- Western Electric default
  primary key (process_id, param_name)
);