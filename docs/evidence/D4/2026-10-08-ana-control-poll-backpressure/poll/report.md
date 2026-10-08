# Run-control poll backpressure qualification

Workstream W3, launch row D4. The scoped tests exercise actual exported `beginRun`, `startRunControlListener`, `stopRunControlListener`, `releaseLocalRun` and reset functions with fake pool/client promises and fake timers. No existing test, harness, production source or UI was edited by this scoped session.

## Reproduction

Canonical baseline: `4920b8866d97f30981b4a63bcde91489bbcfd8c5`.

- Initial unchanged production: 6 failures and 2 passes across 8 cases (`red.txt`). Five pending SELECTs were launched across five fallback ticks; three across three ticks. Late old connection success was retained instead of returned. Late old connection failure released the restarted listener client. Old released client error and notification callbacks still dispatched through the obsolete pool.
- Expanded unchanged production: 8 failures and 2 passes across 10 cases (`expanded-red.txt`). A synchronous SELECT throw escaped the timer instead of logging the error and retrying. An old pending poll result delivered cancellation after stop/restart into a retained local run.
- `red-phase.json` and `expanded-red-phase.json` pin the production baseline and corresponding test source SHA256 hashes. Both reproduction runs occurred before root changed production source.

## Final checks

Node 22.23.3, unchanged Vitest configuration. Direct cases: 10/10 pass (`green.txt`). New cases plus existing run-control and tenant-scope tests: 18/18 across 3 files pass (`related-green.txt`). Forced ESLint with `--no-ignore --max-warnings 0`: zero errors/warnings (`eslint.txt`). Scoped diff whitespace check passes. `green-phase.json` pins final production and test source SHA256.

The tests verify one admitted pending poll per listener lifetime, next-tick retry following success, asynchronous rejection or synchronous throw, genuine error logging, empty-local-run query suppression, actual system tenant scope observed inside SELECT, cancellation delivery for two different tenant runs, obsolete connection release, current client ownership, stale error/notification suppression, and stale pending poll result suppression without clearing new lifetime admission.

Readonly production review found no material issue. The monotonically increasing listener generation invalidates old continuations at stop/restart; old connect success returns its own client, and obsolete failure cannot release the current client. Per-lifetime `inFlight` remains closed until the read settles and resets in `finally`, including synchronous throws. Read completion checks current generation before applying rows; notification callbacks check current generation and client identity, and refresh completion checks generation again. Tenant scope and poll interval remain as before.

These are controlled module/ALS regression tests, not a real PostgreSQL cross-instance deployment or RLS integration run. They do not demonstrate cancellation of an already-issued database query. The root session owns broader qualification, production lint, build, release gates and publication. No dependency, gate or baseline was changed.
