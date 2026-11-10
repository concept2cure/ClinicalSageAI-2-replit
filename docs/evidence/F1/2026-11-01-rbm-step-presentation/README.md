# The 20 RBM AnA tools get their step presentation (ci:step-presentation)

Date: 2026-11-01. Branch `concept2cure-v2`, base `42cf8c4ca`. A second, adversarial review re-read every
handler and corrected three objects before commit; see "Skeptic review" below.

**What this fixes.** Commit `b602ecad9` (2026-10-30, "Reach risk-based monitoring from the rail and project
setup") moved the 20 risk-based monitoring tools from `hiddenApp` to `inScope` in
`server/services/ana/ana-launch-scope.inventory.json`. It did not give them register `present` blocks. So
`npm run ci:step-presentation` failed with 20 MISSING findings, and every RBM step AnA took read "Running a
step" / "Ran a step".

**What changed.** The only file edited is `server/services/ana/tool-authorization.register.json`. Each of
the 20 entries gained a `present` block, and nothing else in the file changed. A script checked this
against `HEAD`: 20 entries differ, and each one differs only by the `present` key. The file
round-trips byte-for-byte through `JSON.stringify(…, null, 1)`, so its formatting is unchanged. No tool,
handler, verb, source or preview field was added (RULE 6).

## What already exists

| Piece | Path | What it does today | What it does not do |
|---|---|---|---|
| The register | `server/services/ana/tool-authorization.register.json` | Holds one entry per tool: its `class`, what it `writes`, its `site`, and `refusedBy`. Since S3 it also holds `present`. The 20 RBM entries are at lines 60, 576, 588, 1552, 2611, 2785, 3398, 3496, 3867, 3877, 4176, 5399, 5499, 5701, 6356, 6416, 6494, 7108, 7359 and 7405. | Before this change, the 20 RBM entries had no `present` block. |
| The gate | `scripts/ci/check-step-presentation.mjs`. Self-test: `check-step-presentation.selftest.mjs`. | Refuses an in-scope tool that has no `present` block (MISSING). Refuses a verb, source or preview outside the closed tables (VERB, SOURCE, PREVIEW). Refuses an object that is empty, too long or tool-like (OBJECT). Refuses a handler-refused tool whose verb is not explain or check (REFUSAL). Refuses an `engine` claim on a tool of a writing class, or on a tool whose handler can reach a model (ENGINE). | It does not refuse an `engine` claim on a `conditional` tool that writes in one mode. See the gap below. |
| The closed tables | `shared/ana/step-verbs.ts`: `STEP_VERBS` at :25, `STEP_SOURCES` at :92, `STEP_PREVIEW_FIELDS` at :125 | Hold the verbs in both tenses, the sources a step can act on, and the input fields a step may preview. | — |
| The label builder | `server/services/ana/step-presentation.ts` `presentStep` at :289. It reads `stepPresentationOf` (`tool-authorization.ts:81`). | Builds the label from verb + object, in the doing form while a step runs and the done form only on success. It builds the preview from the allow-listed fields only. | — |
| Design | `docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md` §2.3 (line 135) | Says the register holds presentation and that `engine` is an explicit claim for each tool. | — |
| The 20 definitions | `server/services/ana/evidence-literature-tool-defs.ts`, lines 553–897 | Define the input schemas. `title` is the only allow-listed field they carry: on `raise_monitoring_signal` and `draft_monitoring_plan`. | — |
| The 20 handlers | `server/services/ana/AnaToolExecutor.ts`, lines 3189–3733 | Each calls `registerToolHandler('<tool>', …)` with a literal name, so the gate's handler search finds all 20. | — |
| RBM services the handlers call | `server/services/rbm/`: `rbm-actuator.ts` (the writes), `site-risk-engine.ts`, `central-statistical-monitoring.ts`, `risk-report.ts`, `risk-report-data.ts`, `rbm-engine.ts`, `rbm-assessment-seed.ts` | The gate's own `makeModelReach` was run on each file, and none reaches a model (`server/db.ts` does not either). `AnaToolExecutor.ts` as a whole file does reach one, but the gate checks each handler's own identifiers and imports, not the whole file. | — |
| RBM tool access | `server/services/rbm/rbm-access.ts:13` `RBM_TOOL_NAMES` | Lists the same 20 names. | — |
| Precedents followed | Register entries `approve_qms_document` and `retire_qms_document` (explain, "how to approve / retire …"); `create_risk_item` (add, project); `log_study_ae` and `log_study_deviation` (record, project); `screen_signal_panel` and `scan_regulatory_deficiencies` (screen or scan, engine); `compose_510k_summary` (assemble, engine); `design_monitoring_plan` | `design_monitoring_plan` is a separate knowledge advisor that reads "Designed the monitoring plan". `generate_rbm_plan` was given a different object so the two cannot be confused. | — |

Searches run: `grep -rn "'<tool>'" server/services/ana server/services/rbm` for each of the 20 tools; the
register filtered by source, by `refusedBy: handler` and by monitoring-related names; `git log -G` on the
inventory for when the tools entered scope.

## The 20 tools: what each handler does, and the block chosen

Source `engine` is claimed only where the handler is deterministic, does not write and cannot reach a
model, and also computes its result rather than returning stored rows. A plain read of stored rows keeps
`project`, even where the gate would accept `engine`.

| Tool | Handler (`AnaToolExecutor.ts`) | What the handler does | verb / source / object (preview) | Why |
|---|---|---|---|---|
| `run_rbm_assessment` | :3189 | Class `conditional`. It reads the latest RACT and its items. With `seed: true` and no RACT, it first seeds a draft (`seedRbmWithDispatchClient` :3173 → `rbm-assessment-seed.ts`), then returns the summary. | summarize / project / "the study risk assessment" | It returns a summary in both modes. It is not `engine` because seeding writes; the gate would not catch that (see the gap below). |
| `assess_site_risk` | :3234 | Class `confirm`. It recomputes or reads the site risk snapshot. `recomputeSiteRisk` (`site-risk-engine.ts:236`) deletes and re-inserts `rbm_site_risk_scores`. It returns the sites, monitoring tiers and tier counts. | assess / project / "site risk and monitoring tiers" | It writes, so `engine` is barred (ENGINE). |
| `evaluate_kris_qtls` | :3293 | Read only. Two SELECTs, then it filters the stored KRI statuses (red, amber) and QTL statuses (breached, approaching). | check / project / "the recorded KRI and QTL statuses" | It reports statuses computed when each reading was recorded. Filtering stored rows is not a computation. (Corrected in review.) |
| `generate_rbm_plan` | :3330 | Read only. It reads the overall risk and the critical CtQ items, applies `defaultPlanStrategy` (`rbm-engine.ts:292`) and derives proposed actions by rule (score ≥ 15 → high). It saves nothing; it is labelled advisory. | derive / **engine** / "a proposed monitoring plan" | The result is a deterministic computation, nothing is written, and no model is reachable. "Proposed" separates it from `draft_monitoring_plan`, which saves. (Corrected in review.) |
| `prioritize_monitoring_queries` | :3366 | Read only. Two SELECTs ordered by severity, date and risk score (SQL `ORDER BY`), with a limit. | list / project / "the monitoring worklist by urgency" | The order comes from the SQL query over stored rows, not from a computation. |
| `run_central_monitoring` | :3396 | Read only. It reads the site snapshot and runs `detectSiteOutliers` (`central-statistical-monitoring.ts:103`, robust modified z-score). It does not persist signals; it only returns a hint to do so. | screen / **engine** / "the sites for statistical outliers" | Deterministic statistics, no write and no model reachable. |
| `scan_patient_profiles` | :3431 | Read only. It reads `rbm_patient_profiles` and runs `scorePatientCohort` (`central-statistical-monitoring.ts:187`). | scan / **engine** / "the patient profiles for anomalies" | Same as above. |
| `generate_rbm_report` | :3461 | Read only. `loadRiskReviewInput` (`risk-report-data.ts:16`, SELECTs only), then `buildRiskReview` and `renderRiskReviewMarkdown` (`risk-report.ts:65`, `:194`), which are pure functions. | assemble / **engine** / "the risk review report" | Section statuses and lines come from pure functions, and no model writes the report. Follows `compose_510k_summary`. |
| `get_rbm_attention` | :3477 | Read only. The same loader, then `buildAttentionFeed` (`risk-report.ts:229`), which assigns severities by rule and sorts. | list / **engine** / "what needs monitoring attention" | The severities are computed by rule. No write and no model reachable. |
| `add_ctq_factor` | :3507 | Class `confirm`. `addCtqFactor` (`rbm-actuator.ts:97`) scores likelihood × impact, infers criticality and inserts into `rbm_risk_items`. | add / project / "a critical-to-quality factor for the study" | It writes. Follows `create_risk_item`. (Corrected in review.) |
| `define_kri` | :3530 | Class `confirm`. `defineKri` (`rbm-actuator.ts:132`) inserts into `rbm_kris`, with a status inferred from the current value. | add / project / "a key risk indicator" | It writes, and the insert creates a new indicator. |
| `record_kri_reading` | :3552 | Class `confirm`. `recordKriReading` (`rbm-actuator.ts:163`) inserts into `rbm_kri_values` and updates the KRI's status. | record / project / "a key risk indicator reading" | It writes. Follows `log_study_ae`. |
| `set_qtl` | :3573 | Class `confirm`. `setQtl` (`rbm-actuator.ts:218`) inserts into `rbm_qtls`, inferring the secondary limit and the status. | add / project / "a quality tolerance limit" | Every call inserts a new limit; none updates an existing one. |
| `raise_monitoring_signal` | :3592 | Class `confirm`. `raiseSignal` (`rbm-actuator.ts:258`) inserts into `rbm_signals` with status `new`. | record / project / "a monitoring signal for triage" (`title`) | It writes. `title` is the signal's short human title and is on the allow-list. |
| `triage_signal` | :3611 | Class `confirm`. `triageSignal` (`rbm-actuator.ts:281`) updates the status, severity or notes in `rbm_signals`. | update / project / "the triage of a monitoring signal" | It writes. The input has no preview field, and `signalId` is an id. |
| `draft_monitoring_plan` | :3630 | Class `confirm`. `draftPlan` (`rbm-actuator.ts:311`) inserts a draft row with the next version into `rbm_monitoring_plans`. It refuses while another draft is open. | create / project / "a draft monitoring plan" (`title`) | It writes a record; it does not draft text, so the verb is create, not draft. `title` is the plan title. |
| `create_monitoring_action` | :3646 | Class `confirm`. `createAction` (`rbm-actuator.ts:759`) inserts into `rbm_monitoring_actions` against the plan in force. It returns 409 for a superseded plan. | add / project / "an action to the monitoring plan" | It writes. |
| `update_monitoring_action` | :3677 | Class `confirm`. `updateAction` (`rbm-actuator.ts:824`) updates the action's status, priority, due date or owner. | update / project / "a monitoring action" | It writes. |
| `approve_rbm_assessment` | :3697 | Class `refuse`, `refusedBy: handler`. It never approves. It returns a message that the approval is an e-signature (21 CFR 11.200) and must be done on the assessment. | explain / project / "how to approve the risk assessment" | REFUSAL allows only explain or check, and the finished row must not read "Approved". Follows `approve_qms_document`. |
| `approve_rbm_plan` | :3719 | The same as above, for the plan. | explain / project / "how to approve the monitoring plan" | Same as above. |

The labels a person reads are in `green/rendered-labels.txt`. They were built by `presentStep` itself
(`method/rendered-labels.ts`). An example from it: live "Screening the sites for statistical outliers",
finished "Screened the sites for statistical outliers", and while an error is open "Screening the sites for
statistical outliers". The preview shows only `title`, for example "Site 104 late AE entry". No id
reaches a row.

At run time the engine glyph is still withdrawn when the step's generation capture saw a model call
(design §2.3). The five engine claims are therefore checked twice: by the gate before merge, and by the
capture while the step runs.

## Red

`red/ci-step-presentation.txt` and `red/ci-step-presentation.json`: `npm run --silent ci:step-presentation`
on the base register exits 1 with 20 findings. All 20 are `MISSING <tool>: no 'present' block: its steps
would read "Ran a step"`, one for each of the 20 tools.

### The gate fails on wrong claims about these 20 tools

`method/probe-wrong-claims.mjs` → `red/probe-wrong-claims.txt`. It edits an in-memory copy of the
register only; the file on disk is never touched. 9/9 wrong claims were refused:

- `generate_rbm_report` with its block removed → MISSING
- `engine` on `add_ctq_factor` → ENGINE (class confirm)
- `engine` on `assess_site_risk` → ENGINE (class confirm)
- `finalize` on `approve_rbm_plan` → REFUSAL
- verb `approve` on `approve_rbm_assessment` → VERB
- a tool-like object on `get_rbm_attention` → OBJECT
- preview `signalId` on `triage_signal` → PREVIEW
- source `rbm` on `set_qtl` → SOURCE
- `engine` on `critique_document` → ENGINE. Its handler is in the same file as the five RBM engine handlers
  and reaches a model through `./saved-document-critique` and on to `gateway.ts`. So the five RBM claims
  passed because of what their handlers import, not because the handler walker skipped
  `AnaToolExecutor.ts`.

### A gap in the gate, not fixed here

`red/probe-conditional-gap.txt`: claiming `engine` on `run_rbm_assessment` gives 0 findings. That tool is
class `conditional`, and with `seed: true` it inserts into `rbm_risk_assessments` and its items. ENGINE
refuses only the classes `confirm`, `refuse` and `command`. For a conditional tool that writes in one mode,
the claim is kept honest only by the reviewer's judgment, which is why this change gives
`run_rbm_assessment` the source `project`. Closing the gap would mean refusing `engine` on `conditional`
tools too. That changes the gate's code, which is outside this task's files.

## Green

- `green/ci-step-presentation.txt` and `.json`: "ci:step-presentation OK — 674 in-scope tools each have a
  present entry (681 entries in all); 139 engine claims, none with a reachable model call." Exit 0. There
  were 134 engine claims before and there are 139 after; the five new ones are `generate_rbm_plan`,
  `run_central_monitoring`, `scan_patient_profiles`, `generate_rbm_report` and `get_rbm_attention`.
- `green/ci-step-presentation-selftest.txt`: "20/20 cases behaved." Exit 0.
- `green/rendered-labels.txt`: the live, finished and error labels of all 20 tools, from `presentStep`.
- Related suites, run once and not saved: `npx vitest run` on `tool-authorization.test.ts`,
  `tool-plan-labels.test.ts`, `step-presentation.test.ts` and `ana-cannot-sign.test.ts` (all under
  `server/services/ana/__tests__/`): 4 files, 115 tests passed.
- After the review's corrections, `npx vitest run --maxWorkers=1` on every test file that names
  `step-presentation` or `step-verbs` (`grep -rln` over `server`, `shared`, `client/src`), plus
  `tool-authorization.test.ts` and `ana-cannot-sign.test.ts`: 13 server files, 248 tests passed; the one
  client file (`anaScreenGoneStep.test.tsx`), 3 tests passed. The gate and its self-test were re-run and
  the green files above re-captured.

## Skeptic review

Every one of the 20 blocks was checked against its handler, asking three things. Does the verb say what
the step really did? Is `engine` claimed anywhere the handler writes or can reach a model? Is the object
honest and readable? For the model question, the gate's own `makeModelReach` was run on every module the
five engine handlers import: `server/db.ts`, `rbm-engine.ts`, `central-statistical-monitoring.ts`,
`risk-report-data.ts` and `risk-report.ts`. All return null. None of the four `rbm/` modules imports
anything, and none issues an INSERT, UPDATE or DELETE. Seventeen blocks stand. Three objects claimed
more than the handler does, and were corrected:

| Tool | Was | Now | Why the old object was refuted |
|---|---|---|---|
| `add_ctq_factor` | "a critical-to-quality factor to the risk assessment" | "a critical-to-quality factor for the study" | The handler (`AnaToolExecutor.ts:3519`) never passes `assessmentId`, so `addCtqFactor` inserts the row with `assessment_id` NULL. The assessment a person opens reads its factors `WHERE assessment_id = $1` (`server/routes/mdx-rbm.ts:240`), and so does the content they sign (`rbm-signature-content.ts:35`). The factor is in the study's risk items, which the RBM reads that work program-wide do pick up. It is not in any risk assessment, so "Added … to the risk assessment" was a claim the record does not support. |
| `generate_rbm_plan` | "a proposed monitoring plan from the risk assessment" | "a proposed monitoring plan" | The handler takes the critical factors program-wide, from every assessment version and from factors with no assessment. It takes the overall risk from the latest assessment in any status, and uses `'medium'` when there is none. The governed path, `generatePlanFromAssessment` (`rbm-actuator.ts:500-503`), scopes to one approved assessment because gathering program-wide "would let the plan claim derivation from the governing RACT while seeding its actions from a superseded or draft one". That is the claim the old object made. |
| `evaluate_kris_qtls` | "which KRIs and QTLs are out of tolerance" | "the recorded KRI and QTL statuses" | The handler compares nothing against a threshold. It returns the status stored when each reading was last recorded, so "Checked which … are out of tolerance" presented a recording as a fresh evaluation. It also returns the amber KRIs and the "approaching" QTLs, which are within tolerance. |

Checked and kept, with the reason:

- **The approvals** (`approve_rbm_assessment`, `approve_rbm_plan`). Each handler returns `{ error }` on
  every path (`AnaToolExecutor.ts:3697`, `:3719`). So `refusalOf` keeps the row in its doing form,
  "Explaining how to approve …". It never reads "Approved", and never reads "Explained" either. The
  "finished (success)" column of `rendered-labels.txt` feeds the builder `{}`, and no real call of these
  two returns that.
- **`draft_monitoring_plan`**. When a draft is already open, `draftPlan` returns
  `refused: 'draft_already_open'`. `refusalOf` (`tool-trace.ts:102`) reads that as a refusal, so the row
  never reads "Created a draft monitoring plan" for a plan it did not create. "Draft" is honest: the row
  is inserted with status `draft`.
- **`run_rbm_assessment`**. The handler summarizes in both modes; with `seed: true` it seeds a draft first.
  This follows the convention of the other conditional tools, which take the verb of their primary act:
  `scan_document_citations` and `review_schedule_of_events_health`.
- **`assess_site_risk`**. With `persist` false and a snapshot on file, the handler only reads it. The
  snapshot was computed by the same `site-risk-engine.ts`, and every call is class `confirm` because it
  can recompute, so "assess" stands.
- **The other writers**. `define_kri`, `set_qtl` and `create_monitoring_action` each issue exactly one
  INSERT, so "add" stands. `record_kri_reading` and `raise_monitoring_signal` record an observation or a
  new signal, so "record" stands. `triage_signal` and `update_monitoring_action` update rows, so "update"
  stands. All of them are `project`, and none claims `engine`.

Found in review, outside this task's files: `add_ctq_factor`'s definition
(`evidence-literature-tool-defs.ts:700`) says it "Adds a Critical-to-Quality (CtQ) factor to a
program's risk assessment (RACT)". Its handler attaches the factor to no assessment, so the person never
sees it on the RACT they review and sign. Fixing that belongs in the handler, which would pass
`assessmentId` and call `requireDraftAssessment`, as the route does at `mdx-rbm.ts:361`.

## Noticed, outside this task's files

- The definition of `run_central_monitoring` (`evidence-literature-tool-defs.ts:632`) says it is "raising
  central_stat signals". The handler (`AnaToolExecutor.ts:3396`) raises none: it returns outliers and a
  hint to persist them through `POST /api/mdx/rbm-central-monitoring/run`. The present block follows the
  handler.
- The `evaluate_kris_qtls` handler's hint names `POST /api/mdx/rbm-kris/seed` and `/rbm-qtls/seed`. Those are
  route instructions given to the model. They are left as they are.

## Reproduce

```
npm run --silent ci:step-presentation
npm run --silent ci:step-presentation:selftest
node docs/evidence/F1/2026-11-01-rbm-step-presentation/method/probe-wrong-claims.mjs
npx tsx docs/evidence/F1/2026-11-01-rbm-step-presentation/method/rendered-labels.ts | grep -v '^{'
```
