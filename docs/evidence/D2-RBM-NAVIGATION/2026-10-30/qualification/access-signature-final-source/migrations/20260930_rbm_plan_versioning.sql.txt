-- 20260930_rbm_plan_versioning.sql
--
-- Monitoring plans: versioned, so an approved plan stops being editable
-- (ported from the abandoned #1123, 19914431a, onto the v2 applier).
--
-- rbm_risk_assessments has carried `version` since it was introduced, and
-- approving a version archives the one it supersedes. The monitoring plan — the
-- document that directs monitoring activity and the one a sponsor hands an
-- inspector — had neither. PATCH /rbm-monitoring-plans/:id edited an ACTIVE plan
-- in place, leaving the approver's signature attached to content they never
-- saw. Now: an approved plan is read-only (PATCH -> 409), POST .../:id/amend
-- opens the next version as a draft, and approving a version archives the one
-- it supersedes in the same transaction.
--
-- WHY A NEW FILE: 20260629_rbm_surfaces.sql creates rbm_monitoring_plans with
-- CREATE TABLE IF NOT EXISTS, so amending it would reach no deployed tenant.
--
-- REPLAY-SAFE (CLAUDE.md RULE 1). The column and index are IF NOT EXISTS. The
-- two data statements run ONLY on the apply that adds the column (detected via
-- information_schema before the ALTER), so a replay never renumbers versions
-- that later amendments assigned, and never re-archives anything. No DROP.
--
-- Backfill: existing plans for a study were de facto successive revisions, so
-- they are numbered by creation order. That is a statement about sequence only
-- — it does not claim the earlier ones were approved; status and approval
-- columns are untouched. A study that already had two ACTIVE plans has no
-- single governing plan; the most recently approved (else newest) is kept and
-- the rest archived, which is what approving through the new path does.

DO $$
DECLARE
  had_version BOOLEAN;
BEGIN
  IF to_regclass('public.rbm_monitoring_plans') IS NULL THEN
    RAISE NOTICE '20260930_rbm_plan_versioning: rbm_monitoring_plans absent, skipping';
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'rbm_monitoring_plans'
       AND column_name = 'version'
  ) INTO had_version;

  ALTER TABLE rbm_monitoring_plans
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

  IF NOT had_version THEN
    UPDATE rbm_monitoring_plans p
       SET version = seq.v
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY organization_id, program_id
                 ORDER BY created_at, id
               ) AS v
          FROM rbm_monitoring_plans
      ) seq
     WHERE p.id = seq.id
       AND seq.v <> 1;

    UPDATE rbm_monitoring_plans p
       SET status = 'archived', updated_at = NOW()
     WHERE p.deleted_at IS NULL
       AND p.status = 'active'
       AND p.program_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM rbm_monitoring_plans q
          WHERE q.deleted_at IS NULL
            AND q.status = 'active'
            AND q.organization_id = p.organization_id
            AND q.program_id = p.program_id
            AND (COALESCE(q.approved_at, q.created_at), q.id)
              > (COALESCE(p.approved_at, p.created_at), p.id)
       );
  END IF;

  CREATE INDEX IF NOT EXISTS rbm_plans_org_program_version_idx
    ON rbm_monitoring_plans (organization_id, program_id, version DESC);

  COMMENT ON COLUMN rbm_monitoring_plans.version IS
    'Plan version within (organization_id, program_id). Never reused. An active (approved) version is read-only; POST /rbm-monitoring-plans/:id/amend opens the next one.';
END $$;
