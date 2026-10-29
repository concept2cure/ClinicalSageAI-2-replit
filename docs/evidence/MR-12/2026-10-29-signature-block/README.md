# The register shows who signed each in-force version, when and as what

Row: D2 (W1), workstream MR-12 (QMS controlled documents), Stage 5 step 4. The step closes the
signature-manifestation point of P11-03 (21 CFR 11.50: the printed name, the date and time, and the meaning, with the
record).

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Exact approval reader | `readCurrentQmsReleaseApproval`, `server/services/qms/current-release-approval.ts` | Finds the one signature row that approved a release, checks it hashes to its manifest, and says valid, withdrawn, changed, unverified or unavailable. Training and periodic review use it. | It returned no name, time or meaning, and it read one document per query. |
| In force | `readInForceReleases`, `server/services/qms/in-force-release.ts`; `schedule.inForce` in the register route | Gives the version in force for each row, including a predecessor during a revision. | — |
| Compliance report | `queries/controlled-documents.ts` | Shows the standing approval and retirement signatures in a report. | It is not the register: an inspector has to open a report. |
| Register | `GET /api/mdx/qms/documents` and `/:id` (`server/routes/mdx-qms.ts`); `SopRegister.tsx` | Lists the documents, with status, effective date and review route. | It showed no signature. The approval toast (`qmsApproval.ts`) appears once, and is not the record. |
| Meaning words | `signatureMeaningLabel`, `client/src/concept2cure/_shared/signatureMeaning.ts` | Renders `APPROVED` as "Approval". | Had no word for retirement. |

Searches run:
- `signer_name`, `signature_meaning` and `LATERAL` in `server/routes/mdx-qms.ts`;
- `readCurrentQmsReleaseApproval` and `signedContent` across `server/`;
- `SignatureLine` and `GovernedTimestamp` in `client/src/concept2cure/`.

## What changed

- **One judge, two reads.**
  - The single reader's verdict moves into `judgeApproval`. The verdict now also carries the exact row's manifestation
    (`signer: {signerName, signedAt, meaning}`).
  - `readQmsReleaseApprovals` reads every release in force in one query and judges each with the same function. It keeps
    each document's rows to its own target.
  - A failed read is `unavailable` on every release.
- **Retirement.** `readQmsRetirementSignatures` returns each retired document's newest standing retirement signature:
  signed, withdrawn, unsigned (a retirement recorded before retirement was signed), or unavailable.
- **The register.**
  - `readRegisterSignatures` (`server/services/qms/register-signatures.ts`) gives each row `approval_signature`, for the
    version in force including a predecessor under revision, and `retirement_signature`.
  - The list route and `GET /:id` both carry these, so the exact-object reader shows the same block.
- **The client.**
  - `RegisterSignatureLine` sits under each row's title. It shows "v1.0 · Approved by Dana Whitfield · 2026-09-01
    14:02:09 UTC · Meaning: Approval", or "Retired by …".
  - A changed or withdrawn approval is never worded as standing.
  - An unread one says it could not be read, never unsigned.
  - The Stage 8 controlled copy remains the printable record; no second renderer was built.

## Proof

- **`server/services/qms/__tests__/register-signatures.test.ts`.** Each case builds a signature row hashed to its
  manifest.
  - The batched verdict equals the single reader's, with name, time and meaning.
  - Changed content reads `changed`, and a revoked signature reads `withdrawn`.
  - No exact row reads `unverified`, and a failing read is `unavailable` on every release.
  - A retirement reads signed, unsigned or unavailable.
- **`client/src/concept2cure/quality/__tests__/SopRegisterApproval.test.tsx`**, describe "the signature block".
  - The row shows the printed name, the UTC time and the meaning.
  - A changed, withdrawn or unread approval is never shown as "Approved by".
  - A retired document shows its retirement, or says that none is on record.
- **Mutations.**
  - Dropping the per-document filter in the batched read fails two server cases.
  - Wording a changed approval "Approved by" fails the client case.
  - Each was reverted.
- `tsc --noEmit` reports no error.
