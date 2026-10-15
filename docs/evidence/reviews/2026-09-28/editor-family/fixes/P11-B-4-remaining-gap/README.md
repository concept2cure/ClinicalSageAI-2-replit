# P11-B-4, remaining gap (e): Undo and Redo stop at a recorded accept or reject

**Finding.** After `b43ec3af`, a reviewer's own tracked typing was still an
ordinary history entry. So after the reviewer accepted it, or accepted their
own tracked deletion, Undo reversed the decided text while "accept" stayed
recorded. The triage is in `../../triage/editor-followons.md`.

**Fix** (`client/src/concept2cure/v2/editor/suggestions.ts` only). A recorded
decision is an undo floor and a redo floor. The undo floor follows history's
own cut past its depth limit. `decisionFloorAllows(state, step)` is exported,
so the ribbon can foretell a press.

**Cycles.** Each was shown failing first:

| Cycle | Evidence | Reviewer's finding it closed |
|---|---|---|
| 1 | `red.txt`, `green.txt`, `mutant-*.txt` | — |
| Fix-up | `fixup-*.txt` | Redo re-applied a step undone before the decision; the added comment said redo was safe |
| 2c | `r2c-*.txt` | in a long session the floor sat above the decision for good, so Undo of later typing silently did nothing |
| 2d (self-reviewed) | `r2d-*.txt`, `trackedChangeUndoFloorEdges.test.tsx` | two meaningful mutants survived (R2, a sticky "that was an Undo" mark; R5, an early return that left the redo floor standing) |

The 2d cycle changes tests only. The code is the round-2c code, byte for byte
(sha256 `011529810cfe…`), which the round-2c reviewer's own probes passed. The
subagent weekly limit ended the independent review.

**Still open.**
- The ribbon's Undo and Redo, and their shortcuts, stay enabled at a floor, so
  a press does nothing. `RichSectionEditor.tsx` was held; it can read
  `decisionFloorAllows` beside `can()`.
- The floor is coarse: a decision also freezes earlier, unrelated typing.
- Yjs undo under live co-editing is not covered.
