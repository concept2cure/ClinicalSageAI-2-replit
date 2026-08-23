-- Short-lived server-side store for AI-drafted section candidates, so span-level
-- source attribution can be recorded HONESTLY at the draft-accept persistence
-- point (see docs/architecture/SOURCE_ATTRIBUTION_AUTOMATED_DESIGN.md §4, Phase
-- 3, option a).
--
-- ── WHY THIS TABLE EXISTS ────────────────────────────────────────────────────
-- Verifying that a generated span is a real quote needs the SOURCE'S TEXT.
-- cre_evidence_sources has no full-text column — a source's content lives chunked
-- in lumen_data_atoms and is assembled only at RETRIEVAL time. The one moment the
-- generated text AND the chunks that back it are both in hand is draft generation
-- (POST /sections/:id/ai/draft). But that endpoint returns the draft; it does not
-- persist it, and the author may edit before saving.
--
-- So the draft's retrieved chunks (content + the resolved cre_evidence_sources.id
-- for each, produced by the Phase 2 resolver at the generation boundary) are
-- parked here, keyed by a draft id, until the author accepts. The accept endpoint
-- (POST /sections/:id/ai/draft/accept) then re-verifies each quote VERBATIM
-- against these exact chunks inside the same transaction that writes the section
-- content. Re-verifying at accept time is what makes the citation honest: a quote
-- the author edited away simply stops matching, so a recorded span can never go
-- stale relative to the saved text.
--
-- The chunks are stored server-side, NOT round-tripped through the client,
-- precisely so a client cannot forge source content to manufacture a quote match.
-- The only client-supplied input at accept time is the (possibly edited) section
-- text, which is exactly what should be attributed.
--
-- ── LIFECYCLE ────────────────────────────────────────────────────────────────
-- A candidate is written on a successful AI draft, consumed (deleted) on accept,
-- and otherwise expires (expires_at). createDraftCandidate opportunistically
-- deletes expired rows so the table self-cleans without a separate job.
--
-- ── TENANCY (RLS, inline) ────────────────────────────────────────────────────
-- organization_id is the tenant key. RLS is enabled + FORCED here, with the
-- byte-for-byte tenant_isolation_policy the platform sweep applies, for two
-- reasons: (1) 0021_enable_rls_everywhere ran once on install-fresh and will
-- never revisit this table, and (2) under RLS_ENFORCE=on a table with no policy
-- is fully cross-tenant readable. The migration set's tenant-isolation sweep runs
-- after this file and would also policy it, but the sweep "only ADDS a policy
-- where none exists" — it detects this inline policy and skips the duplicate while
-- still re-FORCING RLS. Defining it here means the table is isolated the instant
-- it exists, on every code path (including drizzle-push installs the sweep loader
-- does not walk).

CREATE TABLE IF NOT EXISTS authoring_ai_draft_candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      UUID NOT NULL,
  organization_id INTEGER NOT NULL,
  content         TEXT NOT NULL,
  -- [{ evidenceSourceId: int, content: text, title: text|null }, …] — only chunks
  -- that resolved to a canonical cre_evidence_sources.id are stored; a chunk with
  -- no canonical source cannot back a verified quote (honest silence) and its text
  -- falls to author lineage at accept time.
  sources         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS authoring_ai_draft_candidates_section_idx
  ON authoring_ai_draft_candidates (organization_id, section_id);

CREATE INDEX IF NOT EXISTS authoring_ai_draft_candidates_expiry_idx
  ON authoring_ai_draft_candidates (expires_at);

ALTER TABLE authoring_ai_draft_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE authoring_ai_draft_candidates FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'authoring_ai_draft_candidates'
       AND policyname = 'tenant_isolation_policy'
  ) THEN
    CREATE POLICY tenant_isolation_policy ON authoring_ai_draft_candidates
      FOR ALL
      USING (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR organization_id = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
      WITH CHECK (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR organization_id = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
  END IF;
END $$;
