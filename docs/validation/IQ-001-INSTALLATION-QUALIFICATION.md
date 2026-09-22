# IQ-001 — Installation Qualification protocol

| Field | Value |
|---|---|
| Document ID | IQ-001 |
| Version | 0.3 |
| Status | **DRAFT — UNSIGNED** |
| Parent | VMP-001 §5 |
| Runner | `npm run validation:iq` → `scripts/validation/run-iq.mjs` |
| Record | `docs/evidence/W3/<date>/IQ/IQ-001-execution-record.md` + `iq-results.json` (generated; never edited) |

## Revision history

| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 | 2026-09-21 | W3a | Derived from the deployment artefacts: `Dockerfile.optimized`, `docker-compose.yml`, `docker-compose.staging.yml`, `terraform/environments/{production,staging}`, `terraform/modules/*`, `.github/workflows/deploy-aws.yml`, `scripts/db/install-fresh.mjs`, `scripts/db/deploy-migrate.mjs`, `scripts/db/provision-app-role.mjs`, `server/startup/inline-endpoints.ts` (`/readyz`), `server/auth/dev-auth-policy.ts`, `server/middleware/enterprise-security.ts`, `.env.example`. |
| 0.2 | 2026-09-22 | W3 | §3: the runner resolves the environment the way the server does, `.env.local` then `.env` with the process environment over both (`scripts/validation/env-files.mjs`, held equal to `server/config/load-env-files.ts`). It read `.env` alone, so on an installation brought up by `npm run up`, which writes the database to `.env.local`, IQ-05/07/08 qualified a different database from the one the server and the OQ protocols used. IQ-05 now names the database it qualified (host, port, name; never credentials). No check's expected result changed. |
| 0.3 | 2026-09-22 | W3 | IQ-07 also records the RLS-enabled tables the runtime role **owns** without FORCE ROW LEVEL SECURITY, and raises IQ-DEV-006 when there are any: a table's owner is exempt from its policies whatever `rolsuper`/`rolbypassrls` say. v0.2 passed IQ-07 for the 2026-09-21 environment, whose role `c2c` owned 61 such tables including `vault.documents`, so the OQ set never evaluated those policies and a Vault defect under the non-owner runtime role went unseen (VSR-001 §12). It also passed IQ-07 for the superuser owner `postgres`. Both deviations are reported when both apply. |

## 1. Purpose

Show that a given installation of Concept2Cure.RI is the artefact the repository describes, is configured the way the production boot contract requires, and reports its own readiness honestly — before any OQ is run against it. Every check is executable by the runner; a check that cannot be executed on the installation under test records a **deviation** with an IQ-DEV number, never a pass.

## 2. The deployment the checks are derived from

| Artefact | What it fixes | IQ check |
|---|---|---|
| `Dockerfile.optimized` | `node:22-slim`, non-root `appuser`, `migrations/` + `db/migrations/` + `scripts/db/` + `assets/` copied into the image, `HEALTHCHECK` on `/readyz` | IQ-01, IQ-03, IQ-13 |
| `docker-compose.yml` | the self-host stack (pgvector Postgres 15, Redis 7, app) and the required-variable contract (`${VAR:?}`) | IQ-04, IQ-05 |
| `terraform/environments/production/main.tf` | modules `vpc`, `ecr`, `secrets`, `rds`, `alb`, `ecs`, `evidence`, `cdn` | IQ-02 |
| `.github/workflows/deploy-aws.yml` | jobs `test → security-gate → build-push → migrate → deploy-api → deploy-frontend → smoke-test`; the `migrate` job runs `deploy-migrate.mjs` from the promoted image before services roll | IQ-02, IQ-03 |
| `scripts/db/install-fresh.mjs` / `deploy-migrate.mjs` / `migration-set.mjs` | from-scratch provisioning (owner role) and the replayable deploy-time migration set (CLAUDE.md Rule 1) | IQ-05, IQ-06 |
| `scripts/db/provision-app-role.mjs`, `.env.example` (`APP_DATABASE_URL`, `RLS_ENFORCE`) | the non-superuser runtime role and RLS posture (row D3) | IQ-07, IQ-08 |
| `server/startup/inline-endpoints.ts` | `/healthz`, `/readyz` (database, schema, AnA, redis, worker — fail-closed) | IQ-09 |
| `server/auth/dev-auth-policy.ts` | dev-login exists only with `NODE_ENV=development` and `ALLOW_DEV_AUTH=1` | IQ-10 |
| `shared/constants/launch-scope.ts` + entitlements | `LAUNCH_SCOPE_ENFORCE` | IQ-11 |
| `server/middleware/enterprise-security.ts`, `server/config/platform-limits.ts` | helmet headers (CSP enforced in production, report-only in development), per-IP rate limits | IQ-12 |
| `package.json` `ci:*` scripts | the CI gates the launch definition names | IQ-14 |

## 3. Pre-conditions

- The repository checkout to be qualified, with `npm ci` done and `tests/validation` installed (`npm install` there).
- A PostgreSQL reachable at `DATABASE_URL`, resolved as the server resolves it: the process environment, else `.env.local`, else `.env`. IQ-05 records which database that is.
- The application running at `VALIDATION_BASE_URL` (default `http://localhost:5200`), booted from that checkout.
- Chromium at `CHROMIUM_PATH` (for the OQ runners that follow).

## 4. Checks

| Check | Title | Expected result | Evidence written |
|---|---|---|---|
| IQ-01 | Node runtime matches `package.json` engines | major version equal to the declared range | — |
| IQ-02 | Deployment artefacts present | every file named in §2 exists; terraform modules listed | — |
| IQ-03 | Container definition matches the runbook | base image, non-root user, migration payload, assets, `/readyz` healthcheck; deploy jobs in order | — |
| IQ-04 | Required configuration declared and set | every compose-required variable is documented in `.env.example`; which are set locally (values never printed) | — |
| IQ-05 | Database reachable with the app schema | Postgres reachable; `vector` extension; `organizations`, `users` present; migration journal present | `db-schema.json` |
| IQ-06 | Migration set files exist | every `.sql` named in `scripts/db/migration-set.mjs` resolves on disk | — |
| IQ-07 | Runtime role reaches every table | the `DATABASE_URL`/`APP_DATABASE_URL` role holds SELECT on every table in every schema; role attributes recorded; the role owns no table whose row-level security is not forced (otherwise IQ-DEV-006: its policies do not apply to their owner) | `db-role-denied-tables.json`, `db-grants-before.txt` |
| IQ-08 | Tenant-isolation posture | `RLS_ENFORCE=on` with `APP_DATABASE_URL` on a non-superuser role (production); otherwise deviation | — |
| IQ-09 | Boot and honest readiness | `/healthz` 200; `/readyz` names every dependency; database+schema ok; a missing AI provider reads `ana=down` (503), never hidden | `readyz.json` |
| IQ-10 | Development authentication policy | dev-login answers only under `NODE_ENV=development` + `ALLOW_DEV_AUTH=1`; production must answer 404 | — |
| IQ-11 | Launch scope enforced | `launchScope.enforced=true` in the navigation payload; verdict counts | `navigation-summary.json` |
| IQ-12 | Security middleware active | CSP (enforced or, in development, report-only), `nosniff`, referrer policy; API rate-limit headers | `security-headers.json` |
| IQ-13 | Vendored agency artefacts | eSTAR templates with `checksums.txt`, eCTD DTDs and schemas, FDA recognised standards | — |
| IQ-14 | CI gates declared | `ci:migration-drop-safety`, `ci:migration-set-order`, `ci:launch-scope`, `ci:fixture-fallback`, `ci:no-mock-in-prod-routes` | — |
| IQ-15 | Validation toolchain | `playwright-core` installed; Chromium present | — |

## 5. Acceptance

IQ-001 is accepted for an environment when no check reads **fail** and every **deviation** is dispositioned in VSR-001 §5. On the local development installation used for this revision, IQ-DEV-001…005 are expected and open (see the execution record); they are closed only by re-executing on staging (D1) after the corrective actions.

## 6. Deviations raised by the local execution (2026-09-21)

| ID | Check | Observation | Corrective action / owner |
|---|---|---|---|
| IQ-DEV-001 | IQ-07 | The runtime role `c2c` (not superuser, no BYPASSRLS) lacks SELECT on **264** tables, 183 of them in `public` owned by `postgres` (evidence: `db-grants-before.txt`, `db-role-denied-tables.json`). Launch-relevant among them: `platform_settings`, `tamper_proof_log`, `qms_change_controls`, `program_journeys`, `cre_evidence_sources`, `document_span_lineage`, `assumption_records`, `contradiction_links`, `decision_records`, `ai.gateway_audit_log`, schema `intelligence`. Effect on OQ: section creation (OQ-003), vault read model and surface (OQ-002), change control (OQ-006), program journey (OQ-001), contradiction scan (OQ-005) answer 500 and are recorded as deviations. | Owner-role action for the operator: re-provision with `scripts/db/install-fresh.mjs` so one role owns the schema, or `GRANT USAGE ON SCHEMA … ; GRANT ALL ON ALL TABLES/SEQUENCES IN SCHEMA … TO c2c` for every schema. The runner was **not permitted** to apply the grant in this session and did not. Then re-run IQ-001 and OQ-001…006. |
| IQ-DEV-002 | IQ-04 | Development install: of the compose-required variables only `JWT_SECRET` is set locally; `DB_PASSWORD`, `APP_SERVICE_DB_PASSWORD`, `APP_DATABASE_URL`, `SESSION_SECRET`, `REFRESH_TOKEN_SECRET`, `MFA_ENCRYPTION_KEY`, `AUDIT_HMAC_KEY`, `AUDIT_HMAC_SECRET`, `CONNECTOR_ENCRYPTION_KEY` are unset. All are documented in `.env.example`. | Expected locally; the production boot contract (`docker-compose.yml`, `deploy-aws.yml` secrets) is qualified on staging. Note: with `AUDIT_HMAC_KEY` unset the audit chain is unsealed (`server/services/audit/chain.ts:86`). |
| IQ-DEV-003 | IQ-08 | `RLS_ENFORCE=off`, `APP_DATABASE_URL` unset — not the D3 posture. | Qualified under D3 against staging. |
| IQ-DEV-004 | IQ-09 | No AI provider: `/readyz` 503 with `ana=down`, `anaState=no_provider`; database and schema `ok`. Readiness fails closed correctly. | Configure a PQ-passed provider on staging; every model-dependent OQ step is a deviation until then. |
| IQ-DEV-005 | IQ-12 | CSP is report-only and HSTS absent — development build behaviour (`enterprise-security.ts:165`). API responses carry `X-RateLimit-Limit: 60`. | Verify enforced CSP/HSTS on staging over HTTPS. |
| — | IQ-10 | dev-login answered 200 (as configured). The production refusal cannot be exercised locally. | Verify 404 on staging with `NODE_ENV=production`. |

## Signature block

| Role | Name | Signature | Date |
|---|---|---|---|
| Executed by (automation owner) | | *unsigned* | |
| Reviewed by (qualified validation contractor) | | *unsigned* | |
| Approved by (founder / system owner) | | *unsigned* | |
