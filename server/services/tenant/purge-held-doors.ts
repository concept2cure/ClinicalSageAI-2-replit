/**
 * The tenant purge's doors for the held records (P-58, D6, 2026-10-29;
 * docs/evidence/D6-OFFBOARDING-CUSTODY/2026-10-29/), spread into PURGE_DOORS
 * (./tenant-offboarding.ts). Split out so that file stays under the
 * repository's size ceiling; deleteTenantRows opens each, once, at the first
 * of its tables the list reaches.
 *
 * Each table here refuses a plain DELETE from the runtime role, by a trigger
 * that refuses every role or by the runtime role's grant ceiling
 * (scripts/db/provision-app-role.mjs APPEND_ONLY_TABLES). Each door is
 * SECURITY DEFINER, owned by the NOLOGIN role tenant_record_purger, which the
 * tables' guards admit for DELETE and nothing else, and it refuses unless the
 * session is in the platform scope, the organization is pending deletion, no
 * legal hold is active, and, when it would erase a held record, a custody
 * signature on one of the organization's export receipts exists
 * (migrations/20261029k_tenant_offboarding_custody.sql). Every one is on
 * scripts/db/security-definer-allowlist.json, with its review.
 *
 *   purge_tenant_signed_records    compliance_review_records, electronic_signatures
 *                                  (keeping the custody signatures, which the
 *                                  offboarding certificate names) and
 *                                  document_audit_trail, before `document_versions`
 *   purge_tenant_lineage_records   data_lineage_records, evidence_chain_records, before `projects`
 *   purge_tenant_ivdr_histories    the three IVDR Part 11 histories, before their parents
 *   purge_tenant_reg_questions     reg_questions, before `reg_attachments`
 *   purge_tenant_review_routes     the tenant's unified_tasks (review-route members
 *                                  included, which only this door may delete) and
 *                                  then its review_routes, where `unified_tasks` stands
 *
 * @module server/services/tenant/purge-held-doors
 */
export const HELD_RECORD_DOORS = Object.freeze([
  {
    tables: ['electronic_signatures', 'compliance_review_records', 'document_audit_trail'],
    fn: 'purge_tenant_signed_records',
    columns: ['signatures', 'reviews', 'audit_entries'],
    erasure: 'signedRecordErasure',
    unavailable: 'SIGNED_RECORD_PURGE_UNAVAILABLE',
  },
  {
    tables: ['data_lineage_records', 'evidence_chain_records'],
    fn: 'purge_tenant_lineage_records',
    columns: ['lineage', 'evidence_chains'],
    erasure: 'lineageRecordErasure',
    unavailable: 'LINEAGE_RECORD_PURGE_UNAVAILABLE',
  },
  {
    tables: ['ivdr_validation_parameter_history', 'ivdr_evidence_result_history', 'ivdr_cdx_status_history'],
    fn: 'purge_tenant_ivdr_histories',
    columns: ['validation_parameters', 'evidence_results', 'cdx_statuses'],
    erasure: 'ivdrHistoryErasure',
    unavailable: 'IVDR_HISTORY_PURGE_UNAVAILABLE',
  },
  {
    tables: ['reg_questions'],
    fn: 'purge_tenant_reg_questions',
    columns: ['questions'],
    erasure: 'regQuestionErasure',
    unavailable: 'REG_QUESTION_PURGE_UNAVAILABLE',
  },
  {
    tables: ['unified_tasks', 'review_routes'],
    fn: 'purge_tenant_review_routes',
    columns: ['tasks', 'routes'],
    erasure: 'reviewRouteErasure',
    unavailable: 'REVIEW_ROUTE_PURGE_UNAVAILABLE',
  },
] as const);
