# D8 — the connector's tenant isolation, proven as the production runtime role

**Row:** D8 (Connector for Claude). **Lane:** `…session_01JNRgCKWRqqJxZ1cJCyxoor`, claimed on
`docs/work-orders/README.md` before the work. **Changed:** `server/mcp/__tests__/mcp-connector.dbtest.ts` only — no
product code. **Closes:** the "owed" item the 2026-09-30 correction of row D8 named: *the two-tenant tool proof as the
runtime role*.

## What was not proven

The launch row said the connector's tools were "tenant-scoped under RLS (`docs/evidence/W7/`)". The suite behind that
claim set `RLS_ENFORCE=on` and connected as the database owner. The owner is a superuser, and PostgreSQL never applies
row-level security to a superuser, so not one query in that suite was filtered by a policy. Its cross-tenant cases
passed on the tools' own `WHERE organization_id = …` alone — which they still do — but they said nothing about whether
the database would hold if a tool lost that filter.

## What is proven now

The suite provisions a fresh **NOSUPERUSER NOBYPASSRLS** role, as `scripts/db/provision-app-role.mjs` provisions the one
production connects as, and the server under test connects through it (`APP_DATABASE_URL`). Its first case asserts
the posture: that role, `rolsuper=false`, `rolbypassrls=false`, `app.rls_enforce=on`. Fixtures are still seeded and
removed through the owner. Its ten cases are unchanged and all pass (`green/first-run-as-runtime-role.txt`, 11/11):
organisation B never sees organisation A's programs, vault documents or sequences, a cross-tenant id is refused, the
governed write is scope-gated, files a draft and is audited with tool and organisation, and the model-backed tool fails
closed.

## Shown failing on the case it exists to catch

`probe.py` → `probe.txt`. It removes the organisation condition from `listPrograms` (the service behind
`c2c_list_projects`) — the "tool forgot its tenant filter" defect — and runs the suite in each posture:

| Run | Cross-tenant case | Posture case | What it shows |
|---|---|---|---|
| filter removed, **runtime role** | **passes** | passes | B still never sees A's program: the database contained the leak. RLS is live on the connector's path. |
| filter removed, superuser | **fails** | fails | The leak is real — so in the first run it was the policy, not a vacuous test, that held. |
| filter intact, superuser | passes | **fails** | Reverting the suite to the owner connection is itself caught. |

So the claim the row made is now true: on the connector's path the database itself refuses cross-tenant rows, under
the role production runs as. A dropped application filter would be contained in production; it is caught statically by
`ci:tenant-isolation` / `ci:drizzle-tenant-scope`, not by this suite, which now tests the database's guarantee.

## Runs

| File | |
|---|---|
| `green/first-run-as-runtime-role.txt` | The suite's first run as the runtime role: 11/11. |
| `green/connector-dbtests.txt` | With `mcp-account-standing.dbtest.ts`: 25/25. |
| `green/connector-unit.txt` | Every connector unit suite: 34/34. |
| `probe.py`, `probe.txt` | The three-run probe above; every file restored afterwards. |

Real PostgreSQL 16 + pgvector, built as CI builds it (blank → `install-fresh` → `deploy-migrate`), migrated to trunk
`747f7c688` on 2026-10-01.

## What D8 still owes

Staging (with D1), a second machine's Claude client calling the readiness tool against staging, and the directory
submission. None of them is code in this repository.
