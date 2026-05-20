# Code Quality Audit — Concept2Cure RI

*Generated 2026-05-07 from a parallel four-pass audit (type safety, dead code, security, test coverage, architecture). Numbers are concrete grep/wc counts at HEAD `b6d8f6b`. File:line references in brackets.*

---

## Executive summary

| Severity | Count | Examples |
|---|---|---|
| **Critical** | 1 | Hardcoded smoke password (`scripts/smoke_cerv2_workbench.js:5`) |
| **High** | 4 | JWT alg pinning (×27 sites), `as any` (2,029), bare `any` (5,860), zero tests on billing/RAG/orchestrator/audit kernel |
| **Medium** | 9 | Hardcoded test creds in client (`SecurityService.js`), 1,050 `console.log` in prod paths, 161 `.js` files server-side, schema/route god files (18K LOC each), helper duplication, naming convention drift |
| **Low** | 6 | 15 `@ts-nocheck`, 13 `@ts-ignore`, 28 eslint-disables, 8 skipped test suites, 1 layer violation, 17 numbered duplicates |

**Posture:** the *governance layer* shipped this session is excellent (9 CI gates, evidence pack, audit chain). The *code quality underneath* is uneven — strict mode enabled but defeated by 7,889 `any`-related declarations, three god files >5K LOC each, and zero unit tests on five critical runtime services. None of this blocks the eCTD/510(k) beta gate, but all of it should land before GA, in priority order below.

---

## 1. Type safety — strict mode enabled, systematically defeated

The TypeScript config is correct (`strict: true`, `noImplicitAny: true`) but the codebase has accumulated escape hatches at scale.

| Smell | Count | Severity | Top offenders |
|---|---|---|---|
| `as any` casts | **2,029** | High | `routes/concept2cure.ts` (103), `storage.ts` (39), `routes/authoring-actions.ts` (37), `routes/defense-packet.ts` (31) |
| Bare `: any` / `<any>` / `Promise<any>` | **5,860** | High | Distributed; bare `: any` alone = 4,717 |
| `@ts-nocheck` (whole file) | **15** | Medium | `server/auth/index.ts`, `server/middleware/auth.ts`, 5 editor extensions |
| `@ts-ignore` (line-level) | 13 | Low | `server/utils/globalErrorHandler.ts:94,96`, test files |
| `@ts-expect-error` (acceptable) | 3 | Info | — |
| `// eslint-disable*` | 28 | Low | Most-disabled rule: `react-hooks/exhaustive-deps` (12) |
| `.js` files in `server/` | **161** | Medium | TS migration backlog includes `db.js`, `routes.js`, `direct-api.js`, `fastapi_proxy.js`, `cer_integration.js` |
| `console.log` in prod paths | **1,050** | Medium | Top: `test-510k-generation.js` (64), `show-ai-defense-report.js` (60), `generate-all-submissions.js` (54), `bootstrap/register-document-routes.ts` (29) |

**Why this matters:** 7,889 `any`-related declarations means strict mode is decorative on most paths. The CI typecheck passes, but the `any`s are silently swallowing the bugs the type system is supposed to catch — including dimension mismatches in pgvector queries, off-by-one errors in audit chains, and tenant-id confusion in routes.

**Recommendation:**
1. Add a CI gate that **forbids new `as any` and bare `any`** in changed files (allow existing). Same baseline-ratchet pattern as the tenant-isolation gate. Estimate: 1 day.
2. Migrate the **top 10 `as any`-dense files** in priority order. Estimate: 3–5 days per file.
3. Replace the 15 `@ts-nocheck` directives with targeted suppression. Many will reveal real bugs.

---

## 2. Dead code + duplication

| Smell | Count | Severity | Notes |
|---|---|---|---|
| Files with `_deprecated` / `_archive` / `.bak` / `_v1` | 5 | Low | Mostly stylepacks + one v2 SQL migration |
| TODO / FIXME / HACK comments | **173** | Medium | Top: `templates/regulatory_templates.js` (6), `editor/extensions/ComplianceScanner.ts` (7), `services/FDA510kTemplateServiceBackend.ts` (4) |
| Numbered duplicates (`-v2`, `New`, `.bak`) | 17 | Low | `data-importer-v2.ts` paired with `data-importer.ts`, plus 8 CERv2 routes that are intentional |
| Empty / minimal files (<5 LOC) | 124 | Low | Many are stub `routes.js` files in `server/api/gcc/*` (4 lines each — placeholder mounts) |
| **Files >2,000 LOC** | **20** | High | See below |

### God files (>2,000 LOC)

```
 18,311  shared/schema.ts                              ← monolithic Drizzle schema
 18,138  server/routes/concept2cure.ts                 ← single-file route bundle
  6,913  server/statistics-service.ts
  5,359  client/src/concept2cure/components/chat/AnaPersistentPanel.tsx
  5,240  server/routes/authoring.router.ts
  4,648  client/src/concept2cure/components/editor/EditorPanel.tsx
  4,568  server/services/ana-ri/command-executor.ts
  3,850  server/storage.ts
  3,554  server/services/intelligent-report-engine.ts
  3,223  server/routes/authoring-actions.ts
  2,806  client/src/concept2cure/components/editor/UnifiedDocumentEditor.tsx
  2,772  server/src/routes/stability.router.ts
  2,500  server/routes/knowledge-base.ts
  2,298  client/src/concept2cure/models/ctdHierarchy.ts
  2,253  services/regulatory/ind-ectd-sections.ts
  2,102  client/src/concept2cure/ZenApp.tsx
```

`shared/schema.ts` and `server/routes/concept2cure.ts` together hold **36,449 LOC** — about 7% of the entire server-side codebase concentrated in two files. Every schema change and every concept2cure feature ships through these files; merge conflicts and CI build times scale linearly with their length.

**Recommendation:** decompose `shared/schema.ts` into `shared/schema/{auth,documents,audit,billing,vault,...}.ts` and re-export from a thin `index.ts`. Same for `routes/concept2cure.ts`. ~1 week of careful surgery; pays back forever.

---

## 3. Security smells

The platform's security posture is **strong overall** — centralized middleware, parameterized queries, no `eval`, proper CORS, broad rate limiting, sanitized error responses, file uploads validated by mime + size. Three concrete gaps:

### Critical

**Hardcoded smoke-test password** [`scripts/smoke_cerv2_workbench.js:5`]:
```javascript
const password = process.env.SMOKE_PASSWORD || 'Concept2Cure2026!';
```
The env-var fallback is correct but the default literal is a real credential committed to git. Anyone reading the repo has a working password against any environment that happens to seed that account.

**Fix:** remove the default, fail loudly if `SMOKE_PASSWORD` is unset. ~5 minutes.

### High

**JWT verification missing algorithm pinning** — **27 sites** call `jwt.verify(token, secret)` without `{ algorithms: ['HS256'] }`. This is the algorithm-confusion attack class (CVE-2015-9235 family). Two sites do it correctly: `routes/leaves.js:24`, `routes/contentAssembly.routes.ts:28`.

**Fix:** add `algorithms: ['HS256']` to every `jwt.verify` call. Mechanical sweep, ~1–2 hours. Add a CI gate to prevent regressions (same shape as the existing `ci:no-dev-auth-in-prod`). Worth landing immediately — the fix is small, the blast radius if exploited is total auth bypass.

### Medium

**Client-side test credentials** [`client/src/services/SecurityService.js:148`]:
```javascript
if (credentials.username === 'jsmith' && credentials.password === 'password') {
```
Demo backdoor in shipped client code. Confirm it's stripped from production bundles or remove entirely.

**bcryptjs version**: currently 3.0.3, latest is 5.1.1. Not a CVE today, but old enough that an upgrade is overdue.

### Verified clean

| Check | Status |
|---|---|
| SQL injection (concatenation) | Clean — Drizzle / parameterized pg.query throughout |
| `eval` / `new Function` | Clean — zero hits |
| CORS wildcard | Clean — explicit allowlist in `enterprise-security.ts:148-170` |
| Error message leakage | Clean — generic `error: 'internal_error'` responses |
| File upload mime/size validation | Clean — multer config in `client-intelligence.ts:52-73` |
| SSRF (user-controlled fetch URLs) | Clean — env-configured URLs only |
| `.env` committed | Clean — only `.env.example` |
| CSRF protection | Clean — origin/referer validation in `enterprise-security.ts:517-564` |

---

## 4. Test coverage — broad but shallow

| Metric | Value |
|---|---|
| Total test files | **375** |
| `tests/` (main suite) | 237 |
| `server/__tests__/` | 40 |
| `server/services/**/__tests__/` | 62 |
| `client/src/__tests__/` | 12 |
| Skill / harness tests | 52 |
| Source files (excluding tests) | **1,845** |
| Source-to-test ratio | 1 : 4.9 |
| Average assertion density | **0.08–0.15** assertions/line of test code |
| Mock declarations | 281 |
| Skipped suites | 8 |
| Snapshot directories | **0** |
| E2E tests (Playwright) | 29 |

### Critical-path coverage

| Subsystem | Status | Note |
|---|---|---|
| Auth (`server/auth.ts`, `routes/auth.ts`) | Partial | Dev-auth policy tested, main routes underspecified |
| **Tamper-proof audit kernel** (`lib/tamper-proof-audit.ts`) | **Zero unit tests** | 16KB compliance core, only static-wiring tests |
| **Billing service** (`services/billing.ts`) | **Zero tests** | 32KB module handling Stripe events |
| **RBAC** (`services/roleBasedAccess.ts`) | Covered | 27 assertions in dedicated test |
| **Orchestration engine** (`services/orchestration/*`) | **Zero tests** | 5 files, mission-critical workflow coordination |
| **Advanced RAG pipeline** (`services/advancedRAGPipeline.ts`) | **Zero tests** | 16KB module — HyDE, MMR, rerank, compression all unverified |
| AnA core (`services/ana-ri/*`) | Covered | 13 dedicated test files |
| Decision record service | **Zero tests** | Governance backbone untested |

### Test-quality smells

- **Assertion density 0.08–0.15** means many test files are bare-imports that verify a module loads, not its behavior.
- **~37% of tests are governance/build-order scaffolding** (file-existence checks, schema parity), not runtime behavior.
- **8 skipped suites** represent ~100+ untested cases, including the entire retention job suite and VaultDMSService.
- **No snapshot testing anywhere** — UI/contract regressions can slip through silently.
- **Mock density**: top 5 files have 7–23 mocks each. Resilience and upload tests in particular are over-mocked, which often means they pass without exercising real behavior.

### Top 5 coverage gaps

1. **`server/services/orchestration/*`** — workflow orchestrator, readiness engine, recommendation engine, continuity service, cross-object resolver. Zero tests.
2. **`server/services/advancedRAGPipeline.ts`** — 5-strategy RAG pipeline (HyDE, multi-query, MMR, rerank, contextual compression). Zero tests.
3. **`server/services/billing.ts`** — Stripe webhook processing. Zero tests, has `${stripe_events}` raw SQL.
4. **`server/lib/tamper-proof-audit.ts`** — the audit kernel itself. Wiring is tested, the kernel isn't.
5. **`server/services/decision-record-service.ts`** — the structured-decision record substrate that the contradiction engine relies on. Zero tests.

**Recommendation:** target a 70%-line-coverage floor on the five gaps above before GA. Each is ~1–2 days. Add `vi.mock` audit to the test-quality CI gate so over-mocked tests don't grow.

---

## 5. Architectural smells

### Layer violations (mostly clean)

Only one real violation: `server/middleware/validateDeviceProfile.ts` imports a JSON schema from `client/src/components/cer/schemas/deviceProfile.json`. Should move to `shared/`.

### Data-layer fragmentation (real debt)

| Pattern | File count | Notes |
|---|---|---|
| Drizzle ORM | 214 | Primary ORM |
| Raw `pg.query` | **450** | Legacy + scattered |
| Prisma (compat shim) | small | Wrapper in `server/prisma/client.js` |
| **Files mixing both Drizzle + raw pg in one module** | **10** | Highest-risk subset |

Mixing-paradigm files: `academic-knowledge-tracker.ts`, `api/cmc/routes.ts`, `middleware/tenantContext.ts`, `routes/510k-workflow-routes.ts`, and 6 others. Each is a tenant-isolation review candidate (the tenant gate already flagged some).

### Helper duplication

Same utility implemented many times:

| Helper | Definitions |
|---|---|
| `formatDate` | 16 |
| `wait` / `sleep` | 24 |
| `retry` | 11 |
| `escapeHtml` | 7 |

No `shared/utils/` directory. Every dev who needs a date-formatter writes one.

### Naming convention drift

`server/services/` mixes three styles in roughly equal proportion:

- PascalCase: `StatisticsService.ts`, `FDA510kService.ts` (~20 files)
- camelCase: `academic-knowledge-service.ts`, `emailService.ts` (~20 files)
- kebab-case: `academic-document-processor.ts`, `api-key-service.ts` (~20 files)

Onboarding pain: discoverability via IDE search is unreliable.

### Route fragmentation

| Domain | Route files | Notes |
|---|---|---|
| IND | **12** | Most fragmented |
| 510(k) | 9 | |
| CER | 8 | |
| CMC | 1 | Underbuilt — see Phase-6 placeholder finding |

### Configuration sprawl

12 `*.config.ts/js` files across root + subfolders, plus separate Jest configs in `server/` and `scripts/`. No central config strategy.

---

## 6. Top 10 recommended actions, ranked by ROI

| # | Action | Effort | Why |
|---|---|---|---|
| 1 | Add `algorithms: ['HS256']` to all 27 `jwt.verify` sites + CI gate | 2 hours | Closes algorithm-confusion attack class; mechanical fix |
| 2 | Remove hardcoded `'Concept2Cure2026!'` smoke password default | 5 min | Critical — credential committed to git |
| 3 | Add `ci:no-new-any` baseline-ratchet gate | 1 day | Stops the bleeding on 7,889 existing `any` declarations |
| 4 | Unit tests on five untested critical services (orchestrator, RAG, billing, audit kernel, decision records) | 5–10 days | Regulated platform with zero tests on billing and audit-kernel is a diligence red flag |
| 5 | Decompose `shared/schema.ts` and `routes/concept2cure.ts` (36k LOC together) into feature-scoped files | 1 week | Removes top-2 source of merge conflicts and onboarding friction |
| 6 | Strip 1,050 `console.log` from production paths (route to structured logger) | 2–3 days | Operational hygiene + smaller log spend |
| 7 | Introduce `shared/utils/{formatting,async,html}.ts`, deprecate the 58 duplicate helper definitions | 2–3 days | One-time DRY-up, prevents drift forever |
| 8 | Convert remaining 161 `.js` files in `server/` to `.ts` | 2–3 weeks | Closes the type-safety story |
| 9 | Pick one casing (kebab) for `server/services/`, sweep | 1–2 days | Discoverability + IDE search |
| 10 | Migrate the 10 mixed-ORM files to Drizzle exclusively | 1 week | Removes the highest-risk SQL surface from the tenant-isolation baseline |

**Total estimated effort to land items 1–4 (the ROI floor):** ~2 weeks of focused work. After that the platform's code quality matches its governance posture.

---

## 7. What's *not* a problem

To be fair to the codebase:

- **Strict mode is on**, build does typecheck, the `any`s are escape hatches, not config errors.
- **Security middleware is centralized and applied consistently** — Helmet, CORS, rate limiting, CSRF, input sanitization, org-isolation all in one place.
- **Audit chain, RBAC, dev-auth, password handling** all have real implementations (this session's work).
- **Drizzle migration is the dominant ORM** — the 450 raw `pg.query` files are legacy, not a new pattern.
- **No `eval`, no SQL injection, no SSRF, no committed `.env`** — the dangerous classes are clean.
- **9 governance CI gates ratchet against regression** — this session shipped 6 of them.

The codebase is **a real platform with real debt**, not a prototype. The debt is concentrated and addressable; the foundations (security, governance, audit) are solid.

---

## Methodology

Generated by four parallel Explore-agent passes against HEAD `b6d8f6b` on `claude/investor-codebase-presentation-CmkUe`. All counts are grep / wc / file-walk. No external services queried. Severity assignments use the standard scale: **Critical** = exploitable in prod / committed credential, **High** = silent failure mode in critical path, **Medium** = maintainability / hygiene, **Low** = minor.

Regenerable: re-run the audit by re-dispatching the four agent prompts in `scripts/audits/run-code-quality-audit.md` (TODO — turn this into a scripted artifact like the evidence pack).
