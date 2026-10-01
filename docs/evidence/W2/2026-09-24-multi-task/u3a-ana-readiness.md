# U3a — /readyz reported AnA ready on a deployment that cannot draft

Launch row: **D1** (hosted production; acceptance is `/readyz` 200 with `ana` ok).
Date: 2026-09-25. Branch: `concept2cure-v2`. Not committed by this session.

## The defect

Production passes one AI credential. `terraform/stack/main.tf:199` puts
`OPENAI_API_KEY` in the task's `boot_secrets`, and no other provider key or
private-cloud switch (`ANTHROPIC_API_KEY`, `AI_BEDROCK_ENABLED`,
`AI_VERTEX_ENABLED`) appears anywhere in `terraform/`.

Since 2026-09-22 the gateway refuses high-risk work (`document_drafting`, and
`regulatory_review` unless the caller declares it low or medium risk) to any
model not marked `approvedForHighRisk` in
`server/services/ai-governance/approved-models.ts`. Only four entries are so
marked, and all of them are Claude: `claude-opus-4` (line 86),
`claude-opus-4-legacy` (98), `claude-opus-4-bedrock` (211) and
`claude-opus-4-vertex` (235). `gpt-4o` (146) and `gpt-4o-mini` (158) are
`approvedForHighRisk: false`. When nothing approved remains, `selectModel`
throws `ModelNotApprovedError(..., 'no-approved-model')`
(`server/services/ai-gateway/gateway.ts`, the `withheld` branch of
`selectModel`). On an OpenAI-only deployment that is every Authoring draft:
section generation, `AnaDocumentDraftingService` and the ai-editing routes.

Two things hid it:

1. `evaluateAnaReadiness` (`server/startup/ana-readiness-state.ts`, lines
   117–128 before this change) counted `gw.getEnabledProviders()` and nothing
   else. One enabled provider returned `'ready'`, so `/readyz` reported
   `ana: ok`. Its own `no_provider` detail told operators that
   `OPENAI_API_KEY` alone was a valid fix.
2. `classifyGatewayError` (`server/services/ai-gateway/gateway-error-map.ts`,
   lines 76–83 before this change) told the author "No model approved for
   regulatory drafting and review is available right now … Try again shortly."
   Retrying never helps. The refusal comes from configuration, not load.

## Was it right to turn ana down on this posture?

Yes. The readiness module already takes that position. Its contract, in
`inline-endpoints.ts` and in the module header, is that AnA is required
"without her this process cannot do the thing it exists to do". Authoring is
one of the six apps in the launch catalog (D2), and drafting is its core job.
Nothing in the repository carves drafting out of readiness. The provider-only
check was written before the high-risk approval gate existed (2026-09-22). The
gap is a consequence of that ordering, not a decision. CI boots in
deterministic mode (`ci.yml`, `AI_GATEWAY_DETERMINISTIC: 'true'`). This change
does not touch that path, and it still passes readiness.

What this change does not do: `/readyz` 503 does not replace tasks. The ECS
container check probes `/healthz` and the ALB target group probes `/api/health`
(`terraform/modules/ecs-fargate/main.tf:182`,
`terraform/modules/alb/main.tf:98`). The deploy smoke step reads `/readyz`
through the public URL (`deploy-aws.yml:703–733`), so an OpenAI-only deploy
will now fail that step. That is the intended outcome. If
`STRICT_STARTUP_INVARIANTS=true` is set, the critical `ana_ai_provider`
invariant halts boot on this posture. `.env.beta.example` sets it; the
production task definition does not.

## The fix

`server/startup/ana-readiness-state.ts`

- New state `'no_high_risk_model'`. `isAnaReadinessServing` is unchanged, and
  only `'ready'` and `'deterministic'` pass, so the new state maps to
  `ana: 'down'` through the existing `/readyz` code without editing
  `inline-endpoints.ts`.
- After the provider check, readiness reads `gw.getModels()`. That registry's
  `enabled` is already "model on AND provider configured" (`buildModelRegistry`).
  For every task in the canonical `HIGH_RISK_TASK_TYPES`, readiness requires an
  enabled model whose capabilities include the task and that passes the
  canonical `isApprovedForHighRisk(id)`. That is the predicate `selectModel`
  applies, so there is no second approval list. The check covers both
  high-risk types, not only drafting. Every approved model carries both, and
  review is refused on the same posture.
- The detail names the enabled providers, the unserved task types, and every
  approved model grouped by the provider that would have to be enabled. All of
  it is read from the registry. Real output on an OpenAI-only environment,
  through the unmocked `getGateway()`:

  > AI provider(s) enabled: openai — but no enabled model is approved for
  > regulatory drafting and review (document_drafting, regulatory_review), so
  > every Authoring draft is refused with MODEL_NOT_APPROVED_FOR_HIGH_RISK.
  > Models approved for it, by provider: anthropic (claude-opus-4,
  > claude-opus-4-legacy); bedrock (claude-opus-4-bedrock); vertex
  > (claude-opus-4-vertex). Enabling one of those providers is a
  > data-placement decision, not only a key. See approvedForHighRisk in
  > server/services/ai-governance/approved-models.ts.

- Fail-closed paths are kept, and one is added. `unknown`, `error`, a missing
  gateway and a throw all still fail. A gateway without `getModels` now
  reports `'error'` rather than passing unchecked. Deterministic mode is still
  checked first.
- The `no_provider` detail no longer offers `OPENAI_API_KEY` as sufficient.
- The boot banner has its own case for this state ("AnA CANNOT DRAFT"). The
  generic banner says every chat turn will fail, which is false here because
  chat is answered.
- `'ready'` detail now names the models serving drafting and review.

Not checked by readiness: per-request placement (residency, zero retention,
sensitive-data approvals). It depends on the request and can still refuse an
individual draft on a ready deployment. Also not checked: whether a Bedrock or
Vertex client actually authenticates. `AI_BEDROCK_ENABLED=true` counts as
enabled, which is the gateway's own view.

`server/services/ai-gateway/gateway-error-map.ts`

- `ModelNotApprovedError` with `reason: 'no-approved-model'`, or with no
  reason (route tests mock the class bare), now answers: "No model approved
  for regulatory drafting and review is configured on this deployment for this
  request, so it was not sent to one that is not approved for it. Retrying
  will not change this; an administrator needs to enable an approved model."
- `reason: 'explicit'` (a caller named an unapproved model) now answers: "The
  model requested is not approved for regulatory drafting and review, so this
  request was not sent to it." It does not claim that no approved model is
  configured, because one may be.
- The code is unchanged (`PROVIDER_UNAVAILABLE`, 503).

## Proof

New tests:

- `server/startup/__tests__/ana-readiness.test.ts`, describe block
  "evaluateAnaReadiness — regulatory drafting needs an approved model (U3a)".
  It builds the real `AIGateway` from environment variables, so the registry,
  provider enablement and approval verdict are the production code's, not a
  stub's. There is also one banner case. The existing stub gained `getModels`
  using real registry ids.
- `server/services/ai-gateway/__tests__/gateway-error-map-no-approved-model.test.ts`.

Fail before: the new tests run against unmodified source.

```
× ana-readiness › U3a › is NOT serving on an OpenAI-only deployment — the production posture
  → expected 'ready' to be 'no_high_risk_model'
× ana-readiness › U3a › is serving when an Anthropic key is present, and names the drafting model
  → expected 'AnA has 1 provider(s): anthropic' to contain 'claude-opus-4'
✓ ana-readiness › U3a › is serving with OpenAI and Anthropic together
× ana-readiness › U3a › is serving on Bedrock alone — the private-cloud drafting path counts
  → expected 'AnA has 1 provider(s): bedrock' to contain 'claude-opus-4-bedrock'
✓ ana-readiness › U3a › still reports no_provider — not no_high_risk_model — when nothing is configured
× ana-readiness › U3a › fails closed when the gateway exposes no model registry to check
  → expected true to be false
× ana-readiness › U3a › /readyz answers 503 with ana down on an OpenAI-only deployment
  → expected 200 to be 503
× gateway-error-map › no-approved-model: says the deployment has no approved model, not "try again shortly"
  → expected 'No model approved for regulatory draf…' not to match /try again shortly/i
× gateway-error-map › explicit: names the refusal of the requested model, and does not claim none is configured
  → expected 'No model approved for regulatory draf…' not to match /try again shortly/i
Test Files  2 failed (2)
```

The load-bearing failures are the first and the last `ana-readiness` ones. On
the OpenAI-only production posture, the old code returned `'ready'` and
`/readyz` answered 200. The two passing cases before the fix are controls: an
Anthropic-plus-OpenAI deployment was ready, and still is. An empty deployment
was `no_provider`, and still is.

Pass after: `npx vitest run server/startup/__tests__/ana-readiness.test.ts
server/services/ai-gateway/__tests__/gateway-error-map-no-approved-model.test.ts`
gives `Test Files 2 passed (2)`, `Tests 24 passed (24)`.

Existing suites that touch either file, run after the change: ana-readiness,
readyz-vault-storage, tests/ci/readyz-schema-gate,
build-order-14-governed-export-and-ops, high-risk-model-approval,
retry-policy-529, content-blocks-carried, context-window-admission,
cmc-drafting-governance, authoringAiDraftNoProvider,
module3-narrative-governance-refusal, mcp-auth-contract and the new file.
Result: `Test Files 13 passed (13)`, `Tests 121 passed (121)`. A `tsc` run
scoped to the four changed files reports no error in them. The full-project
`tsc --noEmit` did not finish within 10 minutes and is not claimed.

## Founder decision this surfaces (D1 brief B4)

`docs/evidence/W2/2026-09-23b/README.md` lists B4, AI provider and placement,
with three options: OpenAI only with fail-closed approvals, Anthropic under a
BAA (needs `ANTHROPIC_API_KEY` wired), or Bedrock via the task role (AWS BAA).
The synthesis recommended Bedrock via the task role.

After this change the first option is no longer a way to meet D1. An
OpenAI-only deployment boots, answers chat, reports `ana: down` with the detail
above, and fails the deploy smoke step, because no OpenAI model is approved for
high-risk drafting until its PQ executes (DoD, quoted in `highRiskBasis`). D1
green needs one of:

- Bedrock: `AI_BEDROCK_ENABLED=true` plus task-role access to
  `anthropic.claude-opus-4-7` in the chosen region. That serves
  `claude-opus-4-bedrock`, the entry approved as "primary high-risk
  authoring/review path for BAA + zero-retention customers". Note that its
  pinned version is Opus 4.7, while first-party `claude-opus-4` is pinned to
  Opus 5.
- Anthropic first-party: `ANTHROPIC_API_KEY` in `boot_secrets`. PHI then
  depends on the Anthropic BAA (D6, not signed).
- Vertex. Its approval is recorded as an inference awaiting reviewer
  confirmation (`approved-models.ts:236`).

Whichever is chosen, `AI_PROVIDER_PLACEMENT_APPROVALS` has to name that
provider for any sensitive dispatch to be allowed. That is separate from
readiness and not checked here.

## Left open

- `server/services/multi-agent-council.ts:323` carries its own copy of the old
  "… available right now … Try again shortly" text for the same refusal. It
  was outside this change's file scope and is not fixed.
- The provider-to-environment-variable hints in the `no_provider` detail
  (`ANTHROPIC_API_KEY`, `AI_BEDROCK_ENABLED`, `AI_VERTEX_ENABLED`) are prose,
  as the previous hints were. The `no_high_risk_model` detail is derived from
  the registry.
