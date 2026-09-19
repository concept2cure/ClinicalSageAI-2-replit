/**
 * The tool surface a tenant is permitted to be offered — composed once.
 *
 * ── The defect ──────────────────────────────────────────────────────────────
 * `organizations.settings.anaToolPolicy.deny` lets a tenant switch a tool off.
 * Honouring it takes two steps — load the policy, filter the assembled toolset —
 * and every caller was doing both by hand. Three sites did; one did not.
 *
 *   server/routes/ana-ri/stream.ts        filterToolsByPolicy(allTools, policy) ✓
 *   server/services/ana/deep-investigation.ts                                  ✓
 *   server/routes/chat/send-message.ts    selectToolsForTurn(getAllEnabledTools(), …)
 *
 * So a tenant that denied a tool had it denied on the streaming endpoint and
 * still offered on `POST /api/chat/send-message`. That is worse than a
 * capability wired to one of two doors, which is the shape this codebase keeps
 * producing: a GOVERNANCE CONTROL wired to one of two doors does not fail
 * visibly, it just quietly does not hold, and the tenant has no way to find out
 * except by watching the model use the tool they turned off.
 *
 * Composing it here removes the chance to forget: there is one function to
 * call, and `server/routes/__tests__/chat-path-parity.test.ts` asserts every
 * canonical chat path calls it.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 * Only the deny-list is applied, exactly as `filterToolsByPolicy` documents:
 * `allow` is scoped to governed mutations and enforced at execution, and
 * applying it to the read toolset would strip every search tool the moment a
 * tenant allowlisted one mutation. Relevance selection stays with the caller —
 * each path pins different tools for its own reasons, and governance must not
 * be entangled with relevance.
 *
 * Fail-soft on an unreadable policy (default-allow), because
 * `loadAnaToolPolicy` is the read/display variant; a governed WRITE resolves
 * the strict one at execution instead.
 *
 * @module server/services/ana/governed-toolset
 */

import { getAllEnabledTools } from './AnaToolDefinitions.js';
import { loadAnaToolPolicy, filterToolsByPolicy } from '../ana-ri/mdx-tool-policy.js';

type PolicyPool = { query: (sql: string, params: unknown[]) => Promise<{ rows: any[] }> };

/**
 * Every enabled AnA tool this organization permits.
 *
 * `organizationId` may be absent — an unauthenticated or org-less turn has no
 * tenant policy to apply, and gets the unfiltered set, which is what every
 * caller already did.
 */
export async function governedToolsetFor(
  pool: PolicyPool,
  organizationId: number | null | undefined,
): Promise<ReturnType<typeof getAllEnabledTools>> {
  const all = getAllEnabledTools();
  if (organizationId == null || !Number.isFinite(Number(organizationId))) return all;
  const policy = await loadAnaToolPolicy(pool, Number(organizationId));
  return filterToolsByPolicy(all, policy);
}
