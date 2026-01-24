-- Physical samples taken for a scheduled timepoint
create table if not exists stab_samples (
  sample_id uuid primary key default gen_random_uuid(),
  study_id uuid not null references stab_studies(study_id) on delete cascade,
  tp_id uuid not null references stab_timepoints(tp_id) on delete cascade,
  sample_code text not null,           -- human readable id e.g. "SS-0001-LT-3M-2025-09-01-01"
  collected_at timestamptz,
  collected_by text,
  storage text,                        -- '2-8C', 'ambient', etc.
  notes text,
  created_at timestamptz default now()
);
create unique index if not exists uq_stab_samples_code on stab_samples(lower(sample_code));
create index if not exists idx_stab_samples_tp on stab_samples(tp_id);

-- small helper view: next due timepoints (reuse you already have v_stab_upcoming_tp)
create or replace view v_stab_due_tp as
select t.study_id, t.tp_id, c.kind, t.label, t.month, t.planned_date
from stab_timepoints t
join stab_conditions c on c.cond_id=t.cond_id
where t.actual_date is null
order by t.planned_date asc nulls last, t.month asc;