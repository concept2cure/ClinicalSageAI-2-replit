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
--
-- ── AMENDED IN PLACE 2026-10-29 (P-66, D6 tenant isolation) ─────────────────
-- Two changes, in place as CLAUDE.md Rule 1 asks. The journal records this
-- file as drift once; this note is why.
--
-- 1. A citation cites only its own organization's document. The INSERT and
--    UPDATE policies checked the SOURCE document alone, so organization B could
--    write a citation whose evidence is A's document: the row is B's (its
--    policies and the tenant export follow the source), and A's purge deleted
--    it, because both document keys are ON DELETE CASCADE
--    (docs/evidence/D6-TENANT-EXPORT-GAPS/2026-10-29/, "Reported, not fixed" 1).
--    INSERT's WITH CHECK, and now UPDATE's, check both ends: the writer may
--    write the source, may read the evidence, and the evidence document belongs
--    to the source document's organization (core.get_program_org_id, the
--    resolver the program-access functions themselves use). Organization, not
--    access: a delegate organization that may read a sponsor's program
--    (identity.org_relationships) still cannot cite the sponsor's document.
--    SELECT and DELETE stay on the source, the row's owner. Nothing is dropped
--    and no row is rewritten: a citation written before this stays readable
--    and deletable by its source's organization.
-- 2. Row security is FORCEd, so the table owner is no exception (P-66). The
--    other Vault child tables are FORCEd by their creating files the same day.
--
-- The four policies are replaced only when the stored policy is not the shape
-- below (pg_policy's command and the clauses each end needs), so a replay
-- changes nothing and takes no lock for them. db/migrations/070_gcc_rls_
-- extended_ga.sql still writes the source-only form, but it runs on
-- install-fresh only, before this table exists; a later run of it would be
-- re-converged here by the next deploy. Proof:
-- tests/db/vault-isolation-hardening.dbtest.ts;
-- evidence docs/evidence/D6-ISOLATION-HARDENING/2026-10-29/.

DO $vault_citations$
DECLARE
  -- The row's owner: the document whose claim the citation is evidence for.
  source_read  CONSTANT text := 'EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_access_program(d.program_id))';
  source_write CONSTANT text := 'EXISTS (SELECT 1 FROM vault.documents d WHERE d.id = source_document_id
                    AND core.can_write_program(d.program_id))';
  -- Both ends: the source is writable, the evidence readable, and the evidence
  -- is the same organization's document.
  both_ends    CONSTANT text := 'EXISTS (SELECT 1 FROM vault.documents s JOIN vault.documents e ON e.id = evidence_document_id
                    WHERE s.id = source_document_id
                      AND core.can_write_program(s.program_id)
                      AND core.can_access_program(e.program_id)
                      AND core.get_program_org_id(e.program_id) = core.get_program_org_id(s.program_id))';
  both_markers CONSTANT text[] := ARRAY['source_document_id', 'evidence_document_id', 'can_write_program',
                                        'can_access_program', 'get_program_org_id'];
  pol        record;
  stored     record;
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
  -- the SOURCE document — the one whose claim the citation is evidence for —
  -- with both ends checked on write (amended 2026-10-29, P-66).
  EXECUTE 'ALTER TABLE vault.evidence_citations ENABLE ROW LEVEL SECURITY';
  IF NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'vault.evidence_citations'::regclass) THEN
    EXECUTE 'ALTER TABLE vault.evidence_citations FORCE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'core' AND p.proname = 'can_access_program') THEN
    -- Fail closed: without the resolver the both-ends check cannot be written,
    -- and leaving the source-only check in place is the gap this closes.
    IF to_regprocedure('core.get_program_org_id(uuid)') IS NULL THEN
      RAISE EXCEPTION 'core.get_program_org_id(uuid) is missing; vault.evidence_citations cannot be held to one organization.';
    END IF;
    FOR pol IN
      SELECT * FROM (VALUES
        ('rls_vault_citations_select', 'SELECT', 'r', source_read,  NULL::text,
           ARRAY['source_document_id', 'can_access_program'], NULL::text[]),
        ('rls_vault_citations_insert', 'INSERT', 'a', NULL::text,   both_ends,
           NULL::text[], both_markers),
        ('rls_vault_citations_update', 'UPDATE', 'w', source_write, both_ends,
           ARRAY['source_document_id', 'can_write_program'], both_markers),
        ('rls_vault_citations_delete', 'DELETE', 'd', source_write, NULL::text,
           ARRAY['source_document_id', 'can_write_program'], NULL::text[])
      ) AS v(name, cmd, polcmd, using_sql, check_sql, using_markers, check_markers)
    LOOP
      SELECT p.polcmd::text AS polcmd, pg_get_expr(p.polqual, p.polrelid) AS qual,
             pg_get_expr(p.polwithcheck, p.polrelid) AS chk
        INTO stored
        FROM pg_policy p
       WHERE p.polrelid = 'vault.evidence_citations'::regclass AND p.polname = pol.name;
      -- Already this shape: the command, and every clause each end needs.
      CONTINUE WHEN FOUND
        AND stored.polcmd = pol.polcmd
        AND (stored.qual IS NULL) = (pol.using_sql IS NULL)
        AND (stored.chk IS NULL) = (pol.check_sql IS NULL)
        AND NOT EXISTS (SELECT 1 FROM unnest(pol.using_markers) m WHERE stored.qual NOT LIKE '%' || m || '%')
        AND NOT EXISTS (SELECT 1 FROM unnest(pol.check_markers) m WHERE stored.chk NOT LIKE '%' || m || '%');
      EXECUTE format('DROP POLICY IF EXISTS %I ON vault.evidence_citations', pol.name);
      EXECUTE format('CREATE POLICY %I ON vault.evidence_citations FOR %s', pol.name, pol.cmd)
        || COALESCE(' USING (' || pol.using_sql || ')', '')
        || COALESCE(' WITH CHECK (' || pol.check_sql || ')', '');
    END LOOP;
  END IF;
END
$vault_citations$;
