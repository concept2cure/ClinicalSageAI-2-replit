create table if not exists cmc_method_overrides (
  id uuid primary key default gen_random_uuid(),
  method_id uuid not null,
  reason text not null,
  created_by text,
  created_at timestamptz default now()
);