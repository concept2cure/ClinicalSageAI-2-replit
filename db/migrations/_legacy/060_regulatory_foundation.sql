-- Regulatory Foundation Tables
-- Regulatory submissions (main entity)
create table if not exists reg_submissions (
  sub_id uuid primary key default gen_random_uuid(),
  tenant_id integer not null,
  product_id varchar(255) not null,
  sub_type text not null,                   -- 'IND','NDA','ANDA','BLA','MAA'
  region text not null,                     -- 'FDA','EMA','PMDA','HC','TGA'
  status text not null default 'DRAFT',    -- 'DRAFT','REVIEW','SUBMITTED','APPROVED'
  title varchar(500) not null,
  description text,
  target_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Module 3 sections template
create table if not exists reg_m3_sections (
  sec_id uuid primary key default gen_random_uuid(),
  sub_id uuid not null references reg_submissions(sub_id) on delete cascade,
  code varchar(50) not null,               -- '3.2.P.3','3.2.P.5','3.2.P.8'
  title varchar(500) not null,
  guidance text,
  status text not null default 'MISSING', -- 'MISSING','DRAFT','READY','COMPLETE'
  upstream_json jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Module 3 leaves (actual content)
create table if not exists reg_m3_leaves (
  leaf_id uuid primary key default gen_random_uuid(),
  sec_id uuid not null references reg_m3_sections(sec_id) on delete cascade,
  title varchar(500) not null,
  href text,                               -- external link or null
  source_type text not null,               -- 'AUTHORING','UPLOAD','LINK'
  tokens_json jsonb not null default '{}'::jsonb,
  status text not null default 'DRAFT',   -- 'DRAFT','READY','FINAL'
  created_at timestamptz default now()
);

-- Regulatory tasks
create table if not exists reg_tasks (
  task_id uuid primary key default gen_random_uuid(),
  sub_id uuid not null references reg_submissions(sub_id) on delete cascade,
  entity text not null,                    -- 'SUBMISSION','SECTION','LEAF'
  entity_id uuid not null,
  title varchar(500) not null,
  description text,
  priority text not null default 'Medium', -- 'Low','Medium','High','Critical'
  status text not null default 'OPEN',    -- 'OPEN','IN_PROGRESS','COMPLETED','CANCELLED'
  assigned_to varchar(255),
  due_date date,
  created_at timestamptz default now()
);

-- Regulatory audit lineage
create table if not exists reg_lineage (
  lineage_id uuid primary key default gen_random_uuid(),
  sub_id uuid not null references reg_submissions(sub_id) on delete cascade,
  entity text not null,                    -- 'SUBMISSION','SECTION','LEAF','TASK'
  entity_id uuid not null,
  action text not null,                    -- 'CREATE','UPDATE','DELETE','AI_RECOMMEND','ACCEPT','REJECT'
  source text not null,                    -- 'UI','AI','LIMS','DRIVE','EMAIL'
  payload_json jsonb not null default '{}'::jsonb,
  actor varchar(255) not null,
  created_at timestamptz default now()
);

-- Create indexes
create index if not exists idx_reg_submissions_tenant on reg_submissions(tenant_id);
create index if not exists idx_reg_m3_sections_sub on reg_m3_sections(sub_id);
create index if not exists idx_reg_m3_leaves_sec on reg_m3_leaves(sec_id);
create index if not exists idx_reg_tasks_sub on reg_tasks(sub_id);
create index if not exists idx_reg_lineage_sub on reg_lineage(sub_id);