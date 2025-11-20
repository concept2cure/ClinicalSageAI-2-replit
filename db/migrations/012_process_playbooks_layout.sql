-- Canvas positions + SOP links on unit operations
alter table cmc_unit_ops
  add column if not exists pos_x numeric,
  add column if not exists pos_y numeric,
  add column if not exists sop_url text,
  add column if not exists sop_title text;

-- AI playbooks Catalog & Runs
create table if not exists cmc_ai_playbooks (
  playbook_id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  actions_json jsonb not null,          -- [{action:"promote_cpp"|"add_ipc"|..., args:{...}}]
  is_system boolean not null default true
);

create table if not exists cmc_ai_playbook_runs (
  run_id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references cmc_ai_playbooks(playbook_id) on delete cascade,
  process_id uuid not null references cmc_processes(process_id) on delete cascade,
  actor text,
  dry_run boolean not null default false,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Seed two system playbooks
insert into cmc_ai_playbooks (name, description, actions_json, is_system) values
(
  'Qualify Dryer Step',
  'Promote Inlet Temp to CPP, add LOD IPC, tighten dryer range, propose CPV rules.',
  jsonb_build_array(
    jsonb_build_object('action','promote_cpp','args', jsonb_build_object('unitName','Dry','paramName','Inlet Temp','range', jsonb_build_object('low','52','high','58','unit','°C'))),
    jsonb_build_object('action','add_ipc','args', jsonb_build_object('unitName','Dry','paramName','Inlet Temp','ipc', jsonb_build_object('test','Loss on Drying','limit','≤ 3.0%','methodHint','AM-001'))),
    jsonb_build_object('action','propose_cpv_rules','args', jsonb_build_object('params', jsonb_build_array('Inlet Temp'),'rules', jsonb_build_array('WE1','WE2','WE4'),'chart','Xbar-R')),
    jsonb_build_object('action','tighten_range','args', jsonb_build_object('unitName','Dry','paramName','Inlet Temp','newRange', jsonb_build_object('low','52','high','58','unit','°C')))
  ),
  true
),
(
  'Finalize PPQ',
  'Create PPQ plan for 3 lots and tasks for Manufacturing; draft P.3.5 text.',
  jsonb_build_array(
    jsonb_build_object('action','propose_ppq_plan','args', jsonb_build_object('lots',3,'acceptance', jsonb_build_array('Assay','CU','Dissolution','Micro all PASS'),'scale','commercial')),
    jsonb_build_object('action','draft_p3_section','args', jsonb_build_object('section','3.2.P.3.5','note','PPQ summary will be refreshed on approval'))
  ),
  true
)
on conflict do nothing;