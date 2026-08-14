-- ============================================================================
-- Document alias map — c2c_document_aliases
-- (Document Identity Contract 2026-08, slice C2; approved 2026-08-13)
-- ============================================================================
--
-- WHAT THIS FIXES. docs/DOCUMENT_IDENTITY_CONTRACT_2026-08.md §1 records that a
-- document has no single identity in this platform: `authoring_documents` and
-- `coauthor_documents` are uuid-native, `submission_leaves.document_id` is
-- integer, and `concept2cure_artifacts` keys off the legacy integer `projects`
-- spine. Consequences 3 and 4 of that document follow directly — a snapshot can
-- be filed but its lineage back to the source can only be recorded as prose,
-- and editor deep-links have to resolve by code/title because there is nothing
-- else to resolve by. Title matching is not identity: two sections legitimately
-- share a title, and a rename silently breaks the link.
--
-- WHAT THIS IS NOT. It is emphatically not the document registry that was built
-- and reverted (Option B in that document). That design owned identity AND
-- metadata AND placement, so it competed with the stores that already own those
-- things, and the competition is what killed it. The failure mode was inherent,
-- not incidental — so the fix is not "build it more carefully", it is "build
-- something that cannot own attributes at all".
--
-- ── THE INVARIANT ───────────────────────────────────────────────────────────
-- THIS TABLE HOLDS NO ATTRIBUTES. Not a title, not a status, not content, not
-- placement, not a timestamp of anything but its own creation. Titles stay in
-- the stores. Placement stays in `submission_leaves`. The table answers exactly
-- one question — "what is this document called in that store?" — and if a
-- column is ever proposed here that is not an identity, the proposal is wrong.
--
-- The invariant is enforced mechanically, not by intention:
-- scripts/ci/check-document-alias-attribute-free.mjs fails the build on any
-- column beyond the fixed set below, in any migration, anywhere in the repo.
-- A reverted design that came back one useful-looking column at a time is
-- exactly the failure this gate exists to make impossible.
--
-- ── KEYS ────────────────────────────────────────────────────────────────────
--   PRIMARY KEY (store, native_id) — one row per document per store. A store's
--     native id is that store's own primary key and is therefore already unique
--     within the store, so this needs no tenant component to be correct.
--   UNIQUE (canonical_id, store)   — a canonical document has at most ONE
--     representation in any given store. Two rows here would mean the identity
--     forked, which is the condition the map exists to prevent; the constraint
--     makes it unrepresentable rather than merely discouraged.
--   The UNIQUE index also serves `WHERE canonical_id = $1` as a prefix, which
--     is the "every alias of this document" read.
--
-- ── WHY `store` IS CHECKED, NOT FREE TEXT ───────────────────────────────────
-- Free text here has one likely failure and it is silent: two writers spell the
-- same store 'coauthor' and 'coauthor_documents', the map stops resolving, and
-- nothing errors — a lookup simply returns no alias, which is indistinguishable
-- from "not aliased yet". Adding a store is then a deliberate one-line
-- migration, reviewed, rather than a typo that degrades identity resolution
-- into silence.
--
-- ── WHY NO FOREIGN KEYS ─────────────────────────────────────────────────────
-- The same repo convention, and the same reasoning, as slice C1
-- (migrations/20260814_projects_regulatory_program_anchor.sql): `native_id` is
-- text precisely because it addresses several stores with different key types,
-- so it could not carry a REFERENCES even if every target table were guaranteed
-- present on every database — which they are not. The linkage is conventional,
-- enforced by the writers and by reads that tolerate a dangling alias exactly
-- as they tolerate a missing one.
--
-- ── TENANCY ─────────────────────────────────────────────────────────────────
-- `organization_id` is NOT NULL and is not part of any key. It exists so the
-- RLS sweep policies this table like every other tenant table, and so reads can
-- carry the org predicate. Every read MUST carry it: without one, a caller who
-- knows a native id learns the canonical identity of another tenant's document.
-- server/services/c2c/document-alias-map.ts is the only sanctioned writer and
-- scopes every statement.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS c2c_document_aliases;
-- Rollback loses only the cross-store links; no document in any store is
-- touched, and the surfaces degrade back to title-matching, which is where they
-- are today.
-- ============================================================================

CREATE TABLE IF NOT EXISTS c2c_document_aliases (
  canonical_id    UUID        NOT NULL,
  store           TEXT        NOT NULL,
  native_id       TEXT        NOT NULL,
  organization_id INTEGER     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (store, native_id),
  UNIQUE (canonical_id, store)
);

DO $do$
BEGIN
  IF to_regclass('public.c2c_document_aliases') IS NULL THEN
    RAISE NOTICE 'c2c_document_aliases absent — alias map setup skipped';
    RETURN;
  END IF;

  -- Store vocabulary. Extending this list is a deliberate migration; see the
  -- header. Added separately from CREATE TABLE so re-running against a database
  -- that already has the table (created before this constraint existed) still
  -- acquires it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'c2c_document_aliases_store_check'
  ) THEN
    EXECUTE $q$
      ALTER TABLE c2c_document_aliases
        ADD CONSTRAINT c2c_document_aliases_store_check
        CHECK (store IN (
          'authoring_documents',
          'coauthor_documents',
          'c2c_documents',
          'concept2cure_artifacts',
          'submission_leaves',
          'unified_documents'
        ))
    $q$;
  END IF;

  -- Neither key is org-leading, so the tenant predicate on a canonical_id read
  -- has no index to stand on without this.
  EXECUTE 'CREATE INDEX IF NOT EXISTS c2c_document_aliases_org_idx
             ON c2c_document_aliases (organization_id, canonical_id)';

  EXECUTE $q$COMMENT ON TABLE c2c_document_aliases IS
    'Identity-only map between a canonical document uuid and each store''s native key. HOLDS NO ATTRIBUTES — no title, status, content or placement; those stay in the stores and in submission_leaves. Enforced by scripts/ci/check-document-alias-attribute-free.mjs (Document Identity Contract 2026-08, slice C2).'$q$;
END
$do$;
