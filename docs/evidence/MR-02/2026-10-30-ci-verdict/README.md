# MR-02 Stage 3 — bring the CI verdict inside the deploy window (OPS-25)

**Row:** D1 (via MR-02 Stage 3). **Date:** 2026-10-30. **Status:** in progress — the change is pushed; CI confirmation pending.

## What already exists

- `.github/workflows/ci.yml`: the verdict `deploy-aws.yml`'s `ci-verdict` waits for
  (`CI_VERDICT_WAIT_MINUTES=90`), keyed on the exact SHA.
- `scripts/ci/check-required-workflow-concurrency.mjs`: refuses `cancel-in-progress` on a
  workflow the release-evidence policy requires, because cancelled scans left three commits in
  four without release evidence (2026-09-06). Not changed by this lane.
- `docs/work-orders/MR-02-green-gated-trunk-and-release-validation.md` Stage 3: the plan this
  lane carries out. Stage 1 (trunk green) is held by `…01471vSK`.

## Measured (`ci-usage.json`)

Every push run on `concept2cure-v2` from 2026-10-23 08:00 to 2026-10-30 08:00 UTC: 430 pushes,
each starting six workflows, read through the GitHub API on 2026-10-30.

- **`ci.yml`:** median **958 runner-minutes** per completed run (the audit estimated 110).
  Median **push to verdict 2,105 minutes**, about 35 hours, against the deploy's 90. **No green
  run.** 187 runs still queued.
- **Most of that time:** Test, Integration Tests and Coverage (ratchet) ran to GitHub's
  **360-minute job limit** in 112, 115 and 122 of their about 130 runs each, and were cancelled
  with no verdict. That is about 1,080 runner-minutes a push. Every other `ci.yml` job together
  is about 50.
- **The turn:** sampled across October, those three jobs took 30–50 minutes on 2–6 October and
  100–180 minutes by 22–23 October. From **24 October** they reach the limit on every run.
- **Queue:** median 10–15 hours before a job starts, in every workflow. Jobs that wait 24 hours
  are cancelled unstarted.

## Changed

- `c2c-agent.yml`: the `typecheck` job is removed. On every push it ran
  `npm run ci:typecheck:no-regression` and `npm run lint || true`, which `ci.yml`'s Lint job
  already runs as "Run TypeScript check (no regression vs baseline)" and "Run ESLint". `setup`
  now runs only for pull requests, the one event where it does anything. That is 7
  runner-minutes a push.

## Why the three jobs ran past 6 hours

Read from the timed-out job logs and the job definitions on 2026-10-30 (five parallel readers;
file counts from `vitest list --filesOnly`, which collects 5,809 files at head):

1. **The same suite ran three times a push.** Test runs `npm test` (Jest, then Vitest over
   `vitest.config.ts`). Coverage runs the same Vitest file set again with v8. Integration's
   "Run integration tests" step ran `npm test` a third time. It differed from Test only in
   `RUN_INTEGRATION_TESTS`, which exactly three files read.
2. **One file at a time.** Since `2c989403a` (2026-10-06), `maxWorkers: 1` and
   `fileParallelism: false` make the suite serial (`vitest.config.ts`; kept, for the memory
   budget written there). Before that, Vitest 4 ignored the old `singleFork` option and the suite
   ran in parallel in 30–40 minutes.
3. **The suite more than doubled in October:** 2,432 files on 30 September, 5,286 on
   23 October, 5,809 now. Serially, 5,286 files took 8,785 s.
4. **A second slowdown at one push, 2026-10-23 15:56 UTC** (merge `40aa75d90`). From that run on,
   Vitest reports fork workers exiting unexpectedly. One run took 16,822 s, about 10,000 s of it
   outside any per-file phase. That pushed every run past the limit. *Not yet root-caused; see
   Next.*

## The change

- **Test runs in eight shards** (`test-shard`, "Test (shard N/8)"). Each runs the same
  `npm test` on its own Postgres, one file at a time as before, with `--shard=N/8` passed through
  to Vitest. `timeout-minutes: 90` per shard, so a hang now costs 90 minutes, not 360.
- **`Test` is still one verdict, under the same name** the release-evidence policy and Build
  read. It runs `scripts/ci/merge-test-shards.mjs`, which passes only when all of the following
  hold: every shard delivered its Vitest and Jest reports; the files they ran are exactly the
  files `vitest list` collects, with none missing and none run twice; and every shard and the
  shard jobs concluded success. A shard that delivers nothing fails Test; it never makes the
  suite smaller. The script's 11 tests were shown failing (3 red) with its missing-file and
  duplicate checks disabled.
- **Integration Tests** keeps its real-database suite and runs only the files that read
  `RUN_INTEGRATION_TESTS`. They are found by what they read, so a new one is never left out, and
  finding none fails the step. That step's two new tests were shown failing with the empty-list
  guard removed. `timeout-minutes: 60`.
- **Coverage runs nightly** (the 06:00 UTC schedule) in eight shards, whose blob reports merge
  into the one summary the unchanged ratchet reads. On a push it cost as much as the Test suite
  itself, and since 2026-10-24 it was cancelled every time, so its ratchet had not run once.
  Nightly, it concludes. This is a weaker gate than per push, recorded as such: a drop is now
  caught the next morning, not on the push that caused it.
- **Contracts updated to the new shape, not removed:** `test-runner-evidence.contract.test.ts`
  (shards run `npm test` and always upload; Test passes only through the merge; Integration does
  not re-run the suite), `native-db-early-verdict.test.mjs` (the broad step's real command and
  exit status), and `posture-jobs-run-after-lint-failure.contract.test.ts` (adds `test-shard`).

**Checked locally:** `test:ci-scripts` 529/529; `tests/ci` 325/326, the one failure
(`unreferenced-modules` recorded count) also on trunk with this change stashed;
`ci:required-workflow-concurrency`, `ci:workflow-targets` and the gates-ran-nowhere and
pre-push-only gate steps pass. `npm test -- --shard=7/400` ran Jest's 6 files and Vitest's 15 and
wrote both reports. A two-shard blob run merged into one coverage summary.

**Expected, to be confirmed on CI:** about 435 runner-minutes a push instead of over 1,130 (eight
shards of about 40 minutes with the 23 October slowdown still in, about 20 without it), and a
longest job of about 40 minutes.

## Next

- Root-cause the fork-worker exits that began at `40aa75d90`. They cost about half of every
  serial run.
- Measure 20 trunk runs that start after this change: runner-minutes per push and push-to-verdict.
  The 187 runs already queued carry the old `ci.yml` and will still spend six hours each on these
  jobs.
