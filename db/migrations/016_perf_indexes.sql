-- Parameters by unit/name
create index if not exists idx_params_unit_name on cmc_parameters (unit_id, lower(name));

-- PPQ lots lookup
create index if not exists idx_ppq_proc_date on cmc_ppq_lots (process_id, run_date);

-- CPV time series
create index if not exists idx_cpv_proc_param_ts on cmc_cpv_points (process_id, param_name, ts);

-- Suggestions scanning
create index if not exists idx_sugg_proc_status_action on cmc_ai_suggestions (process_id, status, action);

-- FMEA guard
create index if not exists idx_fmea_proc_open on cmc_fmea (process_id, status, rpn);

-- Doc dirty fetch
create index if not exists idx_docdirty_proc on cmc_doc_dirty (process_id, section_path, created_at);

-- Approvals check
create index if not exists idx_approvals_proc_stage_time on cmc_approvals (process_id, stage, signed_at);