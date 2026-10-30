# MR-02 Stage 3 — bring the CI verdict inside the deploy window (OPS-25)

**Row:** D1 (via MR-02 Stage 3). **Date:** 2026-10-30. **Status:** in progress.

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

## Next

Why the three test jobs run past 6 hours (being read from the timed-out job logs), then the fix.
