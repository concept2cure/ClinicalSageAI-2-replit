# ANA-SUMMARY S4 — the Summary: live notes and timeline, sealed `/4`, reload by message id, panel and sheet

Slice S4 of `docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md` (§5 S4). Before it, one S3 defect was fixed:
a tool's `{ ok: false, … }` refusal was recorded as a step that succeeded.

The lane is the founder's explicit exception to Rule 2 (design §0). It moves no D-row. The model narrates:
every count on the Summary (steps, sources, did-not-complete, elapsed time) comes from the server's timeline
events. No model is asked for a number.

Binding decisions, as the lead gave them:

| Decision | What was built |
|---|---|
| **3 (A)**: a tool round asks for no visible reasoning, so notes are AnA's words | A gateway request flag, `notesBetweenTools`. `wantsProgressUpdates` is true when thinking is off **or** when this flag is set. On a model that returns notes inside thinking (Opus 5.5, adaptive), the gateway asks for `display: "updates"` instead of `"summarized"`. The stream sets the flag on the first call when tools are offered, and on every follow-up round that offers tools. A forced closing round (no tools) keeps the summarized reasoning. |
| **4 (a)**: notes stay in the answer | The answer body is unchanged. The note is a timeline event built from the same round text the answer streams. |
| **6, as taken**: the Summary is visible to anyone who may read the thread's transcript; the full record stays with the asker and admins | `GET /api/ana-ri/turn-records/:id/summary` allows the asker, an org admin, and anyone who can read the thread's transcript (`chat_threads` or `ai_threads` in the org). Another org gets 404. `?texts=1` and `/export` stay asker+admin. A colleague gets 403 there, with the sentence "The full record is available to the person who asked and to administrators." |

## 1. The S3 defect first: `ok: false` is a refusal, in its own words

`refusalOf` (`server/services/ana/tool-trace.ts`) read only `error`. So `{ ok: false, reason }` from
document-placement, signature and extraction tools was recorded as a step that succeeded. It now returns:

- `error`, when there is one (unchanged);
- otherwise, when `refused` is truthy or `ok === false`: the tool's own `reason`, then its `message`, then the
  server's plain sentence `NO_REFUSAL_SENTENCE`.

One exception: a check whose `ok` **is its verdict** is not a refusal. Such a check did its job. These results
carry `ungroundedClaims`, `validation`, `missingRequiredStrings`, `applied` or `stdout`
(`check_grounding`, `validate_docx`, `verify_docx_against_source`, partial insertions, scripts).
`tool-outcome.ts` (shortfall) and `step-presentation.ts` (`finishedDone`) both read through `refusalOf`, so
there is one reading.

The Model fact now reads **"Model: a model was used in this step"** (`shared/ana/step-verbs.ts`).

## 2. What S4 built

| Part | Files |
|---|---|
| Shared | `shared/ana/turn-timeline.ts` (new): the event types, `readTimelineEvent`, `orderTimeline`, `stepStates`, `timelineHeader`, `formatElapsed` (moved), `stepRecordLink`, `endReasonOf`. `shared/ana/plan-diff.ts` (new): `diffPlan` (moved; the client copy in `anaProgress.ts` is deleted), `TaskIds` (a new id for each appearance of a title, released when the title is removed), `taskChanges`. |
| One producer | `server/services/ana/turn-timeline-emitter.ts` (new): `TurnTimeline.emitTimeline` appends each event to the recorder (`addEvent`) **and** writes `data: {type:'timeline', event}`. So the live view and the sealed record are the same events. It covers the note before a round's steps, `announced` / `awaiting_approval` / `finished` / not-run step events, server-tool steps, `task` events with ids, and `end`. |
| Record `/4` | `turn-record.ts`: `ana-turn-record/4`, `timeline`, `stoppedReason` (derived from the end event), and `RecordedStep` gains `toolUseId`, `handle`, `startedAt`, `endedAt`, `heldBack`, `message`, `usedModel`. Each note is a `TextRef` into the same blob as the round's prose. `turn-record-verify.ts`: note refs are verified, and the list selects `assistant_message_id`. |
| Stream | `stream.ts`: the emitter is wired at each existing point. `client_disconnected` is a closing reason: `TurnPolicy.noteDisconnected` runs only when no Stop already aborted. `run-status.ts`: `stoppedTurnReason`, `endStoppedReason`. `post-processing.ts`: `persistStoppedAnswer` takes the reason. |
| Summary route | `turn-records.ts`: `GET /turn-records/:id/summary` sits behind `recordFor(reach)` and is re-verified on every read. It has no `metaOf`. The payload is an allow-list (`server/services/ana/turn-summary.ts`): `{id, threadId, outcome, startedAt, endedAt, schemaVersion, verdict{ok,reason?}, recordSha256, events, controls (no user id), models (provider, model)}`. The thread list is thread-wide for transcript readers; `actorUserId` is left out for readers who do not hold the full record. |
| History ids | `chat-thread-helpers.ts`: `getThreadMessages` selects `id`. `resolveThreadStore` moved here from `routes/chat/threads.ts` (one copy; the route imports it). |
| Client | New: `TurnSummary.tsx`, `turnSummaryRows.ts` (`orderedItems` moved here, with modes; trace rows for turns recorded before `/4`), `anaSourceGlyphs.tsx`, `components/ana/anaTurnTimeline.ts` (frame handling, the record join, confirm-by-run; the logic `useAnaChat.ts` had no room for). `useAnaChat.ts`: `timeline` frames, `serverId`, the join on reload (`m-<id>` message ids), and "Recording…". `AnaActivity.tsx`: the Summary button. `AnaWorkPanel.tsx`: `turn`. `anaWorkModel.ts`: the `client_disconnected` stop line and Continue. Hosts: `ConversationThread`, `DocumentWorkbench`, `EctdCoauthor`. CSS: the Summary and the sheet; below 760px the sheet replaces the stacked dock. |

## 3. Red → green, by design test

"Red" was captured with the changed sources swapped back to HEAD and the new modules present
(`red/red-swap.sh`; it restores each file and checks it byte for byte, "restored: md5 OK"). Where a test was
added after that capture, or passed at red by construction (a negative), a targeted mutation shows it failing
(`mutations/`).

| # | Test (file › block) | Red | Green |
|---|---|---|---|
| S3 defect | `tool-refusal-ok-false.test.ts` › refusalOf | 4 failed, 3 passed (the 3 are controls) | 7/7 |
| S3 defect | `stream-ok-false-refusal.test.ts` › through the stream route | 1 failed, 1 passed (control) | 2/2 |
| S3 defect | `step-presentation.test.ts` / `stream-step-presentation.test.ts` › model fact wording | 1 + 1 failed | 24/24, 8/8 |
| S3 defect | the two controls (a verdict `ok:false` stays a success) | — | **M8**: both fail under a blanket `ok:false` rule |
| 1 | `stream-turn-timeline.test.ts` › 1. same data live and sealed | 2 failed of 2 | 2/2 |
| 1 | `turnSummary.test.tsx` › 1. rows from live frames = rows from `/summary` | 1 failed | 1/1 |
| 2 | `stream-turn-timeline.test.ts` › 2. notes (one note before steps; no `(Ran:`; no summarized thinking; a ProgressNotes note; decision 3 A) | 4 failed, 1 passed (`(Ran:` — vacuous at HEAD, which has no notes) | 5/5; **M5** fails 3 of them, the `(Ran:` test included |
| 2 | `turnSummary.test.tsx` › notes and the live view | 2 failed of 2 | 2/2 |
| 3 | `turn-summary.pglite.test.ts` › 3. leak: sentinels in the system prompt, model input, a non-note round input, a step input, a result, sentToModel, a tool name, a tool-use id, a requestId, organizationId, actorUserId, a summarized thinking block | 2 failed of 2 (sources at HEAD) | 2/2 |
| 3 | › "the check fails on a route that spreads the record's metadata" | The gate shown failing: it builds the route the first draft had (spreading `metaOf`) and asserts that the leak check rejects it | passes |
| 4 | `turn-summary.pglite.test.ts` › 4. the list names each record's assistant message | 1 failed | 1/1 |
| 4 | `useAnaChat-record-join.test.ts` › reload joins by id; never by position; live frames kept | 2 failed, 1 passed (never-by-position: vacuous at HEAD, which has no join) | 3/3; **M6** (a positional join) fails both join tests |
| 5 | `turn-summary.pglite.test.ts` › 5. access: asker, admin, colleague 200, other org 404; colleague 403 on `?texts=1` and `/export`, told who may; no conversation means 403 | 3 failed of 3 | 3/3 |
| 6 | `turn-summary.pglite.test.ts` › 6. the verdict is recomputed on the read (a broken chain row reads not ok, with a reason) | 1 failed | 1/1 |
| 6 | `turnSummary.test.tsx` › 6. footer: Recorded / Record could not be verified / Not recorded / Recording… | 4 failed of 4 | 4/4 |
| 7 | `stream-turn-timeline.test.ts` › 7. declined, no answer, authorised-then-failed carry `heldBack` and the stepMessage sentence, live and sealed | 3 failed of 3 | 3/3 |
| 7 | `turnSummary.test.tsx` › 7. the rows say those sentences word for word; announced-never-finished says so | 4 failed of 4 | 4/4 |
| 8 | `stream-turn-timeline.test.ts` › 8. a turn cancelled mid-round seals its cancelled step events | 1 failed | 1/1 |
| 8 | `turnSummary.test.tsx` › 8. Stopped. / lost connection + Continue / record's own end / round limit + Continue | 3 failed (round-limit test added later) | 4/4; **M4** fails the round-limit test |
| — | `turnSummary.test.tsx` › her plan (a successful plan update is its task rows; a failed one stays a row; a live turn with no events is working) | added after the red capture | 3/3; **M1**, **M2**, **M3** each fail one |
| — | `turnSummary.test.tsx` › where the Summary opens (button beside the folded line and live phase; no host, no button; phone dialog + Escape) | 2 failed, 1 passed (no-host-no-button: vacuous at HEAD) | 3/3; **M7** fails no-host-no-button |

Totals: `red/red-A-refusal-and-model-fact.txt` 7 failed / 34 passed (41) → `green/green-A-…` 77/77 (6 files).
`red/red-server-sources-at-HEAD.txt` 24 failed / 35 passed (59). `red/red-summary-route-at-HEAD.txt` 6 failed /
1 passed (7). `red/red-client-sources-at-HEAD.txt` 19 failed / 2 passed (21). `red/red-B-…` is the first red
of `stream-turn-timeline` before the emitter existed: 10 failed / 1 passed (11).

## 4. Related suites (all `RLS_ENFORCE=off`, except the DB tier)

| Run | Result | File |
|---|---|---|
| The S4 server suites, plus the files the wide run first failed on (schema pins `/3`→`/4`; `resolveThreadStore` moved into a module that test mocks) | 18 files, 193/193 | `green/green-server-summary-suites.txt` |
| Wide server set (376 files: `server/routes/ana-ri`, `server/services/ana`, `ai-gateway`, chat routes and contracts, `tests/services`, …) after every server edit | 375 passed, 1 skipped; 5328 passed, 3 skipped, 0 failed | `green/green-server-wide.txt` |
| `npm run test:ana` | 4 files, 303/303 | `green/green-test-ana.txt` |
| Every golden journey + `tests/lineage` | 12 files, 37/37 | `green/green-golden-journeys-and-lineage.txt` |
| Client: 100 files, every v2 and `components/ana` suite for AnA, AnaActivity, AnaWorkPanel, useAnaChat and the Summary, after the last edit | 100 files, 1026/1026 | `green/green-client-wide.txt` |
| DB tier: the turn-record dbtests on a fresh CI database, `RLS_ENFORCE=on` (the lead's command) | 2 files, 10/10 | `green/green-db-tier-turn-records.txt` |

## 5. Gates

All passed, with two exceptions. `ci:component-class-coverage` reads the shipped CSS; it passed (0 classes
without a rule) after a `vite build`. `ci:duplicate-exported-types` fails with 17 names, and **none is
from this change**. All 17 come from files this change did not touch. The one changed file in the list,
`step-presentation.ts`, already exports `StepStatus` at HEAD. The gate reports only names above its
baseline, so none of the new exports collide.

Passed: `ci:undefined-css-classes`, `ci:unauthenticated-fetch`, `ci:check-client-api-calls`,
`ci:step-presentation` (608 in-scope tools), `ci:step-presentation:selftest` (20/20), `ci:internals-in-copy`,
`ci:ana-surface-context`, `ci:gateway-bypass`, `ci:action-overclaim`, `ci:success-before-ok`,
`ci:empty-state-honesty`, `ci:fabricated-identity`, `ci:server-error-leaks`, `ci:error-envelope`,
`ci:untracked-imports`, `ci:canonicalizers`, `ci:check-orphaned-stylesheets`, `ci:check-unrun-tests`,
`ci:check-test-imports`, `ci:unreferenced-modules`, `ci:launch-scope-api`, `ci:tenant-entry-points`,
`ci:check-css-selector-shadowing`, `ci:check-shell-css-collisions`, `ci:surface-text-ramp`,
`ci:dead-audit-catch`, `ci:discarded-audit-write`, `ci:tenant-isolation:no-regression` (7 current, 8 baseline),
`ci:check-client-reachability`, `ci:component-class-coverage`, `ci:design-system`, `ci:token-contrast`,
`ci:check-route-collisions`, `ci:audit-route-mounts:no-regression`.

## 6. Lint (ESLint warnings / errors, HEAD → now) and types

See `lint.md`: every changed file, HEAD against now. No file gained a warning. `stream.ts` stays at 23,
`AnaActivity.tsx` at 2 and `turn-record.ts` at 0. `turn-record.ts` sits exactly at its 500-line budget. The
`components/ana` files are outside the ESLint config. Linted with `--no-ignore`, `useAnaChat.ts` is 35 → 35,
and every new file is 0.

Scoped `tsc` over the 50 changed TypeScript files (the repo `tsconfig.json`, `files` limited to them): exit 0
(`tsc-scoped.txt`, config `scoped-tsc-config.json`). The scoped check is shown failing: a planted `const s4Planted: number = "…"` in
`turnSummaryRows.ts` gives TS2322 and exit 2 (`tsc-planted.txt`). The file was restored and md5-checked.

## 7. Browser acceptance

A private instance ran on :5086, using the env of the QA app with PORT, ALLOWED_ORIGINS and the log changed.
A scratch copy of the W1 stand-in model ran on :8809, with S4 plays (`browser/stand-in-s4-plays.diff`) and
`FAKE_SLOW_TOOL=search_literature:20000`. The harnesses are `browser/s4-desktop.mjs` (1440×900) and
`browser/s4-phone.mjs` (390×844). Both import the committed `QA-2026-10-08/rate-limits/scripts/lib.mjs`.
Every SSE frame is teed inside the page. Both servers were stopped afterwards; :5078 was not touched.

| Acceptance item | Shown | Evidence |
|---|---|---|
| Main request, Balanced (<240 chars, thinking off): Summary button opens the side panel at that turn | Yes. Rows: three notes ("AnA's words · not checked" live, "AnA's words" once the check landed), "Searched the Vault · stability", "Listed the Vault documents", "Read \"Vorelinib-Stability-Protocol-STB-0042\"", Added / Started / Completed task rows, "Answered." Header: "3 steps · 1 source · 3s". Every chevron opened its facts (`details` in the JSON). | `s4-desktop.json` › balanced, turns[0].liveSamples; screens 01, 02 |
| After a reload, identical rows; footer "Recorded" with Download, hash in details | Yes: rows and header equal to the settled view, element for element. Footer "Recorded a2598715789e", SHA-256 and Download in its details. | › afterReload; screen 03 |
| Thinking turn (>240 chars, Sonnet 5, summarized reasoning) | Notes still arrive as her words. Its 5 thinking frames go to the Reasoning row, never to a note. | › thinking, turns[1] |
| Thorough turn (Opus 5.5) under decision 3 (A) | Notes shown. Every tool round of that turn asked for `{"type":"adaptive","display":"updates"}`, and the turn had 0 thinking frames. | › thorough; `stand-in-requests-thinking.txt` 0025–0029; screens 06, 07 |
| A stopped turn | "You stopped the run", then "Stopped.". The record is "Recorded". | › stopped; screens 08, 09 |
| A colleague (member, same org) opens the thread | The same Summary, rows identical to the asker's. Its Download says "The full record is available to the person who asked and to administrators." | › colleague; screen 10 |
| Phone: the Summary is a bottom sheet | `role=dialog`, `aria-modal=true`, titled "Summary", 390 wide. Escape closes it. The stacked dock is hidden. Page `scrollWidth` 390. The header chip opens the latest turn. | `s4-phone.json` › turns, chip, overflow; screens 41–48 |
| "Phone locked": the turn stops, the closing row reads "Stopped: this page lost its connection." with Continue | Simulated by **closing the page** mid-turn (no lock screen in headless Chromium). Reopened: the record's `stoppedReason` is `client_disconnected`. The inline note reads "This page lost its connection, so the run was stopped before AnA finished. Continue picks it up." with Continue. The sheet's closing row reads "Stopped: this page lost its connection." with Continue, and the text wraps at 390. | › reopenedStop, lostConnection; screens 49, 50 |
| Round limit, "Stopped at the round limit" + Continue in the Summary | **Not shown in the browser.** Pinned by a unit test (§3, test 8, M4). | — |

The browser error logs (`s4-*-errors.json`) hold three kinds of entry:

- `ERR_CERT_AUTHORITY_INVALID` for an external resource behind the agent proxy;
- `ERR_ABORTED` for reads cancelled when a sheet closed or a page navigated;
- one `AbortError: BodyStreamBuffer was aborted` at Stop. That one is most likely the harness's own fetch tee:
  its reader has no `catch`.

No error came from the Summary.

### What a scripted model cannot show

- Real narration. The stand-in's notes are scripted strings. Whether a real model writes useful notes under
  decision 3 (A), and whether Opus 5.5 really returns progress updates when asked for `display: "updates"`,
  were not tested. Only the request the gateway sends is shown.
- The real cost of decision 3 (A). On Opus 5.5 a tool-using thinking turn now asks for updates instead of a
  reasoning summary, so its Reasoning row is empty for those rounds, the first call included. Whether that
  loses reasoning a reviewer needs is a product question.
- Timing and volume. Three reports of up to 15,000 characters were not available: the seeded project has one
  stability document of 206 characters, so "a read row naming each report" shows one read. A real search query
  ("shelf life") is the model's choice; the stand-in searched "stability".

## 8. Not verified

- A real phone lock or app switch: page close stands in for it. Decision 2 (keep running after the page
  closes) is not built.
- The colleague view at phone width.
- The round limit in the browser (unit test only).
- A crash between the last event and the seal (durability of the in-memory recorder).
- `/summary` under the DB tier with RLS on: the access tests are pglite route tests. No `tests/db` test of the
  new route was written.
- The Rbm host has no Summary. Design §3.2 has Rbm get the button "through the shared mapping"
  (`activityPropsFor`). Here each host passes `onSummary` from its own Summary host (`useSummaryTurn` /
  `useHostSummary`: ConversationThread, DocumentWorkbench, EctdCoauthor), because the button needs a place to
  open the Summary (a dock panel, or the sheet). Rbm is outside the launch catalog and has no acceptance item,
  so it was not wired. The Shell rail that §3.2 names no longer renders AnA turns: `Shell.tsx` and `V2App.tsx` mount no `AnaActivity`. The four
  spinner-only hosts §3.2 excludes have no button, as designed.
- Live controls (approve / deny / stop) during a turn are not merged into the live Summary. They come from the
  record's `controls` once it is sealed, so live they are absent.

## 9. Wide server run

`green/green-server-wide.txt` holds the rerun of the same 376 files after every server edit: 5328 passed, 3 skipped, 0 failed. An earlier run
was 5 failed / 5319 passed (5327). Its 5 failures were mine: schema pins `/3` → `/4`, and the
`resolveThreadStore` move into a mocked module. All were fixed, and the three files are green in
`green-server-summary-suites.txt`.

## 10. Decisions this change made that the lead should confirm

1. **`VERDICT_FIELDS`** exempts a check's own `ok:false` verdict from being read as a refusal. The alternative
   is renaming those tools' `ok` to `verdict`, which touches each tool and its consumers.
2. **`notesBetweenTools` is a gateway request flag**, in `server/services/ai-gateway/`, outside the lane's
   directory set (`server/services/ana/`, `server/routes/ana-ri/`, `shared/ana/`, `client/src/concept2cure/`,
   `chat-thread-helpers.ts`). Decision 3 (A) cannot be met from the stream alone, because the display mode is
   chosen in `applyAnthropicSamplingParams`.
3. **The record list is thread-wide for transcript readers.** A colleague can list a thread's records (with
   no actor) but not by `run_id`. That is what decision 6 implies for the reload join.
4. **`persistStoppedAnswer` takes the stop reason**, so a page that left is stored as `client_disconnected`
   rather than `cancelled`. `TurnStoppedReason` was widened to carry it.
5. **A successful plan update is folded into its task rows** in the Summary. A failed one stays a row with its
   sentence.
6. **The record's 403 wording changed** for the full record: "The full record is available to the person who
   asked and to administrators."
7. **"Recording…" is a flag (`recordConfirming`)** on the message, not a new `turnRecord.status` value.
8. **The conversation header wraps at ≤560px** (`app-v2.css`). It overflowed by 39px at 390, which made
   the sheet 429 wide.
9. **`resolveThreadStore` moved** from `routes/chat/threads.ts` into `chat-thread-helpers.ts`, so the
   Summary route and the chat route share one copy.
