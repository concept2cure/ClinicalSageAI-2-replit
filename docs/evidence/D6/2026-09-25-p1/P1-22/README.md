# P1-22 — retention and legal hold were not usable (DP-20, Medium)

**Row:** D6. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-20. **Plan item:** P1-22.

## What was wrong

- The retention sweep (`server/jobs/retentionCron.ts`) ran only from a CLI nobody schedules (`server/bin/run-retention.ts`).
- Nothing wrote `vault.documents.retention_until`, so the sweep matched nothing: a retention policy named at admission
  never started a clock.
- `vault.legal_holds` existed and the sweep honoured it, but nothing could place or lift a hold: no route, no tool.
- The record of a deletion was a line in `logs/audit.log` on the task's disk (`server/utils/audit-logger.js`), not a
  row in the chained store.

## What is true now

- **Scheduled.** `startRetentionSchedule()` runs at boot beside the audit-chain sweep (`server/index.ts`); the posture
  is the chain sweep's shape: explicit `ENABLE_RETENTION_SWEEP` wins, production defaults ON, anything else is
  opt-in; `RETENTION_SWEEP_CRON` (default `30 3 * * *`).
- **The clock starts at admission.** The vault ingest INSERT computes `retention_until` as today plus the named,
  active policy's `retention_days`; a document that names no policy, or an unknown one, gets no date and is kept
  indefinitely (the sweep never destroys a document with no date). A re-upload does not restart a clock that has
  started (`COALESCE(existing, new)`).
- **Holds can be placed and lifted.** `POST /api/vault/legal-holds` (scope program or document, reference, reason)
  and `POST /api/vault/legal-holds/:id/lift` (lift reason), `GET /api/vault/legal-holds`; by owners, admins and
  managers (the audit-trail readers of P1-20) or a platform administrator; the target must be the organisation's own
  program or undeleted document (404 otherwise); each change is one transaction with its chained audit row
  (`vault.legal_hold.placed` / `.lifted`), and a hold whose row cannot be written is rolled back (500), never
  placed unrecorded. Mounted behind `authMiddleware` in `bootstrap/register-inline-routes.ts` beside the ingest.
- **Each disposition is one transaction.** Archive snapshot (when the policy asks), the soft or hard delete and the
  chained `audit_logs` row (`vault.document.retention_hard_delete` / `_soft_delete`, under the document's
  organisation, else its program's) commit together or not at all. A deletion that cannot be audited — no
  organisation to chain it under, or the row cannot be written — is not made and is counted as an error. Legal
  hold still outranks retention and is checked before any transaction opens. Job-level events go to the structured
  logger and, on a failed sweep, to `reportSecurityAlert`; nothing writes to a file.

Left on the plan row: per-organisation retention policies (`vault.retention_policies` is global; a tenant column
on a non-public table needs the hand-maintained RLS list of Rule 1), the S3 object bytes (the sweep governs the
record, as its header has always said), and an `.env.example` entry for the two variables (`.env.example` was
touched by another lane at 02:48 UTC 09-26 and is inside its window).

## Evidence

- `red/route-and-schedule-before-fix.txt` — no legal-hold route (the test cannot import it); no scheduler
  (`startRetentionSchedule is not a function`).
- `red/sweep-before-fix.txt` — the rewritten sweep test run against a copy of the committed sweep: no transaction
  opened, no chained row, the drizzle delete path.
- `green/after-fix.txt` — 44/44 across `retentionCron.legal-hold.test.ts` (holds; the transactional disposition,
  its rollback on an unwritable audit row, the refusal to delete unaudited), `retentionCron.schedule.test.ts`,
  `vault-legal-holds.test.ts` and `vault-ingest-storage.test.ts` (the retention clock at admission).
- Gates: ESLint ratchet −2 (the sweep's console lines went); `ci:audit-route-mounts:no-regression` +0;
  `ci:discarded-audit-write` no new; `ci:regulated-delete-audit` OK; `check:security-patterns` 0.
