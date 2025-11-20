create table if not exists stab_assignments (
  assign_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  user_id text not null,
  role text not null check (role in ('Owner','Reviewer','QA','RegCMC')),
  status text not null default 'OPEN' check (status in ('OPEN','DONE','CANCELLED')),
  due_date date,
  created_at timestamptz default now()
);
create index if not exists idx_stab_assign_study on stab_assignments(study_id,status);