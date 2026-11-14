# Concept2Cure deployment: Railway beta assessment

Assessed **2026-11-14**, against canonical source `3692f44ad` and the existing F1 deployment contract.
This is an operator runbook and feasibility assessment. No Railway resources, DNS, paid subscriptions,
customer data transfers or AWS policies were created or changed in this work. The AWS launch acceptance
rows and existing release/model qualification gates remain unchanged.

**Recommendation:** Railway can host beta application and supporting compute, using the existing production
image. Retain AWS S3/KMS for governed documents, submission bundles, audit anchors and signing. A completely
Railway-native replacement does **not** currently preserve the existing storage contract. The founder confirmed
the beta data class on **2026-11-14: confidential sponsor documents without patient identifiers**. This replaces
the earlier synthetic/de-identified planning assumption. Pro remains the proposed compute plan, subject to the
sponsor's confidentiality, residency and vendor-contract requirements. Confidentiality alone does not make a
BAA a prerequisite in this plan; actual PHI would require a separate scope/contract review and an executed BAA
where applicable before upload. Confirm the uploaded corpus matches the agreed data boundary.

The founder reports successful OpenAI-key drafting in Codespaces. That is user-attested functional evidence;
it does not transfer credentials to Railway or establish formal model PQ, end-to-end Railway operation,
regulatory validation or agency acceptance.

## What already exists

| Existing home | Current responsibility and remaining boundary |
| --- | --- |
| `Dockerfile.optimized` | Pinned Node22 production image, nonroot app, React build, document/PDF/OCR/Python tools, migrations and direct Node entrypoint. Select it explicitly; Railway's default filename detection will not select it automatically. |
| `docker-compose.beta.yml` | App, PostgreSQL/pgvector, Redis, ClamAV, embeddings and one-off provisioner. A topology reference, **not** a ready hosted import: its local-disk/HMAC acceptance settings are refused on hosted deployments. |
| `scripts/db/provision.mjs` and `scripts/db/deploy-migrate.mjs` | Initial owner-only provisioning and later owner-only migrations; runtime-role grants/readiness verified. Recurring migration alone cannot bootstrap an empty database. |
| `server/db/ssl.ts`, `server/startup/env.ts` | Verified remote DB TLS and hosted owner-credential/override refusal. Railway project/environment markers join the existing hosted boundary, with no weaker beta exception. |
| `server/startup/readyz.ts`, `shutdown.ts` | Dependency readiness and SIGTERM draining. Railway needs nonzero termination grace and ongoing monitoring. |
| `server/services/storage/{provider-name,s3-client}.ts` | Local/AWS S3 selection; AWS region/default credential chain, without a custom endpoint. Railway S3 compatibility alone is not a drop-in storage replacement. |
| `terraform/stack/{vault_storage,release_signing}.tf`, `server/services/audit/chain-anchor.ts` | AWS versioning, Object Lock, KMS and anchors. Existing ECS identity policies do not automatically authorize Railway. |
| `.github/workflows/deploy-aws.yml`, `docs/operations/{DEPLOYMENT,DB_READINESS}.md` | Current AWS image promotion, DB lifecycle and release controls; remain canonical for AWS. |

Searches covered Railway/Railpack/Nixpacks/Procfile aliases, deployment/provider mounts and full deletion
history. No Railway-specific implementation/configuration was found. Deleted Vercel, Replit and Celery
deployment scripts are not replacements for the live image. This existing guide replaces its obsolete
Vercel/generic Railway recipe; no second application stack or deployment workflow is introduced.

## Target beta topology

| Component | Placement and initial posture |
| --- | --- |
| Application | One always-on Railway service from the verified production image: frontend, API, AnA SSE and existing background execution. No separate Vite frontend or retired Python/Celery service. |
| PostgreSQL + pgvector/pgaudit | Private endpoint, durable storage/backups, verified TLS, distinct owner/runtime roles and statement auditing. Railway suitability remains a deployment proof; retain compatible external managed PostgreSQL if it cannot meet this contract. |
| Redis | Private, authenticated, with appropriate queue durability. PostgreSQL already stores shared sessions; omitting Redis still disables existing automation. |
| ClamAV | Private only, existing pinned image/configuration; never expose port 3310. Persist signatures and allow startup/reload memory. |
| Embeddings | Private existing pinned TEI CPU image and BAAI/bge-m3 model; persist cache. Preserve tenant provider-placement elections. |
| Provision/migration job | Separate privileged execution using the existing provision image/commands; never owner variables in the web service. Promotion depends on recorded success. |
| Governed bytes/anchors/signing | Existing AWS buckets, versioning/Object Lock/retention and KMS; configure the separate submission-bundle store too. |
| Email/model providers | Existing SMTP and approved provider integrations; securely supplied credentials, tenant authorization and pinned/PQ gates unchanged. |

Only the app receives a public HTTPS domain. Private networking reduces exposure/egress but does not replace
verified DB TLS. Select a region for residency and latency to AWS. Start with one app replica and disable
serverless sleeping for schedules/background execution. Worker tenant/process quotas are process-local
(`shared/ana/run-control-limits.ts`); cross-instance durable controls and DB advisory locks do not establish
distributed quota enforcement or a safe multi-replica configuration.

Railway buckets are encrypted at rest, but their S3 API lacks object versioning, Object Lock and requested
server-side encryption controls; automatic bucket backups are also absent. Existing AWS custody therefore
remains on AWS. See [bucket capabilities](https://docs.railway.com/storage-buckets). Changing bucket names or
injecting a Railway endpoint into an AWS credential preset cannot satisfy these requirements.

## Expected cost and plan

[Resource pricing](https://docs.railway.com/pricing) currently lists RAM **$10/GB-month**, CPU
**$20/vCPU-month**, service egress **$0.05/GB** and volumes **$0.15/GB-month**. The
[Pro plan](https://docs.railway.com/pricing/plans) has a **$20 monthly minimum credited toward usage**.
These estimates use total time-averaged consumption across **all** services, not configured limits:

`Railway/month = max($20, $10 × average RAM GB + $20 × average vCPU + $0.15 × volume GB + $0.05 × egress GB)`

| Planning scenario, not a benchmark | Avg RAM / CPU | Volume / monthly service egress | Railway estimate |
| --- | --- | --- | --- |
| Lightly used full stack | 6GB / 0.5 vCPU | 40GB / 50GB | **$78.50/month** |
| Active early beta | 10GB / 1.5 vCPU | 80GB / 100GB | **$147/month** |
| More concurrent drafting/OCR | 16GB / 3 vCPU | 160GB / 250GB | **$256.50/month** |

These are assumptions, not measured production utilization or a quote. Existing Compose guidance estimates
ClamAV near 1.3GB steady (roughly twice during reload) and embeddings near 3GB, recommending a 16GB/4vCPU host
for the stack. Leave headroom for document conversion and DB peaks; a 6GB average is not a 6GB safe memory cap.
Free/trial capacity is unsuitable. **Pro is also the functional minimum for the current email login:**
[outbound SMTP is blocked below Pro](https://docs.railway.com/networking/outbound-networking). Verify delivery
after deployment/upgrade; credentials alone do not prove login. Pro static outbound IPs can support partner
allowlists where needed.

**Excluded:** model tokens/client-owned keys, AWS storage/KMS/requests and cross-cloud traffic, SMTP,
backup/PITR/add-on charges, monitoring, staging, taxes and BAA/compliance commitments. A second always-on stack
increases cost. Measure per-service RAM/CPU/egress and AWS charges over a representative week, then revise.
Set budget alerts; an automatic hard cutoff could abruptly stop a filing run. Railway reduces initial
operations work; lower cost than equivalent AWS capacity remains unproven without measured usage.

## Concrete deployment sequence

### 1. Select release and data boundary

Use only `concept2cure-v2` from `concept2cure/ClinicalSageAI-2-replit`. Record immutable SHA, successful normal
CI/typecheck/release receipts and image digest. Prefer the verified production image from the existing registry;
alternatively build the same Dockerfile after gates pass. Disable ungated auto-deploys from every canonical push.
Retain the release image in the existing registry: Railway Pro retains removed images for 120 hours, not forever.
The current AWS pipeline publishes to private ECR. Railway supports private registry pulls on Pro, but ECR pull
passwords expire after 12 hours. Provide a fresh scoped pull token and prove its renewal for later redeploys/
rollbacks; retaining an image does not keep an expired pull credential valid. If no authorized renewal mechanism
is available, use the verified source-build alternative. See [private registries](https://docs.railway.com/builds/private-registries).

For the confirmed confidential sponsor beta, complete the following before sponsor documents are uploaded:

- Establish appropriate confidentiality/processor terms, including a DPA where applicable, permitted vendor
  support access and incident handling. Confirm the sponsor accepts Railway and the actual model providers.
- Record allowed regions for compute, database, retained AWS stores, backups and provider processing; verify
  the actual configuration meets those terms. Select retention/export/deletion periods consistent with the
  project's immutable-record obligations, including backups and expired user access.
- Restrict Railway/GitHub/AWS administration to named operators with MFA and least privilege. Keep beta
  credentials/data separate from development; use existing application MFA, tenant boundaries and audited
  client-vault access. A shared provider key is not tenant authorization.
- Verify model-provider placement, retention and training-use terms for this sponsor's content. The successful
  OpenAI-key drafting run proves functionality, not permission to disclose a sponsor's documents to a provider.
- Test that logs, traces, error reports and support exports exclude document bodies, sensitive prompts and
  secrets; retain necessary audit metadata under the project's access and retention policy.
  Required database audit can contain SQL statements and sponsor data: restrict its collection, access and
  durable retention rather than deleting required audit evidence to achieve routine-log redaction.

[Railway compliance](https://docs.railway.com/enterprise/compliance) describes shared responsibility, DPA and
the separate BAA add-on. Do not infer either an Enterprise requirement or blanket legal suitability solely from
the label "confidential". SOC2 certification does not qualify this application's regulated workflows. The cost
scenarios above remain unchanged; contractual/add-on needs can change the eventual quoted cost.

### 2. Build existing artifacts

For a source build set `RAILWAY_DOCKERFILE_PATH=Dockerfile.optimized`; the final stage is already `production`.
Supply `BUILD_COMMIT` as the verified SHA; its build argument already exists. Verify the app version reports
that exact SHA rather than `unknown` (the context excludes `.git`). Keep the image's Node runtime/entrypoint.
See [Dockerfile build variables](https://docs.railway.com/builds/dockerfiles).

Build the privileged **existing** `provision` target from the same SHA in the authorized release environment:

```bash
git rev-parse HEAD
docker build -f Dockerfile.optimized --target production --build-arg BUILD_COMMIT=<verified-sha> -t <registry>/concept2cure:<verified-sha> .
docker build -f Dockerfile.optimized --target provision --build-arg BUILD_COMMIT=<verified-sha> -t <registry>/concept2cure-provision:<verified-sha> .
```

Publish through the existing authorized registry process and select verified digests. Examples have not been
executed for Railway. No new Dockerfile/CI workflow or owner secret in a build argument is required.

### 3. Prove database suitability; provision separately

Prove vector availability, owner CREATE ROLE/EXTENSION privileges, verified TLS hostname/CA, restore and
statement auditing before promoting the app. The current official template source includes pgvector/pgaudit:
[Dockerfile16 at 09ff77d](https://github.com/railwayapp-templates/postgres-ssl/blob/09ff77dca25f9af407827b9f27c7de9c5c660790/Dockerfile.16).
That is source evidence, not proof of the deployed image digest or enabled settings. Its
[TLS initializer](https://github.com/railwayapp-templates/postgres-ssl/blob/09ff77dca25f9af407827b9f27c7de9c5c660790/init-ssl.sh)
generates a CA and includes the private domain when present at initialization. Export/distribute only the
**public CA** to both provisioner and app, verify the exact hostname, and rehearse renewal/restore CA changes.
The existing RDS trust bundle alone is insufficient. Never disable certificate verification to force readiness.

Keep `DB_AUDIT_REQUIRED=pgaudit` and configure the required `write,ddl` recording classes; preload alone records
nothing. Preserve actual verification in `scripts/db/database-audit.mjs` and `deploy-migrate.mjs`. Prove an
owner-side SQL write creates an externally retained DB audit record: the application's chained trail cannot
capture a bypassing owner's SQL. Railway [logs](https://docs.railway.com/observability/logs) have finite retention
and rate limits, so Log Explorer alone is not perpetual audit retention. Enable a durable collection/export
path and verify it; this assessment does not implement one.

Railway [database responsibility](https://docs.railway.com/databases) excludes engine alterations through SQL
(roles/settings/extensions) from template engine support. Our required app-role/audit setup makes engine
management our responsibility while platform support remains. Enable and rehearse backups/PITR/HA explicitly;
do not assume RDS-equivalent managed guarantees or a database SLA.

Initial provisioning uses `node scripts/db/provision.mjs` in the separate job with `DATABASE_OWNER_URL`,
`APP_DATABASE_URL` and `APP_SERVICE_DB_PASSWORD` scoped **only** to that execution. It installs schema,
migrations and runtime-role grants and verifies readiness as that role. Later releases run
`node scripts/db/deploy-migrate.mjs` as owner there, with the runtime grant target configured. See
[DB readiness](../operations/DB_READINESS.md) for exact failure codes and assertions.

Railway [pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command) share their service's
variables, run privately in a separate container, and cannot use mounted volumes or persist filesystem changes.
Do **not** put owner credentials on the app to run migrations there. Use separate controlled privileged
execution, no restart loop after successful completion, and explicit app-promotion dependency on its zero exit.
A CA mounted only on the app will not reach a pre-deploy container.

The app receives only `APP_DATABASE_URL` for nonowner `app_service`, with NOSUPERUSER/NOBYPASSRLS and required
grants. Never inject the DB template's automatic owner `DATABASE_URL`, nor put owner credentials in shared
variables inherited by the app. Provide this DB's public CA through its actual trust path, including
`PGSSLROOTCERT`/`NODE_EXTRA_CA_CERTS` where used.

### 4. Configure dependencies and secrets

Translate existing Compose service pins, private DNS, ports, memory and volumes explicitly: its dependency,
security and mount settings are not automatically equivalent on Railway. Wait for DB, scanner and embedding
warmup; never publish their raw TCP services. Configure authenticated Redis and prove queue recovery.

Use restricted/sealed variables for platform bootstrap secrets, never `VITE_*` or repository content. The
runtime can read injected secrets; sealing does not replace access control. Client-owned provider/connector
credentials belong in existing tenant administration/vault flows with encryption, authorization and audit,
not shared platform variables. Never copy them into this runbook or logs.

Reconcile these groups against actual startup validators and the existing AWS preflight:

| Group | Existing settings/acceptance |
| --- | --- |
| Runtime/origin | `NODE_ENV=production`, Railway `PORT`, HTTPS `APP_URL` and exact `ALLOWED_ORIGINS`, measured `TRUST_PROXY_HOPS`, `MCP_PUBLIC_URL` if enabled. App binds 0.0.0.0; verify secure cookies and foreign-origin rejection. |
| DB/queues/scan/search | `APP_DATABASE_URL`, `RLS_ENFORCE=on`, `DB_AUDIT_REQUIRED=pgaudit`, `REDIS_URL`, `CLAMAV_HOST`/`CLAMAV_PORT`, `EMBEDDING_PROVIDER=local`, private `EMBEDDING_LOCAL_BASE_URL`. |
| Authentication | Distinct strong `SESSION_SECRET`, `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `MFA_ENCRYPTION_KEY`; one-time `SETUP_TOKEN`, real SMTP and successful emailed-code login. No public demo user/dev-login flags. |
| Audit/connectors | Existing distinct `AUDIT_HMAC_KEY`, `AUDIT_HMAC_SECRET`, `AUDIT_EXPORT_SIGNING_KEY`, `AUDIT_ATTESTATION_KEY`, `CONNECTOR_ENCRYPTION_KEY`; audit trail/enforcement enabled. Preserve validated key formats and rotation. |
| Custody/signing | `STORAGE_PROVIDER=s3`, `AWS_REGION`, `AWS_S3_BUCKET`, **separate** `SUBMISSION_BUNDLE_S3_BUCKET`, `AUDIT_ANCHOR_BUCKET`, `CONCEPT2CURE_SIGNER_MODE=kms` and actual KMS key/region. No truthy `*_ACCEPT_*` overrides. |
| AI | Chosen provider credentials, actual approved/pinned routes, `AI_SENSITIVE_DATA_POLICY_MODE=enforce`, placement approvals and tenant elections. A working key does not bypass high-risk PQ. Historical Compose comments do not establish a universal Anthropic requirement. |

Explicitly authorize a least-privilege non-ECS AWS identity for actual bucket prefixes, signing/anchor keys
and tenant-selected KMS encryption contexts. Verify renewal/rotation, checksum/conditional writes, object
versions/retention, KMS sign/verify and data-key decryption. Bucket names alone cannot grant access. Never
put AWS administrator credentials in the app or expose signing/decryption authority to unrelated services.

### 5. Configure serving, readiness and safe replacement

Keep direct `node dist/index.js` and Railway's injected `PORT`. Use **`/readyz`** as deployment healthcheck
with enough startup allowance for dependencies (default 300s); keep `/healthz` for liveness. Use existing
authenticated readiness details without exposing secrets. Missing provider/scanner/schema is an unresolved
dependency, not a reason to substitute a shallow healthcheck.

Railway [healthchecks](https://docs.railway.com/deployments/healthchecks) run during deployment, not continuously.
Monitor HTTPS/readiness, SMTP, queues, DB, audit-anchor age and errors after promotion. Keep governed bytes off
the app filesystem: an attached volume causes replacement downtime and prevents simultaneous mounts.

Set `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=30` initially, then measure. Default grace is zero; existing shutdown
has bounded stages plus dependency closes without a global bound. Existing ECS uses 60s. Verify actual SIGTERM,
in-flight tools and queues, and adjust grace/overlap from evidence. Shutdown records owned AnA runs stopped as
`server_shutdown`; it does not transfer active model execution to another instance. See
[teardown](https://docs.railway.com/deployments/deployment-teardown) and
[variables](https://docs.railway.com/variables/reference).

Railway HTTP has a 15-minute maximum request duration, 5-minute idle limit and5minute upload-body limit. AnA's
15-second heartbeat addresses idle limits, not the total limit. Existing `useAnaChat.ts` follows durable runs
after stream loss; exercise a real long draft through the public endpoint and prove reconnect/polling,
progress/audit continuity, no duplicate tools and retained output. Exercise maximum allowed uploads over
realistic connections. If platform limits conflict, retain compatible ingress/runtime or finish the existing
reconnect path; do not silently shorten work. See [network limits](https://docs.railway.com/networking/public-networking/specs-and-limits).

### 6. Execute acceptance before beta traffic

These checks are **pending Railway execution**, not completed by this assessment:

- Record exact image/source; `/readyz` succeeds with required dependencies and no owner credentials or policy
  overrides on the app. Demonstrate expected refusal in an isolated candidate configuration.
- Initialize the administrator securely, remove bootstrap access, complete SMTP MFA, restart and confirm
  shared sessions, origin/CSRF and tenant isolation. Never enable production dev-login for acceptance.
- Upload a clean document and scanner refusal, retain lineage, draft with the actual approved provider/client
  credential path, observe Anna/team progress and reconnect, recover saved output after restart.
- Perform PDF/XML/artifact round trips, verify hashes, audit anchors/retention, tenant-key access/rotation and
  submission-bundle read-back. These prove packaging/custody, not agency acceptance.
- Prove scheduled jobs, safe deployment drain, backup restoration into an isolated DB and a pinned previous
  image against the schema. Capture timings, costs, failures and exact revisions without secrets.

Keep failed candidates unpromoted. Roll back images only with schema compatibility established; do not blindly
reverse replayed migrations or discard records. Retain release images and independently controlled backups/
receipts according to retention policy. Record recovery point/time from an actual restore; a snapshot alone
does not prove recovery. Complete beta operation on Railway compute remains conditional on the TLS/audit/
streaming proofs above, with AWS custody retained; use compatible external PostgreSQL if needed.

## Transition to AWS

Keep the same image, schema/migrations, pinned models, tenant keys, object keys/versions, hashes and audit
receipts. The later move primarily changes compute/network identity and, if Railway hosts them, PostgreSQL/
Redis. Rehearse export/restore or supported replication, compare rows/schema/grants/audit heads and object
references, drain writes/queues at cutover, prevent independent concurrent writers and reconcile acknowledged
work before switching. Define a timed rollback boundary. Retaining AWS custody avoids rewriting evidence into
a second storage format.

Use the existing AWS staging/promotion/rollback pipeline. Remove Railway identities/secrets only after
verified recovery and retention requirements. Railway feasibility, a Codespace demo and a published commit
are distinct from AWS production or clinical release acceptance.
