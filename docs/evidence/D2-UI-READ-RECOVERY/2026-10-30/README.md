# Existing UI read recovery — bounded loading and navigation cancellation

Workstream: D2 customer-entry and existing screen recovery.
Date: 2026-10-30. Branch: concept2cure-v2.
Repository: concept2cure/ClinicalSageAI-2-replit.
Base commit: 6877b1cfca1008ef633de7763a47e65f266d3fee.

## Status

Repairs three existing frontend modules. No new application, screen, API, database
schema, production dependency or authentication bypass. No hosted deployment or
browser qualification was performed. This is not a demo-ready or release-ready
verdict, and does not establish the cause of the reported hosted incident.

## What already exists

- `client/src/concept2cure/v2/dataConnect.tsx`: canonical fixture-free v2 reads,
  read-visit ownership, shape checking, ErrorState/EmptyState and retry controls.
  Previously an unresolved request/body could leave useLiveData loading forever;
  explicit caller dependencies could omit a changed URL; retired ownership returned
  a loading state despite no current read. Extend this path, not another loader.
- `client/src/concept2cure/mdx/hooks/useFetchJson.ts`: existing cancellable,
  refreshable MDX/Quality JSON hook and shared read-refusal classifier. It had no
  deadline, and an unexpected AbortError silently returned without clearing loading.
  The common read deadline now lives here and is reused by v2.
- `client/src/lib/queryClient.ts`: existing authenticated transport, tenant headers,
  sanitized errors, session-end announcement and audit-outcome handling. It now
  forwards an optional cancellation signal; the transport convention is unchanged.
- `client/src/lib/apiErrorCode.ts`: shared code reader, reused unchanged.
- Existing Projects/TaskBoard read and recovery surfaces remain their owners. No
  extra dashboard or alternate navigation was created. Existing retry controls
  remain caller-owned; this change does not claim every screen has a retry button.

Current source/caller searches were performed through GitHub, including existing
read, timeout, cancellation and retry implementations. All three original source
files were verified against their Git blob hashes before editing. Full repository
checkout/deleted-history search was unavailable; no source capability was deleted.

## Changed behavior

1. A GET through liveGetOrNull or useFetchJson has a 20-second deadline covering
   transport and body/error-body parsing. It aborts and returns a retryable failure,
   never invented data or a successful empty result. Even a transport that ignores
   abort cannot publish a late result after timeout.
2. The existing v2 hook aborts obsolete reads on navigation/retry/unmount. The path
   is always a dependency, including when caller deps omit it. Changing or disabling
   the path clears prior-project data; a retired owner hides data and stops loading.
3. MDX/Quality refresh recovers after timeout. Unexpected abort and caller abort are
   ended reads, not indefinite spinners. Cleanup cancellation is silent.
4. The canonical transport keeps auth/org headers and normal error/audit handling.
   Cancellation is rechecked before a delayed 401 can announce session termination.
5. Saves, signatures, uploads, non-GET hook requests and model-generation work have
   no new default timeout or automatic retry. A slow write is not declared unsaved.

This does not impose a deadline on every raw fetch or React Query request in the
application. It repairs the two shared read paths named above. A client deadline
provides recovery; it does not cure server outages, improve server computation time,
provision an organization, create demo data, or connect an unwired rail destination.

## Executed verification

Command in a repository with its TypeScript devDependency installed:

```sh
node --test tests/ops/ui-read-recovery.test.mjs
```

The same 48 tests ran against the original and repaired source:

| Source | Passed | Failed | Skipped/cancelled |
|---|---:|---:|---:|
| Original | 21 | 27 | 0 |
| Repaired | 48 | 0 | 0 |

Runtime: Node v22.16.0; available TypeScript v5.8.3. The test runner transpiles the
actual TS/TSX modules and executes them with explicit timer, HTTP, auth/session,
Tanstack constructor and React-hook lifecycle/element doubles. It is not React DOM,
Playwright, real-database integration or hosted acceptance. Test identities/data are
fictional. Existing safe error rendering/retry-handler behavior is exercised through
its actual component function, not a browser click.

Coverage includes stalled transport/body/error/session reads, deadline boundary,
late resolve/reject, retry recovery, changed/null URL, owner retirement/recovery,
unmount, abort before dispatch, active bearer headers, refusal codes, real empty/204,
malformed response, timer/listener cleanup, no automatic retry storm, write timing,
audit warning preservation, and preventing an old cancelled 401 from ending a newer
session. Twenty-seven checks fail against the original files.

A strict isolated TypeScript check of the actual three changed modules plus the
unchanged error-code reader reports zero diagnostics using DECLARED DEPENDENCY
STUBS. It does not prove compatibility with the full application's dependency
versions or replace the full TypeScript/build/lint suites.

Raw red/green logs, exact source snapshots, patch, focused-check script and log are
retained in the delivered evidence archive. `verification.json` records their hashes.
No full build, full typecheck, lint, ordinary pre-push hooks or browser suite ran in
this executor. No gate or baseline was changed. Publication is not qualification.

## Hosted incident remains open

The previously identified Demo Access organization/membership-selection defect,
actual demo tenant/workspace provisioning, missing hosted demo data and individual
rail destinations remain unresolved or unverified by this batch. The current work
neither changes the login handler nor performs live seeding. The affected URL,
authenticated browser and deployed version were not available here.

Acceptance must run on the actual customer-facing environment: Demo Access ->
correct organization -> populated project -> create/reopen project -> Tasks and
Communication -> editor save/reopen. Record request failures and the deployed commit;
passing a loader unit suite is not evidence that this journey passed.
