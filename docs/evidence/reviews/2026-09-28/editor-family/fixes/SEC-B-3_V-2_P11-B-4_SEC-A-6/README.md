# SEC-B-3, V-2, P11-B-4, SEC-A-6: the canvas recorded saves the author had not made

**Findings:** periodic review 2026-09-28, editor family. Each was confirmed by
its verifier (`../../verification.md`). All four are in
`client/src/concept2cure/v2/editor/RichSectionEditor.tsx` and `suggestions.ts`,
so they are fixed together.

| ID | Grade | What was wrong |
|---|---|---|
| SEC-B-3 | blocker | "Comment on selection" checked for unsaved edits once, then waited for the author to write the comment in the rail (minutes, on a canvas that stays editable), then saved the whole buffer as "Comment anchor applied". Prose typed during the wait became a revision under that system reason, and the anchor went onto stale offsets. Reproduced: the anchor landed on " changed" instead of "endpoint". |
| V-2 | high | In source mode the save compared a stale copy of the text with itself. Text typed while a save was in flight showed "All changes saved", every leave guard was disarmed, and the device cache was deleted, so the text existed nowhere but the screen. Autosave sent the text from before its last keystroke. Rich mode deleted the cache the same way. |
| P11-B-4 | medium (top) | Undo after Accept or Reject restored the suggestion while the decision stayed recorded. A stale accepted-author entry was later written to the revision ledger as "AI draft accepted", even after a Reject. |
| SEC-A-6 / SEC-B-4 | high | "Insert reference" passed a vault title to TipTap as a string, which it parses as HTML. A crafted title could plant a pending suggestion attributed to AnA, or a citation. |

## The change

- **SEC-B-3.**
  - The selection is mapped through every transaction in the wait, including
    the tracking plugin's appended ones. If the quote is no longer at the
    mapped range, no anchor is applied, and the author is told so.
  - If the buffer changed during the wait, the anchor is applied but not
    saved. The section stays dirty for the author's own save and reason, and
    the author is told why.
  - Only an unchanged buffer is saved under "Comment anchor applied".
- **V-2.**
  - The save reads the textarea through a ref written on every keystroke.
  - The device cache is removed only when nothing is outstanding.
  - A keystroke no longer takes the state out of "Saving…".
- **P11-B-4.**
  - Accept, reject and the AnA insert are kept out of undo history
    (`addToHistory: false`, which both prosemirror-history and the Yjs undo
    manager honour).
  - At save time, `settleAcceptedContributions` keeps only accepted text that
    is present, unmarked, within one textblock of the document being saved,
    and only authors with such text.
  - A mistaken AnA insert is withdrawn by rejecting it, which is recorded;
    ⌘Z no longer does it.
- **SEC-A-6.** The reference is inserted as a text node.

## Shown failing first

26 new tests:
- `client/src/concept2cure/v2/__tests__/richSectionEditorSaveIntegrity.test.tsx`
  (SEC-B-3 ×5, V-2 ×6);
- `trackedChangeUndo.test.tsx` (P11-B-4 ×14, at the extension, the
  settlement function and the editor handle including the ribbon's Undo);
- `insertReferenceText.test.tsx` (SEC-A-6, through the real
  `referenceTextFor`).

Results:
- `red-vitest.txt`: 21 of the 26 fail on the unfixed code. The other five are
  controls.
- `green-vitest.txt`: 26 of 26, and 267 of 267 across the 27 test files that
  touch this editor. The lead re-ran the 26 in the shared tree: 26 of 26.
- `mutants.txt`: 21 mutants, one per part of the fix, all caught. M21 (a match
  across textblocks) survived the first run, so its test was strengthened,
  and it is now caught.
- `eslint.txt`: `RichSectionEditor.tsx` goes from 5 warnings to 4;
  `suggestions.ts` stays at 8; the new files have none.

## Not done here

- **SEC-B-3, server side.** An anchor-only save that the server accepts only
  when the text differs by the anchor span alone would close this
  independently of the client.
- **SEC-B-3, host message.** When the anchor is refused, the host's "Comment
  created — anchoring it…" toast gets no follow-up; the editor's own notice
  explains. The change needed is in `DocumentWorkbench.tsx`, which another
  lane holds: add `onAnchorRefused` to `commentsApi`, call it from the refused
  branch, and toast from the host.
- **P11-B-4, remaining gap.** A reviewer's own tracked typing from the same
  session can still be undone after they accept it: the text goes and the
  "accept" record stands. Closing it needs decisions sent with the save that
  carries their effect, or a "withdrawn" event.
