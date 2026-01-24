-- Snapshots of computed RPI (portfolio trend)
create table if not exists reg_rpi_snapshots (
  snap_id uuid primary key default gen_random_uuid(),
  sub_id uuid not null references reg_submissions(sub_id) on delete cascade,
  rpi int not null,
  components jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_rpi_snapshots_sub on reg_rpi_snapshots(sub_id, created_at desc);