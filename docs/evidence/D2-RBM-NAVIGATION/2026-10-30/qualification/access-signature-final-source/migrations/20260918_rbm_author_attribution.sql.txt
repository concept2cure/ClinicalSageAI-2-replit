-- 20260918_rbm_author_attribution.sql
--
-- Records the AUTHOR of an RBM risk assessment and monitoring plan, so the
-- 21 CFR Part 11 two-person rule (§11.10(d), §11.10(g)) can be asked of the
-- database when one is approved.
--
-- Both tables carried `approved_by` but no `created_by`. "The signer is not the
-- author" was therefore not a question the approval path could ask, and an
-- author approving their own governing risk basis was indistinguishable from a
-- second person reviewing it.
--
-- WHY A NEW FILE AND NOT AN AMENDMENT OF 20260629_rbm_surfaces.sql.
-- CLAUDE.md RULE 1 says to amend the creating migration in place — but that
-- rule is about REMOVING schema, and it inverts for adding. Both tables are
-- created with CREATE TABLE IF NOT EXISTS, which converges nothing on a
-- database where the table already exists: an amendment would give created_by
-- to fresh installs and to no deployed tenant, with the deploy green either
-- way. Additive columns ship as their own replayable file.
--
-- REPLAY-SAFE (RULE 1). Every statement is IF NOT EXISTS; re-running is a no-op.
--
-- THE to_regclass GUARD IS LOAD-BEARING. ADD COLUMN IF NOT EXISTS does not
-- guard the TABLE's existence — it raises 42P01 if the table is absent, which
-- on an applier that has not run 20260629 would abort the deploy.
--
-- NO BACKFILL. created_by stays NULL on rows written before this file. Deriving
-- an author from approved_by, or from an audit row, would fabricate attribution
-- the system never recorded — and the approval gate depends on being able to
-- tell "no author was ever captured" (which it states in the signed record)
-- apart from "this signer is the author" (which it refuses).

DO $$
BEGIN
  IF to_regclass('public.rbm_risk_assessments') IS NOT NULL THEN
    ALTER TABLE rbm_risk_assessments
      ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
    COMMENT ON COLUMN rbm_risk_assessments.created_by IS
      'Author of record (users.id), written at INSERT. NULL only on rows predating author capture; never fabricated. Compared against the approver for the Part 11 two-person rule.';
  END IF;

  IF to_regclass('public.rbm_monitoring_plans') IS NOT NULL THEN
    ALTER TABLE rbm_monitoring_plans
      ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
    COMMENT ON COLUMN rbm_monitoring_plans.created_by IS
      'Author of record (users.id), written at INSERT. NULL only on rows predating author capture; never fabricated. Compared against the approver for the Part 11 two-person rule.';
  END IF;
END $$;
