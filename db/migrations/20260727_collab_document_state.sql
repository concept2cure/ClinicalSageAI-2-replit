-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: durable state for the CRDT collaboration server
-- Date: 2026-07-27
--
-- WHY THIS EXISTS
-- The Hocuspocus collaboration server (server/services/hocuspocus-server.ts)
-- declared persistence in its module header — "Document persistence to
-- PostgreSQL" — but `onStoreDocument` only wrote a debug log line and
-- `onLoadDocument` returned the in-memory Y.Doc it was handed. Nothing was ever
-- written and nothing was ever restored, so every collaborative edit lived only
-- in the process that received it and was lost on restart, redeploy, or the
-- document being evicted from memory when the last client disconnected.
--
-- This table is the store those hooks now use.
--
-- SHAPE
-- `state` is the Y.js document encoded by Y.encodeStateAsUpdate — the whole
-- CRDT history, not a rendered snapshot, so a reload reconstructs the document
-- including concurrent edits that had not yet converged. `state_vector` is
-- stored alongside it (Y.encodeStateVector) so a future differential-sync path
-- can ask "what does the server already have?" without decoding the full state.
--
-- TENANCY
-- tenant_id is part of the PRIMARY KEY, not merely a column. The connection
-- authenticator already resolves every documentName to a tenant before a socket
-- is allowed to open it, so two tenants cannot reach the same row by the normal
-- path; making the key composite means they could not collide even if that
-- check were bypassed. Same defense-in-depth posture as the uploads path
-- (organization_id column AND org-scoped storage prefix).
--
-- CASCADE CLEANUP
-- documentName is a namespaced string ("authoring:<uuid>", optionally
-- ":<sectionUuid>"), so it cannot itself carry a foreign key. The parsed
-- authoring document id is denormalised into `authoring_doc_id` purely so the
-- CRDT state is deleted with the document it belongs to — collaborative edit
-- history outliving its document is a data-retention defect in a regulated
-- system, not a harmless orphan. The FK is added only when authoring_documents
-- exists, because this migration must not depend on the authoring lineage
-- having been applied: the column stays useful (and simply uncascaded) if it
-- has not.
--
-- IDEMPOTENT: every statement is IF NOT EXISTS or guarded by a catalog lookup.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS collab_document_state;
-- The table starts empty and no other table references it.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS collab_document_state (
  tenant_id INTEGER NOT NULL,
  document_name TEXT NOT NULL,
  -- Y.encodeStateAsUpdate(doc) — the full CRDT update, replayable with
  -- Y.applyUpdate onto a fresh Y.Doc.
  state BYTEA NOT NULL,
  -- Y.encodeStateVector(doc) — what this stored state already contains.
  state_vector BYTEA,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  -- Parsed out of document_name when it names an authoring document; NULL for
  -- any other resource kind. Exists for ON DELETE CASCADE, not for querying.
  authoring_doc_id UUID,
  -- Identity of the connection whose edit triggered the most recent store.
  -- Not an audit trail: the Part 11 trail for authored content is
  -- authoring_audit_trail. This answers "who last touched the CRDT blob".
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, document_name)
);

CREATE INDEX IF NOT EXISTS collab_document_state_authoring_doc_idx
  ON collab_document_state (authoring_doc_id)
  WHERE authoring_doc_id IS NOT NULL;

COMMENT ON TABLE collab_document_state IS
  'Durable Y.js CRDT state for the /collab WebSocket. One row per (tenant, documentName). Written by onStoreDocument, read by onLoadDocument.';
COMMENT ON COLUMN collab_document_state.state IS
  'Y.encodeStateAsUpdate output. Full CRDT history — apply with Y.applyUpdate, do not parse.';

-- Cascade the CRDT state away with its authoring document, but only where the
-- authoring lineage is present. Guarded so this migration is independent of it.
DO $$
BEGIN
  IF to_regclass('public.authoring_documents') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'collab_document_state_authoring_doc_fk'
     )
  THEN
    ALTER TABLE collab_document_state
      ADD CONSTRAINT collab_document_state_authoring_doc_fk
      FOREIGN KEY (authoring_doc_id)
      REFERENCES authoring_documents(id)
      ON DELETE CASCADE;
  END IF;
END $$;
