# Initial integration failure classification

`integration.json` / `integration.log.gz`: 81 passed, 1 failed in five suites, no source drift. The failing termination-queue test matched an unscoped detail URL and a literal `/sections` suffix. The unchanged canonical read helper dispatches both with `?programId=...`; the fixture threw before the first section could be confirmed. This is a stale fixture failure, not the new queue defect or product RED.

Root retained its original test in termination-fixture-before.tsx.gz. Align only GET route matching to URL.pathname and explicit whole-document readScope; assert every GET retains programId. Original provider-truncation, retained first candidate, no later third generation/no acceptance assertions stay intact. No production read policy is changed. Final root checks use qualified-source-freeze.json; initial source-freeze.json remains immutable.
