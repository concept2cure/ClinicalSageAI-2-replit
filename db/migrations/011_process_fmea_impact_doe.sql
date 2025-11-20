-- FMEA (risk)
create table if not exists cmc_fmea (
  fmea_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  unit_id uuid,
  failure_mode text not null,
  cause text,
  effect text,
  s int not null check (s between 1 and 10),
  o int not null check (o between 1 and 10),
  d int not null check (d between 1 and 10),
  rpn int generated always as ((s*o*d)) stored,
  mitigation text,
  owner text,
  status text not null default 'OPEN' check (status in ('OPEN','MITIGATING','CLOSED')),
  created_at timestamptz default now()
);
create index if not exists idx_fmea_proc on cmc_fmea(process_id);

-- Lightweight process links (to show dependencies)
create table if not exists cmc_process_links (
  link_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  entity_type text not null,   -- PARAM|UNIT|METHOD|SPEC|STABILITY|DOC
  entity_id text not null,
  role text,                   -- e.g., 'IPC','Release','Reference'
  created_at timestamptz default now()
);
create index if not exists idx_links_proc on cmc_process_links(process_id);

-- Doc dirty flags (authoring sections to refresh)
create table if not exists cmc_doc_dirty (
  dirty_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  doc_id uuid,
  section_path text not null,   -- e.g., "Module 3 > 3.2.P.3 Manufacturing Process"
  reason text,
  created_at timestamptz default now(),
  cleared_at timestamptz
);

-- DOE models (fit & simulation stash)
create table if not exists cmc_doe_models (
  model_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  unit_id uuid,
  response text not null default 'CQA',
  factors_json jsonb not null default '[]'::jsonb,     -- [{name, low, high, unit}]
  design_json jsonb not null default '[]'::jsonb,      -- design matrix rows
  fit_stats_json jsonb not null default '{}'::jsonb,   -- {coeffs, r2, adjR2, lofP?}
  created_at timestamptz default now()
);

-- Seed an example FMEA row
insert into cmc_fmea (process_id, failure_mode, cause, effect, s, o, d, mitigation, owner)
select process_id, 'Over-drying', 'Excess inlet temp', 'Degradation/loss of potency', 8, 3, 5, 'Add outlet temp alarm + IPC LOD', 'Process Eng'
from cmc_processes where name='Tablet DP v1'
on conflict do nothing;