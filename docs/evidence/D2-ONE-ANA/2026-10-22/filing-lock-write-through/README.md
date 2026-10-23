# A locked or submitted filing is not changed by the editor (D2 / D5, 2026-10-22)

Lane: `…session_01T2wooCZu46W7msw4TJuuzr`, board row "D2 / D5 — the editor write-through honours a locked filing". Found by a read-only check of six candidate filing-path defects. Each investigator was told to refute its candidate as hard as it confirmed it, and a judge ranked the real ones.

## What already exists

- **The lock.** `POST /api/c2c/documents/:id/lock` (`server/routes/c2c/documents.ts`) is a governed ceremony: the signer is re-verified, separation of duties applies, and a ledger row is written. It sets `c2c_documents.status = 'locked'` and `locked_at`. `POST /:id/submit` sets `'submitted'`. Neither touches the sections or the authoring copy.
- **The filing PATCH** (`PATCH /api/c2c/documents/:id/sections/:key`) refused a locked or submitted document with 409: "its sections must not be edited in place". It read the status on the pool, before its transaction.
- **The one writer of filed text** is `commitSectionToFiling` (`server/services/c2c/commit-section-to-filing.ts`), since `981c27b3a7`. It runs for the editor's save, revert and AnA-draft accept. It refused only a *section* whose own status is `locked`, and nothing sets one. It never read the document's status.
- **The approval signature's section move**, `approveBoundFilingSections` (`server/routes/authoring.router.ts`), never read it either.
- **The editor's own seal** (`server/services/authoring/document-lock.ts`) reads `authoring_documents`, not the filing. `checkFilingWritable` runs the other way, from the filing PATCH to the authoring seal.
- **No database trigger refuses either write.** The section version trigger records a change to a locked filing as an ordinary attributed edit.
- **No helper read a filing's lock state.** The searches covered `'locked' ||`, `=== 'submitted'`, `DOCUMENT_LOCKED`, `FILING_LOCKED` and `locked_at IS NOT NULL` over `server/`.
- **Reach at head.** No client surface calls `/lock` or `/submit`, and no AnA tool does. `/api/c2c/documents` is admitted by the launch-scope API gate under the authoring surface, so any signed-in session can lock by API and then keep editing.

## What changed

- **`server/services/c2c/filing-lock.ts` (new).** `readFilingLock(client, documentId, orgId)` reads `status, locked_at` on the caller's transaction and returns `locked` or `submitted` with its words, or null.
  - It reads `FOR NO KEY UPDATE`. The lock route's UPDATE takes the same row lock, so a lock cannot commit between this check and the write.
  - That is also the lock the readiness trigger takes on this row later in the same transaction. Two saves to one filing therefore queue, where `FOR SHARE` followed by each trigger's UPDATE would deadlock.
- **`commitSectionToFiling` refuses** with `DocumentWriteReservationError(403, FILING_LOCKED | FILING_SUBMITTED)`. Its callers already answer that error with its own status, code and sentence, as they do for the editor's seal (`DOCUMENT_FROZEN`). The throw aborts the whole save: the filed text, the editing copy, the revision and the audit row move together or not at all.
  - **403, not 409.** The editor reads every 409 as "changed by someone else while you were editing", which would be untrue here. On 403 it shows the server's sentence and "Nothing was persisted."
  - **Refused whole, not filed around.** A section-level `locked` row keeps its existing behaviour: a 200 that says the filing was not written. No production path sets one. A document lock is a signed ceremony declaring the record fixed. Text saved to its editing copy afterwards could never be filed, and the next signature would be refused as diverged.
- **`approveBoundFilingSections` moves nothing in a locked or submitted filing.** The signature still stands on the editing copy. The reply's `filingApproval` lists the sections as `notApproved`, with a `reason`.
- **The filing PATCH converges onto the same helper**, read on its transaction instead of on the pool before it. It keeps its 409 `DOCUMENT_LOCKED` / `DOCUMENT_SUBMITTED` and now says why.
- **Fixed beside it.** The PATCH's seal refusal released its connection and then `finally` released it again. `pg-pool` throws on a second release ("Release called on client which has already been released to the pool"), and the PGlite harness's release is a no-op, so no test could see it. The test now counts releases per connection.
- **A narrow test fixture gains two columns.** `authoringDraftTerminationAccept.pglite.test.ts` builds its own `c2c_documents` before it applies the migration. It now adds `status` and `locked_at` as `20260528` defines them, beside the columns it already adds. On the deploy path both always exist.
- **`server/services/c2c/__tests__/_filing-write-harness.ts` (new).** The F1 suite's PGlite harness (the real routers on the real migrations) is extracted so the new suite does not copy it. `node-status-follows-work.pglite.test.ts` imports it, 18/18 as before. It is 485 lines now, under the limit it was at.

## Red, then green

| | File | Result |
|---|---|---|
| Red at `4eacf0fd27` | `red.txt` | 5 of 6. A save into a locked, submitted or `locked_at` filing answers 200 with `filing.committed: true`. The approval moves `2.5` to approved. The PATCH lacks the sentence |
| Green | `green.txt` | 7/7 and the F1 suite 18/18. Every filing-store, filing-route and authoring-route suite: 178 files, 2107 tests, green once the narrow fixture had its columns. Every suite on the canvas fixture: 43 files |
| Mutations | `mutations.txt` | 8/8 red. The row-lock mode cannot be shown on single-connection PGlite, and the file says so |

## Not done

- **A database-level guard** (a trigger refusing section writes in a locked document) is not added. Every writer now reads one rule. A trigger would be a migration under Rule 1 and its own change.
- **No Lock button.** The lock stays API-only, as at head. This change makes it hold when someone wires one.
