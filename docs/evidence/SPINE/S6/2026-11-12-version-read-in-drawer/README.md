# The Vault: a version is read in the same wide drawer as its record

2026-11-12. Session `…01KnUGoX3g` (the Vault parity lane). Plan package F1. Completes
`client/src/concept2cure/v2/surfaces/VaultVersions.tsx`.

## The defect

Reported by the document path screen repairs (`01QoxbLcnW…`) on the W3 validation installation. On a Vault record,
Versions → "View version 1.0" framed the PDF inside the record panel, 319 by 320px in a 1440 by 900 window, under the
version list.

The record's own View has opened a drawer 1040px wide since `fd60d97c87`, but a version's View did not use it.
Measured here on the demo's protocol before the change: 319 by 320px at 1440, and 350 by 320px at 390, in the record
panel (`02-before-running-app.txt`, `04-before-version-in-record-1440.png`).

## What already exists

| Piece | Path | What it does |
|---|---|---|
| The viewer | `surfaces/VaultVersionViewer.tsx` (`useVaultVersionViewer`, `VaultVersionViewer`) over `editor/vaultPdfViewer.tsx` | The audited download; only bytes beginning `%PDF` are framed; the served hash line; the bytes released on close |
| The record's reader and drawer | `surfaces/Vault.tsx` (`reader`, `VaultDrawer` with class `vd-read`), `styles/misc-surfaces-v2.css` (`.vd-read`) | The record's View, in a drawer 1040px wide (`fd60d97c87`) |
| The Versions section | `surfaces/VaultVersions.tsx` | Each version's View, Download, compare, lifecycle. It kept a viewer of its own and framed under the list |

## What changed

- **The Versions section reads through its host's reader when it has one** (`reader`, type `HostReader`). In the
  Vault that is the record's reader, so a version opens in the same drawer, titled with its version
  ("Reading … v1.0").
- **What a View came to without a frame is said in the Versions section.** That covers a refusal, and bytes that are
  not a PDF and are downloaded instead. The note is brought into view, as before. It is not said under the record's
  actions, which keep their own note for the record's View.
- **Without a host's reader** the section frames the version itself, as before; its own suite renders it that way.
- **Where the choice lives:** `useSectionReader` and `HostReader` are in `VaultVersionViewer.tsx`, beside the viewer, so
  `VaultVersions.tsx` stays within its line and complexity limits.
- Nothing is rebuilt: the same audited route, bytes rule, hash line and release on close.

## Tests

`vaultRecordView.test.tsx` gains two cases:
- a version's View opens the same drawer (class `vd-read`), through the audited route for that version, with its
  hash; nothing is framed under the list, and closing releases the bytes;
- a refusal is said in the Versions section, not under the record's actions, and no drawer opens.

The first fails on the code as it stood (`01-red.txt`); the second held before and holds after. Every Vault and
eTMF client suite: 84 files, 957 cases, pass (`07-suites.txt`).

## In the running app (PostgreSQL)

The demo's protocol, Versions → "View version 1.0" (`03-after-running-app.txt`):
- **At 1440 by 900:** the reading drawer, 1040px wide, frame 1039 by 835px, with the hash line
  (`05-after-version-in-drawer-1440.png`).
- **At 390 by 844:** the drawer, 390px wide, frame 390 by 739px (`06-after-version-in-drawer-390.png`).
- **On closing:** no frame is left. No console error, and no response of 400 or above.

The typecheck is at 0 (`08-typecheck.txt`) and the lint ratchet shows no new warning (`09-eslint.txt`). `ci:undefined-css-classes`,
`ci:unreferenced-modules`, `ci:ana-surface-context` and `ci:one-product` pass.

Seen while measuring, and not changed here: the demo protocol's PDF shows "?" where its source text had dashes and
other characters outside the font. That is in the demo document's own bytes.
