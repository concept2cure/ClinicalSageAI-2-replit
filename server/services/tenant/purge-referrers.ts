/**
 * The tables a tenant purge deletes because each names a project, a workspace,
 * a document or a program with no delete action, in the order it deletes them;
 * and the tables it does NOT erase although they name such a row (D6,
 * 2026-10-29; docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/). One
 * entry names no such row: csr_narrative_outputs, which nothing else reached
 * (docs/evidence/D6-TENANT-EXPORT-GAPS/2026-10-29/).
 *
 * PURGE_REFERRER_TABLES is spread into PURGE_CHILD_TABLES
 * (./tenant-offboarding.ts) just before `projects`. It lives here only so that
 * file stays under the repository's size ceiling: it is part of that one list,
 * frozen and module-local in the same way, and ci:purge-coverage reads the
 * spread in place, in order. PURGE_REFERRERS_NOT_ERASED is re-exported there.
 *
 * Since P-58 (2026-10-29; docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/)
 * the tables held out of the purge are in this list too: each is exported,
 * custody of the export is signed by the customer's administrator
 * (./offboarding-custody.ts), and then it is erased, through its door
 * (./purge-held-doors.ts) where its trigger or the runtime role's grant
 * ceiling refuses DELETE. PURGE_REFERRERS_NOT_ERASED is empty, and
 * PURGE_PLATFORM_RECORDS names the two records the purge keeps of a tenant:
 * its export receipts and its offboarding certificate.
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
  //
  // Before them all, the signed records (P-58): a signed compliance review
  // (it names its signature), the tenant's electronic signatures and the
  // documents' audit trail, each naming a document or a version with no
  // delete action. One door erases the three (purge_tenant_signed_records):
  // the signatures' trigger refuses DELETE from every role, and the runtime
  // role holds no DELETE on the signatures or the audit trail. The custody
  // signatures stay, for the offboarding certificate.
  'compliance_review_records',
  'electronic_signatures',
  'document_audit_trail',
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
  // Unified tasks, after the links and dependencies that name them, then the
  // review routes their route members name (P-58). A route member's DELETE is
  // refused to every role but the purge's door (unified_tasks_route_rows_guard,
  // 20261023), so one door erases the tenant's tasks, members included, and
  // then its routes (purge_tenant_review_routes).
  'cross_module_task_links',
  'task_dependencies',
  'unified_tasks',
  'review_routes',
  // A project's own working data: AnA objectives, capabilities and profiles,
  // its intelligence profile and what it ingested, modules, predictions, rules,
  // schedule, tasks and workflow stages, risk detections, sentinel findings,
  // template usage, CTD onboarding. Each names the project with no cascade.
  //
  // With them, the project's records held out of the purge until P-58: AnA's
  // canon resolution and outcome logs, the rule execution log, skill-bundle
  // execution receipts, data lineage and evidence chains (one door,
  // purge_tenant_lineage_records: their trigger refuses DELETE), governance
  // boundary transitions, and the sealed reports, after the seal events,
  // indemnification attestations and atom provenance that name them.
  'account_canon_resolution_log',
  'ana_outcome_log',
  'rule_execution_log',
  'bundle_execution_receipts',
  'data_lineage_records',
  'evidence_chain_records',
  'governance_boundary_transitions',
  'report_seal_events',
  'indemnification_attestations',
  'report_atom_provenance',
  'immutable_report_records',
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
  // intelligence profile with what it ingested and remembers. The account
  // event ledger first (P-58): it names canon items and bundles.
  'account_events',
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
  // project, which names its workspace with no cascade. The CER approvals
  // first (P-58): each names its project and a project document.
  'cer_approvals',
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
  // A CSR build's patient safety narratives (3b576cab9, CSR slice 7;
  // migrations/20260628_csr_job_state.sql, Table 3): each selected subject's
  // composed narrative text and its hashes, or the reason it was refused.
  // Tenant content, and no signature or signed act. It names no purged row;
  // it is here because nothing reached it: its organization_id key has no
  // cascade, and its job (csr_build_jobs, from which it cascades) is not
  // purged. So a purged tenant kept every narrative (ci:purge-coverage, NEW
  // residue; docs/evidence/D6-TENANT-EXPORT-GAPS/2026-10-29/).
  'csr_narrative_outputs',
  // Beside them, a CSR build's assembly and narrative runs (b265d6fc0;
  // migrations/20260628_csr_job_state.sql, Tables 4 and 5): who asked for each
  // run, its progress, and its result or error. Tenant content, and no
  // signature or signed act. Nothing names them, and they name no purged row:
  // like the outputs, they cascade only from csr_build_jobs, which is not
  // purged, and their organization_id key has no cascade, so a purged tenant
  // kept every run (ci:purge-coverage, NEW residue; P-58, 2026-10-29).
  'csr_assembly_runs',
  'csr_narrative_runs',
  // A tenant's deviations (P-57, migrations/20261029g_qc_deviations.sql): a
  // GxP quality record, so a held record (the lead's decision, P-58,
  // 2026-10-29), counted in the custody attestation (./held-records.ts) and
  // erased only after custody. A plain DELETE: no trigger refuses it and the
  // runtime role holds DELETE, so it needs no door. Nothing names it and it
  // names only its organization. Its close and cancel signatures are
  // electronic_signatures rows, erased above through purge_tenant_signed_records.
  'qc_deviations',
  // The tenant's knowledge graph (P-58's data return, 2026-10-29): its nodes
  // and edges, and the Lumen atom graph's edges. Tenant content, no signature,
  // and nothing names them; the Lumen edges cascade only from lumen_data_atoms,
  // which is not purged. Each was baselined residue (ci:purge-coverage), so a
  // purged tenant kept its whole graph. Their policy admits only the
  // organization's own tenant id, which the purge's transaction now carries
  // (tenant-offboarding.ts, enterOrganizationScope); the export reads them in
  // the same scope (company-export-snapshot.ts).
  'lumen_knowledge_graph_edges',
  'knowledge_graph_edges',
  'knowledge_graph_nodes',
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
  // calendar, commitments, tasks and gates, then the submission. The legacy
  // questions (P-58) after their messages and responses, through their door
  // (purge_tenant_reg_questions: read-only to every role since 20261019b);
  // the stage-gate approvals before their gate and submission.
  'reg_messages',
  'reg_responses',
  'reg_questions',
  'reg_attachments',
  'agency_correspondence',
  'agency_communications',
  'compliance_calendar',
  'obligation_updates',
  'regulatory_obligations',
  'regulatory_calendar',
  'post_approval_commitments',
  'regulatory_tasks',
  'gate_approvals',
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
     histories before them (P-58), through their door
     (purge_tenant_ivdr_histories: the runtime role holds no DELETE on them),
     each by its parent's organization. labeling_documents names
     its program by labeling_documents_program_same_org_fk, NO ACTION. Its
     translations and symbols name it twice: by a key that cascades and by
     their same-organization key (20261013b), NO ACTION. Both checks are
     AFTER triggers on labeling_documents and fire in trigger-name order, the
     text order of their OIDs, so on a database where the NO ACTION trigger's
     name sorts first (an OID past 99999 against one below it) the check finds
     the rows the cascade has not yet removed, and the purge fails 23503
     (found 2026-10-29 on an install-fresh database, P-58). Listed first, they
     are gone before either trigger fires. */
  'udi_records',
  'software_lifecycle_items',
  'labeling_translations',
  'labeling_symbols',
  'labeling_documents',
  'ivd_analytical_performance',
  'ivd_clinical_performance',
  'ivd_clia_categorization',
  'ivdr_per_documents',
  'cdx_pairings',
  'ivdr_validation_parameter_history',
  'ivdr_evidence_result_history',
  'ivdr_cdx_status_history',
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
 * deletes, each with why. Empty since P-58 (2026-10-29;
 * docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/): the 18 tables held here on
 * 2026-10-29 (signatures, audit trails, sealed reports, ledgers, the IVDR
 * histories, reg_questions, review_routes) are exported, custody of the export
 * is signed, and they are erased with the tenant, in PURGE_REFERRER_TABLES
 * above. Kept, JSON-shaped and read by ci:purge-coverage, so a table that must
 * be held again is named here with its reason rather than left as residue.
 */
export const PURGE_REFERRERS_NOT_ERASED: Readonly<Record<string, string>> = Object.freeze({
});

/** The records the platform keeps about a purged tenant, which hold no customer
 * content, each with why (P-58): the export receipts and the certificate. The purge does not erase them, and must not:
 * assertNoRetainedRecords refuses an injected list naming one, and
 * ci:purge-coverage reports each as a platform record (never as residue) and
 * fails if the purge could reach one. Keep it JSON-shaped.
 */
export const PURGE_PLATFORM_RECORDS: Readonly<Record<string, string>> = Object.freeze({
  "tenant_export_receipts": "The receipt of each full tenant export (migrations/20260813b_tenant_export_receipts.sql, 20261018): the export's SHA-256 digest, its table and row counts, the company-documents binding's version and SHA-256, who exported it and when. Digests, counts, an actor and a time only; no customer content. The purge verifies the final export against it, the custody signature and the certificate name its digest, and it outlives the tenant as the evidence that the data was returned (P-58, the lead's decision of 2026-10-29).",
  "tenant_offboarding_certificates": "The offboarding certificate (P-58, migrations/20261029k_tenant_offboarding_custody.sql): one row per purged tenant, written by its purge, with the export digest, the rows erased per table, the held records erased, the custody signature, who purged and when. Counts, identifiers, digests and times only. Append-only for every role; it is the platform's record that the tenant's data was returned and erased.",
});
