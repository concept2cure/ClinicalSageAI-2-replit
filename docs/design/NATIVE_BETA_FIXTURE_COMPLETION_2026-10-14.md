# Current native prerequisites for the human beta — 2026-10-14

W1 / D2 follow-up to TASK_DRAWER_HANDOFF_2026-10-14.md. Approved by the control
tower after the exact6ff hosted native failures and the clean merge at23502318.
Incoming1bd3af0bc already reconciles14 of the32 formerly failing suites. Preserve
and use that work. No production access, writer, membership, approval or seal
policy is weakened to restore a test.

Root owns the canonical branch, isolated Docker PostgreSQL15, canonical fresh
installer/deploy migration, execution leases, control documents and publication.
The owned disposable database is concept2cure-ri_dbtest on local port55432; its
app_service role is actually NOSUPERUSER/NOBYPASSRLS. No retained/private launcher
or credentials from another environment are reused. Environment values stay in
a private scratch file, outside Git. Existing runtime scoping and RLS remain on.

Implementation ownership (no overlapping edits):

- Backend audit worker: tests/db/workflow-import-governance.dbtest.ts. Replace
  only its legacy review-verdict helper (with the approved test-only
  workflow-import-review-fixture.ts extraction) with the actual current review GET,
  shared expected-binding schema and current audited receipt. Preserve the
  nineteen native workflow outcomes and real identities/locks/roles.
- Task UI worker: the eight tests/db Vault suites ana-vault-search-no-key,
  vault-chunking-off, vault-document-relationships, vault-fixity,
  vault-library-search, vault-passage-search-keyless, vault-passage-search,
  vault-reupload. All have suffix .dbtest.ts.
- Remaining-fixture worker: the nine tests/db suites cmc-source-evidence,
  data-room-catalog-facts, data-room-processing, org-retention-period,
  vault-data-room-file, vault-filing-vocabulary, vault-lifecycle,
  vault-placement-batch, vault-placement. All have suffix .dbtest.ts.
- Shared incoming vault-current-access-fixture.ts and catalog-native-fixture.ts
  remain canonical and read-only to workers. Any needed extension goes through
  root; no duplicate fixture framework or synthetic permitted-program list.
- Independent reviewer reads final diffs and evidence only.

Tests must establish real current active actors, intended membership roles,
unique program/project anchors and scoped request SQL clients. Use the existing
seedVaultFixtureParent/assertVaultFixtureRuntime and withNativeCatalogClient
where applicable; AnA handlers receive its actual restricted sqlClient. Retain
establishRequestTenantScope on existing HTTP verified-principal harnesses. Do not
replace authorization with a mock or supply fabricated accessible-program IDs.
Use fresh invocation namespaces; retain earlier records/audit/storage rather
than delete historical QA by reusable prefix. Role controls use real distinct
identities/current memberships. Existing policy/source predicates remain intact.

Original no-disclosure, no-write, atomicity and lineage assertions stay. An old
refusal code/status may change only after a real restricted-runtime observation
proves the current earlier boundary, recorded separately with before/after
state/no-write controls; no speculative expectation rewrite. Required locked or
legacy-lineage setup uses the existing explicit disposable-database guard.

Root first records the merged-source prior32 native result before edits. Native
runs share one database and are strictly serialized by an execution lease from
root; source edits also wait until the baseline completes. Preserve failing-first
logs and exact source pins. Workers do not commit, push, install or change roles,
run parallel native suites, skip cases, regenerate baselines or edit production.
Evidence: docs/evidence/D2-TASK-HANDOFF/2026-10-14/native-completion/.

## Observed placement prerequisite addendum

The remaining nine-suite native run reached all 79 original cases: 78 passed;
the old missing-scope-role negative returned success for the fixture's now-real
active administrator. Root and the independent reviewer traced this to the
existing locked writer transaction: requireCurrentVaultProgramWrite reads the
current organization membership, then applies the write-role policy to that
fresh role. An omitted cached scope label does not revoke actual authority.
No production policy change is needed or authorized by this observation.

Root approves a fresh, unaffiliated actor for that negative, with no organization
membership or private-project grant. Retain HTTP-equivalent 403, add complete
before/after row equality and zero filing-audit checks, and observe the actual
earlier refusal before changing its expected code. Record that first result.
Rename the case to describe the real missing membership; add a separate positive
regression for the admitted administrator with no cached scope-role label.
The positive and negative must use the same real writer and existing permission
reader. Do not alter the viewer/member controls, fixture roles, production code,
shared helpers, baselines or skips. This is an explicit reviewed fixture-contract
correction, not a claim that every original assertion line remains unchanged.
