# Snapshot lint publication repair, 2026-10-18

The normal pre-push lint ratchet reported two backend warnings introduced in this work: the status fixture's query router had complexity 20, and the snapshot writer accepted six arguments. The writer now groups the exact source ID, source admission and filed source into a typed `SnapshotCopySource` object, passed by its existing caller. The fixture's current-actor query branches now live in `currentActorAnswer`; the exact user 5/organization 1 checks and empty refusal rows remain unchanged. No permission, role, refusal, seal, pin, audit, transaction or assertion behavior was removed. No baseline or suppression was changed.

The six affected suites pass **107/107 cases**, zero skips, exit 0, **37.41s**. They cover current source authority and late rollback, derived status, saved source body/seal and ordering, live-leaf pins, and seed compatibility. The exact Node 22 command was run with a 4096 MiB heap and the repository's one-worker/no-parallel-files configuration:

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts \
  server/routes/__tests__/coauthorSnapshotStatus.test.ts \
  server/routes/__tests__/coauthorSnapshotCurrentAccess.pglite.integration.test.ts \
  server/routes/__tests__/coauthorSnapshotFromSource.test.ts \
  server/routes/__tests__/coauthorSnapshotPinnedByLeaf.pglite.test.ts \
  server/routes/__tests__/coauthorSnapshotSeal.test.ts \
  server/routes/__tests__/coauthorSnapshotSeeds.test.ts
```

`2026-10-18-snapshot-lint.json` compares unchanged ESLint policy against HEAD source text and final working bytes: each changed file falls from **one warning to zero**, with **zero errors**. `git diff --check` over the two changed files passes. `2026-10-18-snapshot-refactor-pins.json` verifies unchanged bytes since the inputs were captured for the writer, route, authority dependencies, fixtures, six suites and shared test configuration; the complete case list and output log are retained beside it.

Earlier 159/10, 156/10 and 144/6 packets remain evidence for their original pinned phases; no combined fresh backend or native run is implied. This successor is local snapshot regression evidence using actual PGlite SQL plus the explicitly declared status SQL-response fixture. It does not establish native snapshot-writer race qualification, live agency/provider behavior or browser acceptance. Root owns the full compiler, build and normal pre-push terminal results.
