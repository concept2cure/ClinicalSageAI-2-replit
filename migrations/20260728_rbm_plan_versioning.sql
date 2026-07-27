-- Monitoring plans: versioned, so an approved plan stops being editable.
--
-- rbm_risk_assessments has carried `version` since it was introduced, and
-- approving a version archives the one it supersedes. The monitoring plan — the
-- document that actually directs monitoring activity, and the one a sponsor hands
-- an inspector — had none of that. PATCH /rbm-monitoring-plans/:id would edit a
-- plan whose status was already 'active', in place, with the approver's signature
-- and timestamp left attached to content they never saw. Under 21 CFR 11 and ICH
-- E6(R3) that is the defect that matters most: not a missing field, but a
-- signature that no longer means anything.
--
-- Plans now version like assessments:
--   * an approved (active) plan is read-only; revising it opens a new draft
--     version that copies the actions forward,
--   * approving a version archives the version it supersedes, so a study never
--     has two plans claiming to direct monitoring at once,
--   * every version stays on file with its own signature.
--
-- Backfill: existing plans for a study were de facto successive revisions, so
-- they are numbered by creation order. This is a statement about sequence only —
-- it does not claim the earlier ones were ever approved, and their status and
-- approval columns are untouched.
--
-- Idempotent: safe to re-run.

DO $$
BEGIN
  IF to_regclass('public.rbm_monitoring_plans') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE rbm_monitoring_plans
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

  -- Number the existing rows per study. Guarded on the default so a re-run does
  -- not renumber versions that later amendments have already assigned.
  UPDATE rbm_monitoring_plans p
     SET version = seq.v
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               PARTITION BY organization_id, program_id
               ORDER BY created_at, id
             ) AS v
        FROM rbm_monitoring_plans
       WHERE deleted_at IS NULL
    ) seq
   WHERE p.id = seq.id
     AND p.deleted_at IS NULL
     AND p.version = 1
     AND seq.v <> 1;

  -- A study with two 'active' plans has no single governing plan. Keep the most
  -- recently approved (falling back to the newest) and archive the rest, which
  -- is what approving through the new path would have done all along.
  UPDATE rbm_monitoring_plans p
     SET status = 'archived', updated_at = NOW()
   WHERE p.deleted_at IS NULL
     AND p.status = 'active'
     AND EXISTS (
       SELECT 1 FROM rbm_monitoring_plans q
        WHERE q.deleted_at IS NULL
          AND q.status = 'active'
          AND q.organization_id = p.organization_id
          AND q.program_id IS NOT DISTINCT FROM p.program_id
          AND (COALESCE(q.approved_at, q.created_at), q.id)
            > (COALESCE(p.approved_at, p.created_at), p.id)
     );

  CREATE INDEX IF NOT EXISTS rbm_plans_org_program_version_idx
    ON rbm_monitoring_plans (organization_id, program_id, version DESC);
END $$;
