/**
 * The one writer of a chat upload's retrieval atom — and the one place that
 * says how much of the file it actually holds.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * Both embedding paths in `server/routes/chat/upload.ts` did the same thing:
 *
 *     const boundedContent = extractedText.substring(0, 16000);
 *     INSERT INTO lumen_data_atoms (… content …) VALUES (… boundedContent …)
 *     await embeddingService.embedAtom(atomId);
 *
 * One atom per file, carrying its first 16,000 characters. A clinical protocol
 * runs 300–600 KB of extracted text, so that is roughly the first four pages of
 * a hundred and fifty. The rest was not embedded, not stored, and not
 * recoverable from the atom — and nothing anywhere recorded that the row was a
 * prefix. A retrieval hit returned those 16,000 characters AS the document's
 * content, so the honest answer ("I have the opening of this file and nothing
 * else") was one the model had no way to give.
 *
 * That is the complaint this whole workstream started from, implemented as a
 * data pipeline: grab a page, call it the document.
 *
 * ── What this changes, and what it does not ─────────────────────────────────
 * It does NOT make the whole file retrievable. That capability already exists
 * and is canonical: filing a chat upload into the vault
 * (`file_chat_upload_to_vault` → `vault-ingest.service`) chunks and embeds every
 * character of it with page numbers, through `chunkDocumentForIngest`. Building
 * a second chunk store here would be the parallel path the working agreement
 * forbids — and `vault.document_chunks.document_id` carries a hard foreign key
 * to `vault.documents`, so an unfiled upload cannot join that index anyway.
 *
 * What it changes is that the prefix now knows it is a prefix. The atom records
 * what the file holds and what was embedded, so every reader above it can say
 * so instead of treating the row as the document.
 *
 * @module server/services/chat-uploads/upload-retrieval-atom
 */

import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('upload-retrieval-atom');

/**
 * How much of an upload goes into one atom.
 *
 * Unchanged from the two literals it replaces: an atom is a single embedding,
 * and an embedding over more text than this stops discriminating between the
 * passages inside it. The limit is not the defect — pretending it is not there
 * was.
 */
export const ATOM_CONTENT_LIMIT = 16_000;

/** What an atom holds, against what the file holds. */
export interface AtomContentBounds {
  content: string;
  /** Characters of extracted text the file yielded. */
  extractedChars: number;
  /** Characters this atom carries. */
  embeddedChars: number;
  /** True when the file is longer than the atom. */
  truncated: boolean;
}

/**
 * Cut the extracted text down to one atom, at a paragraph or sentence boundary
 * when one is available near the limit.
 *
 * Pure, so the arithmetic every caller reports is testable without a database.
 *
 * The boundary is not cosmetic. `substring(0, 16000)` ends mid-sentence, and a
 * fragment ending "the primary endpoint is the proportion of subjects who" is
 * embedded as a claim it does not make. Cutting at the last paragraph break in
 * the final tenth of the window costs a few hundred characters and keeps every
 * sentence in the atom a complete one; when there is no such break — a table
 * dump, a single wall of text — the hard cut stands, because a short atom is
 * worse than an inelegant one.
 */
export function boundAtomContent(text: string, limit = ATOM_CONTENT_LIMIT): AtomContentBounds {
  const extractedChars = text.length;
  if (extractedChars <= limit) {
    return { content: text, extractedChars, embeddedChars: extractedChars, truncated: false };
  }
  const window = text.slice(0, limit);
  const floor = Math.floor(limit * 0.9);
  const boundary = Math.max(
    window.lastIndexOf('\n\n'),
    window.lastIndexOf('. '),
    window.lastIndexOf('.\n'),
  );
  const content = boundary >= floor ? window.slice(0, boundary + 1) : window;
  return { content, extractedChars, embeddedChars: content.length, truncated: true };
}

/** The `structured_data` an atom carries so its own row says what it is. */
export function atomRetrievalRecord(bounds: AtomContentBounds): Record<string, unknown> {
  return {
    retrieval: {
      extractedChars: bounds.extractedChars,
      embeddedChars: bounds.embeddedChars,
      truncated: bounds.truncated,
      /* Written into the row rather than left to a reader's inference: the
         remedy is a different pipeline, not a bigger limit. */
      note: bounds.truncated
        ? 'This atom holds the opening of the file only. File the upload into the vault to index ' +
          'all of it, chunked and page-numbered, via the canonical vault ingest.'
        : 'This atom holds the whole extracted text of the file.',
    },
  };
}

/** Minimal query surface — the route's pool and a pooled client both fit. */
export interface AtomQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface UploadAtomArgs {
  organizationId: number;
  /** The atom's idempotency key: an artifact id, `cre_source:<id>` or `upload:<id>`. */
  sourceId: string;
  fileName: string;
  /** Full extracted text. Bounding happens here, not at the call site. */
  text: string;
  tags: string[];
}

export interface UploadAtomResult extends AtomContentBounds {
  /** The row written, or null when one already existed for this source. */
  atomId: number | null;
  /** Whether the embedding was written. A failure here is not fatal. */
  embedded: boolean;
}

/**
 * Write (idempotently) and embed the retrieval atom for one upload.
 *
 * The two call sites differed only in their guard — `ON CONFLICT DO NOTHING`
 * against a constraint on one path, `WHERE NOT EXISTS` on the other — and the
 * `WHERE NOT EXISTS` form is the one that holds regardless of which unique
 * constraints a given database carries, so it is the one kept.
 *
 * Never throws: an upload that cannot be embedded is still an upload, and the
 * routes both treated embedding failure as non-fatal. The failure is logged
 * with the file it belongs to rather than swallowed.
 */
export async function writeUploadRetrievalAtom(
  db: AtomQueryable,
  args: UploadAtomArgs,
): Promise<UploadAtomResult> {
  const bounds = boundAtomContent(args.text);
  try {
    const { rows } = await db.query(
      `INSERT INTO lumen_data_atoms
         (organization_id, source_type, source_id, atom_type, title, content,
          structured_data, tags, confidence, status)
       SELECT $1, 'chat_upload', $2, 'source_document', $3, $4, $5::json, $6::text[], 0.85, 'active'
        WHERE NOT EXISTS (
          SELECT 1 FROM lumen_data_atoms WHERE organization_id = $1 AND source_id = $2
        )
       RETURNING id`,
      [
        args.organizationId,
        args.sourceId,
        args.fileName,
        bounds.content,
        JSON.stringify(atomRetrievalRecord(bounds)),
        args.tags,
      ],
    );
    if (rows.length === 0) return { ...bounds, atomId: null, embedded: false };
    const atomId = Number(rows[0].id);
    try {
      const { getEmbeddingService } = await import('../enhancedEmbeddingService.js');
      /* The id goes down as the number the insert returned. It used to be
         `String(atomId)`, on the note that "embedAtom takes the id as a string
         (it interpolates into a parameterized read)" — which is not what
         embedAtom does: `WHERE id = $1` is a bound parameter, nothing is
         interpolated, and `lumen_data_atoms.id` is `serial`. Every other caller
         of embedAtom passes the row id as it came back (contextual-ingest,
         c2c/artifacts, c2c/knowledge-sources); this one round-tripped it
         through Number() and straight back to a string, so the same capability
         reached the same function in two shapes for no reason. */
      await getEmbeddingService(db as any).embedAtom(atomId);
      return { ...bounds, atomId, embedded: true };
    } catch (err) {
      logger.warn('Upload atom written but not embedded — it is not retrievable yet', {
        sourceId: args.sourceId,
        atomId,
        err: err instanceof Error ? err.message : String(err),
      });
      return { ...bounds, atomId, embedded: false };
    }
  } catch (err) {
    logger.warn('Upload retrieval atom could not be written', {
      sourceId: args.sourceId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ...bounds, atomId: null, embedded: false };
  }
}
