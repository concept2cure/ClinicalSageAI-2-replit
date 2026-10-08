# S2 (D2): every Data Room capture is read, stored, searchable and paged; the counts are exact

Plan: `docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md` §5.

## Before

- **Only uploads were processed.** A file adopted from a conversation (`POST /api/c2c/projects/:id/adopt`), or saved by AnA's spreadsheet edit, was captured with `extraction_status: 'pending'`, and nothing ever read it. It was unread, unclassified, unversioned and unsearchable.
- **No capture kept the text it was read to.** The Data Room's only search was a client-side title match over the rows already loaded.
- **`GET /:id/sources` stopped at 200 rows**, with no paging, no filter and no total. The Vault lane's Captured, Classified and Filed counts were floors over those 200.

## After

- **One processing step for every capture path:** `server/services/clinical-regulatory-evidence/data-room-processing.ts`.
  - `extractCapture`, `describeCapture` (the dossier classifier and the declared version) and `recordSourceProcessing` (an UPDATE of the derived columns only; the VR-16 guard keeps the record's columns write-once).
  - Upload, adopt and the spreadsheet edit all use it. Upload's own extraction, classification and version code moved there, so there is one copy.
  - `processPendingSources` is the bounded, resumable, dry-run-by-default sweep for captures made before this.
- **`migrations/20261008c_data_room_source_text.sql`** adds `extracted_text`, `char_count`, `page_count` and `text_extracted_at`, plus a GIN full-text index over `vault.document_search_vector` (the Vault's own definition) for client documents. It is guarded and replay-safe, and sits before the sweep.
- **`GET /:id/sources`** (through `data-room-search.ts`):
  - `q` searches title and text, ranked, with a snippet.
  - Filters: `status`, `kind`, `from`, `to` and `current`.
  - Paging: `limit` (1–200) and `offset`, with `total` and `currentTotal`.
  - With no parameters, the answer is unchanged.
  - An unreadable filter is a 400, never a wider list.
  - A list never carries the extracted text.
- **The Vault lane's counts** are one aggregate over the whole project (`countDataRoomStages`, beside `readFiledAs`, using the same definitions). The lane says the list is the newest N of the exact total. The surface's "+" floors are gone.
- **Project page:** the Data Room searches on the server by title and text, shows where each hit matched, and pages with "Newer sources" and "Older sources".

## Evidence

| File | Shows |
|---|---|
| `01-red.txt` | `tests/db/data-room-processing.dbtest.ts` against HEAD's server code, on a database with the new columns: 6 of 7 fail. Adopt does not process, there is no search, no total and no filter refusal, and there are no exact counts. The cross-project case passes either way; it is a control. |
| `02-green-unit.txt` | 159 suites, 1,505 tests: upload, adopt and the projects router, the Vault read, the evidence spine, data-room processing, search, filing and counts, derived uploads, the project page and Vault surfaces, and the founder-path walk. tsc 0, the ratchet is flat, and the migration gates pass. |
| `03-green-real-postgres.txt` | PostgreSQL 16 under `RLS_ENFORCE=on` as `app_service`, migrated twice: 38 dbtest files, 303 tests. They include the new suite: adopt reads the file and records its text, measure and declared version; a word only in the body finds it; the pending sweep processes and names the unreadable; 250+ sources page with a real total; search stays in its project and organization; and the lane counts 208 sources exactly. |

## Tests changed to the new contract, each saying why

- `projects-sources-window`: the route reads `searchDataRoom`.
- `vault-data-room-counts` and `vault-tree-bounded`: the counts come from one aggregate.
- `project-vault-branches`: the mock answers the new count query.
- `projects-adoption`: the post-commit processing write.
- `chat-upload-durability`: the text record is written after the bytes are stored.
- `vaultDataRoomCounts` and `projectHomeDataRoom`: exact counts, server search and paging.
- The walk applies `20261008c`.

## Deferred, as planned

Capacity items from the plan not in this slice: aligning the Data Room upload cap with the Vault's (25 MB vs 50 MB), and a page bound on OCR at upload. They follow with S3.
