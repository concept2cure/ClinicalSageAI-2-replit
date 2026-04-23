import { getLatestWorkingMemoryByThread } from './working-memory.js';
import {
  searchMemoryEntriesSemantic,
  searchProjectMemoryEntriesSemantic,
  type SemanticMemoryHit,
} from './client-intelligence-memory.js';
import type { ClientMemoryEntry, ProjectMemoryEntry } from 'shared/schema';

/**
 * Race a promise against a timeout. If the promise doesn't resolve within `ms`
 * milliseconds the fallback value is returned instead, preventing indefinite
 * hangs when the embedding service or vector DB is slow/unreachable.
 * The `onTimeout` callback lets callers surface timeouts in diagnostics
 * instead of eating them silently.
 */
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  onTimeout?: (ms: number) => void
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve =>
      setTimeout(() => {
        console.warn(`[memory-context] Semantic search timed out after ${ms}ms, using fallback`);
        onTimeout?.(ms);
        resolve(fallback);
      }, ms)
    ),
  ]);
}

/**
 * Per-layer deadline for semantic memory retrieval. Originally 10s, which
 * meant cold vector-DB requests silently ate most of the context-assembly
 * budget and returned zero atoms with no signal to the caller. 3s is still
 * generous for a healthy embedding path and fails fast when it isn't.
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
  /** Wall-clock milliseconds spent in semantic search (parallel across layers). */
  semanticSearchMs?: number;
}

export interface MemoryContextAssemblerResult {
  memoryBlock: string;
  atoms: RetrievedMemoryAtom[];
  diagnostics: MemoryAssemblyDiagnostics;
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

function isFreshOrImportant(atom: RetrievedMemoryAtom, maxAgeDays: number): boolean {
  if (atom.layer === 'working_memory') return true;

  const createdAt = atom.metadata?.createdAt;
  if (!createdAt) return true;

  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (Number.isNaN(ageMs)) return true;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  const importance = (atom.metadata?.importance || '').toLowerCase();
  const isCritical = importance === 'critical' || importance === 'high';
  const isVerified = Boolean(atom.metadata?.isVerified);

  // Structured forgetting policy:
  // - Keep recent entries.
  // - Keep older entries if verified/high-importance.
  return ageDays <= maxAgeDays || isCritical || isVerified;
}

function atomSortScore(atom: RetrievedMemoryAtom): number {
  if (atom.layer === 'working_memory') return 2;

  const similarity = atom.similarity ?? 0;
  const confidence = atom.metadata?.confidence ?? 0;
  const verifiedBoost = atom.metadata?.isVerified ? 0.05 : 0;
  return similarity * 0.75 + confidence * 0.2 + verifiedBoost;
}

function dedupeAtoms(atoms: RetrievedMemoryAtom[]): {
  deduped: RetrievedMemoryAtom[];
  dropped: number;
} {
  const deduped = new Map<string, RetrievedMemoryAtom>();

  for (const atom of atoms) {
    const key = `${atom.layer}:${atom.title.trim().toLowerCase()}:${atom.content
      .slice(0, 120)
      .trim()
      .toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || atomSortScore(atom) > atomSortScore(existing)) {
      deduped.set(key, atom);
    }
  }

  const dedupedList = Array.from(deduped.values());
  return { deduped: dedupedList, dropped: Math.max(0, atoms.length - dedupedList.length) };
}

export async function buildMemoryContextForChat(
  input: MemoryContextAssemblerInput
): Promise<MemoryContextAssemblerResult> {
  const limit = clampLimit(input.limitPerLayer);
  const maxChars = clampChars(input.maxChars);
  const minSimilarity = clampSimilarity(input.minSimilarity);
  const maxAgeDays = clampMaxAgeDays(input.maxAgeDays);

  const atoms: RetrievedMemoryAtom[] = [];
  const layerOutcomes: {
    workingMemory: LayerOutcome;
    clientMemory: LayerOutcome;
    projectMemory: LayerOutcome;
  } = {
    workingMemory: 'skipped',
    clientMemory: 'skipped',
    projectMemory: 'skipped',
  };

  const workingSummary = await getLatestWorkingMemoryByThread(input.threadId).catch(() => null);
  if (workingSummary) {
    atoms.push({
      id: 0,
      layer: 'working_memory',
      title: 'Latest Working Memory Summary',
      content: workingSummary,
      metadata: {
        extractedBy: 'system',
      },
    });
    layerOutcomes.workingMemory = 'ok';
  } else {
    layerOutcomes.workingMemory = 'empty';
  }

  // Client + project semantic searches run in parallel — no reason to serialize
  // two independent vector-DB queries. Tighter per-layer timeout so a slow
  // embedding path fails fast instead of swallowing the whole context budget.
  const semanticStart = Date.now();
  let semanticSearchMs: number | undefined;

  if (input.organizationId && input.query?.trim()) {
    const clientTask: Promise<LayerOutcome> = withTimeout(
      searchMemoryEntriesSemantic(null, input.organizationId, input.query, {
        limit,
        minSimilarity,
      })
        .then(result => {
          atoms.push(...result.entries.map(mapClientEntryToAtom));
          return (result.entries.length > 0 ? 'ok' : 'empty') as LayerOutcome;
        })
        .catch((err: any) => {
          if (err?.code !== '42P01') {
            console.warn(
              '[MemoryContextAssembler] Client semantic retrieval failed:',
              err?.message
            );
          }
          return 'error' as LayerOutcome;
        }),
      MEMORY_LAYER_TIMEOUT_MS,
      'timeout' as LayerOutcome
    );

    const projectTask: Promise<LayerOutcome> = input.projectId
      ? withTimeout(
          searchProjectMemoryEntriesSemantic(
            null,
            input.projectId,
            input.organizationId,
            input.query,
            { limit, minSimilarity }
          )
            .then(result => {
              atoms.push(...result.entries.map(mapProjectEntryToAtom));
              return (result.entries.length > 0 ? 'ok' : 'empty') as LayerOutcome;
            })
            .catch((err: any) => {
              if (err?.code !== '42P01') {
                console.warn(
                  '[MemoryContextAssembler] Project semantic retrieval failed:',
                  err?.message
                );
              }
              return 'error' as LayerOutcome;
            }),
          MEMORY_LAYER_TIMEOUT_MS,
          'timeout' as LayerOutcome
        )
      : Promise.resolve('skipped' as LayerOutcome);

    const [clientOutcome, projectOutcome] = await Promise.all([clientTask, projectTask]);
    layerOutcomes.clientMemory = clientOutcome;
    layerOutcomes.projectMemory = projectOutcome;
    semanticSearchMs = Date.now() - semanticStart;
  }

  const rememberedAtoms = atoms.filter(atom => isFreshOrImportant(atom, maxAgeDays));
  const droppedByForgetting = atoms.length - rememberedAtoms.length;

  const { deduped, dropped: droppedByDeduplication } = dedupeAtoms(rememberedAtoms);

  const sorted = deduped.sort((a, b) => atomSortScore(b) - atomSortScore(a));

  const sections: string[] = [];

  const wm = sorted.find(a => a.layer === 'working_memory');
  if (wm) {
    sections.push(`## Working Memory\n${wm.content}`);
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
            const sourceText = a.metadata?.source?.documentName
              ? ` | doc: ${a.metadata.source.documentName}`
              : '';
            return `- [${categoryTag} | "${a.title}"${confidenceText}${sourceText}] ${trimContent(
              a.content,
              400
            )}`;
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
    semanticSearchMs,
  };

  return { memoryBlock, atoms: sorted, diagnostics };
}
