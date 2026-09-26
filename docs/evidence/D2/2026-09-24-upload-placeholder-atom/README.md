# D2: a chat upload with no readable text was embedded as its own filename

**Row:** D2 (launch catalog working honestly). This is AnA's memory of a
client's file. **Workstream:** the AnA client-files lane. **Date:** 2026-09-24.
**Source:** this lane's audit of the upload → AnA path (a read-only auditor,
verified here before the fix).

## The defect

`server/routes/chat/upload.ts` seeds its extracted text with a placeholder,
`[Uploaded via chat: <name>] (<mime>, <bytes> bytes)`, and replaces it only when
extraction produces text. A chat upload has two branches that write the
retrieval atom (`lumen_data_atoms`):

- The **program** branch (uuid project) writes the atom only when there is real
  extracted content. Its comment says so: "only real extracted content, never
  the filename placeholder".
- The **project** branch (numeric workspace) wrote it **unconditionally**.

So a scan, an image OCR could not read, or a whitespace-only file uploaded
into a project was embedded as a one-line metadata sentence. The row looked
like any other embedded atom, and retrieval could return that sentence as if it
were a passage of the document.

## The fix

The project branch now writes the atom only when extraction produced text (the
same rule as the program branch). With nothing read, nothing is embedded, and
`atomBounds` stays `null`. The response already reports that as "no atom path
ran".

## Evidence

| File | Result |
|---|---|
| `red/unit-upload-placeholder.txt` | 1 failed, 4 passed. `tests/routes/chat-upload-to-memory.test.ts` runs extraction for real. A whitespace-only `.txt` uploaded into a project produced a `lumen_data_atoms` insert. |
| `green/unit-upload-placeholder.txt` | 29 passed across the three chat-upload route suites (to-memory, wiring, source identity). No insert and no embed for the unread file. Real text is still embedded, and OCR'd images still are. |

ESLint: `upload.ts` 0 errors / 4 warnings, the same as HEAD.

## Not changed here

The same branch's **governed artifact** (`concept2cure_artifacts`, via
`resolveGovernedContext`) still takes the placeholder as its `content` when
extraction failed. Its contract may require non-empty content, and the artifact
also records the upload event itself. Whether an unread upload's artifact should
carry empty content with an explicit extraction status is a question for that
contract's owner. The chip the user sees now says "no text extracted"
(`docs/evidence/D2/2026-09-24-attachment-read-label/`), so no user-facing claim
depends on this.
