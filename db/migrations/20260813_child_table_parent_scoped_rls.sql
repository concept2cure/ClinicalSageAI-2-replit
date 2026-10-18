-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Isolate 21 child tables that hold tenant data but carry no tenant
--          column, by scoping them to their tenant-keyed parent row.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting — CSR detail, document versions, CER exports,
--     chat/AI threads, RAG chunks, 510(k) stage progress, programme milestones
--   - Integrity Risk Addressed: cross-tenant read. These tables were fully
--     readable by any tenant: no tenant column, no RLS, no policy.
--
-- Determinism Contract:
--   - Visibility is derived from the parent row's tenant, so a child can never
--     disagree with its parent about who owns it.
-- =============================================================================
--
-- 20260813_child_table_parent_scoped_rls.sql
--
-- ── How these were found, and why exactly these 21 ──────────────────────────
-- Against a fully provisioned database (install-fresh + deploy-migrate), of 937
-- public base tables, 195 carry no organization_id / tenant_id / org_id. That
-- number alone is not a finding: most are reference data, config, or join
-- tables. Narrowing to what actually matters:
--
--   195  no tenant column
--   170  ... and no RLS policy AND RLS not enabled
--    78  ... and referenced by server SQL (reachable from a request)
--    21  ... and holding a FOREIGN KEY to a table that IS tenant-keyed
--
-- That last cut is the one this migration acts on, and it is mechanical rather
-- than a judgement call: if a row's parent belongs to a tenant, the row belongs
-- to that tenant. The FK is the evidence, so the fix is a parent-scoped policy
-- and NOT a new organization_id column — adding one would duplicate the truth
-- and let the copy drift away from the parent.
--
-- The remaining 57 are deliberately untouched here. Each needs its own decision
-- (estate-wide reference data, platform config, or a genuine missing tenant
-- key), and bulk-guessing them is how a schema acquires columns nothing writes.
--
-- ── A second, opposite defect, fixed by the same predicate ──────────────────
-- Separately, 21 tables had RLS ENABLED and NO POLICY — 15 csr_* and 6 ctd_*,
-- from migrations/0005_csr_knowledge_database.sql. That combination denies
-- every row to every non-owner, so those tables are inert rather than leaky:
-- SELECT returns nothing and INSERT is refused. 18 of them key on an FK to
-- csr_studies / ctd_programs and are handled below.
--
-- Three are NOT, because their parent is itself parentless-to-a-tenant and the
-- chain needs a nested predicate this file's single-level spec cannot express.
-- Recorded here so the next pass has the map rather than rediscovering it:
--
--   csr_endpoint_results  -> csr_endpoints(endpoint_id)     -> csr_studies
--   ctd_module_sections   -> ctd_submissions(submission_id) -> ctd_programs
--   ctd_documents         -> ctd_module_sections(section_id) -> ctd_submissions
--                                                            -> ctd_programs
--
-- All three remain deny-all, which is safe, and none is referenced by server
-- code — so nothing is broken by leaving them until they are needed.
--
-- AMENDED 2026-10-13 (D3): "deny-all" was true of every role but the table
-- OWNER. Measured on a database provisioned from blank, all three carry
-- relrowsecurity = t, relforcerowsecurity = f and zero policies, and
-- PostgreSQL exempts an owner from policies unless FORCE is set — so the owner
-- read every tenant's rows. The last block in this file now adds the FORCE,
-- and the ENABLE too, for the reason given in the 2026-10-13 note below.
--
-- ── Why the policy shape is copied, not invented ────────────────────────────
-- The predicate is 20260801_tenant_isolation_sweep.sql's policy with the tenant
-- comparison redirected at the PARENT row: same session variables, same
-- `app.rls_enforce` bypass, same app_super_admin escape hatch. Matching matters
-- in both directions — a stricter policy here would make these tables fail in
-- non-enforcing environments where every sibling still reads fine, and a looser
-- one would leave a hole shaped exactly like the one being closed.
--
-- ── Tables with two tenant-keyed parents ────────────────────────────────────
-- ai_generation_runs references both ai_threads and ai_retrieval_runs;
-- lumen_atom_conflicts references lumen_data_atoms twice (atom_a_id, atom_b_id).
-- One owner is chosen per table — the thread, and atom_a — because the policy
-- must remain true for a row whose second reference is NULL. A conflict row
-- spanning two tenants' atoms is a separate integrity question and is not
-- something a visibility policy can express.
--
-- ── AMENDED IN PLACE 2026-09-24 (ledger L201) ───────────────────────────────
-- The spec list below grows; nothing is removed. Two classes are added, each
-- by the same predicate, because the tenant sweeps cannot reach them (no
-- tenant column) and this file is the canonical way a child is scoped:
--
--   * post-market records keyed by a TEXT program id with no foreign key:
--     complaints, mdr_events, vigilance_events. Each hangs from
--     regulatory_programs (uuid id), so the keys are compared as text, which
--     the 2026-09-08 amendment already handles. Their only readers are the
--     CAPA-MDR routes and AnA tools, inside a tenant scope; no job reads them.
--   * children with a foreign key into a tenant-keyed parent, found by
--     scripts/db/rls-coverage-check.sql's child rule, whose readers all run in
--     a tenant scope. Those with a context-less reader, and the grandchildren
--     this single-level spec cannot express, are named in that gate's
--     carve-out with their reasons.
--
-- ── AMENDED IN PLACE 2026-09-24, again (ledger L202) ────────────────────────
-- A second, CHAINED list follows the first loop: grandchildren whose parent is
-- itself a child. Each delegates to the parent's own tenant_isolation_policy,
-- which the single-level predicate cannot. See the note above that block.
-- ── AMENDED IN PLACE 2026-09-24, a third time (ledger L203) ─────────────────
-- The chained list takes schema-qualified names and gains fourteen children
-- outside public. See the note above that block.
-- ── AMENDED IN PLACE 2026-09-28 (D3) ─────────────────────────────────────────
-- drafting_tasks joins the text-program-id class (complaints, mdr_events,
-- vigilance_events): generated draft content — title, eCTD section, draft text
-- — naming its program by a TEXT project_id with no foreign key and no tenant
-- column. Its two routes (server/routes/misc-inline-routes.ts, the /v1/drafting
-- pair) already read and write it only through the program's ownership, inside
-- a tenant scope; the table did not. Measured as app_service in tenant A's
-- scope: B's draft was read, rewritten and deleted, and a task was filed under
-- B's program and under no program at all. Nothing is removed from this file.
-- Evidence docs/evidence/D3/2026-09-28-drafting-tasks/.
--
-- ── AMENDED IN PLACE 2026-10-12 (D3) ────────────────────────────────────────
-- capa_records and q_submissions join the text-program-id class. Both were
-- sitting in scripts/ci/unkeyed-request-tables-baseline.json as "unreviewed"
-- and in no spec, so each was isolated only by its reading route's join. The
-- note beside their entries records why adding them is inert for today's
-- shared-pool readers and binding for request-scoped ones, measured rather
-- than assumed. Nothing is removed from this file.
-- Evidence docs/evidence/D3/2026-10-12-unkeyed-table-classification/.
--
-- ── AMENDED IN PLACE 2026-10-13 (D3) ────────────────────────────────────────
-- capa_actions, q_sub_meetings, q_sub_questions and q_sub_timeline_entries
-- join the CHAINED list — and they are here because yesterday's amendment put
-- them there. Adding capa_records and q_submissions to `specs` above made
-- those two tenant-keyed PARENTS, which is what the change was for; it also
-- gave each of them children that are now "tenant-keyed table(s) [carrying] no
-- RLS policy". install-fresh's own verifier caught it and failed the whole
-- provision:
--
--   ❌ Install failed: 4 tenant-keyed table(s) carry no RLS policy — rows are
--      readable across tenants once anything reads them:
--      public.capa_actions (child of public.capa_records, row security off),
--      public.q_sub_meetings, public.q_sub_questions,
--      public.q_sub_timeline_entries (children of public.q_submissions)
--
-- That is the check doing its job, and the lesson is that policying a table
-- MOVES the frontier rather than closing it. Fixing only those four proved it
-- twice over: the next provision failed again, on
--
--   public.q_sub_commitments (child of public.q_sub_questions, row security off)
--
-- a table that was not a child of a tenant-keyed parent until the line above
-- made q_sub_questions one. So the whole descendant tree was then walked at
-- once, transitively through pg_constraint rather than one failure at a time:
--
--   depth 1  capa_actions            → capa_records     (capa_id)
--   depth 1  q_sub_meetings          → q_submissions    (q_submission_id)
--   depth 1  q_sub_questions         → q_submissions    (q_submission_id)
--   depth 1  q_sub_timeline_entries  → q_submissions    (q_submission_id)
--   depth 2  q_sub_commitments       → q_sub_questions  (q_sub_question_id)
--
-- and nothing lies below depth 2. All five are grandchildren or deeper: their
-- parents carry no organization_id of their own and are themselves scoped
-- through regulatory_programs, so they go in `chained`, which delegates to the
-- parent's own policy instead of naming a tenant column. Keys are uuid → uuid
-- throughout, so no text comparison is involved. Order is load-bearing within
-- the list as well as between the two loops: `specs` runs before `chained`, and
-- q_sub_commitments follows q_sub_questions. Nothing is removed from this file.
-- Evidence docs/evidence/D3/2026-10-13-capa-qsub-grandchildren/.

-- ── AMENDED IN PLACE 2026-10-13, again (D3): the FORCE the deny-all chains
-- never had ──────────────────────────────────────────────────────────────────
-- A separate session reached the five above independently and landed them
-- first; this half is what checking the file's OTHER 2026-10-13 claim turned
-- up, and it stands on its own.
--
-- The header exempts three chains it cannot express — csr_endpoint_results,
-- ctd_module_sections, ctd_documents — as "deny-all, which is safe". That
-- rests on migrations/0005_csr_knowledge_database.sql's ENABLE ROW LEVEL
-- SECURITY loop, which does name all three. The loop runs ENABLE and never
-- FORCE, so on a database provisioned from blank they measure
--
--   relrowsecurity = t, relforcerowsecurity = f, 0 policies
--
-- For the runtime role (NOSUPERUSER, NOBYPASSRLS) that is genuine deny-all, so
-- the exemption holds where production reads. For the table OWNER it is not:
-- PostgreSQL exempts an owner from its own policies unless FORCE is set, and
-- with no policy and no FORCE the owner read every tenant's rows. That is the
-- same owner exemption install-fresh's step 7/8 warns about in general terms,
-- and the reason every other table in this file gets ENABLE **and** FORCE and
-- the test asserts both. The last block in this file applies the same pair to
-- these three, so the deny-all is true under every role rather than all but
-- one.
--
-- It applies the ENABLE too, not only the FORCE, for a reason about appliers:
-- 0005 is on install-fresh's own RLS_MIGRATIONS list but is NOT in
-- C2C_MIGRATION_FILES. So the ENABLE reaches a database provisioned from blank
-- and nothing replays it for one that only ever runs deploy-migrate. Putting
-- both in THIS file — which the deploy set carries — makes the state the
-- header claims true on either path, from one place.
--
-- tests/db/child-table-parent-scoped-rls asserted the exemption as
-- `policied === false`, which is equally true of real deny-all, of deny-all the
-- owner walks through, and of a table with row security off altogether — so it
-- passed in the state it existed to prevent. It now asserts row security ON
-- and FORCEd and unpolicied, the only combination that denies to everyone. Run
-- against a database provisioned before this amendment it fails, naming the
-- table.
--
-- The three chains stay deny-all; reversing that is the repo's call, not a
-- session's. Nothing is removed from this file. Evidence
-- docs/evidence/D3/2026-10-13-child-rls-force-and-q-sub-children/.
--
-- Idempotent: guarded on pg_policies and pg_class, safe to re-run every deploy.

BEGIN;

DO $$
DECLARE
  rec RECORD;
  -- child, fk column, parent, parent key column, parent tenant column.
  -- Derived from pg_constraint against the provisioned schema, not hand-typed.
  specs TEXT[][] := ARRAY[
    ['ai_generation_runs',         'thread_id',        'ai_threads',           'id',       'organization_id'],
    ['ai_messages',                'thread_id',        'ai_threads',           'id',       'organization_id'],
    ['ai_retrieval_chunks',        'retrieval_run_id', 'ai_retrieval_runs',    'id',       'organization_id'],
    ['approval_checkpoints',       'workflow_run_id',  'workflow_runs',        'id',       'organization_id'],
    ['audit_trail',                'leaf_id',          'leaves',               'leaf_id',  'organization_id'],
    ['c2c_correspondence_issues',  'correspondence_id','c2c_correspondence',   'id',       'organization_id'],
    ['c2c_document_sections',      'document_id',      'c2c_documents',        'id',       'org_id'],
    ['cer_exports',                'report_id',        'cer_reports',          'report_id','organization_id'],
    ['chat_messages',              'thread_id',        'chat_threads',         'id',       'organization_id'],
    ['cmc_document_versions',      'document_id',      'cmc_documents',        'id',       'organization_id'],
    ['coauthor_document_versions', 'document_id',      'coauthor_documents',   'id',       'organization_id'],
    ['csr_details',                'report_id',        'csr_reports',          'id',       'organization_id'],
    ['document_versions',          'document_id',      'documents',            'id',       'organization_id'],
    ['embedding_audit_log',        'atom_id',          'lumen_data_atoms',     'id',       'organization_id'],
    ['fda_510k_stage_progress',    'project_id',       'fda_510k_projects',    'id',       'organization_id'],
    ['lumen_atom_citations',       'atom_id',          'lumen_data_atoms',     'id',       'organization_id'],
    ['lumen_atom_conflicts',       'atom_a_id',        'lumen_data_atoms',     'id',       'organization_id'],
    ['lumen_atom_quality_scores',  'atom_id',          'lumen_data_atoms',     'id',       'organization_id'],
    ['lumen_atom_versions',        'atom_id',          'lumen_data_atoms',     'id',       'organization_id'],
    ['program_milestones',         'program_id',       'regulatory_programs',  'id',       'organization_id'],
    ['rag_chunks',                 'document_id',      'rag_documents',        'id',       'organization_id'],

    -- ── The CSR/CTD knowledge families ──────────────────────────────────────
    -- A DIFFERENT defect from the 21 above, fixed by the same predicate.
    -- migrations/0005_csr_knowledge_database.sql ran ENABLE ROW LEVEL SECURITY
    -- on these and never created a policy. RLS enabled with NO policy denies
    -- every row to every non-owner role, so for the runtime app_service role
    -- these tables are inert: SELECT returns nothing whatever the table holds,
    -- and INSERT is refused outright —
    --
    --   ERROR: new row violates row-level security policy for table "ctd_documents"
    --
    -- verified against the provisioned database as app_service. That is
    -- fail-closed, so it is not a leak; it is a subsystem that cannot work.
    -- Three of them ARE reached from server code today, through Drizzle rather
    -- than raw SQL (csr_endpoints from endpoint-recommender-service.ts,
    -- csr_sections from m2-summary-builders.ts and
    -- load-csr-inputs-for-project.ts, ctd_nonclinical_studies from the two
    -- preclinical services) — so those three read empty in production under
    -- RLS_ENFORCE=on and report nothing wrong.
    --
    -- Every one of these keys on a NOT NULL FK to csr_studies / ctd_programs,
    -- both organization_id-keyed, so the same parent-scoped policy both
    -- isolates them and makes them usable again.
    ['csr_adverse_events',         'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_biomarkers',             'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_dose_response',          'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_eligibility_criteria',   'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_endpoints',              'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_pharmacokinetics',       'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_populations',            'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_references',             'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_safety_summaries',       'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_sections',               'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_statistical_analyses',   'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_tables_and_figures',     'study_id',         'csr_studies',          'id',       'organization_id'],
    ['csr_treatment_arms',         'study_id',         'csr_studies',          'id',       'organization_id'],
    ['ctd_nonclinical_studies',    'program_id',       'ctd_programs',         'id',       'organization_id'],
    ['ctd_quality_data',           'program_id',       'ctd_programs',         'id',       'organization_id'],
    ['ctd_submissions',            'program_id',       'ctd_programs',         'id',       'organization_id'],

    -- These two key on a NULLABLE FK. A NULL makes the EXISTS false, so an
    -- unparented row is visible to NOBODY — the same fail-closed choice made
    -- for unattributed knowledge-graph rows, and stated here rather than
    -- discovered later. Both tables are empty on a provisioned database and
    -- unreferenced by server code, so nothing is being hidden today.
    ['csr_knowledge_edges',        'source_study_id',  'csr_studies',          'id',       'organization_id'],
    ['ctd_cross_references',       'target_study_id',  'csr_studies',          'id',       'organization_id'],

    -- ── 2026-09-24 (ledger L201): see the amendment note in the header ──────
    -- Post-market records: a text program_id against a uuid program key.
    ['complaints',                 'program_id',       'regulatory_programs',  'id',       'organization_id'],
    ['mdr_events',                 'program_id',       'regulatory_programs',  'id',       'organization_id'],
    ['vigilance_events',           'program_id',       'regulatory_programs',  'id',       'organization_id'],
    -- 2026-09-28 (D3): generated drafts, same shape — see the header note.
    -- A task naming no program is visible to no tenant scope (fail closed).
    ['drafting_tasks',             'project_id',       'regulatory_programs',  'id',       'organization_id'],

    -- 2026-10-12 (D3): the last two members of the text-program-id class,
    -- found while clearing ci:unkeyed-request-tables:unreviewed to zero. Both
    -- sat in that baseline unclassified; neither was in this spec, so their
    -- isolation was the reading route's join and nothing else.
    --
    -- capa_records' one reader is already correct and was already repaired
    -- once: routes/mdx-postmarket.ts joins regulatory_programs INNER and
    -- filters on p.organization_id, after a LEFT JOIN with
    -- `OR p.organization_id IS NULL` had returned every orphaned CAPA to every
    -- tenant. q_submissions is read from more places (q-sub.service, the AnA
    -- tools, tenant-export, pdev, the mdx handlers), each joining the
    -- programme itself.
    --
    -- Adding them here is defence in depth, and measured to be safe rather
    -- than assumed: those readers import the SHARED pool (server/db/runtime.ts
    -- sets no session scope — applySessionScope is called only from
    -- middleware/establishRequestTenantScope.ts and db/withTenantConnection.ts),
    -- so `app.rls_enforce` is unset on their connections and this policy's
    -- first arm admits every row — inert, not breaking. On a request-scoped
    -- connection it binds, and a scoped connection with no organisation admits
    -- NOTHING (verified on a deploy-shaped database: unset -> first arm true;
    -- rls_enforce=on with no org -> org predicate NULL).
    ['capa_records',               'program_id',       'regulatory_programs',  'id',       'organization_id'],
    ['q_submissions',              'program_id',       'regulatory_programs',  'id',       'organization_id'],

    -- Children with a foreign key into a tenant-keyed parent that had row
    -- security OFF: the output of scripts/db/rls-coverage-check.sql's child rule
    -- on a provisioned database, with the owning key chosen where there are two
    -- (a milestone link by its milestone, a comment by its document, a plan
    -- document by its plan, a collection link by its collection, a group
    -- membership by its group). Every live reader runs inside a tenant scope,
    -- and the workflow, lineage and PDEV writers were reaching other tenants'
    -- parents by id, which WITH CHECK now refuses. Four nullable owner keys
    -- (context_members, project_predictions, risk_detections,
    -- validation_findings) make an unparented row visible to nobody, as above;
    -- none of those tables has a runtime reader.
    ['activity_reactions',            'activity_id',       'activity_feed',               'activity_id', 'organization_id'],
    ['agency_validation_results',     'session_id',        'multi_agency_validation_sessions', 'session_id', 'organization_id'],
    ['ai_ml_modifications',           'plan_id',           'ai_ml_pccp_plans',            'id',       'organization_id'],
    ['c2c_ana_conversation_turns',    'conversation_id',   'c2c_ana_conversations',       'id',       'org_id'],
    ['c2c_milestone_sections',        'milestone_db_id',   'c2c_milestones',              'id',       'org_id'],
    ['c2c_secure_attachments',        'correspondence_id', 'c2c_correspondence',          'id',       'organization_id'],
    ['cer_clinical_evidence',         'cer_report_id',     'cer_reports',                 'id',       'organization_id'],
    ['cer_compliance_checks',         'report_id',         'cer_reports',                 'report_id', 'organization_id'],
    ['cer_essential_requirements',    'cer_report_id',     'cer_reports',                 'id',       'organization_id'],
    ['cer_faers_data',                'report_id',         'cer_reports',                 'report_id', 'organization_id'],
    ['cer_literature',                'report_id',         'cer_reports',                 'report_id', 'organization_id'],
    ['cer_sections',                  'report_id',         'cer_reports',                 'report_id', 'organization_id'],
    ['cer_version_history',           'cer_report_id',     'cer_reports',                 'id',       'organization_id'],
    ['cer_workflows',                 'report_id',         'cer_reports',                 'report_id', 'organization_id'],
    ['charter_sections',              'charter_id',        'project_charters',            'id',       'organization_id'],
    ['cognitive_hitl_breakpoints',    'thread_id',         'cognitive_agent_threads',     'id',       'tenant_id'],
    ['cognitive_reasoning_traces',    'thread_id',         'cognitive_agent_threads',     'id',       'tenant_id'],
    ['cognitive_thread_messages',     'thread_id',         'cognitive_agent_threads',     'id',       'tenant_id'],
    ['cognitive_workflow_checkpoints', 'thread_id',         'cognitive_agent_threads',     'id',       'tenant_id'],
    ['context_members',               'context_group_id',  'context_groups',              'id',       'organization_id'],
    ['dlt_events',                    'study_id',          'dose_escalation_studies',     'id',       'organization_id'],
    ['document_attachments',          'document_id',       'unified_documents',           'id',       'organization_id'],
    ['document_audit_logs',           'document_id',       'unified_documents',           'id',       'organization_id'],
    ['document_comments',             'document_id',       'documents',                   'id',       'organization_id'],
    ['document_locks',                'document_id',       'documents',                   'id',       'organization_id'],
    ['doe_analysis_results',          'study_id',          'doe_studies',                 'id',       'organization_id'],
    ['doe_experiments',               'study_id',          'doe_studies',                 'id',       'organization_id'],
    ['doe_factors',                   'study_id',          'doe_studies',                 'id',       'organization_id'],
    ['doe_responses',                 'study_id',          'doe_studies',                 'id',       'organization_id'],
    ['dose_cohorts',                  'study_id',          'dose_escalation_studies',     'id',       'organization_id'],
    ['dose_levels',                   'study_id',          'dose_escalation_studies',     'id',       'organization_id'],
    ['ind_narrative_sections',        'narrative_id',      'ind_narratives',              'id',       'organization_id'],
    ['ind_package_plan_documents',    'plan_id',           'ind_package_plans',           'id',       'organization_id'],
    ['ind_package_plan_modalities',   'plan_id',           'ind_package_plans',           'id',       'organization_id'],
    ['ind_package_plan_regions',      'plan_id',           'ind_package_plans',           'id',       'organization_id'],
    ['ind_package_plan_requirements', 'plan_id',           'ind_package_plans',           'id',       'organization_id'],
    ['ind_package_plan_timelines',    'plan_id',           'ind_package_plans',           'id',       'organization_id'],
    ['leaf_citations',                'leaf_id',           'leaves',                      'leaf_id',  'organization_id'],
    ['leaf_patches',                  'leaf_id',           'leaves',                      'leaf_id',  'organization_id'],
    ['lumen_collection_atoms',        'collection_id',     'lumen_atom_collections',      'id',       'organization_id'],
    ['obligation_updates',            'obligation_id',     'regulatory_obligations',      'id',       'organization_id'],
    ['pdev_program_activities',       'program_id',        'regulatory_programs',         'id',       'organization_id'],
    ['pdev_readiness_snapshots',      'program_id',        'regulatory_programs',         'id',       'organization_id'],
    ['pkpd_compartments',             'analysis_id',       'cross_species_pkpd',          'id',       'organization_id'],
    ['project_predictions',           'project_id',        'projects',                    'id',       'organization_id'],
    ['report_details',                'report_id',         'reports',                     'id',       'organization_id'],
    ['report_program_group_projects', 'program_group_id',  'report_program_groups',       'id',       'organization_id'],
    ['resolution_bundle_items',       'bundle_id',         'resolution_bundles',          'id',       'organization_id'],
    ['risk_detections',               'project_id',        'projects',                    'id',       'organization_id'],
    ['section_patches',               'section_id',        'sections',                    'section_id', 'organization_id'],
    ['sharepoint_comments',           'file_id',           'sharepoint_files',            'id',       'organization_id'],
    ['sharepoint_file_versions',      'file_id',           'sharepoint_files',            'id',       'organization_id'],
    ['sharepoint_locks',              'file_id',           'sharepoint_files',            'id',       'organization_id'],
    ['sharepoint_shares',             'file_id',           'sharepoint_files',            'id',       'organization_id'],
    ['simple_document_versions',      'document_id',       'simple_documents',            'id',       'organization_id'],
    ['species_comparisons',           'analysis_id',       'cross_species_pkpd',          'id',       'organization_id'],
    ['timeline_phases',               'charter_id',        'project_charters',            'id',       'organization_id'],
    ['validation_findings',           'leaf_id',           'leaves',                      'leaf_id',  'organization_id'],
    ['validation_harmonization_opportunities', 'session_id',        'multi_agency_validation_sessions', 'session_id', 'organization_id'],
    ['validation_issues',             'session_id',        'multi_agency_validation_sessions', 'session_id', 'organization_id'],
    ['workflow_approvals',            'workflow_id',       'document_workflows',          'id',       'organization_id'],
    ['workflow_history',              'workflow_id',       'document_workflows',          'id',       'organization_id'],
    ['workflow_steps',                'template_id',       'workflow_templates',          'id',       'organization_id']
  ];
  i INT;
  child TEXT; fk_col TEXT; parent TEXT; parent_col TEXT; parent_tenant TEXT;
  predicate TEXT;
  key_cast BOOLEAN;
  tenant_cast BOOLEAN;
  applied INT := 0;
  skipped INT := 0;
BEGIN
  FOR i IN 1 .. array_length(specs, 1) LOOP
    child         := specs[i][1];
    fk_col        := specs[i][2];
    parent        := specs[i][3];
    parent_col    := specs[i][4];
    parent_tenant := specs[i][5];

    -- Every reference is verified against the LIVE catalog before use. A
    -- deployment that never created one of these tables (or renamed a column)
    -- must be skipped with a notice, not abort the deploy.
    IF to_regclass('public.' || child) IS NULL OR to_regclass('public.' || parent) IS NULL THEN
      RAISE NOTICE '[child-rls] % or % absent — skipping', child, parent;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=child AND column_name=fk_col)
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=parent AND column_name=parent_col)
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=parent AND column_name=parent_tenant) THEN
      RAISE NOTICE '[child-rls] % column shape differs from expectation — skipping', child;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- AMENDED IN PLACE 2026-09-07 (CLAUDE.md Rule 1): the predicate below
    -- compares the child's FK to the parent's key and the parent's tenant
    -- column to an INT. Where a deployment's catalog carries a different type
    -- (a uuid parent key against an integer FK, or a uuid tenant column),
    -- CREATE POLICY fails with "operator does not exist: uuid = integer" and
    -- the whole set halts at this file on every deploy.
    --
    -- AMENDED AGAIN 2026-09-08: the first amendment SKIPPED such a pair, and a
    -- skip here happens BEFORE the ENABLE/FORCE below — so the table was left
    -- with row-level security off and no policy at all. These forty tables were
    -- chosen precisely because they carry no tenant column of their own, so
    -- neither the tenant-isolation sweep (which matches organization_id/org_id/
    -- tenant_id) nor the uuid list recovers them: a skip meant fully
    -- cross-tenant readable, which is the opposite of what this file is for.
    -- Unblocking a deploy is not worth opening a table.
    --
    -- So a type mismatch no longer skips: it compares the keys AS TEXT. A
    -- foreign key and the key it references denote the same value whatever the
    -- catalog says their types are, so ::text is the same join, and a pair that
    -- turns out not to be a real parent/child matches nothing — which denies,
    -- rather than exposes. The native comparison is kept wherever the types
    -- already agree, so only the odd pair pays for the cast.
    key_cast := (SELECT data_type FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=child AND column_name=fk_col)
                IS DISTINCT FROM
                (SELECT data_type FROM information_schema.columns
                  WHERE table_schema='public' AND table_name=parent AND column_name=parent_col);
    tenant_cast := (SELECT data_type FROM information_schema.columns
                     WHERE table_schema='public' AND table_name=parent AND column_name=parent_tenant)
                   NOT IN ('integer', 'bigint', 'smallint');
    IF key_cast OR tenant_cast THEN
      RAISE WARNING '[child-rls] % → %: key or tenant column type does not fit the integer-tenant predicate — policied by text comparison instead (key_cast=%, tenant_cast=%)',
        child, parent, key_cast, tenant_cast;
    END IF;

    -- ENABLE alone leaves the table OWNER unfiltered; FORCE is what subjects it.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', child);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', child);

    IF EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname='public' AND tablename=child
                  AND policyname='tenant_isolation_policy') THEN
      -- Never clobber a subsystem's own policy — the sweep makes the same
      -- promise, and two migrations racing to redefine one table's visibility
      -- is how a policy silently loosens.
      RAISE NOTICE '[child-rls] % already policied — leaving it alone', child;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- The sweep's predicate with the tenant comparison redirected at the parent.
    predicate := format(
      $p$EXISTS (
           SELECT 1 FROM public.%I p
            WHERE p.%I%s = public.%I.%I%s
              AND ( p.%I%s = %s
                 OR p.%I%s = %s )
         )$p$,
      parent,
      parent_col, CASE WHEN key_cast THEN '::text' ELSE '' END,
      child, fk_col, CASE WHEN key_cast THEN '::text' ELSE '' END,
      parent_tenant, CASE WHEN tenant_cast THEN '::text' ELSE '' END,
      CASE WHEN tenant_cast
           THEN $t$NULLIF(current_setting('app.current_tenant_id', TRUE), '')$t$
           ELSE $t$NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT$t$ END,
      parent_tenant, CASE WHEN tenant_cast THEN '::text' ELSE '' END,
      CASE WHEN tenant_cast
           THEN $t$substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')$t$
           ELSE $t$substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT$t$ END);

    EXECUTE format($pol$
      CREATE POLICY tenant_isolation_policy ON public.%I
        FOR ALL
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR %s
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR %s
        )
    $pol$, child, predicate, predicate);

    applied := applied + 1;
    RAISE NOTICE '[child-rls] % scoped to %(%)', child, parent, parent_tenant;
  END LOOP;

  RAISE NOTICE '[child-rls] % policied, % skipped', applied, skipped;
END
$$;

-- ── Chained children (AMENDED IN PLACE 2026-09-24, ledger L202) ──────────────
-- A grandchild's parent is itself a child with no tenant column, so the
-- single-level predicate above has no tenant column to compare. Here the child
-- delegates to its PARENT'S OWN tenant_isolation_policy instead: a policy's
-- subquery runs under the invoker's row security, so "the parent row is
-- visible" means "the parent row is this tenant's". That was shown on a real
-- database as the runtime role before being written here. Counted from the
-- child alone, a tenant saw one of two tenants' section versions. The
-- SECURITY INVOKER section trigger's own snapshot insert still passed
-- WITH CHECK.
--
-- A parent that carries no tenant_isolation_policy of its own is skipped BEFORE
-- row security is enabled on the child. The child then stays visibly
-- unprotected, and scripts/db/rls-coverage-check.sql's child rule fails CI on
-- it, rather than being "scoped" to a parent that scopes nothing.
--
-- The three deny-all csr_/ctd_ chains recorded in the header could now be
-- expressed the same way. They are left deny-all deliberately: no server code
-- reads them, and the test pins that choice.
--
-- AMENDED IN PLACE 2026-10-13 (D3). That choice stands — reversing it is the
-- repo's call, not a session's — but it was only half enforced. The ENABLE it
-- relies on comes from migrations/0005_csr_knowledge_database.sql, which sets
-- ENABLE without FORCE and is not in C2C_MIGRATION_FILES. So the deny-all
-- excluded the table owner, and reached only a database provisioned from
-- blank. The last block in this file applies ENABLE and FORCE to the three
-- from inside the deploy set. See the header note.
--
-- NON-PUBLIC CHILDREN (AMENDED IN PLACE 2026-09-24, ledger L203). The same
-- delegation works for a child outside public whose parent carries its own
-- tenant_isolation_policy. So this list takes schema-qualified names; a bare
-- name means public. Order matters where a child's parent is itself on this
-- list: the parent's line comes first. A survey of every reader of the fourteen found none that
-- runs without a tenant context. Thirteen are unused at runtime, or reached
-- only by dead code. One, regulatory_harmonization.export_job_audit_log, is
-- written on the request path, and it was filing audit rows against other
-- tenants' export jobs (see grdheService). Where a child names two parents,
-- the owning key is chosen as above. Three owners are nullable
-- (ai.risk_assessments, audit.idempotency_keys, audit.purge_requests), so an
-- unparented row is visible to nobody.
DO $$
DECLARE
  -- child, fk column, parent, parent key column. Key types agree for every
  -- pair (checked against the catalog), so no cast is needed.
  chained TEXT[][] := ARRAY[
    -- 2026-10-14 audit remediation: the canonical Shadow packet/export/job
    -- store lives in predicate, not public. Both packet and export carry the
    -- actual programme UUID; render jobs inherit the export's tenant. Keep
    -- the complete descendant chain here so a missing route predicate cannot
    -- expose another tenant's packet, export or rendering job.
    ['predicate.defense_packets',                    'program_id',   'public.regulatory_programs',             'id'],
    ['predicate.proof_pack_exports',                 'program_id',   'public.regulatory_programs',             'id'],
    ['predicate.render_jobs',                        'proof_pack_id','predicate.proof_pack_exports',           'id'],
    ['ai_claims',                     'generation_run_id',  'ai_generation_runs',     'id'],
    ['ai_claim_citations',            'retrieval_chunk_id', 'ai_retrieval_chunks',    'id'],
    ['c2c_document_section_evidence', 'section_id',         'c2c_document_sections',  'id'],
    ['c2c_document_section_versions', 'section_id',         'c2c_document_sections',  'id'],
    ['section_propagations',          'patch_id',           'section_patches',        'id'],

    -- 2026-10-13 (D3): the generation below capa_records and q_submissions,
    -- which `specs` made tenant-keyed parents the day before. Their own
    -- parents carry no organization_id, so these delegate to the parent's
    -- policy rather than naming a tenant column.
    --
    -- Readers were surveyed rather than assumed. capa_actions is read and
    -- written only by services/capa-mdr/capaMdr.service.ts, which imports the
    -- SHARED pool (server/db/runtime.ts sets no session scope), so
    -- `app.rls_enforce` is unset on its connections and this policy's first arm
    -- admits every row — inert for it, binding on a request-scoped connection:
    -- the same measurement the 2026-10-12 note records for its parent. The
    -- q_sub children are read by services/pdev/pdev-fda-interactions.ts (after
    -- it has verified the programme belongs to the caller's organisation),
    -- services/ana-ri/mdx-proactive-signals.ts (whose query already joins
    -- regulatory_programs and filters p.organization_id) and
    -- services/tenant-export/tenant-export.service.ts (parent-scoped by
    -- q_submission_id; test callers only, no production route). So nothing here
    -- loses a row it can see today.
    --
    -- Measured on a provisioned database as the runtime role, with
    -- app.rls_enforce='on', two tenants each holding one Pre-Sub question:
    -- before, tenant A's scope counted 2 — its own question and the other
    -- tenant's, with the position taken on each; after, 1; and a scoped
    -- connection carrying no organisation counts 0.
    ['capa_actions',                  'capa_id',            'capa_records',           'id'],
    ['q_sub_meetings',                'q_submission_id',    'q_submissions',          'id'],
    ['q_sub_questions',               'q_submission_id',    'q_submissions',          'id'],
    ['q_sub_timeline_entries',        'q_submission_id',    'q_submissions',          'id'],
    -- Depth 2: a commitment hangs off a question, not off the submission. It
    -- follows q_sub_questions so that policy exists when this one is reached.
    ['q_sub_commitments',             'q_sub_question_id',  'q_sub_questions',        'id'],

    -- 2026-09-24 (ledger L203): children outside public.
    ['ai.risk_assessments',                          'dossier_id',   'global_dossier.dossier_instances',        'id'],
    ['audit.config_bundles',                         'program_id',   'core.programs',                           'id'],
    ['audit.dataset_snapshots',                      'program_id',   'core.programs',                           'id'],
    ['audit.idempotency_keys',                       'program_id',   'core.programs',                           'id'],
    ['audit.purge_requests',                         'program_id',   'core.programs',                           'id'],
    -- Children of audit.purge_requests, which the line above scopes, so they
    -- follow it; listed after it so its policy exists when they are reached.
    -- No server code reads or writes either.
    ['audit.purge_approvals',                        'purge_request_id', 'audit.purge_requests',                'id'],
    ['audit.tombstones',                             'purge_request_id', 'audit.purge_requests',                'id'],
    ['core.entities',                                'program_id',   'core.programs',                           'id'],
    ['ectd.project_folders',                         'project_id',   'core.programs',                           'id'],
    ['global_dossier.content_versions',              'dossier_id',   'global_dossier.dossier_instances',        'id'],
    ['global_dossier.dossier_branches',              'dossier_id',   'global_dossier.dossier_instances',        'id'],
    ['global_dossier.dossier_sync_events',           'dossier_id',   'global_dossier.dossier_instances',        'id'],
    ['global_dossier.regulatory_comments',           'dossier_id',   'global_dossier.dossier_instances',        'id'],
    ['manufacturing.rtrt_predictions',               'twin_id',      'manufacturing.digital_twins',             'id'],
    ['precedent.csr_precedent_links',                'precedent_id', 'precedent.regulatory_precedents',         'id'],
    ['regulatory_harmonization.export_job_audit_log','job_id',       'regulatory_harmonization.export_jobs',    'id']
  ];
  i INT;
  child TEXT; fk_col TEXT; parent TEXT; parent_col TEXT;
  child_schema TEXT; parent_schema TEXT;
  predicate TEXT;
  applied INT := 0;
  skipped INT := 0;
BEGIN
  FOR i IN 1 .. array_length(chained, 1) LOOP
    -- A bare name is public; 'schema.table' names another schema.
    child_schema  := CASE WHEN position('.' IN chained[i][1]) > 0 THEN split_part(chained[i][1], '.', 1) ELSE 'public' END;
    child         := CASE WHEN position('.' IN chained[i][1]) > 0 THEN split_part(chained[i][1], '.', 2) ELSE chained[i][1] END;
    fk_col        := chained[i][2];
    parent_schema := CASE WHEN position('.' IN chained[i][3]) > 0 THEN split_part(chained[i][3], '.', 1) ELSE 'public' END;
    parent        := CASE WHEN position('.' IN chained[i][3]) > 0 THEN split_part(chained[i][3], '.', 2) ELSE chained[i][3] END;
    parent_col    := chained[i][4];

    IF to_regclass(format('%I.%I', child_schema, child)) IS NULL
       OR to_regclass(format('%I.%I', parent_schema, parent)) IS NULL THEN
      RAISE NOTICE '[child-rls] %.% or %.% absent — skipping', child_schema, child, parent_schema, parent;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname=parent_schema AND tablename=parent
                      AND policyname='tenant_isolation_policy') THEN
      RAISE WARNING '[child-rls] %.% → %.%: the parent is not scoped, so delegating to it would scope nothing — skipping', child_schema, child, parent_schema, parent;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', child_schema, child);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', child_schema, child);

    IF EXISTS (SELECT 1 FROM pg_policies
                WHERE schemaname=child_schema AND tablename=child
                  AND policyname='tenant_isolation_policy') THEN
      RAISE NOTICE '[child-rls] %.% already policied — leaving it alone', child_schema, child;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    predicate := format('EXISTS (SELECT 1 FROM %I.%I p WHERE p.%I = %I.%I.%I)',
                        parent_schema, parent, parent_col, child_schema, child, fk_col);

    EXECUTE format($pol$
      CREATE POLICY tenant_isolation_policy ON %I.%I
        FOR ALL
        USING (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR %s
        )
        WITH CHECK (
          NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
          OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          OR %s
        )
    $pol$, child_schema, child, predicate, predicate);

    applied := applied + 1;
    RAISE NOTICE '[child-rls] %.% scoped through %.% (chained)', child_schema, child, parent_schema, parent;
  END LOOP;

  RAISE NOTICE '[child-rls] chained: % policied, % skipped', applied, skipped;
END
$$;

-- ── Deny-all, enforced against every role (AMENDED IN PLACE 2026-10-13, D3) ──
-- The three chains the header leaves deliberately deny-all. Their row security
-- is set by migrations/0005_csr_knowledge_database.sql, which runs ENABLE and
-- not FORCE and is not in C2C_MIGRATION_FILES — so the deny-all exempted the
-- table owner (PostgreSQL skips an owner's own policies without FORCE, and
-- with no policy at all that owner read every tenant's rows), and it reached
-- only a database provisioned from blank. Both halves are applied here, from a
-- file the deploy set does carry.
--
-- Row security ON, FORCEd, with NO policy denies every row to every role. It
-- is only acceptable where nothing reads the table, which is asserted by name
-- rather than assumed:
--
--   csr_endpoint_results -> csr_endpoints    -> csr_studies
--   ctd_module_sections  -> ctd_submissions  -> ctd_programs
--   ctd_documents        -> ctd_module_sections -> ctd_submissions -> ctd_programs
--
-- None has a reader in server code (checked: the only references are
-- shared/schema and migrations; the check_ectd_cross_references AnA tool is a
-- pure function over its input, not a query against any of these). A table
-- LEAVES this list by gaining a real parent-scoped policy in one of the lists
-- above — never by having row security turned back off. If a reader appears it
-- will read empty under RLS_ENFORCE=on, and that is the signal to scope it
-- properly: failing closed and visibly, rather than returning another tenant's
-- rows.
DO $$
DECLARE
  deny_all TEXT[] := ARRAY['csr_endpoint_results', 'ctd_module_sections', 'ctd_documents'];
  t TEXT;
  applied INT := 0;
  skipped INT := 0;
BEGIN
  FOREACH t IN ARRAY deny_all LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '[child-rls] % absent — skipping deny-all', t;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- Never override a real policy. If a later change scopes one of these
    -- through its parent, that policy decides the table's visibility and this
    -- block becomes a no-op rather than a second opinion about it.
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t) THEN
      RAISE NOTICE '[child-rls] % is policied — leaving deny-all alone', t;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    applied := applied + 1;
    RAISE NOTICE '[child-rls] % deny-all (row security on, FORCEd, no policy)', t;
  END LOOP;

  RAISE NOTICE '[child-rls] deny-all: % enforced, % skipped', applied, skipped;
END
$$;

COMMIT;
