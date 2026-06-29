-- ============================================================================
-- Protocol Review & Comment workflow (Capability C2C-18c)
-- ============================================================================
--
-- The structured review layer over an authored protocol document: reviewer
-- assignments (by review role, with a per-reviewer disposition) and threaded
-- review comments (section-anchored, severity-graded, resolvable). Soft-links to
-- the authored document via protocol_document_id. Consensus + readiness are
-- derived deterministically from the assignment dispositions and open blocking
-- comments. Grounded in ICH E6(R2) §5.0 and 45 CFR 46.111.
--
-- Schema:  shared/schema/protocol-reviews.ts
-- Service: server/services/protocol-reviews/*
-- Routes:  server/routes/protocol-reviews.ts (/api/protocol-reviews)
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_review_assignments (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL,
  reviewer_name        text NOT NULL,
  reviewer_user_id     integer,
  role                 text NOT NULL DEFAULT 'general'
                         CHECK (role IN ('scientific','statistical','ethics','safety','regulatory','general')),
  status               text NOT NULL DEFAULT 'assigned'
                         CHECK (status IN ('assigned','in_progress','completed')),
  disposition          text CHECK (disposition IN ('approve','approve_with_changes','reject','abstain')),
  due_date             date,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_review_assignments_org ON protocol_review_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_review_assignments_doc ON protocol_review_assignments(protocol_document_id);

CREATE TABLE IF NOT EXISTS protocol_review_comments (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL,
  assignment_id        integer,
  section_ref          text,
  comment              text NOT NULL,
  severity             text CHECK (severity IN ('blocking','major','minor','info')),
  resolved             boolean NOT NULL DEFAULT false,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_review_comments_org ON protocol_review_comments(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_review_comments_doc ON protocol_review_comments(protocol_document_id);
