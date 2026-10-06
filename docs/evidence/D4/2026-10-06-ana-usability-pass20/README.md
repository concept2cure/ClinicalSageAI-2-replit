# W3 / D4 — Close activity steps without inventing outcomes

A final post_done could leave a tool step spinning when its result event was
missing. The red run records two failing host regressions before the fix.
Final completion now settles remaining running calls as unconfirmed, with a
completion-not-confirmed note and no invented result. Received successes and
errors retain their outcomes. The folded activity summary counts unconfirmed
steps separately; the expanded record preserves unconfirmed plan updates as
well as ordinary tools. Both shared activity renderers show a warning glyph.
No elapsed step duration is claimed for a step lacking a result.

Four host regression cases cover ordinary tools and plan updates in the rail
and conversation view. They verify final answer and turn-record preservation,
received results, independent counts, visible notes and no automatic retry.
All 329 focused tests across 30 suites and all 26 repository guards pass.
Import/lint publication checks and explicit parent-version lint comparisons are
recorded alongside this evidence. No new dependencies or capabilities added.

Full TypeScript validation remains in GitHub CI under the user's authorized
local compiler-memory exception. Earlier broad Test/Integration/Coverage and
security failures remain open. Live latency, provider quality and D4 deployment
and launch evidence remain unverified.
