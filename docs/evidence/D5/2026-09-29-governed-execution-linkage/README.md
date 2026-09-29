# D5 — a governed action's audit trail says what was authorised and what came of it (2026-09-29)

**Row:** D5 (Part 11 records), with D6 (the model ledger). **Workstream:** W2 gateway scope, AnA local-safe-AI plan WS3
remainder (a). **Builds on:** `../../D6/2026-09-26-model-ledger/` and its review round.

Every agent write command is propose-only, and every confirm-class tool (including `run_python_script` and
`run_in_container`) runs only on a person's yes. Both execute in exactly one place: `POST /api/ana-ri/governed-action`
(`server/routes/ana-ri/utility.ts`). That route writes the Part 11 record of the act.

## What was wrong (at `aadbde6a`)

1. **The sign-off row did not say what was authorised.** Its details were the command, the tier, the reason, and the
   e-signature facts. They did not name:
   - the run or the tool call it answered;
   - the model call that proposed it;
   - the params the person approved. A row could not be shown to cover the params that actually ran.
2. **Nothing was written after the action ran.** The trail could not tell an action that ran from one its own gate
   refused, or from one that threw. MCP records each call's outcome and duration (`server/mcp/tools/runtime.ts`); this
   route, where every governed AnA act executes, did not.

## What is true now

- **The sign-off row carries a trace** (`governedActionTrace`, `server/routes/ana-ri/governed-execution-audit.ts`):
  - `runId` and `toolUseId`;
  - `gatewayRequestId` and `servingModel`, from the held row's `proposedBy` and never from the request body. They join
    the row to its `ai.gateway_audit_log` row;
  - `paramsSha256`: the turn record's canonical hash of the params authorised, so the row joins the turn's step.

  A command posted without its run records null for the run and the model call, rather than a claim.
- **A second row, `ana.governed_action.executed`, follows every execution**, through the shared `recordAuditRow`.
  - It carries `outcome` (`ok`, `refused` when the command's own gate said no, or `failed`) and `durationMs`, with
    `resultSha256` or the error, beside the same trace.
  - If that row does not persist, the result carries the canonical lost-row notice (`AUDIT_ROW_NOT_PERSISTED`), both to
    the person and to the waiting run. A failure whose row was lost says so in its error envelope.

## Red and green

| What | Red (`aadbde6a` route) | Green |
|---|---|---|
| `governedActionConfirmTier.test.ts`, seven new cases (trace, executed row, refused, failed, lost row on success and on failure, no-run command) | 7 of 7 fail | pass |
| The same file's existing cases that count audit rows (confirm, reason, tool, e-signature) | 4 fail: one row, where there are now two | pass |

Totals: `red/route-tests.txt` 11 of 39 fail; `green/route-tests.txt` 39 of 39 pass. `green/suites.txt` covers routes/ana-ri,
services/ana-ri, services/ana and mcp, with 0 failures. `green/typecheck.txt` reports 0 errors.
`ci:discarded-audit-write`: no new occurrences.

## Not done

- **A tool AnA runs without a person's yes gets no per-call row.** That covers the read class and anything ungoverned. The
  turn record (`ana.turn.recorded`, one chained row per turn, with every step content-addressed) is its record. A per-call
  row in `registerToolHandler` would duplicate it, and MCP's own row.
