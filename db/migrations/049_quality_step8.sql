-- Gatekeeper run logs (evaluations with blockers & optional fixes)
DO $$
BEGIN
  IF to_regclass('public.qc_batches') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS qc_gatekeeper_runs (
      run_id uuid primary key default gen_random_uuid(),
      batch_id uuid not null references qc_batches(batch_id) on delete cascade,
      status text not null check (status in ('PASS','HOLD','REJECT')),
      blockers jsonb not null default '[]'::jsonb,   -- [{id,severity,msg,fixable,action?:{...}}]
      fixes jsonb not null default '[]'::jsonb,      -- applied fixes if any
      inputs jsonb not null default '{}'::jsonb,     -- snapshot of summary/policy flags used
      created_by text,
      created_at timestamptz default now()
    );
    CREATE INDEX IF NOT EXISTS idx_qc_gatekeeper_runs_batch ON qc_gatekeeper_runs(batch_id, created_at desc);
  END IF;
END $$;