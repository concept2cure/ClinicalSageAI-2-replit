/**
 * Anthropic Files API Integration — PDF Citation Support
 *
 * Wraps Anthropic's beta Files API so uploaded PDFs can be referenced by
 * file_id in message content blocks rather than re-base64'd on every turn.
 * Enables native citation emission: when Claude references a document, it
 * returns citation content blocks pointing to specific pages.
 *
 * This is the infrastructure half of the PDF citation feature. Production
 * enablement additionally requires:
 *   1. Env flag: ANA_ENABLE_PDF_CITATIONS=true
 *   2. Beta header: anthropic-beta: files-api-2025-04-14 (handled here)
 *   3. Actual PDF bytes persisted by the upload handler (today's upload.ts
 *      only stores metadata; it would need multer disk storage or a blob
 *      column to hold the bytes).
 *   4. An anthropic_file_id cache mapping file_uploads.id → Anthropic
 *      file_id (avoids re-upload on every turn). Can live in an
 *      additional column on file_uploads or a side table.
 *
 * For now this module ships the helpers; the wiring into the chat paths
 * lives alongside it, env-gated so the default behavior is unchanged.
 *
 * @module server/services/anthropic-files
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getAnthropicClient } from './anthropic-client.js';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('anthropic-files');

const FILES_API_BETA = 'files-api-2025-04-14';

/** Canonical mime types the Files API + citations pipeline handles. */
export const CITABLE_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
]);

export function isCitableFile(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return CITABLE_MIME_TYPES.has(mimeType.toLowerCase());
}

export function isPdfCitationsEnabled(): boolean {
  return process.env.ANA_ENABLE_PDF_CITATIONS === 'true';
}

/**
 * Upload a file buffer to Anthropic's Files API. Returns the Anthropic
 * file_id which can be referenced in document content blocks.
 *
 * Throws on API failure — callers should wrap in try/catch and fall back
 * to inline base64 or metadata-only context depending on severity.
 */
export async function uploadFileToAnthropic(params: {
  data: Buffer | Uint8Array;
  filename: string;
  mimeType: string;
}): Promise<string> {
  if (!isPdfCitationsEnabled()) {
    throw new Error('PDF citations feature is not enabled (ANA_ENABLE_PDF_CITATIONS=false)');
  }

  const client = getAnthropicClient();
  const { data, filename, mimeType } = params;

  // The SDK's Uploadable type accepts Buffer/Blob/File; Node Buffer is fine.
  // Construct a File-like object: the SDK converts Buffer → FormData internally.
  const blob = new Blob([data], { type: mimeType });
  const file = new File([blob], filename, { type: mimeType });

  const response = await (client as any).beta.files.upload(
    { file },
    { headers: { 'anthropic-beta': FILES_API_BETA } },
  );

  if (!response?.id) {
    throw new Error('Anthropic Files API upload returned no file id');
  }

  logger.info(`[anthropic-files] uploaded ${filename} (${mimeType}) → ${response.id}`);
  return response.id as string;
}

/**
 * Delete a file previously uploaded to Anthropic's Files API. Used for
 * cleanup when a file_upload row is deleted locally.
 */
export async function deleteAnthropicFile(fileId: string): Promise<void> {
  if (!isPdfCitationsEnabled()) return;
  try {
    const client = getAnthropicClient();
    await (client as any).beta.files.delete(fileId, undefined, {
      headers: { 'anthropic-beta': FILES_API_BETA },
    });
  } catch (err) {
    logger.warn(
      `[anthropic-files] delete failed for ${fileId}: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }
}

/**
 * Build a document content block referencing an Anthropic file_id, with
 * citations enabled so the model's responses include page-scoped citation
 * blocks. This is the shape to spread into a `messages[].content` array
 * when the user attaches a citable PDF.
 */
export interface DocumentBlockWithCitations {
  type: 'document';
  source: {
    type: 'file';
    file_id: string;
  };
  title?: string;
  context?: string;
  citations?: { enabled: boolean };
}

export function buildDocumentBlockForFile(params: {
  anthropicFileId: string;
  title?: string;
  context?: string;
}): DocumentBlockWithCitations {
  return {
    type: 'document',
    source: {
      type: 'file',
      file_id: params.anthropicFileId,
    },
    ...(params.title ? { title: params.title } : {}),
    ...(params.context ? { context: params.context } : {}),
    citations: { enabled: true },
  };
}

/**
 * Read the raw bytes of a local upload. Today's upload.ts stores metadata
 * but doesn't always persist the buffer — this helper is defensive and
 * returns null when the path doesn't exist, so callers can fall back to
 * metadata-only context.
 */
export async function readLocalUploadBuffer(storagePath: string): Promise<Buffer | null> {
  try {
    // Resolve relative paths against CWD — matches how upload.ts writes
    // `uploads/${fileId}` without an absolute prefix.
    const resolved = path.isAbsolute(storagePath)
      ? storagePath
      : path.resolve(process.cwd(), storagePath);
    return await fs.readFile(resolved);
  } catch (err) {
    logger.debug(
      `[anthropic-files] local upload not readable at ${storagePath}: ${err instanceof Error ? err.message : 'unknown'}`,
    );
    return null;
  }
}

/**
 * High-level helper for the chat paths: given a local file_uploads row,
 * return a document content block referencing an Anthropic file_id,
 * uploading the file if it hasn't been uploaded yet. Returns null when
 * citations are disabled, the mime type is not citable, or the local
 * bytes can't be read.
 *
 * Caching of (file_uploads.id → anthropic_file_id) is the caller's
 * responsibility and requires a schema column or side table — deliberately
 * out of scope for this helper so the scaffolding can ship without a
 * migration.
 */
export async function resolveDocumentBlock(params: {
  storagePath: string;
  filename: string;
  mimeType: string;
  cachedAnthropicFileId?: string | null;
}): Promise<DocumentBlockWithCitations | null> {
  if (!isPdfCitationsEnabled()) return null;
  if (!isCitableFile(params.mimeType)) return null;

  if (params.cachedAnthropicFileId) {
    return buildDocumentBlockForFile({
      anthropicFileId: params.cachedAnthropicFileId,
      title: params.filename,
    });
  }

  const buffer = await readLocalUploadBuffer(params.storagePath);
  if (!buffer) return null;

  try {
    const fileId = await uploadFileToAnthropic({
      data: buffer,
      filename: params.filename,
      mimeType: params.mimeType,
    });
    return buildDocumentBlockForFile({
      anthropicFileId: fileId,
      title: params.filename,
    });
  } catch (err) {
    logger.warn(
      `[anthropic-files] upload failed for ${params.filename}: ${err instanceof Error ? err.message : 'unknown'}`,
    );
    return null;
  }
}

/**
 * Citation content block shape emitted by Claude when document citations
 * are enabled. Flat shape suitable for forwarding to the client via SSE.
 */
export interface CitationBlock {
  readonly type: 'citation';
  readonly documentTitle?: string;
  readonly citedText?: string;
  readonly pageNumber?: number;
  readonly documentIndex?: number;
}

/**
 * Extract citation blocks from Claude's response content for transparent
 * forwarding to the client UI. Returns an empty array when no citations
 * are present (most turns).
 */
export function extractCitationsFromContent(content: unknown): CitationBlock[] {
  if (!Array.isArray(content)) return [];
  const out: CitationBlock[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const citations = (block as any).citations;
    if (!Array.isArray(citations)) continue;
    for (const c of citations) {
      out.push({
        type: 'citation',
        documentTitle: c.document_title ?? c.title,
        citedText: c.cited_text ?? c.text,
        pageNumber: typeof c.page_number === 'number' ? c.page_number : undefined,
        documentIndex: typeof c.document_index === 'number' ? c.document_index : undefined,
      });
    }
  }
  return out;
}
