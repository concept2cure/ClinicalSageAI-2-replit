-- CMC Playbook schema — the five tables /api/cmc/blueprint/playbook/* queries.
--
-- ── WHY THIS FILE EXISTS (2026-09-19) ───────────────────────────────────────
-- The playbook surface is live and unconditionally mounted:
--   server/bootstrap/register-core-routes.ts:68  app.use('/api/cmc/blueprint', …)
--   server/api/cmc/blueprintRoutes.ts:748        router.use('/playbook', …)
-- Every table it queries was absent from every provisioned database, so each of
-- those endpoints threw "relation does not exist" and returned 500.
--
-- A correct DDL file already existed at server/database/cmc-playbook-schema.sql
-- and was walked by NO applier — not install-fresh, not deploy-migrate, not
-- drizzle-kit push. That is precisely why the tables were missing. This file is
-- that one MOVED onto the canonical path and listed in C2C_MIGRATION_FILES; the
-- original is deleted in the same change, because two creators for one table is
-- a new duplicate under ci:duplicate-table-ddl and a parallel path under the
-- working agreement.
--
-- ── WHAT CHANGED ON THE MOVE, AND WHY ───────────────────────────────────────
-- 1. cmc_workflows does NOT carry FOREIGN KEY (organization_id) REFERENCES
--    organizations(id), though the other four tables do.
--    The seed below writes organization_id = 0, which this platform reserves for
--    shared/global rows — server/api/cmc/playbookRoutes.ts:41 ("the reserved
--    system tenant holding the shared global templates"), the RLS carve-out at
--    server/db/tenantRls.ts:93 ("Or it's a special zero tenant (shared
--    resources)"), and the note at server/utils/authedOrgId.ts:55.
--    organizations.id is serial (shared/schema.ts:154) and NO migration in
--    C2C_MIGRATION_FILES inserts any organizations row, so no org 0 exists on a
--    provisioned database. With the FK present this file's seed fails at apply
--    time and takes the whole deploy with it. The FK is therefore omitted on
--    this one table, deliberately, and written down here rather than discovered.
--
-- 2. cmc_workflow_tasks gains organization_id INTEGER NOT NULL. The source file
--    had no tenant column at all, which would have put the table outside the
--    population EVERY rls mechanism operates on — see
--    scripts/ci/check-unkeyed-request-tables.mjs, a gate that exists because
--    three cross-tenant defects shared exactly that cause. The integer sweep
--    (db/migrations/20260801_tenant_isolation_sweep.sql) keys off this column,
--    so without it the table ships with no policy and nothing reports it.
--    server/api/cmc/playbookRoutes.ts was changed in the same commit to supply
--    it; the column is NOT NULL, so the two must land together.
--
-- 3. cmc_ai_tool_executions.command is TEXT, not VARCHAR(255). It stores
--    req.body.command (playbookRoutes.ts:174) — unbounded client input. A 255
--    cap is a silent truncation or a 500 on a long command, neither of which is
--    a contract anyone chose.
--
-- 4. The seed carries a row-count assertion (RULE 1). Reference data reaches a
--    deployed database only through a file in C2C_MIGRATION_FILES, and a
--    transcription error in one cannot be corrected in place afterwards — so a
--    truncated seed must fail HERE rather than leave a partial set that
--    something later reports a percentage against.
--
-- cmc_checklist_items and cmc_guideline_access, which the source file also
-- defined, are NOT carried over: no TypeScript in server/ or client/ references
-- either. Don't provision a table before it is real.
--
-- ── REPLAYABILITY (RULE 1) ──────────────────────────────────────────────────
-- Every statement in C2C_MIGRATION_FILES re-executes on EVERY deploy,
-- unconditionally. Everything below is IF NOT EXISTS or ON CONFLICT DO NOTHING
-- and is safe to re-run. There is no DROP in this file and none may be appended:
-- to remove something here, amend this file in place with a dated note.
--
-- @compliance ICH Q8/Q9/Q10, Q12 — the seeded templates are workflow scaffolds
--             (section ordering and task lists), not regulatory determinations.

-- ── Workflow templates ──────────────────────────────────────────────────────
-- Read by playbookRoutes.ts:42-48 (SELECT … WHERE organization_id = $1 OR = 0)
-- and written by blueprintRoutes.ts:210-228, whose INSERT names every column
-- below except the timestamps.
CREATE TABLE IF NOT EXISTS cmc_workflows (
    id VARCHAR(255) PRIMARY KEY,
    organization_id INTEGER NOT NULL,   -- no FK; see note 1 above
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    estimated_time VARCHAR(100),        -- free text ('4-6 weeks'), not an interval
    total_tasks INTEGER DEFAULT 0,
    priority VARCHAR(50) DEFAULT 'medium',
    template_data JSONB DEFAULT '{}',
    is_template BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ── A started workflow ──────────────────────────────────────────────────────
-- playbookRoutes.ts:110-128 INSERT … RETURNING *.
CREATE TABLE IF NOT EXISTS cmc_workflow_instances (
    id VARCHAR(255) PRIMARY KEY,        -- 'wf_<uuid>', not a uuid column
    template_id VARCHAR(255) NOT NULL,  -- a cmc_workflows.id slug
    organization_id INTEGER NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    assigned_team JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- ── Tasks within a started workflow ─────────────────────────────────────────
-- playbookRoutes.ts:366-381 INSERT (id, workflow_instance_id, name, task_order,
-- estimated_hours, status, created_at, updated_at) + organization_id, added per
-- note 2. task_order is spelled out because ORDER is reserved.
CREATE TABLE IF NOT EXISTS cmc_workflow_tasks (
    id VARCHAR(255) PRIMARY KEY,        -- 'task_<uuid>'
    workflow_instance_id VARCHAR(255) NOT NULL,
    organization_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    task_order INTEGER NOT NULL,
    estimated_hours INTEGER,
    actual_hours INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    assigned_to VARCHAR(255),
    due_date TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (workflow_instance_id) REFERENCES cmc_workflow_instances(id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- ── A started checklist ─────────────────────────────────────────────────────
-- playbookRoutes.ts:257-272 INSERT … RETURNING *. template_id holds slugs
-- ('module-3-2-s', 'module-3-2-p', 'process-validation') defined in-file at
-- playbookRoutes.ts:208-230, NOT rows in any table — so it carries no FK.
CREATE TABLE IF NOT EXISTS cmc_checklist_instances (
    id VARCHAR(255) PRIMARY KEY,        -- 'checklist_<uuid>'
    template_id VARCHAR(255) NOT NULL,
    organization_id INTEGER NOT NULL,
    project_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    progress INTEGER DEFAULT 0,
    items_completed INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- ── AI tool execution log ───────────────────────────────────────────────────
-- playbookRoutes.ts:162-172 INSERT … RETURNING *, then :185 UPDATE SET status,
-- result, completed_at. result and completed_at are absent from the INSERT, so
-- both must be nullable. There is no updated_at on this table in any code path.
CREATE TABLE IF NOT EXISTS cmc_ai_tool_executions (
    id VARCHAR(255) PRIMARY KEY,        -- 'ai_<uuid>'
    organization_id INTEGER NOT NULL,
    command TEXT NOT NULL,              -- TEXT, not VARCHAR(255); see note 3
    drug_name VARCHAR(255),
    context JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'pending',
    result JSONB,
    execution_time_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cmc_workflows_org_id ON cmc_workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_workflow_instances_org_id ON cmc_workflow_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_workflow_tasks_workflow_id ON cmc_workflow_tasks(workflow_instance_id);
CREATE INDEX IF NOT EXISTS idx_cmc_workflow_tasks_org_id ON cmc_workflow_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_checklist_instances_org_id ON cmc_checklist_instances(organization_id);
CREATE INDEX IF NOT EXISTS idx_cmc_ai_executions_org_id ON cmc_ai_tool_executions(organization_id);

-- ── Seed: the shared global workflow templates ──────────────────────────────
-- organization_id = 0 is the reserved shared tenant (see note 1). These twelve
-- rows are what GET /api/cmc/blueprint/playbook/workflows returns to every
-- tenant alongside its own. Before this seed existed the route answered from a
-- hardcoded array in the handler when the query came back empty; that array is
-- deleted in the same commit, so these rows are now the only source.
INSERT INTO cmc_workflows (id, organization_id, name, description, category, estimated_time, total_tasks, priority, template_data) VALUES
('ind-cmc-template', 0, 'IND CMC Package', 'Complete Chemistry, Manufacturing, and Controls package for IND submission', 'submission', '4-6 weeks', 6, 'high', '{"steps": ["Drug Substance Characterization", "Manufacturing Process", "Container Closure", "Stability Protocol", "Analytical Methods", "Quality Specifications"]}'),
('nda-cmc-template', 0, 'NDA/BLA CMC Module 3', 'Comprehensive Module 3 Quality section for NDA/BLA submission', 'submission', '12-16 weeks', 24, 'critical', '{"steps": ["3.2.S Drug Substance", "3.2.P Drug Product", "3.2.A Appendices", "Regional Requirements"]}'),
('annual-product-review-template', 0, 'Annual Product Review (APR)', 'EU Annual Product Review for marketing authorization maintenance', 'post-market', '6-8 weeks', 15, 'high', '{"steps": ["Quality Review", "Non-clinical Review", "Clinical Review", "Risk Assessment", "Benefit-Risk Analysis"]}'),
('method-validation-template', 0, 'Analytical Method Validation', 'ICH Q2(R1) compliant analytical method validation protocol', 'analytical', '3-4 weeks', 8, 'high', '{"steps": ["Specificity", "Linearity", "Accuracy", "Precision", "Detection Limit", "Quantitation Limit", "Robustness", "System Suitability"]}'),
('qbd-development-template', 0, 'Quality by Design Development', 'ICH Q8/Q9/Q10 QbD approach for pharmaceutical development', 'development', '6-8 weeks', 12, 'high', '{"steps": ["QTPP Definition", "CQA Identification", "Risk Assessment", "DOE Studies", "Control Strategy", "Lifecycle Management"]}'),
('change-control-template', 0, 'Post-Approval Change Control', 'ICH Q12 compliant change control and variation management', 'change-control', '4-8 weeks', 10, 'high', '{"steps": ["Change Classification", "Risk Assessment", "Impact Analysis", "Validation Studies", "Regulatory Filing", "Implementation"]}'),
('tech-transfer-template', 0, 'Technology Transfer', 'Manufacturing site technology transfer and qualification', 'manufacturing', '8-12 weeks', 18, 'critical', '{"steps": ["Transfer Protocol", "Process Qualification", "Method Transfer", "Validation Studies", "Site Assessment", "Documentation"]}'),
('comparability-template', 0, 'Comparability Assessment', 'Pre and post-change comparability studies for manufacturing changes', 'assessment', '6-10 weeks', 14, 'high', '{"steps": ["Comparability Protocol", "Quality Testing", "Impurity Profiling", "Dissolution Studies", "Stability Assessment", "Statistical Analysis"]}'),
('dissolution-dev-template', 0, 'Dissolution Method Development', 'Biorelevant dissolution method development and validation', 'analytical', '4-6 weeks', 12, 'medium', '{"steps": ["Medium Selection", "Apparatus Selection", "Condition Optimization", "Method Validation", "IVIVC Assessment", "Documentation"]}'),
('cleaning-validation-template', 0, 'Cleaning Validation', 'Multi-product facility cleaning validation and verification', 'validation', '3-5 weeks', 9, 'medium', '{"steps": ["Cleaning Procedure", "Acceptance Criteria", "Analytical Methods", "Worst-case Selection", "Validation Studies", "Documentation"]}'),
('process-validation-template', 0, 'Process Validation', 'Stage 2 process performance qualification per FDA guidance', 'validation', '8-12 weeks', 16, 'critical', '{"steps": ["Validation Protocol", "Batch Manufacturing", "IPCs Monitoring", "Quality Testing", "Statistical Analysis", "Final Report"]}'),
('stability-supplement-template', 0, 'Stability Data Supplement', 'Comprehensive stability data analysis and shelf-life justification', 'stability', '2-3 weeks', 5, 'medium', '{"steps": ["Study Design Review", "Data Analysis", "Statistical Evaluation", "Shelf-life Justification", "Report Generation"]}')
ON CONFLICT (id) DO NOTHING;

-- Row-count assertion (RULE 1). The seed above must land all twelve templates.
-- A truncated INSERT list — a row lost to a bad merge or a hand edit — would
-- otherwise produce a partial template set that the playbook page renders
-- without complaint, and which cannot be corrected in place afterwards.
--
-- This also fires if a global template row is deleted from a deployed database.
-- That is intended: these rows are reference data owned by this file, so the
-- way to retire one is to amend this file in place with a dated note, not to
-- DELETE it out from under the migration that asserts it.
DO $$
DECLARE
  seeded INTEGER;
BEGIN
  SELECT count(*) INTO seeded
    FROM cmc_workflows
   WHERE organization_id = 0
     AND id IN (
       'ind-cmc-template', 'nda-cmc-template', 'annual-product-review-template',
       'method-validation-template', 'qbd-development-template',
       'change-control-template', 'tech-transfer-template',
       'comparability-template', 'dissolution-dev-template',
       'cleaning-validation-template', 'process-validation-template',
       'stability-supplement-template'
     );
  IF seeded <> 12 THEN
    RAISE EXCEPTION
      'cmc_workflows global template seed is incomplete: expected 12 rows at organization_id = 0, found %. Amend migrations/20260919_cmc_playbook_schema.sql rather than patching the database.',
      seeded;
  END IF;
END $$;
