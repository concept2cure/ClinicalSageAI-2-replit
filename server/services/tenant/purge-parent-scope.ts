/**
 * Which rows of a table without its own tenant column belong to a tenant —
 * ONE predicate per table, read by the tenant purge (what it deletes) AND the
 * tenant export (what it returns).
 *
 * The same reason vault-tenancy.ts exists, for every such table: the export
 * and the purge must agree, and they cannot import each other (the purge
 * verifies the export's receipt). A table the purge deletes but the export
 * cannot find is data an erasure destroys without returning
 * (tests/schema-contract/tenant-export-covers-purge.contract.test.ts).
 *
 * Until 2026-10-29 the map held only the two Vault tables. The purge now erases
 * the legacy children that name a purged row with no delete action
 * (docs/evidence/D6-TENANT-PURGE-BLOCKING-KEYS/2026-10-29/), and most of them
 * carry no organization_id: `DELETE … WHERE organization_id = $1` raised 42703
 * there and was skipped, so their key stopped the purge at the parent. Each is
 * scoped by the SAME parent, through the SAME key, as its row-level-security
 * policy (db/migrations/20260813_child_table_parent_scoped_rls.sql), so what
 * the purge deletes, what the export returns and what a tenant can read are
 * one set. A row whose parent belongs to another tenant is never in it.
 *
 * Every value is a fixed string; `$1` is the organization id as an INTEGER and
 * the only bind slot. Frozen: a purge or an export never takes a predicate
 * derived from request input.
 *
 * @module server/services/tenant/purge-parent-scope
 */
import { VAULT_DOCUMENT_TENANCY } from './vault-tenancy';

export const PURGE_PARENT_SCOPED: Readonly<Record<string, string>> = Object.freeze({
  'vault.documents': VAULT_DOCUMENT_TENANCY,
  'vault.document_chunks':
    // tenant-isolation-safe: the inner SELECT is filtered by
    // VAULT_DOCUMENT_TENANCY (./vault-tenancy) — `organization_id = $1 OR program_id IN
    // (… WHERE organization_id = $1)`. The org predicate IS in the statement;
    // it arrives through the interpolated constant, which a same-statement
    // text match cannot follow.
    `document_id IN (SELECT id FROM vault.documents WHERE ${VAULT_DOCUMENT_TENANCY})`,
  // The canonical document store keys its tenant as org_id.
  'c2c_documents': 'org_id = $1',
  // The legacy documents, by their document.
  'document_comments': 'document_id IN (SELECT id FROM documents WHERE organization_id = $1)',
  'document_locks': 'document_id IN (SELECT id FROM documents WHERE organization_id = $1)',
  'document_versions': 'document_id IN (SELECT id FROM documents WHERE organization_id = $1)',
  // Section patches by their section, and a patch's propagations by their patch.
  'section_patches': 'section_id IN (SELECT section_id FROM sections WHERE organization_id = $1)',
  'section_propagations':
    'patch_id IN (SELECT id FROM section_patches WHERE section_id IN (SELECT section_id FROM sections WHERE organization_id = $1))',
  // A project's predictions and risk detections, by their project.
  'project_predictions': 'project_id IN (SELECT id FROM projects WHERE organization_id = $1)',
  'risk_detections': 'project_id IN (SELECT id FROM projects WHERE organization_id = $1)',
  // Agency correspondence's issues and attachments, by their correspondence.
  'c2c_correspondence_issues': 'correspondence_id IN (SELECT id FROM c2c_correspondence WHERE organization_id = $1)',
  'c2c_secure_attachments': 'correspondence_id IN (SELECT id FROM c2c_correspondence WHERE organization_id = $1)',
  // CER v1: each child names its report by cer_reports.id or by cer_reports.report_id.
  'cer_clinical_evidence': 'cer_report_id IN (SELECT id FROM cer_reports WHERE organization_id = $1)',
  'cer_essential_requirements': 'cer_report_id IN (SELECT id FROM cer_reports WHERE organization_id = $1)',
  'cer_version_history': 'cer_report_id IN (SELECT id FROM cer_reports WHERE organization_id = $1)',
  'cer_compliance_checks': 'report_id IN (SELECT report_id FROM cer_reports WHERE organization_id = $1)',
  'cer_exports': 'report_id IN (SELECT report_id FROM cer_reports WHERE organization_id = $1)',
  'cer_faers_data': 'report_id IN (SELECT report_id FROM cer_reports WHERE organization_id = $1)',
  'cer_literature': 'report_id IN (SELECT report_id FROM cer_reports WHERE organization_id = $1)',
  'cer_sections': 'report_id IN (SELECT report_id FROM cer_reports WHERE organization_id = $1)',
  'cer_workflows': 'report_id IN (SELECT report_id FROM cer_reports WHERE organization_id = $1)',
  // CSR knowledge: a report's details by the report; the cross-study edges and
  // CTD cross-references by the study their policy names.
  'csr_details': 'report_id IN (SELECT id FROM csr_reports WHERE organization_id = $1)',
  'csr_knowledge_edges': 'source_study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'ctd_cross_references': 'target_study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  // A 510(k) v1 project's stage progress, by its project.
  'fda_510k_stage_progress': 'project_id IN (SELECT id FROM fda_510k_projects WHERE organization_id = $1)',
  // An IND package plan's documents, modalities, regions, requirements and timelines, by their plan.
  'ind_package_plan_documents': 'plan_id IN (SELECT id FROM ind_package_plans WHERE organization_id = $1)',
  'ind_package_plan_modalities': 'plan_id IN (SELECT id FROM ind_package_plans WHERE organization_id = $1)',
  'ind_package_plan_regions': 'plan_id IN (SELECT id FROM ind_package_plans WHERE organization_id = $1)',
  'ind_package_plan_requirements': 'plan_id IN (SELECT id FROM ind_package_plans WHERE organization_id = $1)',
  'ind_package_plan_timelines': 'plan_id IN (SELECT id FROM ind_package_plans WHERE organization_id = $1)',
  // A regulatory obligation's updates, and a report's details, by their parent.
  'obligation_updates': 'obligation_id IN (SELECT id FROM regulatory_obligations WHERE organization_id = $1)',
  'report_details': 'report_id IN (SELECT id FROM reports WHERE organization_id = $1)',

  /* ── Reached only by ON DELETE CASCADE, with no tenant column ─────────────
     The purge deletes these with their parent, so it needs no predicate for
     them; the export does, or it returns less than the purge destroys. The
     first three groups are cascades of tables the purge erases since
     2026-10-29; the last two were erased without being returned before it. */
  // The canonical documents' sections, and each section's versions and evidence.
  'c2c_document_sections': 'document_id IN (SELECT id FROM c2c_documents WHERE org_id = $1)',
  'c2c_document_section_versions':
    'section_id IN (SELECT id FROM c2c_document_sections WHERE document_id IN (SELECT id FROM c2c_documents WHERE org_id = $1))',
  'c2c_document_section_evidence':
    'section_id IN (SELECT id FROM c2c_document_sections WHERE document_id IN (SELECT id FROM c2c_documents WHERE org_id = $1))',
  // A CSR study's contents, by the study; an endpoint's results, by the endpoint.
  'csr_adverse_events': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_biomarkers': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_dose_response': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_eligibility_criteria': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_endpoints': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_pharmacokinetics': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_populations': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_references': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_safety_summaries': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_sections': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_statistical_analyses': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_tables_and_figures': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  'csr_treatment_arms': 'study_id IN (SELECT id FROM csr_studies WHERE organization_id = $1)',
  // A CTD program's submissions, nonclinical studies and quality data.
  'ctd_submissions': 'program_id IN (SELECT id FROM ctd_programs WHERE organization_id = $1)',
  'ctd_nonclinical_studies': 'program_id IN (SELECT id FROM ctd_programs WHERE organization_id = $1)',
  'ctd_quality_data': 'program_id IN (SELECT id FROM ctd_programs WHERE organization_id = $1)',
  // Not here: csr_endpoint_results, ctd_module_sections and ctd_documents, a
  // grandchild of their study or program. Row-level security is on for them
  // with no policy, so no application role reads or writes a row
  // (db/migrations/20260813_child_table_parent_scoped_rls.sql names the nested
  // predicate they need); they cascade with their parents and hold nothing a
  // tenant could have written.
  // A program's milestones, activities and readiness snapshots, and a PCCP's modifications.
  'program_milestones': 'program_id IN (SELECT id FROM regulatory_programs WHERE organization_id = $1)',
  'pdev_program_activities': 'program_id IN (SELECT id FROM regulatory_programs WHERE organization_id = $1)',
  'pdev_readiness_snapshots': 'program_id IN (SELECT id FROM regulatory_programs WHERE organization_id = $1)',
  'ai_ml_modifications': 'plan_id IN (SELECT id FROM ai_ml_pccp_plans WHERE organization_id = $1)',
  // A submission milestone's sections, by the milestone.
  'c2c_milestone_sections': 'milestone_db_id IN (SELECT id FROM c2c_milestones WHERE org_id = $1)',
});

/**
 * The parent-scoped tables the export does not return as rows of their own:
 * vault.document_chunks are cut from the documents' extracted_text, which IS
 * exported with each document, and the purge removes them with their parent.
 */
export const EXPORT_DERIVED_TABLES: readonly string[] = Object.freeze(['vault.document_chunks']);
