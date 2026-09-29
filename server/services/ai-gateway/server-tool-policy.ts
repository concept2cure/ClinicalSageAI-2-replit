/**
 * Where an Anthropic-hosted tool may run — one rule, used twice.
 *
 * `web_search`, `web_fetch` and `code_execution` are SERVER tools: the model
 * calls them and Anthropic executes them on its own infrastructure. A search
 * query or a fetched URL is written by the model from the conversation, so it
 * carries the tenant's context to a place that is not the tenant's model lane.
 * Code execution runs the conversation's data in a sandbox Anthropic hosts. No
 * DPA annex lists either location (plan WS2, open decision 5).
 *
 * Until 2026-09-26 the only gate was three environment flags. The same tools
 * went to every tenant on the deployment, and the gateway forwarded them
 * verbatim to Bedrock and Vertex. That sent them to a private lane that
 * cannot run them, or, on Vertex, to hosted search the tenant never chose
 * (docs/evidence/D6/2026-09-26-egress-tools/).
 *
 * The rule, in order:
 *   1. Only first-party Anthropic runs these tools. Every other lane — Bedrock,
 *      Vertex, OpenAI, Azure, Kimi, self-hosted — has them withheld.
 *   2. Code execution only ever sees a provably public payload. AnA's turns are
 *      tenant payloads, so in practice it is never offered to them; the
 *      platform's own sandbox (`run_python_script`) is the path for tenant data.
 *   3. A tenant-bound request needs the tenant's opt-in: a resolved placement
 *      policy with `public_source_frontier` on and `public_source_egress` not
 *      off, and neither zero retention nor a residency requirement, since
 *      neither can be vouched for on hosted tools. No policy row, or a policy
 *      that could not be read, is no opt-in.
 *   4. Work with no tenant at all — the explicit system scope, or development
 *      with no scope — carries no tenant context, and is not held back here.
 *
 * `governedToolsetFor` applies it without a provider (so a tenant is never
 * offered a tool it could not use), and the gateway applies it again per lane
 * just before dispatch (so no door that skips the toolset can get past it).
 * Withholding is not an error: nothing leaves, the turn runs without the tool,
 * and the withheld tools and the reason are recorded in the ledger row.
 *
 * @module server/services/ai-gateway/server-tool-policy
 */

import type { GatewayRequest, PayloadProvenance, ProviderName } from './types';

export type ServerToolWithheldReason =
  | 'not_first_party'
  | 'tenant_data_to_hosted_execution'
  | 'tenant_policy_unknown'
  | 'tenant_not_opted_in';

export interface WithheldServerTool {
  name: string;
  reason: ServerToolWithheldReason;
}

type TenantSnapshot = GatewayRequest['sensitiveTenantPolicy'];

/** A tool Anthropic executes: it names a versioned `type` and carries no input schema. */
export function isServerTool(tool: unknown): tool is { type: string; name: string } {
  if (!tool || typeof tool !== 'object') return false;
  const t = tool as Record<string, unknown>;
  return typeof t.type === 'string' && t.type !== 'custom' && !('input_schema' in t);
}

function isCodeExecution(tool: { type: string; name: string }): boolean {
  return tool.name === 'code_execution' || tool.type.startsWith('code_execution');
}

/** Why the tenant has not opted in, or null when it has (or the request has no tenant). */
function tenantReason(tenant: TenantSnapshot): ServerToolWithheldReason | null {
  if (!tenant) return null;
  if (tenant.resolution === 'unknown') return 'tenant_policy_unknown';
  if (tenant.resolution === 'absent') {
    // A system or no-scope request carries no tenant; an org with no row has not opted in.
    return tenant.organizationId === undefined ? null : 'tenant_not_opted_in';
  }
  const residencyConstrained = !!tenant.residency && tenant.residency !== 'any';
  const optedIn =
    tenant.publicSourceFrontier === true &&
    tenant.publicSourceEgress !== false &&
    tenant.zeroDataRetention !== true &&
    !residencyConstrained &&
    (!tenant.allowedProviders || tenant.allowedProviders.includes('anthropic')) &&
    (!tenant.allowedSubstrates || tenant.allowedSubstrates.includes('frontier_shared'));
  return optedIn ? null : 'tenant_not_opted_in';
}

/**
 * Why this server tool must not be offered, or null when it may be.
 * `provider` is omitted when the lane is not yet known (toolset composition).
 */
export function serverToolWithheldReason(
  tool: { type: string; name: string },
  ctx: { provider?: ProviderName; payloadProvenance?: PayloadProvenance; tenant: TenantSnapshot },
): ServerToolWithheldReason | null {
  if (ctx.provider !== undefined && ctx.provider !== 'anthropic') return 'not_first_party';
  if (isCodeExecution(tool) && ctx.payloadProvenance !== 'public') return 'tenant_data_to_hosted_execution';
  return tenantReason(ctx.tenant);
}

/**
 * The request as it may be sent to `provider`: server tools the rule withholds
 * are removed (and a tool choice that named one is dropped with them), and the
 * withheld list says which and why. Returns the request unchanged when nothing
 * is withheld.
 */
export function governServerTools(
  provider: ProviderName,
  request: GatewayRequest,
): { request: GatewayRequest; withheld: WithheldServerTool[] } {
  const tools = request.tools as unknown[] | undefined;
  if (!tools || tools.length === 0) return { request, withheld: [] };

  const withheld: WithheldServerTool[] = [];
  const kept = tools.filter(tool => {
    if (!isServerTool(tool)) return true;
    const reason = serverToolWithheldReason(tool, {
      provider,
      payloadProvenance: request.payloadProvenance,
      tenant: request.sensitiveTenantPolicy,
    });
    if (reason) withheld.push({ name: tool.name, reason });
    return reason === null;
  });
  if (withheld.length === 0) return { request, withheld };

  const withheldNames = new Set(withheld.map(w => w.name));
  const choice = request.toolChoice as unknown;
  const choiceNamesWithheld =
    !!choice && typeof choice === 'object' && withheldNames.has(String((choice as { name?: unknown }).name));
  const dropChoice = kept.length === 0 || choiceNamesWithheld;
  return {
    request: {
      ...request,
      tools: kept.length > 0 ? (kept as GatewayRequest['tools']) : undefined,
      ...(dropChoice ? { toolChoice: undefined } : {}),
    },
    withheld,
  };
}
