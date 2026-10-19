# The P-23 void lands on the signature row (row D5, 2026-10-15)

**Found by** the revocation-by-intent change (`docs/evidence/D5/2026-10-15-revocation-by-intent/`, "Found, not fixed").

**The defect.** P-23 takes a signature out of force when the governed act it was given for is refused (`voidSignatureForRefusedAct`: `is_valid = false`, `verification_status = 'voided'`, `verification_date`, no successor). The deployed immutability trigger (`db/migrations/20260730_esign_audit_db_level_immutability.sql`) permitted only the supersession transition, so it refused that statement with `IMMUTABILITY_VIOLATION`. `voidRefusedStepSignature` caught the refusal and wrote `GOVERNED_SIGNATURE_VOIDED` on the audit chain alone. Gate 1 refused the signature, because it reads the chain. But the row kept reading `is_valid = true`. Every reader of the row (`isSignatureWithdrawn`: the revocation candidates, the Shadow Review waiver's state, a finding closure's standing) saw a live signature for an act that never happened.

**The fix.** The trigger is amended in place (CLAUDE.md Rule 1: the file re-runs on every deploy, so the change goes in the file, not in an appended migration). The amendment is documented in its header. It permits one more write-once transition:
- **The void.** `superseded_by` stays NULL. The verification column group may move once, to `is_valid = false` and `'voided'`. The attested columns stay byte-identical.
- **After a void,** the row can never be modified again: not re-validated, not superseded, not touched.
- **`'revoked'`** still happens only with a supersession.

**Proof** (`server/services/part11/__tests__/signature-revocation-trigger.pglite.integration.test.ts`; the void statement is taken from `signature-persistence.ts` source, so the test cannot drift from it):
- `red.txt`: before the amendment, the void statement is refused, as production refused it. Two cases fail.
- `green.txt`:
  - the trigger suite passes 9/9;
  - the other suites pinning this file (`esig-audit-immutability`, `esignature-verify-roundtrip`, the middleware guards) pass;
  - every suite touching a void or this trigger, plus `server/services/part11`, passes: 21 files, 230 tests.
- `mutations.txt`: each guard is removed alone, the suite fails its case, and the file is restored byte-identical.
  - V1: the voided-row freeze.
  - V2: attested columns unchanged in a void.
  - V3: a voided row is never valid.

**Not done here.** Rows voided before this deploy only on the chain still read `is_valid = true`. Each has a `GOVERNED_SIGNATURE_VOIDED` audit row naming its `signatureActionId`, so a one-time reconciliation can find them; Gate 1 already refuses them. A backfill is a data change through a migration file (Rule 1, seed corollary) and is left for a separate, reviewed change.
