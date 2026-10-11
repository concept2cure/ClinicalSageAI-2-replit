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
  shouldAutoBootstrap,
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

/**
 * The block to inject at session start, or '' — gate, build and fault
 * tolerance in ONE place.
 *
 * Both canonical chat entry points need this, and both had it wrong in
 * different ways: `POST /api/chat/send-message` carried its own copy of the
 * gate, the env kill-switch and the try/catch, and `POST /api/ana-ri/stream`
 * — the STREAMING path, which is the one a chat UI actually uses — carried
 * none of it. So the recall of the client's project files and past chat
 * uploads, the thing that stops AnA starting cold on a file the client
 * uploaded last week, never reached a streaming session at all.
 *
 * A capability wired to one of two equivalent paths is the failure this
 * function exists to make impossible to repeat: there is now one call to make,
 * and `server/routes/__tests__/chat-path-parity.test.ts` asserts both
 * paths make it.
 *
 * Returns '' — never throws — when the session is not at its start, when there
 * is no organization, when ANA_SESSION_BOOTSTRAP_AUTO=false, or when the
 * rehydration itself fails. Starting a conversation without the recall is a
 * degraded turn; failing the turn over it would be a worse one.
 */
export async function sessionBootstrapBlockFor(opts: {
  priorMessageCount: number;
  organizationId?: number | null;
  projectId?: number;
  threadId?: string;
  atomLimit?: number;
}): Promise<string> {
  if (
    !shouldAutoBootstrap({
      priorMessageCount: opts.priorMessageCount,
      organizationId: opts.organizationId ?? null,
      disabled: process.env.ANA_SESSION_BOOTSTRAP_AUTO === 'false',
    })
  ) {
    return '';
  }
  try {
    return await buildSessionBootstrapContext({
      organizationId: opts.organizationId as number,
      projectId: opts.projectId,
      threadId: opts.threadId,
      atomLimit: opts.atomLimit ?? 6,
    });
  } catch {
    return '';
  }
}

export interface SessionBootstrapInput {
  organizationId: number;
  projectId?: number;
  threadId?: string;
  atomLimit?: number;
}

/** Optional recall must not hold the first reply behind a stalled source. */
export const SESSION_RECALL_TIMEOUT_MS = 1500;

/**
 * Load independent sources concurrently, retaining every source that answers
 * within the recall budget. A failed or late source is explicitly named so
 * missing recall cannot be mistaken for evidence that no records exist.
 * Existing database reads cannot be cancelled by these loaders; the signal
 * prevents a late profile/feature lookup from starting a follow-up query.
 */
export async function buildSessionBootstrapContext(input: SessionBootstrapInput): Promise<string> {
  const { organizationId, projectId, threadId } = input;
  const atomLimit = input.atomLimit ?? 6;
  const unavailable = new Set<string>();

  const safe = async <T>(
    source: string,
    load: (signal: AbortSignal) => Promise<T>,
    fallback: T,
  ): Promise<T> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => load(controller.signal)),
        new Promise<T>(resolve => {
          timer = setTimeout(() => {
            unavailable.add(source);
            controller.abort();
            resolve(fallback);
          }, SESSION_RECALL_TIMEOUT_MS);
        }),
      ]);
    } catch {
      unavailable.add(source);
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  };

  // Shared imports/feature lookup, with each consumer bounded below. No org-
  // spanning cache: the feature decision and all reads belong to this turn.
  const memory = import('./client-intelligence-memory.js');
  const catalog = import('./vault/document-catalog.service.js').then(async svc =>
    (await svc.isDocumentCatalogEnabled(organizationId)) ? svc : null,
  );

  const [workingMemorySummary, projectAtoms, clientAtoms, outcomeLessons, vaultFiles, chatUploads] =
    await Promise.all([
      threadId ? safe('working memory', async signal => {
        const { getLatestWorkingMemoryByThread } = await import('./working-memory.js');
        signal.throwIfAborted();
        return getLatestWorkingMemoryByThread(threadId, organizationId);
      }, null) : Promise.resolve(null),
      projectId ? safe('project memory', async signal => {
        const { getProjectIntelligence, getProjectMemoryEntries } = await memory;
        signal.throwIfAborted();
        const profile = await getProjectIntelligence(projectId, organizationId);
        signal.throwIfAborted();
        if (!profile?.id) return [] as BootstrapAtom[];
        const { entries } = await getProjectMemoryEntries(profile.id, { limit: 40 });
        return entries as unknown as BootstrapAtom[];
      }, [] as BootstrapAtom[]) : Promise.resolve([] as BootstrapAtom[]),
      safe('client memory', async signal => {
        const { getClientProfile, getMemoryEntries } = await memory;
        signal.throwIfAborted();
        const profile = await getClientProfile(organizationId);
        signal.throwIfAborted();
        if (!profile?.id) return [] as BootstrapAtom[];
        const { entries } = await getMemoryEntries(profile.id, organizationId, { limit: 40 });
        return entries as unknown as BootstrapAtom[];
      }, [] as BootstrapAtom[]),
      safe('outcome lessons', () => loadRecentOutcomeLessons(organizationId, projectId, 5), []),
      safe('vault file recall', async signal => {
        const svc = await catalog;
        signal.throwIfAborted();
        return svc ? svc.getCatalogBootstrapDigest(organizationId, 12) : undefined;
      }, undefined),
      safe('chat upload recall', async signal => {
        const svc = await catalog;
        signal.throwIfAborted();
        if (!svc) return undefined;
        const page = await svc.listChatUploads(organizationId, null, 8);
        return {
          uploads: page.uploads.map(u => ({
            fileName: u.fileName,
            fileId: u.fileId,
            uploadedAt: u.uploadedAt,
          })),
          hasMore: page.hasMore,
        };
      }, undefined),
    ]);

  const recall = formatSessionBootstrap({
    workingMemorySummary,
    projectAtoms,
    clientAtoms,
    outcomeLessons,
    vaultFiles,
    chatUploads,
    atomLimit,
  });
  const notice = unavailable.size > 0
    ? `## Session recall incomplete\nUnavailable within this turn's recall budget: ${[...unavailable].sort().join(', ')}. ` +
      'This is not evidence that no records exist. Use the relevant memory or document tools before making claims about prior work or missing files.'
    : '';
  return [recall, notice].filter(Boolean).join('\n\n');
}
