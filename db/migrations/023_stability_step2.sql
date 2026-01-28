-- Step 2: Enhanced Stability Features and AI Integration
-- Add missing indexes and constraints for production readiness

-- Add missing created_by column if not exists
DO $$ 
BEGIN
  IF to_regclass('public.stab_studies') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stab_studies' AND column_name = 'created_by') THEN
      ALTER TABLE stab_studies ADD COLUMN created_by text;
    END IF;
  END IF;
END $$;

-- Add tenant_id for future multi-tenancy (optional for now)
DO $$ 
BEGIN
  IF to_regclass('public.stab_studies') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stab_studies' AND column_name = 'tenant_id') THEN
      ALTER TABLE stab_studies ADD COLUMN tenant_id text;
    END IF;
  END IF;
END $$;

-- Add better indexes for performance
DO $$
BEGIN
  IF to_regclass('public.stab_studies') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_stab_studies_status ON stab_studies(status);
    CREATE INDEX IF NOT EXISTS idx_stab_studies_tenant ON stab_studies(tenant_id) WHERE tenant_id IS NOT NULL;
  END IF;
  IF to_regclass('public.stab_results') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_stab_results_study_test ON stab_results(study_id, test_id);
    CREATE INDEX IF NOT EXISTS idx_stab_results_value ON stab_results(study_id, test_id, value) WHERE value ~ '^[0-9.]+$';
  END IF;
END $$;

-- Add constraints for data integrity
DO $$
BEGIN
  IF to_regclass('public.stab_studies') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'chk_duration_positive'
    ) THEN
      ALTER TABLE stab_studies ADD CONSTRAINT chk_duration_positive CHECK (duration_months > 0);
    END IF;
  END IF;
  IF to_regclass('public.stab_timepoints') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'chk_month_non_negative'
    ) THEN
      ALTER TABLE stab_timepoints ADD CONSTRAINT chk_month_non_negative CHECK (month >= 0);
    END IF;
  END IF;
END $$;

-- Add audit triggers for compliance tracking
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF to_regclass('public.stab_studies') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trigger_stab_studies_updated_at ON stab_studies;
    CREATE TRIGGER trigger_stab_studies_updated_at
        BEFORE UPDATE ON stab_studies
        FOR EACH ROW
        EXECUTE FUNCTION update_timestamp();
  END IF;
END $$;

-- Performance optimization note: Run VACUUM ANALYZE manually after migration if needed