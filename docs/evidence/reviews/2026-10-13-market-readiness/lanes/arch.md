## Lane: Architecture & codebase health

### Readiness score: 4/10
The team has built a strong set of guardrails: most dead code has been pruned, TypeScript runs strict, there is a server-side launch-scope gate that defaults to on in production, the bundle is checked for missing modules, there is a gateway-bypass burndown list, and there is one canonical AWS pipeline. The problem is size and shape. For a six-app launch catalog, production mounts and loads a **1.01M-LOC server** (93% of all server code is reachable from `server/index.ts`). **72% of mounted `/api` prefixes (262 of 366) are answered with a 403 in production rather than simply not being mounted.** A single 21k-line AnA tool executor keeps about 141k LOC of engines outside the catalog live, behind 590 "in-scope" tools that bypass the HTTP gate entirely. There are also several operational defects (listed in the findings) that a GxP customer would notice early:
- schedulers run twice when two API tasks run
- route mounting fails open
- five in-scope AnA tools need a Python runtime the production image does not ship
- the tenant-scope gate runs only in a client-side git hook
- the tenant directory uses a second Postgres driver

Nothing in this lane blocks deploy (no P0). The work needed before a paid pilot is scope contraction and a set of fail-closed fixes, not a rebuild.

### Key metrics
Scripts and raw output are in `<scratch>/arch/`: `graph.mjs`, `mountmap.mjs`, `verdicts.ts`, `deps.mjs`, `clientscope.ts`, `casebypass.ts`, `summary.json`, `verdicts.txt`, `exclusive-refused.txt`, `deps-usage.json`.

| Metric | Value |
|---|---|
| Server LOC (with tests) | 1,419,940 LOC in 4,943 files. Non-test: 1,081,175 LOC in 2,910 files |
| Server reachable from `server/index.ts` (esbuild-accurate resolution, checked) | **1,010,296 LOC / 2,659 files (93.4% of LOC)**. Dead: 70,879 LOC / 251 files |
| `server/routes` | 481 of 486 files reachable. Unmounted: `cognitive-ecosystem.ts`, `health.ts`, `reports/{generate-report,subscriptions-routes,manifest-routes}.ts` (1,638 LOC) |
| `shared/` reachable | 63,459 of 74,714 LOC (84.9%) |
| `client/src` reachable from `main.tsx` | 179,142 of 179,383 LOC (99.9%) |
| Client LOC reachable only from out-of-scope surfaces | **≈80,861 LOC / 202 files** (84 of 122 registered surfaces are outside the catalog) |
| `/api` mount prefixes in bootstrap/startup | 366 distinct (450 mount entries) |
| Production verdict per prefix (real `launchScopeApiVerdict`) | launch 72 · never-gated 20 · infra 12 · **out-of-scope 89 · unmapped 173 → 262 refused** |
| Server LOC reachable only through refused mounts | **≥227,231 LOC / 607 files (21%)** — a lower bound |
| LOC reachable only through `AnaToolExecutor.ts` | **140,767 LOC / 184 files**. Refused mounts plus executor together: ≤397k LOC (36.7%) |
| AnA tools | 590 in scope and 189 hidden. 730 handlers in one 21,039-line file |
| Dependencies | 206 runtime, 67 dev. **87 runtime deps have zero imports anywhere**; 13 more are used only off production paths |
| `.js`/`.ts` twin pairs | 11. Two differ in content and both get bundled (`db`, `logger`) |
| Reachable server JS that is never typechecked | 38 files / 11,736 LOC (no `allowJs`) |
| TypeScript escape hatches (production code) | `@ts-nocheck` 0 · `@ts-ignore` 7 files · `@ts-expect-error` 1 file · `eslint-disable` 44 files |
| Explicit `any` (production code) | `as any` 2,658 · `: any` 4,560 · `<any>` 353 · `any[]` 712 |
| `tsc` | strict + `noImplicitAny`. Baseline says `errorCount: 0` (claimed; I did not run it — it needs a 24 GB heap) |
| ESLint | 6,411 warnings baselined. 52,339 reachable client LOC not linted |
| Non-test files over 2,000 lines | 54 files (202,114 LOC). Over 1,000 lines: 235 |
| Fail-open mount `catch` blocks | 173 |
| Env vars read by reachable server code | 380 (220 documented in `.env.example`) |
| SQL migration files | 572 across two directories. 323 are applied; **249 are not in the applied set** |
| Tracked repo | 14,852 files / 340 MB. `docs/` is 5,374 files / 111 MB (4,457 of them under `docs/evidence`) |
| Deployment definitions | 1 canonical plus about 10 others |
| CI | 234 `ci:*` scripts. 99 are never invoked by any workflow or hook. **5 substantive gates run only in the git hook** |

### What is genuinely strong (keep, don't rebuild)
- **Static route imports.** `server/bootstrap/mount-routes.ts` requires static imports, and `server/bootstrap/__tests__/routes-reach-the-bundle.test.ts` checks them. This closed a real class of "variable `import()` missing from the esbuild bundle" defects. The Dockerfile also runs `scripts/ci/check-server-bundle-prod-imports.mjs`.
- **Server-side launch-scope gate.** It is mounted once, before every feature family (`server/startup/routes.ts:108`), defaults on in production, and refuses to boot on a value it cannot parse (`server/services/entitlements/launch-scope.ts`). Unmapped paths are refused by default in production. The client does not decide scope (`shared/constants/launch-scope.ts`).
- **Production posture refusal.** Demo/experimental/mock flags and `AUTH_BOUNDARY_MODE=warn` stop the boot in production (`server/startup/env.ts:33-65`).
- **Dead code is mostly gone.** 93% of server and 99.9% of client code is reachable, which means earlier pruning worked. Launch-catalog code is well typed: the `any` density per KLOC is 0.0 for `services/qms` and `services/entitlements`, 0.3 for `submission-gateways` and `mcp`, and 1.9 for `ectd`.
- **Honest ratchet baselines.** `scripts/ci/check-js-ts-shadows.mjs`, `scripts/ci/gateway-bypass-baseline.json` (every entry carries a reason) and the typecheck/ESLint ratchets are all honest.
- **Deploy image.** `Dockerfile.optimized` is multi-stage, runs non-root, pins veraPDF by SHA-256 and health-checks `/readyz`. CloudFront is locked to the ALB with an `X-Origin-Verify` secret (`terraform/modules/alb/main.tf:70-76`).
- **MCP connector is small and consistent.** `server/mcp` is 2.6k LOC with 19 tools, and all 7 AnA handlers it bridges are classified in-scope.
- **One editor chain.** `DocumentWorkbench` → `RichSectionEditor` → `DocumentCanvas` in `client/src/concept2cure/v2/editor`. I found no parallel editor generation still reachable.

### Findings

**ARCH-01 · P1 · Out-of-scope code is mounted, loaded and running in production; scope is one env var away from open**
- **Evidence:**
  - Production verdicts for the 366 mounted prefixes (`verdicts.txt`): 262 are refused with 403. At least 227k LOC exists only behind those refused mounts (`exclusive-refused.txt`: `routes/c2c` 18.3k, `api/cmc` 13.3k, `services/regulatory` 7.8k, `grdhe` 4.6k, `storage.ts` 4.4k, …).
  - Examples of mounted-but-refused families:
    - `/api/regulatory-digital-twin` (`register-advanced-platform-routes.ts:179`)
    - `/api/agent-swarm` (`:177`)
    - `/api/ana-cortex-ft` (fine-tuning, `:175`)
    - `/api/snowglobe` (`:213`)
    - `/api/nano-banana` (`register-inline-routes.ts:147`)
    - `/api/pdf-tasks` (`register-regulatory-routes.ts:422`). This one spawns `python3 cer_tasks.py` (`pdf-task-routes.ts:149`), a file that exists nowhere in the repo.
  - `readLaunchScopeMode` accepts `LAUNCH_SCOPE_ENFORCE=off` in production silently (`launch-scope.ts:29`). `LAUNCH_SCOPE_API_UNATTRIBUTED=report` reopens all 173 unmapped prefixes and only logs a warning. Compare `AUTH_BOUNDARY_MODE=warn`, which stops the boot.
  - Background jobs are not covered by the HTTP gate. `externalIntelligenceSweep` is on by default (`server/jobs/externalIntelligenceSweep.ts:33`) and scans FDA/EMA/PubMed nightly for a surface (reg-change) that is out of scope.
- **Impact:** The validated boundary is a runtime setting, not what ships. Top-level side effects of out-of-scope code run in every production process. A customer's CSV scope cannot match what is deployed.
- **Fix:** Tag each registrar entry with its app or surface id, and have the registrars skip refused families when `launchScopeEnforced()` is true (code stays in the tree, so no deletion). Add an esbuild `define` so the skipped branches are tree-shaken out of the bundle. Refuse `LAUNCH_SCOPE_ENFORCE=off` or `LAUNCH_SCOPE_API_UNATTRIBUTED=report` in production unless an exact acknowledgement string is set, the same way the LiteLLM bypass acknowledgement works.
- **Effort:** M. **Depends on:** ARCH-02.

**ARCH-02 · P1 · Launch prefixes are porous: whole out-of-scope routers ride on shell-surface claims**
- **Evidence:**
  - The `training` shell surface declares `apiPrefixes: ['/api/enablement', '/api/ana']` (`shared/constants/ui-surface-registry.ui-v2.ts:1258`). That makes all 68 endpoints of `server/routes/ana-features.ts` (5,473 LOC, mounted at `register-ai-routes.ts:28`) "launch". They include `/intelligence-feed`, `/gap-analysis`, `/change-impact`, `/therapeutic-areas`, `/guidance/webhook` and `/submission-chat/stream`.
  - Other broad claims:
    - `/api/rim` via `project-home` (9 of its 10 claimants are out of scope)
    - `/api/global-ri` via `dossier-map`
    - `/api/study-design` via `protocol-dev` (17.9k LOC of services)
    - `/api/submission-ops` via `vault` and `tasks`
    - `/api/corpus` via `artifacts-center`
  - `modulesForPath` uses longest-prefix match (`server/services/entitlements/api-prefix-map.ts`), so any unclaimed sub-path inherits the parent's launch verdict.
- **Fix:** Build per-route allowlists for shared launch prefixes, or split routers so launch endpoints live in launch routers. Remove `/api/ana` from `training`.
- **Effort:** M.

**ARCH-03 · P1 · A 21k-line AnA tool executor keeps out-of-scope engines live, outside the HTTP gate**
- **Evidence:**
  - `server/services/ana/AnaToolExecutor.ts` is 21,039 lines, with 730 `registerToolHandler` calls, 925 dynamic imports and 563 `any`.
  - With that one file removed from the graph, 184 files / 140,767 LOC become unreachable.
  - The inventory (`ana-launch-scope.inventory.json`) classifies 590 tools as in-scope. That includes knowledge tools from domains outside the catalog: `assess_biosimilar_cmc`, `design_vaccine_cmc`, `assess_pv_causality`, `run_monte_carlo_simulation`, `assess_cell_therapy_manufacturing`, and 20 device tools.
  - Engines reachable **only** through AnA: `services/biosimilar` 2,609, `vaccine` 1,836, `rare-disease` 1,866, `digital-health` 1,864, `dose-optimization` 2,155 LOC.
  - At runtime the default is allow. `anaCapabilityInLaunchScope` returns `true` for any tool not on the hidden list (`ana-launch-scope.ts`). Only a unit test enforces that every tool is classified. MCP's `callAnaHandler` does not re-check scope (`server/mcp/tools/runtime.ts:88`).
- **Impact:** The assistant can execute about 100× the launch catalog's functional surface. That is a validation-scope and intended-use problem, and it conflicts with CLAUDE.md RULE 2.
- **Fix:**
  - Add a production allowlist: validated tools per launch app, each with a rationale, default-deny. Enforce it in `governed-toolset.ts` and in `callAnaHandler`.
  - Split the executor into per-domain registries of 2,000 lines or fewer, with a launch index and a non-launch index, so launch-only builds do not import out-of-scope engines.
- **Effort:** L. **Needs a founder decision** (see open questions).

**ARCH-04 · P1 · In-process schedulers run in every API task; production runs two tasks; no leader lock**
- **Evidence:**
  - `server/index.ts:260-290` starts 8 cron/interval jobs in the listen callback. `startup/services.ts` adds the chain monitor, digest heartbeat and subscription sweep.
  - `git grep pg_try_advisory` in non-test server code: 0 hits. No `server/jobs/*.ts` file takes a lock.
  - `terraform/environments/production/terraform.tfvars.example:34` sets `api_desired_count = 2`.
  - `retentionCron` defaults on in production (`retentionCron.ts:339-351`) and hard-`DELETE`s from `vault.documents` (`:127`).
  - `deploy-aws.yml:50-55` itself says a second copy of every scheduler is "worse than no worker". Two API tasks produce exactly that.
  - Terraform still declares a `worker` ECS service that has no image to run (`deploy-aws.yml:61-64`).
  - The downstream effects (duplicate notifications, emails, findings) are UNVERIFIED. The missing lock is verified.
- **Fix:** Wrap each job in a per-job `pg_try_advisory_lock`, or run a single `SCHEDULER_ROLE=primary` task definition from the same image. Remove the orphaned worker service.
- **Effort:** S–M.

**ARCH-05 · P1 · Route families mount fail-open, and readiness does not check that launch routes exist**
- **Evidence:**
  - There are 173 `Failed to mount` catch blocks in `server/bootstrap/*.ts`. For example, the Vault read-model at `register-clinical-intel-routes.ts:185-191` logs the error and boot continues.
  - `mountAll` logs and skips a missing router (`mount-routes.ts:69-72`).
  - `/readyz` checks only schema and the AI provider (`inline-endpoints.ts:50+`).
  - `STRICT_STARTUP_INVARIANTS=false` in `.env.example:771`.
- **Impact:** A launch app can return 404 in production while the deployment reports healthy, so the validated state cannot be proven.
- **Fix:** Derive the required prefixes from `LAUNCH_APPS`. After `registerPostStartRoutes`, walk the Express router stack and exit with an error in production if any required prefix is missing. Report the same check from `/readyz`.
- **Effort:** S.

**ARCH-06 · P1 · Tenant-isolation and migration-safety gates run only in a client-side hook**
- **Evidence:**
  - `ci:drizzle-tenant-scope`, `ci:migration-drop-safety`, `ci:unauthenticated-fetch`, `ci:upload-guards` and `ci:undefined-css-classes` appear only in `.husky/pre-push` (lines 147, 236, 272, …). Grep finds them in no `.github/workflows/*.yml`.
  - Husky is installed by `prepare: [ -n "$CI" ] || husky || true`. In this clone `core.hooksPath` is unset and `.git/hooks` holds only samples, so the hook does not run at all here.
  - CLAUDE.md RULE 1 cites this hook as the enforcement.
- **Fix:** Add these gates, plus their selftests, to `ci.yml` as required status checks. Keep the hook as a convenience.
- **Effort:** S.

**ARCH-07 · P1 · Five in-scope AnA document tools need a Python runtime the production image does not ship**
- **Evidence:**
  - `scriptWorker.ts:56` resolves `workers/artifact-compute/*.py` from `process.cwd()`.
  - The tools `run_python_script`, `insert_document_content`, `surgical_docx_xml_edit`, `insert_clause_template` and `validate_docx` are all in-scope.
  - The production stage of `Dockerfile.optimized` copies `dist`, `server`, `shared`, the two migration directories, `scripts/db` and `assets`. It copies neither `workers/` nor `ingestion/`, and never installs `requirements.txt` (`python-docx`, `lxml`).
  - `unifiedDocumentIngestion.js:93-94` expects `.venv/bin/python3` and `ingestion/pdf_extractor.py`.
  - `server/requirements.txt` includes `../services/requirements.txt`, which does not exist.
  - The sandbox monkeypatches `socket.socket` inside the process (`python-script-runtime.py:65-81`) and runs in the same container and UID as the API. It is likely bypassable via `subprocess`, `_socket` or `/proc/<ppid>/environ` — UNVERIFIED.
- **Fix:** Either ship a pinned Python layer, copy `workers/`, and have a boot probe run each runtime once; or withdraw the five tools from the production allowlist. In both cases, move code execution into a separately isolated task.
- **Effort:** M.

**ARCH-08 · P1 · The tenant directory uses a second Postgres driver outside the canonical tenant-scoped pool**
- **Evidence:**
  - `server/routes/tenants-simple.ts:6,66-73` opens its own connection with `postgres(DATABASE_URL)` (the porsager driver).
  - It is mounted at `/api/tenants` (`register-tenant-routes.ts:51`), a platform prefix the shell reads on every load. It includes `DELETE /:id` (`:381`) and `POST /:id/purge` (`:479`).
  - The canonical pool is `server/db/runtime.ts:51`, which carries the tenant session settings (`set_config('app.current_tenant_id'…)` appears at about 30 call sites).
  - Reachable `indCopilot.js:11-21` also builds a Supabase service-role client.
- **Fix:** Move it onto `getPool()` with an explicit system scope for platform-admin operations. Remove `postgres`, `@supabase/supabase-js` and `@neondatabase/serverless`. Add a lint rule that forbids new pools outside `server/db`.
- **Effort:** S.

**ARCH-09 · P2 · Two holes in the scope checks: a case-sensitive gate in front of case-insensitive routing, and a CI gate that misses a refused launch call**
- **Case bypass**
  - **Evidence:**
    - `moduleEntitlementGate.ts:112` skips any path where `!pathname.startsWith('/api/')`.
    - I reproduced this with the real gate on Express 5.2.1, launch scope on and unattributed set to enforce (`casebypass.ts`):
      - `/api/regulatory-digital-twin/ping` → 403
      - `/API/regulatory-digital-twin/ping` → **200**
      - `/Api/cmc/ping` → **200**
    - The auth boundary still applies to these paths.
    - In the canonical AWS topology this is mitigated only by accident: CloudFront path patterns are case-sensitive (`terraform/modules/cloudfront/main.tf:8-23` routes only `/api/*` to the ALB). The mitigation does not exist on compose, Helm, `app.yaml` or `.replit`.
    - The same class of issue affects the audit immutability regex `/^\/api\/audit\/events/` (`startup/middleware.ts:225-233`).
  - **Fix:** Normalize the path in the gate (or 404 any non-lowercase `/api` path) and set `app.set('case sensitive routing', true)`.
- **CI gate blind spot**
  - **Evidence:**
    - The surface-to-component regex in `scripts/ci/check-launch-scope-api.ts:149` has no left boundary. `tasks` matches `device-tasks`, `vault` matches `device-vault`, `licensing` matches `master-licensing`, and `home` matches `project-home` (demonstrated).
    - So the real `tasks` surface (`TaskBoard`, `surfaceViews.ts:576`) is never checked. It calls `GET /api/project-rules` (`TaskBoard.tsx:212`), whose verdict is `unmapped` → 403 in production, while the gate prints "none refused".
  - **Fix:** Add a `(?<![\w-])` boundary to the regex and register `/api/project-rules` on `tasks`.
- **Effort:** S.

**ARCH-10 · P2 · Two diverged `.js`/`.ts` twins are both bundled, so the typechecked module is not the shipped one**
- **Evidence:**
  - `server/db.js` (299 LOC) and `db.ts` (34 LOC) are both reachable: 162 reachable importers get `db.js` and 517 get `db.ts`.
  - `utils/logger.js` and `logger.ts` are likewise both reachable (221 vs 334 importers). The `.js` header says the two are "kept in sync by hand … or PHI starts leaking". Their `SENSITIVE_KEYS` lists match today (49 each).
  - esbuild resolves `'./m.js'` to `m.js` even when `m.ts` exists (checked in `esb/`).
  - `db.js` `query` retries any error three times with backoff (`db.js:118,270`), including non-idempotent writes.
  - 11.7k LOC of reachable JS is never typechecked.
- **Fix:** Codemod the importers onto the `.ts` modules, delete the twins, and turn on `checkJs` or convert the remaining JS.
- **Effort:** M.

**ARCH-11 · P2 · 87 unused runtime dependencies ship in the production image**
- **Evidence:**
  - `deps.mjs` (all tracked source plus configs) finds 87 runtime dependencies with no import. They include `antd`, `@ant-design/icons`, `@emotion/react`, `firebase`, `passport(-local)`, `express-session`, `connect-pg-simple`, `memorystore`, `crypto-js`, `html2canvas`, `jspdf`, `joi`, `lodash`, `d3`, `recharts`, `reactflow`, `react-monaco-editor`, `swagger-*`, `@stripe/*`, 22 `@radix-ui/*` packages and 20 tiptap/prosemirror/yjs packages.
  - On disk: `antd` 60 MB, `firebase` 54 MB, `@ant-design` 48 MB. `npm ci --omit=dev` (`Dockerfile.optimized:111`) installs all of them into the runtime image.
  - Overlapping groups:
    - validation: `zod` (230 files) vs `yup` (1, unreachable) and `joi` (0)
    - HTTP: native fetch vs `axios` (2 reachable) and `node-fetch` (0)
    - Postgres: `pg` (113) vs `postgres` (1), `supabase` (1) and `neon` (0)
    - JWT: `jsonwebtoken` (9 reachable) vs `jose` (tests only)
- **Fix:** Remove the 87, move test-only packages to dev dependencies, and run the existing `knip.json` dependency check in CI.
- **Effort:** S.

**ARCH-12 · P2 · The monolith is too large for a small team to maintain or validate**
- **Evidence:**
  - Largest files: `AnaToolExecutor.ts` 21,039; `shared/schema.ts` 20,205; `statistics-service.ts` 6,920 (dead); `authoring.router.ts` 6,898; `ana-ri/command-executor.ts` 5,595; `ana-features.ts` 5,473; `DocumentWorkbench.tsx` 5,384.
  - `server/services` has 225 subdirectories plus 267 loose files; `server/routes` has 372 loose files.
  - `tsc` runs out of memory at 6 GB and needs a 24 GB heap (`scripts/ci/typecheck-no-regression.mjs:94-99`), which is more than a 16 GB laptop or the standard CI runner has.
- **Fix:** Split the TypeScript build into project references (`launch-core`, `oos`, `client`, `shared`), then decompose the top 10 files.
- **Effort:** L.

**ARCH-13 · P2 · Lint does not cover launch-catalog client code; no `any` rule; key security rules are off**
- **Evidence:**
  - `eslint.config.js:37-57` ignores `client/src/*` except `concept2cure/v2`, and ignores `scripts/**`. That leaves unlinted:
    - `concept2cure/quality` (QMS, 2,439 LOC)
    - `concept2cure/auth` (2,244)
    - `lib/queryClient.ts`
    - `TenantContext.tsx`
    - `concept2cure/mdx` (28,058)
  - There is no `no-explicit-any` rule.
  - `security/detect-child-process` and `detect-non-literal-fs-filename` are off (`eslint.config.js:278-283`).
- **Fix:** Lint the whole client, add `no-explicit-any` at warn level with a ratchet, and enable the security rules for `server/services/compute` and `server/integrations`.
- **Effort:** S–M.

**ARCH-14 · P2 · Parallel implementations violate the zero-duplication rule**
- **Evidence:**
  - **Auth middleware:** `server/auth.ts` `authMiddleware` (392 LOC, 67 importers) and `server/middleware/auth.ts` `authenticateToken` (625 LOC, 95 importers), plus a `.js` shim (30 importers). Both re-implement idle timeout, password-change, revocation and MFA-pending checks.
  - **Chat pipelines:** at least 5 conversational entry points — `/api/ana-ri/stream` (3,093), `/api/chat/send-message` (1,355) and `/api/chat/stream`, `/api/ana/submission-chat(/stream)`, `/api/evidence-ask`, `/api/claude/*`.
  - **Pricing:** `LIC_DTC`, `LIC_ARCHETYPES`, `LIC_BUNDLES` and `LIC_ROLES` are duplicated in `client/src/concept2cure/v2/fixtures/licensing.ts:68-123` and `onboarding-data.ts:21-107`, and again in `server/services/billing.ts:119` and `license-manager.ts:450`. The client pricing lists sell out-of-scope features ("CER Generation", "510(k) Module", "On-Prem Option").
  - **Flags:** 7 or more flag systems (`featureToggleService`, client `flags/featureFlags.ts`, `config/ossStackFeatureFlags.ts`, `documentIntelligence/featureFlags.ts`, `ingestion/parserFeatureFlags.ts`, `preclinical/feature-flags.ts`, …), plus launch scope, module entitlements and 380 env vars.
  - **Storage:** `server/storage.ts` (4,431 LOC; `MemStorage`/`DatabaseStorage`, used only by `/api/qc`, which is refused) vs `services/storage/*` vs `services/s3-storage.ts`.
  - **Kept although dead:** `server/prisma/client.js` (its own header says "Active consumers: none") and `services/cognitive-ecosystem` (10,451 LOC, unreachable).
- **Fix:** Consolidate cluster by cluster; the pricing duplication is the one to do first.
- **Effort:** M–L.

**ARCH-15 · P2 · Migration and schema sources are sprawled, and a destructive shortcut is one command away**
- **Evidence:**
  - 572 SQL files across `migrations/` (279) and `db/migrations/` (293). `C2C_MIGRATION_FILES` references 323, so **249 are never applied**.
  - More schema sources: `sql/` (21 files), `init-sql/`, `database/schema` (24 TS files, unreachable), and 24 server files with runtime `CREATE TABLE`.
  - `drizzle.config.ts` writes its output into the same `./migrations` directory, and `npm run db:push` runs `drizzle-kit push` against `DATABASE_URL_ADMIN`/`DATABASE_URL`.
- **Fix:** Archive the unapplied files with a manifest, give Drizzle its own output directory, and guard or remove `db:push`.
- **Effort:** S.

**ARCH-16 · P2 · The runtime image ships the full server source and 78 MB of data dumps**
- **Evidence:**
  - `COPY --from=builder /app/server ./server` (`Dockerfile.optimized:117`) even though `dist/index.js` is the bundle. That copies 2,033 test files and `server/scripts/data` (69 `clinical_trials_*_20250409*.json` files, 78.3 MB) that nothing reachable references.
  - Runtime code reads files relative to the working directory (e.g. `docx-pdf-pipeline.ts:33`).
- **Fix:** Copy an explicit runtime asset manifest instead, and move the data dumps out of the repo.
- **Effort:** S–M.

**ARCH-17 · P2 · Too many deployment targets**
- **Evidence:**
  - Canonical: `Dockerfile.optimized --target production` (`deploy-aws.yml:244`) → Terraform ECS + CloudFront.
  - Also present: `app.yaml` (Google App Engine), a `.replit` `[deployment]`, `.vercelignore`, two Helm charts (`charts/concept2cure-app`, `charts/trialsage-cer`), `helm/values-local.yaml`, `infra/k8s`, three docker-compose files, `deploy/localai`, `cerv2-staging-deploy.yml`.
  - None of the others go through CloudFront, which is the only thing mitigating the case bypass in ARCH-09.
- **Fix:** Move them to `deploy/_unsupported/` with a README, and add a CI check that allows exactly one production target.
- **Effort:** S.

**ARCH-18 · P2 · The configuration surface is large and entitlement enforcement fails open**
- **Evidence:**
  - 380 distinct `process.env` keys are read by reachable server code; 220 are documented.
  - `MODULE_ENFORCEMENT=off` is the default (`.env.example:393`).
  - The entitlement gate lets the request through when entitlement resolution throws (`moduleEntitlementGate.ts:209`). This is a deliberate choice, but it is still fail-open for commercial packaging.
- **Fix:** Validate a typed config schema at boot, and add a CI check that diffs the env inventory against `.env.example`.
- **Effort:** M.

**ARCH-19 · P3 · Repo hygiene**
- **Evidence:**
  - `docs/evidence` holds 4,457 files; 46 markdown files sit at the repo root.
  - 555 of the last 837 commits (30 days) touched `docs/`.
  - Committed artifacts that do not belong in git: `logs/export_actions.jsonl`, `data/logs/notifications.jsonl`, `data/test_output/*`, `storage/ir-packs/*.zip` (3), `design-system-bundle.tgz.bin`, 559 PNGs (60.7 MB), 20 PDFs (36.5 MB).
- **Fix:** Move evidence to an artifact store with hashes, add the log/storage/output paths to `.gitignore`, and move root specs to `docs/specs`.
- **Effort:** S.

**ARCH-20 · P3 · Error-swallowing and logging noise**
- **Evidence:** 499 `.catch(() => {}|null|undefined)` in production code (280 in the server, mostly `ROLLBACK`). 2,522 `console.*` calls in the production server (488 `console.log`). The console bridge (`utils/consoleBridge.ts`) does redact them. TODO 29 / FIXME 0 / HACK 0.
- **Fix:** Release the client with the error after a failed `ROLLBACK`, and migrate `console.log` to the scoped logger over time.
- **Effort:** S.

**ARCH-21 · P3 · Out-of-scope client code ships in the production bundle, and the client gate renders when no verdict has arrived**
- **Evidence:** About 81k LOC across 84 out-of-scope surfaces is bundled (e.g. `CmcModule.tsx` 3,228, `cmcRegisterForms.ts` 2,000, `concept2cure/mdx` 26.8k). `LaunchScopeGate.tsx:30` renders its children when `!verdict`.
- **Impact:** Low, because the server gate is the real control.
- **Fix:** A launch-only build of `surfaceViews`.
- **Effort:** S–M.

**Archival estimate (g).** Unmount or exclude from the build first; delete only after the Working agreement's history search and a replacement-by-path note.

| Tier | Scope | LOC | Mechanism | Risk |
|---|---|---|---|---|
| A. Zero reachability | Server dead code 70.9k (`statistics-service` 6.9k, `cognitive-ecosystem` 10.5k, `strategic-report-generator`, `csr-training-service`, `data-importer*`, `faers-bridge`, …); `shared/` dead code 11.3k; `database/`; `server/prisma`; the 5 unmounted route files | ~85k | Delete after running `git log --diff-filter=D` | Low |
| B. Refused mounts | 262 prefixes | ≥227k | Launch-only registrars plus esbuild `define`; code stays in the tree | Medium (shared helpers). Guard with a reachability check on the esbuild metafile |
| C. AnA engines outside the catalog | Tool code reachable only through the executor | ≤141k (≤397k combined with B) | Tool allowlist plus registry split | Medium–high: changes AnA behaviour, needs founder sign-off |
| D. Client surfaces outside the catalog | 84 surfaces | ~81k | Launch-only `surfaceViews` | Low–medium |
| E. Repo assets | 87 dependencies, 249 unapplied SQL files, 78 MB data, 111 MB `docs/` | — | Remove or archive | Low |

With B, C and D applied, the production runtime shrinks from about 1.01M to about 0.6–0.68M server LOC and from 179k to about 100k client LOC.

### Recommended work orders for this lane (ordered)

1. **Singleton schedulers** (ARCH-04)
   - **Scope:** `server/jobs/*`, `server/startup/services.ts`, `server/index.ts`, `terraform/modules/ecs-fargate`.
   - **Acceptance:** two processes against one database run each job exactly once per tick; a selftest fails without the lock; the orphaned worker service is removed.
   - **Effort:** S–M.

2. **Fail-closed launch mount assertion** (ARCH-05)
   - **Scope:** `server/startup/routes.ts`, `inline-endpoints.ts`.
   - **Acceptance:** in production, boot exits with an error if any `LAUNCH_APPS` prefix has no router; `/readyz` returns 503 and lists the missing ones; a test that breaks the project-vault import fails boot.
   - **Effort:** S.

3. **Move hook-only gates into CI** (ARCH-06)
   - **Acceptance:** `ci.yml` runs `drizzle-tenant-scope`, `migration-drop-safety` (and its selftest), `unauthenticated-fetch` and `upload-guards` as required checks; one deliberately failing PR is shown red.
   - **Effort:** S.

4. **Harden launch-scope enforcement** (ARCH-01 config part, ARCH-02 `/api/ana`, ARCH-09)
   - **Acceptance:** `/API/*` and `/Api/*` return 403/404 in a test; `LAUNCH_SCOPE_ENFORCE=off` or `…UNATTRIBUTED=report` refuses boot in production without an acknowledgement; the CI gate regex has a selftest for `tasks` vs `device-tasks`; `/api/project-rules` is claimed by `tasks`; `training` no longer claims `/api/ana`; the gate lists 0 refused paths.
   - **Effort:** S. **Depends on:** nothing.

5. **Python artifact-compute decision** (ARCH-07)
   - **Acceptance:** either the image contains `workers/` plus pinned Python dependencies and a boot probe that runs each runtime, or the five tools are denied in production. Code execution is moved out of the API container.
   - **Effort:** M. **Depends on:** a founder decision.

6. **Consolidate DB access** (ARCH-08)
   - **Acceptance:** `tenants-simple` runs on the canonical pool; `postgres`, `supabase` and `neon` are removed; a lint rule forbids new pools outside `server/db`.
   - **Effort:** S.

7. **AnA production allowlist and registry split** (ARCH-03)
   - **Acceptance:** an explicit allowlist JSON with a rationale per tool; `governed-toolset` and `callAnaHandler` default-deny, and a runtime test shows an unclassified tool is refused; the executor is split into files of 2,000 lines or fewer; the esbuild metafile of a launch-only build contains none of the out-of-scope engine directories.
   - **Effort:** L. **Depends on:** WO-5 and founder sign-off.

8. **Production mount manifest equals the launch catalog** (ARCH-01)
   - **Acceptance:** registrars skip refused families when enforcement is on; the esbuild metafile no longer contains the files in `exclusive-refused.txt`; mount count equals launch plus platform prefixes; no files are deleted.
   - **Effort:** M. **Depends on:** WO-4.

9. **Dependency diet** (ARCH-11)
   - **Acceptance:** the 87 unused dependencies are removed; the image-size change is reported; `knip --dependencies` fails CI on a new unused dependency.
   - **Effort:** S.

10. **Eliminate `.js`/`.ts` twins** (ARCH-10)
    - **Acceptance:** zero twin pairs; `ALLOWED_SHADOWS` is empty; the remaining reachable JS is under `checkJs` or converted to TS.
    - **Effort:** M.

11. **Runtime image and data hygiene** (ARCH-16, ARCH-19)
    - **Acceptance:** the image contains `dist` plus a declared asset manifest only; the 78 MB of data is out of git; before/after image sizes are recorded.
    - **Effort:** S–M.

12. **Deploy-target and migration hygiene** (ARCH-15, ARCH-17)
    - **Acceptance:** a single production target; the 249 unapplied SQL files archived with a manifest; `db:push` guarded; Drizzle output in its own directory.
    - **Effort:** S.

13. **Lint coverage and TS project references** (ARCH-12, ARCH-13)
    - **Acceptance:** the whole client is linted; `no-explicit-any` ratchet in place; typecheck runs in 8 GB or less per project.
    - **Effort:** M–L.

14. **Config schema and single flag registry** (ARCH-18, the flag part of ARCH-14)
    - **Acceptance:** boot validates every env key in use; a CI diff against `.env.example`; one flag API.
    - **Effort:** M.

15. **Consolidate duplicate clusters** (auth middleware, chat pipelines, pricing, storage; ARCH-14)
    - **Acceptance:** one implementation per capability, with the replacement named by path in each commit.
    - **Effort:** M–L.

### Open questions / needs from the founder
1. Are AnA's 590 in-scope tools, especially the "knowledge" tools from domains outside the catalog (biosimilar, vaccine, PV causality, Monte Carlo, device), part of the validated launch intended use? Or should production default-deny everything except a per-app allowlist?
2. Is `run_python_script` (code the model writes, executed by the platform) in the launch scope at all? If yes, should it be funded as a properly isolated service?
3. Is AWS behind CloudFront the only supported production topology? Can `app.yaml`, the `.replit` deployment, both Helm charts, `infra/k8s` and the compose files be retired?
4. May out-of-scope route families be **unmounted** (code kept) in production, instead of mounted and refused? Does any customer or demo depend on setting `LAUNCH_SCOPE_ENFORCE=off`?
5. What is the target production task count? Is a dedicated scheduler task acceptable?
6. Protocol-dev's promotion into the catalog on 2026-09-21 brings `study-design` (17.9k LOC) and `biostat-bridge` into scope. Is that confirmed for validation?
7. What is the single source of truth for pricing and packaging: `services/billing.ts`, or the client files `licensing.ts`/`onboarding-data.ts`?
8. Can `docs/evidence` (4,457 files / most of 111 MB) and the root audit/handoff markdown move out of the product repo into an evidence store?
