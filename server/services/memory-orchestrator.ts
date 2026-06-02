/**
 * Memory orchestrator — the policy layer that coordinates the three memory
 * layers (working, client, project) into a single ranked, deduplicated,
 * age-bounded set for prompt assembly.
 *
 * memory-context-assembler.ts owns the *mechanics*: fetching each layer in
 * parallel (recency for working memory, pgvector semantic search for client
 * and project), then formatting the merged atoms into the prompt block. This
 * module owns the *policy*: how atoms are scored across layers, what is
 * forgotten, and how duplicates collapse. Centralising it here — the same move
 * ragRouter made for retrieval — means the cross-layer ranking is reviewed in
 * one place instead of living as magic constants inside the assembler.
 *
 * Every layer is scored through one formula (priorityBoost + similarity·w +
 * confidence·w + verifiedBoost) with per-layer weights — there is no
 * special-cased layer. Working memory is currently recency-only (no embedding),
 * so its weights carry a large priorityBoost and a zero similarityWeight, which
 * keeps it above the semantic layers. This is also the single seam a future
 * semantic-memory-retrieval step plugs into: when working memory gains an
 * embedding and a per-turn similarity, only its entry in
 * DEFAULT_MEMORY_POLICY.ranking.byLayer.working_memory changes (raise
 * similarityWeight, lower priorityBoost) — the assembler does not change.
 *
 * Pure and dependency-free so it unit-tests without a DB or network.
 *
 * @module server/services/memory-orchestrator
 */

import type { MemoryLayer, RetrievedMemoryAtom } from './memory-context-assembler.js';

/**
 * Ranking weights for a single memory layer. Every layer is scored through the
 * same formula in {@link scoreAtom}, so a layer's behaviour is fully described
 * by its four weights — there is no special-cased branch per layer.
 */
export interface LayerRankingWeights {
  /**
   * Layer-level additive priority, applied regardless of query relevance. This
   * is how a layer earns structural primacy: working memory is the thread's live
   * state, so it outranks the semantic layers even at zero similarity. It is a
   * tunable weight, not a hard pin — a future semantic-working-memory step lowers
   * this and raises {@link similarityWeight} so working memory competes on
   * relevance instead.
   */
  priorityBoost: number;
  /** Weight on vector similarity (0..~1). Zero for a layer with no embedding. */
  similarityWeight: number;
  /** Weight on the extractor confidence score (0..1). */
  confidenceWeight: number;
  /** Additive boost for user-verified atoms. */
  verifiedBoost: number;
}

/**
 * Cross-layer ranking policy: one weight set per layer, all run through the same
 * {@link scoreAtom} formula. Working memory's primacy is expressed as a large
 * priorityBoost with its similarityWeight at zero (it has no embedding yet); the
 * semantic layers rank by query relevance.
 */
export interface MemoryRankingPolicy {
  byLayer: Record<MemoryLayer, LayerRankingWeights>;
}

export interface MemoryForgettingPolicy {
  /**
   * Importance levels (lower-cased) that survive the age cutoff regardless of
   * how old an atom is. Working memory is always retained, independent of this.
   */
  retainImportanceLevels: string[];
}

export interface MemoryPolicy {
  ranking: MemoryRankingPolicy;
  forgetting: MemoryForgettingPolicy;
  /**
   * Number of leading content characters folded into the dedup key (after
   * layer + title). Two atoms with the same layer, title, and content prefix
   * collapse to the higher-scoring one.
   */
  dedupeContentKeyLength: number;
}

/**
 * Shared weights for the embedding-backed semantic layers (client + project).
 * Also the defensive fallback in {@link scoreAtom} for an unrecognised layer, so
 * an unexpected atom ranks by relevance rather than silently scoring zero.
 */
const SEMANTIC_LAYER_WEIGHTS: LayerRankingWeights = {
  priorityBoost: 0,
  similarityWeight: 0.75,
  confidenceWeight: 0.2,
  verifiedBoost: 0.05,
};

/**
 * The reviewed default policy. These weights reproduce the behaviour that was
 * previously inlined in memory-context-assembler.ts, so swapping the assembler
 * onto the orchestrator is behaviour-preserving: working memory still scores a
 * flat 2 (priorityBoost 2, zero similarity/confidence weight), and the semantic
 * layers still combine similarity·0.75 + confidence·0.2 + verified·0.05.
 */
export const DEFAULT_MEMORY_POLICY: MemoryPolicy = {
  ranking: {
    byLayer: {
      // No embedding yet, so it cannot rank by similarity; a priorityBoost above
      // the semantic layers' max score (0.75 + 0.2 + 0.05 = 1.0) keeps it on top.
      working_memory: {
        priorityBoost: 2,
        similarityWeight: 0,
        confidenceWeight: 0,
        verifiedBoost: 0,
      },
      client_memory: SEMANTIC_LAYER_WEIGHTS,
      project_memory: SEMANTIC_LAYER_WEIGHTS,
    },
  },
  forgetting: {
    retainImportanceLevels: ['critical', 'high'],
  },
  dedupeContentKeyLength: 120,
};

/**
 * Cross-layer relevance score: priorityBoost + similarity·w + confidence·w +
 * verifiedBoost, with the weights drawn from the atom's layer. One formula for
 * every layer — a layer's primacy is encoded in its weights, not a branch.
 */
export function scoreAtom(
  atom: RetrievedMemoryAtom,
  policy: MemoryPolicy = DEFAULT_MEMORY_POLICY
): number {
  const weights = policy.ranking.byLayer[atom.layer] ?? SEMANTIC_LAYER_WEIGHTS;

  const similarity = atom.similarity ?? 0;
  const confidence = atom.metadata?.confidence ?? 0;
  const verifiedBoost = atom.metadata?.isVerified ? weights.verifiedBoost : 0;
  return (
    weights.priorityBoost +
    similarity * weights.similarityWeight +
    confidence * weights.confidenceWeight +
    verifiedBoost
  );
}

/**
 * Structured forgetting: keep recent atoms; keep older atoms only if they are
 * verified or high-importance. Working memory is always kept.
 */
export function shouldRemember(
  atom: RetrievedMemoryAtom,
  maxAgeDays: number,
  policy: MemoryPolicy = DEFAULT_MEMORY_POLICY
): boolean {
  if (atom.layer === 'working_memory') return true;

  const createdAt = atom.metadata?.createdAt;
  if (!createdAt) return true;

  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (Number.isNaN(ageMs)) return true;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  const importance = (atom.metadata?.importance || '').toLowerCase();
  const isCritical = policy.forgetting.retainImportanceLevels.includes(importance);
  const isVerified = Boolean(atom.metadata?.isVerified);

  return ageDays <= maxAgeDays || isCritical || isVerified;
}

/**
 * Collapse atoms that share a layer, title, and leading content to the
 * higher-scoring copy. Returns the survivors plus how many were dropped.
 */
export function dedupeAtoms(
  atoms: RetrievedMemoryAtom[],
  policy: MemoryPolicy = DEFAULT_MEMORY_POLICY
): { deduped: RetrievedMemoryAtom[]; dropped: number } {
  const deduped = new Map<string, RetrievedMemoryAtom>();

  for (const atom of atoms) {
    const key = `${atom.layer}:${atom.title.trim().toLowerCase()}:${atom.content
      .slice(0, policy.dedupeContentKeyLength)
      .trim()
      .toLowerCase()}`;
    const existing = deduped.get(key);
    if (!existing || scoreAtom(atom, policy) > scoreAtom(existing, policy)) {
      deduped.set(key, atom);
    }
  }

  const dedupedList = Array.from(deduped.values());
  return { deduped: dedupedList, dropped: Math.max(0, atoms.length - dedupedList.length) };
}

export interface OrchestrationResult {
  /** Atoms ordered by cross-layer score, highest first. */
  ranked: RetrievedMemoryAtom[];
  droppedByForgetting: number;
  droppedByDeduplication: number;
}

/**
 * Full coordination pass over the merged atoms from every layer: forget stale
 * atoms, collapse duplicates, then rank across layers. The drop counts mirror
 * what the assembler reports in its diagnostics.
 */
export function orchestrateAtoms(
  atoms: RetrievedMemoryAtom[],
  maxAgeDays: number,
  policy: MemoryPolicy = DEFAULT_MEMORY_POLICY
): OrchestrationResult {
  const remembered = atoms.filter(atom => shouldRemember(atom, maxAgeDays, policy));
  const droppedByForgetting = atoms.length - remembered.length;

  const { deduped, dropped: droppedByDeduplication } = dedupeAtoms(remembered, policy);

  const ranked = [...deduped].sort((a, b) => scoreAtom(b, policy) - scoreAtom(a, policy));

  return { ranked, droppedByForgetting, droppedByDeduplication };
}
