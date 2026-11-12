# L7 Shell opens the right thing (fix-L7-shell), 2026-11-10

Plan package F1. Items GA-UI-04, GA-UI-27, GA-UI-05, GA-UI-03, GA-UI-07.
Files changed: `client/src/concept2cure/v2/OpenWork.tsx`, `client/src/concept2cure/v2/surfaces/Orchestration.tsx`,
`client/src/concept2cure/v2/surfaces/Review.tsx`, `client/src/concept2cure/v2/styles/app-v2.css`, and tests beside them.
Nothing new: no screen, route, service, table, mount or AnA tool.

## What already exists

- `v2/OpenWork.tsx`: the rows of "Your work" (bell tray, `TaskTray.tsx`) and Home's "Your open items" (`HomeSections.tsx`).
  A review-route task row called `go('review')` with no project.
- `GET /api/review/board` (`server/routes/review-board-routes.ts`): its `vaultReviews` rows carry each live route's
  members with their task ids (`server/services/review/vault-review-queue.ts`). Used, not changed.
- `v2/notificationNavigation.ts` `openNotificationRecord`: the one path a notice uses to open a Vault version in its
  project. Reused, as `Review.tsx` `openVaultVersion` already does.
- `v2/surfaces/Review.tsx` `openReviewDocument`: opens a reviewed document in the editor, in its project. Reused
  (loaded on the click, so the tray does not pull the Review screen in).
- `v2/surfaces/Orchestration.tsx` `useOrchProgram`: read `GET /api/report-os/portfolio/org` and took
  `attentionRanked[0]`. The portfolio rows already carry `programId` (`server/services/report-os/portfolio/types.ts`).
- `v2/shellProject.ts` `useShellProject` and `shellProgramId`: the open project. Reused.
- `v2/surfaces/ReviewRequests.tsx`: lists "Reviews you were named for" below the board (P-95). Not changed.
- `v2/GlobalMutationErrors.tsx`: the root-mounted notices, drawn with `ErrorState`. Not changed; only its CSS.
- `app-v2.css`: `.tt-badge`, `.rpk-tabs`, `.c2c-global-errors`, `.c2c-v2 .c2c-error-state`.

## What was wrong

- GA-UI-04: as ava, "Approve: [Demo · Lumen] TD02 etiology study ..." in the bell opened the Review board of another
  project (RRV), which said "Nothing is in review" (`before-GA-UI-04-after-click-1440.png`). With no project open,
  Review sends you to Projects. An approval at your sign-off did the same.
- GA-UI-27: Orchestration read the organisation's first-ranked project whatever project was open.
- GA-UI-05: the audit notice is mounted outside `.c2c-v2`, so no error-state rule reached it: no background, no
  border. The Review board said "Nothing is in review" above the reviews you were named for.
- GA-UI-03: the count sat on the bell's corner and covered the glyph ("45" at 1440, `before-GA-UI-03-bell-1440.png`).
- GA-UI-07: only `.npw .rpk-tabs` scrolled. The only filing picker today is New project's, so nothing was cut off
  in the app. The base rule now scrolls, so any picker does.

## What changed

- OpenWork: a Vault route task reads the board, finds the route naming its task, and opens that version in the Vault
  of its project in one click. If the board cannot be read, the tray says so and opens nothing. If the route is not
  listed, Review opens, as before. An approval at your sign-off opens its document in the editor, in its project.
- Orchestration: follows the open project (by program id). If the open project has no row in the organisation's
  project list, it reads nothing and says "This project is not in the organisation's project list for
  orchestration". Only that was checked: the list holds top-level, unarchived projects up to a cap, so it does not
  say the project has no orchestration record. Only a read error says "The project list could not be read"; an
  empty list (200 with no data) is an empty list. With no project open, or a legacy numeric workspace id, the lead
  project is used, as before. The choice is one pure function, `pickOrchProgram`, so the effect stays simple.
- Review: with named reviews listed, or that list unread, the empty title narrows to "No document from the editor is
  in this queue". AnA's open-queue and select-document refusals say the same.
- CSS: the count sits beside the bell (the button widens; 44px minimum at phone width). `.rpk-tabs` scrolls in the
  base rule; the New-project-only copy is removed. Root notices get an opaque, bordered, padded box.

## Repair, 2026-11-12 (the verifier's defects)

- V-L7-1 (blocking): `useOrchProgram`'s read callback had complexity 16. Its body is now `pickOrchProgram(res, openId,
  openTitle)`, a named pure function in the same file; the effect sets its result once. The lint ratchet lists no
  lane file (`lint-ratchet.txt`; its +15 are other lanes' files).
- V-L7-2: a 200 `{ data: null }` was shown as a failed read. Now only `res.error` is unread. Two red-first tests
  serve `{ data: null }`: with no project open the hint stays "No lead project"; with one open it says the project
  is not in the list. Neither says "could not be read".
- V-L7-3: "has no orchestration record yet" was never checked. The empty-state hint, the Start-run title and AnA's
  context line now say only what was checked (see What changed). A failed read now also reaches the Start-run
  title and AnA's context line, which still said "no lead project".
- V-L7-4: AnA's two refusals in Review had no test. `reviewBoardNamedReviews` now drives `review.select-document`
  and `review.open-queue` through the surface-action bus, with a named review listed and with none. The mutation
  that puts back "Nothing is in review." is killed in each refusal.
- V-L7-5: see Not fixed here.
- V-L7-6: GA-UI-04 is partly closed and GA-UI-05's board copy is tested, not walked (see Proof).

## Proof

- Red first: `red-openwork.txt` (3 failed), `red-orch.txt` (2 failed), `red-review.txt` (2 failed), `red-css.txt`
  (4 failed), each for the defect named.
- Repair red: `red-orch-repair.txt`, 3 failed (the unchecked wording, and `{ data: null }` read as a failure).
- Green: `openWorkOpensTheVersion` 4, `orchestrationFollowsOpenProject` 7, `reviewBoardNamedReviews` 7,
  `shellChromeStyles` 4. The five Orchestration test files pass unchanged apart from the lane's own
  (`green-orch-repair.txt`, 39 tests); `green-review-repair.txt`, 7 tests.
- Mutations: `mutations.txt`, 15 of 15 killed on the repaired tree, each file restored with its sha256 checked
  (driver: `mutate.py.txt`). The Orchestration mutations target `pickOrchProgram`; three are new (empty list read
  as a failure, the unchecked wording, and each of AnA's two refusals in Review).
- Importers (repair run, `importers-repair.txt`): 34 files, 346 of 347 tests pass. The one failure is
  `accountOnboardingSettings` ("reads the signed-in person's inbox"): it now sees a GET of
  `/api/users/me/notifications`, which comes from another lane's uncommitted `NotificationPreferences.tsx`, not
  from this lane. The first run (`importers-green.txt`, 341 tests) passed before that change. Three existing tests pinned the old behaviour and were
  updated: `reviewRouteInbox` (a QMS route still opens Review), `taskTrayApprovalsFromAuthoring` (opens the
  document), `j1PageLayout` (the base `.rpk-tabs` rule).
- Typecheck: `typecheck-scoped.txt`, scoped to the 4 source files, the 7 lane tests, and every importer of a
  changed module (TaskTray, HomeSections, surfaceViews and 15 tests): 28 files. It has no errors in any of them. The errors it shows are in files we did
  not touch, because the scoped config lacks the ambient types.
- Running app, http://127.0.0.1:5240 (`walk-1.txt`, `walk-2.txt`, no HTTP, console or page error):
  - GA-UI-04: one click on the route task opened the Vault version with Approve, at 1440 and 390
    (`after-GA-UI-04-route-task-opens-version-1440.png`, `-390.png`).
  - GA-UI-03: the count does not overlap the glyph at 1440 or 390 (`after-GA-UI-03-bell-*.png`).
  - GA-UI-05 notice: opaque page background with a red border at 1440 and 390
    (`after-GA-UI-05-audit-notice-1440.png`, `after-GA-UI-05-audit-notice-home-*.png`).
  - GA-UI-07: the tabs scroll at 390, the last tab is reachable, the page does not scroll sideways
    (`after-GA-UI-07-filing-tabs-*.png`).
- Re-checked at 23:44 on the current tree: 7 files, 32 tests pass (`recheck-green.txt`), the four new tests and the
  three updated ones.
- The repair changes only Orchestration's words and a test for Review. Neither can be seen in gademo (below), so
  no new walk was taken.
- Gates: lint ratchet lists no lane file; `ci:undefined-css-classes` passes. File sizes: OpenWork 15,200,
  Orchestration 70,193, Review 43,624 bytes. `app-v2.css` is 358,174 bytes; it was already 356,510 at HEAD, and
  the lane adds about 1.7 KB. Splitting it is outside this lane's rules (edit only the named rules).
- Not seen in the app:
  - GA-UI-27: Orchestration is refused by launch scope in this posture ("not in this release",
    `after-GA-UI-27-orchestration-*.png`), so it cannot be walked here. Tests only.
  - GA-UI-05 board copy: no named review exists in gademo (rhea: 0 pending). Creating one needs an AnA artifact,
    which needs a model key. Tests only.

## Not fixed here

- QMS and Authoring route tasks still open Review. The board does not carry their route task ids. Whose: the
  review-board session (`authoring-review-board.ts`, `mdx-qms-review-route.ts`).
- Rows that still open Review: "Review — threads & change requests" (OpenWork lines for `reviewTasks` and
  `reviewThreads`) and "Reviews you were named for". With no project open, Review sends you to Projects. Their rows
  carry no program id: the queue answers with `projectId` (number) only. Whose: whoever holds
  `/api/concept2cure/reviews/my-queue` and `/reviews/pending`, to return the program id, or the shell's review-route
  guard.

- GA-UI-04 is partly closed: Vault routes and editor approvals are done; the rows above are not.
- GA-UI-05: the notice is fixed and walked; the board copy is tested but not walked (no named review in gademo).
- Two importer tests of `app-v2.css` fail on the merged tree, not from this lane (V-L7-5,
  `css-importers-not-this-lane.txt`): `d0PhoneWidth` finds a second `.reg-tbl` block in `journey-v2.css` (the CMC
  journey-v2 lane's). `projectHomeStageCss` (`.pj-act`, project-home lane) passes on the tree as it is now.
- `accountOnboardingSettings` fails from another lane's `NotificationPreferences.tsx` (see Proof).

## Questions for the founder

- Should Orchestration be in this release? Launch scope refuses it, so GA-UI-27 cannot be shown to a buyer.
