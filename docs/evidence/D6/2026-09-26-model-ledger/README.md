# D6 — every AI ledger row says what the call carried and under which governance (2026-09-26)

**Row:** D6, W2 gateway scope. **Workstream:** WS3 of the AnA local-safe-AI plan (the model ledger; OQ-PL-10 in §9).
**Builds on:** `../2026-09-25-tenant-boundary/`, `../2026-09-26-egress-tools/`, `../2026-09-26-refusals-are-final/`.

`ai.gateway_audit_log` is the ledger of every AI call on the platform. A residency- or retention-constrained tenant asks
it one question: *where did my data go, and why was that allowed?* Before this change it could not answer.

## What was wrong (at `1500beca`)

1. **A served row carried no governance, only the model and the lane's placement.** Nowhere on the row were:
   - the payload's provenance or PHI/PII class;
   - how the tenant's placement policy resolved, or how the tenant was bound;
   - the approved-models entry that served the call, its pinned version, or its PQ status;
   - the declared risk tier, the AnA run, or the Anthropic-hosted tools that ran or were withheld.

   Some of these sat in the row's `metadata` JSON; most were nowhere.
2. **An allowed call's placement decision went only to a log line.** It was logged at `gateway.ts:1795`
   (`log.info('[ai-gateway] sensitive placement decision'`) and never reached the row.
3. **The prompt hash ignored image and document blocks** (`gateway.ts:3672`, `hashPrompt`). Two requests differing
   only in the scan or PDF they carried hashed the same.
4. **The region column recorded the requested residency, whatever served the call** (`gateway.ts:3517`). An on-prem
   call for an EU tenant read as `eu`.
5. **A governed record could not be traced to the model call that produced it.** An agent mutation's Part 11 audit
   row (`mdx-tool-policy.ts:400`, `agentAuditDetails`) named the agent's reason and the chat thread, but not the
   gateway request or the model.
6. **Every AnA run was closed as ending for want of tools** (`stream.ts:2658`). That included a run stopped at its
   round ceiling or by the thrash guard: the loop's result was discarded at `stream.ts:2467`.
7. **Every council execution row said `gpt-4-turbo`,** whatever served it (`multi-agent-council.ts:1258`).
8. **No gate checked the ledger INSERT's columns.** `ci:insert-columns-declared` compares against Drizzle models, and
   this table has none. The readiness probe checked only that the table existed and was writable. A deploy that ran
   ahead of the migration would have failed every INSERT inside the writer's catch while the probe reported the ledger
   ready.

## What is true now

- **Typed columns on every row**, served or refused:
  - `payload_provenance`, `data_class`, `tenant_policy_resolution`, `tenant_bound_from`, `risk_tier`, `run_id`,
    `parent_run_id`;
  - on a served row, also `placement_reason_code` (the decision that allowed it: `ALLOW_…`, or `audit_only:…` where the
    screen only recorded), `approved_model_id`, `pinned_version`, `pq_status` (`unregistered` when no registry entry
    matches; never a guessed entry), `server_tools_used` and `server_tools_withheld`;
  - on a refusal row, `placement_reason_code` is the `DENY_…` code.

  They are added in `db/migrations/20260813_ai_gateway_audit_log.sql`, amended in place with a dated note (Rule 1),
  both in `CREATE TABLE` and by `ADD COLUMN IF NOT EXISTS`, with an index on `run_id`. The metadata keys WS1 and WS2
  used for the same facts are gone. One definition: `ledgerProvenance` in `gateway.ts`, and `approvedEntryFor` in
  `approved-models.ts`, which the high-risk check now shares.
- **The prompt hash covers content blocks** (a digest of each image or document source). A text-only prompt hashes
  exactly as before, so existing rows stay comparable.
- **The region is the lane's:** `on_prem` for self-hosted; the requested residency only when the lane serves it;
  otherwise every region the lane claims.
- **Part 11 linkage.** `servedModelOf` carries the gateway `requestId`. The tool context, the platform-command tool,
  and the streamed answer's command blocks (through post-processing) all carry it into the command context.
  `agentAuditDetails` writes `gatewayRequestId` and `servingModel` into every agent mutation's audit row. A command a
  person typed records `null` for the request id and for both halves of the model.
  - `servingModel` has one shape, `{provider, model}`: the one `place_project_document` already wrote (the D5 fix).
    That tool now passes its model through the helper instead of overriding the key, so its rows gain the request id
    too.
- **Runs:** the stream keeps the loop's result, and `endRun` records `max_rounds`, `duplicate_thrash`, `cancelled` or
  `no_more_tools` as the loop reported.
- **The council** records `provider/model` as the gateway served it, or `null` when nothing was reported.
- **The ledger's columns are guarded twice.**
  - The INSERT is one static statement (`LEDGER_INSERT_SQL`), and `LEDGER_COLUMNS` is derived from it.
  - The readiness probe refuses a table missing any of them, and names the missing columns.
  - `ledger-migration.test.ts` checks that the migration creates each one, on a fresh database and on an existing
    table.

## Red and green

| What | Red (`1500beca`, every WS3 source file at HEAD) | Green |
|---|---|---|
| `ledger-provenance.test.ts`: served and refusal rows, hash, region | 8 of 9 fail; the text-only hash case passes, by design | 9 pass |
| `audit-tenant-scope.test.ts`: probe checks columns | 2 new cases fail | 7 pass |
| `model-call-linkage.test.ts`: Part 11 linkage, run stop reason, council model | 8 of 8 fail | 8 pass |
| `tenant-placement-boundary.test.ts`: served row's binding as typed columns | 1 fails | 22 pass |
| `document-placement-tools.test.ts`: a placement row names its gateway request | 2 fail (the exact-shape case and the new request-id case) | 16 pass |
| `ledger-migration.test.ts`: migration creates every inserted column | `red/insert-gate-mutation.txt`: with `run_id` removed from the migration, `ci:insert-columns-declared` still passes (it cannot see this table), and this test fails on both halves | 3 pass |

Totals: `red/ws3-tests.txt` has 21 of 62 failing. `green/ws3-tests.txt` lists the 65 cases of the six files above and
the kernel risk-tier source pin; the run, which includes the rest of `high-risk-model-approval.test.ts`, is 90 of 90.
The gates are in `green/gates.txt`, the typecheck in `green/typecheck.txt` and the wide suite in
`green/wide-suite.txt`.

The first wide run caught two regressions in this change, both fixed before commit:

- **The source pin on the kernel's `riskTier`** reads 700 characters from each `gw.route({`. The new `runId` line
  pushed `riskTier` out of that window. `runId` now follows `riskTier` at both dispatches.
- **The placement tool's audit row** was pinned by an exact-shape test, and `agentAuditDetails` had first written
  `servingModel` as a `provider/model` string. That shape is unified (above).

## Not done, and why

- **Images are hashed but not yet classified before dispatch** (plan layer 7). An image with no OCR text would classify
  `unknown`, which the sensitive-placement gate refuses where enforced, so every vision request would be refused. That
  change belongs with the render step that supplies OCR text (WS13), not here.
- **AnA's own tool executions still get no per-call Part 11 row, and the council's sessions table has no org column.**
  Both are WS3 items in the plan that change other tables' migrations. They are left for the next change.
- **The ledger is still mutable and can be switched off** (`auditEnabled`), by design (see the migration's "Why this
  table is NOT immutable"). The Part 11 record is the chained `audit_logs` row, which now carries the gateway request
  id (plan open decision 9).
