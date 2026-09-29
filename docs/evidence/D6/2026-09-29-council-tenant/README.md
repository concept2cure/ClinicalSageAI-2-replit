# D6 — the drafting council runs for one tenant, and its tables are that tenant's (2026-09-29)

**Row:** D6 (with D3's tenant isolation). **Workstream:** W2 gateway scope, AnA local-safe-AI plan WS3 remainder (b).
**Corrects:** a claim in `../2026-09-25-tenant-boundary/`, namely that the council passes `organizationId`. It passed the
key, and the value was `undefined` on every call.

`convene_drafting_council` is in the launch scope. Its tool is listed in-scope in
`server/services/ana/ana-launch-scope.inventory.json`, and `migrations/20260724_lumen_council_provisioning.sql` is on the
deploy applier. It writes a tenant's draft text, the numerical claims in it, and the verdicts on those claims into three
lumen tables.

## What was wrong (at `ba995b20`)

1. **The tenant was bound only ambiently.** `executeLLMWithFailover` passes `organizationId: options?.organizationId`, and
   none of the four agents' calls (Drafter, Statistician, Critic, Synthesizer) passed one. So every council model call reached
   the gateway with `organizationId: undefined`, and placement fell back to the ambient tenant scope.
   `ci:ai-tenant-binding` checks that the key is present, not its value, and does not scan this file.
2. **Nothing recorded the tenant.** `initializeSession` wrote no organization, and its one caller had one in hand.
3. **The tables had no tenant column.** `lumen.council_sessions`, `lumen.agent_executions` and `lumen.data_verifications`
   (`input_text`, `output_text`, `claim_text`) had no tenant column. So no RLS policy attached, and no tenant's rows could be
   attributed, exported or purged. In `red/database.txt`, on real PostgreSQL 16, all three show no column, no RLS and no
   policy.
4. **The canonical RLS sweep read `public` only.** So an integer tenant key outside `public` could never be policied.
   `rls-coverage-check.sql` scans every schema, so such a table would be a CI failure.

## What is true now

- **The tool refuses a call with no organization,** before anything is read or written. The refusal says the council was not
  convened.
- **`initializeSession` requires the organization** and records it. All four agents' model calls pass the session's
  `organization_id` by value, so the ledger's `tenant_bound_from` is `explicit`.
- **Execution and verification rows take their tenant from their session's row**, inside the INSERT (`INSERT … SELECT
  s.organization_id … FROM lumen.council_sessions s`). The tenant is recorded in one place, and under RLS a session is
  visible only to its own tenant.
- **The creating migration is amended in place with a dated note (Rule 1).** It adds `organization_id INTEGER` to all three
  tables: in `CREATE TABLE`, and by `ADD COLUMN IF NOT EXISTS` with a guarded FK and an index. `NOT NULL` is set only when no
  row lacks the column, following the `20260821_regulatory_twin_simulations_tenant_scope.sql` pattern.
- **The canonical sweep is amended in place with a dated note.** It names the three tables in `nonpublic_integer_tables`,
  which both of its selection passes read beside `public`. That keeps one policy shape and one file, and the policy is the
  canonical one: it is not written by hand in the creating file.

## Red and green

| What | Red (`ba995b20`) | Green |
|---|---|---|
| `multi-agent-council.test.ts`: session records its org; a session with none refused; every model call names it; all four agents pass it; execution and verification rows take it from the session | 5 fail | pass |
| `council-tool.test.ts`: a call with no organization refused before the database | 1 fails (it ran to `not_provisioned`) | pass |
| Real PostgreSQL 16, empty database, migration and sweep applied twice | `red/database.txt`: no column, no RLS, no policy on any of the three | `green/database.txt`: column, RLS forced, `tenant_isolation_policy` on all three; the second run adds nothing |
| As a non-superuser, non-`BYPASSRLS` role, `app.rls_enforce=on` | — | tenant 1 writing a tenant-2 session is refused by RLS; each tenant reads only its own sessions and executions |
| Upgrade: pre-change tables holding a row | — | `green/upgrade.txt`: column added; the row cannot be attributed, so the column is left nullable with a notice; neither tenant can read the row |

The gates are in `green/gates.txt`:

- migration set order and drop safety;
- RLS allowlist sync and tenant column types;
- tenant isolation (no regression);
- column and migration reachability, and runtime DDL;
- insert columns and the manifest;
- AI tenant binding, gateway bypass and discarded audit writes.

All pass. The suites and the typecheck are in `green/suites.txt` and `green/typecheck.txt`.

A wider run of the suites caught one regression in this change before it was committed.
`tests/schema-contract/c2c-apply-path.contract.test.ts` applies the C2C set on its own, and on that path this file runs before
`organizations` exists, so the FK failed. The FK is now added only where `organizations` exists, and every deploy's replay
adds it once that table is there. The case passes (`green/suites.txt`), and `green/database.txt` shows all three FKs where
the table exists.

## Not done

- **Tenant export and offboarding do not yet list the three lumen tables.** They now carry `organization_id`, so a tenant's
  council rows can be attributed; the export and purge registries are a separate lane's
  (`docs/work-orders/README.md`, "D6 — tenant offboarding: the purge"), and this is handed on there.
- **Rows written before this change stay unattributed.** No tenant can see them (see the upgrade run). No deployed database
  holds any, since D1 is not applied.
