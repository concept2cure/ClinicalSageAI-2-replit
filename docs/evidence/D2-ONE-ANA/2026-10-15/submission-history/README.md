# A sequence's history in the Builder: who created the submission, who placed what, when and why

Launch row **D2**. This was open item 3 of `.design/filing-spine/DESIGN_REVIEW.md`. Two things were recorded and never shown:
- who created a submission (`SUBMISSION_CREATED`);
- every placement in a sequence (`LEAF_CREATED`, `LEAF_UPDATED`, `LEAF_REMOVED`, each with the person's stated reason).

## What changed

**One reader, one query, more than one record kind** (`server/routes/audit-trail-ledger.routes.ts`).
- `readRecordAuditHistory` is the ledger's per-record reader, the one the Vault's document history uses.
- It takes `also`: further record kinds read into the same history. Their keys are matched as `(table_name, record_id)` pairs in the one SQL, so ordering and the window stay the ledger's.
- No second audit SQL and no client-side merge. Existing callers pass no `also` and read as before.

**The sequence's history** (`server/services/submission-service/submission-history-read.ts`, `GET /api/submissions/sequences/:seqId/history`).
- The read is admitted as the leaves read is (`readSubmissionSequenceForRequest`) and re-checked before it returns.
- It reads the submission's own rows and every leaf of the sequence, removed leaves included (a removal is a soft delete).
- Each leaf entry names the section its leaf was placed at, taken from the leaf record, never from the audit payload.
- It returns the Vault's shape: `{ entries, chain, truncated }`.

**One view** (`client/src/concept2cure/v2/RecordHistory.tsx`).
- The Vault's `DocumentHistory` moved there unchanged: the chain verdict, the "could not be read" alert, the window note and the reason line. The Vault and the Builder both render it.
- Deletion check (CLAUDE.md working agreement): nothing user-facing was removed. `Vault.tsx` `DocumentHistory` now renders `RecordHistory`, and the Vault's 278 tests pass unchanged, `vaultDocumentHistory.test.tsx` among them.
- The Builder shows it under the placement form and re-reads it after each placement or removal.

## Red, then green

| File | Before the change |
|---|---|
| `red/ledger-across-kinds-red.txt` | 1 of 1 fails on pglite. The old reader returned only the submission's row, not its leaf's. |
| `red/builder-history-red.txt` | 2 of 2 fail. The Builder had no history, neither for a read that answered nor for one that failed. |

`server/services/submission-service/__tests__/submission-history-read.test.ts` is new, with the reader. It holds four things: the read asks for the right records, removed leaves included; it names the section and the reason; it says when the history was cut; it returns nothing when access changed mid-read.

In `green/`:
- `vitest.txt`: the three suites.
- `wide-summary.txt`: the Submission Center, Vault, filing path, Project home, ledger, audit and submission-service suites. 1,883 tests pass; the 5 failures are in `vault-file-upload-to-vault.test.ts`, red on trunk `1a34f8716` without this change.
- `npm run typecheck`: 0 errors. Copy, design and scope gates: 15 green. No lint count changed; the new files lint clean.

`server/routes/c2c/__tests__/vault-document-history-route.test.ts` fails 3 of 4 on trunk `1a34f8716` with and without this change. That is another lane's; it mocks this reader.

Both of those trunk failures were cleared by `29123a725` ("Trunk green, Vault routes"), merged before this was pushed. At `e73c9272f` the two suites pass, 11 of 11.
