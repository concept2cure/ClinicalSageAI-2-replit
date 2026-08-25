/**
 * audit/domain-history-link — chain linkage for domain-specific history tables.
 *
 * WHY THIS EXISTS
 * ---------------
 * The canonical Part 11 audit substrate is `audit_logs`: SHA-256 hash-chained
 * (audit/chain.ts) and HMAC-sealed (audit/audit-hmac-seal.ts), written inside
 * the caller's transaction while holding SELECT FOR UPDATE on the prior row.
 *
 * A second, larger population of tables records domain history: per-version
 * content snapshots, state-machine transitions, per-parameter value history.
 * Those tables are NOT duplicates of audit_logs — a row in `workflow_history`
 * or `ivdr_validation_parameter_history` carries domain payload the flat audit
 * schema cannot express, and their readers (timelines, diff views, lineage
 * dossiers) depend on that shape. Force-merging them into audit_logs would
 * destroy information, so they are KEPT (verdict (b) in
 * docs/AUDIT_STORE_INVENTORY_2026-08.md).
 *
 * What was missing is REACHABILITY: a domain event landed in its own table and
 * left no trace in the chain, so the chain was not a complete index of what
 * happened. This module closes that gap. Every linked domain write also emits
 * one canonical `audit_logs` row carrying the domain table name and the row /
 * subject id, so an inspector walking the chain can enumerate every governed
 * event and follow the pointer to the domain record that holds the detail.
 *
 * WHAT A LINK ROW LOOKS LIKE
 *   action      domain.<table>.<action>          e.g. domain.workflow_history.step_approved
 *   table_name  <domain table>                   e.g. workflow_history
 *   record_id   <domain row id, else subject id>
 *   new_values  { domainTable, domainRowId, subjectType, subjectId, ... }
 *
 * The `table_name` column is what makes coverage measurable: the Part 11
 * coverage endpoint counts audit_logs rows per domain table and compares them
 * against the domain table's own row count (see DOMAIN_HISTORY_TABLES below).
 *
 * FAILURE POSTURE
 * The link is written through auditService.logAction, which already swallows
 * and logs persistence failures — an audit-trail outage must never break the
 * user action it records. linkDomainHistory therefore never throws. It is a
 * SUPPLEMENT to the domain write, never a replacement: losing the link loses
 * an index entry, never the history itself.
 *
 * ORDERING CAVEAT (stated rather than hidden)
 * Callers inside a database transaction emit the link on a different
 * connection, so a link can outlive a rolled-back domain write. The link row
 * names the domain table and row id, so such an entry is detectable as a
 * dangling pointer rather than silently wrong. Domain writes that need
 * transactional atomicity with the ledger use recordGovernedAction
 * (server/routes/c2c/actions.ts) instead, which writes audit_logs +
 * c2c_ana_actions inside the caller's own transaction.
 *
 * Compliance: 21 CFR Part 11 §11.10(e).
 */

import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('audit-domain-link');

/**
 * The domain-history tables that must be chain-reachable, and whether they are.
 * Single source of truth: the writers import LINKED_* names from here and the
 * coverage report (scripts/audit/domain-history-coverage.ts) enumerates the
 * same list, so a table can never be "covered" in the report without a writer
 * that links it.
 *
 * STATE, STATED PLAINLY: `linked` is false for every entry, because
 * `linkDomainHistory` currently has no call sites —
 *   grep -rn "linkDomainHistory" --include=*.ts . | grep -v node_modules
 * returns only this file. An earlier revision of this list carried
 * `linked: true` for the first three entries; that described intent, not
 * state, and is corrected here. The wiring follow-up is ordered by writer
 * count in docs/AUDIT_STORE_INVENTORY_2026-08.md §1.3.
 *
 * Membership rule: a table belongs here when it records a GOVERNED domain
 * event whose payload the flat audit schema cannot express (verdict (b) in the
 * inventory). Business records that merely match the name pattern do not
 * (`qms_internal_audits` is an internal-audit SCHEDULE, not a trail), nor does
 * engine bookkeeping with no governance meaning.
 */
export interface DomainHistoryTable {
  /** Physical table name, as it appears in audit_logs.table_name. */
  table: string;
  /** What one row of the domain table represents. */
  rowSemantics: string;
  /** true once every production writer of this table also emits a link row. */
  linked: boolean;
  /** Owning module(s), for the follow-up list. */
  owner: string;
}

export const DOMAIN_HISTORY_TABLES: readonly DomainHistoryTable[] = [
  {
    table: 'workflow_history',
    rowSemantics: 'One approval-workflow state transition (start / approve / reject / complete).',
    linked: false,
    owner: 'server/services/WorkflowService.ts (6 sites), server/services/workflow/ApprovalOrchestrator.ts',
  },
  {
    table: 'document_audit_logs',
    rowSemantics: 'One unified-document lifecycle event (create / version / field update / approval).',
    linked: false,
    owner: 'server/services/ModuleIntegrationService.ts (6 sites), server/services/workflow/ApprovalOrchestrator.ts:646',
  },
  {
    table: 'device_audit_trail',
    rowSemantics: 'One device/510(k) record change with before-after values and optional e-signature.',
    // part11ComplianceService.ts:374 DOES emit an audit_logs row, but with
    // resourceType = entityType, so the row does not name this table and the
    // coverage query (keyed on table_name) cannot see it.
    linked: false,
    owner: 'server/services/part11ComplianceService.ts:355, server/services/medicalDeviceService.ts:876',
  },
  {
    // Reclassified (a) DUPLICATE in the 2026-08 inventory §3.3: its columns map
    // onto audit_logs without loss. Kept here because chain-linking it is the
    // cheap interim step — it has 8 writers and no chain, seal or immutability.
    table: 'regulatory_audit_logs',
    rowSemantics: 'One regulatory-entity change (submission / task / gate / approval) with GxP flags.',
    linked: false,
    owner: 'server/services/ai-actions/action-registry.ts:511 (+7 other writers)',
  },
  {
    table: 'ivdr_validation_parameter_history',
    rowSemantics: 'One prior value of an IVDR validation parameter (per-field version snapshot).',
    linked: false,
    owner: 'server/routes/ivdr-routes.ts:494',
  },
  {
    table: 'ivdr_evidence_result_history',
    rowSemantics: 'One prior value of an IVDR evidence result.',
    linked: false,
    owner: 'server/routes/ivdr-routes.ts:727',
  },
  {
    table: 'ivdr_cdx_status_history',
    rowSemantics: 'One companion-diagnostic status transition.',
    linked: false,
    owner: 'server/routes/ivdr-routes.ts:912',
  },
  {
    table: 'ectd_submission_status_history',
    rowSemantics: 'One eCTD submission status transition.',
    linked: false,
    owner: 'server/services/ectd-submission-agent.ts:100,314,447',
  },
  {
    table: 'org_lifecycle_state_history',
    rowSemantics: 'One organization lifecycle state transition.',
    linked: false,
    owner: 'server/services/lifecycle/org-lifecycle.ts:217',
  },
  {
    table: 'document_audit_trail',
    rowSemantics: 'One legacy document action with before-after values.',
    linked: false,
    owner: 'server/services/DocumentOrchestrationService.ts:437',
  },
  {
    // charters.ts:745 calls this row the §11.10(e) coverage of record for the
    // charter domain — and nothing in the app reads it back (inventory §5.2).
    table: 'charter_audit_events',
    rowSemantics: 'One project-charter governance event, hashed in-transaction with the entity write.',
    linked: false,
    owner: 'server/routes/charters.ts:717',
  },
  {
    table: 'authoring_audit_trail',
    rowSemantics: 'One section-level authoring operation with before/after content hashes.',
    linked: false,
    owner: 'server/routes/authoring.router.ts:533',
  },
  {
    table: 'authoring_export_history',
    rowSemantics: 'One authored-document export event.',
    linked: false,
    owner: 'server/routes/authoring.router.ts:4232, server/services/ana-ri/command-executor.ts:3186',
  },
  {
    table: 'coauthor_validation_history',
    rowSemantics: "One validation run's findings for a document section.",
    linked: false,
    owner: 'server/services/realTimeValidationService.ts:207',
  },
  {
    table: 'specification_audit_log',
    rowSemantics: 'One CMC specification change with previous and new values.',
    linked: false,
    owner: 'server/api/cmc/specificationRoutes.ts:159,268,367',
  },
  {
    table: 'section_status_log',
    rowSemantics: 'One IND section status transition.',
    linked: false,
    owner: 'server/services/artifact-tagger.ts:290, server/routes/project-sections.ts:861',
  },
  {
    table: 'stab_audit',
    rowSemantics: 'One stability-study action with its JSON payload.',
    linked: false,
    owner: 'server/src/routes/stability.router.ts:254',
  },
  {
    table: 'rule_execution_log',
    rowSemantics: 'One rules-engine execution and its outcome.',
    linked: false,
    owner: 'server/services/rules-engine/engine.ts:372',
  },
  {
    table: 'impact_propagation_log',
    rowSemantics: 'One dependency-impact propagation event.',
    linked: false,
    owner: 'server/services/reactive-dependency-service.ts:442',
  },
  {
    table: 'cognitive_audit.semantic_audit_log',
    rowSemantics: 'One AI reasoning step with its prompt and semantic content (own hash chain).',
    linked: false,
    owner: 'server/services/cognitive-ecosystem/cognitive-audit.service.ts:136',
  },
  {
    table: 'cognitive_audit.electronic_signatures',
    rowSemantics: 'One e-signature applied over cognitive-audit content.',
    linked: false,
    owner: 'server/services/cognitive-ecosystem/cognitive-audit.service.ts:542',
  },
  {
    table: 'cognitive_audit.compliance_attestations',
    rowSemantics: 'One attestation over a set of cognitive-audit records.',
    linked: false,
    owner: 'server/services/cognitive-ecosystem/cognitive-audit.service.ts:787',
  },
  {
    table: 'cognitive_audit.audit_replay_sessions',
    rowSemantics: 'One deterministic replay of a recorded reasoning session.',
    linked: false,
    owner: 'server/services/cognitive-ecosystem/cognitive-audit.service.ts:395',
  },
] as const;

/** Tables whose every production writer emits a chain link. */
export const LINKED_DOMAIN_TABLES: readonly string[] = DOMAIN_HISTORY_TABLES.filter(
  t => t.linked,
).map(t => t.table);

export interface DomainHistoryLink {
  /** Physical domain-history table the event was written to. */
  domainTable: string;
  /** Primary key of the domain-history row, when the writer has it. */
  domainRowId?: string | number | null;
  /** The thing the history row is about (e.g. 'workflow', 'unified_document'). */
  subjectType: string;
  subjectId: string | number;
  /** Domain action verb as stored in the domain table (e.g. 'step_approved'). */
  action: string;
  organizationId?: string | number | null;
  userId?: string | number | null;
  /** Domain payload summary. Kept small — the domain row holds the detail. */
  details?: Record<string, unknown>;
}

/**
 * Emit the canonical audit_logs entry that indexes a domain-history write.
 *
 * Never throws: a failure here costs an index entry, not the history.
 */
export async function linkDomainHistory(link: DomainHistoryLink): Promise<void> {
  const domainLinkAudit = await auditService.logAction({
    organizationId: link.organizationId ?? undefined,
    userId: link.userId ?? undefined,
    action: `domain.${link.domainTable}.${link.action}`,
    // table_name / record_id are what the coverage query counts on.
    resourceType: link.domainTable,
    resourceId: String(link.domainRowId ?? link.subjectId),
    details: {
      domainTable: link.domainTable,
      domainRowId: link.domainRowId ?? null,
      subjectType: link.subjectType,
      subjectId: String(link.subjectId),
      domainAction: link.action,
      ...(link.details ?? {}),
    },
  });
  if (!domainLinkAudit.persisted) {
    logger.error('Domain history chain link failed (history itself is unaffected)', {
      domainTable: link.domainTable,
      subjectId: String(link.subjectId),
      error: domainLinkAudit.error ?? 'no durable store accepted the row',
    });
  }
}
