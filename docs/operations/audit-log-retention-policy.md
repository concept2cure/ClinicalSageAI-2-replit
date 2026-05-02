# Audit-log retention policy

**Status:** Draft for compliance review. **Owner:** Backend stream + RA.
**Last revised:** 2026-05-01.

## Why this exists

21 CFR Part 11 §11.10(c) requires that records be "retained for the
period required by the predicate rule" and that the audit trail be
preserved for at least as long as the underlying record is retained. ICH
E6(R3) GCP §4.9.5 requires audit records be available "throughout the
retention period required for the trial records" — typically the longer
of (a) two years after marketing approval is granted or denied or (b)
two years after the formal discontinuation of clinical investigation.

This document defines retention for the two audit surfaces shipped in
the BETA backend:

1. **`audit_logs`** — central queryable Drizzle table written by
   `auditService.logAction`.
2. **Tamper-proof hash-chain log** — append-only chain written by
   `TamperProofAuditLog`, used for integrity attestation.

It also defines retention for the rich per-domain audit tables
(`authoring_audit_trail`, `cerv2_section_versions`,
`electronic_signatures`, `auth_audit_log`).

## Retention schedule

| Surface                                | Retention                                                          | Disposition at end of retention                  |
|----------------------------------------|--------------------------------------------------------------------|--------------------------------------------------|
| `audit_logs` (central queryable)       | **10 years** from the end of the calendar year the row was written | Cold-storage archive (S3 Glacier Deep Archive); never deleted while the underlying program is active |
| `tamper_proof_audit_log` (hash chain)  | **10 years** from row write                                        | Same — cold storage. Hash-chain head pinned indefinitely. |
| `authoring_audit_trail`                | 10 years                                                           | Cold-storage archive |
| `cerv2_section_versions`               | 10 years                                                           | Cold-storage archive |
| `electronic_signatures`                | **Indefinite** while the underlying signed record exists           | Bound to the lifetime of the signed artifact |
| `auth_audit_log`                       | 7 years                                                            | Cold-storage archive |

The 10-year baseline matches FDA's general inspection lookback window.
Programs that are active beyond 10 years (e.g. PMA renewals) keep their
audit trail in hot storage until the program is closed; the timer starts
on the closure date.

## Hot vs cold split

- **Hot (queryable via the BFF):** rows ≤ 24 months old.
- **Cold (S3 archive, restorable on request):** rows > 24 months old.

A nightly job (not yet implemented) moves rows older than 24 months out
of the live database into the archive. Retrieval from cold takes up to
12 hours per Glacier Deep Archive SLA. Restore requests are placed
through the support runbook.

## Database role policy

Tenant isolation only matters if the application role cannot quietly
delete or overwrite the trail. The application role used by the BFF
(`bff_app`) MUST have:

- `INSERT` on `audit_logs`, `tamper_proof_audit_log`,
  `authoring_audit_trail`, `cerv2_section_versions`, `auth_audit_log`,
  `electronic_signatures`.
- `SELECT` on those tables.
- **No** `UPDATE` or `DELETE` on any of them.

A separate role (`bff_archive`) used only by the nightly archive job has
`DELETE` rights on the hot tables. The archive job runs after a
successful copy to S3, gated by a CHECKSUM verification on the archived
batch.

A third role (`bff_dba`) reserved for human DBAs has full rights but
must only be used through an audited break-glass path (logged to a
separate immutable store).

### Verification SQL

The following query MUST return zero rows on any production-equivalent
database. If it returns rows, the role policy is broken:

```sql
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee IN ('bff_app')
  AND table_schema = 'public'
  AND table_name IN (
    'audit_logs',
    'tamper_proof_audit_log',
    'authoring_audit_trail',
    'cerv2_section_versions',
    'auth_audit_log',
    'electronic_signatures'
  )
  AND privilege_type IN ('UPDATE', 'DELETE');
```

This check is run as part of the BETA Installation Qualification (IQ) —
see `docs/beta/validation/IQ_TEMPLATE.md` §5.

## Hash-chain integrity check

`TamperProofAuditLog` writes a SHA-256 hash chain such that each row
includes the hash of the prior row. Tampering with any row breaks every
subsequent row's hash. Integrity is verified by:

1. Walk the chain from the genesis row.
2. For each row, recompute its hash from its content + the prior
   row's hash.
3. Compare against the stored hash.
4. Any mismatch is a P0 incident: stop the database from accepting new
   audit writes, page on-call, and trigger forensics.

A daily Cron job runs this verification end-to-end on the prior 24
hours. Weekly, it runs against the full chain. Both are tracked in the
operations dashboard.

## Backup + disaster recovery

- Daily Postgres logical backup with 35-day retention.
- The audit tables are included in every backup (no per-table exclusion).
- Glacier archive is written to a separate AWS account with a one-way
  IAM trust so a compromise of the production account cannot delete the
  archive.

## Customer-facing commitments

For BETA, the customer-facing data-processing agreement (DPA) commits to:

- Retention of the audit trail for the lifetime of the customer
  relationship plus 10 years.
- Customer-initiated export of their audit trail in machine-readable
  form on request.
- Right to a tamper-evidence attestation report on request.

## Open items

- [ ] Implement the nightly archive job (currently the hot table grows
      indefinitely on BETA tenants).
- [ ] Implement the daily hash-chain verification Cron and dashboard.
- [ ] Document customer-export endpoint (currently no UI surface).
- [ ] Write the IQ check that runs the role-grants SQL.
