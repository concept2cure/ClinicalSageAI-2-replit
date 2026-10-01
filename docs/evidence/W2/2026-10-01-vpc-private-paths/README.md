# D1 — the VPC's private paths to S3 and KMS carry traffic

**Row:** D1 (commercially deployed), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-10-01. Claimed before the change (work-orders register).
**Found by:** the founder's external-requirements inventory, while pricing what
the production Terraform builds.

**What this is not:** an apply. Nothing in `terraform/` has been applied yet. A
mocked provider proves what Terraform will ask AWS for, not that AWS routes it.

## The defect

`terraform/modules/vpc-secure/main.tf` declared two VPC endpoints, and neither
could carry traffic.

- **The S3 gateway endpoint was associated with no route table.** A gateway
  endpoint works only through the route tables it is attached to. So every S3
  request from the private subnets went out through the NAT gateway:
  - Vault document bytes;
  - the Part 11 evidence bucket;
  - the frontend publish.

  AWS bills NAT data processing per GB. The S3 gateway endpoint itself is free.
- **The KMS interface endpoint admitted nothing, and private DNS was off.** Its
  security group had no ingress rule. Without private DNS,
  `kms.us-east-1.amazonaws.com` resolves to the public KMS endpoint. So every
  release signature from the KMS signing key (`alias/fda-signing-key-2026`) went
  through the NAT too. Meanwhile the endpoint was billed by the hour in two
  availability zones, about $15 a month, for nothing.

## The change

- The S3 endpoint is on the private route table.
- The KMS endpoint has `private_dns_enabled = true`. The SDK's ordinary hostname
  now resolves to the endpoint inside the VPC, so no application configuration
  changes.
- The endpoint security group admits TCP 443 from the VPC's own CIDR, and no
  wider range.
- Both endpoints are tagged. Nothing else in the module changed, including its
  pre-existing `terraform fmt` drift.

**Checked before changing it:**

- The ECS tasks' security group already allows all egress, so it reaches the
  endpoint (`modules/ecs-fargate/main.tf:110-115`).
- No key or bucket policy conditions on source IP or VPC. The vault key's
  `kms:ViaService = s3` covers calls S3 makes on our behalf, which endpoints do
  not affect. The `aws:SecureTransport` denies are met because endpoints use
  TLS.

## The proof

`terraform/modules/vpc-secure/tests/private_paths.tftest.hcl` uses a mocked AWS
provider, so it needs no account. It was added to the `terraform-tests.yml`
matrix, so CI runs it on every change under `terraform/`.

| File                               | Shows                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/before-fix.txt`               | The test against the unchanged module: **0 of 2 runs pass**. The S3 endpoint is on no route table; `private_dns_enabled` is false; the endpoint security group's ingress is an empty set.                    |
| `green/after-fix.txt`              | `terraform validate` and the test after the change: **2 of 2**.                                                                                                                                              |
| `green/stack-preflight-proof.txt`  | `scripts/ops/terraform-preflight-proof.mjs` on the whole stack with the change: `terraform test` **28 of 28**, and deploy-aws.yml's preflight accepts the rendered task definition ("every check holds"). |

Terraform 1.9.8, the version CI pins. The provider came from a local filesystem
mirror (aws 5.70.0), because `registry.terraform.io` is refused from this
session.

## Still asserted, not proven

- **That AWS routes through the endpoints after the apply.** On the first
  deployed stack, check that the private route table lists the S3 prefix list,
  and that `nslookup kms.us-east-1.amazonaws.com` from a task returns a
  10.x address.
- **The NAT saving.** It depends on Vault volume and is not estimated here.
