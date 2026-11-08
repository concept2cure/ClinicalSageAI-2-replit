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
import { authoringDraftCreationFailure, type authoringCreationRecoveryPayload } from './authoring-create-outcome';
import { looksLikeHtml, plainTextToHtml } from '../../../shared/authoring/plain-text-html';
import { resolveOpenProgram } from '../c2c/program-access';
import type { AuthoringPool } from './authoring-documents';
import {
  createDocumentFromDraft,
  parseDraftInput,
  type CreateDocumentFromDraftInput,
  type ProvenanceInput,
  type CreateDocumentFromDraftOptions,
} from './authoring-from-draft';
import type { AuthoringAuditContext } from './authoring-evidence';
import { authorizeAuthoringProgram } from './authoring-program-access';
import { modelCallRefusal } from '../ai-gateway/model-call-scope';
import { createHash } from 'node:crypto';
import type { DocumentDraftResponse } from '../ana/AnaDocumentDraftingService';

const logger = createScopedLogger('draft-authoring-document-tool');


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
  /** The parent turn's server-owned cancellation signal. */
  signal?: AbortSignal;
}

export interface DraftToolResult {
  projectSourceReferences: NonNullable<import('./authoring-from-draft').DocumentProvenance['projectSourceReferences']>;
  status: 'generated';
  saved: true;
  documentStatus: 'draft';
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
 * The open program: one resolver, in services/c2c/program-access.ts beside the
 * membership check it ends at (PF-10 S7 moved it there so the catalog tools use
 * the same one). Re-exported here for the callers that import it from the tool.
 */
export { resolveOpenProgram } from '../c2c/program-access';

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
 * The drafted figures no cited source states (S5a), said to AnA in the result
 * she relays: each is named with its section, so she does not present it to
 * the user as the source's. Empty when every figure was found, or when the
 * draft cited no source (then nothing was checked, and the result's
 * projectSourceReferences is empty).
 */
export function unverifiedFigureNote(refs: import('./authoring-from-draft').DocumentProvenance['projectSourceReferences']): string {
  const missing = (refs ?? []).flatMap(r =>
    (r.figures?.figures ?? []).filter(f => f.status === 'unverified').map(f => `${f.text} (${r.sectionCode})`));
  const total = (refs ?? []).reduce((n, r) => n + (r.figures?.unverified ?? 0), 0);
  if (total === 0) return '';
  const shown = missing.slice(0, 10).join('; ');
  return ` ${total} figure(s) in the draft are not stated in the sources it cites: ${shown}` +
    `${total > 10 ? `; and ${total - 10} more` : ''}. Tell the user they are unverified, and do not present them as ` +
    'the sources\u2019 figures. The editor lists them.';
}

/** Which AnA tool is creating the draft, and what it adds to the one path. */
interface AnaDraftOptions {
  tool: 'draft_authoring_document' | 'save_document_to_vault';
  noProjectRefusal: string;
  /** The reason the person stated, for a tool that requires one. */
  changeReason?: string;
  generatedDerivative?: CreateDocumentFromDraftOptions['generatedDerivative'];
}

function anaCreateOptions(opts: AnaDraftOptions): CreateDocumentFromDraftOptions | undefined {
  if (!opts.changeReason && !opts.generatedDerivative) return undefined;
  return { ...(opts.changeReason ? { changeReason: opts.changeReason } : {}), ...(opts.generatedDerivative ? { generatedDerivative: opts.generatedDerivative } : {}) };
}

/**
 * The one way AnA creates a draft: both tools below come through here, so
 * there is one writer (authoring_documents through createDocumentFromDraft)
 * and one set of refusals. `{ error }` for every refusal.
 */
async function createAnaDraft(
  pool: AuthoringPool,
  input: Record<string, unknown>,
  ctx: DraftToolContext | undefined,
  opts: AnaDraftOptions,
): Promise<{ error: string } | DraftToolResult | ReturnType<typeof authoringCreationRecoveryPayload>> {
  if (!ctx?.organizationId || !ctx.userId) {
    return { error: `${opts.tool} requires tenant + user context.` };
  }
  const programId = await resolveOpenProgram(pool, ctx);
  if (!programId) return { error: opts.noProjectRefusal };

  const provenance: ProvenanceInput = { source: 'ana' };
  if (ctx.threadId) provenance.conversationId = String(ctx.threadId);
  if (ctx.turnId) provenance.turnId = String(ctx.turnId);
  /* `ctx.model` is NOT set here any more (round 15, SEC-A-7 door 2). The model
     recorded on a drafted document comes from the turn record this draft names,
     or from nothing — one rule, no privileged channel beside it. Setting it
     here would be inert in any case: `createDocumentFromDraft` parses the
     provenance of both its callers, and `parseProvenance` no longer accepts
     `model`. Leaving the line would read as attribution that still happens. */

  const parsed = parseDraftInput({ ...input, programId, provenance });
  if (!parsed.ok) return { error: parsed.error };

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
      anaCreateOptions(opts),
    );
    if (outcome.kind === 'refused') return { error: outcome.error };
    return {
      projectSourceReferences: outcome.provenance.projectSourceReferences ?? [],
      status: 'generated',
      saved: true,
      documentStatus: 'draft',
      authoringDocId: String(outcome.document.id),
      programId,
      title: parsed.value.title,
      sectionCount: outcome.sections.length,
      ...(parsed.value.documentType ? { documentType: parsed.value.documentType } : {}),
      content: summaryContent(parsed.value),
      message:
        `Saved '${parsed.value.title}' as an authoring draft (${outcome.sections.length} section(s)) in the open project. ` +
        'It is a draft in the editor; nothing is filed in the vault until someone files it.' +
        unverifiedFigureNote(outcome.provenance.projectSourceReferences),
    };
  } catch (err) {
    // Driver details stay in the log; uncertain creation retains its recovery identity.
    return authoringDraftCreationFailure(err, opts.tool, logger);
  }
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
  if (input.derivativeId !== undefined) return draftReviewedDerivative(pool, input, ctx);
  return JSON.stringify(await createAnaDraft(pool, input, ctx, {
    tool: 'draft_authoring_document', noProjectRefusal: DRAFT_AUTHORING_DOCUMENT_NO_PROJECT,
  }));
}

const REVIEWED_DERIVATIVE_TITLE = 'Reviewed derivative draft';
const DERIVATIVE_MODE_KEYS = new Set(['derivativeId', 'title', 'documentType', 'module', 'qualifiedModelPin']);
function derivativeModeInput(input: Record<string, unknown>): boolean {
  return Object.keys(input).every(key => DERIVATIVE_MODE_KEYS.has(key)) && typeof input.derivativeId === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.derivativeId) && input.title === REVIEWED_DERIVATIVE_TITLE;
}
type CompleteDerivativeResponse = DocumentDraftResponse & {
  derivativeGeneration: NonNullable<DocumentDraftResponse['derivativeGeneration']>;
  derivativeVerification: NonNullable<DocumentDraftResponse['derivativeVerification']>;
};
function completeDerivativeResponse(response: DocumentDraftResponse, derivativeId: string): response is CompleteDerivativeResponse {
  return !!response.derivativeGeneration && response.derivativeVerification?.kind === 'deterministic_token_roundtrip' &&
    response.derivativeVerification.derivativeId === derivativeId && !response.truncated &&
    ['stop', 'end_turn', 'stop_sequence'].includes(response.finishReason ?? '') &&
    createHash('sha256').update(response.content, 'utf8').digest('hex') === response.derivativeGeneration.contentSha256;
}
function derivativeRequestSnapshot(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, ...(input.qualifiedModelPin && typeof input.qualifiedModelPin === 'object' ? { qualifiedModelPin: { ...input.qualifiedModelPin } } : {}) };
}
function reviewedSaveInput(input: Record<string, unknown>) {
  return { title: REVIEWED_DERIVATIVE_TITLE, ...(input.module !== undefined ? { module: input.module } : {}),
    ...(input.documentType !== undefined ? { documentType: input.documentType } : {}),
    sections: [{ code: '1', title: REVIEWED_DERIVATIVE_TITLE, content: '<p>Pending verified derivative output.</p>' }] };
}
/** Only the approved residual reaches the nested model; only a saved pointer
 * returns to the planning model. The reinjected T2 body stays in the editor. */
async function draftReviewedDerivative(pool: AuthoringPool, input: Record<string, unknown>, ctx: DraftToolContext | undefined): Promise<string> {
  if (modelCallRefusal()) return JSON.stringify({ error: 'Reviewed derivative drafting requires the parent AnA; worker tools cannot call a model.' });
  if (!ctx?.organizationId || !ctx.userId) return JSON.stringify({ error: 'draft_authoring_document requires tenant + user context.' });
  if (!derivativeModeInput(input)) return JSON.stringify({ error: 'Derivative mode requires only an approved reference, the fixed title Reviewed derivative draft, and optional save metadata/model pin; sections and caller prose are refused.' });
  const pinned = derivativeRequestSnapshot(input), actor = { ...ctx };
  try {
    const programId = await resolveOpenProgram(pool, actor);
    if (!programId) return JSON.stringify({ error: DRAFT_AUTHORING_DOCUMENT_NO_PROJECT });
    const email = await actorEmail(pool, Number(actor.userId));
    const scope = await authorizeAuthoringProgram(pool, { tenantId: Number(actor.organizationId), actor: { id: String(actor.userId), email }, programId });
    const saveInput = reviewedSaveInput(pinned);
    const checked = parseDraftInput({ ...saveInput, programId, provenance: { source: 'ana' } });
    if (!checked.ok) return JSON.stringify({ error: checked.error });
    const { getAnaDraftingService } = await import('../ana/AnaDocumentDraftingService');
    const response = await getAnaDraftingService().draftDocument({ organizationId: Number(actor.organizationId), userId: Number(actor.userId),
      projectId: scope.projectId, contextSqlClient: pool, derivativeId: pinned.derivativeId as string,
      framework: 'general_regulatory', sectionType: 'Approved derivative', instructions: '', signal: actor.signal,
      ...(pinned.qualifiedModelPin !== undefined ? { qualifiedModelPin: pinned.qualifiedModelPin as import('../ai-gateway/types').QualifiedModelPin } : {}) });
    if (!completeDerivativeResponse(response, pinned.derivativeId as string)) {
      return JSON.stringify({ error: 'The derivative output has no complete, verified generation receipt. Nothing was saved.' });
    }
    const verification = response.derivativeVerification, receipt = response.derivativeGeneration;
    const identity = { organizationId: Number(actor.organizationId), userId: Number(actor.userId), projectId: scope.projectId, derivativeId: pinned.derivativeId as string };
    const generatedDerivative: NonNullable<AnaDraftOptions['generatedDerivative']> = {
      receipt: { ...receipt }, derivativeId: identity.derivativeId, payloadSha256: verification.payloadSha256, rawContent: response.content,
      reserve: async q => {
        const { authorizeDerivativeUse } = await import('../ai-gateway/providers/org-placement-writer');
        const current = await authorizeDerivativeUse({ query: q.query.bind(q), connect: pool.connect.bind(pool) }, identity);
        if (current.derivativeId !== identity.derivativeId || current.payloadSha256 !== verification.payloadSha256) throw new Error('Current derivative custody changed before creation.');
      },
    };
    actor.signal?.throwIfAborted();
    const result = await createAnaDraft(pool, { ...saveInput, sections: [{ code: '1', title: REVIEWED_DERIVATIVE_TITLE, content: plainTextToHtml(response.content) }] }, actor,
      { tool: 'draft_authoring_document', noProjectRefusal: DRAFT_AUTHORING_DOCUMENT_NO_PROJECT, generatedDerivative });
    if ('error' in result || !('saved' in result)) return JSON.stringify(result);
    return JSON.stringify({ status: result.status, saved: result.saved, documentStatus: result.documentStatus,
      authoringDocId: result.authoringDocId, programId: result.programId, title: REVIEWED_DERIVATIVE_TITLE, sectionCount: result.sectionCount,
      projectSourceReferences: [], content: '# Reviewed derivative draft\n\nSaved in the project editor. Restricted specifics remain in the document.',
      message: 'Saved the reviewed derivative draft in the existing editor. Local token round-trip verification is recorded; independent review, approval and filing remain separate.' });
  } catch {
    return JSON.stringify({ error: 'Reviewed derivative drafting or current generation provenance could not be verified. No new saved document is confirmed.' });
  }
}

/** The refusal, verbatim, when no project is open. */
export const SAVE_DOCUMENT_NO_PROJECT =
  'save_document_to_vault needs an open project — every AnA draft is filed under one. Open or select a project, then ask again.';

/**
 * `save_document_to_vault` — the single-body form of `draft_authoring_document`
 * (document store consolidation step 2, docs/design/DOCUMENT_STORE_CONSOLIDATION.md,
 * 2026-10-17).
 *
 * It used to insert a `concept2cure_artifacts` row, so a draft AnA said it had
 * saved was in no store the editor or the Vault reads. It now creates an
 * authoring draft through the same path as `draft_authoring_document`: one
 * section holding the body, the person's stated reason as the CREATE reason
 * for change, AnA's machine-draft lineage and provenance as that path records
 * them. It never writes `vault.documents`: AnA prose is not governed content
 * without a passed PQ (P-30, docs/MODEL_GOVERNANCE_DECISION_2026-10-13.md), so
 * filing stays a person's step and the reply says the draft is not in the Vault.
 * The tool keeps its name because confirmations, plans and transcripts carry it.
 */
export async function saveDocumentToVaultTool(
  pool: AuthoringPool,
  input: Record<string, unknown>,
  ctx: DraftToolContext | undefined,
  reason: string,
): Promise<string> {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const content = typeof input.content === 'string' ? input.content : '';
  if (!title) return JSON.stringify({ error: 'title (string) is required.' });
  if (!content) return JSON.stringify({ error: 'content (string) is required.' });
  const ctd = typeof input.ctd_section === 'string' && input.ctd_section.trim() ? input.ctd_section.trim() : null;
  const category = typeof input.category === 'string' && input.category.trim() ? input.category.trim() : null;
  const out = await createAnaDraft(pool, {
    title,
    ...(category ? { documentType: category } : {}),
    // Plain text is stored as the editor's HTML, escaped (shared/authoring/plain-text-html.ts).
    sections: [{ code: ctd ?? '1', title, content: looksLikeHtml(content) ? content : plainTextToHtml(content) }],
  }, ctx, { tool: 'save_document_to_vault', noProjectRefusal: SAVE_DOCUMENT_NO_PROJECT, changeReason: reason });
  if ('error' in out) return JSON.stringify(out);
  return JSON.stringify({
    ...out,
    ok: true,
    filed_in_vault: false,
    message:
      `Saved '${title}' as an AnA draft in the editor (authoring document ${out.authoringDocId}, one section). ` +
      'It is not filed in the Vault; a person files it from the editor.' +
      unverifiedFigureNote(out.projectSourceReferences),
  });
}
