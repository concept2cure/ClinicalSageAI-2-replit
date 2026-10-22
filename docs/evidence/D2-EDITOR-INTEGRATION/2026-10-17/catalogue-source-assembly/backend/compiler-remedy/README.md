# Compiler control-flow remedy

Root's initial official compiler found 22 errors: 20 source-reader narrowing
errors and two test-fixture errors. TypeScript did not narrow nullable source
rows after calls to the inferred `const` helpers returning `never`. The unchanged compiler failure receipt is
preserved in `typecheck-initial-red.json`.

The bounded remedy changes only `unavailable` and `changed` from const arrows
to explicit function declarations returning `never`. Error types, statuses,
messages, source guards and runtime behavior are unchanged. No casts, non-null
assertions, baseline changes or dependency changes were added. Production source
froze at `2026-10-18T00:02:44Z`.

`final-http.log` passes **62 / 62 cases across two actual HTTP/PGlite suites**:
48 assembly cases and 14 explicit-source AnA drafting/acceptance cases, using
the later frozen router including uncertain acceptance handling. `source-pins.json`
records the exact command and 45 source/test hashes taken before and after the
replay. Every hash matched. `lint.json` reports zero errors and zero warnings for
the corrected resolver; scoped `git diff --check` passed.

The original 114-case backend receipt and its source pins remain historical and
unchanged. This remedy receipt qualifies the later resolver and router bytes
for the two requested HTTP suites. Root's later official compiler/build and
integration receipts qualify the final tree. PGlite does not prove native
PostgreSQL concurrency or production RLS, and no live provider, human test or
deployment was performed.

The [log storage receipt](../../release/evidence-log-storage.json) preserves
original raw bytes/hashes; the readable log normalizes surplus blank lines at EOF.
