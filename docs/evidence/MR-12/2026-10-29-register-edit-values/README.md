# A register edit records what it changed, from and to, on the edit's transaction

Row: D2 (W1), workstream MR-12, Stage 5 step 5 and its acceptance (c). This is the last open step of Stage 5, which
closes P11-03 with `cd95dc9e6` (the retirement meaning) and `5b7a6a79c` (the signature block).

## What already exists

| Piece | Path | What it does |
|---|---|---|
| Create | `createControlledQmsDocument`, `server/services/qms/controlled-document-service.ts` | Writes the register row and its ledger row (`recordGovernedAction`, `kind: 'create'`) on one transaction. Stage 2 and the canonical-content work moved it there, so the work order's "move the create's audit into the transaction" is already done. |
| PATCH | `PATCH /api/mdx/qms/documents/:id` → `updateControlledQmsDocument` | Locks the row and writes the UPDATE and the ledger row on one transaction, so the audit is already in it. Its payload named the changed fields (`changedFields`) but not their values. |

Searches run: `recordGovernedAction`, `changedFields` and `auditTrail` in `server/services/qms/` and
`server/routes/mdx-qms.ts`.

## What changed

- `registerChanges(before, after)` returns, for each register field the edit changed (title, number, type, category,
  next review date and status), `{from, to}`, read from the locked row and from the row the UPDATE returned.
- The PATCH's ledger payload carries it as `changes` beside `changedFields`. So the audit row says what the field
  was and what it became, not only which field it was.

## Proof

- **`server/services/qms/__tests__/controlled-document-lifecycle.pglite.test.ts`.**
  - "records an edit with what it changed from and to, and a failed ledger write leaves the document unchanged":
    - with the ledger write failing, the edit is refused and `next_review_date` is still null;
    - then the edit records `changes: {nextReviewDate: {from: null, to: '2027-10-29'}}`, and nothing else.
  - Sending for review records `changes: {status: {from: 'draft', to: 'in_review'}}`.
- **Mutation:** removing `changes` from the payload fails both cases. Restoring it makes them pass.
