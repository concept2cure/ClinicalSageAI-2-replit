# Backend qualification — PM-05

## What already exists

The inventory and frozen placement contract are in [contract.md](contract.md). This slice extends the existing `/api/clients` purpose view, `/api/c2c/projects` create transaction and ONE canonical `program-project-anchor.ts` writer. It introduces no schema, store, workspace directory, intake permission model, client-access grant, or second anchor writer.

## Scope and behavior

- The existing client GET adds `purpose=project-intake`: fresh current creator checks before and after a request-pinned active same-organization workspace query, with actor/organization metadata. Ordinary `/api/clients` and `/all` keep their contracts.
- Create accepts a numeric positive PostgreSQL integer `clientWorkspaceId`. Null, strings, fractional/negative/zero/out-of-range IDs refuse before business SQL. Foreign/inactive/missing explicit IDs never fall back. A supplied `x-client-id` must agree with the evaluated choice; a header alone does not select a workspace.
- Strict intake accepts omission only for one active workspace. Multiple active options require explicit selection even beside a marked organization default. The canonical writer retains legacy default behavior for its other callers, retains the recorded anchor on repeat, and refuses contradictory explicit re-invocation.
- Active owned workspace validation and `FOR SHARE` locks run on the existing program/scaffold/submission/anchor/audit transaction. The creation audit records actual `client_workspace_id`; success metadata supplies the actual saved workspace ID/name and organization/actor.
- An unacknowledged COMMIT or rollback discards the owned connection exactly once and returns `503 PROJECT_CREATE_OUTCOME_UNKNOWN` without asserting rollback or no creation. A confirmed commit followed by a failed/absent projection returns `503 PROJECT_CREATED_DETAILS_UNAVAILABLE`, `created:true`, and committed identity/scope facts.
- Placement preserves the existing sharing policy. Same-organization `org_public` access remains available under that policy; private projects still require existing private-project admission. Workspace selection creates or changes no sharing/client-access/review/signing grant.

## Changed backend sources

- `server/routes/clients-routes.ts`
- `server/routes/c2c/projects.ts`
- `server/routes/c2c/project-intake-workspace.ts`
- `server/services/c2c/program-project-anchor.ts`
- `server/routes/c2c/__tests__/projects-create-anchor.pglite.test.ts`
- `server/routes/c2c/__tests__/projects-create-fixture.ts`
- `server/routes/c2c/__tests__/projects-create.test.ts`
- `server/routes/c2c/__tests__/projects-create-stated-facts.test.ts`
- `server/routes/c2c/__tests__/projects-create-market-offer.test.ts`
- `server/routes/c2c/__tests__/projects-create-eu-device-classes.test.ts`
- `server/routes/c2c/__tests__/projects-create-regional-devices.test.ts`

The shared ID limit/receipt guard lives in the sibling-owned `shared/project-intake-workspace.ts`. Existing positional create fixtures now include the real canonical writer's locked workspace query and an actual detail-row fixture; no canonical writer or creator admission is mocked out by those fixture changes.

## Commands and retained evidence

Commands ran under Node 22.23.3; the final broad run caps Node heap at 4096 MiB.

Fail first, before implementation:

```sh
npx vitest run server/routes/c2c/__tests__/projects-create-anchor.pglite.test.ts
```

[backend-fail-first.txt](backend-fail-first.txt): **10 failed, 7 passed**. The failures exposed ignored explicit placement, implicit marked-default acceptance, invalid/foreign/inactive selection acceptance and missing scope receipts.

Targeted SQL/HTTP and create-route qualification:

```sh
npx vitest run server/routes/c2c/__tests__/projects-create-anchor.pglite.test.ts server/routes/c2c/__tests__/projects-create.test.ts
```

[backend-final-tests.txt](backend-final-tests.txt): **2 files, 63 passed**. This includes real current actor/workspace/program/anchor/chained audit SQL through the existing routers, workspace/request claim boundaries, sole-active versus archived options, creator revocation/inactivity, real audit-write rollback, COMMIT-success/ack-loss and post-commit projection failure. Rollback-ack failure likewise discards once and refuses to claim nothing was saved. The canonical membership uniqueness constraint is retained and its duplicate insertion refusal is asserted.

The SQL fixture stubs the dossier scaffolder and licensed quota. It does not claim to qualify the production scaffold/submission service or native concurrency/RLS. Root-owned native PostgreSQL evidence qualifies those separately.

Final compatibility command:

```sh
NODE_OPTIONS=--max-old-space-size=4096 npx vitest run server/routes/c2c/__tests__/projects-create*.test.ts server/routes/__tests__/clients-routes.tenant-isolation.test.ts server/services/c2c/__tests__/program-project-anchor-strict.test.ts server/services/c2c/__tests__/program-anchor-reader.pglite.test.ts
```

[backend-compatible-tests.txt](backend-compatible-tests.txt): **10 files, 181 passed** on the frozen backend sources. This also preserves filing-offer, regional/product-class, digest readiness, strict anchor-reader and ordinary client tenant-isolation behavior.

Scoped lint:

```sh
npx eslint server/services/c2c/program-project-anchor.ts server/routes/c2c/project-intake-workspace.ts server/routes/c2c/projects.ts server/routes/clients-routes.ts server/routes/c2c/__tests__/projects-create*.ts
```

[backend-eslint.txt](backend-eslint.txt): **0 errors, 14 warnings**, confined to pre-existing long route/test files. The canonical anchor, intake helper and SQL edge test have no lint warnings. Whole-project TypeScript/build/warning-ratchet checks belong to root; no concurrent backend worker ratchet was run.

[backend-core-tests.txt](backend-core-tests.txt) retains the first compatibility iteration (positional fixture adjustments). [backend-sql-edges.txt](backend-sql-edges.txt) retains the initial **25 passing** actual SQL/HTTP edge cases before the final additional boundaries. Later final logs supersede these intermediate results.
