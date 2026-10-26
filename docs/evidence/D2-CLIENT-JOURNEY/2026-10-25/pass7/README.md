# D2 — The CMC work area (pass 7)

Launch row D2. Design and the pass sequence: `docs/design/CLIENT_JOURNEY_2026-10-25.md`.
Decision: P-47 in `docs/LAUNCH_DEFINITION_OF_DONE.md`. CMC / Module 3 is in the catalog
under P-28, within its composition boundary. Canonical branch `concept2cure-v2`,
baseline `50c0280b`.

## Why this pass exists

Passes 1–6 reorganised the way in — a short rail, a start-here Home, six project steps,
each step saying what to do on it. **No pass touched a work area.** Opened as a client,
CMC / Module 3 was still what it had always been: nine nouns in a tab strip, and the
founder said so — *"I was very dismayed to see the CMC UI and the lack of features we
have built that are not showing."*

Two separate complaints, and both were true.

## What already exists (RULE 3)

### Navigation into CMC — already there, nothing to build

| Path | What it does today | What it does not do |
| --- | --- | --- |
| `v2/registryModel.ts` `RAIL_CORE` | `{ id: 'cmc', label: 'CMC / Module 3', group: 'work-areas' }` — the rail reaches it, under *Work areas*, since pass 1. | — |
| `surfaces/ProjectHome.tsx` `ProjectDocuments` | The Author step offers "CMC / Module 3 →" when `cmcComposes` (a US IND whose product is recorded as a drug). | — |
| `v2/shellProject.ts` | The open program survives a reload and is named on the URL (`?program=`), so CMC opened from the rail has a program. | — |

So the module was reachable. The gap was inside it.

### The module's own surfaces — what each renders

| Path | What it does today | What it does not do |
| --- | --- | --- |
| `surfaces/CmcModule.tsx` `CMC_NAV` / `CMC_SURF` | Nine destinations in a `.cm-sub` strip, routed to nine panes; `cmc.open-tab` for AnA; `usePublishSurfaceContext` so AnA knows which pane is open and what its readiness says. | **No destination said what to do on it.** The only sentence beside each was its screen's own `CmHead meta`, which says what the screen HOLDS ("Release and shelf-life limits — drug substance and drug product"). |
| `surfaces/ProjectStages.tsx` `StageBand` | The project steps' band: the open step, its blurb, **what to do now**, and the next step. `.pj-stageband` in `app-v2.css`. | Used only by Project home. |
| `fixtures/project-home-data.tsx` `LifecycleStage` | `{ id, label, icon, blurb, now }` — `now` documented as "What to do on this step, in one sentence a new client can act on… never a claim about the program's state". | — |
| `surfaces/cmcRegisters.tsx` `RegisterCard` ×16 | Every register: list, create, governed row actions, and the §11.10(e) History action (2026-10-18). | — |
| `surfaces/cmcRecordHistory.tsx` `RecordHistoryPanel` | One history panel over `GET /api/cmc/register-history/:register/:id`, with honest states for a failed read, a missing store, an empty trail and an actorless act. | Read one store only. |
| `surfaces/CmcModule3Build.tsx` | Nine `module3-os` endpoints: compile, per-section build, contradictions and their resolution, readiness, the fail-closed export gate, provenance. | — |
| `surfaces/CmcQuality.tsx`, `CmcSectionEvidence.tsx`, `CmcRegisterLinks.tsx`, `CmcPlaceIntoSubmission.tsx` | QbD + ICH check + control strategy; the Vault evidence drawer; the register-link recovery bar; placement into a sequence. | — |

### The capability that was built and did not show — measured, not assumed

A reachability sweep over **all 99 CMC server routes** against every file in `client/src`
(`live/cmc-route-reachability-sweep.txt`; the sweep is now a test, see below) reported 8
with no caller. Four were confirmed **by hand to be reached** — their caller builds the
path from a variable base or across five lines, which no regex over one source string can
see. That leaves three, each with its engine, its tests and no screen:

| Route | Engine | How a client could reach it before |
| --- | --- | --- |
| `POST /api/cmc/stability-studies/:id/trending` | `services/cmc/stability-trending.ts` — regression control chart, slope CI, projected crossing | Chat only (`assess_recorded_stability_trend`) — **while the Stability tab's own AnA starter has said "Show every study trending toward a limit" the whole time** |
| `GET /api/cmc/projects/:id/process-capability` | `services/cmc/process-capability.ts` — ISO 22514-2 Pp/Ppk/Cp/Cpk on moving-range sigma | Chat only (`assess_recorded_process_capability`), or by compiling §3.2.S.4.4 and reading the section |
| `GET /api/cmc/specifications/:id/history` | `specification_audit_log` — every limit change with both whole-row snapshots | **Nowhere.** The register an inspector asks about first was the only one whose changes could not be read, while the other sixteen gained the panel on 2026-10-18 |

Searched: `CMC_NAV`, `now`, `blurb`, `StageBand`, `CmHead meta`, `openProgramAction`, every
CMC route path, `trending`, `process-capability`, `specification_audit_log`,
`register-history`, by component, route, table and surface id; `git log --all
--diff-filter=D` on `*Capability*`, `*Trend*` and `*SpecHistory*` in `client/` and
`server/` found no deleted predecessor for any of the three.

## What changed

Named for what it is: **completed and reached**, not built.

1. **Every CMC destination says what it is and what to do on it.** `CmcNavItem` gains
   `blurb` and `now` — the two fields the project steps carry — and the module renders
   them with **`StageBand`, the project steps' own band**, not a second one. The order is
   the order the work is done, so the band's "Next" reads as the path through Module 3.
   The `now` rule is the steps' rule: guidance about the destination, never a claim about
   this program. Enforced by a test, which caught the first draft of Overview's sentence
   telling a client to read a count.
2. **The specification register's history is reached, through the one panel.** The route
   kept its store and changed its *shape* to the envelope `register-history` answers
   (`readSpecificationHistory`), so `RecordHistoryPanel` reads both and no second history
   UI exists to drift. It also gained the actor's name (`public.actor_name`, which needs
   the tenant GUC, so the read is now on a pinned connection), tenant ownership (another
   org's specification is a 404), the 500-row cap with its truncation notice, and
   fail-closed 503. Changing the shape broke no caller because it had none.
   `store` travels with every payload: `sealed: false` means "predates the sealed ledger"
   in the chain and "no row here is ever on the chain" in a revision log, and a panel that
   marked both the same way would tell the reader something untrue about half of them.
3. **Stability trending has a door on the Stability register** — a Trend action per study,
   rendering the server's slope, its out-of-trend points and its projected crossing, with
   every series the engine refused shown **with its reason** rather than dropped.
4. **Process capability has a door on Batch records** — `CmProcessCapability`, rendering
   the server's indices, verdict, caveats, excluded batches and out-of-specification
   batches, and its own "not assessed" sentence when the results open no series.
   `/api/cmc/projects` is now claimed in the surface registry; its comment said
   "deliberately so … **until a launch screen calls it**".
5. **A client told to open a program is given a way to open one.** Specifications and
   Batch records said "Open a program" and offered no button; four other CMC empty states
   already did. Both now pass `openProgramAction(nav)`.
6. **The Specifications register's Edit, Approve and History were all broken in the
   product.** `quality_specifications.id` is a **uuid**; `CmcSpecRow.id` was typed
   `number` and `specRowFromApi` coerced it with `Number(row.id)`. So every display row
   carried `NaN`, and every path built from it was dead:

       PUT  /api/cmc/specifications/NaN            edit a limit        -> 500
       POST /api/cmc/specifications/NaN/approve    approve under signature
       GET  /api/cmc/specifications/NaN/history    read what changed   -> 500

   and the optimistic update `rows.map(x => x.id === id ? … : x)` matched nothing,
   because `NaN === NaN` is false. The list and the create were fine, which is exactly
   why the screen looked like it worked.

   Found by pressing **History** in the running app — `invalid input syntax for type
   uuid: "NaN"` in the server log — not by reading the code: `Number()` of a uuid
   type-checks perfectly and the row's declared type agreed with it. The same class of
   mistake as `manufacturing_processes` shipping `idKind: 'integer'` in the register
   history map, which a test caught on its first run.
7. **The specification update encoded by the value's type, not the column's.**
   `buildSpecUpdate` stringified a value only when it was an *object*, while the create —
   three screens away in the same file — encodes the four `jsonb` columns unconditionally.
   A caller that sends a plain string could therefore create a specification and then not
   edit it: the new value reached a jsonb column as raw text, Postgres answered 22P02
   (`Token "-" is invalid`), and the route returned
   `500 Failed to update specification · Operation failed`.

   **Corrected after review — who that caller is.** Not the Specifications tab.
   `specUpdateBody` always sends `{release, shelf}`, `{method}` and `{ich}` objects, so
   the form took the object branch and worked; the 500 I first reproduced came from my own
   `curl` sending a shape the form never sends. An earlier draft of this README said
   "widening a release limit … was the one edit that could not be made", which was wrong:
   what broke that edit from the tab is item 6, the NaN id. This branch is reached by any
   other caller of the same route — an AnA tool, a script, an integration — and it is
   those that could create a row they could not then edit.

   The encoding now follows the **column**, as the create does. A scalar persisted that
   way is also now **read** rather than rendered as a blank limit (`scalar` in
   `cmcSpec.ts`): turning a 500 into a silently empty acceptance criterion would be the
   worse trade, and a limit shown as absent is the one mistake that column must not make.

## Live, against the running app (`live/`)

A local install provisioned from empty (PostgreSQL 16 with pgvector, `install-fresh` then
`deploy-migrate`, 429 files), `seed-admin.mjs`, the server on `:5000`, every call through
the real routes with a real session token.

| File | What it shows |
| --- | --- |
| `spec-history-live.json` | A specification created, then its release limit widened. The history names both acts oldest-first, the actor ("JM Smith", `user:1`) from `public.actor_name`, and the change `acceptance_criteria: 95.0 - 105.0 % → 90.0 - 110.0 %`. **The edit in it is the one that answered 500 before this pass.** |
| `trending-live.json` | A 5-point impurity series drifting upward against `NMT 1.0 %`: slope 0.0383 %/month, 95% CI `[-0.0013, 0.078]`, `significant: false` on 5 points, and `projection: { bound: upper, limit: 1, time: 23.37 }` — "trending toward a limit", answered deterministically on the screen that asks the question. |
| `capability-live.json` | Seven QC batch results against `95.0 - 105.0 %`: Cpk 1.3353, Ppk 1.8212, verdict `capable`, **with both caveats** — preliminary under 25 batches, and Cpk/Ppk diverging by more than 0.25. Also captured before any result was recorded: `assessed: false` with the server's own sentence, which is what the panel's empty state shows. |
| `cmc-route-reachability-sweep.txt` | The sweep over all 99 routes that found the three. |

## In the product (`shots/`)

Driven with Playwright through the real sign-in, the real project and the real tabs.

| File | What it shows |
| --- | --- |
| `cmc-overview.png` | The band on Overview: what the destination is, **What to do now**, and *Next step → Substance & product*. The rail's *Work areas* reaches CMC. |
| `cmc-specs.png` | The band on Specifications, and the row's actions now reading **Edit · Approve · History**. |
| `cmc-stability.png` | The band on Stability, and the register row's **Trend** action beside Estimate Q1E. |
| `cmc-batch.png` | **Process capability** on the screen that holds the batches: Ppk 1.8212, Cpk 1.3353, `CAPABLE`, with the preliminary and Cpk/Ppk-divergence caveats and the ISO 22514-2 citation. |
| `cmc-stability-trend.png` | The trend report under the register: slope 0.0383 per month (not significant), no out-of-trend point, **heading toward `upper limit 1 at 23.37 mo`**, and the note that a projected crossing is evidence for an investigation, not a shelf life. |
| `spec-history-panel.png` | Four recorded changes to one specification, each marked `revision log`, with `acceptance_criteria was 95.0 - 105.0 % → 90.0 - 110.0 %` and the actor named. |

## Tests: shown failing first (`red/`)

- `red/work-area-against-unchanged-surfaces.txt` — the new work-area file against the
  surfaces at the baseline: **9 of 13 fail**, including *"has a client caller, or a named
  door that serves the same purpose"*, which reports the three unreached routes. The
  sweep is seen catching exactly what it exists to catch.
- `red/spec-history-against-unchanged-reader.txt` — the specification-history file against
  the unchanged reader: **18 of 18 fail**.
- `red/spec-update-encoding-against-unchanged-route.txt` — against the unchanged route:
  **5 of 9 fail**; the four that pass are the encoding rule's own arithmetic, which is
  correct in both versions and is asserted so the rule cannot be changed silently.
- `red/spec-row-identity-against-unchanged-mapper.txt` — the identity file against the
  unchanged mapper: **5 of 5 fail**.
- `red/spec-edit-sends-NaN-in-the-running-app.txt` — the strongest one. The same
  Playwright probe that drives Edit → Save, run with the one-line mapper reverted,
  against the running app:

      PUT /api/cmc/specifications/NaN -> 500

  and with it in place, `PUT /api/cmc/specifications/b4e61bbf-… -> 200`.

Two cases failed on my own work and were right to:

- Overview's `now` read *"See how many §3.2 sections are approved"* — guidance that tells
  a client to read a figure. Reworded.
- The measurement rule's first draft flagged *"Module 3 sections"* as a count. "Module 3"
  is a name; the rule now excludes it, because that is how a correct sentence gets
  rewritten to satisfy a wrong check.

## What an adversarial review of this slice found (and what came of it)

Five independent reviewers over the diff — server correctness, honest state, the encoding
fix, launch scope and duplication, test quality — each finding then verified by a reviewer
asked to refute it. **A caveat about that run, recorded because it changes how its output
should be read:** the slice was committed while the review was in flight, so the verifiers'
`git diff HEAD` came back nearly empty and several refutations rest on "not part of this
change / byte-identical to HEAD". Those refutations are unsound, so every raised finding
was re-checked here by hand against the true baseline `50c0280b` (in a separate worktree,
because `git stash` of an already-committed change does nothing — a mistake that briefly
produced a wrong "pre-existing" reading of the launch-scope failure).

Nine were real and are fixed in this slice:

| Finding | What was wrong | Now |
| --- | --- | --- |
| The rewritten history route breaks `tests/schema-contract/cmc-specification-tenant-scope.contract.test.ts` | `data` became an envelope and the orphan row became 404; the contract asserted the array and 200 + `[]` | Contract updated with its reasons, **intent unchanged**; 19/19 green. The route's doc comment said "breaks no caller, because it had none" — true of the product, false of this gate, and corrected |
| The owning tenant read **404 for its own specification's history** | `owned.rowCount === 0`; the driver the route tests run against does not set `rowCount` on a SELECT | `owned.rows.length === 0` |
| …then **503**, because `public.actor_name` is absent in that harness | the name helper was joined inside the history statement, so a missing display-name function failed the whole read | The name is a **separate, optional** query; the history never depends on it, and an unresolved actor still carries `user:<id>` |
| Claiming `/api/cmc/projects` turned `launch-scope-api-gate.test.ts` red | `process-capability` was still in its `NOT_LAUNCH` list | Moved to the served list with the registry's own note. Verified against a clean `50c0280b` worktree: that file has **5 failures at the baseline and 5 with this change** — this slice adds none |
| **The trend panel claimed a trend the engine had not established** | it printed the projected crossing whenever one existed, including for `significant: false` — while `stabilityTrendSentence` writes "not significantly different from zero, so no trend toward the limit is established" into §3.2.S.7 over the same output | One `trendClaim`, branching on significance first exactly as the composer does, used by both the table and the toast |
| A trend report with no series rendered the full panel | method citation, header row, no rows, and a toast pointing at "each of the 0 below" | An honest empty state that says nothing was assessed and nothing is being claimed |
| Process capability flattened both sides into one unlabelled table | one test method run on substance **and** product gave two rows of the same name, keyed by test alone — React keeps one for a duplicate key, so a side silently vanished | Each row names its material and §3.2 section; keyed by `side:test`; the citation read with a guard instead of `find(...)!` |
| A malformed id answered **500** | `id` goes to a uuid column; anything else raises 22P02 | 404, like any other id this tenant does not hold |
| An approval's reason showed as "—" | the revision log has no reason column; the reason is on the signature | `reasonElsewhere` says where it is. A blank beside "Specification approved" reads as an approval given with no reason |

And four about these tests themselves, each closed by showing the mutation it now catches:

- the read-cap case could not fail (the mock ignored `LIMIT`, so `HISTORY_LIMIT + 1` →
  `HISTORY_LIMIT` stayed green while truncation went silent) — `red/spec-history-cap-mutation.txt`;
- nothing asserted the tenant predicate or the bound parameters — `red/spec-history-tenant-mutation.txt`;
- the reachability sweep counted a **collection** call as reaching the route for one
  record, so 37 of 99 routes read as reached on the strength of a list call. Tightened,
  and it immediately found a real one: `PATCH /api/cmc/agency-questions/:id`, which is
  retired and answers 410 — now listed as that, with a case that reads the handler to
  check the claim;
- the "open a program" rule used a 700-character window that skips a longer element, and
  covered one file. Now it parses whole `<EmptyState>` elements across every CMC surface
  — `red/door-rule-mutation.txt`.

One more, and the most important: **a claim in this README was wrong.** An earlier draft
said widening a release limit "was the one edit that could not be made". It was not —
`specUpdateBody` always sends objects, so the form took the working branch; the 500 came
from a `curl` sending a shape the form never sends. Item 7 now says who that caller
actually is. The NaN id (item 6) is what broke the edit from the tab.

## Noted, not fixed here

- `install-fresh.mjs` refuses at its final RLS assertion on this container:
  `public.users` (child of `organizations`) and `public.ctd_cross_references` carry no RLS
  policy at provisioning time. All 806 tables are created and `deploy-migrate` then
  applies the policies, so the install is usable — but the from-scratch path reports
  failure for a state the migration set corrects. Not in this slice.
- Seven QC results recorded with `sampleType: finished_product` were classified under
  `drug_substance` by `batchAnalysisSide`. That may be the mapper's intended fallback or a
  mis-sort; it is recorded rather than claimed, because this pass did not investigate it.
- `POST /sections/:p/:k/refresh` has no client caller and is listed in the test's
  `REACHED_ELSEWHERE` with the door that serves it (`/build-section/:p/:k`, which also
  bridges the compile to its governed artifact). Converging the two is its own change.
