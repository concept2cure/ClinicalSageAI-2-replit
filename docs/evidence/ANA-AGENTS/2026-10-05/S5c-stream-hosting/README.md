# S5c (2b) — AnA's stream hosts sub-agents; `/api/agent-swarm` is retired (row 74)

This is the change that makes `run_agent` **reachable**. Everything before it
was inert: the runner existed, the tool was defined and classified, and no
caller offered it. By the founder's row-74 scope, the retirement of
`/api/agent-swarm` lands in the same change ("zero duplication").

Dated 2026-10-11; filed in the 2026-10-05 folder with the rest of the lane.

## What the stream now does

| Rule | Where | Gate |
|---|---|---|
| A turn hosts agents only with a run row whose organization is the request's (D13). The two resolvers disagree on type, so 7 and `'7'` are the same organization | `subAgentsHostable` → `governedToolsetFor(…, { hostsSubAgents })` | `sub-agent-hostable.test.ts` (8 rows); `stream-run-agent.test.ts` (a), (b), (i) |
| Hosting makes the tenant-policy read **strict**: an unreadable policy withholds `run_agent` instead of offering an unattended child every tool (D25, landed in S5c 2a) | `governed-toolset.ts` | `governed-toolset-sub-agents.test.ts` |
| `run_agent` is pinned through relevance trimming on a turn that may use it | `selectToolsForTurn` pins | (a) |
| The host is lent **only** to a `run_agent` call, and only when this turn's governed set contains it and there is a run hold (D14). A tenant deny is therefore a kill switch that fails closed | `subAgentHostFor` | (c), (d); mutations "host attached by name only", "host spread into every ctx" |
| A child's pause binds the **parent's** round (D12): `paused`/`resumed` name the round the person is watching | `hold: runHold.hold(round, …)` | (h), with the pause set from inside the child's own call; mutations "not bound to the parent round", "not taken at all" |
| Agent frames leave as `agent_event` under the **call's** id, whatever the frame itself says, before that call's result | `emit` | (g); mutation "spread the frame last in emit" |
| The model and the client read the agent's result **without** its record-only `trace`; the turn record keeps it whole | `runAgentViewForModel` | (e); mutation "trace left in the view" |
| An agent's own outcome refines a mechanical success: `incomplete` (a budget stop) or `cancelled`. A `{ error }` refusal still wins, and telemetry keeps the mechanical status | `agentTraceStatus`, after `refusalOf` | (j), (k), (l); mutation "status not refined by the agent outcome" |
| `incomplete` is **not** a round failure, so the next round carries no "try an alternative" note | round-failure condition | (j); mutation "incomplete pushed to roundFailures" |
| The person reads one sentence, written in the one place that writes them: "The agent's result is incomplete: `<summary>`." | `stepMessage` / `finishedStep` | (j); mutations "the incomplete sentence is not written", "the sentence ignores the agent's own summary" |
| Provenance comes from the child's successful tools, for a completed agent and one stopped at a budget alike. A failed agent's is dropped | `agentProvenance` | (e), (k); mutation "provenance on success only" |
| **Answer-grounding corpus (D19):** one entry per successful child step, exactly as the child read it (budgeted over its whole round). Never the agent's report, never the checks' echo of the parent's own `text_to_check`, never its notes | `agentEvidenceEntries` | (f), three cases; mutations "the agent view pushed into the corpus", "push checkOutputs into the corpus", "budget only the successful child steps" |
| **End to end, real:** the real handler and runner, the child's model call carrying `parentRunId`, organization 7, an `agent_<uuid>` run id and `riskTier 'high'`, offered no `run_agent`; `finished` precedes the parent's `tool_result` | `stream-run-agent-real.test.ts` | mutation "stub run_agent in the end-to-end test" |

## Two defects this change had to fix, found by typechecking the wiring

1. **A hosted tool could have reached a child.** `SubAgentHost.governedTools`
   was typed `readonly AnaTool[]`, but the governed set is `AnyAnaTool[]` —
   it can hold Anthropic-hosted tools (web search, web fetch, code execution),
   which carry a `name` but no schema and run on Anthropic's own
   infrastructure. `childToolsFrom` now requires the schema, so a hosted tool
   could not reach a child even if it took one of the research names.
   Gated in `sub-agent-toolset.test.ts`.
2. **The person's timeline would have dropped an agent's outcome.**
   `shared/ana/turn-timeline.ts` has its own `StepStatus` union, and its wire
   reader **drops a status it does not know** — so a finished agent step would
   have arrived with no outcome at all, reading as a step that never ended.
   `'incomplete'` was added to that union and to the reader's set, with a test
   that reads it off the wire and a control that an unknown status is still
   dropped.

## Trunk had moved under the plan (six days)

The plan was written against the 2026-10-05 stream. A read-only sweep
(5 agents, `wf_3ee62cb3-5dd`) re-derived the anchors first. What had changed:

- the stream's per-step sentence is no longer written inline — trunk added
  `server/services/ana/step-presentation.ts`, "the one place a step's status
  sentence is written". The `incomplete` sentence went **there**, and
  `finishedStep` reads the agent's own summary from the result, so the live
  frame and a reopened record cannot say different things;
- the dispatch context gained `readReceiptContext`, and the `ran` loop gained
  `usedModel`/`startedAt`; the host and the view were placed against today's
  code, not the plan's;
- `stream.ts` is 390 lines longer, and the corpus loop now budgets
  whole-or-nothing for read receipts.

## `/api/agent-swarm` retired

- **Deleted:** `server/routes/agent-swarm.ts` (1,005 lines), its import and
  mount in `register-advanced-platform-routes.ts`, and its 7-pin entry in
  `scripts/ci/unapproved-model-pins-baseline.json`. A retirement note was
  added to `C2C_ROUTE_SURFACE_CALLER_MATRIX.md` §3.6.
- **History search, and what this clone can prove.** This checkout is a
  shallow clone: 993 commits, the oldest reachable being 2026-09-28. On that
  history, `git log --all --diff-filter=D -- 'server/routes/*swarm*'` returns
  only this change's own deletion, and `git log -S'api/agent-swarm' -- client/`
  returns nothing. So the working agreement's search finds **no earlier
  deletion of an agent-swarm server route, and no client caller, within
  reachable history** — it cannot speak for commits before 2026-09-28. What is
  established directly, by grep over the tree: no client file, mount, baseline
  entry or gate references the route today (the gate asserts the client half).
  Raised by the review as INF-39 and corrected here rather than left as an
  unfalsifiable claim.
- **Replacement, named by path, without overclaiming.** The route advertised a
  submission-drafting swarm with human approval. `run_agent` only reads: it
  cannot draft, compile or approve.
  - "AnA runs several agents at once" → `run_agent`
    (`server/services/ana/agentic-workflow-tools.ts` → `sub-agent.ts`), reached
    from the AnA stream. Gated by `stream-run-agent.test.ts`,
    `stream-run-agent-real.test.ts`, `sub-agent.test.ts`.
  - "Multi-role drafting" → `convene_drafting_council`. Gated by
    `council-tool.test.ts` and its `inScope` entry
    (`ana-launch-scope.test.ts`). Both re-ran green in this change.
- **Defects retired with it:** model calls with no organization (charged to a
  shared bucket), a process-memory swarm map whose `GET` listed every tenant's
  swarms, an approver taken from the request body, and "parallel execution"
  that was a sequential loop.
- **It was served before the deletion** in development and in launch-scope
  report mode, to any authenticated user.
- **Gates:** `server/routes/__tests__/agent-swarm-retired.test.ts`.
  `red-swarm-present.txt` records 3 red before the deletion (the fourth case,
  "no client calls it", is a control that was already true).
  `pins-ordering.txt` records both half-done orderings the pin gate refuses —
  the file deleted with its baseline entry kept ("tighten the baseline to 0",
  exit 1), and the entry removed with the file kept ("7 pins, baseline allows
  0", exit 1) — and exit 0 once both are gone.

## Verification

- `red-stream-at-trunk.txt`: against trunk's stream, 12 of 16 cases red. The 4
  that pass there are negative cases ((c), (d), a failed agent's provenance,
  (l)); their red is the named mutations.
- `mutations.txt`: **19 mutations, all red.**
- The 47 existing suites under `server/routes/ana-ri/__tests__` stayed green
  **unedited** (481 tests); the harness gained additive fields and an opt-in
  tenant scope only.
- `npx tsc --noEmit`: 0 errors. No changed file gained a lint warning
  (`stream.ts` 24 → 24, `register-advanced-platform-routes.ts` 11 → 11).

## One declared test edit

`client/src/concept2cure/components/ana/__tests__/useAnaChat-tool-result-pairing.test.ts`
pins the stream's `tool_result` emit by source. Its regex required
`result: resultStr`; the emit now sends `shown`, which for `run_agent` is the
result without its record-only trace and for every other tool is `resultStr`
itself. The regex accepts either, and says why in place.

## Still not reachable in production, and what must hold first

`ANA_ENABLE_SUB_AGENTS` is off in production until **both** of these are done.
Outside production this change makes sub-agents live.

1. **The S7 live capture and the cost read** (ADR-0015 §2).
2. **The child rate sub-bucket** (ADR-0015 §5), which is **not built**. Raised
   by the review as DP-87, and the earlier wording of this section — which
   named only the capture — was an overclaim. Today a child's gateway calls are
   charged to the organisation's own 100-per-minute bucket with no sub-bucket:
   a worst-case turn is 42 child calls plus the parent's, so a burst of agents
   can exhaust the tenant's bucket and the refusal then lands on the parent's
   next round and on colleagues in the same organisation. The process-wide live
   cap (10) and the per-organisation live cap (8) are built, so cross-tenant
   starvation is bounded; this gap is the tenant's own turn. Nothing mechanical
   ties the environment variable to this evidence — that is a deploy-time
   control, named here so it is not forgotten.

## Known, disclosed, and left to S6 (the client's agent rows)

- **A budget-stopped agent is counted and drawn as a failure on the client.**
  The server says plainly that it is not one, and the row's own sentence is
  right, but `AnaToolCall.status` has no value for it, so the glyph and the
  folded line's "N failed" count it as failed. The Summary header says "did
  not complete", so the two disagree. Reachable outside production now.
- **A `run_agent` step's source reads "Project"** whatever the child actually
  read, because `STEP_SOURCES` has no value for an agent; a research agent that
  searched PubMed, ClinicalTrials.gov and openFDA is counted as a project
  source. S6 draws the child's own steps, which is where its real sources
  belong.
