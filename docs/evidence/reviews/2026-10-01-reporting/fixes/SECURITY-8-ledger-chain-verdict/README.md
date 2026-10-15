# SECURITY-8: the ledger and record history state the redacted, honest chain verdict

Review: `../../security.md`, SECURITY-8. Its provisional number there (DP-60) collides with the
register's DP-60, which is a different finding.

## The finding

`GET /api/audit-trail/ledger` and a Vault document's history returned the chain verifier's raw
break.
- The walk loads other organisations' legacy rows as context, so the break could name another
  organisation's row: its id, its organisation number, and its stored and expected hashes.
- An organisation with no chained rows was told `ok: true`.

The exports and compliance reports already redacted the break (DP-44) and said "not verified" over
no rows (DP-45). These two readers did neither.

## What changed

- **`services/audit/audited-export.ts` `tenantChainVerdict`** is the one statement of a tenant's
  chain verdict. It redacts the break to the organisation's own rows (`breakForTenant`), and over no
  chained rows it answers `ok: null` with a reason.
  - `walkTenantChain`, which serves the exports and reports, uses it.
  - So do `readAuditLedger` and `readRecordAuditHistory` (`routes/audit-trail-ledger.routes.ts`).
- **The three surfaces that render the verdict** now show "not verified, because…" as its own state:
  - **Vault document history.** A break was typed as a string but arrived as an object, so it
    rendered "at [object Object]". It now names the entry, or says it belongs to another organisation.
  - **Part 11 console.** It read `ok: null` as a failed read. It now reads it as nothing to verify.
  - **Audit trail.** A break with no id printed "entry unknown (unknown segment, content does not
    derive from any predecessor)". An own-row `commitsTo` object printed "derives from nothing". Both
    now read correctly.

## Shown failing first

- `red-server-cases-on-previous-readers.txt`: all 6 new server cases fail against the previous
  readers. They are in `audit-trail-ledger.routes.test.ts`: both readers, a foreign break, an own
  break, and no rows.
- `red-client-cases-on-previous-surfaces.txt`: all 7 new client cases fail against the previous
  surfaces. They are in `vaultDocumentHistory`, `part11ConsoleHonesty` and the new
  `auditTrailChainVerdict`.
