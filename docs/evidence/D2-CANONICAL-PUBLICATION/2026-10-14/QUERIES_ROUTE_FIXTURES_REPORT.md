# Mounted projection fixture integration

Lead-approved delegation from the route owner extended the query session to only `server/routes/c2c/__tests__/projects-sources-window.test.ts` and `server/routes/__tests__/vault-data-room-counts.test.ts`. The initial lead combined run recorded 3 source-window and 8 Data Room count projection failures because mounted fixtures omitted the canonical authenticated request client/current actor/private parent. Existing production query and authority files stayed frozen.

Both fixtures now mount an authenticated request and explicit request database client. Canonical actor, active organization/user, unique program anchor and private sharing queries execute on real synthetic PGlite tables. Source page/stage projection values remain mocked to isolate the window/count/readability behavior that these suites test. The counts suite asserts the migrated `listClientDocuments(q, organizationId, {userId,...})` contract instead of the obsolete two-argument projection.

Each suite adds two refusal controls. A persisted organization viewer without private sharing remains refused even when the request claims `super_admin`; neither source page nor hidden stage count is read. Omitting the request client returns unavailable before the projection instead of silently using a pooled client. No current actor or parent helper is mocked, and no production permission code changed.

Focused result: 15 passing tests across the two mounted route suites, retaining original pagination/currency, processing readability, full-project stage counts, classification refusal and filed-version checks. Evidence: `queries-route-fixtures-focused.log`, `queries-route-fixtures-lint.json` and the two-file hash manifest `queries-route-fixtures-owned-sources.json`. PGlite verifies persisted application policy here; SQL-role RLS, concurrent production behavior and deployment remain outside this projection proof.

The two test files are frozen for lead integration. No type jobs, staging, commits, pushes or provider operations were run by this delegated fixture owner.
