# W3 / D4 — earlier native database diagnostics

This delivery moves the existing unmocked database lane before the broad
integration suite. Its report uploads immediately after its verdict, before
the long broad run. The shared preparation and both suites' commands,
environments, database separation, PostgreSQL service, RLS enforcement, full
test populations, dependencies and artifact configuration remain unchanged.

The broad suite now checks the final shared prerequisite's successful
conclusion and `!cancelled()`. It therefore still runs after a native
provisioning, test or artifact failure. None of those failures is ignored:
the job remains failed and build/release aggregates still refuse it. Failed
shared setup prevents both suites from running.

| Verification | Actual result |
| --- | --- |
| Permanent controls on the original workflow | 19 cases: 6 failed, 13 passed; process exit 1 |
| Same controls after the workflow change | 19 passed; no failures, cancellations or skips; exit 0 |
| Complete existing Node CI control suite, including those 19 | 233 passed; no failures, cancellations or skips; exit 0 |
| Existing workflow runner/evidence and posture contracts | 2 files, 8 passed; exit 0 |
| Database isolation guard | 150 native files run unmocked; mocked configurations exclude them; exit 0 |
| Explicit ESLint check of the new Node contract | Zero errors and warnings with `--no-ignore`; exit 0 |
| Parsed workflow comparison | Only block order, shared-prerequisite ID and broad condition changed |
| Previously qualified source and guard checks | 20 pinned blobs unchanged, including runtime, scientific engines and baselines |

The tests reuse the existing workflow expression and execution harness.
They simulate each shared prerequisite failure, native provisioning/test/upload
failures and broad failure; check cancellation and aggregate refusal; execute
the actual YAML shell scripts with controlled failing commands; and confirm
that failures propagate without executing deploy migration after a failed
fresh install. These are CI execution controls, not native database assertions.
`RED.txt`, `GREEN.txt`, the other receipts and `SCOPE.json` preserve the evidence.

`OBSERVED-CI.json` records the prior source's actual broad step from 19:05:20 to
20:29:37 UTC (84 minutes 17 seconds), followed by native provisioning and then
the still-running native step when inspected. That run cannot qualify this
new workflow ordering. Local verification used Node 24.19.0; CI retains its
existing Node 22 configuration. No local full compiler or native PostgreSQL
qualification was claimed. Exact published-source CI and the native database
test verdict remain open until their remote executions complete.

The broader biotech workflow/release qualification remains open. This is one
completed CI diagnostic delivery, with no new product capability.
