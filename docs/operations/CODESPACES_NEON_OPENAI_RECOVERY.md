# Codespaces / Neon / OpenAI — deployment recovery

**Scope:** `concept2cure-v2` in `concept2cure/ClinicalSageAI-2-replit`. This is the governed platform's existing startup path. A Codespace editor launching successfully is NOT application readiness, and a working AI chat is NOT regulatory drafting qualification.

## 1. Use real GitHub Codespaces secrets

Configure these as repository-accessible **Codespaces** secrets (not GitHub Actions-only secrets), and rebuild/restart the Codespace after changing access. Never put raw values in the repository, a chat message, terminal history, or screenshots.

| Name | Meaning |
|---|---|
| `DATABASE_URL` | **Not permitted in the request-serving Codespace**. An owner/maintenance connection belongs exclusively in a separate approved maintenance session. |
| `APP_DATABASE_URL` | **Required**: intended Neon branch/database through the non-owner `app_service` role, with `sslmode=require` or `verify-full`; the driver enforces hostname and CA verification. |
| `DATABASE_OWNER_URL` | **Not permitted in the request-serving Codespace**. Use only in a separate authorized migration/provisioning environment. |
| `C2C_DB_MODE` | Recommended `neon` for a Neon-backed Codespace; `local` is only for explicit local development |
| `RLS_ENFORCE` | Must equal `on`; the Codespaces image sets it by default. Startup refuses any off/shadow/unset override and activates PostgreSQL tenant isolation for the app session. |
| `JWT_SECRET` or `JWT_SECRET_DEV` | Required for application auth; securely generated value of at least 32 characters. The doctor checks presence/length but never prints it. |
| `REFRESH_TOKEN_SECRET` | Optional in development; a separate, strong secret is required in staging/production. |
| `ANTHROPIC_API_KEY` | If using approved-category Anthropic model routes for regulated drafting; production still requires PQ |
| `OPENAI_API_KEY` | OpenAI API for authorized tasks. It **does not by itself unlock high-risk AnA/CSR/IND drafting** |

The Codespaces image no longer hardcodes an old Neon production branch or overrides the application DSN with a local-environment secret variable. For normal development, provision the database in a separate authorized maintenance session; leave owner credentials out of the running Codespace entirely. The Codespaces doctor **and direct server boot** now refuse `DATABASE_URL`, `DATABASE_OWNER_URL`, `DATABASE_NEON_NEW_SECRET`, `NEON_DATABASE_URL`, and the other owner/admin connection aliases when populated. The only database secret allowed in the serving Codespace is `APP_DATABASE_URL`; a separate maintenance session owns schema changes. Confirm the actual Neon endpoint and set the explicit names above.

**Security note:** the repository's own `.gitleaksignore` currently still describes
historical Neon owner credentials as `status: live — revoke`. This is not a
live Neon-account verification; treat the credentials as exposed until rotation
is confirmed in Neon. Rotate/revoke affected owner passwords in the Neon
console, ensure the affected branches are reviewed, then replace the owner
and runtime Codespaces secrets. A source-code commit **cannot** revoke a
historical database password, and suppressing a scanner finding is not rotation.

## 2. Fail-closed checks before launch

```bash
git switch concept2cure-v2
git pull --ff-only origin concept2cure-v2
node --version              # v22.x
npm ci
npm run codespaces:doctor   # read-only: DB target, vector/schema, app-role grants
```

The database diagnostic calls the **existing** `scripts/db/readiness-contract.mjs` as the request-serving role. It does not create tables, run migrations, rotate credentials, repair passwords, or fall back from Neon to local PostgreSQL.

Common codes:
- `DB_RUNTIME_URL_MISSING`: set the app_service Codespaces secret; the owner's credential is not a runtime prerequisite.
- `DB_OWNER_CREDENTIAL_IN_APP`: an inherited Codespaces secret contains a database owner or maintenance credential. Remove it from this request-serving environment and restart the Codespace. Do not copy it into `APP_DATABASE_URL`.
- `DB_TARGET_MISMATCH`: owner and app accounts point to different databases or branches.
- `DB_NEON_TLS`, `DB_NEON_OWNER_TLS`, `DB_DNS_FAILED`, `DB_AUTH_REJECTED` or `DB_UNREACHABLE`: inspect the actual Neon connection; do not disable TLS verification.
- `DB_SCHEMA_OR_GRANTS_NOT_READY`: schema, RLS-sensitive runtime permissions, audit store or pgvector are not qualified.
- `RLS_NOT_ENFORCED`: Codespaces RLS is disabled or merely in shadow mode; it is not safe to qualify tenant-scoped authoring. Rebuild with `RLS_ENFORCE=on` and verify tenant policies. The doctor also reads `current_setting('app.rls_enforce')` from the **actual app_service connection** and refuses an RLS-enabled table the runtime role owns without FORCE ROW LEVEL SECURITY. These are read-only checks: any required role/policy repair must occur in an approved maintenance session.
- `JWT_SECRET_MISSING`, `JWT_SECRET_WEAK` or `JWT_ROTATION_INVALID`: configure a distinct, strong Codespaces secret; a database passing does not imply the API can authenticate users.

If the database is truly new, use the existing [DB readiness procedure](DB_READINESS.md) against an **authorized empty development database** with owner and app roles. Do not run `install-fresh` against a production or shared Neon branch to make a green test appear.

**Authentication:** Codespaces startup does not automatically create a privileged
demo administrator or use the owner DSN to seed users. Sign in using an
existing authorized test account. For a new empty development database, use
the repository's existing controlled provisioning and account setup workflow
from a **separate authorized maintenance environment**. Do not put a Neon
owner password in the request-serving app to make a demo login work.

Once the doctor passes:

```bash
npm run dev
# In a separate Codespaces terminal:
npm run codespaces:doctor -- --check-app
```

`/readyz` must establish real dependencies. The Codespaces diagnostic further requires `schemaState=ready`, `anaState=ready`, `capabilityRegistry=seeded`, and `database`, `schema`, `ana`, and `storage` dependencies each equal to `ok`. A `200` response with a degraded schema or missing component cannot qualify the application. `/healthz` or a Codespaces "ready" banner is not enough. The app start path no longer changes the DB URL from a stale `.env`, prints DSN passwords, creates a local database, or suppresses failed remote connectivity.

## 3. Distinguish OpenAI billing from Concept2Cure governance

Authentication-only (no model-generation charge):

```bash
npm run codespaces:doctor -- --probe-openai
```

To verify the existing **Anthropic/Claude** key and list accessible models without generating text, run:

```bash
npm run codespaces:doctor -- --probe-anthropic
```

This does **not** establish billing headroom or authorize a high-risk model. Model
approval, tenant placement and performance qualification remain separate.

For a deliberately **billable**, minimal OpenAI API call to distinguish an exhausted quota from a transient rate limit, only when the operator approves:

```bash
npm run codespaces:doctor -- --probe-openai-usage
```

Responses are reported as codes without credentials:
- `OPENAI_KEY_MISSING` or `OPENAI_KEY_INVALID` — credential configuration/revocation.
- `OPENAI_QUOTA_OR_BILLING` — available project credits, payment method or spending limit.
- `OPENAI_RATE_LIMIT` — throughput limit, which does not necessarily imply no credits.
- `OPENAI_ORGANIZATION_OR_PROJECT_POLICY` — organization/project access rules.
- `ANTHROPIC_KEY_MISSING`, `ANTHROPIC_KEY_INVALID`, `ANTHROPIC_NO_MODELS_VISIBLE` — Claude credential or model-list access cannot be established.
- `ANTHROPIC_WORKSPACE_OR_POLICY`, `ANTHROPIC_QUOTA_OR_BILLING`, `ANTHROPIC_RATE_LIMIT` — Anthropic account, billing or throughput needs operator attention; only actual provider requests can establish usage success.
- `APP_NOT_READY` with `anaState: no_high_risk_model` — **Concept2Cure's** own high-risk approval gate, not an OpenAI API ban.
- `NO_PQ_QUALIFIED_MODEL` — production performance qualification required before model-backed regulatory drafting; NEVER bypass by changing `approvedForHighRisk` without evidence.

The old Replit-era startup document's assertion that OpenAI quota "is currently exceeded" was historical and cannot establish your current API account balance.

## 4. Neon automated branch safety

The GitHub agent configuration is no longer a second authority for AI model
approval or database migrations. It uses `APP_DATABASE_URL` for the
request-serving Codespace, does **not** auto-run migrations, and defers regulated
model eligibility to `server/services/ai-governance/approved-models.ts`. A
configured OpenAI API key cannot override the high-risk/PQ rules.

For the existing GitHub Actions that create Neon branches, an operator must
configure an expressly approved **non-production** parent as the repository
variable `NEON_SAFE_PARENT_BRANCH`. The PR-preview workflow additionally
requires `NEON_PREVIEW_ENABLED=true`, `NEON_PROJECT_ID` (the actual Neon
project ID, **not** an `ep-...` endpoint identifier), and the existing
`NEON_API_KEY` secret. The on-demand/weekly Neon provisioning proof similarly
requires its Neon API/project credentials and the safe parent. Missing
authorization means no branch is created or the proof fails; neither case is a
verified database.

All three automated branch jobs use a pinned Neon create-branch action v6
with `branch_type: schema-only`, starting from an expressly approved non-production
parent. Schema-only branching avoids copying clinical or client data rows into
the CI/PR branch; the provisioning proof subsequently creates a genuinely blank
database to validate a fresh installation. **Do not designate production as
the parent merely to get a passing CI run.** PR preview DDL uses the direct Neon
endpoint with masked credentials, never the pooled URL.

Neon preview branches are created in **one** workflow: `.github/workflows/neon-preview-db.yml`.
The general C2C agent no longer creates an untracked duplicate branch. The
preview verifier fails if its Git merge-base cannot be resolved, and runs a
read-only live schema-inventory check before reporting success. Each PR check creates a **unique, schema-only branch** named for that
GitHub run. It rejects an existing branch, then deletes exactly its own branch
ID in the same job—even if validation fails. A failed deletion remains visible
and cannot produce a successful cleanup receipt. A one-day server-side
expiration is the final safeguard if the runner is lost.

The weekly/on-demand provisioning proof refuses a reused branch and deletes
only the branch ID the current run created. A failed deletion remains a
visible workflow failure, rather than a success receipt. Neither workflow
provides scientific model qualification or a finished CSR demonstration.

Neon schema-only proof branches now request a server-side expiration after
**two hours**, and PR preview branches after **one day**. Expiration is a
last-resort cost and data-minimization safeguard, not evidence that a branch
was actually deleted; the explicit deletion result still governs cleanup
receipts. Each PR run creates its own temporary branch.

These changes to workflow source do not change Neon account settings, rotate
historical credentials, create a branch, or prove a connected Neon project.
Those operations require account access and a live run.

## 5. Regression and remaining acceptance

```bash
npm run codespaces:doctor:test
bash -n scripts/startup.sh .devcontainer/post-start.sh .devcontainer/post-create.sh
```

The app must still pass a **live authenticated browser** journey before any client demonstration is described as qualified: Project → Vault/Data Room → approved and frozen study data → AnA model draft → governed editor save/reopen → independent scientific review → export and reopen the resulting CSR. These checks deliberately do not fabricate scientific approval, electronic signatures, model PQ, or a completed trial.
