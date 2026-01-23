-- scripts/db_compliance_check.sql
-- 
-- Run this in CI to verify database schema compliance.
-- Fails the pipeline if key regulatory controls are missing.
--
-- Usage: psql "$DATABASE_URL" -f scripts/db_compliance_check.sql

DO $$
DECLARE
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  RAISE NOTICE '=== Database Compliance Check ===';
  RAISE NOTICE 'Checking required extensions, triggers, and RLS policies...';

  -- =========================================================================
  -- 1. Required Extensions
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '1. Checking required extensions...';
  
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    v_missing := array_append(v_missing, 'Extension: vector (pgvector)');
  ELSE
    RAISE NOTICE '   ✓ vector extension installed';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
    v_missing := array_append(v_missing, 'Extension: uuid-ossp');
  ELSE
    RAISE NOTICE '   ✓ uuid-ossp extension installed';
  END IF;

  -- =========================================================================
  -- 2. Required Schemas
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '2. Checking required schemas...';
  
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'truth') THEN
    v_missing := array_append(v_missing, 'Schema: truth');
  ELSE
    RAISE NOTICE '   ✓ truth schema exists';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'prose') THEN
    v_missing := array_append(v_missing, 'Schema: prose');
  ELSE
    RAISE NOTICE '   ✓ prose schema exists';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'audit') THEN
    v_missing := array_append(v_missing, 'Schema: audit');
  ELSE
    RAISE NOTICE '   ✓ audit schema exists';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'adversarial') THEN
    v_missing := array_append(v_missing, 'Schema: adversarial');
  ELSE
    RAISE NOTICE '   ✓ adversarial schema exists';
  END IF;

  -- =========================================================================
  -- 3. Immutability Triggers (CRITICAL for Part 11 compliance)
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '3. Checking immutability triggers (Part 11 critical)...';

  -- Audit logs must be immutable
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'audit' AND c.relname = 'concomitant_audit_logs'
      AND t.tgname = 'trg_no_update_delete_concomitant_audit_logs'
  ) THEN
    v_missing := array_append(v_missing, 'Trigger: trg_no_update_delete_concomitant_audit_logs on audit.concomitant_audit_logs');
  ELSE
    RAISE NOTICE '   ✓ audit.concomitant_audit_logs immutability trigger exists';
  END IF;

  -- Fragment versions must be immutable
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'prose' AND c.relname = 'smart_fragment_versions'
      AND t.tgname = 'trg_no_update_delete_smart_fragment_versions'
  ) THEN
    v_missing := array_append(v_missing, 'Trigger: trg_no_update_delete_smart_fragment_versions on prose.smart_fragment_versions');
  ELSE
    RAISE NOTICE '   ✓ prose.smart_fragment_versions immutability trigger exists';
  END IF;

  -- E-signatures must be immutable (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='e_signatures') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'audit' AND c.relname = 'e_signatures'
        AND t.tgname = 'trg_no_update_delete_e_signatures'
    ) THEN
      v_missing := array_append(v_missing, 'Trigger: trg_no_update_delete_e_signatures on audit.e_signatures');
    ELSE
      RAISE NOTICE '   ✓ audit.e_signatures immutability trigger exists';
    END IF;
  END IF;

  -- Config bundles must be immutable (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='config_bundles') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'audit' AND c.relname = 'config_bundles'
        AND t.tgname = 'trg_no_update_delete_config_bundles'
    ) THEN
      v_missing := array_append(v_missing, 'Trigger: trg_no_update_delete_config_bundles on audit.config_bundles');
    ELSE
      RAISE NOTICE '   ✓ audit.config_bundles immutability trigger exists';
    END IF;
  END IF;

  -- Snapshot exports must be immutable (if table exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshot_exports') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'prose' AND c.relname = 'submission_snapshot_exports'
        AND t.tgname = 'trg_no_update_delete_snapshot_exports'
    ) THEN
      v_missing := array_append(v_missing, 'Trigger: trg_no_update_delete_snapshot_exports on prose.submission_snapshot_exports');
    ELSE
      RAISE NOTICE '   ✓ prose.submission_snapshot_exports immutability trigger exists';
    END IF;
  END IF;

  -- =========================================================================
  -- 4. Row Level Security (RLS) - Required after Migration 010
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '4. Checking Row Level Security (RLS)...';

  -- Only check RLS if core.programs exists (Migration 010 applied)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='core' AND table_name='programs') THEN
    
    -- truth.clinical_truth_store
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='truth' AND table_name='clinical_truth_store') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'truth' AND c.relname = 'clinical_truth_store'
          AND c.relrowsecurity = true
      ) THEN
        v_missing := array_append(v_missing, 'RLS not enabled on truth.clinical_truth_store');
      ELSE
        RAISE NOTICE '   ✓ RLS enabled on truth.clinical_truth_store';
      END IF;
    END IF;

    -- prose.smart_fragments
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragments') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'prose' AND c.relname = 'smart_fragments'
          AND c.relrowsecurity = true
      ) THEN
        v_missing := array_append(v_missing, 'RLS not enabled on prose.smart_fragments');
      ELSE
        RAISE NOTICE '   ✓ RLS enabled on prose.smart_fragments';
      END IF;
    END IF;

    -- audit.concomitant_audit_logs
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='concomitant_audit_logs') THEN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'audit' AND c.relname = 'concomitant_audit_logs'
          AND c.relrowsecurity = true
      ) THEN
        v_missing := array_append(v_missing, 'RLS not enabled on audit.concomitant_audit_logs');
      ELSE
        RAISE NOTICE '   ✓ RLS enabled on audit.concomitant_audit_logs';
      END IF;
    END IF;

  ELSE
    RAISE NOTICE '   ⚠ core.programs not found - RLS checks skipped (apply Migration 010 first)';
  END IF;

  -- =========================================================================
  -- 5. Submission Gate Trigger (if Migration 009 applied)
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '5. Checking submission gate enforcement...';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshots') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'prose' AND c.relname = 'submission_snapshots'
        AND t.tgname = 'trg_enforce_submission_signatures'
    ) THEN
      v_missing := array_append(v_missing, 'Trigger: trg_enforce_submission_signatures on prose.submission_snapshots');
    ELSE
      RAISE NOTICE '   ✓ submission signature enforcement trigger exists';
    END IF;
  ELSE
    RAISE NOTICE '   ⚠ prose.submission_snapshots not found - gate check skipped';
  END IF;

  -- =========================================================================
  -- 6. Global Program Exists (if Migration 010 applied)
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '6. Checking GLOBAL program...';

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='core' AND table_name='programs') THEN
    IF NOT EXISTS (SELECT 1 FROM core.programs WHERE program_code = 'GLOBAL') THEN
      v_missing := array_append(v_missing, 'GLOBAL program missing in core.programs');
    ELSE
      RAISE NOTICE '   ✓ GLOBAL program exists';
    END IF;
  ELSE
    RAISE NOTICE '   ⚠ core.programs not found - GLOBAL check skipped';
  END IF;

  -- =========================================================================
  -- Final Report
  -- =========================================================================
  RAISE NOTICE '';
  RAISE NOTICE '=== Compliance Check Complete ===';
  
  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE NOTICE '';
    RAISE NOTICE '❌ COMPLIANCE FAILURES DETECTED:';
    FOR i IN 1..array_length(v_missing, 1) LOOP
      RAISE NOTICE '   - %', v_missing[i];
    END LOOP;
    RAISE NOTICE '';
    RAISE EXCEPTION 'Database compliance check failed with % issue(s)', array_length(v_missing, 1);
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '✅ All compliance checks passed!';
  END IF;

END $$;
