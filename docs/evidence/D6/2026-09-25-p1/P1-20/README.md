# P1-20 — every member could read and export the audit trail, and write anything into it (DP-18, Medium)

**Row:** D5/D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-18. **Plan item:** P1-20.

## What was wrong

Every route in `server/routes/audit-trail-routes.ts` admitted any member of the organisation once the tenant guard
passed: `GET /audit/logs`, `/audit-logs`, `/audit/events`, `/audit` and both exports handed a viewer every user's name,
role and IP address (GDPR 5(1)(f)); `POST /audit/events` and `/audit/events/batch` inserted whatever `event_type`
(default `general`) and `metadata` the body carried into `audit_events`, attributed to the caller (11.10(d)(e)).
No first-party client posts to those routes; the admin console reads the ledger through `/api/audit-trail/ledger`
and exports through `/audit/export/signed`.

## What is true now

`server/services/audit/audit-api-authority.ts` holds the rule, and the routes apply it after the tenant guard:

- **Readers** are organisation owners, admins and managers (the roles that run QA and administration, as the
  membership row states them since P1-4), or a platform administrator; every other role is 403
  `AUDIT_READ_RESTRICTED` on the seven read and export routes, before any query or export starts.
- **Recorders** are the same set (recording an audit event by hand is an administrative act): 403
  `AUDIT_WRITE_RESTRICTED` otherwise.
- A client-recorded event names a type from `AUDIT_EVENT_TYPES`, the closed list of the dotted `domain.action` types
  the server's own writers put in `audit_events` (eight today, collected from those writers), and carries a JSON
  object of at most 8 KB as metadata; anything else is 400 with the vocabulary named (in a batch, skipped with the
  reason). The `general` default is gone. The reason-for-change rule for GxP-significant events runs first, as before.

| | File | Result |
|---|---|---|
| red | `red/audit-api-before-fix.txt` | HEAD `50b04d99`, routes unchanged: a member reads every route and both exports reach the export; a free-text and an absent event type are written; 11 failed / 5 passed |
| green | `green/audit-api-after-fix.txt` | 373 / 373 across the new suite, the export tenant-scope suite, the actor-identity suite, the tenant-isolation audit contract, the outcome-headers suite and the router-load suite |

Test: `server/routes/__tests__/audit-trail-read-gate.test.ts` (the real router over a pool double). The two existing
suites' fixtures, which had no organisation role and posted `eventType: 'x'`, now carry the role and the vocabulary type
the routes require; their assertions about tenant scoping, principal attribution and the reason rule are unchanged.

## Not done here

- **`/api/audit-trail/ledger`** (`server/routes/audit-trail-ledger.routes.ts`, the admin console's list) is still read
  by any member; it returns the same rows. The same `requireAuditReader` applies there; the file left another lane's
  window at 01:39 UTC and is the next commit's.
- **Audit-trail review records** (P1-25) and the export key (P1-19) are separate items.

## Follow-up (same day): the ledger list route

`GET /api/audit-trail/ledger` (`server/routes/audit-trail-ledger.routes.ts`, the admin console's list) reads through the
same `requireAuditReader`; `red/ledger-before-fix.txt` (a member read it: 200) and `green/ledger-after-fix.txt` (16 / 16
with the vault history suites; the suite's fixture is an admin unless a case says otherwise).
