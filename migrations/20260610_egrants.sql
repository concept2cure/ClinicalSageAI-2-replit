-- ============================================================================
-- eGrants / Funder-Milestone Management (Capability C2C-14)
-- ============================================================================
--
-- Sponsored-programs grant lifecycle: funding opportunities (pre-award) →
-- proposals → awards (post-award) → funder milestones / reporting deadlines →
-- sponsor invoices. Threads proposal → award onto the provenance spine and
-- attaches to Projects. Addresses the pre/post-award continuity + invoicing gap
-- from the ISU discovery brief.
--
-- Grounded in 2 CFR 200 (Uniform Guidance), SBIR/STTR policy, NIH RPPR / federal
-- financial reporting. Tenancy/audit mirror the platform; status/type columns
-- are CHECK-constrained.
--
-- Schema:  shared/schema/grants.ts
-- Service: server/services/grants/*
-- Routes:  server/routes/grants.ts (/api/grants)
-- ============================================================================

-- ─── Opportunities (pre-award) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_opportunities (
  id                 serial PRIMARY KEY,
  organization_id    integer NOT NULL REFERENCES organizations(id),
  opportunity_number text NOT NULL,
  title              text NOT NULL,
  funding_agency     text NOT NULL CHECK (funding_agency IN ('nih','nsf','barda','dod','cdc','arpa_h','foundation','industry','other')),
  mechanism          text CHECK (mechanism IN ('sbir','sttr','r01','r21','u01','p01','contract','cooperative_agreement','other')),
  external_id        text,
  due_date           date,
  ceiling_amount     numeric(14,2),
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('forecasted','open','closed')),
  created_by         integer NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_opportunities_org ON grant_opportunities(organization_id);

-- ─── Proposals (applications) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_proposals (
  id                     serial PRIMARY KEY,
  organization_id        integer NOT NULL REFERENCES organizations(id),
  opportunity_id         integer REFERENCES grant_opportunities(id),
  project_id             integer REFERENCES projects(id),
  title                  text NOT NULL,
  principal_investigator text,
  requested_amount       numeric(14,2),
  status                 text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','internal_review','submitted','awarded','declined','withdrawn')),
  submitted_date         date,
  created_by             integer NOT NULL REFERENCES users(id),
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_proposals_org         ON grant_proposals(organization_id);
CREATE INDEX IF NOT EXISTS idx_grant_proposals_opportunity ON grant_proposals(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_grant_proposals_project     ON grant_proposals(project_id);

-- ─── Awards (post-award) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_awards (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  proposal_id     integer REFERENCES grant_proposals(id),
  project_id      integer REFERENCES projects(id),
  award_number    text NOT NULL,
  funding_agency  text NOT NULL CHECK (funding_agency IN ('nih','nsf','barda','dod','cdc','arpa_h','foundation','industry','other')),
  total_amount    numeric(14,2),
  period_start    date,
  period_end      date,
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','no_cost_extension','closed','terminated')),
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_awards_org      ON grant_awards(organization_id);
CREATE INDEX IF NOT EXISTS idx_grant_awards_proposal ON grant_awards(proposal_id);
CREATE INDEX IF NOT EXISTS idx_grant_awards_project  ON grant_awards(project_id);

-- ─── Funder milestones & reporting deadlines ────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_milestones (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  award_id        integer NOT NULL REFERENCES grant_awards(id),
  title           text NOT NULL,
  milestone_type  text NOT NULL CHECK (milestone_type IN ('scientific','progress_report','financial_report','deliverable','regulatory')),
  due_date        date,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','met','missed','submitted')),
  completed_date  date,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_milestones_org   ON grant_milestones(organization_id);
CREATE INDEX IF NOT EXISTS idx_grant_milestones_award ON grant_milestones(award_id);

-- ─── Sponsor invoices ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grant_invoices (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  award_id        integer NOT NULL REFERENCES grant_awards(id),
  invoice_number  text NOT NULL,
  period_start    date,
  period_end      date,
  amount          numeric(14,2) NOT NULL,
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','paid','disputed','void')),
  submitted_date  date,
  paid_date       date,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_grant_invoices_org   ON grant_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_grant_invoices_award ON grant_invoices(award_id);
