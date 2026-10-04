# U3b — production carried no credential for any model approved to draft

Launch row: **D1** (hosted production; acceptance is `/readyz` 200 with `ana` ok).
Date: 2026-10-01. Branch: `concept2cure-v2`. Follows U3a (`u3a-ana-readiness.md`),
which made `/readyz` say so; this change supplies the credential.

## The defect

Every model in `server/services/ai-governance/approved-models.ts` marked
`approvedForHighRisk: true` is Anthropic. The stack passed `OPENAI_API_KEY`
and nothing else, so on the deployment as configured every Authoring draft is
refused with `no-approved-model`, and since U3a `/readyz` reports AnA as
`no_high_risk_model`. D1 cannot pass on that configuration.

## The decision (CPO mandate, 2026-10-01)

**Regulatory drafting runs on Anthropic first party.** This was decided here,
not deferred. The reasons:

- Only Anthropic models are approved for high-risk drafting. Changing that
  needs a PQ run, so it is not a configuration choice.
- Bedrock is not an option today. `@anthropic-ai/bedrock-sdk` is not a
  dependency (`package.json` has only `@anthropic-ai/sdk`), so the Bedrock
  provider's optional load returns null.
- The first-party entry is the one pinned to the version PQ targets.

This reverses the board row's earlier plan, recorded the same day, of "Bedrock
as the drafting provider (no stored key, AWS BAA)". Bedrock would need a new
dependency and would serve an older model than the one PQ targets. Both of
those are worse for a client than a stored key in Secrets Manager under the
Anthropic BAA. Bedrock remains a later option once its SDK and a PQ'd Bedrock
pin both exist.

What it commits the operator to:

- **`anthropic_api_key` is required.** It must be an `sk-ant-…` key, enforced
  by a variable validation.
- **`ai_provider_placement_approvals` must name `anthropic`.** Otherwise any
  draft that carries PII or PHI is refused per request on a deployment that
  reports ready. A `terraform_data.boot_contract` precondition enforces this.
- **The Anthropic BAA must be signed before PHI is drafted.** D6 already lists
  it as owed.

## The change

- **`.github/workflows/deploy-aws.yml`:** the preflight's required list now
  includes `ANTHROPIC_API_KEY`, and its refusal message says what a missing
  key breaks.
- **`terraform/stack/variables.tf`:** new sensitive `anthropic_api_key`,
  validated as `sk-ant-…`.
- **`terraform/stack/main.tf`:**
  - the key is stored as a Secrets Manager secret (`module.secrets`) and added
    to `boot_secrets`, so the API and worker containers carry it as a secret
    and never in plain environment;
  - a new precondition requires the placement approvals to name `anthropic`.
- **Both roots:** `variables.tf`, `main.tf` and the tfvars examples are updated
  the same way (`TF_VAR_anthropic_api_key`).
- **`terraform/stack/tests/boot_contract.tftest.hcl`:**
  - the input now includes the key, and the key is on the leak list;
  - three new runs: the key is in both containers' secrets and not in their
    environment; a non-Anthropic key is refused; placement approvals that omit
    `anthropic` are refused.

## Verified by making it fail

Every run below was against a scratch copy of the tree, using the local
provider mirror.

| Case | Result |
|---|---|
| Preflight requires `ANTHROPIC_API_KEY`, stack unchanged (before) | `Failure! 23 passed, 2 failed.` (`renders_the_boot_contract`, `staging_carries_every_name_the_deploy_preflight_requires`) |
| This change | `Success! 28 passed, 0 failed.` |
| Mutant: `ANTHROPIC_API_KEY` removed from `boot_secrets` | `Failure! 25 passed, 3 failed.` (the two above + `every_container_can_reach_the_drafting_provider`) |
| Mutant: placement-approvals precondition removed | `Failure! 27 passed, 1 failed.` (`refuses_placement_approvals_that_omit_the_drafting_provider`: Missing expected failure) |

Other checks:

- **`scripts/ops/terraform-preflight-proof.mjs --no-init`:** reports `every check
  holds`. The preflight step from deploy-aws.yml, run byte for byte against the
  rendered task definition, reports "Production boot contract satisfied".
- **`terraform validate`:** production and staging are both valid.
- **`trivy config --severity CRITICAL,HIGH terraform`:** exit 0, no findings.
- **`terraform fmt`:** applied to both roots' `module "stack"` blocks, which
  were already unformatted on trunk.

## What this does not show

No deployed `/readyz` read. That needs the real key in the production account
and a deploy, which is the operator's step D1 already names.
