# D4 / D1 — CI's production-posture jobs run whatever Lint says

**Row:** D4 (validation package — its OQ and deploy evidence lean on these jobs), with D1. **Lane:**
`…session_01JNRgCKWRqqJxZ1cJCyxoor`, claimed on `docs/work-orders/README.md` before the change. **Changed:**
`.github/workflows/ci.yml` (one `if:` line, with a two-line comment, on six job headers — nothing else) and a new
contract test, `tests/ci/posture-jobs-run-after-lint-failure.contract.test.ts`.

## What was wrong

Six jobs ordered themselves after Lint with `needs: lint` and carried no `if:`:

| Job | What it proves |
|---|---|
| `integration-tests` | the real-database suites (`npm run test:db`), as `app_service`, RLS on |
| `blank-db-provisioning` | a blank database installs and deploy-migrates, as a deployment does |
| `production-boot-smoke` | production boots as the non-superuser role over TLS and `/readyz` is 200 |
| `coverage` | the coverage ratchet against real Postgres |
| `ana-readiness-tests` | AnA's readiness suite |
| `aios-audit-assets` | the audit asset build |

GitHub skips a job whose `needs` failed unless its `if:` says otherwise, and a skipped job reports neither pass nor
fail. With a dozen lanes each adding guardrail steps to Lint, some guardrail was red on **every** completed trunk run
read on 2026-10-01 (12708–12726); in run 12726 all six jobs show `skipped`. So trunk carried no automatic
production-shape proof. That is the window in which the connector could not issue a grant under enforced RLS
(2026-09-20 until `3bdb50458`) without any job saying so.

`test` already had `if: ${{ !cancelled() }}`, with the reason in its comment — the six had simply never been given it.
None of them consumes an artifact from Lint; `needs: lint` was ordering only.

## What is true now

Each of the six runs after Lint whatever Lint's verdict, unless the run was cancelled. The jobs that **aggregate**
verdicts are unchanged and strict: `build` (which needs `test` and `integration-tests`), `assemble-release-evidence`
(which needs Blank DB, Boot Smoke and Build) and the release-evidence gate still refuse when anything they need
failed. So nothing ships on a red guardrail; the guardrail just no longer hides the rest.

## Proof

| File | |
|---|---|
| `red/contract-before-fix.txt` | The contract on the unchanged workflow: fails, naming exactly the six jobs. Its strictness case passes (the control). |
| `green/contract-after-fix.txt` | After the change: 9/9 with the existing Trivy contract. |
| `red/mutation-build-made-lenient.txt` | With `if: ${{ !cancelled() }}` added to `build`, the strictness case fails: the fix cannot spread to the gate unnoticed. |
| `green/tests-ci-all.txt` | Every suite in `tests/ci/`: 109/109. `ci:required-workflow-concurrency` (+ self-test) and `ci:workflow-targets` OK. |

The contract derives its population from the workflow — every job that `needs: lint`, other than the aggregates — so a
job added later with a bare `needs: lint` fails it too; the named list only guards against a rename emptying it.

## What the first un-skipped run is expected to show

See `expected-first-run.md` (the full real-database suite run locally as `app_service`, as the Integration job runs it).
