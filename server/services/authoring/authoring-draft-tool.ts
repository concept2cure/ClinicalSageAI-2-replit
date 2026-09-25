/**
 * `draft_authoring_document` — the AnA tool that turns a drafted document into
 * an authoring document in the open project (WM, 2026-09-21,
 * docs/design/ANA_DOCUMENT_CANVAS.md "No AnA tool writes that store" → now one
 * does, through the same service the route uses).
 *
 * The handler in AnaToolExecutor is one line; everything the tool decides is
 * here so it can be tested through its handler without a model turn, which is
 * how it IS tested — no AI provider exists in the test or proof environments.
 *
 * Refuses verbatim without an open project, the way `save_document_to_vault`
 * does: an authoring document is filed under a program, and a document
 * belonging to no project is exactly the orphaned capture this platform must
 * not produce. The project is resolved from the tool context — the program
 * UUID the v2 shell sends (`projectRef`), else the legacy integer project's
 * `regulatory_program_id` — and its ownership by the acting organization is
 * checked before anything is written.
 */

import { createScopedLogger } from '../../utils/logger';
import { programInOrganization } from '../c2c/program-access';
import type { AuthoringPool } from './authoring-documents';
import {
  createDocumentFromDraft,
  parseDraftInput,
  type CreateDocumentFromDraftInput,
  type ProvenanceInput,
} from './authoring-from-draft';
import type { AuthoringAuditContext } from './authoring-evidence';

const logger = createScopedLogger('draft-authoring-document-tool');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The refusal, verbatim, when no project is open. */
export const DRAFT_AUTHORING_DOCUMENT_NO_PROJECT =
  'draft_authoring_document needs an open project — every authoring document is filed under one. Open or select a project, then ask again.';

/** What the tool needs from ToolContext; kept structural so the test can pass a literal. */
export interface DraftToolContext {
  organizationId?: number | null;
  userId?: number | null;
  projectId?: number | null;
  projectRef?: string | null;
  /** Optional: the conversation and model, recorded as provenance when known. */
  threadId?: string | null;
  turnId?: string | null;
  model?: string | null;
}

export interface DraftToolResult {
  status: 'generated';
  authoringDocId: string;
  programId: string;
  title: string;
  sectionCount: number;
  documentType?: string;
  /** A text summary so the existing artifact_draft stream path still renders. */
  content: string;
  message: string;
}

/**
 * Resolve the open program as a regulatory_programs UUID the organization
 * owns. Null when there is none — the caller refuses.
 */
export async function resolveOpenProgram(pool: AuthoringPool, ctx: DraftToolContext): Promise<string | null> {
  const orgId = Number(ctx.organizationId);
  const ref = typeof ctx.projectRef === 'string' ? ctx.projectRef.trim() : '';
  if (ref && UUID_RE.test(ref)) {
    return (await programInOrganization(pool, ref, orgId)) ? ref : null;
  }
  const legacy = Number(ctx.projectId);
  if (Number.isSafeInteger(legacy) && legacy > 0) {
    const anchored = await pool.query(
      `SELECT regulatory_program_id FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [legacy, orgId],
    );
    const programId = anchored.rows[0]?.regulatory_program_id;
    return typeof programId === 'string' && UUID_RE.test(programId) ? programId : null;
  }
  return null;
}

/** The acting user's email for the audit row — their own row, or 'unknown' as the router records an absent one. */
async function actorEmail(pool: AuthoringPool, userId: number): Promise<string | null> {
  try {
    // tenant-isolation-safe: self-lookup of the acting user's own email; users
    // is the global identity table (membership lives in organization_users),
    // and the id comes from the verified tool context, never from input.
    const r = await pool.query('SELECT email FROM users WHERE id = $1 LIMIT 1', [userId]);
    const email = r.rows[0]?.email;
    return typeof email === 'string' && email ? email.toLowerCase() : null;
  } catch (err) {
    logger.warn('actor email lookup failed; audit row records the actor as unknown', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** A plain-text summary of the sections for the artifact_draft rail. */
function summaryContent(input: CreateDocumentFromDraftInput): string {
  const strip = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const lines = [`# ${input.title}`, ''];
  for (const s of input.sections) {
    lines.push(`## ${s.code} ${s.title}`);
    const text = strip(s.content);
    lines.push(text.length > 600 ? `${text.slice(0, 600)}…` : text || '(empty)');
    lines.push('');
  }
  return lines.join('\n').trim();
}

/**
 * The tool body. Returns the JSON string the model receives; `{ error }` for
 * every refusal, so telemetry classifies it as degraded rather than a crash.
 */
export async function draftAuthoringDocumentTool(
  pool: AuthoringPool,
  input: Record<string, unknown>,
  ctx: DraftToolContext | undefined,
): Promise<string> {
  if (!ctx?.organizationId || !ctx.userId) {
    return JSON.stringify({ error: 'draft_authoring_document requires tenant + user context.' });
  }
  const programId = await resolveOpenProgram(pool, ctx);
  if (!programId) return JSON.stringify({ error: DRAFT_AUTHORING_DOCUMENT_NO_PROJECT });

  const provenance: ProvenanceInput = { source: 'ana' };
  if (ctx.threadId) provenance.conversationId = String(ctx.threadId);
  if (ctx.turnId) provenance.turnId = String(ctx.turnId);
  if (ctx.model) provenance.model = String(ctx.model);

  const parsed = parseDraftInput({ ...input, programId, provenance });
  if (!parsed.ok) return JSON.stringify({ error: parsed.error });

  const email = await actorEmail(pool, Number(ctx.userId));
  const audit: AuthoringAuditContext = {
    tenantId: Number(ctx.organizationId),
    actorId: String(ctx.userId),
    actorEmail: email ?? 'unknown',
    actorRole: 'unknown',
    ipAddress: 'ana-tool',
    userAgent: 'ana-tool',
    pool,
  };
  try {
    const outcome = await createDocumentFromDraft(
      { pool, tenantId: Number(ctx.organizationId), actor: { id: String(ctx.userId), email }, audit },
      parsed.value,
    );
    if (outcome.kind === 'refused') return JSON.stringify({ error: outcome.error });
    const result: DraftToolResult = {
      status: 'generated',
      authoringDocId: String(outcome.document.id),
      programId,
      title: parsed.value.title,
      sectionCount: outcome.sections.length,
      ...(parsed.value.documentType ? { documentType: parsed.value.documentType } : {}),
      content: summaryContent(parsed.value),
      message:
        `Drafted '${parsed.value.title}' as an authoring document (${outcome.sections.length} section(s)) in the open project. ` +
        'It is a draft in the editor; nothing is filed in the vault until someone files it.',
    };
    return JSON.stringify(result);
  } catch (err) {
    logger.error('draft_authoring_document failed', { err: err instanceof Error ? err.message : String(err) });
    return JSON.stringify({ error: `draft_authoring_document failed: ${err instanceof Error ? err.message : String(err)}` });
  }
}
