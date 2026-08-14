-- ============================================================================
-- Draft candidates — carry what generated the draft
-- (GA ledger L33)
-- ============================================================================
--
-- THE GAP. Which model, which provider and which prompt produced an AI draft
-- all exist at draft time and are returned to the browser in the response
-- metadata — and then dropped. The accept endpoint persists the content, the
-- span lineage, the actor and the reason, but nothing about the generator. So
-- "what produced this text?" is answerable for about as long as the tab stays
-- open.
--
-- That is the question an assessor asks first about AI-assisted content, and it
-- is the one piece of provenance the platform was collecting and discarding
-- rather than never having.
--
-- THE COLUMN. `generator` travels with the parked draft, alongside the source
-- chunks that already stay server-side, and the accept path writes it into the
-- audit trail entry for the acceptance. Same reasoning as the chunks: a value
-- round-tripped through the client is a client claim, and "which model wrote
-- this" is exactly the sort of claim that must not be forgeable.
--
-- ── Why a prompt DIGEST and not a prompt version ────────────────────────────
-- The authoring draft route composes its prompt inline; there is no versioned
-- prompt file behind it to name. A version number nobody maintains would be
-- worse than nothing — it would look like a reference into a registry that does
-- not exist. A SHA-256 of the prompt actually sent is a real identifier: two
-- drafts that share it were generated from identical instructions, and an
-- inspector holding the prompt can verify the match. Where a route DOES have a
-- versioned prompt, it can record that alongside.
--
-- Nullable, and no backfill: nothing recorded the generator for drafts parked
-- before this, and inferring one from the model registry's current default
-- would attribute text to a model that may never have seen it.
--
-- ROLLBACK
--   ALTER TABLE authoring_ai_draft_candidates DROP COLUMN IF EXISTS generator;
-- The table is a short-lived (2 hour TTL) staging area, so rollback loses at
-- most the generator of drafts not yet accepted.
-- ============================================================================

ALTER TABLE IF EXISTS authoring_ai_draft_candidates
  ADD COLUMN IF NOT EXISTS generator JSONB;

DO $do$
BEGIN
  IF to_regclass('public.authoring_ai_draft_candidates') IS NULL THEN
    RAISE NOTICE 'authoring_ai_draft_candidates absent — generator column skipped';
    RETURN;
  END IF;

  EXECUTE $q$COMMENT ON COLUMN authoring_ai_draft_candidates.generator IS
    'What produced this draft: { model, provider, promptSha256, generatedAt }. Parked server-side with the source chunks rather than round-tripped through the client, because "which model wrote this" must not be a forgeable client claim. NULL = not recorded (GA ledger L33).'$q$;
END
$do$;
