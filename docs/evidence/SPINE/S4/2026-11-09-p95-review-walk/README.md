# S4 · P-95 on AnA's artifacts, walked in the running app (2026-11-09)

Owner: `session_01KZK3jgtmQBgNepqLjXjS3k` (P-105). This is the running-app proof RULE 4 asks for of the artifact review
step (`2b092fd1d9`), and the two gaps the walk found, fixed.

## How it was run

- **Server:** the real one, `tsx server/index.ts`, with `NODE_ENV=development`, `ALLOW_DEV_AUTH=1` and
  `RLS_ENFORCE=on`. The runtime connected as `app_service`.
- **Database:** a blank local database provisioned as CI does it (`install-fresh`, then `deploy-migrate`), seeded by the
  repo's `tests/e2e/seed-governed-workflow.cjs`. The repository's `.env` points only at a local database too
  (`127.0.0.1:5432/clinicalsage`).
- **Browser:** real Chromium sessions through the repo's dev-login. The admin is the author; the seeded reviewer and
  viewer users stand in for colleagues.
- **The project** was created through `POST /api/c2c/projects`, the wizard's route.
- **One step was substituted.** No model key is set here, so AnA cannot draft. The walk answers the stream with the two
  events that announce a draft (`artifact_draft`, `artifact_version_saved`). Those events name an artifact that really
  is in the database, filed under the project's anchor row as AnA's post-processing files one. Every control after that
  hits the real server.
- **Scripts:** `walk-author.cjs.txt` and `walk-reviewer.cjs.txt`. Their output is in `walk-author.log` and
  `walk-reviewer.log`.

## What the walk showed

| Step | Result |
|---|---|
| The author routes the draft to review | `PUT …/status` 200; the card reads "In review" (`01`, `02`) |
| The round is read | `GET …/reviews/status` 200; "No reviewer is named yet." (`02`) |
| Name reviewers | `GET …/projects/:p/team` 200; the author is not offered (`03`) |
| Assign | `POST …/reviewers` 200; "Waiting for a decision", and the toast "Named 1 reviewer … round 1." (`04`) |
| **The reviewer, first pass: nowhere to decide** | `GET /reviews/pending` returned the assignment, but `/reviews/my-queue` was empty and the artifact was on none of the reviewer's screens. The decision controls were only on the author's card, in the author's own conversation. |
| **The picker, first pass: people who could never decide** | Offered "Author User" (member) and "Viewer User" (viewer). `reviews/submit` lets only reviewer, approver or admin decide, so a round with either could never close. |
| After the fix: the reviewer's Home | "Your open items" lists the reviews they were named for (`05`) |
| After the fix: Review | "Reviews you were named for" shows the version under review and the decision (`06`) |
| The reviewer approves | `POST …/reviews/submit` 200; "Approved — 'Predicate comparison is complete.'" and "Round 1: every named reviewer approved." (`07`). The author's read of the round: `readyForApproval: true` |
| After the fix: the picker | Offers only "Reviewer User" |

## The fixes

- **`surfaces/ReviewRequests.tsx`**, split beside `ReviewThreads.tsx` and mounted above its threads, on the Review
  screen. It reaches `GET /api/concept2cure/reviews/pending`, which no screen read, and `…/versions`. A request shows
  the text of the version under review and the artifact's review step without the naming control (`canName={false}`).
- **`OpenWork.tsx`:** "Reviews you were named for" in Your open items on Home and in the tray, opening Review. A failed
  read is said, never shown as an empty list.
- **`ConversationArtifactReview.tsx`:** the picker offers only the roles `reviews/submit` lets decide.
- **`ui-surface-registry.ts`:** `review` declares `/api/concept2cure/reviews/pending`, beside `reviews/my-queue`.

Proof:
- `reviewRequests.test.tsx`, 8 cases, and the picker case in `conversationArtifactPanel.test.tsx`.
- Each fails when its fix is removed: the role filter, the reviewer's naming switch, the Review mount, the Home group.
- The 71 suites that mount these surfaces pass, 722 tests. `reviewWritesReachTheServer` now counts the new read as a
  read.

## Not fixed here, handed off

- **D7-record session (`015weq…`):** `POST …/reviewers` accepts any organization member, so a member or viewer can be
  named although `reviews/submit` will never let them decide. The client no longer offers them, but the server should
  refuse them, from one list of deciding roles.
- **Coordinator, `GlobalMutationErrors`:** the "audit entry is unconfirmed" notice is drawn with no background,
  overlapping the page (`02`, `04`, `07`). Here it fired because the audit row was persisted but not chained
  (`meta.auditTrail = {persisted: true, chained: false}`), since the audit chain is off outside production
  (`AUDIT_TRAIL_ENABLED` unset). Its presentation is the defect, not its firing.
- **Coordinator, Review:** the board above still says "Nothing is in review" while reviews you were named for are listed
  below it (`07`), because it covers editor documents only.
