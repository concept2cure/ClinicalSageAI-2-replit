# Actual caller receipt-fixture convergence

Reviewed the revised canonical receipt contract and the real Vault/device-drawer caller controls after the overlapping canonical implementation was retained.

`client/src/concept2cure/v2/__tests__/vaultUploadReceiptFlow.test.tsx` keeps all five original controls and all assertions. Its mixed-batch unknown protocol receipt now names `protocol.pdf` in both `documentCode` and `fileName`, matching the selected second file. Its suggested-placement `needsReview` flag is now false, matching that placement's actual producer convention. The deliberate defect remains a suggested placement with no folder; this control now isolates that defect instead of also failing filename or review-flag binding.

The other Vault positives already supply the selected original filename, and the check-in retains its original document code while omitting a new code in the submitted form. The wrong-project and blank-assigned-version negatives remain intentionally invalid. Exact selected File, retained check-in offer, live unknown guidance, editable row, no false refresh/open, prior selection, saved identity and deliberate retry assertions are unchanged.

`client/src/concept2cure/mdx/surfaces/__tests__/DossierDrawer.uploadReceipt.test.tsx` already supplies `documentCode: fileName` for each of its two complete positive receipt fixtures, with unique filenames and the actual requested project. No change to that file was needed. Its missing-document negatives stay invalid; all three actual-hook/transport/store/activity controls are retained.

No production source, parser, transport, unchanged/repaired receipt semantics, or acceptance assertion was changed. No test or qualification command was run by this worker; the control tower owns the merged-state run and its results.
