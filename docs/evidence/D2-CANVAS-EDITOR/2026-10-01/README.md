# The AnA document canvas → editor, as a build-with-AnA experience

**Row:** D2 (launch catalog: Authoring). Founder-directed, 2026-10-01: simple,
focused enhancements to the canvas that converts into the editor, so that AnA
builds the document and works inside it while she keeps talking with the
client, as one builds with Claude. The work stays within
`docs/design/ANA_DOCUMENT_CANVAS.md`: one canvas, one editor, the authoring
store.

## 1. The editor opens beside the conversation

**Before.** "Open full editor" expanded the canvas in place, at the thread's
full width and the viewport's height. AnA's answers scrolled away above it,
and the person edited with the conversation out of sight.

**Now.**
- The thread keeps a pane after its conversation column (`.ct-canvas-pane`),
  and an expanded canvas portals the one editor into it.
- The conversation keeps a reading column (34%, 340–520px) with its answers,
  the card that opened the editor (marked, its button now "Close the editor")
  and the composer.
- The document takes the rest.
- Below 1100px there is no room for two columns, so the document takes the
  screen, "Back to conversation" returns, and an ask from inside the editor
  closes it so the prefilled message is on screen.
- The workbench stays mounted in the pane while hidden, so its state survives
  closing and reopening.
- Without a pane (the Authoring surface, the card alone) the canvas expands in
  place as before.

**Failing first.**
- `1-beside-red.txt`: the new case in `conversationThreadCanvas.test.tsx`
  failed against the unchanged code, because no pane held the editor.
- `1-beside-green.txt`: 85/85 across both canvas suites, every
  conversation-thread suite, and the in-canvas citation and caption suites.

**Also run.**
- `tsc`: clean.
- `ci:canvas-path`: wired (thread → canvas → workbench).
- `ci:check-phantom-tokens`, `ci:undefined-css-classes`: OK.
- ESLint ratchet: unchanged.
