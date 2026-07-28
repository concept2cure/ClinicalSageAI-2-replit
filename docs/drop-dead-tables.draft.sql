-- ⛔ THIS DRAFT IS UNSAFE TO RUN AS WRITTEN. It drops tables that shipped code
--    reads. It now aborts on its first statement; see the guard below.
--
-- DRAFT — DO NOT place in migrations/ until verified against a live database.
-- Source: docs/DEAD_TABLES_INVENTORY.md (163 tables with zero const + zero SQL-name
-- references across server/, client/src/, scripts/, shared/{types,regulatory,utils}).
--
-- ── WHY IT WAS DISARMED ──────────────────────────────────────────────────────
-- The inventory this list came from is static-reference analysis, and it has
-- false negatives in both directions. Re-measured against the live 710-table
-- schema, EIGHT tables named below exist AND are referenced by shipped code:
--
--   client_access           server/routes/client-portal.ts:106 — `FROM client_access ca`.
--                           This is the predicate that scopes an EXTERNAL CLIENT
--                           to their workspace. Dropping it does not merely lose
--                           data; it breaks the client portal's authorization.
--   regulatory_obligations  server/services/ana/deadline-radar.ts:15 imports
--                           `regulatoryObligations` and selects from it at :136.
--   charter_sections        server/routes/charters.ts:22 — a migration was written
--   timeline_phases         specifically to RESTORE these three. Dropping them
--   project_commitments     re-opens the outage that migration closed.
--   charter_audit_events    server/routes/charters.ts:23 — the per-entity audit
--                           table the charter domain writes in-transaction.
--   readiness_rules         client/src/concept2cure/v2/surfaces/Orchestration.tsx:644
--   doe_studies             server/services/ana/intelligence-questions/war-game/
--                           auditors/cmc-auditor.ts
--
-- The list is also unordered with respect to foreign keys while deliberately
-- avoiding CASCADE, so it cannot execute end-to-end regardless: e.g.
-- supply_chain_organizations (line ~180) is still referenced by `materials` and
-- `batches`, and spine_edges (absent from this list) references spine_nodes.
-- And it omits `ind_package_plans` while dropping all five of its children,
-- which would leave an orphaned parent.
--
-- ── HOW TO USE IT ANYWAY ─────────────────────────────────────────────────────
-- Treat this as a LEAD LIST, not a script. Per table: confirm it is unreferenced
-- (`npm run ci:unreferenced-modules --json` covers modules; for tables check both
-- snake_case AND camelCase, and discount English-word collisions — "materials",
-- "plans", "sections" all appear in prose), confirm no inbound FK, then move it
-- into a real, ordered migration under db/migrations/ with a header explaining
-- what it removes and why.
--
-- OPERATOR GATE before running ANY line below:
--   1. \dt and information_schema cross-check on the target DB (row counts).
--   2. confirm no raw-SQL / Python / external consumer references the table
--      (search outside the scanned dirs: *.sql, *.py, BI tools, ETL).
--   3. take a backup / run inside a transaction you can ROLLBACK.
-- Each statement is CASCADE-free on purpose: if a DROP fails on a dependency,
-- that dependency is evidence the table is NOT actually dead — investigate, do
-- not add CASCADE blindly.

-- ── ABORT GUARD ──────────────────────────────────────────────────────────────
-- Fires unconditionally, so a copy-paste of this whole file into psql destroys
-- nothing. Delete this block only alongside removing the eight live tables above.
DO $$
BEGIN
    RAISE EXCEPTION USING MESSAGE =
        'docs/drop-dead-tables.draft.sql is a lead list, not a migration. It names '
        'at least 8 tables that shipped code reads — including client_access, which '
        'server/routes/client-portal.ts uses to scope external clients. Verify each '
        'table individually and write an ordered migration under db/migrations/.';
END $$;

-- BEGIN;   -- uncomment to run as one reviewable transaction
DROP TABLE IF EXISTS public.activity_reactions;
DROP TABLE IF EXISTS public.agency_communications;
DROP TABLE IF EXISTS public.agency_correspondence;
DROP TABLE IF EXISTS public.agency_validation_results;
DROP TABLE IF EXISTS public.ai_audit_log;
DROP TABLE IF EXISTS public.assumption_history;
DROP TABLE IF EXISTS public.batch_genealogy;
DROP TABLE IF EXISTS public.biomarker_ontology;
DROP TABLE IF EXISTS public.cdisc_adam_specs;
DROP TABLE IF EXISTS public.cdisc_cdash_fields;
DROP TABLE IF EXISTS public.cdisc_cdash_forms;
DROP TABLE IF EXISTS public.cdisc_cdash_sdtm_mappings;
DROP TABLE IF EXISTS public.cdisc_compliance_agency_prefs;
DROP TABLE IF EXISTS public.cdisc_compliance_results;
DROP TABLE IF EXISTS public.cdisc_compliance_rules;
DROP TABLE IF EXISTS public.cdisc_compliance_versions;
DROP TABLE IF EXISTS public.cdisc_csr_sap;
DROP TABLE IF EXISTS public.cdisc_csr_templates;
DROP TABLE IF EXISTS public.cdisc_csr_tfl;
DROP TABLE IF EXISTS public.cdisc_device_de;
DROP TABLE IF EXISTS public.cdisc_device_dx;
DROP TABLE IF EXISTS public.cdisc_device_relationships;
DROP TABLE IF EXISTS public.cdisc_docs_acrf;
DROP TABLE IF EXISTS public.cdisc_docs_define_artifacts;
DROP TABLE IF EXISTS public.cdisc_docs_repository;
DROP TABLE IF EXISTS public.cdisc_ectd_datasets;
DROP TABLE IF EXISTS public.cdisc_ectd_define_xml;
DROP TABLE IF EXISTS public.cdisc_ectd_reviewers_guide;
DROP TABLE IF EXISTS public.cdisc_ectd_sdsp;
DROP TABLE IF EXISTS public.cdisc_ind_integration;
DROP TABLE IF EXISTS public.cdisc_ind_ise;
DROP TABLE IF EXISTS public.cdisc_ind_iss;
DROP TABLE IF EXISTS public.cdisc_ind_send;
DROP TABLE IF EXISTS public.cdisc_pq_domains;
DROP TABLE IF EXISTS public.cdisc_pq_manufacturing;
DROP TABLE IF EXISTS public.cdisc_pq_stability;
DROP TABLE IF EXISTS public.cdisc_prm_epochs;
DROP TABLE IF EXISTS public.cdisc_prm_visits;
DROP TABLE IF EXISTS public.cdisc_task_deliverables;
DROP TABLE IF EXISTS public.cdisc_task_milestones;
DROP TABLE IF EXISTS public.cdisc_task_validation_queue;
DROP TABLE IF EXISTS public.cdisc_task_workflows;
DROP TABLE IF EXISTS public.charter_audit_events;
DROP TABLE IF EXISTS public.charter_sections;
DROP TABLE IF EXISTS public.client_access;
DROP TABLE IF EXISTS public.cmc_process_steps;
DROP TABLE IF EXISTS public.coauthor_annotations;
DROP TABLE IF EXISTS public.coauthor_document_versions;
DROP TABLE IF EXISTS public.coauthor_import_history;
DROP TABLE IF EXISTS public.coauthor_status_history;
DROP TABLE IF EXISTS public.communication_channels;
DROP TABLE IF EXISTS public.communication_messages;
DROP TABLE IF EXISTS public.compliance_calendar;
DROP TABLE IF EXISTS public.component_cross_references;
DROP TABLE IF EXISTS public.component_sequence_references;
DROP TABLE IF EXISTS public.context_groups;
DROP TABLE IF EXISTS public.context_members;
DROP TABLE IF EXISTS public.csr_adverse_events;
DROP TABLE IF EXISTS public.csr_biomarkers;
DROP TABLE IF EXISTS public.csr_cross_study_comparisons;
DROP TABLE IF EXISTS public.csr_dose_response;
DROP TABLE IF EXISTS public.csr_eligibility_criteria;
DROP TABLE IF EXISTS public.csr_endpoint_results;
DROP TABLE IF EXISTS public.csr_extraction_log;
DROP TABLE IF EXISTS public.csr_knowledge_edges;
DROP TABLE IF EXISTS public.csr_knowledge_nodes;
DROP TABLE IF EXISTS public.csr_model_performance;
DROP TABLE IF EXISTS public.csr_pharmacokinetics;
DROP TABLE IF EXISTS public.csr_populations;
DROP TABLE IF EXISTS public.csr_references;
DROP TABLE IF EXISTS public.csr_regulatory_intelligence;
DROP TABLE IF EXISTS public.csr_safety_signals;
DROP TABLE IF EXISTS public.csr_safety_summaries;
DROP TABLE IF EXISTS public.csr_statistical_analyses;
DROP TABLE IF EXISTS public.csr_tables_and_figures;
DROP TABLE IF EXISTS public.csr_training_data;
DROP TABLE IF EXISTS public.csr_treatment_arms;
DROP TABLE IF EXISTS public.ctd_cross_references;
DROP TABLE IF EXISTS public.ctd_documents;
DROP TABLE IF EXISTS public.ctd_module_sections;
DROP TABLE IF EXISTS public.ctd_quality_data;
DROP TABLE IF EXISTS public.ctd_submissions;
DROP TABLE IF EXISTS public.document_atom_provenance;
DROP TABLE IF EXISTS public.document_attachments;
DROP TABLE IF EXISTS public.document_audit_log;
DROP TABLE IF EXISTS public.document_locks;
DROP TABLE IF EXISTS public.document_sessions;
DROP TABLE IF EXISTS public.doe_analysis_results;
DROP TABLE IF EXISTS public.doe_experiments;
DROP TABLE IF EXISTS public.doe_factors;
DROP TABLE IF EXISTS public.doe_responses;
DROP TABLE IF EXISTS public.doe_studies;
DROP TABLE IF EXISTS public.ectd_change_control;
DROP TABLE IF EXISTS public.ectd_cross_references;
DROP TABLE IF EXISTS public.evidence_change_events;
DROP TABLE IF EXISTS public.evidence_compliance_scores;
DROP TABLE IF EXISTS public.extracted_cross_doc_links;
DROP TABLE IF EXISTS public.extracted_graph_edges;
DROP TABLE IF EXISTS public.extracted_graph_entities;
DROP TABLE IF EXISTS public.extracted_graph_triplets;
DROP TABLE IF EXISTS public.gate_approvals;
DROP TABLE IF EXISTS public.ind_documents;
DROP TABLE IF EXISTS public.ind_package_plan_documents;
DROP TABLE IF EXISTS public.ind_package_plan_modalities;
DROP TABLE IF EXISTS public.ind_package_plan_regions;
DROP TABLE IF EXISTS public.ind_package_plan_requirements;
DROP TABLE IF EXISTS public.ind_package_plan_timelines;
DROP TABLE IF EXISTS public.integration_tokens;
DROP TABLE IF EXISTS public.lumen_filing_documents;
DROP TABLE IF EXISTS public.lumen_observation_terms;
DROP TABLE IF EXISTS public.multi_agency_validation_sessions;
DROP TABLE IF EXISTS public.obligation_updates;
DROP TABLE IF EXISTS public.pkpd_compartments;
DROP TABLE IF EXISTS public.post_approval_commitments;
DROP TABLE IF EXISTS public.program_activity_log;
DROP TABLE IF EXISTS public.project_commitments;
DROP TABLE IF EXISTS public.project_intelligence_summaries;
DROP TABLE IF EXISTS public.project_predictions;
DROP TABLE IF EXISTS public.protocol_extractions;
DROP TABLE IF EXISTS public.pv_signal_assessments;
DROP TABLE IF EXISTS public.qc_batch_releases;
DROP TABLE IF EXISTS public.qc_deviations;
DROP TABLE IF EXISTS public.qc_microbiological_tests;
DROP TABLE IF EXISTS public.qc_oos_investigations;
DROP TABLE IF EXISTS public.qc_reference_standards;
DROP TABLE IF EXISTS public.qc_specifications;
DROP TABLE IF EXISTS public.qmp_audit_trail;
DROP TABLE IF EXISTS public.readiness_rules;
DROP TABLE IF EXISTS public.reg_attachments;
DROP TABLE IF EXISTS public.reg_messages;
DROP TABLE IF EXISTS public.reg_obligation_events;
DROP TABLE IF EXISTS public.reg_obligation_templates;
DROP TABLE IF EXISTS public.reg_responses;
DROP TABLE IF EXISTS public.regulatory_change_control;
DROP TABLE IF EXISTS public.regulatory_meetings;
DROP TABLE IF EXISTS public.regulatory_obligations;
DROP TABLE IF EXISTS public.relation_extraction_log;
DROP TABLE IF EXISTS public.replacement_rules;
DROP TABLE IF EXISTS public.risk_assessments;
DROP TABLE IF EXISTS public.risk_detections;
DROP TABLE IF EXISTS public.section_graph_nodes;
DROP TABLE IF EXISTS public.section_patches;
DROP TABLE IF EXISTS public.section_propagations;
DROP TABLE IF EXISTS public.sharepoint_integration;
DROP TABLE IF EXISTS public.simple_document_versions;
DROP TABLE IF EXISTS public.simple_documents;
DROP TABLE IF EXISTS public.spine_nodes;
DROP TABLE IF EXISTS public.structured_observation_terms;
DROP TABLE IF EXISTS public.supply_chain_batches;
DROP TABLE IF EXISTS public.supply_chain_coas;
DROP TABLE IF EXISTS public.supply_chain_materials;
DROP TABLE IF EXISTS public.supply_chain_organizations;
DROP TABLE IF EXISTS public.supply_chain_shipments;
DROP TABLE IF EXISTS public.supply_chain_suppliers;
DROP TABLE IF EXISTS public.supply_chain_temperature_readings;
DROP TABLE IF EXISTS public.support_articles;
DROP TABLE IF EXISTS public.support_settings;
DROP TABLE IF EXISTS public.support_ticket_messages;
DROP TABLE IF EXISTS public.support_tickets;
DROP TABLE IF EXISTS public.timeline_phases;
DROP TABLE IF EXISTS public.user_following;
DROP TABLE IF EXISTS public.user_presence;
DROP TABLE IF EXISTS public.validation_harmonization_opportunities;
-- COMMIT;
