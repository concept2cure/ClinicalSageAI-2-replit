-- Optional notes & label recommendation
DO $$
BEGIN
  IF to_regclass('public.stab_studies') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stab_studies' AND column_name = 'label_storage') THEN
      ALTER TABLE stab_studies ADD COLUMN label_storage text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stab_studies' AND column_name = 'executive_summary') THEN
      ALTER TABLE stab_studies ADD COLUMN executive_summary text;
    END IF;
  END IF;
END $$;

-- Reminders for sampling
DO $$
BEGIN
  IF to_regclass('public.stab_studies') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS stab_reminders (
      rem_id uuid primary key default gen_random_uuid(),
      study_id uuid not null references stab_studies(study_id) on delete cascade,
      tp_id uuid references stab_timepoints(tp_id) on delete cascade,
      due_date date not null,
      channel text not null check (channel in ('ICS','EMAIL','SLACK')),
      status text not null default 'OPEN' check (status in ('OPEN','SENT','CANCELLED')),
      created_at timestamptz default now()
    );
    CREATE INDEX IF NOT EXISTS idx_stab_reminders_due ON stab_reminders(due_date);
  END IF;
END $$;