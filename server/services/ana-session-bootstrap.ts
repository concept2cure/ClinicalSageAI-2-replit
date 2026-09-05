/**
 * AnA session bootstrap — so a new conversation never starts cold.
 *
 * On session start AnA's prior context loaded only if a query happened to be
 * present (semantic memory is query-driven) and her own past outcomes were
 * never surfaced to her at all. This module composes the REAL memory services
 * to rehydrate, query-independently:
 *   1. the latest working-memory summary for the thread,
 *   2. the most important project + client knowledge atoms (by importance /
 *      verification / confidence / recency — no query needed),
 *   3. recent lessons from AnA's own outcome log for this org/project.
 *
 * Ranking and formatting are pure functions in ana-session-bootstrap-format.ts
 * (no DB, no mocks); this module wires them to the real loaders.
 */

import { db } from '../db';
import { anaOutcomeLog } from 'shared/schema/ana-intelligence';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import {
  formatSessionBootstrap,
  type BootstrapAtom,
  type OutcomeLesson,
} from './ana-session-bootstrap-format.js';

export type {
  BootstrapAtom,
  OutcomeLesson,
  SessionBootstrapParts,
} from './ana-session-bootstrap-format.js';
export {
  bootstrapAtomScore,
  rankBootstrapAtoms,
  formatSessionBootstrap,
  shouldAutoBootstrap,
} from './ana-session-bootstrap-format.js';

/**
 * Load AnA's own recent outcome lessons for an org/project from the real
 * outcome log (lessons only; most recent first).
 */
export async function loadRecentOutcomeLessons(
  organizationId: number,
  projectId: number | undefined,
  limit = 5
): Promise<OutcomeLesson[]> {
  const conditions = [
    eq(anaOutcomeLog.organizationId, organizationId),
    isNotNull(anaOutcomeLog.lessonsLearned),
  ];
  if (typeof projectId === 'number') {
    conditions.push(eq(anaOutcomeLog.projectId, projectId));
  }
  const rows = await db
    .select({
      capabilityKey: anaOutcomeLog.capabilityKey,
      outcome: anaOutcomeLog.outcome,
      documentType: anaOutcomeLog.documentType,
      lessonsLearned: anaOutcomeLog.lessonsLearned,
    })
    .from(anaOutcomeLog)
    .where(and(...conditions))
    .orderBy(desc(anaOutcomeLog.createdAt))
    .limit(limit);
  return rows as OutcomeLesson[];
}

export interface SessionBootstrapInput {
  organizationId: number;
  projectId?: number;
  threadId?: string;
  atomLimit?: number;
}

/**
 * Build the full session-bootstrap context by composing the real memory
 * loaders. Each source is independently fault-tolerant — a slow or empty
 * source degrades to nothing rather than failing the rehydration.
 */
export async function buildSessionBootstrapContext(input: SessionBootstrapInput): Promise<string> {
  const { organizationId, projectId, threadId } = input;
  const atomLimit = input.atomLimit ?? 6;

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };

  const [
    { getClientProfile, getMemoryEntries, getProjectIntelligence, getProjectMemoryEntries },
    { getLatestWorkingMemoryByThread },
  ] = await Promise.all([
    import('./client-intelligence-memory.js'),
    import('./working-memory.js'),
  ]);

  // 1. Working memory — latest thread summary (returned as the summary string).
  const workingMemorySummary = threadId
    ? await safe(getLatestWorkingMemoryByThread(threadId, organizationId), null)
    : null;

  // 2. Project atoms (query-independent, by profile).
  const projectAtoms = projectId
    ? await safe(
        (async () => {
          const profile = await getProjectIntelligence(projectId);
          if (!profile?.id) return [] as BootstrapAtom[];
          const { entries } = await getProjectMemoryEntries(profile.id, { limit: 40 });
          return entries as unknown as BootstrapAtom[];
        })(),
        [] as BootstrapAtom[]
      )
    : [];

  // 3. Client atoms (query-independent, by profile).
  const clientAtoms = await safe(
    (async () => {
      const profile = await getClientProfile(organizationId);
      if (!profile?.id) return [] as BootstrapAtom[];
      // organizationId is required for tenant-isolated memory reads (the same
      // org used to resolve the profile above).
      const { entries } = await getMemoryEntries(profile.id, organizationId, { limit: 40 });
      return entries as unknown as BootstrapAtom[];
    })(),
    [] as BootstrapAtom[]
  );

  // 4. AnA's own recent lessons.
  const outcomeLessons = await safe(loadRecentOutcomeLessons(organizationId, projectId, 5), []);

  // 5. Project files on record (document catalog) — what exists in the vault,
  //    where each file is filed, and what each is for — so a file uploaded in
  //    a prior session is remembered, not rediscovered by accident. Gated on
  //    the catalog feature; degrades to nothing like every other source.
  const vaultFiles = await safe(
    (async () => {
      const svc = await import('./vault/document-catalog.service.js');
      if (!(await svc.isDocumentCatalogEnabled(organizationId))) return undefined;
      return await svc.getCatalogBootstrapDigest(organizationId, 12);
    })(),
    undefined
  );

  return formatSessionBootstrap({
    workingMemorySummary,
    projectAtoms,
    clientAtoms,
    outcomeLessons,
    vaultFiles,
    atomLimit,
  });
}
