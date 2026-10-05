# Client honesty, changes 1 and 2 (ADR-0015 §7 client half, §9)

**Row:** 74. **Session:** `…019ZvHmh`.

1. **An unknown consistency verdict is no result, never "clean"**
   (`useAnaChat.ts` `mapConsistencyResult`, commit `bbdeae5ea`). It coerced any
   verdict it did not know, or a missing one, to `clean`, and its test pinned
   that. Red: `consistency-red.txt` (2 new cases failed against the old
   mapping).
2. **AnA's warnings show on the conversation screen**
   (`AnaMessageWarnings.tsx`, used by the rail and `ConversationThread.tsx`).
   The rail drew a message's warnings inline; the conversation screen drew
   none, and the rail is not mounted while it is open, so Home's questions
   (which land there) showed no failed save, timeout or refused model pin. One
   component now draws them on both. Red: `warnings-red.txt` (the conversation
   screen showed nothing); the rail control stayed green throughout.

Green: the whole v2 client and AnA hook suites, 430 files / 4,691 tests
(`client-suite-green.txt`), plus 127 conversation and host tests after the
lint fix; `tsc` 0; lint unchanged (`toTurn`'s three repeated empty-list checks
became one helper, which also kept it under complexity 15).

Still to come in this series: the engine pill names the effort mode, and the
pill menus get WCAG 2.2 AA menu semantics.

Lane disclosure: `ConversationThread.tsx` was changed within 24 hours by
`ef70b10f4` (answer check). These hunks are additive, away from theirs.
