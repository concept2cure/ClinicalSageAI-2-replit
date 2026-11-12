# MR-02 Stage 3 — bring the CI verdict inside the deploy window (OPS-25)

**Row:** D1 (via MR-02 Stage 3). **Date:** 2026-10-30. **Status:** in progress — the change is pushed; the first two runs with it are measured (2026-11-12); 20 runs pending.

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

## A week later: measured, and the second change (2026-11-10)

`ci-usage-2026-11-03-to-11-10.json`: every push run from 3 to 10 November, after the sharding.

- **Each `ci.yml` run cost less:** a median of **268 runner-minutes**, down from 958. The shards
  took a median of 25 minutes each (p90 35); 35 of 2,808 reached the 90-minute limit.
- **Every completed run had a Test verdict.** The merge ran in all 472 and failed in all 472,
  because tests fail in the shards. That is a real red, and MR-02 Stage 1 owns it.
- **The queue still decided the time to a verdict.** Pushes rose to **627 in the week**, about 90
  a day, from 430. Push to verdict was a median of 46 hours, nearly all of it queueing, and 1,003
  shard jobs were cancelled before they started. The account runs at most **20 jobs at once**,
  and it was at 20 for 90 of the 160 hours. Demand, about 90 pushes × about 310 runner-minutes,
  is the whole of that capacity.
- **Pushes that change only documentation are 21%** (132 of 626). Skipping heavy jobs for them is
  **not done**. `deploy-aws.yml`'s `ci-verdict` reads only the run's overall conclusion, so a
  skipped Test would let a documentation commit deploy on top of code that failed on the commit
  before it. A safe skip has to carry the last code commit's verdict forward, which is design
  work, not a path filter.

**The second change: four shards, three files at a time.** The eight shards were 200 of the about
310 runner-minutes a push. Each ran one file at a time on a 4-core runner. Before deciding,
three of the eight shards were run both ways on a 4-core, 15 GB machine, on a fresh database
with npm ci to the lockfile (`parallel-shards-2026-11-10.txt`):

- 2,333 files, 30,662 tests.
- **No test failed three at a time that passed one at a time.** Three timing-sensitive tests did
  the reverse. A first attempt, with dependencies older than the lockfile, also agreed on all
  8,480 tests of one shard.
- Each shard ran **2.4–2.5× faster** (shard 3: 1,508 s against 629 s; shard 1: 1,704 against
  717; shard 6: 1,876 against 742).
- Memory peaked at **4.8 GB**.

So `test-shard` is now four shards, each running `npm test -- --shard=N/4 --maxWorkers=3
--fileParallelism`. `vitest.config.ts` stays one file at a time for any other machine, with a
comment pointing here. The merge reads four shards. The contract now also ties the merge's
`--shards` to the matrix: it was shown red with the merge set to 8 against a 4-shard matrix.
Coverage is unchanged: nightly, eight shards, one file at a time.

**Expected:** about 100 runner-minutes a push for Test instead of about 230, so about 210 in
all, or about 68% of the account's capacity at 90 pushes a day. A Test shard should take about
25 minutes.

## The first two runs with four shards (2026-11-12)

Two trunk pushes from after the change finished all four shards on 12 November: run
[42842510749](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42842510749)
(`4e77f48479`, pushed 10 November 15:15 UTC) and run
[42841814706](https://github.com/concept2cure/ClinicalSageAI-2-replit/actions/runs/42841814706)
(`2b0c842d9d`, pushed 15:11). Job times come from the jobs API, each job's start to finish, rounded up.

| | 42842510749 | 42841814706 | Expected |
|---|---|---|---|
| Test shards 1–4, job minutes | 25, 27, 34, 26 | 33, 31, 33, 29 | about 25 each |
| Vitest's own duration (s) | 1,358, 1,451, 1,895, 1,445 | not read | |
| A shard at the 90-minute limit | none | none | |
| Test, runner-minutes (four shards) | 112 | 126 | about 100 (was about 200) |
| The run, runner-minutes (every job that ran) | 204 | 247 | about 210 (median was 268) |
| Push to the shards' end | 48 h 16 min | 48 h 26 min | |

- **The shards did what was measured locally.** Each took 25–34 minutes, and each ran to its own verdict.
  Run 42842510749's four shards ran 6,251 files and 82,121 tests. The slowest shard is the third in both runs. It holds the
  editor's full-catalog PGlite test, which ran past its timeout here and has since been given ten minutes on trunk.
- **The runner-minutes fell as expected; the time to a verdict did not.** 42841814706 is 247 rather than about 210
  only because its Codespace job built the image (29 minutes, against under 1 when cached). Lint ran 23 hours
  after each push and the rest of each run 47 hours after.
  At 15:31 UTC on 12 November, 212 `ci.yml` runs were queued and 6 were in progress. The runs finishing that hour
  included pushes from 10 November 01:37, which carry the eight-shard `ci.yml`. The queue therefore still holds
  both shapes. The 20-run measurement below waits for runs pushed after `8a7e41392d` (10 November 13:58) to drain.
- **The verdicts are red, and not because of the sharding.** At these two-day-old commits the first run's shards failed 15
  tests in 8 files. Its merge job was created when the last shard ended and was queued behind the 20-job limit at
  15:31. Of those 8 files, only `d0PhoneWidth` and `workbenchRemedies`
  still failed in the pinned replay of trunk at `ef0472c7b8`
  (`docs/evidence/F1/2026-11-10-trunk-ci/README.md`), where both are held by their owners.

## Next

- The fork-worker exits that began at `40aa75d90`: not reproduced locally. The 177-file sample
  took 418 s before the merge and 416 s after, and the merge's own 78 test files took 525 s and
  693 s, the difference being one new file failing 25 tests at 5 s each, which passes at head.
  In CI the shards now bound any such stall to 90 minutes and name the shard.
- Measure 20 trunk runs that start after this change: runner-minutes per push and push-to-verdict. Two of the 20 are above.
  The 187 runs already queued carry the old `ci.yml` and will still spend six hours each on these
  jobs.
