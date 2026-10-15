# Discovery backend evidence — D2 client onboarding

The previously absent questionnaire now has a shared, conditional contract and a
reachable authenticated API at `/api/onboarding/discovery`. Its organization-wide
record is saved through the canonical tenant settings writer, with optimistic
revision protection inside a row lock and an audit row in the same transaction.

This evidence moves D2's onboarding reachability and persistence path. It also
preserves D5 audit behavior; it does not claim deployment, production model
qualification, launch-row completion, or a completed customer onboarding.

## Executed checks

- Shared contract: 10 tests, including modality/provider follow-ups, whitespace
  completion, strict schema rejection and CMC/launch recommendation boundaries.
- Router: 13 tests, including authenticated reads, member read-only access,
  administrator/owner writes, server ownership, incomplete completion refusal,
  completed-record readback, stale revisions, unavailable records and audit errors.
- Managed-door routes/controller: 5 tests refusing discovery in generic
  organization, tenant and AnA settings paths while permitting unrelated updates.
- Real SQL/PGlite: 6 tests exercising `writeTenantSettings` under a
  non-superuser, non-bypass-RLS role. Saved records are re-read from SQL and the
  GET response. The audit failure is a rejected SQL insert; the discovery update
  and audit row both roll back. A stale revision adds no second audit row.
  Generic creation, replacement, removal, nulling, recursive merge and in-place
  discovery edits are refused by the writer; unrelated settings remain writable.
- Existing proposal ingest/commit, organization profile/settings, connector,
  canonical settings-audit and static route registration suites:
  [113 tests passed](discovery-regressions-green.txt) without changing their contracts.
- Scoped ESLint and shared contract TypeScript check pass.

[Green output](discovery-backend-green.txt) records 34 passing new tests.
[Contract red](discovery-contract-red.txt) and [route red](discovery-route-red.txt)
record the missing capability before implementation. The SQL suite also contains
an executed behavioral negative control: widening the test tenant policy exposes
the other organization, causing the denial assertion to fail as expected; rolling
back the policy restores the denial. This proves the isolation test observes the
policy rather than merely checking SQL text.

## Limits

The PGlite integration uses a controlled session/authentication stub and an audit
insertion adapter. It exercises real SQL transactions and RLS, but does not
re-prove production JWT membership resolution or audit-chain cryptography; those
belong to the existing real-database authentication and audit suites. The new
endpoint needs no migration and no model credential. The root workstream owns
the wizard UI, integrated client verification and release status.
