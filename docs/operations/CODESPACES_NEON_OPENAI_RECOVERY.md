# Codespaces / Neon / OpenAI — deployment recovery

**Scope:** `concept2cure-v2` in `concept2cure/ClinicalSageAI-2-replit`. This is the governed platform's existing startup path. A Codespace editor launching successfully is NOT application readiness, and a working AI chat is NOT regulatory drafting qualification.

## 1. Use real GitHub Codespaces secrets

Configure these as repository-accessible **Codespaces** secrets (not GitHub Actions-only secrets), and rebuild/restart the Codespace after changing access. Never put raw values in the repository, a chat message, terminal history, or screenshots.

| Name | Meaning |
|---|---|
| `DATABASE_URL` | Exact approved Neon **owner** connection, including the correct project/branch/database and `sslmode=require` |
| `APP_DATABASE_URL` | The SAME branch/database via a separate **non-owner** `app_service` runtime account, with TLS |
| `DATABASE_OWNER_URL` | Optional override for the owner connection; otherwise `DATABASE_URL` is the owner |
| `C2C_DB_MODE` | Recommended `neon` for a Neon-backed Codespace; `local` is only for explicit local development |
| `ANTHROPIC_API_KEY` | If using approved-category Anthropic model routes for regulated drafting; production still requires PQ |
| `OPENAI_API_KEY` | OpenAI API for authorized tasks. It **does not by itself unlock high-risk AnA/CSR/IND drafting** |

The Codespaces image no longer hardcodes an old Neon production branch or overrides the application DSN with a local-environment secret variable. An old `DATABASE_NEON_NEW_SECRET` is not silently used as both owner and app credentials. Confirm the actual Neon endpoint and set the explicit names above.

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
- `DB_OWNER_URL_MISSING` or `DB_RUNTIME_URL_MISSING`: set the intended Codespaces secrets.
- `DB_TARGET_MISMATCH`: owner and app accounts point to different databases or branches.
- `DB_NEON_TLS`, `DB_DNS_FAILED`, `DB_AUTH_REJECTED` or `DB_UNREACHABLE`: inspect the actual Neon connection.
- `DB_SCHEMA_OR_GRANTS_NOT_READY`: schema, RLS-sensitive runtime permissions, audit store or pgvector are not qualified.

If the database is truly new, use the existing [DB readiness procedure](DB_READINESS.md) against an **authorized empty development database** with owner and app roles. Do not run `install-fresh` against a production or shared Neon branch to make a green test appear.

Once the doctor passes:

```bash
npm run dev
# In a separate Codespaces terminal:
npm run codespaces:doctor -- --check-app
```

`/readyz` must establish real dependencies; `/healthz` or a Codespaces "ready" banner is not enough. The app start path no longer changes the DB URL from a stale `.env`, prints DSN passwords, creates a local database, or suppresses failed remote connectivity.

## 3. Distinguish OpenAI billing from Concept2Cure governance

Authentication-only (no model-generation charge):

```bash
npm run codespaces:doctor -- --probe-openai
```

For a deliberately **billable**, minimal API call to distinguish an exhausted quota from a transient rate limit, only when the operator approves:

```bash
npm run codespaces:doctor -- --probe-openai-usage
```

Responses are reported as codes without credentials:
- `OPENAI_KEY_MISSING` or `OPENAI_KEY_INVALID` — credential configuration/revocation.
- `OPENAI_QUOTA_OR_BILLING` — available project credits, payment method or spending limit.
- `OPENAI_RATE_LIMIT` — throughput limit, which does not necessarily imply no credits.
- `OPENAI_ORGANIZATION_OR_PROJECT_POLICY` — organization/project access rules.
- `APP_NOT_READY` with `anaState: no_high_risk_model` — **Concept2Cure's** own high-risk approval gate, not an OpenAI API ban.
- `NO_PQ_QUALIFIED_MODEL` — production performance qualification required before model-backed regulatory drafting; NEVER bypass by changing `approvedForHighRisk` without evidence.

The old Replit-era startup document's assertion that OpenAI quota "is currently exceeded" was historical and cannot establish your current API account balance.

## 4. Regression and remaining acceptance

```bash
npm run codespaces:doctor:test
bash -n scripts/startup.sh .devcontainer/post-start.sh .devcontainer/post-create.sh
```

The app must still pass a **live authenticated browser** journey before any client demonstration is described as qualified: Project → Vault/Data Room → approved and frozen study data → AnA model draft → governed editor save/reopen → independent scientific review → export and reopen the resulting CSR. These checks deliberately do not fabricate scientific approval, electronic signatures, model PQ, or a completed trial.
