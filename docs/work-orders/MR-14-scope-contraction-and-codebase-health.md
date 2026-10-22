# MR-14 — Ship only the launch catalog: scope contraction and codebase health

| | |
|---|---|
| Phase | Phase 0 (stage 1), Phase 1 (stages 2–3), Phase 3 (stages 4–11), Backlog (stage 12) |
| Highest open severity at head | P1 (ARCH-03, ARCH-05) |
| Human testing | Degrades: on a local `npm run dev` stack, launch scope is off, so the rail, the Apps catalog, the APIs and AnA's tools all include surfaces that production refuses. Testers exercise and file bugs against screens outside the catalog (ARCH-01, ARCH-21, UX-14, ARCH-14). Stage 1 removes this. |
| Owner | Engineering. Stages 3, 6 and 9 need a founder decision first. |
| Effort | About 15 engineer-weeks: XS + S + L + M + M + XL + S + M + S + L + M + S |
| Depends on | MR-05 (ARCH-09 case-normalised gate), MR-13 (ARCH-07 Python runtime and `run_python_script`), MR-03 (OPS-08 worker service removal), MR-16 (pricing consolidation, UX-05/GTM-12), MR-09 (canonical Authoring drafting path), MR-02 (CI wiring for new gates); F-4, F-10, F-14, F-20, F-22 |
| Findings | 22 total — open 16 · partially fixed 6 · fixed 0 · refuted 0 · unverifiable 0 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

## Goal

The production system contains only what the launch catalog names: Projects, Vault, Authoring, Submission Center, Submission Readiness, QMS controlled documents, Reporting & analytics, CMC / Module 3 (bounded by `services/cmc/composition-scope.ts`), and the remote MCP connector. Code outside the catalog is not mounted, not offered to the model, and not loaded into the shipped bundle. Code that is in the catalog is guaranteed present: the service refuses to boot or report ready while any launch route is missing. A validation lead can then read the intended-use statement, compare it with the running system, and find that the two match. One production deployment target, one implementation per capability and one schema source remain.

## Why it matters

- **The validated boundary is one middleware, not what ships.** About 93 refused route families (`/api/regulatory-digital-twin`, `/api/snowglobe`, `/api/nano-banana`, `/api/pdf-tasks` and others) are mounted and bundled in every production process. A single gate defect exposes them, and a GxP buyer's QA cannot accept "mounted but refused" as the system boundary.
- **AnA runs about 618 tools in production, many outside the catalog.** These include biosimilar and vaccine CMC, PV causality, Monte Carlo simulation, device tools and `run_python_script`. Unclassified tools are allowed by default (`ana-launch-scope.ts:65`). A pilot customer's QA will ask what AnA is validated to do, and today no list answers that.
- **A launch app can vanish while the deploy stays green.** 172 log-and-continue mount blocks wrap launch routers such as `/api/projects`, `/api/authoring`, `/api/ectd` and `/api/c2c/project-vault`. If one fails to import, the pilot tenant gets a JSON 404 while `/readyz` returns 200.
- **Testers on a local stack see the wrong product.** With scope off by default in dev, they spend time on surfaces production refuses, and the bug queue fills with noise.
- **The size of the codebase makes validation and maintenance slow.** Twelve deployment targets, two diverged `db`/`logger` twins, seven or more flag systems, eight e-signature stores, 87 unused runtime dependencies and 78 MB of data dumps in the image each add to installation-qualification and CVE-scan scope.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| ARCH-03 | Partially fixed | P1 | No (scope observation) | `AnaToolExecutor.ts` 21,833 lines, 618 in-scope tools; default-allow at `server/services/ana/ana-launch-scope.ts:65`; hidden tools refused at `AnaToolExecutor.ts:482-495` |
| ARCH-05 | Still open | P1 | No (latent 404) | 172 `Failed to mount` catches, e.g. `server/bootstrap/register-project-routes.ts:31-36`; `/readyz` (`server/startup/inline-endpoints.ts:50-180`) has no route check |
| ARCH-01 | Partially fixed | P2 | Degrades | Refused families still mounted at `register-advanced-platform-routes.ts:159,162,163,196`; `readUnattributedApiMode` accepts `report` in production (`launch-scope.ts:77-97`) |
| ARCH-02 | Partially fixed | P2 | No | Longest-prefix inheritance in `server/services/entitlements/api-prefix-map.ts:67-79` makes `/api/submission-ops/automation/*` and `/api/ectd/v4/*` launch |
| ARCH-04 | Partially fixed | P2 | No | Three opt-in writers unlocked: `driftSentinelSweep.ts:75`, `corpusIngestionSweep.ts:164`, `regulatoryHorizonScan.ts:154`; no lease gate in CI |
| ARCH-10 | Still open | P2 | No | `server/db.js` + `server/db.ts`, `server/utils/logger.js` + `logger.ts` both bundled |
| ARCH-14 | Still open | P2 | Degrades | `server/storage.ts` and `server/prisma/client.js` still present; two auth middlewares, several flag systems |
| ARCH-15 | Still open | P2 | No | `drizzle.config.ts:21` `out: './migrations'`; `package.json:309` `"db:push": "drizzle-kit push"` |
| ARCH-17 | Still open | P2 | No | `app.yaml`, `.vercelignore`, `.replit:9` `[deployment]`, `charts/`, `helm/`, `infra/k8s`, `deploy/localai`, `cerv2-staging-deploy.yml` |
| ARCH-18 | Still open | P2 | No | `.env.example:410` `MODULE_ENFORCEMENT=off`; `moduleEntitlementGate.ts` ~199-210 calls `next()` on a resolution error |
| AI-13 | Still open | P2 | No | `server/api/drafting/routes.ts:355` `/api/gcc/drafting/generate`; `server/routes/ana-cortex.ts`, `snowglobe.ts` present; `server/services/ana` 238 entries |
| ARCH-11 | Still open | P3 | No | `package.json` lists `antd` (:538), `joi` (:581), `passport` (:602) with no imports |
| ARCH-16 | Still open | P3 | No | `Dockerfile.optimized:169` copies all of `/app/server`; `server/scripts/data` holds 69 files |
| ARCH-19 | Still open | P3 | No | `logs/export_actions.jsonl`, `data/logs/notifications.jsonl`, `data/test_output/*`, `storage/ir-packs/*.zip`, `design-system-bundle.tgz.bin` tracked; 46 root markdown files |
| ARCH-20 | Partially fixed | P3 | No | 102 literal `catch(() => {})` in `server/**/*.ts` |
| ARCH-21 | Still open | P3 | Degrades | `client/src/concept2cure/v2/LaunchScopeGate.tsx:35` renders children when `!verdict` |
| DATA-10 | Still open | P3 | No | `db/migrations` 298 files; no signature store or audit trail of record named in code |
| OPS-07 | Partially fixed | P3 | No | Same three unlocked jobs as ARCH-04; no `ci:scheduler-lease` gate |
| OPS-24 | Still open | P3 | No | `charts/`, `helm/`, `infra/k8s/`, `app.yaml`, `docker-compose.staging.yml`, `deploy/localai`, `ci-staging-integration.yml`, `neon-*.yml` |
| UX-14 | Still open | P3 | Degrades | `client/src/concept2cure/mdx` and `pdev` present; `quality/App.tsx` has its own top bar (header comment :4) |
| UX-21 | Still open | P3 | No | `antd`, `reactflow`, `d3`, `recharts`, `html2canvas`, `react-pdf`, `jspdf` with 0 imports |
| UX-22 | Still open | P3 | No | `V2App.tsx:82-136` eagerly imports about 13 sheets, including `research-v2.css` and `device-v2.css` |

## Already done at head — do not redo

No finding in this order is fully fixed or refuted. These parts of partially fixed findings are done and must not be rebuilt:

- **AWS deploy preflight refuses `LAUNCH_SCOPE_ENFORCE` other than `on`** (`.github/workflows/deploy-aws.yml:632-655`, commit 471e5a4cd). Production `off` is logged as an error (`launch-scope.ts:34-41`).
- **`/api/ana`, `/api/rim` and `/api/global-ri` are out of scope.** Training left the launch shell (bcc457edb), and project-home, program-journey and dossier-map dropped their claims (fbff77602).
- **Hidden-app AnA tools are refused at execution** on the chat, sub-agent and MCP paths (`AnaToolExecutor.ts:482-495`, 4597bacd4).
- **Every default-on scheduler runs once per window across tasks.** This uses `server/db/scheduledOnce.ts` (`runScheduledOnce`, `runScheduledOncePerWindow`) and `migrations/20261001d_scheduled_job_claims.sql` (03dbeaf51, 4b1583a2c, f0533ac96), and is tested by `tests/db/scheduled-once-lease.dbtest.ts` and `scheduled-once-window.dbtest.ts`. Reuse it. Do not write a second lease.
- **`/api/agent-swarm` is gone.** Firebase has been removed from `package.json`.

## Work, in order

### Stage 1 — Test against the production scope (Phase 0 · XS · engineering) — closes none; removes the tester impact of ARCH-01 and ARCH-21

1. Re-confirm ARCH-01 and ARCH-21 at the current head (statuses here are from 94b4f9238).
2. Add an npm script `dev:launch` that starts the dev server with `LAUNCH_SCOPE_ENFORCE=on` and `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce`. Make it the documented way to start a human-testing session in the tester guide that MR-15 maintains. If no tester guide exists, add a "Testing a launch journey" section to `README.md`. State there that a `403 LAUNCH_SCOPE` on a screen outside the catalog is expected behaviour, not a defect. Add a pre-session check: `grep "Failed to mount"` in the boot log must return nothing. Stage 2 automates this check.
3. In `client/src/concept2cure/v2/LaunchScopeGate.tsx:35`, render a loading state while the verdict is pending, and a locked state if the verdict request fails. Do not render children when `!verdict`. The server gate stays the real control. This only stops a flash of out-of-scope content.
4. Add a component test that mounts `LaunchScopeGate` with an unresolved verdict and asserts the children are absent. Show it red at HEAD.

**Acceptance**
- `npm run dev:launch` boots, and `GET /api/regulatory-digital-twin/anything` returns 403 `LAUNCH_SCOPE` while a launch screen (Vault) loads.
- The `LaunchScopeGate` test fails on the current code and passes after the fix.

### Stage 2 — Fail closed when a launch route is missing (Phase 1 · S · engineering) — closes ARCH-05

1. Re-confirm ARCH-05 at the current head (statuses here are from 94b4f9238).
2. Create `server/bootstrap/mount-registry.ts`. It exports `instrumentAppUse(app)`, which wraps `app.use` once and records every string or string-array path in a module-level `Set` before delegating to the original. It also exports `mountedPrefixes(): ReadonlySet<string>`. Call `instrumentAppUse(app)` in `server/index.ts` immediately after `const app = express()` (line 93), before `mountFastPathHealthEndpoints` (line 113), so it sees `registerPreStartRoutes`, `registerPostStartRoutes` and every `mountAll` call.
3. Create `server/startup/launch-mount-assertion.ts` with two functions:
   - `requiredLaunchPrefixes()` returns the union of `UI_SURFACES[].apiPrefixes` (`shared/constants/ui-surface-registry.ts:155`) for every id in `LAUNCH_SURFACE_IDS` (`shared/constants/launch-scope.ts:206`). It subtracts `NEVER_GATED` (`server/services/entitlements/api-prefix-map.ts:23`) and a `LAUNCH_MOUNT_EXCEPTIONS` map of prefix to written reason. An entry without a reason fails.
   - `missingLaunchPrefixes(mounted)` returns every required prefix P for which no mounted M satisfies `M === P`, `P.startsWith(M + '/')` or `M.startsWith(P + '/')`.

   Because the set derives from `LAUNCH_SURFACE_IDS`, CMC / Module 3 and Reporting & analytics prefixes are required automatically.
4. Create `server/startup/route-readiness-state.ts`, modelled on `readiness-state.ts`, with the state `'unknown' | 'ok' | 'missing'` and a list of missing prefixes. In `server/index.ts`, right after `await registerPostStartRoutes(routeCtx)` (line 227) and before `mountApiCatchAll(app)`, compute the missing set and record the state. When `NODE_ENV === 'production'` and the set is non-empty, log each missing prefix and `process.exit(1)`. Provide no environment bypass.
5. In the `/readyz` handler (`server/startup/inline-endpoints.ts:50-180`), add `deps.routes`. It fails closed on `'unknown'` and `'missing'` and puts `routesDetail` in the 503 body. Report the route state on the 200 body as well, as the schema and AnA verdicts already are.
6. Make launch mounts fail loudly. At minimum, change these log-and-continue blocks:
   - `register-project-routes.ts:31-36` (`/api/projects`)
   - `register-inline-routes.ts:317-323` (`/api/authoring`)
   - `register-document-routes.ts:123-144` (`/api/ectd`)
   - `register-clinical-intel-routes.ts:186-193` (`/api/c2c/project-vault`)

   Either convert each to a static import through `mountAll`, or rethrow inside the catch when `NODE_ENV === 'production'`. Also make `mountAll` (`server/bootstrap/mount-routes.ts:77-80`) throw in production on a router with no default export. Step 4 is the backstop for the remaining catches.
7. Add `server/startup/__tests__/launch-mount-assertion.test.ts` with these cases:
   - (a) Instrument a fresh Express app and mount every required prefix except `/api/c2c/project-vault`. Expect exactly that prefix to be missing.
   - (b) `vi.mock('../../routes/c2c/project-vault', () => { throw new Error('boom') })`, run `registerClinicalIntelRoutes` on an instrumented app, and expect the prefix to be missing.
   - (c) Set the route state to `'missing'` and expect `/readyz` to return 503 with `failed` containing `routes`.
   - (d) A `LAUNCH_MOUNT_EXCEPTIONS` entry without a reason fails.
8. In the `.github/workflows/ci.yml` "Production Image Boot" job (lines 2160-2218), after `/readyz` returns 200, assert `dependencies.routes === 'ok'`.

**Acceptance**
- The unit test is red with `missingLaunchPrefixes` stubbed to return `[]`, and green with the real implementation.
- With `NODE_ENV=production` and the project-vault import forced to throw, boot exits non-zero and the log names `/api/c2c/project-vault`.
- With the state forced to `'missing'`, `/readyz` returns 503, `failed` includes `routes`, and `routesDetail` lists the prefixes.
- The CI image-boot job asserts `dependencies.routes === 'ok'` on the real image. It was shown failing once against an image with a broken launch router.

### Stage 3 — AnA tools: default-deny with a founder-approved allowlist (Phase 1 · L · mixed) — closes ARCH-03 except the executor split, which closes in stage 6

1. Re-confirm ARCH-03 at the current head (statuses here are from 94b4f9238).
2. Founder (F-14): approve, per launch app, the AnA tools that are validated intended use. Decide whether the knowledge tools from domains outside the catalog are in scope: biosimilar, vaccine, cell therapy, PV causality, Monte Carlo and the 27 device/510(k)/IVD/UDI/PMA tools. F-14's recommendation removes `run_python_script` from production; MR-13 (ARCH-07) owns that runtime. CMC / Module 3 tools that serve the bounded small-molecule US IND composition are in the catalog. Tools for biologics, vaccines or cell therapy are not, under `services/cmc/composition-scope.ts`. Record the decision in a reviewed decision record and cite it in the commit.
3. Add `server/services/ana/ana-production-allowlist.json` with entries of the form `{ "<tool>": { "app": "<LAUNCH_APPS id>", "rationale": "…", "evalRef": "…" } }`. Seed it only with founder-approved tools. The 7 MCP-bridged tools (`server/mcp/tools/{intelligence,reference,validation}.ts`) must be on it.
4. Add `anaToolOnProductionAllowlist(name)` in `server/services/ana/ana-launch-scope.ts`. Make these changes:
   - In `preHandlerRefusal` (`AnaToolExecutor.ts:482-495`), when `launchScopeEnforced()` is true and the tool is not on the allowlist, return the `LAUNCH_SCOPE` refusal. Keep the hidden-app check. Every handler is wrapped by `registerToolHandler` (`:564-575`), so this covers chat, sub-agents and MCP `callAnaHandler` (`server/mcp/tools/runtime.ts:96-114`) at once.
   - Filter `governed-toolset.ts:95` with the allowlist, so the model is never offered an unlisted tool.
   - Apply the same check to platform commands where `AnaToolExecutor.ts:20140` checks `inventory.commands`.
5. Change `anaCapabilityInLaunchScope` (`ana-launch-scope.ts:65`) so an unclassified name returns `false` when a production flag is passed. Keep the classification test in `ana-launch-scope.test.ts`.
6. Add `server/services/ana/__tests__/ana-production-allowlist.test.ts` with three cases:
   - (a) Register `zz_unclassified_tool`, set `NODE_ENV=production`, call `getToolHandler('zz_unclassified_tool')` and assert a `LAUNCH_SCOPE` refusal. This is red at HEAD.
   - (b) Every MCP-bridged tool is allowlisted.
   - (c) Every entry has a non-empty rationale, an `evalRef`, and an `app` in `LAUNCH_APPS`.

**Acceptance**
- The allowlist exists, and every entry has `app`, `rationale` and `evalRef`.
- With `NODE_ENV=production`, an unlisted tool is refused with `LAUNCH_SCOPE` via chat, sub-agent and MCP. The test was red at HEAD.
- In production, `governed-toolset` offers exactly the allowlisted count (asserted).
- `ana-launch-scope.test.ts` and the MCP tests stay green.

### Stage 4 — Correct sub-path verdicts and refuse the open-scope switches (Phase 3 · M · engineering) — closes ARCH-02; ARCH-01 config part

1. Re-confirm ARCH-01 and ARCH-02 at the current head (statuses here are from 94b4f9238).
2. Inventory the routes on a throwaway DB: `NODE_ENV=production DATABASE_URL=… npx tsx scripts/ci/launch-scope-route-inventory.ts --out /tmp/routes.json --rows`. List every route whose verdict is `launch` and whose longest matching prefix also has a non-launch claimant. At HEAD this includes at least `/api/submission-ops`, `/api/ectd`, `/api/corpus`, `/api/regulatory-programs`, `/api/task-management` and `/api/projects`.
3. Use the import walker in `scripts/ci/check-launch-scope-api.ts` to decide each route by whether a launch or shell surface reaches it. These are expected to be non-launch at HEAD:
   - `/api/submission-ops/{automation,hotspots,workload,unified-work,command-center,digests,approval-bottlenecks}`
   - `/api/ectd/v4/*`, under F-10 (v3.2.2 only at launch)
   - `/api/corpus/{ingest,extract}`, unless an artifacts-center file calls them

   `/api/study-design` stays launch, because protocol-dev is in the Authoring app.
4. Add `export const LAUNCH_API_EXCLUSIONS: Readonly<Record<string, string>>` (prefix to written reason) in `server/services/entitlements/launch-scope-api.ts`. `launchScopeApiVerdict` checks it at a segment boundary, using the same matcher as `modulesForPath`, before returning `'launch'`. A match returns `'out-of-scope'`. Do not change `modulesForPath`, because the module-entitlement gate also uses it.
5. Add a reverse check to `scripts/ci/check-launch-scope-api.ts`. For each prefix whose claimants mix launch and non-launch surfaces, a path named only by non-launch client code must not be `launch`. Add a `--selftest` case: a constructed mixed prefix with an unexcluded non-launch-only sub-path must exit 1.
6. Add verdict tests in `server/services/entitlements/__tests__/`:
   - `/api/submission-ops/automation/run` and `/api/ectd/v4/validate` both return `'out-of-scope'`. Both return `launch` at HEAD.
   - `/api/submission-ops/packages` and the `/api/ectd` paths used by ectd-compile stay `'launch'`.
7. Refuse the open-scope switches in production. In `server/services/entitlements/launch-scope.ts`:
   - `readLaunchScopeMode` (`:45-58`) throws when `NODE_ENV=production` and the value is `off`, unless `LAUNCH_SCOPE_ACCEPT_OPEN === 'true'`. With the flag set, it emits one structured error naming the accepted risk, in the `AI_GOVERNANCE_ACCEPT_PERMISSIVE` shape (`server/startup/ai-governance-posture.ts`).
   - `readUnattributedApiMode` (`:77-97`) follows the same rule for `report`.

   The flag name matches `^[A-Z0-9_]+_ACCEPT_[A-Z0-9_]+$`, so the `ACCEPT_OVERRIDES` preflight in `deploy-aws.yml` (~:599-613) refuses it. Next to `:632-655`, add a preflight block: `LAUNCH_SCOPE_API_UNATTRIBUTED` must be absent or exactly `enforce`, and must not come from secrets.

**Acceptance**
- The two verdict tests are red at HEAD and green after.
- The reverse-check selftest exits 1 on the constructed mixed prefix.
- The production inventory lists no route under a mixed launch prefix that only non-launch client code names.
- `npm run ci:launch-scope-api` stays green: every launch screen's calls are still `launch`.
- Every exclusion carries a reason.
- `readLaunchScopeMode({NODE_ENV:'production', LAUNCH_SCOPE_ENFORCE:'off'})` and the `report` equivalent throw without `LAUNCH_SCOPE_ACCEPT_OPEN`. Both unit tests are red at HEAD.
- The preflight fails a fixture task definition carrying `LAUNCH_SCOPE_API_UNATTRIBUTED=report` or `LAUNCH_SCOPE_ACCEPT_OPEN`.

### Stage 5 — Do not mount or bundle what production refuses (Phase 3 · M · engineering) — closes ARCH-01, ARCH-21, UX-14, UX-22

Prerequisites: stage 4, and MR-05's fix for ARCH-09 (normalise the `/api` case at `moduleEntitlementGate.ts:112`). Founder answer to arch open question 4 (NEW, below).

1. Re-confirm ARCH-01, ARCH-21, UX-14 and UX-22 at the current head (statuses here are from 94b4f9238).
2. Add `export function mountIfLaunchScoped(app, path, ...handlers)` in `server/bootstrap/mount-routes.ts`. It computes `launchScopeApiVerdict(path, buildPrefixMap(), NEVER_GATED)` and skips the mount when `launchScopeEnforced()` is true and the verdict is either `'out-of-scope'`, or `'unmapped'` with `readUnattributedApiMode() === 'enforce'`. It logs one info line per skipped family. Make `mountAll` (`:60-84`) call it for each entry.
3. Replace the direct `app.use` calls for refused families with `mountIfLaunchScoped`, starting with:
   - `register-advanced-platform-routes.ts:159,162,163,196` (`/api/ana-cortex-ft`, `/api/regulatory-digital-twin`, `/api/submission-twin`, `/api/snowglobe`)
   - `register-inline-routes.ts:148` (`/api/nano-banana`)
   - `register-regulatory-routes.ts:427` (`/api/pdf-tasks`)
   - `register-ai-routes.ts:28` (`/api/ana`)

   Leave routers mounted at bare `/api` to the gate. Keep the static imports, so the routes-reach-the-bundle test stays green. This is not a capability deletion: the routes already return 403 in production, and `moduleEntitlementGate.ts:112-133` remains the path. Stage 2's assertion guarantees no launch prefix is skipped by mistake.
4. Make `/api/pdf-tasks` fail closed in non-production as well. `server/routes/pdf-task-routes.ts:149-150` spawns `cer_tasks.py`, which does not exist. Return 501 with an honest message before spawning.
5. In `server/jobs/externalIntelligenceSweep.ts:35`, do not schedule the sweep when enforcement is on and `/api/external-intelligence` is `'out-of-scope'`, unless `ENABLE_EXTERNAL_INTELLIGENCE === 'true'`. Log the posture line, as the opt-in jobs do.
6. Build a launch-only bundle:
   - **Server.** Add an esbuild `define` launch-only flag in `scripts/build-server.mjs` so guarded branches tree-shake. Derive the list of refused-only files from verdicts at the current head, not from the auditor's 2026-09-29 list. That list predates CMC / Module 3 and Reporting & analytics joining the catalog, and it names `api/cmc`. `/api/cmc`, the CMC composition path and the reporting services stay in the bundle. The boundary is `shared/constants/launch-scope.ts`.
   - **Client.** Exclude every surface not in `LAUNCH_SURFACE_IDS` from the launch build of `surfaceViews`. Exclude `client/src/concept2cure/mdx` and `pdev` the same way, without deleting any of them. Keep `CmcModule.tsx` and the reporting surfaces whenever their surface ids are in `LAUNCH_SURFACE_IDS`.
   - **CSS.** Move out-of-scope kit CSS (`research-v2.css`, `device-v2.css` and the other non-launch sheets at `V2App.tsx:82-136`) into the lazily loaded surface modules that use them.
7. Render the QMS tabs (`client/src/concept2cure/quality/App.tsx`) in the v2 page header and remove the second top bar. Move the remaining focus-trap dialogs in launch screens onto `useDialog`. Icon unification is in scope only where a launch screen is touched.
8. Add `server/bootstrap/__tests__/launch-scope-unmounted.test.ts`. With `NODE_ENV=production`, walk the Express stack after `registerPostStartRoutes`, as `scripts/ci/launch-scope-route-inventory.ts` does. Assert that no layer is mounted at `/api/regulatory-digital-twin`, `/api/snowglobe`, `/api/nano-banana` or `/api/pdf-tasks`. Show it red at HEAD.

**Acceptance**
- The `launch-scope-unmounted` test was red at HEAD and is green after.
- With `NODE_ENV=production` and no overrides, the route inventory lists zero out-of-scope routes, and unmapped routes only where an infrastructure entry explains them.
- `POST /api/pdf-tasks` no longer spawns `python3` (501 or unmounted).
- Boot logs with enforcement on show the external-intelligence sweep as not scheduled.
- The esbuild metafile and the Vite manifest of the launch build contain no file used only by refused families. They do contain `services/cmc`, `api/cmc` and the reporting modules, which is asserted by name.
- `npm run ci:launch-scope-api` and `ci:launch-scope` stay green. No launch screen (including CMC / Module 3 and Reporting) gets a 403. Stage 2's `/readyz` reports `routes: ok`.
- The QMS screen shows one top bar.
- The initial CSS payload is measured before and after.

### Stage 6 — One launch AI surface: retire the duplicate paths and split the executor (Phase 3 · XL · mixed) — closes AI-13; ARCH-03 executor split

Prerequisites: stage 3 (allowlist) and stage 5 (unmounted families). MR-09 must name the canonical Authoring drafting path.

1. Re-confirm AI-13 and ARCH-03 at the current head (statuses here are from 94b4f9238).
2. Write `docs/design/LAUNCH_AI_SURFACE.md`. It lists every AI entry point that ships, by route and file:
   - AnA chat over Vault
   - `draft_authoring_document` plus the editor AI
   - Vault classify and extract
   - Readiness narration
   - The MCP connector

   Every other AI mount is listed as out, with its replacement path. Link it from `shared/constants/launch-scope.ts`.
3. Run the working agreement's history search (`git log --all --diff-filter=D -- …`) for each path below before removing it. For each removal, name in the commit the file that delivers the user outcome and the gate that proves it reachable.
   - `/api/gcc/drafting` (`server/api/drafting/routes.ts`, `generate` at :355). It is dead on deploy, because none of `vault.hybrid_search`, `table_priority_search`, `drafting_sessions` or `extracted_entities` is created by any file in `C2C_MIGRATION_FILES`. The replacement is the Authoring drafting path that MR-09 names.
   - `server/routes/ana-cortex.ts` and the `cortex*` routes
   - `snowglobe.ts` scoring. Its model-produced risk scores also violate Rule 2.
   - `services/cognitive-ecosystem`, which is unreachable

   If no replacement exists for a user outcome, stop. The removal is a founder decision.
4. Split `AnaToolExecutor.ts` into per-domain modules of at most 2,000 lines under `server/services/ana/tools/launch/*.ts` and `tools/extended/*.ts`. Each module exports `register(registerToolHandler)`. The executor imports the launch index statically. It imports the extended index only when launch scope is off or the tool is allowlisted. Static imports inside the extended index keep `scripts/ci/check-server-bundle-prod-imports.mjs` green. Add a scripted line-count check to CI.
5. If F-14 removes the domains outside the catalog, verify that the launch-only build's esbuild metafile no longer contains `server/services/{biosimilar,vaccine,rare-disease,digital-health,dose-optimization}`. Do not remove CMC / Module 3 engines that serve the bounded composition.

**Acceptance**
- `LAUNCH_AI_SURFACE.md` exists, and every AI mount at head appears in it as either in or out.
- The production route inventory shows no AI mount that the document marks out.
- Every executor file is at most 2,000 lines, enforced in CI. The line-count check was shown failing on the current executor.
- Each deletion commit names the replacement path and its gate.
- The metafile check passes if the founder removed domains.

### Stage 7 — Every scheduler takes the lease, enforced by a gate (Phase 3 · S · engineering) — closes OPS-07; ARCH-04 except the worker service

The orphaned worker ECS service, task definition and ECR repository are owned by MR-03 (OPS-08). Do not remove them here. ARCH-04 closes when this stage and OPS-08 have both closed.

1. Re-confirm ARCH-04 and OPS-07 at the current head (statuses here are from 94b4f9238).
2. Wrap the three opt-in writers. Import from `../db/scheduledOnce` and follow the pattern at `externalIntelligenceSweep.ts:49-53`.
   - `server/jobs/driftSentinelSweep.ts:75`: `void runScheduledOncePerWindow('drift-sentinel-sweep', windowKeyOf(intervalMs), () => runDriftSentinelSweep())`. Keep any tenant scope that `runDriftSentinelSweep` already enters. Otherwise wrap the call in `runWithSystemTenantScope`.
   - `server/jobs/corpusIngestionSweep.ts:164`: key `'corpus-ingestion-sweep'`, `windowKeyOf(24 * 60 * 60 * 1000)`.
   - `server/jobs/regulatoryHorizonScan.ts:154`: key `'regulatory-horizon-scan'`, `windowKeyOf(24 * 60 * 60 * 1000)`.

   Use a one-day window for the weekly crons, not seven days. Epoch-aligned 7-day windows start on Thursday. A one-day window still deduplicates the tasks that fire in the same minute, and it stays correct if the schedule changes.
3. Add tests in both layers, each red against the unwrapped code:
   - **Unit.** Extend `server/jobs/__tests__/nightly-sweeps-once-per-window.test.ts`. Mock `runScheduledOncePerWindow` to return `already_ran_this_window` and assert the job body is not called.
   - **DB.** Extend `tests/db/scheduler-jobs-under-rls.dbtest.ts` using `tests/db/scheduler-harness.ts`. Set each `ENABLE_*` flag and stub the fetchers. Run two concurrent ticks and one later tick in the same window, and assert the body ran exactly once.
4. Add `scripts/ci/check-scheduler-lease.mjs`, with npm scripts `ci:scheduler-lease` and `ci:scheduler-lease:selftest`.
   - **What it scans.** `server/**/*.ts` (excluding `__tests__`) for `cron.schedule(`, and for `setInterval(` inside files under `server/jobs/`, files named `*scheduler*`, `*sweep*` or `*heartbeat*`, and exported `start*` functions. Each hit must reference `runScheduledOnce` or `runScheduledOncePerWindow`, or appear in `scripts/ci/scheduler-lease-baseline.json` with a non-empty written reason.
   - **Initial baseline.** `securityHealthScheduler.ts` (read-only self-test, per process by design), `taskDueSweep.ts` (guarded compare-and-set UPDATE at :94-110), `submission-chat-sweep-scheduler.ts` (idempotent expiry UPDATE), `workers/ivdr-pack-worker.ts` (`FOR UPDATE SKIP LOCKED`), and in-memory cache sweepers.
   - **Selftest.** Writes an unwrapped `cron.schedule` under a fake `server/jobs/` path and expects exit 1.
5. Wire `ci:scheduler-lease` and its selftest into `.husky/pre-push` and the Lint job in `.github/workflows/ci.yml` (next to the launch-scope steps, ~:337-356). Coordinate with MR-02 so the job is a required check.
6. If the header of `server/db/scheduledOnce.ts` (:6-12) still mentions "a worker task", add a dated note there. Do not touch `migrations/20261001d_scheduled_job_claims.sql`: a comment-only change is journal drift.

**Acceptance**
- The new unit and DB cases fail against the pre-change code and pass after. Each of the three jobs runs exactly once for two concurrent ticks plus one later tick in a window.
- `npm run ci:scheduler-lease` exits 1 on the pre-change tree, naming the three files, and 0 after.
- The selftest proves the failure branch, and an empty-reason baseline entry is refused.
- The existing `tests/db/scheduled-once-*.dbtest.ts` still pass in the CI DB job.

### Stage 8 — One typed configuration, enforced at boot (Phase 3 · M · engineering) — closes ARCH-18

1. Re-confirm ARCH-18 at the current head (statuses here are from 94b4f9238).
2. Add a zod schema covering every `process.env` key that reachable server code reads (about 380 at audit; about 220 documented). Validate it once at boot in `server/index.ts`. In production, an unknown or malformed value for a key marked required refuses boot.
3. Add `scripts/ci/check-env-inventory.mjs`, with npm scripts `ci:env-inventory` and `:selftest`. It diffs the keys the server reads against `.env.example` and the schema, and fails on any key that is undocumented or not in the schema. Show it failing on the current tree before documenting the missing keys.
4. Set `MODULE_ENFORCEMENT=enforce` in the production task definition (with MR-03). Add a deploy preflight that refuses any other value. Leave `.env.example:410` at `off` for development, with a comment.
5. When `MODULE_ENFORCEMENT=enforce`, make `moduleEntitlementGate.ts` (~199-210) fail closed on an entitlement-resolution error: return 503 with an honest message, not `next()`. Wait for the founder decision below. Test it by forcing the resolver to throw, and show the request passing at HEAD first.
6. Fold the flag systems ARCH-14 names into the schema-backed config as they are touched: `featureToggleService`, client `flags/featureFlags.ts`, `config/ossStackFeatureFlags.ts`, `documentIntelligence/featureFlags.ts`, `ingestion/parserFeatureFlags.ts` and `preclinical/feature-flags.ts`. Name each removed module and its replacement in the commit.

**Acceptance**
- Boot with an invalid required key exits non-zero in production.
- `ci:env-inventory` fails on a constructed undocumented key and passes on the tree.
- The production preflight refuses `MODULE_ENFORCEMENT` other than `enforce`.
- The fail-closed test was red at HEAD and is green after, if the founder approves the change.

### Stage 9 — One production deployment target (Phase 3 · S · engineering) — closes ARCH-17, OPS-24

1. Re-confirm ARCH-17 and OPS-24 at the current head (statuses here are from 94b4f9238).
2. With F-4 confirmed (AWS, `us-east-1`) and the NEW confirmation below, delete these files. Name `Dockerfile.optimized`, `terraform/stack` and `.github/workflows/deploy-aws.yml` as the replacement path in the commit message.
   - `app.yaml`, `.vercelignore` and the `[deployment]` block in `.replit` (line 9)
   - `charts/concept2cure-app`, `charts/trialsage-cer`, `helm/` and `infra/k8s/`
   - `deploy/localai`
   - `docker-compose.staging.yml` and the beta compose file
   - `.github/workflows/cerv2-staging-deploy.yml`, `ci-staging-integration.yml`, `neon-provisioning.yml` and `neon-preview-db.yml`, plus the Neon step in `c2c-agent.yml`

   Delete them rather than moving them to an `_unsupported/` folder. Git history keeps them, and a kept copy is a second implementation.
3. Trim `docker-compose.yml` to what the launch catalog needs locally. Remove tika, grobid, opensearch, temporal, `litellm:main-latest` and `opa:latest` unless a launch service imports a client for them (check before removing).
4. Add `scripts/ci/check-single-deploy-target.mjs` (`ci:deploy-targets` and `:selftest`). It fails when any production-target file exists outside `Dockerfile.optimized` and `terraform/`, matching Helm `Chart.yaml`, `app.yaml`, `vercel.json` or `.vercelignore`, a `.replit` `[deployment]` block, k8s manifests, or workflows that deploy elsewhere. Show it failing on the current tree.

**Acceptance**
- `ci:deploy-targets` exits 1 at HEAD, naming the files, and 0 after. The selftest proves the failure branch.
- `deploy-aws.yml` still deploys staging from the same image.
- Local `docker compose up` still starts the launch stack.

### Stage 10 — One canonical implementation per capability (Phase 3 · L · engineering) — closes ARCH-10, ARCH-14

1. Re-confirm ARCH-10 and ARCH-14 at the current head (statuses here are from 94b4f9238).
2. **`.js`/`.ts` twins.** Codemod every importer of `server/db.js` (162 at audit) onto `server/db.ts`, and every importer of `server/utils/logger.js` (221) onto `logger.ts`. Then delete the `.js` files. Before the switch:
   - Confirm that `logger.ts`'s `SENSITIVE_KEYS` is a superset of the `.js` list, so PHI redaction does not regress.
   - Confirm that no caller relies on `db.js`'s three-times retry (`db.js:118,270`). That retry also re-runs non-idempotent writes, so dropping it is a correction. Note it in the commit.

   Add a CI check that refuses any `x.js`/`x.ts` pair under `server/`, with `ALLOWED_SHADOWS` empty. Show it failing first. Bring the remaining reachable JS under `checkJs` or convert it.
3. **Auth middleware.** Consolidate `server/auth.ts` `authMiddleware` and `server/middleware/auth.ts` `authenticateToken` (plus the `.js` shim) into one implementation. Both re-implement the idle timeout, password-change, revocation and MFA-pending checks. Migrate the importers and delete the other implementation in the same change. Coordinate with MR-07, which hardens these checks.
4. **Storage and dead clients.** Delete `server/storage.ts` (`MemStorage`/`DatabaseStorage`) only if stage 5 left `/api/qc` (refused) unmounted and no launch route imports it. Its replacement is `server/services/storage/*`. Delete `server/prisma/client.js`, whose header says "Active consumers: none". Run the history search first.
5. **Chat pipelines.** The launch chat entry points are the ones in `LAUNCH_AI_SURFACE.md` (stage 6). Route every other conversational entry point to them, or leave it unmounted.
6. **Pricing** (`client/src/concept2cure/v2/fixtures/licensing.ts:68-123`, `onboarding-data.ts:21-107`, `server/services/billing.ts:119`, `license-manager.ts:450`) belongs to MR-16 (UX-05, GTM-12) under F-20. Do not consolidate it here.

**Acceptance**
- `git ls-files server | grep -E '\.(js|ts)$'` shows no twin pairs, and the twin check was shown failing first.
- Exactly one auth middleware is exported and imported, proven by a grep-based CI assertion.
- Each deletion commit names the replacement by path and its reachability gate.
- The server test suite stays green.

### Stage 11 — One schema source and one store of record (Phase 3 for ARCH-15 · Backlog for DATA-10 · M · mixed) — closes ARCH-15, DATA-10

1. Re-confirm ARCH-15 and DATA-10 at the current head (statuses here are from 94b4f9238).
2. Set `out: './drizzle-out'` in `drizzle.config.ts:21` and gitignore it. Guard `db:push` (`package.json:309`) behind a script that refuses when `NODE_ENV=production`, or when `DATABASE_URL`/`DATABASE_URL_ADMIN` is not localhost. Show the guard refusing a non-local URL.
3. Archive only SQL files that no applier executes. Appliers are `C2C_MIGRATION_FILES`, install-fresh and the gcc tree. DATA-10 counted 85 such files in `db/migrations`. ARCH-15's figure of 249 counted files missing from `C2C_MIGRATION_FILES` alone, so do not use it. Move the archived files to `db/_archive/` with a manifest giving path, sha256 and the reason each is unapplied. Move `sql/`, `init-sql/` and `database/schema` there too if no applier reads them. `ci:migration-drop-safety` must stay green.
4. Name one e-signature store and one audit trail of record in code, as a constant and a header comment in the canonical module, coordinated with MR-06, which owns their integrity. List the eight signature stores and roughly 25 audit tables, and mark which are legacy.
5. Stop provisioning schemas outside the catalog (cortex, innovation, intelligence, federated_ml, manufacturing) in install-fresh. Do this only by amending each creating migration in place with a dated header note (what was removed, why, which commit), as Rule 1 requires. Never append a DROP. Keep every schema that CMC / Module 3 and Reporting & analytics use.

**Acceptance**
- `npm run db:push` refuses a non-local URL, demonstrated.
- The archive manifest lists every moved file with its hash, and a fresh install from the deploy set still passes `tests/db`.
- `ci:migration-drop-safety` and its selftest stay green.
- The store-of-record constants exist and are referenced by the MR-06 signature path.

### Stage 12 — Lean image, repository and dependencies (Backlog · S · engineering) — closes ARCH-11, ARCH-16, ARCH-19, ARCH-20, UX-21

1. Re-confirm ARCH-11, ARCH-16, ARCH-19, ARCH-20 and UX-21 at the current head (statuses here are from 94b4f9238).
2. **Unused dependencies.** Remove the runtime dependencies that `knip` confirms are unused, and remove their dead `manualChunks` rules in the Vite config in the same change. Packages include `antd`, `@ant-design/icons`, `joi`, `passport(-local)`, `reactflow`, `d3`, `recharts`, `html2canvas`, `react-pdf`, `jspdf` and the unused `@radix-ui/*` packages. Move test-only packages to `devDependencies`. Run `knip --dependencies` in CI so a new unused dependency fails.
3. **Runtime image.** Replace `COPY --from=builder /app/server ./server` (`Dockerfile.optimized:169`) with an explicit runtime asset manifest of files read relative to the working directory, such as `docx-pdf-pipeline.ts:33`. Move `server/scripts/data` (69 files, about 78 MB) out of the repository into the artifact store (F-22). Record the image size before and after.
4. **Repository hygiene.**
   - `git rm --cached` the files that do not belong in git: `logs/export_actions.jsonl`, `data/logs/notifications.jsonl`, `data/test_output/*`, `storage/ir-packs/*.zip` and `design-system-bundle.tgz.bin`. Add their paths to `.gitignore`.
   - Move the 46 root markdown files to `docs/specs/`, except `README.md`, `CLAUDE.md` and `AGENTS.md`.
   - Moving `docs/evidence` to an artifact store follows F-22 and MR-02.
5. **Error swallowing.**
   - Replace each swallowed `ROLLBACK` catch with `logger.warn` and `client.release(err)`, so the pool discards the connection.
   - Add a CI ratchet on the counts of `catch(() => {})` and `console.log` in `server/`. The ratchet fails when a count rises, shown with a constructed addition.

**Acceptance**
- `knip --dependencies` passes in CI and fails on a constructed unused dependency.
- The production image contains `dist` plus the manifest assets only, and the size change is recorded.
- `git ls-files` lists none of the logged or output files.
- The swallow and console ratchets fail on a constructed regression.

## Definition of done

- In production, the running route table equals the launch catalog plus platform and infrastructure prefixes. Boot and `/readyz` fail when any launch prefix is missing (stages 2, 4, 5).
- AnA in production offers and runs only tools on a founder-approved allowlist with rationale and eval reference. Unclassified tools are refused on every path (stages 3, 6).
- The shipped server and client bundles contain no code used only by refused families, and still contain CMC / Module 3 and Reporting & analytics (stage 5).
- Every scheduler goes through the lease or a reasoned baseline entry, and a CI gate keeps it that way (stage 7).
- There is one deployment target, one auth middleware, no `.js`/`.ts` twins, one typed config validated at boot, and one named signature store and audit trail of record (stages 8–11).
- Every new gate has been shown failing on the case it exists to catch, with the evidence filed under `docs/evidence/MR-14/`.

## Founder decisions this order needs

- **F-14 (AnA tool surface in production)** blocks stage 3 and stage 6 step 5. The founder must approve the per-app allowlist and rule on the knowledge tools from domains outside the catalog. `run_python_script` is settled with MR-13.
- **F-10 (FDA only, eCTD v3.2.2)** settles stage 4's exclusion of `/api/ectd/v4/*`. F-23 governs when v4 returns.
- **F-4 (AWS as the one hosting topology)** blocks stage 9.
- **F-20 (one plan catalog served by the server)** decides pricing consolidation, which is moved to MR-16.
- **F-22 (evidence in an artifact store)** governs stage 12's data-dump and `docs/evidence` moves.
- **NEW: unmount refused families in production.** May route families outside the catalog be unmounted in production, with the code kept in the tree? Does any customer or demo rely on `LAUNCH_SCOPE_ENFORCE=off` or `LAUNCH_SCOPE_API_UNATTRIBUTED=report`? This is arch open question 4, and it blocks stage 5 and the production refusal in stage 4 step 7.
- **NEW: retire the other deployment targets.** Confirm that no customer, demo or partner deploys through Replit, App Engine, Vercel, Helm or k8s. This is arch open question 3, and it blocks stage 9.
- **NEW: fail closed on entitlement-resolution errors.** Should the module-entitlement gate fail closed when `MODULE_ENFORCEMENT=enforce`? This blocks stage 8 step 5.
- **NEW: protocol-dev in the validation scope.** Confirm that protocol-dev's `study-design` and `biostat-bridge` are in the validated Authoring scope. This is arch open question 6, and it affects stage 4's verdicts.

## Do not

- **Do not fence, unmount, exclude or delete the CMC / Module 3 composition path or Reporting & analytics.** The auditor's "exclusive-refused" list predates their joining the catalog. The boundary is `shared/constants/launch-scope.ts` plus `services/cmc/composition-scope.ts`. Widening or narrowing it is a founder decision.
- **Do not append a DROP to remove schemas outside the catalog.** Amend the creating migration in place with a dated header note (Rule 1), and do not edit `20261001d_scheduled_job_claims.sql` for a comment.
- **Do not delete a route, surface or tool as "unreachable" without the history search,** the replacement named by path and the reachability gate in the commit. If none exists, it goes to the founder.
- **Do not build a second lease, a second allowlist mechanism or a second config loader.** Extend `scheduledOnce.ts`, `ana-launch-scope.ts` and `launch-scope-api.ts`.
- **Do not change `modulesForPath`** to fix verdicts, because the entitlement gate depends on it. Do not rely on the client `LaunchScopeGate` as the control. The server decides.
- **Do not keep a copy of a deleted target or twin under `_unsupported/` or `legacy/`.** Git history is the archive. SQL files on no applier are the one exception: they go to `db/_archive/` with a manifest.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-14/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
