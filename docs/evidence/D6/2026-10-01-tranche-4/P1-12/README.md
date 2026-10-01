# P1-12 — CI honesty (INF-02, INF-09, INF-10, INF-24)

Security audit 2026-09-24; remediation plan row P1-12. Launch row D6 (security), with D1 for
the deploy half. Work tree at HEAD `c6f2028b` (2026-10-01), lane `concept2cure-v2`.

Plan acceptance: *"a deliberately failing Semgrep rule blocks; a deploy of a red SHA refused"*.
Both are shown below — the first with the real semgrep binary, the second against a stub of
the Actions API (no GitHub run was possible from here).

## What was wrong

| Finding | At HEAD `c6f2028b` |
|---|---|
| INF-02: security gates only on pull requests or pre-push | Partly fixed on 2026-09-25: `ci:server-error-leaks`, `check:compliance-claims`, `ci:discarded-audit-write`, `ci:session-scoped-rls-bypass` already ran in `ci.yml` › Lint on every push. **Still not on push:** `ci:unauthenticated-fetch`, `ci:drizzle-tenant-scope` (pre-push only), Semgrep `p/ci` (pull requests only). Found the same way: `ci:migration-drop-safety` (CLAUDE.md Rule 1's enforcement) and `ci:upload-guards`, both pre-push only; `check:catalog-copy` (pull requests and pre-push). |
| INF-02: the PR `p/ci` scan | Dead. `returntocorp/semgrep-action@v1` runs semgrep 1.36.0, which crashes on the registry's current rules (`invalid rule severity value: MEDIUM`) and the job reports **success** — run 35982180716 (`red/github-runs-before.txt`). |
| INF-10: Semgrep advisory | `semgrep.yml`: job-level `continue-on-error: true`, `semgrep/semgrep:latest`, no `--error`, scan step ends `exit 0`. Run 36822692650 on 2026-10-01: **719 findings, job green**. |
| INF-24: `npm install` in CI | `ci.yml` Lint, Build, Security Scan, Nightly; `db-schema-validation.yml`; `neon-preview-db.yml`. |
| INF-09: tag deploy | `deploy-aws.yml` read nothing about the SHA's CI, and `docker build` went straight to `docker push` with no `trivy image`. |

## What is true now

- **INF-02.** A new `ci.yml` › Lint step, *Security gates that ran only in the pre-push hook*,
  runs each self-test then its gate: `ci:unauthenticated-fetch`, `ci:drizzle-tenant-scope`,
  `ci:migration-drop-safety`, `ci:upload-guards`, plus `check:catalog-copy`. Lint runs on
  every push to every branch; the step is blocking (`!cancelled() && install succeeded`, no
  `continue-on-error`). All pass today (`green/ci-yml-prepush-gates-step.txt`). Semgrep `p/ci`
  runs in `semgrep.yml` on every push, pull request and weekly schedule. No `npm run` gate in
  `pr-checks.yml` is pull-request-only any more (pinned).
- **INF-10.** `semgrep.yml` is one blocking job, still named `Analyze (Semgrep)` (the
  release-evidence policy names it):
  - image `semgrep/semgrep:1.177.0@sha256:acaac22f…` — version and digest; the image `latest`
    resolved to when the 719-finding scan ran;
  - no job-level `continue-on-error`; `fetch-depth: 0`; `shell: sh` (the image is Alpine);
  - **Blocking scan**: `semgrep scan --config=p/default --config=p/ci --error
    --baseline-commit <B>`. Exit 0 passes; exit 1 (a finding `B` did not have) fails; any other
    exit — including a baseline not in history — fails: an unfinished scan is not a pass;
  - `B` is resolved by a github-script step: on a pull request, its base; otherwise the newest
    `concept2cure-v2` commit whose Semgrep run **passed** (same repository, not a PR run).
    Not the previous push: then a red commit becomes the next push's baseline and its finding
    is waved through — shown below. An unreadable history, or no green run, fails closed;
  - **Full scan** (`!cancelled()`, reporting only) still feeds the Security tab; it fails if
    the scan does not finish. A SARIF of only new findings would close every existing alert.
  - The dead PR copy in `pr-checks.yml` is deleted; `semgrep.yml` is its replacement (it already
    triggered on pull requests) and is pinned as the only Semgrep in the workflow tree.
  - A reviewed false positive is excepted inline, `nosemgrep: <rule-id>` with a reason.
- **INF-24.** The six jobs install with `npm ci` (the retry loops kept). `.npmrc` already
  carries `legacy-peer-deps=true`, which `npm ci` reads, so no flag was needed. The committed
  lock is in sync with `package.json` (`npm ci --dry-run` passes), and `npm ci` refuses drift
  that `npm install` would have rewritten (`green/npm-ci-lockfile.txt`).
- **INF-09.** `deploy-aws.yml`:
  - new job **`ci-verdict`** (`actions: read`, `contents: read`) reads, for `github.sha`, the
    newest push run on `concept2cure-v2` of `ci.yml`, `semgrep.yml` and `codeql.yml`. Any
    conclusion but `success` refuses; a run still going is waited for (poll 60 s, up to 90 min);
    a missing run past the deadline refuses; an API error refuses at once. `build-push` and
    `deploy-frontend` need it; `migrate`, `deploy-api` and `smoke-test` inherit it (pinned:
    every job but `test`/`security-gate` reaches it through `needs`);
  - `build-push` is now **Build API image → Trivy image scan → Push API image**. The scan is
    `aquasecurity/trivy-action` (pinned SHA, v0.36.0), `scan-type: image` on the exact tag the
    build produced, `severity: CRITICAL,HIGH`, `exit-code: 1`, `trivyignores: .trivyignore`,
    no `ignore-unfixed`. The push (`id: api-push`, digest output unchanged) runs only if the
    scan passed. The job runs the Trivy exception checks and their self-tests first, as the
    existing `trivy-steps-run-after-failures` contract requires of every job that scans.

## Red / green

| Check | Before (HEAD `c6f2028b`) | After |
|---|---|---|
| `tests/ci/ci-honesty.contract.test.ts` + `deploy-refuses-unproven-sha.contract.test.ts` | **52 failed**, 7 passed — `red/vitest-contract-tests.txt` | 59 passed — `green/vitest-contract-tests.txt` |
| The 5 INF-02 tests that pass at HEAD, over the audited commit `adbf2d18`'s workflows | **15/15 INF-02 tests failed** — `red/vitest-inf02-at-audit-commit-adbf2d18.txt` | pass (above) |
| `tests/ci/trivy-steps-run-after-failures.contract.test.ts` (existing, unchanged) | passes | 6 passed, now covering the new image scan — same green file |
| Real semgrep 1.177.0, deliberate rule, old `Run Semgrep` step, finding present | **exit 0** (advisory) — `red/semgrep-e2e-old-step.txt` | — |
| Same rule, new `Blocking scan` step | — | finding added → **exit 1**; nothing added → 0; unrelated commit after the red one, baseline = last green → **still 1**; baseline = previous (red) push → 0 (why the resolver takes the last *green*); baseline not in history → **2**; no baseline → **1** — `green/semgrep-e2e-blocking-step.txt` |
| A deploy of a red SHA | no check existed | refused for `failure`, `cancelled`, `timed_out`, `skipped`, `action_required`; refused for a red Semgrep under a green CI; for a missing or unfinished run at the deadline; for an unreadable API; a green run of another SHA/branch/event/fork does not count; a newer red re-run beats an older green one; an in-progress run is waited for and then passes (vitest, stubbed API) |
| actionlint 1.7.7 + shellcheck 0.11.0, six edited workflows | 20 findings (`red/actionlint-before.txt`) | 19: every pre-existing finding unchanged, the old step's SC2016 gone, none added — `green/actionlint.txt` |
| YAML parse (js-yaml) of the six edited workflows | — | all parse — `green/yaml-parse.txt` |
| Gates that read the workflow tree: `ci:workflow-targets`, `ci:required-workflow-concurrency` (+ self-test), `ci:node-runtime` (+ self-test), `ci:trivyignore-hygiene`, `check-trivy-inline-ignores` | — | all exit 0 — `green/workflow-gates.txt`; `tests/schema-contract/deploy-migration-mechanism` and `tests/ci/secret-history-scan` (which read these workflows) 365/365 |

The 7 tests that pass at HEAD: five INF-02 checks (the four gates moved on 2026-09-25 and
`ci:discarded-audit-write:self-test`; all five shown failing over `adbf2d18`), the
release-policy job name, and `.npmrc`'s `legacy-peer-deps` — invariants the change must keep.

## What the new image gate will do on its first run

`green/trivy-image-base-node22-slim.txt`: Trivy 0.70.0 (what trivy-action v0.36.0 installs) on
`node:22-slim`, the production stage's base, finds **57 HIGH/CRITICAL Debian 12.15 OS findings
with no fixed version** and **10 HIGH findings with a fix in npm's own bundled packages**
(`/usr/local/lib/node_modules/npm/...`). None is in `.trivyignore`. The built image adds
LibreOffice, a JRE, ghostscript and ocrmypdf on top, so this is a lower bound: **as written, the
gate refuses the current production image.** That is the gate doing its job, and the response is
a founder decision, not a CI edit: rebase the image (a smaller or distroless base; drop or update
the global npm the runtime does not need — the CMD is `npm run start`), or record each accepted
finding in `.trivyignore` with an owner, a reason and an expiry. `ignore-unfixed` was not used: it
is a blanket exception with no owner or expiry, which `.trivyignore`'s own rules forbid.

## What cannot be proven without a GitHub run

- The pinned Semgrep image pulls and runs; `actions/github-script` runs inside that Alpine
  container (checkout and upload-artifact already do); the registry serves `p/default` and
  `p/ci` to 1.177.0; the full scan with `p/ci` added fits the 40-minute timeout.
- The baseline resolver and `ci-verdict` against the real Actions API (`listWorkflowRuns`
  with `head_sha`, `branch`, `event`, `status`). Both were run only against a stub.
- The first post-change Semgrep run takes as baseline the last green run of the *old*
  workflow (always green) — so it blocks from that commit on; whether `p/ci` reports anything
  on the whole tree beyond `p/default`'s 719 is unknown here (semgrep.dev and the SARIF
  artifact's blob host are both denied by this machine's egress proxy). It does not affect
  blocking, which is diff-only.
- `trivy image` on the real built image, and its exact count.
- `npm ci` in the six jobs on the runners (the lockfile was verified in sync locally).

## Behaviour changes the control tower should expect

- One new Semgrep finding on the trunk keeps **every later push's** Semgrep job red until it
  is fixed or marked `nosemgrep` — the baseline stays at the last green commit. Release
  evidence requires that job, so release evidence is red for those SHAs too.
- A tag deploy now waits up to 90 minutes for the SHA's CI, Semgrep and CodeQL, and refuses
  every SHA whose CI is red — which, per the run history read on 2026-10-01
  (`red/github-runs-before.txt`), is every recent trunk SHA (INF-01: trunk CI is red).

## Not done here (open)

- **Checkov** (INF-02's last entry) still runs only on pull requests touching `terraform/**`
  (`terraform-compliance.yml`), and last ran failing. Moving it to push would red the trunk on
  `terraform/**`, which another lane owns; it needs that lane's fix first.
- Pre-push-only gates that are not security gates were left there: `db:sync-manifest:check`,
  `ci:undefined-css-classes`, and the diff-scoped `ci:untracked-imports` / `ci:pushed-*`.
- `pr-checks.yml` still repeats eight steps `ci.yml` already runs on pull requests (zero
  duplication; harmless, not in this item).
- The rest of plan row P1-12: ECR scan results, cosign signing and SLSA provenance, evidence
  export to the object-locked bucket (INF-19), the advisory dependency gate and force-pushed
  tags in `cerv2-staging-deploy.yml` (INF-20). And INF-01: without branch protection CI still
  runs after the push; this item makes CI fail honestly, it does not stop a push.
- `.trivyignore`'s header lists the scans it governs; it should name the image scan too.

## Commands

```bash
# contract tests (green), and the same suite over HEAD's / the audited commit's workflows (red)
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run tests/ci/ci-honesty.contract.test.ts \
  tests/ci/deploy-refuses-unproven-sha.contract.test.ts tests/ci/trivy-steps-run-after-failures.contract.test.ts
mkdir -p /tmp/wf && git archive c6f2028b .github/workflows | tar -x -C /tmp/wf
CI_CONTRACT_WORKFLOWS_DIR=/tmp/wf/.github/workflows npx vitest run tests/ci/ci-honesty.contract.test.ts \
  tests/ci/deploy-refuses-unproven-sha.contract.test.ts
mkdir -p /tmp/wf0 && git archive adbf2d18 .github/workflows | tar -x -C /tmp/wf0
CI_CONTRACT_WORKFLOWS_DIR=/tmp/wf0/.github/workflows npx vitest run tests/ci/ci-honesty.contract.test.ts -t INF-02

# real semgrep (pip install semgrep==1.177.0 into a venv), deliberate rule, old step vs new step
node docs/evidence/D6/2026-10-01-tranche-4/P1-12/semgrep-e2e.mjs <venv>/bin /tmp/wf/.github/workflows old
node docs/evidence/D6/2026-10-01-tranche-4/P1-12/semgrep-e2e.mjs <venv>/bin .github/workflows new

# actionlint 1.7.7 (release binary) with shellcheck-py on PATH
actionlint -no-color .github/workflows/{ci,semgrep,pr-checks,deploy-aws,db-schema-validation,neon-preview-db}.yml

# the new ci.yml step's gates
npm run ci:unauthenticated-fetch:selftest && npm run ci:unauthenticated-fetch
npm run ci:drizzle-tenant-scope:selftest && npm run ci:drizzle-tenant-scope
npm run ci:migration-drop-safety:selftest && npm run ci:migration-drop-safety
npm run ci:upload-guards:selftest && npm run ci:upload-guards && npm run check:catalog-copy

# trivy 0.70.0 (release binary) on the production base image
trivy image --image-src remote --scanners vuln --severity CRITICAL,HIGH node:22-slim
```

The gate runs in `green/ci-yml-prepush-gates-step.txt` were over the shared working tree,
which carries other lanes' uncommitted edits; each of these gates also blocks in
`.husky/pre-push`, so HEAD passed them when it was pushed.

## Fix round (2026-10-01): the contract tests now pin what they claim

The adversarial verifier found that the workflows were right but the tests did not hold them
there. A one-line bypass of each of four properties left the suite green. No workflow changed
in this round; only the tests did.

### What was wrong

The suite decided "does this step run, and can it fail the run" by matching text:

- A step counted as blocking unless its `if:` matched one pull-request-only regex
  (`excludesPush`). The Semgrep `Blocking scan` step's `if:` was never read at all.
- A gate counted as blocking if `npm run <gate>` appeared anywhere in its step, so
  `npm run <gate> || true` still counted.
- The deploy tests ran the `ci-verdict` script in isolation. Nothing checked that a refusal
  stops anything: `continue-on-error` on the job or the step, or a condition that skipped the
  step, all passed.
- Build, scan and push were pinned by array index. The push step's `if:` was never read.
- `semgrep.yml`'s `pull_request` trigger and the absence of `paths` filters were not pinned.
  That trigger is the only replacement for the Semgrep job deleted from `pr-checks.yml`, so
  CLAUDE.md's deletion rule needs a test proving it is reachable.

Reproduced with `mutants.mjs`. It applies 19 one-line bypasses, one at a time, to a copy of
`.github/workflows` and runs the suite over the copy. Against the suite as it stood before
this round, **18 of 19 survived**. Only `continue-on-error` on the blocking scan was caught
(`red/fix-round-mutants-vs-previous-suite.txt`).

### What is true now

- **`tests/ci/workflow-expression.ts`** (new) evaluates an `if:` the way the runner does:
  - a condition with no status function means `success() && (…)`;
  - `==` on strings ignores case, and mismatched types are compared as numbers;
  - a missing property is `null`; names may contain hyphens; index access works;
  - the status functions, `contains`, `startsWith` and `endsWith` are supported.

  Anything it cannot read **throws**, so an unreadable condition fails the test and is never
  counted as either answer. Those semantics are pinned by `tests/ci/workflow-expression.test.ts`.
- **`tests/ci/workflow-harness.ts`** adds:
  - named scenarios: a trunk push, a pull request, a `v*` tag push and a dispatch;
  - `stepRuns`;
  - `simulateSteps`, which walks a job in order with one step failing. A step with
    `continue-on-error` keeps outcome `failure` but has conclusion `success`, and a job with
    `continue-on-error` lets the jobs after it proceed;
  - `simulateJobs`, which evaluates job conditions against each `needs` result. With no status
    function a job needs every job in its `needs` to have succeeded; `failure()` is true when
    any ancestor failed;
  - `shellFor`, which picks the shell the runner uses: `bash -e` when none is named (no
    pipefail), `bash … -eo pipefail` for `shell: bash`, and `sh -e` for `shell: sh`.

  `triggersOnTrunkPush` is now false when there is a `paths` or `paths-ignore` filter, and
  `triggersOnEveryPullRequest` is new. `excludesPush` is removed; the evaluator replaces it.
- **`ci-honesty`**:
  - A step is blocking in a scenario only when all of these hold: its workflow triggers on
    every such event, the job and the step both evaluate to run, and neither has
    `continue-on-error`.
  - Each INF-02 gate's step is **run as written**, in the runner's shell, with a fake `npm`
    that fails only that gate. The step must call the gate, must exit non-zero, and must exit 0
    when nothing fails. That catches `|| true`, `set +e` and a gate piped without pipefail.
  - Semgrep must trigger on every trunk push, with no `paths` or `paths-ignore` filter.
  - Semgrep must trigger on every pull request to the trunk. The test is named for the
    `pr-checks.yml` job it replaces.
  - `Resolve the baseline` and `Blocking scan` must run, blocking, on a trunk push **and** on a
    pull request.
- **`deploy-refuses-unproven-sha`**:
  - No job in `deploy-aws.yml` has `continue-on-error`, and no `ci-verdict` step has it.
  - On a tag push and on a dispatch:
    - `ci-verdict` and its verdict step run;
    - when the verdict step fails, `ci-verdict` fails and **every job that needs it, directly or
      not, is skipped**;
    - when the verdict is green, `build-push`, `migrate`, `deploy-api`, `deploy-frontend` and
      `smoke-test` do run. This is the positive control, so the check above can fail.
  - In `build-push`:
    - a failed image scan means no push and a failed job;
    - a failed build means no push;
    - when every step passes, the scan and the push both run;
    - whenever the push runs, the scan ran too. That also holds on a dispatch with
      `deploy_api=false`.

  Steps are compared by object identity. A first version compared names, and running it over
  HEAD showed that was vacuous: an unnamed step (checkout) and a missing scan step got the same
  placeholder. That was fixed in this round.

### Red / green (fix round)

| Check | Red | Green |
|---|---|---|
| 19 one-line mutants (`mutants.mjs`): each property's bypass, applied to a copy of the workflows | Suite before this round: **18 survive**, 1 killed. The unmutated workflows pass 59/59 (`red/fix-round-mutants-vs-previous-suite.txt`). | **19/19 killed**. The unmutated workflows pass 81/81 (`green/fix-round-mutants-vs-fixed-suite.txt`). |
| Fixed suite over HEAD `0e58e794`'s committed workflows (no P1-12) | **71 failed**, 10 passed (`red/fix-round-vitest-over-HEAD-workflows.txt`). The 10 are invariants that already held: the five gates moved on 09-25, Semgrep's two triggers, the job name, `.npmrc`, and no `continue-on-error` job in the deploy. | — |
| Contract suite, the Trivy contract and the evaluator test, over the working tree | — | **93/93** (`green/fix-round-vitest.txt`) |
| ESLint (repo config + `complexity` 15 + `max-lines-per-function` 100) on the five test files | — | exit 0. Files are 220, 57, 339, 354 and 260 lines (`green/fix-round-eslint.txt`). |

The mutants, each named for the verifier's finding it covers:

| Finding | Mutants (all now killed) |
|---|---|
| (a) Semgrep `if:` never read | `a1` blocking scan `if:` PR-only; `a2` push-only; `a3` the whole job skipped on push; `a4` blocking scan `continue-on-error` (the one the old suite caught) |
| (b) `\|\| true` after a gate | `b1` `\|\| true` in the multi-gate step; `b2` in a single-gate step; `b3` `set +e`; `b4` a gate piped into `tee` |
| (c) ci-verdict `continue-on-error` | `c1` on the job; `c2` on the step; `c3` the step skipped; `c4` `build-push` `always()`; `c5` `deploy-frontend` `always()` |
| (d) push `if:` never read | `d1` push `always()`; `d2` push `!cancelled()`; `d3` image scan skipped |
| triggers | `e1` `pull_request` removed; `e2` push `paths`; `e3` push `paths-ignore` |

The counts in the first-round table above (59 tests) describe that round. The two contract
files now hold 81 tests.

### Limits

- The evaluator implements the subset of the expression language these workflows use. A new
  construct makes the suite throw. It does not make it pass.
- A job with `continue-on-error` is modelled as letting the jobs after it run, which is the
  worst case. The suite also forbids it outright in `deploy-aws.yml`, so the exact runner
  behaviour does not decide any test.
- These are models of the runner. They were not observed on GitHub. The first-round "What
  cannot be proven without a GitHub run" still applies.

### Commands (fix round)

```bash
# mutants against the fixed suite (exit 0 only if the unmutated workflows pass and all 19 are killed)
node docs/evidence/D6/2026-10-01-tranche-4/P1-12/mutants.mjs .
# the same against a verbatim copy of the suite before this round (minimal vitest config, node_modules symlinked)
node docs/evidence/D6/2026-10-01-tranche-4/P1-12/mutants.mjs <old-suite> <old-suite>/vitest.config.mjs
# the fixed suite over HEAD's committed workflows
mkdir -p /tmp/wfhead && git archive HEAD .github/workflows | tar -x -C /tmp/wfhead
CI_CONTRACT_WORKFLOWS_DIR=/tmp/wfhead/.github/workflows npx vitest run \
  tests/ci/ci-honesty.contract.test.ts tests/ci/deploy-refuses-unproven-sha.contract.test.ts
# green
NODE_OPTIONS=--max-old-space-size=2560 npx vitest run tests/ci/ci-honesty.contract.test.ts \
  tests/ci/deploy-refuses-unproven-sha.contract.test.ts tests/ci/trivy-steps-run-after-failures.contract.test.ts \
  tests/ci/workflow-expression.test.ts
```
