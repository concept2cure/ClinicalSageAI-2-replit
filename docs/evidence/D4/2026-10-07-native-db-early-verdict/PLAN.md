# W3 / D4 — native database verdict before the broad mocked suite

Base: `3d4da223de0fe799f1850b30d867fc765882172a`, only `concept2cure-v2`.

The existing Integration Tests job executes the broad `npm test` suite before
provisioning and testing its separate deploy-shaped database. Run 37669994264
was still executing the native test step when inspected on 2026-10-07; its
earlier broad step consumed 84 minutes 17 seconds (19:05:20–20:29:37 UTC). A broad failure also skips the
native step entirely. The previous native failure lacked a separate report;
that report was added in the prior delivery but is still delayed by this order.

This bounded delivery moves the existing native provision/test/always-upload
block before the broad test/upload block, after the unchanged shared setup.
The final shared prerequisite records its conclusion. The broad suite runs
after a native failure only when shared preparation succeeded and the run was
not cancelled. Every failed step still fails the job and its release aggregates.
Both suites keep their existing commands, separate databases, roles, RLS,
configuration, complete populations and artifact retention. No runtime, schema,
dependency, baseline, scientific or approval policy changes are authorized here.

Before editing the workflow, run permanent Node contracts against the base to
record RED. Reuse the existing workflow expression, execution and shell harness
to exercise ordering, preparation failures, independent verdicts, cancellation,
artifact execution and actual shell exit propagation. Run the CI script suite,
database isolation guard and normal commit/push hooks after the change. Native
PostgreSQL assertions remain a remote gate; local contract success is not their
qualification. Publish this delivery without waiting for the long broad suite.
