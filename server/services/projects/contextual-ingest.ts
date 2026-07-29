/**
 * Contextual Retrieval ingest (Projects spec A3).
 *
 * Splits an uploaded document into overlapping chunks and, for each chunk,
 * generates a short situating context via the AI gateway and PREPENDS it before
 * embedding (Anthropic "Contextual Retrieval"). Each contextualized chunk is
 * stored as a lumen_data_atoms row linked to the source artifact, so the
 * existing project-scoped hybrid search (dense pgvector + query-time tsvector)
 * retrieves it with no retrieval-side change.
 *
 * Dark-launched: the upload path calls this only when
 * PROJECT_CONTEXTUAL_INGEST_ENABLED=true. The per-chunk gateway calls cost
 * tokens at ingest, so the cost/quality must be validated against real models
 * before enabling. Additive: the whole-document atom still exists; chunks are
 * extra rows. Every function is graceful and never throws into the upload path.
 *
 * @module server/services/projects/contextual-ingest
 */
import { pool } from '../../db.js';
import { getGateway } from '../ai-gateway/gateway.js';

export interface TextChunk {
  ordinal: number;
  text: string;
  start: number;
  end: number;
}

export interface ChunkOptions {
  size?: number;
  overlap?: number;
  maxChunks?: number;
}

const CHUNK_DEFAULTS = { size: 1800, overlap: 200, maxChunks: 200 };
const MAX_EXCERPT_CHARS = 4000;
const MAX_ATOM_CHARS = 16000;

/** Split text into overlapping character chunks. Pure and unit-testable. */
export function chunkText(text: string, opts: ChunkOptions = {}): TextChunk[] {
  const size = opts.size ?? CHUNK_DEFAULTS.size;
  const overlap = opts.overlap ?? CHUNK_DEFAULTS.overlap;
  const maxChunks = opts.maxChunks ?? CHUNK_DEFAULTS.maxChunks;
  const clean = (text || '').trim();
  if (!clean || size <= 0) return [];
  const step = Math.max(1, size - Math.max(0, overlap));
  const chunks: TextChunk[] = [];
  let start = 0;
  let ordinal = 0;
  while (start < clean.length && chunks.length < maxChunks) {
    const end = Math.min(clean.length, start + size);
    chunks.push({ ordinal: ordinal++, text: clean.slice(start, end), start, end });
    if (end >= clean.length) break;
    start += step;
  }
  return chunks;
}

/** Build the gateway messages that situate a chunk. Pure and unit-testable. */
export function buildContextMessages(docTitle: string, docExcerpt: string, chunk: string) {
  return [
    {
      role: 'system' as const,
      content:
        'You situate a chunk of a document for a retrieval index. Reply with one or two ' +
        'sentences (about 50-100 tokens) stating what the chunk is about and where it sits ' +
        'in the document. No preamble, no quotation marks.',
    },
    {
      role: 'user' as const,
      content:
        `Document title: ${docTitle || 'Untitled'}\n\n` +
        `Document excerpt (for orientation):\n${docExcerpt}\n\n` +
        `Chunk to situate:\n${chunk}`,
    },
  ];
}

/** Generate a situating context for one chunk via the gateway. Graceful: '' on error. */
export async function generateChunkContext(
  docTitle: string,
  fullText: string,
  chunk: string
): Promise<string> {
  try {
    const gw = getGateway();
    if (!gw || gw.getEnabledProviders().length === 0) return '';
    const excerpt =
      fullText.length > MAX_EXCERPT_CHARS ? fullText.slice(0, MAX_EXCERPT_CHARS) : fullText;
    const resp = await gw.route({
      taskType: 'summarization',
      messages: buildContextMessages(docTitle, excerpt, chunk),
      maxTokens: 120,
      temperature: 0,
      callerModule: 'project-contextual-ingest',
    });
    return (resp?.content || '').trim();
  } catch (err: any) {
    console.warn(
      '[projects] chunk context generation failed (embedding without context):',
      err?.message
    );
    return '';
  }
}

export interface ContextualChunk {
  ordinal: number;
  contextualizedText: string;
}

type ContextGenerator = (docTitle: string, fullText: string, chunk: string) => Promise<string>;

/**
 * Chunk + contextualize a document. The context generator is injected for
 * testability (defaults to the gateway-backed generateChunkContext). Chunks are
 * processed in small batches to bound concurrency; each chunk's context is
 * prepended to its text (Contextual Embeddings).
 */
export async function contextualizeDocument(
  docTitle: string,
  fullText: string,
  opts: ChunkOptions = {},
  genContext: ContextGenerator = generateChunkContext,
  batchSize = 4
): Promise<ContextualChunk[]> {
  const chunks = chunkText(fullText, opts);
  if (chunks.length === 0) return [];
  const out: ContextualChunk[] = [];
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const contexts = await Promise.all(
      batch.map(c => genContext(docTitle, fullText, c.text).catch(() => ''))
    );
    batch.forEach((c, j) => {
      const ctx = (contexts[j] || '').trim();
      out.push({
        ordinal: c.ordinal,
        contextualizedText: ctx ? `${ctx}\n\n${c.text}` : c.text,
      });
    });
  }
  return out;
}

/**
 * Full ingest: chunk + contextualize a document, store each chunk as a
 * lumen_data_atoms row linked to the source artifact, and embed it. The
 * existing project-scoped hybrid search reads these atoms with no change.
 * Never throws. Returns the number of chunk atoms stored.
 */
export async function ingestContextualChunks(params: {
  artifactId: string;
  organizationId: number;
  title: string;
  text: string;
  ctdSection?: string | null;
}): Promise<{ chunks: number }> {
  const { artifactId, organizationId, title, text } = params;
  if (!artifactId || !Number.isFinite(organizationId) || organizationId <= 0) return { chunks: 0 };
  try {
    const contextual = await contextualizeDocument(title, text);
    if (contextual.length === 0) return { chunks: 0 };
    const { getEmbeddingService } = await import('../enhancedEmbeddingService.js');
    const embeddingService = getEmbeddingService(pool);
    let stored = 0;
    for (const c of contextual) {
      try {
        const res = await pool.query(
          `INSERT INTO lumen_data_atoms
             (organization_id, source_type, source_id, atom_type, title, content, tags, confidence, status)
           VALUES ($1, 'data_room_upload', $2, 'source_chunk', $3, $4, $5, 0.9, 'active')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            organizationId,
            artifactId,
            `${title || 'Untitled'} (chunk ${c.ordinal + 1})`,
            c.contextualizedText.slice(0, MAX_ATOM_CHARS),
            `{source,upload,chunk${params.ctdSection ? `,${params.ctdSection}` : ''}}`,
          ]
        );
        if (res.rows.length > 0) {
          await embeddingService.embedAtom(res.rows[0].id);
          stored++;
        }
      } catch (chunkErr: any) {
        console.warn('[projects] chunk atom insert/embed failed (skipping):', chunkErr?.message);
      }
    }
    return { chunks: stored };
  } catch (err: any) {
    console.warn('[projects] contextual ingest failed (non-fatal):', err?.message);
    return { chunks: 0 };
  }
}
