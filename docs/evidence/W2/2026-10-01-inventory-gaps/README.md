# D1 — the remaining curable gaps from the external-requirements inventory

**Row:** D1 (commercially deployed), `docs/LAUNCH_DEFINITION_OF_DONE.md`.
**Date:** 2026-10-01. Claimed before the change (work-orders register).
**Found by:** the founder's external-requirements inventory (licences, accounts,
keys and hosting).

Founder decisions are not made here: Redis and the worker (B6+B7), WAF, the
PDF/A rule, and whose FDA ESG account transmits.

## 1. Tenant-export attestations could not be signed in production

`server/services/tenant-export/attestation-report.service.ts` signs the
attestation a departing tenant's export carries with `AUDIT_ATTESTATION_KEY`
(at least 32 characters). Below that it throws `AttestationKeyMissingError`.
**No deploy path provided the key:** not Terraform, the deploy preflight,
either Compose stack, or `deploy-prod.sh`. The server boots without it, so the
first sign of the gap would have been a client's offboarding failing.

**The change**

- **The deploy preflight** (`deploy-aws.yml`) names the key. Three checks
  already read that list, so naming it there makes each require it:
  - `terraform/stack/tests/boot_contract.tftest.hcl`, for the API, the worker
    and staging;
  - `scripts/ci/check-compose-boot-contract.mjs`;
  - `terraform-preflight-proof.mjs`.
- **`terraform/stack`:**
  - `var.audit_attestation_key` (sensitive, at least 32 characters);
  - its Secrets Manager entry;
  - the `AUDIT_ATTESTATION_KEY` boot secret in both containers;
  - a plan-time precondition that it differs from the JWT secret, both audit
    HMAC keys and the export key.
- **Both environment roots** declare it and pass it on. Their tfvars examples
  say how to mint it.
- **Both Compose stacks** require it (`:?`), and `.env.beta.example` documents
  it.

| File                                     | Shows                                                                                                                                                |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `red/attestation-key-terraform-test.txt` | The preflight names the key and nothing provides it yet. **2 runs fail:** the API and worker containers miss it, and so does staging.                |
| `red/attestation-key-compose.txt`        | The Compose check on the same state: both stacks lack it.                                                                                            |
| `red/attestation-key-terraform.txt`      | The preflight proof on the same state: `terraform test` fails.                                                                                       |
| `green/terraform-test.txt`               | After the change: **35 of 35**. This includes a short key refused, and a key equal to the export key refused.                                        |
| `green/stack-preflight-proof.txt`        | `terraform-preflight-proof.mjs`: every check holds.                                                                                                  |
| `green/attestation-key-compose.txt`      | The Compose check passes. `docker compose config` resolves both stacks with every variable set, and stops naming `AUDIT_ATTESTATION_KEY` without it. |

## 2. An empty OpenAI key deployed

Vault search embeds with OpenAI by default. `var.openai_api_key` had no
validation, so an empty value planned, applied and booted, and the Vault
searched nothing. It must now be an OpenAI key: it starts `sk-`, and an
Anthropic `sk-ant-` key is refused.

- `red/openai-key-terraform-test.txt`: the new `refuses_an_empty_openai_key`
  run fails before the validation exists.
- `green/terraform-test.txt`: it passes after, alongside
  `refuses_an_anthropic_key_as_the_openai_key`.

## 3. Error reporting could not be configured through Terraform

`var.sentry_dsn` is optional (default empty) and must be an https DSN. When set,
it reaches both containers as `SENTRY_DSN`. When unset, the variable is absent,
not empty, so the server's own "recommended" warning still fires. Three runs
cover this: absent by default, present in both containers when set, and an
http DSN refused.

## 4. Production's example asked for a worker with no image

`terraform/environments/production/terraform.tfvars.example` now sets
`worker_desired_count = 0`, with the reason: `deploy-aws.yml` builds no worker
image, and every job runs in the API. Whether a worker exists at all stays the
founder's B6+B7.

## 5. The dead Replit deploy path is retired

These are removed:

- `.replit-ci.yml`, a GitLab CI file in a GitHub repository that nothing ran
  (SECURITY_AUDIT_2026-09-24 INF-28; remediation plan P3-6);
- `scripts/deploy-{dev,staging,prod}.sh`, which it drove.

Each script refused to run anywhere but a `main` branch. None exists:
`concept2cure-v2` is the only branch (Rule 0). Past that, each pushed to a
Replit remote that does not exist, and migrated with `db:push` instead of the
migration set. Keeping them meant every boot-contract change had a fourth place
to drift.

- **Replacement:** `.github/workflows/deploy-aws.yml`, proven against what
  Terraform renders by `scripts/ops/terraform-preflight-proof.mjs` in
  `terraform-tests.yml`. The single-server install, `docker-compose.yml`, is
  held to the same contract by `ci:compose-boot-contract`.
- **Docs updated:** `docs/guides/REPLIT_README.md`, whose branch-protection
  section also contradicted Rule 0, and `.env.example`'s list of deploy targets.
- **Left for P3-6:** `app.yaml`, `charts/` and the Replit README itself.

## 6. Stale and wrong documents, and dead files

| File                                                             | Was                                                                                                                       | Now                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/GA_OPS_PROCUREMENT_RUNBOOK_2026-08.md`                     | Named a `claude/*` branch. Its B1, B2, B7, B13, B15, B17 and B18 rows described August.                                   | A dated status block names what changed. Each change was checked against `ga-readiness-report.mjs` and the code on 2026-10-01; the live report wins.                                                                                |
| `docs/audits/ANA_DOCUMENT_STACK_DEPENDENCY_LICENSE_INVENTORY.md` | Did not mention Ghostscript, LibreOffice, Tesseract, OpenJDK or PyMuPDF. Listed veraPDF as GPLv3 only.                    | A section for the image as shipped, with each upstream licence. **Ghostscript is AGPL-3.0, and its SaaS use is an open counsel / Artifex item.** veraPDF is dual GPLv3+ / MPL-2.0+. PyMuPDF (AGPL) is recorded as not in the image. |
| `docs/validation/VQ-CORTEX-001-CLOUD_VENDOR_QUALIFICATION.md`    | Said the AWS BAA needs Business Support ($100/mo).                                                                        | A dated correction: the BAA is accepted in AWS Artifact on any account.                                                                                                                                                             |
| `terraform/terraform.tfvars.example` (deleted)                   | The README's staging step copied it. It names variables nothing declares (`eks_workloads_sg`, `evidence_bucket_name`, …). | Removed. The README points at each environment's own example, which lists every `TF_VAR_` secret.                                                                                                                                   |
| `fonts/DejaVuSans*.ttf` (deleted)                                | Three zero-byte files from the 2026-09-04 import. Nothing references them, and a font loader that found them would fail.  | Removed.                                                                                                                                                                                                                            |

**Not done here, and why:**

- **pgaudit preload.** Claimed meanwhile by the P1-11 database-half lane
  (`86e789d57`).
- **Redis and the worker, WAF, the PDF/A rule, and ESG ownership.** Founder
  decisions.
- **The DR rehearsal.** Needs a real database.
