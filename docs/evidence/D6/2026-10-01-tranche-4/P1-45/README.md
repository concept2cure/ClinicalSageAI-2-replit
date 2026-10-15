# P1-45 (INF-21, DP-07): production provider election — OpenAI only when named, Moonshot never

Row **D6**. Plan item P1-45, decision ADR-0014 §1 (`docs/adr/0014-launch-security-and-data-protection-decisions.md`). Date 2026-10-01, base `0e58e794`.

## What was wrong

The DPA (Annex III) says OpenAI and Moonshot are "disabled for a tenant unless its Order Form lists them". The code did not say so.

- **No vendor constraint by default.** `OrgPlacementPolicy.allowedProviders` absent meant "no vendor constraint" (`providers/org-placement.ts`). That covered an organization with no placement row, a row whose `allowed_providers` is NULL, a request with no organization, and an unreadable policy carrying a public payload. `tenantAllowListDenial` (`gateway.ts`) only refused a provider when a list existed and left it out.
- **OpenAI reached on fallback.** In production, an unelected tenant's chat, drafting, streaming and tool-call requests walked from Anthropic to OpenAI as soon as Anthropic failed and `OPENAI_API_KEY` was set. The red run shows `['anthropic', …, 'openai']` dispatched for organization 4501, which has no placement row.
- **OpenAI as the embedding lane.** The embedding provider's default lane is OpenAI. The red run's audit line `openai/text-embedding-3-small task=embedding … org=4502` is an unelected organization's text embedded through OpenAI in production.
- **Moonshot whenever a key was set.** With `KIMI_API_KEY` or `MOONSHOT_API_KEY` set, production booted, the gateway built a Moonshot client and enabled its models, and the fallback chain could reach them.
- **Terraform did not keep OpenAI out.** The ticket said the DPA sentence was true only because Terraform provisions no such key. It is not true at `0e58e794`. `terraform/stack/main.tf` puts `OPENAI_API_KEY` in every container's `boot_secrets`, and it provisions no `ANTHROPIC_API_KEY`.

## What is true now (NODE_ENV=production only)

There is one rule, `providerElectionRefusal` in `providers/org-placement.ts`. The gateway applies it as step 2 of its single placement predicate, `tenantPlacementVerdict` (`providerElectionDenial`). That predicate already governs:

- selection;
- every fallback rung;
- streaming and tool calls (same path);
- the last-mile re-check before every SDK call (`assertTenantPlacement`);
- the PQ path (`evaluateModel`);
- `authorizeEmbedding`.

So every one of them inherits the rule. The rule:

| Provider | No placement row / NULL list / no organization / unreadable policy | Policy lists it | Policy does not list it |
|---|---|---|---|
| anthropic, bedrock, local | allowed (default set: a default sub-processor, or no third party) | allowed | refused by the tenant's own allow-list, as before |
| openai, azure, vertex | **refused** | allowed | refused |
| moonshot | **refused** | **refused** | refused |

- **Public payloads too.** The rule is not lifted by a public-source opt-in (`publicSourceFrontier`). It says which vendors may receive anything of the organization's at all.
- **Moonshot, defence in depth.**
  - Boot: `assertAiProviderElectionPostureForProduction` (`server/startup/ai-governance-posture.ts`) fires from `server/config/environment.ts` beside the other AI boot gates. It refuses `KIMI_API_KEY` and `MOONSHOT_API_KEY`. There is no acceptance flag. The real message is in `green/production-boot-moonshot-refused.txt`.
  - Gateway: the constructor (`withoutExcludedProviders`) disables the `moonshot` provider entry and drops its key whatever the environment or a config override says. No client is built and no model is enabled.
  - Predicate: the placement predicate refuses `moonshot` again even if a model were force-enabled.
- **Outcomes.**
  - Anthropic failing for an unelected tenant: the fallback chain skips OpenAI, and the request ends in `GatewayAllProvidersFailedError`, which is **503 `PROVIDER_UNAVAILABLE`**. Nothing is fabricated.
  - Production with no default lane configured at all: the existing terminal, audited `TenantPlacementError` (`DENY_TENANT_POLICY`), which is **403 `PLACEMENT_REFUSED`**. Its message says that OpenAI is not an AI service the organization has elected. See residual 1.
  - Embeddings for an unelected tenant: a terminal `GatewayPolicyError` (`DENY_TENANT_POLICY`) before the OpenAI client is constructed. The refusal is written to the ledger, content-free.
- **The writer** (`providers/org-placement-writer.ts`).
  - `parsePlacementPolicyInput` accepts `allowedProviders: ['anthropic','openai']`, so an administrator elects OpenAI explicitly. In production it refuses a list naming `moonshot`, citing ADR-0014 §1.
  - `placementPolicyContradiction` checks satisfiability against the same effective set the gateway uses (`effectiveAllowedProviders`).
- **Outside production nothing changes.** Each new test file has a development or test case pinning that.
- **The resolver is unchanged.** `org-placement-db.ts` still reports what is stored: an absent row is `null`, and a NULL column is `undefined`. The election is the gateway's reading of it, in one function.

## Red / green

| Check | Red (HEAD `0e58e794` export, no fix) | Green (HEAD + P1-45) |
|---|---|---|
| `production-provider-election.test.ts` (16): no row + Anthropic failing; NULL list; stream + tools; caller names openai; last mile; azure/vertex; public opt-in; only-OpenAI lane; system scope; elected keeps OpenAI (2); Moonshot (3); dev unchanged (2) | 12 failed, 4 passed (the 2 elected and 2 dev controls) | 16 passed |
| `embedding-provider-election.test.ts` (5) | 3 failed: OpenAI embedded org 4502's text; 2 controls passed | 5 passed |
| `org-placement-election.test.ts` (11) | 8 failed (no election rule; writer stored `moonshot`); 3 passed | 11 passed |
| `ai-provider-election-posture.test.ts` (9), including a real production import of `environment.ts` | 8 failed (`LOADED` with `MOONSHOT_API_KEY` / `KIMI_API_KEY` set); 1 control passed | 9 passed |
| 4 amended suites (`embedding-placement-gate`, `sensitive-placement-gate`, `sensitive-placement-integration`, `embedding-provider`) | n/a | passed (72 tests across all 8 files) |
| Neighbour suites: all of `server/services/ai-gateway` (52 files), AI boot postures, `ana-readiness`, `approved-models`, `environment`, LiteLLM bypass contract, `ai-placement-policy` route | n/a | 59 files, 716 passed |
| `npm run -s ci:gateway-bypass` | n/a | OK, no new bypasses (8 baselined) |
| ESLint on every changed file | n/a | 0 errors; warnings identical to HEAD on `gateway.ts` and the 3 amended tests; none on new files |

Files: `red/vitest-red.txt`; `green/vitest-green.txt`, `green/full-suite-files.txt`, `green/ci-gateway-bypass.txt`, `green/production-boot-moonshot-refused.txt`, `green/eslint.txt`.

**Why the four existing suites were amended.** Each tests a later decider (zero-retention floor, intended-use approval, the sensitive last-mile gate) using OpenAI in production. Under the election, an unelected tenant is now refused earlier, at `DENY_TENANT_POLICY`. Each now gives its tenant `allowedProviders: ['openai']`, so it still reaches the decider it exists to test. The earlier refusal is pinned by the new files.

## Commands

```
# red: HEAD exported without the fix, new tests copied in
git archive HEAD server shared tests/setup.ts vitest.config.ts tsconfig.json package.json | tar -x -C <scratch>/headtree
ln -s $PWD/node_modules <scratch>/headtree/node_modules
cp <the 4 new test files> <scratch>/headtree/<same paths>
(cd <scratch>/headtree && NODE_OPTIONS=--max-old-space-size=2560 npx vitest run <the 4 files>)

# green
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run \
  server/services/ai-gateway/__tests__/production-provider-election.test.ts \
  server/services/ai-gateway/embeddings/__tests__/embedding-provider-election.test.ts \
  server/services/ai-gateway/providers/__tests__/org-placement-election.test.ts \
  server/startup/__tests__/ai-provider-election-posture.test.ts \
  server/services/ai-gateway/__tests__/embedding-placement-gate.test.ts \
  server/services/ai-gateway/__tests__/sensitive-placement-gate.test.ts \
  server/services/ai-gateway/__tests__/sensitive-placement-integration.test.ts \
  server/services/ai-gateway/embeddings/__tests__/embedding-provider.test.ts
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run server/services/ai-gateway \
  server/startup/__tests__/ai-governance-posture.test.ts server/startup/__tests__/ai-provider-election-posture.test.ts \
  server/startup/__tests__/ana-readiness.test.ts server/services/ai-governance/__tests__/approved-models.test.ts \
  server/config/__tests__/environment.test.ts server/services/ai/__tests__/litellm-gateway-bypass-fail-closed.contract.test.ts \
  server/routes/__tests__/ai-placement-policy.test.ts
npm run -s ci:gateway-bypass
```

## Residuals

1. **No default lane configured: 403, not 503.** A production deployment with no default lane (no Anthropic, Bedrock or self-hosted) and only OpenAI/Azure/Vertex gets 403 `PLACEMENT_REFUSED` for an unelected tenant. That is the existing terminal, audited tenant-placement refusal. ADR-0014 §1.2 asks for an honest 503 "when Anthropic is unavailable". This change gives that for a failing Anthropic, but not for an absent one.
   - Making the absent case 503 is a classification change in `server/services/ai-gateway/gateway-error-map.ts`, which this item does not own.
   - It cannot be done by throwing `GatewayNoProviderError` from `gateway.ts`. That class is not terminal, so the router and council wrappers would walk it to another vendor and mark providers unhealthy for every tenant (the 2026-09-26 defect, `gateway-outcome.ts`).
   - The exact change is in the structured result.
2. **Terraform has the provider keys backwards for this rule.** `terraform/stack/main.tf` provisions `OPENAI_API_KEY` as a boot secret and no `ANTHROPIC_API_KEY`. A production stack applied from it today would serve no AI to any tenant that has not elected OpenAI: every request gets residual 1's 403. That is fail-closed and correct under ADR-0014 §1, but not a usable launch. P0-11's Terraform half (Anthropic required; OpenAI optional, used only for tenants that elect it) must land with or before this.
3. **Embeddings have no lane for an unelected tenant.** `EMBEDDING_PROVIDER` defaults to `openai`, so production embeddings for a tenant that has not elected OpenAI now fail closed. That covers Vault semantic indexing and the RAG query vector. A launch decision is needed: deploy `EMBEDDING_PROVIDER=local` (self-hosted, `EMBEDDING_LOCAL_BASE_URL`), or require the OpenAI election for embeddings on the Order Form. There is no Anthropic or Bedrock embedding lane in `embedding-provider.ts`.
4. **LiteLLM still bypasses the gateway.** With `LITELLM_ENABLED=true` and `LITELLM_UNGOVERNED_ACK` set, `aiProviderRouter.ts` sends calls around the gateway, and this election with them. It is unchanged (baselined, WO-6). A second written acknowledgement is required in production.
5. **PQ in production.** `evaluateModel` runs the last-mile check, so in `NODE_ENV=production` an OpenAI/Azure/Vertex model can be performance-qualified only inside an organization that elected it. PQ runs from `server/eval/pq/` outside production today.
6. **Readiness text.** `server/startup/ana-readiness-state.ts` still says "OPENAI_API_KEY or KIMI_API_KEY alone answer chat". In production, Kimi now refuses to boot and OpenAI answers only elected tenants. The proposed wording is in the structured result.
