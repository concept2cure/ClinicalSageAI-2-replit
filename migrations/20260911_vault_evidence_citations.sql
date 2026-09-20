-- vault.evidence_citations — the RAG provenance store, created durably.
--
-- 2026-09-11 — WO-15 finding 8.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- server/services/advancedRAGPipeline.ts:1316 INSERTs into
-- vault.evidence_citations on every retrieval that requests citation
-- persistence. The table is declared in shared/schema/vault.ts:193 and its only
-- SQL creator is db/migrations/_legacy/042_gcc_evidence_vault.sql, which is on
-- NO applier:
--
--   * not in C2C_MIGRATION_FILES;
--   * install-fresh's governed-content step is a non-recursive
--     readdirSync('db/migrations'), so it never descends into _legacy/;
--   * CI's `ls db/migrations/*_gcc_*.sql` glob does not descend either;
--   * db/migrations/044c_gcc_vault_schema.sql, which IS reachable, does not
--     create it.
--
-- And drizzle-kit push emits no vault DDL, so the declaration creates nothing.
-- Executed against a canonically provisioned database, the pipeline's own
-- INSERT returns:
--
--     ERROR: relation "vault.evidence_citations" does not exist
--
-- which advancedRAGPipeline.ts:1533 catches into a console.warn. The RAG answer
-- returns normally and its provenance is silently never recorded. For a
-- regulated retrieval surface the citations ARE the defensible part of the
-- answer, so this is not a cosmetic absence.
--
-- The installer could not report it: its push-surface check matched only
-- `pgTable('name')` on the declaration side and filtered `table_schema =
-- 'public'` on the existence side, so all six vault tables were invisible to it
-- and it printed "declared tables verified present" having never looked. That
-- half is fixed in scripts/db/lib/declared-tables.mjs and pinned by
-- tests/schema-contract/declared-table-surface.contract.test.ts; this file is
-- the other half.
--
-- ── Shape ───────────────────────────────────────────────────────────────────
-- Taken from the two existing definitions, which agree exactly with each other:
-- the Drizzle declaration (shared/schema/vault.ts:193-217) and the legacy SQL.
-- Nothing here is invented; no column is added, renamed or retyped.
--
-- NOT claimed: the pipeline writes support_type = 'SUPPORTS' while the legacy
-- file's comment lists 'STRONG' | 'MODERATE' | 'WEAK' | 'CONTRADICTS'. There is
-- no CHECK constraint on either definition, so nothing fails and nothing is
-- converged here — recorded rather than quietly reconciled, because picking a
-- vocabulary is a product decision, not a migration's.
--
-- ── Tenancy ─────────────────────────────────────────────────────────────────
-- Follows the vault model, not the public-schema one: vault tables carry no
-- organization_id and are scoped by RLS policies that join to vault.documents
-- (which does carry the org). Same policy set and same guards as the closest
-- precedent, migrations/20260905b_vault_document_chunks.sql. A table created by
-- THIS file on an existing database would otherwise ship unpoliced, because
-- 070_gcc runs on fresh installs only.
--
-- Additive, guarded and idempotent throughout. A database with no vault schema
-- is legitimate and this file stays silent there.

DO $vault_citations$
BEGIN
  -- No vault, nothing to do. Same stance as 20260905b: silence, not failure.
  IF to_regclass('vault.documents') IS NULL THEN
    RAISE NOTICE 'vault.documents absent; vault.evidence_citations not created.';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS vault.evidence_citations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Source: the document containing the claim.
    source_document_id   UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    source_chunk_id      UUID,
    claim_text           TEXT NOT NULL,

    -- Evidence: the supporting document.
    evidence_document_id UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    evidence_chunk_id    UUID,
    evidence_text        TEXT,

    -- Citation quality.
    relevance_score      NUMERIC(3,2),
    support_type         TEXT,

    -- Context.
    citation_context     TEXT,
    regulatory_relevance TEXT[],

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by           UUID,
    verified             BOOLEAN DEFAULT FALSE,
    verified_at          TIMESTAMPTZ,
    verified_by          UUID
  );

  /* The chunk FKs are added separately and only where the target exists.
     vault.document_chunks is created by migrations/20260905b_vault_document_
     chunks.sql, earlier in this set — but that file is itself guarded on the
     vault schema, so it can legitimately have done nothing. Inlining these
     REFERENCES into the CREATE TABLE above would make this file fail in exactly
     the case both files are written to tolerate. Named constraints so the
     IF NOT EXISTS check below is exact. */
  IF to_regclass('vault.document_chunks') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'vault_evidence_citations_source_chunk_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE vault.evidence_citations
                 ADD CONSTRAINT vault_evidence_citations_source_chunk_fkey
                 FOREIGN KEY (source_chunk_id)
                 REFERENCES vault.document_chunks(id) ON DELETE SET NULL';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'vault_evidence_citations_evidence_chunk_fkey'
    ) THEN
      EXECUTE 'ALTER TABLE vault.evidence_citations
                 ADD CONSTRAINT vault_evidence_citations_evidence_chunk_fkey
                 FOREIGN KEY (evidence_chunk_id)
                 REFERENCES vault.document_chunks(id) ON DELETE SET NULL';
    END IF;
  END IF;

  CREATE INDEX IF NOT EXISTS evidence_citations_source_document_idx
    ON vault.evidence_citations (source_document_id);
  CREATE INDEX IF NOT EXISTS evidence_citations_evidence_document_idx
    ON vault.evidence_citations (evidence_document_id);
  CREATE INDEX IF NOT EXISTS evidence_citations_created_at_idx
    ON vault.evidence_citations (created_at);

  -- RLS, self-contained (see header): the 070_gcc policy set, scoped through
  -- the SOURCE document — the one whose claim the citation is evidence for.
  EXECUTE 'ALTER TABLE vault.evidence_citations ENABLE ROW LEVEL SECURITY';
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'core' AND p.proname = 'can_access_program') THEN
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_citations_select ON vault.evidence_citations';
    EXECUTE $p$CREATE POLICY rls_vault_citations_select ON vault.evidence_citations FOR SELECT
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_access_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_citations_insert ON vault.evidence_citations';
    EXECUTE $p$CREATE POLICY rls_vault_citations_insert ON vault.evidence_citations FOR INSERT
             WITH CHECK (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                         AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_citations_update ON vault.evidence_citations';
    EXECUTE $p$CREATE POLICY rls_vault_citations_update ON vault.evidence_citations FOR UPDATE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_write_program(d.program_id)))$p$;
    EXECUTE 'DROP POLICY IF EXISTS rls_vault_citations_delete ON vault.evidence_citations';
    EXECUTE $p$CREATE POLICY rls_vault_citations_delete ON vault.evidence_citations FOR DELETE
             USING (EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_write_program(d.program_id)))$p$;
  END IF;
END
$vault_citations$;
