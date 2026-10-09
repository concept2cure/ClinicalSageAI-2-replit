# The blocking Trivy scans run after an earlier step fails

**Row:** D1, for D6. **Workstream:** W2. **Session:** `…01AiwZKG`.
**Date:** 2026-09-25. **Source:** security audit 2026-09-24 INF-08; plan
P0-16, the `if: always()` half, handed to W2.

## What was wrong

The fs and config Trivy scans in CI's Security Scan job and in the deploy's
security gate had no condition. Any earlier failed step skipped them (observed
in CI run 35850422925). A red job then reported one failure and hid whether
the tree also carried a HIGH or CRITICAL finding.

## The change

All four steps carry `if: ${{ !cancelled() }}`. That runs them after a
failure, and not after a cancel, which `always()` would.
`tests/ci/trivy-steps-run-after-failures.contract.test.ts` loads both
workflows and requires the condition on every step that uses
`aquasecurity/trivy-action`. It fails if a workflow loses its Trivy step
altogether.

## Proof

| Check | Result |
|---|---|
| The contract test before the change | 2/2 fail: ci.yml › security and deploy-aws.yml › security-gate each have "Trivy filesystem scan" with no condition (`test.txt`) |
| After | 2/2 pass |
| `ci:unrun-tests` | the new file is reachable by a runner |
| `ci:workflow-targets`, `ci:required-workflow-concurrency`, `terraform-preflight-proof.mjs` | OK; every check holds |

## Not done here

P0-16's other half, `.trivyignore` expiries and owners, was closed by the D6
session (`14639fa3`). Wiring its hygiene gate into `package.json` and the
pre-push hook is listed in the D6 claim row.
