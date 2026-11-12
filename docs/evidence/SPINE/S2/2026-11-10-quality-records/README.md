# The project's data room with Quality records in it, 2026-11-10

Found by the showcase walk of the Lumen account (session `01QoxbLZ…`, `.design/claude-convergence/COORDINATION.md`,
"Showcase walk of the Lumen account", item 4). LMN-201 → Evidence: the list led with Quality-system records above the
study's files; some were titled by a row id ("Training assignment: 4", "CAPA action: 90012220-…"); each said
"File · added Nov 10", had a disabled "Work on document" with "The original file is unavailable, so a working copy
cannot be created", and a "Review file removal" button.

## What already exists (RULE 3)

| Path | What it does | What it did not |
|---|---|---|
| `server/services/qms/project-evidence.ts` | Projects the Quality registers' records into the project's data room as native record snapshots | Named a record with no title of its own by its row id |
| `server/services/clinical-regulatory-evidence/record-source.ts` | Captures each snapshot on the immutable source spine; a changed record is a new capture that supersedes the old | Kept the old name when only the name changed |
| `server/services/clinical-regulatory-evidence/data-room-search.ts` | Lists the room, newest first | Put a Quality record above a study file captured earlier |
| `client/src/concept2cure/v2/surfaces/ProjectHome.tsx` (Evidence), `editor/DataRoomSourcesPanel.tsx` | The room's rows and their actions | Treated a Quality record as a file |

Nothing new was built: four existing files finished.

## What changed

- **Order.** Current captured files first, then current Quality records, then what a later capture replaced. A search
  still ranks by relevance first.
- **Names.** A record with no title is named in its own words: a CAPA action by its number and description, a training
  assignment or receipt by its document, a record relationship by what it links, a retained version by its document.
  A record with nothing to say is "record 9", never a bare id. A renamed record is captured again and supersedes the
  old capture, so a room captured before this change shows the new names on its next read, and keeps the old captures
  at the bottom, marked as replaced.
- **No file wording or file actions on a Quality record.** The row says "Quality record · recorded here <date>". It has
  no "Work on document" and no file removal, on the project page and in the editor's and Vault's data room panel.
  Pinning it as context for AnA and "Build in editor" are unchanged.

## Walked (`walk.cjs`, `walk.json`, `evidence-list.png`)

Fresh-Codespace database at head, Lumen lead, LMN-201 → Evidence, 1440×900. 2 files first, then 45 current Quality
records, none with a file button, none named by a bare id; replaced captures after them.

## Checks

- `server/services/qms/__tests__/project-evidence.test.ts` (names), `record-source.pglite.test.ts` (a rename is a new
  capture), `native-catalogue-current-records.pglite.test.ts` (a file 30 days older still lists first; this test failed
  on the first attempt, which sorted a file with no `nativeRecord` key last), with the rest of
  `server/services/clinical-regulatory-evidence`: 64 files, 1,014 cases.
- `client/src/concept2cure/v2/__tests__/projectDocumentDisposition.test.tsx`: a Quality record row has no file wording
  or file actions; the file beside it keeps both.

## Open

- Withdrawing a Quality record snapshot from data use is no longer offered on the project page (the control was the
  file-removal one). The record's own lifecycle in Quality governs it. Founder's call if a separate control is wanted.
