# MR-12: a periodic review date chosen at create reaches review-due (2026-10-22)

Gap 5.1 of `docs/design/VEEVA_GAP_2026-10-22.md`, first in its order of work.
This is a fix to an existing path, not a new capability. Launch row **D2**
(QMS controlled documents in the launch catalog).

## What already exists

- **Server, create.** `server/services/qms/controlled-document-service.ts:23`
  accepts `nextReviewDate` (`z.string().date().nullable().optional()`), and
  `:98-101` writes it to `qms_documents.next_review_date`.
- **Server, draft edit.** The draft PATCH (`controlled-document-service.ts:136-167`)
  sets or clears it while the document is a draft or in review.
- **Review-due.** `GET /api/mdx/qms/documents/review-due` (`server/routes/mdx-qms.ts:448`)
  lists documents whose `next_review_date` falls within N days and flags the
  overdue ones. Readiness counts `review_overdue` from the same column (`mdx-qms.ts:231`).
- **Signed snapshot.** Approval writes the row as approved to
  `qms_document_versions` (`persistQmsSignedVersion`), and that snapshot keeps the date.
- **What did not exist.** No client or AnA path sent the field.
  AnA's `create_qms_document` (`server/services/ana/AnaToolExecutor.ts`, schema in
  `qms-labeling-analytics-tool-defs.ts`) calls the same `createControlledQmsDocument`,
  but its schema had no date and its handler passed none. `createQmsDocument` (`client/src/concept2cure/quality/qmsDocuments.ts`) had no
  `nextReviewDate` in its input, and the create dialog
  (`ControlledDocumentDialogs.tsx`) had no field for it. So a document created
  in the product never came due, and the review-due list only ever showed
  imported or seeded rows.

Searches run: `nextReviewDate`, `next_review_date`, `review-due`,
`periodic review`, across `client/`, `server/` and `tests/`; and
`git log --all --diff-filter=D` on `*Review*`, `SOPManagement` and `TrainingManagement`.
The deleted `SOPManagement.tsx` was fixture-only and sent no date.

## The change

- `qmsDocuments.ts`: `createQmsDocument` takes an optional `nextReviewDate` (YYYY-MM-DD).
- `ControlledDocumentDialogs.tsx`: the create dialog adds an optional
  "Next periodic review" date field, sends it only when one is chosen, and
  says what an empty field means: no periodic review is scheduled.
- AnA's `create_qms_document` takes an optional `next_review_date` that the
  user names. The description tells AnA never to choose one itself. The handler
  passes it to the same service call, whose schema validates the date.

The revise and bind dialogs do not show the field. Those dialogs act on a row
that already holds its date, so it carries through unchanged.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | At `5efa1de6f` the create dialog has no review-date field, so the new case fails. |
| `02-green.txt` | With the change, the client quality suites pass (17 files, 221 tests). |
| `03-green-db.txt` | On real PostgreSQL 16 (`RLS_ENFORCE=on`, as `app_service`), a document created through the route with a date stores it. Its signed snapshot carries the date, and once effective it is listed by review-due, not overdue. |
| `04-mutation.txt` | The field is shown but its value is dropped from the payload, and the client case goes red. |
| `05-red-ana.txt` | At `5efa1de6f`, AnA's create tool stores no date, so `next_review_date` is null. |
| `06-green-ana.txt` | With the change, the AnA QMS suites pass, including the atomic-audit contract (PGlite). |

## What remains (gap 5, not this change)

- There is no signed "review complete" act that records the review and sets the next date.
- No reminder is sent before the date (`emitDeadlineTask` / `taskDueSweep`).
- Training assignment (required trainees per document) is absent.
