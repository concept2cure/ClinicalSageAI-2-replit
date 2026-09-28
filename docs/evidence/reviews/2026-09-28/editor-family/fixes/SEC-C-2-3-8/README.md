# SEC-C-2, SEC-C-3, SEC-C-8: protocol writes prove the document, and signed content stays signed

**Findings:** periodic review 2026-09-28, editor family, security lens,
ProtocolDev. Each was confirmed by an independent verifier; see the review's
`verification.md`.
- **SEC-C-2 (blocker):** after a protocol was finalized and signed, its
  schedule of assessments could still gain rows and have cells set or cleared.
  No new version and no new signature were made, and the header still read
  "Finalized". The schedule is inside the §11.70 content binding (the
  protocol-document digest in `server/services/part11/signature-persistence.ts`),
  but its three writers never read the protocol's status. Every other writer of
  signed content already refused (`assertEditable`).
- **SEC-C-3 (high):** the budget-parameter upsert is keyed on the document id
  alone (`uq_protocol_budget_params_doc`), and the writer never proved the
  document belonged to the caller. So another tenant could claim the row
  before the owner wrote one, and then the owner's own writes were refused or
  overwritten, depending on whether RLS was enforcing.
- **SEC-C-8:** the same missing lookup on five more create paths: schedule
  assessment, budget line, risk, milestone, review assignment and review
  comment. Each wrote a row, and a governed ledger entry, against a document id
  it never looked up.

## The change

`requireProtocolForWriteTx` (`protocol-development-service.ts`) loads the
document for the caller's organisation, the same `loadDoc` every in-file
writer uses. For content the finalization signs, it also refuses a finalized or
superseded protocol. It is called:
- with `signedContent: true` by `addAssessmentTx`, `setCellTx` and
  `clearCellTx`. `clearCellTx` now resolves the document through the
  assessment first; before, it read nothing but the cell;
- with `signedContent: false` by `addBudgetItemTx`, `setBudgetParamsTx`,
  `addRiskTx`, `addMilestoneTx`, `assignReviewerTx` and `addCommentTx`. These
  are operational registers that continue after finalization, such as risks
  during conduct, so they are not locked.

The SoA router maps `INVALID_STATE` to 409. Before, it mapped only NOT_FOUND
and BAD_INPUT, so the refusal would have reached the author as a 500.

The AnA tools for these registers call the same service functions, so they get
the same refusals.

No migration changed. With the ownership check in place, one parameters row per
document id is correct, because a document id names one organisation's
document. So the unique index needs no re-keying.

## Shown failing first

`server/services/protocol-development/__tests__/protocol-write-scope.pglite.integration.test.ts`
runs against the real migrations in PGlite:
- a finalized protocol and a superseded protocol each refuse all three SoA
  writes, and the signed schedule is unchanged;
- a protocol in development takes all three;
- a foreign tenant cannot claim, block or overwrite the budget parameters, and
  the owner still can;
- each of the six create paths is refused against another tenant's protocol
  and against a protocol that does not exist, with nothing written;
- each is written against the caller's own protocol.

Results:
- `red-vitest.txt`: before the fix, 15 of 22 fail.
- `green-vitest.txt`: after the fix, 31 files and 565 tests pass across the
  protocol services, the protocol route tests (roles, signatures, study
  design), `tool-authorization` and the new route test.
- `mutants.txt`: eleven mutants, one per call site plus the status assertion
  itself, and each is caught.
- `server/routes/__tests__/protocol-soa-finalized.routes.test.ts`: all three
  SoA writes return 409 naming the state, roll back, and write no ledger entry.
  Without the 409 mapping, all three fail (500).

## Not done here

- **The client still offers "Add assessment" and the grid on a finalized
  protocol.** The server now refuses, and the tab shows the server's sentence
  ("The cell was not saved — Protocol is finalized; create a new version to
  edit. The schedule is unchanged."). Hiding the controls on signed content
  (SoA, sections, cover page, design) is a follow-on in
  `ProtocolDevWorkspace.tsx`.
- **The finalize snapshot holds sections only.** `protocol_versions.snapshot`
  cannot show what the schedule was when it was signed. The digest binds it,
  but no copy of it is kept. This is a follow-on.
- **The editability check holds no lock.** `loadDoc` does not lock the row for
  writers, and `finalizeProtocolTx` takes it `FOR UPDATE`. Whether a write that
  read "draft" can commit after a finalize that read the content is a question
  for every writer in the family, not just these. It is recorded for
  verification, not claimed.
