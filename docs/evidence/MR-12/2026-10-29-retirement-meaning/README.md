# P-51: a retirement is signed as a retirement

Row: D2 (W1), workstream MR-12 (QMS controlled documents), Stage 5 step 3. Decision P-51
(`docs/LAUNCH_DEFINITION_OF_DONE.md`) says:

> "Retirement is signed with its own meaning, `retirement` ("you withdraw this document from use"), not
> `approval`. Stored retirements keep the meaning they were signed with."

This change closes the retirement-meaning point of P11-03. The signature block and the PATCH audit are Stage 5's other
steps and are not part of this change.

## What already exists

| Piece | Path | What it did before this change | What it did not do |
|---|---|---|---|
| Retire route | `POST /api/mdx/qms/documents/:id/retire`, `server/routes/mdx-qms.ts` | Signed retirement through the full ceremony: authority, password, the bound digest, the ledger pair and one `electronic_signatures` row of type `qms-document-retirement`. | Its body was `approveBody.omit(...)`, so it accepted only `'APPROVED'`. A withdrawal was recorded as an approval. |
| Retire signer | `retireQmsDocumentSigned`, `server/services/qms/document-approval-signature.ts` | Stored whatever meaning the route passed, on the document, the ledger and the signature. | Its type allowed any string. |
| Vocabulary | `GOVERNED_SIGN_MEANINGS`, `server/services/part11/signature-meanings.ts` | The closed set the shared signature writer admits. | It had no word for a withdrawal. |
| Sign dialog | `EsignModal` and `ESIGN_MEANINGS` (`client/src/concept2cure/_shared/`); retire dialog in `SopRegister.tsx` | Offered `approval` for retirement, and `postQmsApproval` posted `'APPROVED'` for every kind. | — |
| Labeling supersession | `SUPERSEDE_ACT_MEANINGS`, `server/routes/mdx-labeling-approvals.ts` | Declared itself "the meaning a QMS retirement is signed with", which was `'APPROVED'`. It has no client caller. | — |
| Readers | `queries/controlled-documents.ts` and the ledger labels | Find a retirement by `signature_type`, not by meaning. | Unaffected. |

Searches run:
- `retire` and `retirement` in `server/routes/`, `server/services/qms/` and `client/src/concept2cure/quality/`;
- `QMS_DOCUMENT_APPROVAL_MEANING`, `TASK_SIGNATURE_MEANINGS`, `GOVERNED_SIGN_MEANINGS` and `ESIGN_MEANINGS` across the
  repository;
- `qms-document-retirement`, to find every reader.

## What changed

- **Server vocabulary.** `GOVERNED_SIGN_MEANINGS` gains `retirement`.
  - It is not added to `TASK_SIGNATURE_MEANINGS`, as the work order suggested. That list is also the task board's, and a
    task checkpoint is never a retirement.
  - The stored value is the decision's word, `retirement`. An approval still stores `APPROVED`.
- **Signer and route.**
  - `QMS_DOCUMENT_RETIREMENT_MEANING` is exported from `document-approval-signature.ts`, and
    `RetireQmsDocumentSignedParams.meaning` is typed to it.
  - `retireBody` accepts that literal and nothing else. The missing-component message names the meaning the act
    requires.
- **Labeling supersession** follows, because it defines itself as the QMS retirement's meaning. It now accepts
  `retirement` only.
- **Client.**
  - `ACT_ESIGN_MEANINGS` holds `retirement`. A dialog offers it only when it names it in `meanings`, so the default five,
    and the Pathway picker that lists `ESIGN_MEANINGS`, do not offer it.
  - The retire dialog offers `retirement` only.
  - `postQmsApproval` posts and returns the meaning for each target kind.
- **Stored retirements** signed `'APPROVED'` are not rewritten.

## Proof

Focused test: `server/routes/__tests__/mdx-qms-retire.test.ts`.
- `APPROVED`, `approval` and `REVIEWED` are each refused with 400 on retire.
- In each case nothing is verified and nothing is written.
- A valid retirement stores `retirement` on the ledger payload, on the signature payload and on the returned signature.

Mutation: restoring `retireBody = approveBody.omit({ effectiveDate: true }).extend({ reason: governedReason })` made the
three refusal cases fail, along with five ceremony cases that post the new meaning. Reverting it made them pass again.

Adjacent tests updated and passing:
- `server/services/part11/__tests__/governed-sign-meaning.test.ts` (the vocabulary);
- `client/src/concept2cure/quality/__tests__/SopRegisterApproval.test.tsx` (the dialog offers `retirement`, and the post
  carries it);
- `server/routes/__tests__/qms-legacy-api-retired.test.ts`;
- `server/__tests__/routes/mdx-labeling-approval-controls.pglite.test.ts`.
