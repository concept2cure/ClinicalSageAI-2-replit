# Existing source intake ownership and recovery — W1 / D2

Contract: `docs/design/SOURCE_INTAKE_OWNERSHIP_2026-10-23.md`.
Only `concept2cure-v2`; local/Codespaces, no deployment.

## What already exists

SourceImportDialog owns the current source-copy form and explicit Open action;
authoringHandoff owns stored workflow preview/create and receipt validation.
The import route already uses the shared transactional creator and returns typed
commit/handoff recovery identities. Existing authoring session/project guards,
captured actor headers, attempt ledger, recovery decoder, scoped document reads
and AuthoringRecoveryNotice are reused. No second editor, creator, endpoint,
catalogue or recovery store is proposed. The design records exact paths, current
tests and deleted-history searches, including conditional source-version reuse.

`canonical-catchup.*` retains the normal fast-forward from `1eca721b1` to
`62a8d5e7f`; preliminary dialog/handoff/shared source bytes did not change.

## Verification scope

Retain meaningful pre-edit behavioral failures, final guarded UI/transport and
actual client integration results, command exits, raw output and declared input
hashes. Source pins are bounded inputs, not exhaustive dependency closure.
Worker evidence stays in disjoint transport/ownership folders; root owns normal
direct canonical publication and Git-object verification.

Unknown writes cannot become silent retries or guessed records. A scoped read
does not identify a generic interrupted request. Recovered current copies do not
prove current original-source eligibility, regulatory completeness or approval.
Recovery is component-owned, not durable request idempotency. Synthetic HTTP/auth
checks do not establish human acceptance, provider or agency delivery. Human
checklist cases remain Not run until executed.

## Pre-merge qualification status

Transport and ownership workers retained their real pre-edit RED and qualified
GREEN snapshots. Final independent review added four more meaningful failures
for latest host handling and empty edited copies; root fixed them in a successor
epoch. Those earlier frozen receipts remain historical. The source HTTP suite
passes 20 cases with real verified Word bytes, PGlite/JWT, the shipped import
route and exact scoped reads after lost-COMMIT/readback faults. Initial root
qualification attempts exposed fixture omissions (Vault required fields, missing
request DB binding/project status, and a router-captured pool that could not be
replaced after import); these are retained as failed fixture runs, not product
RED. The extracted PGlite helper calls its real zero-argument release API; the
separate spy records requested disposal, without claiming native pool eviction.

Incoming integration at `62a8d5e7f` passed 72 cases/9 suites. A subsequent normal
fetch found canonical successors including bearer-organization headers, Task
Board response recovery, Reporting unknown-write recovery and MDX journey
affordances. Their captured actor helper remains unchanged. Root will preserve
these changes by normal merge and qualify the resulting editor/incoming surface
cohort, build, compiler and required gates before direct publication.

## Final merged local qualification

Source commit `8c86a44a3` is retained through normal merge `17fd82f7f` of
canonical `eba2d8050`. Only the additive work-order table conflicted; both rows
were preserved. The final declared 92 source/config/test inputs are frozen in
`source-freeze.json`; these are bounded inputs, not full dependency closure.
`qualification-plan.json` names the exact two disjoint cohorts.

- `qualified-editor`: 336 passed / 16 suites, including 58 focused intake
  ownership cases, strict transport/reuse, actual entry points, source-first
  assembly, document start, Workbench and existing specialist handoff/recovery.
- `qualified-canonical`: 313 passed / 20 suites, including incoming MDX/Projects,
  Reporting, catalog/Task Board/auth-header integration and actual source-import
  HTTP recovery. It includes the 20-case HTTP suite, not an additional 20.
- Production build passed. New/aligned files have zero lint warnings; the
  handoff module retains its one original specialist complexity warning with
  no increase. All seven declared single-editor, UI and repo-health gates pass.
- Each final receipt records Node 22.23.3, exit zero and zero input drift; raw
  gzip hashes verify. The lockfile is unchanged. The normal direct-push hook
  will run the full compiler and publication gates; its accepted receipt and
  Git-object verification belong to the publication follow-up.

Earlier worker/initial-root snapshots are historical scopes; do not sum them
with these 649 final checks. No human, live provider, live regulator or deployed
environment qualification is claimed. The local human guide now has 102 cases,
all Not run. Recovery remains mounted/component-owned, not durable idempotency.

## Compiler correction

The first normal push was refused by the zero-error TypeScript gate: the test
helper used `ReturnType<typeof vi.fn>`, whose current overload can include a
constructable mock and therefore is not guaranteed callable. The helper now
declares only its actual callable/clear surface. This is a type-only fixture
correction; no production, assertion, SQL, dependency or baseline changed.
`canonical-push.*` retains the refusal. The original qualified 92-input epoch
remains immutable; `compiler-corrected-source-freeze.json` is its successor,
changing only the helper. Root qualifies that helper’s HTTP/lint behavior and
uses the successor epoch for the next normal push and Git-blob verification.
