# AnA runs multiple agents; Manual/Auto is a real run policy (row 74)

Founder-directed on 2026-09-27. This lane moves no D-row, and it is recorded
on the work-order board as the founder's explicit exception to RULE 2.

| Slice | What it fixes | Commit | Evidence | Status |
|---|---|---|---|---|
| S0 | Two calls of one tool in one step swapped their results in the transcript | `97465528b` | `S0-tool-result-pairing/` | landed |
| SG | A mid-call Stop counted as a provider failure and could mark Anthropic unhealthy for every tenant | `b4efbe63c` | `SG-abort-not-a-provider-failure/` | landed |
| S1 | A turn the round limit cut short read as finished | `85cb5654b` | `S1-stopped-reason/` | landed. **Blocked on the live capture** (no model key in this container) |
| S2–S7 | Honest controls, Manual/Auto run policy, sub-agents, client agent rows | — | — | not started |
