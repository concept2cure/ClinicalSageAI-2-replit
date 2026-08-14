-- ============================================================================
-- PMCF enrolment records — the Annex XIV Part B evidence the CER's post-market
-- section rests on (GA completion ledger L5)
-- ============================================================================
--
-- THE GAP. The PMS/PMCF surface of the CER workbench had two live things and
-- two dead ones. Live: the documentation-status report
-- (server/services/gspr-postmarket/post-market-readiness.ts) and the PMCF plan
-- generator (…/pmcf-plan-generator.ts), both real and both honest. Dead: the
-- complaint feed and the PMCF enrolment feed. Neither had a backend, so the tab
-- rendered kit fixtures behind the sample-mode gate and told the user in prose
-- that "PMCF enrollment tracking has no live backend feed yet".
--
-- Under EU MDR Annex XIV Part B §6.2 and MDCG 2020-7, a PMCF plan is not the
-- deliverable — the plan plus the EXECUTION evidence is. A notified body reading
-- the CER's post-market section asks: which PMCF activities did you commit to,
-- how many subjects are actually enrolled against each planned sample size, as
-- of when, and what is still outstanding. That is what this table holds.
--
-- ── WHY A NEW TABLE, AND WHY NOT ON post_market_documents ──────────────────
-- `post_market_documents` holds the PMCF PLAN — a versioned, approvable,
-- lockable authoring artifact whose whole lifecycle is draft → approved →
-- superseded. Enrolment progress is the opposite kind of record: it moves
-- continuously against a plan that is deliberately frozen. Stuffing counts into
-- the plan's `content` json would mean either re-versioning an approved
-- regulatory document every time a site enrols a subject, or mutating an
-- approved document in place. Both are wrong; the second is a Part 11 defect.
--
-- The link between the two is `pmcf_plan_document_id` — the activity points at
-- the plan that commissioned it, so the CER can show plan-vs-actual.
--
-- ── ONE ROW = ONE PMCF ACTIVITY, CURRENT STATE ─────────────────────────────
-- Same split as literature_screening_decisions (20260814b): the domain table
-- carries the CURRENT state, and the immutable before/after trail lives in
-- `audit_logs` via `auditService.logAction`
-- (docs/AUDIT_STORE_INVENTORY_2026-08.md §2), which hash-chains and HMAC-seals
-- each row. Re-reporting enrolment UPDATEs the row in place and the audit
-- payload carries the superseded counts, so the progression is reconstructable
-- without a second, unbounded snapshot table nobody would prune.
--
-- ── NULL IS NOT ZERO. THIS IS THE WHOLE POINT OF THE FILE. ─────────────────
-- Three columns are nullable on purpose, and the CHECK constraints below exist
-- to stop each of them silently becoming a fabricated fact:
--
--   target_enrollment  NULL = "no planned sample size has been set". It is NOT
--                      0, because 0 would make every progress ratio read as
--                      complete (n/0 guarded) or as nothing planned. CHECK
--                      forbids a non-positive target outright: a PMCF activity
--                      with a stated target of zero subjects is not a target,
--                      it is a data-entry error.
--
--   enrolled_count     NULL = "enrolment has never been reported for this
--                      activity". That is categorically different from a
--                      reported 0 ("we have opened the study and enrolled
--                      nobody yet"), which IS a fact and IS allowed. A CER that
--                      cannot tell those apart reports unmonitored activities
--                      as monitored-and-empty.
--
--   enrollment_as_of   A count with no as-of date is not evidence — an NB
--                      cannot tell whether "412 enrolled" is current or two
--                      years stale. Enforced by
--                      pmcf_enrollment_records_as_of_chk: the count and the
--                      date are present together or absent together.
--
-- Nothing in this migration seeds a row. There is no sample data, no backfill
-- and no default activity: an org with no PMCF activities has zero rows here,
-- and the surface says "no PMCF activities recorded" rather than showing 0%.
--
-- ── WHY NO FOREIGN KEYS (the repo's FK-free linkage convention) ────────────
-- Both would-be parents are unreachable on the durable path:
-- `regulatory_programs` (20260524_program_workbench_schema.sql) and
-- `post_market_documents` (20260429_gspr_postmarket.sql) are BOTH absent from
-- C2C_MIGRATION_FILES, so on an already-provisioned database neither is
-- guaranteed to exist. deploy-migrate runs stopOnFirstFailure, so an unguarded
-- REFERENCES here would abort the entire migration set. Same call as
-- 20260814b and db/migrations/20260725_bundle_execution_receipts.sql (ADR-0009):
-- linkage is conventional, enforced by the writer (which resolves the program
-- inside the caller's org before inserting) and by the read joins, not by the
-- database. Reads tolerate a dangling reference exactly as they tolerate an
-- absent one.
--
-- ── TENANCY ────────────────────────────────────────────────────────────────
-- organization_id is INTEGER NOT NULL, deliberately: that is what
-- db/migrations/20260801_tenant_isolation_sweep.sql requires to attach
-- tenant_isolation_policy (it SKIPS a TEXT/uuid tenant key with a NOTICE).
-- This file is registered in scripts/db/migration-set.mjs ABOVE that sweep, so
-- the table is policied on the same deploy that creates it — never provisioned
-- cross-tenant readable. Every service query filters organization_id AND joins
-- regulatory_programs on the same org, matching the post-market/q-sub pattern.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS pmcf_enrollment_records;
-- Rollback loses the current enrolment state in this table only; the chained
-- audit_logs rows for every report survive it.
-- ============================================================================

-- ─── 1. The table ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pmcf_enrollment_records (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant key. INTEGER so the isolation sweep can policy it (see header).
  organization_id         INTEGER NOT NULL,

  -- regulatory_programs.id — the device/programme this activity follows up.
  -- NOT NULL: a PMCF activity with no device is not PMCF. FK-free (see header).
  program_id              UUID NOT NULL,

  -- post_market_documents.id of the PMCF plan that commissioned this activity,
  -- when one exists. NULL means the activity is recorded but not yet tied to an
  -- approved plan — a real and reportable gap, not a defect in this schema.
  pmcf_plan_document_id   UUID,

  -- Sponsor's own identifier for the activity, e.g. 'PMCF-2026-A'.
  activity_code           TEXT NOT NULL,

  -- MDCG 2020-7 §6 method taxonomy. Vocabulary is fixed by CHECK so the CER can
  -- report "which Annex XIV Part B method" without a free-text join table.
  activity_kind           TEXT NOT NULL,

  title                   TEXT NOT NULL,

  -- Lifecycle of the activity itself (NOT a document lifecycle — this row is
  -- never approved, locked or superseded; the PLAN is).
  status                  TEXT NOT NULL DEFAULT 'planned',

  -- What this activity is meant to answer — the residual-risk or claim question
  -- from the PMCF plan. Free text: it is quoted, not parsed.
  primary_endpoint        TEXT,

  -- Investigational sites / member states in scope. NULL = not stated.
  sites_count             INTEGER,

  -- Planned sample size. NULL = not set. Never 0 (see header + CHECK).
  target_enrollment       INTEGER,

  -- Subjects enrolled as reported. NULL = never reported; 0 is a real reported
  -- fact and is permitted (see header).
  enrolled_count          INTEGER,

  -- The as-of date for enrolled_count. Present iff enrolled_count is present.
  enrollment_as_of        TIMESTAMPTZ,

  -- Planned end of data collection, per the PMCF plan milestones.
  data_collection_through TIMESTAMPTZ,

  notes                   TEXT,

  -- Attribution. NOT NULL: an unattributed PMCF progress report is not Part 11
  -- evidence. TEXT to match the sibling gspr/post-market tables' user-id
  -- representation (post_market_documents.created_by is text).
  created_by              TEXT NOT NULL,
  updated_by              TEXT NOT NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constraints added separately + guarded so this file is idempotent and so a
-- re-run against a database that already has the table (created by an earlier
-- deploy) still converges on the full shape.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pmcf_enrollment_records_kind_chk'
  ) THEN
    ALTER TABLE pmcf_enrollment_records
      ADD CONSTRAINT pmcf_enrollment_records_kind_chk
      CHECK (activity_kind IN (
        'pmcf_study',        -- prospective post-market clinical investigation
        'registry',          -- device/implant registry participation
        'survey',            -- structured user or patient survey
        'cohort_follow_up',  -- extended follow-up of a pre-market cohort
        'literature_review', -- systematic PMCF literature surveillance
        'other'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pmcf_enrollment_records_status_chk'
  ) THEN
    ALTER TABLE pmcf_enrollment_records
      ADD CONSTRAINT pmcf_enrollment_records_status_chk
      CHECK (status IN ('planned', 'enrolling', 'follow_up', 'completed', 'terminated'));
  END IF;

  -- A stated target of zero (or fewer) subjects is a data-entry error, not a
  -- plan. NULL is the way to say "not set".
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pmcf_enrollment_records_target_chk'
  ) THEN
    ALTER TABLE pmcf_enrollment_records
      ADD CONSTRAINT pmcf_enrollment_records_target_chk
      CHECK (target_enrollment IS NULL OR target_enrollment > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pmcf_enrollment_records_enrolled_chk'
  ) THEN
    ALTER TABLE pmcf_enrollment_records
      ADD CONSTRAINT pmcf_enrollment_records_enrolled_chk
      CHECK (enrolled_count IS NULL OR enrolled_count >= 0);
  END IF;

  -- The integrity rule that makes a count evidence rather than a number: it
  -- carries the date it was true on, or it is not stored at all.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pmcf_enrollment_records_as_of_chk'
  ) THEN
    ALTER TABLE pmcf_enrollment_records
      ADD CONSTRAINT pmcf_enrollment_records_as_of_chk
      CHECK ((enrolled_count IS NULL) = (enrollment_as_of IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pmcf_enrollment_records_code_chk'
  ) THEN
    ALTER TABLE pmcf_enrollment_records
      ADD CONSTRAINT pmcf_enrollment_records_code_chk
      CHECK (btrim(activity_code) <> '' AND btrim(title) <> '');
  END IF;
END
$do$;

-- ─── 2. One activity per code, per programme, per tenant ────────────────────
-- organization_id leads so the index also serves the org-scoped read below.

CREATE UNIQUE INDEX IF NOT EXISTS pmcf_enrollment_records_activity_uq
  ON pmcf_enrollment_records (organization_id, program_id, activity_code);

-- ─── 3. Read-path indexes ───────────────────────────────────────────────────
-- The workbench read is "every PMCF activity in this org for this program",
-- ordered by code; the plan-linkage read is "activities under this PMCF plan".

CREATE INDEX IF NOT EXISTS pmcf_enrollment_records_org_program_idx
  ON pmcf_enrollment_records (organization_id, program_id);

CREATE INDEX IF NOT EXISTS pmcf_enrollment_records_plan_idx
  ON pmcf_enrollment_records (pmcf_plan_document_id)
  WHERE pmcf_plan_document_id IS NOT NULL;

-- ─── 4. Documentation carried in the database ───────────────────────────────

COMMENT ON TABLE pmcf_enrollment_records IS
  'EU MDR Annex XIV Part B / MDCG 2020-7 PMCF activity enrolment progress — one CURRENT row per (organization, program, activity code). The immutable before/after trail is in audit_logs via auditService (GA ledger L5). Nothing here is seeded.';
COMMENT ON COLUMN pmcf_enrollment_records.pmcf_plan_document_id IS
  'post_market_documents.id of the PMCF plan that commissioned this activity, or NULL when the activity is not yet tied to a plan. FK-free by repo convention (post_market_documents reaches no durable applier).';
COMMENT ON COLUMN pmcf_enrollment_records.target_enrollment IS
  'Planned sample size, or NULL when none has been set. Never 0 — CHECK pmcf_enrollment_records_target_chk. A progress ratio is computed only where a target exists.';
COMMENT ON COLUMN pmcf_enrollment_records.enrolled_count IS
  'Subjects enrolled as reported, or NULL when enrolment has NEVER been reported. A reported 0 is a real fact and is distinct from NULL; the surface must not render the two the same way.';
COMMENT ON COLUMN pmcf_enrollment_records.enrollment_as_of IS
  'The date enrolled_count was true on. Present iff enrolled_count is present (CHECK pmcf_enrollment_records_as_of_chk) — an undated count is not Annex XIV evidence.';
