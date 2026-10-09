# P0-7 — revoking a signature was refused by the trigger it must pass through (DP-03, High)

**Row:** D5. **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-03. **Plan item:** P0-7.
**Reproduction at the audited commit:** `docs/evidence/D6/2026-09-24-security-audit/repro/DP-03-DP-04-postgres16-transcript.txt` §4–5.

## What was wrong

`persistGovernedSignatureRevocation` (`server/services/part11/signature-persistence.ts:867-875`) marks the
superseded row with `superseded_by` and the verification column group (`is_valid = false`,
`verification_status = 'revoked'`, `verification_date`), as its own header says it must, so a superseded signature is
never misread as one whose signing factors failed (`server/services/ectd/sequence-release-signature.ts:132-153` reads
all three). The §11.70 trigger installed by `db/migrations/20260730_esign_audit_db_level_immutability.sql` (C2C set
index 54) permitted only `superseded_by` and `updated_at` to change, so every revocation raised
`IMMUTABILITY_VIOLATION`. Two files written two months apart, each internally consistent, disagreeing.

## What is true now

The trigger migration is amended in place (Rule 1: it re-runs on every deploy, so the fix lives in the file, with a
dated header note). The rule: the verification column group may change only in the same statement that performs the
write-once supersession (`superseded_by` NULL → id), and only to the invalid, revoked state (`is_valid` never becomes
true; `verification_status` may only become `revoked`; a `revoked` row is never valid); the attested columns stay
byte-identical in every UPDATE; outside a supersession only `updated_at` may differ; a superseded row can never be
modified again; DELETE stays refused. `docs/compliance/part11-immutability-record-class-policy.md` states the same.
No application code changed.

| | File | Result |
|---|---|---|
| red | `red/trigger-contract-before-amendment.txt` | PGlite, HEAD `dac69d76`: the revocation statement (read from `signature-persistence.ts` at test time) raises `IMMUTABILITY_VIOLATION`; 3 of 6 cases fail |
| green | `green/trigger-contract-after-amendment.txt` | 6 of 6: the revocation succeeds; a superseded row is untouchable; the verification group cannot change outside a supersession; validity cannot be restored; a status other than `revoked` is refused; an attested column is refused even inside the supersession; a pointer-only supersession still passes; DELETE refused |
| green | `green/postgres16-revocation-after-amendment.txt` | PostgreSQL 16.13: the amended function re-applied with `CREATE OR REPLACE` (as a deploy does); the statement that failed in Phase A returns `UPDATE 1` with `is_valid f, verification_status revoked`; the three refusals still raise |

Test: `server/services/part11/__tests__/signature-revocation-trigger.pglite.integration.test.ts`. Gates:
`ci:migration-drop-safety`, `ci:migration-set-order`, `db:sync-manifest:check`, `ci:runtime-ddl`,
`ci:migration-prefix-collisions` all OK (the manifest tracks order and count, not content).

## Not done here

- A database-backed test of `persistGovernedSignatureRevocation` itself end to end (it needs the governed-action
  chain); the contract above pins the exact statement it issues, read from its source.
