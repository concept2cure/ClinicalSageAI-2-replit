-- ============================================================================
-- Draft candidates — carry the model's paraphrase assertions
-- (source-attribution Phase 4)
-- ============================================================================
--
-- THE GAP. Phase 3 records only VERIFIED quotes: a generated clause is cited to
-- a source when that clause appears verbatim in the source's own text — a
-- checkable substring fact. Text the model paraphrased or summarized from a
-- source is left to author lineage, because at accept time there is nothing to
-- verify it against. But the model KNOWS which source it drew a passage from at
-- generation time; that knowledge reached the browser in the response and was
-- then dropped, exactly like the generator was before ledger L33.
--
-- THE COLUMN. `assertions` travels with the parked draft, alongside the source
-- chunks and the generator, and the accept path feeds it to
-- enforceSourceAndAuthorLineage, which records each still-present, still-resolvable
-- claim as a `usage='paraphrased'` span — an assertion, explicitly NOT a verified
-- quote, and only ever for a source that was actually retrieved. Same reasoning
-- as the chunks and the generator: a derivation claim round-tripped through the
-- client would be a forgeable client claim, so it stays server-side.
--
-- Shape: [{ "quote": <a snippet of the generated text>, "sourceId": <cre_evidence_sources.id> }].
--
-- Nullable, and no backfill: drafts parked before this carried no assertions,
-- and there is nothing to infer — a paraphrase claim is the model's to make, not
-- ours to reconstruct after the fact.
--
-- ROLLBACK
--   ALTER TABLE authoring_ai_draft_candidates DROP COLUMN IF EXISTS assertions;
-- The table is a short-lived (2 hour TTL) staging area, so rollback loses at
-- most the assertions of drafts not yet accepted.
-- ============================================================================

ALTER TABLE IF EXISTS authoring_ai_draft_candidates
  ADD COLUMN IF NOT EXISTS assertions JSONB;

DO $do$
BEGIN
  IF to_regclass('public.authoring_ai_draft_candidates') IS NULL THEN
    RAISE NOTICE 'authoring_ai_draft_candidates absent — assertions column skipped';
    RETURN;
  END IF;

  EXECUTE $q$COMMENT ON COLUMN authoring_ai_draft_candidates.assertions IS
    'Model-asserted paraphrase claims: [{ quote, sourceId }] the model self-reported deriving from a retrieved source at draft time. The accept path records each as a usage=paraphrased span — an assertion, never a verified quote, and only for a source that was actually retrieved. NULL = none recorded (source-attribution Phase 4).'$q$;
END
$do$;
