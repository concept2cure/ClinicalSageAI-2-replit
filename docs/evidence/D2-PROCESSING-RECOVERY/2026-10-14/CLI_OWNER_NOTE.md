# D2 processing recovery operator command

14 October 2026. Owner: `internal_data_management/d2_recovery_cli`. Implements the approved [contract](CONTRACT.md) only in `scripts/process-data-room-captures.mjs` and `server/services/clinical-regulatory-evidence/__tests__/processing-recovery-cli.test.ts`. No candidate SQL, repair write, tenant resolver, scheduler, dependency, schema or application logger was added here. The command consumes the core-owned `processPendingSourcesForTenant` wrapper.

## Current status: local CLI integration green

The final unfiltered Node 22 run passes **53/53 tests, with no skips** ([cli-20](cli-20-final-full-green.txt)). The first post-core integration run also passed 53/53 ([cli-18](cli-18-integrated-full-green.txt)). The actual executable's final missing-configuration capture has **empty stdout**, exit 1 and exactly `{"code":"DATABASE_UNAVAILABLE"}` on stderr ([cli-19](cli-19-integrated-missing-config-startup.json)), despite deliberately inherited debug logging and startup-probe settings. The core wrapper and its full helper import graph resolve.

Final explicit script/test lint, strict test typecheck and Node syntax checks all exit 0 without diagnostics: [cli-21](cli-21-final-eslint.txt), [cli-22](cli-22-final-test-typecheck.txt), [cli-23](cli-23-final-node-syntax.txt). This is local CLI/fixture integration evidence, not real database/RLS/race or backlog-recovery qualification.

## Fail-first and intermediate evidence

The initial test-first result is **50 failures** because the operator entry point was absent, preserved exactly in [cli-01-red-absent-entrypoint.txt](cli-01-red-absent-entrypoint.txt). This is missing-entry-point evidence, not a production processing defect reproduction; the core workstream owns the original processing fault fixtures.

After implementation, the initial suite passed 49 of 50 tests, with the actual no-database executable check waiting for the wrapper export ([cli-02](cli-02-initial-with-integration-pending.txt)). Additional malformed completion/exact-source-report cases brought the suite to 53 tests. The isolated run passed 52 with the executable integration case explicitly skipped ([cli-03](cli-03-isolated-with-one-skipped.txt)).

Before core integration, the **unfiltered run passed 52 and failed 1**, with no skip ([cli-05](cli-05-current-full-with-integration-pending.txt)). That failure expected `DATABASE_UNAVAILABLE` after all actual server imports resolve. While the core wrapper export was absent, the executable truthfully returned exit 1 and `RECOVERY_UNAVAILABLE`; that intermediate result was recorded as pending.

The first rerun after the wrapper export became visible also passed 52 and failed 1 while its imported sweep helper was still being written ([cli-11](cli-11-first-wrapper-visible-rerun-pending-helper.txt)). A visible export alone does not prove the entire executable import graph is ready; the final check waited for the core owner's import-ready handoff.

The script and test pass scoped ESLint with scripts explicitly included; the test passes focused TypeScript compilation, including a later strict check. Node syntax checking passes. Empty corresponding log files mean exit 0 with no diagnostics, not an omitted check: [lint](cli-06-eslint.txt), [test typecheck](cli-07-test-typecheck.txt), [Node syntax](cli-08-node-syntax-check.txt), [later lint](cli-15-eslint-final.txt), [strict test typecheck](cli-16-test-typecheck-strict.txt). The canonical full-project compiler was not claimed green; a [direct script `checkJs` diagnostic attempt](cli-12-broad-checkjs-before-core-integration.txt) followed broad application imports and encountered unresolved concurrent core API exports and unrelated transitive/configuration errors before integration.

## Operator behavior

```bash
node --import tsx scripts/process-data-room-captures.mjs --org 42
node --import tsx scripts/process-data-room-captures.mjs --org 42 --source 71 --limit 1 --retry-failed --apply
```

The complete argument list is validated before any database/server module import. Organization/source/limit are positive safe decimal integers; limit is 1–500, default 50. Unknown/duplicate flags, positional values, scientific/hex/fractional numbers and missing values refuse with exit 2. Default selection is report-only. The CLI does not perform original-file loading, extraction, state claims or SQL itself; dry-run behavior and tenant lifecycle enforcement are core authority.

JSON output contains only validated counts, requested organization/source scope, runnable and diagnostic caps, approved named statuses, positive source IDs and the existing shared canonical reason-code whitelist. It drops filenames, provider error prose, paths and arbitrary report metadata. Unknown reason values become `UNSPECIFIED`. A regex-only check was observed leaking a synthetic uppercase private-provider-token sentinel ([cli-13](cli-13-private-code-red.txt)); importing `DATA_ROOM_PROCESSING_REASON_CODES` from the existing pure shared module fixes that case without duplicating the vocabulary. The later isolated run passes 52 with the same single integration test skipped ([cli-14](cli-14-isolated-private-code-green.txt)). No real token was used.

Exact-source reports for another ID or malformed counts/mode refuse before printing a report. Candidate-only dry-runs and clean readable outcomes exit 0; failure/blocked/stale/busy/not-due/exhausted diagnostics exit 1, including when no runnable row was selected. The report describes a capped run, not every source in the tenant.

The loaded service/pool is closed on clean, unresolved or fatal results. Cleanup failure also yields exit 1 and a safe code. The CLI uses `process.exitCode`, permitting stream flush and cleanup.

## Executable startup output

Read-only inspection found that importing the canonical database runtime emits an application Pino warning to stdout, even without configured database URLs. The initial output contained 207 bytes of startup log before the safe CLI error. The exact missing-configuration capture is [cli-09](cli-09-startup-before-log-control.json). The added actual-process stdout-empty assertion was observed failing ([cli-04](cli-04-startup-log-red.txt)).

After successful argument validation and before any server import, this one-shot CLI sets `LOG_LEVEL=silent` for its own process. Its safe JSON writers supply the operator result/error instead of application/provider log prose. It also sets `SKIP_DB_STARTUP_TEST=true`; the core wrapper's scoped identity lookup establishes database availability, avoiding the runtime's independent startup probe/retry timer. No global logger or application setting file changed. The lead explicitly approved these command-owned settings.

The first after-change capture started with deliberately inherited `LOG_LEVEL=debug` and had **empty stdout**, exit 1, and only safe `RECOVERY_UNAVAILABLE` on stderr while the core export remained absent ([cli-10](cli-10-startup-after-log-control-pending-core.json)). The final post-core capture has empty stdout and exactly safe `DATABASE_UNAVAILABLE` on stderr ([cli-19](cli-19-integrated-missing-config-startup.json)); the executable test now checks the entire stderr JSON object, so unrelated startup/error prose fails the assertion.

Actual-process tests remove `DATABASE_URL`, `APP_DATABASE_URL`, `DATABASE_URL_DEV`, `NEON_DATABASE_URL` and `DATABASE_NEON_NEW_SECRET` and run in a newly created empty temporary working directory, so `.env` files cannot restore a connection. They do not target a live or arbitrary database. All other runner/report tests use an injected local function fixture.

## Exact verification commands

Runtime: `/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node`, Node 22.23.3. Commands run from the repository root with the existing locked dependencies. Captured logs preserve the tool output without rewriting it.

```bash
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/clinical-regulatory-evidence/__tests__/processing-recovery-cli.test.ts
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/clinical-regulatory-evidence/__tests__/processing-recovery-cli.test.ts --testNamePattern 'Data Room recovery operator|rejects invalid arguments with usage'
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/clinical-regulatory-evidence/__tests__/processing-recovery-cli.test.ts --testNamePattern 'resolves the real server imports'
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/vitest/vitest.mjs run --config vitest.config.ts server/services/clinical-regulatory-evidence/__tests__/processing-recovery-cli.test.ts --testNamePattern 'whitelists report content'
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/eslint/bin/eslint.js --no-ignore scripts/process-data-room-captures.mjs server/services/clinical-regulatory-evidence/__tests__/processing-recovery-cli.test.ts
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --module ESNext --moduleResolution Bundler --target ES2022 --esModuleInterop server/services/clinical-regulatory-evidence/__tests__/processing-recovery-cli.test.ts
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --module ESNext --moduleResolution Bundler --target ES2022 --esModuleInterop server/services/clinical-regulatory-evidence/__tests__/processing-recovery-cli.test.ts
/home/agent/.npm/_npx/52027bd8fc0022aa/node_modules/node/bin/node --check scripts/process-data-room-captures.mjs
```

No real backlog repair, external storage/model call, branch, commit or deployment occurred. Local wrapper import integration is verified; actual PostgreSQL role/RLS/race qualification, successful real-database command use and deployment remain separate evidence.
