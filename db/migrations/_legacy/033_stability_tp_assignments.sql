-- Link assignments to specific timepoints (optional; study-level stays)
alter table stab_assignments
  add column if not exists tp_id uuid references stab_timepoints(tp_id) on delete cascade;

-- View: upcoming unsampled timepoints (used by bulk assign & calendar)
create or replace view v_stab_upcoming_tp as
select
  t.study_id,
  t.tp_id,
  c.kind,
  t.label,
  t.month,
  t.planned_date
from stab_timepoints t
join stab_conditions c on c.cond_id = t.cond_id
where t.actual_date is null
order by t.planned_date asc nulls last, t.month asc;