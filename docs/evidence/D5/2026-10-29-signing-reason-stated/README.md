# D5: an Authoring signature says what it means (2026-10-29)

Session `…01E8btkB`. Found by the Part 11 reviewer in the CSR path review for
the LMN-201 / RePreve prospect.

## What already exists

Searched `reason`, `intent`, `requireGovernedReason`, `GOVERNED_REASON_MIN`,
`MIN_REASON` and `statedReason` in `server/routes`, `server/services/part11`,
`shared/` and the signing dialog.

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The reason rule | `server/routes/governed-reason.ts` `requireGovernedReason`, `shared/constants/governed-reason.ts` | Requires a trimmed reason of at least 8 characters; save, freeze and review verdict already use it | — |
| The signing dialog | `client/src/concept2cure/_shared/components/EsignModal.tsx` (`MIN_REASON = 8`) | Will not submit a reason under 8 characters | — |
| `POST /docs/:docId/e-sign` (`intent`) and `POST /docs/:docId/sign` (`reason`) | `server/routes/authoring.router.ts` | Store the signer's stated meaning with the signature (21 CFR 11.50(a)(3)) | Each checked only that the field was truthy. Spaces, a number or an object passed and were stored verbatim as the meaning of a legally binding signature |

Nothing was rebuilt. Both routes now apply the existing rule.

## What changed

- **Both routes.** They validate with `requireGovernedReason` and store the
  trimmed text. A missing or short meaning is refused with
  `SIGNATURE_REASON_REQUIRED`: "State what this signature means, in at least
  8 characters. Nothing was signed." The check sits where the old one did:
  after authority, before the credential.
- **Two existing tests.**
  - `authoring-signing-authority.test.ts` signed with "Approve" and "Review",
    7 and 6 characters, which the product's own dialog never sends.
  - `authoringApprovalNoWorkflow.test.ts` signed with "my turn". Under the
    new rule its "no approval" assertion would have passed for the wrong
    reason.

  Both now state a real meaning.

## Evidence: seen failing first

| Check | Red | Green |
|---|---|---|
| `server/routes/__tests__/authoring-signing-reason-stated.test.ts` (new) | `red.txt`: 12 of 14 fail at HEAD: missing, empty, spaces, seven characters, a number and an object, on both routes. The two controls (a stated meaning goes on to the next check) pass both ways | `green.txt`: 14/14 |
| Every suite that signs an Authoring document | — | `green.txt`: 16 of 18 files pass. The two that fail, the IND authoring journey and founder-path lineage, fail identically at HEAD and were handed on |
