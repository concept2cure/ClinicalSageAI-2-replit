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
