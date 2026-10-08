# ana-13 — The project's page holds its files (slice 23, files half)

Launch row **D2**. Design: `docs/design/ONE_ANA_ONE_CANVAS.md` slice 23.

## What was wrong

On Project home, the Evidence stage showed one empty state: "The document vault
opens in its own workspace". It listed no files and had no link. To see what the
project holds, a person had to leave the project for the Vault and find the
project again there. That is the split-into-apps problem the founder raised.

## What changed

- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx:227` `ProjectEvidence`.
  The Evidence stage now shows "Project files" through the files panel the editor
  already uses beside a document (`editor/ProjectFilesPanel.tsx`). It is the same
  component, so the read, search, audited Open, PDF viewer and states are the
  same:
  - the read is `GET /api/c2c/project-vault/:id`, by the project's UUID, which is
    the `regulatory_programs` id that route checks;
  - a failed read is an error with a retry.

  "Open in Vault" in the header goes to the Vault for filing, uploads and
  version history. It is shown only while the Vault is in the launch scope.
- `editor/ProjectFilesPanel.tsx`. The editor-only props are now optional:
  `onClose`, `sectionOpen`, `sectionCode`, `projectSources`, `onCite` and
  `onInsertReference`. Without an editor:
  - there is no rail header and no Close button;
  - there is no "Open an editable section to cite…" hint (`:598`);
  - the empty vault does not suggest filing "this document" (`:514`).

  The editor's call in `DocumentWorkbench.tsx` is unchanged. Two of the new
  props were folded onto existing lines to keep the file under its 500-line
  limit (HEAD counted 499).
- `styles/app-v2.css`: `.pj-evidence` limits the file list to 480 px, so a large
  vault scrolls inside the section.

## Shown

| Test | Before (red) | After (green) |
|---|---|---|
| `__tests__/projectHomeEvidenceFiles.test.tsx`: lists the project's vault from the project-scoped read | fails: no file on the page | passes |
| same: a file can be opened here; no section hint, no Close | fails | passes |
| same: a failed read is a failure with a retry, not an empty vault | fails | passes |
| same: beside the editor the panel keeps its header and its section hint | passes, a regression pin on the editor case | passes |
| `editor/__tests__/projectFilesViewer.test.tsx` (what the viewer frames, SEC-A-3) | n/a | 6/6 |
| all `projectHome*.test.tsx` and `insertReferenceText.test.tsx` | n/a | pass |

`red/vitest.txt` holds the new test run against the committed `ProjectHome.tsx`
and `ProjectFilesPanel.tsx`. `green/vitest.txt` holds 15 files, 75/75.

Gates: ESLint warnings are unchanged (ProjectHome 10/10, ProjectFilesPanel 0/0).
`ci:surface-text-ramp` is OK. `ci:undefined-css-classes` defines `.pj-evidence`.
Its only failures at this moment are another slice's uncommitted
`CanvasDocumentList.tsx`.

## Not done

- **The documents half of slice 23.** The project's Documents panel will reuse
  the canvas documents list (`editor/CanvasDocumentList.tsx`), with the project
  scope, once that lands. "Recent drafts" stays until then.
- **No real-browser check yet.** It goes into the integrated capture after
  wave 2.
