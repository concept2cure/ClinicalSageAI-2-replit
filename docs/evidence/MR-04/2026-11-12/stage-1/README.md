# MR-04 Stage 1: multi-Region keys before the first apply (2026-11-12)

Closes the key part of OPS-14. A KMS key can be made multi-Region only when it is created, and changing an RDS
instance's storage key replaces the instance. So the stage must land before MR-03 runs the first `terraform apply`.

## The stack has never been applied

- `deploy-aws.yml` has six runs, all dispatched 2026-10-26.
  - The latest, 40421512113, failed at "CI passed for this commit" and the pre-deploy security gate.
  - The other five were cancelled.
  - In every run, build, migrate and deploy were skipped.
  - The workflow does not run `terraform apply`: MR-03 Stage 5 runs it by hand.
- No first-apply evidence exists: there is no `docs/evidence/D1/*-first-apply/`.
- The state bucket is created by that same first apply's bootstrap.

## What already exists

- `terraform/stack/database_keys.tf`: `aws_kms_key.database` (RDS) and `aws_kms_key.secrets` (Secrets Manager). Both
  were single-Region, under `local.account_admin_key_policy`, which delegates to IAM in the account.
- `terraform/stack/vault_storage.tf`: `aws_kms_key.vault`, single-Region. The account administers it but cannot
  decrypt with it. The task role uses it only through S3 in the stack's region.
- `terraform/stack/release_signing.tf`: `aws_kms_key.release_signing`, already `multi_region = true`, whose policy
  already allowed `kms:ReplicateKey`. Its header said the replica (SOP §8) was "a separate, later resource". There was
  no replica.
- There was no `aws_kms_replica_key`, `dr_region` or second AWS provider anywhere in `terraform/`.
- `terraform/stack/tests/boot_contract.tftest.hcl`: the mocked-provider suite this test follows.
- `tests/ci/terraform-root-outputs.contract.test.ts`: the roots' contract with the stack, extended here.

## What changed

| File | Change |
|---|---|
| `terraform/stack/database_keys.tf` | `multi_region = true` on the database key. `data.aws_region.dr` and `aws_kms_replica_key.database` through `aws.dr`, under the same policy. A precondition refuses, at plan, a DR region equal to the primary. |
| `terraform/stack/vault_storage.tf` | `multi_region = true` on the vault key. The policy becomes `local.vault_key_policy`, one document per region. Only `kms:ViaService` differs: S3 in the region the key is in. The administration statement gains `kms:ReplicateKey`, and still has no Decrypt, Encrypt or GenerateDataKey. Adds `aws_kms_replica_key.vault`. |
| `terraform/stack/release_signing.tf` | The policy moves, unchanged, into `local.release_signing_key_policy`, so the key and its replica read one document. Adds `aws_kms_replica_key.release_signing`. |
| `terraform/stack/versions.tf` | `configuration_aliases = [aws.dr]`: a root must pass the DR provider, or it is refused at validate. |
| `.github/workflows/terraform-tests.yml` | The stack's standalone `terraform validate` step writes a DR provider for that step and removes it after. See below. |
| `terraform/environments/{production,staging}/main.tf`, `variables.tf`, `terraform.tfvars.example` | `provider "aws" { alias = "dr", region = var.dr_region }`, passed to the stack as `aws.dr`. `dr_region` is required, has no default, and must be a region name other than `region`. The examples set `us-west-2`, the work order's recommendation, and say it is the founder's decision (NEW-2). |
| `terraform/stack/tests/boot_contract.tftest.hcl` | A mocked `aws.dr` provider, which the stack now needs. |
| `terraform/stack/tests/dr.tftest.hcl` | New. Stage 6 extends it. |
| `tests/ci/terraform-root-outputs.contract.test.ts` | Each root configures `aws.dr` from `var.dr_region`, passes it to the stack, and has no default for `dr_region`. |

One departure from the work order's steps, and one consequence of following them:

1. **`kms:ReplicateKey` on the vault key.** `ReplicateKey` is authorised by the primary key's policy. The vault policy
   does not delegate to IAM, so without the action the first apply would fail at the replica. Release signing already
   had it.
   - The work order asks for the human-decrypt denial to "carry over unchanged". It does: `dr.tftest.hcl` asserts that
     the administration statement is identical in both regions and holds no use of the key.
2. **Validating the stack on its own.** With `configuration_aliases = [aws.dr]`, `terraform validate` in
   `terraform/stack` alone fails under Terraform 1.11 ("Provider configuration not present", once per DR resource),
   and `terraform-tests.yml` runs that step.
   - **The alternative tried and dropped:** an empty `provider "aws" { alias = "dr" }` proxy block. It let the stack
     validate on its own, but both roots then warn on every validate ("Redundant empty provider block", deprecated). A
     root that forgot to pass `aws.dr` validated with only that warning.
   - **Kept instead:** `configuration_aliases`. A root that omits `aws.dr` is refused (`root-without-dr-provider.txt`).
     The CI step writes `provider "aws" { alias = "dr", region = "us-west-2" }` for the stack's standalone validate and
     removes it after. The roots, which pass the real provider, are validated by `environments-validate`, and
     `terraform test` uses the mocks.
   - `terraform-root-outputs.contract.test.ts` also pins that each root configures `aws.dr` from `var.dr_region`. It
     was shown failing when the line was removed.

## Evidence

- **`dr-red.txt`:** `terraform test -filter=tests/dr.tftest.hcl` against the stack before the change. 0 passed, 2
  failed, 3 skipped.
  - The multi-Region assertions fail for the database and vault keys; release signing already passed.
  - The replica run fails because no `aws_kms_replica_key` is declared.
- **`dr-green.txt`:** after the change. `terraform validate` passes, and 5 of 5 runs pass:
  1. the three keys are multi-Region;
  2. each has a replica of its own ARN with a 30-day window;
  3. each replica carries its primary's policy;
     - for the vault: the same administration statement, no decrypt, the task role only, through S3 in the DR region,
       read from the DR provider;
  4. the vault key allows `kms:ReplicateKey`;
  5. a DR provider in the primary region is refused at plan.
- **`dr-mutations.txt`:** each guarantee broken in a scratch copy, one at a time. The run that guards it fails each time.
- **`stack-suite.txt`:** every `terraform/stack` test file, `boot_contract` included, after the change.
- **`roots.txt`:** both roots and bootstrap. `init -lockfile=readonly` and `validate` pass with no warning, and
  `terraform fmt -check` is clean. The lock files did not change: the second provider is the same `hashicorp/aws`.
- **`root-without-dr-provider.txt`:** the staging root with `aws.dr = aws.dr` removed is refused at validate.
- **`preflight-proof.txt`:** `scripts/ops/terraform-preflight-proof.mjs`, which runs the deploy preflight against the
  task definition the mocked apply renders.
- **Root contract:** `npx vitest run tests/ci/terraform-root-outputs.contract.test.ts` passes 34 of 34. With
  `aws.dr = aws.dr` deleted from the production root, it fails 1 of 34 ("passes it to the stack as aws.dr").

## Not done here

- **The staging `terraform plan`**, which the stage's acceptance asks for: three `aws_kms_replica_key` in the DR region
  and no change to a key in state. It needs AWS credentials and the founder's DR region, so it runs at MR-03 Stage 5.
  There is no state, so no key in state can change.
- **The DR region itself** (NEW-2). The apply cannot pick one silently: `dr_region` has no default.
- **Aliases in the DR region.** Not part of this stage.
  - The signer addresses the key by alias in its own region (`CONCEPT2CURE_SIGNER_KMS_REGION`), so failing over the
    signer needs one. That belongs with Stage 4's runbook and Stage 6.
