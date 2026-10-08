# SQL injection: a sweep of every interpolated SQL site, and a gate (D3 / D6)

**Date:** 2026-10-08 · **Rows:** D3 (tenant isolation), D6 (security posture) · **Session:** `…01471vSKg1KXj3ijXDiyvXGX`

## Why now

Earlier today, measuring on PostgreSQL showed that row-level security here is decided by session variables the runtime role can set. A statement an attacker controls can therefore choose any tenant (`docs/security/C2C_TENANT_ISOLATION_PROOF.md` §0). SQL injection is cross-tenant critical wherever it occurs. Nothing in CI looked for it.

## The sweep

Workflow `sql-injection-sweep`, 14 agents (12 classifiers, 2 verifiers).
- **Classified:** 1,313 interpolations into SQL text across all 213 server files that have one. Each classifier read whole files, not only inline `.query` templates, so it also covered SQL built in variables, string concatenation and `sql.raw` (`shards.json`, `sweep-results.json`).
- **Verified:** every suspect went to a verifier told to build a working injection from a real request and to read every mount, middleware and validation on the way.

**Result: no injection reachable in production.**

Almost every interpolation is one of these forms, each traced to its source:
- generated `$n` placeholder lists;
- schema and table names from code constants;
- ternaries choosing between fixed fragments;
- column names from hardcoded allowlists;
- `LIMIT`/`OFFSET` values that `Math.min`/`Math.max` force to a number.

Three sites are injectable in code and unreachable:

| Site | Why unreachable | Owner |
|---|---|---|
| `server/services/cognitive-ecosystem/checkpoint-manager.service.ts:537` (a checkpoint id spliced into a JSON literal) and `:199` (a metadata filter key spliced into the text) | Nothing calls either method. The orchestrator above them is reachable only through `/api/cognitive-ecosystem`, retired and unmounted (`register-document-routes.ts:253`). Its schema exists only in a `_legacy` migration. | → whoever retires the cognitive-ecosystem tree (Rule 2: no sessions on it). Delete it, or bind both values. |
| `server/services/cortexComplianceService.ts:369, :447, :677, :830` (a table name passed through a regex that admits schema-qualified names) | No production caller: referenced only by its barrel re-exports | → the same. Delete, or replace the regex with a fixed record-type → table map. |

All three are frozen at their count by the gate below, so they cannot spread.

## Hand-ons found on the way (not injection)

- **`server/api/gcc/labeling/routes.ts` and `server/api/gcc/site-intel/routes.ts` have no `organization_id` predicate.** `/api/gcc` is mounted, but no launch surface claims it, so production refuses it (`LAUNCH_SCOPE` enforcement of unattributed paths). The gap is latent. → D3 isolation lane: add the predicate, or retire the routers.
- **Hardening, not findings.** `LIMIT ${…}` from a number in `authoring-plan-generator.ts:1120`, `ivd-assessments.service.ts:97` and `study-design-evidence.service.ts:67`, and an unvalidated `options?.limit` in `account-skill-bundles.ts:186/265/355` (no caller passes a request value). Today a malformed value is a syntax error, not an injection. Binding them would turn that into a clean 400.
- **`server/db/drizzle-queryable.ts:40`** runs its caller's statement text through `sql.raw`. That is safe only while callers pass fixed text, which they do today. This is a contract to keep.

## The gate: `ci:sql-interpolation`

`scripts/ci/check-sql-interpolation.mjs` counts, per server file outside tests, the expressions interpolated into SQL text by the two forms it can see reliably:
- a template literal passed to `.query(` or `.query<T>(`;
- `sql.raw(`.

It holds each file at its count in `scripts/ci/sql-interpolation-baseline.json`: 1,006 in 213 files, every one classified above. A file that gains one fails, with guidance to bind it or take an identifier from a fixed allowlist. A file that loses one must lower its baseline. It runs in `.husky/pre-push` and in CI, and its selftest runs in CI too.

| Check | Result |
|---|---|
| Selftest (`gate-selftest-green.txt`) | 8 passed: 5 red cases (a request value; `sql.raw`; a baselined file growing; the typed `.query<T>(` form; a stale baseline) and 3 quiet ones (bind parameters and drizzle's parameterizing `sql` tag; tests and non-server code; today's shape) |
| Each piece of the gate removed in turn (`gate-mutations.txt`) | No `sql.raw` count, no typed-call match, no comment stripping: each turns its own case red |
| At HEAD (`gate-green.txt`) | OK |

**Known gaps, pinned in the selftest:** SQL text assembled in a variable before `.query(text)`, and string concatenation. Today's instances of both were covered by the sweep's whole-file reading, and none is injectable. A new one would not be caught by the gate, only by review or the next sweep.
