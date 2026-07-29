# MDx Endpoint Security Matrix

## Status and scope

This is a fail-closed inventory summary, not a completion claim. Routers include `server/routes/mdx.ts`, every `server/routes/mdx-*.ts`, and `server/routes/ana-mdx-context.ts`; related program, 510(k), PMA, predicate, eSTAR, submission, artifact and audit routes mounted elsewhere are also in scope.

| Family | Methods/path source | Authentication | Tenant/program/link validation | Actor/audit | Evidence status |
|---|---|---|---|---|---|
| IVDR | `mdx-ivdr.ts` | global/local middleware requires dynamic mount proof | organization filters visible; foreign parent/artifact tests required | mutation-by-mutation audit durability unproven | incomplete |
| performance | `mdx-ivd-performance.ts` | same | program ownership and soft-delete coverage require proof | real actor/durable audit unproven | incomplete |
| CLIA/CDx/LDT | `mdx-clia.ts`, `mdx-cdx.ts`, `mdx-ldt.ts` | same | two-tenant tests incomplete | incomplete | incomplete |
| 510(k)/predicate/eSTAR | MDx and related routers | same | subject/program/cache isolation unqualified | governed artifact/audit sequence unqualified | incomplete |
| shared MDx resources | remaining `mdx-*.ts` routers | same | endpoint-by-endpoint review outstanding | endpoint-by-endpoint review outstanding | incomplete |

No endpoint is marked complete. Before beta, generate a method/path-level inventory from actual Express mounts, prove the `/api` gate order, and add two-organization tests for every material mutation and linked identifier. Not-found behavior must not disclose foreign resources, and required audit failure must fail the mutation.

## Remediated endpoint evidence

`PUT /api/ivdr/clinical-evidence/:id/results` now requires an attributable authenticated actor and performs its tenant-scoped current-record update plus immutable result-history insert in one SQL statement. A missing or foreign tenant-scoped row returns 404 and cannot create orphan history. Stubbed route tests prove missing-actor and missing-row failures issue no false success; live database/RLS and audit-service qualification remain outstanding.

`POST/PATCH /api/mdx/ivdr/classifications` and `POST/PATCH /api/mdx/ivdr/per` now reject foreign supplied regulatory-program IDs before persistence. PER create/reassignment also rejects foreign artifact IDs. Stubbed two-tenant-equivalent ownership tests prove that foreign links do not reach the regulated mutation query. Live PostgreSQL/RLS qualification and the remaining IVDR resource families are still incomplete.
