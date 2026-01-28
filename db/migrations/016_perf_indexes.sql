DO $$
BEGIN
	-- Parameters by unit/name
	IF to_regclass('public.cmc_parameters') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_params_unit_name ON cmc_parameters (unit_id, lower(name));
	END IF;

	-- PPQ lots lookup
	IF to_regclass('public.cmc_ppq_lots') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_ppq_proc_date ON cmc_ppq_lots (process_id, run_date);
	END IF;

	-- CPV time series
	IF to_regclass('public.cmc_cpv_points') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_cpv_proc_param_ts ON cmc_cpv_points (process_id, param_name, ts);
	END IF;

	-- Suggestions scanning
	IF to_regclass('public.cmc_ai_suggestions') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_sugg_proc_status_action ON cmc_ai_suggestions (process_id, status, action);
	END IF;

	-- FMEA guard
	IF to_regclass('public.cmc_fmea') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_fmea_proc_open ON cmc_fmea (process_id, status, rpn);
	END IF;

	-- Doc dirty fetch
	IF to_regclass('public.cmc_doc_dirty') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_docdirty_proc ON cmc_doc_dirty (process_id, section_path, created_at);
	END IF;

	-- Approvals check
	IF to_regclass('public.cmc_approvals') IS NOT NULL THEN
		CREATE INDEX IF NOT EXISTS idx_approvals_proc_stage_time ON cmc_approvals (process_id, stage, signed_at);
	END IF;
END $$;