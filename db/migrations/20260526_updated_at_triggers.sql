-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ (Accurate,
--             Contemporaneous) — a record's last-modified timestamp must be
--             trustworthy regardless of which code path wrote it.
-- Purpose: Platform-wide DB-level `updated_at` freshness triggers.
--
-- eCTD/CTD Context:
--   - Module(s): platform-wide (all tenant + reference tables with updated_at)
--   - Integrity Risk Addressed: stale `updated_at`. 344 tables carry the
--     column but only a couple had a DB trigger keeping it fresh. Today it is
--     maintained by app code (Drizzle .set({ updatedAt })); any raw SQL
--     UPDATE, bulk op, or service that omits the field leaves a stale
--     "last modified" — an ALCOA+ contemporaneity gap.
--
-- Determinism Contract:
--   - Trigger only stamps the audit timestamp; no canonical/business column
--     or evidence pointer is affected. No spec version bump required.
--
-- OVERRIDE-SAFE DESIGN:
--   The function stamps now() ONLY when the caller did not change
--   `updated_at` themselves:
--       IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
--         NEW.updated_at := now();
--       END IF;
--   So normal updates get a fresh timestamp, while flows that deliberately
--   preserve a source timestamp (e.g. legacy imports, see
--   20260512_legacy_imports.sql) are left untouched. This eliminates the
--   risk a blanket "force now() on every update" trigger would pose.
--
-- Notes:
--   - Idempotent: CREATE OR REPLACE function; per-table trigger created only
--     when absent (DO-loop guard). Re-runnable; no-op on second apply.
--   - Reversible: DROP TRIGGER set_updated_at ON <table>; DROP FUNCTION
--     public.set_updated_at().
--   - Trigger name `set_updated_at` is per-table (unique within a table), so
--     no global-identifier or 63-char-length collision on long table names.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.updated_at IS NOT DISTINCT FROM OLD.updated_at THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND t.table_type = 'BASE TABLE'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'set_updated_at'
        AND tgrelid = format('public.%I', r.table_name)::regclass
        AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I '
        'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
        r.table_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
