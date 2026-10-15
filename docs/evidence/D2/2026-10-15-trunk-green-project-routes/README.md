# Trunk green — the Projects route suites after the current-access gate (2026-10-15)

**Row:** D2 (trunk CI is a precondition of every row's evidence). **Lane:** `docs/work-orders/README.md` §0.

## What was red

`14362ef00` (2026-10-14) installed `installProjectRouteAccess`
(`server/routes/c2c/project-route-access.ts`): every Projects `/:id` route now
admits a caller only through `requireCurrentProgramAccess`, the list binds the
caller's accessible programs, and creation reads the current member's role. No
route suite had been given a current member or a request client, so on trunk:

- **104 failed / 91 passed in 16 files (12 failing)** — `before.txt`.
  101 in `server/routes/c2c/__tests__/projects-*`, 3 in
  `client/src/concept2cure/v2/__tests__/projectHomeDocuments.test.tsx`.

## What changed — harnesses and fixtures only

No route, gate or service file is edited.

- `server/routes/c2c/__tests__/support/current-member.ts` (new): a seat double
  for the gate's reads. Seated members and programs are admitted with the role
  the test intends; an unseated caller gets the real gate's 403
  `PROJECT_ACTOR_ACCESS_DENIED`, an unseated program its 404. The route's own
  role decisions (`canCreateProgram`, `canMutateProgram`) stay real. It does not
  reproduce the sharing-roster 403 or the anchor 409; those are proven where the
  real gate runs.
- Queued-mock suites (authorization, closeout, create, create-market-offer,
  create-stated-facts, detail-taxonomy, list, readiness) use the double and give
  each request `req.dbClient`, as the production request scope does.
- PGlite suites (create-anchor, create-digest-readiness, records-current) use
  **no double**: they now seed the `organization_users` membership the real
  gate reads.
- `projectHomeDocuments`: the source fixture gains the `isCurrent`,
  `dataEligible`, `textAvailable` fields `GET /:id/sources` answers
  (`shapeSource`). Grounding requires each to be positively true, so the
  fixture without them was ungroundable.

## Behaviour the tests now state (deliberate in `14362ef00`, not introduced here)

1. **Reads are no longer ungated.** Every `/:id` read requires a current member;
   a non-member is refused, concealed as 404. The lead-only rule still does not
   apply to reads.
2. **`PROGRAM_AUTHZ_MODE` no longer opens anything.** `warn` and any other value
   are ignored; a denied mutation is 403 and writes nothing.
3. **A non-lead archive is refused at the gate**, before a transaction opens
   (was: inside the transaction, then ROLLBACK).
4. **The list binds a fifth parameter**, the caller's accessible program ids.

## After

- **196 passed / 0 failed in 16 files** — `after.txt` (the same command).
- After the review notes were applied: 15 server files, 180 passed.

## The check made to fail

The double was mutated to admit everyone (every caller an `admin`, every
program in every org). **10 tests went red**, every one a refusal: non-lead
denials on evidence pin/unpin, archive and delete; the unowned-program denial;
both cross-org 404s; `PROGRAM_AUTHZ_MODE=warn|off`; and the non-member read.
So the refusals in these suites are carried by the seats, not satisfied
vacuously. Restored afterwards.

## Reviewed

Two independent reviewers read the diff for weakened assertions and masked
refusals. No blocking finding. Applied: a vacuous `unrecognized mode` case
folded into one `it.each` over `warn`/`off`; an overstated describe narrowed;
two dead mocks removed (the closeout 404 now also asserts no transaction opens);
the double narrows to a requested program and documents its scope.

## Found, not taken (another lane's 24-hour window)

- `resolveProgramAuthzMode` (`server/services/c2c/program-access.ts:119`) has no
  caller since `14362ef00`, but its docstring and
  `program-access.test.ts:138-170` still promise a `warn` soak switch.
- No suite running the real `requireCurrentProgramAccess` pins its cross-org
  answer as 404 rather than 403; the predicate is pinned on
  `programInOrganization` only.
- `transitionProgram`'s own in-transaction 404 (deleted between admission and
  lock) is no longer reached by any closeout test.

## Gates

`typecheck:fast` exit 0; eslint on the changed files: 0 errors.
