# AI sensitive-data placement contract

This control does **not** claim HIPAA compliance or contractual zero retention. The application cannot create either condition. An authorized deployment owner must encode an existing placement, retention, and regional decision in `AI_PROVIDER_PLACEMENT_APPROVALS`.

## Canonical decision and error contract

`server/services/ai-gateway/sensitive-placement-policy.ts` is the sole placement decision. Its inputs are environment, detected data class, tenant requirements, provider, region, explicit zero-retention approval, and intended use. `AIGateway.executeProvider` applies it immediately before every primary or fallback dispatch. A denial is terminal and returns `GatewayPolicyError` with a stable reason code and remediation-safe text; it never retries another provider. A malformed `AI_PROVIDER_PLACEMENT_APPROVALS` value encountered at dispatch is likewise terminal (`GatewayPolicyError`, fail closed, never retried) — a configuration error is not reported as a provider outage.

Logs contain only reason code, provider, region, data class, and disposition. They never contain the prompt or detected value. Existing gateway audit entries use a prompt hash and content-policy metadata rather than raw prompt content.

## Environment contract

`AI_SENSITIVE_DATA_POLICY_MODE` has one meaning with two consequences:

- **Boot assert (production):** `NODE_ENV=production` refuses to start unless the value is exactly `enforce` (see `assertSensitivePlacementConfiguration`).
- **Runtime enforcement (every environment):** wherever the value is exactly `enforce` — staging included — the dispatch-time gate in `AIGateway.assertSensitiveDispatchAllowed` blocks unapproved sensitive dispatch, identically to production. Declaring the policy mode is never boot-check-only.

The gate enforces when **any** of the following holds; otherwise it runs in audit mode:

- `NODE_ENV=production` (always, regardless of any other variable);
- `AI_SENSITIVE_DATA_POLICY_MODE=enforce`;
- `AI_PII_ENFORCEMENT=block`.

So a staging deployment (`NODE_ENV=staging`) proves real enforcement by setting `AI_SENSITIVE_DATA_POLICY_MODE=enforce` — the same variable production requires — with no second contract to remember.

## Production deployment

Production requires:

- `AI_SENSITIVE_DATA_POLICY_MODE=enforce`;
- a non-empty JSON object in `AI_PROVIDER_PLACEMENT_APPROVALS`;
- a region, approved data classes, intended uses, and an affirmative human-supplied retention decision for every sensitive-data approval.

Missing, malformed, or contradictory settings stop startup. Unknown providers, detector failures, missing regions, unapproved uses/classes, and absent retention approval block dispatch. Local development may retain `AI_PII_ENFORCEMENT=audit` behavior (the default when neither enforcement variable above is set): dispatch is not blocked, but every detection headed to a provider is recorded as a content-free structured warning (data class, provider, region, zero-retention approval, and the would-be decision's reason code — never message content).

## Dispatch inventory

The canonical text-generation paths are `AIGateway.route`, `complete`, `chat`, and `structuredOutput`; all converge on `executeProvider`.

The repository also contains legacy/direct SDK paths (including `openai-service.ts`, `services/openai-service.ts`, `services/openai-client.ts` consumers, `anthropic-client.ts` consumers, `aiProviderRouter.ts`, embeddings/vectorization, image generation, and the legacy raw fetch in `api/ai/routes.ts`). They are **not approved for PHI/PII** and must not be presented as governed gateway paths. They remain explicit migration debt rather than being silently described as covered. Production features carrying user or retrieved clinical content must use the gateway; static enforcement for all legacy call sites is a follow-up release gate.
