-- Durable Y.js/CRDT state for the collaborative authoring surface (C2C-COLLAB-001).
--
-- server/services/hocuspocus-server.ts advertised "Document persistence to
-- PostgreSQL" in its header comment, but onStoreDocument only logged a byte
-- count and onLoadDocument returned the in-memory Y.Doc untouched. Nothing in
-- this repository stored CRDT state, so every collaborative edit was lost the
-- moment Hocuspocus unloaded the document (debounce/timeout) or the process
-- restarted — an authoring surface that silently discarded regulated content.
--
-- This table is the missing storage. One row per (document, tenant):
--
--   state      the full Y.js snapshot, Y.encodeStateAsUpdate(doc)
--   checksum   sha256 of `state`, so a corrupt/truncated snapshot is detectable
--              at load time instead of silently deserializing into garbage
--   version    monotonic counter bumped on every store (audit/debug aid)
--   updated_by the VERIFIED principal that last flushed the snapshot
--
-- TENANT ISOLATION. tenant_id INTEGER matches the app tenant model, so
-- scripts/db/authoring-subsystem.mjs installs the canonical
-- `tenant_isolation_policy` (FORCE RLS) on this table exactly as it does for
-- the other authoring tables — this file is listed in
-- AUTHORING_SUBSYSTEM_FILES and the table in AUTHORING_SUBSYSTEM_TABLES.
--
-- TENANT-CONSISTENT PARENTAGE (same shape as P0 #4 in the loop-tables
-- migration). The composite FK (doc_id, tenant_id) -> authoring_documents
-- (id, tenant_id) makes it structurally impossible for a state row to hang off
-- another tenant's document, beneath and independent of RLS. Its target,
-- authoring_documents_id_tenant_key UNIQUE (id, tenant_id), is created by
-- db/migrations/20260725_authoring_document_loop_tables.sql, which applies
-- earlier in the same atomic subsystem transaction.
--
-- Every statement is idempotent (CREATE TABLE/INDEX IF NOT EXISTS, constraint
-- guarded on pg_constraint), so the file is safe to re-run and safe on a
-- database that already has it.
--
-- ROLLBACK: DROP TABLE IF EXISTS authoring_document_yjs_state;

CREATE TABLE IF NOT EXISTS authoring_document_yjs_state (
  doc_id UUID NOT NULL,
  tenant_id INTEGER NOT NULL,
  state BYTEA NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  checksum TEXT NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (doc_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS authoring_document_yjs_state_tenant_idx
  ON authoring_document_yjs_state (tenant_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'authoring_document_yjs_state_doc_tenant_fkey'
      AND conrelid = 'public.authoring_document_yjs_state'::regclass
  ) THEN
    ALTER TABLE public.authoring_document_yjs_state
      ADD CONSTRAINT authoring_document_yjs_state_doc_tenant_fkey
      FOREIGN KEY (doc_id, tenant_id)
      REFERENCES public.authoring_documents (id, tenant_id)
      ON DELETE CASCADE;
  END IF;
END $$;
