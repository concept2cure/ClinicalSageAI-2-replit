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
- a region, approved data classes, intended uses, and an affirmative human-supplied retention decision for every sensitive-data approval;
- for every zero-retention approval of a lane a third party runs, the agreement it rests on, and the placement registry's own flag for that provider (below).

Missing, malformed, or contradictory settings stop startup. Unknown providers, detector failures, missing regions, unapproved uses/classes, and absent retention approval block dispatch. Local development may retain `AI_PII_ENFORCEMENT=audit` behavior (the default when neither enforcement variable above is set): dispatch is not blocked, but every detection headed to a provider is recorded as a content-free structured warning (data class, provider, region, zero-retention approval, and the would-be decision's reason code — never message content).

## Zero retention rests on a named agreement (D6, 2026-10-25)

Until 2026-10-25 a zero-retention approval was one boolean, `zeroRetentionApproved`, in `AI_PROVIDER_PLACEMENT_APPROVALS`. Nothing tied it to an agreement, and the gateway passed that same boolean as both keys of the decision, so one JSON value could send PII to a shared API in production with no agreement in place. It also never compared the boolean with the placement registry's own flag (`providers/placement.ts`).

**The agreement.** An entry with `zeroRetentionApproved: true` names the agreement it rests on:

```json
"anthropic": {
  "region": "global",
  "zeroRetentionApproved": true,
  "zeroRetentionAgreement": { "reference": "<the signed agreement or addendum>", "effectiveFrom": "YYYY-MM-DD" },
  "approvedDataClasses": ["pii"],
  "approvedIntendedUses": ["drafting"]
}
```

`reference` is non-blank: the contract or addendum an auditor can ask to see. `effectiveFrom` is a real calendar date, written `YYYY-MM-DD`, read as a UTC date. `readProviderPlacementApprovals` refuses a zero-retention approval without one, and an agreement that is malformed on any entry, with a sentence that says what is missing; in production that refusal stops startup, and at dispatch it fails closed as misconfiguration. A JSON `null` is no agreement. The self-hosted lane (`local`) needs none: no third party receives its text (ADR-0014 §1.5), so its approval is unchanged.

**Two keys.** The placement registry's flag for the provider is the other key:

| Provider | Registry flag |
|---|---|
| `anthropic` | `ANTHROPIC_ZERO_RETENTION=true` |
| `openai` | `OPENAI_ZERO_RETENTION=true` |
| `bedrock` | `AI_BEDROCK_ZERO_RETENTION=true` |
| `vertex` | `AI_VERTEX_ZERO_RETENTION=true` |
| `azure` | `AI_AZURE_ZERO_RETENTION=true` |
| `moonshot` | none: never a zero-retention lane |
| `local` | none needed: self-hosted |

No lane a third party runs claims zero retention without its flag. Bedrock did until 2026-10-25 (an unset `AI_BEDROCK_ZERO_RETENTION` claimed it); it now claims it only when the flag is `true`.

**At dispatch.** A sensitive dispatch that requires zero retention (every one in production, and any whose tenant requires it) is allowed only when the registry flag is true, the approval approves zero retention, and its agreement's `effectiveFrom` is on or before the dispatch date. An agreement dated tomorrow is on record and not in force: the dispatch is refused with `DENY_SHARED_PROVIDER_WITHOUT_ZDR` (`zeroRetentionInForce`, `decideSensitivePlacement`).

**At production boot.** `assertSensitivePlacementConfiguration` also refuses the two keys disagreeing (`zeroRetentionDisagreements`): a zero-retention approval for a provider whose registry flag is not true, for Moonshot, or for a name the gateway does not route to; and a registry flag set to `true` for a provider the approvals do not approve for zero retention.

**In the ledger.** Each served row of a sensitive dispatch that relied on zero retention names the agreement in `ai.gateway_audit_log.metadata.zeroRetentionAgreement` (`{reference, effectiveFrom}`), for chat and for embeddings, beside `placement_reason_code` and `retention_policy`. A row that did not rely on zero retention (a non-sensitive call, a self-hosted lane that names no agreement, a refusal) names none.

**In Terraform.** `terraform/stack/variables.tf` refuses at plan a zero-retention approval with no agreement, and a malformed agreement on any entry. It also refuses a zero-retention approval for any provider but `local`: the stack sets none of the registry flags, so the app's boot would refuse it and every task would crash-loop.

**How an operator records an agreement.** No agreement is signed today (D6 owes the Anthropic BAA), so every approval for a third-party lane stays `zeroRetentionApproved: false` with no sensitive data classes. When one is signed:

1. File the signed agreement and its effective date in the D6 evidence.
2. Set the provider-side setting it requires (for example, model-invocation logging off for Bedrock).
3. In the same change, add `zeroRetentionAgreement` to the provider's approval with the agreement's reference and effective date, and set the provider's registry flag to `true`. In the hosted stack that means adding the flag to the task definition (`terraform/stack/main.tf`) and relaxing the stack's rule for that provider; the boot refuses either half without the other.
4. Set the flag no earlier than `effectiveFrom`. Dispatch-time checks honour the date, but the tenant floor (`requestPlacementDenial`) and the ledger's `retention_policy` column read the registry flag alone, so a flag set before the agreement takes effect lets a zero-retention tenant's non-sensitive payloads reach that provider and be recorded as `zero_retention` early.

## Dispatch inventory

The canonical text-generation paths are `AIGateway.route`, `complete`, `chat`, and `structuredOutput`; all converge on `executeProvider`.

The repository also contains legacy/direct SDK paths (including `openai-service.ts`, `services/openai-service.ts`, `services/openai-client.ts` consumers, `anthropic-client.ts` consumers, `aiProviderRouter.ts`, image generation, and the legacy raw fetch in `api/ai/routes.ts`). They are **not approved for PHI/PII** and must not be presented as governed gateway paths. They remain explicit migration debt rather than being silently described as covered. Production features carrying user or retrieved clinical content must use the gateway; static enforcement for all legacy call sites is a follow-up release gate.

Embeddings left that list on 2026-09-25 (security audit 2026-09-24 DP-07, plan P0-11): `embeddings/embedding-provider.ts` is the one embedding seam, and `embed()` asks `AIGateway.authorizeEmbedding` before any SDK client exists — the org's placement defaults, content classification, the residency / zero-retention rule, and the sensitive-dispatch gate with intended use `embedding`. A refusal is a terminal `GatewayPolicyError` with the same content-free audit row as a chat block. Consequences: an `AI_PROVIDER_PLACEMENT_APPROVALS` entry must list `"embedding"` in `approvedIntendedUses` for sensitive text to be embedded on that provider; a zero-retention or region-resident tenant's embeddings are refused until a compliant lane exists (`EMBEDDING_PROVIDER=local` with `EMBEDDING_LOCAL_BASE_URL`, or `OPENAI_ZERO_RETENTION=true` with an `openai` approval that names the signed ZDR agreement, above); and `EMBEDDING_PROVIDER=local` with no base URL is a configuration error, never a fallback to OpenAI. Callers that reach the seam without an organisation (`openai-service.ts:37`, `lib/unified-ai-client.ts:99`, `enhancedEmbeddingService.embedBatch`) are covered only by the running request's tenant scope; passing the organisation explicitly is the remaining debt on those call sites.
