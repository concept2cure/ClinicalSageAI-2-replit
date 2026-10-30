# RR5: Authoring's request for review writes its route and tasks in one transaction

Slice RR5 of `docs/design/REVIEW_ROUTING_2026-10-23.md`. Launch row **D2**. Code: commit `99c9d972c`.

## How this slice was finished

The RR5 builder wrote the code and the desktop acceptance run. A weekly agent usage limit
then stopped it, which reset on 2026-11-04. That happened during the phone acceptance and
before this README, the gate run or the database tier.

The coordinator session finished the slice on 2026-10-30. It did not change behaviour. It
did four things:
- ran the tests;
- ran the gates;
- ran the database tier;
- wrote this record.

The builder's red runs were not filed. The tests that went red first are listed under "What
the tests pin", and each assertion would fail on `HEAD~1`.

## What already exists (Rule 3)

| Piece | Path | Before RR5 | After RR5 |
|---|---|---|---|
| Authoring request for review | `server/routes/authoring.router.ts`, `server/services/authoring/peer-review.ts` | `authoring_reviews` row and Reviewer grant, then the review tasks as a **separate write** | One transaction writes four things: the request, the grant, a `review_routes` header and the route tasks (`server/services/authoring/authoring-review-route.ts`, through the one route writer and `createTaskInTx`) |
| REVIEWER e-sign | `POST /api/authoring/docs/:id/e-sign` (meaning `REVIEWER`) | A signature in `authoring_signatures`; nothing closed a task | Closes the signer's route task, stamping `unified_tasks.route_authoring_signature_id` |
| Verdict "changes requested" | `closeReviewTasksOnVerdict` | Completed every task on any verdict | A negative verdict stops the route and notifies the sender; approvers are never unblocked on it |
| Route store, member validator, reassign and hand back | RR1a, RR3 | Vault and QMS only | Reused for Authoring |
| Route round display | `client/src/concept2cure/v2/reviewRoute/` (RR2) | Vault and QMS | Also in the Authoring workbench (`editor/AuthoringReviewRound.tsx`) |

Two pieces stay with RR6: Authoring approvers and deleting the `/submit` chain.

## Migration (Rule 1)

`migrations/20261023_review_routes.sql` is amended in place with a dated header note:
- `unified_tasks.route_authoring_signature_id uuid` is added.
- `review_routes.approval_due_at` becomes nullable through a conditional `ALTER`, because an
  RR5 Authoring route names reviewers only.

The change is additive. No `DROP` is appended, and no other file in the set re-imposes
`NOT NULL`. `ci:migration-set-order` and `ci:migration-drop-safety` pass.

## What the tests pin

- `tests/db/review-route-authoring-rr5.dbtest.ts`: **15 of 15** against real Postgres, as
  `app_service` with `RLS_ENFORCE=on`. The database is fresh, from
  `scripts/db/provision-test-db.sh`.
- Client: `authoringReviewRouteRR5.test.tsx`, plus the updated `sendForReview`,
  `humanReviewStanding` and `workbenchAssignReview` suites.

## Results at `99c9d972c`

- **Unit and pglite:** 27 files, **318 of 318** passed. They cover the RR5 client, the
  updated Authoring review suites, the tasking suites and the review-audit contract.
- **Database tier:** all route suites (RR1a, RR1b, RR2, RR3, RR4, RR5) plus the Vault
  lifecycle suites: **118 passed, 1 failed**. The one failure is
  `review-route-qms-rr4 › retiring a document in review…`, which was red before RR5. It comes
  from P-51 (`cd95dc9e6`), as recorded in `2026-10-29-RR2-records/README.md`.
- **`tests/db/workflow-import-governance.dbtest.ts`:** 5 failed and 14 passed, both at RR5
  and at `HEAD~1`, which was checked in a plain `git archive` export. RR5 did not cause them.
- **Gates**, all exit 0:
  - `ci:pushed-lint-errors`
  - `ci:pushed-lint-warnings` (no file changed its count)
  - `ci:sql-interpolation`
  - `ci:undefined-css-classes`
  - `ci:untracked-imports`
  - `ci:sign-ceremony`
  - `ci:tenant-isolation:no-regression`
  - `ci:migration-set-order`
  - `ci:migration-drop-safety`
  
  The full typecheck runs in the pre-push hook. No baseline was raised.

## Browser acceptance

- **Desktop (1440×900): passed end to end.** `acceptance/desktop/` holds 13 screenshots and
  `run.log`:
  1. The author opens Send for review and names Rae and Rob.
  2. One request writes two route tasks.
  3. The round shows on the document.
  4. Rae sees the task in Tasks and on the Review board, and signs REVIEWER.
  5. Rob records "changes requested".
  6. The round reads "returned", and the author is notified.
  Re-run on the fixed tree after the phone fixes below: **passed**, no page errors
  (`acceptance/desktop-after-fixes/run.log`). Its screenshot 08 shows the one visible desktop
  change: the signing dialog's Cancel and Sign and commit have their button chrome back.
- **Phone (390×844): passed end to end on 2026-10-30.** `acceptance/phone/` holds 13
  screenshots and `run.log`, the same steps as desktop: the author sends to Rae and Rob, one
  request writes two route tasks, Rae signs REVIEWER, Rob records "changes requested", the
  route reads `returned` with his reason, and the author's tray says "Returned for
  revision". No page errors.
  - At 13 checks along the flow, one at each dialog, tray, board and rail the steps work,
    the page does not scroll sideways, and every control that step works is a 44 px target
    that is not cut off. Each check is a line in `run.log`, and any failure stops the run.
  - One thing is recorded and not asserted: the shell's top bar (see Open).

### Why the first phone run stopped: the product

The first run did write a log. Its `run.log` stayed on disk only, because `.gitignore` matches
`*.log` and the log was not force-added (nor was the desktop `run.log`; both are now). Its
`fail-detail.txt` was committed with RR5 (`99c9d972c`). It shows the click on Send landing on
the form's labels for 30 s. Re-run unchanged on a fresh instance, the script failed the same
way (`acceptance/phone-red/1-script-as-filed/`). The measurements are in
`acceptance/phone-red/diagnosis.txt`:

1. The Authoring surface was **485 px wide on a 390 px screen**. The Download menu's live
   region (`.sr-only`, an absolutely placed 1 px box) sits in the toolbar that scrolls
   sideways at phone width (`.ed-doc-actions`). The toolbar was `position: static`, so it was
   not that box's containing block and did not clip it. The box stayed at its place in the
   unscrolled row, 484 px from the left.
2. A phone browser widens the layout viewport to fit the page: 485×1048. Send for review is
   `position: fixed`, so it was laid out on 485×1048. Its footer, with Send, sat at y 971 to
   1048, below the 844 px screen, and the sheet ran 95 px past the right edge.
3. The script reported "horizontal overflow 0px". It measured `scrollWidth − innerWidth`,
   which was 485 − 485: on a mobile viewport `innerWidth` is the widened layout viewport.
   Measured against the screen, the same run fails with "horizontal scroll of 95px"
   (`acceptance/phone-red/2-overflow-measured/`).

So the cause was the product, and a blind check in the script let it through. Fixing the
check then exposed the defects further along the flow, listed below.

### Product defects fixed, each red first

Each defect was measured at 390 px in the browser and pinned in a test before it was fixed.
jsdom has no layout, so the tests pin the rules that decide it, as the repository's other
layout pins do.

| # | Screen | Defect, as measured | Fix |
|---|---|---|---|
| 1 | Authoring | Page 485 px wide (above), so Send for review's Send was off screen | `.ed-doc-actions { position: relative }` at phone width (`authoring-v2.css`). The toolbar now contains what it scrolls. The Download menu is `position: fixed` and is not cut |
| 2 | Review board | List (340 px) and detail side by side in a 334 px column. The detail, with Open in editor and Request changes…, sat off screen | `.split` is one column at ≤760 px (`surfaces-v2.css`; Review, Review threads and Evidence use it) |
| 3 | Review board | The detail's `overflow: hidden` cut off Record review decision, half of Request changes…, Open in editor and Comment. The project switch did not wrap and ran 36 px past the screen | At ≤760 px the head, its actions, the document bar and the reply row wrap, and the switch wraps (`surfaces-v2.css`; classes `dt-acts`, `rv-doc-open`, `rv-scope-program` in `Review.tsx`) |
| 4 | Review board | Open in editor was 28 px, set inline where no rule could change it | A class (`rv-doc-open`, 28 px on the desktop) and 44 px at phone width |
| 5 | Tasks tray | Close 26 px, Mark read 24 px, Notification preferences and each notice's open button 32 px, Triage 41 px, Open the task board 43 px | 44 px at ≤760 px (`app-v2.css`) |
| 6 | Review decision dialog | The decision 36 px; Cancel, Reload review record and Record change request 32 px | 44 px at ≤600 px, beside the dialog's existing phone rule (`review-decision.css`) |
| 7 | Signing dialog, at any width | `.c2c-v2 button` (the shell's reset) outranks one class. So on every surface that signs, Sign and commit, Cancel and Done were bare text 20 px tall and the close control 26 px. The RR5 desktop screenshot 08 shows it | `EsignModal.css` styles its buttons through `.es-modal`, which outranks the reset, and makes them 44 px at ≤760 px. Its reduced-motion rule names the same selectors. `authoring-v2.css` carried a copy of the meaning pills' rules to survive the reset. That copy is removed (zero duplication) |

Tests:
- `client/src/concept2cure/v2/__tests__/reviewRoutePhoneWidth.test.ts` (15 tests) covers
  items 2 to 7.
- `downloadWorkingCopy.test.tsx`, "The toolbar that scrolls holds what it scrolls" (3 tests),
  covers item 1.
- **Red:**
  - `acceptance/phone-red/3-unit-toolbar-red.txt`: item 1, before its fix, 1 failed.
  - `acceptance/phone-red/4-unit-pins-at-HEAD-red.txt`: the six product files at `HEAD`,
    15 failed. The three that pass there state the starting conditions: the reset exists,
    the live region sits inside the menu, and the menu is fixed.
- **Green:** `acceptance/phone-unit-green.txt`, 35 of 35.
- **Related suites:** 81 files that read these stylesheets or render the signing dialog, the
  Review board, its decision dialog or the Tasks tray, plus the RR5, Send for review and
  workbench suites (`acceptance/phone-related-suites.txt`). Results: 917 passed, 6 failed.
  - Five failures are `runPolicySwitch.test.tsx`, which fails the same way with these files
    at `HEAD` (an `authService` mock).
  - One is `accountOnboardingSettings.test.tsx`, which failed once under that load and
    passes on its own.

### Script defects fixed (`acceptance/rr5-acceptance.mjs`)

1. **Overflow.** The check measured overflow against `innerWidth` (above). It now measures
   against the screen's width, plus any sideways scroll of the shell's page column, which
   scrolls on its own.
2. **Touch targets.** A checkbox was measured by its own 20 px box. Its target is the 44 px
   `<label>` row around it, which is what is measured now.
3. **Coverage.** Two checks were added: "cut off" (an ancestor that clips without scrolling
   hides part of the control), and a failure on any control under 44 px. Before, small
   controls were logged and the run went on. The checks now run on every screen of the flow
   (before: 3 of them).
4. **Two phone-only steps, because the layout differs:**
   - At phone width the Tasks rail is a sheet over the document, so Rae closes it with its
     own control before E-sign.
   - The signature's receipt is closed with Done before the rail is opened again. The
     desktop path's loose wait (`/Signed|recorded/`) left the receipt open over the rail's
     toggle.

   The desktop path is unchanged.

### What already existed (Rule 3)

Every fix completes an existing rule or component. Nothing was added beside one:
- the phone toolbar scroller (QA 2026-10-08, j5);
- the shared `.split` layout;
- the Review board's detail (`Review.tsx`);
- the tray's styles (`app-v2.css`);
- the decision dialog's 600 px rule;
- `EsignModal.css`, whose button rules existed and were being outranked.

The one parallel path found was `authoring-v2.css`'s copy of the meaning-pill rules. It was
converged onto `EsignModal.css` and deleted.

### The instance

- **Instance:** a private instance of the working tree on `localhost:5237`, `NODE_ENV=development`.
- **Database:** `c2c_rr5_phone_instance`, built fresh by `scripts/db/provision-test-db.sh`
  (install-fresh and deploy-migrate). After the accounts were seeded, `deploy-migrate` ran
  again, and its workspace repair gave the new organization its default workspace.
- **Posture:** `RLS_ENFORCE=on`, runtime role `app_service` (NOSUPERUSER, NOBYPASSRLS),
  `ALLOW_DEV_AUTH=1`. Sign-in skipped the emailed code, as it did for the desktop run.
  `/api/auth/dev-login` was not called.
- **Accounts:** synthetic only, in a synthetic organization:
  - Avery Author (admin);
  - Rae and Rob Reviewer (reviewer, project members);
  - Mo Member (member).

  They are `rr5-*@example.test`, seeded by a session-local fixture. The launch modules came
  from `scripts/ops/provision-launch-modules.ts`. The project was created by Avery through
  `POST /api/c2c/projects`. jm.smith and sarah.chen were not used.
- **Secrets and shutdown:** the password and JWT secret came from the environment and are
  not in this folder; a scan of it for both found nothing. The instance was stopped
  afterwards.

### Gates

Run on the commit (`acceptance/phone-gates.txt`), all exit 0:
- `ci:pushed-lint-errors`
- `ci:pushed-lint-warnings`
- `ci:undefined-css-classes`
- `ci:untracked-imports`
- `ci:class-vocabulary`
- `ci:check-css-selector-shadowing`
- `ci:check-shell-css-collisions`

## The Review board read a signed reviewer as still awaiting (fixed)

The phone run's desktop re-check found it (`desktop-after-fixes/06`). After Rae signed REVIEWER,
the Review board still listed the document for her as "Awaiting your review", with Record
review decision. The project Review tab and the Tasks tray read the same board, so they said
the same.

**Cause.** The board read only `authoring_reviews`. On a route, the reviewer's REVIEWER
signature is their review (§2.8): it closes their route task, and it leaves their review request
`pending`. So the store the board read and the route disagreed, and the board believed the store.

**What already existed (Rule 3).**
- `readRouteRounds` (`server/services/review/review-route-standing.ts:386`) already reads each
  subject's latest route in bulk. It verifies every member's signature: the signer, the
  document, the meaning and the digest. The Vault queue (`vault-review-queue.ts:183`), the QMS
  list and `GET /documents/:id/review-route` already use it.
- The board (`server/services/review/authoring-review-board.ts`) already decides each row's
  state, its open work and who it waits on, through `authoring-review-board-standing.ts`.

Nothing new was built. The board now calls the existing reader.

**Fix.**
- The board reads each document's latest route with `readRouteRounds`, on the same request
  client. A failed read fails the board; it is never shown as "nobody signed".
- A reviewer counts as having reviewed when that route names them, their signature verifies,
  and the route is about the sections the document has today. The rule lives in one place,
  `signedOnRoute` in `shared/authoring/peer-review.ts`, which the server and the client both
  use. A signature over earlier content is not a review of today's text: that reviewer is
  awaiting again. A later change request or rejection still governs.
- The fields returned per request are `routeSignedAt` and `requestedByName`; per row,
  `myReviewSignedAt`.
- `awaitingMyReview` excludes a signed reviewer. The row now waits on the next reviewer who has
  not signed. A document whose every reviewer signed is no longer open work, and its requester
  still sees it.
- The detail shows the reviewer as "Signed" with the date. The caller sees "Your review
  signature recorded" and is offered no review decision. A queue whose reviewers all signed
  reads "Reviewers signed, sign-off pending".

**"requested by 1" (Open item 2, second half), fixed in the same read.** The request row and the
provenance line now name the requester. The name is read from `users` through the
organisation's membership. With no name they say "requested", never an id.

**Red, then green.**
- `board-signed/red.txt`, on `ffe938a93`'s code: after r1 signs, the board returns
  `awaitingMyReview: true, mine: true` for r1.
- `board-signed/red-client.txt`: the two client tests fail on `ffe938a93`'s client code. A third
  test checks that a later change request is not hidden by an earlier signature; it passes on
  both.
- `board-signed/green-db.txt`: the RR5 PostgreSQL suite, 18 of 18 pass with RLS on as
  `app_service`. Its two new tests drive the real board route through the real signing ceremony.
- `board-signed/green-unit.txt`: 64 related test files, 677 tests pass. The suite
  `authoring-review-board-access.pglite.test.ts` builds its own schema. It now includes the
  route migration, since production always has those tables.

## Open

1. **The shell's top bar at phone width.** It is 344 px wide in a 334 px column, so Get help
   is cut off by 10 px. Its seven controls are 30 to 32 px tall, including the Tasks tray's
   trigger, which this run taps. The run records this and does not assert it. Fitting 44 px
   targets there needs a decision on what the bar holds at a phone's width. That is shell
   design, not RR5.
2. **Seen in passing at every width and not investigated:** the Review board's project switch
   names the project by its id when the board is opened from a link (`?program=`). The desktop
   screenshot 06 shows it.
3. **The Authoring OQ protocol** has not been run on RR5.
4. **RR6:** Authoring approvers on the route, and deleting `POST /docs/:docId/submit` and
   `/docs/:docId/sign`, with `/e-sign` named as the replacement.
