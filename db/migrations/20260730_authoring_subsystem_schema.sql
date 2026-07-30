-- eCTD REGULATORY AUDIT CONTEXT
-- Purpose: Provision the governed authoring workflow tables (reviews, audit,
--   e-signatures, AI suggestions, compliance, change control, checklists) the
--   21 CFR Part 11 authoring surface queries, closing a schema-contract gap.
-- Author: AnA modernization
-- Date: 2026-07-30
-- Reviewed: schema-contract test (authoring-schema-contract.test.ts)
-- Rollback: DROP TABLE for the tables below (all CREATE IF NOT EXISTS; additive).
--
-- Authoring subsystem schema — the genuinely-new WORKFLOW tables the eCTD
-- CoAuthor / authoring surface queries, that no canonical migration creates.
--
-- SCOPE (post ledger C-27). This file once carried both the enterprise workflow
-- tables AND a second copy of the canonical document/section/comment/signature
-- tables the 20260725_authoring_* loop/audit/signature migrations own. C-27
-- retired those ten duplicate CREATE TABLE blocks — the 0725 files are the single
-- source for the shared tables — leaving this file with ONLY the twelve tables
-- below, each a live target of server/routes/authoring.router.ts that lives
-- nowhere else: comment activity, reviews, audit events, AI suggestions,
-- compliance scoring, suggestion feedback, exports, change requests,
-- checklists(+items), doc exports, and template sections.
--
-- REACHABILITY (ledger C-30). Being correct was never enough — this file was on
-- NO durable apply path (not a *_gcc_* file, not in the drizzle journal, not in
-- any applier's file list), so a deploy shipped the router onto a schema missing
-- these tables and every one of those endpoints failed with missing-relation
-- errors, exactly as the SCOPE NOTEs in the router's change-request/checklist
-- handlers record. C-30 adds it to AUTHORING_SUBSYSTEM_FILES in
-- scripts/db/authoring-subsystem.mjs (the deploy-migrate / apply-c2c applier),
-- proven by authoring-durable-applier.contract.test.ts.
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
--   * Tenant scoping is service-layer (tenant_id INTEGER, filtered as
--     WHERE tenant_id = $n in every scoped query), matching the c2c/_store family.
--     The eight tenant_id-carrying tables here take the standard
--     tenant_isolation_policy the applier (scripts/db/authoring-subsystem.mjs)
--     installs. The four the router keys by an opaque doc_id / checklist_id and
--     never tenant-filters (doc_change_requests, doc_checklist(+items),
--     doc_exports) carry no tenant_id and are isolated instead by a PARENT-scoped
--     policy tied to the owning authoring_documents row's tenant — see
--     AUTHORING_SUBSYSTEM_DOCSCOPED_TABLES (ledger C-30).
--   * FK-free across subsystems (soft references) EXCEPT the cascade the router
--     relies on: doc_checklist_items.checklist_id → doc_checklist.
--   * Idempotent (CREATE TABLE / INDEX IF NOT EXISTS); TIMESTAMPTZ throughout;
--     JSONB for structured columns (metadata, options, patch_json, position_data,
--     anchor, compliance detail blobs).

-- ─── Core document + section + comment surface ───────────────────────────────

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
