/**
 * Intelligence prefix — compact, cached client + project + wisdom context that
 * any AI agent prepends to its system prompt.
 *
 * Extracted from lumen-context-builder.ts as a first surgical step toward
 * splitting that file. Re-exported from lumen-context-builder.ts so existing
 * import paths (`from '...lumen-context-builder.js'`) keep working.
 *
 * @module server/services/lumen-context/intelligence-prefix
 */

import {
  buildClientIntelligenceContext,
  buildProjectIntelligenceContext,
} from '../client-intelligence-memory.js';
/**
 * The integer project whose intelligence the prefix loads, or null (PF-10 S6a).
 * This was parseInt(projectId): parseInt('7abb1c22-…') is 7, a valid, wrong
 * project of the same organization, whose intelligence and learned wisdom AnA
 * then read as this project's. The one resolution of a project ref instead
 * (services/c2c/project-ref.ts): an integer, a program's anchor row, or none.
 */
async function intelligenceProject(organizationId: number, projectId: number | string | undefined, signal: AbortSignal): Promise<number | null> {
  if (projectId === undefined || projectId === null || projectId === '') return null;
  const { integerProjectForRef } = await import('../c2c/project-ref.js');
  if (signal.aborted) return null;
  return integerProjectForRef(async () => {
    const { db } = await import('../../db.js');
    if (signal.aborted) throw new Error('Intelligence recall deadline exceeded');
    return db;
  }, {
    ref: projectId,
    orgId: organizationId,
    context: 'intelligence-prefix',
  });
}

// ─── TTL cache ───────────────────────────────────────────────────────────────
//
// Intelligence context (client + project + wisdom) changes slowly relative to
// chat-turn cadence. Without a cache, every conversational turn re-runs the
// 3-query Promise.all. A 60s TTL keeps responses fresh enough for the
// regulatory domain while making back-to-back turns hit a warm cache.

interface IntelligencePrefixCacheEntry {
  value: string;
  expiresAt: number;
  /** One owned read per key; removed when it settles or is invalidated. */
  pending?: Promise<string>;
}

const INTELLIGENCE_PREFIX_TTL_MS = 60_000;
const INTELLIGENCE_PREFIX_CACHE_LIMIT = 200;
const INTELLIGENCE_RECALL_TIMEOUT_MS = 3000;
const intelligencePrefixCache = new Map<string, IntelligencePrefixCacheEntry>();

/** The empty sentinel retains the existing organization-only call. A supplied
 * but malformed/whitespace project is still a project request, never permission
 * to reuse organization-wide portfolio context from the same cache key. */
function hasSelectedProject(projectId: number | string | undefined): boolean {
  return projectId !== undefined && projectId !== null && projectId !== '';
}

/** Separate scope namespaces; preserve the existing normalized project key. */
function intelligencePrefixCacheKey(orgId: number, projectId: number | string | undefined): string {
  return hasSelectedProject(projectId)
    ? `${orgId}:project:${String(projectId).trim().toLowerCase()}`
    : `${orgId}:organization`;
}

const SUPERSEDED_RECALL = '\n## Intelligence recall availability\n' +
  'Intelligence recall unavailable: this read was invalidated or superseded while loading. ' +
  'Do not rely on its earlier project objective, intelligence or decisions. ' +
  'Reload the relevant records before using this context; absence of recall does not mean absence of evidence.\n';

/** Invalidate this scope's completed AND in-flight recall after a write.
 * Deletion revokes the entry's ownership; its late result cannot return source
 * text or recreate the cache. This is process-local, not cross-instance invalidation. */
export function invalidateIntelligencePrefix(
  organizationId?: number,
  projectId?: number | string
): void {
  if (!organizationId) return;
  intelligencePrefixCache.delete(intelligencePrefixCacheKey(organizationId, projectId));
}

/** The project's objective of record, its charter's objectives section (services/c2c/charter-objectives.ts,
 *  P-80): AnA holds every narrative to it. */
async function objectiveBlock(organizationId: number, projectId: number, signal: AbortSignal): Promise<string | null> {
  const [{ db }, objectives] = await Promise.all([import('../../db.js'), import('../c2c/charter-objectives.js')]);
  if (signal.aborted) return null;
  return objectives.objectivesContextBlock(await objectives.readProjectObjectives(db as never, { orgId: organizationId, projectId }));
}

/** A turn-wide deadline for optional intelligence recall, including resolution. */
function createRecallBudget() {
  const unavailable = new Set<string>();
  const deadline = Date.now() + INTELLIGENCE_RECALL_TIMEOUT_MS;
  const recall = async <T>(source: string, load: (signal: AbortSignal) => Promise<T>, fallback: T): Promise<T> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) { unavailable.add(source); return fallback; }
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
          }, remaining);
        }),
      ]);
    } catch {
      unavailable.add(source);
      return fallback;
    } finally {
      clearTimeout(timer);
    }
  };
  return { unavailable, recall };
}

/**
 * Get a compact intelligence context prefix that can be prepended to any
 * agent's system prompt. Lightweight: only loads intelligence context, not the
 * full AnA 1.0 RI prompt. For the full experience, use
 * buildContextAwarePrompt() in lumen-context-builder instead.
 *
 * @param organizationId - The client's organization ID
 * @param projectId - Optional active project ID
 * @returns Intelligence context string to prepend to system prompt, or empty string
 */
export async function getIntelligencePrefix(
  organizationId?: number,
  projectId?: number | string
): Promise<string> {
  if (!organizationId) return '';

  const cacheKey = intelligencePrefixCacheKey(organizationId, projectId);
  const cached = intelligencePrefixCache.get(cacheKey);
  if (cached?.pending) return cached.pending;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) intelligencePrefixCache.delete(cacheKey);

  // The same bounded map owns completed snapshots and pending reads. There
  // is no unbounded generation/tombstone map. Eviction also retires ownership.
  if (intelligencePrefixCache.size >= INTELLIGENCE_PREFIX_CACHE_LIMIT) {
    const firstKey = intelligencePrefixCache.keys().next().value;
    if (firstKey) intelligencePrefixCache.delete(firstKey);
  }
  const entry: IntelligencePrefixCacheEntry = { value: '', expiresAt: 0 };
  intelligencePrefixCache.set(cacheKey, entry);
  // Publish the pending promise before its loader can run, so overlapping
  // turns share one recall and cannot race to overwrite each other's snapshot.
  entry.pending = Promise.resolve().then(() =>
    loadIntelligencePrefix(organizationId, projectId, cacheKey, entry));
  return entry.pending;
}

async function loadIntelligencePrefix(
  organizationId: number,
  projectId: number | string | undefined,
  cacheKey: string,
  entry: IntelligencePrefixCacheEntry,
): Promise<string> {
  const ownsRead = () => intelligencePrefixCache.get(cacheKey) === entry;
  if (!ownsRead()) return SUPERSEDED_RECALL;
  const { unavailable, recall } = createRecallBudget();
  // An explicit project never falls back to organization portfolio recall,
  // including when its optional intelligence lookup cannot resolve it.
  const projectSelected = hasSelectedProject(projectId);

  try {
    // Client recall does not depend on project resolution. All sources share
    // one turn budget, including a program's anchor lookup and dynamic imports.
    const clientPromise = projectSelected ? Promise.resolve(null)
      : recall('client intelligence', () => buildClientIntelligenceContext(organizationId), null);
    const parsedProjectId = await recall('project resolution', signal => intelligenceProject(organizationId, projectId, signal), null);
    if (!ownsRead()) return SUPERSEDED_RECALL;
    const [clientCtx, projectCtx, wisdomBlock, objective] = await Promise.all([
      clientPromise,
      parsedProjectId
        ? recall('project intelligence', () => buildProjectIntelligenceContext(parsedProjectId, organizationId), null)
        : Promise.resolve(null),
      // AnA Wisdom Engine — inject learned wisdom (risks, lessons, patterns).
      // Non-blocking: if it fails, chat still works without wisdom context.
      parsedProjectId
        ? recall('learned wisdom', async signal => {
            const { buildWisdomContext } = await import('../ana-wisdom-engine.js');
            // A late import must not start a database read after the budget.
            return signal.aborted ? null : buildWisdomContext(parsedProjectId, organizationId, undefined, undefined, { projectOnly: true });
          }, null)
        : Promise.resolve(null),
      parsedProjectId ? recall('project objective', signal => objectiveBlock(organizationId, parsedProjectId, signal), null) : Promise.resolve(null),
    ]);

    // A charter write can invalidate this read while any source is pending.
    // Do not pass the retired sources to AnA, even without a replacement read.
    if (!ownsRead()) return SUPERSEDED_RECALL;
    const parts: string[] = [];
    if (unavailable.size > 0) {
      parts.push(`\n## Intelligence recall availability\nIntelligence recall unavailable: ${[...unavailable].sort().join(', ')}. ` +
        'Do not infer that missing intelligence or prior decisions do not exist. Check the relevant records before relying on their absence.\n');
    }

    if (clientCtx) {
      parts.push(`
---
## IMPORTANT: Client Intelligence (Read Before Responding)
The following is learned intelligence about this client organization.
Use it to personalize every response and recommendation.
${clientCtx}
---`);
    }

    if (objective) parts.push(`\n---${objective}\n---`);
    if (projectCtx) {
      parts.push(`
---
## IMPORTANT: Project Intelligence (Read Before Responding)
The following is learned intelligence about the active project.
Use it to tailor analysis, drafting, and guidance to this specific submission.
${projectCtx}
---`);
    }

    if (wisdomBlock) {
      const wisdomLines: string[] = [];

      if (wisdomBlock.projectRisks.length > 0) {
        const riskList = wisdomBlock.projectRisks
          .map(r => `- [${r.severity.toUpperCase()}] ${r.description}`)
          .join('\n');
        wisdomLines.push(`**Active Risks:**\n${riskList}`);
      }

      if (wisdomBlock.projectLesson) {
        wisdomLines.push(`**Lesson Learned:** ${wisdomBlock.projectLesson}`);
      }

      if (!projectSelected && wisdomBlock.clientPattern) {
        wisdomLines.push(`**Client Pattern:** ${wisdomBlock.clientPattern}`);
      }

      if (!projectSelected && wisdomBlock.platformInsight) {
        wisdomLines.push(`**Platform Insight:** ${wisdomBlock.platformInsight}`);
      }

      if (!projectSelected && wisdomBlock.recommendedNextAction) {
        wisdomLines.push(`**Recommended Action:** ${wisdomBlock.recommendedNextAction}`);
      }

      if (wisdomLines.length > 0) {
        parts.push(`
---
## AnA Wisdom (Learned Intelligence — v${wisdomBlock.engineVersion})
Use these accumulated insights to guide responses proactively.
${wisdomLines.join('\n')}
---`);
      }
    }

    const assembled = parts.join('\n');
    if (!ownsRead()) return SUPERSEDED_RECALL;
    // A failed/late read is a degraded snapshot, not a fresh cache entry. The
    // next turn must retry instead of inheriting missing recall for 60 seconds.
    if (unavailable.size > 0) {
      intelligencePrefixCache.delete(cacheKey);
      return assembled;
    }
    // Only this still-owned entry can publish. No await follows the ownership
    // check, so an older attempt cannot erase or replace a newer cache entry.
    entry.value = assembled;
    entry.expiresAt = Date.now() + INTELLIGENCE_PREFIX_TTL_MS;
    delete entry.pending;
    return assembled;
  } catch {
    if (!ownsRead()) return SUPERSEDED_RECALL;
    intelligencePrefixCache.delete(cacheKey);
    // A malformed source result must not leave a pending cache entry forever
    // or expose raw provider/SQL/clinical text through an exception object.
    console.warn('[IntelligencePrefix] Intelligence context unavailable');
    return '\n## Intelligence recall availability\nIntelligence recall unavailable: context assembly failed. ' +
      'Check the relevant records before relying on missing intelligence or prior decisions.\n';
  }
}
