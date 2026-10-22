# The CMC composition boundary at every entry point (D2, 2026-10-22)

Part of the launch-boundary re-proof (`../`, board row "D2 / D5 — re-proof of
the launch boundary after the catalog changed"). Session `…01E8btkB`.

Decision P-28 put CMC / Module 3 in the launch catalog **with a composition
boundary**: it composes small-molecule Module 3 for a US IND, and refuses a
biologic, a marketing application or a non-US clinical-trial application by
name (`server/services/cmc/composition-scope.ts`). The re-proof asked whether
that boundary holds at every CMC entry point, not only at compose.

It did not. Twelve findings survived three skeptics each (workflow
`wf_bdb3bd90-a37`). Three more were refused as neutral statistics and are not
changed: process capability, the stability trend, dissolution. All twelve are
fixed: nine in the first change, and the three AnA entry points in the second
("The three AnA entry points", below).

## What already exists

Searched: `compositionRefusal`, `CompositionOutOfScopeError`,
`composition-scope`, `resolveProjectRegional`, `SAVEPOINT`, every caller of
`analyzeQbdFromSources` / `runIchComplianceCheck` / `generateControlStrategy` /
`estimateRecordedShelfLife` / `assessRecordedPoolability`, `getModule3BuildStatus`,
`placeModule3IntoSubmission`, `BEGIN READ ONLY`; `git log --diff-filter=D` on
`composition-scope` and `module3-compile` (nothing deleted).

| Exists | Path | What it did | What it did not do |
|---|---|---|---|
| The rule | `server/services/cmc/composition-scope.ts` `compositionRefusal` | Pure verdict over sources, program type and product class; 409 body; AnA relay helpers | Nothing outside compose asked it |
| The one caller | `server/services/cmc/module3-compile.ts` `composeProjectModule3` | Judged the program under a savepoint, threw `CompositionOutOfScopeError` | Its judgment was inline, so nobody else could ask it |
| US-IND predicate | `server/services/cmc/us-ind-regional.ts` `isUsClinicalTrialApplication` | `ind` only | Not asked of a placement target |
| Build board reader | `server/services/module3-convergence-service.ts` `getModule3BuildStatus` | Composed in memory for the board and three AnA commands | Never judged the boundary; passed the bare pool to a savepoint reader |
| Placement | `server/services/cmc/place-module3-into-submission.ts` | Gate → vocabulary `ctd` → cross-project | `ctd` admits NDA/BLA/ANDA/MAA |
| QOS draft | `server/services/ana/cmc-quality-summary-tool.ts` | Composed through compose | Handed compose the bare pool |
| Board UI | `client/src/concept2cure/v2/surfaces/CmcModule3Build.tsx` | Rendered every failed read as "Couldn't load… sign in and retry" | Had no state for a refusal |
| AnA stability tools | `server/services/ana/AnaToolExecutor.ts` `estimate_recorded_shelf_life`, `assess_recorded_batch_poolability` | The same recorded engines as the routes, tenant-scoped, refusing a partial set | Never asked the program the study is filed under |
| AnA CMC interview | `AnaToolExecutor.ts` `start_` / `answer_` / `resume_intelligence_flow`; `server/services/ana/intelligence-questions/flows/cmc-specification.ts` | Asks the molecule type, and has its own biologic branch, which only skips a question | Judged every answer by small-molecule rules whatever the type; the launch-scope check on the flow ran at start only |

Nothing was rebuilt. The judgment was lifted out of compose into one exported
decision, and every entry point now asks that decision.

## What changed

**One decision, three ways to reach it** (`module3-compile.ts`):
`programCompositionRefusal(client, …)` for a caller holding a transaction;
`assessProgramCompositionScope(orgId, projectId)` for one that does not, on its
own pooled connection in a read-only transaction (`inReadOnlyTransaction`);
`admitProgramComposition(…)` for the board, which also needs the regional facts
3.2.R is written from. Compose uses the same internal `judgeProgramComposition`.

| Entry point | Before | Now |
|---|---|---|
| `GET /api/cmc/quality/qbd/:projectId` | Small-molecule CQAs for any program | 409, the boundary's body |
| `POST /api/cmc/ich-compliance` | Q3A(R2) bases for a mAb | 409 |
| `POST /api/cmc/control-strategy` | Q6A defaults for a mAb | 409 |
| `POST /api/cmc/stability-studies/:id/shelf-life` | Q1E-extrapolated shelf life for any study | Judged on the study's own program; a study filed under none is `CMC_MODALITY_NOT_ESTABLISHED` |
| `POST /api/cmc/stability-studies/poolability` | Same | Every study's program judged; any unfiled study refuses |
| `GET /api/cmc/module3-os/build-state/:projectId` | Board scored a mAb on Q3A inputs, counted it "ready to compile" | 409; the board shows the refusal in the server's words (`m3-build-out-of-scope`) |
| AnA `module3_missing_inputs`, `module3_stale_sections`, `module3_refresh_stale` | Small-molecule missing inputs for any program | Relay the refusal |
| AnA `ich_compliance`, `control_strategy` | Engines called directly | Relay the refusal |
| `POST /api/cmc/module3-os/place-into-submission/:projectId` | IND-composed Module 3 placeable into an NDA/BLA of the same program | `refusedBy: 'composition-scope'` for a non-IND target (`applicationRefusal(…, 'submission')`) and for a program outside the boundary, before anything is read or written |
| AnA `estimate_recorded_shelf_life`, `assess_recorded_batch_poolability` | Q1E shelf life and pooling for any study | The routes' own decision, `studiesCompositionRefusal` (`study-composition-scope.ts`; the routes now call it too): each study's program judged, an unfiled study refused. The result tells the assistant not to fall back to the pasted-numbers calculators |
| AnA CMC specification interview (`answer_intelligence_question`) | A monoclonal antibody's answers got "critical" ICH Q3A(R2) and M7 findings and a "ready to proceed with document generation" summary | Before an answer is judged, `interviewCompositionRefusal` (`interview-composition-scope.ts`) asks the molecule type stated, this answer's or an earlier one, and the program the session is bound to. A biologic, a peptide or an oligonucleotide is refused by name (ICH Q3A(R2) and M7 exclude all three by scope); "Other", or any value that is not an option, is not established. The result tells the assistant not to answer the molecule type on the person's behalf |
| `start_intelligence_flow`, `resume_intelligence_flow` | Started and re-presented the interview for any program | Start refuses on a program outside the boundary; resume does not re-present a refused session's small-molecule summary |
| `answer_intelligence_question` with a caller-supplied `flow_state` | Advanced any flow, so a flow start refuses in production (one whose answers reach no record) could be driven by supplying its state | The same launch-scope check as start (`interviewNotInRelease`, one function for both) |

**Two latent defects found on the way, same cause.** Postgres refuses `SAVEPOINT`
outside a transaction block (`ERROR: SAVEPOINT can only be used in transaction
blocks`, checked against `postgres -p 5432`). Two readers handed the savepoint
reader the bare pool:

- the build board's 3.2.R pass threw on the first statement and was skipped on
  every call, so the board never listed the regional section the compile writes
  and the export gate counts (red: `expected [] to deeply equal ['3.2.R.1.US']`);
- AnA's 2.3 Quality Overall Summary: compose threw, and every draft answered
  "The program's CMC data could not be read just now". It has done so since
  `ebde394d7` (2026-10-12).

Their unit tests used hand-written pools that answer any SQL, a savepoint
included, so neither had ever been seen to fail. The new PGlite test runs both
on a real engine.

## Evidence — each check seen failing first

| Check | Red | Green |
|---|---|---|
| Routes: `server/api/cmc/__tests__/composition-boundary-routes.test.ts` | `routes-red.txt`: 10 failed / 12 | `routes-green.txt`: 15 / 15 (with the 503 cases) |
| Readers on a real engine: `server/services/cmc/__tests__/composition-boundary-readers.pglite.test.ts` (trunk's board and QOS tool) | `readers-red.txt`: 5 failed / 7 | `readers-green.txt`: 10 / 10 (with the review's cases) |
| Board UI: `client/src/concept2cure/v2/__tests__/cmcSuiteWrites.test.tsx` | `board-red.txt`: the refusal case fails on trunk's surface | `board-green.txt`: 26 / 26 (with `cmcQualityBoundary.test.tsx`) |
| Placement: `server/services/cmc/__tests__/place-module3-into-submission.test.ts` | `placement-red.txt`: 6 failed / 27 | `placement-green.txt`: 27 / 27 |
| Commands: `server/services/ana-ri/__tests__/quality-engine-commands-composition-boundary.test.ts` | `commands-red.txt`: 2 failed / 4 | `commands-green.txt`: 4 / 4 |
| Static contract: `server/services/cmc/__tests__/composition-boundary-callers.contract.test.ts` (trunk's routes, commands, board, orchestrator and loader) | `callers-contract-red.txt`: 4 failed / 7 | 7 / 7 at the time |
| AnA tools: `server/services/ana/__tests__/cmc-tools-composition-boundary.test.ts` (trunk's `AnaToolExecutor.ts`) | `ana-tools-red.txt`: 21 failed / 24; the 3 that pass are the cases the boundary admits | `ana-tools-green.txt`: 24 / 24, with `composition-scope.test.ts` 31 / 31 |
| A boundary read that throws, in the interview | `ana-interview-unaskable-red.txt`: the error escaped the handler | Refused as a failed read (`CMC_APPLICATION_NOT_READABLE`), the driver text kept in the log |
| Static contract with the interview engine watched (`advanceFlow`, `resumeFlow`) and the two expiring entries removed (trunk's `AnaToolExecutor.ts`) | `callers-contract-ana-red.txt`: 4 failed / 15, one per unwired handler | `callers-contract-green.txt`: 15 / 15 |
| The molecule-type decision, against its own first draft | `molecule-type-first-version-red.txt`: `42`, `{}` and `['small_molecule']` were read as unanswered and admitted; `constructor` and `__proto__` matched an object's prototype and were called biologics | Each is not established; the tables are `Map`s, and the unit test reads the flow's own options and its own biologic branch, so a type added to the flow cannot pass unjudged |
| Every suite that drives these tools or the boundary | — | `ana-affected-suites-green.txt`: 39 files, 651 / 651 |

Existing tests whose mocks predated the boundary were brought to it, without
weakening what they assert: `intelligence-flow-sessions` (its context's project
is a legacy numeric one, which the boundary refuses; the decision is stood in
for, so it still pins the session bookkeeping), `module3-convergence-build-status`,
`module3BuildStateRoutes`, `module3BuildStateReadiness` (the boundary is mocked
to admit; these pin the figures for an admitted program),
`stabilityPoolabilityRoute` (studies carry their program), the two QOS tool
tests (their pools lend a connection), and the placement test's "places
normally" case, which used an NDA and now uses an IND.

## The adversarial review of this change, and what it changed

Workflow `wf_16d9924c-19a` reviewed the uncommitted diff through four lenses:
wiring, transactions, honest state and test validity. I checked each claim
below against the code before acting on it, and each fix was seen failing
first.

| Finding | Fix | Red → green |
|---|---|---|
| **The submission-package orchestrator** (`POST /api/submission-orchestrator/runs`, `/runs/for-program`, both served at launch) composed and signed Module 3 without asking the boundary. A program approved before P-28 passed the export gate, and a run targeting an NDA or MAA carried IND-composed text. | `load-approved-cmc-sources-for-project.ts` asks `assessProgramCompositionScope` once the gate opens. A refusal closes the gate in the boundary's words; an unevaluable boundary is `unknown`. `m3.compose` asks `applicationRefusal(submissionType, 'submission')` before composing. The callers contract now watches the composers too, and records this caller in `ASKED_THROUGH`. | `orchestrator-red.txt` 4 failed → `orchestrator-green.txt` 56/56 |
| The board read sources **unordered**, while compose reads newest first, and the boundary judges the first `drug_substance`. So the board could judge a different substance than compile. | `ORDER BY updated_at DESC`, as `loadCanonicalSources`. | `readers-review-red.txt` |
| A program with **no CMC records yet** was refused at the board ("not established"), which hid the first-run state. | `admitProgramComposition` admits past "not established" when nothing is recorded. The declared class and the application are still judged. | `readers-review-red.txt` (2 red); 10/10 |
| A read that failed (`CMC_APPLICATION_NOT_READABLE`) was answered 409 and shown as a settled verdict with no retry. Its message also quoted the driver's error. | `compositionRefusalStatus`: 503 for a failed read, 409 for a verdict, at every route that answers the boundary's body. The driver text stays in the server log. | `routes-503-red.txt` 3 failed → 15/15 |
| The board titled "modality not recorded yet" as "not composed here". | `useLiveData` now carries the server's error `code` (`dataConnect.tsx`; copy changes, codes do not), and the board titles that case as a record still to make. | `board-review-red.txt` |
| CMC Quality showed the QbD 409 as "The QbD register didn't respond". | A refusal state in the server's words (`cmc-qbd-out-of-scope`). | `quality-red.txt` → `quality-green.txt` |
| The shelf-life and poolability refusals toasted "Couldn't save…", for an assessment that saves nothing. | `cmcAssessmentThrew`. | covered by copy only |
| Placement's wrong-submission-type refusal still advised an NDA or BLA. | Now advises the program's US IND. | copy only |

The test-validity lens found four ways the tests could stay green over a
regression. Each is closed, and each closure was seen failing:

- **The PGlite stand-in pool shared one session with its lent connection**, so
  a reader that held a transaction and handed the pool to the savepoint
  reader would pass here and fail in production. The bare `query` now refuses
  a savepoint, as pg's autocommit connection does. With the QOS tool
  regressed to exactly that, both QOS cases fail
  (`readers-harness-catches-bare-pool.txt`).
- **The callers contract judged files, counting a mention in a comment.** It
  now cuts each file into handlers (a route, a tool registration, a function),
  counts only calls, and requires the boundary inside the same handler. With
  the boundary removed from the control-strategy route alone, that route fails
  while the other four pass (`callers-contract-per-handler-red.txt`); against
  trunk, all nine caller handlers fail (`callers-contract-red.txt`). The
  allowlist names handlers: the two AnaToolExecutor tools expire 2026-10-24,
  and the pre-submission gate's entry checks its own reason against
  `launchScopeApiVerdict`.
- **No test failed if the build-state 409, the placement mapping or the three
  board commands' relays were deleted.** `composition-boundary-module3-os.test.ts`
  makes each fail: 6 red against trunk, then 6/6.
- **Poolability was only tested with one program.** A batch of an admitted
  program pooled with a batch of a refused one is now refused, and judging only
  the first program fails it (`routes-every-program-red.txt`). Routes 16/16.
- The board's verdict is compared with compose's for two substances in both
  orders, on a real engine. Readers: 12/12.

The review's final tally: 16 of 20 findings survived three skeptics, and all
16 are fixed. Two of them were finished after the push of `506d814ae`:

- **The orchestrator composed the marketing application's 3.2.R into every
  US package, an IND's included.** `composeFullModule3` passed no application
  type to `composeRegional`; the compile route always did. It now takes one,
  the orchestrator passes its target's, and the resume re-derivation follows
  the same target rule. Red: the IND package's 3.2.R.1.US was titled
  "Regional Information — United States (FDA)" (`orchestrator-regional-red.txt`);
  green 40/40.
- **A legacy numeric project** reached the boundary as a uuid cast error
  inside the savepoint, answered "could not be read … try again" for as long
  as the project existed. It is now not looked up as a program at all (`/^\d+$/`,
  as `isOtherProject` recognises one) and gets `CMC_PROGRAM_NOT_RECORDED`, a
  settled 409 that names the program to open instead
  (`readers-legacy-red.txt`: `CMC_APPLICATION_NOT_READABLE` before).

## Behaviour a reader should know

- A program with **no drug substance recorded** is refused at the board, as
  compile refuses it: "This program records no drug substance … Record the drug
  substance in the CMC registers". The board used to show it a small-molecule
  skeleton.
- A legacy stability study filed under **no program** is refused a shelf life
  until it is filed. Its first edit from a program files it
  (`register-writes.ts` `projectOnEdit`).
- The placement picker is the shared `filingTarget.tsx`, which Vault and
  Authoring use to place into NDAs legitimately. It still lists a program's NDA.
  Placing Module 3 there now answers "Placement refused" with the boundary's
  reason.
- The CMC interview is **admitted on a program with no drug substance recorded
  yet**, as the board is: the interview is how the substance gets recorded, and
  its own molecule-type answer decides. A program whose recorded substance is a
  biologic, or that files something other than a US IND, is refused at start.
- The interview is **refused on a legacy numeric project** (`CMC_PROGRAM_NOT_RECORDED`),
  as every other boundary caller refuses one. With no project at all, only the
  molecule type is judged.
- A refused answer is not recorded and the session stays where it was, so a
  person who chose the wrong molecule type can answer that question again.
- The interview's commit (`commit_intelligence_flow`) is not gated. It writes
  only what the person stated into the registers, and no answer reaches it once
  the molecule type is refused. Compose judges those records again.

## The three AnA entry points (2026-10-22, second change)

They were held for other lanes' 24-hour windows on
`server/services/ana/AnaToolExecutor.ts`, and those windows kept moving. Three
lanes edited the file in the 24 hours before this change: `…01TzCCfq`
(`862dc0f07`, `64168f8e6`, `1354c0f5f`, the last at 2026-10-22T01:23Z),
`…01KnUGoX` (`d4be3c13f`, 04:57Z) and `…011DpxUy` (`dfe94a300`, 15:11Z). A
boundary gap held open for a moving window stays open, so the file was edited
inside the window and the edit is disclosed on the board. The change touches
only the five handlers named above and adds one helper, `interviewNotInRelease`,
beside `intelligenceProjectId`. No hunk of those commits is in or next to
them: theirs are at `project_knowledge_search`, `load_nonclinical_program`,
`expiryText`, `log_inspection_finding`, `create_qms_document` and the governed
document reads.

## Still open

- `POST /api/orchestration/pre-submission-gate` runs the ICH check. It is
  outside the launch catalog and refused in production, so it is listed in
  `NOT_YET` with that reason, not changed.

## Found, not this lane's (handed on in `docs/work-orders/README.md`)

These fail identically on trunk without this change:

- `server/services/ana-ri/__tests__/context-enrichment-claims-coverage-is-labelled-a-heuristic.pglite.test.ts` (1 failing)
- `server/services/ana-ri/__tests__/reviewer-simulation-run-takes-no-model-supplied-facts.test.ts`: its `db` mock has no `getPool` (4 failing)
- `server/services/ana-ri/__tests__/mdx-esg-transmit-gateway.test.ts`: "AS2 signing/encryption preparation failed" (5 failing; possibly this container's crypto, not verified)
