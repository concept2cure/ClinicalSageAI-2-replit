# The five RBM items left "outside these files": diagnosis, red, fix, green

Date: 2026-11-02. Branch `concept2cure-v2`. Package: F1 (repairs to shipped behaviour).
Suggested trailers: `Plan: F1`, `Completes: server/services/rbm/rbm-actuator.ts`.

**Status: fixed in the working tree, all suites green, not committed.** A review then found one defect in the
seed mark (item 4): the RACT form's edit cleared it with the ratings unchanged. That is fixed too (see "Review").
The work started on `d38c88745`.
HEAD moved to `b391bfad2` during it. That commit changes focus-ring CSS only and touches no RBM file. Each
red result was run with the source under test as it stood before that item's change. Items 1 and 2 ran
against the HEAD text. For three items the same source file already held the earlier items' changes; the
code path each red case exercises is the item's own, so each red is still that item's.
*(Wording corrected by the coordinating session after review, 2026-11-02.)*

These are the five items the F1 handler repair left open
(`docs/evidence/F1/2026-11-01-rbm-handlers/README.md`, "Outside these files" and "Follow-up, 2026-11-02",
"Still open"):

| Key | Item | Result |
|---|---|---|
| `route-factor-insert` | `POST /rbm-risk-items` had its own INSERT beside `addCtqFactor`, and the two stored different rows | Fixed |
| `draftplan-any-status` | `draftPlan` inferred a strategy from the latest assessment in any status, and guessed `'risk_based'` with none | Fixed |
| `ract-factor-no-assessment` | The RACT screen saved a factor with no assessment, and the route accepted it | Fixed on the server. The screen change is tested in jsdom and **not yet opened in the running app** (RULE 4), so the screen is not done |
| `seed-untailored-mark` | Seeded factors carried no mark that their ratings are untailored library defaults | Fixed in storage, amendment and edit. Not shown on screen (see "Not fixed") |
| `seed-check-outside-tx` | The "no assessment yet" check ran outside the seed transaction; the route had no check | Fixed |

This folder holds:
- this README;
- `before-suites.txt`: the suites at HEAD before any change (19 files, 356 tests, all pass);
- `red-<key>.txt`: each item's new tests, run against the HEAD text of the source they test;
- `red-review-mark-unchanged-rating.txt`: the review finding's new cases, red against the first-pass fix, and
  the mutation that shows the guard cases catch the opposite error;
- `green-suites.txt`: every RBM suite after all five fixes and the review fix (25 files, 419 tests, all pass);
- `eslint.txt`: the warning count of each changed file, at HEAD and after.

## What already exists

Taken from the five diagnoses. Line numbers are as at HEAD (`d38c88745`/`b391bfad2`, same text for these files).

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| `addCtqFactor` | `server/services/rbm/rbm-actuator.ts:121-137` | The one factor insert AnA's `add_ctq_factor` uses. Infers the score and band, defaults `isCritical` from the band, refuses bad ratings or category with 422 `RBM_INVALID_FACTOR`. | No `ref_code`, `status` (hardcoded `'open'`) or `assigned_to`. Not called by the route. |
| `RbmAssessmentEditError`, `requireDraftAssessment` | `rbm-actuator.ts:69-84` | 404/409/422 refusals; the draft rule under a lock. | — |
| `POST /api/mdx/rbm-risk-items` | `server/routes/mdx-rbm.ts:328-377` | Zod body; one transaction; `requireDraftAssessment` only when an `assessmentId` was given; its own 15-column INSERT with `isCritical ?? false` (`createItemValues`, :344-348). | Did not call `addCtqFactor`. Accepted a factor with no assessment. |
| Route lists | `mdx-rbm.ts:115-117` | `SCALE_1_5`, `CATEGORY`, `ITEM_STATUS`. | `CATEGORY` was a second copy of the actuator's `CTQ_CATEGORY`. |
| `PATCH /rbm-risk-items/:id` | `mdx-rbm.ts:391-433` | Recomputes `risk_score` when likelihood and impact are both sent. Applies the draft rule to attached factors only. | Never touched `metadata`. |
| `draftPlan` | `rbm-actuator.ts:327-372` | Behind AnA's `draft_monitoring_plan` (its only caller). Read the newest assessment by `updated_at` in any status; `'risk_based'` when none. Bound `input.assessmentId` as given. | Did not use the active-first choice or refuse an unsigned basis. |
| `derivePlanFromAssessment`, `generatePlanFromAssessment`, `RBM_PLAN_REFUSAL` | `rbm-actuator.ts:476-489`, `:535-604`, `:636-700` | The canonical, strict choice of a plan's basis: active first, refuse `no_assessment`, `assessment_not_approved`, `overall_risk_unrecorded`. One sentence per reason. | — |
| `amendAssessment` | `rbm-actuator.ts:405-470` | Opens a new draft version and copies every factor with an explicit column list. | Did not copy `metadata`. |
| Seed service | `server/services/rbm/rbm-assessment-seed.ts:8-53` | One body (`writeSeed`) for every path: write recheck, then the draft assessment and the eight library factors. Explicit transaction ownership. | No existence check, no lock, no metadata on the factors. |
| `POST /api/mdx/rbm-assessments/seed` | `mdx-rbm.ts:209-226` | Calls `seedRbmAssessment(..., 'owned')`. No client caller. | No existence check; any error was a 500. |
| AnA `run_rbm_assessment` | `server/services/ana/AnaToolExecutor.ts:3202-3262` | Checks for an assessment on the pool, outside the seed transaction, then seeds. `rbmSummaryNote` already says "Nothing was seeded: …". | Outside this task's files. |
| AnA `add_ctq_factor` | `AnaToolExecutor.ts:3578-3640` | Refuses a factor with no assessment (`RBM_NO_ASSESSMENT`). | Outside this task's files. |
| The library and its mark elsewhere | `server/services/rbm/rbm-engine.ts:193-289`; `server/services/study-design/ctq-derivation.ts:60-61`, `:122-131` | `DEFAULT_CTQ_FACTORS`. ctq-derivation marks the same ratings `ratingSource: 'default_seed'`, `ratingFrom: { table: 'DEFAULT_CTQ_FACTORS', ctqFactor }`. | The RBM seed wrote no such mark. |
| `metadata` columns | `migrations/20260629_rbm_surfaces.sql:33`, `:63`, `:88`, `:109` | `JSONB DEFAULT '{}'` on assessments, items, KRIs, QTLs. Item metadata is part of the signed content (`server/services/rbm/rbm-signature-content.ts:32-36`). | — |
| RACT screen | `client/src/concept2cure/v2/surfaces/RbmSurfacesA.tsx:230-440` | Add button enabled unless the assessment is approved; posted `assessmentId: board.assessment?.id ?? null`. Note promised "create and approve a framework version to govern it". | Did not stop the write with no assessment. The note's promise was untrue. |
| Board read model | `server/routes/mdx-rbm-board.ts:424-476` | Shows the highest version's factors, or every factor when the study has no assessment. Drops `metadata` when it shapes rows. | Outside this task's files. |
| Tests | `server/routes/__tests__/rbm-assessment-integrity.test.ts` (real SQL on PGlite through the router), `server/services/rbm/__tests__/rbm-actuator.test.ts` (497 lines, at its 500-line limit), `rbm-actuator-plan.test.ts`, `rbm-assessment-seed.test.ts` (PGlite), `server/services/ana/__tests__/rbm-handlers.test.ts`, `client/src/concept2cure/v2/__tests__/rbmSurfaceWrites.test.tsx` | — | — |

Searches the diagnoses ran: `addCtqFactor`, `draftPlan`, `draft_monitoring_plan`, `seedRbmAssessment`,
`/rbm-risk-items`, `/rbm-assessments/seed`, `/rbm-monitoring-plans`, `metadata`, `default_seed`,
`ratingSource`, `untailored`, `pg_advisory_xact_lock`, across `server`, `client/src`, `shared` and `scripts`; every
INSERT and UPDATE on the four RBM tables; the RBM migrations. Nothing calls `draftPlan` except the AnA
handler. Nothing reads item `metadata` except the signed content.

**Deleted history (RULE 3, step 2).** Run by the coordinating session:
`git log --all --diff-filter=D -- 'server/services/rbm/*' 'server/routes/mdx-rbm*' 'client/src/concept2cure/v2/surfaces/Rbm*' 'client/src/concept2cure/v2/surfaces/rbm*' 'server/services/*rbm*' 'client/src/concept2cure/**/*Ract*'`.
It finds three files:
- `RbmAnalytics.tsx` and `RbmKit.tsx`, deleted in `2895218b8` (2026-08-04, the one-shell cleanup);
- `RbmOperations.tsx`, deleted in `15da8159e` (2026-07-26, when every RBM action became a persisted write).

None of the three held a factor insert, a seed, a plan derivation or an assessment rule. `RbmKit.tsx` was
display primitives (matrix, sparkline, gauges, an empty state). Nothing deleted is being rebuilt here.

## 1. `route-factor-insert`: the route saves through `addCtqFactor`

**Defect.** Two INSERTs for one mutation. Given the same body with `isCritical` left out (L5 × I4, score 20),
the route stored `is_critical: false` and the actuator stored `true`. A score-20 factor saved non-critical is
left out of every reader of `is_critical`. The shipped form always sends `isCritical`, so only a direct API
caller reached the wrong value. The duplicate INSERT is the structural defect.

**Red** (`red-route-factor-insert.txt`). 4 red, 1 guard green:
- route, "infers criticality from the band when isCritical is omitted": the stored row did not match `{ is_critical: true }`;
- route, "calls addCtqFactor once": `expected "vi.fn()" to be called once, but got 0 times`;
- actuator, "refuses status "pending"": `promise resolved … instead of rejecting`;
- actuator, "stores the ref code, status and owner it is given": the INSERT args held no `'CTQ-9'`, `'mitigating'`, `3`;
- guard, green before and after: "keeps the status, owner and ref code the RACT form posts". A naive
  convergence onto the old `addCtqFactor` would have turned it red.

**Change.**
- `rbm-actuator.ts`:
  - `CTQ_CATEGORY` is exported, and `CTQ_ITEM_STATUS` moves here from the route (:43-44), so each list has one copy.
  - `AddCtqInput` gains `refCode`, `status` and `assignedTo`.
  - The input check refuses a status outside the list (`notOneOf`, :109).
  - `addCtqFactor` (:143) writes `ref_code`, `status` (default `'open'`) and `assigned_to`. `organization_id` stays `$1` and `assessment_id` `$2` (`ctqRowValues`, :128).
- `mdx-rbm.ts` `POST /rbm-risk-items` (:350):
  - `createItemValues`, the score call and the inline INSERT are deleted, and the route calls `addCtqFactor` inside its transaction.
  - The Zod body stays as the HTTP contract and its 422 shape.
  - Status codes and the response row are unchanged. The only behaviour that changes is the one that was wrong: an omitted `isCritical` now follows the band.
- To make room, the three existing `draftPlan` cases moved from `rbm-actuator.test.ts` (497 lines) to
  `rbm-actuator-plan.test.ts`, where item 2 updates them.

## 2. `draftplan-any-status`: `draftPlan` infers only from the approved RACT

**Defect.** `draftPlan` took the newest assessment by `updated_at`, in any status. It ignored a named
`assessmentId` when inferring, and saved `'risk_based'` when there was no assessment. Approval stamps the
approved and the archived row with one `updated_at`, so the archived row could win. The plan approval never
checks the basis, and `draftPlan` records no author, so an AnA-drafted plan resting on an unsigned draft could
be signed by the person who asked for it.

**Red** (`red-draftplan-any-status.txt`). 5 red, 1 guard green:
- unsigned draft RACT: `expected { id: 99, strategy: 'hybrid' } to be null`;
- governing version: `expected 'SELECT overall_risk FROM rbm_risk_ass…' to match /\(status = 'active'\) DESC/`;
- no assessment, unrecorded overall risk, and a named non-governing assessment: each saved a plan instead of refusing;
- guard, green before and after: with a strategy given, no assessment is read and the shell is drafted.

**Change**, all in `rbm-actuator.ts`.
- `governingPlanBasis` (:613) is the one reader of a plan's basis. It is moved out of
  `derivePlanFromAssessment`, which now calls it with unchanged behaviour.
- `draftPlan` (:406), through `draftPlanBasis` (:373), works like this when no strategy is given:
  - it refuses `no_assessment`, `assessment_not_approved` or `overall_risk_unrecorded` with `RBM_PLAN_REFUSAL`'s own sentence, before any write;
  - it refuses `assessment_not_governing` when the named assessment is not the approved one;
  - otherwise it binds the plan to the approved assessment, and `inferred` now names `fromAssessment: { id, version }`.
- With a strategy given, nothing changes. The AnA handler spreads the result, and `refused` with `message`
  already presents as a refusal (`tool-trace.ts`), so no handler change is needed.
- The three moved cases now script an approved assessment. The old "falls back to risk_based" case is
  replaced by the `no_assessment` refusal.

## 3. `ract-factor-no-assessment`: a factor must name its assessment

**Defect.** With no assessment, the RACT screen's Add button was enabled and posted `assessmentId: null`. The
route skipped the draft rule and stored an unattached factor. That factor is on no assessment page and in no
signed content, an amendment does not copy it, and the screen hides it once any assessment exists. AnA's
`add_ctq_factor` already refused the same act.

**Red** (`red-ract-factor-no-assessment.txt`). 3 red:
- route, assessment omitted and assessment null: `expected 201 to be 422`;
- screen, no assessment: `expected <button class="rbm-add">…</button> to have property "disabled" with value true`.

**Change.**
- `mdx-rbm.ts` `POST /rbm-risk-items` (:350):
  - With no `assessmentId`, the route answers 422 `RBM_ASSESSMENT_REQUIRED` before any connection, so nothing is written and no lock is taken.
  - The answer is "A critical-to-quality factor must belong to a risk assessment, and none was named. Start the study's risk assessment first, then add the factor to it. Nothing was saved."
  - The draft rule now runs unconditionally.
- `RbmSurfacesA.tsx`:
  - `factorAddRefusal` (:232) gives the reason Add is unavailable: no assessment, or an approved one. The button uses it for `disabled` and its title, so `RbmRact`'s complexity is unchanged at 29.
  - `saveItem` posts `assessmentId: asmt!.id` (:327).
  - The no-assessment note (:385) no longer promises that a new version will govern the listed factors. It now says: "This study has no risk assessment yet. A critical-to-quality factor must belong to one, so start the assessment first: ask AnA to seed a default ICH E6(R3) assessment for this study. Any factors listed below belong to no assessment, and a new assessment does not include them."

## 4. `seed-untailored-mark`: seeded ratings say they are library defaults

**Defect.** A seeded factor was identical, column for column, to a hand-entered one. After approval, a
library RACT governs plan generation and the risk review and reads as study-specific. The same ratings are
marked on the ctq-derivation path. An amendment's copy omitted `metadata`, so even a mark would have been lost.

**Red** (`red-seed-untailored-mark.txt`). 3 red:
- seed: every seeded factor's `metadata` was `{}` (`expected {} to deeply equal { ratingSource: 'default_seed', … }`);
- route PATCH: after `{ likelihood: 2, impact: 2 }` the mark was still there (factor 22 already stood at 2 × 2, so this case was not a re-rating; the review replaced it, see "Review");
- amendment: the copied factor's metadata was `{}`, not the mark.

The two test tables gained the `metadata` column the real table has (migration `:63`), as fixtures, not migrations.

**Change**, with no migration: the mark goes into the existing `metadata` jsonb, in ctq-derivation's vocabulary.
- `rbm-engine.ts`:
  - `defaultCtqSeedMark(ctqFactor)` returns `{ ratingSource: 'default_seed', ratingFrom: { table: 'DEFAULT_CTQ_FACTORS', ctqFactor } }`.
  - `DEFAULT_SEED_MARK_KEYS` names its two keys (:261-262).
- `rbm-assessment-seed.ts` `writeSeed` writes the mark on each factor (:33). This one body serves the HTTP seed and AnA's seed.
- `mdx-rbm.ts` PATCH (:420):
  - The score recompute moved into `deriveItemPatch` (:401), which also removes the two keys when a saved likelihood or impact differs from the stored one.
  - An edit of mitigation or status alone keeps the mark, including from the RACT form, which always sends both ratings. The first pass checked presence, not change, and broke this (see "Review").
- `rbm-actuator.ts` `amendAssessment` copies `metadata` (:522, :526).
- The mark reaches the signed content with no recipe change, because `rbm-signature-content.ts` already selects item `metadata`. Approved items cannot be patched, so existing signatures re-derive identically.

## 5. `seed-check-outside-tx`: one seed per study, checked under a lock

**Defect.**
- AnA checked for an assessment on the pool, outside the seed transaction, and on the realtime path on a different connection from the write.
- The HTTP seed route did not check at all.
- Inside the transaction, the write recheck takes only `FOR SHARE`, which two transactions can hold together.
- No unique index exists. Two seeds left two draft v1 rows, and `add_ctq_factor` then refused the study as ambiguous.

**Red** (`red-seed-check-outside-tx.txt`). 4 red:
- a second seed of the same study resolved instead of rejecting;
- a seed of a study with an active v2 wrote a draft v1 beside it;
- the statement order was `BEGIN`, write recheck, INSERT, with no lock and no read (`expected [ false, false, true ] to deeply equal [ true, true, true ]`);
- route: `expected 201 to be 409`.

**Change.**
- `rbm-assessment-seed.ts` `refuseExistingAssessment` (:15), called by `writeSeed` after the write recheck and before the INSERT:
  - It takes `pg_advisory_xact_lock(hashtext('rbm_risk_assessment_seed:' || org || ':' || program::uuid))`, held to COMMIT or ROLLBACK.
  - Then it reads the latest version.
  - If one exists, it throws `RbmAssessmentEditError(409, 'RBM_ASSESSMENT_EXISTS', 'Nothing was seeded: the study already has a risk assessment (version N, status).')`.
  - Under READ COMMITTED, a waiting seed's read takes a new snapshot after the winner commits, so it sees the row and refuses.
  - This covers the route, AnA on a pool lease, and AnA on the request client, whether the transaction is `owned` or `caller-owned`.
- `mdx-rbm.ts` seed route (:215) maps the error to `clientError(status, message, { code })`, as the other RBM routes do. It answers 409, not 500.

## Green

`green-suites.txt`: 25 files, 419 tests, all pass. The suites are:
- `server/services/rbm/**`;
- `rbm-handlers.test.ts`;
- `tool-record-scope.test.ts`;
- the seven RBM route suites;
- the six RBM client suites and `anaContextDeclaresItsCaps.test.tsx`, which reads `RbmSurfacesA.tsx`.

Run on the same set as `before-suites.txt`, the suites give 19 files and 381 tests, all passing. That is
356 + 21 new cases − 1 removed (the old `'risk_based'` fallback case), then + 6 − 1 from the review (see
"Review"). The additional client files account for the rest of the 419.

Other checks:
- **ESLint** (`eslint.txt`). Every changed file has the same warning count as at HEAD:
  - `rbm-actuator.ts` 10, `mdx-rbm.ts` 7, `RbmSurfacesA.tsx` 3, `rbm-engine.ts` 1, `rbm-assessment-seed.ts` 0;
  - the test files: 1, 0, 0, 0, 2.
  - No error. No new function crosses the complexity limit, and the three already over it keep their values.
- **Type check.** A `tsc --noEmit` over the changed files and their imports reports nothing in any RBM file. The remaining errors are in files this change does not touch.
- **Gates.** `ci:step-presentation`, `check:microcopy`, `ci:one-product`, `ci:migration-drop-safety` and `check-action-overclaim` all pass.
- **RULE 6.** No table, migration, route mount, screen or AnA tool was added.

## Not fixed, and why

Outside this task's files, so reported rather than changed:
- **The mark is not shown on screen.** `server/routes/mdx-rbm-board.ts` drops `metadata` when it shapes items (:432-447). It is outside the assigned files.
  - With it, `RbmBoardItem` (`rbmBoard.ts`) could carry `untailored`, and the register row could show a quiet "library default" tag.
  - The approval dialog could also say how many factors still carry library ratings.
  - Until then, the mark is stored, carried by amendment, cleared by re-rating and signed, but not visible.
- **AnA's seed after a lost race.** `AnaToolExecutor.ts:3244-3247` (`run_rbm_assessment`) should catch `RBM_ASSESSMENT_EXISTS`, leave `seeded: false` and re-read.
  - Its `rbmSummaryNote` already says "Nothing was seeded…".
  - Today, a call that loses the race fails closed as a tool failure, and nothing is duplicated.
  - The sentence is also written twice (the seed's refusal and `rbmSummaryNote`). That handler change would remove the second copy.
- **`draft_monitoring_plan`'s definition** (`evidence-literature-tool-defs.ts:834-836`) should say "the study's approved risk assessment; refuses without one unless a strategy is given".

Each needs its own red case, and none is part of these five items:
- **KRI and QTL library seeds** (`POST /rbm-kris/seed`, `POST /rbm-qtls/seed`, `mdx-rbm.ts`). They write no "library default" mark either.
  - They also have no existence check and no transaction, use the global pool, never call `recheckRbmWrite`, and append another full library on each call.
  - They have no client caller and no AnA handler.
  - Marking them before those defects are fixed, or the routes are retired, would polish an unsafe path.
- **Plans have no author.** `draftPlan` and `POST /rbm-monitoring-plans/generate` record no `created_by`, so the two-person rule on plan approval is skipped (`mdx-rbm.ts` plan approval).
- **`POST /rbm-monitoring-plans`** has its own INSERT beside `draftPlan` and no client caller.
- **`draftPlan` with an explicit strategy** binds any named `assessmentId` whatever its status. With no `programId` and no strategy it still drafts `'risk_based'`. That path is unreachable from AnA, whose handler requires a `programId`.
- **`draft_monitoring_plan`** writes through `getPool()` with no transaction and no write recheck.
- **PATCH** recomputes `risk_score` only when likelihood and impact are both sent, and never re-derives `is_critical`. The client holds a third copy of the band rule (`RbmSurfacesA.tsx`, `likelihood * impact >= 15`).
- **Unattached factors already on file** stay as they are.
  - They are still counted by `risk-report-data.ts`, `/rbm-summary` and the AnA worklist.
  - They can still be edited through PATCH without the draft rule.
  - Adopting or retiring them is a data or founder decision.
  - `assessment_id NOT NULL` would be a column change, so a migration, out of scope, and it would fail on those rows.
- **`POST /rbm-assessments`** (hand-create) can still add a second draft.
- **The seeded `overall_risk`** is the library roll-up and is never recomputed when factors are re-rated.

Not done here:
- **The true two-connection race** was not run on real Postgres. A throwaway Postgres 16 could not use this
  session's scratch directory: its parent is closed to the `postgres` user, and this session did not change
  its permissions. PGlite, which the suites use, has one connection. The ordering case shows the lock is taken
  before the read and the read before the INSERT, inside the transaction. The serialization itself is
  Postgres's advisory-lock behaviour. The diagnosis's optional `*.dbtest.ts` would prove it with `npm run test:db`.
- **The RACT screen change was not opened in the running app.** It is tested in jsdom
  (`rbmSurfaceWrites.test.tsx`) only. RULE 4 asks for a running-app check before the screen is called done.

## Review, 2026-11-02

Two findings, one defect. Both describe the same fault from either end.

| # | Finding | Verdict | Result |
|---|---|---|---|
| 1 | `mdx-rbm.ts` `deriveItemPatch` cleared the seed mark when a rating was present in the body, not when it changed | Real | Fixed |
| 2 | `RbmSurfacesA.tsx` `saveItem` sends both ratings on every edit, so the screen cleared the mark on a mitigation or status edit | Real, the same defect | Fixed on the server; the screen is unchanged |

**Verified.**
- `RbmRact.saveItem` (`RbmSurfacesA.tsx:291`) always puts `likelihood` and `impact` in the body (:298-302) and PATCHes it on an edit (:321).
- The edit form fills both from the stored row: `l: String(edit.item.l), i: String(edit.item.i)` (:427).
- It is the only client caller of `PATCH /rbm-risk-items` (grep `rbm-risk-items` over `client/src`: `RbmSurfacesA.tsx:321` and `:324`, and the path map in `rbmWrites.tsx:26`).
- The first-pass `deriveItemPatch` removed the mark when either key was present. So a status-only edit of a seeded factor removed it. The same happened to a factor an amendment carried forward. The library ratings then read as assessed, and the signed content lost the mark (`rbm-signature-content.ts:32-36` selects item `metadata`).
- The first-pass test proved "kept" with `{ mitigation }`, a body no client sends. It proved "cleared" by sending factor 22's stored 2 × 2, which is not a re-rating.

**Red** (`red-review-mark-unchanged-rating.txt`, first section). 2 red against the first-pass working tree:
- "is kept by an edit of the RACT form, status changed and ratings as stored": `expected {} to deeply equal { ratingSource: 'default_seed', … }`;
- "is kept by an edit of the RACT form, mitigation changed and ratings as stored": the same.

The `{ mitigation }` case and the three "is cleared" cases were green.

**Change.**
- `mdx-rbm.ts` `deriveItemPatch` (:401):
  - For each rating in the body, it binds the value and tests `<column> IS DISTINCT FROM $n::integer`.
  - The SET becomes `metadata = CASE WHEN <any rating differs> THEN <mark removed> ELSE metadata END`.
  - The right-hand side of SET reads the row as it was before the UPDATE. So the comparison is against the stored rating, inside the same UPDATE, after the `FOR UPDATE` read the handler already takes.
  - The rule is the server's, so a direct API caller gets it too.
- `RbmSurfacesA.tsx` is not changed. Its test (`rbmSurfaceWrites.test.tsx`, "omits fields it cannot show when editing") now also pins that the edit PATCH carries the stored ratings (3 and 5), the premise the route relies on.
- `rbm-engine.ts`: the `DEFAULT_SEED_MARK_KEYS` comment now says the mark is removed "when a saved likelihood or impact differs from the stored one".
- `rbm-assessment-integrity.test.ts`: the first-pass case is replaced by six. The RACT body is the one `saveItem` builds for factor 22.
  - kept by `{ mitigation }`;
  - kept by the RACT form's body with the status changed, ratings as stored;
  - kept by the RACT form's body with the mitigation changed, ratings as stored;
  - cleared by the RACT form's body with a new likelihood;
  - cleared by the RACT form's body with a new impact;
  - cleared by `{ impact }` alone.

**The check made to fail** (same file, second section). With the CASE's clear branch replaced by `THEN metadata`,
the three "is cleared" cases go red and the three "kept" cases stay green. The guard therefore also catches the
opposite error, a mark that never clears. The file was restored after the run.

**Green.**
- `green-suites.txt`: 25 files, 419 tests, all pass.
- ESLint (`eslint.txt`, last section): no count changed.
- Type check of `mdx-rbm.ts`, `rbm-engine.ts` and the integrity test with their imports: no error in any RBM file.
  The 14 reported errors are in files this change does not touch (`server/db/requestDbLease.ts`,
  `server/services/mfaService.ts` and others). A full-project `tsc` runs out of memory in this session.

**What this does not settle.**
- A person who reviews a library rating and agrees with it cannot clear the mark on this form. Saving the same
  values leaves it, because the form has no "rating reviewed, kept" act. Whether one is wanted is a product
  decision. It would change the RACT screen, so it is not made here.
- The mark is still not shown on screen (see "Not fixed"). The person editing cannot see that a rating they
  left alone is still a library default.

## Coordinator's notes, 2026-11-02

- **Both input checks stay, on purpose.** The predecessor README said to "keep one" of the route's Zod body
  and `addCtqFactor`'s `ctqInputRefusal`. Both remain. Zod is the HTTP contract: types, lengths, UUID, and
  its 422 `Invalid body` shape with field errors. `ctqInputRefusal` is the rule AnA reaches. The category
  and status lists now exist once, exported from the actuator, so the two checks cannot drift on what they
  admit. The 1–5 integer rule is still written twice. Folding it into one exported constant is left for
  the next change to either file.
- **The JSDoc.** `derivePlanFromAssessment`'s doc comment was separated from its function when
  `governingPlanBasis` was extracted, and is now back above it. `governingPlanBasis`'s comment now matches
  its query: the approved version is chosen ahead of any newer draft, and a study with no approved version
  has no basis.

## Reproduce

```
npx vitest run server/services/rbm server/services/ana/__tests__/rbm-handlers.test.ts \
  server/services/ana/__tests__/tool-record-scope.test.ts \
  $(ls server/routes/__tests__ | grep -i rbm | sed 's#^#server/routes/__tests__/#') \
  $(ls client/src/concept2cure/v2/__tests__ | grep -E '^rbm' | sed 's#^#client/src/concept2cure/v2/__tests__/#') \
  client/src/concept2cure/v2/__tests__/anaContextDeclaresItsCaps.test.tsx
# red: put the HEAD text of the source back (git show HEAD:<file> > <file>), keep the tests, run the
# suite named in each red-<key>.txt header, then restore the working copy.
```
