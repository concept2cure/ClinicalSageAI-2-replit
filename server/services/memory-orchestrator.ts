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
 * It is also the single seam a future semantic-memory-retrieval step plugs
 * into. Working memory is currently recency-only (no embedding), so it is
 * pinned above the semantic layers with a fixed score. When working memory
 * gains an embedding and a per-turn similarity, only
 * DEFAULT_MEMORY_POLICY.ranking.workingMemoryPinScore changes to a
 * similarity-weighted score — the assembler does not change.
 *
 * Pure and dependency-free so it unit-tests without a DB or network.
 *
 * @module server/services/memory-orchestrator
 */

import type { RetrievedMemoryAtom } from './memory-context-assembler.js';

export interface MemoryRankingPolicy {
  /**
   * Fixed score for working-memory atoms. Working memory is the thread's
   * current state and has no embedding, so it is pinned above the semantic
   * layers rather than ranked by query similarity. The semantic layers score
   * in [0, ~1], so a value > 1 keeps working memory on top. This is the one
   * field a future semantic-working-memory step replaces with a weighted score.
   */
  workingMemoryPinScore: number;
  /** Weight on vector similarity for client/project atoms. */
  similarityWeight: number;
  /** Weight on the extractor confidence score (0..1). */
  confidenceWeight: number;
  /** Additive boost for user-verified atoms. */
  verifiedBoost: number;
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
 * The reviewed default policy. These values reproduce the behaviour that was
 * previously inlined in memory-context-assembler.ts, so swapping the assembler
 * onto the orchestrator is behaviour-preserving.
 */
export const DEFAULT_MEMORY_POLICY: MemoryPolicy = {
  ranking: {
    workingMemoryPinScore: 2,
    similarityWeight: 0.75,
    confidenceWeight: 0.2,
    verifiedBoost: 0.05,
  },
  forgetting: {
    retainImportanceLevels: ['critical', 'high'],
  },
  dedupeContentKeyLength: 120,
};

/**
 * Cross-layer relevance score. Working memory is pinned; client/project atoms
 * combine vector similarity, extractor confidence, and a verified boost.
 */
export function scoreAtom(
  atom: RetrievedMemoryAtom,
  policy: MemoryPolicy = DEFAULT_MEMORY_POLICY
): number {
  if (atom.layer === 'working_memory') return policy.ranking.workingMemoryPinScore;

  const similarity = atom.similarity ?? 0;
  const confidence = atom.metadata?.confidence ?? 0;
  const verifiedBoost = atom.metadata?.isVerified ? policy.ranking.verifiedBoost : 0;
  return (
    similarity * policy.ranking.similarityWeight +
    confidence * policy.ranking.confidenceWeight +
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
