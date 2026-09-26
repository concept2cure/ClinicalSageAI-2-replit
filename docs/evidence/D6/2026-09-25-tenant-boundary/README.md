# D6 — the tenant boundary holds on every AI dispatch (2026-09-25/26)

**Row:** D6, under the W2 gateway scope. **Workstream:** WS1 of the AnA local-safe-AI plan
(`ANA_LOCAL_SAFE_AI_AGENTIC_PLAN_2026-09-25`, §6 WS1; OQ-PL-01 to OQ-PL-05 and OQ-PL-13 in §9).
**Promise this row makes true:** the launch definition of done's "multi-model is a governance feature", DPA §6.1, and
the trust statement's placement sentence. In each, a tenant's residency, zero-retention and allowed-lane policy decides
which AI services may receive its data. A request that cannot be served on an allowed lane is refused and recorded,
never rerouted.

This is provider-neutral. Claude (the first-party API, Bedrock, Vertex), OpenAI (the API, Azure), Kimi (Moonshot) and a
self-hosted model are all governed the same way. A tenant names the substrates and the vendors it allows, and the gateway
enforces both.

## What was wrong (at `bfbf0ee8`)

1. **AnA's own turns were not bound to the tenant.** The two chat dispatches in `server/routes/ana-ri/stream.ts:1340` and
   `:2158` passed no `organizationId`, although `orgId` was in scope. The tenant policy is resolved from
   `organizationId`, so on AnA's main path no tenant policy was ever applied.
2. **The policy lookup failed open and cached the failure.** In `providers/org-placement-db.ts:74-81`, any error, including
   an unscoped query under `RLS_ENFORCE=on`, answered "no policy" and cached that for five minutes.
3. **A request could lower the org's floor.** In `providers/org-placement.ts:71-84`, an explicit `zeroDataRetention: false`
   or a different residency on the request beat the org's requirement at model selection.
4. **`allowed_substrates` was stored and never read.** `gateway.ts:3009` (`meetsPlacementRequirements`) checked residency
   and ZDR only, so the fallback ladder could walk from a private lane onto a shared API.
5. **No last-mile tenant check.** The sensitive-dispatch gate returned before any tenant check in two cases: content
   classed `none` (`sensitive-placement-policy.ts:51`), and `piiDetection` off (`gateway.ts:1674`).
6. **An on-prem tenant was told the platform was misconfigured.** It got "No AI provider is configured"
   (`gateway.ts:1241`) instead of a placement refusal.
7. **Private-cloud placement was self-declared.** Vertex claimed residency `['us','eu']` by default
   (`providers/placement.ts:103`) while its client called `us-east5` (`clients.ts:71`). Vertex and Azure claimed zero
   retention unless told otherwise (`placement.ts:104, 111`). `cloud-models.ts:12-13` promised a Bedrock
   inference-profile prefix that no code added. `.env.example` named `AZURE_OPENAI_RESIDENCY`, which the code never reads.
8. **Nothing in the application wrote the policy.** Only hand-run SQL could set residency, ZDR or the allow-lists, with no
   record of who or why. The migration was applied by `install-fresh.mjs:110` alone, never by `C2C_MIGRATION_FILES`, so an
   upgraded database had no table.
9. **The Bull AI-action worker ran outside any tenant scope** (`ai-actions/action-queue.ts:128`).

## What is true now

- **Provenance.** `GatewayRequest.payloadProvenance` is `tenant_governed` by default. Only a module on
  `PUBLIC_SOURCE_CALLERS` in `scripts/ci/check-ai-tenant-binding.mjs` may declare `public`, and that list is empty today.
  A public payload may leave the tenant's lane only when the tenant's `public_source_frontier` is true.
- **Binding.** `applyOrgPlacementDefaults` binds the explicit `organizationId`, or else the ambient tenant scope. In
  production, a call with neither is refused (`DENY_TENANT_POLICY`, no tenant binding). The explicit system scope carries
  no tenant constraint and is not refused. The binding feeds placement and audit attribution only; it does not rewrite
  `request.organizationId`, so it adds no rate-limit exposure to the roughly 40 other call sites.
- **Fail closed.** `DbOrgPlacementResolver` throws on a failed lookup and never caches a failure. Wherever placement is
  enforced (production, `AI_SENSITIVE_DATA_POLICY_MODE=enforce`, or `AI_PII_ENFORCEMENT=block`), a throw is an unknown
  policy and refuses the tenant payload. The lookup runs in the scope of the org it resolves, so RLS cannot hide the row.
  An allow-list naming nothing valid allows nothing.
- **Floor.** `mergeOrgPolicyDefaults` treats the org policy as a floor: ZDR is sticky, and a contradicting residency is
  refused.
- **Selection and every fallback rung.** `tenantPlacementVerdict`, called by `meetsPlacementRequirements`, applies
  `allowedProviders`, `allowedSubstrates`, residency and ZDR. When every capable model is excluded only by placement,
  selection throws `TenantPlacementError` (`DENY_TENANT_POLICY`) rather than returning "no provider".
- **Last mile.** `assertTenantPlacement` runs in `executeProvider` before any SDK call, whatever the classifier said and
  whether `piiDetection` is on or off. Performance-qualification evaluation and embeddings apply the same verdict.
- **Refusals are terminal and recorded.** `TenantPlacementError` is a `GatewayPolicyError`: never retried, never walked
  down the ladder. Each refusal writes the content-free refusal row (`logContentPolicyBlock`, detector
  `tenant_placement_policy`). Every served ledger row now carries `tenantPlacement` (resolution, what it was bound from,
  provenance, data class, and whether regulatory content was detected).
- **AnA binds its tenant, and CI keeps it bound.** `stream.ts` passes `organizationId` on both dispatches. The two
  `AnaToolExecutor.ts` sites forward a request that all four of their callers bind. `ci:ai-tenant-binding` fails any
  unbound `.route(` under `server/routes/ana-ri` and `server/services/ana`. It runs in CI with its 13-case self-test.
- **The worker runs in the requester's tenant scope** (`inRequesterScope`).
- **Private-cloud placement is derived, not declared.**
  - Bedrock and Vertex residency comes from the region their client calls (`bedrockClientRegion`, `vertexClientRegion`,
    which `clients.ts` now uses). A region with no residency code claims none.
  - Azure claims residency only when one is declared.
  - Vertex and Azure claim zero retention only on an explicit `true`. Vertex's depends on project-side caching and
    logging settings; Azure's on approved modified abuse monitoring.
  - Bedrock stays zero-retention by default. Amazon Bedrock does not store or log prompts, which DPA §6.2 relies on
    ("Yes by default"). `AI_BEDROCK_ZERO_RETENTION=false` turns it off when invocation logging is on.
  - `assertPlacementRegistryConsistency` refuses a production boot when a declared `AI_BEDROCK_RESIDENCY` or
    `AI_VERTEX_RESIDENCY` claims a residency the client region does not serve.
  - The false prefix comment is corrected, and `.env.example` and the DPA §6.2 rows for Bedrock, Vertex and Azure now say
    what the code does.
- **One governed writer.** `PUT /api/ai-placement-policy` (`server/routes/ai-placement-policy.ts` over
  `providers/org-placement-writer.ts`) is open to organization admins and owners only.
  - The whole policy is stated on every change, with a reason for change.
  - A body that names an organization, or a policy no service could satisfy, is refused.
  - An empty allow-list is refused; `null` is how to say "no constraint".
  - The row and its chained `audit_logs` entry (before, after, reason) commit in one transaction.
  - The resolver cache is invalidated on commit. Other API processes converge within the resolver TTL, now 60 s.
- **The migration reaches every database.** `migrations/20260608_ai_placement_policies.sql` is in `C2C_MIGRATION_FILES`,
  before the final RLS pair, amended in place with a dated note (Rule 1). `org-placement-migration.test.ts` pins that,
  and that every column the resolver reads is added on an existing table.

## Red and green

The red runs used the code before this change: `bfbf0ee8`, or `038b41d5` for the action queue after the rebase. The
green runs used this change on `origin/concept2cure-v2` `038b41d5`.

| What | Red | Green |
|---|---|---|
| Boundary, floor and resolver: `tenant-placement-boundary.test.ts` (20), `org-placement.test.ts`, `org-placement-db.test.ts` | `red/boundary-floor-resolver.txt`: 22 of 34 fail | `green/boundary-floor-resolver.txt`: 34 pass |
| Private-cloud placement: `placement.test.ts` | `red/private-cloud-placement.txt`: 11 of 19 fail (Vertex `['us','eu']` on us-east5; no boot check) | `green/private-cloud-placement.txt`: 19 pass |
| AnA dispatch binding: `ci:ai-tenant-binding` | `red/tenant-binding-gate.txt`: the four unbound sites | `green/tenant-binding-gate.txt`: self-test 13/13, gate clean |
| Migration reaches deployed databases: `org-placement-migration.test.ts` | `red/migration-guard.txt`: each assertion fails with its half removed | `green/migration-guard.txt`: 2 pass |
| Existing gate gap | `red/column-reachability-gap.txt`: `ci:column-reachability` stays OK with the set entry removed, because it counts install-fresh as an applier; the migration guard exists for that reason | — |
| Governed writer: `org-placement-writer.test.ts`, `routes/__tests__/ai-placement-policy.test.ts` | `red/policy-writer.txt`: no application writer at `bfbf0ee8`; the tests fail on two mutations (no invalidate; audit after COMMIT) | `green/policy-writer.txt`: 17 pass |
| Worker tenant scope: `action-queue-tenant-scope.test.ts` | `red/action-queue-scope.txt`: structural; the pre-change worker had no scope to test | `green/action-queue-scope.txt`: 3 pass |
| Repo gates, typecheck (0, baseline 0), and 283 test files / 3,780 tests across gateway, AnA, action queue and config | — | `green/repo-gates.txt` |

Six existing tests made production-mode calls with no tenant binding, which production never does. Each now carries a
realistic binding (`organizationId: 7` or a tenant scope), and a comment says why. Their assertions are unchanged; the
unbound case is pinned in `tenant-placement-boundary.test.ts`. Two tests in `org-placement.test.ts` pinned
"request wins", the defect, and one in `placement.test.ts` pinned default Vertex satisfying `eu`. All three are rewritten,
each with a note.

## Operator notes (what changes on deploy)

- **Unbound production calls are refused.** A call in production with no tenant binding and a non-public payload is now
  refused. Platform work must run in `runWithSystemTenantScope`. The refusal row names the call.
- **Lookup failures refuse where enforced.** A policy lookup failure refuses tenant payloads wherever enforcement is on.
  A database outage therefore stops AI for tenants rather than lifting their floor.
- **AnA stream turns count against the per-org rate limit** (100 per minute per process), as send-message already did.
- **Private-cloud configuration is checked at boot.**
  - A production boot with Vertex enabled and `AI_VERTEX_RESIDENCY=us,eu` on `us-east5` now refuses to start.
  - Vertex and Azure lose zero-retention status until `AI_VERTEX_ZERO_RETENTION=true` / `AI_AZURE_ZERO_RETENTION=true` is
    set, deliberately.
  - Neither lane is deployed for launch (DPA §6.1).
- **Policy rows are set through the API.** Set them with `PUT /api/ai-placement-policy` as a step in tenant onboarding.
  An org with no row is unconstrained, as before.

## Not done, and why

- **The DPA's vendor default is not enforced by default.** The DPA says OpenAI and Moonshot are off for a tenant unless
  its Order Form lists them. The mechanism exists (`allowed_providers`), but no default was flipped. Rows must be set per
  tenant, or the founder decides a platform default.
- **The `regulatory` classification is audit-only** (`regulatoryContentDetected`). No false-positive rate has been
  measured yet, so it gates nothing (plan open decision 12).
- **Other gateway call sites.** About 40 `route()` sites outside `server/routes/ana-ri` and `server/services/ana` rely
  on the ambient binding. In production, an unbound one is refused and recorded rather than served; widening
  `ci:ai-tenant-binding` to them is the next step.
- **The council** runs in-request, so the ambient scope binds it. Explicit binding needs an org column on
  `council_sessions` (WS3).
- **`PUT /api/platform/ai-providers/preference`** and `resolveProviderForOrg` are left in place.
  - They write and read `preferred_ai_provider`, from `migrations/20260617_ai_provider_preference.sql`, which neither
    applier runs.
  - Nothing applies the preference, and no client calls the route.
  - They cannot weaken placement: the writer leaves the column alone, and the preference route writes only that column.
  - Deleting them is the plan's intent. It is left out of this change so the change stays to the boundary.
- **No UI for the policy yet.** The writer is an API, and the Settings surface is outside this row's evidence.
- **No staging soak.** There is no production-like environment (D1). This evidence is unit and integration level, with
  the gateway and resolver exercised end to end against stubbed SDKs.
- **WS2 to WS9** (server tools, ledger columns, honest tools, connector isolation, child runs, audit engines, paper,
  MCP) are separate sessions.
