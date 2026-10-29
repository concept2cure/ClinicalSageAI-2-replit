# RR1b — the review route's first visible slice (D2, 2026-10-29)

Slice RR1b of `docs/design/REVIEW_ROUTING_2026-10-23.md` (§2.6, §2.10–§2.13, §5), on RR1a (`docs/evidence/D2-REVIEW-ROUTING/2026-10-29-RR1a/`). Launch row **D2**, Veeva gap 4. On a Vault version, Send for review now names reviewers, one approver, due dates and a reason; the people named get the task and the notice, the notice opens the version, the version shows the route, and the sender withdraws, returns and reminds.

| Commit | What |
|---|---|
| `2dd186160` | Server: `REVIEW_ROUTE_REQUIRED`, the picker's read, server-only `task_*`, a route task's notice opens its version, `roundUnread`, the board's Vault queue on the route, Remind restricted, my-work `reviewRole`, and the two existing suites that enter review the legacy way |
| `60881abe6` | Client: the route form (a sheet on a phone), the round on the version, Withdraw / Return / Remind, Name reviewers and Send again, the board and Tasks, the Vault deep link from a notice; the shared review fields module |
| `fde9bfae1` | Two existing suites meet `REVIEW_ROUTE_REQUIRED` and the route columns |
| this commit | Evidence |

## What already exists

Everything below was found first and extended, reached or converged. Nothing was rebuilt beside itself.

| Existing piece | Path | What it did | What RR1b did |
|---|---|---|---|
| The route's server half | `server/services/review/review-route*.ts`, `server/routes/document-lifecycle-review-route.ts` (RR1a) | send, routed sign, withdraw, return, re-send, round read | Unchanged in behaviour; added `REVIEW_ROUTE_REQUIRED` to `routedAdvanceGate`, `senderTimeZone` and `printedNameOf` exported, `routeRemindRefusal` |
| The member validator | `validateRouteMember` (`review-route-member.ts`) | the one admission rule for a named person | The picker reads it: `review-route-candidates.ts` asks it per member and role; an optional `authorship` for a record not started yet |
| The send confirmation | `SendForReviewConfirm` in `client/src/concept2cure/v2/surfaces/VaultLifecycle.tsx` | a confirm with the file's hash and "a different person reviews and approves it" | Replaced by the route form, which says the same in its header; its test moved onto the form (`vaultLifecycle.test.tsx`) |
| Authoring's send-for-review fields | `ReasonField`, the due date in `TaskFields` (`editor/SendForReviewDialog.tsx`), `ReviewerChecklist` (`editor/AssignReviewDialog.tsx`), `reviewReasonProblem` | the reason, a due date, a checkbox list of members | Extracted into one module, `editor/reviewFields.tsx` (`ReasonField`, `DueDateField`, `PeoplePicker`, `reviewReasonProblem`); Authoring's dialog and checklist use it, so the checklist is now searchable too. No copy |
| The lifecycle POST | `lifecyclePost` in `VaultLifecycle.tsx` | one POST, refusals in the server's words | Moved unchanged to `surfaces/vaultLifecyclePost.ts` so the route acts use it |
| The signing dialog | `EsignModal` (`_shared/components/EsignModal.tsx`) via `SignOffDialog` | Part 11 ceremony | Reused; a routed approver signs through `POST …/sign {meaning:'approved'}` |
| Dialog behaviour | `useDialog`, the `de-bd`/`de` drawer | focus trap, Escape | Reused; `de-sheet` makes the drawer a bottom sheet at ≤600 px |
| Reads | `useLiveData` (`dataConnect.tsx`) | guarded GET | Reused for the candidates read |
| The versions read | `readVaultLifecycles` (`vault-lifecycle.ts`), `GET …/versions` | stage, sign-offs, round; **a failed round read failed the whole list** | The round is read on its own: a failure is `roundUnread`, the versions still show |
| The Review board's Vault queue | `vault-review-queue.ts`, `ReviewVaultQueue.tsx`, `Review.tsx` | "Not assigned to one person"; "Open in the Vault" opened the Vault root | Routed items read the route (mine = an open step, with the due date; requested = the round with Remind); legacy reading kept; "Open the version" opens the version |
| Tasks tray and Home | `OpenWork.tsx`, `my-work.ts` | assigned tasks, `waitingOn` (RR1a) | A route member's row says what it waits on and opens the Review board (the task board refuses route rows) |
| Notifications | `notifyTaskEvent`, `SERVER_ONLY_NOTIFICATION_CATEGORIES`, `notification-record-target.ts`, `notification-reference.ts`, `shared/types/notification-navigation.ts` | `ana_turn` server-only; a task opened on the Tasks board; `noticeTaskId` admitted only `TASK-`, so **every route notice was refused with 422** | `task_*` server-only; a route task resolves to its subject; `canonical_document` reference and `vault` target surface; `ROUTE-` ids admitted |
| The Vault deep link | `vaultTarget.ts` (`setVaultTarget`/`takeVaultTarget`) | File to Vault's "Open in Vault", taken on mount | A notice publishes it; a Vault already on screen takes it through `VAULT_TARGET_EVENT` |
| Remind | `POST /api/tasks/tasks/:taskId/notify` | any editor, any task | For a route member: the sender or an admin, an open step on an open route |
| The time zone | `notification_preferences.timezone` | per-user | The form names it; each date is the end of that day there (RR1a's `dueInstants`) |

Deleted: `SendForReviewConfirm` (replaced by `RouteForm`, `surfaces/VaultReviewRoute.tsx`, proven reachable by `vaultReviewRoute.test.tsx` and the acceptance run). Searches for a second picker (`MemberPicker`, `PeoplePicker`, `UserPicker`, `combobox`, `type="search"` in member lists) found none; `ReviewerChecklist` was the one member list and now renders through `PeoplePicker`.

## Red → green

| Behaviour | Test | Red | Green |
|---|---|---|---|
| A client POST, and AnA's `fire_notification`, of each `task_*` category is refused; each can still be muted | `server/routes/__tests__/notification-server-only-category.test.ts` | `red/notification-task-categories-server-only.txt` | `green/…` |
| An advance into review without a route is refused (`REVIEW_ROUTE_REQUIRED`), the record stays in authoring | `tests/db/review-route-vault-rr1b.dbtest.ts` | `red/vault-route-rr1b.dbtest.txt` | `green/dbtests.txt` |
| The picker's read: each member with the validator's answer per role, before and after the record exists; the uploader and sender refused; a reviewer of this content not offered as approver; nothing written | same | same | same |
| The reviewer's notice is `task_assigned` on the route task, and opens the version in its project's Vault; only for its recipient | same (was 422) | same | same |
| Board: an open step is "mine" with its due date; the waiting approver is not; the sender sees every outcome | same | same | same |
| A failed route read keeps the version list and marks the reviewers unread | `server/services/vault/__tests__/vault-lifecycle-round-unread.test.ts` | `red/vault-lifecycle-round-unread.txt` | `green/…` |
| A board item whose route could not be read is in no one's queue and names no one | `server/services/review/__tests__/vault-review-queue.test.ts` | `red/vault-review-queue-unread.txt` | `green/vault-review-queue.txt` |
| Remind: sender yes; neither sender nor admin 403; a member whose step is not open 409; a withdrawn route 409 | `server/routes/__tests__/route-task-guard.pglite.integration.test.ts` | `red/remind-route-member.txt` | `green/remind-route-member.txt` |
| my-work names a route member's role | `server/jobs/__tests__/taskDueSweep-route.pglite.test.ts` | `red/my-work-review-role.txt` | `green/my-work-review-role.txt` |
| Send is disabled, and says why, until reviewers, approver, both dates and a reason; the picker excludes the uploader and sender and says why; it is searchable; Send posts start + advance with the route; a refusal is said; an unread list offers no one | `client/src/concept2cure/v2/__tests__/vaultReviewRoute.test.tsx` | `red/client-route-form-panel-inbox.txt` | `green/client-route-form-panel-inbox.txt` |
| The round: every member with printed name, meaning, UTC time, outcome; "You signed at …; waiting for B"; "Approved (1 of 1 required)"; "Reviewers could not be read", no step offered | same | same | same |
| Withdraw and Return ask for a reason and refuse without one; Remind; the routed approver signs on the route; legacy offers Name reviewers | same | same | same |
| The notice opens the version (target contract, deep link); the board's "Your turn" and round; Tasks rows open the board | `client/src/concept2cure/v2/__tests__/reviewRouteInbox.test.tsx` | same | same |

Green by design in the red runs: "another organization's version is not found" (the route did not exist, so 404 for the wrong reason before the slice), the board test's "an ordinary task still opens on the task board" (a regression pin), and the re-run RR1a suites.

Carry-over still carries: `server/routes/__tests__/authoringFileToVaultApprovalCarry.pglite.integration.test.ts` green after `REVIEW_ROUTE_REQUIRED` (the carry-over advances through the orchestrator, not the handler).

Existing tests changed because the behaviour changed, each saying why in place: `tests/db/vault-lifecycle.dbtest.ts` and `server/routes/__tests__/document-lifecycle-part11-record.test.ts` enter review through the orchestrator (a pre-cutover record), and assert the handler's refusal; `vaultLifecycle.test.tsx` sends through the form; `reviewVaultQueue.test.tsx` names the button "Open the version"; `notification-record-target.pglite.test.ts`'s fixture has the route columns; the founder-path lineage hop sends a route (that suite fails at hop 6 before and after this slice, so the hop is not exercised; see below).

## Gates

`gates.txt`: `ci:pushed-lint-warnings` (no file changed its warning count), `ci:pushed-lint-errors`, `ci:sql-interpolation`, `ci:undefined-css-classes`, `ci:untracked-imports`, `ci:sign-ceremony`, `ci:launch-scope-api`, and the full typecheck (`NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p tsconfig.check.json`), all exit 0. No baseline was raised.

## How the tests were run

- Unit and PGlite tests with `RLS_ENFORCE=off`.
- Database tests as RR1a's README records: a fresh deploy-shaped database built with `scripts/db/provision-test-db.sh` (install-fresh + deploy-migrate, pgvector, `app_service` NOSUPERUSER NOBYPASSRLS), renamed to the recorded-disposable name (`platform_ci_vault_fixture_rr1b`, `C2C_VAULT_LEGACY_FIXTURE_DATABASE`), run with `RLS_ENFORCE=on`, `TEST_DATABASE_URL` as the owner and `APP_DATABASE_URL` as `app_service`. `green/dbtests.txt` holds RR1b's suite with RR1a's two, `vault-lifecycle`, `canonical-documents-append-only` and `task-filing-home`: 62 passed.

## Acceptance (`acceptance/`)

A private instance of the working tree on `:5193` (`NODE_ENV=development`, `RLS_ENFORCE=on`, the runtime role `app_service`, the database above), driven by Playwright (chromium from `/opt/pw-browsers`) with `acceptance/rr1b-acceptance.mjs`, at 1440×900 (`desktop/`) and 390×844 (`phone/`). The accounts are synthetic, in a synthetic organization seeded for this run: Sam Sender (admin), Rae Reviewer and Rob Reviewer (reviewer role, project members), Ann Approver (approver role, project member), Mo Member (member role). Their password came from the environment and is not in this folder. jm.smith and sarah.chen were not used. The instance was stopped afterwards.

Each run (`*/run.log`, numbered screenshots; `-detail.png` is the element, captured with the window made taller at the same width because the Vault's detail pane takes only the height the page leaves it):

1. the sender uploads three versions through the API;
2. opens A, Send for review opens the route form (a bottom sheet on the phone), picks Rae and Rob (searching), Ann as approver (Rae and Rob greyed out there as "Chosen as a reviewer"), the dates, the reason; "2 members are not offered, and why" lists the sender and Mo; sends: "Waiting for Rae Reviewer and Rob Reviewer.", with Remind on each reviewer;
3. Rae's Tasks shows "Review: Clinical overview … A" and the notice "Review requested: …"; the notice's "Open the version in the Vault" opens that version: "Your turn: sign the review."; she signs: "You signed at HH:MM UTC; waiting for Rob Reviewer.";
4. Rob's Review board, "Awaiting my review": "Your turn: sign the review, due 2026-11-01 23:59 UTC."; Open the version; he signs;
5. Ann's notice "It is your turn: approve …" opens the version: "Your turn: approve."; she signs: "Approved: every named reviewer and the approver signed.", her line "Approved (1 of 1 required) · meaning: approved · …", the version Approved;
6. the sender sends B and withdraws it ("Withdrawn by Sam Sender on … : The approver is on leave; re-route next week", the version stays in review with Send again), and sends C and returns it ("Returned by Sam Sender: Section 2.7.2 needs the updated PK table first", the version back to Not sent for review). The members are told: a reviewer's tray lists "Review route returned: …" with the reason (visible in step 3's tray text of a later run, `desktop/run.log`).

On the phone the script checks the form, the round and the withdraw sheet: horizontal overflow 0 px, and no route control under 44 px (`phone/run.log`). Page errors: none on either run.

## Decisions taken where the design or the brief left room

1. **Two due dates.** The brief says "a due date"; the design (§2.6) and RR1a's contract (`reviewDueDate`, `approvalDueDate`) say review and approval due dates. The form asks for both, the approval on or after the reviews.
2. **The picker reads the validator.** A new read, `GET /api/regulatory/documents/route-candidates/:vaultId`, runs `validateRouteMember` for every active member in both roles, so the form offers exactly whom the send admits and says why each other member is not offered. Before a version's record exists its authors are the uploader and the reader (who will start it); the validator takes that authorship as a parameter.
3. **A Tasks row opens the Review board, a notice opens the version.** A route task cannot be acted on from the task board (RR1a's guard), so the tray's row goes to the board, where "Open the version" is; the notice goes straight to the version.
4. **Remind is restricted on route tasks** to the sender and admins, for an open step on an open route (§2.3 "allowed, for the sender and admins"); the route stays one that writes nothing on the row.
5. **Legacy is reachable only through the orchestrator.** With `REVIEW_ROUTE_REQUIRED` no handler path puts a Vault version in review without a route; the two existing suites that pin the legacy signing path enter review the way a pre-cutover record did.

## Design issues for the coordinator

- **OQ protocol.** `tests/validation/oq/vault/run.mjs` steps OQ-VAULT-13/14 send a version with `advance {to:'in_review'}` and no route, and approve through `/advance`. After RR1b they will fail at the send. They are a validation protocol with URS traceability, so they were not edited here: they need a protocol revision naming a route (reviewer, approver) and approval by signing on the route. Done in OQ-002 v0.15 (`docs/validation/OQ-002-VAULT.md`); red and green runs in `oq-vault/`.
- **The Vault's detail pane** gets only the height left under the uploads lane, the data room and the coverage band (96 px tall in the acceptance organization with 20+ uploads at 1440×900). The round panel is readable by scrolling the pane, but the layout is pre-existing and outside this slice.
- The design's §2.12 also lists `vault-review-queue.ts` "mine = my open step, with the due date": done; "Returned by C"/"Withdrawn by D" name the closer from the route's own names, and an admin who withdrew a route they did not send reads as "an administrator" (the header stores only `status_by`).

## Pre-existing failures seen, not caused by RR1b

Each checked against `1f314ecbe` with this slice's files swapped back:

- `client/src/concept2cure/v2/__tests__/vaultSurface.test.tsx` (two search tests) and `commitmentFulfilment.test.tsx` (one search test) time out at the base too.
- `client/src/concept2cure/v2/__tests__/runPolicySwitch.test.tsx`: five failures at the base too (its `authService` mock has no `authService` export).
- `server/routes/__tests__/task-management-source-project.test.ts`: three failures at the base too.
- `tests/lineage/founder-path-lineage.pglite.test.ts`: the same 8 failures RR1a recorded (hop 6 ingest), before and after.
- A wide server run (`server/routes/__tests__`, `server/services/ana`, `server/services/regulatory`; 12,730 passed before its 55-minute limit) failed only in `authoringFromDraft.pglite`, `coauthorSnapshotStatus`, `globalBiotechTemplateEditor.pglite`, `report-os-audit-recording`, `report-os-report-pack-export`, `report-os-saved-read-access`, `submissions-request-current-access.pglite` and `ana/document-template-description`: the same counts at the base with every server, shared and client file of this slice swapped back.
- The full `client/src/concept2cure/v2` run (4,556 passed) hit its 50-minute limit before printing a summary; its only failures are the ones above.
