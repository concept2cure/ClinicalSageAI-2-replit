-- 20260908b_estar_submissions_filed_artifact.sql
--
-- What a tracked eSTAR filing was FILED WITH.
--
-- `estar_submissions` recorded that a filing moved to `filed`, on a date the
-- client chose, with a free-text FDA tracking number, and no link to any
-- artifact. A 21 CFR Part 11 reviewer asking "which bytes went to CDRH" had
-- nothing to open: the delivered PDF was hashed into a response and discarded
-- (closed by estar-artifact-retention, 2026-09-07), and even now that the bytes
-- are retained in the program vault, nothing joined the filing to them.
--
-- These two columns are that join. `filed_artifact_document_id` points at the
-- retained `vault.documents` row; `filed_artifact_sha256` is the hash of the
-- bytes that row holds, copied at filing time so the binding survives even if
-- the document is later superseded. Both are written by the server — the
-- caller names the document, the server reads its hash — so a filing can never
-- claim a digest nobody stored.
--
-- No FK to vault.documents: this table is `public` and integer-tenant-keyed,
-- that one is `vault` and program-keyed, and the route already verifies
-- ownership org-scoped before writing. A cross-schema FK here would buy nothing
-- the check does not already give and would couple two spines that are
-- deliberately joined in the service layer.
--
-- Replay-safe (CLAUDE.md RULE 1): additive and IF NOT EXISTS; re-running is a
-- no-op. Existing rows keep NULL — a filing recorded before this change was
-- bound to nothing, and the product says so rather than inventing a binding.

-- to_regclass-guarded, like every other file the set applies. The table is
-- created by migrations/20260730_estar_submission.sql, which sits EARLIER in
-- C2C_MIGRATION_FILES than the slice tests/schema-contract/
-- tenant-isolation-sweep.contract.test.ts replays — so on that lineage this
-- file ran against a schema with no estar_submissions and raised 42P01,
-- leaving the repository's deepest schema gate red. A bare ALTER also breaks
-- any lineage that legitimately lacks the eSTAR spine. Guarding is the
-- convention here (see db/migrations/20260730_c2c_ana_actions_command_vocab.sql);
-- COMMENT ON has no IF EXISTS form, so the whole file is guarded rather than
-- each statement.
DO $$
BEGIN
  IF to_regclass('public.estar_submissions') IS NULL THEN
    RAISE NOTICE 'estar_submissions not present in this schema; skipping the filed-artifact binding.';
    RETURN;
  END IF;

  ALTER TABLE estar_submissions
    ADD COLUMN IF NOT EXISTS filed_artifact_document_id UUID;

  ALTER TABLE estar_submissions
    ADD COLUMN IF NOT EXISTS filed_artifact_sha256 VARCHAR(64);

  EXECUTE $c$
    COMMENT ON COLUMN estar_submissions.filed_artifact_document_id IS
      'vault.documents id of the retained eSTAR this filing was made with. NULL for filings recorded before the binding existed; never fabricated.'
  $c$;

  EXECUTE $c$
    COMMENT ON COLUMN estar_submissions.filed_artifact_sha256 IS
      'SHA-256 of the retained bytes, read from the vault row at filing time — never accepted from the client.'
  $c$;
END $$;
