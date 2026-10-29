/**
 * The tables a tenant purge deletes because each names a project, a workspace,
 * a document or a program with no delete action, in the order it deletes them;
 * and the tables it does NOT erase although they name such a row (D6,
 * 2026-10-29; docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/).
 *
 * PURGE_REFERRER_TABLES is spread into PURGE_CHILD_TABLES
 * (./tenant-offboarding.ts) just before `projects`. It lives here only so that
 * file stays under the repository's size ceiling: it is part of that one list,
 * frozen and module-local in the same way, and ci:purge-coverage reads the
 * spread in place, in order. PURGE_REFERRERS_NOT_ERASED is re-exported there.
 *
 * @module server/services/tenant/purge-referrers
 */

export const PURGE_REFERRER_TABLES: readonly string[] = Object.freeze([
  /* ── Every table that names a project, a workspace, a document or a program
     with no delete action (D6, 2026-10-29) ───────────────────────────────────
     Each block below holds a key with no ON DELETE action (NO ACTION, or
     RESTRICT) into a table this list deletes after it: `projects`,
     `client_workspaces`, `documents`, `regulatory_programs`, or one of their
     cascades (account_skill_bundles, concept2cure_artifacts,
     c2c_submission_packages and c2c_package_sections cascade from projects).
     The purge rethrows anything but 42P01/42703, so one such row stopped the
     DELETE of its parent with 23503 and rolled the whole erasure back. On the
     install-fresh + deploy-migrate schema there were 105 such keys from 90
     tables; listing those brought in their own children, 149 tables in all.
     ci:purge-coverage now walks this list as a sequence over the live catalog
     and fails on any such key, and tests/db/tenant-purge-blocking-keys.dbtest.ts
     purges a tenant holding one row in every one of these tables while
     another tenant keeps all of its own
     (docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/).

     Children before their parents within each block, and every block before
     `projects`. A table with no organization_id is deleted by the predicate
     ./purge-parent-scope names for it: its parent, through the key its
     row-level-security policy uses. The tables whose rows must not go
     (signatures, audit trails, sealed reports, ledgers) are not here: they are
     PURGE_REFERRERS_NOT_ERASED, each with its reason, and a tenant holding one
     is not purged until that is decided. */
  // The legacy documents (0000), BEFORE `projects` and `client_workspaces`,
  // which each document names with no cascade; it used to come after both.
  // Their comments, locks, sessions, versions, sections and package-plan
  // entries first: each names its document with no cascade.
  'ind_package_plan_documents',
  'document_comments',
  'document_locks',
  'document_sessions',
  'document_versions',
  'document_sections',
  'documents',
  // The section graph: links, patches and their propagations, then the
  // sections, leaves and graph nodes they name, each with no cascade.
  'link_edges',
  'section_links',
  'section_propagations',
  'section_patches',
  'patches',
  'section_graph_nodes',
  'section_leaves',
  'sections',
  // Unified tasks, after the links and dependencies that name them. A task on
  // a review route refuses DELETE (unified_tasks_route_rows_guard); see
  // review_routes in PURGE_REFERRERS_NOT_ERASED.
  'cross_module_task_links',
  'task_dependencies',
  'unified_tasks',
  // A project's own working data: AnA objectives, capabilities and profiles,
  // its intelligence profile and what it ingested, modules, predictions, rules,
  // schedule, tasks and workflow stages, risk detections, sentinel findings,
  // template usage, CTD onboarding. Each names the project with no cascade.
  'ana_client_objectives',
  'ana_project_capabilities',
  'ana_relational_profiles',
  'project_ingested_documents',
  'project_memory_entries',
  'project_intelligence_profiles',
  'project_modules',
  'project_predictions',
  'project_rules',
  'project_schedule_goals',
  'project_schedule_revisions',
  'project_schedule_of_events',
  'project_tasks',
  'project_workflow_stages',
  'risk_detections',
  'sentinel_findings',
  'template_usage',
  'ctd_onboarding_projects',
  // Account intelligence: templates and terms of a project's skill bundles
  // (which cascade from projects), canon items, and the workspace's
  // intelligence profile with what it ingested and remembers.
  'account_template_registry',
  'account_term_dictionary',
  'account_canon_items',
  'account_skill_bundles',
  'client_ingested_documents',
  'client_memory_entries',
  'client_intelligence_profiles',
  // Agency correspondence and the submissions it answers (c2c_*), and the
  // project communication channels with their messages.
  'c2c_communication_timeline_events',
  'c2c_correspondence_issues',
  'c2c_secure_attachments',
  'c2c_response_packages',
  'c2c_correspondence',
  'c2c_submissions',
  'communication_messages',
  'fda_communications',
  'communication_channels',
  // CER v1: each report's evidence, checks, requirements, exports, FAERS data,
  // literature, sections, versions and workflows, then the reports; then the
  // CER project's documents, permissions, activities and milestones, then the
  // project, which names its workspace with no cascade. cer_approvals is held
  // (PURGE_REFERRERS_NOT_ERASED).
  'cer_clinical_evidence',
  'cer_compliance_checks',
  'cer_essential_requirements',
  'cer_exports',
  'cer_faers_data',
  'cer_literature',
  'cer_sections',
  'cer_version_history',
  'cer_workflows',
  'cer_reports',
  'cer_documents',
  'client_user_permissions',
  'project_activities',
  'project_documents',
  'project_milestones',
  'cer_projects',
  // The CSR knowledge base (0005): report details, the cross-study edges and
  // CTD cross-references, then the studies (their sections cascade) and the
  // CTD programs (their submissions, sections and documents cascade).
  'csr_details',
  'csr_reports',
  'csr_knowledge_edges',
  'csr_regulatory_intelligence',
  'csr_training_data',
  'ctd_cross_references',
  'csr_studies',
  'ctd_programs',
  // 510(k) v1: a project's documents, stage progress and packages, then the project.
  'fda_510k_documents',
  'fda_510k_stage_progress',
  'fda_510k_submission_packages',
  'fda_510k_projects',
  // Grants: an award's budget, closeout, cost share, expenditures, invoices,
  // milestones, no-cost extensions, subawards and effort, then the award and
  // the proposal it came from.
  'grant_budget_lines',
  'grant_closeout_records',
  'grant_cost_share_contributions',
  'grant_expenditures',
  'grant_invoices',
  'grant_milestones',
  'grant_nce_records',
  'grant_subawards',
  'effort_lines',
  'grant_awards',
  'grant_proposals',
  // IND v1: a package plan's modalities, regions, requirements and timelines,
  // then the plan; a project's submissions, then the project.
  'ind_package_plan_modalities',
  'ind_package_plan_regions',
  'ind_package_plan_requirements',
  'ind_package_plan_timelines',
  'ind_package_plans',
  'ind_submissions',
  'ind_projects',
  // Regulatory submissions and obligations (legacy): correspondence messages
  // and attachments, the correspondence, communications, the compliance
  // calendar, an obligation's updates and the obligation, then a submission's
  // calendar, commitments, tasks and gates, then the submission. reg_questions
  // and gate_approvals are held (PURGE_REFERRERS_NOT_ERASED).
  'reg_messages',
  'reg_attachments',
  'agency_correspondence',
  'agency_communications',
  'compliance_calendar',
  'obligation_updates',
  'regulatory_obligations',
  'regulatory_calendar',
  'post_approval_commitments',
  'regulatory_tasks',
  'stage_gates',
  'regulatory_submissions',
  // Quality management plans: traceability, critical-to-quality factors and
  // section gating, then the plan.
  'qmp_traceability_matrix',
  'ctq_factors',
  'qmp_section_gating',
  'quality_management_plans',
  // Reports, after their details; strategic reports.
  'report_details',
  'reports',
  'strategic_reports',
  // Supply chain: certificates, batches and materials; temperature readings,
  // shipments and suppliers.
  'supply_chain_coas',
  'supply_chain_batches',
  'supply_chain_materials',
  'supply_chain_temperature_readings',
  'supply_chain_shipments',
  'supply_chain_suppliers',
  // Submission twin: challenges, assessments, change impacts and evidence
  // links before the claims they name, and drift alerts. Each names a package
  // or an artifact, which cascade from projects.
  'submission_twin_challenges',
  'submission_twin_assessments',
  'submission_twin_change_impacts',
  'submission_twin_evidence_links',
  'submission_twin_claims',
  'submission_twin_drift_alerts',
  // A workspace's access, security and settings, staff, sync and workflow
  // progress, and protocols.
  'client_access',
  'client_security_settings',
  'client_workspace_settings',
  'staff_assignments',
  'sync_status',
  'workflow_progress',
  'protocols',
  /* The device and IVD records, BEFORE regulatory_programs. Where the creating
     file's CREATE ran before drizzle push, udi_records and
     software_lifecycle_items (20260507), the five IVD tables and cdx_pairings
     (20260508) name their program with NO ACTION; on an install-fresh database
     drizzle made them first and the key is absent
     (tenant-purge-raw-program-keys.pglite.test.ts). The IVDR module's
     validations, clinical evidence and CDx workflows
     (migrations/001_create_ivdr_tables.sql) name their classification with NO
     ACTION on every lineage, so they go before it; their Part 11 change
     histories are held (PURGE_REFERRERS_NOT_ERASED). labeling_documents names
     its program by labeling_documents_program_same_org_fk, NO ACTION; its
     translations and symbols cascade. */
  'udi_records',
  'software_lifecycle_items',
  'labeling_documents',
  'ivd_analytical_performance',
  'ivd_clinical_performance',
  'ivd_clia_categorization',
  'ivdr_per_documents',
  'cdx_pairings',
  'ivdr_clinical_evidence',
  'ivdr_analytical_validations',
  'ivdr_cdx_workflows',
  'ivdr_classifications',
  // The canonical documents (c2c_documents, phase 9), BEFORE
  // regulatory_programs: c2c_documents_project_id_fkey and
  // c2c_documents_project_same_org_fk name the program with no delete action.
  // Keyed by org_id, so ./purge-parent-scope names its predicate; its
  // sections, their versions and their evidence cascade.
  'c2c_documents',
]);

/** Tables the purge does not erase although a row of theirs can name a row it
 * deletes, each with why (D6, 2026-10-29;
 * docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/). They are
 * signatures, audit trails, sealed reports and ledgers, whose retention after a
 * tenant's erasure is the founder's decision and not yet made. Until it is, a
 * tenant holding one such row is NOT purged: the purge stops at the table each
 * reason names and rolls back, as it did before; nothing here detaches them.
 * review_routes names nothing the purge deletes; it is here because nothing
 * reaches it and its rows are a signed workflow. ci:purge-coverage reads this
 * literal: each table is reported with its key instead of failing the gate, and
 * is not counted as residue. Keep it JSON-shaped.
 */
export const PURGE_REFERRERS_NOT_ERASED: Readonly<Record<string, string>> = Object.freeze({
  "account_canon_resolution_log": "Log of AnA's canon resolutions. Blocks: project_id → projects (NO ACTION). A tenant holding one is not purged: 23503 at projects, rolled back. Retention awaits the founder's decision.",
  "account_events": "Append-only account event ledger (20260318_ga_immutability_hardening.sql). Blocks: project_id → projects, canon_item_id → account_canon_items, skill_bundle_id → account_skill_bundles (NO ACTION). A tenant holding one is not purged: 23503 at account_canon_items, rolled back. Retention awaits the founder's decision.",
  "ana_outcome_log": "Log of AnA outcomes. Blocks: project_id → projects (NO ACTION). A tenant holding one is not purged: 23503 at projects, rolled back. Retention awaits the founder's decision.",
  "bundle_execution_receipts": "Receipts of skill-bundle executions. Blocks: project_id → projects (NO ACTION). A tenant holding one is not purged: 23503 at projects, rolled back. Retention awaits the founder's decision.",
  "cer_approvals": "CER v1 approval records (who approved what, when). Blocks: project_id → cer_projects, document_id → project_documents (NO ACTION). A tenant holding one is not purged: 23503 at project_documents, rolled back. Retention awaits the founder's decision.",
  "data_lineage_records": "Data lineage records, update-refused (trg_prevent_lineage_update). Blocks: project_id → projects (NO ACTION). A tenant holding one is not purged: 23503 at projects, rolled back. Retention awaits the founder's decision.",
  "document_audit_trail": "The legacy documents' audit trail (a registered domain history, server/services/audit/domain-history-link.ts). Blocks: document_id → documents, version_id → document_versions (NO ACTION). A tenant holding one is not purged: 23503 at document_versions, rolled back. Retention awaits the founder's decision.",
  "electronic_signatures": "Part 11 electronic signatures (trg_electronic_signatures_immutable). Blocks: document_id → documents, version_id → document_versions (NO ACTION). A tenant holding one is not purged: 23503 at document_versions, rolled back. Retention awaits the founder's decision.",
  "evidence_chain_records": "Evidence chain records, update-refused (trg_prevent_evidence_chain_update). Blocks: project_id → projects (NO ACTION). A tenant holding one is not purged: 23503 at projects, rolled back. Retention awaits the founder's decision.",
  "gate_approvals": "Stage-gate approvals carrying a signature hash and meaning. Blocks: gate_id → stage_gates, submission_id → regulatory_submissions (NO ACTION). A tenant holding one is not purged: 23503 at stage_gates, rolled back. Retention awaits the founder's decision.",
  "governance_boundary_transitions": "Governance boundary transitions of artifacts. Blocks: project_id → projects, artifact_id → concept2cure_artifacts (NO ACTION). A tenant holding one is not purged: 23503 at projects, rolled back. Retention awaits the founder's decision.",
  "immutable_report_records": "Sealed report records. Blocks: project_id → projects, client_workspace_id → client_workspaces (NO ACTION). A tenant holding one is not purged: 23503 at projects, rolled back. Retention awaits the founder's decision.",
  "ivdr_cdx_status_history": "Part 11 change history of an IVDR CDx workflow (a registered domain history). Blocks: workflow_id → ivdr_cdx_workflows (NO ACTION). A tenant holding one is not purged: 23503 at ivdr_cdx_workflows, rolled back. Retention awaits the founder's decision.",
  "ivdr_evidence_result_history": "Part 11 change history of IVDR clinical evidence (a registered domain history). Blocks: evidence_id → ivdr_clinical_evidence (NO ACTION). A tenant holding one is not purged: 23503 at ivdr_clinical_evidence, rolled back. Retention awaits the founder's decision.",
  "ivdr_validation_parameter_history": "Part 11 change history of an IVDR analytical validation (a registered domain history). Blocks: validation_id → ivdr_analytical_validations (NO ACTION). A tenant holding one is not purged: 23503 at ivdr_analytical_validations, rolled back. Retention awaits the founder's decision.",
  "reg_questions": "Legacy agency questions, read-only since 2026-10-19 (reg_questions_read_only refuses INSERT, UPDATE, DELETE and TRUNCATE from every role, migrations/20261019b_reg_questions_read_only.sql). Blocks: correspondence_id → agency_correspondence, attachment_id → reg_attachments (NO ACTION). A tenant holding one is not purged: 23503 at reg_attachments, rolled back. Whether they are a retained regulatory record awaits the founder's decision; the migration follows from it.",
  "review_routes": "A signed review workflow (20261023_review_routes.sql); retention undecided. Nothing the purge deletes is named by it, and nothing reaches it, so it is residue by name. Its tasks are unified_tasks rows that refuse DELETE (unified_tasks_route_rows_guard): a tenant holding one is not purged, stopped at unified_tasks (ROUTE_TASK_OWNED_BY_ROUTE) and rolled back.",
  "rule_execution_log": "Log of rule executions. Blocks: project_id → projects (NO ACTION). A tenant holding one is not purged: 23503 at projects, rolled back. Retention awaits the founder's decision.",
});
