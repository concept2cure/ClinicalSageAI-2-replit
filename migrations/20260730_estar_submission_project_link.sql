-- Link tracked eSTAR filings to the project / PM spine.
--
-- estar_submissions tracked a filing's lifecycle and review clock but carried no
-- project reference, so filing tracking was an island: a submission could not be
-- correlated with its project's schedule of events, milestones, or work items.
--
-- Adds a nullable project_id (a filing may be tracked before it is attached to a
-- project) plus its index, matching the org/status index pattern. Plain column
-- rather than a hard FK, consistent with the q_sub / ind_master_data domain
-- tables where the service layer owns scoping and validation.
--
-- Additive + idempotent: safe to re-run, and safe against an existing table with
-- rows (existing filings simply have a NULL project_id until attached).

ALTER TABLE estar_submissions
  ADD COLUMN IF NOT EXISTS project_id INTEGER;

CREATE INDEX IF NOT EXISTS estar_submissions_project_idx
  ON estar_submissions (project_id);
