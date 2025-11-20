-- Upstream links per section (graph edges)
create table if not exists reg_m3_links (
  link_id uuid primary key default gen_random_uuid(),
  sec_id uuid not null references reg_m3_sections(sec_id) on delete cascade,
  kind text not null,                      -- 'PROCESS','QUALITY','STABILITY','AUTHORING'
  ref_id text not null,                    -- upstream id (e.g., control_strategy_id, spec_id, stability_study_id)
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_reg_m3_links_sec on reg_m3_links(sec_id);

-- AI drafting suggestions for a section (accept/reject)
create table if not exists reg_m3_suggestions (
  sug_id uuid primary key default gen_random_uuid(),
  sec_id uuid not null references reg_m3_sections(sec_id) on delete cascade,
  title text not null,
  draft_md text not null,
  evidence jsonb not null default '[]'::jsonb,  -- evidence links
  status text not null default 'OPEN',          -- 'OPEN','APPLIED','DISMISSED'
  created_at timestamptz default now(),
  applied_at timestamptz
);

-- Attach evidence to leaves (frozen at snapshot time)
alter table reg_m3_leaves add column if not exists evidence jsonb not null default '[]'::jsonb;