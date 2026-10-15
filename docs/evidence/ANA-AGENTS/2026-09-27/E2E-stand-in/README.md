# Row 74 S1 / S2 / S4 end to end, against a scripted stand-in model (2026-09-28)

**This is not a live model capture.** Every turn below was answered by a
scripted stand-in for the Anthropic Messages API (`harness/stand-in-e2e.mjs`).
It plays a fixed script per scenario, keyed by a phrase in the person's ask.
It refuses what the real API refuses, because it imports the W1 lane's contract
(`docs/evidence/W1/2026-09-28-ana-drive/harness/api-contract.mjs`). Everything
else is real:

- the app (server and client) built from the verified snapshot;
- a fresh PostgreSQL database with the migrations and the GA demo seed;
- headless Chromium clicking the real controls;
- the database rows the turns wrote.

**Row:** 74 (`docs/work-orders/README.md`). **Slices:** S1 (`../S1-stopped-reason/`),
S2 (`../S2-honest-controls/`) and S4 (`../S4-manual-auto/`). Each of those
READMEs says "blocked on the live capture: no model key or database". This folder
closes the **database** half of that. The **model** half is still open (see
"What still needs a real model key"). Nothing here is committed.

## What was run

| | |
|---|---|
| Code | The exported tree of commit `640937815` (S4 + trunk; git tree `739c5aa6`), typechecked and tested by the lane. The app ran **from that snapshot**, not from the shared working tree. |
| Database | `ana_e2e_2`, created for this capture in the local cluster (`c2c-local`, 127.0.0.1:5432). Trial runs used `ana_e2e_1`. Both are left in the cluster. No other database was touched. |
| Schema | `docs/LOCAL_TESTING.md` §1 (`install-fresh.mjs`, then `APPLY_C2C_MIGRATIONS=true apply-c2c-migrations.mjs`), then the **GA demo seed** (`seed-ga-demo.mjs`, i.e. `npm run db:seed`) that LOCAL_TESTING names for Live Drive (line 89) and the IND eCTD path (lines 154–159). §2's `seed-admin` / `seed-local-testing` were not run. See the logs `00`–`03`. |
| Provisioning caveats | **§1's prerequisite was not met: pgvector is not installed on this cluster**, and LOCAL_TESTING says it is required (line 19). `install-fresh` exits 1 on its own verify step, because `public.ctd_module_sections` has no RLS policy. **`apply-c2c-migrations` exits 1**: 314 files applied and 5 failed. Four failed on the missing `vector` extension (`20260730_fix_atom_embedding_dimension`, `20260207_phase6_6a_fda_clearance_universe`, `20260306_precedent_engine`, `20260602_working_memory_embeddings`). The fifth, `db/migrations/20260208_phase6_6a_risk_rollups.sql`, failed as a knock-on: `relation "predicate.fda_510k_clearances" does not exist` (`logs/02`). The seed exits 0. The "Memory: Could not be read" line on every turn comes from this environment, not from S1/S2/S4. The filed telemetry shows client semantic memory as `error` with `memoryStatus unavailable`, in 10–46 ms (`memory.semanticSearchMs` in every `done` frame). The server log (`logs/10`) gives the cause: `403 Host not in allowlist: api.openai.com` (no OpenAI key, and egress is blocked). A "timed out after 3000ms" warning follows each turn about 3 s later, but the turn did not wait for it. The snapshot's `withTimeout` never clears its timer (`memory-context-assembler.ts:25–40`), so the warning fires after the race has already settled. `project_memory_entries` does not exist in this database. It is read once at startup, by the RIM pattern registry, which falls back to its seed patterns (`logs/10`), not on each turn. |
| Stand-in | `harness/stand-in-e2e.mjs` on 127.0.0.1:8797. The app pointed at it with `ANTHROPIC_BASE_URL`. |
| App | `harness/run-app.sh`: `NODE_ENV=development PORT=5077`, with `ALLOWED_ORIGINS=http://localhost:5077` (the dev CORS allow-list names only :5000/:3000) and a throwaway random JWT secret. Model tiering is on (the default). |
| Browser | `harness/drive-e2e.mjs`: playwright-core 1.56.1 and Chromium 141, headless, 1440×1000. It signs in as the GA seed's `jm.smith@concept2cure.pro`. The dev sign-in code is read from the server log, which is where the dev path puts it when no SMTP is set. |
| DB capture | `harness/capture-sql.mjs`, keyed by the `runId` / `thread_id` the browser received. |
| Versions and hashes | `logs/08-versions.txt` |

Exact commands, in order: `logs/00-createdb.txt` … `logs/06-capture-sql.txt`,
and `harness/run-app.sh`. The run started at 18:32 UTC and the server and
stand-in were stopped at 18:40:48 UTC (`logs/11-stopped.txt`). The temporary
CHECK constraint used for scenario 3 is gone (same file).

### What is copied, and why

- **Imported, not copied:** `api-contract.mjs`. The API's refusal rules stay
  single-sourced. Its hash `116cc5d2…` is byte-identical in the snapshot and on
  `origin/concept2cure-v2`.
- **Copied:** the wire half of the W1 `stand-in-model.mjs` (sha256 `27c19a67…`):
  SSE framing, the thinking block, text and tool_use streaming, and request
  saving. That file starts a server when it is imported and exports nothing, so
  it cannot be imported. Its model half (navigation, demos) is not used.
- **New:**
  - the scenario scripts;
  - one JSON log line per request, recording what the server sent;
  - honouring `tool_choice: none` on the loop's closing call;
  - never scripting non-streamed side calls (titles, reflection);
  - a read-tool preference list. The server offers a relevance-ranked 50 tools
    per ask, so the first offered wins; `global_search` was offered every time.
- **Contract checks** (`logs/04-contract-selftests.txt`):
  - the W1 `selftest.mjs`, run unmodified: **25/25**;
  - `harness/wrapper-contract-check.mjs`: refusals pass through this wrapper,
    **4/4**.
  - None of the 52 requests in this capture was refused
    (`logs/09-stand-in-request-log.txt`).

### Changes made during the capture (disclosed)

The six scenarios ran once, in order (`logs/05-driver.txt`). The approval
scenario was then re-run twice:

1. **The first run's task check looked at the wrong column.** It counted rows by
   `title` in every table named `*task*` that has a `title` column. `create_task` writes `project_tasks`,
   with the title in `name`. The driver was fixed and the scenario re-run
   (requests #46–#47).
2. **The stand-in's proposal named no `projectId`.** So a confirmed task could
   not have been written either, and a zero count proved nothing. The stand-in
   now proposes `projectId: 1`. Its request numbering continues across restarts,
   so no saved body was overwritten. The approval scenario was re-run (#49–#50),
   together with a new **positive control** (#51–#52): the same proposal,
   confirmed, writes the row. The zero counts are therefore a check that can
   fail.

The frames, screenshots, SQL and excerpts for `s4-approval` are from the final
run (#49–#50). No product code was changed at any point.

**Which stand-in file ran which requests.** The hash in `logs/08-versions.txt`
(`c35d7072…`) is the stand-in as it ran **from 18:38:15**, that is for #49–#52
only. Requests #1–#48 ran on the earlier file, which was edited at 18:38:02 and
not kept, so its hash and exact diff cannot be recorded. `logs/12-stand-in-replay-check.txt`
(`harness/replay-log-check.mjs`) replays all 52 saved request bodies through the
filed stand-in and compares each log line with the capture's. **50 of 52 are
identical.** The two that differ are #43 and #46, where the filed file adds
`projectId: 1` to the `create_task` proposal. This compares the scripted
decisions and everything logged, not the SSE bytes. The driver was edited at
the same time. Its hash, too, is only the 18:38 version (`logs/08`).

### Corrections after review (2026-09-28, no scenario re-run)

Ten review objections were upheld. Each was corrected in the evidence, and no
scenario needed re-running.

1. S2's claim was restated. The pill sets effort and the output budget. The
   model was routed by the ask, and that is now Finding F4.
2. The round-budget and dossier-reader scripts are filed (`harness/`) and were
   re-run. Scenario 6 is labelled "round budget derived, not observed".
3. Scenario 3's #29 is a side call, not a loop round.
4. The stand-in's pre-edit version is disclosed, with a replay check
   (`logs/08`, `logs/12`).
5. The S1 and scenario 3 note sits under the step summary, above the answer.
6. The memory explanation now rests on filed server-log lines (`logs/10`).
7. Migrations: 4 failed on pgvector and 1 as a knock-on, and
   `apply-c2c-migrations` exited with status 1. The §1 pgvector prerequisite was
   not met, and the citation is now to the GA-seed section.
8. The five task tables checked are named.
9. The Manual hold durations are stated.
10. Every screenshot is captioned as a stand-in (`screens/CAPTIONS.txt`,
    `screens/captioned/`), and `logs/09` is described as the `<time> <json>`
    file it is (renamed from `.jsonl` to `.txt`).

No product code was changed, and nothing was committed.

## Results

Every scenario was driven in the browser, and **every turn was answered by the
scripted stand-in, not a live model**. "Request" numbers refer to
`logs/09-stand-in-request-log.txt`. Each line is `<HH:MM:SS.mmm> <json>`: 52
request lines, plus two `{"up": …}` start-up lines (the start, and the restart
at 18:38:15). It is not bare JSONL. Excerpts of those requests are in
`requests/`. Each screenshot's caption is in `screens/CAPTIONS.txt`. A copy with
the stand-in banner and caption burned in is in `screens/captioned/`.

Two non-streamed side calls with no tools (`max_tokens 700`, AnA's private
reflection after a turn) sit inside turn windows: #29 (scenario 3) and #48 (the
second approval run). The stand-in never scripts them.

| # | Scenario | Result (all: stand-in model) | What the person saw | What the server sent the model | Rows | Artifacts |
|---|---|---|---|---|---|---|
| 1 | **S1** round cap, then Continue | **Shown**, stand-in model | The panel read "Stopped at the round limit · 3s". **Under the step summary ("20 steps completed · in 3s") and above the answer text**: "AnA reached this turn's round limit (20 rounds) before she said she was done." with **Continue**. After Continue, the note stays on the capped turn, Continue is gone (0 buttons), and the new answer follows | Rounds 1–20 went out with tools (#1–#20). #21 carried `tool_choice: {type: "none"}`. #22 is the Continue turn: the message "Continue from where you stopped.", with the **system prompt** carrying "Your previous turn stopped at the round limit (20 rounds) before it was finished. …" | `ana_runs` `finished / max_rounds / current_round 20`. Metadata `stoppedReason max_rounds, rounds 20, runPolicy auto`. The turn record warns "The turn stopped at the round limit after 20 rounds … Run policy: Auto." The Continue run is `no_more_tools` | `screens/s1-round-cap-1-stopped.png`, `-2-after-continue.png` (+ `captioned/`), `frames/s1-round-cap*.{json,txt}`, `requests/s1-round-cap.json`, `sql/s1-round-cap.txt` |
| 2 | **S4 Manual**: hold, Run this step, hold, Do this instead | **Shown**, stand-in model | Before round 2 the strip showed "Waiting for you before the next step", "Next: Global search", "If nobody answers within 10 minutes, the turn ends.", **Run this step**, **Do this instead** and Stop. The header chip and the panel read "Waiting for you". Run this step ran the step. Before round 3 there was a second hold. A steer typed into "Do this instead" replaced the step, and the turn then read "Not run — your steer replaced it: Global search." | #23 → #24 were 0.13 s apart: round 1 is not held. **No request while held.** The holds were short, because the driver answered them: `paused` → `resumed` took **1.331 s** (round 2, frames at 317 → 1648 ms) and **1.328 s** (round 3, 1800 → 3128 ms). #25 went out 1.474 s after #24, after Run this step. #26 went out after Do this instead. Against the stand-in's ~0.13 s turnaround those gaps are meaningful, but they are ~1.3 s windows. The long unanswered-silence evidence (22.4 s) is scenario 5's. #26 carries the unrun step's result `{"redirected":true,…}` and, in the same call, a system message "The person you are working for has redirected you mid-task … Their instruction: Skip that source; summarise what the first two found instead." | `ana_runs` `finished`, 2 control events (`resume`, then `interject`, each `byUserId 1`). Metadata `runPolicy manual`, `policyHolds`: round 2 `continued`, round 3 `redirected`. The turn record has both Manual warnings and round 3 `not_run`, "redirected by the person before it ran" | `screens/s4-manual-{0..4}-*.png` (+ `captioned/`), `frames/s4-manual*.json`, `frames/s4-manual-hold-surfaces.json`, `requests/s4-manual.json`, `sql/s4-manual.txt`, `sql/s4-manual-dossier-reader.txt` |
| 3 | **S4 Manual fails closed** (`MANUAL_UNAVAILABLE`) | **Shown, by an induced environment fault**, stand-in model | The panel read "Stopped: Manual was unavailable". Under the step summary and above the answer text, the note: "Manual needs run control, which was not available for this turn, so AnA stopped where she would have asked you. Next step: Global search. To let her go on, switch to Auto, then Continue." with Continue | #27 (round 1) and #28 (the round-2 step chosen). Then **no further agent-loop call**: the turn ended at the hold it could not make. #29, 136 ms after #28, is a non-streamed side call (AnA's private reflection: `max_tokens 700`, no tools), not a loop round | No `run_started`. 0 `ana_runs` rows for the turn. Metadata `stoppedReason hold_unavailable, rounds 1, runPolicy manual, pendingSteps ["Global search"]`. The turn record (`run_id` null) warns "Manual was asked for, but run control was not available …" and files round 2 `not_run` | `screens/s4-manual-unavailable-1-*.png` (+ `captioned/`), `frames/s4-manual-unavailable*`, `requests/s4-manual-unavailable.json`, `sql/s4-manual-unavailable.txt`, `logs/10-server-log-excerpt.txt` |
| 4 | **S4 Auto** past the old 8-round ceiling | **Shown**, stand-in model | "12 steps completed", with 12 checks narrated. Ended by itself ("Finished") | #30–#42: 12 tool rounds on `claude-sonnet-5`, effort `medium`, then the answer | `ana_runs` `finished / no_more_tools / current_round 12`. Metadata `rounds 12, runPolicy auto` | `screens/s4-auto-{0,1}-*.png` (+ `captioned/`), `frames/s4-auto*`, `requests/s4-auto.json`, `sql/s4-auto.txt` |
| 5 | **S4 Auto never approves**; declined; plus a confirmed control | **Shown**, stand-in model | "Confirm the proposed action … AnA is waiting on this before she goes on." with Cancel and Confirm and run. Nothing moved for 20 s. After **Cancel** (the dialog's decline): "1 step completed · 1 failed" and an answer saying it was declined | #49 proposed `create_task`. **No request for 22.4 s** while it was unanswered. #50 carries `HUMAN_CONFIRMATION_DECLINED … "retry":false`, **plus an "[Adaptation note]"** (Finding 1) | While unanswered: `ana_runs` `awaiting_approval`, `pending_approval=create_task`, no decision. **Five tables were checked**, before, during and after, and held **0** matching rows: `project_tasks` (by `name`, and its total), plus `concept2cure_review_tasks`, `regulatory_tasks`, `unified_tasks` and `submission_tasks` (by `title`). These are the public tables named `*task*` that have a `title` column. The other six public `*task*` tables were **not** checked: `cmc_workflow_tasks`, `cross_module_task_links`, `drafting_tasks`, `task_automation`, `task_dependencies` and `task_templates`. The run ended with `approval_decision denied, byUserId 1`, and the step is `error` / "declined". **Control** (#51–#52): the same proposal, confirmed, gave 0 rows while unanswered, then **1 row in `project_tasks`** (+ its `unified_tasks` mirror) and `approved, byUserId 1` | `screens/s4-approval-{1,2,3}-*.png`, `screens/s4-approval-control-1-*.png` (+ `captioned/`), `frames/s4-approval*`, `requests/s4-approval*.json`, `sql/s4-approval*.txt` |
| 6 | **S2** Deep research on Home | **Shown for effort, output budget and `effortUsed`. The model and thinking are routed by the ask, not the pill. The round budget is derived, not observed.** Stand-in model | The pill went from "AnA Balanced Standard" to "AnA Maximum Deep research" (chosen as "Maximum" in its menu) | The browser sent `effort_level: "thorough", run_policy: "auto"`. `done`: `effortUsed "thorough"`. #45 went out with `output_config.effort "high"` and `max_tokens 8192`. **What the pill decides, on every turn in the capture:** all 9 Standard turns (#1, #22, #23, #27, #30, #43, #46, #49, #51 and their rounds) sent `"medium"` / `6144`, and the one Deep research turn sent `"high"` / `8192`. **What it does not decide:** the model. #45 was `claude-opus-5-5` (`modelTier flagship`) with adaptive thinking, but **6 of the 9 Standard turns were also `claude-opus-5-5` / flagship**, with adaptive thinking on the turn's first call (#23, #27, #43, #46, #49, #51). Only #1, #22 and #30 went to `claude-sonnet-5` (Finding F4). #30 ("Work through twelve checks…") is a different ask from #45 ("Summarise … in depth"), so it is **not a controlled contrast** for the model | The turn record's `model.effort "thorough"`. The round budget is **derived, not logged or observed** (`logs/07-round-budget-derived.txt`, `harness/round-budget.mts`): Deep research + Auto gives a base of 10 and a cap of 20; Standard + Auto gives a base of 6 and a cap of 20. The Deep turn ran **0** tool rounds, so its base of 10 was never exercised | `screens/s2-deep-{0,1,2}-*.png` (+ `captioned/`), `frames/s2-deep*.json`, `requests/s2-engine.json`, `sql/s2-deep.txt`, `logs/07-round-budget-derived.txt` |
| — | Hold expiry (10 min), page closed during a hold, Stop during a hold, approval timeout, Auto's 15/40-minute ceilings | **Skipped** | Not run, for time (10+ minutes each); the brief allowed skipping hold expiry | — | — | — |

**How scenario 3 was produced.** The condition was produced without editing
product code. For that one turn, `ana_runs` refused new rows:
`ALTER TABLE ana_runs ADD CONSTRAINT e2e_refuse_new_runs CHECK (false) NOT VALID`,
dropped straight after in a `finally`. `beginRun` threw, and the stream took its
own existing branch ("run control unavailable": no run row, a local-only
handle), so `isHoldable` was false. This is the "no run row" case. The two other
routes to `MANUAL_UNAVAILABLE`, a run with no owner and a hold write that fails
mid-turn, were not produced.

## Findings

These are recorded, not fixed. No product code was changed.

**F1 — A person's "no" is fed back to the model as a failure to work around
(medium, governance).**

In request #50 the declined action's result says `"retry":false` ("She must not
try again inside this turn", `stream.ts:1878`). The same user turn then carries:

> [Adaptation note] 1 of 1 tool call failed this round: Executing platform
> command: create_task — declined. Do not repeat a failed call verbatim — adapt:
> narrow or vary the input, try an alternative tool, or continue and state
> plainly what could not be verified.

How it happens:

- A decline sets `toolStatus = 'error'` (`stream.ts:2065`).
- Round failures exclude only `'cancelled'` (`stream.ts:2208`).
- The comment above that line gives exactly this reason for excluding a
  person's Stop: telling her to work around it "would invite her to do the very
  thing she was stopped from doing" (`stream.ts:2203–2207`).

The same classification shows the decline as a failure:

- the transcript reads "1 step completed · 1 failed";
- the turn record's step reads `status error`, `error declined`.

The gate would still put any new governed attempt to the person, so this is not
a bypass. But it directly contradicts `retry:false`. With a real model it
invites a second proposal of what the person just refused, perhaps through
another tool. Evidence:

- `requests/s4-approval.json` (request 50);
- `screens/s4-approval-3-after-decline.png`;
- `sql/s4-approval.txt`.

**F2 — While AnA waits on the person, other surfaces say she is working (low,
UI honesty).**

- **During a Manual hold**, the run strip, chip and panel all say "Waiting for
  you". The Live Drive strip still says **"AnA is driving"**, with Take over and
  Stop (`frames/s4-manual-hold-surfaces.json`,
  `screens/s4-manual-1-hold-before-round-2.png`, bottom). S4 fixed the chip and
  panel (review 7, 8), but not this strip (`LiveDriveOverlay.tsx:120`).
- **During an approval wait** (not in S4's scope), only the dialog says she is
  waiting. Everything else says she is working
  (`screens/s4-approval-2-still-waiting-20s.png`):
  - the run strip: "Working";
  - the panel: "Still working · 22s";
  - the header: "Working";
  - the step: "running";
  - the Live Drive strip: "AnA is driving".
- In the same screenshots, the Live Drive strip covers the composer foot's
  "Applies to your next message" hint.

**F3 — The Home engine menu is clipped, so Standard cannot be chosen with a
pointer (low, S2's control).**

- `.landing-composer` has `overflow:hidden` (`surfaces-v2.css:14`), and the
  menu opens upward inside it (`surfaces-v2.css:36`).
- Hit test (`frames/s2-deep-menu-hit-test.json`): the first option, "Balanced"
  (Standard), sits at y=374, above the composer's top at y=447. The element at
  its centre is the program card (`landing-segctx`). "Maximum" (Deep research)
  loses its label.
- So a person who picks Deep research or Quick ask on Home cannot pick Standard
  again with a mouse there. The keyboard still works: the driver restored it
  with focus and Enter.
- The menu names the engines by model word (Balanced / Maximum / Instant),
  never by the pill's words (Standard / Deep research / Quick ask). S2 handed
  on the pill's wording (objection 7). The clipping is not in S2's README.
- Evidence: `screens/s2-deep-0-engine-menu.png`.

**F4 — The Standard pill says "Balanced", but a flagship model served most
Standard turns (low, S2 honesty; S2's objection 7 seen live).**

- With the pill reading "AnA Balanced Standard" (`screens/s4-manual-0-home-manual.png`),
  6 of the 9 Standard turns in this capture went out on `claude-opus-5-5`,
  `modelTier "flagship"`, with adaptive thinking on the turn's first call:
  #23, #27, #43, #46, #49 and #51. Their `done` frames say
  `effortUsed "balanced"`, `modelTier "flagship"`, `model claude-opus-5-5`
  (`frames/s4-manual.json`, `frames/s4-manual-unavailable.json`,
  `frames/s4-approval.json`, `frames/s4-approval-control.json`). Only #1, #22
  and #30 went to `claude-sonnet-5`.
- The tier is routed by the ask, not by the pill. In the snapshot's
  `resolveModelTier` (`server/services/ai-gateway/reasoning.ts:202–216`), high
  risk goes to flagship "whatever the effort", and a Balanced turn reaches
  flagship by no other route. So these asks were classed as high risk. That is
  inferred from the code; the risk tier itself is not in the filed frames. Two
  of these turns show "Reading this as an audit" in the transcript
  (`frames/s4-manual-1-hold.txt`, `frames/s4-approval-1-approval-prompt.txt`).
- The routing may well be right: only an approved-for-high-risk model may serve
  high-risk work. What is wrong is the word. The pill's "Balanced" misstates the
  model that served. This is S2's handed-on objection 7 ("the pill's 'model'
  word can misstate the tier that serves", `../S2-honest-controls/README.md`,
  line 133), seen here on a live screen.
- The only settings the pill decided on every turn were
  `output_config.effort` (`medium` / `high`) and `max_tokens` (`6144` / `8192`).

### Observations (by design, environmental, or out of this lane)

- **Under Auto the pill does not change the round ceiling.** It is 20 whichever
  engine is chosen: the pill moves the base (6 or 10), the API effort and the
  output budget, not the cap. The model is routed separately (F4). This is S4's
  declared cost change, stated here so nobody reads S2 as "Deep research gets
  more rounds" under Auto. The round figures are derived from the snapshot's
  functions (`logs/07`), not observed.
- **A misleading memory timeout line (environmental trigger, product code).**
  `withTimeout` in `server/services/memory-context-assembler.ts:25–40` never
  clears its timer. So "[memory-context] Semantic search timed out after 3000ms,
  using fallback" is logged about 3 s after every turn, although the retrieval
  had already failed in 10–46 ms (`logs/10`). The turn is not slowed. The log
  line misleads anyone diagnosing latency. Outside this lane; recorded, not
  fixed.
- **A stopped turn's record outcome still reads `answered`.** This holds for
  `max_rounds` and for `hold_unavailable`. The stop is in the record's warnings,
  `metadata.stoppedReason` and `ana_runs.stopped_reason`. This is S1's
  documented choice; the `incomplete` status was handed on.
- **Round narrations are saved with no separator** ("Checking source
  1.Checking source 2."). The narration a model wrote beside a step that never
  ran stays in the answer. Examples: "Source 2 of 2." in scenario 3 and
  "Readiness source 3." in scenario 2. The note or the "Not run" line beside it
  says the step did not run.
- **The approval decision is not a control event.** It is on
  `ana_runs.approval_decision` (who and what) and in the step's error. It is not
  in `ana_runs.control_events` (0) or the turn record's `controls`. Other audit
  tables were not checked.
- **The dossier was not rendered.** The lineage dossier and trace report are
  **document-scoped** (`/documents/:artifactId/lineage-dossier`), and these
  conversations made no document. `sql/s4-manual-dossier-reader.txt`
  (`harness/dossier-holds.mts`) applies the dossier's own reader
  (`policyHoldsOf`) to the saved row: 2 holds, 0 unreadable. That is
  supplementary, not end to end.

## What this proves, and what it does not

**It proves**, on the real app and database, with a scripted model:

- S1's stop reaches every layer:
  - the `done` frame;
  - the run row;
  - the message metadata;
  - the turn record;
  - the work panel and the note;
  - Continue, on the latest turn only.
- The Continue turn's request carries the stopped-turn note, in the system
  prompt.
- Manual holds on a real run row, and no model call is made while it is held.
  The observed holds were about 1.33 s each, because the driver answered them
  at once. Silence over a longer unanswered wait was observed only for an
  approval (22.4 s, scenario 5).
  - Run this step is the person's own `resume`.
  - Do this instead is a steer that replaces the step: the step is not run, and
    the model gets the redirect and the steer in the same call.
  - Both holds are kept in `policyHolds` and in the turn record.
- Manual with no run row fails closed at the first hold, with the unrun step
  named. No further agent-loop call is made. The one later call, #29, is a
  non-streamed side call with no tools.
- Auto runs past 8 rounds. It stops at 20 with `max_rounds`, or earlier when the
  model stops.
- Auto does not approve. The governed write waits for a person, and nothing is
  written while it waits. A decline writes nothing, and a confirmation writes
  the row: the positive control.
- S2's pill sets what the server records and sends for effort:
  `effort_level` → `effortUsed` → `output_config.effort` and `max_tokens`
  (`medium` / `6144` on all 9 Standard turns, `high` / `8192` on the Deep
  research turn). **It does not set the model or thinking.** Those are routed
  by the ask, and a Standard pill served `claude-opus-5-5` with adaptive
  thinking on 6 of 9 turns (F4). It does not show the round budget in use
  either: that is derived from code (`logs/07`), and the Deep turn ran 0 rounds.
- All 52 requests conform to the Messages API contract as the W1 lane encoded
  it.

**It does not prove:**

- **How a real model behaves.** Whether a real model:
  - keeps finding new work until the cap;
  - uses the stopped-turn note sensibly on Continue;
  - follows "Do this instead";
  - or, given F1's note, re-proposes a declined action.
- **The skipped paths:**
  - hold expiry;
  - a page closed or Stop pressed during a hold;
  - an approval timeout ending a policy turn;
  - Auto's time ceilings.
  At about 0.15 s per round, no time ceiling was approached.
- **The other hosts.** The rail, the docks and project-scoped conversations
  were not driven; every turn here started on Home and continued on the
  conversation screen.
- **Production posture.** It does not cover RLS enforcement, Redis, pgvector
  or real SMTP sign-in.
- **The dossier and trace report** rendering `policyHolds` (document-scoped;
  not reachable here).

## What still needs a real model key

- The same six scenarios with `ANTHROPIC_API_KEY` set and no
  `ANTHROPIC_BASE_URL`. `drive-e2e.mjs` can be reused. The asks are ordinary
  sentences, but a real model will not follow the script, so each turn's
  rounds, holds and redirects must be read from the frames and rows rather than
  predicted.
- **F1 in particular:** whether a real model, given the adaptation note after a
  decline, proposes the action again.
- **The lane's own live-capture list** (`../S4-manual-auto/README.md`,
  "Status"): a hold left to expire, and one ended by closing the page.

## Re-running

```sh
SNAP=<snapshot tree> OUT=<scratch> DB=<fresh db> harness/run-app.sh
OUT=<this folder> STATE=<scratch>/state.json SERVER_LOG=<scratch>/server.log \
  DATABASE_URL=postgresql://postgres@127.0.0.1:5432/<db> \
  node harness/drive-e2e.mjs s1-round-cap s4-manual s4-manual-unavailable s4-auto s4-approval s4-approval-control s2-deep
OUT=<this folder> DATABASE_URL=... node harness/capture-sql.mjs <same scenario ids>
node harness/request-excerpts.mjs <scratch>/requests <out.json> <n>[:label] ...

# Derived and supplementary checks (run from the snapshot so its tsconfig paths resolve)
cd <snapshot tree> && SNAP=$PWD npx tsx <this folder>/harness/round-budget.mts                 # logs/07
cd <snapshot tree> && SNAP=$PWD DATABASE_URL=... npx tsx <this folder>/harness/dossier-holds.mts <thread_id>   # sql/s4-manual-dossier-reader.txt

# The stand-in version check (logs/12) and the captioned screenshots
API_CONTRACT=<W1 api-contract.mjs> node harness/replay-log-check.mjs <scratch>/requests logs/09-stand-in-request-log.txt 1 52
node harness/caption-screens.mjs                                                                # screens/captioned/ from screens/CAPTIONS.txt
```

The capture-time versions of `round-budget.mts` and `dossier-holds.mts` were
throwaway scripts in the snapshot tree (`.e2e-budget.mts`, `.e2e-holds.mts`).
They were not kept. The filed scripts replace them. Re-run on 2026-09-28 against
the same snapshot and database, they gave output identical to the originals.

`harness/stand-in-e2e.mjs` needs `API_CONTRACT` pointing at the W1
`api-contract.mjs` until that folder is on this branch. The default is the
relative path to it.

## Files

| Path | What it holds |
|---|---|
| `screens/` | 17 screenshots, `<scenario>-<step>.png`, of the real app answered by the **scripted stand-in model, not a live model**. None carries an in-app stand-in marker (the Home screens show none), so use the captions |
| `screens/CAPTIONS.txt` | One caption per screenshot, each under the stand-in header |
| `screens/captioned/` | The same 17 screenshots with a "SCRIPTED STAND-IN MODEL, NOT A LIVE MODEL" banner and the caption burned in (`harness/caption-screens.mjs`); the originals are unchanged |
| `frames/<scenario>.json` | Every `/api/ana-ri/stream` request body the browser sent, and every SSE frame it received except text deltas. They were captured by a fetch tee installed before the app loaded |
| `frames/*.txt` | The page's visible text at each screenshot |
| `frames/s4-approval*-tasks.json`, `-after-20s-unanswered.json` | Task-row counts for the five tables checked (scenario 5) and the run row at each point |
| `requests/<scenario>.json` | Excerpts of what the server sent the stand-in: settings, plus every message from the ask on, trimmed. Full bodies are about 100–170 KB each and are not filed |
| `sql/<scenario>.txt` | `ana_runs`, `chat_messages` (with metadata) and `ana_turn_records` (hash-checked) rows |
| `logs/` | `00`–`03` provisioning, `04` contract checks, `05` driver, `06` SQL capture, `07` the derived round budget, `08` versions and hashes (with which stand-in version ran which requests), `09` the stand-in's request log (`<time> <json>` per line: 52 requests plus 2 start-up lines, not bare JSONL), `10` server-log excerpts (scenario 3's fault, the memory lines, the startup `project_memory_entries` read), `11` shutdown, `12` the stand-in replay check |
| `harness/` | Used to drive the capture: `stand-in-e2e.mjs`, `drive-e2e.mjs`, `capture-sql.mjs`, `request-excerpts.mjs`, `wrapper-contract-check.mjs`, `run-app.sh`. Added after it, for review: `round-budget.mts`, `dossier-holds.mts`, `replay-log-check.mjs`, `caption-screens.mjs` |
