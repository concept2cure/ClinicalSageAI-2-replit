# D3: the control plane gives platform data to platform operators, and an org's data to its administrators

**Row:** D3 (Tenant isolation proven), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
Ledger L183.

**Date:** 2026-09-24.

**Database:** the from-blank PostgreSQL 16 install of
`../2026-09-24-update-boundary/`, reached through `app_service` with
`app.rls_enforce=on` (see that folder's `posture.txt`). The kernel log these
cases read is in process memory, so RLS has no part in it. That is the point:
nothing but the guard stands in front of it.

**What this is not:** the row's closing evidence. That is the contract against
staging, owed with D1.

## What was wrong

`/api/control-plane` (`server/src/routes/control-plane.router.ts`) had one guard,
`requireControlPlaneAccess`, for two different things:

- **Platform-wide data.** The kernel's decision log is process-wide: every
  tenant's request paths, tenant ids and actor ids. Its summaries, its hash
  chain, its audit report, and `POST /kernel/recent/clear`, which empties it.
- **Tenant data.** The caller's org's governed decisions, which
  `requireCallerOrg` already scopes.

The guard admitted any role whose name **contained** "admin". That covers a
tenant's `admin`, a `research_admin` and a `business_admin`, and collapses the
line `requirePlatformAdmin` draws on purpose. Outside production it admitted
**everyone**, unless an operator had set `ANA_ALLOW_NONPROD_CONTROL_PLANE=false`.
So on any staging copy holding real data, every signed-in user read every
tenant's traffic.

## The decision

The ledger row left one question open: is the control plane a
platform-operator surface or a tenant surface? The answer is both, split by
route. Nothing in the client calls this router.

| Routes | Who | Guard |
|---|---|---|
| `/kernel/*` (10 routes), `/governed/health`, `/governed/fabric-version` | Platform operators | `requirePlatformAdmin`, the Master Administration guard. It needs a platform role (`super_admin` / `platform_admin` / `support`) or a platform grant, and has no org-admin bypass. Or monitoring that presents `ANA_OPS_TOKEN`, now compared in constant time. |
| `/governed/decisions`, `/decisions/summary`, `/decisions/:id`, `/trace/:projectId/:artifactId`, `/governed/evaluate` | The caller's org administrators (`admin` exactly, the `organization_users` vocabulary) or platform operators | `requireOrgAdminOrOperator`. The reads stay scoped by `requireCallerOrg`; the evaluator simulation reads and writes nothing. |

The non-production bypass is now **opt-in** (`ANA_ALLOW_NONPROD_CONTROL_PLANE=true`),
and it never applies in production. `.env.example` documents it.

## What the contract shows

`tests/db/control-plane-access.dbtest.ts`, on the shared two-tenant fixture,
goes through the real `authenticateToken` and the real router with
`NODE_ENV=test`, a non-production environment. Tenant B's traffic is planted in
the kernel log before every case, so a case that cleared it cannot hide the
next case's read. The leak assertion comes before the status.

**Red, the old guard: 6 of 10 fail.**

| Case | Old behaviour |
|---|---|
| Tenant A's `admin` reads the kernel log | 200, with tenant B's traffic in it |
| A `research_admin` reads it | 200, with tenant B's traffic |
| Tenant A's `admin` clears it | 200, and tenant B's entry is gone |
| A member, with no bypass asked for | 200, with tenant B's traffic |
| A member reads the org's governed decisions | 200 |
| A wrong ops token | 200, with tenant B's traffic (the default bypass let it through anyway) |

The 4 positive controls pass on both guards: the org's administrator reads its
governed decisions, a platform operator reads the log, the right ops token reads
it, and the bypass works when asked for.

**Green: 10 of 10.** Across the seven fixture suites, 82 of 82.

The governed-decision cases in `tests/db/two-tenant-application-rls.dbtest.ts`
passed with **member** tokens only because of the default bypass. They now run
as each org's administrator, the audience the routes are for. Tenant B's side is
therefore a stronger negative than it was: B's **administrator** sees none of
A's decisions.

## The evidence

| File | What it shows |
|---|---|
| `red/contract-before-fix.txt` | The six failures above, on the old guard. |
| `green/contract-82-of-82.txt` | The seven fixture suites, with the new guard. |

## Reproduce

```
TEST_DATABASE_URL=<owner url> APP_DATABASE_URL=<app_service url> \
  npx vitest run --config vitest.db.config.ts tests/db/control-plane-access.dbtest.ts
```
