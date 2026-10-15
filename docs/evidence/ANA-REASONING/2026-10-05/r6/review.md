# Round 6's plan, refuted before it landed

Two independent agents, read-only, on trunk `28c63cd22`:

- a mapper confirmed TP-RL-3 from source and proposed a fix;
- a skeptic tried to refute the defect, the fix and the hot-file reading.

Each finding below is the skeptic's, with what was done about it. Measurements
the skeptic made on the pre-`df30b4bbd` tree are marked as such.

## The defect

- **It holds.** The stream passes only the current message to the selector
  (`stream.ts` `selectToolsForTurn(governedTools, message, …)`). The thread
  history and its tool trace never reach the selection. Every round reuses the
  first call's set.
  - **Done:** the trace is carried. Re-measured on today's tree in
    `probe.txt`: 33 of 48 follow-ups lose the previous turn's tool on trunk,
    and 0 on round 6.
- **The bridge claim is false for typed tools.** `execute_platform_command`
  answers `unknown_command` outside `COMMAND_REGISTRY`, and only 2 of the 792
  typed tool names are in it.
  - **Done:** corrected in `tool-selection.ts` (header and `ALWAYS_ON_TOOLS`),
    in `stream.ts`'s comment, and in a test title in `tool-selection.test.ts`.
  - **Handed on:** the same claim at `send-message.ts:792-794`, which is hot
    (board item 25).
- **The map's "[object Object]" is not what happens on the live door.** The
  stream's `asStr` drops the object context. "[object Object]", and the
  `hints: {}` TypeError, happen on send-message and the voice socket, which no
  in-repo client calls.
  - **Done:** the selector reads each field only as the string it is
    declared to be. The map's row is corrected.

## The fix as first proposed

| # | Finding | Outcome |
|---|---|---|
| 1 | Carrying the previous message's text loses the current turn's tool after a change of topic. The plan's own prototype loses `get_document_section_requirements` after 7 of 16 single-tool topic changes on the production surface; tools-only recovers 13 of 13 and loses 0 of 380 (pre-`df30b4bbd`). | **Dropped.** Tools only. |
| 2 | 2× weighting on the current message does not protect it: prior terms reorder ties near the cutoff (22 of 380 lost even lexicographically). | **Dropped** with the text carry. Scoring is unchanged. |
| 3 | The planned topic-change control used the wrong surface (`ALL_ANA_TOOLS`, no pins, 38 slots) and the one prior topic that does not trigger the loss. | **Done.** The control runs on the launch catalog with the self-drive pins, under 6 prior topics and both project types. It reads the routing eval's cases from its file and keeps those the launch catalog holds. |
| 4 | Eight carried tools is too many: a tool ranked 25th of 32 for its own prompt is pushed out (pre-`df30b4bbd`). | **Four.** On today's tree, a stability question ranks `get_cmc_requirements` 24th and `explain_cmc_topic` 25th of 29. Pinned, and mutant S03 is killed. |
| 5 | No test pinned that a tool is offered once. A carried tool that also scores would be sent twice, and the provider refuses the turn. | **Pinned.** Mutant S06 is killed in 27 tests. |
| 6 | Several planned tests pass on trunk, so they are not red-first. | **Labelled.** `README.md` names each negative control. Its red is its mutant. |
| 7 | The send-message parity edit carries nothing: that door writes no tool trace, and neither does the voice socket. | **Not edited.** The selector hardening covers both doors' latent crash. |
| 8 | The text carry duplicated `buildRetrievalQuery` (`submission-chat-handler.ts`). | **Moot.** The text carry is gone. |
| 9 | The context walker duplicated `AuthoringContextPack`'s shape. Folding `domainTrack` regresses selection: 'device' matches 60 tools. | **Not in this round.** `sectionTitle` folding is its own change, with its own eval. |
| 10 | The false "out of reach" claim appears in more places than the plan corrected. | **Done,** where cold. The send-message copy is handed on. |
| — | The "successful names, most recent first" helper belongs beside `collectTracesFromHistory`, not in the pure selector. | **Done:** `carriedToolsFrom` in `tool-trace.ts`. |
| — | In `stream.ts`, keep the trace-note line untouched and add beside it. | **Done.** One added line; a source-scan test reads that window, and it still passes. |
| — | The wiring test's `domainTrack: 'clinical'` is not in the enum (biotech, device, diagnostics, combination, biosimilar). | **Moot.** The route test sends no authoring context. |

## What the review did not refute

- **The client impact.** The persona orders AnA to call the record tools
  before she states a requirement or drafts a section. On a follow-up, the tool
  she is ordered to use was not offered. `df30b4bbd` keeps those three always
  on. For every other tool, the carry is what keeps it.
- **The priority, high.** Regulatory writers, QA and RA leads work mostly in
  follow-ups. A follow-up that changes the inputs ("and for the EU?", "and as a
  victim?") cannot be answered from the previous answer in the history.
