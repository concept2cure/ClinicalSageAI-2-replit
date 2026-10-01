# P1-54, the deployed half: the self-hosted embedding lane, and R4

Launch row **D6**. Plan item P1-54 (`docs/security/REMEDIATION_AND_ENHANCEMENT_PLAN_2026-09-24.md`), ADR-0014
§1.5, residual R4 of the P1-45 review. The application half (R2, R3) is in `../P1-54-retrieval-honesty/`.

**Status: partial.** The lane is in the stack, wired into both task definitions and tested; R4 is closed. The lane
cannot yet serve the existing corpora: bge-m3 emits 1024 dimensions and every corpus is 1536 (or 3072). Per the
brief, the schema was not changed; the gap and the options are below.

## What was wrong

1. **No deployable embedding lane served an ordinary tenant.** Nothing in `terraform/stack` set
   `EMBEDDING_PROVIDER`, so the API and worker embedded through OpenAI, the seam's default. Since P1-45 the gateway
   refuses OpenAI embeddings for every organisation that has not elected OpenAI, and since P0-11 the stack holds no
   OpenAI key unless one has. Vault and knowledge-base search therefore ran for no unelected tenant, which is every
   tenant by default.
2. **Readiness reported such a deployment as ready (R4).** `server/startup/ana-readiness-state.ts` counted lanes
   without asking which organisations they serve. Two shapes reported `ready` in production while every unelected
   organisation was refused:
   - embeddings on OpenAI (the default lane): every Vault and knowledge-base search refused;
   - drafting only on Vertex (`claude-opus-4-vertex` is approved for high risk, but Vertex is an elected lane):
     every draft refused. This was found while writing the R4 tests.

## What changed

| Path | Change |
|---|---|
| `terraform/modules/embedding-service/` (new: `main.tf`, `variables.tf`, `outputs.tf`) | Fargate service in the stack's cluster and private subnets, `assign_public_ip = false`, no load balancer. Cloud Map private DNS namespace `<cluster>.internal` bound to the VPC; service `embeddings`, A records, ECS-reported health (`health_check_custom_config`). Security group: ingress on 8080 from the application tasks' group only; egress TCP 443 only (image registry, model hub, CloudWatch Logs), `#trivy:ignore:AWS-0104` with its reason. Execution role with `AmazonECSTaskExecutionRolePolicy` only, no task role, no secrets. Container: TEI `cpu-1.9.4` by digest, `MODEL_ID=BAAI/bge-m3`, `REVISION` when pinned, `PORT=8080`, `MAX_CLIENT_BATCH_SIZE=128` (the runtime sends up to 100; the server default is 32), `PAYLOAD_LIMIT=16000000`, `RAYON_NUM_THREADS` = vCPUs; `curl` health check on `/health` (curl is in the image: TEI v1.9.4 Dockerfile); `awslogs` to `/ecs/<cluster>/embeddings`, 90 days, CloudWatch's key, as the application log groups are. |
| `terraform/stack/main.tf` | `module "embeddings"`; `local.embedding_environment` (`EMBEDDING_PROVIDER=local`, `EMBEDDING_LOCAL_BASE_URL = module.embeddings.base_url`, i.e. `http://embeddings.<cluster>.internal:8080/v1`) appended to `api_environment` and `worker_environment`; `check "embedding_model_is_pinned"` (warns at plan while the model commit is unset). Nothing else in the file. |
| `terraform/stack/variables.tf` | New: `embedding_image` (default `ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4@sha256:2538ea1c…c78d`, digest-validated), `embedding_model_revision` (null or a 40-hex commit), `embedding_cpu` 4096, `embedding_memory` 16384, `embedding_desired_count` 2. All have defaults, so the environment roots need no change. |
| `terraform/stack/tests/boot_contract.tftest.hcl` | A mock ARN for `aws_service_discovery_service`; a shape-only `embedding_model_revision` in the suite's variables; nine runs (below). |
| `server/startup/ana-readiness-state.ts` | New states `needs_election` and `no_embedding_lane` (both fail readiness). Drafting coverage now also requires a model on a lane every organisation reaches; then the embedding lane is resolved through the seam's own `getEmbeddingProvider()` and checked with the gateway's own `providerElectionRefusal(kind, undefined)`. The ready detail names the lane (`; embeddings: local`). Banners for both states. The "by provider" listing is one helper shared with `no_high_risk_model`. |
| `server/startup/__tests__/ana-readiness.test.ts` | Two R4 blocks (embedding lane, drafting lane) on the real gateway and real seam, and two banner cases. |

The image is pulled from ghcr.io through the NAT: the repository's ECR module holds only its own images, and it
has no pull-through cache. The digest was resolved from the registry (`image/tei-cpu-1.9.4-digest.txt`).

## Confirmations asked for

### Does the local lane pass the placement decision for every tenant?

**For non-sensitive text, yes, unless the tenant's own policy excludes it. For PII/PHI, no, not as things stand.**
`probe/local-lane-placement.probe.test.ts` runs the real `AIGateway.authorizeEmbedding` with `provider: 'local'`
under production enforcement for eight tenant postures. Output: `probe/probe-output.txt`. Rerun:
`npx vitest run --config docs/evidence/D6/2026-10-01-tranche-4/P1-54-embedding-lane/probe/vitest.probe.config.ts`.

| Tenant posture | Non-sensitive | PHI, stack approvals (Anthropic only) | PHI, + `local` approved for `embedding`, `on_prem` |
|---|---|---|---|
| No placement policy (unelected) | ALLOWED | DENY_UNKNOWN_PROVIDER | ALLOWED |
| Residency `us` | ALLOWED | DENY_UNKNOWN_PROVIDER | **DENY_TENANT_POLICY** |
| Residency `eu` + zero retention | ALLOWED | DENY_UNKNOWN_PROVIDER | **DENY_TENANT_POLICY** |
| Residency `on_prem` | ALLOWED | DENY_UNKNOWN_PROVIDER | ALLOWED |
| `allowedProviders: ['anthropic']` | DENY_TENANT_POLICY | DENY_TENANT_POLICY | DENY_TENANT_POLICY |
| `allowedSubstrates: ['frontier_private']` | DENY_TENANT_POLICY | DENY_TENANT_POLICY | DENY_TENANT_POLICY |
| Policy lookup fails | DENY_TENANT_POLICY | DENY_TENANT_POLICY | DENY_TENANT_POLICY |
| No organisation bound | DENY_TENANT_POLICY | DENY_TENANT_POLICY | DENY_TENANT_POLICY |

The provider election itself never refuses `local` (it is in `PRODUCTION_DEFAULT_PROVIDERS`). The refusals come
from three other places (residuals 2 to 4). The last two rows are fail-closed and correct.

### Do the requested dimension and the corpus dimension agree?

**No.** bge-m3 emits 1024 dimensions. Every corpus the runtime writes is 1536, `document_vectors` is 3072, and the
runtime asks the embedder for the corpus dimension. Evidence: `dimensions/corpus-dimensions.txt` (live column types
from the migrated test database, `CORPUS_POLICY`, the request code).

- `vault.document_chunks.embedding vector(1536)`; the writer embeds as `text-embedding-3-small`, 64 texts a batch.
- Knowledge-base tables: `knowledge_entries`, `rag_chunks`, `lumen_data_atoms`, the memory and canon tables are
  `vector(1536)`. `cortex.atoms` holds 3072 and 1536 columns. The only 1024 column in the database is
  `ai.document_embeddings.embedding_1024`, which no corpus in `CORPUS_POLICY` uses.
- `EnhancedEmbeddingService.embed/embedBatch` send `dimensions: 1536` (or 3072). TEI v1.9.4 refuses a request for
  more dimensions than the model emits (422, "`dimensions` should be smaller than the maximum embedding
  dimension": `image/tei-v1.9.4-source-excerpts.txt`, `core/src/infer.rs`). It never pads.

So, with the stack as landed, every embedding through the lane is refused by the server. The failure is closed:
nothing is written into a 1536 column from another vector space, the call leaves a failure row on the ledger, and
chat reports the search as unavailable (R2). Options are in residual 1.

## Tests

| Test | Red (unchanged code) | Green |
|---|---|---|
| `terraform/stack/tests/boot_contract.tftest.hcl`, the nine new runs: both containers carry `EMBEDDING_PROVIDER=local` and the service's `EMBEDDING_LOCAL_BASE_URL`, as plain values; the service is in the private subnets only, no public IP, no load balancer, registered in a private namespace of this VPC, on Fargate in the stack's cluster; one ingress rule, the port, from the application tasks' group only; egress HTTPS only; image digest-pinned, serves `BAAI/bge-m3` on the port, batch limit at least the runtime's largest batch (read from `enhancedEmbeddingService.ts`), essential, curl health check; logs to its group in the region, retention read from `modules/ecs-fargate`, keyed as the app logs are; refuses an image by tag; refuses a branch as the model revision; warns while the revision is unset; passes a pinned revision through | `red/terraform-boot-contract.txt` (whole file: 43 existing pass, the first new run fails, the rest skipped); `red/terraform-new-runs-each.txt` (each new run alone against `git archive HEAD terraform`: 0 passed, 7 failed; then the two later runs: 0 passed, 2 failed) | `green/terraform-boot-contract.txt`: 52 passed, 0 failed (aws 5.100.0); `green/terraform-boot-contract-aws-5.70.txt`: 52 passed on the version production's lock pins, and both environment roots `terraform validate`; `green/terraform-boot-contract-final.txt`: 52 passed again on the shared tree after another lane changed `modules/compliance-evidence` |
| Mutation pass: nine regressions (public IP, public subnets, CIDR ingress, a second ingress rule, worker without the lane, API back on OpenAI, egress opened, shorter retention, server default batch limit) | — | `green/terraform-mutants.txt`: each caught, by exactly the run written for it |
| `server/startup/__tests__/ana-readiness.test.ts` | `red/ana-readiness.txt`: 8 failed, 24 passed. Production on the default OpenAI lane read `ready`; Vertex-only drafting read `ready`; a local lane with no address read `ready` | `green/ana-readiness.txt`: 32 passed |
| Neighbours: readiness, `/readyz`, embedding seam and election, placement gate, corpus policy, policy-refusal (14 files) | — | `green/neighbour-suites.txt`: 149 passed |

## Gates

`gates/`: `check:security-patterns` 0, `ci:server-error-leaks` 0, `ci:sign-ceremony` 0, `ci:unreferenced-modules` 0,
`ci:untracked-imports` 0, `ci:check-embedding-runtime` 0, `ci:trivyignore-hygiene` 0, `check-trivy-inline-ignores`
0 (tree and selftest; the new module is untracked until committed, so it was also checked with `--root`: its one
exception is attached). **`ci:launch-scope-api` exits 1** on `/api/tenant-config/:p/claude-connector` called from
`client/src/concept2cure/v2/surfaces/ClaudeConnectorSetting.tsx`, an untracked file of another lane's in-flight
connector work; this item touches no client file or route. ESLint on the changed TypeScript: 0 errors, 0 warnings,
HEAD the same (`green/eslint.txt`). Scoped tsc: no error in a changed file; the four it prints are the same four a
control run with no changed file prints (`green/tsc-scoped.txt`). `terraform fmt -check`: clean. No migration.

## What remains

1. **The dimension gap (blocks search through the lane).** Options, none taken here:
   - *Additive 1024 columns.* `vector(1024)` columns beside the 1536 ones (Vault chunks, knowledge entries, RAG
     chunks first), `CORPUS_POLICY` entries for bge-m3 at 1024, the writers and readers choosing the column by the
     lane, then a per-tenant re-embed (`revectorize-corpus.ts`: the planner exists, the live path is deferred). A
     migration under Rule 1: additive, `IF NOT EXISTS`. `ai.document_embeddings` already carries 1024/1536/3072
     side by side.
   - *Zero-pad to 1536 in the seam.* Padding with zeros leaves cosine and L2 distances between padded vectors
     unchanged, so no schema change. Valid only if every vector in a column comes from bge-m3 (a new deployment has
     none from OpenAI; any existing OpenAI vectors must be re-embedded), costs 50% more storage, and needs the corpus
     policy and the provenance column to name the model. Change: `embedding-provider.ts` (do not request more than
     the native dimension; pad), `embedding-corpus-policy.ts`.
   - *A 1536-dimension open-weight model instead.* For example a Qwen2-1.5B-based embedder (hidden size 1536; to
     be verified). That reverses ADR-0014 §1.5, so it is the founder's decision.
   - `document_vectors` (3072) is served by none of these.
2. **Sensitive text needs an approval for `local`** (founder's value, D1 brief B4). Without an entry in
   `ai_provider_placement_approvals` naming `local` with region `on_prem`, intended use `embedding`, classes
   `pii`/`phi` and zero retention, every PII or PHI chunk is refused (`DENY_UNKNOWN_PROVIDER`), and most regulatory
   documents carry PII. A plan-time precondition was not added: it is the founder's value, and it would fail every
   plan until decided. Suggested text, in `terraform_data.boot_contract`:
   `contains(try(jsondecode(var.ai_provider_placement_approvals)["local"].approvedIntendedUses, []), "embedding")`.
3. **Gateway defect (`gateway.ts`, not this item's file).** With that approval, a tenant with residency `us` or
   `eu` is still refused PII/PHI embedding through the in-VPC lane: `assertSensitiveDispatchAllowed` passes the
   tenant's residency as the region and `decideSensitivePlacement` compares it, as a string, with the approval's
   `on_prem`. A self-hosted placement satisfies any residency (`isPlacementCompliant`), and residency is already
   enforced for it by `requestPlacementDenial`. Exact change: when `placement.substrate === 'self_hosted'`, pass
   `region = placement.regions[0]` and `requiredRegion: undefined`. The probe's two bold cells then become ALLOWED.
4. **A tenant whose own lists omit the lane gets no search.** `allowedProviders` without `local`, or
   `allowedSubstrates` without `self_hosted`, refuses every embedding. That is the tenant's floor working as
   written, but it contradicts ADR-0014 §1.5 ("every tenant has search"). Product decision: have the policy writer
   add `local`, or exempt the in-VPC lane from the vendor list.
5. **The model commit is not pinned.** huggingface.co is not reachable from this session. Set
   `embedding_model_revision`'s default in `terraform/stack/variables.tf` to
   `curl -s https://huggingface.co/api/models/BAAI/bge-m3 | jq -r .sha`. Until then each plan warns.
6. **Pull path.** The image comes from ghcr.io and the weights from huggingface.co at every task start, over the
   NAT, so the lane depends on both being reachable. Better: an ECR repository (`module "ecr"` `repository_names`)
   holding an image with the weights at the pinned commit, built in `deploy-aws.yml`. Not this item's files.
7. **The deploy preflight** (`deploy-aws.yml`, another lane's file) should require `EMBEDDING_PROVIDER` and
   `EMBEDDING_LOCAL_BASE_URL` in its `for VAR in …` list, and `EMBEDDING_PROVIDER=local` by value. The boot
   contract test reads that list, and both names are already rendered, so it stays green.
8. **Provenance.** No `EMBEDDING_LOCAL_MODEL` is set (the brief allowed two entries), so the seam's default
   `bge-large-en-v1.5` (`embedding-provider.ts`) is the model named on a failure ledger row. Exact change: add
   `{ name = "EMBEDDING_LOCAL_MODEL", value = module.embeddings.model_id }` to `local.embedding_environment`. Also
   part of residual 1: the Vault writer records `text-embedding-3-small` in `vault.document_chunks.embedding_model`
   whatever the lane served.
9. **The hop is plain HTTP inside the VPC.** Document text crosses between tasks without TLS (the database hop uses
   `verify-full`). Options: ECS Service Connect with TLS (needs AWS Private CA), or an internal load balancer with
   an HTTPS listener and a private certificate. Neither exists in the stack yet.
10. **Readiness does not probe the lane's server.** It checks that the lane can be built and whom it serves, not
    that the server is up or answers in the corpus dimension: a boot-time verdict cannot wait for another service.
    With residual 1 open, `/readyz` reports ready while every embedding is refused by the server. A post-deploy
    smoke that embeds one text at the corpus dimension would catch it.
11. `outputs.tf` `resource_names` (the staging-distinctness check) does not list the new names. They derive from
    the cluster name, so they are distinct today. Not this item's file.
12. Running cost: two 4 vCPU / 16 GB Fargate tasks, continuously.

No `.terraform.lock.hcl` was left in the tree; every Terraform data directory was in the session scratchpad.

---

## Round 2 (2026-10-01): the decision in ADR-0014 §1.5, "Amended 2026-10-01"

**Status: done, with the residuals listed at the end.** The lane can now serve the corpora: the seam asks bge-m3
for its own 1024 values and zero-pads to the corpus width; the corpus policy names what each lane writes; the
gateway admits sensitive text through the in-VPC lane whatever the tenant's residency; readiness says ready only
after the lane has embedded one text at every corpus width; the stack refuses to plan without the decided
approval. Round 1's residuals 1, 2, 3, 8 and 10 are closed by this round. Evidence is under `round-2/`.

### What changed

| Path | Change |
|---|---|
| `server/services/ai-gateway/embeddings/embedding-provider.ts` | The self-hosted lane asks the server for the model's own width (`EMBEDDING_LOCAL_NATIVE_DIMENSIONS`, default the corpus policy's 1024; a value that is not a positive whole number is an `EmbeddingConfigurationError`) and zero-pads each vector to the width the caller asked for. It refuses, before the placement decision and before anything is sent, a model wider than the corpus (no truncation), and refuses an answer holding a vector that is not the model's width (another model behind the address) with a failure row on the ledger, rather than pad it. The OpenAI lane is unchanged. `EMBEDDING_LOCAL_MODEL` defaults to the policy's `BAAI/bge-m3` (was `bge-large-en-v1.5`, which the server does not serve and which the ledger named on every row). New `probeEmbeddingLane(provider)`: one short platform text, at each distinct corpus width (1536, 3072), through the same `embed()` path search uses (placement decision, ledger row), in the system scope, bounded to 10 s per call (`EMBEDDING_PROBE_TIMEOUT_MS`; the OpenAI SDK's own timeout is ten minutes with two retries, and boot awaits the probe). It checks one vector, exactly the corpus width, finite, not all zero, and, on the self-hosted lane, that the server names the policy's model. The reason it returns is ours, an HTTP status or "could not be reached": the upstream message, which can carry an internal address, goes to the server log only (`/readyz` is public). The width logic is in three small functions, so `embed()`'s complexity went from 15 to 13. |
| `server/services/embedding-corpus-policy.ts` | `SELF_HOSTED_EMBEDDING_MODEL = { model: 'BAAI/bge-m3', nativeDimensions: 1024 }`, the one place the seam, the probe and the stack's test read it from. `writtenEmbedding(corpus, lane)` says what a corpus holds when a lane writes it (bge-m3, native 1024, stored at the corpus width, zero-padded; or the OpenAI model at its own width). Every entry names its vector `column`. `lumen_data_atoms` is registered (the embedding runtime's own corpus, written by `embedAtom`, was not). `findVectorsFromAnotherModel(db)`: see the next section. |
| `server/services/ai-gateway/gateway.ts` (`assertSensitiveDispatchAllowed`, the region passed to `decideSensitivePlacement`) | For a `self_hosted` placement the decision is made at the lane's own region (`on_prem`) with no tenant region to compare; residency stays enforced for it by the tenant floor (`requestPlacementDenial` / `isPlacementCompliant`), before this gate. Every other substrate is still decided at the tenant's region. Nothing else in the file changed. |
| `server/startup/ana-readiness-state.ts` | After the lane is built and serves every organization, `recordEmbeddingLane` runs the probe. A failed probe records `embedding_lane_down` (fails readiness) with the probe's reason and re-runs the evaluation every 30 s (`EMBEDDING_PROBE_RETRY_MS`; one pending timer, unref'd), so a lane that starts after the API turns it ready without a restart. On the self-hosted lane it then runs the corpus check: vectors from another model, or a check that could not run, record `embedding_corpus_unverified` (fails readiness); a failed check is retried, a finding stands until the corpora are re-embedded and readiness is evaluated again (restart, or `GET /api/concept2cure/startup/invariants`). The ready detail names what answered: `…; embeddings: local — embedded one text through local: BAAI/bge-m3 (1024 values, zero-padded) at 1536 and 3072`. Banners for both states. The boot call is unchanged: `server/lib/startup-invariants.ts` → `evaluateAnaReadiness()`, which now contains the probe. |
| `server/startup/__tests__/ana-readiness-embedding-probe.test.ts` (new), `server/startup/__tests__/support/embedding-lane.ts` (new), `server/startup/__tests__/ana-readiness.test.ts` | The DP-71 cases, and the lane scaffolding both readiness suites share (the server behind the lane, the corpus check, the round-1 environment helpers, moved out of the old file rather than copied). `ana-readiness.test.ts` now passes every case through a healthy probe. |
| `server/services/ai-gateway/__tests__/self-hosted-residency.test.ts` (new) | The gateway cases. |
| `server/services/__tests__/embedding-corpus-policy.test.ts`, `…/embedding-corpus-policy.dbtest.ts` (new) | The policy cases, and the check against PostgreSQL as the runtime role under RLS. |
| `terraform/stack/main.tf` | `local.embedding_provider = "local"` (unconditional; it feeds `EMBEDDING_PROVIDER`); `EMBEDDING_LOCAL_MODEL = module.embeddings.model_id` in both containers; a `terraform_data.boot_contract` precondition: while the lane is local, `contains(try(jsondecode(var.ai_provider_placement_approvals)["local"].approvedIntendedUses, []), "embedding")`. The module's comment block says what round 2 decided. |
| `terraform/stack/tests/boot_contract.tftest.hcl` | The suite deploys the decided approval beside Anthropic's; `accepts_the_fail_closed_interim_approvals` carries it too (the interim value is the drafting provider's, still B4). New runs: `an_openai_election_does_not_move_the_embedding_lane`, `refuses_placement_approvals_without_the_embedding_lane`, `refuses_a_local_approval_that_does_not_name_embedding`, `the_environment_examples_show_the_decided_embedding_approval`; `the_api_and_worker_embed_through_the_self_hosted_lane` also requires `EMBEDDING_LOCAL_MODEL` = the server's `MODEL_ID` = the corpus policy's model (read from `embedding-corpus-policy.ts`). |
| `terraform/environments/{production,staging}/terraform.tfvars.example`, `variables.tf` | The `local` entry exactly as the ADR records it, `"local":{"region":"on_prem","zeroRetentionApproved":true,"approvedDataClasses":["pii","phi"],"approvedIntendedUses":["embedding"]}`, beside a placeholder for the Anthropic entry, which stays the founder's B4 decision with no example. `main.tf` in both roots needed no change (they already pass the approvals through). |
| `tests/db/vault-passage-search.dbtest.ts`, `tests/db/document-catalog-recall.dbtest.ts` (outside the item's file list; see "Neighbours") | Their stub embedding servers now answer in the width asked for, as TEI does. |

### Width (item 1)

The lane requests 1024 and pads; TEI's 422 for "more than the model emits" is no longer reachable from the
runtime (`round-2/red/embedding-provider.txt` → `round-2/green/embedding-provider.txt`). Zero-padding leaves dot
products, norms, cosine and L2 between padded vectors exactly those of the model's own vectors; the suite checks
the cosine of two padded vectors is bit-identical to the unpadded pair's. `document_vectors` (3072) is served the
same way. End to end: `tests/db/vault-passage-search.dbtest.ts` (real PostgreSQL, RLS on, runtime role) chunks,
embeds through the local lane, stores padded 1536-wide vectors and retrieves the right passage from them
(`round-2/green/neighbour-db-stub-width.txt`, 15 passed).

### Corpus policy and provenance (item 2)

**The rows' own provenance cannot support a filter.** Four corpora have an `embedding_model` column
(`document_vectors`, `rag_chunks`, `lumen_data_atoms`, `vault.document_chunks`), but every writer records the
model name its caller asked for, not the model that served the call: `vault/document-chunking.service.ts` writes
the constant `CHUNK_EMBEDDING_MODEL = 'text-embedding-3-small'`, `enhancedEmbeddingService.embedAtom` writes the
requested `EmbeddingModel`, and `retrieval-atoms.service.ts` writes its `embedModel` argument. Through the local
lane each of them would label a bge-m3 vector `text-embedding-3-small`; a filter on the column separates nothing.
Those files are not this item's (residual R2-1).

So, per the brief's second branch: the policy records that a corpus written by another model is re-embedded
before it is served, and `findVectorsFromAnotherModel(db)` is the check readiness uses. It decides by content: a
padded bge-m3 vector is exactly zero from position 1025 on, and a vector any 1536- or 3072-wide model wrote is not
(`(embedding::real[])[1025:]` has a non-zero value; works on pgvector 0.6, which has no `subvector`). It reads
every registered corpus table that exists, in the platform scope **and in each organization's own scope**,
because under RLS neither sees everything: the platform scope sees a public corpus whole but no Vault chunk at
all (`vault.document_chunks` resolves the tenant from the organization's UUID through `identity.current_org_id()`),
and an organization's scope does not see platform rows. Against PostgreSQL as `app_service` with `RLS_ENFORCE=on`
(`round-2/green/embedding-corpus-policy-db.txt`, 6 passed): the runtime role is neither superuser nor BYPASSRLS;
the platform scope sees 0 of a Vault chunk that exists; the check finds organization A's foreign Vault chunk in
organization A's scope, the platform's foreign knowledge entry in the platform scope, does not count organization
B's padded entry, and finds B as soon as it holds one foreign vector. A failing query throws: unchecked is not
clean.

### Gateway (item 3)

Red first: on the unfixed gateway, with `local` approved for `embedding` at `on_prem`, an EU-resident tenant's PII
and a US-resident tenant's PHI were refused through the in-VPC lane, `DENY_TENANT_POLICY`
(`round-2/red/self-hosted-residency.txt`, 3 failed). After: admitted, decided at region `on_prem`
(`round-2/green/self-hosted-residency.txt`, 9 passed). A provider that is not self-hosted is still held to
residency, by the tenant floor (an EU tenant that elected OpenAI is refused) and by the sensitive gate itself: an
approval granted for another region does not carry an EU tenant's PII (Bedrock in Frankfurt; Azure declared for
`us,eu`, where the gate must compare the tenant's region and not the lane's first one). The two Azure cases were
added after the first mutation pass showed the Bedrock case could not tell those two regions apart (a single-region
lane that passes the tenant floor serves exactly the tenant's region); against the gateway as committed they pass
and the three self-hosted cases fail (`round-2/red/self-hosted-residency-final.txt`). Round 1's placement probe,
rerun on the fixed gateway: the two bold cells are now `ALLOWED`, every other cell unchanged
(`round-2/probe/probe-output.txt`; round 1's copy in `probe/` still pins the old values, as the record of what was
observed then). Run it with
`npx vitest run --config docs/evidence/D6/2026-10-01-tranche-4/P1-54-embedding-lane/round-2/probe/vitest.probe.config.ts`.

### Readiness (item 4, DP-71)

Red first (`round-2/red/ana-readiness.txt`, 11 failed): with the lane configured and its server unreachable,
readiness said `ready`; so did it with the server refusing, serving another model, or a corpus holding another
model's vectors. Green: `round-2/green/ana-readiness-embedding-probe.txt` (9 passed) and
`round-2/green/ana-readiness.txt` (34 passed). The DP-71 cases were written into `ana-readiness.test.ts` and moved,
unchanged, to their own file after the red run, when the old file passed ESLint's `max-lines`; the "readiness from
configuration" mutant below reproduces the red on the new file (7 of 9 fail). `/readyz` follows: 503 with
`anaState: embedding_lane_down` and the reason while the lane has not answered, 200 once it has. A server that
never answers fails the probe at its 10 s bound (`round-2/red/embedding-probe-bound.txt`: the case timed out
before the bound existed). The CI production boot smoke is unaffected: it runs `AI_GATEWAY_DETERMINISTIC`, which
returns before the embedding lane is considered.

### INF-36 (item 5): resolved by the decision

One lane for every tenant: `EMBEDDING_PROVIDER=local` is unconditional in `terraform/stack` (`local.embedding_provider`,
no variable moves it). An OpenAI election covers generation and fallback, not embeddings: a corpus searched with
one model must be written with that model. `an_openai_election_does_not_move_the_embedding_lane` pins it: it
passes on the stack as it is (`round-2/red/terraform-new-runs-each.txt` shows it passing before this round's change,
as a pinning run should) and fails on the mutant that makes the lane follow `openai_enabled`
(`round-2/green/terraform-mutants.txt`).

### Terraform (item 6)

`round-2/green/terraform-boot-contract.txt`: **56 passed, 0 failed** (round 1's 52 + 4 new; aws 5.70.0 and random
3.6.3, the versions production's lock pins). Red: the whole suite on the unchanged configuration stops at the
first changed run (43 passed, 1 failed, 12 skipped: `round-2/red/terraform-boot-contract.txt`); each changed or new
run alone (`round-2/red/terraform-new-runs-each.txt`): the model-wiring run, both refusals and the examples run fail;
the election run and the interim acceptance pass, as pinning and acceptance runs do. Green, each alone: 6 passed.
`terraform validate`: both environment roots valid (`round-2/green/terraform-validate.txt`). `terraform fmt -check`
on the stack, the module and both roots: clean. Every run was in a scratch copy of the tree with its data directory
and a plugin cache in the session scratchpad; no `.terraform.lock.hcl` or `.terraform/` was left in the repository.

### Mutation passes

- Terraform (`round-2/green/terraform-mutants.txt`): six mutants (the lane follows an OpenAI election; no
  precondition; the precondition checks only that `local` is named; the containers are not told the model; the
  server loads a model other than the policy's; an example drops a data class): each caught by the run written
  for it.
- Application (`round-2/green/app-mutants.txt`): twelve mutants, each applied to a hard-linked scratch copy (the
  repository file is never written): the gateway drops the region comparison for every substrate; the gateway
  compares the tenant region for the self-hosted lane too (round 1's behaviour); the seam pads whatever width it
  gets; truncates; asks the self-hosted server for the corpus width (round 1's behaviour); the probe accepts any
  model; waits as long as the SDK; readiness from configuration; never re-probes; skips the corpus check; the
  corpus check reads the platform scope only; reads the whole vector. Every one turns its suite red.

### Neighbours

- The suites the brief names (`server/services/ai-gateway`, `server/services/__tests__/embedding*`,
  `…/enhancedEmbeddingService*`, `server/startup/__tests__`): **75 files, 830 passed, 1 skipped**
  (`round-2/green/named-suites.txt`). Other users of the seam and the policy (unified AI client, revectorize planner,
  fabrication-attribution, startup-invariants contract): 45 passed (`round-2/green/neighbour-unit.txt`).
- **Two database suites outside the item's file list had to change.** `tests/db/vault-passage-search.dbtest.ts` and
  `tests/db/document-catalog-recall.dbtest.ts` embed through the local lane against a stub server that answered
  1536 values whatever it was asked; the seam now asks for 1024 and refuses the answer, so 9 of their 15 cases
  failed (`round-2/red/neighbour-db-stub-width.txt`). A real TEI answers in the width asked for, up to the model's;
  each stub now does the same (two lines each), and both suites pass through the padding path
  (`round-2/green/neighbour-db-stub-width.txt`, 15 passed).

### Gates

`round-2/gates/`: `check:security-patterns` 0, `ci:server-error-leaks` 0, `ci:gateway-bypass` 0,
`ci:unreferenced-modules` 0 (82, baseline 82), `ci:untracked-imports` 0, `ci:check-embedding-runtime` 0. ESLint on
the 13 changed TypeScript files, against each file as committed: no new warning (`eslint.txt`; the one warning in
`embedding-provider.test.ts` is the existing `max-lines-per-function` on the placement-gate block, 126 lines at
HEAD, 127 now). `ci:untracked-imports --all` lists `ana-readiness.test.ts` → `./support/embedding-lane` until that
new file is committed with it (`ci_untracked-imports-all.txt`). Scoped `tsc` over the changed files: no error in
any of them (`tsc-scoped.txt`; what it prints is declaration and Express-augmentation gaps of a scoped run, in
files this item did not touch).

### What remains

- **R2-1. The rows' `embedding_model` does not name what wrote them.** Writers record the requested OpenAI name
  (above). Exact change, in files that are not this item's: record the seam's `result.model`
  (`EmbeddingProviderResult.model`, which is the server's answer, `BAAI/bge-m3`) instead of the requested name in
  `enhancedEmbeddingService.embed/embedBatch` (`model: response.model`) and in
  `vault/document-chunking.service.ts`; readers can then filter on it. Until then the content check is the guard.
- **R2-2. The corpus check is a full read of each corpus's vector column, once per scope** (platform + every
  organization), at each evaluation. With no tenant data (ADR-0014 §1.5) that is nothing; it grows with the
  corpora and the organizations. Before it matters: a per-corpus re-embed marker written by the re-embed job, or
  an index on the tail's norm.
- **R2-3. The content check cannot tell bge-m3 from another model of 1024 values or fewer**, padded the same way.
  The probe refuses a live server that names another model, so this concerns only vectors written by such a
  server in the past; none exist.
- **R2-4. Readiness stops probing once the lane has answered.** A lane that fails later is not re-detected by
  `/readyz`; search then reports itself unavailable per request (round 1's R2). A probe failure while down writes
  one ledger failure row per 30 s (platform scope, no organization).
- **R2-5. The precondition checks the intended use only, as specified.** A `local` entry with another region,
  without PII/PHI or without zero retention plans, boots, and refuses sensitive chunks per request. The examples
  show the exact value.
- **R2-6. Development reports not ready without an embedding lane.** Outside production the probe runs too, so a
  developer with no OpenAI key and no local server sees `/readyz` 503 (`embedding_lane_down`). That is the truth
  about search there; it was `ready` before.
- **R2-7. The deploy preflight** (`deploy-aws.yml`, another lane's file) should now also require
  `EMBEDDING_LOCAL_MODEL` in its list, beside round 1's residual 7.
- Round 1's residuals 4 (a tenant whose own allow-lists omit `local` or `self_hosted` gets no search; the amended
  ADR does not decide it), 5 (model commit unpinned), 6 (pull path), 7, 9 (plain HTTP inside the VPC), 11 and 12
  stand. 1, 2, 3, 8 and 10 are closed above.
