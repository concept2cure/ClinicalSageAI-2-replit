# Shared workspace request context: validation and explicit failure

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `1aa22ba92418682b86e757fc409411d1bca4b55d`  
Plan: F1; completes `server/routes/workspace-config.routes.ts`.

## What already exists

- `server/routes/workspace-config.routes.ts`: the mounted config, project-map and selection-catalog reads. The config catch returned a pure document-only result after any enrichment exception, discarding selected region/client context while reporting success.
- `server/services/regulatory/workspace-config-enrichment.ts`: existing region/client and best-effort license enrichment. Unchanged; absent or failed license assessments remain unassessed, never new grants.
- `shared/regulatory/workspace-config.ts` and `project-map.ts`: existing one-workspace and capability-inventory projections. Unchanged; no new resolver.
- `shared/regulatory/region-profiles.ts` and `client-type-profiles.ts`: the existing overlay vocabularies. Reused for explicit-selector validation, not duplicated. These records do not certify a filing market.
- `server/utils/authedOrgId.ts`: authenticated tenant selection and its existing stricter usableOrgId helper. Reused; JWT verification remains in authMiddleware.
- `server/bootstrap/register-inline-routes.ts`: existing mount. Unchanged.
- `tests/routes/workspace-config.test.ts`: existing successful projection and missing-context cases. Retained unchanged.

CLAUDE.md, AGENTS.md and the existing plan were reviewed; the ledger's unchanged blob is `c31204881d6b226c7058da1a7ced696163291e92` (F1 is open). Connected searches covered route registration, context resolution and existing tests. Container DNS prevented a repository clone/deleted-history walk; that limit is not represented as a successful history audit.

## Defects and repair

Explicit repeated/nested client or region query values were treated as absent, while empty/unknown overlays could silently disappear. The config failure path then replaced the requested enriched context with `resolveWorkspaceConfig(need)` and an HTTP 200. Map/catalog exceptions had no contained route response.

Both contextual endpoints now share one local parser in the existing route file. Explicit selectors must be nonempty scalar strings. Region/client values resolve through the existing profiles. Unknown query fields, including project/tenant/license filters this route does not apply, are refused rather than ignored. Known selections and authenticated industry precedence are retained; omitted region defaults stay with the existing service. Unknown document needs keep the existing honest blank-workspace behavior. No extra project-state lookup is claimed.

Unexpected configuration failure now returns 503 WORKSPACE_CONFIG_UNAVAILABLE without substitute data; map and catalog failures have their own fixed 503 codes. No raw exception is echoed. The existing best-effort license behavior inside enrichment is unchanged. Each route requires a positive safe tenant ID from the existing authenticated helper; no query, body or header selects the license tenant.

Compatibility note: clients that send empty, repeated, unknown or unsupported query fields now receive 400. This is intentional; those requests previously did not describe the context actually returned. No new screen, service, route, store, dependency, license rule, filing channel or scientific/approval rule was introduced.

## Executed verification

Node 22.16.0; TypeScript 5.8.3. One unchanged 70-case Node suite ran against the complete original and repaired route. The complete original route and three real profile/tenant modules were verified against their Git blob identities before testing.

| Source | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Original | 32 | 38 | 0 |
| Repaired | 70 | 0 | 0 |

The route, canonical profile accessors and tenant helpers execute as actual production code. Express registration, JWT/auth middleware, catalog generation, project-map computation and asynchronous enrichment are explicit test substitutes. Cases cover malformed queries, five region/client examples, omitted defaults, unknown document needs, unusable tenants, exception redaction, absent entitlement and overlapping organizations. These are handler-boundary results, not full Express/JWT, database or browser acceptance.

`case-results.tsv` records all outcomes; `execution.json` records source identities, counts and raw TAP hashes. Raw before/after TAP is retained in the accompanying verification bundle, not represented as CI output. Both touched TypeScript files transpile without syntax errors; whole-repository semantic checking was not run. A 24-case native Express/Supertest suite is authored but unexecuted because Express, Supertest and Vitest are unavailable in this environment.

## Direct publication and conflict handling

The preceding workspace-isolation commit `b7a69305afc12cec1344dd3999690728c0927996` is an ancestor of this baseline. GitHub reports 21 subsequent commits and no overlap with this production route. This repair is based on their complete tree, not the older workspace-isolation tree. Publication must use an expected-head fast-forward and read the remote branch afterward. This file alone is not proof the push succeeded. No PR, force update, branch reset or competing branch is used.

## Reproduction and open acceptance

```sh
node --test tests/routes/workspace-config-boundary.test.cjs
C2C_WORKSPACE_ROUTE_SOURCE_ROOT=/path/to/baseline node --test tests/routes/workspace-config-boundary.test.cjs
npx vitest run tests/routes/workspace-config-boundary.http.test.ts tests/routes/workspace-config.test.ts
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

The baseline snapshot must contain the four source files listed in execution.json. C2C_TS_PATH can select an already installed TypeScript package. No new dependency was installed. Direct GitHub writes do not run local pre-push hooks. Full CI, native HTTP tests, semantic typechecking, authenticated UI/AnA propagation, license integration and hosted deployment remain open. Catalog selection is not new market eligibility; current roadmap and market-release boundaries are unchanged. Rollback is an ordinary revert; no migration or backfill.
