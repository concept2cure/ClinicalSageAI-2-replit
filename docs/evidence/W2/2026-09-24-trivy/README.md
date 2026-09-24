# W2 / D1 — TRIVY-01: the deploy's security gate can pass (2026-09-24)

**Row:** D1 (hosted production). **Workstream:** W2. **Audit finding:** July
register `TRIVY-01` (P1, blocks G1). **Board:** `docs/work-orders/README.md` §0.

**Summary.** D1's acceptance line is an image promoted by
`.github/workflows/deploy-aws.yml`. That workflow's `security-gate` job runs a
Trivy scan of the infrastructure code with `exit-code: 1`, and `build-push`,
`migrate` and `deploy-api` all depend on it.

On 2026-09-24 that scan failed on **16 HIGH/CRITICAL findings in 5 files**, so
no tagged release could reach production. The July audit predicted this, but
nothing showed it: the only other copy of the scan, in `ci.yml`, was advisory
(`continue-on-error`), so CI stayed green while the scan printed exit code 1.

Every finding is now either fixed or excepted at its own resource with a
written reason. On the tree this change was built against, the scan exits 0.

**It went red again on merge.** `terraform/stack/vault_storage.tf` landed
upstream the same afternoon (`7925a33d3`, the vault-storage lane) with an
`AES256` bucket for client documents: AWS-0132, twice. That bucket holds
regulated documents, so the fix is a customer-managed key, as the state
bucket now has, not an exception. It is that lane's file, so it is handed to
them on the board and not edited here.

The `ci.yml` copy stays advisory until that lands. Making it blocking now
would turn trunk red for every lane. Its comment says which line to delete.
This drift is the reason CI's copy should block.

## The 16 findings and what happened to each

| Rule | File | × | Disposition |
|---|---|---|---|
| KSV-0014 / KSV-0118 (HIGH) | `infra/k8s/bff-with-predicate-shadow.yaml` | 5 | **Fixed.** Added a pod- and container-level `securityContext`: default seccomp profile, no privilege escalation, all capabilities dropped, read-only root filesystem with an `emptyDir` at `/tmp`. The app container also sets `runAsNonRoot`, because its image runs as `appuser` (`Dockerfile.optimized`). The sidecar image is built in another repository, so its user is not asserted. This also closes the June audit note (`reports/ga-readiness-audit-2026-06-14/07-infra-deploy-cicd.md`) that the manifest had no `securityContext`. It is a reference manifest (`docs/operations/predicate-intelligence-shadow-service.md`) that no workflow applies, so it was hardened rather than deleted. |
| AWS-0132 (HIGH) | `terraform/bootstrap/main.tf` | 1 | **Fixed.** The state bucket's default key is now a customer-managed KMS key with rotation. State holds every value the stacks are given, secrets included, so reading it now needs `kms:Decrypt` on this key, which is granted and logged separately. A bucket policy refuses writes that ask for SSE-S3 (AES256) and any request made without TLS. The two roots' backends drop `encrypt = true` (see *Unverified*). |
| AWS-0052 (HIGH) | `terraform/modules/alb/main.tf` | 2 | **Fixed.** `drop_invalid_header_fields = true`. No header the app sends or reads has a name outside the valid token set; a search of `server/`, `client/src/` and `shared/` for underscore header names found none. |
| AWS-0053 (HIGH) | `terraform/modules/alb/main.tf` | 2 | **Excepted at `aws_lb.this`.** The ALB is internet-facing because it is CloudFront's origin. Access to it is limited by B9 (`../2026-09-24-b9/`): CloudFront's origin-facing addresses only, plus the origin secret header. |
| AWS-0132 (HIGH) | `terraform/modules/cloudfront/main.tf` | 2 | **Excepted at the frontend bucket's encryption.** The bucket holds the built frontend, which is served to every viewer. A customer-managed key would protect nothing, and CloudFront would then need `kms:Decrypt` on it. |
| AWS-0011 (HIGH) | `terraform/modules/cloudfront/main.tf` | 2 | **Excepted at the distribution, as a founder decision; see below.** |
| AWS-0104 (CRITICAL) | `terraform/modules/ecs-fargate/main.tf` | 2 | **Excepted at the task egress rule.** Tasks call the AI providers, the agency gateways and AWS APIs through the NAT gateway. These are hosted services with no fixed address ranges to list. |

Each exception is a `#trivy:ignore:<id>` comment directly above the resource or
block, with its reason beside it. None is a global `.trivyignore` entry, so the
same rule still fires anywhere else (case S1 below).

## Proof

Trivy v0.70.0, the version CI ran, was built from source here. Release
downloads were not available in this environment. It used the checks bundle
downloaded on 2026-09-24, the same source CI pulls from. Locally it reproduced
CI's result exactly: 5, 1, 4, 4 and 2 findings in the same five files.

| File | Shows |
|---|---|
| `ci-advisory-scan-2026-09-24.txt` | CI's advisory copy on trunk: the same 16 findings, exit code 1, job green. |
| `gate-scan-before.txt` | The deploy gate's exact scan on `144966e0c`: **exit 1**, 16 findings. |
| `gate-scan-after.txt` | The same scan on this change: **exit 0**. Both runs detected the same 13 config files. |
| `mutations.txt` | Each of 9 changes removed on its own: **all 9 fail**, each with exactly its own rule. S1 adds an unexcepted open-egress security group beside the excepted one, and it **is flagged**. |
| `terraform-validate-and-tests.txt` | `bootstrap`, `production` and `staging` validate. Test suites pass: `modules/alb` 4/4, `modules/cloudfront` 8/8, `stack` 17/17. |

Repository gates: `ci:workflow-targets` and `ci:required-workflow-concurrency`
are OK.

## Founder decision: a WAF on CloudFront (AWS-0011)

This is not defaulted. It is excepted with the reason written on the resource.

- **Why it matters:** a WAF adds edge rate limiting, IP-reputation blocking and
  known-bad-input rules. SOC 2 and security questionnaires (D6) will ask about
  it.
- **Why it is not simply switched on:**
  - It costs about $5 a month per web ACL, plus about $1 per rule and a
    per-request charge.
  - AWS's common managed rule set blocks request bodies over 8 KB until it is
    tuned, which would refuse document uploads and AnA turns.
- **Recommendation:** a web ACL on the distribution with the IP-reputation and
  known-bad-inputs managed groups plus a rate-based rule. Run the common rule
  set in count mode for two weeks, then block with its body-size rule excluded
  on the upload paths. Until then, the ALB admits CloudFront alone (B9) and the
  app applies its own sign-in and API rate limits.

## Unverified here — confirm on the first apply

- **The backend's `encrypt = true`.** This is read from how the Terraform S3
  backend behaves; it could not be checked against AWS here. With no
  `kms_key_id`, that setting asks for SSE-S3 on every state write, which
  overrides the bucket's default key. The change is correct either way:
  - the roots no longer set it, so the bucket's key applies;
  - the bucket refuses any write that asks for AES256, so a root that sets it
    again fails loudly rather than quietly.
- **Existing state.** No bootstrap has been applied, as far as this repository
  shows (D1 is not applied). If one has, its existing state objects stay under
  the old encryption until they are next written.

## Not changed

- **The Trivy checks bundle floats.** CI and the deploy gate download the
  current bundle, so a new upstream rule can turn the gate red with no change
  here. That was already true of the deploy gate. It now shows first in CI,
  on the next commit.
- **Other `.trivyignore` entries.** The existing global entries (AVD-AWS-0016,
  0086, 0087, 0091, 0093, DS002) and their written reasons were not revisited.
