-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: IRB / IEC submissions, determinations, amendments and reportable
--          events (45 CFR 46, 21 CFR 56).
--
-- eCTD/CTD Context:
--   - Module(s): Module 5 (ethics approval threaded via provenance_links)
--   - Integrity Risk Addressed: an unanswered screening question stored as
--     the sponsor's "no"
--
-- Notes:
--   - In C2C_MIGRATION_FILES: re-runs on every deploy (CLAUDE.md RULE 1).
--   - Idempotent (IF NOT EXISTS throughout; the amendment below is conditional).
-- =============================================================================
-- ─── AMENDED 2026-10-15 — involves_vulnerable_populations is tri-state ──────
-- It was `boolean NOT NULL DEFAULT false` and the writers sent `=== true`, so a
-- submission nobody had asked about vulnerable subjects was stored as "none
-- involved" and the 45 CFR 46.111(b) safeguards check (irb-logic.ts) never
-- fired for it. Now nullable with no default: NULL = not recorded, which the
-- gate reports as not assessed. The CREATE declares that; the conditional
-- block after it drops NOT NULL and the default on a database created before
-- this amendment. Amended in place, not a DROP: nothing is removed and nothing
-- re-creates the old shape. Stored `false` values are kept — one written
-- before this change cannot be told from a recorded "no". Supersedes the
-- remark in 20260922d_irb_submission_context.sql that this sibling is
-- correctly NOT NULL DEFAULT false.
-- ─────────────────────────────────────────────────────────────────────────────
-- ============================================================================
-- IRB / IEC Submission & Amendment Management (Capability C2C-06)
-- ============================================================================
--
-- Human-subjects ethics review: initial submissions, single-IRB (sIRB) multi-
-- site coordination, informed-consent documents, committee determinations,
-- amendments, and reportable events (unanticipated problems / UPIRSO). An
-- approved submission threads ethics approval → Module 5 via provenance_links.
--
-- Grounded in the revised Common Rule (45 CFR 46), FDA 21 CFR 56, ICH E6(R2).
-- Tenancy/audit mirror the platform; status/type columns are CHECK-constrained.
--
-- Schema:  shared/schema/irb.ts
-- Service: server/services/irb/*
-- Routes:  server/routes/irb.ts (/api/irb)
-- ============================================================================

-- ─── Submissions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS irb_submissions (
  id                                 serial PRIMARY KEY,
  organization_id                    integer NOT NULL REFERENCES organizations(id),
  -- 2026-09-22: the hard FK to clinical_studies was REMOVED before this file
  -- was registered on the applier (Rule 1: amend the creator in place, never
  -- append a DROP). No migration in C2C_MIGRATION_FILES creates
  -- clinical_studies, and it is not in the Drizzle schema install-fresh
  -- pushes, so the constraint would have failed the first deploy that ran
  -- this file. It stays a soft link — the same shape consent_forms uses for
  -- protocol_document_id — and the reading code already tolerates a null.
  study_id                           integer,
  submission_id                      integer REFERENCES submissions(id),
  protocol_number                    text NOT NULL,
  title                              text NOT NULL,
  review_type                        text CHECK (review_type IN ('exempt','expedited','full_board')),
  risk_level                         text NOT NULL DEFAULT 'minimal' CHECK (risk_level IN ('minimal','greater_than_minimal')),
  involves_vulnerable_populations    boolean,  -- NULL = not recorded (2026-10-15)
  vulnerable_population_protections  text,
  is_single_irb                      boolean NOT NULL DEFAULT false,
  consent_waiver_requested           boolean NOT NULL DEFAULT false,
  status                             text NOT NULL DEFAULT 'draft' CHECK (status IN
                                       ('draft','submitted','under_review','modifications_required','approved','deferred','disapproved','suspended','closed','expired')),
  approval_date                      date,
  expiration_date                    date,
  created_by                         integer NOT NULL REFERENCES users(id),
  created_at                         timestamptz NOT NULL DEFAULT now(),
  updated_at                         timestamptz NOT NULL DEFAULT now(),
  deleted_at                         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_irb_submissions_org        ON irb_submissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_irb_submissions_study      ON irb_submissions(study_id);
CREATE INDEX IF NOT EXISTS idx_irb_submissions_submission ON irb_submissions(submission_id);

-- 2026-10-15: a database created before the amendment above still has NOT NULL
-- DEFAULT false here. Conditional on the live shape, so it is a no-op (and takes
-- no lock) on every deploy after the first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'irb_submissions'
       AND column_name = 'involves_vulnerable_populations'
       AND (is_nullable = 'NO' OR column_default IS NOT NULL)
  ) THEN
    ALTER TABLE irb_submissions ALTER COLUMN involves_vulnerable_populations DROP DEFAULT;
    ALTER TABLE irb_submissions ALTER COLUMN involves_vulnerable_populations DROP NOT NULL;
  END IF;
END $$;

-- ─── Participating sites (sIRB) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS irb_sites (
  id                     serial PRIMARY KEY,
  organization_id        integer NOT NULL REFERENCES organizations(id),
  irb_submission_id      integer NOT NULL REFERENCES irb_submissions(id),
  site_name              text NOT NULL,
  principal_investigator text,
  local_context          text,
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','activated','on_hold','closed')),
  created_by             integer NOT NULL REFERENCES users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);
CREATE INDEX IF NOT EXISTS idx_irb_sites_org        ON irb_sites(organization_id);
CREATE INDEX IF NOT EXISTS idx_irb_sites_submission ON irb_sites(irb_submission_id);

-- ─── Informed-consent documents ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS irb_consent_documents (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  irb_submission_id integer NOT NULL REFERENCES irb_submissions(id),
  document_name     text NOT NULL,
  version           text NOT NULL DEFAULT '1.0',
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','superseded')),
  approved_date     date,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_irb_consent_org        ON irb_consent_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_irb_consent_submission ON irb_consent_documents(irb_submission_id);

-- ─── Determinations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS irb_reviews (
  id                 serial PRIMARY KEY,
  organization_id    integer NOT NULL REFERENCES organizations(id),
  irb_submission_id  integer NOT NULL REFERENCES irb_submissions(id),
  review_type        text NOT NULL CHECK (review_type IN ('exempt','expedited','full_board')),
  outcome            text NOT NULL CHECK (outcome IN ('approved','modifications_required','deferred','disapproved')),
  conditions         text,
  determination_date date,
  created_by         integer NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_irb_reviews_org        ON irb_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_irb_reviews_submission ON irb_reviews(irb_submission_id);

-- ─── Amendments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS irb_amendments (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  irb_submission_id integer NOT NULL REFERENCES irb_submissions(id),
  description       text NOT NULL,
  substantive       boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_irb_amendments_org        ON irb_amendments(organization_id);
CREATE INDEX IF NOT EXISTS idx_irb_amendments_submission ON irb_amendments(irb_submission_id);

-- ─── Reportable events (unanticipated problems / UPIRSO) ────────────────────
CREATE TABLE IF NOT EXISTS irb_reportable_events (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  irb_submission_id integer NOT NULL REFERENCES irb_submissions(id),
  event_type        text NOT NULL CHECK (event_type IN ('unanticipated_problem','serious_adverse_event','protocol_deviation','noncompliance','other')),
  description       text NOT NULL,
  reported_date     date,
  status            text NOT NULL DEFAULT 'reported' CHECK (status IN ('reported','under_review','closed')),
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_irb_events_org        ON irb_reportable_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_irb_events_submission ON irb_reportable_events(irb_submission_id);
