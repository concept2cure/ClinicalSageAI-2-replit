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
membership or private-project grant. Retain HTTP-equivalent 403, compare all
seven fields in the existing filing-state projection before/after, require zero
filing-audit changes, and observe the actual
earlier refusal before changing its expected code. Record that first result.
Rename the case to describe the real missing membership; add a separate positive
regression for the admitted administrator with no cached scope-role label.
The positive and negative must use the same real writer and existing permission
reader. Do not alter the viewer/member controls, fixture roles, production code,
shared helpers, baselines or skips. This is an explicit reviewed fixture-contract
correction, not a claim that every original assertion line remains unchanged.

## Canonical Data Room integration and PostgreSQL 15 compatibility

Canonical work through 8bfbd26c4 adds source-read receipts, capture integrity and
processing recovery. Root preserves it in merge 8d3bd4688. The only conflict was
the native processing fixture: preserve the current scoped dry-run executor and
the new candidate/blocked diagnostics, checksum/identity checks and legacy repair
case. Apply now owns database transactions and correctly refuses an injected
query-only executor, so use the actual scoped application pool for apply. This
is an incoming contract change, distinct from the earlier cached-role correction.

The canonical new migration passed on the owned PostgreSQL 15 database. Its
eight native processing cases then reproduced six passes and two failures:
undefined function pg_input_is_valid (42883). CI and the beta Compose stack
explicitly use PostgreSQL 15; upgrading a test database would hide this defect.
Root authorizes the remaining-fixture worker to own the existing
data-room-processing-sweep.ts time helper and a focused native regression in
data-room-processing.dbtest.ts (or a small dedicated native suite if required).
Use PostgreSQL 15-supported safe parsing/construction, first proving the actual
database behavior. Preserve exact canonical UTC shape, valid-calendar rejection,
hostile/missing/non-string metadata handling, bounded candidate/diagnostic reads
and no-write dry runs. Never use an unguarded timestamp cast or a regex-only
calendar check. Reuse a safe native parser if available; otherwise use guarded
numeric constructors. No database-version change, new parser service, role/RLS
change, migration, permission bypass, skip or baseline. Retain failing-first
query output/source pins and rerun the integrated formerly failing set afterward.

The implemented PG15 helper first checks bounded ASCII ISO UTC fields and a
nonzero four-digit year. Inside that guard it uses silent JSONPath datetime
parsing of the equivalent explicit `+00:00` offset, then permits the original
timestamp cast and exact UTC/millisecond roundtrip only after parser success.
The guards matter: native probes found that JSONPath normalizes zero date
components, while a subsequent raw cast can reject them with 22008. Calendar
validation remains PostgreSQL's parser rather than a handwritten leap-year rule.
The corrected parser matched 526 valid/hostile inputs under three DateStyle and
timezone combinations without an error or mismatch. The existing eight native
processing cases and one added 41-variant stage/calendar dry-run case passed
9/9 on the actual restricted PostgreSQL 15 runtime. The new case verifies the
complete source JSON is unchanged by each dry run and the stored bytes remain
exact. Scoped lint reported zero errors and warnings. This focused result does
not replace the root's final integrated native run. Raw failure/green output,
probe scripts/results and before/after source pins are retained in
[the PG15 processing evidence](../evidence/D2-TASK-HANDOFF/2026-10-14/native-completion/pg15-processing/README.md).

## Resumed canonical native findings — 2026-10-17

The 34-file/301-case native run at the resumed integration reached every case:
295 passed and six failed. Keep that failing checkpoint and its source pins.
Three fixity failures expose an actual integration defect: the canonical local
provider now rejects altered bytes with `StorageIntegrityError`, but the existing
Vault reader catches every provider exception as missing. Root owns a bounded
fix in `project-vault.ts`: classify size/digest mismatches as the existing
`CONTENT_HASH_MISMATCH` refusal and invalid recorded provider identity as the
existing unreadable refusal. Never return bytes, retry a different store, replace
a recorded digest, or change ownership, route access or audit writers. Existing
native fixity expectations remain unchanged; add real-provider controls for both
forms of alteration and invalid metadata, with no content returned.

The native reviewer owns the two catalog fixture files only. Investigate the
current chat-upload access prerequisite and two stale display expectations
against the actual scoped runtime observations. Preserve source visibility,
foreign-document non-disclosure and honest accessible-scope counts. Record the
exact current wording before changing an expectation. No production search or
permission changes, shared-helper edits, skips or baseline changes are authorized.
After integrating canonical `d6a33d3a4`, rerun the affected native files and the
19-case workflow governance suite because its exports invoke the changed saved
source verifier. The other native implementation paths have no incoming overlap.

The normal direct push at `a48ce1e97` was refused by the warning ratchet: the
provider classification grew the existing byte-reader past its function length
and complexity limits, and four informational console calls in retained probe
scripts were newly lintable. Root owns extracting that same classification into
a small private helper in `project-vault.ts`, with identical result objects and
no read/access/fallback changes. Rerun the real-provider refusal tests and native
fixity/historical download overlap on the extracted source. The native reviewer
owns only replacing the probes' informational `console.log` with `console.info`,
retaining SQL/results/historical pins and recording the presentation normalization.
No warning suppression or baseline change is authorized.

## Audited request transactions and processing merge — 2026-10-17

Canonical `e1f3fd425` changes real request-client transaction hooks, audit outcomes,
catalog/source-read paths and create/import/adoption flows, with seven migration
files and an updated canonical migration set. Prior draft-only impact conclusions
do not apply. Root will replay the canonical deploy set and the original 34 native
files, plus adoption-commit-outcome and part11-audit-receipts, on the same retained
isolated restricted runtime. Record exact source pins and any initial failures;
only one native execution lease exists.

The native reviewer owns the sweep and its native test merge conflicts. Preserve
the proven PG15 bounded ASCII/silent JSONPath/guarded cast/exact roundtrip body,
but expose it through incoming processingTimestampSql(t), with time(field) using
that same function. Preserve the incoming isolated pending-case private fixtures,
audited outcomes and paging baseline, our scoped dry-run/count executor, actual
runtime/disposable guards, retained records/storage and 41-variant no-write case.
No duplicate parser, version upgrade, broad cleanup, role change or assertion
weakening. Run the focused incoming processing timestamp and recovery PGlite
controls before root freezes the merged source. Root owns deploy/native execution,
compiler/build, global reconciliation and normal authenticated canonical push.

The independent backend reviewer may add direct HTTP refusal controls in the
existing vault-download.test.ts harness: both typed byte-identity mismatches and
invalid provider metadata must retain their existing 409 translations, return no
bytes, avoid legacy fallback and emit no successful-download audit. No second
harness, authorization mock or production change. The earlier real-provider
failing-first controls remain the red checkpoint.

After the processing conflicts are frozen, root may replay deploy and the native
baseline while the UI reviewer finishes independent client files. Freeze all
executed server/shared/native source and migration paths during that lease; client
edits are not served or imported by this native runner. Capture exact working-tree
source pins, do not commit/change executed files mid-run, and retain any failures
before a bounded repair. The isolated backend unit-test file is not native runtime
source. This permits parallel independent verification without relabeling its
working-tree checkpoint as a later commit.

The first default backend replay reached 716 cases: 686 pass and 30 fail in
projects-create.test.ts (28) and draft-source-context-authority.test.ts (2).
The backend reviewer owns only those two modeled-query test fixtures. Reconcile
actual current principal/membership/lock reads and the catalog-scope mock's real
ProgramReadAccessError export, preserving the production admission chain and
original business/refusal/no-write controls. Fix missing prerequisites before
changing a refusal expectation; retain the observed earlier boundary separately.
No production edits, mocked permitted-program list, authorization replacement,
skip or baseline change. These unit fixtures are excluded from the native runtime
pin set and may be corrected during that independent execution lease.

The projects repair may also extend the existing sole-consumer
`server/routes/c2c/__tests__/projects-create-fixture.ts` exact query matcher.
Keep the unchanged two-parameter locked actor query and recognize the current
nonlocked three-parameter active-user/current-org read with its explicit
`pending_deletion = false` admission parameter. Do not introduce a second
fixture adapter or catch-all SQL allowance.

The first merged native36 run reached 311 cases: 309 passed and the two
adoption receipt checks requiring non-null HMAC seals failed. The isolated
launcher omitted AUDIT_HMAC_KEY, which makes the real chain writer deliberately
write unsealed rows in test mode. Preserve that red run. Root may configure
synthetic local AUDIT_HMAC_KEY and AUDIT_HMAC_SECRET outside Git, retain their
namespace for this database, and replay the same 36 files with unchanged source
and receipt assertions. This is a test-environment prerequisite, not a
production key provisioning or a regulatory qualification claim.
