-- Prevent duplicate OPEN guard gaps for the same method/rule
create unique index if not exists uq_method_guard_gap_open
  on cmc_method_gaps(method_id, rule_id)
  where status = 'OPEN';