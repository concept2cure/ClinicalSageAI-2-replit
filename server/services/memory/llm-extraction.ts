/**
 * LLM-based memory-atom extraction (gateway-routed).
 *
 * Closes the gap flagged in the OSS AI tooling review: the client/project
 * intelligence memory extractors were labelled "AI-powered" but were purely
 * regex/keyword heuristics. This module performs genuine LLM extraction through
 * the governed AI gateway — so every call is audited (model, prompt hash,
 * tenant), PII/PHI-screened, and approved-models-gated — and returns a
 * validated set of memory-entry drafts. The caller keeps the existing heuristic
 * extractor as a deterministic fallback, so extraction degrades gracefully when
 * no model is configured (e.g. an air-gapped deployment without a local model)
 * or the gateway rejects the request.
 *
 * @module server/services/memory/llm-extraction
 */
import { z } from 'zod';

export interface MemoryEntryDraft {
  category: string;
  subcategory: string;
  title: string;
  content: string;
  confidenceScore: number;
  importanceLevel: string;
}

const IMPORTANCE_LEVELS = new Set(['low', 'medium', 'high']);
const DEFAULT_CONFIDENCE = 0.6;
const MAX_ENTRIES = 40;
const MAX_INPUT_CHARS = 24000;

/** JSON-schema handed to the gateway for structured-output providers. */
export const MEMORY_ENTRIES_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['entries'],
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'subcategory', 'title', 'content', 'confidenceScore', 'importanceLevel'],
        properties: {
          category: { type: 'string' },
          subcategory: { type: 'string' },
          title: { type: 'string' },
          content: { type: 'string' },
          confidenceScore: { type: 'number' },
          importanceLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
      },
    },
  },
};

const RawEntrySchema = z.object({
  category: z.string().trim().min(1).max(64),
  subcategory: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(4000),
  confidenceScore: z.coerce.number().catch(DEFAULT_CONFIDENCE),
  importanceLevel: z.string().trim().catch('medium'),
});

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CONFIDENCE;
  return Math.min(1, Math.max(0, n));
}

function normalizeImportance(v: string): string {
  const s = v.toLowerCase();
  return IMPORTANCE_LEVELS.has(s) ? s : 'medium';
}

/** Pull a JSON body out of a raw model response (tolerates ```json fences). */
function extractJsonBlock(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : raw).trim();
}

/**
 * Parse + validate a model response into memory-entry drafts. Pure and
 * defensive: never throws, drops malformed entries, clamps confidence to
 * [0,1], normalizes importanceLevel to low|medium|high, and caps the count.
 * Accepts either a bare array or a `{ "entries": [...] }` envelope.
 */
export function parseMemoryEntries(raw: string, opts?: { max?: number }): MemoryEntryDraft[] {
  const max = opts?.max ?? MAX_ENTRIES;
  if (!raw || !raw.trim()) return [];

  let data: unknown;
  try {
    data = JSON.parse(extractJsonBlock(raw));
  } catch {
    return [];
  }

  let list: unknown = null;
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === 'object' && Array.isArray((data as { entries?: unknown }).entries)) {
    list = (data as { entries: unknown[] }).entries;
  }
  if (!Array.isArray(list)) return [];

  const out: MemoryEntryDraft[] = [];
  for (const item of list) {
    const parsed = RawEntrySchema.safeParse(item);
    if (!parsed.success) continue;
    const e = parsed.data;
    out.push({
      category: e.category,
      subcategory: e.subcategory,
      title: e.title,
      content: e.content,
      confidenceScore: clamp01(e.confidenceScore),
      importanceLevel: normalizeImportance(e.importanceLevel),
    });
    if (out.length >= max) break;
  }
  return out;
}

const SYSTEM_PROMPT =
  'You are a regulatory-intelligence analyst extracting durable "memory atoms" about a ' +
  'life-sciences organization from an uploaded document. Extract only facts explicitly ' +
  'supported by the text — never invent. Return STRICT JSON matching the schema: an object ' +
  'with an "entries" array, where each entry has category, subcategory, title, content, ' +
  'confidenceScore (0-1), and importanceLevel (one of low|medium|high). Prefer fewer, ' +
  'higher-quality entries over many weak ones.';

export interface MemoryExtractionInput {
  kind: 'client' | 'project';
  text: string;
  fileName: string;
  subjectName: string;
  organizationId: number;
  userId: number;
}

/** The user-turn prompt for a single document extraction. */
export function buildExtractionPrompt(input: {
  kind: 'client' | 'project';
  fileName: string;
  subjectName: string;
  text: string;
}): string {
  const scope =
    input.kind === 'project'
      ? `project "${input.subjectName}"`
      : `client organization "${input.subjectName}"`;
  return [
    `Subject: ${scope}`,
    `Source document: ${input.fileName}`,
    'Suggested categories: persona, pipeline, regulatory, clinical, competitive, operational, commercial.',
    'Return JSON of the form { "entries": [...] }. Reference the source file in each entry where useful.',
    '',
    '--- DOCUMENT TEXT (truncated) ---',
    input.text.slice(0, MAX_INPUT_CHARS),
  ].join('\n');
}

/**
 * Extract memory entries from document text via the governed AI gateway.
 * Returns null on any failure (no model configured, gateway policy rejection,
 * timeout) so the caller can fall back to the deterministic heuristic extractor.
 */
export async function extractMemoryEntriesViaGateway(
  input: MemoryExtractionInput,
): Promise<MemoryEntryDraft[] | null> {
  try {
    const { getGateway } = await import('../ai-gateway/gateway.js');
    const gateway = getGateway();
    const result = await gateway.route({
      taskType: 'document_analysis',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildExtractionPrompt(input) },
      ],
      maxTokens: 2000,
      temperature: 0.1,
      jsonMode: true,
      jsonSchema: MEMORY_ENTRIES_JSON_SCHEMA,
      organizationId: input.organizationId,
      userId: input.userId,
      callerModule: `client-intelligence-memory:extract:${input.kind}`,
      metadata: { fileName: input.fileName, kind: input.kind },
    });
    const content = result?.content || '';
    return parseMemoryEntries(content);
  } catch (err: any) {
    console.warn(
      '[memory.llm-extraction] gateway extraction failed; falling back to heuristics:',
      err?.message || err,
    );
    return null;
  }
}

/**
 * Whether LLM extraction is enabled for this deployment. On by default; set
 * MEMORY_LLM_EXTRACTION_ENABLED=false to force heuristic-only extraction.
 */
export function isLlmMemoryExtractionEnabled(): boolean {
  return process.env.MEMORY_LLM_EXTRACTION_ENABLED !== 'false';
}

/** Injectable dependencies for resolveMemoryEntries (defaults to real impls). */
export interface ResolveMemoryDeps {
  extract?: (input: MemoryExtractionInput) => Promise<MemoryEntryDraft[] | null>;
  enabled?: () => boolean;
}

/**
 * Resolve memory entries for a document: try governed LLM extraction first
 * (audited, tenant-scoped), and fall back to the caller's deterministic
 * heuristic extractor when LLM extraction is disabled, unavailable, or returns
 * nothing. Dependencies are injectable for testing; production callers pass
 * only the input + heuristic.
 */
export async function resolveMemoryEntries(
  input: MemoryExtractionInput & { heuristic: () => MemoryEntryDraft[] },
  deps: ResolveMemoryDeps = {},
): Promise<MemoryEntryDraft[]> {
  const enabled = deps.enabled ?? isLlmMemoryExtractionEnabled;
  const extract = deps.extract ?? extractMemoryEntriesViaGateway;
  if (enabled()) {
    const llm = await extract(input);
    if (llm && llm.length > 0) return llm;
  }
  return input.heuristic();
}
