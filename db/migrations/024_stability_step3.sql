-- Optional notes & label recommendation
alter table stab_studies
  add column label_storage text,             -- e.g., "Store below 30°C"
  add column executive_summary text;

-- Reminders for sampling
create table if not exists stab_reminders (
  rem_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  tp_id uuid references stab_timepoints(tp_id) on delete cascade,
  due_date date not null,
  channel text not null check (channel in ('ICS','EMAIL','SLACK')),
  status text not null default 'OPEN' check (status in ('OPEN','SENT','CANCELLED')),
  created_at timestamptz default now()
);
create index if not exists idx_stab_reminders_due on stab_reminders(due_date);