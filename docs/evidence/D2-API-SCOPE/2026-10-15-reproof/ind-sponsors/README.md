# D2: the IND applicant-identity screen's sponsor records were refused in production

**Row:** D2. **Lane:** `…session_01E8btkB8mcLirW4rNvsMNxK`. **Date:** 2026-10-22.
Found while re-measuring the launch boundary (`../`).

## What was wrong

`client/src/concept2cure/v2/surfaces/IndApplicantIdentity.tsx`, added on
2026-10-21 in `ccd509c06` and `f165afe1f`, is a launch screen. It belongs to
the `ind-checklist` surface, which P-32 made part of Submission Center. The
screen lists, creates and edits the sponsor record that the IND forms print:

- `GET /api/ind-master-data/sponsors` (list)
- `POST /api/ind-master-data/sponsors` (create)
- `PATCH /api/ind-master-data/sponsors/:id` (edit)

No surface claimed `/api/ind-master-data`, and the registry comment still said
it had no screen caller. Production refuses an unclaimed path (owner decision
2026-09-26), so every customer's sponsor list and every save answered 403.

`ci:launch-scope-api` was red on trunk for this (`ci-gate-red.txt`). It runs in
CI's Lint job, not in `.husky/pre-push`, so the push that introduced the call
did not see it.

## Change

`ind-checklist` claims `/api/ind-master-data/sponsors`, and only that. The same
router also mounts US agents and investigators. No launch screen calls those,
so they stay unclaimed and refused.

The sponsor routes were read before they were admitted. Each requires the
author role (`requireRole(AUTHOR)`). Writes take a stated reason and an
expected revision, and return their audit outcome
(`server/routes/ind-master-data.routes.ts`).

## Proof

| Check | Before | After |
|---|---|---|
| `server/services/entitlements/__tests__/ind-launch-claim.test.ts`: the sponsor calls are in launch scope; agents and investigators are not | 2 failed of 65 (`test-red.txt`) | 65/65 (`test-green.txt`) |
| `ci:launch-scope-api` | 1 launch-screen path refused (`ci-gate-red.txt`) | 421 paths, none refused (`ci-gate-green.txt`) |
| Real route registration, production posture, database built from empty | — | exactly 4 routes, `unmapped` → `launch`: the sponsor GET, GET `:id`, POST and PATCH (`route-verdict-diff.json`) |

Neighbouring suites: `server/services/entitlements`, `server/middleware` and
`shared` pass (142 files), except
`server/services/entitlements/__tests__/company-documents-launch-claim.test.ts`.
It fails 5 of 10 on trunk without this change (`67d96c060`, 2026-10-20) and
is handed on through the board.
