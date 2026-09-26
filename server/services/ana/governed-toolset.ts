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
 * ── Anthropic-hosted tools ──────────────────────────────────────────────────
 * Web search, web fetch and code execution run on Anthropic's infrastructure,
 * so they are offered only when the tenant's AI placement policy opts in
 * (server-tool-policy.ts). Until 2026-09-26 three environment flags offered
 * them to every tenant on the deployment alike.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 * Only the deny-list is applied, exactly as `filterToolsByPolicy` documents:
 * `allow` is scoped to governed mutations and enforced at execution, and
 * applying it to the read toolset would strip every search tool the moment a
 * tenant allowlisted one mutation. Relevance selection stays with the caller —
 * each path pins different tools for its own reasons, and governance must not
 * be entangled with relevance.
 *
 * ── Launch scope ────────────────────────────────────────────────────────────
 * With launch scope enforced (production by default), tools that serve only
 * apps outside the release are withheld too (ana-launch-scope.ts, 2026-09-26).
 * The API refuses those apps' routes, but AnA reaches their services
 * in-process, so this is the only place their tools can be taken away from
 * every chat door at once. Unlike the tenant policy it does not depend on the
 * organisation, and it applies to an org-less turn as well.
 *
 * Fail-soft on an unreadable policy (default-allow), because
 * `loadAnaToolPolicy` is the read/display variant; a governed WRITE resolves
 * the strict one at execution instead.
 *
 * @module server/services/ana/governed-toolset
 */

import { getAllEnabledTools } from './AnaToolDefinitions.js';
import { loadAnaToolPolicy, filterToolsByPolicy } from '../ana-ri/mdx-tool-policy.js';
import { CATALOG_GATED_TOOLS } from './document-tools-shared.js';
import { getOrgPlacementResolver } from '../ai-gateway/providers/org-placement.js';
import { isServerTool, serverToolWithheldReason } from '../ai-gateway/server-tool-policy.js';
import type { GatewayRequest } from '../ai-gateway/types.js';
import { withoutHiddenAppTools } from './ana-launch-scope.js';
import { launchScopeEnforced } from '../entitlements/launch-scope.js';

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
  const all = launchScopeEnforced() ? withoutHiddenAppTools(getAllEnabledTools()) : getAllEnabledTools();
  if (organizationId == null || !Number.isFinite(Number(organizationId))) {
    // The catalog tools refuse an org-less call outright, so they are not
    // offered; nor are Anthropic-hosted tools, which need a tenant's opt-in.
    return withPermittedServerTools(withoutCatalogTools(all), {
      resolution: 'unknown',
      unknownReason: 'no_tenant_binding',
    });
  }
  const orgId = Number(organizationId);
  const [policy, tenant] = await Promise.all([loadAnaToolPolicy(pool, orgId), tenantPlacementFor(orgId)]);
  const permitted = withPermittedServerTools(filterToolsByPolicy(all, policy), tenant);
  return (await catalogEnabledFor(orgId)) ? permitted : withoutCatalogTools(permitted);
}

type TenantSnapshot = GatewayRequest['sensitiveTenantPolicy'];

/**
 * The organization's AI placement policy, in the shape the server-tool rule
 * reads. An unreadable policy is `unknown`, which withholds every hosted tool:
 * the same fail-closed reading the gateway gives it at dispatch.
 */
async function tenantPlacementFor(organizationId: number): Promise<TenantSnapshot> {
  try {
    const policy = await getOrgPlacementResolver().resolve(organizationId);
    if (!policy) return { resolution: 'absent', organizationId };
    return {
      resolution: 'resolved',
      organizationId,
      residency: policy.residency,
      zeroDataRetention: policy.zeroDataRetention,
      allowedSubstrates: policy.allowedSubstrates,
      allowedProviders: policy.allowedProviders,
      publicSourceFrontier: policy.publicSourceFrontier,
      publicSourceEgress: policy.publicSourceEgress,
    };
  } catch {
    return { resolution: 'unknown', unknownReason: 'lookup_failed', organizationId };
  }
}

/**
 * Anthropic-hosted tools (web search, web fetch, code execution) only when the
 * tenant's placement policy permits them (server-tool-policy.ts). AnA's turns
 * are tenant payloads, so code execution is never offered here. The gateway
 * applies the same rule again per lane at dispatch; this keeps a tenant from
 * being offered a tool the gateway would only withhold.
 */
function withPermittedServerTools<T>(tools: T[], tenant: TenantSnapshot): T[] {
  return tools.filter(
    tool => !isServerTool(tool) || serverToolWithheldReason(tool, { tenant }) === null,
  );
}

/**
 * Whether the organization's document catalog is on — and false when that
 * cannot be read.
 *
 * ── Why the toolset asks ────────────────────────────────────────────────────
 * 'ana.document_catalog' is off for every new organisation, which is the launch
 * default and not this module's decision. With it off, the seven catalog tools
 * were still offered on every turn and every call refused — and the persona's
 * client-files rule sends AnA to list_project_documents the moment a user
 * mentions their material. So a regulatory user asking about a file they had
 * uploaded to the Vault got a refusal naming an internal feature key. A tool
 * that can only refuse is not a tool to offer; this is also the one place all
 * three chat doors already compose through, so the gate holds on each of them.
 *
 * Fail closed: an unreadable toggle means the tools would refuse too, so they
 * are withheld rather than offered.
 */
async function catalogEnabledFor(organizationId: number): Promise<boolean> {
  try {
    const { isDocumentCatalogEnabled } = await import('../vault/document-catalog.service.js');
    return await isDocumentCatalogEnabled(organizationId);
  } catch {
    return false;
  }
}

function withoutCatalogTools<T extends { name: string }>(tools: T[]): T[] {
  return tools.filter(t => !CATALOG_GATED_TOOLS.includes(t.name));
}
