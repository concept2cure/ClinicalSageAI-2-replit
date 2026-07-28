# Live-proof execution log — 2026-07-28

Everything here was **executed**, not read. Each entry gives the exact command so any
finding can be independently re-derived. Where a check could not be run, it says so
rather than inferring a pass.

Environment: Ubuntu 24.04 · Node v22.22.2 · npm 10.9.7 · PostgreSQL 16.13 · pgvector 0.6.0
(installed via `apt-get install postgresql-16-pgvector` — **not** present by default; the
repo's own `AGENTS.md` says it "must be built from source").

Audited tree: `concept2cure-v2` @ `576ec5d`.

---

## LP-01 · Git provenance — history was retrievable only after unshallowing

```
git fetch --unshallow origin
git rev-list --count HEAD
git log --format='%an' | sort | uniq -c | sort -rn
```

| Metric | Result |
|---|---|
| Commits | **5,749** |
| Range | 2025-11-20 → 2026-07-28 (~8 months) |
| Merge commits | 918 |
| Squash-PR commits (`(#NNNN)`) | 495 |

Authorship:

| Author | Commits | Share |
|---|---:|---:|
| Claude | 3,192 | 55.5% |
| concept2cure | 1,574 | 27.4% |
| github-actions[bot] | 361 | 6.3% |
| Cursor Agent | 240 | 4.2% |
| dependabot[bot] | 165 | 2.9% |
| copilot-swe-agent[bot] | 154 | 2.7% |
| ana-integration / ana-harden / GitHub Copilot | 63 | 1.1% |

**Named AI coding agents account for 3,649 of 5,749 commits (63.5%);** bots a further
680 (11.8%). ~1.49M lines of code were produced in ~250 days — a sustained ~6,000
lines/day. This is not a defect in itself, but it is the single most important context
for interpreting every other finding: the volume of code far exceeds what the commit
history shows being human-reviewed, and it explains the pattern this audit keeps hitting —
subsystems that are individually well-built but do not agree with each other.

## LP-02 · From-scratch database install — succeeds, and is materially incomplete

```
createdb audit_fresh
DATABASE_URL=postgresql://…/audit_fresh node scripts/db/install-fresh.mjs
```

Terminal state: **`✅ Application schema install complete.`**

| Claim (`PRODUCT_READINESS_ASSESSMENT.md:53-55`) | Measured | Verdict |
|---|---|---|
| 687 tables | **702** (`public`) / 710 all schemas | ✅ met or exceeded |
| 557 RLS policies | **572** | ✅ met or exceeded |
| 5/5 core tables | 5/5 | ✅ |

So the headline provisioning claim **holds**. The problem is what the same run reports on
its way to that green checkmark.

### LP-02a · Ten migrations fail and are declared "safe to skip"

```
pass 1: applied=144 already-present=2 deferred=18 hard=1
pass 2: applied=8   already-present=0 deferred=10 hard=0
pass 3: applied=0   already-present=0 deferred=10 hard=0
• 10 file(s) left unapplied — … "safe to skip for the app schema"
```

The installer's own words are *"each references a table absent from this schema (non-core
index/ALTER files against renamed/removed tables); safe to skip."* **That claim is false
for at least four of the ten.** Verified against the resulting database:

| Skipped migration | Blocked on | Table in fresh DB? | Non-test server files querying it |
|---|---|---|---|
| `0011_ai_threads_title.sql` | `ai_threads` | **absent** | 8 |
| `20260601_chat_message_metadata.sql` | `chat_messages` | **absent** | 11 |
| `0004/0007_*.sql` | `unified_documents` | **absent** | 13 |
| `0016/0017_module3_*.sql` | `cmc_source_objects` | **absent** | 12 |
| `0006_regulatory_atoms.sql` | `cmc_projects` | **absent** | 5 |
| `0008_critical_fk_delete_policies.sql` | `user_sessions` | **absent** | 0 |

`ai_threads` and `chat_messages` are **not defined in the Drizzle schema at all**; their
only creator is `db/migrations/20260224_ai_trace_chain.sql`, which sits in the migration
tree that is on no automated apply path. Yet `server/routes/chat/threads.ts:40,96,173`,
`server/routes/chat/send-message.ts:102` and `server/routes/conversation-thread-routes.ts:141`
query them with raw SQL, and both route modules **are mounted**
(`server/bootstrap/register-ai-routes.ts:2`, `register-clinical-intel-routes.ts:230`).

Consequence: on a brand-new deployment following the repo's own documented install path,
the conversation/threads surface — which `README.md:25` calls *"the product"* — queries
tables that do not exist. This is the same failure class as the P0 fixed in commit #1186
(`db/migrations/20260401_cmc_convergence_os.sql` was the sole creator of 11 CMC tables and
was on no apply path), recurring in a different subsystem.

### LP-02b · Fifteen Postgres schemas are queried but never created

```
DATABASE_URL=… node docs/audit-2026-07/evidence/fresh-install-gap.mjs
```

Schemas the installer creates: **`audit`, `lumen`, `precedent`, `public`, `vault`.**

Schemas that non-test server code issues SQL against, which do not exist after a fresh
install (extracted from SQL string literals only — comments and ES imports excluded):

| Schema | Distinct tables referenced | Reference sites | Example | Route family mounted? |
|---|---:|---:|---|---|
| `innovation` | 27 | 139 | `server/routes/innovation-routes.ts:178` | **yes** — `register-advanced-platform-routes.ts` |
| `cortex` | 23 | 29 | `server/services/cortexPrimeService.ts:280` | service not mounted |
| `intelligence` | 14 | 51 | `server/services/intelligence/ana-failure-learning.ts:173` | — |
| `regulatory_intel` | 11 | 32 | `…/advisory-committee-service.ts:113` | — |
| `regulatory_harmonization` | 9 | 23 | `server/services/grdhe/grdheService.ts:124` | — |
| `clinical_ops` | 7 | 40 | `server/routes/clinical-operations-routes.ts:207` | **yes** — `register-regulatory-routes.ts` |
| `intelligent_docs` | 7 | 24 | `server/routes/intelligentDocs.ts:90` | **yes** — `register-core-routes.ts` |
| `signing` | 7 | 16 | `server/api/signing/routes.ts:35` | not mounted |
| `compliance` | 7 | 11 | `server/services/cortexComplianceService.ts:149` | — |
| `labeling` | 5 | 17 | `server/api/labeling/routes.ts:37` | — |
| `site_intel` | 5 | 17 | `server/api/site-intel/routes.ts:61` | — |
| `manufacturing` | 4 | 23 | `server/routes/manufacturing-routes.ts:178` | **yes** — `register-regulatory-routes.ts` |
| `ectd` | 4 | 14 | `server/api/ectd/routes.ts:14` | — |
| `predicate` | 4 | 7 | `server/services/precedent-engine.ts:274` | — |
| `core` | 1 | 9 | `server/routes/innovation-routes.ts:119` | — |

Note `predicate` vs the created `precedent` — a **schema-name mismatch**, not merely a
missing schema.

At least four mounted route families (`innovation`, `clinical_ops`, `intelligent_docs`,
`manufacturing`) therefore cannot serve a single request on a correctly-installed fresh
database. They will 500 at the first query.

### LP-02c · RLS coverage after a fresh install is not total

| Measure | Count |
|---|---:|
| Tables with RLS **enabled** | 584 |
| RLS policies present | 572 |
| Tables with RLS enabled but **zero policies** | **21** |
| Tables with RLS **not enabled at all** | **118** |

The 21 enabled-with-no-policy tables are the sharpest edge: under `FORCE ROW LEVEL
SECURITY` an enabled table with no policy denies all access to non-owners, while under the
app's owner role it passes everything — either way it is not doing tenant isolation. The
118 with RLS off are unprotected by definition. Both sets are enumerated in
`10-fresh-install-gap.json`.

This matters more than it looks, because of LP-03.

## LP-03 · Row-level security is compiled but inert — confirmed by reading the installed policy

Every policy installed by `migrations/0021_enable_rls_everywhere.sql` opens with:

```sql
NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
```

so unless the session variable is `'on'`, **every row passes on every table**. No
deployment manifest in the repository sets `RLS_ENFORCE=on`, and it cannot simply be
turned on: only 16 of 97 DB-touching route files use the request-scoped `requestDb(req)`
that sets `app.current_tenant_id`; the remaining ~78-81 use a shared pool that does not,
so those routes would return zero rows or 500 rather than defend anyone. The repo states
this itself in commit #1186 and in `docs/RLS_ENFORCEMENT_BURNDOWN.md`, whose owner field
reads *"unassigned."*

**Net: the 572 policies just verified as installed are, in the shipped configuration,
decorative.** Tenant isolation rests entirely on the application layer.

## LP-04 · Static sweep totals (deterministic, whole-tree)

```
node docs/audit-2026-07/evidence/sweep.mjs
```

| Measure | Value |
|---|---:|
| Files walked | 7,858 |
| Lines of TS/TSX/JS/JSX | **1,489,132** |
| Files over 1,500 lines | 79 |
| HTTP endpoint declarations | **4,077** |
| …carrying a route-level auth guard | 589 (14.4%) |
| Distinct tables created in SQL | 1,175 |
| Distinct tables declared in Drizzle | 699 |
| Tables with duplicate `CREATE TABLE` across files | **140** |
| Tables declared twice in Drizzle | 11 |
| Tables that exist only in SQL (invisible to Drizzle) | **549** |
| `server/services` dirs with at least one test | 124 / 203 (61%) |
| Items suppressed across tracked baselines | **1,292** |
| Working-tree secret-scan hits | **2 — both false positives** (UI placeholder strings for a "Private Key" form field: `client/src/concept2cure/v2/fixtures/deep-research-data.ts:121`, `server/services/connectors/connector-interface.ts:524`) |

**On the 14.4% guard figure — read it correctly.** It does *not* mean 3,488 endpoints are
unauthenticated. `server/middleware/authBoundary.ts` applies a default-deny boundary to
all of `/api` before any route registers, so most of those endpoints are covered by it.
What the number does show is that authorization is **single-layer for 85% of the API**:
remove or misconfigure the global boundary and there is no route-level control underneath.
The boundary itself runs in `enforce` mode **only when `NODE_ENV === 'production'`** and in
`warn` mode everywhere else, so any staging or demo environment holding real customer data
is running with that single layer in log-only mode.

## LP-05 · Upload safety adoption

| Measure | Value |
|---|---:|
| `multer(` call sites in non-test server code | **28** |
| …with a `fileFilter` | 21 |
| …with a `limits.fileSize` | 27 |
| …using the repo's own `uploadAllowlist` | **2** |
| …using `uploadSafety` (magic-byte + AV) | 2 |

Seven sites have no `fileFilter`; `server/src/routes/stability.router.ts` has **neither a
fileFilter nor a size limit** — an unbounded, unfiltered upload. Full list in
`09-upload-safety.json`.

## LP-06 · The typecheck gate is vacuous — it cannot tell "clean" from "crashed"

This is the repo's flagship quality control. `.typecheck-baseline.json` records a ratchet
from **2,598 → 0** errors with an honest per-step history, and `ci.yml:231` runs the gate
blocking. It does not work.

**Step 1 — run it exactly as the project configures it.**

```
NODE_OPTIONS="--max-old-space-size=6144" npx tsc --noEmit
```

Result after 379 seconds:

```
FATAL ERROR: Ineffective mark-compacts near heap limit
Allocation failed - JavaScript heap out of memory
Aborted
```

`grep -c "error TS"` on that output: **0**.

**Step 2 — read what the gate does with that.** `scripts/ci/typecheck-no-regression.mjs`
spawns tsc with `NODE_OPTIONS: '--max-old-space-size=6144'` (the same cap), then:

```js
const errorCount = (combined.match(/error TS/g) || []).length;
…
if (errorCount > baselineCount) { … process.exit(1); }
```

It **never inspects `tsc.status` or `tsc.error`.** A V8 fatal-OOM message contains no
`error TS` substring, so a crashed compiler yields `errorCount = 0`, which is `<= 0`, which
prints *"OK — error count 0 matches baseline"* and exits 0. **The gate passes precisely
because the compiler died.** The 6,144 MB cap is set by the gate itself, so this is not an
artifact of an unusually small machine — this host had 15 GB total and 14 GB free.

**Step 3 — give it enough heap and see the truth.**

```
NODE_OPTIONS="--max-old-space-size=24576" npx tsc --noEmit -p tsconfig.json
→ exit code 2, no OOM, 2 errors
```

```
server/services/ana/__tests__/council-tool.test.ts(12,37): error TS7016:
  Could not find a declaration file for module '../../../../scripts/db/migration-set.mjs'
server/services/ana/__tests__/deep-investigation.test.ts(11,37): error TS7016: (same)
```

**These are pre-existing and not an artifact of this audit.** Both files are unmodified in
the working tree (`git status --porcelain` clean), and this audit's own scripts live under
`docs/`, which is outside the tsconfig `include` list (`client/src`, `server`, `shared`,
`agents`). `git log` attributes both files to **PR #1180, merged 2026-07-27 — the day
before this audit** — *"feat(deploy): give production a schema migration mechanism, and gate
deploys on it."*

So the current state is: the baseline says 0, a completing compiler says 2, the gate says
0, and a PR merged yesterday introduced type errors that the gate was specifically built to
catch. Every "typecheck is clean" claim downstream of this gate is unverified.

## LP-07 · `/readyz` returns green over a database missing auth and RBAC tables

`PRODUCT_READINESS_ASSESSMENT.md:81-88` lists this as **blocker #4, resolved**: *"Now:
`/readyz` fails closed and names the missing tables. Verified live: empty DB → 503 …
Container healthcheck repointed at `/readyz`."* `Dockerfile.optimized` does point its
`HEALTHCHECK` there.

Booted against the database produced by the repo's own installer:

```
curl -s http://127.0.0.1:5050/readyz
{"ready":true,"dependencies":{"database":"ok","schema":"skipped","redis":"skipped","worker":"skipped"}}
```

HTTP **200**, `ready: true`, and schema verification reported as **`skipped`** — while the
same boot logged:

```
[ensureCoreTables] ⚠️ Important tables missing: licenses, auth_users, auth_refresh_tokens,
    roles, step_runs, permissions, user_roles, organization_settings, assembly_docs,
    assembly_audit_logs
[ensureCoreTables] ⚠️ Schemas required initialization: extensions
```

**Root cause, in code.** `server/startup/services.ts:61-101` sets schema readiness in only
four branches — `missingCritical`, `missingExtensions`, a failing subsystem, or full
success. The three trailing branches (`result.errors.length > 0` at :92,
`result.missingSchemas.length > 0` at :94, `result.warnings.length > 0` at :99) **log and
return without ever calling `setSchemaReadiness`**. Readiness therefore stays at its
initial `'unknown'` (`server/startup/readiness-state.ts:17`), which `/readyz` renders as
`"skipped"` — and `skipped` does not fail the probe.

This boot took the `missingSchemas` branch. So a deployment can be missing
`auth_users`, `auth_refresh_tokens`, `roles`, `permissions`, `user_roles` and `licenses` —
authentication, authorization and licensing tables — and the container orchestrator will
mark it healthy and route production traffic to it. That is the exact failure mode blocker
#4 claims to have closed; it was closed for the two-table `missingCritical` set only.

## LP-08 · Authorization boundary — verified working, and stronger than the code reading suggested

Probed unauthenticated against the running server (`NODE_ENV=development`, i.e. the mode
in which `authBoundary` is documented to run in permissive `warn` mode):

| Endpoint | Status |
|---|---|
| `/api/projects` | **401** |
| `/api/c2c/projects` | **401** |
| `/api/vault/documents` | **401** |
| `/api/admin/business` | **401** |
| `/api/billing/dtc-pricing` | **401** |
| `/api/ana-ri/health` | **401** |
| `/api/users` | **401** |
| `/api/organizations` | **401** |
| `/api/metrics` | **401** |
| `/healthz`, `/readyz`, `/api/health`, `/api/time` | 200 (intended) |

**This is a genuine strength and it is reported as one.** Every data endpoint probed
refused an unauthenticated request even in development. The audit's static sweep found only
14.4% of endpoints carry a route-level guard, but empirically the layered boundary plus
per-route guards held on every endpoint tested. The residual concern is architectural
rather than demonstrated: authorization is single-layer for most of the API, so the blast
radius of a boundary misconfiguration is the whole surface.

`/api/diag` returns an unauthenticated HTML page, but it discloses only a timestamp and a
liveness message — noted as hygiene (P3), not exposure.

## LP-09 · Production build — clean

```
npm run build   → exit 0, 20.06s
```

| Artifact | Size |
|---|---:|
| `dist/index.js` (server, single bundle) | **18.57 MB** |
| `dist/public/assets/V2App-*.js` | 1.56 MB minified |
| `dist/public/assets/V2App-*.css` | 694 KB |
| `dist/public/assets/ZenRouter-*.js` | 530 KB |
| Total `dist/` | 24 MB |

Vite emits the expected large-chunk warning. A 1.56 MB main client chunk plus 694 KB of CSS
is heavy for a first paint but is a performance finding, not a correctness one. The dead
client trees documented elsewhere in this audit are largely tree-shaken out of the bundle,
but they remain a maintenance and review-surface liability.

## LP-10 · The application's own security self-check reports failing

At boot, unprompted:

```
{"context":{"overall":"failing"},"msg":"[security-health-scheduler] security posture unchanged"}
```

and, twice, the platform's own RLS observability confirming LP-03 from the inside:

```
[tenant-rls-observability] Query issued without tenant scope
  (will return zero rows once RLS is enabled)
  caller: server/services/securityHealth.ts:336
  caller: server/lib/tamper-proof-audit.ts:334
```

Note the second caller: the **tamper-proof audit log reader** is itself one of the
untenanted queries.

---

## Checks not yet complete

- Full jest + vitest execution with real pass/fail/skip counts.
- Golden-journey execution and headless browser walk of the primary surfaces.
- Authenticated cross-tenant probes (requires seeding two orgs).

None of these are reported as passing until they have actually run.
