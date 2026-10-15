# Human peer-review backend verification

2026-10-14; canonical `concept2cure-v2` working tree. Contract:
[AUTHORING_HUMAN_REVIEW_BINDING_2026-10-14.md](../../../design/AUTHORING_HUMAN_REVIEW_BINDING_2026-10-14.md).
Safe machine metadata: [backend-verification.json](backend-verification.json).
The control tower binds these local results to the final integration commit.

## Meaningful red → green

Before changing the native handlers, the real HTTP router over canonical SQL
returned 200 for an unassigned verdict and for the original author's verdict.
Its read lacked the strict complete-snapshot context, and request-review stored
caller-supplied reviewer labels. All four negative controls failed as intended:

```text
native-before-private.log
Test Files  1 failed (1)
Tests  4 failed | 9 skipped (13)
```

This red is from reachable behavior, not a missing-module/import error.
The repaired native routes and service pass the same controls with saved-content
and round binding, canonical identities, and current authority. An independent
request-round adversarial test also failed before repair: distinct PostgreSQL
microseconds serialized to the same JavaScript timestamp, so an earlier request
was accepted. Rotating the existing row ID on each re-request closes this gap
without a new column or store. The exact independent replay is now 1/1 green
(`authoring-peer-review-round-green-private.log`; red retained privately at
`/tmp/c2c-peer-round-adversarial/result.txt`). That separate adversarial replay is
not added to the suite totals below. Final verified
runs:

| Suite paths | Result | Private verdict log |
| --- | --- | --- |
| `server/services/authoring/__tests__/peer-review.pglite.integration.test.ts`; `server/routes/__tests__/authoring-review-loop.pglite.integration.test.ts` | 73/73, 2 files (56 service + 17 native) | `authoring-peer-review-validation/both-final-private.log` |
| `server/middleware/__tests__/authoringObjectAuthorization.test.ts`; `server/middleware/__tests__/authoringObjectAuthorization-request-review.test.ts` | 52/52, 2 files | `authoring-peer-review-object-gates-private.log` |
| `server/services/authoring/__tests__/peer-review-migrations.pglite.test.ts` | 4/4, 1 file | `authoring-peer-review-migrations-private.log` |

```text
both-final-private.log: Test Files  2 passed (2); Tests  73 passed (73)
authoring-peer-review-object-gates-private.log: Test Files  2 passed (2); Tests  52 passed (52)
authoring-peer-review-migrations-private.log: Test Files  1 passed (1); Tests  4 passed (4)
```

These independent runs total 129 passing cases in five files. Commands use Node
22 and `npx vitest run --config vitest.config.ts` followed by the exact suite paths
above. Logs live privately under `/workspace/scratch/`; the verdicts above omit
configuration, driver details and environment values.

## Boundary proved

The service uses only the request-pinned connection. Fresh active account,
organization and current membership, bound-program/project admission,
whole-document ACL, assigned request and creator/immutable-revision/structure-audit authorship
are checked before mutation and reread before returning or committing. Eleven
real-SQL mutation-hook cases revoke ACL/member/project access or change saved
content after the snapshot/verdict/request write and prove refusal plus rollback.
These deterministic hooks prove the final reread, not concurrent multi-session
lock scheduling. An additional actual REVIEWER-to-VIEWER downgrade preserves
readable text while final canReview becomes false.

The complete saved snapshot preserves section body bytes and canonical signing
order. GET and POST are serialized through the actual native HTTP path and parsed
with the shared strict schemas. Title, version, section title/content/order,
request-round changes, malformed or legacy bindings and noncanonical requester
identities do not become current approvals. Same-round corrections retain before
and after facts; re-request records the overwritten binding before clearing it.

Executed canonical DDL covers the existing review index, immutable authoring trail
and chained audit writer. Forced audit and task-ledger failures roll back verdict,
task and trail/chain changes. The native suite retains real task dependency,
signature-required and already-completed-task behavior. Only post-commit
notifications are replaced for observation. Audit metadata retains exact reviewed
snapshot, request and before/after facts; the existing writer hash-binds its metadata
in the chained ledger. This proves the writer/transaction boundary, not external
production database tamper-resistance qualification.

A healthy shared pool cannot rescue a missing request client: native response is
503 `REVIEW_UNAVAILABLE`, with no write or notification. A transport error after
an actual successful COMMIT yields static 503 `REVIEW_COMMIT_UNCONFIRMED`; it
reflects no hostile driver text and sends no notification. A subsequent normal
GET recovers the persisted current receipt and task/ledger state, proving why the
UI must reload rather than assume rollback.

Re-request changes the current index row ID while preserving its unique
document/reviewer/tenant key. Before/after audit facts retain both round IDs and
the older verdict binding. The old declaration refuses even when both serialized
request timestamps are identical; a fresh read can decide the new round.

The native heading-only negative starts with a genuine secondary-person HTTP
section title PATCH: creator and body revision actors remain unchanged while
immutable RENAME/chained audit records that writer. Before the canonical SOD
extension, request-review returned 200 instead of 409 (one real failed case,
16 skipped, `heading-writer-before-private.log`). The final native suite proves
request 409 `REVIEWER_IS_AUTHOR` and, even with an earlier assignment, verdict
403 with no task transition, verdict/trail/ledger write or notification. Thus
immutable body and visible structure contributors both count as authors without
rewriting original creator attribution or treating permission grants as authorship.

Both canonical creators execute fresh creation and legacy-table upgrades twice.
Historical words remain untouched and all three new bindings stay null; no
backfill or new store is introduced. Companion authorship/board evidence is in
[board-and-authorship.md](board-and-authorship.md).

## Guardrails and limits

Service, production middleware and new migration tests pass strict ESLint with
zero warnings; the two owned SQL/HTTP test files also pass strict ESLint. The
existing object-middleware test retains its pre-existing describe-length warning.
`ci:server-error-leaks` and `ci:tenant-entry-points` pass. Removing the old native
interpolated review query reduces its SQL-interpolation allowance from four to
three; the control tower applied that stricter ratchet and the guard now passes,
with no new interpolation or suppression. Whole compiler/build, browser and publication gates are recorded by
the control tower. These local PGlite runs do not claim live RLS, deployed-browser
coverage or regulatory qualification.
