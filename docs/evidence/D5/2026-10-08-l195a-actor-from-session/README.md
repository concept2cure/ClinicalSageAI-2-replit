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
