# The effective date is the one the approver signs: not inherited, not backdated, bound to the signature

Row: D2 (W1), workstream MR-12, Stage 3, the effective-date half (CAT2-19). 21 CFR 11.70 (signature to record linking)
and 21 CFR 820.40.

## The defect (CAT2-19 at head)

`applyApproval` set `effective_date = COALESCE($4::date, effective_date, $6::date)`:
- a revision approved without a date inherited the PRIOR version's effective date;
- a date could be supplied in the past;
- the date was outside everything the signature binds, so it could be changed in the database afterwards and the
  approval would still verify.

## What already exists

| Piece | Path | Note |
|---|---|---|
| Approval | `approveQmsDocumentSigned`, `server/services/qms/document-approval-signature.ts` | The one signed approval, used by the route (`POST /qms/documents/:id/approve`) and by the review route's completing approval (RR2/RR4). |
| Content digest | `computeQmsDocumentContentDigest` (basis `qms-document-version-content-sha256`) | Shared by review signatures, periodic reviews, training receipts and the controlled copy. Changing its recipe would split every one of them, so this change leaves it as it is. |
| Signature manifest | `persistGovernedActionSignature(... extraManifest)`; `manifestSignatureHash` | The signature hash covers the manifest. |
| Exact reader | `exactManifest` / `judgeApproval`, `server/services/qms/current-release-approval.ts` | Used by training, periodic review, the register's signature block and the controlled copy. |
| In force | `readInForceReleases`, `server/services/qms/in-force-release.ts` | — |

## What changed

- **`signedEffectiveDate`.** The date an approval signs is the one given, refused when it is earlier than the
  database's `CURRENT_DATE` (`EFFECTIVE_DATE_BACKDATED`, 422 `QMS_EFFECTIVE_DATE_BACKDATED`, nothing written), or else
  the approval's own UTC day. The UPDATE writes `effective_date = $4::date`: never the prior version's date.
- **Bound to the signature.** The date goes into the signature manifest (`extraManifest.effectiveDate`), which the
  signature hash covers, and into the ledger payload.
  - The exact reader refuses (`unverified`) a signature whose manifest date differs from the row's.
  - A signature from before this change carries no date and is read as it was.
- **Pending effective.** A version approved with a future date is not in force until that day (`isPendingEffective`).
  - Its signed predecessor stays in force. The versions read excludes the row's own version.
  - The register shows "v2.0 from <date> (pending)", and the predecessor as in force.
- **The approval dialog.** It states "Effective from (UTC day)", today by default and never earlier, and the approval
  posts it.

The artifact-content half of Stage 3 (CAT2-20, an artifact-backed legacy entry binding its artifact's bytes) is not
part of this change.

## Proof

- **`server/routes/__tests__/qms-document-approval-signature.test.ts`.**
  - With no date given, the UPDATE writes `$4` as today, and the manifest and ledger payload carry it.
  - A date of 2020-01-01 gets a 422 `QMS_EFFECTIVE_DATE_BACKDATED`, with no UPDATE, ledger row or signature.
- **`server/services/qms/__tests__/register-signatures.test.ts`**, "the effective date bound in the approval": a
  signature binding 2026-09-01 stands on the row that carries it, is `unverified` once the row's date is moved, and a
  pre-binding signature is read as before.
- **`server/services/qms/__tests__/in-force-pending-effective.test.ts`.**
  - A future date is pending.
  - Its predecessor v1.0 is in force, and the read excludes the pending version.
  - A pending first version has nothing in force.
- **Mutations:**
  - restoring the `COALESCE` carry-over fails the first route case;
  - removing the reader's date check fails the reader case;
  - both were reverted.
- **Test inputs updated:**
  - `training-controlled-text.pglite.integration.test.ts` signed a hard-coded past date (2026-10-14), which is now
    refused; it signs today;
  - `SopRegisterApproval.test.tsx` expects the date in the approve body.
- **Passing:** all 45 QMS and Quality test files (493 tests), and `tsc --noEmit` with no error.
