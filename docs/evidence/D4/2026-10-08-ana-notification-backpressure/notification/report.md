# AnA notification refresh regression evidence

## Scope

Appended nine cases to the existing run-control listener lifecycle test file. Its original ten fallback and obsolete-listener cases remain unchanged. No new test root, production dependency, UI edit, database write implementation, public export, or test suppression was added by this session. The root session owns the production change and full release qualification.

## Fail-first result

`red-phase.json` pins the unchanged production blob, appended test blob, exact Node 22 command, elapsed time and real exit code. `red.txt` records seven failing and twelve passing cases, exit 1. All original ten cases passed; seven new notification cases failed. The burst test observed 100 concurrent pending SELECTs when one was required.

Before final green qualification, the existing burst case gained assertions for another burst arriving while its first successor remained pending. The new describe callback initially exceeded the repository's function-length warning limit; `eslint-initial.txt` preserves that failure. Splitting the new cases into two describe callbacks and moving their listening helper outside the callbacks removed the warning without suppressions or rule changes. The initial red transcript remains evidence of the original admission defect; the final test blob is separately pinned.

## Final results

`green-phase.json` pins both final source files and the exact commands, exit codes and elapsed times. Direct qualification passed all 19 cases. Related qualification passed all 27 cases across the existing run-control, tenant-scope and poll-backpressure files. Forced ESLint with `--no-cache --max-warnings 0` exited zero, with zero errors or warnings. Each corresponding transcript is retained.

The nine new cases cover bounded admission across bursts, Stop after an older running snapshot, independence across two run IDs, rejected-read successor recovery, discarded successors after local release, listener restart isolation, actual system tenant scope on admitted and successor reads, invalid/nonlocal notifications, and synchronous query-failure recovery.

## Read-only production review

The pending-refresh map belongs to one invocation of `startRunControlListener`. A run ID receives one in-flight read and one dirty bit, not a list of pending reads. A notification received during either the initial read or a successor marks another refresh necessary. The drain resets the bit before each read and checks it afterward, so a newer Stop is retained behind an older running snapshot. Different run IDs have independent entries. Nonlocal runs return before allocation.

Stop/restart invalidates the old listener generation. An obsolete read cannot drive a local run or issue its dirty successor, and its map cannot block the new lifetime. Local release prevents a successor; `driveLocalRun` independently ignores a released run. Rejected and synchronously failing reads retain the existing error message and release admission. The `finally` deletion runs after the drain on both success and failure. Each admitted read retains actual system scope through the existing tenant AsyncLocalStorage helper, with unchanged SELECT text and status handling.

No material defect found in the scoped production implementation. This establishes service-level scheduling and cancellation behavior using deferred fake PostgreSQL queries and the real tenant-scope implementation. It does not establish PostgreSQL transport behavior, live cross-instance deployment latency, provider performance or deployment success. Already-issued PostgreSQL reads are not canceled. Notification admission is per active run; the separately bounded fallback poll remains its existing path after listener failure.
