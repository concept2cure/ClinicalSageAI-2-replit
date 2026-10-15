/** The existing catalog tool's two input branches and preview forwarding.
 * Authority stays with canonical services; this module adds no tool or store. */
import type { ToolContext } from './AnaToolExecutor.js';
import type { CatalogService } from './document-tools-shared.js';
import { CHAT_UPLOAD_ID, unknownDocumentRefusal } from './document-tools-shared.js';
import { catalogScope } from './catalog-scope.js';
import { RESULT_BUDGET } from './agentic-loop.js';

interface CatalogInput {
  recordType: 'description'; documentId: string; documentKind: string;
  purpose: string; summary: string; keyData: Record<string, unknown> | null;
}
interface PreviewInput { recordType: 'verification_preview'; documentId: string; candidates: unknown[] }
type InputError = { ok: false; code: 'INVALID_CATALOG_INPUT'; error: string };
const invalid = (error: string): InputError => ({ ok: false, code: 'INVALID_CATALOG_INPUT', error });
const str = (v: unknown): string => typeof v === 'string' ? v.trim() : '';

function parsePreview(input: Record<string, unknown>, documentId: string): PreviewInput | InputError {
  const allowed = new Set(['document_id', 'record_type', 'fact_candidates']);
  if (Object.keys(input).some(key => !allowed.has(key))) return invalid('Verification preview accepts only document_id, record_type and fact_candidates; no write, review or actor fields.');
  if (!documentId || !Array.isArray(input.fact_candidates) || input.fact_candidates.length < 1 || input.fact_candidates.length > 50) {
    return invalid('Verification preview requires document_id and 1 to 50 fact_candidates.');
  }
  return { recordType: 'verification_preview', documentId, candidates: input.fact_candidates };
}

function parseDescription(input: Record<string, unknown>, documentId: string): CatalogInput | InputError {
  if (Object.hasOwn(input, 'fact_candidates')) return invalid('fact_candidates requires explicit record_type verification_preview; facts cannot be saved as legacy key_data.');
  const data = input.key_data;
  if (data !== undefined && data !== null && (typeof data !== 'object' || Array.isArray(data))) return invalid('key_data must be an object or null.');
  const documentKind = str(input.document_kind), purpose = str(input.purpose), summary = str(input.summary);
  if (![documentId, documentKind, purpose, summary].every(Boolean)) {
    return invalid('catalog_project_document requires document_id, document_kind, purpose and summary (non-empty strings).');
  }
  return { recordType: 'description', documentId, documentKind, purpose, summary, keyData: (data as Record<string, unknown> | null | undefined) ?? null };
}

export function parseCatalogInput(input: Record<string, unknown>): CatalogInput | PreviewInput | InputError {
  const documentId = str(input.document_id);
  const mode = input.record_type === undefined ? 'description' : input.record_type;
  if (mode !== 'description' && mode !== 'verification_preview') return invalid('record_type must be description or verification_preview.');
  return mode === 'verification_preview' ? parsePreview(input, documentId) : parseDescription(input, documentId);
}

export async function handleCatalogPreview(parsed: PreviewInput, svc: CatalogService, orgId: number, ctx?: ToolContext): Promise<string> {
  if (!svc.isSourceFactPreviewEnabled()) return JSON.stringify({ ok: false, code: 'SOURCE_FACT_PREVIEW_DISABLED', persisted: false, error: 'Source-fact verification previews are not enabled.' });
  if (!ctx?.userId || !Number.isSafeInteger(ctx.userId) || ctx.userId <= 0) return JSON.stringify({ ok: false, code: 'CATALOG_ACTOR_REQUIRED', persisted: false, error: 'An identified current organization member is required.' });
  if (CHAT_UPLOAD_ID.test(parsed.documentId)) return unknownDocumentRefusal(parsed.documentId, 'catalog_project_document');
  const scope = await catalogScope(ctx, orgId, null, 'read');
  if ('error' in scope) return JSON.stringify({ ok: false, code: scope.code, error: scope.error, persisted: false });
  if (!scope.programId) return JSON.stringify({ ok: false, code: 'NO_PROJECT', persisted: false, error: 'Open the document’s project before requesting source verification.' });
  const encoded = JSON.stringify(await svc.previewSourceFacts({ documentId: parsed.documentId, organizationId: orgId, userId: ctx.userId, programId: scope.programId, candidates: parsed.candidates }));
  if (encoded.length > RESULT_BUDGET) return JSON.stringify({ ok: false, code: 'SOURCE_FACT_PREVIEW_RESPONSE_TOO_LARGE', persisted: false, reviewState: 'not_recorded', scientificQualification: 'unassessed', error: 'The complete diagnostic preview does not fit this response. Request fewer candidates; no preview results were clipped or saved.' });
  return encoded;
}
