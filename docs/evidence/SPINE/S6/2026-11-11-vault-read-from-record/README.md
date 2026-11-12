# A document is read from its record in the Vault, in a wide reading drawer

2026-11-11. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1 (the change includes stylesheet rules).
Completes `client/src/concept2cure/v2/surfaces/VaultVersionViewer.tsx`.

## The defect

The founder, 2026-11-10: "The vault UI seems to be lacking in a lot of ways." And, 2026-11-11: "focus entirely on
getting what we built surfaces correctly on the UI and working for GA."

Opening a document in the Vault showed its record: its filing, its details, its actions (Work on document, Place
into filing, Download, Ask AnA). It did not show the document. The Vault could show one, but only this way: open
the record's closed "Versions" section, press View on a version's row, and read the page in a frame 328px wide and
320px tall inside the record panel. The thing a person opens a Vault for was three steps down and too small to read.

## What already exists

| Piece | Path | What it does | What it did not do |
|---|---|---|---|
| The viewer | `client/src/concept2cure/v2/editor/vaultPdfViewer.tsx` | Reads a version through the audited download route, frames it only when its bytes begin `%PDF`, shows the served SHA-256, releases the object URL on close | Nothing; it is reused as it is |
| The Vault's use of it | `surfaces/VaultVersionViewer.tsx` (`VersionViewButton`, `useVaultVersionViewer`, `VaultVersionViewer`), used by `VaultVersions.tsx` and `VaultSeals.tsx` | View on a version row (a PDF as itself, a Word file as its PDF rendition, P-107), framed under the list it was opened from | It was reached only inside the Versions section and a seal's list |
| The record's actions | `surfaces/Vault.tsx` (`recordActions`) | Work on document, Place into filing, Download, Ask AnA, Build in editor | No View |
| The drawer | `surfaces/Vault.tsx` (`VaultDrawer`, the D0 drawer) | Holds focus, closes on Escape, returns focus | It was used for the tree and the record on a narrow screen |

Nothing on the server changes: the same route, the same record of the read. Searches run: `VersionViewButton`,
`useVaultVersionViewer`, `PdfFrame`, `pf-viewer`, `VaultDrawer`, `recordActions`, `mimeType`.

## What changed

- `surfaces/VaultVersionViewer.tsx`: `recordViewKind` (a PDF as itself, a Word document as its rendition, by the
  record's type) and `RecordViewButton`, which is the version row's own button for a record. `VersionViewButton`
  takes the class of the row of actions it sits in.
- `surfaces/Vault.tsx`: View (or View as PDF) sits beside Download in the record's actions, for the current version.
  The viewer opens in a drawer 1040px wide, over whichever view is on screen. When nothing is framed (a refusal, or
  a file whose bytes are not a PDF and is downloaded instead), the record says so under its actions, and only on
  the record the attempt was for. A file whose original bytes are gone after a retention decision is offered no View.
- `styles/misc-surfaces-v2.css`: the reading drawer's width, and the frame taking the drawer's height.

The Versions section keeps its own View on every version, earlier ones included. Nothing is removed (P-122).

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | Four of the five new cases fail on the unchanged page |
| `02-green.txt` | `vaultRecordView.test.tsx` 5 of 5: a PDF opens in the reading drawer through the audited route and closing releases its bytes; a Word document asks for its rendition and says what it is; another type is offered no view; bytes that are not a PDF are downloaded with the reason on the record; a refusal says what the Vault said. Every Vault client suite: 70 files, 791 cases. The gates |
| `03-running-app.txt` | In the running app on PostgreSQL: the protocol (a PDF) opens 1040px wide with a frame of 1039 by 835px at 1440px, and full width on a phone; a Word file opens as its rendition with its note; the bytes in the frame begin `%PDF`; no console error, no response of 400 or above |
| `04-before-record-1440.png` | The record before: no way to read the document without the Versions section |
| `05-after-reading-1440.png`, `06-after-word-rendition-1440.png`, `07-after-reading-390.png` | The document being read |

## Not done here

- The reading drawer shows one version at a time. Comparing two versions stays in the Versions section.
- A governed artifact and an authored section have no View here: the first opens in the editor ("Work on
  document"), the second has no file.
- The dark theme was not looked at for this change. The frame's content is the browser's own PDF viewer.
