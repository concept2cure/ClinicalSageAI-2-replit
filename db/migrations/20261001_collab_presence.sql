-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — durable collaborative presence roster
-- Compliance: none directly (presence is display, not a governed record)
-- Purpose: The Authoring presence roster lived in a process-local Map
--          (server/routes/realtime-collab.ts YjsRoomManager). Only POST /rooms
--          created a room, so with two API tasks behind a non-sticky ALB the
--          20-second awareness heartbeat landed on a task that did not know
--          the room about half the time and returned an empty roster; after a
--          deploy every room was gone. Co-authors flickered in and out and
--          authors were told they were alone in a section. Section locks were
--          already moved to Postgres (20260807_collab_section_locks.sql); this
--          table does the same for the roster. Audit docs/evidence/W2/
--          2026-09-24-multi-task/ fix unit U16.
--
-- Determinism Contract:
--   - New table + index only, all IF NOT EXISTS; no existing object touched.
--     No DROP (CLAUDE.md Rule 1: this file re-runs on every deploy).
--   - One row per (organization, document, user): a user is present in one
--     section of a document at a time. The heartbeat UPSERTs the caller's own
--     row; the roster is the rows with last_seen_at in the last 90 seconds.
--   - organization_id is the integer org key, in public, so the tenant-
--     isolation sweep (20260801_tenant_isolation_sweep.sql, last in
--     C2C_MIGRATION_FILES) attaches tenant_isolation_policy on its next run.
-- =============================================================================

CREATE TABLE IF NOT EXISTS collab_presence (
  organization_id  INTEGER NOT NULL,
  document_id      TEXT NOT NULL,
  section_id       TEXT,
  user_id          TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  email            TEXT NOT NULL DEFAULT '',
  awareness        JSONB NOT NULL DEFAULT '{}'::jsonb,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, document_id, user_id)
);

CREATE INDEX IF NOT EXISTS collab_presence_org_doc_seen_idx
  ON collab_presence (organization_id, document_id, last_seen_at);

COMMENT ON TABLE collab_presence IS
  'Authoring presence roster shared across API tasks: one row per org/document/user, live while last_seen_at is within 90 s. Replaces the process-local room Map (U16).';
