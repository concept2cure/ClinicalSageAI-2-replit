# Finish required RBM demo intake before recording seed completion

Plan: F1. Existing file completed: `scripts/demo/launch-demo/packs/lumen-rbm.mjs`.

## What already exists

- `.devcontainer/post-start.sh` records `demo-seed.done` only after the existing
  all-pack command exits zero. Its version is the `scripts/demo` Git tree.
- `scripts/demo/launch-demo/seed.mjs` already catches a failed pack, writes its
  failed manifest, continues other packs and exits nonzero. `lib.mjs` provides
  the one `makeRun.step` failure contract: thrown refusals fail the step.
- `packs/lumen-rbm.mjs` already loads monthly and subject extracts separately,
  scores the cohort, and checks the board. Monthly loads fail on server refusal;
  subject refusal instead returns a successful `not executed` string. The board
  then omits its patient check because `subjectsLanded` is false.
- The earlier real native run exited zero with HTTP500/42P10 subject intake and
  no profiles. The database/model arbiter was subsequently repaired. Old and
  repaired commits have the same demo tree, so an older successful marker can
  prevent a retry. Existing marker logic needs no parallel mechanism: changing
  this admitted pack changes its tree key naturally.

Read the rules, F1 ledger and current coordination holds at `f6127e722`. Searched
seed/marker/RBM/retry names, callers and tests, plus deleted history (including
`ba5332114`). No existing focused Lumen RBM completion test was found. Do not
change held `.devcontainer` files or create a second seeder/client.

## Bounded contract

First demonstrate the actual existing seed CLI returning success after a mocked
subject HTTP refusal, with the real RBM module and step runner. Then make that
required refusal throw through the existing failure contract. Keep prior metrics,
optional second-signer approval and provider-unavailable states unchanged. A
successful or already-loaded subject extract must remain idempotent. No database,
provider, approval or login calls in these tests; no route/table/schema change.

Run focused Node checks and scoped lint, retain genuine RED/GREEN, then freeze.

## Existing multipart retry follow-through

`tests/validation/lib/harness.mjs` already supplies the shared `createApiClient`
used by `launch-demo/lib.mjs`. It waits and retries JSON HTTP429 up to six times,
but its FormData branch waits and then breaks without another fetch. Lumen's
existing Vault intake supplies FormData. Search found no separate reusable
multipart/retry client or deleted counterpart to restore. Extend this client,
not its callers or the server's quota policy.

First prove the branch using real client bytes, synthetic FormData and stubbed
fetch/timers, with no network or real sleep. Confirm a fresh fetch Request can
serialize that FormData again with identical field, filename and file bytes.
Remove only the premature break if confirmed. Preserve authentication/Origin,
existing retry waits, at most six retries and one attempt for non429 responses.
No broad upload-failure policy, new client or retry framework is in scope.
