# The Trivy config scan is green again, and its exceptions are checked

**Row:** D1 (the deploy's security gate can pass, and passes only for a tree
without an unexcepted HIGH or CRITICAL finding). **Lane:** W2.
**Session:** `…01AiwZKG`. **Date:** 2026-09-26.

## What broke, and whose it was

The blocking `Trivy config scan (Dockerfile/IaC)` in CI's Security Scan job
went red on trunk with two findings, both `AWS-0011 (HIGH): Distribution does not
utilize a WAF`, on `terraform/modules/cloudfront/main.tf`. One came via the
production stack and one via staging (CI run 12433, job 108294587408). The
deploy's `security-gate` runs the same scan, so no tagged deploy could pass.

The cause was mine. `abc1c99a5` (security plan P0-15) added the SPA's
`aws_cloudfront_response_headers_policy`, with its comment block, between
`#trivy:ignore:AWS-0011` and `aws_cloudfront_distribution.this`. Trivy applies
an ignore comment that stands on its own line to the line directly below it,
and to nothing else. Consecutive ignore lines chain onto the first code line
after them. Pushed away from the distribution, the exception applied to a
comment. The WAF itself is a founder decision (cost, and the managed rule set's
8 KB body limit), recorded in the comment above the ignore and in
`docs/evidence/W2/2026-09-24-trivy/`.

Nothing local could have caught it: no session that edits these files could run
Trivy. The release downloads are refused by the egress proxy, as the D6 lane
found for P0-16a. For this change Trivy **v0.69.3 was built from source** through
the Go module proxy (`GOEXPERIMENT=jsonv2 go install
github.com/aquasecurity/trivy/cmd/trivy@v0.69.3`), using its embedded checks. It
reproduces CI's result exactly.

## The change

1. **The exception is back on the block it names.** In
   `terraform/modules/cloudfront/main.tf` the response-headers policy now comes
   before the WAF comment block. `#trivy:ignore:AWS-0011` sits directly on
   `resource "aws_cloudfront_distribution" "this"` again, with a line above it
   saying why it must stay there.
2. **`scripts/ci/check-trivy-inline-ignores.mjs`** reads every tracked Terraform,
   Dockerfile and YAML file the way Trivy reads an ignore comment. It fails when
   a stand-alone `#trivy:ignore` / `tfsec:ignore` (either `#` or `//`) is
   followed by a blank line, a plain comment or the end of the file. On success
   it lists each exception and the block it attaches to. `--selftest` covers
   nine cases, among them the `abc1c99a5` shape, chained ignores, a nested
   block, a trailing ignore on a code line, and the tree-level exit code.
3. **The D6 lane's `scripts/ci/check-trivyignore-hygiene.mjs` now runs.** It was
   written for P0-16a and left unwired (`docs/evidence/D6/2026-09-24-p0/P0-16a/`,
   "The gate is not wired yet"). It checks that every `.trivyignore` entry has
   an owner, a reason and an expiry within 180 days. It also refuses tree-wide
   ignores for per-resource checks.
4. Both checks, each with its selftest, run as one step, **"Trivy exceptions are
   attached, owned and dated (with selftests)"**. That step runs before the scans
   in CI's Security Scan job and in the deploy's `security-gate`, and like the
   scans it runs unless the run was cancelled.
5. **DS002 is excepted for one file, not the tree** (P0-16a's hand-on to W2).
   `.trivyignore` suppressed DS002 (image runs as root) everywhere, for one
   vendored image this repository never builds:
   `.claude/skills/gstack/.github/docker/Dockerfile.ci`. The config scans now
   pass `skip-files:` for that file alone, and the line is gone from
   `.trivyignore`; its removal log records why. `Dockerfile.optimized`, the
   production image, runs as `appuser` and scans clean.
6. `tests/ci/trivy-steps-run-after-failures.contract.test.ts` gains two
   requirements, each in both workflows:
   - the scans may skip only `node_modules` and that one file, and a skipped file
     must still exist;
   - every job that runs a Trivy scan must run both checks and both selftests
     before its first scan.

## Proof

| Stage | File | Result |
|---|---|---|
| Real Trivy on `terraform/` at `abc1c99a5` | `trivy-red-at-abc1c99a5.txt` | exit 1: AWS-0011 ×2, CI's result. The log shows the other three inline ignores applied, and AWS-0011 not applied |
| Real Trivy on the whole repository with this change, using `ci.yml`'s flags | `trivy-green-this-change.txt` | exit 0; every target, `Dockerfile.optimized` included, has 0 misconfigurations |
| Mutant: this change without `skip-files` | `trivy-mutant-without-skip-files.txt` | exit 1, DS-0002 on the vendored image alone: the check is live, and the skip is what excepts it |
| Probe: a new root-running `Dockerfile` added elsewhere in the tree | `trivy-probe-new-root-dockerfile.txt` | trunk's `.trivyignore`: **exit 0** (the tree-wide suppression hid it); this change: exit 1 |
| Placement check at `abc1c99a5` / at its parent / on this change | `red-check-at-abc1c99a5.txt`, `green-check-at-parent-0db8c56f3.txt`, `green-check-this-change.txt` | exit 1 naming `main.tf:116`; exit 0; exit 0 with the 4 exceptions and their blocks, selftest 9/9 |
| Contract test on the workflows as on trunk | `red-contract-trunk-workflows.txt` | 2 failed / 4 passed: neither job ran the checks before its scans |
| Contract test, mutant widening `skip-dirs` to `.claude/skills` | `red-contract-widened-skip.txt` | 1 failed / 5 passed |
| Contract test with this change | — | 6/6 |

The placement check and Trivy agree at every stage: red at `abc1c99a5`, green
on its parent and on this change.

## Not done here

- **Not added to `.husky/pre-push`.** The placement check is where it would help
  most, since no session can run Trivy before pushing. The hook and
  `package.json` are inside another lane's 24-hour window (`936277fc4`,
  pushed-lint-warnings). CI runs the check first thing in Security Scan. For the
  owner of the hook:
  `node scripts/ci/check-trivy-inline-ignores.mjs` takes under a second.
- **The WAF (AWS-0011)** is still a founder decision and still excepted.
- **The helm charts** (`charts/concept2cure-app`, `charts/trialsage-cer`) do not
  render for Trivy: `postgresql` and `redis` are declared in `Chart.yaml` but
  missing from `charts/`. Trivy reports this as an error, not a finding, so
  those charts are not scanned. This predates this change and is recorded here
  for whoever owns them.
