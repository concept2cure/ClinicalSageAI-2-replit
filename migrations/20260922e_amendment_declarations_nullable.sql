-- protocol_amendments.affects_consent / affects_risk: NULL means NOT DECLARED.
--
-- 2026-09-22. Both columns were `boolean NOT NULL DEFAULT false`, and the writer
-- (protocol-amendments-service.ts createAmendmentTx) sent `input.x ?? false`.
-- The Protocol surface's amendment form (ProtocolRegisterForms.tsx) never asked
-- either question, so EVERY amendment created in the product was stored as
-- "the sponsor declared this affects neither informed consent nor subject
-- risk". Nobody declared that. Two readers then treated it as a declaration:
--
--   * substantiality.ts flags a declaration conflict when the design delta
--     touches subject-facing fields and both flags are `false`, so it accused
--     sponsors of a false declaration the form never asked them to make;
--   * pdev-view-assembler.ts rendered `false` as "no re-consent".
--
-- The tri-state was unrepresentable in the column, so the fix starts here.
--
-- WHAT THIS DOES NOT DO: it does not rewrite existing rows. A stored `false`
-- written before this change cannot be told apart from a real "No" sent by
-- the API or the AnA tool, which could pass the flags. Setting them all to
-- NULL would erase real declarations; leaving them keeps some false ones.
-- Neither is correct, so the data is left as it is and the limitation is
-- written down here rather than papered over by a backfill.
--
-- Rule 1 (CLAUDE.md): nothing is dropped, so there is no create-then-drop
-- ordering hazard. The creating file, migrations/20260629_protocol_amendments.sql,
-- is applied by install-fresh only (docs/evaluation-2026-09/evidence/
-- 03-applier-reachability.json), and was amended in place today to create the
-- columns nullable. This file reaches databases that already exist.
-- DROP NOT NULL / DROP DEFAULT on a column that already allows NULL and has
-- no default are no-ops, so re-running it on every deploy is safe.
--
-- Guarded on to_regclass, with the COMMENTs inside the guard (a COMMENT
-- outside the guard failed a blank-database apply for 20260922c).

DO $$
BEGIN
  IF to_regclass('public.protocol_amendments') IS NULL THEN
    RAISE NOTICE 'protocol_amendments absent, skipping declaration nullability';
    RETURN;
  END IF;

  ALTER TABLE protocol_amendments ALTER COLUMN affects_consent DROP DEFAULT;
  ALTER TABLE protocol_amendments ALTER COLUMN affects_consent DROP NOT NULL;
  ALTER TABLE protocol_amendments ALTER COLUMN affects_risk DROP DEFAULT;
  ALTER TABLE protocol_amendments ALTER COLUMN affects_risk DROP NOT NULL;

  EXECUTE $c$
    COMMENT ON COLUMN protocol_amendments.affects_consent IS
      'Sponsor declaration: does this amendment affect informed consent? NULL = not declared. Rows written before 2026-09-22 may hold false for an undeclared amendment; see migrations/20260922e.'
  $c$;
  EXECUTE $c$
    COMMENT ON COLUMN protocol_amendments.affects_risk IS
      'Sponsor declaration: does this amendment affect subject risk? NULL = not declared. Rows written before 2026-09-22 may hold false for an undeclared amendment; see migrations/20260922e.'
  $c$;
END $$;
