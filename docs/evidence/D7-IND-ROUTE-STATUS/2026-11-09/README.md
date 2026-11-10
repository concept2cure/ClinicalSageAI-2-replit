# F1 repair C: the IND lifecycle routes answer the service's own status (row D7, 2026-11-09)

This is re-plan step 24, from the design `docs/evidence/RIM/2026-11-08-designs/f1-small-repairs-4-8-24.design.md`
(repair C). The coordinating session ordered it after repairs A and B.

## What already exists (RULE 3), re-anchored on the tree

- `SUBMISSION_ERROR_STATUS` (`server/services/submission-service/submission-service.ts`) is the one map from a
  `SubmissionError` code to its HTTP status. It is typed against `SubmissionErrorCode`, so a code added to the service
  without a status does not compile. It names 20 codes.
- Three route modules already reuse it rather than copy it:
  - `server/routes/submissions.ts` spreads it into `CODE_STATUS`;
  - `server/routes/document-lifecycle.ts` reads it;
  - `server/routes/company-document-actions.ts` reads it.
- `fail` (`server/routes/ind-lifecycle/shared.ts`) is the one failure answer of every IND lifecycle sub-router. It
  kept **its own copy** (`SUBMISSION_CODE_STATUS`), with four codes: NOT_FOUND, INVALID_STATE, FORBIDDEN and
  VALIDATION. Any other service code fell through. Its message does not start with `CODE:`, so it answered **500
  INTERNAL, "Request failed."**
  - GOVERNED_REQUIRED, DISPATCH_BLOCKED, AUDIT_UNCONFIRMED, ALREADY_PLACED, CROSS_PROJECT and UNANCHORED_SUBMISSION
    are refusals that tell a person what to do. They read as the server failing.
  - The `/file` routes reach `upsertLeaf` and `createSequence` through `ind-lifecycle-persistence.ts`. So they can
    meet CROSS_PROJECT, UNANCHORED_SUBMISSION and ALREADY_PLACED today.
- The lookup was `SUBMISSION_CODE_STATUS[code]` on a plain object, so a code spelled like an object property
  (`constructor`, `toString`, `__proto__`) found an inherited value. `res.status` was then handed a function or an
  object, and the answer was Express's own HTML error page rather than the route's JSON.

## The change

- `fail` maps a code through `SUBMISSION_ERROR_STATUS`, imported. The local copy is deleted.
- The lookup asks `Object.hasOwn`, so only a code the service names is one of its refusals.
- Everything else is unchanged:
  - an error with no code, or with a code the service does not name, answers 500 `INTERNAL`, "Request failed.",
    with nothing of what failed inside;
  - the unrecorded-export refusal still answers 503;
  - a `CODE: message` refusal from the lifecycle services still answers 400.
- One file changed, `shared.ts`, plus its test. There is no migration, no new non-test file and no route change.
  P-87 later deletes some routes in `sequence.routes.ts`, so the two do not overlap.

## Proof

`server/routes/ind-lifecycle/__tests__/fail-answers-the-service-status.test.ts` drives `fail` through a real Express
response with supertest:
- GOVERNED_REQUIRED answers 403 and DISPATCH_BLOCKED answers 422, each with its code and words;
- every code in `SUBMISSION_ERROR_STATUS` answers the status the map gives it;
- an error with no code answers 500 and leaks nothing;
- codes the service does not name answer 500, including `constructor`, `toString` and `__proto__`;
- the 400 and 503 answers that `fail` already gave are unchanged.

| File | What it shows |
|---|---|
| `red.txt` | at HEAD `1744ec925`: 18 of 24 fail. The 16 codes outside the old copy answer 500, and `constructor` gets Express's HTML page. The four copied codes, the uncoded case and the unchanged answers pass |
| `green.txt` | after: every IND lifecycle route test (the contract suite, dispatch-verdict parity, documents recorded, OpenAPI and the rest), every test that imports the router or `shared.ts`, and the IND lifecycle service tests. 72 files, 828 pass |
| `mutation-1-four-code-copy.txt` | the lookup narrowed back to the four copied codes: the GOVERNED_REQUIRED, DISPATCH_BLOCKED and other mapped cases fail |
| `mutation-2-own-property-unchecked.txt` | `in` instead of `Object.hasOwn`: the `constructor` case fails |

Each mutation file records the restored file's sha256 against the original. ESLint on both files is clean, and the
typecheck reports nothing in them.

## Found here, not changed

- `server/routes/submissions.ts` `handleKnownCodeFailure` reads `CODE_STATUS[code]` the same unguarded way. It is
  outside this repair's design. No error the service throws carries such a code, so it is reported, not widened.
- The IND OpenAPI document (`server/routes/ind-lifecycle/openapi.ts`) lists 400, 401, 403 and 500 as the common error
  responses. It did not list 404 or 409 before this repair either. Whether it should list each status a service
  refusal can carry is a documentation decision for the R1 lane, which owns those routes (P-87, P-106).

## Plan

`Plan: F1`, `Completes: server/routes/ind-lifecycle/shared.ts`. The holds are as
`.design/claude-convergence/COORDINATION.md` records them.
