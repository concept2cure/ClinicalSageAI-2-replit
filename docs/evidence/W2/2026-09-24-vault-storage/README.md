# D1: vault documents outlive a task, 2026-09-24

**Launch row:** D1 hosted production (`docs/LAUNCH_DEFINITION_OF_DONE.md`).
**Lane:** W2 / D1 vault durable storage, claimed in `docs/work-orders/README.md`.
It covers that file's "→ W2 (D1)" findings from the vault re-baseline.

The vault holds a filing's source documents. Its rows in `vault.documents`
record each document's content hash, filename and storage version id. The bytes
live wherever `server/services/storage/` puts them. Before this work, a
production deployment had nowhere durable to put them. Each finding was verified
at HEAD before it was fixed, and each fix was shown failing first.

## What was wrong

| # | Defect | Effect |
|---|---|---|
| 1 | `s3-provider.ts` loaded the AWS SDK with `require()`. The server is an ESM bundle (`scripts/build-server.mjs`), where esbuild turns an external `require` into a shim that throws. The catch then reported the SDK as "not installed". | `STORAGE_PROVIDER=s3` threw in every deployed build. S3 could not be used at all. |
| 2 | An unrecognised `STORAGE_PROVIDER` fell through to local disk. | A typo meant ephemeral storage, and nothing said so. |
| 3 | `get`, `delete` and `getSignedUrl` found metadata by listing the whole bucket once: `MaxKeys: 1000`, no continuation. `list()` stopped at 1000 keys the same way. | After about 500 documents bucket-wide, later documents read as missing. S3 lists in lexical order, so other tenants' key names decided which ones. |
| 4 | That lookup returned `null` on any error. | An expired credential or a denied policy read as "no such document". |
| 5 | Production with `STORAGE_PROVIDER` unset served local disk, and every shipped target left it unset. | On Fargate the disk is deleted with the task; in compose, with the container. The rows would outlive the documents. |
| 6 | Neither the Terraform stack nor the deploy preflight provided or required a store. | No bucket, no task-role access, no `STORAGE_PROVIDER` in the task definition. |
| 7 | docker-compose mounted no volume for `storage/`, and the image never created it for its non-root user. | Local-disk vault bytes were lost on container recreation, and a mounted volume would have been unwritable. |

## The change

| # | Fix | Where |
|---|---|---|
| 1 | Static ESM imports. `build-server.mjs` exports `SERVER_BUILD_OPTIONS`, so a test can build the way production does. The `check-commonjs-require` baseline shrinks from 15 occurrences to 12. | `server/services/storage/{s3-provider,index}.ts`, `scripts/build-server.mjs` |
| 2 | `resolveStorageProviderName` refuses an unimplemented value by name. | `server/services/storage/provider-name.ts` |
| 3, 4 | `put` writes a per-version index object last, so a read is one GET. Older objects are found by listing the org's own prefix, following continuation tokens. `null` means only "not found"; every other failure propagates. Version ids that are not uuid-shaped are refused. | `s3-provider.ts` |
| 5 | Boot posture: production must set `STORAGE_PROVIDER`. `s3` needs a bucket. `local` needs `STORAGE_ACCEPT_LOCAL_DISK=true`, the operator's statement that `storage/` is durable. It fires on import from `server/config/environment.ts`. | `server/services/storage/storage-posture.ts` |
| 6 | `terraform/stack/vault_storage.tf` creates a bucket per environment (`c2c-prod-vault`, `c2c-stg-vault`). It is private, versioned and SSE-encrypted, refuses non-TLS requests, and its policy allows only the task role to list the bucket and get, put and delete objects. Both containers get `STORAGE_PROVIDER=s3`, `AWS_S3_BUCKET` and `AWS_REGION`. The preflight requires both names, and on Fargate accepts only the value `s3`. | `terraform/stack/{vault_storage,main,outputs}.tf`, `.github/workflows/deploy-aws.yml` |
| 7 | A `vaultdata` volume at `/app/storage` in both compose stacks, with local accepted because the volume is real. The image creates `/app/storage/vault` before its `chown`. The CI boot smoke states local "proves boot, not durability". | `docker-compose{,.beta}.yml`, `Dockerfile.optimized`, `.github/workflows/ci.yml` |

## Shown failing first

| Check | Red | Green |
|---|---|---|
| `storage-provider-production-bundle.test.ts`: the storage module is built with the production options and selected in plain Node (vitest supplies a working `require`, so it cannot show #1) | 2/4: `S3StorageProvider: @aws-sdk/client-s3…`; `gcs` → `'local'` (`red/R1`) | 4/4 (`green/R1`) |
| `s3-provider-lookup.test.ts`, against a fake that follows S3's paging contract | 6/7: missing behind 1,200 foreign keys; the 1,200th missing; `list` 500 of 700; `delete` false; `''` prefix; AccessDenied → `null` (`red/R2`) | 7/7 (`green/R2`) |
| `storage-posture.test.ts`, which imports the real `environment.ts` in a production process | "expected 'LOADED' to match /REFUSED: .*STORAGE_PROVIDER/" before wiring (`red/R3`) | 7/7 (`green/R3`) |
| `terraform test` on `terraform/stack`, whose preflight names come from `deploy-aws.yml` | 15/17: API, worker and staging lack a required name (`red/R4-terraform.txt`) | 19/19 at HEAD, which includes the vault run and the deploy-role run another lane added the same hour (`green/R4-terraform.txt`) |

Six mutants of the new Terraform run (`mutants/`). Each one fails exactly one run:

| Mutant | Fails |
|---|---|
| V1: no `s3:DeleteObject` | the vault run |
| V2: versioning suspended | the vault run |
| V3: `restrict_public_buckets = false` | the vault run |
| V4: `STORAGE_PROVIDER=local` in the task | the vault run |
| V5: the TLS deny inverted | the vault run |
| V6: staging names production's bucket | `staging_is_distinct_from_production` |

The pipeline's own preflight shell, extracted byte for byte from `deploy-aws.yml`
and run with `aws` stubbed (`scripts/ops/terraform-preflight-proof.mjs`),
accepts the rendered production task definition. Every one of that script's
checks holds (`preflight/accepted-rendered-td.txt`). Fed the same task
definition with one storage fact changed, it refuses each:

| Task definition | Preflight |
|---|---|
| `STORAGE_PROVIDER=local` | "STORAGE_PROVIDER must be exactly 's3' on ECS Fargate; got 'local'" (`preflight/refused-local.txt`) |
| no `AWS_S3_BUCKET` | "missing required production env: AWS_S3_BUCKET" (`preflight/refused-nobucket.txt`) |
| no `STORAGE_PROVIDER` | "missing required production env: STORAGE_PROVIDER" (`preflight/refused-noprovider.txt`) |

Terraform 1.9.8, `hashicorp/aws` 5.70.0 and `hashicorp/random` 3.6.3 came from
releases.hashicorp.com, each SHA-256-verified. They were served from a
filesystem mirror, because this environment's egress refuses
registry.terraform.io. Providers were mocked, and nothing was applied.

## Not done

- **Applying it.** Like the rest of D1, the bucket exists in code, not in an
  account.
- **Retention of noncurrent versions** is a records-retention decision. Nothing
  expires today.
- **A reader naming a provider mismatch.** A row stored under one provider and
  read under another fails closed: 409, "stored file could not be read", nothing
  served. It does not say which provider holds the bytes. A fresh S3
  deployment has no such rows. A local-to-S3 migration would need the
  backfill script in the image, and it is not there.
- **`/readyz` does not probe the bucket.** A task whose role cannot reach it
  reports ready and fails every upload. The upload refuses to record bytes it
  could not write, so nothing is falsified.
- **Compose stacks** already refused to boot before this change: neither sets
  `AI_SENSITIVE_DATA_POLICY_MODE` or `CONCEPT2CURE_SIGNER_MODE`. That is not
  this lane's to change.
