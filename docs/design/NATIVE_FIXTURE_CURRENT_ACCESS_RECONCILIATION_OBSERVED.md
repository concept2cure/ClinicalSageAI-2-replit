# Observed refusal contracts after current fixture admission

Date: 2026-10-14. Addendum to
`NATIVE_FIXTURE_CURRENT_ACCESS_RECONCILIATION.md`.

The first actual four-suite execution against the separately allocated fresh
`platform_ci_fixture_reconcile_20261014_4e18c6a9` database passed 44 of 46 cases
with zero skips in 37.32 seconds. The five fixture sources and every original
expectation remained unchanged during that phase. Canonical fresh installation,
deploy migration and runtime grant audit passed. The actual runtime login was
`app_service`, neither superuser nor `BYPASSRLS`, with RLS enforcement and relevant
FORCE RLS verified. Global role, role-membership and global-setting fingerprints
were identical before and after both installation and execution.

The two failing original assertions observed these current contracts:

- An admitted actor selecting a program outside the claimed organization received
  HTTP 404, while the old test expected 403. The original assertion stopped before
  inspecting the response code or reaching its no-write tail. The followup checks
  the safe canonical `PROJECT_NOT_FOUND` response code through the actual route;
  that body is verified by execution rather than claimed from the first result.
- A separately recorded active user with no organization membership received
  `403 PROJECT_ACTOR_ACCESS_DENIED`, while the old test expected the role-writer
  code `VAULT_WRITE_ROLE_REQUIRED`. A missing current actor membership is refused
  before the governed role-writer check. The actual viewer control still returned
  the role-writer refusal, and the actual member with a recorded project edit
  membership was admitted.

The approved followup changes only those two expectations and their explanatory
fixture copy. Every existing no-disclosure and no-write assertion remains. Each
of the two denied operations additionally compares document and ingest-audit
counts for its fresh invocation-owned organizations and the storage provider's
actual version listings before and after the request. The foreign control checks
both the incoming organization/program storage scope and the real foreign target
scope; it does not infer storage absence from a guessed filesystem path. The
missing-membership control checks the actual own-program provider scope.

The same four suites run serially again against this isolated database, with new
invocation namespaces and retained prior QA data. No schema repair, policy change,
role grant, history erasure or trigger disabling is permitted. The original raw
44-pass/2-fail phase and its source pins remain separate from the followup. A new
assertion failure must be reported as observed before changing it further.
