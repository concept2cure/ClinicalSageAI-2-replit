# H1: AnA's default model is pinned only when it is an approved-models entry

**Row:** 74 in `docs/work-orders/README.md` (founder-directed 2026-09-27; it
moves no D-row and is recorded as the founder's exception to RULE 2). This is
the row's follow-through on the S2 hand-off *"The default is not approval-gated
on normal-risk work"* (track G). It adds no capability, no surface and no model.
**Session:** `…019ZvHmh`. **Recorded:** 2026-09-28, against HEAD `c82c056be`
plus the H1 working tree (uncommitted when filed; `tree.sha256` gives every
file's hash).

## Status

The H1 gates are red against HEAD and against the pre-review build, and green
with H1. Each behaviour's gate was also seen to fail under mutation (18/18).
Four things are **not** shown here:

- **No live capture.** This container has no database and no model key. Nobody
  watched a remapped tier refused on a running app. The path is proven by unit
  tests over the real `DEFAULT_MODELS` and `APPROVED_MODELS`.
- **The gateway is not changed.** On normal-risk work its explicit, strategy
  and fallback paths still serve any enabled model, approved or not. H1 governs
  the tier's *pin*, not the model that runs (see "Report only" and "Handed on").
- **The refusal is visible only in the server log** (`ai-gateway:tier`). The
  turn records `modelTier: null`, the same as when tiering is off.
- **Rule 2's PQ clause is still unenforced**, as S2 recorded.

S4 (Manual/Auto) was being built in the same working tree while this track ran.
The files H1 avoided are listed under "Lane disclosure".

## What was wrong

**1. The cost-tier default was not governed.** CLAUDE.md Rule 2 says *"a model
is selectable only as an approved-models entry with a pinned version, rationale
and eval reference"*. S2 held a caller's pin (`model_override`) to that.
`resolveTierModel` still served any **enabled** registry row. That included a
row named by an `ANA_TIER_*_MODEL` remap, and a default alias whose row had
drifted off its pinned version. The gateway refuses a model not approved for
high risk on high-risk work. On every other turn, AnA's default could be a model
with no approved entry. The three callers are `stream.ts` (AnA turns),
`send-message.ts` (chat) and `deep-investigation.ts`.

**2. What the review of the first build found.** The build gated the tier but
left eight minor defects (review objections 1–11, below):

- the pin and the tier chose between matching rows by different rules;
- `governingEntry` depended on the order of `APPROVED_MODELS`;
- a row passed over went unlogged, and the refusal log claimed a row was "not
  served" when strategy selection could still serve it;
- the log warned on every turn, and restated the env-override rule;
- test helpers existed three times.

## The change

**Source**

- `approved-models.ts`:
  - `governingEntry(m, entries = APPROVED_MODELS)` moved here from `effort.ts`
    (it was private there). It is now an identity lookup: the entry whose id,
    provider and pinned version are the row's id, provider and wire model. It
    used to take `approvedEntryFor`'s first hit and check identity on that hit
    alone, so a row that is exactly an entry was refused whenever an earlier
    entry for its provider had an id or pinned version equal to the row's wire
    model. `entries` is a parameter so that case can be tested.
  - `governedMatch(value, rows)` is new: the one rule for turning a named model
    into a registry row. The value is matched on registry id or wire model. The
    first enabled match that is its own entry is `served`, and every match
    before it is `withheld`. It is pure.
- `reasoning.ts`:
  - `resolveTierModel` selects through `governedMatch`. A row that is not its
    entry is passed over, exactly as a disabled row always was. When no row is
    left, the result is null, and the gateway selects by strategy (the existing
    fallback for a tier model that is not enabled).
  - A matching row passed over or withheld is logged:
    `createScopedLogger('ai-gateway:tier').warn(…, {tier, configured, source,
    withheld, served})`. `served` is the row pinned instead, or null. The log
    is written once per process for each configuration (the whole context is
    the key), following `gateway.ts`'s `openAITrimmedDescriptionsReported`. The
    refusal itself applies on every call.
  - `configuredTierModel(tier, env)` states the override rule once. It gives
    the value to `resolveTierModelIds` and the source to the log.
  - The doc comments say what the tier settles: its pin, not the model that
    runs.
- `effort.ts`: `governingEntry` removed (moved). `resolveModelOverride` selects
  through `governedMatch`. Its high-risk step is unchanged, and judges the row
  selected.

**Tests**

- `tier-model-approval.test.ts` (new, 15 cases). It covers remaps and defaults
  that are not entries, the provider, pass-over with its log, the refusal log,
  the wording, the dedupe, the logged source, the approved dials, and
  agreement between pin and tier. It also pins parity with HEAD for every tier
  and every remap to every enabled row, and that `{provider, model}` names one
  row in today's registry.
- `governing-entry.test.ts` (new, 5 cases): order independence and identity.
- `support/approved-rows.ts` (new): `registryRow`, `entry`, `approvedRow`,
  `hasNoEntry`, which were written out three times.
- `reasoning.test.ts`: the `resolveTierModel` fixture is built from
  `approvedRow`. Its old rows carried wire versions their entries do not pin,
  and the gate refuses those.
- `effort.test.ts`: the helpers are imported (aliased to the names the cases
  use). One case added: a pin passes over a row that is not its entry.

**Behaviour on today's registry: nothing changes.** Every one of the 16
`DEFAULT_MODELS` rows is its own entry, and no two rows share a
`(provider, wire)` pair. The parity pins prove every tier default, and every
remap to every enabled row by id and by wire, resolve as at HEAD with nothing
logged. H1 changes behaviour only for a registry or lockfile that differs:

| Case | Before | After |
|---|---|---|
| Tier remap or default to an enabled row that is not its entry | Served | Passed over. Null if nothing is left (strategy selects), with a warn |
| Pin whose first match is not an entry, with a later match that is | Refused (`MODEL_OVERRIDE_REFUSED`, default serves) | The later row is pinned |
| High-risk turn, tier row not an entry and its id not approved for high risk | Gateway threw `ModelNotApprovedError('explicit')` | Tier null, warn, and strategy serves a row whose id is approved for high risk (objection 5) |
| A row that is exactly an entry, with an earlier same-provider entry whose id or pinned version equals its wire | Refused | Its entry |

## Proof

| Stage | File | Result |
|---|---|---|
| The H1 test files **as they are in the tree**, against HEAD's blobs for the three H1 source files (`git hash-object` equals the HEAD blob, recorded) | `red.txt`, part A | 15 failed / 81 passed (96), 4 files. 11 are assertions on the missing behaviour. The other 4 are `governingEntry is not a function`: `governing-entry.test.ts` imports a name that HEAD does not export. `reasoning.test.ts` and the parity pins pass at HEAD, as intended |
| The same tests against the **pre-review build** | `red.txt`, part B | 8 failed / 88 passed. Each failure is the objection it pins. Objection 9's case passes, because the refactor keeps behaviour |
| Objection 4 against its own cause: the pre-review lookup rule, over the `entries` parameter | `red.txt`, part C (= M8) | 2 failed / 3 passed. The row's own entry is refused |
| With H1 | `green.txt` | 16 files, 272/272: `tier-model-approval` 15, `reasoning` 31, `effort` 45, `governing-entry` 5, and 12 neighbours |
| Mutations of the finished tree | `mutations.txt` | 18/18 red: 14 on behaviour and review fixes, 4 overcorrections (M2 never pins, M10 dedupe too coarse, M12 logs a clean pin, M15 refuses a pin after a pass-over). Every file restored and its sha256 re-checked |
| `npx tsc --noEmit` (full project, final tree, `--max-old-space-size=8192`) | `green.txt` | exit 0, 0 errors, in both runs of this pass. The first build's runs showed errors only in other lanes' in-progress files (S4's `stream.ts` and `run-status-policy.test.ts`, and `cross-artifact-consistency.ts`) |
| `npx eslint --format json` on the eight H1 files | `green.txt` | exit 0. 0 errors and 0 warnings in each, none ignored. A 118-line `describe` warned on the first draft and was split |
| `ci:unapproved-model-pins`, its self-test, `ci:gateway-bypass` | `green.txt` | exit 0 each: 54 known pins and no new ones; self-test 14/14; 8 baselined bypasses and no new ones |

The first build's own red run (6 failed / 35 passed against HEAD) and its
parity oracle are superseded by part A, which runs the finished tests.

## Review follow-through

| # | Objection | Disposition |
|---|---|---|
| 1 | Only `{provider, wire}` reaches the gateway, which looks the row up again. The guarantee holds only while that pair names one row | **Documented, pinned, and handed on.** Fixing it would change `gateway.ts`, which is out of scope. `governedMatch` and `resolveTierModel` now say the row served is the row judged only while the pair names one row. A new test pins that for the real registry. The same test shows its check failing on both collision shapes: same provider and wire, and an id equal to the wire. **Declined:** returning `id`. Nothing would read it. The gateway-side check that would key on it is governance item (a), and its carriage runs through `stream.ts` (S4's file) |
| 2 | A passed-over row went unlogged | **Fixed.** A pass-over is logged with the row pinned (`served`). The no-pin log carries `served: null`. Red in part B, and M11 |
| 3, 8 | The pin judged the first match and the tier passed over it: two rules, and duplicated code | **Fixed.** Both resolvers use `governedMatch`, one helper beside `governingEntry`. Pass-over was chosen for three reasons: the task required the tier to reuse its not-enabled fallback; the gateway's explicit path passes over too (`matches.find(approvedForTask)`); and a null tier hands the turn to strategy selection, which is ungated on normal-risk work. The pin's high-risk step still judges the row selected. Two entries' rows could differ there only if they shared a pinned version, and the lockfile's one such pair (`gpt-4o` on openai, `gpt-4o-azure` on azure) is approved for high risk on neither. Tests: the pin pass-over case, and pin–tier agreement over five registries and every value. M3, M16 |
| 4 | `governingEntry` depended on `APPROVED_MODELS` order | **Fixed:** an identity lookup. `governing-entry.test.ts` covers both shapes of earlier entry and the reversed real list. Parts B and C. M5–M8 |
| 5 | On high-risk work, a latent fail-closed refusal became a server-log-only substitution | **Accepted, no code change.** It is the not-enabled fallback the task mandated, and today's registry cannot reach it. The strategy path on high-risk work is approval-gated (`approvedForTask`), so what serves is a row whose registry id is approved for high risk. That check keys on the id alone, so a drifted row that keeps an approved id passes it either way (governance item a). The turn carries no signal: `modelTier` records null (`stream.ts`, `modelTier: tieredModel?.tier ?? null`), as it does with tiering off. Handed on to the turn-record owner |
| 6 | A short path in the findings | **Fixed below:** `server/lib/unified-ai-client.ts` |
| 7 | "Not served" / "degrades to strategy" claimed what the gateway may not do | **Fixed.** The log now says the tier pins no model, and that strategy selection "on normal-risk work is not approval-gated and can choose a withheld row". The same is said in the `TIER_MODEL_ENV`, `resolveTierModel` and `governedMatch` comments. Red in part B, and M14 |
| 9 | The log's `source` restated the override rule | **Fixed:** `configuredTierModel` returns `{value, source}` once. No red is possible, because behaviour is kept. The case pins a blank and a padded env var, and M13a (wrong label) and M13b (rule change) turn it red |
| 10 | A warn on every turn for a static fault | **Fixed:** once per process for each configuration, and the refusal on every call. Red in part B (3 warns, not 1). M9, and the overcorrection M10 |
| 11 | Test helpers written three times | **Fixed:** `__tests__/support/approved-rows.ts`, imported by all three files. No red is possible (a test refactor). `green.txt` shows all three passing on it |

## Report only: explicit models on normal-risk work (input for a governance decision)

Nothing below was changed.

**The gateway paths.** `selectModel` (`gateway.ts`, "Explicit provider/model
override" and the `eligible`/`relaxed` filters) and `getFallbackModels` check
approval only when `isHighRiskRequest` is true (`approvedForTask`). On
normal-risk work:

- the explicit path serves any enabled row whose `model` or `id` equals
  `request.model`, provider-scoped when a provider is sent;
- strategy and fallback serve any enabled, capable row.

**Why no unapproved model serves today.** The runtime registry is
`buildModelRegistry()`: `DEFAULT_MODELS` with only `enabled` recomputed, and
nothing adds rows at runtime. All 16 rows are their own entry. The drift test
(`approved-models.test.ts`, `detectModelDrift`) keeps it so in CI. No check at
the point of selection enforces it.

**Silent substitution.** An explicit model that matches no registry row falls
through to strategy selection, with no error and no log.

**The 54 known pins** (`ci:unapproved-model-pins`, 15 files), classified against
the live registry:

- **50 name a registry row that is its own entry:** `gpt-4o` 39,
  `gpt-4o-mini` 4, `claude-sonnet-4` 4, `claude-haiku-4` 1,
  `moonshot-v1-128k` 1, `moonshot-v1-32k` 1.
- **4 name no row.** All are in `server/services/aiProviderRouter.ts`: :188
  `gpt-4-turbo-preview`, :214 `claude-3-5-sonnet-20241022`, :233
  `claude-3-opus-20240229` and :245 `claude-3-haiku-20240307`.
- None of the 54 is approved for high risk. The scan selects for that.

Where the 54 go:

- **Sent to the gateway as an explicit model on normal-risk work (34).** They go
  through `ai.chat` with no `taskType`, which defaults to `'general'`
  (`server/lib/unified-ai-client.ts:167`), or through `gateway.route` at
  `'general'`/`'document_analysis'`. All 34 are approved entries:
  - `server/api/cmc/audit-risk-monitor.js` ×10, `cmc-copilot.js` ×5 and
    `manufacturing-tuner.js` ×5, all `gpt-4o`;
  - `server/services/submission-twin-service.ts` ×7, `gpt-4o` (a RULE 2
    no-session surface);
  - `server/api/drafting/routes.ts:551` and
    `server/routes/c2c/context-intelligence.ts:170` and `:595`, all
    `gpt-4o-mini`;
  - `server/services/predictiveSectionService.ts:213`, `gpt-4o`;
  - `server/services/keywordExtractionService.ts:168`,
    `process.env.OPENAI_MODEL || 'gpt-4o'`. The env var can name any string:
    a registry row (all are approved) or no row (a silent strategy
    substitute);
  - `server/services/ana/AnaDocumentDraftingService.ts:504`
    (`document_analysis`) and `:744` (`general`), both `claude-sonnet-4`.
  - `gpt-4o` matches both `openai/gpt-4o` and `azure/gpt-4o-azure` by wire,
    and both are approved. The gateway takes the first that placement allows.
- **Unreachable, or no callers (4):** `server/lib/unified-ai-client.ts:306` and
  `:317`, `server/services/ai/openai-orchestrator.ts:146`,
  `server/services/unifiedDocumentIngestion.js:853`. All are approved entries.
- **Never sent as `model` (16):**
  - `server/routes/agent-swarm.ts` ×7 (display metadata);
  - `server/services/aiProviderRouter.ts` ×8: the `MODEL_CONFIGS` table, which
    includes the 4 no-row pins. `executeViaGateway` sends only the provider
    unless the caller passed `request.model`;
  - `server/services/cognitive-ecosystem/agent-runtime.service.ts:61` (a config
    value nothing reads).

**Outside the scan:**

- **7 `claude-opus-4` literal pins:** `server/lib/unified-ai-client.ts:269` and
  `:293`; `server/routes/ana-intelligence.ts:590`;
  `server/services/ana/AnaDocumentDraftingService.ts:415`, `:566` and `:646`;
  `server/services/preclinical/preclinical-extractor.ts:28`. Each resolves to
  its own entry, which is approved for high risk.
- **Dynamic explicit callers:**
  - `stream.ts` `resolvedOverride` (gated by S2, and now selected by
    `governedMatch`);
  - `stream.ts` `tieredModel`, `send-message.ts` `chatTieredModel` and
    `deep-investigation.ts` `tiered` (all gated by H1);
  - `aiProviderRouter.ts` `request.model`, `ragRouter.ts:168` `params.model`
    and `rag-reranker` `cfg.model`: pass-throughs, ungated on normal-risk
    work, that can reach only approved registry rows or nothing;
  - `indCopilot.js` `options.model`: `document_drafting`, so the gateway's
    high-risk gate applies.

**`local-default`.** Its entry pins `'local-default'`, a placeholder: the
rationale says the self-hosted server chooses the weights.
`ANA_TIER_ECONOMY_MODEL=local-default` therefore passes H1's gate, but Rule 2's
"pinned version" is nominal for it.

## Handed on (row 74, later slices, or the owning lane)

- **S4 / orchestrator (`stream.ts` is S4's file; not edited).** Two comments
  are stale, and both are around lines 1411–1413 and 1462 while S4 edits:
  - The override block says the default "is not itself checked against
    approved-models on normal-risk work (resolveTierModel matches enabled
    models only)". That is now true of the gateway's strategy half only.
  - The cost-tier block says "enabled registry models". It should say
    "enabled registry models that are their approved entry".
  - The `MODEL_OVERRIDE_REFUSED` text ("the default model") stays accurate.
- **A pin that passed over a row is not said.** `resolveModelOverride` returns
  only the row it pins. When `governedMatch` withheld an earlier row for a pin,
  nothing tells the person. This cannot happen on today's registry. If it
  should be said, the stream route is where.
- **Turn-record owner.** A tier refused by the gate records `modelTier: null`,
  the same as tiering off or a policy hint. The refusal appears only in the
  `ai-gateway:tier` warn (objection 5).
- **Governance decisions:**
  - (a) Enforce `governingEntry` at the gateway's selection points on
    normal-risk work. Until then the tier gate is fail-closed only for the
    pin: a withheld row stays in the registry and strategy can choose it
    (objection 7), and a `{provider, wire}` collision would serve a row other
    than the one judged (objection 1). On high-risk work the gateway's check
    keys on the registry id alone (`isApprovedForHighRisk(model.id)`), so a row
    drifted off its pinned version under an approved id also passes it.
  - (b) Refuse, or at least log, an explicit model that matches no row, instead
    of the silent strategy substitute.
  - (c) The nominal pin of `local-default`.
  - (d) Lockfile ambiguity. `approvedEntryFor` (the ledger's and served-model
    gate's lookup) still takes the first entry by `(provider, wire)`. If two
    entries ever shared a provider and pinned version, or an entry's id equalled
    another's pinned version, the ledger could attribute a call to a different
    entry than selection used. `detectModelDrift` forbids neither. An invariant
    test over `APPROVED_MODELS` and `DEFAULT_MODELS` would close this and the
    registry side of (a).
  - (e) PQ: every entry is still `pending` (from S2).

## Lane disclosure

The H1 files are:

- source: `server/services/ai-gateway/reasoning.ts`,
  `server/services/ai-gateway/effort.ts`,
  `server/services/ai-governance/approved-models.ts`;
- tests: `server/services/ai-gateway/__tests__/tier-model-approval.test.ts`
  (new), `server/services/ai-governance/__tests__/governing-entry.test.ts`
  (new), `server/services/ai-gateway/__tests__/support/approved-rows.ts` (new),
  `server/services/ai-gateway/__tests__/reasoning.test.ts`,
  `server/services/ai-gateway/__tests__/effort.test.ts`.

Each file was checked with `git log -5` before it was edited:

- **`reasoning.ts`, `effort.ts`, `effort.test.ts`**: the last commit is
  `b4cd68746` (2026-09-28 06:41, S2 of this same lane, row 74), inside 24h.
  - `reasoning.ts`: H1 rewrites S2's corrected `resolveTierModel` comment (the
    gate replaces what it described) and the function body. It also changes
    `resolveTierModelIds`'s body (same behaviour), the header's side-effect
    sentence and the `TIER_MODEL_ID` and `TIER_MODEL_ENV` comments.
  - `effort.ts`: H1 removes S2's private `governingEntry`, changes the import
    line, and rewrites `resolveModelOverride`'s body and steps 1–3 of its
    comment. This is a behaviour change to S2's code, in the pass-over case
    only.
  - `effort.test.ts`: H1 replaces S2's local helpers (`model`, `entry`,
    `approvedModel`) with aliased imports, changes one governance-assumption
    line to `hasNoEntry`, and adds one case.
  - No other lane's hunks are in these files.
- **`approved-models.ts`**: the last commit is `213fbebcb` (2026-09-26, D6),
  outside 24h. The change is additive: `governingEntry` and `governedMatch` are
  inserted after `approvedEntryFor` (blame at the insertion point:
  `213fbebcb` / `7fb34e661`), and `ModelConfig` is added to the type import.
  No lockfile data changed.
- **`reasoning.test.ts`**: the last commit is `570ca18a1` (2026-09-23), outside
  24h. H1 changes the `resolveTierModel` fixture (blame `^462a6ca7a`) and one
  import.

**S4 was being built in this working tree at the same time.** H1 did not edit,
check out, stash, restore or reformat any S4 file. Those are `stream.ts`,
`post-processing.ts`, `run-control.ts`, `run-hold.ts`, `agentic-loop.ts`,
`agentic-tool-dispatch.ts`, `run-status.ts`, `tool-trace.ts`,
`shared/ana/run-control-limits.ts`, everything under `client/`, the lineage and
turn-record files, `docs/work-orders/README.md` and the lane's index README. It
also did not touch `send-message.ts`, `deep-investigation.ts`, `gateway.ts`, or
any migration.

The two red re-records briefly replaced the three H1 source files (HEAD blobs,
then the pre-review snapshot). Each run was restored from a copy of the final
tree and verified with `sha256sum -c`. The test runs were limited to the H1
files and their neighbours, with `--maxWorkers=2`. Nothing was committed.
