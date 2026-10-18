# Existing editor creation handoff and recovery

W1 / D2, 2026-10-14. This evidence covers the native workbench host; the parent
increment separately qualifies creation requests, receipts, recovery reads and
browser states.

The unchanged workbench failed 10 of 12 initial integration cases. A confirmed
new document stayed outside an Approved-filter list or pinned conversation
canvas, creation lacked the host's effective project and held-switch state,
and document/section refresh callbacks used stale unsaved-work decisions.
The actual failing output is in `before.txt`; source pins are in
`verification.json`.

Creation now receives the effective project and held-switch refusal. Confirmed
documents follow `openPulledDocument`, including exact-ID external handoffs for
pinned or filtered hosts. Section creation consults the current leave guard
only after a successful scoped section read. Read sequence and context tokens
drop stale responses, including project round trips and unmounts. Recovery
shows all statuses and refreshes the existing list, or hands a pinned document
to the full editor through the same dirty-work decision; section recovery
refreshes that document's current sections.

An additional edge test caught a regression in the first implementation: a
host-filter change discarded an initial section read without starting another.
`intermediate-edge-before.txt` records 1 failure and 14 passes. Restarting the
read for the changed host scope fixed it.

Final focused result: 19 passes. Five focused files also passed 55 cases,
including 40 existing source-import, unsaved-work, remedy navigation and
conversation-handoff cases. That run used the then-15-case new suite; the final
18-case run followed returning the same helpers' promises directly from the
host callbacks. The final 19-case run adds the notice-host boundary below.
Lint reports zero errors, zero warnings for the new test, and
the same 13 pre-existing workbench warnings. No baseline was changed.

The parent browser evaluation then found existing creation notices clipped
inside the touch-width header actions. The workbench now supplies a notice
host immediately after that header, before the existing oversight actions.
The creation component renders the same notices into that host; standalone
callers retain the inline fallback. No CSS or notice pattern was added.
`notice-host-before.txt` records the new boundary check failing before this
placement change (1 failed, 18 skipped); `after-notice-host.txt` records the
final 19 passes. Source pins and lint evidence were refreshed afterward.

The root compiler then found eight errors in the new test fixture: its document
row omitted required `product_code` and `section_count` fields. The fixture now
supplies null and 1 explicitly, without casts. `compiler-before.txt` retains
the diagnostics; `typed-fixture-after.txt` records all 19 cases passing after
the correction, with zero new-test lint errors or warnings. The root session
owns the compiler rerun; this folder does not claim its result.

The root 78-file run passed 916 cases across 77 files and failed one legacy
refresh-all assertion. That fixture supplied prose reasons although the
canonical service returns `unresolved_source` and `frozen`, which the existing
shared mapper renders as actionable messages. Only the legacy fixture and its
independent message assertions were corrected; both specific meanings and
absence of the generic fallback are checked. All four cases in that file now
pass. `legacy-refresh-all-before.txt` is the actual root failure excerpt;
`legacy-refresh-all-after.txt` is the targeted result. No complete 78-file green
rerun or production-rendering change is claimed.

The tests mount the actual workbench, TipTap, leave dialogs and editor-target
channel. The creation component is a callback-capture test double; API replies
are synthetic. No model, live server, deployment, regulatory readiness or
305-template coverage is claimed by this suite. No new editor, route, CSS,
dependency or data store was added.

Stored text receipts have trailing whitespace removed and exactly one final
newline. `verification.json` preserves the original raw scratch-log hashes,
records the earlier evidence hashes, and identifies the normalized stored
bytes. This normalization does not change production or test source pins.
