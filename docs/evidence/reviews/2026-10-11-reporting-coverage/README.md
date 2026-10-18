# Reporting & analytics — the COVERAGE review, 2026-10-11

The 2026-10-01 launch-catalog review of this app
(`docs/evidence/reviews/2026-10-01-reporting/`) ran 46 agents across five lenses:
provenance, honest state, Part 11 UX, security, design. It found three blockers and
about nine highs, and all were fixed.

**None of its five lenses was coverage.** It verified that everything the surface
shows is truthful. It never asked whether everything the platform computes is shown.

This review asks only that question. It is the answer to the founder's note of
2026-10-11: *"there is a significant gap between what our reporting analytics backend
can do and what we're presenting as a reporting analytics UI."*

- **Method.** Four backend areas inventoried and then independently checked for client
  reachability (workflow `wf_b348e171-dac`, 11 agents), plus two domain-expert passes on
  what a regulated client needs that neither side has. Every figure below was
  re-derived by hand before it was written down; where an agent's claim did not survive
  that check it is marked.
- **Head reviewed.** `concept2cure-v2` at `275707c7a`, then re-verified after merging
  `1c8e565f0`.

---

## 0. The gap, in the codebase's own words

`shared/constants/ui-surface-registry.ui-v2.ts`, the `insights` row, has recorded it
since the last review:

> 2026-10-01 (reporting review, IAM-21 / DP-64): the surface claimed all of
> `/api/report-os` and `/api/insights`, so joining the launch catalog made **21 routes no
> launch screen calls** reachable in production: program groups, bundles, deliveries,
> subscriptions and the live prediction run among them. It now claims what the canvas
> calls […] **The rest stay unmapped, which production refuses, until a screen needs one.**

The security fix was correct. Nothing then built the screens, and no test could notice:
every reporting suite drives the find box, and a route with no caller has no caller to
assert on.

Counting the routers by hand reproduces the number exactly — **21 of 28** endpoints under
`/api/report-os` and `/api/insights` had no screen.

---

## 1. Where the founder's premise is right, and where it is wrong

**Right, and substantially so.** Whole subsystems are built, tested, tenant-scoped and
reachable by nobody:

| Capability | Routes | State of the backend |
|---|---|---|
| Scheduled report subscriptions | 3 | Full CRUD, ownership-checked, Bull sweep registered at startup (`*/10 * * * *`) |
| Seal read + re-verification | 1 | Four independent checks against the audit chain; its header records fifteen adversarial findings, all addressed |
| Run history (filter/sort/search) | 1 | Real, with one defect — see §4 |
| Run dependency evidence trail | 1 | Rows written on every run, read by nobody |
| Report bundles + manifest PDF | 3 | Real; persistence is weak — see §4 |
| Deliveries | 2 | All-or-nothing, e-signature gated, role-gated |
| Program groups + snapshots | 5 | Real persistence; no audit row — see §4 |
| Signed audit-trail attestation | 1 | HMAC-signed, admin-gated, records its own audit row |
| §11.50(b) signature manifestation | 2 | `by-target`'s own docstring says it was "written and then unreachable" |
| QMS: internal audits, management reviews, nonconformance, suppliers, training | 30+ | Live CRUD, **zero** client reference — but see §2 |
| Inspections, 483 findings, responses, readiness scoring | several | Mounted, zero client reference — but see §2 |
| eCTD validation findings, transmittals, acknowledgements, gateway credentials | several | Thirteen gateway modules write to them; nothing reports over them |
| `reg_questions` / `reg_responses` (agency question clocks) | several | Governed tenant-scoped write path; nothing reports over it |

**Wrong, in one specific and important way.** The report catalog declares **61** types.
`report-engine.ts:53` computes **18** of them (the readiness digest, 16 domain registers,
and the evidence trace at `document` scope only). **43 have no engine at any scope.**

The canvas is already honest about this — `roNotComputed()` lists them as "not computed in
this release". Building pickers for them would render the readiness digest under another
report's title, which is the exact defect QA found on 2026-10-08 (j8).

**Why there are 43, which is the finding worth acting on.** The catalog is organised by
jurisdiction × dossier name. Twenty-six of the sixty-one are a pathway label on one
underlying computation — eighteen "`<Agency> <Pathway>` Readiness Pack", four meeting
briefings, four deficiency packs — and their declared `dataDependencies` are near
identical (`submission_readiness`, `module_completeness`, `section_status`,
`question_risk`). There were never 43 distinct computations to write, only about six, and
the catalog promised them eighteen times over.

> So the backlog is not "write 43 providers". It is "write ~6 computations and
> parameterise them by region", and then collapse the catalog onto them. That is a
> product decision under Rule 2, not a cleanup.

---

## 2. The constraint that most changes the plan

**The QMS and inspection tables are not deployed.**

| Migration | In `C2C_MIGRATION_FILES`? |
|---|---|
| `20260511_qms_and_labeling.sql` | **No** |
| `20260610_inspection_readiness.sql` | **No** |
| `20260504_capa_mdr.sql` | Yes |

`qms_documents`, `qms_training_records`, `qms_suppliers`, `qms_internal_audits`,
`qms_management_reviews`, `qms_nonconforming_products`, `inspections`,
`inspection_findings`, `finding_responses`, `readiness_assessments` reach a database only
through `drizzle-kit push` at provisioning, which the production image does not run.

So the group that looks like the largest "we built it, just show it" win — thirty-plus
live QMS endpoints with zero client references — would render a failed read in
production. **Settling the migration-set question is a Rule 1 decision and comes before
any UI over those tables.** A report built over them before that must fail closed on
`42P01` with a could-not-read state, never an empty one.

Second constraint: `etmf`, `cer` and an inspection workspace are not in
`shared/constants/launch-scope.ts`, so they are hidden in production and
`ci:launch-scope.mjs` enforces it. These belong as **reports inside the in-scope
`compliance-reports` surface**, or panels on `quality` — not as new surfaces, which is a
founder decision under Rule 2.

---

## 3. Shipped in this session

Three tranches, each with its gate shown failing first (CLAUDE.md).

1. **`0ce0d0bb` — the reporting library.** Four tabs on the artifact pane: report catalog
   (grouped by family, with the uncomputed types named and never pressable), run history
   (the route's own filters), schedules, bundles. `Report` stays the default pane.
   Claims extended narrowly to `/api/report-os/bundles` and
   `/api/insights/subscriptions`.
2. **`e9153b77` — a run's Part 11 evidence.** `GET /runs/:id/seal` re-verified in four
   checks and `GET /runs/:id/dependencies`, as a disclosure under the report. Needed no
   claim change: both were already inside the claimed prefix and had simply never been
   called. `not-verifiable` renders as its own state, never as a quieter pass.
3. **`cd56cec3` — the signed audit-trail attestation**, on `compliance-reports` beside the
   eight existing reports. `UNVERIFIABLE` and `EMPTY` each say they are not a statement
   that the trail is intact; `coverageSentence()` states the hashed/unhashed split so an
   `INTACT` verdict is never read as covering more than it does.

A fourth commit (`203a9440`) fixes two overclaims the audit found in tranche 1 — see §4.

The reachability pass ran against the tranche-1 working tree and independently
re-executed its suite (20/20, including "lists a type no engine computes by name, and
never as a control"), and confirmed the catalog tab needs no new API claim because it
renders the `reportTypes` the bootstrap already returns. It also established why the
catalog must **not** be re-sourced onto `/api/report-os/taxonomy`: that route does not
return `runnable` (all 61 would read as runnable — the QA 2026-10-08 j8 defect), it
filters on the organisation's union of segments rather than the lead programme's (the
fix for the device-only 510(k) matrix offered to a biologic IND), and it returns `[]`
rather than failing safe when the registry table is empty. Use it only to enrich a type
the bootstrap already listed.

**Deliberately not built, with reasons:**

- **`GET /report-os/health`** — the counters are not tenant-scoped. With RLS enforced they
  all read 0; with it off they span every tenant. Rendering them is either a dashboard of
  zeroes or a cross-tenant disclosure. Backend fix first.
- **`POST /insights/predictions/run`** — the CRL/RTF pre-mortem engine is real (logistic
  regression + rule-based completeness + DP-anonymised cross-tenant priors, writing
  `risk_predictions` for calibration). But every route requires `presentSections` *from
  the caller* — nothing derives it from a project — so a screen would have to invent the
  model's features. There is also a **second, different** pre-mortem already reachable
  through AnA (`run_submission_premortem`: deterministic pattern scan + precedent
  engine). Which is canonical is a zero-duplication decision, not a wiring task.
- **Program groups** — the only Report-OS write path with no audit chain row, while
  re-scoping a group changes what every later board pack covers. Presenting them as
  governed objects would overclaim.
- **Program-group snapshots** — capture only `projectIds` + a hash: no readiness, no
  blockers, no document. The most mislabellable feature in the area; must never be
  offered as a point-in-time metrics snapshot.
- **`POST /deliveries`** — sends nothing. No SMTP, no gateway, no transfer anywhere in the
  path; `recipients` is stored and counted.
- **Tamper-evidence monitoring log** — not buildable. `auditChainIntegritySweep.ts`
  verifies seven stores but **persists nothing on success**, so "show me the daily check
  ran for twelve months" has no data behind it. New data required (Annex 11 §9).

---

## 4. Defects found, including in this session's own work

| # | Finding | Status |
|---|---|---|
| C-1 | `GET /runs` applies `search` and `sortBy` **in memory, after the SQL `LIMIT`**, so a search silently misses older matches. The first draft of the run-history panel presented that as a search of the history. | **Closed 2026-10-18** by `server/services/report-os/run-history.ts`, which the route now delegates to: search, filters and ordering run in SQL before pagination, the page and its `total` come from one snapshot, `ILIKE … ESCAPE '!'` keeps a term's `%`/`_` literal, and `id` breaks a `createdAt` tie so two identical requests agree. It also added the thing the mitigation lacked — a real `offset`, so the panel paginates (`total matching reports · 1–50 shown`, Previous/Next) instead of stating a caveat about a window. The client-side mitigation and its `runsSearchCaveat` are gone with the cap they described. Covered by `server/services/report-os/__tests__/run-history.test.ts` over PGlite, including a match older than the latest 100, literal wildcards, deterministic ties and an accurate total on an empty page. |
| C-2 | The bundle PDF is a **manifest**, one line per report; it says so itself ("Each report's own PDF carries its signature and seal"). The first draft offered it as "several governed reports packaged as one paginated PDF — what an inspector is handed". | Fixed in `203a9440`. |
| C-3 | A bundle has **no `report_bundles` table**. It is stored as one `project_memory_entries` row *per covered project*, `JSON.stringify`'d and truncated at 20,000 characters. | Open — backend. |
| C-4 | `insights-canvas-routes.ts:331` computes `runnable` as `reportEngineFor(typeId, 'project')`, hardcoding project scope. `provenance.evidence_trace_report` is computable at `document` scope and is therefore reported as un-runnable. A working report is hidden by a literal. | Open — one line, plus a document picker for the scope. |
| C-5 | The compliance reports serve `json` and `csv` only. An inspector who asks for the access review is handed `application/json`. | Open — `ReportFormat` + `readFormat`. |
| C-6 | The RBM attention feed is silently capped at 8 items — a severity-ranked regulatory attention list that hides item 9 without saying so. | Open. |
| C-7 | The expedited-SAE clock fetches `unassessedInputs` and **discards it**. *(Wording correction: the copy was never "No expedited report required" and the `basis` sentence was always rendered and always honest. What was identical between an unassessed case and one found non-reportable was the headline, the border and the background.)* | **Fixed**, and then fixed again. The first fix inferred "no verdict" as `unassessedInputs.length > 0`, which is the wrong boundary: P-20's follow-up and `classifyIndSafetyReport`'s Gate 0 both hold that an event recorded non-serious, or not suspected, IS determined on those stated facts. So a decided case was headed "Reportability not determined". `reportabilityDetermined` is now computed once in the clock service and read by all four readers (the box, the queue labels, the save toast, the AnA context). Three further residuals closed with it: C-7a (the labels beside the box), C-7b (the narrator was handed the sort sentinel 9999 as a day count), C-7c (the boundary). |
| C-8 | Task-board analytics recompute in the browser from filtered rows while a deterministic org-scoped engine (`loadTaskAnalytics`) goes uncalled — a client-side duplicate of a server engine. | **Partly closed 2026-10-18, and the finding's premise corrected.** They are not duplicates: `loadTaskAnalytics` reads `unified_tasks` alone, org-wide, while the board's `/board` route is uncapped and spans every work store, so swapping the tab onto the engine would narrow the figures rather than widen them — a different wrong number. The real defects, both fixed: (a) the tab's figures came from `list`, the FILTERED rows, under the bare labels "Open tasks", "Blocked", "Team productivity" — with a module filter and "assigned to me" on, one person read as the team and "Blocked: 0" read as a clear board. It now states what it measured (`taskBoardAnalyticsScope`), and says nothing when it measured every card. (b) the engine's `teamProductivity` had `.limit(10)` with no total beside it and excluded unassigned work with no complement, so the per-assignee rows did not sum to `taskStats.totalTasks`. It now returns `teamProductivityTotal` counted in SQL, an explicit `unassigned` bucket, and an id tiebreaker. Evidence `docs/evidence/reviews/2026-10-11-reporting-coverage/C8-TASK-ANALYTICS.md`. |
| C-9 | `attestation-report.service.ts`'s header says every row will report `UNVERIFIABLE` because the hash-chain migration is not in the set. **Stale:** it is in the set (`migration-set.mjs:1590`), so the chain does start. The permanent split it describes still holds for pre-cutover history. | Comment only. |
| C-11 | `GET /api/report-os/portfolio/org` is **refused in production**. The prefix `/api/report-os/portfolio` is claimed by one surface only (registry line 37, the AnA Command / Orchestration row), and that surface is not in `launch-scope.ts` — nor is `Orchestration.tsx`'s. So both of its callers sit on surfaces hidden in production *and* the route is out-of-scope there. The reporting surface reaches the rollup only through the reduced `/api/insights-canvas/overview` projection. | Open. Correction to this session's own earlier note, which recorded the callers but read them as reachable. |
| C-12 | `portfolio/fetch.ts:37` caps the org rollup at `ORG_ROLLUP_CAP = 100` and sets `truncated` when there are more. `truncated` is declared in `Insights.tsx:202` and **never rendered anywhere**, so programs beyond 100 are silently excluded from `avgReadiness`, the counts and the blocker totals. A third silent cap, alongside C-1 and C-6. | Open. |
| C-14 | **The j8 defect survived in the scheduling path.** `scheduling/worker-register.ts` called `computeInitialRun` for every subscription, passing the type as an `explicitRegistryId` that `orchestrator.ts` declares and never reads — exactly what `report-engine.ts`'s header describes closing for `POST /runs`: "a report claiming an analysis nothing performed". So a schedule over any of the sixteen domain registers computed the readiness digest and stamped it with the register's name. The path had no caller until the Schedules screen gave it one, which is how it surfaced. | **Fixed.** The sweep now dispatches on `reportEngineFor` exactly as the route does, and a type no engine computes throws so the item fails rather than substituting the digest. Seven tests; six fail on the old code. |
| C-15 | The run-search caveat **could not fire when it mattered**. `GET /runs` returns only the matches, so the row count carries no information about the window — and gating the sentence on `loaded < RUNS_WINDOW` suppressed it exactly when a search matched a handful inside a 500-row window. | **Fixed.** The caveat is unconditional while a search is active and reports how many matched inside the window. |
| C-16 | The portfolio truncation note claimed the shown programmes were "the highest-ranked ones, by the server's ranking". `fetchOrgPrograms` selects `ORG_ROLLUP_CAP + 1` rows with **no `ORDER BY`**; `attentionRanked` sorts only within whatever hundred came back, so the programmes needing most attention can be entirely outside the board. | **Fixed.** It now says the selection is unordered, so it cannot read as "nothing worse than this exists". |
| C-17 | A failed bundle export got the **success toast** — `fireToast(out.text)` defaults to tone `ok`, drawing a green check beside "No file saved — Exporting this bundle requires the enterprise plan". `toast.tsx`'s own header names this defect, and `exportRep` beside it already passed the tone. | **Fixed.** |
| C-18 | Four list reads passed no `useLiveData` guard, so `rowsOf` turned any non-list 200 (version skew, a nested envelope, an error body) into `[]` — rendering "No reports have been run yet" for a failed read. | **Fixed** with an `isRowList` guard on all four, so a shape mismatch becomes the panel's error state. |
| C-19 | Two **invented status vocabularies**. `RUN_STATUS_LABEL` offered queued/running/failed, which nothing writes, and omitted `completed`, which `POST /runs` writes for a clean run — so the filter had four dead options and a clean run rendered as a raw lowercase word. `DEPENDENCY_STATUS_LABEL` was keyed to ok/fresh/stale/blocked/error while the providers emit ready/partial/missing, so every healthy provider rendered raw in the amber draft hue. | **Fixed**, both read off the writers. |
| C-20 | A run's row read **"Final — sealed"** from `status` alone, in a table that never reads `/runs/:id/seal` — so a final run whose seal mismatches read as sealed. This module's own SECURITY-8 note is against exactly that. | **Fixed:** the table says "Final"; the seal is claimed only where it is checked. |
| C-21 | §11.50(a)'s three elements (printed name, date and time, meaning) were omitted when the record did not carry them, so a row with a signer and a time but a null `signature_meaning` rendered two lines and read as a complete manifestation. | **Fixed:** on a sealed run all three always render, reading "Not recorded" when absent; non-§11.50 rows are still omitted. |
| C-22 | The attestation claimed it "recomputes every entry's hash" and that INTACT meant "nothing altered or removed". The service compares **stored** `previous_hash` against the prior row's **stored** `record_hash`; it never re-derives a hash, and the trigger's recipe does not cover before/after values. | **Fixed:** the copy claims chain continuity over `audit_events` and nothing about entry contents. Making the stronger claim true is a backend change — open. |
| C-23 | The attestation said each pull "is recorded on the audit trail". The route returns the signed report even when that row fails to write, signalling it in an `X-Audit-Trail-Status` header that `apiCall` does not expose. | **Fixed** by not claiming it; exposing the header is open. |
| C-24 | `canRun` (owners, admins, managers, approvers, platform admins) is wider than the attestation route's `isAdmin` (admin, owner), so a manager gets a 403. | **Partly fixed:** the copy names the right roles and the 403 reads as a role refusal. Removing the doomed click needs a server-derived permission, as `GOVERNED_WRITE_PERMISSION` and `REPORT_FINALIZE_PERMISSION` were done — the client must not mirror a role list. Open. |
| C-25 | **A tamper verdict was hidden.** `viewOf` sets `sealed` from the run's *current* status, so a run the chain records as finalized whose `report_runs.status` was later rewritten returns `sealed: false` with `verdict: 'mismatch'`. The evidence panel tested `!sealed` first and said the run carried no seal — the opposite of what the server found, in the one case the panel exists to surface. The suite's own fixture (`{...INTACT, sealed: false}`) was a shape the server never returns, which masked it. | **Fixed,** with the real fixtures and a test that fails on the old ordering. |
| C-26 | Schedules still claim more than the sweep does in several ways beyond C-14: `POST /subscriptions` has no entitlement check and the sweep skips one, so a Standard-plan org can create an "Active" schedule that can never fire; `isDue` anchors a null `lastRunAt` at the epoch, so a new schedule fires on the next sweep whatever its cadence while `nextRunAt` shows a future date; and the sweep persists no run, so a scheduled report never appears in Run history. | Open — these are backend behaviours; the panel's note states what it can. |
| C-27 | Five reads used fixed "could not be read" copy and never consulted `useLiveData`'s `status`, so a 403 from the tenant guard and an expired session both rendered as an outage with a Try again that cannot succeed. | **Fixed.** `readFailureOf` classifies the status: 401 says to sign in, 403 says the records are role-scoped and that retrying will not change the answer, 404 says there is no such record — none of them offers a retry. Only an unreached server (`status: 0`) or a 5xx keeps one, which is the case a retry is actually for. Four tests; three fail on the old behaviour. |

| C-13 | `insightsReportsRunWhatTheyName.test.tsx` ("a pack lists only the types an engine computes") fails intermittently **under CPU contention**, not on its own: it passed 3/3 run alone and 195/195 in a clean batch, and failed roughly 1 in 3 full-batch runs on this 4-core container. Its `waitFor(.ro-pack-grid)` is bounded by the global `asyncUtilTimeout: 5000` (`tests/setup.ts:52`) and the canvas render exceeds it when workers compete. Pre-existing fragility rather than a correctness defect; adding suites raises its failure rate, which is how it was noticed. Not "fixed" by inflating a timeout in a test this work does not own. | Open — needs either a cheaper canvas mount in that suite or a per-assertion budget. |
| C-10 | ~~**37 of 43** `*-metrics.ts` services are dead code — no endpoint and no caller.~~ **WRONG, and closed as a false positive (DECISIONS-2026-10-12.md, D-1).** There are 44, and **zero** are dead. Each sits on a two-ended chain, verified for all 40 under `server/services/`: a mounted route statically imports and calls its `record*()` counters, and the single aggregate `/api/metrics` handler (`startup/inline-endpoints.ts:264`) **dynamically** imports and calls its `render*Metrics()`. The trap, which is what will recur: there is no per-service endpoint, so a search shaped "does this service have an endpoint?" correctly returns nothing and the inference to "dead" does not follow. A first pass then recommended deleting `server/metrics.js` as "the one genuinely unreachable module" — it has three production importers, two in CMC / Module 3, inside the launch catalog under P-28. What the investigation DID surface, as a separate and real question: `/api/metrics` has no scrape configuration in this repository, so the 40 `render*` functions are built and not wired to a reader. | **Closed — false positive.** Nothing deleted. The open question is operational, not a cleanup. |

**Duplication (Rule: zero duplication).** `intelligent-report-engine.ts` is a **second
sealed/immutable Part 11 report stack**, 16 endpoints, 11 with no UI, and
`ReportGovernance.tsx` is a **second seal-verification screen** already built and already
hidden (not in `launch-scope.ts`). The correct response is migration onto Report-OS and
deletion, not wiring — and under the Working agreement that deletion needs the
`git log --all --diff-filter=D` history search and a named replacement by path.

---

## 5. What clients need that neither side has

Ranked by the two domain passes, keeping only what is buildable from data that **deploys**.

**Must-have, and cheapest first:**

1. **Record history pack** — "show me this record's history". No *report* answers it: the
   ledger read-model takes only `limit` (newest-first, org-wide), and the one per-entity
   endpoint, `GET /api/part11/audit-trail/:entityId`, carries a 20-line comment saying it
   is deliberately not connected (wrong table, six non-existent columns, no tenant
   predicate, no writer). Everything needed is stored (`old_values`, `new_values`,
   `reason`, actor, `chain_seq`, `hmac_seal`), and 34 read sites already filter
   `audit_logs` by `record_id` in a `WHERE` clause — so the pieces exist and nothing
   assembles them into an inspector-facing report. A query and a report type, not new
   data.
   *(An earlier draft of this line said no read site filters by `record_id` at all.
   That was an agent's claim repeated without checking; `grep` finds 34. The gap is the
   absence of a record-scoped report, not the absence of the query pattern.)*
2. **§11.50(b) signature manifestation certificate** — already served by
   `GET /api/part11/signatures/by-target` and `/signatures/:id/manifest`, zero UI.
3. **Signed inspection pack as PDF** — C-5 above.
4. **eCTD technical validation & publishing QC report**, **dispatch & acknowledgement
   log**, **agency question/response clock register**, **dossier assembly gap report** —
   all over tables that deploy, with the blocker set already computed server-side by
   `dispatch-readiness.ts`. The domain pass calls publishing/transmission "the largest and
   cheapest gap".
5. **Audit readiness cockpit** on `compliance-reports`.

**Strong, but gated on §2:** deviation/CAPA ageing (deploys), training and
read-and-understood, supplier qualification, internal audit + management review,
inspection/483 pack (the last four do **not** deploy yet).

**Not buildable now:** personnel qualification and delegation-of-authority (no table),
tamper-evidence monitoring log (nothing persisted on success).

---

## 5a. The second pass, and what reviewing my own work found

The three tranches above were then put through two of the launch definition's own
lenses — honest state and Part 11 UX — against the diff rather than the surface.
They returned 14 further findings, C-14 to C-27, **ten of them in the work this
session had just shipped**. Two are worth naming:

- **C-14** is the most serious thing this review found anywhere. Giving the
  scheduling path a screen exposed that it still carried the QA 2026-10-08 j8
  defect the route had been fixed for: a scheduled domain register computed the
  readiness digest and stamped it with the register's name. A capability with no
  caller cannot be observed to be wrong, which is the same reason the coverage
  gap itself went unnoticed — and an argument for closing such gaps rather than
  leaving routes unreached.
- **C-25** is the inverse failure in the new evidence panel: the server detects a
  rewritten `report_runs.status`, and the panel discarded that verdict and said
  the run carried no seal. Its own test fixture used a shape the server cannot
  return, so the suite agreed with it.

Both were found by reading the backend against the UI, not by running it. Neither
would have failed a test, because the tests encoded the same misunderstanding as
the code.

## 6. Why this was invisible, and the gate that would have caught it

A route with no caller has no caller to assert on, so no test failed. The signal that
*did* exist was `ci:launch-scope-api`, which proves every path a launch screen **names** is
claimed — the exact inverse of what was needed.

**The missing gate**, worth building: for each launch surface, every route its routers
mount that no screen calls is either listed in a reviewed baseline *with a reason* or
fails. That turns "21 routes no launch screen calls" from a comment in a registry into a
number CI holds down. It is the same shape as `ci:migration-drop-safety` and its
baseline-with-a-written-reason rule.

---

## 7. What was built on this review's findings

**`REGIONAL-ENGINE.md`** (2026-10-12) answers the half of the founder's note this
review left open: not "is what we show truthful" but "is there a market-specific
computation we already hold and do not run". There is exactly one —
`shared/regulatory/regional-module1.ts`, the FDA/EMA/PMDA Module 1 record with a
basis per heading — and it computes **four** of the 35 market-named report types.
The other 31 stay not computed, each for a reason the market itself states, and
widening that set means adding a regulator's Module 1 tree rather than a case in
an engine.

That document also records three things worth reading before touching this area:
the `requireConfidence` question decided on the shipped precedent rather than by
amending four governed type definitions; the j8 defect found in the **renderer**
(a market assessment's executive summary read "Submission readiness not
computed"); and `computedScopes`, which stopped the catalog card claiming a run
at a scope the engine refuses.

## 8. Decided, 2026-10-12

The parked product calls were delegated to the session and are decided in
**`DECISIONS-2026-10-12.md`** beside this file. In short:

| | Decision |
|---|---|
| **D-1** C-10's 37 dead metrics services | **Delete nothing.** False positive — zero are dead; the trap is a dynamic import inside one aggregate handler. A near-deletion of `server/metrics.js` (3 production importers, 2 in CMC/Module 3) was caught by the adversarial pass. Separate real finding: `/api/metrics` has no scrape config, so the telemetry has no reader. |
| **D-2** QMS + inspection migrations | **Safe, but not now.** All 43 statements are IF NOT EXISTS-guarded and all ten tables are public + `organization_id integer NOT NULL`, so Rule 1 passes cleanly. Held because it is a new capability while the launch rows are red, and because the PLACEMENT is load-bearing in a way `ci:migration-set-order` does not catch — misplaced, it opens a Part 11 signature-bypass window between two deploys. The analysis is recorded so it is not redone. |
| **D-3** The attestation's stronger claim | **Narrow the claim, not the chain.** Shipped: the report declares its own method inside its HMAC-signed body. Re-deriving would report the whole pre-cutover span as BROKEN, which an inspector reads as a compromised trail. |
| **D-4** Collapsing the 61-type catalog | **Don't.** Build engines under it, as the `regional` engine did. The canvas is already honest about the uncomputed types, so there is no user harm to fix, and collapsing means deleting governed definitions from a deployed seed for zero launch benefit. |

## Rows informed

D2 (the Reporting app), D5 (governed path), D6 (audit). None turns green from this review
alone: §2 and the Rule 2 catalog-shape decision are founder calls, and C-1, C-3 to C-8
remain open. `REGIONAL-ENGINE.md` moves D2 from 43 uncomputed types to 39, with a
market-specific computation behind each of the four, and does not turn it green
either.
