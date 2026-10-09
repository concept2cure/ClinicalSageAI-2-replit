# W2 evidence — 2026-09-20 — rows D1 (hosted production) and D3 (tenant isolation)

Worker W2. Scope: `scripts/db/**`, `scripts/ops/**`, `server/db/**`,
`server/startup/**`, `server/config/environment.ts`,
`server/services/ai-gateway/pii-screen.ts`, `Dockerfile*`, `.env.example`,
`docs/operations/**`. No git commands were run; the control tower commits.
Local environment: PostgreSQL 16.13 + pgvector 0.6.0 at 127.0.0.1:5432, Node
22.22.2, Ghostscript 10.02.1 (installed locally for the toolchain proof),
OpenJDK 21. No Docker daemon, no `terraform` binary, no AWS account.

## What was proved (green) — and the file that proves it

| Claim | Evidence |
|---|---|
| **One command provisions an empty database to the `/readyz` schema contract.** `node scripts/db/provision.mjs` on the new empty `clinicalsage_fresh`, owner `postgres`, app role `app_service` minted: install-fresh 8/8 steps (792 public tables, 821 RLS policies, 42/42 governed-content files), deploy-migrate 291/291 files, contract verified as the owner and then **as `app_service`** (27/27 contract tables readable, non-superuser, NOBYPASSRLS), exit 0. | `provision-fresh.transcript.txt` (700 lines) |
| **The server boots against it as the runtime role and `/readyz` reports `schema: ok`.** Port 5100, `NODE_ENV=development`, `DATABASE_URL=APP_DATABASE_URL=app_service@…/clinicalsage_fresh`: `database: ok, schema: ok, schemaState: ready, capabilityRegistry: seeded`. HTTP 503 because `ana: down (no_provider)` — **no AI provider key was set; expected, and the separate `ana` gate, not schema.** | `readyz-5100-clinicalsage_fresh.txt`, `server-5100-boot-log-excerpt.txt` |
| **Refusal, pgvector absent (verified by making it fail).** `vector.control` hidden on the server, empty DB: exit 4, message names `apt-get install -y postgresql-16-pgvector`, 0 tables written; control file restored and re-verified. | `provision-refusal-no-pgvector.txt` |
| **Refusal, owner cannot CREATE ROLE / CREATE EXTENSION.** Run as `c2c` through the `DATABASE_URL` fallback: the fallback warning prints, exit 5 names the three `*_gcc_*` files that `CREATE ROLE`, 0 tables written. | `provision-refusal-owner-privileges.txt` |
| **Refusal, owner/app URLs name different databases.** Exit 2. | `provision-refusal-url-mismatch.txt` |
| **deploy-migrate now verifies the full `/readyz` contract**, not only the authoring half (critical + security-critical tables, `audit.tamper_proof_log`, schemas, `vector`). Shared implementation `scripts/db/readiness-contract.mjs`; its lists are pinned to `ensureCoreTables.ts` / `services.ts` by a test that was **shown failing** when `licenses` was removed from the `.mjs` list, then restored. | `readiness-contract-pin-test-forced-failure.txt`; step 5/5 in `provision-fresh.transcript.txt` |
| **B15 — PDF/A toolchain in the image, with a build-time check.** `Dockerfile.optimized` adds `default-jre-headless`, `libxml2-utils`, `ca-certificates` and veraPDF **org.verapdf.apps:cli:1.30.2** from Maven Central, sha256-pinned to the checksum the veraPDF Consortium publishes beside the jar (verified against the downloaded bytes here: `287cc9c9…afa332`), then RUNs `scripts/ops/check-pdfa-toolchain.sh`. That script, run locally with `gs` from apt and a `verapdf` wrapper around the same verified jar: all three binaries found, render → Ghostscript PDF/A-1b (sRGB OutputIntent) → veraPDF `PASS`, unconverted source `FAIL`, exit 0. Forced failures: missing binary → exit 1; version pin mismatch → exit 1; strict mode → exit 1 on the pipeline-argument defect below. | `pdfa-toolchain-check-pass.txt`, `pdfa-toolchain-check-fail.txt` |
| **B19/B20 — AI gates fail closed in production.** `AI_PII_ENFORCEMENT` unset → `block`; `AI_GROUNDEDNESS_ENFORCE` unset → enforced; explicit permissive value refuses to boot unless `AI_GOVERNANCE_ACCEPT_PERMISSIVE=true` (structured accepted-risk warning); `AI_GOVERNANCE_REQUIRE_ENFORCE=true` refuses regardless; non-production unchanged. Ordering documented in `server/startup/ai-governance-posture.ts` header, `.env.example`, `DEPLOYMENT.md` §3. Unit tests cover all five ordering branches, the production PII default, and the pin between the posture mirror and `groundedness.ts`. | 96/96 tests across 8 files (see gates below); `server/startup/__tests__/ai-governance-posture.test.ts` |
| **Readiness report row moved.** `ai-governance-posture` advisory row: blocked → ready (4/40 → 5/40). The other diff line (ICSR gateway row) is another worker's change, not W2's. | `ga-readiness-before.txt`, `ga-readiness-after.txt`, `ga-readiness-diff.txt` |
| **Repo gates green:** `ci:migration-set-order`, `ci:migration-drop-safety`, `db:sync-manifest:check`, `ci:node-runtime`. ESLint on the changed files: 0 errors (the warnings are pre-existing in `services.ts` / `ensureCoreTables.ts`; `scripts/**/*.mjs` is eslint-ignored by repo config). Vitest: `readiness-contract`, `ai-governance-posture`, `pii-screen` (tests/ci), `environment`, `sensitive-placement-gate`, `sensitive-placement-integration`, `groundedness`, `provision-app-role` — 8 files, 96 tests, all passing. | `repo-gates.txt`, `eslint-changed-files.txt` |

## Findings that are not W2's to fix (reported, with the proof)

1. **`server/services/ectd/pdfa-pipeline.ts` produces non-conformant PDF/A-1b.**
   Its exact Ghostscript argument list (no OutputIntent) yields a file veraPDF
   1.30.2 rejects on clause 6.2.3.3 ("uncalibrated colour space … shall contain
   a PDF/A-1 OutputIntent"), while the packager records `converted: true` and
   `ECTD_REQUIRE_PDFA` only checks that flag. The same Ghostscript with an sRGB
   OutputIntent prelude passes. The toolchain check prints this as ⚠ on every
   run and fails under `PDFA_CHECK_STRICT_PIPELINE_ARGS=1`. Owner: D7 (eCTD).
   Fix: add the prelude the check script uses (`pdfa_def.ps` with
   `/usr/share/color/icc/ghostscript/srgb.icc`, `--permit-file-read`) to
   `convertToPdfA1bWithGhostscript`, then set strict mode in the Dockerfile.
2. **`package.json` alias not added (outside W2's paths).** For `npm run
   db:provision` to exist the control tower must add, under `scripts`:
   `"db:provision": "node scripts/db/provision.mjs",`. Docs reference both forms.

## Blocked on the founder / control tower (cannot be proved here)

| Item | Why blocked | What unblocks it |
|---|---|---|
| **D1: `terraform apply` log, AWS environment, `deploy-aws.yml` image promotion** | No AWS account, IAM, DNS or secrets in this session; `terraform` is not installed so even `terraform validate`/`fmt` could not run. `terraform/` was read only. | Founder: account + IAM role for the pipeline; then `terraform validate` in `terraform/environments/{staging,production}`. |
| **D1: the image build itself** | No Docker daemon here (`docker info`: cannot connect). The Dockerfile change is proven only at shell level (same binaries, same jar, same checksum, same check script). | First CI/`deploy-aws.yml` build runs the build-time check; a failure there names the binary. `software.verapdf.org` is proxy-blocked from this sandbox, which is why the pin uses Maven Central (reachable and checksum-published). |
| **D1: `/readyz` 200 with `ana: ok`** | Needs an AI provider key (`ANTHROPIC_API_KEY`) in the environment; none is configured here. `schema`, `database` are `ok`; `redis`/`worker` are `skipped` (no Redis configured). | Founder: provider key in the secrets manager; Redis endpoint for the worker tier. |
| **D3: two-tenant isolation contract against staging with the production image; `RLS_ENFORCE=on` on staging** | No staging. Locally this session proved the role split (`app_service` non-superuser, NOBYPASSRLS, contract readable) and a boot as that role with `RLS_ENFORCE=off` (`.env`, `NODE_ENV=development`). CI's `production-boot-smoke` job is the existing proof of `RLS_ENFORCE=on` + `NODE_ENV=production` as `app_service`. | Staging database provisioned with `node scripts/db/provision.mjs` (owner = RDS master), `RLS_ENFORCE=on`, then the isolation contract run and its log filed here. |
| **B15 end state: `ECTD_REQUIRE_PDFA=true`** | Per B20 the flag follows the artifact: the image must ship (above) and finding 1 must be fixed first, or every production sequence would carry `converted: true` leaves that fail veraPDF. | D7 owner fixes finding 1; ops flips the flag in the same change window. |

## Files changed by W2

New:
- `scripts/db/provision.mjs` — the one command.
- `scripts/db/readiness-contract.mjs`, `scripts/db/readiness-contract.d.mts` — the shared `/readyz` schema contract + verifier.
- `scripts/ops/check-pdfa-toolchain.sh` — shell-level PDF/A toolchain proof (also the Dockerfile build step).
- `server/db/__tests__/readiness-contract.test.ts` — pins the `.mjs` lists to the TS lists; verifier behaviour.
- `docs/evidence/W2/2026-09-20/*` — this directory.

Modified:
- `scripts/db/deploy-migrate.mjs` — step 5 verifies the full contract via `readiness-contract.mjs`.
- `server/db/ensureCoreTables.ts` — exports `CRITICAL_TABLES`, adds/exports `REQUIRED_SCHEMAS` (behaviour unchanged).
- `server/startup/services.ts` — exports `SECURITY_CRITICAL_TABLES` (behaviour unchanged).
- `server/services/ai-gateway/pii-screen.ts` — pure `resolvePiiEnforcement`, production default `block`, acceptance variable.
- `server/startup/ai-governance-posture.ts` — production fail-closed gate with the documented ordering; imports the PII resolver instead of duplicating it.
- `server/startup/__tests__/ai-governance-posture.test.ts` — rewritten for the new contract.
- `server/config/environment.ts` — comment only (describes the new posture; the call is unchanged).
- `scripts/ops/ga-readiness-report.mjs` — `ai-governance-posture` row resolves values as production does.
- `Dockerfile.optimized` — JRE, xmllint, ca-certificates, pinned veraPDF CLI, build-time toolchain check.
- `.env.example` — `DATABASE_OWNER_URL` block; production defaults and ordering for the AI gates; `AI_GOVERNANCE_ACCEPT_PERMISSIVE`.
- `docs/operations/DEPLOYMENT.md` — canonical AWS/ECS section prepended (provisioning, image toolchain, AI posture); Helm content marked legacy.
- `docs/operations/DB_READINESS.md` — rewritten around the one-command path and the contract.

Not run: `npm run typecheck` (24 GB heap per the repo note) — the new `.d.mts` follows the `provision-app-role.d.mts` pattern and the importing test executes under vitest, but tsc was not exercised.

## Local state left behind (for the control tower)

- Database `clinicalsage_fresh` (provisioned, 972 tables incl. non-public) and cluster role `app_service` (password `w2-fresh-app-service-pw-2026`) exist on 127.0.0.1:5432 for inspection; `clinicalsage_novector` was dropped. `clinicalsage` and role `c2c` were not modified.
- `/usr/share/postgresql/16/extension/vector.control` was moved aside for ~1 s during the refusal proof and restored (verified: `pg_available_extensions` lists `vector` again).
- Ghostscript 10.02.1 and libxml2-utils were apt-installed on this host for the toolchain proof.
- Server processes started by W2 (PIDs 6493/6529/6530, port 5100) were stopped; the servers on ports 5000 and 5200 belong to other sessions and were not touched.
