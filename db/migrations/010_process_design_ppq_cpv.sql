-- Design Space
create table if not exists cmc_design_space (
  ds_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  factors_json jsonb not null default '[]'::jsonb,   -- [{name, low, high, unit}]
  status text not null default 'DRAFT' check (status in ('DRAFT','LOCKED')),
  created_at timestamptz default now()
);

-- PPQ tracking
create table if not exists cmc_ppq_lots (
  ppq_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  lot_no text not null,
  run_date date not null,
  result text not null check (result in ('PASS','FAIL')),
  notes text
);
create index if not exists idx_ppq_proc on cmc_ppq_lots(process_id);

-- CPV points (simple Shewhart baseline; per-parameter)
create table if not exists cmc_cpv_points (
  cpv_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  param_name text not null,
  ts timestamptz not null,
  value numeric not null
);
create index if not exists idx_cpv_proc_param on cmc_cpv_points(process_id, param_name, ts);

-- Seed (optional)
insert into cmc_design_space (process_id, factors_json)
select process_id, jsonb_build_array(
  jsonb_build_object('name','Inlet Temp','low','50','high','60','unit','°C')
)
from cmc_processes where name='Tablet DP v1'
on conflict do nothing;

insert into cmc_ppq_lots (process_id, lot_no, run_date, result, notes)
select process_id, 'PPQ-001', current_date - 14, 'PASS', 'All CQAs met'
from cmc_processes where name='Tablet DP v1'
on conflict do nothing;

insert into cmc_ppq_lots (process_id, lot_no, run_date, result, notes)
select process_id, 'PPQ-002', current_date - 7, 'PASS', 'All CQAs met'
from cmc_processes where name='Tablet DP v1'
on conflict do nothing;

-- a couple CPV points for the 'Inlet Temp' CPP
insert into cmc_cpv_points (process_id, param_name, ts, value)
select p.process_id, 'Inlet Temp', now() - (i || ' day')::interval, 54 + (random()*2 -1)
from cmc_processes p, generate_series(20,0,-1) i
where p.name='Tablet DP v1';