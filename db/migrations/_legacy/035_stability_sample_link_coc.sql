-- Link results to physical samples
alter table stab_results
  add column if not exists sample_id uuid references stab_samples(sample_id) on delete set null;

create index if not exists idx_stab_results_sample on stab_results(sample_id);

-- Chain of custody for each sample
create table if not exists stab_chain (
  chain_id uuid primary key default gen_random_uuid(),
  sample_id uuid not null references stab_samples(sample_id) on delete cascade,
  action text not null check (action in ('CREATED','COLLECTED','RECEIVED','OPENED','SEALED','TRANSFERRED','DISPOSED','OTHER')),
  actor text,
  ts timestamptz not null default now(),
  notes text,
  attachment_url text
);
create index if not exists idx_stab_chain_sample on stab_chain(sample_id, ts desc);