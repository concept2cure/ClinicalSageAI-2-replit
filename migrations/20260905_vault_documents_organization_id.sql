-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure — Vault document store
-- Compliance: 21 CFR Part 11 (attributability), ALCOA+ (Attributable)
-- Purpose: Give vault.documents a tenant key, backfilled from the program that
--          owns each document, with unattributable rows QUARANTINED rather than
--          guessed.
--
-- eCTD/CTD Context:
--   - Module(s): all (the vault holds content destined for every module)
--   - Integrity Risk Addressed: a document with no resolvable owner cannot be
--     served, exported, purged or published safely. `vault.documents` is the
--     only document store in this codebase with no tenant column at all.
--
-- Determinism Contract:
--   - Additive. No column is dropped, no policy is created, no behaviour changes.
--
-- Notes:
--   - Idempotent (ADD COLUMN IF NOT EXISTS, guarded backfill, IF NOT EXISTS
--     indexes). Re-runs on every deploy — see RULE 1 in CLAUDE.md.
-- =============================================================================
--
-- WHY THIS COLUMN, AND WHY IT IS THE FIRST STEP
--
-- server/services/ectd/leaf-source-resolver.ts:77-88 declares vault_documents
-- NOT materializable into an eCTD leaf, and gives two reasons. This migration
-- removes the second one:
--
--     "submission_leaves.document_id is INTEGER but vault.documents.id is a
--      UUID (an integer cannot address the row), and vault.documents has no
--      organization_id (it is program-scoped), so there is no tenant-safe
--      lookup."
--
-- Until both are fixed, a customer can upload a CSR into the Vault and then
-- cannot put it in the NDA. The id-space half is a separate change (the widening
-- touches ~128 coercion sites and its failure mode is a surviving Number() that
-- yields NaN, resolves to nothing, and ships an incomplete sequence silently —
-- exactly the class leaf-source-resolver exists to prevent). This half is
-- additive, deletes nothing, and is worth landing alone.
--
-- It also unblocks, without doing any of them here: the storage-provider
-- ownership check, the per-tenant storage quota aggregate, and the tenant data
-- export/purge, which today cannot see the `vault` schema at all — so a GDPR
-- erasure request leaves the bytes.
--
-- WHAT THIS COLUMN DOES **NOT** DO — read this before assuming otherwise.
--
-- It does not add tenant isolation. Neither sweep will policy it:
--   - 20260801_tenant_isolation_sweep.sql is `public`-schema only; this is
--     `vault`.
--   - 20260801_uuid_tenant_isolation_nonpublic.sql covers non-public schemas but
--     is an EXPLICIT fixed (schema, table, column) list keyed on a UUID org GUC,
--     and this column is INTEGER (matching regulatory_programs.organization_id,
--     which is INTEGER NOT NULL, and req.user's org id).
-- vault.documents remains ENABLE ROW LEVEL SECURITY without FORCE
-- (db/migrations/044c_gcc_vault_schema.sql:112), which the table owner bypasses,
-- and server/db/getDatabaseUrl.ts:77-83 falls back to the owner URL when
-- APP_DATABASE_URL is unset. Adding FORCE is a BEHAVIOUR CHANGE, not a hardening
-- no-op: core.can_access_program is a live predicate on a provisioned database
-- (db/migrations/069_gcc_multitenant_rls_expansion.sql:268 delegates to
-- identity.can_access_program), and establishRequestTenantScope.ts:179 writes
-- `orgUuid ?? ''` — an empty string the resolver cannot resolve. FORCE before
-- that is proven takes the vault OFFLINE. That work is deliberately not here.
--
-- WHY NULL IS LEFT IN PLACE
--
-- The backfill resolves program_id -> regulatory_programs.organization_id. A row
-- whose program is missing or soft-deleted has no honest owner, and guessing one
-- is how a migration that fixes a cross-tenant leak creates one. Those rows stay
-- NULL and are findable through idx_vault_documents_unattributed. The column is
-- therefore NULLABLE for now; it becomes NOT NULL in the change that also adds
-- the org predicate, once the quarantine index is empty. That ordering is the
-- point: a NOT NULL added while unattributable rows exist either fails the
-- deploy or forces someone to invent an owner.

DO $mig$
DECLARE
  v_backfilled  BIGINT;
  v_quarantined BIGINT;
BEGIN
  IF to_regclass('vault.documents') IS NULL THEN
    RAISE NOTICE 'vault.documents not present - skipping organization_id';
    RETURN;
  END IF;

  ALTER TABLE vault.documents ADD COLUMN IF NOT EXISTS organization_id INTEGER;

  COMMENT ON COLUMN vault.documents.organization_id IS
    'Owning tenant, resolved from program_id -> regulatory_programs.organization_id. '
    'NULL = unattributable (program missing or soft-deleted) and quarantined, never guessed. '
    'Does NOT by itself provide isolation - see migrations/20260905_vault_documents_organization_id.sql.';

  -- Backfill only what can be resolved, and only where it is still unset, so a
  -- deliberate later correction is not overwritten on the next deploy.
  IF to_regclass('public.regulatory_programs') IS NOT NULL THEN
    UPDATE vault.documents d
       SET organization_id = rp.organization_id
      FROM public.regulatory_programs rp
     WHERE rp.id = d.program_id
       AND rp.deleted_at IS NULL
       AND d.organization_id IS DISTINCT FROM rp.organization_id
       AND d.organization_id IS NULL;
    GET DIAGNOSTICS v_backfilled = ROW_COUNT;
  ELSE
    v_backfilled := 0;
    RAISE NOTICE 'regulatory_programs not present - organization_id left NULL for every row';
  END IF;

  -- The join key every future org-scoped read will use.
  CREATE INDEX IF NOT EXISTS idx_vault_documents_organization
    ON vault.documents (organization_id)
    WHERE deleted_at IS NULL;

  -- The quarantine. A partial index, so it is both the fast path for finding
  -- unattributable rows and a cheap way to assert the set is empty before the
  -- NOT NULL step in a later change.
  CREATE INDEX IF NOT EXISTS idx_vault_documents_unattributed
    ON vault.documents (created_at)
    WHERE organization_id IS NULL AND deleted_at IS NULL;

  SELECT count(*) INTO v_quarantined
    FROM vault.documents
   WHERE organization_id IS NULL AND deleted_at IS NULL;

  RAISE NOTICE 'vault.documents.organization_id: % row(s) backfilled, % live row(s) unattributable and quarantined',
    v_backfilled, v_quarantined;

  -- Loud, not fatal. A deploy must not halt because historical rows lack an
  -- owner, but nobody should be able to say later that this was silent.
  IF v_quarantined > 0 THEN
    RAISE WARNING 'vault.documents holds % live row(s) with no resolvable organization. They are excluded from every org-scoped read until attributed. Find them: SELECT id, program_id, document_title, created_at FROM vault.documents WHERE organization_id IS NULL AND deleted_at IS NULL;',
      v_quarantined;
  END IF;
END
$mig$;
