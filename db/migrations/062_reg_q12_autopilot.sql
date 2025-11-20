-- Enrich reg_changes with region classification, impacted graph, and checklist
alter table reg_changes
  add column if not exists regions_json jsonb not null default '{}'::jsonb,  -- {"FDA":{class:"PAS|CBE-30|AR", rationale:"..."}, "EMA":{class:"Type IB|II|IA", rationale:"..."}}
  add column if not exists impacted_json jsonb not null default '[]'::jsonb,  -- [{entity:'SECTION|LEAF|SPEC|CPP', id:'...', code:'3.2.P.5'}]
  add column if not exists checklist_json jsonb not null default '[]'::jsonb, -- [{id:'X', title:'Gather PPQ summary', owner:'Quality', due:'YYYY-MM-DD'}]
  add column if not exists eta_weeks int,                                      -- predicted total lead time
  add column if not exists risk_score int;                                     -- 0-100 risk level

-- Materialized impacts -> explicit table for joins and KPIs
create table if not exists reg_change_impacts (
  imp_id uuid primary key default gen_random_uuid(),
  change_id uuid not null references reg_changes(change_id) on delete cascade,
  sub_id uuid,                         -- optional, if tied to a specific submission
  entity text not null,                -- 'SECTION','LEAF','SPEC','CPP','METHOD','STUDY'
  entity_id text not null,
  code text,                           -- section code like '3.2.P.3'
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_reg_change_impacts on reg_change_impacts(change_id, entity);

-- Lightweight event log for change progress
create table if not exists reg_change_events (
  evt_id uuid primary key default gen_random_uuid(),
  change_id uuid not null references reg_changes(change_id) on delete cascade,
  event text not null,                 -- 'CREATED','CLASSIFIED','IMPACTED','TASKS_OPENED','SUBMITTED','CLOSED'
  by_user text,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);