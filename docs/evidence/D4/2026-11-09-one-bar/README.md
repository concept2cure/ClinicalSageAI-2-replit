# D4-5a: the document in the conversation has one bar (2026-11-09)

**The spec.** `.design/claude-convergence/D4.md`:
- §D4.A steps 2, 5 and 6 and the split;
- §D4.I's "Edit in the editor", which becomes the bar's "Open full width".

Claude opens an artifact in a panel beside the conversation, with one header.

**Before.**
- Beside the conversation, the document had two bars. The canvas drew its own:
  - "← Documents";
  - "× Back to conversation";
  - the title, the status and the project;
  - an "Esc" chip.
- The editor's bar sat underneath (J3's `x-20-` screenshot; `../2026-11-09-composer-beside-canvas/`).
- The conversation was 400 px at 1440 and 345 px at 1280. D4's split, and D0's layout grid, ask for
  `clamp(420px, 38%, 560px)`.

The founder's D4-3 hold is respected. The demo session (`017CFk…`) confirmed on 2026-11-09 that no recorded demo path
uses the canvas card's buttons, and said "take D4-5 whole". Freeze, E-sign, Place into filing and Re-file stay in the
bar.

## What already exists (RULE 3)

- **`editor/DocumentCanvas.tsx`.** The pane and inline host:
  - the expanded region and its `.dcv-bar`;
  - `openInAuthoring`, which carries the editor target with `returnTo`;
  - `showList`, `backBtnRef`;
  - the card's "Edit in the editor" link (`dc-edit-in-authoring`).
- **`editor/DocumentWorkbench.tsx`.** The one editor:
  - its bar (D4-2), whose `embedded` prop carried `hostShowsBack` so it would not draw a second way back;
  - the rail and outline Escape effects.
- **`editor/canvasFocus.ts`.** `useCanvasRegionFocus` (focus to the close on open, back to the opener on close) and
  `useCanvasEscape`.
- **`editor/CanvasDocumentList.tsx`.** `ToDocumentsButton`, `OpenedDocumentPending`, `StatusPill`.
- **`quality/ControlledDocumentWorkbench.tsx`.** The other embedded host, "Back to Quality register". It is unchanged:
  it keeps its guarded close.
- **`styles/authoring-v2.css`.** The split (`.ct-main[data-canvas-open] > .ct-conv`) and the canvas bar rules.

Nothing new is added: no file, route or table. `useCloseFocusHandoff` is a hook in the existing `canvasFocus.ts`.

## The change

| Part | Now |
|---|---|
| **One bar** | While the editor is mounted, the canvas draws no bar. The editor's bar, in its `embedded` mode, draws "← Documents (n)" after the outline toggle, the title (with the project in its tooltip), the status (`dc-status`), "Open full width" (⤢, `dc-edit-in-authoring`) and the close. |
| **Close** | ✕, labelled "Back to conversation", with `aria-keyshortcuts="Escape"`, titled "Back to conversation (Esc)", `dc-back`, and the canvas's `closeRef`. The canvas only hides the editor and keeps it mounted (`embedded.collapses`), so the close needs no leave guard. Quality's host keeps its guarded close. |
| **Escape** | An Escape from the close is the canvas's (`data-host-close`). An open rail or the floating outline does not take it, so the panel closes. |
| **Before the record is read** | The region keeps a placeholder bar: Documents, the title and the close. When the editor's bar replaces it, focus on the placeholder's close moves to the editor's (`useCloseFocusHandoff`) instead of dropping to the page. |
| **The card** | "Edit in the editor" is gone, and "Open full width" in the open document does the same thing. The rest of the card is D4-5b. |
| **Placement** | `.dcv-expanded[data-placement="pane" or "inline"]`. |
| **Split** | The conversation is `clamp(420px, 38%, 560px)`. The outline opens closed beside it (D4-4), so the page keeps its width. |
| **Removed CSS** | `.dcv-bar-hint` and `.dcv-open-surface`. |

`hostShowsBack` is retired from `DocumentWorkbenchProps.embedded`.

## Red, then green

**Red at HEAD** (`red-at-head.txt`). Three cases fail:

| Case | Failure |
|---|---|
| One bar, carrying the way back, the status and "Open full width" (`documentCanvas`) | `data-placement` absent |
| The card no longer carries "Edit in the editor" | the link is present |
| The 420 to 560 px column (`editorPageCss`) | `0 0 clamp(340px, 34%, 520px)` |

**Tests updated, because they pin names this change moves:**
- `documentCanvas`: "Open full width" is clicked in the open document.
- `canvasDocumentsList`:
  - the close is matched by its label;
  - four cases wait for the editor's bar before acting, as a person acts on the bar they see;
  - one case checks that focus survives the bar replacing the placeholder.

**Mutation** (`mutation-focus-handoff.txt`). Without the handoff, focus falls to `<body>` and that case fails.

**Green** (`green.txt`). The canvas suites, then every suite that renders the editor, the canvas or the thread.

**Gates:**
- `ci:check-css-selector-shadowing`, `ci:undefined-css-classes`, `ci:surface-text-ramp` and `ci:design-system`
  pass.
- ESLint warnings per file equal trunk's. To stay inside the 500-line ceiling, the handoff lives in `canvasFocus.ts`.

## In the running app

Script `d45-onebar.cjs`, measurements `d45-onebar.json`, screenshots `pane-*.png`. The walk stack ran with
`client/src` and `shared/` from this tree. Path: C2C-101, the editor, the QOS working copy, then "Draft with AnA".

| Case | Conversation | Panel | Bars in the panel | The close | After Escape on it |
|---|---|---|---|---|---|
| 1440 light | 447 px | 729 px | 1 (no Esc chip) | visible, "Back to conversation", `Escape` | the panel closes; the conversation is 792 px |
| 1440 dark | 447 px | 729 px | 1 | the same | the same |
| 1280 light | 420 px | 596 px | 1 | the same | the same |
| 390 | the conversation takes the screen, as before (at 1100 px and below the document takes the screen when opened) | | | | |

"Open full width" and the status are visible in the bar, and nothing scrolls sideways.

**Seen, not changed here:**
- **The bar wraps to three rows, 111 px.** Freeze, E-sign, Place into filing and Re-file stay in it until D4-3, which
  the founder holds.
- **The ribbon's last control runs past the panel.** At 729 px, "Track changes" overflows the page. The ribbon is one
  scrolling row by design (D4-6). In a narrower panel it is D4.K's `artifact` container work, for the D4-6
  follow-up.

**What remains of D4-5 (D4-5b):**
- **The card becomes the chip (§D4.I).** It keeps icon, title, meta and Open, and drops its outline, first section
  and action row. Its File to vault, Send for review and Place into filing are reached once, in the open document.
- **The Documents list goes quiet.** Its scope becomes a segmented control, and "← Documents" becomes a ghost button.
- **§D4.A step 1 (the page placement's panel shell) and step 3 (the bar above the outline)** wait with D4-3's
  inspector.
