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
- **Phone (390×844): not completed. This is an open item.** The run reached the filled form
  (`acceptance/phone/01`, `02`). `fail-0-0.png` shows the sheet rendered correctly at 390 px:
  - reviewers chosen;
  - Mo Member not offered, with the reason;
  - reason, instructions and due date filled;
  - Send visible and tappable.

  The script then stopped and wrote no log, so the cause isn't recorded. Re-run
  `acceptance/rr5-acceptance.mjs` at 390×844 when agents are available again.

## Open

1. **The phone acceptance run** (above).
2. **The Authoring OQ protocol** has not been run on RR5.
3. **RR6:** Authoring approvers on the route, and deleting `POST /docs/:docId/submit` and
   `/docs/:docId/sign`, with `/e-sign` named as the replacement.
