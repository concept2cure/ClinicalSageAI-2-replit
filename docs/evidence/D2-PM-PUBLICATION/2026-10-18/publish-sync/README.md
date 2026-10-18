# Publishing synchronization

The canonical branch advanced through `61a14c5d9`, adding AnA batch-concurrency validation and its documentation. A stale push was stopped before transfer, then the incoming work was merged normally. [integration-review.json](integration-review.json) verifies that all incoming paths were preserved and all ten PM code/test hashes stayed unchanged.

The combined regression run passed **163 tests in ten files**: the original 130 PM/schedule/authorization tests plus 33 incoming AnA concurrency controls. The production client/server build passed on this merged application. Actual commands, exit codes and unchanged-source checks are in [focused-exit.json](focused-exit.json) and [build-exit.json](build-exit.json).

The **29 native PostgreSQL cases** and whole-repository zero-error TypeScript result in [final-sync](../final-sync/README.md) qualify the preceding integration. PM persistence, matching and native-test inputs remain unchanged. The complete normal pre-push hook repeats authoritative whole-repository TypeScript on this latest application before any successful transfer, alongside the SQL, governance, import, lint-error and zero-warning-growth checks. A successful push requires that hook to finish; no hook bypass or force push is used.

[source-bindings.json](source-bindings.json) identifies this candidate and the remote integration base. [verification.json](verification.json) binds the latest tests/build and retained native result without presenting an earlier whole-app typecheck as a check of the later AnA implementation. Final push receipts and exact-SHA hosted-check observations are retained with the delivery outputs.

The preservation contract and [qualification limits](../README.md) continue to apply. This direct branch publication does not itself deploy AWS production.
