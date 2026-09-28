# The audit chain writer takes its head from the table it writes

**Row:** D5 (the Part 11 audit trail: every governed action leaves a
tamper-evident record). **Session:** `…01AiwZKG`. **Date:** 2026-09-24.

## What was seen

In one of four full real-database runs, `tests/db/licensing-history.dbtest.ts`
failed its three integrity cases: `verifyAuditChain({ tenantId: 0 })` reported
the system audit chain broken. In `audit_logs`:

| chain_seq | written | action | commits to |
|---|---|---|---|
| 43 | 20:43:00.632 | `user_password_changed` | 42 |
| 44 | 20:43:00.634 | `user_password_reset_failed` | 43 |
| 45 | 20:43:11.031 | `data_modify` / `module_packaging` | **43**, not 44 |

Rows 43 and 44 are the two racing requests of "two resets racing one token"
(`tests/db/one-time-credentials.dbtest.ts`). Row 45 is the first write of
`tests/db/master-licensing-console.dbtest.ts`.

## Why

The writer (`takeChainPosition` in `server/services/audit/chain.ts`) orders the
head by `chain_seq` only once `chainOrderColumnPresent` has confirmed the
column exists. That check asked whether `audit_logs` in **`current_schema()`**
has `chain_seq`. `current_schema()` is only the first schema on the
connection's search_path that exists. It is not necessarily where the
unqualified `audit_logs` that every statement names resolves.

`master-licensing-console.dbtest.ts` sets its runtime role's search_path to
`<private schema>, public`, which is legitimate: it applies a migration's
functions into a private schema. On those connections the check answered "no
chain_seq". Under vitest the writer then fell back to the pre-fix head order,
`occurred_at DESC`. The two racing resets had stamped `occurred_at` before
queuing on the chain lock, so row 44 carried the earlier time. The fallback
read row 43 as the head, and the chain forked.

Every full run printed the fallback's one-time warning ("audit_logs.chain_seq
is absent in this test fixture") from that suite, including the runs that
passed. The fork needs the fallback **and** a tenant-0 pair whose `occurred_at`
order is inverted, so it showed up once in four runs.

Outside vitest the same check throws `AuditChainSchemaMissingError`. So any
production connection whose search_path put another schema first — a schema
named like the runtime role, which the default `"$user", public` would pick up,
or a session `SET search_path` left on a pooled connection — would have failed
every audit write on it. Nothing does that in production today (every
`SET search_path` in the migration set is a function-level clause). The
check was still asking the wrong question.

## The change

`chainOrderColumnPresent` asks about `to_regclass('audit_logs')`: the table
this connection's unqualified name resolves to, which is the table the head
read, the INSERT and the verifier all use. Same answer on a normal connection,
right answer on a skewed one. The verifier's read uses the same check, so it is
fixed by the same line. `chain.test.ts`'s fake client matched the old query
text and now matches the new one.

## Proof (PostgreSQL 16)

`server/services/audit/__tests__/chain-concurrency.dbtest.ts` gains case 4. Two
rows are written whose `occurred_at` order is the reverse of their commit
order, as the racing resets produced. A third row is then written on a
connection that starts with `search_path = chain_elsewhere, public`, as a
role-level setting does. A pool whose client was already checked would hit the
cache and hide the bug.

| Stage | Result |
|---|---|
| Without the fix | 3 passed, **1 failed**: the third row commits to the first, skipping the second, the same shape as row 45 (`red.txt`) |
| With the fix | 4 passed (`green.txt`) |
| Full real-database suite, before | 4 runs, the fallback warning printed in every one; one run 680/683 on this fork (`full-suite.txt`) |
| Full real-database suite, after | 684/684, **0** fallback warnings |
| Audit and governed-write unit suites (chain, sweep, ledger routes, licensing history, c2c routes, commitments, integrity monitor gate) | 49 files, 411 tests pass |
