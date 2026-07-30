-- eCTD REGULATORY AUDIT CONTEXT
-- Purpose: Reconcile the CoAuthor router's data model onto the CANONICAL
--   authoring tables (ledger C-27). authoring_comments and user_pins ship from
--   db/migrations/20260725_authoring_document_loop_tables.sql (the durable
--   applier, golden-journey-proven), but authoring.router.ts SELECTs and INSERTs
--   columns those canonical tables lack — so on every real deploy the comment
--   endpoints (threaded comments, resolution, author attribution) 500 with
--   "column ... does not exist". A second, incompatible definition of these
--   tables lives in 20260730_authoring_subsystem_schema.sql, but that file is on
--   no durable applier and never reaches a real database, so it cannot supply
--   the columns. This migration adds exactly the router-referenced columns to the
--   canonical tables, additively, so ONE physical table serves both the
--   freeze/signature loop and the CoAuthor router.
-- Author: Concept2Cure remediation
-- Date: 2026-07-30
-- Reviewed: authoring-comments-router-columns schema-contract test
-- Rollback: ALTER TABLE ... DROP COLUMN for the columns below (all additive,
--   nullable or defaulted; safe to drop).
--
-- authoring_sections is reconciled too (below): the router already uses the
-- canonical doc_id / order_index / code names (the document_id / order_idx /
-- section_number references in authoring.router.ts belong to OTHER tables or to
-- on-disk template JSON, not this table), so no rename is needed — only the
-- unique constraint its upsert requires.

-- authoring_comments — the eight columns authoring.router.ts references for
-- threaded comments, resolution workflow, and author attribution. parent_comment_id
-- is UUID to reference the canonical UUID id (0725), not the deploy-dead TEXT id.
ALTER TABLE IF EXISTS authoring_comments
  ADD COLUMN IF NOT EXISTS user_name         TEXT,
  ADD COLUMN IF NOT EXISTS user_email        TEXT,
  ADD COLUMN IF NOT EXISTS parent_comment_id UUID,
  ADD COLUMN IF NOT EXISTS position_data     JSONB,
  ADD COLUMN IF NOT EXISTS resolved_by       TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_note   TEXT,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS authoring_comments_parent_idx
  ON authoring_comments (parent_comment_id);

-- user_pins — the router touches last_changed when it rotates a signing PIN.
ALTER TABLE IF EXISTS user_pins
  ADD COLUMN IF NOT EXISTS last_changed TIMESTAMPTZ NOT NULL DEFAULT now();

-- authoring_sections — the router upserts sections with
-- INSERT ... ON CONFLICT (doc_id, code, tenant_id) DO UPDATE. The canonical table
-- (0725) had no unique constraint on that triple, so Postgres rejects the upsert
-- with "no unique or exclusion constraint matching the ON CONFLICT specification"
-- on every real deploy. A unique index is the arbiter ON CONFLICT infers.
CREATE UNIQUE INDEX IF NOT EXISTS authoring_sections_doc_code_tenant_uq
  ON authoring_sections (doc_id, code, tenant_id);
