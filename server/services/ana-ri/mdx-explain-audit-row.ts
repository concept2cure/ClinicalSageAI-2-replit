/**
 * AnA tool: explain_audit_row
 *
 * Auditor-facing capability. Given an `audit_logs.id`, AnA pulls the
 * row, joins it to its knowledge-pack entry (action + resource type),
 * walks the captured details to extract concrete artifact references,
 * and renders a Markdown explainer that:
 *
 *   1. Restates the action in plain language ("an AnA-initiated
 *      Q-Submission was created...").
 *   2. Identifies who: the userId, plus actorKind ('agent:ana' vs.
 *      human if the row is on the human-side surface).
 *   3. Surfaces the captured reason and whether it cited a concrete
 *      artifact (reasonReferencedArtifact flag).
 *   4. Links to the chat thread that produced it (threadId +
 *      chatMessageId), if recorded.
 *   5. Pulls the knowledge-pack workflow entry that contextualizes the
 *      action so the auditor sees the broader process.
 *
 * Tenant scope: refuses if the audit row is not in the caller's org.
 *
 * Read-only. No confirmation gate. Logged under
 * `agent.ana.audit.explain` so an auditor can themselves audit the
 * explanation requests.
 */

import auditService from '../auditService';
import type { CommandContext, CommandResult } from './command-executor';
import { MDX_TOOLS, MDX_WORKFLOWS, getRegulation } from './mdx-knowledge-pack';

type AuditRow = {
  id: number;
  tenant_id: number;
  user_id: number | null;
  action: string;
  table_name: string;
  record_id: string;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

const ACTION_TO_WORKFLOW: Record<string, string> = {
  'q_sub.create': 'W3',
  'q_sub.commitment.rolled_in': 'W3',
  'q_sub.commitment.rolled_out': 'W3',
  'section.create': 'W2',
  'section.edit': 'W2',
  'section.approve': 'W2',
  'section.delete': 'W2',
  'k510_workflow.preflight': 'W5',
  'k510_workflow.transmit': 'W5',
  'correspondence.ingest': 'W4',
};

function workflowForAction(action: string): string | null {
  // Strip the agent prefix so 'agent.ana.q_sub.create' maps the same
  // way as 'q_sub.create'.
  const stripped = action.replace(/^agent\.ana\./, '');
  return ACTION_TO_WORKFLOW[stripped] ?? null;
}

function regulationForAction(action: string): string | null {
  const stripped = action.replace(/^agent\.ana\./, '');
  if (stripped.startsWith('q_sub.')) return 'q-sub';
  if (stripped.startsWith('section.')) return 'estar';
  if (stripped.startsWith('k510_workflow.')) return '510k';
  if (stripped === 'esignature.sign') return 'part-11';
  if (stripped.startsWith('gspr.')) return 'gspr';
  if (stripped.startsWith('post_market.')) return 'pms-pmcf';
  if (stripped === 'correspondence.ingest') return null; // multi-reg
  return null;
}

export async function explainAuditRow(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'audit.explain';

  const auditRowId = Number(params.auditRowId);
  if (!Number.isFinite(auditRowId) || auditRowId <= 0) {
    return {
      success: false,
      action,
      message: 'auditRowId is required (positive integer).',
      error: 'INVALID_INPUT',
    };
  }

  const { pool } = await import('../../db');
  if (!pool) {
    return {
      success: false,
      action,
      message: 'Database unavailable.',
      error: 'EXECUTION_FAILED',
    };
  }

  let row: AuditRow | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT id, tenant_id, user_id, action, table_name, record_id,
              new_values, ip_address, user_agent, created_at
       FROM audit_logs
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [auditRowId, ctx.organizationId],
    );
    row = rows[0] as AuditRow | undefined ?? null;
  } catch (err) {
    return {
      success: false,
      action,
      message: 'Failed to read audit_logs.',
      error: 'EXECUTION_FAILED',
    };
  }

  if (!row) {
    return {
      success: false,
      action,
      message: `Audit row ${auditRowId} not found in your organization.`,
      error: 'NOT_FOUND',
    };
  }

  const explainer = renderExplainer(row);

  // Audit the explanation request itself (read-only audit).
  void auditService.logAction({
    tenantId: ctx.organizationId,
    userId: ctx.userId,
    action: 'agent.ana.audit.explain',
    resourceType: 'audit_log_row',
    resourceId: String(row.id),
    details: {
      actorKind: 'agent:ana',
      threadId: ctx.threadId ?? null,
      chatMessageId: ctx.chatMessageId ?? null,
      explainedAction: row.action,
    },
  });

  return {
    success: true,
    action,
    data: {
      auditRowId: row.id,
      explainer,
      structured: {
        action: row.action,
        actorKind: (row.new_values as any)?.actorKind ?? 'human',
        agentReason: (row.new_values as any)?.agentReason ?? null,
        reasonReferencedArtifact: (row.new_values as any)?.reasonReferencedArtifact ?? null,
        threadId: (row.new_values as any)?.threadId ?? null,
        chatMessageId: (row.new_values as any)?.chatMessageId ?? null,
        timestamp: row.created_at,
        userId: row.user_id,
      },
    },
    message: `Explained audit row ${row.id}: ${row.action} on ${row.table_name}.`,
  };
}

function renderExplainer(row: AuditRow): string {
  const details = (row.new_values ?? {}) as Record<string, unknown>;
  const actorKind = String(details.actorKind ?? 'human');
  const isAgent = actorKind === 'agent:ana';
  const agentReason = details.agentReason as string | undefined;
  const reasonReferencedArtifact = details.reasonReferencedArtifact;
  const threadId = details.threadId as string | undefined;
  const chatMessageId = details.chatMessageId as string | undefined;

  const lines: string[] = [];
  lines.push(`# Audit row ${row.id} — ${row.action}`);
  lines.push('');
  lines.push(`Time: ${row.created_at}`);
  lines.push(`Resource: ${row.table_name} / ${row.record_id}`);
  lines.push(`Actor: ${isAgent ? 'AnA (agent)' : 'human user'} (userId=${row.user_id ?? 'system'})`);
  if (row.ip_address) lines.push(`IP: ${row.ip_address}`);
  lines.push('');

  // Plain-language restatement.
  lines.push('## What happened');
  lines.push(plainLanguageRestate(row.action, details));
  lines.push('');

  // Reason + artifact citation.
  if (isAgent) {
    lines.push('## Reason recorded');
    if (agentReason) {
      lines.push(`> ${agentReason}`);
      if (reasonReferencedArtifact === false) {
        lines.push('');
        lines.push(
          `**Audit signal:** the reason did NOT cite a concrete artifact ` +
            `(section number, Q-number, K-number, commitment code, ISO/CFR ` +
            `standard, or date). This is a soft signal — the mutation ` +
            `succeeded — but consider whether the rationale is sufficient ` +
            `for inspection.`,
        );
      } else if (reasonReferencedArtifact === true) {
        lines.push('');
        lines.push('Audit signal: reason cites a concrete artifact (passes the soft-quality filter).');
      }
    } else {
      lines.push('_(No reason recorded.)_');
    }
    lines.push('');
  }

  // Chat linkage.
  if (threadId || chatMessageId) {
    lines.push('## Conversation linkage');
    if (threadId) lines.push(`Thread id: \`${threadId}\``);
    if (chatMessageId) lines.push(`Chat message id: \`${chatMessageId}\``);
    lines.push('');
  }

  // Workflow context.
  const workflowId = workflowForAction(row.action);
  if (workflowId) {
    const w = MDX_WORKFLOWS.find(x => x.id === workflowId);
    if (w) {
      lines.push(`## Workflow context: ${w.id} ${w.label}`);
      lines.push(w.objective);
      lines.push('');
    }
  }

  // Regulation context.
  const regId = regulationForAction(row.action);
  if (regId) {
    const r = getRegulation(regId);
    if (r) {
      lines.push(`## Regulation context: ${r.label}`);
      lines.push(r.definition);
      lines.push(`Citation: ${r.citation}`);
      lines.push('');
    }
  }

  // Tool-pack reference (when this is an agent action).
  if (isAgent) {
    const stripped = row.action.replace(/^agent\.ana\./, '');
    const toolEntry = MDX_TOOLS.find(t => t.name === stripped);
    if (toolEntry) {
      lines.push('## Tool reference');
      lines.push(`\`${toolEntry.name}\` — ${toolEntry.description}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function plainLanguageRestate(
  action: string,
  details: Record<string, unknown>,
): string {
  const stripped = action.replace(/^agent\.ana\./, '');
  const isAgent = action !== stripped;
  const subject = isAgent ? 'AnA' : 'A user';

  switch (stripped) {
    case 'q_sub.create':
      return `${subject} created a Q-Submission of type "${details.qSubType ?? 'unknown'}" titled "${details.title ?? ''}" under program ${details.programId ?? 'unknown'}.`;
    case 'q_sub.commitment.rolled_in':
      return `${subject} marked commitment ${details.displayCode ?? 'unknown'} as rolled in to dossier section ${details.dossierLinkSectionId ?? 'unknown'}.`;
    case 'q_sub.commitment.rolled_out':
      return `${subject} cleared the rolled-in flag on commitment ${details.displayCode ?? 'unknown'}.`;
    case 'section.create':
      return `${subject} created eSTAR section §${details.sectionNumber ?? 'unknown'} (${details.sectionTitle ?? 'untitled'}).`;
    case 'section.edit':
      return `${subject} edited section §${details.sectionNumber ?? 'unknown'} (version ${details.versionNumber ?? '?'}).`;
    case 'section.approve':
      return `${subject} approved section §${details.sectionNumber ?? 'unknown'} (transition ${details.previousStatus ?? '?'} → ${details.newStatus ?? '?'}).`;
    case 'section.delete':
      return `${subject} deleted section §${details.sectionNumber ?? 'unknown'} (${details.sectionTitle ?? 'untitled'}).`;
    case 'k510_workflow.transmit':
      return `${subject} transmitted 510(k) project ${details.projectId ?? 'unknown'} to FDA ESG. Transaction id: ${details.transactionId ?? 'unrecorded'}.`;
    case 'k510_workflow.transmit.failed':
      return `${subject} attempted to transmit 510(k) project ${details.projectId ?? 'unknown'} but the upstream rejected: "${details.error ?? 'unknown'}".`;
    case 'k510_workflow.preflight':
      return `${subject} ran a 510(k) pre-flight on module ${details.moduleCode ?? 'unknown'}; verdict: ${details.overall ?? 'unknown'}.`;
    case 'esignature.sign':
      return `${subject} signed an electronic signature event for ${details.signaturePurpose ?? 'unknown purpose'}.`;
    case 'evidence_sufficiency.assess':
      return `${subject} ran an evidence-sufficiency assessment on program ${details.programId ?? 'unknown'} (pathway ${details.pathway ?? 'unknown'}); verdict: ${details.verdict ?? 'unknown'}.`;
    case 'gspr.mapping.upsert':
      return `${subject} upserted GSPR mapping (${details.requirementId ?? '?'} → ${details.applicability ?? '?'}) on program ${details.programId ?? 'unknown'}.`;
    case 'post_market.document.create':
      return `${subject} created post-market document ${details.code ?? '?'} of type ${details.documentType ?? '?'}.`;
    case 'post_market.document.approve':
      return `${subject} approved post-market document ${details.documentId ?? '?'}.`;
    case 'post_market.document.approve.blocked':
      return `${subject} attempted to approve post-market document but was blocked: "${details.reason ?? 'unknown'}".`;
    case 'post_market.document.update':
      return `${subject} updated post-market document; fields changed: ${(details.fieldsChanged as string[] ?? []).join(', ') || 'none'}.`;
    case 'post_market.document.validate':
      return `${subject} ran validation on post-market document; ${details.passed ? 'passed' : 'findings present'}.`;
    case 'post_market.document.supersede':
      return `${subject} superseded post-market document with new version (${details.newDocumentId ?? '?'}).`;
    case 'reviewer_simulation.run':
      return `${subject} ran a reviewer simulation on program ${details.programId ?? 'unknown'} with ${details.personaCount ?? '?'} personas.`;
    case 'predicate.candidate.status':
      return `${subject} set predicate candidate status to "${details.status ?? '?'}" for candidate ${details.programId ?? '?'}.`;
    case 'se_matrix.patch':
      return `${subject} patched an SE matrix row; fields changed: ${(details.fieldsChanged as string[] ?? []).join(', ') || 'none'}.`;
    case 'correspondence.ingest':
      return `${subject} ingested FDA correspondence "${details.subject ?? '?'}" with ${details.issueCount ?? 0} extracted issues.`;
    case 'tenant.export':
      return `${subject} exported the tenant's data manifest.`;
    case 'tenant.attestation.generate':
      return `${subject} generated an audit-chain attestation report; verdict: ${details.attestation ?? '?'}.`;
    case 'ana_tool_policy.update':
      return `${subject} updated the AnA tool policy.`;
    default:
      return `${subject} executed action "${stripped}".`;
  }
}

export const EXPLAIN_AUDIT_ROW_METADATA = {
  name: 'audit.explain',
  description:
    'Pull a single audit_logs row by id and produce a Markdown explainer ' +
    '(plain-language restatement, who/what/when/why, chat-thread linkage, ' +
    'and the relevant workflow + regulation context). Read-only; no ' +
    'confirmation required.',
  parameters: 'auditRowId (positive integer)',
  example: '"Explain audit row 1842."',
};
