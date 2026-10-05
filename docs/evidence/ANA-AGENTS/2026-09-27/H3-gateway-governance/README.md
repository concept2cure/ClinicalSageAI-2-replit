# H3 (track GW): the gateway serves only governed models, production drafting needs a passed PQ, and a call is charged to its own tenant

**Decision:** ADR-0015 §3 (PQ is a production gate), §4 (every model served is
an approved entry, at every risk level) and the gateway items of §5 (tenants
are isolated in capacity). The ADR was accepted 2026-09-28 and binds this work.
**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row and is recorded as the founder's exception to RULE 2). Launch
rows touched: D4 (PQ) and D6 (tenant boundary, ledger). **Session:**
`…019ZvHmh`. **Recorded:** 2026-09-28, against HEAD `eb62b566c` plus the track
GW working tree. Nothing is committed; `tree.sha256` gives every track file's
hash, and `sha256sum -c` on it, run from the repository root, checks it.

## Status

The track GW gates are red against HEAD and against the build before its
review, and green with the track. Every behaviour's gate was also seen to fail
under mutation, including 12 overcorrections (43 of 43 killed). The review's
27 objections were worked through: 22 fixed, 1 measured and kept with its
numbers (the rate-bucket capacity change, [3]), and 4 recorded or handed on
with a reason ([8], [17], [18], [20]). Stated plainly:

- **§4 and the §5 gateway items are enforced** at every gateway selection
  point and at admission, in every environment where the ADR says so.
- **§3 is enforced at the two points where the platform knows it is drafting:**
  requests labelled `document_drafting`, and every tool that stores
  model-authored text in a governed record (AnA's governed drafting). It is
  **not** enforced on callers that draft regulatory text under another label
  and return it (listed under Known gaps), nor on text a model writes into an
  answer without storing it. So §3 is reported **partial**, not done.
- **In production today, high-risk drafting is refused.** No approved model has
  passed PQ (0 of 5 approved for high risk; `ga-readiness-report.mjs` row
  `high-risk-model-pq` is still blocked). This is ADR-0015's accepted
  consequence.
- **Not shown here:** a live capture (this container has no database and no
  model key); the PQ itself; the governed-write refusal's wording in
  production, which still says to retry with Thorough effort (handed on: the
  file belongs to a lane that had it open).

S4 (the Manual/Auto fixer) and a sibling PQ track were building in this same
working tree throughout. See "Lane disclosure".

## What was wrong (at HEAD)

**§4, model governance at the point of selection.**

- The gateway checked approval only on high-risk work, and there by registry id
  alone (`isApprovedForHighRisk(model.id)`). On every other request the explicit
  path, strategy selection (`eligible` and `relaxed`) and the fallback ladder
  served any enabled row. Only a CI drift test kept the registry aligned with
  the lockfile. A row drifted off its pinned version under an approved id also
  passed the high-risk check.
- An explicit model that named no registry row fell through to strategy
  selection. The caller asked for one model and silently got another.
- `local-default` pins the placeholder `'local-default'`, not weights. It was
  selectable in production, including by `cost_optimized` (it costs nothing).
- Nothing forbade two lockfile entries sharing `(provider, pinnedVersion)`, or
  an id equal to another entry's pinned version. Either would let the ledger
  attribute a call to an entry other than the one selection judged.

**§3, PQ.** CLAUDE.md RULE 2 says only PQ-passed models serve high-risk
regulatory drafting. It was enforced nowhere. Every entry records
`pq.status: 'pending'`, and production served high-risk drafting on them.

**§5, tenant capacity.**

- The per-organisation rate bucket keyed on `request.organizationId` alone.
  About 40 of 65 gateway call sites bind their tenant through the ambient
  tenant scope and never set it, so every such call of every tenant shared one
  `'__global__'` bucket of 100 a minute per process, production included. One
  tenant's burst refused another tenant's calls.
- A call with no tenant at all was charged to that shared bucket first, then
  refused at selection (a tenant payload) or served (a public one).
- A rate-limit refusal left no ledger row.
- `policy.ts recordCost` charged a `'__global__'` daily cost map. It had no
  caller, and the map was never read.
- Usage metering (`api_usage_logs`, which the per-organisation limits read)
  keyed on the explicit id alone, so ambient-bound calls were never metered.

## The change

**One rule, one predicate, every selection point.**
`server/services/ai-gateway/model-governance.ts` (new) `selectionRefusal` is
reached through `gateway.ts approvedForTask` at the explicit path, strategy
(`eligible` and `relaxed`) and the fallback ladder. A row may serve only when:

1. it IS an approved-models entry (`governingEntry`: provider, registry id and
   pinned version), at every risk level;
2. in production, its entry pins a concrete artifact (`isNominalPin`: a
   `local` entry whose pinned version is not a `sha256:<64 hex>` weights
   digest is a placeholder);
3. on high-risk work, its entry is `approvedForHighRisk` (keyed on the entry,
   not the registry id, which also closes H1 governance item (a));
4. on high-risk DRAFTING, `isQualifiedForHighRiskDrafting(entry, production)`:
   `approvedForHighRisk`, and in production `pq.status === 'passed'`.

Production is `isProductionEnv` (`pii-screen.ts`, NODE_ENV trimmed and
lower-cased). No other input reaches the predicate. The approved-models list
the gateway judges against is a `private readonly` field whose only writer is
the test seam, and `APPROVED_MODELS` itself is frozen (below).

**`server/services/ai-governance/approved-models.ts`**

- `DRAFTING_TASK_TYPES = {'document_drafting'}` and `isHighRiskDraftingRequest`
  (the gateway's drafting label; see Known gaps).
- `isNominalPin(entry)`; `selectableEntry(row, entries, env)`, the resolvers'
  form of rules 1–2.
- `isQualifiedForHighRiskDrafting(entry, production)`: the one statement of
  RULE 2's PQ clause. The gateway uses it for rule 4.
- `isServedModelApprovedForHighRisk(served, env)`, the governed-write gate's
  predicate (its one caller is `AnaToolExecutor.ts preHandlerRefusal`), now
  applies the same rule: in production no tool in
  `GOVERNED_CONTENT_WRITE_TOOLS` stores model-authored text unless the model
  that wrote it is PQ-passed. This is where AnA's governed drafting is caught:
  the kernel labels those turns `regulatory_review` or `chat`, never
  `document_drafting` (review [1]/[9]/[19]).
- `governedMatch(value, rows, env)` selects through `selectableEntry`, so a
  tier, a pin and the picker (`effort.ts projectModelsForPicker`) pass over
  `local-default` in production instead of pinning a model the gateway refuses
  on every call (review [4]).
- `APPROVED_MODELS`, every entry and every PQ record are frozen at load
  (review [15]).

**`server/services/ai-gateway/gateway.ts`**

- Selection split into `selectExplicit`, `refuseUnservable` and
  `pickByStrategy`, all through `approvedForTask`; `selectOrRefuse` raises a
  selection refusal after writing its ledger row.
- Explicit path: a model naming no registry row, or a provider with no row, is
  refused with `ModelNotGovernedError('unknown-model')`, naming it. When every
  named, enabled, placement-permitted row fails governance, it is refused at
  every risk level (it used to refuse on high-risk work only). A name whose
  rows are all disabled or placement-excluded still falls through to strategy
  (known gap, review [8]).
- Errors, each a `GatewayPolicyError` and so terminal by name (no retry, no
  fallback walk):
  - `ModelNotQualifiedError`, code `MODEL_NOT_PQ_QUALIFIED`, message exactly
    *"No performance-qualified model is available for high-risk regulatory
    drafting in this environment."*; `reason` `no-pq-qualified-model` or
    `no-capable-model`;
  - `ModelNotGovernedError`, code `MODEL_NOT_GOVERNED`, reason `unknown-model`
    / `no-entry` / `nominal-pin`;
  - `RateLimitError`, code `RATE_LIMIT_EXCEEDED`, carrying the limit;
  - `ModelNotApprovedError` unchanged in meaning.
- Every governance refusal writes one ledger row (provider/model `none`):
  `metadata.modelGovernance` = code, reason, `withheldModelIds`, and
  `withheld[]` = `{id, pinnedVersion, pqStatus, reason}` per row, plus
  `capableConfigured`. Pinned version and PQ status are governed data that
  change, so the row keeps them (review [22]).
- Deterministic mode (`AI_GATEWAY_DETERMINISTIC`, `DETERMINISTIC_MODE`,
  `setDeterministicMode`) in production runs selection first, so every
  refusal above is raised and ledgered before fixture text is returned
  (review [2]/[11]). Outside production it is unchanged, and production
  deterministic chat with no provider (the CI boot smoke, `ci.yml`) still
  answers from fixtures.
- Admission: in production a call with no tenant binding at all is refused
  (`TenantPlacementError('DENY_NO_TENANT_BINDING', …, 'admission')`) before
  classification, the policy pass or any bucket. Its words say it is a platform
  fault, not the organization's policy, and its ledger row is
  `error: 'DENY_NO_TENANT_BINDING'`, `metadata.tenantBinding`, with no PII
  finding (review [24]). Platform work in an explicit system scope is not
  refused.
- `bindTenant` accepts an explicit `organizationId` only when it is a positive
  integer or its decimal string, the rule `establishRequestTenantScope.ts
  resolveTenantId` applies; `''`, `0`, `'undefined'`, NaN, a uuid fall through
  to the ambient scope or to unbound (review [13]).
- `auditOrganizationId` returns the bound tenant, and `recordTenantUsage`
  meters by it, so ambient-bound calls reach `api_usage_logs` (review [12]).
- Production is read one way, through `isProductionEnv`, in `bindTenant`,
  `isPlacementEnforced` and the keyless fail-closed branch (review [6]).
- A rate-limit refusal is ledgered (`error: 'RATE_LIMIT_EXCEEDED'`,
  `metadata.rateLimit {scope, count, limit, windowMs}`) through the shared
  `logRefusalRow`, and thrown as `RateLimitError`.

**`server/services/ai-gateway/policy.ts`.** The rate bucket keys on the bound
tenant (`sensitiveTenantPolicy.organizationId`, explicit or ambient); the dead
`recordCost` / `dailyCost` `'__global__'` charge is removed.
`'__global__'` now holds only platform work and, outside production, unbound
calls.

**`server/services/ai-gateway/gateway-error-map.ts`.** New code
`MODEL_NOT_QUALIFIED` at 403 for every governance refusal (PQ, not governed,
not approved), with no "try again shortly"; unknown-model reads *"This
request was not sent: it named a model this platform does not have."*; a
rate-limit refusal is `RATE_LIMITED` at 429 (reviews [5]/[23]/[25]/[26]).

**Readers of the PQ refusal.** `multi-agent-council.ts` answers
`MODEL_NOT_PQ_QUALIFIED` with the plain sentence and "The council did not
run."; `cmc/module3-narrative-builder.ts` records `fallbackReason:
'model_not_pq_qualified'` and counts it separately
(`modelNotPqQualifiedFallbackCount`) (review [21]).

**`server/services/ana/AnaDocumentDraftingService.ts quickComplete`.** With a
framework (a drafting system persona) it is `document_drafting` with no pin;
without one it is still `general` on Sonnet (review [10]).
`server/routes/ana-intelligence.ts`: the route comment says so.

**`scripts/ci/check-pq-evaluation-callers.mjs`.** Refuses any reference to the
identifier `evaluateModel` outside `server/eval/pq/` and tests: bracket access,
destructuring and `.bind` included (review [14]).

**`scripts/ops/ga-readiness-report.mjs`.** The `high-risk-model-pq` row's gate
text now describes both runtime points and what they do not cover (reviews
[19]/[27]). Status and observed text are unchanged; no row was added.

**`.env.example`.** The `ANA_TIER_ECONOMY_MODEL=local-default` example says it
is passed over in production until the entry pins a weights digest (review
[4]).

## Behaviour a caller can see

On today's registry nothing changes outside production, except the four
review items marked †. The parity fixture, captured from the unchanged
gateway, proves it for every selection path (450 cells: 5 strategies × 9 task
types × 4 risk tiers, relaxed selection, the full fallback ladder, and all 16
rows named by id and by provider+wire); in production 406 cells match exactly
once drafting and the self-hosted lane are excluded.

| Case | HEAD | Now |
|---|---|---|
| Any request, a row that is not its own approved entry | served on normal-risk work | never served; named explicitly, refused `MODEL_NOT_GOVERNED` |
| Explicit model or provider that names no registry row | silently served by another model | refused `MODEL_NOT_GOVERNED` (`unknown-model`), naming it |
| Explicit model whose rows are all disabled here | served by strategy | unchanged (known gap [8]) |
| `local-default` in production (explicit, strategy, fallback) | served | refused / passed over; a tier or pin passes over it, the picker omits it |
| `document_drafting` in production | served on a PQ-pending model | refused: *"No performance-qualified model is available for high-risk regulatory drafting in this environment."* (`MODEL_NOT_PQ_QUALIFIED`, 403) |
| The same with `AI_GATEWAY_DETERMINISTIC` in production | fixture text | the same refusal |
| High-risk `regulatory_review` in production | served | served (ADR §3: review runs PQ-pending) |
| A governed-write tool in production, model PQ-pending | stored | refused, nothing stored |
| `POST /api/claude/quick` with a framework † | `general` on Sonnet 4 | `document_drafting`, no pin (an approved model; refused in production) |
| A call with no tenant, production | charged to `'__global__'`, then refused or (public) served | refused at admission, `DENY_NO_TENANT_BINDING`, nothing charged |
| A malformed `organizationId` (`''`, `0`, NaN …) † | an "explicit" tenant of its own | not a binding: ambient scope, else unbound |
| An ambient-bound call's rate bucket † | `'__global__'`, shared by every tenant | its own tenant's bucket, shared with its explicit calls |
| An ambient-bound call's usage metering † | not metered | metered to its tenant |
| A rate-limit refusal | no ledger row; 503 "blocked by AI gateway policy" | ledgered; 429 `RATE_LIMITED` |
| A governance refusal's HTTP answer | 503 "try again shortly" | 403 `MODEL_NOT_QUALIFIED`, no retry advice |

## Proof

| Stage | File | Result |
|---|---|---|
| Part 0: the review tests as first written, against the pre-review build, before any fix | `red.txt` | 42 failed / 21 passed (63). Each failure is the objection it pins; the passes are controls, the scan's fixtures, the invariant and the re-scoped PQ-runner claim [7] |
| Part A: the final tests (13 files) against HEAD's source for all 13 track source files (`git show HEAD:<path>`; `model-governance.ts`, absent at HEAD, moved aside) | `red.txt` | 73 failed / 58 passed (131). The passes are controls, the parity table, the lockfile invariant, the source scan, and the neighbour files' untouched cases |
| Part B: the final tests against the pre-review build's source | `red.txt` | 50 failed / 81 passed (131): the review's own cases, plus the build cases whose codes and shapes the review changed |
| Part C: review [14], the gate's three new self-test cases against the old matcher | `red.txt` | 3 NOT CAUGHT (also mutation R28) |
| Part D: the build's own red record, before the review | `red.txt` | 27 failed / 18 passed (45) |
| Green, run 1: every test under `server/services/ai-gateway` and `server/services/ai-governance` | `green.txt` | 58 files, 676/676 |
| Green, run 2: the track's other tests and their neighbours | `green.txt` | 27 files, 252/252 |
| Mutations of the final tree | `mutations.txt` | 43/43 red, 12 of them overcorrections. Every file restored and its sha256 checked, with a refusal to restore over another writer's change |
| `npx tsc --noEmit` (full project, final tree) | `green.txt` | exit 0, 0 errors |
| `npx eslint` on all 27 track files | `green.txt` | 0 errors. No file gained a warning against its HEAD content; `gateway.ts` went from 26 to 25 |
| `ci:unapproved-model-pins` (+ self-test), `ci:gateway-bypass`, `ci:ai-tenant-binding` (+ self-test), `ci:pq-evaluation-callers` (+ self-test) | `green.txt` | exit 0 each: 54 known pins, none new; self-test 14/14; 8 baselined bypasses; self-test 35/35; 8/8 |

`ci:ai-tenant-binding` cannot prove that every gateway call binds a tenant: its
Rule 1 covers only `server/routes/ana-ri`, `server/services/ana` and
`server/services/ana-ri`. What is shown instead is that the production
refusal of an unbound call removes nothing that was served: in production an
unbound call already resolved to `unknown`, and placement is always enforced
there, so a tenant payload was already refused at selection; and the gate's
Rule 2 proves no module sets `payloadProvenance: 'public'`. What changes is
where and how it is refused (admission, before any bucket; its own code and
words; its own ledger row).

**§4b, every caller that could send an unknown explicit value. None sends one
today.** (1) `keywordExtractionService.ts:168` sends `process.env.OPENAI_MODEL
|| 'gpt-4o'`; no env file sets `OPENAI_MODEL`, so it sends `gpt-4o`, a row.
(2) `aiProviderRouter` `request.model` is set only through `ragRouter
params.model`, which only `server/eval/rag/run-eval.ts` sets (an operator's
`--model` flag); otherwise it sends a provider only, and only
openai/anthropic/moonshot. (3) `ragRouter params.model`: the same chain. (4)
`rag-reranker cfg.model` never reaches the gateway (a baselined direct
Cohere/Voyage call; the LLM-judge reranker sends no model). (5)
`server/routes/ind.ts` POST `/api/ind/applications/:id/generate`, `/stream` and
the follow-up pass a client-supplied `model` to `indCopilot` as
`document_drafting`; no client code calls them. An unknown value there was
silently substituted and is now refused. (6) The H1/S2-gated callers (stream
pin and tier, send-message, deep-investigation) send only registry rows. (7) Of
the 54 known literal pins, 50 are rows and 4 are never sent.

**§4d.** Holds per provider on today's lockfile. The unscoped reading was
stopped (see Handed on).

## Review follow-through

Each objection was checked against the code first. A real one got a test that
failed on the pre-review build for the reason stated, then the fix. Mutation
ids are in `mutations.txt`.

| # | Objection | Disposition |
|---|---|---|
| 1, 9, 19 (blocker) | AnA's governed drafting never reaches the gateway as `document_drafting` (`kernel-router.ts:87-91` raises only the risk tier). The only check on what such a turn writes, `isServedModelApprovedForHighRisk`, read `approvedForHighRisk` alone, so in production a PQ-pending model wrote vault documents, editor drafts and protocol sections, and the GA readiness text claimed the opposite | **Fixed at the point of record.** `approved-models.ts isQualifiedForHighRiskDrafting` is the one rule (approved, and PQ-passed in production). `selectionRefusal` and `isServedModelApprovedForHighRisk` both use it, and the latter is the governed-write gate's predicate, so the gate now refuses in production without an edit to `AnaToolExecutor.ts` (another lane's uncommitted file). Tests: `governed-write-pq-production.test.ts`, which drives the real registered handlers: in production a confirmed write from `anthropic/claude-opus-5-5` is refused and nothing is stored, every one of the 14 governed-write tools is refused, and outside production the same write runs. R1, R2 (overcorrection), R26. **Declined:** relabelling a `requestsGovernedDraft` turn as `document_drafting` in the kernel. `governed-write-tools.ts` records that regex as "a routing hint, not the control"; in production it would refuse whole turns on phrasing ("write a response to…") that never write a record. **Handed on:** the refusal copy (below). `ga-readiness-report.mjs` gate text rewritten |
| 2, 11 | `AI_GATEWAY_DETERMINISTIC` / `DETERMINISTIC_MODE` returned fixture drafting in production before selection ran | **Fixed.** In production, deterministic mode runs `selectOrRefuse` first; every refusal is raised and ledgered. Refusing to boot was rejected: the CI production boot smoke (`ci.yml`) runs on deterministic mode with no provider by design, and still does. Tests: both variables, the runtime setter, the no-provider case, the admission refusal, and two controls. R3, R4 (overcorrection) |
| 3 | The re-key lowers a busy tenant's effective capacity, unmeasured | **Measured; kept; recorded as a capacity change.** At the default 100 a minute per process, an Auto turn at its 20-round ceiling leaves 80 calls that minute for its tools; the 101st is refused (`governance-review.test.ts [3]`, red at HEAD, where it was served from `'__global__'`). Before, a single tenant's ambient calls drew on a second 100/minute bucket that every other tenant also drew on, so the headroom was never the tenant's own. The ADR's §5 model is one bucket per organisation with children in a sub-bucket, and the per-org limit was always 100. Production runs at most two instances (ADR §5), so 200 a minute per tenant across them. Calibration is handed to S7, whose cost calibration reads the ledger, where rate refusals now appear. M10, R27 (overcorrection) |
| 4 | `ANA_TIER_ECONOMY_MODEL=local-default` (the `.env.example` example) failed every Economy turn in production with a terminal error | **Fixed.** `governedMatch` and the picker select through `selectableEntry`, which passes over a placeholder pin in production. The tier falls back to strategy (H1's existing path, logged under `ai-gateway:tier`), a pin is refused at the pin (`MODEL_OVERRIDE_REFUSED`), and the picker does not offer it. `.env.example` corrected. A boot refusal was rejected: it would take production down for a documented, recoverable remap. Tests: `nominal-pin-resolvers.test.ts`. R21, R22 (overcorrection) |
| 5, 23 | Governance refusals answered 503 "try again shortly" | **Fixed.** `MODEL_NOT_QUALIFIED` at 403 for PQ, not-governed and not-approved refusals, with no retry advice. One neighbour expectation moved from 503 to 403 (`cmc-drafting-governance.test.ts`). R10 |
| 6 | Production read two ways inside the gateway | **Fixed.** `bindTenant`, `isPlacementEnforced` and the keyless branch use `isProductionEnv`. Test: NODE_ENV `'Production'` refuses a keyless deploy instead of serving demo content. The placement case already held under `'Production'`, through the PII-enforcement branch (`getPiiEnforcement()` resolves production case-insensitively); it stays as a guard. The keyless source guard (`tests/audit-ai-gateway-keyless-prod.test.ts`) pinned the literal `=== 'production'`; it now pins `isProductionEnv()` in that branch. R17 |
| 7 | "PQ is still executable" rested on a request shape run-pq never sends | **Fixed in the claim and the test.** The build's test (a tenant-bound `evaluateModel` in production) is removed. `governance-review.test.ts [7]` uses run-pq's own request (no `organizationId`, `callerModule: 'pq-runner'`): under `NODE_ENV=staging` it runs on the PQ-pending flagship; under `NODE_ENV=production` the last-mile placement check refuses it before the wire (pre-existing). So **the PQ runs under NODE_ENV=staging or development**, and the beta stack (`docker-compose.beta.yml`, `.env.beta.example`) and the CI staging server (`cerv2-staging-deploy.yml`) are production for this control. `scripts/deploy-staging.sh` (NODE_ENV=staging) is the one hosted validation environment |
| 8 | A known model whose provider is not configured is still rerouted | **Recorded as a known gap, not changed.** 50 literal pins name `gpt-4o`-family rows; refusing them would break every call they make in a deployment without OpenAI. The ADR's text covers a name matching no registry row, which is refused. A control test pins today's fall-through, and R20 shows that refusing it breaks the controls |
| 10 | `POST /api/claude/quick` drafts under `general` on Sonnet 4 | **Fixed.** With a framework persona, `quickComplete` is `document_drafting` with no pin; production refuses it until PQ. Without one it is unchanged. Test: `quick-complete-governance.test.ts`. R23, R24 (overcorrection). The route was kept: deleting an API route needs its reachable replacement named (working agreement), and relabelling closes the bypass without a deletion |
| 12 | Metering keyed on the explicit id only | **Fixed** (`recordTenantUsage` uses `auditOrganizationId`, the bound tenant). R18 |
| 13 | A malformed `organizationId` counted as a binding | **Fixed** (`isOrganizationId`). `''`, `0`, `'undefined'`, NaN, `-3`, `'1.5'` and a uuid are refused at admission in production; with an ambient scope they bind to it; `'42'` still binds. R15, R16 (overcorrection) |
| 14 | `evaluateModel` is a production door, fenced by a regex bracket access evades | **Fixed in the gate; the exemption is stated.** The gate refuses any reference to the identifier; the self-test has three new cases. `evaluateModel` is the one path exempt from §3/§4 and the §5 admission and bucket: it must send to exactly the model under qualification, which is PQ-pending by definition. It is still refused in production for an unbound request (above). R28 |
| 15 | `APPROVED_MODELS` and the gateway's seam were writable at runtime | **Fixed.** Deep-frozen at load; the seam is `private readonly`; a source scan in `approved-models-invariant.test.ts` refuses any write to the list, an entry's approval or PQ, or `approvedModels` outside tests, shown failing on seven fixtures. R25 |
| 16 | A provider naming no registry row was silently substituted | **Fixed.** `namesRegistryRow` checks the provider when no model is named. No caller sends one today (provider literals across `server/` checked; `aiProviderRouter` sends only openai/anthropic/moonshot). R19 |
| 17 | `routeCached` key omits riskTier, model and provider | **Handed on** to the RAG pipeline lane (`advancedRAGPipeline.ts`). It does not reach the PQ gate: refusals are thrown, not cached, and drafting does not use that path |
| 18 | "No env var, config or request field reaches it" overclaims for the product | **Scoped.** No switch inside the gateway reaches the predicate. The baselined LiteLLM bypass (`LITELLM_ENABLED` plus its production acknowledgement, `gateway-bypass-baseline.json`) routes around the gateway, and so around every rule here. Handed on (below) |
| 20 | The drafting set trusts callers' labels | **Audited, listed, handed on.** Known gaps below. The drafting set is not described as exhaustive |
| 21 | The PQ refusal reused the approval code, so its readers stated a false reason | **Fixed.** Own code `MODEL_NOT_PQ_QUALIFIED`; the council and the Module 3 builder branch on it. Test: `pq-refusal-consumers.test.ts` feeds each the error the real gateway throws in production. R5, R6, R7 |
| 22 | The ledger recorded `pq-not-passed` whatever withheld each model, and could not tell "no capable model" from the control | **Fixed.** Per-row `{id, pinnedVersion, pqStatus, reason}`, `capableConfigured`, and reason `no-capable-model` vs `no-pq-qualified-model`. The person reads the same sentence. R8, R9 |
| 24 | The no-tenant refusal blamed the organization's policy and was filed as a PII block | **Fixed.** `DENY_NO_TENANT_BINDING`, admission wording, ledger `metadata.tenantBinding`, no content-policy finding. One D6 expectation moved to the new code (`tenant-placement-boundary.test.ts`). R13, R14 |
| 25 | Unknown-model copy said a real model "would have served it" | **Fixed.** R11 |
| 26 | A ledgered rate refusal was answered "blocked by AI gateway policy", 503 | **Fixed.** `RateLimitError`, `RATE_LIMITED` 429, "Too many requests for your organization in the last minute. Wait a minute and try again." R12 |
| 27 | The gate text claimed review was covered without qualification | **Fixed** in the rewrite: "regulatory_review unless declared low/medium risk" |

## Known gaps, stated so nobody reads more into §3 than is there

**§3 is enforced at two points, not everywhere a model writes regulatory
prose.** The gateway enforces it on requests labelled `document_drafting`; the
governed-write gate enforces it on every tool that stores model-authored text.
It does not see:

- **Model text returned in an answer and not stored.** A chat or AnA answer that
  contains a drafted section is served by a PQ-pending model in production,
  under ADR §3's read/review allowance. It becomes governed content only
  through a governed-write tool, which refuses it.
- **Callers that draft under another label.** A heuristic audit (`grep` for
  every `taskType` of `regulatory_review`, `structured_output`, `general`,
  `summarization`, `document_analysis` or `chat`, and a drafting verb with a
  document noun in the 60 lines before it; the raw list is at the end of `green.txt`) found 17
  candidates. It is a candidate list, not a completed audit: it misses a task
  type passed through a variable and a prompt built elsewhere. Those that draft
  regulatory content and return it to the client (whether the client stores it
  was not traced):

  | Caller | Label | What it drafts |
  |---|---|---|
  | `server/routes/csr-builder-routes.ts:403` | `regulatory_review` | "a structured benefit-risk analysis suitable for ICH E3 Section 13" |
  | `server/services/safety-narrative-service.ts:451, 592, 713, 832, 918` | `regulatory_review` | aggregate safety, SAE, benefit-risk, signal assessment and cross-study narratives |
  | `server/routes/haq-manager.ts:612` | `regulatory_review` | a Health Authority Question response |
  | `server/api/cmc/routes.ts:1952` | `regulatory_review` | an ICH Q-series Module 3.2.S/P section |
  | `server/api/cmc/change-impact-simulator.js:209` | `regulatory_review` | a change-impact report |
  | `server/routes/deep-research.ts:431` | `regulatory_review` | "content for each section" of a document |
  | `server/src/services/ai/stability.ts:176, 237` | `document_analysis`, `regulatory_review` | a stability section and a stability protocol |

  The other five candidates are not governed content (`openai-service.ts` ×3,
  generic structured replies; `cortex-unified.ts:925`, a working-memory
  summary; `cortexQueryRoutes.ts:417`, an advisory answer). Each relabel to
  `document_drafting` belongs to its owning lane, and each will then be refused
  in production until PQ. The drafting set is therefore **not** described as
  exhaustive.
- **`AIGateway.evaluateModel`**, the PQ runner's door, by design (review [14]).
- **The baselined LiteLLM bypass**, which routes around the gateway entirely
  (review [18]).
- **A known model whose provider is not configured** still falls through to
  strategy (review [8]).

## Handed on

- **The governed-write refusal's words (owner: the lane editing
  `AnaToolExecutor.ts`; it was modified in the working tree by another lane
  when this track started, so it was not touched).** In production the gate
  now refuses a PQ-pending model, but `governedWriteRefusal`
  (`AnaToolExecutor.ts:482-495`) still says "…which is not approved for
  regulatory drafting. Nothing was saved. Ask again with Thorough effort to
  have an approved model draft it." In production the last sentence is false:
  no effort level reaches a PQ-passed model. The fix: when
  `isProductionEnv()` and the served entry is `approvedForHighRisk`, answer
  with `NO_PQ_QUALIFIED_MODEL` (`ai-gateway/model-governance.ts`) and
  "Nothing was saved.", with no retry advice, and rename the call to the
  predicate's meaning when convenient. Test first: a production
  `save_document_to_vault` from `anthropic/claude-opus-5-5` returns that
  sentence. The control itself is not waiting on this.
- **Up-front refusal of a governed-draft turn in production (owner: S4 /
  `stream.ts`).** Today the model drafts, then the tool refuses. The stream
  could say before drafting that no performance-qualified model is available
  when `requestsGovernedDraft` is true and no approved entry is PQ-passed. A
  hint-driven refusal of the whole turn was declined here (review [1]).
- **Relabel the drafting callers listed under Known gaps** to
  `document_drafting` (their owning lanes). Production will then refuse them
  until PQ, which is the ADR's stated consequence.
- **Every `document_drafting` call is refused in production until the D4 PQ
  runs** (ADR-0015, Negative consequences). About 40 call sites, including
  `AnaDocumentDraftingService.ts`, `csr-builder.ts`, `authoring/ib-builder.ts`,
  `section-generation-service.ts`, `cmc/module3-narrative-builder.ts`,
  `indCopilot.js`, `api/cmc/*`, `api/drafting/routes.ts`,
  `mcp/tools/drafting.ts`, `lib/unified-ai-client.ts`,
  `figureGenerationService.ts`, `autoExtractionPipeline.ts` and
  `csr-builder-routes.ts`. **Product decision for the translation owner:**
  `translation/providers/llm-provider.ts:154` labels translation
  `document_drafting`, so translation is refused in production too.
- **The PQ runs under NODE_ENV=staging or development**, never under
  NODE_ENV=production (the beta stack and the CI staging server are
  production for this control). `scripts/deploy-staging.sh` is the hosted
  validation environment. For the D4 owner.
- **LiteLLM (founder-level; owner: `server/services/ai/LiteLLMAdapter.ts`).**
  The product owner's position, for the ADR owner to record: ADR-0015 §3 says
  "no bypass in production", and `LITELLM_UNGOVERNED_ACK` is exactly the
  switch Rule 0 warns about. It should not be accepted in production. No
  deploy configuration in the repository sets `LITELLM_ENABLED`, so refusing
  it changes nothing that runs today.
- **`routeCached` key (owner: RAG pipeline, `advancedRAGPipeline.ts:1497-1507`)**
  omits `riskTier`, `model` and `provider` (review [17]).
- **Tier/pin owners:** `resolveModelOverride`'s comment ("This does not
  enforce Rule 2's PQ clause") is still true for pins; the PQ rule is applied
  at the gateway and the governed-write gate, not at the pin.
- **Rate-limit calibration (S7).** One bucket per tenant at 100 a minute per
  process (measured above). S7's cost calibration reads the ledger, where rate
  refusals now appear, and is where the limit should be tuned. Token-budget
  and blocked-pattern denials are still not ledgered; a blocked pattern is a
  content block and arguably should be.
- **Pre-existing, outside this lane:** `keywordExtractionService.ts` returns
  `[]` on a gateway error, refusals included (an error shown as an empty
  result).
- **Remaining §5 items belong to S5:** the process-wide live sub-agent cap (10
  of 20), the children's sub-bucket at half the organisation's bucket, and the
  cross-process lease.
- **§4d, the unscoped reading (founder decision, stopped).** The per-provider
  invariant holds. The literal unscoped clause "no entry id equals another
  entry's pinned version" is violated by exactly one pair: openai `gpt-4o`
  (id `gpt-4o`) and azure `gpt-4o-azure` (pinned version `gpt-4o`, its Azure
  deployment name). Every lookup matches the provider first, so the pair is
  unambiguous in practice, and a test pins that. Governed data was not edited.
  If the unscoped form is wanted, one of the two entries must change.
- **Commit together.** `model-governance.ts` and the new test files are
  untracked; they must be committed with the files that import them.

## Lane disclosure

**S4 (the Manual/Auto fixer) and a sibling PQ track were editing this same
working tree while this track ran.** At this track's start `git status
--short` was recorded (`status-at-fix-start.txt` in the scratchpad). No file
that was modified or untracked by another lane at that point was edited,
checked out, stashed, restored or reformatted; in particular
`server/services/ana/AnaToolExecutor.ts` (another lane's uncommitted
`check_numerical_integrity` hunks), `server/eval/pq/run-pq.ts`,
`pq-verdict.ts` and `run-pq.test.ts`, anything under `client/`,
`server/routes/ana-ri/`, `server/services/ana/run-*.ts`, `turn-run-policy.ts`,
`tool-trace.ts`, `shared/ana/run-policy.ts`, `shared/ana/run-control-limits.ts`,
the board, the lane index README and `docs/adr/`. Only targeted test files ran,
with `--maxWorkers=2`. No `git stash`, `checkout -- .`, `reset` or `clean` was
run, and nothing was committed.

The track's files:

- **source (lane):** `ai-gateway/gateway.ts`, `policy.ts`,
  `gateway-error-map.ts`, `model-governance.ts` (new),
  `ai-governance/approved-models.ts`, `scripts/ops/ga-readiness-report.mjs`
  (one row's gate text);
- **source (review follow-through, outside the first file list):**
  `ai-gateway/effort.ts` (the picker's one line), `ana/AnaDocumentDraftingService.ts`
  (`quickComplete`), `multi-agent-council.ts` and
  `cmc/module3-narrative-builder.ts` (the PQ refusal's readers),
  `routes/ana-intelligence.ts` (one comment),
  `scripts/ci/check-pq-evaluation-callers.mjs`, `.env.example` (one comment);
- **tests (new):** `governance-review`, `nominal-pin-resolvers`,
  `gateway-model-governance`, `pq-production-gate`, `tenant-capacity`,
  `governance-parity` (+ `fixtures/gateway-selection-parity.json`,
  `support/governed-gateway.ts`, `support/selection-table.ts`) under
  `ai-gateway/__tests__`; `approved-models-invariant` under
  `ai-governance/__tests__`; `governed-write-pq-production` and
  `quick-complete-governance` under `ana/__tests__`; `pq-refusal-consumers`
  under `services/__tests__`;
- **tests (one expectation each, pinning a behaviour this track changes):**
  `tenant-placement-boundary.test.ts` (the admission code),
  `cmc-drafting-governance.test.ts` (403 not 503),
  `tests/audit-ai-gateway-keyless-prod.test.ts` (the production check's
  spelling in a source guard).

Checked with `git log -5` and `git blame` at each edit point:

- **`gateway.ts`** had other commits within 24h: `eeedc6231` (this row's S3),
  `b4efbe63c` (this row's SG) and `a75e38452` (Live Drive, `…01KZK3jg`). None
  of this track's hunks overlaps theirs; the nearest is the `RefusalContext`
  interface, which sits directly above S3's `SubAgentToolModelCallError` class
  and does not touch it.
- **`effort.ts`**: the picker line blames to `b4cd68746`, this row's S2 (same
  lane).
- **`approved-models.ts`**: last changed by `03dea50b7`, this row's H1.
- **Cold (> 24h):** `policy.ts` (09-05), `gateway-error-map.ts` (09-26),
  `AnaDocumentDraftingService.ts` (09-24), `multi-agent-council.ts` (09-26),
  `module3-narrative-builder.ts` (09-23), `ana-intelligence.ts` (09-26),
  `check-pq-evaluation-callers.mjs` (09-23), `ga-readiness-report.mjs` (09-28
  01:21, `7cfba3ab6`, D4 PQ lane; this track's hunk is the one `gate:` string
  of row `high-risk-model-pq`, away from theirs), `.env.example` (09-26), and
  the three neighbour tests (09-05 to 09-26).

The mutation and red scripts swapped only this track's source files, refused
to restore over a change made by another writer, and verified every restore by
sha256. `tree.sha256` was checked after the last run.
