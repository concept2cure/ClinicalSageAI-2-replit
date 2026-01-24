create table if not exists cmc_processes (
  process_id uuid primary key default gen_random_uuid(),
  product_id text not null,
  name text not null,
  scope text not null check (scope in ('DS','DP')),
  stage text not null default 'DESIGN' check (stage in ('DESIGN','QUAL','VALIDATED')),
  owner text,
  version int default 1,
  created_at timestamptz default now()
);

create table if not exists cmc_unit_ops (
  unit_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  name text not null,
  type text not null,
  sequence_no int not null,
  status text not null default 'DESIGN' check (status in ('DESIGN','QUAL','VALIDATED'))
);

create table if not exists cmc_parameters (
  param_id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references cmc_unit_ops(unit_id) on delete cascade,
  name text not null,
  kind text not null default 'KPP' check (kind in ('CMA','CPP','KPP')),
  target text,
  low text,
  high text,
  unit text,
  rationale text,
  method_id uuid,
  risk_score int default 0
);

create table if not exists cmc_control_strategy (
  cs_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  controls_json jsonb not null default '{}'::jsonb
);

create table if not exists cmc_ai_suggestions (
  sugg_id uuid primary key default gen_random_uuid(),
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  unit_id uuid,
  action text not null,
  payload_json jsonb not null,
  rationale text,
  score numeric,
  status text not null default 'OPEN' check (status in ('OPEN','ACCEPTED','REJECTED')),
  created_at timestamptz default now()
);

-- seed demo process
insert into cmc_processes (product_id, name, scope, stage, owner)
values ('DP-001','Tablet DP v1','DP','DESIGN','Process Eng') on conflict do nothing;

-- seed unit ops
insert into cmc_unit_ops (process_id, name, type, sequence_no) select process_id,'Blend','Blender',1 from cmc_processes where name='Tablet DP v1';
insert into cmc_unit_ops (process_id, name, type, sequence_no) select process_id,'Granulate','HighShearGran',2 from cmc_processes where name='Tablet DP v1';
insert into cmc_unit_ops (process_id, name, type, sequence_no) select process_id,'Dry','FluidBedDryer',3 from cmc_processes where name='Tablet DP v1';

-- parameters
insert into cmc_parameters (unit_id,name,kind,target,low,high,unit,rationale)
select unit_id,'Blend Time','KPP','15','12','18','min','Initial guess'
from cmc_unit_ops where name='Blend';
insert into cmc_parameters (unit_id,name,kind,target,low,high,unit,rationale)
select unit_id,'Inlet Temp','CPP','55','50','60','°C','Thermal sensitivity' 
from cmc_unit_ops where name='Dry';