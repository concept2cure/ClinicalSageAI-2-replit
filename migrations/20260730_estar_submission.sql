-- eSTAR submission tracking.
--
-- The program-agnostic filing-tracking spine: one row per submission a client
-- files, for ANY eSTAR catalog key (510(k)/De Novo/PMA + supplements/Q-Sub/IDE/
-- 513(g)). Records lifecycle status, the FDA tracking number, and the review
-- clock (reviewGoalDays from the catalog) so the decision-due date is tracked.
--
--   estar_submissions — one row per filing (org-scoped). Additive; does NOT
--                       replace the rich Q-Sub interaction tables (q_submissions
--                       et al.), which it may link to via q_submission_id.
--
-- Tenant column is the canonical integer organization_id. UUID PK + drizzle-zod
-- style match the q-sub / ind-master-data / estar-registration domains.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS estar_submissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     INTEGER NOT NULL,
  catalog_key         VARCHAR(64) NOT NULL,
  program_type        VARCHAR(16) NOT NULL,
  variant             VARCHAR(16) NOT NULL DEFAULT 'device',
  title               TEXT,
  status              VARCHAR(24) NOT NULL DEFAULT 'draft',
  decision            VARCHAR(40),
  fda_tracking_number VARCHAR(64),
  filed_at            TIMESTAMPTZ,
  review_goal_days    INTEGER,
  decision_due_at     TIMESTAMPTZ,
  q_submission_id     UUID,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          INTEGER
);

CREATE INDEX IF NOT EXISTS estar_submissions_org_idx    ON estar_submissions (organization_id);
CREATE INDEX IF NOT EXISTS estar_submissions_status_idx ON estar_submissions (status);
