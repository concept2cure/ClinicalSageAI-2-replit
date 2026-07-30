-- eCTD REGULATORY AUDIT CONTEXT
-- Purpose: Provision the governed authoring workflow tables (reviews, audit,
--   e-signatures, AI suggestions, compliance, change control, checklists) the
--   21 CFR Part 11 authoring surface queries, closing a schema-contract gap.
-- Author: AnA modernization
-- Date: 2026-07-30
-- Reviewed: schema-contract test (authoring-schema-contract.test.ts)
-- Rollback: DROP TABLE for the tables below (all CREATE IF NOT EXISTS; additive).
--
-- Authoring subsystem schema — the database contract the eCTD CoAuthor /
-- authoring surface has always assumed but never created.
--
-- server/routes/authoring.router.ts issues SQL against ~24 tables. Only a
-- handful were ever provisioned (authoring_tokens/templates/export_history/
-- tracked_change_decisions via runtime `ensure*` DDL in the router itself, plus
-- template_guidance/section_guidance/template_usage and electronic_signatures).
-- The rest — the entire enterprise authoring workflow: documents, sections,
-- comments, reviews, audit, AI suggestions, compliance scoring, feedback,
-- change requests, checklists, signatures, workflow steps, exports, freezes —
-- were referenced by the API but created NOWHERE, so those endpoints failed
-- with missing-relation errors. This migration closes that schema-contract gap.
--
-- Column names and types are derived from the exact SQL the router executes
-- (INSERT column lists, SELECT projections, UPDATE SET, WHERE, ON CONFLICT,
-- JOINs). server/routes/__tests__/authoring-schema-contract.test.ts pins that
-- correspondence and fails if the router references a column this migration
-- does not create.
--
-- Design decisions grounded in the router's own usage:
--   * Identity columns are TEXT, not uuid. The router mints ids app-side with
--     crypto.randomUUID() and threads them as opaque strings; doc_id / document_id
--     / section_id are compared and JOINed against authoring_documents.id, so all
--     id-like columns must share one type. TEXT accepts every value the router
--     produces and keeps every equality/JOIN cast-free. Server-generated rows
--     (audit, AI suggestions, feedback) default to gen_random_uuid()::text.
--   * authoring_sections deliberately carries BOTH doc_id and document_id, and
--     BOTH order_index and order_idx: the router references each set on different
--     endpoints. Creating only one would leave the other endpoint broken. (The
--     duplication is a latent router inconsistency; this migration keeps both
--     columns so no endpoint 500s, and the inconsistency can be reconciled in the
--     router separately.)
--   * Tenant scoping is service-layer (tenant_id INTEGER, filtered as
--     WHERE tenant_id = $n in every scoped query), matching the c2c/_store family;
--     no RLS policy is added here. Tables the router never tenant-filters
--     (doc_change_requests, doc_checklist(+items), doc_permissions, doc_exports)
--     intentionally carry no tenant_id.
--   * FK-free across subsystems (soft references) EXCEPT the two the router relies
--     on for cascade: authoring_comments.parent_comment_id and
--     doc_checklist_items.checklist_id.
--   * Idempotent (CREATE TABLE / INDEX IF NOT EXISTS); TIMESTAMPTZ throughout;
--     JSONB for structured columns (metadata, options, patch_json, position_data,
--     anchor, compliance detail blobs).

-- ─── Core document + section + comment surface ───────────────────────────────

CREATE TABLE IF NOT EXISTS authoring_documents (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title                TEXT        NOT NULL,
  module               TEXT,
  product_code         TEXT,
  locale               TEXT        DEFAULT 'en-US',
  status               TEXT        NOT NULL DEFAULT 'draft',
                       -- draft | IN_REVIEW | APPROVED | FROZEN | locked (router mixes case)
  created_by           TEXT,
  template_id          TEXT,
  submitted_at         TIMESTAMPTZ,
  current_workflow_id  TEXT,
  approved_at          TIMESTAMPTZ,
  frozen_at            TIMESTAMPTZ,
  locked_at            TIMESTAMPTZ,
  locked_by            TEXT,
  version              TEXT        DEFAULT '1.0',
  tenant_id            INTEGER     NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_documents_tenant_idx ON authoring_documents (tenant_id);
CREATE INDEX IF NOT EXISTS authoring_documents_tenant_status_idx ON authoring_documents (tenant_id, status);

CREATE TABLE IF NOT EXISTS authoring_sections (
  id              TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id          TEXT        NOT NULL,
  document_id     TEXT,            -- router references both doc_id and document_id
  code            TEXT,
  title           TEXT,
  content         TEXT,
  order_index     INTEGER     DEFAULT 0,
  order_idx       INTEGER     DEFAULT 0,  -- router references both order_index and order_idx
  section_number  TEXT,
  track_changes   BOOLEAN     DEFAULT false,
  created_by      TEXT,
  updated_by      TEXT,
  tenant_id       INTEGER     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Section upsert uses ON CONFLICT (doc_id, code, tenant_id).
  CONSTRAINT authoring_sections_doc_code_tenant_uniq UNIQUE (doc_id, code, tenant_id)
);
CREATE INDEX IF NOT EXISTS authoring_sections_doc_idx ON authoring_sections (doc_id, tenant_id);
CREATE INDEX IF NOT EXISTS authoring_sections_document_idx ON authoring_sections (document_id);

CREATE TABLE IF NOT EXISTS authoring_comments (
  id                 TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id             TEXT        NOT NULL,
  section_id         TEXT,
  body               TEXT,
  anchor             JSONB,
  status             TEXT        NOT NULL DEFAULT 'open',
  created_by         TEXT,
  user_name          TEXT,
  user_email         TEXT,
  parent_comment_id  TEXT        REFERENCES authoring_comments (id) ON DELETE CASCADE,
  position_data      JSONB,
  resolved_by        TEXT,
  resolved_at        TIMESTAMPTZ,
  resolution_note    TEXT,
  tenant_id          INTEGER     NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_comments_doc_idx ON authoring_comments (doc_id, tenant_id);

CREATE TABLE IF NOT EXISTS authoring_comment_activity (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id         TEXT,
  comment_id     TEXT,
  activity_type  TEXT,
  actor_id       TEXT,
  actor_name     TEXT,
  metadata       JSONB,
  tenant_id      INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_comment_activity_doc_idx ON authoring_comment_activity (doc_id, tenant_id);

CREATE TABLE IF NOT EXISTS authoring_citations (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  section_id     TEXT,
  source         TEXT,
  anchor         JSONB,
  citation_text  TEXT,
  reference_id   TEXT,
  created_by     TEXT,
  payload_sha256 TEXT,
  frozen_at      TIMESTAMPTZ,
  tenant_id      INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_citations_section_idx ON authoring_citations (section_id);

-- ─── Review + audit surface ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS authoring_reviews (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id           TEXT        NOT NULL,
  reviewer_id      TEXT,
  reviewer_name    TEXT,
  reviewer_email   TEXT,
  review_status    TEXT,
  review_comments  TEXT,
  reviewed_at      TIMESTAMPTZ,
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  requested_by     TEXT,
  tenant_id        INTEGER     NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- request-review upserts ON CONFLICT (doc_id, reviewer_id, tenant_id).
  CONSTRAINT authoring_reviews_doc_reviewer_tenant_uniq UNIQUE (doc_id, reviewer_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS authoring_reviews_doc_idx ON authoring_reviews (doc_id, tenant_id);

CREATE TABLE IF NOT EXISTS authoring_audit_events (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id      TEXT,
  event_type  TEXT,
  actor       TEXT,
  metadata    JSONB,
  tenant_id   INTEGER     NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_audit_events_doc_idx ON authoring_audit_events (doc_id, tenant_id);

CREATE TABLE IF NOT EXISTS authoring_audit_trail (
  id                   TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id               TEXT,
  section_id           TEXT,
  operation_type       TEXT,
  actor_email          TEXT,
  actor_role           TEXT,
  before_content       TEXT,
  after_content        TEXT,
  content_hash_before  TEXT,
  content_hash_after   TEXT,
  change_reason        TEXT,
  metadata             JSONB,
  ip_address           TEXT,
  user_agent           TEXT,
  session_id           TEXT,
  tenant_id            INTEGER     NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_audit_trail_doc_idx ON authoring_audit_trail (doc_id, tenant_id);

-- ─── AI suggestions + compliance scoring + feedback ──────────────────────────

CREATE TABLE IF NOT EXISTS authoring_ai_suggestions (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id       TEXT,
  section_id        TEXT,
  suggestion_type   TEXT,
  severity          TEXT,
  original_text     TEXT,
  suggested_text    TEXT,
  explanation       TEXT,
  position_start    INTEGER,
  position_end      INTEGER,
  confidence_score  NUMERIC,
  status            TEXT        NOT NULL DEFAULT 'pending',
  resolved_at       TIMESTAMPTZ,
  resolved_by       TEXT,
  tenant_id         INTEGER     NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_ai_suggestions_doc_idx ON authoring_ai_suggestions (document_id, status, tenant_id);

CREATE TABLE IF NOT EXISTS authoring_compliance_scores (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id         TEXT,
  regulatory_score    NUMERIC,
  technical_score     NUMERIC,
  clarity_score       NUMERIC,
  consistency_score   NUMERIC,
  completeness_score  NUMERIC,
  overall_score       NUMERIC,
  ich_compliance      JSONB,
  ctd_compliance      JSONB,
  ind_compliance      JSONB,
  missing_sections    JSONB,
  analysis_timestamp  TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id           INTEGER     NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ai/analyze upserts one score row per document ON CONFLICT (document_id, tenant_id).
  CONSTRAINT authoring_compliance_scores_doc_tenant_uniq UNIQUE (document_id, tenant_id)
);

CREATE TABLE IF NOT EXISTS authoring_suggestion_feedback (
  id               TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  suggestion_id    TEXT,
  action           TEXT,
  modified_text    TEXT,
  user_email       TEXT,
  feedback_reason  TEXT,
  tenant_id        INTEGER     NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_suggestion_feedback_suggestion_idx ON authoring_suggestion_feedback (suggestion_id);

-- ─── Workflow + signatures + export + freeze ─────────────────────────────────

CREATE TABLE IF NOT EXISTS authoring_workflow_steps (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  workflow_id    TEXT        NOT NULL,
  doc_id         TEXT,
  step_no        INTEGER,
  role           TEXT,
  approver_email TEXT,
  status         TEXT        NOT NULL DEFAULT 'PENDING',
  decision_note  TEXT,
  decided_at     TIMESTAMPTZ,
  tenant_id      INTEGER     NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_workflow_steps_workflow_idx ON authoring_workflow_steps (workflow_id, tenant_id);
CREATE INDEX IF NOT EXISTS authoring_workflow_steps_doc_idx ON authoring_workflow_steps (doc_id, tenant_id);

CREATE TABLE IF NOT EXISTS authoring_signatures (
  id                TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id            TEXT,
  signer_email      TEXT,
  signer_name       TEXT,
  meaning           TEXT,
  reason            TEXT,
  method            TEXT,
  content_hash      TEXT,
  signature_digest  TEXT,
  signed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id         INTEGER     NOT NULL
);
CREATE INDEX IF NOT EXISTS authoring_signatures_doc_idx ON authoring_signatures (doc_id, tenant_id);

CREATE TABLE IF NOT EXISTS authoring_exports (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id        TEXT,
  format        TEXT,
  options       JSONB,
  performed_by  TEXT,
  file_hash     TEXT,
  tenant_id     INTEGER     NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS authoring_exports_doc_idx ON authoring_exports (doc_id, tenant_id);

CREATE TABLE IF NOT EXISTS frozen_documents (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  document_id    TEXT,
  version        INTEGER,
  frozen_content TEXT,
  content_hash   TEXT,
  frozen_by      TEXT,
  frozen_reason  TEXT,
  frozen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id      INTEGER     NOT NULL
);
CREATE INDEX IF NOT EXISTS frozen_documents_doc_idx ON frozen_documents (document_id, tenant_id);

-- ─── Change requests + checklists + permissions (no tenant_id in router SQL) ──

CREATE TABLE IF NOT EXISTS doc_change_requests (
  cr_id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id          TEXT,
  section_id      TEXT,
  title           TEXT,
  reason          TEXT,
  apply_kind      TEXT        NOT NULL DEFAULT 'CONTENT',
  patch_json      JSONB       DEFAULT '{}'::jsonb,
  proposer_email  TEXT,
  approver_email  TEXT,
  status          TEXT        NOT NULL DEFAULT 'OPEN',
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doc_change_requests_doc_idx ON doc_change_requests (doc_id);

CREATE TABLE IF NOT EXISTS doc_checklist (
  checklist_id    TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id          TEXT,
  section_id      TEXT,
  region          TEXT,
  reviewer_email  TEXT,
  status          TEXT        NOT NULL DEFAULT 'open',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doc_checklist_doc_idx ON doc_checklist (doc_id, section_id, region);

CREATE TABLE IF NOT EXISTS doc_checklist_items (
  item_id        TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  checklist_id   TEXT        REFERENCES doc_checklist (checklist_id) ON DELETE CASCADE,
  item_key       TEXT,
  text           TEXT,
  status         TEXT        DEFAULT 'open',
  comment        TEXT,
  evidence_cite  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doc_checklist_items_checklist_idx ON doc_checklist_items (checklist_id);

CREATE TABLE IF NOT EXISTS doc_permissions (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id      TEXT,
  section_id  TEXT,
  email       TEXT,
  role        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doc_permissions_doc_idx ON doc_permissions (doc_id);

CREATE TABLE IF NOT EXISTS doc_exports (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  doc_id      TEXT,
  fmt         TEXT,
  doc_sha256  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS doc_exports_doc_idx ON doc_exports (doc_id);

-- ─── Template sections + per-user signing PIN ────────────────────────────────

CREATE TABLE IF NOT EXISTS template_sections (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  template_id  TEXT,
  code         TEXT,
  title        TEXT,
  content      TEXT,
  order_index  INTEGER     DEFAULT 0,
  tenant_id    INTEGER     NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS template_sections_template_idx ON template_sections (template_id, tenant_id);

CREATE TABLE IF NOT EXISTS user_pins (
  email            TEXT        NOT NULL,
  pin_hash         TEXT        NOT NULL,
  tenant_id        INTEGER     NOT NULL,
  failed_attempts  INTEGER     NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  last_attempt     TIMESTAMPTZ,
  pin_expires_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_changed     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_pins_email_tenant_pk PRIMARY KEY (email, tenant_id)
);
