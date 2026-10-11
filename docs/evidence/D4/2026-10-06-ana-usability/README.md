# W3 / D4 — AnA latency and interrupted demonstrations

Date: 2026-10-06 UTC (2026-10-05 Pacific). Canonical branch: `concept2cure-v2`.
Starting revision: `5706369076dba414d61991059b3f7b031e797c7c`.

The founder reported that AnA was too slow to use and her demonstration workflows
did not function. This change fixes five reproduced defects in existing paths.
It does not establish which defect occurred during that particular deployed test.

| Defect | Correction | Reproduction |
| --- | --- | --- |
| First-session recall awaited six independent sources sequentially; a stalled source never released the answer. | Read sources concurrently, give each optional source 1.5 seconds, retain the sources that answer, and explicitly name incomplete recall in the prompt. | `bootstrap/red.txt`, `bootstrap/green.txt` |
| A streaming fallback used a retry budget of one although the primary stream correctly used zero. | Apply the same streaming retry policy to every model. Preserve non-streaming retries. | `gateway/retry-before.txt`, `gateway/retry-after.txt` |
| The client idle watchdog started only after response headers arrived. | Start the existing 90-second idle deadline before the stream fetch. | `client/regression-red.txt`, `client/regression-green.txt` |
| Stop awaited an unbounded control request; a demo queued behind it could never begin. | Bound control transport to five seconds, still allowing the server to record the cancellation before disconnecting. | Same client evidence |
| A delayed Stop response could abort the controller of a newly started demo and overwrite its status. | Keep cancellation and optimistic control status bound to their originating turn. | Same client evidence |

## Verification

**Push blocked by the full-repository typecheck's memory requirement.** The
canonical gate was attempted with `TYPECHECK_HEAP_MB=7168` and `--incremental`;
the compiler exhausted its heap after approximately 9m43s (exit 134). The
container has an 8 GiB cgroup limit and no swap. The repository normally allows
24 GiB of compiler heap. No trustworthy full typecheck verdict was produced;
`typecheck-blocked.txt` preserves the failure. No baseline, gate or approval
was weakened to label this ready. Run the canonical gate on a larger host/CI
before treating the patch as fully validated.

- Bootstrap and chat-path parity: 40 tests in three suites passed.
- Client drive, cancellation, progress, records, queues and actions: 122 tests in eight suites passed.
- Gateway fallback, existing stall, abort and overload policy: 29 tests in four suites passed.
- All nine new regression cases that assert broken behavior were run against the
  old implementation first: four bootstrap cases, three client cases, two gateway
  cases failed. Other new cases preserve existing behavior.
- Targeted ESLint found no errors. Existing complexity warnings remain.
- Pushed-file lint and its warning ratchet passed with no added warnings.
- The other pre-push npm checks were executed serially and passed; individual
  exit codes and output are in `repository-gates.json` and `repository-gates.txt`.
  The ledger check is included separately in that record.
- No dependency, model, schema, navigation budget, or approval policy changed.

The original pre-commit security checker could not start because the `tsx` CLI
opens an IPC socket that this execution environment refuses (`listen EPERM`).
The three TypeScript checkers used by pre-commit/pre-push now launch through
`node --import tsx`, using the same installed loader, checker files, arguments
and exit codes without that CLI socket. No check was removed or bypassed.

## Recall measurement and limits

The controlled timing test supplies six independent 200 ms I/O sources. Before
the change they took 1,200 ms; afterward they take 200 ms, with all six sections
present. This is a simulated-I/O critical-path measurement, **not a production
latency benchmark or a claim of a sixfold improvement to AnA as a whole**.

The 1.5-second deadline applies only to optional session recall. Authorization,
governance and requested document/tool reads keep their existing behavior. Slow
recall is explicitly incomplete, not an empty search result. Underlying loaders
cannot cancel a database query already in flight; the abort signal prevents late
profile/feature lookups from starting subsequent queries after the recall budget.

Live provider latency, the deployed database, browser/proxy behavior and the full
sales/training tour remain unverified. D4 acceptance and production readiness
remain open; these are supporting regression results, not a declaration of launch
readiness. Retest on the actual deployment after these changes are released.

## Live retest

1. Open a fresh conversation and send a short request; capture `done.telemetry.phases`
   from the SSE response and the deployed commit identifier.
2. Start the sales demonstration with a real project in the workspace. Verify
   screen changes, program scope, and the final stop reached.
3. While AnA is replying, choose another demonstration. Verify Stop finishes,
   the selected demonstration starts, and the old cancellation does not stop it.
4. Repeat with the training walkthrough. Capture any failed request, run ID,
   screen report, and the first stage that fails.
5. A timed-out client turn must stay interrupted/unconfirmed until the durable
   record confirms the outcome; do not label a timeout as successful completion.
