/**
 * Which gateway errors are final, for callers that wrap the gateway.
 *
 * gateway.route() never retries these and never walks its fallback ladder
 * for them: a policy refusal (tenant placement, model approval, content
 * policy, media or a file reference a lane cannot carry), a caller's cancel,
 * and a model's decline. None of them is a provider failing, so none may
 * count against a provider's health, be re-dispatched to another vendor, or
 * be answered with substitute content.
 *
 * Until 2026-09-26 three wrappers treated them as outages anyway
 * (docs/evidence/D6/2026-09-26-refusals-are-final/):
 *  - AIProviderRouter walked a tenant placement refusal to another vendor and
 *    marked the refused provider unhealthy for every tenant;
 *  - /api/ai-assistance re-dispatched it through that router, then answered
 *    200 with template text;
 *  - the council retried it three times and recorded "All LLM providers
 *    unavailable".
 *
 * Matched by `name`, not `instanceof`: route tests mock the gateway module
 * with a hand-listed set of classes, and an `instanceof` against one the mock
 * omits throws. No GatewayPolicyError subclass overrides its name.
 *
 * @module server/services/ai-gateway/gateway-outcome
 */

const TERMINAL_NAMES = new Set(['GatewayPolicyError', 'GatewayAbortedError', 'GatewayModelDeclinedError']);

/** A refusal, cancel or decline the gateway will never retry or re-route. */
export function isTerminalGatewayError(err: unknown): boolean {
  return !!err && typeof err === 'object' && TERMINAL_NAMES.has(String((err as { name?: unknown }).name));
}

/** A tenant placement refusal (TenantPlacementError): it names its reason code and the stage that refused. */
export function isTenantPlacementRefusal(err: unknown): err is Error & { reasonCode: string; stage: string } {
  const e = err as { name?: unknown; reasonCode?: unknown; stage?: unknown } | null;
  return (
    !!e &&
    e.name === 'GatewayPolicyError' &&
    typeof e.reasonCode === 'string' &&
    typeof e.stage === 'string'
  );
}
