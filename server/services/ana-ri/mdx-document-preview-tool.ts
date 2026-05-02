/**
 * AnA tool — document.preview
 *
 * Read-only chat-driven access to the live 510(k) document. Given a
 * project identifier (numeric id, UUID, or program code), assembles
 * the current section tree from cerv2_510k_sections and returns a
 * Markdown rendering AnA can paraphrase or quote.
 *
 * This is the same data the GET /api/510k/projects/:projectIdent/document-preview
 * endpoint returns; both call the same SQL-side assembly. The tool
 * exists so the user can ask "show me the document" or "what does §6
 * say right now?" in chat without context-switching to the modal.
 *
 * No confirmation required — read-only. Audited as
 * `agent.ana.k510_workflow.document_preview.read`.
 */

import auditService from '../auditService';
import type { CommandContext, CommandResult } from './command-executor';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function documentPreview(
  ctx: CommandContext,
  params: Record<string, unknown>,
): Promise<CommandResult> {
  const action = 'k510_workflow.document_preview';

  const projectIdent =
    typeof params.projectIdent === 'string' ? params.projectIdent.trim() : '';
  if (!projectIdent) {
    return {
      success: false,
      action,
      message: 'projectIdent is required (numeric id, UUID, or program code).',
      error: 'INVALID_INPUT',
    };
  }

  // Internal-fetch the BFF endpoint so the assembly logic stays in one
  // place (the route file). Same service-token pattern as phase 3 tools.
  const internalUrl = process.env.INTERNAL_BFF_URL || 'http://localhost:3000';
  const token = process.env.ANA_SERVICE_TOKEN || '';
  if (!token) {
    return {
      success: false,
      action,
      message: 'ANA_SERVICE_TOKEN not configured; document preview unavailable.',
      error: 'EXECUTION_FAILED',
    };
  }

  try {
    const url = new URL(
      `/api/510k/projects/${encodeURIComponent(projectIdent)}/document-preview`,
      internalUrl,
    );
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Service-Token': token,
        'X-Tenant-Id': String(ctx.organizationId),
        'X-User-Id': String(ctx.userId),
      },
    });
    if (res.status === 404) {
      return {
        success: false,
        action,
        message: `Project '${projectIdent}' not found in your organization.`,
        error: 'NOT_FOUND',
      };
    }
    if (res.status === 403) {
      return {
        success: false,
        action,
        message: `Access denied for project '${projectIdent}'.`,
        error: 'TENANT_ACCESS_DENIED',
      };
    }
    if (!res.ok) {
      return {
        success: false,
        action,
        message: `Document preview failed (HTTP ${res.status}).`,
        error: 'EXECUTION_FAILED',
      };
    }
    const body = (await res.json()) as Record<string, unknown>;

    void auditService.logAction({
      tenantId: ctx.organizationId,
      userId: ctx.userId,
      action: 'agent.ana.k510_workflow.document_preview.read',
      resourceType: 'k510_document_preview',
      resourceId: String(body.projectId ?? projectIdent),
      details: {
        actorKind: 'agent:ana',
        threadId: ctx.threadId ?? null,
        chatMessageId: ctx.chatMessageId ?? null,
        projectIdent,
        sectionCount: body.totalSections,
        approvedCount: body.approvedCount,
        completionPercentage: body.completionPercentage,
      },
    });

    return {
      success: true,
      action,
      data: body,
      message:
        `Live document for ${body.documentTitle ?? projectIdent}: ` +
        `${body.approvedCount}/${body.totalSections} sections approved · ` +
        `overall ${body.completionPercentage}% complete. ` +
        `Use the openModal hint if you want to surface the full canvas to the user.`,
      openModal: 'document-preview',
    };
  } catch (err) {
    return {
      success: false,
      action,
      message: 'Document preview failed.',
      error: 'EXECUTION_FAILED',
      data: { detail: err instanceof Error ? err.message : 'unknown' },
    };
  }
}

export const DOCUMENT_PREVIEW_METADATA = {
  name: 'k510_workflow.document_preview',
  description:
    'Read-only — pull the live 510(k) document for a project (numeric id, ' +
    'UUID, or program code). Returns the assembled Markdown + section tree ' +
    'so AnA can quote any section verbatim or paraphrase the overall state. ' +
    'Hint to open the canvas in the UI is included as openModal.',
  parameters: 'projectIdent (numeric id | UUID | program code)',
  example: '"Show me the live document for OR-801."',
};
