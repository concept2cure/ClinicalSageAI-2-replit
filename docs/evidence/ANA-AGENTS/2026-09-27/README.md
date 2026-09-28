# AnA runs multiple agents; Manual/Auto is a real run policy (row 74)

Founder-directed on 2026-09-27. This lane moves no D-row, and it is recorded
on the work-order board as the founder's explicit exception to RULE 2.

| Slice | What it fixes | Commit | Evidence | Status |
|---|---|---|---|---|
| S0 | Two calls of one tool in one step swapped their results in the transcript | `97465528b` | `S0-tool-result-pairing/` | landed |
| SG | A mid-call Stop counted as a provider failure and could mark Anthropic unhealthy for every tenant | `b4efbe63c` | `SG-abort-not-a-provider-failure/` | landed |
| S1 | A turn the round limit cut short read as finished | `85cb5654b` | `S1-stopped-reason/` | landed. **Blocked on the live capture** (no model key in this container) |
| S2 | Home's engine pill was never sent; any enabled model could be pinned without an approved-models entry, and a refused pin was dropped silently | — (uncommitted when filed) | `S2-honest-controls/` | built and gated in the working tree; not committed. No live capture of its own |
| S3 | The primitives S4 and S5 stand on (loop `stopWhen`/`roundCap`/`'replan'`, executor options, the pause wait moved into one shared `createRunHold`, `holdForPerson`/`endHeldRun`, the model-call refusal scope, wrapper rule 0), all off for callers that do not opt in; and two honesty fixes: a failed read no longer makes `check_dossier_consistency` answer "no issues", and `project_knowledge_search` has a model-free mode | — (uncommitted when filed) | `S3-primitives/` | built and gated in the working tree; not committed. No user-visible surface; the lane stays blocked on its live capture |
| S4 | There was no Manual/Auto. Now `run_policy` is read by the stream's budget, stop directive, hold and checkpoint, and never by the approval gate. Manual holds before each further step and runs it only on a person's answer. A hold nobody answers ends the turn, and a hold that cannot be made fails closed. Every unrun held step is on the record and in the dossier. Auto runs to 20 rounds / 15 min of work / 40 min in all, and never approves. A separate "Between steps" control, and the run-control strip on the conversation screen. A 45-point review was worked through, red first | — (uncommitted when filed) | `S4-manual-auto/` | built and gated in the working tree; not committed. **Blocked on the live capture** (no model key or database) |
| S5–S7 | Sub-agents, client agent rows, evidence and board | — | — | not started |
