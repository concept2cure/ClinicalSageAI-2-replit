# AnA's three RBM handlers, read against their route and actuator: diagnosis and fix

Date: 2026-11-01. Branch `concept2cure-v2`, read at `72383e342`. The three handlers are unchanged since
`dd5a97689`. Package: F1 (repairs to shipped behaviour).

**Status: fixed, reviewed, committed with this README.** The diagnosis below was read at `72383e342`, and its
line numbers refer to that commit. The fix was made on `b3c9e4421`, where the three handlers and the RBM
services were still as diagnosed; see [The fix](#the-fix). A skeptic review then tried to refute it, found
two gaps and closed them; see [Skeptic review](#skeptic-review-2026-11-02). Every case is red against the
HEAD text of the changed sources and green after the fix (`red/`, `green/`).

This folder holds:
- this README;
- the diagnosis probe (`method/rbm-handlers.probe.ts`, run by its config `method/vitest.probe.config.ts`);
- the config that runs tests against other copies of the changed sources, such as their HEAD text
  (`method/vitest.swap.config.ts`);
- the baseline of the suites that existed before (`before/existing-suites.txt`);
- the red results (`red/`) and the green results (`green/`).

The findings come from the S8 review (`docs/evidence/F1/2026-11-01-rbm-step-presentation/README.md`,
"Skeptic review"). The rule used here: the HTTP route and `server/services/rbm/rbm-actuator.ts` define the
behaviour. AnA must do the same thing by calling the same function. It must never run a looser copy.

| Finding | Verdict |
|---|---|
| (a) `add_ctq_factor` saves the factor with no assessment | **Confirmed** (probe a1–a3). It also skips the route's input checks (a4). |
| (b) `generate_rbm_plan` reads every version and defaults to `'medium'` | **Confirmed** (b1–b3). The actuator has its own `'medium'` fallback for an approved assessment with no recorded overall risk (b4). |
| (c) `run_rbm_assessment` with `seed: true` writes, and its block claims `engine` | **The seed is a template start, not fixture data. Keep it.** The block claims `project`, not `engine`, so the premise is wrong. The gate gap is real and lies outside these files. The same handler's summary reads every version (c3). |

## What already exists

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| `add_ctq_factor` handler | `server/services/ana/AnaToolExecutor.ts:3507-3528` | Validates org, programId and factor. Calls `addCtqFactor(getPool(), …)` with no `assessmentId`, outside a transaction. | Does not attach the factor to any assessment. Does not call `requireDraftAssessment`. Does not check 1–5 ranges or the category. |
| `add_ctq_factor` definition | `server/services/ana/evidence-literature-tool-defs.ts:697-719` (description :700) | Says it "Adds a … factor to a program's risk assessment (RACT)". | Has no `assessmentId` property. |
| `addCtqFactor` | `server/services/rbm/rbm-actuator.ts:97-113` | Scores likelihood × impact, infers criticality from the band and inserts into `rbm_risk_items` with `input.assessmentId ?? null`. | Validates nothing. Its only caller is the AnA handler. |
| `requireDraftAssessment`, `RbmAssessmentEditError` | `rbm-actuator.ts:65-78` | Locks the assessment `FOR SHARE`. Refuses with 404 when it is missing, 409 `RBM_PROJECT_MISMATCH` when it belongs to another project, and 409 `RBM_ASSESSMENT_IMMUTABLE` when it is not a draft. | — |
| `POST /api/mdx/rbm-risk-items` | `server/routes/mdx-rbm.ts:328-377` | Zod body (`SCALE_1_5` :115, `CATEGORY` :116, `ctqFactor` ≤ 2000). One transaction: `BEGIN`, then `recheckRbmWrite` (:360), then `requireDraftAssessment` when an `assessmentId` is given (:361), then its own INSERT (:362-369). | It does not call `addCtqFactor`; it has its own INSERT (see "Outside these files"). Without an `assessmentId` it inserts an unattached factor. |
| The assessment a person opens | `mdx-rbm.ts:228-245` (`GET /rbm-assessments/:id`) | Reads factors `WHERE assessment_id = $1 AND program_id = $3` (:239-242). | Does not show unattached factors. |
| The content a person signs | `server/services/rbm/rbm-signature-content.ts:27-39` | Reads factors `WHERE assessment_id = $2 AND program_id = $3` (:32-36). | Does not cover unattached factors. |
| RACT screen | `server/routes/mdx-rbm-board.ts:308-318` (chosen assessment), `:424-430` (scoped items); `client/src/concept2cure/v2/surfaces/RbmSurfacesA.tsx:309-318` (add factor) | Shows the highest version. Adds a factor with `assessmentId: board.assessment?.id ?? null`. Lists only that assessment's factors, or every factor when the study has no assessment. | — |
| AnA RBM admission | `server/services/rbm/rbm-access.ts:133-143`; `relatedRecords` :60-61 | Resolves `assessmentId` / `assessment_id` in tool input to its project and refuses a foreign one (409) or a missing one (404). It does a write check for `confirm`-class calls. Tested for `draft_monitoring_plan` at `rbm-access.test.ts:148-155`. | Runs before the handler, outside any write transaction. |
| `generate_rbm_plan` handler | `AnaToolExecutor.ts:3330-3363` | Reads the latest assessment in any status (:3339-3342) and uses `'medium'` when there is none (:3343). Reads critical factors across the whole study, from every version and from unattached factors (:3344-3349). Proposes one `site_visit` per factor (:3355-3361). | Saves nothing. Does not call the actuator. |
| `generate_rbm_plan` definition | `evidence-literature-tool-defs.ts:600-613` | "Drafts an integrated … plan … from the assessment's overall risk". Advisory. | — |
| `generatePlanFromAssessment` | `rbm-actuator.ts:458-583` | Picks the assessment with active first (:489-494). Refuses `no_assessment` and `assessment_not_approved` (:495-497). Takes the open critical factors of that assessment only (:500-511) and the enhanced-tier sites (:512-517). Strategy from overall risk (:519-522). Refuses when a draft plan is open (:527-528). Inserts a draft plan, one `issue` per factor and one `site_visit` per enhanced site (:531-570). | Maps an overall risk that is not `low`/`high` (including `NULL`) to `'medium'` (:519-521). Its comment says it backs "the AnA plan tools" (:480), but no AnA handler calls it. |
| `POST /api/mdx/rbm-monitoring-plans/generate` | `mdx-rbm.ts:1329-1373`; caller `RbmSurfacesB.tsx:519` | Runs `generatePlanFromAssessment` in a transaction. Maps `draft_already_open` and `assessment_not_approved` to a message each (:1353-1358). Every other reason gets "No risk assessment exists …" (:1359). | — |
| `defaultPlanStrategy` | `server/services/rbm/rbm-engine.ts:291-296` | high → hybrid, medium → risk_based, low → centralized. | — |
| `run_rbm_assessment` handler | `AnaToolExecutor.ts:3188-3231`; seed helper `seedRbmWithDispatchClient` :3173-3186 | Reads the latest assessment by `updated_at` (:3202-3205, :3217-3220). With `seed: true` and no assessment at all, seeds through the canonical service (:3207-3209). Reads factors across the whole study (:3211-3216). | Its summary does not keep to the factors of the assessment it returns. |
| `run_rbm_assessment` definition | `evidence-literature-tool-defs.ts:552-567` | "seeds a DRAFT or summarizes …"; `seed`: "create a default RACT from the CtQ library when none exists". | — |
| Seed service | `server/services/rbm/rbm-assessment-seed.ts:1-44` | One body. Rechecks write authority inside the transaction (:9). Inserts a `'draft'` assessment (:11-12) and the eight library factors (:15-18). Transaction ownership is explicit: `owned`, `caller-owned`, or a pool lease (:23-44). | — |
| `POST /api/mdx/rbm-assessments/seed` | `mdx-rbm.ts:209-226` | The same `seedRbmAssessment`. It runs whether or not the study already has an assessment. | No client caller (`docs/reports/orphan-endpoints-latest.json:6104`). |
| The library | `rbm-engine.ts:183-251` (`DEFAULT_CTQ_FACTORS`, "a starting RACT a sponsor refines"); roll-up `overallRiskFromScores` :46-54 | TransCelerate RACT model factors with starting ratings. | — |
| Where seeding is reached | `client/src/concept2cure/v2/surfaces/Rbm.tsx:55-66`, `:413-418` | The empty state's "Seed risk assessment" and "Seed a default ICH E6(R3) assessment" actions call `askAna`. Copy: "Seeding creates the ICH E6(R3) TransCelerate defaults, scoped to this study, ready to tailor." | — |
| Approval | `mdx-rbm.ts:1064-1130`; `approveAssessment` `rbm-actuator.ts:862-921` | Approves a draft only, with the two-person rule, signing authority and re-authentication. Sets `updated_at = NOW()` on the approved version and on the version it archives, in one transaction. | — |
| Amendment | `rbm-actuator.ts:379-447` | Opens a new draft version and copies every factor forward (:431-444). | — |
| Register and gate | `server/services/ana/tool-authorization.register.json:60` (`add_ctq_factor`), `:3867` (`generate_rbm_plan`), `:6416` (`run_rbm_assessment`); rule `server/services/ana/tool-authorization.ts:162`; gate `scripts/ci/check-step-presentation.mjs:62`, `:319` | `add_ctq_factor`: confirm, add / project. `generate_rbm_plan`: read, derive / **engine**. `run_rbm_assessment`: conditional (`seed === true` → confirm), summarize / **project**. ENGINE refuses only the classes `confirm`, `refuse` and `command`. | ENGINE does not refuse `engine` on a `conditional` tool. |

Searches run: `grep -rn` across `server`, `client/src` and `shared` for the three tool names and for
`addCtqFactor`, `generatePlanFromAssessment`, `requireDraftAssessment`, `seedRbmAssessment`,
`defaultPlanStrategy`, `/rbm-assessments/seed`, `/rbm-monitoring-plans/generate` and `/rbm-risk-items`; the
register and the conditional rules for the three names; `git log --all --diff-filter=D -- '*rbm*' '*Rbm*'`
(nothing deleted bears on these handlers: `2895218b8` and `15da8159e` removed old client shells); and the
schema in `migrations/20260629_rbm_surfaces.sql`. `rbm_risk_assessments.overall_risk` is nullable (:28).
`rbm_risk_items` has no CHECK constraints (:43-67).

## (a) `add_ctq_factor`: which assessment the factor joins

**Diagnosis.** The handler never passes `assessmentId` (`AnaToolExecutor.ts:3519-3526`), so the factor is
saved with `assessment_id` NULL (probe a1: `expected null to be 12`). That factor is in no risk assessment.
The assessment page does not show it (`mdx-rbm.ts:239-242`), the signed content does not include it
(`rbm-signature-content.ts:32-36`), and once the study has any assessment the RACT screen hides it too
(`mdx-rbm-board.ts:429`). The handler writes even when the study's only assessment is signed (a2), and
it ignores a named signed assessment (a3), where the route returns 409. It also accepts `likelihood: 7`
(a4), which the route refuses with 422. The column has no CHECK, so the 7 would be stored beside a score
computed from the clamped 5 (`rbm-engine.ts:27-43`).

**Decision.**

1. **Input.** Add an optional `assessmentId` (number) to the definition, like `draft_monitoring_plan`
   (`evidence-literature-tool-defs.ts:833`). Admission already checks it: a foreign id is refused 409 and a
   missing one 404 (`rbm-access.ts:60-61`, `:140`).
2. **Which assessment.** If the call names one, use it. If not, use the study's open draft
   (`status = 'draft'`, not deleted):
   - **Exactly one:** attach the factor to it.
   - **None, but a signed version exists:** refuse with the actuator's own reason (`rbm-actuator.ts:76`).
     The signed version is read-only, and the person must open an amendment.
   - **No assessment at all:** refuse: "This study has no risk assessment yet. Start one first, then add
     the factor to it. Nothing was saved." Starting one is `run_rbm_assessment` with `seed: true`, which
     creates an unsigned draft.
   - **More than one draft:** refuse. Name each draft's id and version, and ask which one. This can
     happen, because `POST /rbm-assessments` and the seed route both create drafts freely.

   AnA never saves an unattached factor. The definition promises the factor goes into the risk
   assessment, and an unattached factor reaches neither the RACT nor the signature.
3. **Check and write as the route does, in one transaction.** The order matches the route
   (`mdx-rbm.ts:357-371`):
   1. `BEGIN`.
   2. `requireRbmProgram(client, actor, { programId }, true)`. This is the route's `recheckRbmWrite`
      (:360), and what `writeSeed` does at `rbm-assessment-seed.ts:9`.
   3. `requireDraftAssessment(client, orgId, id, programId)` (:361).
   4. `addCtqFactor(client, orgId, { …, assessmentId: id })`.
   5. `COMMIT`.

   On `RbmAssessmentEditError`, roll back and return `{ error: message, code }`. Today the handler writes
   through `getPool()` with no transaction (`AnaToolExecutor.ts:3517-3519`), so the `FOR SHARE` lock
   would hold nothing, and an approval could land between the check and the insert.

   For the client, use the rule the seed already follows (`AnaToolExecutor.ts:3173-3186`): the dispatch
   client `ctx.sqlClient ?? getPool()`. Lease a connection from the canonical pool; take a pinned request
   client as it is, with `BEGIN`/`COMMIT` on it. Make the seed's existing owned-transaction wrapper
   (`rbm-assessment-seed.ts:23-44`) reusable by both writers rather than copying it into the handler. It
   stays a function in an existing file, not a new file (RULE 6).
4. **Input checks** (a4). Likelihood, impact and detectability must be integers from 1 to 5. The
   category must be one of the actuator's `CTQ_CATEGORY` (`rbm-actuator.ts:41`). These are the route's
   rules (`mdx-rbm.ts:115-116`, `:328-342`). Put them in `addCtqFactor`, so that any caller gets them, and
   return the reason to the model.
5. **Register.** No change is needed. "Added a critical-to-quality factor for the study" stays true.

## (b) `generate_rbm_plan`: which assessment the plan comes from

**Diagnosis.** With no assessment, the handler answers `overallRisk: 'medium'` and the `risk_based`
strategy (b1). With only an unsigned draft, it derives from the draft (b2). Its factor query has no
`assessment_id` (b3), so after an amendment every factor is counted twice. The actuator explains why
this is wrong (`rbm-actuator.ts:500-503`). The proposed actions also differ from what the route would
create. The handler proposes a `site_visit` per factor, rated `>= 15 → high`; the route creates an
`issue` per factor, banded with `bandFromScore`, and a `site_visit` per enhanced-tier site.

A second `'medium'` sits in the canonical path itself. `generatePlanFromAssessment` maps any overall risk
that is not `low` or `high`, including NULL, to `'medium'` (`rbm-actuator.ts:519-521`). NULL is reachable:
the column is nullable, `POST /rbm-assessments` accepts a null (`mdx-rbm.ts:190`, `:203`), and approval
does not require the column. Probe b4 shows the handler answering `'medium'` for an approved assessment
that records no overall risk.

**Decision.**

1. **Built from** the study's approved (active) assessment, chosen exactly as the actuator chooses it
   (`rbm-actuator.ts:489-498`). The tool takes no `assessmentId`. A named draft is refused by the
   actuator's own rule, and a named archived version has been superseded. Only the governing version may
   seed a plan.
2. **One derivation.** Split the read half of `generatePlanFromAssessment` (`:489-522`, plus the action
   shapes at `:549-570`) into an exported read-only function in the same file:
   - `generatePlanFromAssessment` calls it, then makes its open-draft check and inserts (`:524-570`).
   - `generate_rbm_plan` calls it and saves nothing.

   AnA's proposal then is what `POST /rbm-monitoring-plans/generate` would write. The handler may also
   say that a draft plan is already open, since generating would then be refused (`:527-528`).
   `rbm-actuator.ts` imports only `rbm-engine.ts` (`:25-34`), so the `engine` claim stays clean for the
   gate's model-reach check.
3. **Refusals.** Return `{ error }` and no `overallRisk` field. Use the route's reasons:
   - No assessment: `mdx-rbm.ts:1359`.
   - Not approved: `mdx-rbm.ts:1358`.
   - **Approved, but no recorded overall risk:** "The approved risk assessment records no overall risk, so
     no monitoring strategy can be derived from it."

   The derivation returns this third case as its own reason. The route then has to give it a true
   message: today `mdx-rbm.ts:1357-1359` turns every unknown reason into "No risk assessment exists …",
   which would be untrue here. `mdx-rbm.ts` is not among this task's files, so the orchestrator must
   choose:
   - **Grant those three lines** (recommended). The fallback is then removed from the route too.
   - **Refuse only on the AnA path.** The actuator's `:519-521` fallback stays, recorded as an open defect
     of the route.

   **Taken: refuse only on the AnA path.** The fix task did not grant `mdx-rbm.ts`. The derivation reports
   an unrecorded overall risk as `recordedOverallRisk: null`, never as a reason the route would mislabel.
   `generate_rbm_plan` refuses it. `generatePlanFromAssessment` keeps its `'medium'` fallback, marked in the
   code as an open defect (`rbm-actuator.ts`, the `OPEN DEFECT` comment in `generatePlanFromAssessment`).
   See "Open after this fix".
4. **Stays class `read`, `writes: none`.** Present block derive / engine / "a proposed monitoring plan":
   every refusal returns `{ error }`, so the row stays in its doing form. No register change. Change the
   definition's "Drafts" to "Proposes … saves nothing", and name the approved RACT and the refusals.

## (c) `run_rbm_assessment` with `seed: true`

**What it does.** The handler calls the canonical `seedRbmAssessment`, the same function
`POST /rbm-assessments/seed` calls (`mdx-rbm.ts:216-226`). It does so only when the study has no
assessment at all (`AnaToolExecutor.ts:3202-3209`). The seed writes:
- one assessment with status `'draft'` (`rbm-assessment-seed.ts:11-12`);
- the eight `DEFAULT_CTQ_FACTORS` with their library ratings (`:15-18`; `rbm-engine.ts:193-251`).

The overall risk is rolled up from those ratings by `overallRiskFromScores` (`rbm-assessment-seed.ts:10`).
Write authority is rechecked inside the transaction (`:9`). Probes c1 and c2 hold today.

**Verdict: a template start, not fixture data. Keep it.**
- It records no study observation and claims none: no site, subject, reading, signal or status.
- It is the published TransCelerate RACT starting library. The product labels it as one: "the ICH E6(R3)
  TransCelerate defaults, scoped to this study, ready to tailor" (`Rbm.tsx:415`).
- It is stored as an unsigned draft. It governs nothing until a second person signs it after
  re-authenticating (`mdx-rbm.ts:1064-1120`).
- It is not a derivation from study data either. It is a starting point the sponsor refines.
- It is the product's only reachable way to start a RACT. The empty state's seed actions go through AnA
  (`Rbm.tsx:56-60`, `:413-417`), and the HTTP seed route has no client caller. Removing it would delete a
  reachable capability with no replacement (working agreement).

**Present block.** The register already says `summarize / project / "the study risk assessment"`
(`tool-authorization.register.json:6416-6426`). S8 chose `project` for exactly this reason, so the claim
that the block says `engine` is wrong, and no register change is needed. The gate gap is real: ENGINE
refuses only `WRITE_CLASSES` (`check-step-presentation.mjs:62`, `:319`), so `engine` on this conditional
tool would pass (S8's `red/probe-conditional-gap.txt`). Closing it means changing the gate script, which
is outside these files. It is recorded here, not fixed.

**A defect found in the same handler: the summary (probe c3).** The summary reads factors across the
whole study (`AnaToolExecutor.ts:3211-3216`) but returns one assessment, chosen by
`ORDER BY updated_at DESC LIMIT 1` (`:3217-3220`).
- After an amendment, the factors were copied forward (`rbm-actuator.ts:431-444`), so every factor is
  listed twice and `criticalFactors` counts each one twice.
- Approval stamps `updated_at = NOW()` on the approved version and on the version it archives, in one
  transaction (`rbm-actuator.ts:880-918`). The two rows tie, and the summary can present the archived
  version. The same tie affects `generate_rbm_plan` today (`:3340`).

**Decision.** Resolve the assessment as the RACT screen does: highest version
(`mdx-rbm-board.ts:314-318`). Read only its factors, `WHERE assessment_id = $id`, as
`GET /rbm-assessments/:id` does (`mdx-rbm.ts:239-242`). Return its status and version, so that a draft
amendment is never presented as the governing version. Show the "No RACT yet" hint only when the study
has no assessment; today it appears whenever the item list is empty (`:3229`). The seed path is
unchanged.

## Tests that cover each handler today

| Handler | Handler-level tests | Tests of what it calls | Not covered |
|---|---|---|---|
| `add_ctq_factor` | None. | `addCtqFactor`: `server/services/rbm/__tests__/rbm-actuator.test.ts:34-60` (3 tests: score and band, low risk not critical, `isCritical` override). The draft rule through the route: `server/routes/__tests__/rbm-assessment-integrity.test.ts:125-151`. The admission's `assessmentId` cross-project refusal, tested on another tool: `rbm-access.test.ts:148-155`. | Which assessment the factor joins; signed-assessment refusal; input ranges; the transaction. |
| `generate_rbm_plan` | None. | `defaultPlanStrategy`: `rbm-engine.test.ts:139-143`. `generatePlanFromAssessment`, which the handler does not call today: `rbm-actuator.test.ts:261-327`, `:394-403`. | Every handler path. |
| `run_rbm_assessment` | `server/services/ana/__tests__/rbm-launch-admission.test.ts:28-56` (4 tests: private project refused before any read; seed commits a draft; the canonical pool is leased; a pinned client is used as is). | The class rule: `tool-authorization.test.ts:116-117`. Launch scope: `ana-launch-scope.test.ts:59-63`, `:99`. The seed service: `rbm-assessment-seed.test.ts` (7 tests). Admission: `rbm-access.test.ts`. | The summary's content (which assessment, which factors). |
| All three, presentation | `npm run ci:step-presentation` and its self-test. | — | — |

Baseline, `before/existing-suites.txt`: those 8 files, 191 tests, all pass. `ci:step-presentation` OK (674
in-scope tools, 139 engine claims).

## Red

`red/probe-today.txt`: 11 cases, **9 red and 2 hold**. Each case states the canonical behaviour, so red
means the defect is present. The DB is a recording double routed by SQL text, as in
`rbm-launch-admission.test.ts`, and admission runs for real except for the same mocks that suite uses.

- a1 `expected null to be 12`: the factor joins no assessment.
- a2, a3 `expected undefined to be truthy`: there is no refusal, and the row is written.
- a4: likelihood 7 is accepted.
- b1 `expected 'medium' to be undefined`.
- b2: no refusal for a draft-only study.
- b3: the factor query has no `assessment_id`.
- b4 `expected 'medium' not to be 'medium'`.
- c3: the summary's factor query has no `assessment_id`.
- c1 and c2 hold. The seed writes one draft and the 8 library factors and commits, and it writes nothing
  when an assessment exists.

The fix step copies these cases into `server/services/ana/__tests__/` and turns them green. It keeps the
two that hold as guards.

### The fix's own tests, at HEAD (before the fix)

These were written first and run against the unchanged handlers and services at `b3c9e4421`:

- `red/handlers-at-head.txt`, for `server/services/ana/__tests__/rbm-handlers.test.ts` (new): 24 cases, **22
  red and 2 hold**. The 2 that hold are the guards c1 and c2.
  - (a): a1–a9 are all red.
    - The factor joins no assessment (`expected null to be 12`).
    - There is no refusal for a signed version, a missing assessment, two drafts, a likelihood of 7 or a
      bad category.
    - The write is not in a transaction: no `BEGIN`, no recheck inside one, and no pool lease.
  - (b): b1–b6 are all red.
    - It answers `'medium'` with no assessment, and `'high'` from a draft.
    - It derives from the draft amendment, not the approved version.
    - It proposes `site_visit` per factor instead of the route's actions.
    - It does not report an open draft plan.
  - (c): c3–c5 are red.
    - The factor read has no `assessment_id`, so every factor is listed twice after an amendment.
    - "No RACT yet" appears beside an existing, empty assessment.
- `red/actuator-seed-at-head.txt`, for `rbm-actuator.test.ts` and `rbm-assessment-seed.test.ts` (extended):
  **10 red**, 54 pass.
  - `addCtqFactor` accepts likelihood 7, impact 0, likelihood 2.5, detectability 6 and category
    "quality" (5 cases).
  - `derivePlanFromAssessment` does not exist yet (3 cases).
  - The shared owned transaction does not exist yet (2 cases).
- `red/mutations.txt`: the fixed tree with each fix undone in turn, then restored. Each mutation turns
  its cases red:
  - (a) without `requireDraftAssessment`, a2 and a3 fail;
  - (b) without the unrecorded-risk refusal, b4 fails;
  - (c) without `assessment_id` in the summary's factor read, c3 and c4 fail.

  After `red/handlers-at-head.txt` was taken, the suite's SQL double was split into per-table helpers and
  the (a) block into two `describe`s, for the ESLint size and branch rules. No case changed.
  `red/mutations.txt` was run on the split suite.

## The fix

Files changed. No migration, and no new file except the test.

| File | Change |
|---|---|
| `server/services/rbm/rbm-actuator.ts` | `addCtqFactor` refuses what the route refuses before any write: a likelihood, impact or detectability that is not a whole number from 1 to 5, and a category outside `CTQ_CATEGORY` (`ctqInputRefusal`). It throws `RbmAssessmentEditError` 422 `RBM_INVALID_FACTOR`; the class's status now admits 422. `derivePlanFromAssessment` is new and exported in the same file. It is the read half of `generatePlanFromAssessment`: the governing-assessment choice, the scoped factor and site reads, the strategy, and the action shapes (`DerivedPlanAction`). It writes nothing, and reports an overall risk that is not recorded as `null`. `generatePlanFromAssessment` now calls it, then makes its open-draft check and inserts from the derived actions. Its queries, their order and its inserts are unchanged; the existing tests pass as they were. `openDraftPlan` is exported. |
| `server/services/rbm/rbm-assessment-seed.ts` | The seed's owned transaction is now `inOwnedRbmTransaction`, and its pool lease is `inOwnedRbmTransactionFromPool`. Both are generic over the work. `seedRbmAssessment` ('owned') and `seedRbmAssessmentFromPool` call them, with the same behaviour. |
| `server/services/ana/AnaToolExecutor.ts` (only the RBM block) | `seedRbmWithDispatchClient` becomes `rbmWriteOnDispatchClient(client, canonicalPool, work)`, the one dispatch-client rule for both writers: lease the canonical pool, or transact on a pinned client as is. **`run_rbm_assessment`:** it reads the highest version (`ORDER BY version DESC, updated_at DESC`), seeds through `rbmWriteOnDispatchClient` + `seedRbmAssessment(…, 'caller-owned')` only when no assessment exists, reads only that version's factors (`assessment_id = $3`), returns `version` and `status`, and shows the hint only when there is no assessment. **`generate_rbm_plan`:** it calls `derivePlanFromAssessment` on the dispatch client and refuses with the route's two messages, held word for word in `RBM_PLAN_REFUSAL` (`code` `no_assessment`, `assessment_not_approved`) and with `overall_risk_unrecorded`. Otherwise it returns the derived strategy, actions, counts and `derivedFrom`, plus `openDraftPlan` and a note when one is open. It saves nothing. **`add_ctq_factor`:** it takes `assessmentId`, or the alias `assessment_id` that admission checks, read by `rbmRecordId` (beside `rbmNum`), and refuses one that is not a positive integer. In one transaction it runs `requireRbmProgram(…, true)`, then chooses the assessment (the named one, else the study's one open draft), then `requireDraftAssessment`, then `addCtqFactor(…, assessmentId)`. It refuses two drafts (`RBM_ASSESSMENT_AMBIGUOUS`, listing `#id (version n)`) and no assessment (`RBM_NO_ASSESSMENT`, naming `run_rbm_assessment` with `seed: true`). A signed-only study gets the amendment rule's own message (`RBM_ASSESSMENT_IMMUTABLE`). A failed write recheck is returned as admission returns it (`rbmAccessFailure`). Any later failure is thrown. |
| `server/services/ana/evidence-literature-tool-defs.ts` (the three entries) | `run_rbm_assessment`: the summary is the latest version with its status, version and own factors, and a draft governs nothing. `generate_rbm_plan`: "Proposes … saves nothing", from the approved RACT, with its refusals. `add_ctq_factor`: the named draft or the study's one open draft, the refusals, and the new optional `assessmentId` input. |
| `server/services/ana/tool-authorization.register.json` | **Unchanged.** Each label is still true. `add_ctq_factor` reads add / "a critical-to-quality factor for the study" / project. `generate_rbm_plan` reads derive / "a proposed monitoring plan" / engine: it is still class `read`, `writes: none`, and it now reaches `rbm-actuator.ts` → `rbm-engine.ts`, which the gate checked (no model). `run_rbm_assessment` reads summarize / "the study risk assessment" / project. |
| Tests | `server/services/ana/__tests__/rbm-handlers.test.ts` is new: the probe's 11 cases plus 13 more. `rbm-actuator.test.ts` gains 8: the 5 input checks, and 3 showing that the derivation is the generator's read half, that a missing risk reads as `null` and not `'medium'`, and the refusals. `rbm-assessment-seed.test.ts` gains 2: the owned transaction rolls back other work and commits on one released lease. |

## Green

After the fix, on the HEAD named in each file's first line plus the uncommitted change. The commits after
`b3c9e4421` touch none of these files.

- `green/handlers.txt`: `rbm-handlers.test.ts`, **24/24**.
- `green/actuator-seed.txt`: `rbm-actuator.test.ts` and `rbm-assessment-seed.test.ts`, **64/64**.
- `green/probe.txt`: the diagnosis probe, unchanged, **11/11**. It was 9 red at `72383e342`.
- `green/existing-suites.txt`: the 8 baseline files plus the new one, **225/225**. Before: 191 in 8 files.
- `green/step-presentation.txt`: `ci:step-presentation` OK (674 in-scope tools, 139 engine claims, none with
  a reachable model call). Its self-test passes 20/20.
- `green/importers.txt`: every test file that imports a changed file, or the tool definitions, admission,
  engine or register they reach. That is 343 files and 5,829 tests: 5,826 pass and 3 fail. None of the 3
  is in code this change touches, and the file records why for each:
  - `generate_stf`: the committed STF generator now refuses the test's `study-report` tag.
  - `start_legacy_import`: the stored status the test expects differs.
  - `tool-record-scope.test.ts`: it calls `get_rbm_attention` with no user, and the unchanged RBM
    admission refuses `RBM_ACTOR_REQUIRED` first.
- ESLint, on the changed files against their HEAD text: `AnaToolExecutor.ts` 94 warnings before and 94
  after; `rbm-actuator.ts` 11 → 10; the new test 0. The warning ratchet does not grow.
- Typecheck: a scoped `tsc` over the changed files and their imports (`green/typecheck.txt`) reports no
  error on a changed line. Its only lines in a changed file are `AnaToolExecutor.ts`'s two existing
  untyped `.js` imports (TS7016, lines 61 and 174). The scoped config leaves out the repo's ambient
  declarations, which is also why it reports errors in untouched files.

## Skeptic review (2026-11-02)

Read at `f0ade0abc`; the commits after `b3c9e4421` touch none of the changed files. The question for each
fix: does AnA now do what the route and actuator do, by calling the same function?

**What held.**
- **Scope.** `git diff -U0 -- server/services/ana/AnaToolExecutor.ts`: every hunk is the RBM import on
  line 2, the dispatch-client helper above `run_rbm_assessment`, the three handlers, or a helper directly
  above one of them (`RBM_PLAN_REFUSAL`, `rbmRecordId`, and the two below). No other handler is touched.
- **(a) is the route's write.** `recheckRbmWrite` is `requireRbmProgram(…, true)` (`rbm-access.ts:106-110`),
  which the handler calls on the transaction; then `requireDraftAssessment` with the same arguments and
  lock (`share`), then the insert. The route writes no audit row of its own for a factor (none in
  `mdx-rbm.ts:350-377`), so the handler omits none. A failed recheck comes back as `rbmAccessFailure`'s
  refusal; a failure after it is thrown, never returned as an empty result.
- **(b) is the route's derivation.** `generatePlanFromAssessment` runs `derivePlanFromAssessment` and then
  its unchanged open-draft check and inserts, in the old order; the AnA proposal is the same object. No
  default remains on the AnA path: no assessment, a draft only, or no recorded overall risk each refuse
  with `error` and `code` and carry no `overallRisk`.
- **(c) reads one version.** The highest version, as `mdx-rbm-board.ts:314-317` chooses it, and only its
  factors, as `GET /rbm-assessments/:id` reads them (`mdx-rbm.ts:239-242`). The seed is the canonical
  `seedRbmAssessment`, with its write recheck inside the transaction (`rbm-assessment-seed.ts:9`).

**What did not hold, now fixed (both in `AnaToolExecutor.ts`, beside the handlers).**
1. **`add_ctq_factor` dropped an unreadable optional input and saved the default in its place.**
   `detectability: "high"` was read as absent and saved as NULL, `category: 5` was saved as
   `operational`, and `isCritical: "yes"` was ignored for the inferred value. Each looked like success.
   The route's schema refuses all three with 422. Now `rbmCtqOptionals` passes an unreadable
   detectability or category to `addCtqFactor` as given, which refuses it (`RBM_INVALID_FACTOR`), and
   refuses a non-boolean `isCritical`; it also holds the `assessmentId` parsing. Case a4c.
2. **`run_rbm_assessment` with `seed: true` on a study that already had an assessment wrote nothing and
   said nothing.** The person had confirmed a seed (the register's rule makes `seed: true` a confirm), and
   the result was an ordinary summary that could be read as the new draft. It now returns `seeded`
   (true only when it wrote) and a `note`: "Nothing was seeded: the study already has a risk assessment
   (version n, status)". The same note says when the returned version is an unsigned draft that governs
   nothing, because the summary's top-level `overallRisk` is that draft's. Cases c1, c2, c2b.

The two notes and the input reading are helpers (`rbmSummaryNote`, `rbmCtqOptionals`) rather than inline,
so neither handler crosses the ESLint complexity limit: `AnaToolExecutor.ts` stays at 94 warnings, as at
HEAD.

**Evidence.**
- `red/skeptic-at-head.txt`: the three suites run against the HEAD text of `AnaToolExecutor.ts`,
  `rbm-actuator.ts` and `rbm-assessment-seed.ts`, swapped in by `method/vitest.swap.config.ts` with the
  working tree untouched: **36 red**, 54 pass. All 26 handler cases are red, including the two seed
  guards, which now also assert `seeded`.
- `red/skeptic-at-fixer-version.txt`: the fix as handed over (only the skeptic's edits undone): a4c, c1,
  c2 and c2b red, the other 22 pass.
- `green/skeptic-suites.txt`: the 9 RBM files, **227/227**.
- `green/skeptic-probe.txt`: the diagnosis probe, **11/11**.
- `green/skeptic-step-presentation.txt`: `ci:step-presentation` OK; its self-test 20/20. The register is
  unchanged and still true: `run_rbm_assessment` gained fields, not a write.
- `green/skeptic-typecheck.txt`: the scoped `tsc`, same method as `green/typecheck.txt`; the only lines in
  a changed file are the two existing TS7016 imports.
- `tool-record-scope.test.ts:105-108` still fails as recorded below. It fails in RBM admission, before any
  handler, and `rbm-access.ts` is unchanged. The swap config cannot load it at HEAD (it imports the
  executor through a `.js` specifier; see the config's note).

**Not changed, and why.** The category default (`operational` when none is given) and the inferred
criticality are the actuator's existing, disclosed behaviour: the definition names both, and the result
returns `inferred`. The route's own INSERT defaults `isCritical` to false; that difference is recorded
under "Outside these files".

## Open after this fix

*Both items below were closed on 2026-11-02. See "Follow-up, 2026-11-02" at the end.*

- **The route's `'medium'` for an unrecorded overall risk.** `POST /rbm-monitoring-plans/generate` still
  derives a strategy from `'medium'` when the approved assessment records no overall risk
  (`generatePlanFromAssessment`, marked `OPEN DEFECT`). To close it, a change that owns `mdx-rbm.ts` must:
  1. give the reason a true message in the route's map (`mdx-rbm.ts`, the `!result.generated` branch);
  2. have `generatePlanFromAssessment` refuse on `recordedOverallRisk === null`.
- **The route's messages are copied.** `generate_rbm_plan` repeats the route's two refusal sentences
  word for word. A change that owns `mdx-rbm.ts` should keep one copy beside `derivePlanFromAssessment`.

## Outside these files (noticed, not changed)

- **Duplicate INSERT.** `POST /rbm-risk-items` (`mdx-rbm.ts:362-369`) has its own INSERT beside
  `addCtqFactor` (`rbm-actuator.ts:100-111`). The route defaults `isCritical` to false (`:347`), while the
  actuator infers it from the band. The route should be converged onto `addCtqFactor`, in a change that
  owns `mdx-rbm.ts`. The input checks are now in `addCtqFactor`, so after convergence the route's Zod
  checks and the actuator's would be the same rule twice. Keep one.
- **Plan-generate messages.** The route's reason-to-message map (`mdx-rbm.ts:1357-1359`) needs the new
  overall-risk reason; see (b) 3 and "Open after this fix".
- **`draftPlan`.** It is behind `draft_monitoring_plan`, a handler outside this task. It infers the strategy
  from the latest assessment in any status (`rbm-actuator.ts:314-325`), the same class of defect as (b).
- **Orphaned factors from the screen.** With no assessment, the RACT screen adds an unattached factor
  (`RbmSurfacesA.tsx:313-317`). The board hides it as soon as an assessment exists
  (`mdx-rbm-board.ts:429`).
- **Seed provenance.** Seeded rows carry no mark that their ratings are untailored library defaults, so a
  signer cannot tell which ratings were reviewed. `metadata` exists on both tables (migration `:33`,
  `:63`).
- **Seed race.** The handler checks "no assessment yet" outside the seed transaction
  (`AnaToolExecutor.ts:3202-3209`), so two concurrent calls can each create a draft. The route's seed does
  not check at all. After this fix the check is still outside the transaction. `add_ctq_factor` refuses a
  study with two drafts and names both, so the race no longer misplaces a factor.
- **Gate gap.** `ENGINE` does not refuse a `conditional` tool (`check-step-presentation.mjs:62`).
- **A red test on RBM admission.** `server/services/ana/__tests__/tool-record-scope.test.ts:105-108` expects
  `get_rbm_attention` with no `userId` to be refused `PROGRAM_NOT_IN_ORGANIZATION`. RBM admission runs first
  (`AnaToolExecutor.ts` `handlerAdmissionRefusal`) and refuses `RBM_ACTOR_REQUIRED`. Neither the order nor
  `rbm-access.ts` is in this change.

## Reproduce

```
npx vitest run --maxWorkers=1 --config docs/evidence/F1/2026-11-01-rbm-handlers/method/vitest.probe.config.ts
npx vitest run --maxWorkers=1 server/services/ana/__tests__/rbm-handlers.test.ts \
  server/services/ana/__tests__/rbm-launch-admission.test.ts \
  server/services/ana/__tests__/tool-authorization.test.ts server/services/ana/__tests__/ana-launch-scope.test.ts \
  server/services/rbm/__tests__/rbm-actuator.test.ts server/services/rbm/__tests__/rbm-assessment-seed.test.ts \
  server/services/rbm/__tests__/rbm-access.test.ts server/services/rbm/__tests__/rbm-engine.test.ts \
  server/routes/__tests__/rbm-assessment-integrity.test.ts
npm run --silent ci:step-presentation
npm run --silent ci:step-presentation:selftest
# red against HEAD's sources, working tree untouched:
before=$(git log -1 --format=%H --diff-filter=A -- docs/evidence/F1/2026-11-01-rbm-handlers/README.md)~1
mkdir -p /tmp/f1-head && for f in server/services/ana/AnaToolExecutor.ts server/services/rbm/rbm-actuator.ts \
  server/services/rbm/rbm-assessment-seed.ts; do git show $before:$f > /tmp/f1-head/$(basename $f); done
F1_SWAP_DIR=/tmp/f1-head F1_INCLUDE=server/services/ana/__tests__/rbm-handlers.test.ts \
  npx vitest run --maxWorkers=1 --config docs/evidence/F1/2026-11-01-rbm-handlers/method/vitest.swap.config.ts
```

## Follow-up, 2026-11-02: the route refuses too, with one copy of each sentence

The coordinating session made this follow-up. Nobody holds `mdx-rbm.ts`, `rbm-actuator.ts` or the RBM
block of `AnaToolExecutor.ts` (`.design/claude-convergence/COORDINATION.md`), so the two open items above
are closed here. The trailers are `Plan: F1` and `Completes: server/services/rbm/rbm-actuator.ts`.

| File | Change |
|---|---|
| `server/services/rbm/rbm-actuator.ts` | `GeneratePlanRefusal` names the four reasons. `RBM_PLAN_REFUSAL` holds one sentence for each, kept beside `derivePlanFromAssessment`. `generatePlanFromAssessment` refuses `overall_risk_unrecorded` when the approved assessment records no overall risk, before the open-draft check and before any write. The `'medium'` fallback and its `OPEN DEFECT` comment are gone. |
| `server/routes/mdx-rbm.ts` | The `!result.generated` branch answers 409 with `RBM_PLAN_REFUSAL[reason]`. It no longer turns an unlisted reason into "No risk assessment exists". A refusal with no reason is thrown, giving a 500, never a wrong sentence. |
| `server/services/ana/AnaToolExecutor.ts` (only `generate_rbm_plan`) | The copied `RBM_PLAN_REFUSAL` is deleted. The handler imports the actuator's map, and its unrecorded-risk error is the actuator's sentence plus "Nothing was saved." |
| `server/services/rbm/__tests__/rbm-actuator.test.ts`, now `rbm-actuator-plan.test.ts` | Two cases. (1) An approved RACT with no overall risk is refused `overall_risk_unrecorded` with no write; the script supplies every row a write would read back, so the old code generates. (2) Every reason has its own non-empty sentence. |
| `server/services/ana/__tests__/tool-record-scope.test.ts` | The real-tool case was stale, not a defect. Since `b602ecad9` (2026-10-30), RBM admission (`rbmToolAdmissionRefusal`) runs before the program check and needs an identified member, so `get_rbm_attention` with no user is refused `RBM_ACTOR_REQUIRED` first. The case now uses a non-RBM read (`list_cmc_registers`) to prove the registry's program check reaches real tools. A new case pins the RBM order, for our program and another tenant's. |

The client caller (`RbmSurfacesB.tsx:519`) shows the server's message in its error state. The new
sentence reaches the person who pressed Generate, with no client change.

**Red, then green.**
- `followup-2026-11-02/red-actuator-at-head.txt`: the new cases against HEAD's `rbm-actuator.ts`, swapped in
  and restored. Both are red: `expected true to be false`, since it generated, and the map does not exist.
- `followup-2026-11-02/red-tool-record-scope-at-head.txt`: the test as at HEAD. It is red with
  `RBM_ACTOR_REQUIRED`, as recorded above.
- The new `list_cmc_registers` case is red with the registry's `foreignProgramRefusal` line commented
  out (`expected undefined to be 'PROGRAM_NOT_IN_ORGANIZATION'`), and green with it restored.
- `followup-2026-11-02/green-suites.txt`: `server/services/rbm/**`, `rbm-handlers.test.ts`,
  `tool-record-scope.test.ts` and the seven RBM route suites. All 17 files pass, 323 tests.
- ESLint warnings are unchanged against each file's HEAD text: `rbm-actuator.ts` 10, `mdx-rbm.ts` 7,
  `AnaToolExecutor.ts` 94. There are no errors.

**The split.** The two cases took `rbm-actuator.test.ts` to 503 counted lines. That is over the
500-line `max-lines` limit, and the pre-push warning ratchet refused it. The file's two plan blocks,
`generatePlanFromAssessment` and `derivePlanFromAssessment`, moved unchanged into
`rbm-actuator-plan.test.ts` in the same folder, with the same scripted mock. The two files hold 57 tests,
the same as before the split. The parent file is back to its one warning (`max-lines-per-function`,
line 34), and the new file has none.

**Still open (task #45, item 3, from "Outside these files"):**
- the route's own factor INSERT beside `addCtqFactor`;
- `draftPlan` reading the latest assessment in any status;
- the RACT screen saving a factor with no assessment;
- seeded rows carry no "untailored default" mark;
- the seed's existence check running outside its transaction.

Each one needs its own red case.
