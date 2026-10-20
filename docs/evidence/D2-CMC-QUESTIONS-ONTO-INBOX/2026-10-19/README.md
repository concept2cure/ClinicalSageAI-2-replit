# D2, D5: CMC / Module 3's agency questions are the letter's record

**Rows:** D2 (CMC / Module 3 and Communication, launch apps without an ungoverned store) and D5 (Part 11 record
integrity). **Date:** 2026-10-19. **Base:** `99acc88d` (slice 1, commitment fulfilment, merged).
**Decisions:** P-38 (agency questions have one home, the letter) and P-39 item 1 (`reg_questions` converges first),
`docs/LAUNCH_DEFINITION_OF_DONE.md`. Both were taken before this slice; nothing here reopens them.

## What was wrong at `99acc88d`

CMC kept a second home for agency questions: its own file, `reg_questions`, behind `/api/cmc/agency-questions`.

| # | Defect | What a person could do |
|---|---|---|
| 1 | **A question was closed by a status update.** The CMC Program records card logged a question, assigned it, sent it "for review", linked an authoring draft and closed it, each a `PATCH` of `status` with no signature, no reason and no ledger row. | Close an agency question with one click, with nothing recording who answered it or what was answered. |
| 2 | **Two homes, two overdue rules.** The same questions are recorded on the letter (`agency_communication_questions`), where a response is approved by a Part 11 signature. The Module 3 board counted "information requests overdue" from the CMC file by its own rule (`due_date < current_date` on a hand-set status), and the Overview, the per-tab signposts and AnA read that count. | See "2 information requests overdue" in CMC while the letter that carries them is answered and signed, or the reverse. |
| 3 | **The runtime role held INSERT, UPDATE and DELETE on the file**, and two dead writers remained: `gmailIngestToReg` (no caller; columns the table does not have; it read another tenant's newest submission) and a ga-demo seed branch. | Write the file from any path, including one nobody had reviewed. |
| 4 | **The Overview promised what CMC cannot do**: "I'll draft the responses and route the sign-offs with you", and "Draft the overdue IR responses" asked AnA for drafts with no letter pinned. A response is signed on its letter. | Be told sign-offs would be routed from a screen that holds no signature. |

## The change

CMC reads a program's agency questions from their letters and shows Module 3's view of them. It writes nothing about
them: every record, answer, approval and close happens on the letter, in Communication. The earlier file is
read-only, in the route and in the database, and is shown as history.

| Piece | File |
|---|---|
| `ctd_section` on the canonical question, with a CHECK admitting exactly what the repository's one CTD rule stores (`normalizeCtdCode`, `^[1-5](\.[0-9A-Z]+)*$`, ≤ 40), added only when `pg_constraint` lacks it. Amended in place with a dated note (the file's own rule; Rule 1). Classification only: the approval digest is unchanged. | `migrations/20261018b_agency_response_questions.sql` |
| The earlier file refuses every INSERT, UPDATE and DELETE by a row trigger and every TRUNCATE by a statement trigger, for every role a trigger fires for, the owner included (`CREATE OR REPLACE`, inside a `to_regclass` guard). As first written it left DELETE to the owner; the review made the file say what URS-CMC-030 says (below). A purge door is owed and amends this file. eCTD audit header; set entry after `20261019_stability_shelf_life_signature.sql`, before the tail sweeps. | `migrations/20261019b_reg_questions_read_only.sql`, `scripts/db/migration-set.mjs` |
| The runtime role's ceiling on the file is SELECT (the half a trigger cannot hold: `UPDATE … WHERE false`, replica mode). | `scripts/db/provision-app-role.mjs` (`APPEND_ONLY_TABLES`) |
| Overdue has one definition, a property of the letter: response-required, not closed, its due date's UTC day before today, and its questions not all approved as they stand (`closeRefusal`). A question is overdue only when its letter is and it is not answered as it stands. `ctdCodeWithin` matches CTD codes by whole segment. | `server/services/agency-responses/response-logic.ts`, `shared/regulatory/section-code.ts` |
| One module's view of a project's questions: classified by the question's section, then the letter's linked codes, then (Module 3) the CMC discipline; what cannot be placed is counted, not dropped; Module 3 letters with no question to answer (none, or only withdrawn ones) are named; counts are of every row read, the list is capped. Each overdue-letter count means one thing: the letters the overdue questions are on (`lettersOverdue`), Module 3 letters with nothing to answer past their date (`lettersWithoutQuestionsOverdue`), letters overdue only on their other questions (`lettersOverdueOnOtherQuestions`). "Outstanding" is decided once, per question (`outstanding`). Each question carries its owner. | `server/services/agency-responses/module-view.ts` (new) |
| `GET /projects/:projectId/agency-questions?ctdModule=1..5`: letters the person may not see are dropped before anything is counted and their number returned as `withheld`. `POST …/questions` takes `ctdSection` (400 `BAD_SECTION`); `PATCH …/questions/:questionId` corrects it with a reason (ledger records from and to). `PATCH …/questions/:questionId/owner` sets or clears who owns the response, with a reason (an active member whose role may open the letter at its visibility tier; 400 `OWNER_NOT_MEMBER` / `OWNER_CANNOT_SEE_LETTER`; ledger records from and to). `GET …/questions` reports `letter.overdue`, the same verdict. The one question reader gains a project-wide literal statement. | `server/routes/c2c/agency-responses.ts`, `server/services/agency-responses/response-service.ts` |
| `/api/cmc/agency-questions`: GET lists every row of the organisation as stored (status verbatim, dates as stored text, no closure date, counts from the store); POST and PATCH answer 410 `CMC_QUESTION_FILE_READ_ONLY` with no query. The Module 3 board serves no correspondence. | `server/routes/cmc-agency-questions.routes.ts`, `server/routes/cmc-module3-board.routes.ts`, `server/bootstrap/register-core-routes.ts` (comment) |
| CMC reads both once, at the module root, and provides them: the Overview figure (per program, `—` when not read, never 0), the per-tab signposts (whole segments), the Program records index (read-only, one door per row: "Open on its letter"), the earlier-file history, and AnA's facts (only when measured). | `client/src/concept2cure/v2/surfaces/cmcAgencyQuestions.tsx` (new), `client/src/concept2cure/v2/surfaces/CmcModule.tsx` |
| The door: `stashNavParamsForTarget('communication-center', { letterId, questionId })` (the channel slice 1 uses); Communication consumes it once, shows the inbox with every owner, opens, scrolls to and focuses that letter's card, marks the question; an absent letter is said to be absent. | `client/src/concept2cure/v2/surfaces/CommunicationCenter.tsx`, `client/src/concept2cure/v2/surfaces/AgencyInbox.tsx` |
| On the letter: the Record question form takes a CTD section; a "Record section" form (or "Correct section" once one is recorded), with a reason; the § chip; the owner chip and a "Set owner" / "Change owner" form, with a reason; the letter's overdue verdict in the server's words, saying "with no question recorded" when that is what made it. The response-state words and chip tones are one map shared with CMC (`agencyQuestionState.ts`). The inbox's day count reads UTC calendar days (`shared/utils/utc-day.ts`, the server's `utcDay`). | `client/src/concept2cure/v2/surfaces/AgencyResponses.tsx` |
| Dead writers removed: the Gmail ingest (and the module's own pool), the ga-demo seed branch; the staff simulation's steps 23–25 rewritten onto the letter. | `server/src/services/integrations/gmail.ts`, `scripts/seed/ga-demo.d/80-programs-tlf-pdev.mjs`, `scripts/dev/cmc-staff-simulation.sh` |
| Ratchets shrunk in the same change: four insert-columns entries, `reg_mail_ingest`, and the gmail.ts / rpi.ts entries (rpi.ts was deleted in 7c1bbcfd and its entries still stood). | `scripts/ci/insert-columns-baseline.json`, `unkeyed-request-tables-baseline.json`, `unbacked-tables-baseline.json`, `tables-live-schema-baseline.json` |
| Validation: URS-CMC-030 (URS-007 v1.1); OQ-CMC-42, scripted (OQ-008 v0.9), with its runner module; VSR-001 §20. | `docs/validation/URS-007-CMC-MODULE-3.md`, `docs/validation/OQ-008-CMC-MODULE-3.md`, `tests/validation/oq/cmc/steps-correspondence.mjs`, `tests/validation/oq/cmc/run.mjs`, `docs/validation/VSR-001-VALIDATION-SUMMARY-REPORT.md` |
| Documents: a dated sentence under P-39 item 1; the gap analysis ("Five" stores remain; `reg_questions` converged, read-only); both D2 Owed sections. | `docs/LAUNCH_DEFINITION_OF_DONE.md`, `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md`, `../../D2-CORRESPONDENCE-SIGNED-RESPONSES/2026-10-18/README.md`, `../../D2-CORRESPONDENCE-SIGNED-RESPONSES/2026-10-18-review/README.md` |

**What CMC shows for the earlier file.** A card headed "Earlier CMC question file · read-only history,
organization-wide": "Questions recorded in CMC, across the organization, before agency questions moved onto the
letter (2026-10-19). This file is read-only. Nothing moves these onto a letter: record a question still open here on
its letter in Communication, by hand." Each row: what it holds (`Recorded {date}; status {STATUS}, last changed
{date}.`), "Closed by a status change, not a signed approval." for a CLOSED row, and for any other "Record it on its
letter in Communication. It will still read {STATUS} here: nothing writes this file any more." Its due date is shown
as recorded and is never called overdue. A linked authoring document is labelled "Linked draft document (not an
approved response)". The Overview says "The earlier CMC question file (organization-wide, read-only) holds N
questions not closed there. They are not in this figure, and nothing moves them onto a letter: record each one still
open on its letter in Communication." It never counts them, and while the file holds any, or its read failed ("could
not be read; whether it holds open questions is not known"), the Overview gives no all-clear.

**The ledger surface label.** Section corrections and owner changes go through `governedWrite`, which records surface
`communication-center`. That is where the act happens: CMC has no write of its own.

## Proof

PostgreSQL 16.15 with pgvector, `c2c_test`, migrations applied by `deploy-migrate`. Database suites ran as
`app_service` (NOSUPERUSER, NOBYPASSRLS) with `RLS_ENFORCE=on`.

| Run | Result | File |
|---|---|---|
| Red: the new and changed tests on the unchanged code | unit/route/pglite/client: 19 failed (18 for the behaviour pinned, 1 already failing on HEAD); database: 17 failed. The unchanged legacy POST answered 201 and wrote a row in the run's own tenant (removed as the owner afterwards, `legacy-row-count.txt`). | `red.txt` |
| Green: 95 unit/route/pglite/client files that name a touched module | **1465 passed**, 7 skipped, 3 failed, each failing identically on HEAD (below) | `green.txt` |
| Green: 9 real-PostgreSQL suites (new, grant ceiling, signed responses, commitment fulfilment ×2, domain history, tenant purge, turn-record purge, Module 3 history) | **188 / 188 passed** | `green.txt` |
| `deploy-migrate` twice | both exit 0; the CHECK, the trigger and its function once each; `app_service` holds SELECT only on `reg_questions`; both tables forced RLS with `tenant_isolation_policy` | `migration-replay.txt` |
| `npm run -s typecheck` | exit 0, no errors | `typecheck.txt` |

**Each protection removed, one at a time; every one was caught by the assertion it exists for, and the tree (and,
for 1 and 2, the database) was restored and checked:**

| # | Protection removed | Caught by | File |
|---|---|---|---|
| 1 | The database refuses a write for every role: the trigger dropped (the state a deploy without the file would leave); one `deploy-migrate` re-arms it | the owner's INSERT ran (`{ ok: true, rowCount: 1 }`), expected P0001 | `mutation-1-database-refuses-owner-write.txt` |
| 2 | The runtime role is SELECT-only: the `APPEND_ONLY_TABLES` entry removed, grants re-run | `UPDATE … WHERE false` and `DELETE … WHERE false` ran, INSERT reached only the trigger; 6 grant-ceiling cases failed too | `mutation-2-runtime-role-select-only.txt` |
| 3 | The CMC read honours letter visibility: the `canView` filter removed | a `restricted_legal_sensitive` letter's question was listed to a viewer | `mutation-3-module3-read-honours-letter-visibility.txt` |
| 4 | An approved answer is never overdue: `questionOverdue` ignores the state | 3 unit cases, including "an approved answer on an overdue letter is never counted overdue" | `mutation-4-approved-answer-never-overdue.txt` |
| 5 | The section filter matches whole segments: `ctdCodeWithin` by string prefix | the unit case (3.2.P.50 is not under 3.2.P.5) and the client signpost (3.2.S.20 is not 3.2.S.2) | `mutation-5-section-filter-whole-segments.txt` |
| 6 | The legacy write route answers 410: a writing POST restored | 500 where 410 was expected, with a query issued | `mutation-6-legacy-post-answers-410.txt` |
| 7 | CMC writes nothing about agency questions: the index door also PATCHes the earlier file | the after-each check: `[['PATCH', '/api/cmc/agency-questions/1', …]]`, expected none | `mutation-7-cmc-issues-no-question-write.txt` |
| 8 | Communication opens the linked letter: the link not passed to the inbox | 3 cases: the letter not opened, the absent letter not said | `mutation-8-communication-opens-linked-letter.txt` |
| 9 | The database refuses a section the CTD rule would never store: the CHECK made vacuous | `foo` accepted, expected 23514 | `mutation-9-ctd-section-check.txt` |
| 10 | AnA is told the figures only once measured: facts spread while loading or failed | 3 cases, facts present while in flight and after a failed read | `mutation-10-ana-facts-only-when-measured.txt` |

**Failing on HEAD and not this slice's** (recorded, not fixed by deleting a case): specialistHandoffInteraction
"CMC change retains doc, project and code at actual navigation" (`/Describe the change/` not found); anaDrivesWave5
"CmcModule — open-tab drives the real pane swap"; anaDrivesWave4 "DocumentAuthoring — authoring.find …". The last two
were run against HEAD's versions of the four client files this change touches and fail the same way. Also pre-existing
and corrected because this change edits the list it pins: `server/db/__tests__/provision-app-role-append-only.test.ts`
failed on HEAD because it omitted `agency_question_response_revisions` (added to `APPEND_ONLY_TABLES` on 2026-10-18);
it now names that store and `reg_questions`, each with its reason.

## Review (2026-10-19)

Reviewers filed **23 findings**, and two skeptics tried to refute each. All 23 survived at standing 2 (confirmed by
both); none was split. They are **16 distinct defects**, several filed more than once from different lenses. All 16
were re-checked against the tree and are real, and all 16 are fixed; nothing is left under "not fixed". Each fix has
a test that fails without it: the fix was removed, the run saved with a header naming what was replaced, and the file
restored byte-identical (sha256 in each header). 18 mutation runs (`mutation-review-*.txt`), every one exit 1, caught
by the test named.

| # | Defect (findings) | Fix | Test that fails without it | File |
|---|---|---|---|---|
| 1 | **An approved Module 3 answer on a letter overdue only on another discipline's question was a Module 3 overdue letter, narrated as "no question recorded", and its door opened Program records** (findings 1, 6, 9, 20; major). `lettersOverdue` counted any Module 3 letter that was late, and the Overview read `questionsOverdue 0, lettersOverdue > 0` as "no question recorded". The client fixture never produced the server's shape. | `module-view.ts`: each overdue-letter count means one thing, and a letter lands in at most one: `lettersOverdue` (the letters the overdue Module 3 questions are on), `lettersWithoutQuestionsOverdue` (Module 3 letters with nothing to answer, named), `lettersOverdueOnOtherQuestions` (said as that on the tile and the index, never as Module 3 overdue). `CmcModule.tsx`: the urgent lead, its door and `findingCount` read only the first two. The client fixture counts as the server does, and `serverModule3` runs the server's own `moduleQuestionsView` for the cases that turn on it. | `module-view.test.ts` (3 cases), `cmcCorrCrossLinks.test.tsx` ("what the server counts is said as what it is", 3 cases, and the index case) | `mutation-review-1-…`, `mutation-review-2-…` |
| 2 | **A Module 3 letter whose only question is withdrawn was counted overdue and "not counted (no CTD section)"** (finding 7). | `addLetter`: a letter with nothing to answer is named in `lettersWithoutQuestions` when its own codes or a withdrawn Module 3 question place it (sections from both; "CMC discipline, no section" when only the discipline did); "not counted" only when nothing at all placed it. The list's label says "(none, or only withdrawn ones)". | `module-view.test.ts` (2 cases), `cmcCorrCrossLinks.test.tsx` (withdrawn-only letter) | `mutation-review-3-…` |
| 3 | **Questions with no CTD section and overdue letters with nothing recorded were added together and called questions with no CTD section** (findings 4, 10; tile and AnA). | `Module3Figure` has no sum. The tile and AnA's sentence say "N outstanding questions with no CTD section not counted" and "M overdue letters with no question or section not counted" separately. | `cmcCorrCrossLinks.test.tsx` ("says what it did not count, each as what it counts"), `cmcSurfaceContext.test.tsx` (2 cases) | `mutation-review-4-…` |
| 4 | **An earlier file that was loading or failed to read counted as zero open rows: the Overview turned "good" and reassured, and said nothing of the file** (findings 3, 22). | `questionsComplete` requires `earlierOpen === 0` (null is not complete); `earlierFileState` tells a failed read from a loading one; the Overview says "The earlier CMC question file could not be read; whether it holds open questions is not known." AnA is told the same. | `cmcOverviewCompleteness.test.tsx` ("no reassurance over an earlier CMC file that was not read", 3 cases), `cmcCorrCrossLinks.test.tsx` (the failure line) | `mutation-review-5-…` |
| 5 | **The earlier file's open rows were said to be on their letters already, and an organization-wide count sat under "on this program" as "Plus N"** (findings 2, 11). | Overview: "The earlier CMC question file (organization-wide, read-only) holds N questions not closed there. They are not in this figure, and nothing moves them onto a letter: record each one still open on its letter in Communication." Card: "read-only history, organization-wide"; "Nothing moves these onto a letter: record a question still open here on its letter in Communication, by hand." Row: "nothing writes this file any more". | `cmcCorrCrossLinks.test.tsx` (2 cases), `cmcOverviewCompleteness.test.tsx` | `mutation-review-6-…` |
| 6 | **The tile was a green 0 over a partial figure, and the empty index claimed no questions on "this program's letters" while letters were withheld** (finding 12). | Tile tone `ok` only when the figure is complete (nothing withheld or unplaced, earlier file read and empty) and nothing is overdue; otherwise neutral. With anything withheld or unplaced, the empty title is "No Module 3 questions are recorded on the letters read here", with a neutral icon. | `cmcCorrCrossLinks.test.tsx` (tile tone, both ways; the withheld empty state) | `mutation-review-7-…` |
| 7 | **CMC kept its own copy of the response-state words and tones, already drifted (`dim` against the letter's `idle`)** (finding 13; zero duplication). | One map, `client/src/concept2cure/v2/surfaces/agencyQuestionState.ts`, read by `AgencyResponses.tsx` and `cmcAgencyQuestions.tsx`; both copies deleted. | `cmcCorrCrossLinks.test.tsx` (the chip is `rd-chip tone-idle`) | `mutation-review-8-…` |
| 8 | **The per-tab signposts restated the "outstanding" rule in the client, over the capped list, with no word of the cap** (finding 23; zero duplication). | The server decides `outstanding` once, per question (`ModuleQuestion.outstanding`; `summary.outstanding` and the sort read it); `outstandingAt` filters on it and returns `partial` when the server listed a page, and the signpost then says "At least N". The client's set is deleted. | `cmcCorrCrossLinks.test.tsx` ("counts by the server's outstanding, and says at least …") | `mutation-review-9-…` |
| 9 | **Every "Open on its letter" flashed a role=alert "That letter is not in this project's inbox" (and "No agency communications yet") for one committed frame** (findings 8, 14). The inbox adopted its read in an effect after the render in which the read settled. | `useAgencyInbox` adopts a new read during the render that sees it (React's stored-previous-value pattern), so no commit holds a settled read with an empty list. Every caller of the hook (Communication, Respond, the HAQ view) loses the empty-state flash too. | `communicationOpensLetter.test.tsx` (a MutationObserver over the whole mount: nothing seen; with the effect restored it saw `['absent', 'alert', 'empty']`) | `mutation-review-10-…` |
| 10 | **The focused card was a role-less div with an aria-label, and CMC's action column header was empty** (finding 15). | The card a link opened is `role="region"`, named by `aria-labelledby` (its own title and a visually hidden "opened from a link"), so its content stays readable. The header reads "Open on its letter" (`sr-only`). | `communicationOpensLetter.test.tsx` (the region by name, focus, no `div[aria-label]:not([role])`), `cmcCorrCrossLinks.test.tsx` (every column header has text) | `mutation-review-11-…` |
| 11 | **CMC drew lists with a class defined only in Communication's stylesheet, absent from the lazy CMC chunk** (finding 16). | `cmcAgencyQuestions.tsx` imports `../styles/commcenter-v2.css` (every selector in it is `.c2c-v2 .cc-*` scoped). | `cmcStylesheetClosure.test.ts` (new): walks the static import graph of the CMC chunk and the shell and requires every class the view names, that some stylesheet defines, to be defined by one that graph loads | `mutation-review-12-…` |
| 12 | **The letter's overdue note spoke of "responses not approved" on a letter with no question recorded** (finding 17). | "Overdue: past its due date (…), with no question recorded." when nothing is asked; the server's reason otherwise. | `agencyResponsesSignedApproval.test.tsx` (both wordings) | `mutation-review-13-…` |
| 13 | **CMC said "record the section on the letter", where the only control said "Correct section" for a section never recorded** (finding 18). | "Record section" / "Record the section" when none is recorded, "Correct section" once one is; CMC: "Record each question's CTD section on its letter in Communication." | `agencyResponsesSignedApproval.test.tsx` ("Record section"), `cmcCorrCrossLinks.test.tsx` (the CMC line) | `mutation-review-14-…` |
| 14 | **Communication counted due days in milliseconds from the browser's clock: a letter due today read "(-1d)" and "you have -1 days to respond" beside the server's "not overdue"** (finding 19). | `utcDay` moved to `shared/utils/utc-day.ts` (response-logic re-exports it, one implementation) with `utcDaysUntil`; `daysTo` counts UTC calendar days; `dueInWords` says "today", "in 3 days", "4 days ago", never a negative count and never "overdue" (whether a letter is overdue is the server's verdict). The card and both lead sentences use it. No inbox screen claims "overdue", so no server verdict is added to the list rows. | `agencyInboxDueDays.test.ts` (new; it also asks the server's `letterOverdue` the same day) | `mutation-review-15-…` |
| 15 | **URS-CMC-030 said the earlier file refuses every write, but an owner DELETE ran (and this change used one); TRUNCATE was never met** (finding 5). | `20261019b` amended in place (it has never been deployed; dated note in its header): the row trigger is `BEFORE INSERT OR UPDATE OR DELETE`, and a `BEFORE TRUNCATE` statement trigger is added. No foreign-key action reaches the table and the tenant purge does not list it, so nothing breaks; the dbtest's fixture is removed as the owner in replica mode, as it is written. OQ-CMC-42 probes DELETE and TRUNCATE as the runtime role (each rolled back). URS-007 v1.2, OQ-008 v0.10, VSR §20 say exactly that. A purge door is owed. | `cmc-questions-migration.pglite.test.ts` (DELETE and TRUNCATE refused, two triggers), `cmc-agency-questions-converged.dbtest.ts` (the owner refused all four; the runtime role refused TRUNCATE too); `migration-replay-review.txt` (replay twice; one trigger of each kind; `app_service` SELECT only) | `mutation-review-16-…` (file and database; `deploy-migrate` re-armed them, checked) |
| 16 | **The deletion record removed CMC's per-question assignment with no replacement, saying the letter had no owner field and that P-39 item 1 covered it** (finding 21). Both were wrong: `owner_user_id` was on the canonical record with no write path, and P-39 item 1 says nothing of assignment. | The replacement, as the design and its critique planned it: `PATCH …/questions/:questionId/owner` (`assignQuestionOwnerTx`) sets or clears the owner with a reason; the owner must be an active member whose role may open the letter at its visibility tier (400 `OWNER_NOT_MEMBER`, `OWNER_CANNOT_SEE_LETTER`); the ledger records from and to. The letter shows "Owner: …" and offers "Set owner" / "Change owner" (members from `…/team`); CMC's index has an "Owner" column; OQ-CMC-42 sets and reads one. The deletion-record row is rewritten to name it. | `cmc-agency-questions-converged.dbtest.ts` ("who owns a question's response …", 2 cases), `agencyResponsesSignedApproval.test.tsx` (2 cases), `module-view.test.ts`, `cmcCorrCrossLinks.test.tsx` | `mutation-review-17-…` (route not registered: 404), `mutation-review-18-…` (visibility check removed: the viewer was made owner of a restricted letter) |

Finding numbers count the review's list in the order it was given (1 to 23).

**Re-run on the final tree after the review** (`green-review.txt`, `gates-review.txt`, `migration-replay-review.txt`,
`typecheck-review.txt`):

- **Unit, route, pglite and client:** the 95 files of `green.txt` plus the review's two new files. 1495 passed, 7
  skipped, 3 failed. The 3 failures are the same three that fail identically on HEAD.
- **Real PostgreSQL:** the nine suites, as `app_service` with `RLS_ENFORCE=on`: 190 / 190.
- **`deploy-migrate` twice:** both exit 0. One trigger of each kind is installed, and `app_service` holds SELECT only on
  `reg_questions`.
- **Gates:** the same 54 gates exit 0. The two that read a live schema were run with `DATABASE_URL`. Both migrations
  carry the eCTD header.
- **`npm run -s typecheck`:** exit 0, no errors.
- **After a last refactor for lint** (`addLetter`'s loop moved into `tallyQuestions`; `assignQuestionOwnerTx` takes
  `{ questionId, ownerUserId }`), mutations 1, 3, 17 and 18 were run again. Every `mutation-review-*` header's sha256
  matches the final file. The typecheck, both green runs and the code-reading gates are of the final tree.
- **Baseline:** `scripts/ci/tables-live-schema-baseline.json` loses its `reg_submissions` entry. Nothing in server SQL
  references that table now: its referents were `rpi.ts`, the Gmail ingest this change removed, and a board route that
  had already stopped referencing it.

## Deletion record

The working agreement's search, on this clone (`deletion-history.txt`). **The clone is shallow** (888 reachable
commits, root dated 2026-10-05): the search covers only that history, not the repository's.

```
$ git log --all --diff-filter=D --oneline -- 'server/src/services/reg/*' 'server/routes/cmc-agency*' 'server/api/cmc/regulatoryIR*' 'client/**/*Corr*' '**/*AgencyQuestion*' 'server/src/services/integrations/*'
7c1bbcfd Two dead modules deleted, and a withheld one exempted by its decision rather than baselined
$ git log --all --diff-filter=D --oneline -- 'client/**/*Editor*' 'client/**/*Canvas*'
(no output)
```

What was removed from CMC, and what now delivers the same user outcome:

| Removed (CMC Program records card, `CmcModule.tsx` at `99acc88d`) | Replacement, by path | Reachable, proven by |
|---|---|---|
| Log question (`POST /api/cmc/agency-questions`) | "Record question" on the letter, with the CTD section: `client/src/concept2cure/v2/surfaces/AgencyResponses.tsx:609` (form `:690`) | `communicationOpensLetter.test.tsx`; `agencyResponsesSignedApproval.test.tsx` ("records a question with the section it concerns"); `ci:launch-scope-api` |
| Draft response (an authoring document, code `agency_question_response`), Re-draft, Open draft | "Write response" `AgencyResponses.tsx:348`; "Draft response with AnA", which pins the letter: `AgencyInbox.tsx:337` | the same, and `communicationDraftCarriesLetter.test.tsx` |
| Send for review / Return to drafting, Close, Reopen (status updates) | "Approve response", a Part 11 signature: `AgencyResponses.tsx:358` (dialog `:781`); "Close letter", refused until every response is approved: `AgencyInbox.tsx:347`; "Withdraw question" `AgencyResponses.tsx:368` | `agencyResponsesSignedApproval.test.tsx`; `tests/db/agency-response-signed-approval.dbtest.ts` |
| The closed file (history) | `CmcEarlierQuestionFile`, read-only history: `client/src/concept2cure/v2/surfaces/cmcAgencyQuestions.tsx:444` | `cmcCorrCrossLinks.test.tsx` ("the earlier CMC question file, read-only history") |
| The open list, the overdue tile, the signposts | `CmcModule3QuestionIndex` `cmcAgencyQuestions.tsx:368`, each row's "Open on its letter" (`openLetterInCommunication`, `:246`), consumed at `CommunicationCenter.tsx:133` | `cmcCorrCrossLinks.test.tsx`, `communicationOpensLetter.test.tsx`, `ci:launch-scope-api` |
| Inline assignment (free-text "Assigned") | "Set owner" / "Change owner" on the question, on its letter, with a reason: `client/src/concept2cure/v2/surfaces/AgencyResponses.tsx` (QuestionCard, the owner form), `PATCH …/questions/:questionId/owner` (`server/routes/c2c/agency-responses.ts`, `assignQuestionOwnerTx` in `response-service.ts`) over the canonical record's `owner_user_id` (`migrations/20261018b_agency_response_questions.sql`, which had the column and no write path). The owner must be an active member who may open the letter at its visibility tier. CMC's index shows it read-only ("Owner" column). The earlier file's free text stays as history. (As first written, this row said there was no owner field on the letter and that P-39 item 1 covered the removal; both were wrong, and the review delivered the replacement instead.) | `tests/db/cmc-agency-questions-converged.dbtest.ts` ("who owns a question's response is set on the letter"); `agencyResponsesSignedApproval.test.tsx` ("sets who owns a response"); `cmcCorrCrossLinks.test.tsx` (the Owner column); OQ-CMC-42 |
| Per-question due date and priority | The letter's due date (the agency sets one response date per letter; the overdue verdict is the letter's, `response-logic.ts` `letterOverdue`) and the question's severity, recorded with it (major, minor, critical: the Record question form, `AgencyResponses.tsx`). The rows keep theirs as history. | `module-view.test.ts` (the overdue verdict); `agencyResponsesSignedApproval.test.tsx` ("records a question with the section it concerns", which sends the severity) |
| "Create task" / "Ask AnA" on a question row | Dropped (P-38: CMC is not a working screen for agency questions). Tasking and AnA stay on every CMC tab (`CmConnectBar`, the AnA panel). | — |
| `gmailIngestToReg`, `resolveSubmissionId` (no caller anywhere) | Questions are recorded on the letter; extracting them from a letter's file is the gap analysis's "Next" item 2 | — |
| ga-demo seed branch writing `reg_questions` | None: the file is read-only; seeds of agency questions belong on letters | — |

## Gates

Run on the final tree (`gates.txt`), each exit 0: every npm script `.husky/pre-push` invokes (37, including
`ci:migration-drop-safety` and its selftest, `ci:migration-guard-order` and its selftest, `ci:migration-set-order`,
`ci:sql-interpolation`, `ci:pushed-lint-warnings`, net −8 warnings across the changed files), plus
`ci:purge-coverage`, `ci:launch-scope`, `ci:launch-scope-api`, `check:microcopy`, `check:compliance-claims`,
`ci:empty-state-honesty`, `ci:internals-in-copy`, `ci:check-chip-tones`, `ci:check-phantom-tokens`,
`ci:validation-traceability`, `ci:insert-columns-declared`, `ci:unkeyed-request-tables`, `ci:unbacked-tables`,
`ci:tables-live-schema` and `ci:tenant-resolvers`. The eCTD audit header is in the first 40 lines of both migrations
this change adds or amends (the per-file rule of `scripts/ci/require-migration-headers.sh`, which in CI reads the
committed diff). `ratchets.txt` shows the four ratchets red on the deletion and green on the shrunk baselines.

`ci:pushed-lint-errors`, `ci:pushed-typecheck` and `ci:untracked-imports` read the committed push range, which is
empty before the orchestrator commits; the typecheck was run in full instead (`typecheck.txt`).

## The decision input for the deferred move act

Run as the owner role on each deployed estate (or a role with BYPASSRLS, or with `app.rls_enforce` unset; say which):

```sql
SELECT organization_id, coalesce(status,'(null)') AS status, count(*), min(created_at), max(updated_at)
  FROM public.reg_questions GROUP BY 1,2 ORDER BY 1,2;
SELECT organization_id, count(*) FILTER (WHERE upper(status) IS DISTINCT FROM 'CLOSED') AS not_closed, count(*) AS total
  FROM public.reg_questions GROUP BY 1 ORDER BY 1;
SELECT (SELECT count(*) FROM public.reg_responses) AS reg_responses, (SELECT count(*) FROM public.reg_messages) AS reg_messages;
```

On the local database every count is 0 (`legacy-row-count.txt`).

## Owed

- **The governed act that moves a row not closed in the earlier file onto a letter**, with the agency's words copied
  from the row and a reason. Deferred until a deployed estate's count shows rows that need it. It must recognise rows
  a person has already re-recorded on a letter by hand: the earlier row cannot be stamped (the file is read-only, and
  the act amends `20261019b` in place when built), so its not-closed count never falls on its own.
- A purge door for the earlier file (tenant purge or erasure): the file refuses DELETE and TRUNCATE to every role, so
  the door is built by amending `20261019b` in place, as its header says. `reg_questions` is not in the tenant purge's
  list today (`server/services/tenant/tenant-offboarding.ts`), so no purge is broken by the refusal.
- OQ-CMC-42 executed, with `DATABASE_URL_RUNTIME`, as part of OQ-008 under the W3 posture; OQ-001 coverage of the
  signed approval itself.
- The staff simulation (`scripts/dev/cmc-staff-simulation.sh`, steps 23–25 rewritten) was not run: this session has
  no development server and the database has no dev-login identity. The approval step needs `SIM_SIGNER_EMAIL`; without
  it the script reports the step as not run.
- The other five correspondence and commitment stores, in P-39 order (`c2c_commitments` next).
