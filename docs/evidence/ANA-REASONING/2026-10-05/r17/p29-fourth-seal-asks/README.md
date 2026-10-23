# The fourth seal now asks whether the filing holds this text

P-29.2, increment 2. `docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`.

## The door

`approveQmsDocumentSigned` writes its signature row and its chained ledger
pair, then stamps the bound editing copy:

    UPDATE authoring_documents SET status = 'APPROVED', approved_at = NOW(),
           updated_at = NOW() WHERE id = $1 AND tenant_id = $2

APPROVED is a sealing status (`LOCKED_DOCUMENT_STATUSES`), so after this the
text is sealed for filing and a §11.50 signature attests to it — with no
cross-store agreement check anywhere in the call.

**This is the one P-29 did not find.** It was not in the decision's exit list
and not in any dimension of the review behind it. `ci:filing-exit-agreement`
found it on its own first run, which is the argument for writing a discovering
gate rather than maintaining a list — the same lesson
`check-lineage-save-gate.mjs` learned the hard way (ledger L157/L158).

It is narrow: a QMS controlled document is usually an internal procedure with
no bound filing, and then `filingAgreesWithEditing` answers "not bound to a
filing" and the check costs one query. But nothing refuses a QMS document from
being bound to one, so the door is real, and a gate's job is to refuse a door
that merely happens to be unused today.

## The fix

`refuseIfFilingDiverged` is called immediately after the content is captured
and authorized, **before any write**, and refuses on the `different` subset
only — exactly as `filingBlocksSeal` in `authoring.router.ts` decides it.
`empty` is a section the filing has no row for, which the authoring seal
reports and seals anyway; a second answer to the same question here would be
the divergence the D2 consolidation removed.

The refusal names the contributing section, not only the filing node: for an
assembled node the key is `2.5` and no authoring section carries that code, so
a refusal naming only the key sends the approver looking for a section that
does not exist. Same rule and same reason as the authoring refusal.

`QmsApprovalRefusalCode` gains `FILING_DIVERGED`, and `mdx-qms.ts` maps it to
409 with its own code rather than falling through to `QMS_INVALID_STATE` — the
remedy is to re-file the section, not to change the document's state.

The baseline entry for this file is **removed**, not set to 0: the gate fails
on an entry that allows more than exists, including an entry at zero. It now
reports 5 sites in 2 files, down from 6 in 3.

## The red

With the check absent, the diverged case **resolved instead of rejecting** —
the approval sealed the document and signed it while the filed copy held
different text:

    asks the question ...                     → expected vi.fn() to be called at least once
    refuses when the filed copy differs ...   → promise resolved "{ document: { id: 2, … } }" instead of rejecting
    names the section the approver can open   → expected 'undefined' to contain '2.5.1'

Tally: `3 failed | 2 passed (5)`. The two that passed are the controls — an
unbound document and an unfiled section both approve, and must keep approving.

## Verification

Six mutants, all killed (`mutants.txt`):

| Mutant | Killed by |
|---|---|
| P1 the check removed | 3 failed |
| P2 refuses on `empty` instead of `different` | 3 failed |
| P3 refuses on every divergence, unfiled included | the unfiled control |
| P4 names only the filing node | the section-naming case |
| P5 the check runs after the signature is written | the in-transaction read |
| P6 the check asked about the wrong document | the diverged case |

**P5 is the one worth reading.** It survived the first two rounds. Moving the
check to just after `applyApproval` still precedes
`persistGovernedActionSignature`, so a spy on the signature did not catch it,
and the caller's rollback made every after-the-fact assertion pass — the
register row, the authoring status and the signed-version count all read clean
once the transaction was rolled back. `QmsApprovalRefusedError`'s own contract
says "Nothing has been written when thrown", and nothing held it to that.

The kill is a read **inside the still-open transaction**, before the rollback:
`applyApproval` stamps the register row, so that row's status is what tells a
check-before-write from a check-after-write. With the correct order it is still
`in_review`.

## Harness note

`filingAgreesWithEditing` is stubbed, so these cases drive the SEAM — does this
door ask the question, and does it refuse on the answer. Whether the question
is answered correctly is the business of the 54 cases in
`tests/schema-contract/authoring-section-commits-to-filing.contract.test.ts`,
which run it against a real filing store. Duplicating those here would test
that twice and this not at all.

One harness gap was hit and fixed rather than worked around: the first run
refused every case with "This document is a draft. Send it for review first."
The fixture now routes through the real `updateControlledQmsDocument`
send-for-review transition, because a fixture that wrote `in_review` directly
would approve a document that never passed the gate in front of it.

## Hot-file disclosure

`server/services/qms/document-approval-signature.ts` and
`server/routes/mdx-qms.ts` both carry commit `e1f3fd425` (2026-10-17 16:02
-0700), inside this session's 24-hour hold on another lane's work. The hold
permits additive edits at lines blamed older than 24 hours. Every edit here
satisfies that, checked line by line with `git blame`:

- `QmsApprovalRefusalCode` (line 166) — MODIFIED; blamed `f6e9ff3991`,
  2026-10-14, outside the window.
- the import (line 76) and the agreement call (line 334) — the blamed lines of
  `e1f3fd425` are left byte-identical; a new line is inserted after each.
- `refuseIfFilingDiverged` — a new function, inserted before line 176 (blamed
  2026-09-22).
- `mdx-qms.ts` line 597 — blamed `f6e9ff3991`, 2026-10-14; a new line inserted
  after it.

## Still open, and the ordering that must hold

The two remaining baselined files are the device/IVD exits
(`510k-estar-routes.ts`, `assemble-device-submission.ts`). They stay baselined
deliberately: the seeded `fda_510k_se` template's section codes collide with
the shipped eSTAR outline's keys under different labels, so an agreement gate
there would today certify a MIS-FILED package — after a mis-keyed write the two
stores agree. The vocabulary fix (#38) lands first; then those entries drop to
0.
