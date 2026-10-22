# MR-02 — A green, gated canonical branch and a release-bound validation pack

| | |
|---|---|
| Phase | Phase 0 (stage 1) · Phase 1 (stages 2–3) · Phase 2 (stage 4) · Phase 3 (stage 5) · Backlog (stage 6) |
| Highest open severity at head | P0 |
| Human testing | Blocks: a new test environment cannot be provisioned at `94b4f9238`, because deploy-migrate fails in `db/migrations/20260813_knowledge_graph_tenant_keys.sql`, and CI's authenticated sign-in smoke and golden journey fail at that SHA (OPS-02). The fix is `2ef129e54`, which lands after head. |
| Owner | mixed. Engineering does the work; the founder decides F-7, F-22 and the NEW release-governance decision and makes the GitHub ruleset change. |
| Effort | M + M + S + M + S + L. Stages 1–4, which the pilot needs, are about M+M+S+M. |
| Depends on | F-7, F-22, NEW release-governance decision (stage 4), MR-03 (a reachable staging environment for stage 4), F-1 (CI cost if the repository goes private, stage 3) |
| Findings | 8 total — open 5 · partially fixed 2 · fixed 0 · refuted 0 · unverifiable 1 |
| Basis | cold audit at `92ccdba1`; every status re-verified at `94b4f9238` on 2026-10-13 — [evidence](../evidence/reviews/2026-10-13-market-readiness/) · [findings register](MR-findings-2026-10-13.json). The branch moves about 1,500 commits a day: re-confirm each finding at the current head before starting its stage. |

> **Re-checked 2026-10-18 at `8ca7e74ca`** (every finding that stopped a tester's journey at `94b4f9238`). Start from this, not from the 13 October text below, for:
> - **OPS-02**: partially fixed (2ef129e54, e1f3fd425); for testers it now degrades the journey but does not stop it. Evidence at head: [findings register](MR-findings-2026-10-13.json), `OPS-02.recheck`.

## Goal

`concept2cure-v2` is green on every push and stays green. A red change cannot
land, and every gate in the pre-push hook also runs in CI. Each production
release has a version number and a tag. Each one ships with an IQ/OQ/traceability
pack that was run against staging, plus a change record with a named approver.
A pilot customer's quality unit can ask "which validated version are we on, and
what changed in it?" and get both answers from the product and from the GitHub
Release.

## Why it matters

- **Nothing can ship today.** The last green `ci.yml` run on `concept2cure-v2` was 2026-09-23. The last 1,000 runs include 993 failures and no successes. `deploy-aws.yml`'s `ci-verdict` job refuses any SHA without a green CI run, so there is no deployable SHA and no route to the pilot.
- **Testers cannot set up a new environment at head.** A fresh database fails at deploy-migrate with `column n.organization_id does not exist`. A tester who hits this sees an infrastructure failure, not a product bug, and loses the session.
- **Fixes do not hold.** Agents push straight to trunk many times a day. No server-side gate and no pre-push test run stops the next push from breaking what the last one fixed. A bot also rewrites the repo-health baseline after every push, so each regression becomes the new normal.
- **An auditor will ask questions we cannot answer.** A GxP design partner has to audit the supplier and validate its intended use. Today there is no release version, no tag on trunk, no IQ/OQ run bound to a release and no per-release change record. `GET /api/version` returns only a commit and a start time.
- **Gates can quietly stop being enforced.** Some migration-safety gates run only in a client-side hook that can be skipped. One of them keeps the Part 11 signature triggers on `qms_documents` correctly ordered. A clone without the hook can push a misordered migration set, and that push deploys green.
- **CI is slow and expensive.** A run took about 8.7 hours to reach a verdict, and `ci-verdict` waits only 90 minutes. At about 12k runner-minutes a day, a private repository would cost roughly $2.5–3k a month in CI alone.

## State at head

| Finding | Status at head | Severity (pilot) | Tester impact | Evidence at head |
|---|---|---|---|---|
| OPS-02 | STILL_OPEN | P0 | Blocks | 0 green of the last 1,000 trunk runs. Lint fails at `ci.yml:301-310` (proof tier) and `ci.yml:604-612` (10 tools with no `present` block in `server/services/ana/tool-authorization.register.json`). The fresh-DB backfill at `db/migrations/20260813_knowledge_graph_tenant_keys.sql:146-156` reads a column before it exists. |
| OPS-18 | STILL_OPEN | P1 | No | Branch `protected:false`, ruleset 11855901 disabled. `.husky/pre-push` (707 lines) runs no tests. `repo-health-baseline-refresh.yml:17-20,61-65` pushes `[skip ci]` commits (342 since the audit). Checkov (`terraform-compliance.yml:3-6`) and `db-schema-validation.yml:13-18` run on PRs only. The nightly job `ci.yml:2459-2558` ends with `exit $failed`. |
| P11-08 | STILL_OPEN | P1 | No | No workflow runs `validation:iq`/`validation:oq` (`package.json:70-71`). `git tag` is empty. `.husky/pre-push:26-70` refuses `refs/tags/v*`. `server/startup/inline-endpoints.ts:196-198` returns no version. `tests/validation/lib/harness.mjs:52-58` falls back to the founder's email by default. |
| ARCH-06 | PARTIALLY_FIXED | P2 | No | Four security gates blocking at `ci.yml:575-598`. `ci:migration-guard-order` (`.husky/pre-push:148`), `db:sync-manifest:check` (:272), `ci:class-vocabulary` (:186) and `ci:undefined-css-classes` (:305) are hook-only. |
| ARCH-13 | STILL_OPEN | P2 | No | `eslint.config.js:37-57` ignores everything under `client/src/*` except `concept2cure/v2`, and ignores `scripts/**`. Security rules are off at :278 and :280. There is no `no-explicit-any` rule. |
| SEC-19 | PARTIALLY_FIXED | P3 | No | `ci:org-path-param-guards` 45/45 OK. `semgrep.yml:150-154` fails on a scan error but not on new findings. Whether CodeQL alerts fail anything is not settled. |
| OPS-25 | UNVERIFIABLE | P3 | No | `ci.yml:769-777` has `ci:required-workflow-concurrency`. Runner-minute figures need Actions usage data. |
| ARCH-12 | STILL_OPEN | P3 | No | `server/services/ana/AnaToolExecutor.ts` is 21,833 LOC and `shared/schema.ts` is 20,236 LOC. `tsc` needs a 24 GB heap (`scripts/ci/typecheck-no-regression.mjs:94-99`). |

## Already done at head — do not redo

No finding in this order is fully fixed or refuted. Keep these partial fixes:

- **ARCH-06, fixed part (`8060c28bc`, 2026-10-01).** `ci:unauthenticated-fetch`, `ci:drizzle-tenant-scope`, `ci:migration-drop-safety` and `ci:upload-guards` each run blocking after their selftests at `.github/workflows/ci.yml:575-598`. `tests/ci/ci-honesty.contract.test.ts:87-123` pins them.
- **Deploy gate (`8060c28bc`).** The `ci-verdict` job at `.github/workflows/deploy-aws.yml:84-150` refuses a SHA unless the `ci.yml`, `semgrep.yml` and `codeql.yml` push runs on that exact SHA succeeded. `build-push` (:260) and `deploy-frontend` (:950) depend on it, and `tests/ci/deploy-refuses-unproven-sha.contract.test.ts` pins it. Do not weaken it.
- **Repo-health ceiling (`f80dc2934`).** `audit:repo-health:ceiling` (`ci.yml:1026-1040`, `package.json:363`, `.husky/pre-push:587`) is a ceiling the bot cannot refresh. It covers oversized files only.
- **SEC-19, fixed part.** `ci:org-path-param-guards` passes 45/45. `semgrep.yml:150-154` exits non-zero when the scan fails; only the SARIF upload (:158) is `continue-on-error`.
- **P11-08, fixed part.** The validation run date is no longer hard-coded: `resolveRunDate()` in `scripts/validation/env-files.mjs:46-54`.
- **Fresh-DB fix (after head).** `2ef129e54` adds the column guard for `20260813_knowledge_graph_tenant_keys.sql`. Tier 5 sign-in and the golden journey are green at `4c03bc548` and `28f7bd63b`. Merge it; do not write it again.

## Work, in order

### Stage 1 — Get trunk green and able to provision a fresh database (Phase 0 · M · mixed) — closes OPS-02

1. Re-confirm OPS-02 at the current head (statuses here are from 94b4f9238).
2. Bring in the fresh-DB fix by merging, never rebasing: `git fetch origin && git merge origin/concept2cure-v2`. The merge must include `2ef129e54`. Failing-first evidence already exists: CI run 38358525641 has a red "Blank DB Provisioning + Deploy Migration". On the merged SHA, require Blank DB Provisioning, Production Boot Smoke ("Provision the schema from scratch"), Production Image Boot and Tier 5 to be green.
3. Fix the Lint step at `ci.yml:604-612`. In `server/services/ana/tool-authorization.register.json`, add a `present` block to each tool that `npm run ci:step-presentation` lists, with a verb and a source taken from `shared/ana/step-verbs.ts`. At head the list is `answer_intelligence_question`, `assess_recorded_batch_poolability`, `assess_recorded_process_capability`, `assess_recorded_stability_trend`, `commit_intelligence_flow`, `compare_recorded_dissolution`, `estimate_recorded_shelf_life`, `list_cmc_registers`, `resume_intelligence_flow` and `start_intelligence_flow`. Several are CMC / Module 3 tools, which are in the launch catalog (P-28; boundary in `shared/constants/launch-scope.ts`). Give them a `present` block; do not remove or fence them. Then run `npm run ci:step-presentation:selftest && npm run ci:step-presentation` and require exit 0.
4. Fix the Lint step at `ci.yml:301-310`. Run `npm run test:proof-tier`, which is vitest over `tests/schema-contract`, `tests/golden-journeys` and `tests/export-contract`. Fix each failing spec in the code it tests. Never loosen an assertion.
5. Fix the Test job. Get the list of failing files from the test-results artifact (`vitest.json`, `jest.json`) of the latest trunk run, or run `npx vitest run --config vitest.config.ts <dir>` one directory at a time. Fix the code, then re-run each file on its own. The failure set changes from day to day (`tests/routes/export-governance-fail-closed.test.ts` now passes), so build the list from the newest run.
6. Re-run Coverage (ratchet) and Integration Tests and fix whatever still fails. Do not lower the coverage baseline.
7. Prove `ci-verdict` still refuses. Dispatch `deploy-aws.yml` on a red SHA and file the URL of the refused run.
8. Until stage 2 lands, every tester records the SHA under test, taken from `GET /api/version`, in each defect report.

**Acceptance**

- Before the merge, the fresh-DB jobs are red: run 38358525641 is the filed reference. After the merge, Blank DB Provisioning, Production Boot Smoke, Production Image Boot and Tier 5 are green on trunk.
- `npm run ci:step-presentation` fails on the current code (10 findings) and then exits 0. Its selftest exits non-zero when one `present` block is removed.
- `npm run test:proof-tier` is shown red and then green, and no assertion was weakened (diff reviewed).
- At least 10 consecutive `ci.yml` push runs on `concept2cure-v2` conclude success. In each, Build, Assemble Release Evidence and Release evidence gate run rather than being skipped.
- `deploy-aws.yml` dispatched on a red SHA is refused by `ci-verdict`, and the run URL is filed.

### Stage 2 — Make it impossible for red to land, and make every gate run in CI (Phase 1 · M · mixed) — closes OPS-18, ARCH-06, SEC-19

1. Re-confirm OPS-18, ARCH-06 and SEC-19 at the current head (statuses here are from 94b4f9238).
2. Get the founder's decision on F-7 and record it in `CLAUDE.md` and `docs/`. F-7's recommendation reads "required status checks or a merge queue", but GitHub required checks refuse any direct push whose SHA has no green checks yet, and a merge queue needs PRs. Both conflict with Rule 0 as written. The two options that stay consistent are:
   - **(A)** Amend Rule 0 to allow a merge queue into `concept2cure-v2` (short-lived queue refs only), and update the agent-branch refusal in `.husky/pre-push` to match.
   - **(B)** Keep Rule 0. Make the pre-push hook the pre-land test gate (step 4) and limit server-side protection to history (step 3).

   Do not ship a change that silently contradicts Rule 0.
3. Server-side history protection (founder or admin; the session token gets 403). Enable ruleset 11855901, or create a new ruleset, on `refs/heads/concept2cure-v2` with "Restrict deletions" and "Block force pushes". Under (A), also require Lint, Test, Build and Release evidence gate, and enable `merge_group`, which `ci.yml:8` already listens for. Verify with `gh api repos/concept2cure/ClinicalSageAI-2-replit/rules/branches/concept2cure-v2`, which must return a non-empty list.
4. Pre-push test gate (option B, and harmless under A):
   - Add `scripts/ci/check-pushed-tests.mjs`, modelled on `scripts/ci/check-pushed-lint-errors.mjs`. Take the push range from `resolvePushBase` and `changedSince` in `scripts/ci/lib/push-range.mjs`. Run `vitest related --run --config vitest.config.ts <changed files>`, and for jest-owned paths also run `jest --config scripts/jest.config.js --findRelatedTests <changed files>`.
   - Fail closed when a runner exits non-zero, crashes, or produces no parseable JSON report.
   - When a change touches more than about 40 source files, or a shared core file (`shared/schema.ts`, `server/db.ts`, `server/middleware/**`), run a named fast subset instead and say so in the output: `test:submission` and `test:security` (`package.json:80-83`) plus `tests/schema-contract`.
   - Add `npm run test:proof-tier` to the gate.
   - Add `ci:pushed-tests` and `ci:pushed-tests:selftest` to `package.json` next to `ci:pushed-typecheck` (:291).
   - Insert the gate into `.husky/pre-push` after the typecheck block (around :697), using the existing refusal pattern (`ERROR … exit 1`). A docs-only push skips the gate and says so.
   - The selftest creates a temporary source and spec pair whose spec fails and asserts exit 1, then makes the spec pass and asserts exit 0.
5. Stop the bot from rewriting the gate's baseline. Delete `.github/workflows/repo-health-baseline-refresh.yml`; it is a maintenance job, not a user capability. `docs/reports/repo-health-scan-latest.json` becomes a ratchet that people maintain: `audit:repo-health:no-regression` (`ci.yml:1023-1025`) fails when the scan grows, and the pusher either fixes the cause or updates the baseline in the same commit with a reason. Add the same no-regression check to `.husky/pre-push` next to `audit:repo-health:ceiling` (:587). This also ends the `[skip ci]` commits at the branch tip, which leave `ci-verdict` with no run for the tip SHA. (OPS-02's instruction removes only the push step at :56-65. OPS-18's instruction deletes the whole workflow. Delete the workflow: nothing else in it is needed.)
6. Close the hook-only gaps (ARCH-06):
   - In the `ci.yml` step "Security gates that ran only in the pre-push hook" (:575-598), append `npm run ci:migration-guard-order:selftest`, `npm run ci:migration-guard-order` and `npm run db:sync-manifest:check`, and update the step comment.
   - Add a lint-job step that runs `npm run ci:undefined-css-classes` and `npm run ci:class-vocabulary`, with `if: "!cancelled() && steps.install.conclusion == 'success'"` and no `continue-on-error`.
   - Add the three migration gates to `GATES` in `tests/ci/ci-honesty.contract.test.ts` (:91-105).
7. Stop the gap from coming back:
   - Add `scripts/ci/check-hook-ci-parity.mjs` with the scripts `ci:hook-ci-parity` and `ci:hook-ci-parity:selftest`.
   - The script parses every `npm run [--silent] <name>` in `.husky/pre-push` and resolves each name through `package.json` scripts. A name passes only if some `run:` in `.github/workflows/*.yml` that executes on push to `concept2cure-v2` invokes either the npm name or the script file it maps to.
   - Every other name must appear, with a non-empty reason, in a new `scripts/ci/hook-only-gates.json`. Seed that file with:
     - `ci:pushed-lint-errors`, `ci:pushed-lint-warnings`, `ci:pushed-typecheck` and the new `ci:pushed-tests`: diff-scoped versions of CI's full-tree checks.
     - `ci:server-error-leaks:write-baseline` and `db:sync-manifest`: these write files; they are not gates.
     - `ci:untracked-imports`: diff-scoped; CI runs its selftest at `ci.yml:377-379`.
   - An entry without a reason fails.
   - The selftest copies the hook to a temp file with an injected `npm run --silent ci:fake-gate` and must fail. It must also fail on an allowlist entry with an empty reason.
   - Run `npm run ci:hook-ci-parity:selftest && npm run ci:hook-ci-parity` in the lint job and add both names to the ci-honesty `GATES`.
8. Move PR-only gates onto trunk:
   - **Checkov.** Move the step at `terraform-compliance.yml:28-38` into a new job in `terraform-tests.yml`, which already runs on push for `terraform/**`, with `soft_fail: false`. Delete `terraform-compliance.yml` in the same change: its plan step cannot run without AWS credentials, `terraform-tests` already runs validate, and its PR-comment step is dead under Rule 0. Checkov has not run since 2026-06-15, so first run `checkov -d terraform/ --framework terraform` locally. Put each existing finding in a `.checkov.yaml` skip list with a written reason. Extend `ci:trivyignore-hygiene`, or add a sibling guard, so an entry without a reason fails.
   - **Schema validation.** Add `push: branches: [concept2cure-v2]` with the same paths to `db-schema-validation.yml:13-18`.
   - **Other PR-only workflows.** For `test-assembly.yml`, `danger.yml`, `neon-preview-db.yml`, `pr-checks.yml` and `ops-audit-plan.yml`, either add a push trigger or delete the workflow. The commit message names the `ci.yml` step that already runs each of its gates; every gate in `pr-checks.yml` is already mirrored in `ci.yml`.
9. Move the nightly-governance job (`ci.yml:2459-2558`) into its own workflow, `governance-nightly.yml`, triggered by schedule and dispatch, and keep its counts and artifact upload. Its strict gates are documented as "EXPECTED to fail", and today they turn every scheduled `CI` run on trunk red.
10. Make the security scans fail on new findings (SEC-19):
    - **Semgrep.** In `semgrep.yml`, fail the job on new findings relative to a committed baseline (for example `--error` with a baseline), not only on scan errors.
    - **CodeQL.** In `codeql.yml`, add a step after analyze that fails when the SARIF contains error-level results not in a committed, reasoned baseline.
    - `ci-verdict` already requires both workflows to succeed, so this makes their findings block deploys without needing branch protection.
    - **What settles SEC-19:** an injected Semgrep finding and an injected CodeQL finding each turn their push run red.

**Acceptance**

- `gh api …/rules/branches/concept2cure-v2` lists `non_fast_forward` and `deletion`, and GitHub refuses a force-push. Under (A), the response also lists the required checks and a merge queue.
- `ci:pushed-tests:selftest` exits 1 on its failing fixture and 0 on its passing one. A real push that breaks a related vitest is refused by `.husky/pre-push`, and the commit message shows the refusal. A docs-only push skips the gate and says so.
- `ci:hook-ci-parity` is red on the tree before step 6 and lists `ci:migration-guard-order`, `db:sync-manifest:check`, `ci:undefined-css-classes` and `ci:class-vocabulary`. It is green after. Its selftest fails on an injected hook gate and on an allowlist entry with no reason.
- The ci-honesty contract includes the three migration gates and fails when any one of them is removed from `ci.yml`. In a local experiment, moving `20260511_qms_and_labeling.sql` after `20261001_qms_document_signature_required.sql` in `C2C_MIGRATION_FILES` turns the new step red through `tests/ci/workflow-harness.ts` (`runWithFailingGate`). Revert after.
- Checkov runs on a push that touches `terraform/**` and fails on a temporary public-S3-bucket fixture. `terraform-compliance.yml` no longer exists. The skip-list guard fails when an entry without a reason is added.
- `db-schema-validation` runs on a push to `concept2cure-v2` that touches `shared/schema.ts`. A temporary broken FK target turns it red; revert after.
- `repo-health-baseline-refresh.yml` is gone, and `git log --author=github-actions --since=<change date>` stays empty. A push that adds a duplicate basename is refused before it leaves the machine.
- Scheduled runs no longer appear as failures of the `CI` workflow.
- Injected Semgrep and CodeQL findings each turn their push run red, so `ci-verdict` refuses that SHA.

### Stage 3 — Bring the CI verdict inside the deploy window (Phase 1 · S · engineering) — closes OPS-25

1. Re-confirm OPS-25 at the current head (statuses here are from 94b4f9238).
2. Settle the unverifiable finding with data. Pull run and job timings for the last 7 days of trunk pushes from `gh api /repos/concept2cure/ClinicalSageAI-2-replit/actions/runs` and `/actions/runs/<id>/jobs`. Measure queue time, per-job duration and runner-minutes per push for `ci.yml` and every other workflow that runs on push. File the numbers under `docs/evidence/MR-02/<date>/ci-usage.json`. The audit's estimates, to confirm or correct: about 110 runner-minutes per `ci.yml` run, about 150 per push, and about 12k a day. In run 38358525641, queueing alone took about 5 hours.
3. Remove the duplicate typecheck and ESLint runs from the `c2c-agent` workflow. In the commit message, name the `ci.yml` steps that already run them.
4. Add path filters only where a skipped job still leaves a concluded `ci.yml` run for that SHA. `ci-verdict` keys on the exact SHA, and the `ci:required-workflow-concurrency` guard (`ci.yml:769-777`) exists to protect that. Skip heavy jobs with job-level `if:` conditions; never skip the whole workflow. Do not add `cancel-in-progress` for trunk push runs.
5. If the founder makes the repository private (F-1), put the measured cost in front of the founder before the change.

**Acceptance**

- `ci-usage.json` exists, and the finding's status moves from UNVERIFIABLE to measured.
- Every trunk SHA, including a docs-only commit, has a concluded `ci.yml` push run. Shown with a docs-only push followed by a `deploy-aws.yml` dispatch whose `ci-verdict` passes.
- The median time from push to `ci.yml` verdict over 20 trunk runs is under `CI_VERDICT_WAIT_MINUTES=90` (`deploy-aws.yml:105`). Before the change it is over 90, using the measurements from step 2.

### Stage 4 — Cut versioned releases that carry their own validation pack (Phase 2 · M · mixed) — closes P11-08

1. Re-confirm P11-08 at the current head (statuses here are from 94b4f9238).
2. Record the founder's release-governance decision (NEW) in `docs/RELEASE_GOVERNANCE.md`: the version scheme (`vMAJOR.MINOR.PATCH`), who approves a release, and how release tags are created. The recommendation is that a CI workflow creates tags through the GitHub API, so the Rule 0 enforcement in `.husky/pre-push:26-70` stays unchanged. Record where packs live as well (F-22): attach them to the GitHub Release, keep a hash in the change record, and never commit them to `docs/evidence/`.
3. Make the harness fail closed. In `tests/validation/lib/harness.mjs:52-58` and `scripts/validation/run-iq.mjs:24-26`, remove the founder-email default entirely, so an unset `VALIDATION_USER_EMAIL` is an error everywhere. When `process.env.CI` is set, also throw if `CHROMIUM_PATH` or `VALIDATION_EVIDENCE_ROOT` is unset. Add the case to `tests/validation/lib/harness.selftest.mjs` (`validation:oq:selftest`) and show it red first.
4. Add `docs/releases/TEMPLATE.md` with Change, Impact, Testing and Approval sections. Add `scripts/release/change-record.mjs`, which pre-fills the change list from `git log <previous tag>..<sha>`. The approver fills in impact, testing and approval.
5. Add `.github/workflows/release-cut.yml` (`workflow_dispatch`, input `version`). It must:
   1. Refuse unless `github.sha` is on `concept2cure-v2` and the CI verdict for that SHA is success. Reuse the `ci-verdict` logic from `deploy-aws.yml:84-150`; do not write a second copy of it. Factor it into a reusable workflow or script that both workflows call.
   2. Refuse unless `docs/releases/<version>.md` exists with all four sections and a named approver.
   3. Run `npm run validation:iq`, `npm run validation:oq` and `npm run validation:traceability` against staging (MR-03), with `VALIDATION_BASE_URL`, `VALIDATION_USER_EMAIL`, the password and TOTP secrets, `CHROMIUM_PATH` from `npx playwright install chromium`, and `VALIDATION_EVIDENCE_ROOT=$RUNNER_TEMP/validation-pack`. Fail on any failed step or any step that records a deviation.
   4. Upload the pack as the artifact `validation-pack-<version>`.
   5. Create the annotated tag `v<version>` and a GitHub Release with the pack and the change record attached. Tags created with `GITHUB_TOKEN` do not fire `deploy-aws.yml`'s `push: tags` trigger (:17-19), so either dispatch `deploy-aws.yml` explicitly or use a GitHub App token.
6. Make the running product name its release. `deploy-aws.yml` passes `BUILD_VERSION` (`GITHUB_REF_NAME` when the ref is a tag, otherwise empty) into the task definition. `server/startup/inline-endpoints.ts:196-198` returns `{version: process.env.BUILD_VERSION || null, commit, startedAt}`.
7. Make the gate fail first. Run `release-cut` on a SHA where one OQ step is forced to fail, using a `VALIDATION_FORCE_FAIL` step id that only the selftest honours. Show the workflow failing with no tag created, then run it green.
8. All commits go on `concept2cure-v2`. No release branches.

**Acceptance**

- `release-cut` with a forced OQ failure fails and creates no tag and no release (shown first). On a green SHA it produces tag `vX.Y.Z` and a GitHub Release that carries `validation-pack-vX.Y.Z` and `docs/releases/vX.Y.Z.md`. The pack contains IQ, OQ and traceability results that name the base URL and commit.
- `release-cut` refuses when the change record is missing or has no approver.
- With `CI=true` and `VALIDATION_USER_EMAIL` unset, the harness exits non-zero before it sends any request. The selftest is red on the current code and green after.
- `GET /api/version` on the deployed environment returns `{version: 'vX.Y.Z', commit: <sha>}`.

### Stage 5 — Lint the launch client code and turn on the security rules (Phase 3 · S · engineering) — closes ARCH-13

1. Re-confirm ARCH-13 at the current head (statuses here are from 94b4f9238).
2. Narrow the ignores in `eslint.config.js:37-57` so that `client/src/concept2cure/quality` (QMS), `client/src/concept2cure/auth`, `client/src/lib` (including `queryClient.ts`) and `client/src/contexts` (including `TenantContext.tsx`) are linted. Bring in the rest of `client/src` a directory at a time. Existing errors go into the existing pushed-lint baseline mechanism; do not add a second one.
3. Turn on `security/detect-child-process` and `security/detect-non-literal-fs-filename` (`eslint.config.js:278`, :280) for `server/services/compute/**` and `server/integrations/**`.
4. Add `@typescript-eslint/no-explicit-any` at `warn`, with a count ratchet that fails CI when the count grows.

**Acceptance**

- A new `any` and a new `child_process` call, each in a temporary file under the newly linted paths, are flagged. Before the change, the same files lint clean, which shows that coverage was missing.
- The `any` ratchet fails CI when the count grows and passes when it holds.

### Stage 6 — Split the TypeScript build and decompose the largest files (Backlog · L · engineering) — closes ARCH-12

1. Re-confirm ARCH-12 at the current head (statuses here are from 94b4f9238).
2. Split the TypeScript build into project references, for example `shared`, `launch-core`, `client` and out-of-scope server code. The launch-scope boundary is the one in `shared/constants/launch-scope.ts`, and the CMC / Module 3 composition path and Reporting & analytics are launch-core. Move `scripts/ci/typecheck-no-regression.mjs` (:94-99, 24 GB heap) to per-project checks.
3. Decompose `server/services/ana/AnaToolExecutor.ts` and `shared/schema.ts` incrementally. Each move relocates code and keeps one canonical implementation: no copies, and no wrapper left alongside the original. Each commit names the new path that now holds what it moves.

**Acceptance**

- Each project typechecks in 8 GB or less. The current single-project run is shown failing at 6 GB first.
- The line counts of `AnaToolExecutor.ts` and `shared/schema.ts` go down, and a line-count ceiling on both fails CI if either grows.

## Definition of done

- At least 10 consecutive green `ci.yml` push runs on `concept2cure-v2` (stage 1 or later), each reaching a verdict within 90 minutes.
- A red change cannot land: GitHub refuses force-pushes and deletions, a failing related test is refused at pre-push (or by the merge queue under F-7 option A), and no bot commits land on trunk.
- Every gate in `.husky/pre-push` runs in CI or is listed in `scripts/ci/hook-only-gates.json` with a reason, and `ci:hook-ci-parity` enforces this.
- A `vX.Y.Z` release exists on trunk with a GitHub Release carrying its IQ/OQ/traceability pack, run against staging, and an approved change record. The deployed `GET /api/version` names that release.
- Every acceptance check above has filed evidence under `docs/evidence/MR-02/<date>/` showing it failed first and then passed.

## Founder decisions this order needs

- **F-7 — merge discipline under Rule 0** (blocks stage 2, steps 2–3). Choose (A) a merge queue with Rule 0 amended, or (B) a pre-push test gate with history-only server rules. The register's wording ("required status checks") does not work with direct pushes, so the choice has to be one of these two. The ruleset change itself needs an admin.
- **F-22 — where evidence lives** (blocks stage 4, step 2). The validation packs go to the GitHub Release or an artifact store with hashes, not to `docs/evidence/` in the product repository.
- **NEW — release governance** (blocks stage 4). Decide the version scheme, the release approver, and that tags are created by CI rather than pushed locally.
- **F-1 — private repository** (informs stage 3). Making the repository private turns CI minutes into a bill of roughly $2.5–3k a month at current volume, and stage 3's measurements give the actual figure.

## Do not

- Do not lower the coverage baseline, loosen a test assertion, or add a baseline entry without a written reason to turn trunk green.
- Do not let the bot back in. Delete `repo-health-baseline-refresh.yml` rather than moving its push elsewhere, and do not replace it with a scheduled job that rewrites any gate baseline.
- Do not turn on required status checks on a direct-push trunk without F-7 option (A). They would refuse every push. Do not set `ALLOW_NON_CANONICAL_PUSH=1` to push tags or queue refs; `release-cut.yml` creates tags through the API.
- Do not add `cancel-in-progress` or whole-workflow path filters to trunk `ci.yml` runs. `ci-verdict` needs a concluded run for every SHA.
- Do not write a second copy of the `ci-verdict` logic for `release-cut.yml`. Factor it out so both workflows use one implementation.
- Do not fence, delete or strip the CMC / Module 3 tools to clear `ci:step-presentation`. They are in the launch catalog under P-28; give them `present` blocks.

## How to run this order

- Claim it with one line in `docs/work-orders/README.md` §0 before starting; release it when you stop.
- Commit to `concept2cure-v2` only; merge, never rebase.
- Show each acceptance check failing on the current code before the fix, then passing; file that evidence under `docs/evidence/MR-02/<date>/`.
- When a finding closes, update its `statusAtHead` in `docs/work-orders/MR-findings-2026-10-13.json` with the closing commit.
