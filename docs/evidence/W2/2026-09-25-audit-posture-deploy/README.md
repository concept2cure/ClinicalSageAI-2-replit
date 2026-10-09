# The deploy ships the Part 11 audit posture, and refuses production overrides

**Row:** D1 (hosted production), with D5 and D6. **Workstream:** W2.
**Session:** `…01AiwZKG`. **Date:** 2026-09-25. **Source:** the 2026-09-24
security plan (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`)
P0-9 ("the Terraform/preflight flags are W2's") and P0-13 ("preflight half is
W2's").

## What was open

- **P0-9, the audit posture.** The tamper-proof audit trail and its
  chain-integrity monitor run only with `AUDIT_TRAIL_ENABLED=true`. Production
  boots without it and only warns: "the tamper-proof audit interceptor is NOT
  recording mutations". `AUDIT_REQUIRE_ENFORCE=true` turns a missing trail, a
  failed immutability probe or a disabled daily sweep into a boot refusal
  (`server/startup/audit-enforcement.ts`). `terraform/stack` set neither, and
  the deploy preflight required neither.
- **P0-13, override flags.** Every `*_ACCEPT_*` variable switches a production
  refusal off: `AUDIT_SEAL_ACCEPT_UNSEALED`, `AI_GOVERNANCE_ACCEPT_PERMISSIVE`,
  `STORAGE_ACCEPT_LOCAL_DISK` and `CONCEPT2CURE_SIGNER_ACCEPT_HMAC`. Nothing
  stopped a task definition from carrying one.

## The change

- **`terraform/stack/main.tf`.** `boot_environment` sets both audit flags to
  `true`, for the API and the worker.
- **`deploy-aws.yml`, the preflight step.**
  - It requires both names, and each must be exactly `true`.
  - It refuses a task definition that carries any `*_ACCEPT_*` name, as a
    value or a secret, set to anything. This stack needs none: KMS signer, S3
    vault, sealed chain.
  - Its missing-variable message no longer claims the app refuses to boot
    without these two. It boots, with the trail off or its checks advisory,
    which is why the preflight checks for them.
- **`ci.yml`, Production Boot Smoke.** The job boots with both flags, so CI
  boots the posture production ships. Without them it boots a posture
  production never runs.

## Proof

| Check | Result |
|---|---|
| Baseline: `scripts/ops/terraform-preflight-proof.mjs` on trunk | every check holds (21 Terraform tests) |
| Red: the preflight requires the two names, Terraform does not set them | `terraform test` fails 3 assertions: the API, the worker and staging are each "missing a variable the deploy preflight requires" (`red-terraform-lacks-the-flags.txt`) |
| Green: with the Terraform change | every check holds: `terraform test` 21/21, and the preflight's own shell accepts the rendered task definition (`green-proof.txt`) |
| The preflight step on the rendered task definition, mutated | refused all four: `AUDIT_SEAL_ACCEPT_UNSEALED=true` (the plan's acceptance case), `STORAGE_ACCEPT_LOCAL_DISK` as a secret, `AUDIT_TRAIL_ENABLED=false`, and `AUDIT_REQUIRE_ENFORCE` absent (`red-preflight-refusals.txt`) |
| The production bundle boots in that posture | `/readyz` 200 in 8 s, with the tamper-proof middleware enabled, 8/8 immutability triggers present and enabled, and the integrity sweep scheduled. The baseline boots too and warns that the interceptor is not recording. With `AUDIT_REQUIRE_ENFORCE=true` and the trail off, the process refuses to start (`boot.txt`) |

The boot ran on TLS Postgres 16 with the non-superuser runtime role and
`RLS_ENFORCE=on`. The database was built from blank by `install-fresh` and
`deploy-migrate`, with the CI boot smoke's environment otherwise.

A database whose audit rows were written by test suites under other HMAC keys
refused to boot at the security self-test ("Signature invalid at sequence 1").
That is the self-test working. It is why the boot check uses a clean database.

Also: `ci:workflow-targets`, `ci:required-workflow-concurrency` and
`deploy-migration-mechanism.contract.test.ts` (325/325) are OK, and
`terraform fmt` is clean.

## Not done here

- **The plan rows' other halves**, owned elsewhere: P0-9's "application half"
  and P0-13's boot refusal are closed by the D6 session. P0-16's
  `if: always()` and P0-15 (task-role S3 write on the frontend bucket,
  CloudFront response headers) are other W2 items.
- **A deployment outside `terraform/stack`** that sets these by hand is
  checked by the same preflight, so it cannot roll without them.
