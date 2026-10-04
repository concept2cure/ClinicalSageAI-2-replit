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
async function intelligenceProject(organizationId: number, projectId: number | string | undefined): Promise<number | null> {
  if (projectId === undefined || projectId === null || projectId === '') return null;
  const { integerProjectForRef } = await import('../c2c/project-ref.js');
  return integerProjectForRef(async () => (await import('../../db.js')).db, {
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
}

const INTELLIGENCE_PREFIX_TTL_MS = 60_000;
const INTELLIGENCE_PREFIX_CACHE_LIMIT = 200;
const intelligencePrefixCache = new Map<string, IntelligencePrefixCacheEntry>();

/** Keyed by the project as given, so a program and the integer its digits spell never share an entry. */
function intelligencePrefixCacheKey(orgId: number, projectId: number | string | undefined): string {
  return `${orgId}:${projectId === undefined || projectId === null ? '' : String(projectId).trim().toLowerCase()}`;
}

/** Invalidate cached intelligence prefix for a project (e.g., after a write). */
export function invalidateIntelligencePrefix(
  organizationId?: number,
  projectId?: number | string
): void {
  if (!organizationId) return;
  intelligencePrefixCache.delete(intelligencePrefixCacheKey(organizationId, projectId));
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

  // Serve from cache when fresh. Cache misses populate on the way out.
  const cacheKey = intelligencePrefixCacheKey(organizationId, projectId);
  const cached = intelligencePrefixCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  if (cached) {
    intelligencePrefixCache.delete(cacheKey);
  }

  try {
    const parsedProjectId = await intelligenceProject(organizationId, projectId);
    const [clientCtx, projectCtx, wisdomBlock] = await Promise.all([
      buildClientIntelligenceContext(organizationId).catch(() => null),
      parsedProjectId
        ? buildProjectIntelligenceContext(parsedProjectId, organizationId).catch(() => null)
        : Promise.resolve(null),
      // AnA Wisdom Engine — inject learned wisdom (risks, lessons, patterns).
      // Non-blocking: if it fails, chat still works without wisdom context.
      parsedProjectId
        ? import('../ana-wisdom-engine.js')
            .then(({ buildWisdomContext }) =>
              buildWisdomContext(parsedProjectId!, organizationId!)
            )
            .catch(err => {
              console.warn(
                '[IntelligencePrefix] Wisdom context failed (non-blocking):',
                err?.message
              );
              return null;
            })
        : Promise.resolve(null),
    ]);

    const parts: string[] = [];

    if (clientCtx) {
      parts.push(`
---
## IMPORTANT: Client Intelligence (Read Before Responding)
The following is learned intelligence about this client organization.
Use it to personalize every response and recommendation.
${clientCtx}
---`);
    }

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

      if (wisdomBlock.clientPattern) {
        wisdomLines.push(`**Client Pattern:** ${wisdomBlock.clientPattern}`);
      }

      if (wisdomBlock.platformInsight) {
        wisdomLines.push(`**Platform Insight:** ${wisdomBlock.platformInsight}`);
      }

      if (wisdomBlock.recommendedNextAction) {
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
    // Write through to the TTL cache. Cap size to keep memory bounded in
    // multi-tenant workloads; evict oldest on overflow.
    if (intelligencePrefixCache.size >= INTELLIGENCE_PREFIX_CACHE_LIMIT) {
      const firstKey = intelligencePrefixCache.keys().next().value;
      if (firstKey) intelligencePrefixCache.delete(firstKey);
    }
    intelligencePrefixCache.set(cacheKey, {
      value: assembled,
      expiresAt: Date.now() + INTELLIGENCE_PREFIX_TTL_MS,
    });
    return assembled;
  } catch (err) {
    console.warn('[IntelligencePrefix] Failed to load intelligence context:', err);
    return '';
  }
}
