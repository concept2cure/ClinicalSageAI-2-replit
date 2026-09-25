# P0-16a — Trivy suppressions with no end date, no owner, and four of them tree-wide S3 checks (INF-11, Medium)

**Row:** D6 (D1 for the scan it guards). **Finding:** `docs/security/SECURITY_AUDIT_2026-09-24.md` INF-11.
**Plan item:** P0-16a (the `.trivyignore` half; the `if: always()` on the Trivy steps in `ci.yml` is the other half
and that file is inside another lane's 24-hour window).

## What was wrong

`.trivyignore` is read by the blocking Trivy scans (`ci.yml` fs + config, `deploy-aws.yml` security gate; severity
CRITICAL,HIGH, exit-code 1). At the audit it held seven entries, none with an expiry, none with an owner:

| Entry | What it suppressed | State of the tree on 2026-09-25 |
|---|---|---|
| `AVD-AWS-0086/0087/0091/0093` | the four S3 public-access-block properties, for **every** bucket | every bucket in `terraform/` (bootstrap tfstate, cloudfront frontend, compliance-evidence, stack vault) has an `aws_s3_bucket_public_access_block` with all four flags `true`. The ignore protected nothing that exists and would have let the next bucket without a block pass the "blocking" scan |
| `AVD-AWS-0016` | CloudTrail log-file validation, tree-wide | the one trail, `aws_cloudtrail.part11_audit` (`terraform/modules/compliance-evidence/main.tf`), sets `enable_log_file_validation = true` |
| `CVE-2026-45829` | chromadb pre-auth RCE | chromadb is no longer pinned anywhere (`git grep -i chromadb` finds only documents). A stale suppression of a **critical RCE** is the entry most likely to hide a re-introduction |
| `GHSA-qwww-vcr4-c8h2` | react-router RSC CSRF | `react-router` / `react-router-dom` are no longer in `package.json` or `package-lock.json` |
| `DS002` | Dockerfile without `USER` | still needed for one file (below) |
| `CVE-2025-71329`, `CVE-2025-71330` | image-size DoS via pptxgenjs | still needed; mirrors the ledger rows that expire 2026-11-25 |

## What is true now

`.trivyignore` keeps three entries, each as `<ID> exp:YYYY-MM-DD` (Trivy honours `exp:` itself: the suppression lapses
on that date and the finding fails the scan until a person re-reviews it), each under a comment block with `owner:`
and `reason:`. The header records the four removals and the reason for each, and the rule that a per-resource
property is never suppressed tree-wide again. `DS002` stays, to 2026-11-25, because it fires on exactly one file,
`.claude/skills/gstack/.github/docker/Dockerfile.ci` (a vendored skill's own CI image, never built or deployed by this
repository; `Dockerfile.optimized` runs as `appuser`), and the plaintext format cannot scope an ID to a path: its
replacement is a path-scoped exception (`.trivyignore.yaml` `paths:` via the action's `trivyignores` input, or
`skip-dirs: .claude/skills`) which lives in `ci.yml`, another lane's file today. The header says so.

A gate, `scripts/ci/check-trivyignore-hygiene.mjs`, enforces the shape: every entry has `exp:` (future, at most 180
days out), `owner:` and `reason:`; the S3 public-access, bucket-encryption and CloudTrail check ids
(`RESOURCE_SCOPED_ONLY`) may never appear. `--selftest` constructs the failing cases (no expiry, expired, too far out,
no owner/reason, a tree-wide S3 ignore, the audited file's exact shape) and exits non-zero unless every one is caught.

| | File | Result |
|---|---|---|
| red | `red/hygiene-gate-on-audited-trivyignore.txt` | the gate against `.trivyignore` as committed at the audit (unchanged since `cc5aa066`, 2026-09-23): 22 violations, exit 1 |
| green | `green/hygiene-gate-on-rewritten-trivyignore.txt` | the gate against the rewritten file: 3 suppressions, each owned, reasoned and bounded, exit 0; `--selftest` 9/9 caught |

## Not done here

- **The gate is not wired yet.** `package.json` (scripts) and `.husky/pre-push` were both edited by other lanes inside
  the last 24 hours (16:51 and 21:18 UTC on 09-24), so the `ci:trivyignore-hygiene` script and its pre-push line wait
  for those windows to close later on 09-25; until then the gate runs by hand (`node scripts/ci/check-trivyignore-hygiene.mjs`).
- **The Trivy scan itself was not run here.** No Trivy binary is reachable from this container (the release assets and
  `get.trivy.dev` are not served by the proxy), so the plan's acceptance ("a public bucket in a scratch module fails the
  config scan") is verified by reading, not by execution: with the four S3 ids gone from the ignore list nothing
  suppresses `AVD-AWS-0086/0087/0091/0093` for a new bucket, and the next CI run of the config scan on trunk is the
  execution. The first push after this change should be watched for that job.
- `ci.yml`: `if: always()` on both Trivy steps (P0-16b) and the path-scoped `DS002` exception — W2's file.
