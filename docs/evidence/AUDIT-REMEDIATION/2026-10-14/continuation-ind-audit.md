# IND persistence audit outcomes — 2026-10-14 continuation

This bounded O01 remedy moves the launch audit-evidence workstream. It repairs
seven discarded audit outcomes. It does not qualify a new IND workflow or an
agency submission.

## Delivered behavior

The amendment, annual-report and safety-report persistence services now return
the actual inserted or updated row plus `auditTrail: AuditRowOutcome`. The
dispatch-snapshot service does the same for its actual inserted snapshot. Each
mutation attempts exactly its existing canonical audit action through
`recordAuditRow`; no new store, dependency, schema or duplicate writer was added.

The seven actions are:

| Service | Actions |
| --- | --- |
| Amendment register | `IND_AMENDMENT_DRAFTED`, `IND_AMENDMENT_FILED` |
| Annual-report register | `IND_ANNUAL_REPORT_DRAFTED`, `IND_ANNUAL_REPORT_FILED` |
| Safety-report register | `IND_SAFETY_REPORT_DRAFTED`, `IND_SAFETY_REPORT_FILED` |
| Dispatch snapshot | `IND_DISPATCH_SNAPSHOT_CREATED` |

These supplemental writes already happened after the business mutation. A
failed audit preserves that mutation and returns the bounded canonical warning.
An unexpected rejected audit promise now also preserves the completed mutation,
instead of turning it into an apparent failed request. Successful outcomes carry
the actual `chained` flag. Store error details stay out of the HTTP response.
Subsequent reads do not invent or persist the transient mutation outcome.

The three draft-create responses expose the outcome both on the returned row
and at `meta.auditTrail`. The three tracked-draft filing responses expose the
mark-filed outcome on `draft.auditTrail` and at `meta.auditTrail`. The snapshot
response exposes its outcome on `snapshot.auditTrail` and at `meta.auditTrail`.
The existing bounded shared response reader can therefore announce a missing
audit entry through its existing user notice. The filing metadata describes the
named draft transition; it is not a new claim about all the sequence's writes.

## Route and UI connection

The canonical authenticated mount is `/api/ind-lifecycle`, with the existing
`regulatory-author` functional role guard. `IndLifecycle.tsx`, reachable through
`ind-checklist`, calls the safety-report, annual-report and amendment filing
endpoints. Its current requests do not name a persisted `draftId`. No current
client consumer was found for the three persisted draft registers or snapshot
history. These repairs make those APIs truthful; they do not claim that a new
register UI has been connected.

## Verification

- Before the production change, the new outcome assertions failed: **11 failed,
  18 passed** across the two service suites. Both resolved audit failures and
  unexpected sink rejections were observable failures.
- After the repair: **122 tests passed across three files**, including the two
  service suites and all 93 existing mounted-route contract cases.
- **15 native database cases passed** against the canonically provisioned
  PostgreSQL database. This test installs no table, trigger, grant or policy.
  It verifies genuine `authenticateToken` membership, asynchronous tenant scope,
  `LazyRequestDbClient`, a TLS connection, `app_service` without superuser or
  BYPASSRLS, and ENABLE/FORCE RLS on all four business tables.
- Native positive cases exercise all seven mutations through the actual mounted
  router, then read the real business row and both durable audit stores using
  the fixture owner. Queryable audit rows include actual actor, tenant, chain
  position and an HMAC seal. This is not a separate cryptographic-chain audit.
- The audit-refusal control delegates to the real audit service with a deliberate
  foreign audit tenant; the real tenant boundaries refuse both stores. The
  unexpected-rejection control is explicitly a targeted sink seam. Neither
  control replaces the business database, authentication or row-level security.
- Native cases verify missing authentication, a viewer with a forged admin JWT
  claim, forged membership, foreign record refusal, persisted blocked snapshot
  history, and sequential filing retry refusal. A separate business fault
  retargets an actual fixture INSERT to a foreign tenant: PostgreSQL returns
  `42501`, the HTTP result is the existing bounded 500, no row or audit is saved,
  and a subsequent successful retry creates exactly one real record.
- Scoped lint: zero errors. Existing monolith/complexity warnings are retained.
  The repository companion-file presence check completed in its existing warning
  mode; this is not test-execution evidence. Scoped diff whitespace checks pass.

Raw local execution receipts are `/workspace/audit/continuation-ind-audit-red.log`,
`continuation-ind-audit-green.log`, `continuation-ind-audit-native.log`,
`continuation-ind-audit-lint.log`, and `continuation-ind-audit-test-presence.log`.
All data and retained PDF bytes are synthetic local fixture artifacts. No live
agency, gateway or external AI service was invoked.

## Fixture correction

The old PGlite harness mirrors IND DDL; it does not itself prove the deployed
schema. The mounted-route suite initially could not start because its shared
`ectd_sequences` mirror lacked two newly canonical nullable columns. The narrow
authorized fixture correction adds `transmit_signature_action_id TEXT` and
`transmit_attempt_id UUID`, exactly as defined by
`migrations/20261014_ectd_transmit_attempt_binding.sql`. `frozen_at TIMESTAMPTZ`
already existed and was not changed. Native qualification uses the deployed
canonical schema rather than this mirror.

## Remaining boundaries

Parent existence and filing concurrency remain separate defects identified by
inspection. These are not resolved by an audit-outcome conversion:

- Register services scope the row's organization but do not admit the live
  submission parent before creation. Their original table definitions have no
  parent foreign key. An own-organization register row can therefore name a
  missing or foreign integer submission ID. Canonical `getSubmission` would
  establish live same-organization existence; its current policy alone would
  not establish a private project's ACL.
- A tracked filing loads a draft, renders/retains files, and creates the sequence
  and leaves before the separate mark-filed UPDATE. That UPDATE has no draft-state
  predicate, target-sequence/submission verification or shared transaction with
  composition. A concurrent request can pass the earlier read and overwrite
  linkage; the route also swallows a later typed NOT_FOUND and omits the draft.
  The sequential retry cases prove existing 409 behavior, not concurrency safety.
- The snapshot route derives its parent IDs from the actual loaded sequence;
  direct service callers do not independently verify that relationship.

No critical signing act was converted to supplemental audit policy. No new
filing admission, legal policy, project permission or dispatch claim was enabled.
