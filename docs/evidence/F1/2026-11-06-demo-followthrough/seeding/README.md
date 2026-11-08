# Required Lumen RBM intake and existing seed completion

Plan: F1. Completes: `scripts/demo/launch-demo/packs/lumen-rbm.mjs`.

## What already exists

The inventory and bounded contract are published in
`.design/claude-convergence/F1-demo-seed-followthrough-2026-11-06.md`. Existing
`seed.mjs`, `lib.mjs` and `packs/lumen-rbm.mjs` already own the pack, step failure,
idempotent extraction, cohort and board paths. `.devcontainer/post-start.sh`
already avoids writing its marker on nonzero seeder exit; it is held and untouched.

The native receipt in `docs/evidence/F1/2026-11-06-demo-readiness/native/` records a successful
bulk seed with failed subject intake before the arbiter repair. At inventory,
`c50f8782:scripts/demo` and `e10d5e962:scripts/demo` both resolve to
`edab999c42a892c161b25f96c3feec2b1d1dd18b`. This is a confirmed completion/cache
gap, not a claim of a remote observation in the user's Codespace.

Searched existing names, paths and deleted history; the plan/coordination check
at `f6127e722` permits F1 in this existing pack. No parallel seeder, marker,
service or client is added. Required subject refusals must fail through the
existing runner; optional unsigned QMS/RACT and unavailable-model states stay
explicit and unchanged. Previously committed records are retained for retry.

## Qualification scope

The focused fixture will execute copied, unchanged seed CLI bytes, the real RBM
module and real step/manifest runner, with synthetic HTTP only. It will record
the pre-repair false-success RED and the repaired exit/manifest behavior. It
must also cover successful and already-loaded subjects without a second signer.
No live API, database, login, provider, approval or browser qualification is
claimed. Results and source hashes follow after execution.

## Executed result

Before the production edit, three required-refusal cases (HTTP403, 429 and500)
failed: the actual copied CLI returned zero and its real runner wrote
`seeded_unqualified`. The successful and already-loaded cases passed. This
genuine **3/5 RED** is retained in `red-before.txt.gz`, with pre-edit source
hashes. The fixture does not run a substitute RBM algorithm: it imports the
real module/content and real step/manifest runner, and substitutes only HTTP,
identity/plan preflight and the enclosing pack's unrelated work.

The existing subject step now calls `must(res, 201, ...)` rather than swallowing
the refusal. Existing `seed.mjs` catches the thrown error, records a failed
manifest and returns nonzero; the existing startup success branch cannot issue
its done marker from that result. No prior API write is undone. Successful and
already-loaded intake still completes, and optional second-signer RACT approval
remains explicitly not executed without credentials.

**14/14 focused Node cases pass** (five CLI scenarios plus nine existing CSR
qualifier cases). Scoped lint with `--no-ignore` has zero errors, zero warnings
in the new test and three warnings in unchanged pack functions. No allowance,
API/client, marker logic, provider policy or held startup file changed. Exact
logs and final hashes are retained here. All owned sources/tests are frozen.

## Multipart retry inventory and bounded contract

The existing `tests/validation/lib/harness.mjs:createApiClient` is reused by the
demo connector. Its HTTP429 loop already handles waits, credentials and six
retries; for FormData it instead breaks after the first wait. Existing Lumen
Vault intake passes FormData. Searched client/retry/multipart names and deleted
history; no parallel client is needed. The design above records this extension.

Before editing, test the real client with synthetic multipart, fetch and timers.
Prove repeat serialization preserves filename and bytes, then remove only the
premature FormData break. No network, real sleep, provider/database access or
server-quota/upload-policy change is authorized or claimed. Record separate
RED/GREEN and hashes for this existing-client repair.

The pre-edit real-client probe produced **2/6 RED**: a multipart HTTP429 was
returned without the second fetch, and repeated429 stopped after one attempt
instead of the existing retry bound. Four compatibility cases passed. The fix
removes only the premature break; fetch builds a new Request from reusable
FormData on each attempt. The positive probe uses native Request serialization
twice and compares the field, filename, MIME type and every binary byte, plus
unchanged Authorization, Origin and Accept headers and valid multipart boundary.

**20/20 combined focused cases now pass**, including six client-retry cases,
the five required-subject CLI cases and nine qualifier cases. Repeated429 makes
seven total attempts (initial plus six retries); non429 makes one. Timers/fetch
are stubbed, so there is no network or real sleep. Scoped lint has zero errors,
zero new-test warnings and the same18 existing harness warnings/rules as the
hash-verified pre-edit source. Separate multipart logs/status/hashes retain
these results. No server quota, broad upload policy or held startup file changed.
