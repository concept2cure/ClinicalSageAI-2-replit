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

3. **The engine pill names the effort a mode buys, not a model.** `ANA_MODES`
   carried the words in a field called `model` ("Balanced", "Maximum",
   "Instant"), and the rail printed it in each message header as "AnA · Maximum",
   as if it named the model that answered. "Maximum" and "Instant" overclaimed:
   high-risk work is served by the flagship whatever the mode (end-to-end
   finding F4). The field is now `effortLabel`, the words are the server's
   effort levels (Light, Balanced, Thorough), the header names a model only when
   the server reported the one that served, and the identity line reads
   "Balanced effort · in …". Red: `effort-words-red.txt` (2 registry cases).
   Green: 430 files / 4,693 client tests; `tsc` 0; lint unchanged;
   `ci:internals-in-copy` and `ci:action-overclaim` pass.

Still to come in this series: WCAG 2.2 AA menu semantics for the two pickers.

Lane disclosure: `ConversationThread.tsx` was changed within 24 hours by
`ef70b10f4` (answer check). These hunks are additive, away from theirs.
