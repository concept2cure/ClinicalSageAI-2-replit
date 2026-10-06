import {
  getLatestWorkingMemoryByThread,
  isSemanticWorkingMemoryEnabled,
  searchWorkingMemorySemantic,
} from './working-memory.js';
import {
  searchMemoryEntriesSemantic,
  searchProjectMemoryEntriesSemantic,
  type SemanticMemoryHit,
} from './client-intelligence-memory.js';
import {
  orchestrateAtoms,
  DEFAULT_MEMORY_POLICY,
  SEMANTIC_WORKING_MEMORY_POLICY,
} from './memory-orchestrator.js';
import type { ClientMemoryEntry, ProjectMemoryEntry } from 'shared/schema';

/**
 * Race a promise against a timeout. If the promise doesn't resolve within `ms`
 * milliseconds the fallback value is returned instead, preventing indefinite
 * hangs when the embedding service or vector DB is slow/unreachable.
 * Clear settled timers so a successful read cannot later log a false timeout.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  label: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>(resolve => {
        timer = setTimeout(() => {
          console.warn(`[memory-context] ${label} timed out after ${ms}ms`);
          resolve(fallback);
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Per-read deadline for memory retrieval. Originally 10s for semantic reads, which
 * meant cold vector-DB requests silently ate most of the context-assembly
 * budget and returned zero atoms with no signal to the caller. 3s is still
 * generous for a healthy embedding path and fails fast when it isn't. The
 * opt-in working-memory semantic path can use two deadlines: semantic first,
 * then recency fallback. Default recency recall has just one deadline.
 */
const MEMORY_LAYER_TIMEOUT_MS = 3000;

export interface MemoryContextAssemblerInput {
  threadId: string;
  organizationId?: number;
  projectId?: number;
  query: string;
  limitPerLayer?: number;
  maxChars?: number;
  minSimilarity?: number;
  maxAgeDays?: number;
}

export type MemoryLayer = 'working_memory' | 'client_memory' | 'project_memory';

export interface MemoryAtomMetadata {
  source?: {
    documentName?: string | null;
    documentType?: string | null;
    pageOrSection?: string | null;
  };
  confidence?: number | null;
  importance?: string | null;
  isVerified?: boolean;
  extractedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RetrievedMemoryAtom {
  id: number;
  layer: MemoryLayer;
  category?: string;
  title: string;
  content: string;
  similarity?: number;
  metadata?: MemoryAtomMetadata;
}

export type LayerOutcome = 'ok' | 'empty' | 'timeout' | 'error' | 'skipped';

export interface MemoryAssemblyDiagnostics {
  requestedLimitPerLayer: number;
  appliedMaxChars: number;
  minSimilarity: number;
  maxAgeDays: number;
  droppedByForgetting: number;
  droppedByDeduplication: number;
  trimmed: boolean;
  /** Per-layer outcome so callers can surface degraded memory assembly. */
  layerOutcomes?: {
    workingMemory: LayerOutcome;
    clientMemory: LayerOutcome;
    projectMemory: LayerOutcome;
  };
  /**
   * HOW working memory was recalled — the distinction layerOutcomes cannot
   * carry ('ok' was reported identically for a semantic hit and a recency
   * fallback, so a semantic-recall pilot produced no evidence it was actually
   * running semantically):
   *   - 'semantic'          flag on, similarity recall served the summary
   *   - 'recency_fallback'  flag ON but semantic cleared nothing (or failed),
   *                         the recency path answered — the "on but not
   *                         working" state a pilot must be able to see
   *   - 'recency'           flag off; the unchanged default path answered
   *   - 'none'              no summary recalled at all
   */
  workingMemoryMode?: 'semantic' | 'recency_fallback' | 'recency' | 'none';
  /** Wall-clock milliseconds spent in client/project semantic search in parallel. */
  semanticSearchMs?: number;
}

/**
 * One memory item that actually reached the model: rendered into the block
 * and not cut by the character budget. `atoms` is every ranked candidate;
 * this is the subset the turn really read, which is what "Used in this
 * session" may say.
 */
export interface MemoryReadEntry {
  layer: MemoryLayer;
  title: string;
  documentName?: string;
}

export interface MemoryContextAssemblerResult {
  memoryBlock: string;
  atoms: RetrievedMemoryAtom[];
  diagnostics: MemoryAssemblyDiagnostics;
  /** Items present in `memoryBlock` after trimming. Absent on fallback paths. */
  read?: MemoryReadEntry[];
}

function clampLimit(limit?: number): number {
  if (!limit || Number.isNaN(limit)) return 4;
  return Math.max(1, Math.min(limit, 10));
}

function clampChars(maxChars?: number): number {
  if (!maxChars || Number.isNaN(maxChars)) return 3500;
  return Math.max(1000, Math.min(maxChars, 12000));
}

function clampSimilarity(minSimilarity?: number): number {
  if (minSimilarity === undefined || Number.isNaN(minSimilarity)) return 0.6;
  return Math.max(0, Math.min(minSimilarity, 0.99));
}

function clampMaxAgeDays(maxAgeDays?: number): number {
  if (!maxAgeDays || Number.isNaN(maxAgeDays)) return 180;
  return Math.max(7, Math.min(maxAgeDays, 3650));
}

export function trimContent(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

function toIso(dateLike?: Date | string | null): string | undefined {
  if (!dateLike) return undefined;
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function mapClientEntryToAtom(entry: SemanticMemoryHit<ClientMemoryEntry>): RetrievedMemoryAtom {
  return {
    id: entry.id,
    layer: 'client_memory',
    category: (entry as any).category || undefined,
    title: entry.title,
    content: entry.content,
    similarity: entry.similarity,
    metadata: {
      source: {
        documentName: entry.sourceDocumentName,
        documentType: entry.sourceDocumentType,
        pageOrSection: entry.sourcePageOrSection,
      },
      confidence: entry.confidenceScore,
      importance: entry.importanceLevel,
      isVerified: Boolean(entry.isVerifiedByUser),
      extractedBy: entry.extractedBy,
      createdAt: toIso(entry.createdAt),
      updatedAt: toIso(entry.updatedAt),
    },
  };
}

function mapProjectEntryToAtom(entry: SemanticMemoryHit<ProjectMemoryEntry>): RetrievedMemoryAtom {
  return {
    id: entry.id,
    layer: 'project_memory',
    category: (entry as any).category || undefined,
    title: entry.title,
    content: entry.content,
    similarity: entry.similarity,
    metadata: {
      source: {
        documentName: entry.sourceDocumentName,
        documentType: entry.sourceDocumentType,
      },
      confidence: entry.confidenceScore,
      importance: entry.importanceLevel,
      isVerified: Boolean(entry.isVerifiedByUser),
      extractedBy: entry.extractedBy,
      createdAt: toIso(entry.createdAt),
      updatedAt: toIso(entry.updatedAt),
    },
  };
}

interface MemoryLayerRead {
  atoms: RetrievedMemoryAtom[];
  outcome: LayerOutcome;
}

interface WorkingMemoryRead extends MemoryLayerRead {
  mode: NonNullable<MemoryAssemblyDiagnostics['workingMemoryMode']>;
}

function isUnavailable(outcome: LayerOutcome): boolean {
  return outcome === 'timeout' || outcome === 'error';
}

async function readMemoryLayer(
  read: Promise<RetrievedMemoryAtom[]>,
  label: string
): Promise<MemoryLayerRead> {
  // A late read produces its own discarded result; it never appends to the
  // selected atoms or mutates the diagnostics after its deadline.
  const result = read.then<MemoryLayerRead>(atoms => ({
    atoms,
    outcome: atoms.length > 0 ? 'ok' : 'empty',
  })).catch((err: any): MemoryLayerRead => {
    if (err?.code !== '42P01') {
      console.warn('[MemoryContextAssembler] Memory layer failed:', label, err?.message);
    }
    return { atoms: [], outcome: 'error' };
  });
  return withTimeout(result, MEMORY_LAYER_TIMEOUT_MS, { atoms: [], outcome: 'timeout' }, label);
}

async function readWorkingMemory(
  input: MemoryContextAssemblerInput,
  minSimilarity: number
): Promise<WorkingMemoryRead> {
  const semanticAttempted = Boolean(
    isSemanticWorkingMemoryEnabled() && input.organizationId && input.query?.trim()
  );
  let semantic: MemoryLayerRead | undefined;
  if (semanticAttempted && input.organizationId) {
    semantic = await readMemoryLayer(
      searchWorkingMemorySemantic(input.threadId, input.organizationId, input.query, {
        limit: 1,
        minSimilarity,
      }).then(hits => hits.map((hit): RetrievedMemoryAtom => ({
        id: hit.id,
        layer: 'working_memory',
        title: 'Working memory summary',
        content: hit.summary,
        similarity: hit.similarity,
        metadata: { extractedBy: 'system', createdAt: toIso(hit.generatedAt) },
      }))),
      'Working memory semantic retrieval'
    );
    if (semantic.outcome === 'ok') return { ...semantic, mode: 'semantic' };
  }

  // Preserve semantic-first selection and its recency fallback, each bounded.
  const recency: MemoryLayerRead = input.organizationId
    ? await readMemoryLayer(
        getLatestWorkingMemoryByThread(input.threadId, input.organizationId).then<RetrievedMemoryAtom[]>(summary => summary ? [{
          id: 0,
          layer: 'working_memory',
          title: 'Latest Working Memory Summary',
          content: summary,
          metadata: { extractedBy: 'system' },
        }] : []),
        'Working memory recency retrieval'
      )
    : { atoms: [], outcome: 'empty' };
  if (recency.outcome === 'ok') {
    return { ...recency, mode: semanticAttempted ? 'recency_fallback' : 'recency' };
  }
  // Empty recency cannot establish that a timed-out/failed semantic source had
  // no relevant memory. Keep that unavailability visible to the caller/model.
  const outcome = recency.outcome === 'empty' && semantic && isUnavailable(semantic.outcome)
    ? semantic.outcome : recency.outcome;
  return { ...recency, outcome, mode: 'none' };
}

async function readSemanticLayers(
  input: MemoryContextAssemblerInput,
  limit: number,
  minSimilarity: number
) {
  const skipped: MemoryLayerRead = { atoms: [], outcome: 'skipped' };
  if (!input.organizationId || !input.query?.trim()) {
    return { client: skipped, project: skipped, semanticSearchMs: undefined };
  }
  const semanticStart = Date.now();
  const [client, project] = await Promise.all([
    readMemoryLayer(
      searchMemoryEntriesSemantic(null, input.organizationId, input.query, {
        limit,
        minSimilarity,
      }).then(result => result.entries.map(mapClientEntryToAtom)),
      'Client semantic retrieval'
    ),
    input.projectId
      ? readMemoryLayer(
          searchProjectMemoryEntriesSemantic(
            null, input.projectId, input.organizationId, input.query, { limit, minSimilarity }
          ).then(result => result.entries.map(mapProjectEntryToAtom)),
          'Project semantic retrieval'
        )
      : skipped,
  ]);
  return { client, project, semanticSearchMs: Date.now() - semanticStart };
}

function unavailableMemoryNotice(
  outcomes: NonNullable<MemoryAssemblyDiagnostics['layerOutcomes']>
): string[] {
  const layers: Array<[string, LayerOutcome]> = [
    ['Working Memory', outcomes.workingMemory],
    ['Client Memory', outcomes.clientMemory],
    ['Project Memory', outcomes.projectMemory],
  ];
  const unavailable = layers.filter(([, outcome]) => isUnavailable(outcome));
  if (!unavailable.length) return [];
  return [`## Memory retrieval incomplete\n${unavailable.map(([name, outcome]) => `${name} unavailable (${outcome})`).join('; ')}.\n` +
    'Do not infer that missing memory or prior decisions do not exist. State the retrieval limitation when relevant; ask for or verify needed context.'];
}

export async function buildMemoryContextForChat(
  input: MemoryContextAssemblerInput
): Promise<MemoryContextAssemblerResult> {
  const limit = clampLimit(input.limitPerLayer);
  const maxChars = clampChars(input.maxChars);
  const minSimilarity = clampSimilarity(input.minSimilarity);
  const maxAgeDays = clampMaxAgeDays(input.maxAgeDays);
  const [working, { client, project, semanticSearchMs }] = await Promise.all([
    readWorkingMemory(input, minSimilarity),
    readSemanticLayers(input, limit, minSimilarity),
  ]);
  const atoms = [...working.atoms, ...client.atoms, ...project.atoms];
  const layerOutcomes = {
    workingMemory: working.outcome,
    clientMemory: client.outcome,
    projectMemory: project.outcome,
  };
  const workingMemoryMode = working.mode;

  // Forget stale atoms, collapse duplicates, and rank across layers under the
  // single reviewed policy (memory-orchestrator). This module only assembles
  // and formats; the coordination policy lives there.
  const memoryPolicy = workingMemoryMode === 'semantic'
    ? SEMANTIC_WORKING_MEMORY_POLICY
    : DEFAULT_MEMORY_POLICY;
  const {
    ranked: sorted,
    droppedByForgetting,
    droppedByDeduplication,
  } = orchestrateAtoms(atoms, maxAgeDays, memoryPolicy);

  // Put unavailability ahead of recalled content so the character budget
  // cannot erase the distinction between unread and absent memory.
  const sections: string[] = unavailableMemoryNotice(layerOutcomes);
  // Each rendered item with the line that carries it, so the ones the
  // character budget cut can be told apart from the ones the model read.
  const rendered: Array<{ entry: MemoryReadEntry; line: string }> = [];

  const wm = sorted.find(a => a.layer === 'working_memory');
  if (wm) {
    sections.push(`## Working Memory\n${wm.content}`);
    rendered.push({
      entry: { layer: 'working_memory', title: wm.title },
      line: `## Working Memory\n${wm.content}`.slice(0, 80),
    });
  }

  const renderSemanticLayer = (
    layer: Extract<MemoryLayer, 'project_memory' | 'client_memory'>,
    heading: string
  ) => {
    const layerAtoms = sorted.filter(a => a.layer === layer).slice(0, limit);
    if (layerAtoms.length === 0) return;

    sections.push(
      `## ${heading} (cite as [Source: category — title])\n` +
        layerAtoms
          .map(a => {
            const categoryTag = a.category || layer;
            const confidenceText =
              a.metadata?.confidence != null
                ? ` | confidence: ${Math.round((a.metadata.confidence as number) * 100)}%`
                : '';
            const documentName = a.metadata?.source?.documentName || undefined;
            const sourceText = documentName ? ` | doc: ${documentName}` : '';
            const line = `- [${categoryTag} | "${a.title}"${confidenceText}${sourceText}] ${trimContent(
              a.content,
              400
            )}`;
            rendered.push({ entry: { layer, title: a.title, ...(documentName ? { documentName } : {}) }, line: line.slice(0, 80) });
            return line;
          })
          .join('\n')
    );
  };

  renderSemanticLayer('project_memory', 'Project Memory (semantic matches)');
  renderSemanticLayer('client_memory', 'Client Memory (semantic matches)');

  const assembled = sections.length
    ? `\n\n--- PERSISTENT MEMORY CONTEXT ---\n${sections.join(
        '\n\n'
      )}\n--- END PERSISTENT MEMORY CONTEXT ---\n`
    : '';

  const memoryBlock = trimContent(assembled, maxChars);
  const diagnostics: MemoryAssemblyDiagnostics = {
    requestedLimitPerLayer: limit,
    appliedMaxChars: maxChars,
    minSimilarity,
    maxAgeDays,
    droppedByForgetting,
    droppedByDeduplication,
    trimmed: memoryBlock.length < assembled.length,
    layerOutcomes,
    workingMemoryMode,
    semanticSearchMs,
  };

  // An item whose opening survived the character budget was read; one the
  // trim cut off was not, and is not reported as read.
  const read = rendered.filter(r => memoryBlock.includes(r.line)).map(r => r.entry);

  return { memoryBlock, atoms: sorted, diagnostics, read };
}
