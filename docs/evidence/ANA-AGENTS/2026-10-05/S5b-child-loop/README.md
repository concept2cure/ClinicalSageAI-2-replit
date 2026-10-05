# S5b (2) — the sub-agent child loop and its caps (row 74; ADR-0015 §2, §5, §7)

`runSubAgent` starts one bounded, read-only child loop and waits for its
report. Nothing calls it yet: `run_agent` is registered, offered and hosted by
the stream in S5c. This slice is the runner and the gates it has to pass.

## Files

| File | What it holds |
|---|---|
| `server/services/ana/sub-agent.ts` | `runSubAgent`; the `SubAgentHost` the stream will lend; the child ToolContext (field by field); the active-time timer; the harness checks; the child request; the cancel mapping |
| `server/services/ana/sub-agent-limits.ts` | `subAgentsEnabled` (kill switch); `RESEARCH_TOOLS` (17, by name); `childToolsFrom`; brief validation; the turn, round, organization and process caps |
| `server/services/ana/sub-agent-shape.ts` | The full result (record), the model/client view without `trace`, failure classification, `AGENT_FAILED` |
| `server/services/ana/sub-agent-result.ts` | (S5a) the check readers and the verdict |

## What is enforced, and the gate for each

| Rule | Where | Gate (`sub-agent.test.ts` unless named) |
|---|---|---|
| Off in production unless `ANA_ENABLE_SUB_AGENTS=true`; `false` turns it off anywhere (ADR-0015 §2) | `subAgentsEnabled` | "the switch"; mutation "switch on in production by default" |
| A child cannot start an agent | depth check; `run_agent` is not in `RESEARCH_TOOLS`, so the allowlist answers it `TOOL_NOT_OFFERED`; rule 0 | "a child cannot start an agent"; "a write and run_agent are answered, not run"; `sub-agent-toolset.test.ts` |
| No live run, no agent | `AGENTS_NEED_A_LIVE_RUN` | "no live run, no agent" |
| Tenant: no scope, the system scope `'0'`, another tenant, or a host of another organization all refuse (D24) | `tenantMismatch` | four cases; mutations "tenant check removed", "host org agreement dropped" |
| Child ⊆ parent, by tool name; nothing that writes, calls a model, reads a path or delegates | `childToolsFrom`, `allowedToolNames` | `sub-agent-toolset.test.ts` (26); mutations add a path reader, a model-backed tool or a write tool, or skip the intersection |
| The child context carries nothing of the parent's (`humanConfirmed`, a host, Live Drive …): depth 1, model calls refused, its own signal (D11) | `childContext` | "read-only, model-refusing context"; mutation "child ctx spreads the parent ctx" |
| Every child model call is `regulatory_review` / `riskTier 'high'`, under `agent_<uuid>` and the parent's run id, with the organization stated, no user, and no pin but the tier's (never the parent's override) (D7) | `runChildLoop` | "every child model call is high-risk review"; mutations parentRunId, riskTier, userId, override |
| A verify agent's checks run on the text as given, read-only, inside the refusal scope, **before** any child model call; the verdict comes only from them; no harness-written field says "verified" | `runHarnessChecks` | "a verify agent"; mutations "checks outside the refusal scope", "a child model call before the checks" |
| 6 per turn; 4 per round; 8 live per organization and 10 live per process (**per server process**); a refusal changes no count | `claimAgentSlot` | "caps" (4 tests); mutations "turn count taken before the org check", "process cap dropped" |
| Tokens: about 200,000, soft by up to two calls (D23) | `childStopWhen` | "the token budget" asserts ≤ budget + 2 × the largest call |
| Rounds: 6, no extension | loop options | "the round limit" |
| Active time: 180 s, time held for a person excluded; a call in flight at the limit is aborted | `createActiveTimer` in the child's signal | "a call still running at the active-time limit is aborted" (fake clock); "excludes time held"; mutations "timer not in the child signal", "held time counted as active" |
| A pause delays the first call; a run that will not resume starts nothing; a cancel or expiry between rounds is `cancelled`, never a time budget | `holdFor`, `cancelStatus` | four tests; mutations "no pre-start hold", "hold outcome ignored", "expiredSignal not in the child signal" |
| Never throws: failures are `AGENT_FAILED` with a code; the slot is released and `finished` emitted on every path (D8, D9) | `runSubAgent` try/catch/finally | "failures are a result" (5); every test's `afterEach` asserts 0 live agents; mutation "slot released outside finally" |
| The record keeps every step whole; the view drops `trace` | `shapeAgentResult`, `runAgentViewForModel` | "the record and the view"; mutation "trace left in the view" |

## A defect the tests found in the first draft

A run cancelled while a child waited on the hold was reported as
**incomplete, time budget**. The cancel mapping read only the abort signals,
and the hold's own `'cancelled'` answer aborts none of them. The hold's answer
is now read first. Two tests pin it (pre-start and between rounds), and so
does the mutation "hold outcome ignored".

## Verification

- `red.txt`: on the tree before this change, the module did not exist.
- `mutations.txt`: 22 mutations of the runner, caps and shape, plus 5 of the
  toolset. All red.
- Green: `sub-agent.test.ts` (33), `sub-agent-toolset.test.ts` (26) and
  `sub-agent-verifiers.test.ts` (27).

## Not in this slice, and why it is safe to land without it

- **The model-call refusal guards at the three bypass chokepoints** (brief
  §9: `AIProviderRouter.route`, `CrossEncoderReranker.score`,
  `AdvancedRAGPipeline.routeCached`). Today no `RESEARCH_TOOLS` path reaches
  them in refuse mode. They are required before `run_agent` is reachable, and
  they land in S5c's slice before the registration.
- `run_agent` registration, stream hosting, `agent_event` frames, the
  grounding-corpus fix (D19), `'incomplete'` in the trace, and the agent-swarm
  retirement: S5c and S5d.

## Disclosed bounds

- The caps are **per server process**. The real organization bound is 8 × the
  number of processes (ADR-0015 §5 makes a cross-process lease a D1 item before
  scale-out beyond two instances).
- Embeddings are not refused and not counted in the token budget.
- Research handlers' network calls do not all honour the abort signal. On a
  timer or expiry abort they may finish in the background. The round stops
  waiting at once, and the slot is released in `finally`.
