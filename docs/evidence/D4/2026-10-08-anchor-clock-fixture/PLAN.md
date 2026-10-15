# W3 / D4 — deterministic archive verification fixture

The exact `099eb36` native run has one failure out of 1,582 cases: the dormant
head removed through the archive door was not classified as archived. The
artifact proves the deletion succeeded, but omits the actual verdict and clock
values. It does not prove the historical cause.

Investigate the strict temporal boundary using PostgreSQL-engine timestamps and
the unchanged verifier. A ledger entry later than the verifier's clock is refused,
even within one millisecond. Preserve that security rule, the 24-month hot window,
future-ledger and impossible-cutoff refusals. Do not introduce clock tolerance.

If the boundary is reproduced, make only native case 12 state its scenario's
verification time explicitly, strictly after the actual archive-ledger time at
JavaScript's millisecond precision. Preserve the complete existing verdict
assertion and every other native case. Add focused PGlite controls that execute
the actual extracted native callback, real migration/door and unchanged verifier.
Control the ledger timestamp and application clock to exercise ordering without
sleeping. Record synthetic clock construction honestly; it is not a timestamp
trace from the failed CI run.

Scope: `server/services/audit/__tests__/chain-anchor.dbtest.ts` and a focused
`chain-anchor-clock.pglite.integration.test.ts` regression. No production,
migration, policy, guard, dependency, approval or statistical baseline changes.
Evidence: actual native RED, local boundary RED/GREEN, neighboring audit tests,
source/assertion identity. Whole native PostgreSQL rerun and exact-source compiler
remain remote requirements; no full local compiler on the 8-GiB host.
