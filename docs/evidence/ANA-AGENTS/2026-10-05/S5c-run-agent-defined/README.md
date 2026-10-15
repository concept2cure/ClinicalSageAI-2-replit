# S5c (2a) — `run_agent` is defined, classified, and offered only to a turn that hosts agents (row 74)

The delegation tool now exists and is classified. **Nothing offers it yet.**
`governedToolsetFor` withholds it unless the caller passes
`{ hostsSubAgents: true }`, and no caller does until the stream hosts it
(S5c (2b)). A model that names it anyway is answered `AGENTS_NEED_A_LIVE_RUN`
by the runner: no host, no agent.

## What landed

| File | Change |
|---|---|
| `agentic-workflow-tools.ts` | `RUN_AGENT`: the D18 description, every number from `run-control-limits.ts`, stating what the checks do not establish. The handler calls `runSubAgent(input, ctx, ctx.subAgentHost)` |
| `AnaToolExecutor.ts` | `ToolContext.subAgentHost` (set only by the stream on a `run_agent` call; never spread into a child) |
| `AnaToolDefinitions.ts` | `RUN_AGENT` in the enabled list |
| `tool-authorization.register.json` | `run_agent`: class `self` (no tenant record written; ledger rows under the child's run id) |
| `ana-launch-scope.inventory.json` | `run_agent` in scope |
| `governed-write-tools.ts` | `run_agent` in `FREE_TEXT_NON_GOVERNED_TOOLS` with its reason (D26) |
| `agentic-loop.ts` | the step label: `Running a verification agent - "…"` / `Running an agent - "…"`. A `"` in the objective is shown as `'` (D21) |
| `governed-toolset.ts` | `{ hostsSubAgents }`. One rule: `run_agent` is offered only on a hosting turn whose tenant policy was read **strictly** (D25), with `ANA_ENABLE_SUB_AGENTS` allowing it, and never on an org-less turn |
| `tool-trace.ts`, `sub-agent-result.ts` | `'incomplete'` as a trace status, for `run_agent` only. Its summary is built from role, status, budget and verdict, and it has its own section in the next turn's note ("do not re-run the same brief"), apart from the attempts to retry (D16) |
| `useAnaChat.ts` | a reopened thread shows an incomplete agent with the live frame's sentence, not "AnA couldn't finish" |

## Declared behaviour changes

- `ana-launch-scope.test.ts`: the production toolset count excludes
  `run_agent`, which is offered only to a hosting turn. That one assertion was
  edited and is commented in place.
- The tenant tool picker lists `run_agent`. A tenant deny of it is a per-tenant
  kill switch, and that is gated in `governed-toolset-sub-agents.test.ts`.
- The pedigree is not changed (D20).

## Verification

- `red-unclassified.txt`: with the definition in and before the entries, the
  classification gates refused `run_agent` (`tool-authorization` "every
  registered tool has a class"; `ana-launch-scope` "classifies every enabled
  tool").
- `red.txt`: the three new suites against HEAD sources gave 15 red and 5 green
  (the controls).
- `mutations.txt`: 11 mutations, all red. One survived the first pass ("run_agent
  offered to every door"): two filters each withheld it, so removing either
  changed nothing. They were collapsed into one rule. The mutation is now red,
  and so is "a non-hosting door reads strictly".
- Lint: no changed file gained a warning.
- Registration is by the literal `'run_agent'`. The governed-reason scan
  (`governed-reason-not-invented.test.ts`) reads registrations by name and
  went red on the constant. `sub-agent-toolset.test.ts` now pins that the
  literal is `RUN_AGENT_TOOL`. With this change that suite is fully green,
  including the tool it was failing on before, which was fixed upstream.
- Wide run: every AnA service suite, the stream and chat routes, and the
  client AnA and v2 tests. 692 files pass. Before the literal fix, the one
  failure was the scan above. tsc reports 0 errors.
