-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: authoring-router supplementary stores (code-derived, G-02)
-- Date: 2026-07-28
--
-- WHY THIS EXISTS
-- server/routes/authoring.router.ts (and command-executor.ts for doc_sections)
-- read/write eleven tables that NOTHING in the repository created — they sat on
-- the unbacked-tables baseline. On a fresh database every AI-suggestion, review,
-- checklist, change-request, compliance-score, comment-activity and audit-events
-- endpoint either 500s (unguarded query) or silently no-ops. This provisions the
-- exact shapes the code uses: column lists are derived from the INSERT/SELECT/
-- UPDATE statements, ON CONFLICT targets become UNIQUE constraints, and inline
-- defaults ('pending', 'OPEN', 'CONTENT', NOW(), 0, 0.85, '{}') are reproduced.
--
-- These are INDEPENDENT stores, NOT the Part 11 authoring SUBSYSTEM (frozen_documents
-- / user_pins / authoring_audit_trail / authoring_signatures — owned atomically by
-- applyAuthoringSubsystem). Creating them here is safe: there is no half-a-subsystem
-- freeze/e-sign hazard.
--
-- TENANCY: the six authoring_* tables and template_sections carry tenant_id and are
-- filtered by it in every query — reproduced. The four doc_* tables scope by
-- doc_id / checklist_id only (tenant_id appears in NONE of their queries) —
-- reconstructed faithfully. Composite tenant-parent FKs to authoring_documents (the
-- C-02 hardening pattern) are a deliberate FOLLOW-UP: app-level scoping already
-- writes tenant_id from the verified principal, and adding those FKs is a separate
-- hardening step, exactly as it was for the loop tables.
--
-- Idempotent (CREATE ... IF NOT EXISTS; pg_constraint-guarded intra-cluster FKs).
-- ROLLBACK: DROP TABLE IF EXISTS <each> CASCADE.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. authoring_ai_suggestions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS authoring_ai_suggestions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID NOT NULL,
  section_id       UUID,
  suggestion_type  TEXT NOT NULL,
  severity         TEXT NOT NULL,
  original_text    TEXT,
  suggested_text   TEXT,
  explanation      TEXT,
  position_start   INTEGER NOT NULL DEFAULT 0,
  position_end     INTEGER NOT NULL DEFAULT 0,
  confidence_score NUMERIC NOT NULL DEFAULT 0.85,
  status           TEXT NOT NULL DEFAULT 'pending',
  resolved_at      TIMESTAMPTZ,
  resolved_by      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS authoring_ai_suggestions_lookup_idx
  ON authoring_ai_suggestions (document_id, status, tenant_id);

-- ── 2. authoring_audit_events (read-only in code; app audit writes go to
--       authoring_audit_trail — this table is populated out-of-band) ───────────
CREATE TABLE IF NOT EXISTS authoring_audit_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id     UUID NOT NULL,
  event_type TEXT,
  actor      TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS authoring_audit_events_doc_idx
  ON authoring_audit_events (doc_id, tenant_id, created_at DESC);

-- ── 3. authoring_comment_activity ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS authoring_comment_activity (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id        UUID NOT NULL,
  comment_id    UUID NOT NULL,
  activity_type TEXT NOT NULL,
  actor_id      TEXT NOT NULL,
  actor_name    TEXT NOT NULL,
  metadata      JSONB,
  tenant_id     INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS authoring_comment_activity_doc_idx
  ON authoring_comment_activity (doc_id, tenant_id, created_at DESC);

-- ── 4. authoring_compliance_scores (ON CONFLICT (document_id, tenant_id)) ──────
CREATE TABLE IF NOT EXISTS authoring_compliance_scores (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id        UUID NOT NULL,
  regulatory_score   INTEGER NOT NULL,
  technical_score    INTEGER NOT NULL,
  clarity_score      INTEGER NOT NULL,
  consistency_score  INTEGER NOT NULL,
  completeness_score INTEGER NOT NULL,
  overall_score      NUMERIC NOT NULL,
  ich_compliance     JSONB,
  ctd_compliance     JSONB,
  ind_compliance     JSONB,
  missing_sections   JSONB,
  analysis_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id          INTEGER NOT NULL,
  CONSTRAINT authoring_compliance_scores_doc_tenant_key UNIQUE (document_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS authoring_compliance_scores_doc_idx
  ON authoring_compliance_scores (document_id, tenant_id, analysis_timestamp DESC);

-- ── 5. authoring_reviews (ON CONFLICT (doc_id, reviewer_id, tenant_id)) ────────
CREATE TABLE IF NOT EXISTS authoring_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          UUID NOT NULL,
  reviewer_id     TEXT NOT NULL,
  reviewer_name   TEXT NOT NULL,
  reviewer_email  TEXT,
  review_status   TEXT NOT NULL DEFAULT 'pending',
  review_comments TEXT,
  reviewed_at     TIMESTAMPTZ,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_by    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tenant_id       INTEGER NOT NULL,
  CONSTRAINT authoring_reviews_doc_reviewer_tenant_key UNIQUE (doc_id, reviewer_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS authoring_reviews_doc_idx
  ON authoring_reviews (doc_id, tenant_id, requested_at DESC);

-- ── 6. authoring_suggestion_feedback (write-only) ─────────────────────────────
CREATE TABLE IF NOT EXISTS authoring_suggestion_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id   UUID NOT NULL,
  action          TEXT NOT NULL,
  modified_text   TEXT,
  user_email      TEXT NOT NULL,
  feedback_reason TEXT,
  tenant_id       INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS authoring_suggestion_feedback_suggestion_idx
  ON authoring_suggestion_feedback (suggestion_id);

-- ── 7. doc_change_requests (no tenant_id; scopes by doc_id) ───────────────────
CREATE TABLE IF NOT EXISTS doc_change_requests (
  cr_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id         UUID NOT NULL,
  section_id     UUID,
  title          TEXT NOT NULL,
  reason         TEXT,
  apply_kind     TEXT NOT NULL DEFAULT 'CONTENT',
  patch_json     JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposer_email TEXT NOT NULL,
  approver_email TEXT,
  status         TEXT NOT NULL DEFAULT 'OPEN',
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS doc_change_requests_doc_idx
  ON doc_change_requests (doc_id, created_at DESC);

-- ── 8. doc_checklist (no tenant_id) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_checklist (
  checklist_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id         UUID NOT NULL,
  section_id     UUID,
  region         TEXT NOT NULL,
  reviewer_email TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS doc_checklist_lookup_idx
  ON doc_checklist (doc_id, section_id, region);
CREATE INDEX IF NOT EXISTS doc_checklist_doc_idx
  ON doc_checklist (doc_id);

-- ── 9. doc_checklist_items (no tenant_id; child of doc_checklist) ─────────────
CREATE TABLE IF NOT EXISTS doc_checklist_items (
  item_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id  UUID NOT NULL,
  item_key      TEXT NOT NULL,
  text          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  comment       TEXT,
  evidence_cite TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS doc_checklist_items_checklist_idx
  ON doc_checklist_items (checklist_id, created_at);

-- ── 10. template_sections (read-only; copied FROM in POST /docs; seeded external) ─
CREATE TABLE IF NOT EXISTS template_sections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL,
  tenant_id   INTEGER NOT NULL,
  code        TEXT,
  title       TEXT,
  content     TEXT,
  order_index INTEGER
);
CREATE INDEX IF NOT EXISTS template_sections_template_idx
  ON template_sections (template_id, tenant_id);

-- ── 11. doc_sections (read-only; command-executor reads id/code/title) ────────
CREATE TABLE IF NOT EXISTS doc_sections (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code  TEXT,
  title TEXT
);

-- ── Intra-cluster foreign keys (both parent and child created above) ──────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'doc_checklist_items_checklist_fkey') THEN
    ALTER TABLE doc_checklist_items
      ADD CONSTRAINT doc_checklist_items_checklist_fkey
      FOREIGN KEY (checklist_id) REFERENCES doc_checklist (checklist_id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'authoring_suggestion_feedback_suggestion_fkey') THEN
    ALTER TABLE authoring_suggestion_feedback
      ADD CONSTRAINT authoring_suggestion_feedback_suggestion_fkey
      FOREIGN KEY (suggestion_id) REFERENCES authoring_ai_suggestions (id) ON DELETE CASCADE;
  END IF;
END $$;
