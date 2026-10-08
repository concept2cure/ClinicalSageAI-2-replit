# D5: who resolved or decided comes from the session, not the request body

**Row:** D5, `docs/LAUNCH_DEFINITION_OF_DONE.md` (Part 11 attribution).
Ledger L195, the remainder of (a).

**Date:** 2026-10-08.

## What was still open

L195 recorded the request fields that named an actor in place of the session.
By 2026-10-08, two of its four were closed by other changes:

- The CMC registers' validator and approver now come from an electronic
  signature (P0-10, `ae36f2c81d`).
- `/api/qms` is retired (`1579503097`).

Two were still open, and a third route of the same shape turned up while
checking callers:

| Route | What the body could do |
|---|---|
| `PATCH /api/submission-ops/blockers/:blockerId` | `resolvedById \|\| getUserId(req)`: an editor recorded a submission blocker as resolved by anyone, a colleague or an id from another organisation. |
| `POST /api/gspr/programs/:programId/mappings` | The whole body was spread into the stored row. It chose `decidedBy` and `decidedAt`. It could write `reviewedBy` and `reviewedAt`, which nothing else writes, so the only reviews on record were ones a caller made up. It could also set the row `id`. With no user on the request, the decider was the string `'system'`. |
| `PATCH /api/sentinel/findings/:findingId` | The body's `resolvedById` was stored as given, and an absent one stored no resolver at all. |

Row security cannot see any of this. Each row is the caller's own, so the
tenant is right and only the person is wrong. That is a Part 11 §11.10(e)
attribution defect.

No client sends any of these fields (searched across `client/src`). The AnA
path to a GSPR decision (`mdx-command-handlers-phase2.ts`) already names
the session user.

## The fix

Each route takes the actor from the session and refuses a body that names
someone else. The refusal is a 422 rather than a silent drop, so a caller
never believes it recorded an attribution it did not.

- **Blocker:** `resolvedById` is the session user. A body naming a different
  id gets a 422, and nothing is written. Naming yourself is accepted.
- **GSPR:** a body carrying `decidedBy`, `decidedAt`, `reviewedBy` or
  `reviewedAt` gets a 422. Everything else goes through the canonical
  `pickWritable` (`server/utils/authedOrgId.ts`), restricted to the decision's
  own fields:
  - `requirementId` and `applicability`
  - `rationale`
  - `primaryEvidenceId` and `methodOfDemonstration`
  - `conformanceStatus` and `gapDescription`
  - `metadata`

  The decider is `authedUserId(req)` and the time is the server's. With no user,
  the answer is 401, not `'system'`.
- **Sentinel:** the same rule as the blocker. Resolving with no user id on the
  session is a 401.

## Red, then green

| Run | Result |
|---|---|
| Unfixed routes (`red/three-routes-before.txt`) | 10 of 14 fail. Each negative case asserts the leak before the status, so the failure names what would have been stored: *"the body must never write reviewedBy: expected [ 'qa-lead' ] to not include 'qa-lead'"*, *"expected [ 'system' ] to not include 'system'"*, *"the record must never name a resolver the session is not: expected 4242 not to be 4242"*. The 4 that pass are positive controls: resolving with no body resolver records the caller, naming yourself is accepted, a non-resolving status records no resolver, and acknowledging is unchanged. |
| Fixed (`green/three-routes-after.txt`) | 14 of 14. |
| Mutation: the refusals removed, so a forged field is silently dropped (`mutation/refusal-removed.txt`) | 6 of 14 fail, each *"expected 200 to be 422"*. Nothing forged is stored, so the leak assertions pass, but the caller would be told it succeeded. The status assertions are what catch that. |
| Every test that imports one of the three routers (`green/related-suites.txt`) | 18 files, 280 tests, all pass. |
| `tsc --noEmit -p tsconfig.json` | Exit 0. The first run caught `pickWritable` typed against the select model (`metadata: unknown`), and it now takes the insert type. |
| ESLint on the six files | 0 errors. The warning ratchet reports no change, and the three new test files add no warnings. |

## Reproduce

```
npx vitest run --config vitest.config.ts \
  tests/submission-ops-blocker-resolver.test.ts \
  tests/gspr-mapping-actor.test.ts \
  tests/sentinel-finding-resolver.test.ts
```

## Follow-up, same day: what the review found

An adversarial review of the first change (`3a8961ca14`) ran three lenses:
correctness, ways around the fix, and a sweep for the same class elsewhere. A
skeptic re-checked each finding. These were confirmed in the three routes, and
are fixed in the follow-up:

1. **A regression in the blocker route.** Every sign-in path puts a STRING
   subject on `req.user.id`, and the route compared it with a number. So a
   caller naming their own id got a 422, whether they sent it as a number or a
   string. The first change's test used a numeric id and could not see this.
   The route now uses the canonical `authedUserId`, which the GSPR and Sentinel
   routes already used, and all three tests use string subjects.
2. **A repeat closure overwrote the original closer and time** (blocker and
   Sentinel). The closer is now written only on the transition, decided in the
   UPDATE itself against the row as it stands.
3. **Free-text blocker status.** Every gate reads `status = 'open'` as live, so
   `'closed'`, `'Resolved'` or `'done'` cleared a blocker with no closer
   recorded. The status is now one of the model's three (`open`, `resolved`,
   `dismissed`), or 422.
4. **Dismissing cleared the gate and recorded nobody** (blocker and Sentinel).
   A dismissal now records its closer, as a resolution does.
5. **A reopen, or a move to `acknowledged`, kept the last closer** beside a state
   they did not set. Their closer is now cleared.
6. **GSPR reviews written before the fix stayed attached** to new decisions.
   Every decision upsert now clears `reviewedBy` and `reviewedAt`.

| Run | Result |
|---|---|
| The follow-up's four files against `3a8961ca14` (`review-followup/red/four-files-against-3a8961ca14.txt`) | 16 of 33 fail: the self-id 422s, the overwrite, the dismissal with no closer, the closer kept through a reopen and an acknowledgement, the five free-text statuses, and the review carried over. |
| The follow-up (`review-followup/green/four-files-after.txt`) | 33 of 33. The blocker test and the Sentinel SQL test run on PGlite, against the table as its migration (blocker) or drizzle-kit (Sentinel) creates it. |
| Related suites (`review-followup/green/related-suites.txt`) | 44 files and 588 tests pass; 2 files are skipped by design. |

Confirmed and recorded, not fixed here: `PATCH /api/innovation/delta-radar/findings/:id`
resolves with no actor (`server/routes/innovation-routes.ts`). That route is
outside the launch catalog.
