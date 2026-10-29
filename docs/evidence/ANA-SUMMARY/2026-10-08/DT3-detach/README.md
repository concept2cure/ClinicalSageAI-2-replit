# ANA-SUMMARY DT3: a turn that outlives its page

This is slice DT3 of `docs/design/ANA_DETACH_2026-10-08.md` (§2, §5, §8 DT3; the build record is §12.2, §12.4 and §12.5). Its lane is P-24, and it moves no D-row.

DT3 was built on 2026-10-08 and cut off at its gates. It sat for 12 days while trunk moved 1,472 commits (`c245df58f..28637579e`). On 2026-10-22 the work was put on `concept2cure-v2` at `28637579e`, its conflicts were resolved, it was converged onto what trunk had built in the meantime, and it was completed. It was committed as `8fb897868`, pushed mid review-fix at the founder's instruction. Its message lists the review items still open. They were verified and closed on 2026-10-29 ("Closing the open items" below).

Three independent reviews of the uncommitted change (product and UX, governance and security, the system) raised 27 findings, one a blocker; on 2026-10-22 every one was fixed red first or given a verdict with its evidence ("Review findings" below). The same day D-7 was decided (coordinator, under the founder's delegation): a Live Drive turn detaches like any other, and from the close AnA stops driving the screen ("D-7" below).

What DT3 does: a turn with a run row, a person and a resolved conversation keeps running when its page closes, and the person's other pages follow it. A turn that asked to drive detaches too; from the close, its screen actions are refused and listed as steps that did not run (D-7). The turn is bounded by an unattended limit (15 minutes with nobody watching, never more than 40 minutes in all). It stops when the person's session ends, when an administrator stops it, or when the server shuts down, and each of these says why. A detached turn that ends sends an in-app notice that opens its conversation.

## What already exists

This follows CLAUDE.md Rule 3. Trunk was searched for every capability DT3 touches, under every name it could have: session recheck, standing, sign-out, shutdown, drain, notification, notice, inbox, open, target, stop line, watched, working, live runs, admin cancel, hold, request client, lease. `git log --all --diff-filter=D` was run on the same names. The full table is in the design, §8 "DT3 › What already exists". In short:

| Capability | Where it lives on trunk | What DT3 did with it |
|---|---|---|
| Session re-check | `server/socket/sessionRecheck.ts sessionEndReasonFor`; `server/services/token-revocation.ts verifyLiveToken` | **Reached.** The round-boundary check (`run-control.ts runStanding`) calls it. Nothing is copied. |
| Ending every session | `server/services/account-standing.ts endEverySessionOf`; `server/routes/auth.ts` (logout, reset, change) | **Extended.** Each now calls `stopPersonsRuns`. So do SCIM deprovisioning (`server/routes/scim.ts`, including `DELETE /Users/:id`) and member removal (`server/routes/tenant-users.ts`). |
| The request's DB client | `server/middleware/establishRequestTenantScope.ts attachLazyClient`; `server/db/requestDb.ts requestPgClient` | **Fixed in place.** The release is now a lease (`server/db/requestDbLease.ts`). The stream holds the same pinned, tenant-scoped connection until the turn ends. There is no second client and no fallback. |
| Shutdown drain | `server/startup/shutdown.ts` | **Extended.** `settleOwnedRunsForShutdown` runs before the drain, and `shutdown-hold.ts` lets the drain wait for the turns' recording. |
| Notifications and opening one | `notification-service.ts createNotification`; `shared/constants/notifications.ts`; `GET /api/mdx/notifications/:id/target` → `notification-record-target.ts`; `NotificationOpenButton.tsx` → `notificationNavigation.ts openNotificationRecord` | **Converged.** `ana_turn` is a canonical category. The notice names its `chat_thread`. The resolver gained `conversationTarget`. The first build's second door (`TaskTray.tsx openNotice` and its CSS) is **deleted**, and `TaskTray.tsx` is unchanged from trunk. |
| Stop lines | `client/src/concept2cure/v2/anaWorkModel.ts STOP_LINES` | **Moved** to `shared/ana/stop-lines.ts`. The client and the server's notice read the one table. |
| Watched stamp | `ana_runs.last_watched_at` (DT1); the client's `visible=1` poll (DT2) | **Completed.** The asker's visible poll stamps it. The clock and the run read share `shared/ana/run-detach.ts unattendedDeadline`. |
| `?mine=live` | `server/routes/ana-ri/runs.ts listRuns` (DT1, no caller) | **Reached** through one reader (`anaTurnTimeline.ts readListedRuns`, `projectThreads.ts useWorkingThreads`). The first build's raw `fetch` reader is deleted. |
| Admin cancel | `runs.ts controlScope` (DT1, advertised and refused) | **Completed** in `applyControl`. The response carries `byRole` and the audit outcome. |
| Hold payload | `ana_runs.hold` (DT1, never written) | **Completed** by `holdForPerson`. |

The deleted names that were found are `agent-swarm.ts`, `notification_routes.ts`, the old `useNotifications`/`NotificationsBell` and `useProjectNotifications`. None of them matched a DT3 capability, and none is revived.

### The review fixes: what already existed

Searched before each fix, by every name: admin cancel, control event, actor, attribution, "by", byRole, audit chain, `writeChainedAuditRow`, confirmation dialog, reason, approval envelope, proposal check, `approval_required`, claim, `recordApprovalDecision`, release, live drive, `SCREEN_ACTION`, `navigate_to`, `act_on_screen`, standing, `sessionEndReasonFor`, notification category, `fire_notification`, expiry, `expiresAt`, Working marker, `useLiveData`, refresh, 401, signed out, detach ceiling, pool, shutdown deadline; `git log --all --diff-filter=D` on the same names found nothing to revive.

| Capability | Where it lives | What the fix did with it |
|---|---|---|
| Chained audit row on a transaction client | `server/services/auditService.ts writeChainedAuditRow` | **Reached.** The admin cancel writes it inside its own transaction (`run-control.ts cancelAsAdministrator`). |
| Names an organisation may show | `server/services/tenant/actor-names.ts resolveActorNames`, `actorLabel` | **Reached** by the Summary and run read (`control-actor-names.ts`, a three-line adapter) and by the dossier (`lineage-dossier-holds.ts namedControls`). |
| A governed confirmation with a reason | `client/src/concept2cure/_shared/components/GovernedConfirmDialog.tsx` | **Reached** for an administrator's Stop (`ConversationThread.tsx`). |
| The approval proposal | `part11-governance.ts buildHumanConfirmationRequiredResult` (two callers: the stream frame, the run read) | **Converged** onto one envelope builder, `approvalRequiredEnvelope`, which both call; the frame's `check` now reaches the follower. |
| The approval decision write | `run-control.ts recordApprovalDecision` (its boolean was discarded) | **Fixed:** its result is read; the claim (`run-approval-claim.ts`) is a guarded `UPDATE` on the same row. |
| The session check | `socket/sessionRecheck.ts sessionEndReasonFor` | **Reached** as before; its reason is now mapped to the cause it names (`STANDING_CAUSE`). |
| Notification categories | `shared/constants/notifications.ts` | **Extended:** `SERVER_ONLY_NOTIFICATION_CATEGORIES`, `CREATABLE_NOTIFICATION_CATEGORIES`, read by the inbox route and `fire_notification`. |
| Live reads | `useLiveData` | **Reached** with a tick (interval and `visibilitychange`), not a second reader. |
| Shutdown | `server/startup/shutdown.ts` | **Extended** with a deadline on the run writes. |
| Screen-moving tools | `navigate_to`, `act_on_screen`, `start_product_demo` (the drive tools) | **Named once**, `run-status.ts SCREEN_ACTION_TOOLS`, and refused after the close; no tool was changed. |

## What DT3 adds

| Module | What it is |
|---|---|
| `server/db/requestDbLease.ts` (new) | `bindRequestDbClient`, `retainRequestDbClient`: the request's one pinned client, held by the response and by the turn. |
| `server/services/ana/run-stopped.ts` (new) | `RunStopped`, an `Error` named `AbortError` that carries the row's reason, so the gateway does not retry an aborted call. |
| `server/services/ana/unattended-clock.ts` (new), `shared/ana/run-detach.ts` (new) | The 15-minute unwatched limit, the 40-minute cap and the 2-minute grace; `unattendedDeadline`, shared with the run read; the notice's category and record kind. |
| `server/services/ana/run-notice.ts` (new) | The in-app notice for a detached turn: one per approval and one at the end, never for the person's own Stop, never while watched. |
| `server/services/ana/shutdown-hold.ts` (new) | Lets the shutdown drain wait for the turns' own recording. |
| `shared/ana/stop-lines.ts` (new) | `STOP_CAUSE`, `stopCause`, `STOP_LINE_TEXT`, `stopLineText`, `notAuthorisedLine`: the one table of stop wording. |
| `server/routes/ana-ri/stream.ts` | The detach branch, gated on `detachable()` and decided only after the thread step. It also holds the retained client, the round-boundary standing check, the unattended clock, the step's `why` from the row's reason, a row-stopped attached turn ending as a stop (not an error), the admin cancel's `auditRecorded`, and the notice. |
| `server/services/ana/run-control.ts`, `run-hold.ts`, `turn-run-policy.ts`, `run-status.ts` | `driveLocalRun` aborts on `failed`, with the reason. Also: `stopRunsFor`, `runStanding`, `settleOwnedRunsForShutdown`, `markRunDetached`, `holdForPerson(next)`, admin cancel (`controlAuthority`), the hold outcomes `'cancelled'`/`'ended'`, and `detachable()`. |
| `server/routes/ana-ri/runs.ts` | The asker's watched stamp (`stampWatched`); `detachedAt`, `unattendedStopsAt` and `watched` on the run read and `?mine=live`. |
| Session-end doors | `stopPersonsRuns` (`account-standing.ts`) and `stopOrganisationRuns` (`tenant-offboarding.ts`), both over `stopRunsFor`, called from `server/routes/auth.ts`, `server/services/account-standing.ts`, `server/routes/scim.ts`, `server/routes/tenant-users.ts`, `server/routes/admin/master-admin.ts`, `server/services/tenant/tenant-offboarding.ts`. |
| `server/startup/shutdown.ts` | Ends the owned runs before the HTTP drain. |
| Notifications | `shared/constants/notifications.ts` (`ana_turn`), `shared/types/notification-navigation.ts` (`conversation-thread`), `notification-reference.ts` (`chat_thread`), `notification-record-target.ts` (`conversationTarget`), `chat-thread-helpers.ts` (`threadOwnerMatches` exported), client `notificationNavigation.ts`, `notificationTarget.ts`. |
| Timeline | `shared/ana/turn-timeline.ts` (`readOnly`, `notAuthorisedStep`), `turn-timeline-emitter.ts`. |
| Client | `useAnaChat.ts` (a detachable turn's socket loss, idle timeout, unmount and abandon go to following); `anaTurnTimeline.ts readListedRuns`; `projectThreads.ts useWorkingThreads`; `ProjectHome.tsx` (the Working marker); `ConversationThread.tsx` (the admin's Stop, RUN_LIMIT links); `anaProgress.ts` and `anaWorkModel.ts` (the row's reasons, their notes and Continue); `turnSummaryRows.ts`. |
| `db/migrations/20260917_ana_runs.sql` | `detached_at`, and (the review) `started_session_id` and `stopped_detail`, amended in place with dated header notes (RULE 1). |
| `server/services/ana/detach-slots.ts` (new, review) | The ceiling on turns that go on after their page closed: 16 per process, 8 per organisation (INF-40). |
| `server/services/ana/run-approval-claim.ts` (new, review) | `claimApproval`, `releaseApprovalClaim`, `approvalClaimed`: the claim on a held approval, re-exported by `run-control.ts`. |
| `server/routes/ana-ri/held-run-release.ts` (new, review) | The governed-action route's side of the held run: `claimRefusal`, `giveBackClaim`, `releaseWaitingRun` (moved from `utility.ts`), `handBackResult`, `recordRunEndedDuringAction`. |
| `server/services/ana/control-actor-names.ts` (new, review) | The control actor's name through `resolveActorNames`. |
| Review changes in existing modules | `run-control.ts` (`cancelAsAdministrator` in one transaction, `controlEventOf`, `runStanding` causes, `localOnlyRunHandle(subject)`, `abortOwnedRunsForShutdown`); `run-status.ts` (`detachable` without the drive flag, `SCREEN_ACTION_TOOLS`); `stream.ts` (D-7's `screenGone`, `SCREEN_GONE_RESULT`, the admin-cancel refusals, `detachOnClose` with the ceiling, the approval frame from `approvalRequiredEnvelope`, `stoppedAfterApproval`, the local standing check); `turn-summary.ts attributeControls`; `runs.ts` (`askerName`, `controlsFor`); `lineage-dossier*.ts` and `report-os/lineage-trace-report.ts` (who took each control); `part11-governance.ts approvalRequiredEnvelope`; `utility.ts` (the claim); `tool-trace.ts` and `step-presentation.ts` (`not_run`, the detached cap); `run-notice.ts` (no question, 30-day expiry); `mdx-notifications.ts`, `notifications-study-memory-tool-defs.ts`, `AnaToolExecutor.ts` (`ana_turn` server-only); `shutdown.ts` (the deadline); `shared/ana/run-detach.ts` (`stoppedByMs`, `utcClock`, `noticeConversationName`); `shared/ana/stop-lines.ts` (`SCREEN_GONE_LINE`, the standing causes); the client (`useAnaChat.ts` `adminStop`, follow honesty; `anaTurnTimeline.ts` 401; `projectThreads.ts`/`ProjectHome.tsx` the marker; `anaWorkModel.ts` lines; `turnSummaryRows.ts controlText`; `ConversationThread.tsx` the dialog and the live-runs note). |

## Closing the open items (2026-10-29, on `8b58354af`)

`8fb897868`'s message listed these as open: the admin cancel (the blocker, DP-82 and 4.4), the client (2.2–2.5), the approvals (4.1, 4.3) and D-7. Each was checked against the committed code and its required change, with these steps:

- Its suites were run: 17 files, 233 tests, all passed.
- Its `red/mutations.py` entries were re-run against that tree. All 21 exited non-zero, and the tree was restored, with `git status` clean.
- The admin cancel's DB tests were run on fresh2 with RLS on (`green/db-tests-close.txt`).

The fixes the table below names were in the commit. Three gaps were not, and each was closed red first (design §12.7). The reds were captured on `8b58354af` before any source change:

| Gap | Finding | Red (pre-fix) | Mutations | Green |
|---|---|---|---|---|
| A settled followed turn with no step rows hid the follower's line: the hook said "The answer couldn't be loaded. Reopen the conversation." (or the 401 line), but the thread did not mount the turn's record, so the person saw an empty answer | 2.4, 2.5 | `red/review-follow-line-hidden-on-a-settled-turn.txt` | `r-follow-line-hidden-on-a-settled-turn` | `conversationThreadAdminFollow.test.tsx` › "something to say" |
| The approval window's own deny took an approval its person had claimed: the action ran under their signature, and the turn said "Nobody authorised this … so it did not run" | 4.3 | `red/review-window-deny-overrides-a-claimed-approval.txt` | `r-window-deny-overrides-a-claimed-approval`, `r-window-turn-says-nobody-authorised` | `run-control-detach.pglite.test.ts` › "approval window"; `stream-detach-review.test.ts` › "window closes" |
| D-7 on the client: a screen step refused after the close read "3 steps completed · 1 failed" (acceptance G, screen 03), and the Summary drew it as a failure | D-7 | `red/review-d7-client-not-run-read-as-failed.txt` | `r-d7-trace-not-run-read-as-failed`, `r-d7-frame-not-run-read-as-failed`, `r-d7-folded-line-silent-on-not-run`, `r-d7-summary-not-run-read-as-failed` | `anaScreenGoneStep.test.tsx`; `useAnaChat-detach.test.ts` › "did not run" |

The re-run of the earlier entries, and the new entries, are in `red/mutations-run-close.txt`.

Found on `8b58354af` and not caused by DT3:
- **`conversationThreadAdminFollow.test.tsx` was broken by trunk.** All of its tests failed with "useAuth must be used within an AuthProvider", because `cc1607c3a` made the thread's canvas document list read the signed-in person. The file now stands in `authService` the way its sibling thread tests do. Its six DT3 tests pass again, and the two new ones were red on the defect, not on the harness.
- **Two gates are red on trunk, in files this change does not touch.** `ci:tenant-isolation:no-regression` has 6 findings, in `vault/vault-search.ts` (D2), `tasking/task-assignment.ts` and two test harnesses. The full typecheck has 10 errors, in `authoring/csr-scientific-review.ts` (`07857e3e3`) and a CRE seed test (`0a07f49d7`). The typecheck no longer fits in 10 GB on this trunk, so it was run with 12 GB.

## Review findings (2026-10-22)

The three reviews are numbered here as the coordinator filed them: **2.x** product and UX, **3.x** governance and security, **4.x** the system. Every finding is real; none was judged not real. Two advisories are fixed in part, and the part left is said, with why. "Pass 1" is the first fixing session of 2026-10-22 (#46, #47, #49), checked and kept by the second, which did the rest. Each red is in `red/`: `review-*.txt` is the new test run on the pre-fix tree; `r-*.txt` is a `red/mutations.py` entry that puts the defect back into the final tree and runs its test.

| # | Finding | Sev. | Verdict and fix | Red | Green |
|---|---|---|---|---|---|
| 2.0 | A person's Stop, then the socket closing, filed as a detach ("the turn continued") | high | Real. Pass 1: a stop that has landed is never a detach (`stream.ts detachOnClose`: `stopLanded`), and no detach warning after it. | `review-stop-then-close-filed-as-detach.txt`, `r-stop-then-close-filed-as-detach.txt` | `stream-detach-review.test.ts` › "a stop that landed before the page closed" |
| 2.1 | The ended notice decides "unwatched" on a stale reading | medium | Real. Pass 1: the notice reads `last_watched_at` fresh (`readLastWatched`) before it sends. | `review-notice-reads-stale-watch.txt`, `r-notice-reads-stale-watch.txt` | `stream-detach.test.ts` › "a watch stamped after the clock's last read" |
| 2.2 | An in-place follow leaves the bubble's "running" rows frozen | medium | Real. A follow, and its end, settle the bubble's running rows as unconfirmed ("This page lost its connection while the step ran; how it ended is in the turn's timeline."). | `review-client-follow-honesty.txt`, `r-follow-leaves-running-rows.txt` | `useAnaChat-detach.test.ts` › "honestly" |
| 2.3 | The Working marker is read once, ignores its failure, and calls a waiting run "Working" | medium | Real. Re-read every 15 s and when the page comes back on screen; "Waiting for you" for a hold or an approval; "Couldn't check which conversations AnA is working in." on a failed read. | `review-client-follow-honesty.txt`, `r-marker-read-once.txt`, `r-marker-waiting-read-as-working.txt`, `r-marker-failed-read-silent.txt` | `projectHomeWorkingMarker.test.tsx` |
| 2.4 | A hand-over whose conversation cannot be read shows an empty answer | medium | Real. The follower says "The answer couldn't be loaded. Reopen the conversation." instead of an empty answer; the record is still linked. **Closed 2026-10-29:** the line now also reaches the screen on a turn with no step rows (`AnaActivity.tsx hasReportableWork`). | `review-client-follow-honesty.txt`, `r-handover-shows-an-empty-answer.txt`, `review-follow-line-hidden-on-a-settled-turn.txt` | `useAnaChat-detach.test.ts`; `conversationThreadAdminFollow.test.tsx` › "something to say" |
| 2.5 | A 401 on the follower's poll reads "Can't reach the server. Retrying." forever | medium | Real. `pollRun` reads 401 as signed out, with the server's sentence (or "Your sign-in has ended, so this page cannot follow the turn. Sign in again to see how it went."); polling stops. **Closed 2026-10-29:** the line now reaches the screen on a turn with no step rows, as in 2.4. | `review-client-follow-honesty.txt`, `r-401-read-as-unreachable.txt`, `review-follow-line-hidden-on-a-settled-turn.txt` | `useAnaChat-detach.test.ts`; `conversationThreadAdminFollow.test.tsx` › "something to say" |
| 2.6 | Signing out on one device stops the turns on every device | medium | Real. Pass 1: a run carries `started_session_id`; a sign-out stops only that session's runs. | `r-logout-stops-every-device.txt` | `passwordResetAuditTrail.test.ts` › "only those" |
| 2.7 | A failure the server announced (code-less error frame) read as a lost socket | low | Real. The frame marks itself server-sent; the client keeps the failure's words. | `review-client-follow-honesty.txt`, `r-codeless-error-read-as-lost-socket.txt` | `useAnaChat-detach.test.ts` |
| 2.8 | A failed or malformed live-runs read on reload is silent, or "no runs" | low | Real. A malformed body is null, not empty; the conversation says "Couldn't check whether AnA is still working here.", with "Check again". | `review-client-follow-honesty.txt`, `r-live-runs-failure-silent.txt` | `useAnaChat-follow.test.ts` › "could not be made"; `conversationThreadAdminFollow.test.tsx` |
| 2.9 | "Stops by 14:31" is not a bound | low | Real. The marker says the limit plus the closing grace (`stoppedByMs`), when the stop has landed. | `review-client-follow-honesty.txt`, `r-marker-local-clock-not-a-bound.txt` | `projectHomeWorkingMarker.test.tsx` |
| 3.0 | IAM-34: logout stops runs on a signature-only check, under the system scope | high | Real. Pass 1: only a live access token of the session it ends (token class, expiry, revocation), and that session's runs. | `r-logout-stops-on-a-signature.txt`, `r-iam23-contract-per-file-only.txt` | `passwordResetAuditTrail.test.ts` › IAM-34; `token-class-every-verifier.test.ts` |
| 3.1 | INF-39: `ci:tenant-isolation:no-regression` red (an optional organisation predicate) | medium | Real. Pass 1: `stopRunsFor` is an organisation-keyed statement or a user-wide system statement. The gate exits 0 (`gates.txt`). | `r-stop-optional-org-predicate.txt` | `run-control-detach.pglite.test.ts`; the gate |
| 3.2 | DP-82: the admin cancel lands first and its audit row follows, outside it, swallowed | medium | Real. One transaction; a refused row rolls the cancel back (503, "The turn was not stopped: …"). | `review-admin-cancel-not-one-transaction.txt`, `r-admin-cancel-audit-after-the-fact.txt`, `r-admin-cancel-refusal-unmapped.txt` | `run-control-detach.pglite.test.ts`, `stream-admin-cancel.test.ts`, `run-admin-cancel-audit.dbtest.ts` (fresh2, RLS on) |
| 3.3 | IAM-35: no standing check for a turn whose run row could not be opened | low | Real. `localOnlyRunHandle(subject)` carries the same check; the turn stops locally. | `review-standing-cause-and-local-handle.txt`, `r-no-standing-check-without-a-row.txt` | `run-standing.test.ts`; `stream-detach.test.ts` › "a turn with no run row" |
| 3.4 | DP-83: "the session that started this turn ended" for causes that are not a session ending | low | Real. The check's cause (`credential_ended`, `membership_ended`, `org_unavailable`, `standing_unreadable`) goes into `stopped_detail` and the record; the line reads "the sign-in or access that started this turn ended". | `review-standing-cause-and-local-handle.txt`, `r-standing-cause-collapsed.txt` | `run-standing.test.ts`; `stream-detach.test.ts` › "DT3 test 11"; `turnEndingRowReasons.test.ts` |
| 3.5 | DP-84: `ana_turn` mintable by any member and by `fire_notification`; the body copies the question | low | Real. Server-only category; the body is the title or "Your conversation started at HH:MM UTC"; the notice expires after 30 days. | `review-ana-turn-mintable-by-anyone.txt`, `review-notice-question-text-no-expiry.txt`, `r-ana-turn-mintable-by-anyone.txt`, `r-notice-never-expires.txt` | `notification-server-only-category.test.ts`, `run-notice.test.ts` |
| 3.6 | INF-40: nothing bounds detached turns, each pinning a connection | low | Real. 16 per process, 8 per organisation (`detach-slots.ts`); past that the turn stops as before DT3 and its record says why. | `review-detached-turns-unbounded.txt` (pre-fix: the module did not exist), `r-detached-turns-unbounded.txt` (behaviour) | `detach-slots.test.ts`; `stream-detach-review.test.ts` › "the ceiling" |
| 3.7 | INF-41: the shutdown's ~21 s budget is not a bound; ECS `stopTimeout` unset | low | Real. The code half is fixed: the run writes get 3 s, then the turns stop locally and the reaper ends the rows. `stopTimeout` is infra (MR-03), **open**. | `review-shutdown-run-writes-no-deadline.txt`, `r-shutdown-run-writes-unbounded.txt` | `shutdown-ana-runs.test.ts` |
| 4.0 | **Blocker.** An administrator's cancel credited to the asker in the Summary ("You stopped the run"); no actor in the lineage report | blocker | Real. Every projection names who took each control: Summary ("Stopped by {name}, an administrator", with the reason; "You stopped the run, as an administrator" for that administrator), run read, dossier (`by`, `byRole`, `reason`; XML; the trace report's "By" column). | `review-admin-cancel-credited-to-asker.txt`, `r-admin-cancel-credited-to-asker.txt`, `r-controls-carry-no-actor.txt`, `r-dossier-control-has-no-actor.txt` | `turn-summary-controls.test.ts`, `turnSummaryControlActor.test.ts`, `lineage-dossier-control-actor.test.ts`, `turn-summary.pglite.test.ts`; browser C (re-run) |
| 4.1 | A follower's sign-off lacks the proposal check the attached frame shows, though the audit row says it was shown | high | Real. One builder for the frame and the run read (`approvalRequiredEnvelope`). | `r-follower-approval-without-check.txt` (also red in `runs-read.pglite.test.ts` before the fix; not filed separately) | `runs-read.pglite.test.ts` › "the follower carries"; `stream-detach-review.test.ts` › "the attached frame" |
| 4.2 | "A record never says answered for a run the row says stopped" held only by event order | medium | Real. Pass 1: `endRun` says which writer ended the row (`already_ended`); the record is sealed with the row's reason. | `r-answered-over-a-stopped-row.txt`, `r-endrun-says-nothing-of-the-winner.txt` | `stream-detach-review.test.ts` › "another writer"; `run-control-detach.pglite.test.ts` › "which writer" |
| 4.3 | A governed action can run after its run ended, and the record says "did not run" | medium | Real. The route claims the held approval before sign-off and execution: an ended run gets 409 RUN_ENDED and nothing runs; a double submit is refused; a run that ends during the action is said in the answer, logged and put in the ledger; the waiting turn records "stopped after a person approved it". **Closed 2026-10-29:** the approval window's own deny no longer takes an approval its person has claimed; the turn waits up to 2 minutes for the claim's decision, and says so if none comes. | `review-governed-action-after-run-ended.txt`, `r-governed-action-after-run-ended.txt`, `r-run-ended-during-action-silent.txt`, `r-stopped-after-approval-says-nobody-decided.txt`, `review-window-deny-overrides-a-claimed-approval.txt` | `governedActionRunEnded.test.ts`; `run-control-detach.pglite.test.ts` › claimApproval; `stream-detach-review.test.ts` › "approved action", "window closes" |
| 4.4 | Admin cancel: outcome invisible, whose run unnamed, one click | medium | Real. The chained row names the owner, the conversation and the reason; a refusal is shown in the dialog; the Stop is a dialog that names whose turn it is and asks why. | `review-admin-cancel-not-one-transaction.txt`, `r-admin-stop-one-click.txt`, `r-follower-names-no-asker.txt`, `r-admin-cancel-no-reason.txt` | `conversationThreadAdminFollow.test.tsx`, `useAnaChat-detach.test.ts` › adminStop, `runs-read.pglite.test.ts` › askerName, `run-admin-cancel-audit.dbtest.ts`; browser C (re-run) |
| 4.5 | Advisory: `session_ended` and `server_shutdown` stops leave no ledger entry or cause | medium | Real for `session_ended`, fixed in pass 1: one `ana.runs.ended_with_session` row per organisation, with the cause, who did it, the owner and the run ids, and the record names the cause. **Not done for `server_shutdown`, by verdict:** a shutdown is a deploy, not a person's act or a tenant's; every stopped run's row says `server_shutdown`, each turn's sealed record says so, and the process logs the count (`settleOwnedRunsForShutdown`). A tenant ledger row per deploy would attribute a platform event to each organisation. | `r-session-end-names-no-cause.txt`, `r-record-names-no-session-cause.txt` | `run-control-detach.pglite.test.ts`, `stream-detach-review.test.ts` › "names what ended it" |
| 4.6 | The record's wording for the detached 40-minute cap cites Auto's budget | low | Real. The record says the turn "stopped at the 40-minute limit for a turn that continues after its page closes", and the transcript's note "AnA reached the 40-minute limit for a turn that goes on after its page closes, …", unless the turn was under Auto. | `review-detached-cap-worded-as-auto.txt`, `r-detached-cap-worded-as-auto.txt` | `tool-trace-detached-cap.test.ts`, `anaDetachedCapNote.test.ts` |
| 4.7 | "Stops by 14:31" in local time with no zone, beside UTC elsewhere | low | Real. "stops by 14:33 UTC" (`utcClock`). | `review-client-follow-honesty.txt`, `r-marker-local-clock-not-a-bound.txt` | `projectHomeWorkingMarker.test.tsx` › UTC |
| 4.8 | Advisory: logout stops runs on an expired or revoked token | low | Real; fixed with 3.0 (pass 1). | `r-logout-stops-on-a-signature.txt` (`-t 'IAM-34|already revoked'`) | `passwordResetAuditTrail.test.ts` |

## D-7 (decided 2026-10-22)

**The decision** (coordinator, under the founder's delegation; design §9 D-7, §12.6): a Live Drive turn detaches like any other when its page closes. From that moment AnA stops driving the screen: a further screen action is refused, never queued, listed as a step that did not run with "Not run: the page was closed, so AnA stopped driving the screen.", and the rest of the turn goes on.

**What changed.**
- `run-status.ts detachable({ runId, runUserId, threadResolved })` no longer takes the drive flag.
- `stream.ts`: `screenGone()` is true once the turn has detached with its drive enabled. A call to a tool in `SCREEN_ACTION_TOOLS` (`navigate_to`, `act_on_screen`, `start_product_demo`) is then refused before its handler: the step is `not_run` with `why: screen_gone` (`step-presentation.ts` gives it `SCREEN_GONE_LINE`), the model gets `SCREEN_GONE_RESULT` (do not call these again; finish the work and answer), and nothing counts it as a failure to work around. No directive, surface action, demo promotion or move settle is sent after the close.
- Client: `useAnaChat.ts` follows a drive turn like any other (the drive-request ref is gone).
- Client, completed 2026-10-29: a step the server records `not_run` is `not_run` on the client, on the live frame, in a reopened conversation (`hydrateToolTrace`) and in the Summary (`turnSummaryRows.ts stepRowStatus`). The folded line says "2 steps completed · 1 did not run", never "1 failed", and the row carries `SCREEN_GONE_LINE`. Acceptance G's screen 03, filed before this change, shows the old line.

**Red, then green.**
- Pre-fix: `red/review-d7-live-drive-turn-stops-on-close.txt` (the close stopped the turn: `internalStops` was `['client_disconnected']`).
- Mutations: `r-d7-live-drive-stops-on-close` (the drive flag back in the predicate), `r-d7-screen-action-runs-after-close` (the refusal off: the handler runs on a page that is gone), `r-d7-client-drive-turn-not-followed`.
- Green: `stream-detach-review.test.ts` › "a Live Drive turn whose page closes" (it finishes `finished`; a screen action after the close is refused, its handler never called, listed with the line; a read still runs), `stream-disconnect.test.ts` (D-7 cases), `run-detachable.test.ts`, `useAnaChat-detach.test.ts` and `useAnaChat-follow.test.ts` (a drive turn follows), `anaScreenGoneStep.test.tsx` (not run, not failed; red `review-d7-client-not-run-read-as-failed.txt`).
- Browser: acceptance G re-run with Live Drive on (below, `acceptance/d7-live-drive/`).

## The semantic conflicts, each addressed

| # | Conflict (from the merge review) | Resolution | Test (red → green) |
|---|---|---|---|
| 1 | **Blocking.** A detached turn used `req.dbClient` after the response closed. Since `14362ef00` the request's pinned client is used by every tool, by the round's title lookup and by context assembly. The auth boundary released it on `close`, so the next round failed. | A lease with holders (`server/db/requestDbLease.ts`). The response holds the client until it ends. The stream retains it for the turn and its post-processing. The connection and the tenant variables are the same, and nothing falls back to the pool. A response closed before the handler ran has nothing to retain, so it fails closed. | `establishRequestTenantScope.test.ts` › retained (`red/lease-absent.txt`, `red/m-lease-released-on-close.txt`); `stream-detach.test.ts` › "tenant connection" (`red/m-stream-does-not-retain.txt`) |
| 2 | A sub-agent child inherited the released client. A server-side stop credited its in-flight steps to the person ("You stopped …", against `5d8e60f3e`). | The child reads on the retained client. A cancelled step's `why` is `stopCause(runStopReasonOf(runSignal))`, as in "… was ended because the server restarted for an update." | `stream-detach.test.ts` › "credited" (`red/step-stopped-by-server-credited-to-person.txt`, `red/m-step-credited-to-person.txt`) |
| 3 | A sub-agent's hold waits on a detached parent. Children have no run row, and their held-back steps are not counted. | Stated in design §12.4. Sub-agents stay off in production (ADR-0015). No code change. | — (a statement, not a behaviour) |
| 4 | A read-only refusal (`2aa766a76`) was counted as "not authorised" in the notice and the closing row. | The timeline marks such a step `readOnly`. `shared/ana/turn-timeline.ts notAuthorisedStep` counts only approval denials and timeouts, on the server and the client. | `turn-timeline-not-authorised.test.ts`, `anaFollowLines.test.ts` (`red/read-only-refusal-counted-not-authorised.txt`, `red/m-read-only-counted-not-authorised.txt`) |
| 5 | A Manual hold's `next` could offer a step that the read-only answer will refuse. | `next` and `pending` are filtered by `willRefuse` (`readOnlyToolRefusal`). A hold where every step would be refused does not hold. | `turn-run-policy.test.ts` › "read-only turn's Manual hold" (`red/manual-hold-offers-read-only-refused-step.txt`, `red/m-hold-names-refused-steps.txt`) |
| 6 | The immediate session-end hooks missed SCIM `DELETE /Users/:id`, member removal, SAML logout and idle revocation. | SCIM (every deprovisioning path) and member removal now call `stopPersonsRuns`. SAML logout and idle revocation are not hooked, by design: §12.2 gives the reasons, and the round-boundary check is the backstop. A turn with no credential stops (fail closed). | `scim-deprovision-stops-runs.test.ts` (`red/scim-deprovision-misses-runs.txt`, `red/m-scim-delete-stops-nothing.txt`); `tenant-users-audit.test.ts` (`red/m-member-removal-stops-nothing.txt`) |
| 7 | A strict round-body refusal (`7780de83f`) ended a detached turn with a write to a dead socket. | The turn ends `failed`, files its record `failed`, and its notice says "AnA stopped: the turn ended with an error". | `stream-detach.test.ts` › "strict round-body" (`red/m-failed-turn-notice-says-finished.txt`) |
| 8 | `TaskTray.openNotice` was a second, unverified door. `ana_turn` was not a category. | Converged onto trunk's door, as above. Trunk's F19 rule stands: opening a notice does not mark it read. | `notification-conversation-target.test.ts` (`red/m-resolver-has-no-conversation.txt`); `taskTrayNoticeOpens.test.tsx` (`red/m-client-opens-no-conversation.txt`); `run-notice`/`stream-detach` › "ends: one notice" (`red/m-notice-names-no-record.txt`) |
| 9 | Shutdown timing against Fargate. | Reported below and in design §12.3. Terraform is not changed (out of scope). | `shutdown-ana-runs.test.ts` (`red/m-shutdown-ends-no-runs.txt`) |
| 10 | TaskTray and ProjectHome churn, and the first build's `tt-notif-open`/`tt-go` classes. | TaskTray is back to trunk, and the classes are gone. `ci:undefined-css-classes` and `ci:class-vocabulary` pass. ProjectHome reads `useWorkingThreads().byThread`. | `projectHomeWorkingMarker.test.tsx` (`red/m-no-working-marker.txt`) |
| 11 | Purge ordering: the runs are stopped before a purge that can still refuse. | Accepted and stated in design §12.2. Such an organisation is already `pending_deletion`, and `requestDeletion` stopped its runs. | `tenant-offboarding.test.ts` (`red/m-purge-does-not-stop-runs-first.txt`) |
| 12 | The `last_watched_at` UPDATE runs inside a GET on the RLS-scoped request client (`278a443dc`). | Verified in the DB tier with RLS enforcing, as the runtime role, on the request's own bound client. The UPDATE lands in the run's own organisation. Another organisation gets a 404 and stamps nothing. | `runs-watched-stamp-rls.dbtest.ts` (green on fresh2, `green/db-tests.txt`); `runs-read.pglite.test.ts` › watched stamp (`red/m-no-watched-stamp.txt`) |

Trunk's own `run-hold-cancellation.test.ts` (`661a2c93a`) caught the first build reading the row again on a cancelled hold. The hold now returns `'cancelled'` or `'ended'`, so a cancel settles without another read (`red/m-cancelled-hold-reads-the-row.txt`). An `'ended'` hold with no abort reaching the turn fails closed (`red/m-ended-hold-carries-on.txt`, `red/m-ended-hold-read-as-a-stop.txt`).

## Tests: red, then green

`red/mutations.py` shows red in two ways. Every file is restored from memory after each run. The tree's md5 was checked after the last runs.
- `head-*` runs the DT3 suites against the source at HEAD (every DT3 source change reverted, and every new module moved aside).
- `m-*` applies one targeted mutation at a time.

All 39 entries exit non-zero (`red/*.txt`, first line of each). Files without the `m-`/`head-` prefix are reds captured before the fix by running the new test on the pre-fix tree.

| Behaviour | Test | Red |
|---|---|---|
| A durable, owned turn without drive detaches: it is not settled, not stopped, and runs to `finished` | `stream-disconnect.test.ts`, `stream-detach.test.ts` | `head-stream-and-run-control.txt`, `m-detach-settles-first.txt` |
| A run with no resolved conversation stops. A new conversation waits for its thread to be decided | `run-detachable.test.ts`, `stream-disconnect.test.ts` › "could not be stamped" | `detachable-without-a-conversation.txt`, `m-detach-without-conversation.txt`, `m-no-wait-for-the-thread.txt` |
| A row set `failed` by another writer aborts the owner, and the abort carries the reason | `run-control-detach.pglite.test.ts`, `run-stopped-gateway.test.ts` | `m-failed-does-not-abort.txt`, `m-abort-carries-no-reason.txt` |
| A shutdown writes `failed`/`server_shutdown`, and ends every owned run before the drain | `run-control-detach.pglite.test.ts`, `shutdown-ana-runs.test.ts` | `m-shutdown-writes-cancelled.txt`, `m-shutdown-ends-no-runs.txt` |
| The unattended limit at 15 minutes unwatched; the 40-minute cap | `unattended-clock.test.ts`, `stream-detach.test.ts` | `m-unattended-never-due.txt` |
| The round-boundary standing check stops a turn whose session ended | `stream-detach.test.ts`, `run-standing.test.ts` | `m-no-round-standing-check.txt` |
| Sign-out everywhere, SCIM, member removal and purge each stop the person's or organisation's runs | `account-standing-stops-runs`, `scim-deprovision-stops-runs`, `tenant-users-audit`, `tenant-offboarding`, `master-admin`, `passwordResetAuditTrail` | `head-hooks-reads-notices.txt`, `m-sign-out-everywhere-stops-nothing.txt`, `m-scim-delete-stops-nothing.txt`, `m-member-removal-stops-nothing.txt`, `m-purge-does-not-stop-runs-first.txt` |
| An admin's cancel is accepted, and its audit outcome is in the response | `run-control-detach.pglite`, `stream-admin-cancel.test.ts` | `m-admin-cancel-refused.txt`, `admin-cancel-audit-outcome-discarded.txt`, `m-admin-audit-outcome-discarded.txt` |
| The hold is written for a follower | `run-control-detach.pglite` › "the hold, for a follower" | `m-hold-not-written.txt` |
| The watched stamp, and no notice while watched | `runs-read.pglite`, `stream-detach.test.ts` | `m-no-watched-stamp.txt`, `m-notice-when-watched.txt` |
| The client follows instead of stopping, shows no "stopped responding" on a timeout, shows the admin's Stop, and shows the Working marker | `useAnaChat-detach.test.ts`, `conversationThreadAdminFollow.test.tsx`, `projectHomeWorkingMarker.test.tsx` | `head-client.txt`, `m-timeout-shows-stopped-responding.txt`, `m-admin-stop-hidden.txt`, `m-no-working-marker.txt` |
| **Found in the browser:** an attached page whose turn the row stopped got an `error` frame | `stream-detach.test.ts` › "a page still attached when the run row stops its turn" | `browser-found-attached-page-stop-read-as-error.txt`, `m-attached-row-stop-read-as-error.txt` |
| **Found in the browser:** the client dropped the row's reasons | `turnEndingRowReasons.test.ts` › readTurnEnding | `m-client-drops-row-reasons.txt` |
| **Found in the browser:** the transcript had no note and no Continue for a row stop | `turnEndingRowReasons.test.ts` › "the transcript's note" | `browser-found-transcript-has-no-row-note.txt`, `m-transcript-has-no-row-note.txt` |

Green: `green/` (see "Gates and suites").

## Gates and suites

All of these ran on the final tree of the review fixes, on 2026-10-22 (`gates.txt`, `green/`). The first pass of the day's figures (10,323 tests, 76 DB tests, 39 mutations) are superseded by these.

- **Pre-push gates, and the gates the reviews named.** 58 gates (`gates.txt`): every gate in `.husky/pre-push`, plus `ci:tenant-isolation:no-regression` and its justifications, the tenant entry-point and resolver gates, the error envelope, internals in copy, the design system, client API calls, launch-scope API, action overclaim, dead audit catch, microcopy, audit route mounts, AI tenant binding, regulated delete audit and the discarded-audit-write self-test. **55 exit 0.** The three that do not are not this change's, and none touches a file it changed:
  - `ci:tenant-entry-points`: `server/jobs/scheduleOfEventsSweep.ts` changed since its justification (trunk `404371c51`).
  - `ci:launch-scope-api`: `/api/ind-master-data/sponsors`, called from `IndApplicantIdentity.tsx`, is unmapped (trunk `f165afe1f`).
  - `ci:untracked-imports --all`: `auth-invalid-expired-jwt.test.ts` imports `'../../middleware/' + 'auth.ts'`, read as an untracked directory (a file from 2026-06-08). The hook's own mode reports nothing.
  - The first run of the final tree caught two of this change's, fixed in the code and never in a baseline: `audit:repo-health:ceiling` (`run-control.ts` past 100,000 bytes; the approval claim moved to `run-approval-claim.ts`) and `ci:pushed-lint-warnings` (+13; refactored to net −1).
  - The commit-reading gates were made to see the uncommitted work through a temporary index that holds the new files; the real index was not touched. `ci:pushed-typecheck` runs `typecheck-no-regression.mjs`; it was run directly and reports 0 errors.
  - ESLint errors over every changed file: 0 (117 files).
- **Type check.** `NODE_OPTIONS=--max-old-space-size=10240 npx tsc --noEmit -p tsconfig.check.json`: **0 errors**, tests included (`green/tsc.txt`).
- **Wider suites** (unit tier, `RLS_ENFORCE=off`; `green/wide-suites.txt`): the DT3 suites, the brief's wider suites, and every suite of a module this change touched, now including the auth, SSO, session, notification, tenant-users and password route suites, `server/__tests__/security`, `server/middleware`, `server/services/ana-ri`, `server/services/report-os`, `server/mcp` and `shared`. **1,096 files and 14,239 tests: 14,164 passed, 71 failed, 4 skipped.** The **71 failures, in 22 files, are not this change's**: the same 22 files run alone at HEAD with every DT3 change reverted (restored from memory, md5-checked) fail the same 71 tests, by name (`green/wide-failures-at-head.txt`, diffed). They are the 14 files of the first pass (the golden journeys, founder-path lineage, `anaDrivesWave5`, `mdx-esg-transmit-gateway`, `ana-launch-scope` and its execution test, `document-catalog-program-binding`, `package-ectd-for-region-withdrawal`, `billing-credits-not-metered`, `capa-governed-service-handoff`) and 8 in the directories added this time: five `report-os/pdf` suites, `lifecycle-calendar` and `label-currency-matrix` (report-os) and `launch-scope-api-gate` (middleware, the same unmapped path as the gate above).
- **DB tier.** On **fresh2** (`concept2cure-ri_qa_fresh2`) with `RLS_ENFORCE=on` and `vitest.db.config.ts`, after `deploy-migrate` re-ran at 15:49:36Z for the review's two columns (`green/deploy-migrate-fresh2.txt`, `green/db-tests.txt`). **78 passed:**
  - `run-admin-cancel-audit` (2, new): the cancel and its chained row land together under the tenant policy, as the runtime role; a row the database refuses rolls the cancel back, with no control event;
  - `run-control-cross-instance` (12), `run-events-rls` (5), `runs-watched-stamp-rls` (3), `mcp-account-standing` (16), `account-standing` (13) and its time-zone test (3), `tenant-purge` (12), `tenant-purge-audit` (3), `turn-record-purge-door` (7), `tenant-purge-artifact-records` (2 of 3).

  The third `tenant-purge-artifact-records` test is trunk's (`SOURCE_READ_RECEIPT_PURGE_REFUSED`, `9c266724f`), as in the first pass.
- **Red, again, at the end.** See "Tests: red, then green".

## Acceptance (browser, `acceptance/`)

**Setup.**
- A private instance of the working tree ran on :5099 (not :5078 or :5091) against **fresh2** (`concept2cure-ri_qa_fresh2`, built by `deploy-migrate` after the `detached_at` amendment), with `RLS_ENFORCE=on` and the DT1 stand-in model on :8839.
- `ana.document_catalog` and `ana.vault_chunking` were left off, and `ANA_DOCUMENT_CATALOG_FORCE_ON` was not set.
- The browser was Chromium from `/opt/pw-browsers`. A desktop (1280×800) and a phone (390×844) were signed in as `dt1-asker`, and a second page as `dt1-admin` of the same organisation. No credential is written in the evidence: the harness reads `PW_FILE` and takes the sign-in code from the dev server's own log.
- The harness is `acceptance/dt3-detach.mjs`. The results are `acceptance/dt3-detach.json` (`checks`, `runs`, `views`, `shots`) and `acceptance/screens/`. Also filed: `acceptance/run-log.txt`, `acceptance/dt3-detach-console-and-http.json`, and `acceptance/server-log-shutdown-excerpt.txt` (scrubbed).
- Both servers were stopped afterwards.

**Final run.** All 20 checks are true. It ran on 2026-10-22 between 06:52 and 06:56 UTC, after the last change in behaviour (a later refactor of `stoppedNoteText` keeps every string; see "Gates and suites").

| Scenario | What it showed | Run row | Screens |
|---|---|---|---|
| A. A long Auto turn; the desktop page **closes**; the phone follows it to the end | The phone reads "Working · step 2 · 16s", with no "lost connection" line. The turn finishes and the record seals. | `finished`/`no_more_tools`, `detachedAt` set, sealed | `01`–`03` |
| B. The page that started the turn **reloads** mid-turn | It rejoins ("Working · step 1 · 13s"), follows, and hands over to the record. | `finished`, `detachedAt` set, sealed | `04`, `05` |
| C. An **admin** stops a colleague's turn | The admin's follower offers Stop and nothing else. The asker reads "Stopped by an administrator.", and so does the Progress panel. | `cancelled`/`admin_cancelled`, sealed | `06`–`08` |
| E. A **Manual hold**; the desktop closes at the hold | The phone shows "Waiting for you before the next step · Next: …" with **Run this step** and **Do this instead**. Run this step is obeyed. Stop from the phone stops the turn. | `cancelled`/`cancelled`, `detachedAt` at the hold, sealed | `09`–`12` |
| F. A turn nobody watches finishes | TaskTray's notice names the conversation. Opening it through the server-verified door opens that conversation. | `finished`, `detachedAt` set | `13`, `14` |
| G. **Live Drive on** (the default), as first run, under the old D-7 | The turn asks to drive. Closing its page still stops it, and the phone reads "This page lost its connection, so the run was stopped before AnA finished. Continue picks it up." **Superseded** by D-7 as decided on 2026-10-22; re-run below. | `cancelled`/`client_disconnected`, no `detachedAt` | `15` |
| D. **SIGTERM** mid-turn, with the phone and the desktop open | The server ends the run first, and the turn records itself inside the drain (the excerpt shows `shutdown ended 1 live run(s) as server_shutdown`, then the stream closing 57 ms later). While the server is down the phone reads "Can't reach the server. Retrying.". After the restart, both pages read "Stopped: the server restarted for an update. Continue picks it up." with **Continue**. | `failed`/`server_shutdown`, sealed | `16`–`18` |

The server log for the final run's window has no error-level line, and no "released request DB client" or `MissingRequestDbContextError`.

**Found by the acceptance, and fixed (red first).** The first runs failed three ways, all DT3 defects (design §12.5):
1. An attached page whose turn the row stopped received an `error` frame.
2. The client dropped the row's reasons.
3. The transcript had no note and no Continue for a row stop.

**Found by the acceptance: a decision, not a defect.** Live Drive has been on by default since `9db931c56` (2026-09-22). Every turn of a person on the defaults therefore asked to drive, and by the old D-7 it never detached. Scenarios A–F switch Live Drive off in the person's own setting (stored as the shell stores it); G showed the default. **D-7 was decided on 2026-10-22** (see "D-7"), and G was re-run.

**G re-run under D-7 (2026-10-22, 17:08–17:09 UTC; `acceptance/d7-live-drive/`).** Same instance, database and setup, after every review fix. The stand-in's "d7 drive" play (`d7-live-drive/stand-in-d7-play.txt`): `navigate_to` while the page is open; then, the round held 15 s (`FAKE_SLOW_TOOL=act_on_screen:15000`) so the page has closed, `act_on_screen`; then `list_project_documents`; then the answer. All 7 checks are true (`dt3-detach-G.json`):
- the request asked to drive (`live_drive: true`); after the close the run was `running` with `detachedAt` set (17:08:13.315Z) and "stops by" armed;
- it ended `finished`/`no_more_tools`, sealed, `detachedAt` kept;
- the record's Summary lists the screen action as `not_run` with "Not run: the page was closed, so AnA stopped driving the screen." (screen 04), and the read as `success`;
- the model was told the step did not run and why (`model-told-screen-gone.txt`); its handler was not called, and the stand-in's log shows no further screen call (`stand-in-log.txt`);
- the phone followed it ("Working · step 1 · 10s", no "lost connection" line) and handed over to the record;
- the server log for the window has no error-level line and no released-client error.
Both servers were stopped afterwards.

**Not DT3.** The Progress panel's "Memory · Could not be read" appears because the private instance has no `OPENAI_API_KEY` for the memory lane's embeddings (`[MemoryContextAssembler] Memory layer failed: … OPENAI_API_KEY is required`). The console log holds:
- certificate errors from an external resource through the proxy;
- the refused connections while the server was down in D;
- aborted history reads on remount.

**Not shown in the browser** (the design's list is longer than one session):
- the 15-minute unattended limit (fake timers: `unattended-clock.test.ts`, `stream-detach.test.ts`);
- sign-out stopping a running turn (`account-standing-stops-runs`, `stream-detach` › "session that ended");
- an approval that is not answered;
- a two-instance `kill -9` (`run-control-cross-instance.dbtest.ts`, DB tier).

## ECS stop timeout

`terraform/` sets no `stopTimeout` anywhere, so Fargate's default applies: SIGKILL 30 s after SIGTERM. The ALB's `deregistration_delay` is 30 s (`terraform/modules/alb/main.tf`). The shutdown runs in this order:
1. it ends the owned runs (one statement per organisation);
2. the HTTP drain and the turns' recording share one 10 s window;
3. the AI action queue drains for up to 10 s;
4. the pool closes.

That is at most about 21 s, inside 30 s with about 9 s to spare. Nothing configures that margin. After an `uncaughtException` the process force-exits at 12 s, which cuts the action-queue drain short; by then the runs have already ended. The recommendation is `stopTimeout = 45` on the API container (MR finding infra-hi-4 prescribes 60). Terraform is not changed here, because it is outside this slice.

## CI failures that are not this slice's

These were listed by the triage and left alone:
- **insert-columns baseline:** `projects.submission_type`.
- **proof-tier:** the `submission-export-package` fixture.
- **Semgrep:** 16 findings.
- **npm audit:** 400.
- **Trivy:** Pillow 12.3.0.
- **gitleaks:** 7 false positives.
- **Tier 5 smoke:** `SMOKE_USER_EMAIL`.
- **Test/Coverage:** the `authService` mocks and `protocolReviewer onDone`.
- **`anaDrivesWave5`:** the CmcModule placeholder (`c5168933d`).
- **`tests/db/tenant-purge-artifact-records`:** `SOURCE_READ_RECEIPT_PURGE_REFUSED` (`9c266724f`).

No CI fix was applied.

## Open issues

1. **ECS `stopTimeout`** (INF-41, the infra half). It is still unset (Fargate's 30 s default). The code half is done: the run writes have a 3 s deadline. Set 45 (or infra-hi-4's 60) on the API container. This is infra (MR-03), outside the slice.
2. **Closed 2026-10-29: a step that did not run.** A D-7 screen step is now "1 did not run" in the folded line and in the Summary (see "Closing the open items"). The other statuses the client still reads as failed are unchanged: a declined step, a step stopped mid-call, and a step that was not found. That is a separate presentation decision.
3. **Sub-agents** (off in production, ADR-0015). A `run_agent` child has no run row. It is reached only through the parent's signal, it holds on the parent's hold, and its held-back steps (`agent_event` frames) are not in the parent's "not authorised" count.
4. **Doors stopped at the round boundary only.** SAML single logout and the idle-session revocation in `middleware/auth.ts` do not stop runs at once. The turn stops at its next round boundary when `verifyLiveToken` refuses the token. A long tool call can run until that boundary, still bounded by the unattended clock and its grace.
5. **`runStanding` and cookie auth.** A turn with no bearer credential stops (fail closed). Trunk is bearer-only today. If cookie auth arrives, every such turn would stop at its first round boundary until `runStanding` learns the cookie.
6. **Purge.** A purge that `purgeInOneTransaction` then refuses has already stopped the organisation's runs. This is accepted: the organisation is already `pending_deletion`, and `requestDeletion` stopped them (design §12.2).
7. **Migration journal drift.** The in-place amendments of `20260917_ana_runs.sql` (`detached_at`; `started_session_id`, `stopped_detail`) register as `drift` in `c2c_migration_journal`, which nothing reads (RULE 1). Each documents itself in the file's header.
8. **A `server_shutdown` stop has no tenant ledger row** (finding 4.5's second half, by verdict; see the table).
9. **Acceptance items not run in a browser**, each covered by tests: the 15-minute unattended limit, sign-out mid-turn, an unanswered approval while away, a governed action whose run ends mid-signature, the detach ceiling, the two-instance `kill -9` and the staging redeploy (the local SIGTERM, D, stands in for it). Scenarios A, B, E, F and D ran before the review fixes; C and G were re-run after them.
10. **Not this change's, found while running the gates and suites.** `ci:tenant-entry-points` and `ci:launch-scope-api` fail on trunk files; 71 unit-tier failures in 22 files fail identically at HEAD `28637579e` with DT3 reverted; the DB tier's `tenant-purge-artifact-records` (`9c266724f`); `ci:untracked-imports --all`'s findings are in files this change does not touch.
11. **For the coordinator.** `stash@{0}` ("wip DT3 + CI triage, cut off by usage limit 2026-10-08") is still in the stash list. Its content is in the working tree. This session did not touch the stash. Drop it once the DT3 commit lands. `origin/concept2cure-v2` has moved past `28637579e`; nothing was fetched or merged here.
