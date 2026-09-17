/**
 * Shared spine for the project-document tools.
 *
 * Two tool modules sit on this: document-catalog-tools.ts (discover, read,
 * catalog, search) and document-placement-tools.ts (file it where it belongs).
 * They split because one file carrying both crossed the 500-line limit, and
 * they share these pieces because the alternative — a second copy of the
 * tenant/feature gate or of the chat-upload id refusal — is how two tools
 * start answering the same question differently.
 *
 * @module server/services/ana/document-tools-shared
 */

import type { ToolContext } from './AnaToolExecutor.js';

export const DISABLED_MESSAGE =
  'The document catalog is not enabled for this organization (feature ana.document_catalog). ' +
  'Say so plainly; do not simulate a listing.';

export type CatalogService = typeof import('../vault/document-catalog.service.js');

/**
 * A chat upload's file_id, as minted by the chat-upload route
 * (`file_<epoch>_<rand>`). Vault documents are UUIDs, so the two id spaces are
 * distinguishable on sight.
 */
export const CHAT_UPLOAD_ID = /^file_[0-9]+_[a-z0-9]+$/i;

/**
 * The refusal for a document id the vault does not hold.
 *
 * "Not found" was the only answer here, and it was wrong in the one case that
 * matters most: list_project_documents returns the org's chat uploads beside
 * its vault documents, each with the file_id that reopens it, so the obvious
 * next call carries an id these tools do not take. Answering that with
 * absence — for a file we had just listed — is the failure this whole surface
 * exists to prevent, and under the persona's client-files rule AnA would relay
 * it to the client as "your document isn't there".
 *
 * So the two cases are told apart: an id shaped like a chat upload is in the
 * wrong STORE (say which tool reads it), and anything else genuinely is not a
 * vault document this organization holds.
 */
export function unknownDocumentRefusal(documentId: string, toolName: string): string {
  if (CHAT_UPLOAD_ID.test(documentId)) {
    return JSON.stringify({
      ok: false,
      error:
        `${documentId} is a chat-uploaded file, not a vault document, so ${toolName} cannot take it. ` +
        'Read it with read_uploaded_document (or inspect_uploaded_document first, for a large one) using that same file_id. ' +
        'The file exists — do not report it as missing. Durable catalog records live on vault documents; ' +
        'file_chat_upload_to_vault files this one into the project vault so it gains one.',
      idSpace: 'chat_upload',
    });
  }
  return JSON.stringify({
    ok: false,
    error:
      `No vault document with id ${documentId} is in your organization's programs. ` +
      'Call list_project_documents to see what the project folder actually holds — vault documents carry UUID ids.',
    idSpace: 'unknown',
  });
}

/** Shared preamble: tenant present + feature on, else the honest refusal. */
export async function requireCatalog(
  ctx: ToolContext | undefined,
  toolName: string,
): Promise<{ svc: CatalogService; orgId: number } | { refusal: string }> {
  if (!ctx?.organizationId) {
    return { refusal: `${toolName} requires an organization context.` };
  }
  const svc = await import('../vault/document-catalog.service.js');
  if (!(await svc.isDocumentCatalogEnabled(ctx.organizationId))) {
    return { refusal: DISABLED_MESSAGE };
  }
  return { svc, orgId: ctx.organizationId };
}

/** Errors become structured tool results, matching the house handler style. */
export function withCaughtErrors(
  name: string,
  handler: (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>,
) {
  return async (input: Record<string, unknown>, ctx?: ToolContext): Promise<string> => {
    try {
      return await handler(input, ctx);
    } catch (err) {
      return JSON.stringify({
        error: `${name} failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  };
}

export type RegisterFn = (
  name: string,
  handler: (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>,
) => void;

