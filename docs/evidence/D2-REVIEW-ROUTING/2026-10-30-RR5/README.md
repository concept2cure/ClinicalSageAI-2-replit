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

## The Review board's project switch named the project by its id (fixed)

A board opened from a link (`?program=`) gets the program's id from the shell
(`restoreShellProject`, `shellProject.ts`) and nothing else, so the switch read
"Only 099991d1-…" (desktop screenshot 06). It now names the program from the board's own
rows, which carry the program's name (`prog`). When no row names it, the switch says
"this project". It never shows the id. The comment-thread pane under the board gets the same
name (`namedProgram` in `Review.tsx`).

**What already existed (Rule 3).** The board's read already returns each row's program name
(`program_name` in `authoring-review-board.ts`); the switch reads it. No program-name fetch
was added, and the shell's own record of the project is unchanged.

**Red, then green** (`board-program-name/`): the two new tests in `reviewBoard.test.tsx` fail
on the old switch, which shows the id. The Review board tests and the six other Review
surface test files pass: 64 tests.

## Authoring OQ (OQ-003 v0.5)

The Authoring OQ protocol is `docs/validation/OQ-003-AUTHORING.md` (runner
`tests/validation/oq/authoring/run.mjs`, `npm run validation:oq -- authoring`). Its v0.5 is a
revision of v0.4 for RR5, not a new protocol. The records are in `oq/`.

**Results:**

| Run | Protocol | Result | Record |
|---|---|---|---|
| Red | v0.4, unchanged | 21 pass, 1 fail, 1 deviation, 1 not-executed | `oq/red/` |
| Green | v0.5 | **25 pass, 0 fail, 1 deviation, 0 not-executed** | `oq/green/` |

- **Red.** OQ-AUTH-17 failed. v0.4 asked for review naming the run identity, with no reason
  and no route, and RR5 answers 400 `REASON_REQUIRED`. OQ-AUTH-17b was not executed.
- **The deviation** is OQ-AUTH-16, as in every execution: no AI provider is configured.
- **v0.5's changed steps.** The revision row lists each one. In short:
  - OQ-AUTH-17 names the second identity, with a reason and a due date. It first shows the
    refusals at naming, each with nothing written: `REASON_REQUIRED`,
    `ROUTE_DUE_DATES_REQUIRED`, and `REVIEWER_IS_AUTHOR` for the author. Naming the same
    reviewer twice is `MEMBER_ALREADY_NAMED`.
  - NEW-4 holds for a reviewer. The request's own independence check refuses the author
    first (`REVIEWER_IS_AUTHOR`). The route's member validator would refuse them too, and
    the candidates read shows it: `MEMBER_IS_AUTHOR`.
  - OQ-AUTH-17b reads the board and the work of the named reviewer.
  - The review signature steps (12, 13, 14) are the named reviewer's. Their expected results
    are unchanged.
  - New OQ-AUTH-13b: the run identity's REVIEWER signature is refused 403 `ROUTE_NOT_NAMED`
    before the credential is read.
  - New OQ-AUTH-14b: the signature closes the reviewer's task and completes the route. The
    board no longer has the document awaiting them.
- **The new board check fails on the defect it exists to catch.** v0.5 was run against the
  board read as it was before `a39ebbdd4` (`oq/v0.5-board-before-fix/`). OQ-AUTH-14b fails:
  after the signature, that board still answers `awaitingMyReview: true`.
- **Runner defects.** A first run of v0.5 failed on two defects of its own new steps
  (`oq/v0.5-first-run/`). Both were corrected before the green run, and no expected result
  was weakened. The protocol's §6 describes them.
- **No product defect** was found that blocks the protocol, and no product code changed.

**Posture:** the same as RR4's OQ run.
- A private instance of the working tree at `42002a0a0` on `localhost:5241`. The database
  is `c2c_oq_auth_rr5_20261030`, built fresh by `scripts/db/provision-test-db.sh`.
- `RLS_ENFORCE=on`, runtime role `app_service`. `ALLOW_DEV_AUTH=0`, so dev-login is 404.
- Synthetic identities only, in a synthetic organization: `oq-runner@validation.local`
  (admin, the author) and `oq-signer@validation.local` (reviewer).
- Each enrolled a TOTP factor through `/api/auth/mfa/setup` and `/mfa/enable`, and signed in
  with password and authenticator code. The harness read the `VALIDATION_*` and `OQ_SIGNER_*`
  variables. jm.smith and sarah.chen were not used.
- The passwords, TOTP secrets and JWT secret lived only in the session's scratch directory.
  A scan of `oq/` for each of them, and for bearer tokens, found none. The instance was
  stopped afterwards.

**Still owed:**
- A URS-003 revision through change control, if the URS should name the route.
  URS-AUTH-013 names a review requested from named reviewers. It does not name the route,
  its refusals or its completion.
- TM-001 regenerated from this record, and a human review of the execution.
- **Seen, not asserted:** once a route is complete, no route is live, so a REVIEWER
  signature takes the path kept for a document with no route (§2.13). The author then
  signed REVIEWER on their own document and was answered 200
  (`oq/observation-author-review-after-route-complete.txt`). v0.4's OQ-AUTH-14 asserted the
  same signature as a pass. Fixed since: see the next section.

## An author signed REVIEWER on their own document outside a live route (fixed)

This was Open item 2. With no live route on the document, before one or after it completed,
the author's REVIEWER e-sign was answered 200 (the OQ observation above). A REVIEWER freeze by
the author was answered 200 as well.

**What already exists (Rule 3).**
- **The rule.** `assertSignerIsNotAuthor` in `server/services/governance/separation-of-duties.ts`,
  with `requiresIndependence`: every meaning but authorship must be independent of the record's
  authors. For Authoring, the authors are the creator, the revision ledger and the
  visible-mutation audit.
- **The router's wrapper.** `signingRefused` in `server/routes/authoring.router.ts` runs the
  filing seal check, then the rule, for every meaning but AUTHOR. The APPROVER e-sign and the
  workflow `/sign` already called it. REVIEWER e-sign and Freeze did not.
- **The RR5 route precheck.** `authoringReviewerPrecheck` refuses anyone a live route does not
  name, and the member validator never names an author. With no live route it returns null, so
  nothing refused the author.
- **Workflow adoption.** It already requires a non-author reviewer (`hasCurrentAdoption`).
- **The client.** `SendForReviewDialog` already withholds the creator from the reviewers it
  offers (`authorId`, from `created_by`). `EsignModal`'s `meanings` prop exists so that a
  dialog never offers a meaning the server would refuse.

Nothing new was built. The rule is now asked in the two places that skipped it.

**Fix.**
- **The helper.** The second half of `signingRefused` is now `separationOfDutiesRefused`, one
  helper that every caller uses. `signingRefused` behaves as before.
- **`POST /docs/:id/e-sign` with REVIEWER.** The helper runs after the route precheck and
  before re-authentication.
  - On a live route, the author still reads 403 `ROUTE_NOT_NAMED`, as OQ-AUTH-13b asserts.
  - Otherwise the author reads 403 `SEPARATION_OF_DUTIES`, 409 if authorship is unresolved, or
    503 if it cannot be verified.
  - Nothing is signed, and no code is spent.
  - A REVIEWER e-sign still takes no seal check, because it seals nothing.
- **`POST /docs/:id/freeze`.** The helper is the first refusal after the already-frozen
  check. The rule exempts AUTHOR. Freeze keeps its own seal check (`filingBlocksSeal`), so the
  seal is not asked twice.
- **The client.** The workbench tells the signing bar when the signed-in user created the
  document (`signedInUserCreated` in `DocumentWorkbench.tsx`).
  - For the creator, E-sign and Freeze offer Authorship alone, and the dialog says why.
  - A creator whose grant permits only the review signature has no signature that can pass,
    so E-sign is disabled, with the reason.
  - Anyone else is offered every meaning, and the server decides. That covers an author the
    client cannot see, such as a revision contributor.
- **A consequence.** A named route reviewer who later edits the document becomes one of its
  authors, so their REVIEWER signature is refused too. APPROVER already met the same rule.

**Red, then green** (`author-review-sod/`):
- `red.txt`: the RR5 PostgreSQL suite on HEAD's router, with RLS on, as `app_service`, on a
  fresh database. 3 failed, 20 passed. Two of the three are the author's REVIEWER e-sign, with
  no route and after a route completes. The third is the author's REVIEWER freeze. Each was
  answered 200 and signed or froze. The controls passed: AUTHOR e-sign and freeze, a
  non-author's REVIEWER with no route, and the author on a live route refused
  `ROUTE_NOT_NAMED`.
- `red-client.txt`: 5 failed, 53 passed. The creator was offered Review and Approval, and the
  workbench did not say who created the document.
- `green-db.txt`: the RR5 suite passes 23 of 23. Four other Authoring suites ran with it. Their
  6 failures (5 in `workflow-import-governance`, 1 in `authoring-stability-table`) fail with
  identical messages on HEAD, in a `git archive` export.
- `green-unit.txt`, `gates.txt`: see the file headers.

**Tests changed.**
- **`server/services/c2c/__tests__/node-status-follows-work.pglite.test.ts`.** The REVIEWER
  e-sign in "a signature that does not mean approval approves nothing" was the author's. It is
  now signed by the member who drafted nothing; AUTHOR is still the author's.
  - The test had been red since RR5. Its harness (`_filing-write-harness.ts`) lacked
    `review_routes`, which the precheck reads, so the e-sign answered 500.
  - The harness now loads `migrations/20261023_review_routes.sql`, as the other Authoring
    PGlite suites do.
  - With the table and the author still signing, the test failed 403 `SEPARATION_OF_DUTIES`
    (`node-status-author-red.txt`). It passes with the non-author.
- **`tests/db/review-route-authoring-rr5.dbtest.ts`.** Five new tests. Three existing pairs of
  status and code assertions now go through one helper, `answered`, so the file stays inside
  the 500-line limit. Their assertions are unchanged.
- No other test relied on an author signing REVIEWER. Every test file with a REVIEWER meaning
  was run.

**OQ-003 v0.5.** No step has the author sign REVIEWER as a pass:
- the freezes are AUTHOR;
- the review signatures are the named reviewer's;
- OQ-AUTH-13b's `ROUTE_NOT_NAMED` is answered before the new check.

The protocol's §6 still records the 200 as "Seen and not asserted". A later revision can assert
the refusal. The OQ was not re-run.

## Open

1. **The shell's top bar at phone width.** It is 344 px wide in a 334 px column, so Get help
   is cut off by 10 px. Its seven controls are 30 to 32 px tall, including the Tasks tray's
   trigger, which this run taps. The run records this and does not assert it. Fitting 44 px
   targets there needs a decision on what the bar holds at a phone's width. That is shell
   design, not RR5.
2. **RR6:** Authoring approvers on the route, and deleting `POST /docs/:docId/submit` and
   `/docs/:docId/sign`, with `/e-sign` named as the replacement.
