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
 * The domain-history tables that are chain-linked, and the ones known to exist
 * but not yet linked. Single source of truth: the writers import LINKED_* names
 * from here and the Part 11 coverage endpoint enumerates the same list, so a
 * table can never be "covered" in the report without a writer that links it.
 */
export interface DomainHistoryTable {
  /** Physical table name, as it appears in audit_logs.table_name. */
  table: string;
  /** What one row of the domain table represents. */
  rowSemantics: string;
  /** true once every production writer of this table also emits a link row. */
  linked: boolean;
  /** Owning module, for the follow-up list. */
  owner: string;
}

export const DOMAIN_HISTORY_TABLES: readonly DomainHistoryTable[] = [
  {
    table: 'workflow_history',
    rowSemantics: 'One approval-workflow state transition (start / approve / reject / complete).',
    linked: true,
    owner: 'server/services/WorkflowService.ts',
  },
  {
    table: 'document_audit_logs',
    rowSemantics: 'One unified-document lifecycle event (create / version / field update / approval).',
    linked: true,
    owner: 'server/services/ModuleIntegrationService.ts',
  },
  {
    table: 'device_audit_trail',
    rowSemantics: 'One device/510(k) record change with before-after values and optional e-signature.',
    linked: true,
    owner: 'server/services/part11ComplianceService.ts',
  },
  {
    table: 'regulatory_audit_logs',
    rowSemantics: 'One regulatory-entity change (submission / task / gate / approval) with GxP flags.',
    linked: false,
    owner: 'server/services/ai-actions/action-registry.ts (+7 other writers)',
  },
  {
    table: 'ivdr_validation_parameter_history',
    rowSemantics: 'One prior value of an IVDR validation parameter (per-field version snapshot).',
    linked: false,
    owner: 'server/routes/ivdr-routes.ts',
  },
  {
    table: 'ivdr_evidence_result_history',
    rowSemantics: 'One prior value of an IVDR evidence result.',
    linked: false,
    owner: 'server/routes/ivdr-routes.ts',
  },
  {
    table: 'ivdr_cdx_status_history',
    rowSemantics: 'One companion-diagnostic status transition.',
    linked: false,
    owner: 'server/routes/ivdr-routes.ts',
  },
  {
    table: 'ectd_submission_status_history',
    rowSemantics: 'One eCTD submission status transition.',
    linked: false,
    owner: 'server/services/ectd-submission-agent.ts',
  },
  {
    table: 'org_lifecycle_state_history',
    rowSemantics: 'One organization lifecycle state transition.',
    linked: false,
    owner: 'server/services/lifecycle/org-lifecycle.ts',
  },
  {
    table: 'document_audit_trail',
    rowSemantics: 'One legacy document action with before-after values.',
    linked: false,
    owner: 'server/services/DocumentOrchestrationService.ts',
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
  try {
    await auditService.logAction({
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
  } catch (err) {
    logger.error('Domain history chain link failed (history itself is unaffected)', {
      domainTable: link.domainTable,
      subjectId: String(link.subjectId),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
