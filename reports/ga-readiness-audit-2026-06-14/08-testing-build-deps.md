# GA Readiness Audit — Testing, Build & Dependency / Supply-Chain
**Target:** `/home/user/ClinicalSageAI-2-replit`
**Date:** 2026-06-14
**Auditor scope:** Test suites, build/type config, dependencies, lint gates. (NOT React UI, NOT raw DB schema.)
**Method:** NET-NEW from source. Safe quick commands only (no full build run).

---

## Executive Summary

The project has an unusually **mature CI/quality-gate apparatus** for a pre-GA codebase: a TypeScript error baseline that has been ratcheted to **0**, ~806 test files, 0 `.only` leaks, an extensive set of `ci:*` policy scripts (tenant isolation, gateway bypass, governed export, JWT pinning, SAML fail-closed, legacy-dep quarantine). This is materially better than typical.

However, GA-blocking concerns remain:

1. **Production-dependency vulnerabilities** — `npm audit --omit=dev` reports **8 vulns (7 moderate, 1 HIGH)**. The HIGH is `tmp` path-traversal; moderate set includes `qs` DoS, `uuid` bounds (via bull/exceljs/node-cron), `i18next-http-backend` path traversal/URL injection.
2. **Massive `any` sprawl in `server/`** — **4,566** `: any` annotations and **2,686** `as any` casts. The `tsc` baseline of 0 is real, but `any`/`as any` defeat the type system at thousands of call sites, so "0 type errors" overstates actual type safety. Suppressions hide real bugs at runtime boundaries.
3. **Coverage thresholds are configured (70/60/70/70) but coverage is not proven to be enforced** in the merge-blocking path; need to confirm `npm test` is gated and whether thresholds actually fail CI.
4. Several skipped test blocks cover **frontend e-sign / 21 CFR Part 11 attestation UI, sign-out wiring, and governed-export consequence loops** — regulated-critical surfaces left unverified by automated tests.

**Verdict (preliminary): CONDITIONAL.** See per-section verdicts at end.

---

## Findings

(Findings are appended incrementally below as evidence is gathered.)

### [HIGH] Production dependency vulnerabilities (npm audit --omit=dev)
**Evidence:** `npm audit --omit=dev` → **8 vulnerabilities (7 moderate, 1 high)**. Full tree audit: 14 (10 moderate, 4 high).
- `tmp` `<0.2.6` — **HIGH** — Path Traversal via unsanitized prefix/postfix (GHSA-ph9p-34f9-6g65). Fix: `npm audit fix` (non-breaking).
- `qs` `6.11.1–6.15.1` — moderate — remotely triggerable DoS in `qs.stringify` (GHSA-q8mj-m7cp-5q26). Fix: `npm audit fix`.
- `tmp` `<0.2.6` — HIGH path traversal.
- `uuid` `<11.1.1` — moderate — missing buffer bounds check in v3/v5/v6 (GHSA-w5hq-g745-h8pq). Transitive via `bull`, `exceljs`, `node-cron`. exceljs fix is a breaking change (`--force` → exceljs@3.4.0 downgrade — note this is suspicious/needs manual review).
- `i18next-http-backend` `<3.0.5` — moderate — Path Traversal & URL Injection via unsanitised lng/ns (GHSA-q89c-q3h5-w34g). Fix is breaking (→4.0.0).

**Impact:** `tmp` (HIGH) is used in PDF/export/temp-file paths common in this app — path traversal in a regulated document pipeline is a real exposure. `i18next-http-backend` path traversal is server-reachable.
**Fix:** Run `npm audit fix` for the non-breaking set (`tmp`, `qs`, `uuid` direct). Manually evaluate breaking upgrades for `i18next-http-backend@4` and the `uuid` transitives behind `bull`/`exceljs`. Do NOT blindly `--force` (it would downgrade exceljs 3.5→3.4).

**NUANCE / mitigating context (net-new):** The CI audit gate is NOT plain `npm audit`; it is `node scripts/ci/audit-with-allowlist.mjs` (ci.yml security job). The `tmp` HIGH (`GHSA-ph9p-34f9-6g65`) is already in `ACCEPTED_GHSA_IDS` (scripts/ci/audit-with-allowlist.mjs:43) with a documented justification: exceljs calls `tmp` with fixed internal strings, not attacker-controlled prefix/postfix, so the path-traversal vector is not reachable through exceljs. The `esbuild` RCE (build-time) is similarly allowlisted (:54). This is a reasoned, audited exception — so the residual `tmp` risk is **real but mitigated and consciously accepted**, not negligence. Severity of the *unaddressed* risk is therefore closer to LOW for `tmp`; the genuinely actionable items are `qs` DoS, `uuid` bounds, and `i18next-http-backend` (server-reachable path traversal — verify whether lng/ns can be user-influenced).

---

## NET-NEW FINDINGS (second-pass investigation, 2026-06-14)

Counts from a fresh sweep: **849 test files** (`*.test.ts/tsx`, `*.spec.ts`), `server/` has **4,570 `: any`**, **2,690 `as any`**, 8 `@ts-ignore`, 7 `@ts-expect-error`, 3 `@ts-nocheck` files (1 prod: `server/routes/documentAuthoring.routes.ts`). **0 `.only`, 0 `.todo`**, **43 `.skip`** blocks. Of the first 400 test files, only 1 has `it/test` without any `expect(` — assertion hygiene is good.

### [HIGH] CI `Test` job runs with NO database and NO coverage gate — DB/integration coverage silently skipped, 70% thresholds never enforced
**Evidence:**
- `.github/workflows/ci.yml` `test` job (lines 107–123) runs `npm test` with only `env: CI: true` — **no `DATABASE_URL`, no `services: postgres`**. A separate `integration` job (lines 175+) provisions postgres, but the main unit/`vitest` run does not.
- Many suites self-disable when no DB/lang-data is present: `server/db/__tests__/rlsPolicy.integration.test.ts:56` (`skip ? describe.skip : describe`), `tests/phase5/migration.test.ts:24` (`describe.skipIf(SKIP_MIGRATION_TESTS)`), `tests/services/document-consequence.test.ts:10` (`dbAvailable ? describe : describe.skip`), `tests/migrations/proofAuditLogs.test.ts:34` (`dbSecret ? describe : describe.skip`), OCR suites gated on `HAS_LANG_DATA`. In the DB-less `test` job these become silent no-ops.
- `package.json` `test` = `jest ... && vitest run --config vitest.config.ts` — **vitest is run WITHOUT `--coverage`**. The 70/60/70/70 thresholds in `vitest.config.ts` are therefore **never evaluated in CI**. No workflow invokes `--coverage` (grep across `.github/workflows` + `.replit-ci.yml` shows only unrelated "audit coverage" scripts).
**Impact:** The two most safety-critical test categories for this product — RLS/tenant-isolation integration and migration/audit-chain DB tests — may pass CI by being skipped, not by passing. The headline "70% coverage" config is aspirational, not enforced; real coverage is unknown and could be far lower.
**Fix:** (1) Provision a postgres service for the `test` job (or set `DATABASE_URL`) so DB-conditional suites actually execute, OR add a CI assertion that fails if critical suites report "skipped". (2) Run vitest with `--coverage` and fail on threshold in a blocking job, or remove the thresholds to stop implying enforcement.

### [MEDIUM] Lint gate is effectively advisory — `npm run lint` has no `--max-warnings`, and most rules are `warn`
**Evidence:**
- `package.json` `lint` = `eslint . --ignore-pattern dist --ignore-pattern scripts --ignore-pattern client/src ...` — **no `--max-warnings 0`**, so any number of warnings still exits 0.
- `eslint.config.js:138–175`: the overwhelming majority of rules are `'warn'` — `@typescript-eslint/no-unused-vars` (warn), `no-undef` (warn), `no-empty` (warn), `no-unreachable` (warn), `eqeqeq` (warn), plus `preserve-caught-error`/`no-useless-assignment`/`no-unassigned-vars` deliberately downgraded to `warn` with a documented ~190-instance backlog (baseline-ratchet pattern). Only `no-debugger`/`no-eval`/`no-var`/`react-hooks/rules-of-hooks` are `error`.
- **`@typescript-eslint/no-explicit-any` is not configured at all** — nothing flags the 4,570 `: any` / 2,690 `as any`.
- `lint` ignores `client/src` and `scripts/` entirely (client lint runs via the separate jest/client path; scripts are unlinted).
- `pr-checks.yml:79` lints only changed files and even there appends `|| echo "Lint warnings found"`, so the changed-file lint cannot fail the PR.
**Impact:** Lint passes regardless of warning volume; real bug classes (unreachable code, undefined refs, loose equality, swallowed caught errors) accumulate as warnings with no enforcement. Combined with the missing `no-explicit-any`, the type/lint debt is genuinely uncapped despite the impressive typecheck=0 baseline.
**Fix:** Add `--max-warnings 0` (with a ratcheting warning baseline if a hard zero is infeasible), and add `@typescript-eslint/no-explicit-any` / `no-unsafe-*` as `warn` with a baseline to start capping `any` growth.

### [MEDIUM] `as any` (2,690) / `: any` (4,570) sprawl in `server/` undercuts the typecheck=0 headline
**Evidence:** `.typecheck-baseline.json` `errorCount: 0` with `tsconfig.json strict:true, noImplicitAny:true`, and `ci:typecheck:no-regression` (scripts/ci/typecheck-no-regression.mjs) runs real `tsc --noEmit` — so the 0 is a genuine clean-typecheck gate (wired blocking at ci.yml:101). BUT annotated/asserted `any` is legal under strict, so 0 errors ≠ type-safe. 2,690 `as any` casts in `server/` actively silence mismatches, disproportionately at DB-row / request-body / JWT-payload boundaries — exactly the auth/tenant/submission surfaces this GA cares about.
**Impact:** Type-level bugs on critical paths can hide behind `as any` and surface only at runtime; the 0 baseline gives false confidence.
**Fix:** Triage `as any` in security-critical files first (auth, tenant, audit, submission/export); add the ESLint `no-explicit-any` budget above.

### [MEDIUM] 43 skipped test blocks, several on regulated-critical surfaces
**Evidence (net-new specifics):**
- `server/routes/__tests__/regulatory-correspondence.test.ts:76` — `describe.skip('Regulatory Correspondence Routes (integration)')`.
- `tests/founder-critical-path-proof.test.ts:120` — `describe.skip('Sign-out is wired')` (auth sign-out unasserted).
- `tests/governed-export-behavioral.test.ts:386,427` and `tests/governed-document-decision-fabric.test.ts:781` — governed-export / workspace consequence-loop integration skipped.
- `tests/phase10-runtime-esign-snapshots.test.ts:233,275,307,320,342` — e-sign snapshots, 21 CFR Part 11 badge, attestation-modal rendering skipped (frontend, but Part 11-relevant).
- `server/services/__tests__/ana-ri.test.ts:1226` — `it.skip` for removed frontend/backend parity (dead test, acceptable).
**Impact:** Sign-out wiring, governed-export consequence loop, and Part 11 attestation rendering have no live assertions. For a 21 CFR Part 11 platform, the e-sign/attestation skips are the notable ones.
**Fix:** Re-enable or replace each skip with an active test; for DB/UI-conditional skips ensure CI actually provides the dependency so they run (see HIGH above).

### [LOW] `@ts-nocheck` on a production route
**Evidence:** `server/routes/documentAuthoring.routes.ts` carries a whole-file `@ts-nocheck`, disabling all type checking for that route (the other 2 `@ts-nocheck` files are tests). It is invisible to the typecheck=0 baseline because `@ts-nocheck` makes the file emit no errors.
**Impact:** A document-authoring route is entirely outside the type system; the 0 baseline overstates safety by exactly this file.
**Fix:** Remove `@ts-nocheck`, fix the resulting errors (they will count against the baseline, which is the point).

### [LOW] Python dependency reproducibility — `>=` floors, no lockfile
**Evidence:** `requirements.txt` uses `>=` floors only, no upper bounds, no hash-locked file. Several minimums are anomalously high/future-looking for the runtime era (e.g. `pandas>=3.0.3`, `numpy>=2.4.6`, `openai>=2.37.0`, `pdfminer.six>=20260107`), so `pip install` floats to latest and can break the PDF-extraction / analytics-bridge services non-reproducibly. No Python SCA (pip-audit/safety) gate observed in CI scope.
**Impact:** Non-reproducible Python builds; supply-chain drift uncaught.
**Fix:** Pin exact versions / generate a hashed `requirements.lock` (pip-tools); add a `pip-audit`/`safety` CI step.

### [LOW] Build is reproducible-ish but unverified here; `packages: 'external'` keeps full node_modules at runtime
**Evidence:** `scripts/build-server.mjs` bundles `server/index.ts` via esbuild ESM with `packages: 'external'`, `minifySyntax/minifyWhitespace`, `treeShaking`, `sourcemap: false`, fails the process on build error (`process.exit(1)`). `vite build` produces `dist/public`. `packages: 'external'` means all deps stay un-bundled → production image must ship full `node_modules` (incl. the vulnerable transitives) and the runtime dep tree is the audit surface. `sourcemap: false` hampers prod stack-trace debugging. (Per instructions a full build was not run, so build success is not directly verified.)
**Impact:** Larger attack/runtime surface in prod image; harder prod debugging. Build integrity itself looks sound (fails closed on error).
**Fix:** Confirm a clean `npm run build` in CI before tagging GA; consider `sourcemap: 'external'` (uploaded to an error tracker, not served) for prod debuggability.

---

## What is genuinely strong (for balance)
- **Typecheck baseline ratcheted 2598 → 0** and enforced via real `tsc` in a blocking CI step (ci.yml:101). Rare and commendable.
- **~40 bespoke `ci:*` governance gates** wired as blocking in ci.yml lint job: tenant-isolation no-regression, RLS allowlist TS↔SQL parity, no-dev-auth-in-prod, password-hygiene, SAML fail-closed, regulated-delete-audit (Part 11), route-mount authority, legacy-dep quarantine. This is a strong supply-chain/governance posture.
- **849 test files**, 0 `.only` leaks, strong assertion hygiene, dedicated `test:security` and `test:ana` suites, SBOM (CycloneDX) generation, Semgrep + Trivy + allowlisted `npm audit` in the security job.
- Audit allowlist is **documented and justified**, not a blanket suppression.

---

## Verdicts by sub-area
- **Type safety:** CONDITIONAL — baseline=0 is real and enforced, but `as any`/`: any` sprawl + no `no-explicit-any` rule + a `@ts-nocheck` prod route mean true type-safety is unproven on critical paths.
- **Test coverage/quality:** CONDITIONAL (leaning NOT READY) — large suite and good hygiene, but the main CI `Test` job runs DB-less so RLS/migration/audit integration tests silently skip, and the 70% coverage threshold is never enforced (`--coverage` not run). Actual coverage of critical backend paths is unverified.
- **Build integrity:** CONDITIONAL — build script fails-closed and looks sound, but not run here; confirm a clean `npm run build` pre-GA.
- **Dependencies/supply-chain:** CONDITIONAL — 8 prod vulns (1 high allowlisted-with-justification), strong SBOM/Semgrep/Trivy posture, but Python deps unpinned/unscanned and breaking JS upgrades (i18next-http-backend, node-cron) deferred.

## Overall GA verdict: CONDITIONAL (not Ready until the [HIGH] CI Test-job DB/coverage gap is closed)
The single most important fix is ensuring critical integration tests actually RUN in CI (provision DB) and that coverage is measured/enforced — otherwise the impressive test count and governance gates give false assurance on exactly the tenant-isolation/audit/submission paths that define this product's risk.
