# Codespaces demo setup and external-Neon recovery

**Scope:** `concept2cure-v2` in `concept2cure/ClinicalSageAI-2-replit`. Use the existing project workflow and one editor. A Codespace editor opening is not application readiness, and a working AI chat is not regulatory drafting qualification.

## 1. Default fresh Codespace: local PostgreSQL and fictional demo data

The repository's `.devcontainer/devcontainer.json` selects Node 22 on Bookworm, requests 4 CPUs, 16 GB memory and 32 GB storage, and forwards port **5000**. Its normal lifecycle is:

1. **Post-create** (`.devcontainer/post-create.sh`) installs PostgreSQL 16, pgvector and the document-export tools; installs the locked npm dependencies; provisions an empty local development database; and creates fictional development and Lumen demo accounts.
2. **Post-start** (`.devcontainer/post-start.sh`) refreshes dependencies and local migrations when needed, starts the server as the non-owner `app_service` role with `RLS_ENFORCE=on`, and seeds the existing demo packs. It prepares the CDISC pilot study through the existing workflow. The Lumen seed includes the three populated synthetic CSRs added on 2026-11-12.
3. In the Codespaces **Ports** panel, open port **5000** in the browser. Sign in through **Demo access**, choosing the fictional Lumen lead, reviewer or approver. The project's **Author** step opens its document in the existing editor.

For an existing Codespace, update only the canonical branch and rerun the existing start script:

```bash
git switch concept2cure-v2
git pull --ff-only origin concept2cure-v2
node --version              # v22.x
bash .devcontainer/post-start.sh
```

Read the script's reported database, seed and AnA outcomes. If it says a seed did not finish, inspect the named log under `~/.concept2cure-codespace/`; do not describe an unfinished seed as ready. Start setup well before the meeting: the fresh November 13 rehearsal took over 20 minutes in post-start while seeding both organizations and respecting API rate limits. The app can serve before every pack finishes; confirm the chosen report is present. Later starts reuse completed seeds when their source is unchanged. After adding or changing Codespaces secrets, stop and start the Codespace so the new process receives them; a browser reload alone does not do that.

**Credential separation in this default local mode:** the setup generates `owner.env` and `app.env` under `~/.concept2cure-codespace/`, outside the repository, with restricted permissions. `owner.env` is sourced only in the provisioning/account-setup subshells. The server receives `app.env`, containing its non-owner runtime DSN and generated authentication secrets; owner/maintenance aliases are removed from the serving environment. Never print either file's values, commit them, or export `owner.env` into the app. A local demo does not require a Neon database secret, and the local helper does not provision a Neon branch.

**A no-model headline is already seeded.** As **Lumen Reviewer**, open **Projects → LMN-201, LMN-801 or LMN-301 → Author**. Each synthetic CSR has 119 populated ICH E3 sections and its own frozen synthetic source. Show the report and its evidence preview. Scientific review, approval and Freeze remain human workflow steps; the seed does not certify its own claims. This demonstrates the seeded document workflow, not a new AnA generation or model qualification. See [the current showcase script](../demo/lumen-showcase.md) and [the three-CSR record](../evidence/DEMO/2026-11-12-three-completed-csrs/README.md).

**Verification status, 2026-11-13:** a fresh official Node 22/Bookworm container passed the real post-create setup with PostgreSQL 16.16/pgvector 0.8.7, the production build and the browser's Lumen reviewer → project → CSR → scientific evidence-preview path. All three reports have 119 populated sections. The current integration receives HTTP 403 `Resource not accessible by integration` from GitHub's Codespaces API, so an actual hosted Codespaces launch remains unverified. Pulling the exact Microsoft devcontainer image also exceeded this executor's Docker storage; the smaller Bookworm rehearsal is a different proof. See [this recovery's evidence](../evidence/F1/2026-11-13-codespaces-demo-continuation/README.md) for lifecycle, readiness and scope limits. No provider key was available, and live AnA generation was not tested.

## 2. External-Neon mode: explicit runtime credentials, separate maintenance

This is the existing manual recovery path for an explicitly selected Neon-backed environment, **not a prerequisite for the default local demo above**. Do not use the local `post-start.sh` launcher as a Neon provisioning command. A Neon database must be prepared in a separate authorized maintenance environment; stop any local app before starting a second server on port 5000.

Configure real repository-accessible **Codespaces** secrets (not GitHub Actions-only secrets), then restart the Codespace. Never put raw values in the repository, chat, terminal history or screenshots.

| Name | Meaning |
|---|---|
| `DATABASE_URL` | **Not permitted in the request-serving app.** An owner/maintenance connection belongs only in a separate authorized maintenance session. |
| `APP_DATABASE_URL` | **Required for external Neon:** intended branch/database through non-owner `app_service`, with `sslmode=require` or `verify-full`; hostname and CA verification stay enabled. Local mode generates its own runtime value in `app.env`. |
| `DATABASE_OWNER_URL` | **Not permitted in the request-serving app.** In external-Neon mode it belongs only in the separate authorized migration/provisioning environment. |
| `C2C_DB_MODE` | `neon` for the explicitly selected external database. The default local lifecycle writes `local` into its generated app state. |
| `RLS_ENFORCE` | Must equal `on`. Codespaces startup refuses off/shadow/unset overrides; runtime database policy execution must also be checked. |
| `JWT_SECRET` or `JWT_SECRET_DEV` | A securely generated authentication secret of at least 32 characters. Local setup generates it; external mode must configure it. The doctor never prints it. |
| `REFRESH_TOKEN_SECRET` | Separate strong authentication secret for staging/production; local setup generates a development value. |
| `ANTHROPIC_API_KEY` | For the optional real AnA/drafting path in either mode, subject to approved-model, tenant-placement and PQ gates. |
| `OPENAI_API_KEY` | For authorized OpenAI tasks and the configured embeddings/search lane. It does not by itself unlock high-risk AnA/CSR/IND drafting. |

The image does not hardcode a historical Neon production branch. The doctor and direct server boot refuse populated owner/admin aliases, including `DATABASE_URL`, `DATABASE_OWNER_URL`, `DATABASE_NEON_NEW_SECRET` and `NEON_DATABASE_URL`, in the **serving app**. Do not copy an owner password into `APP_DATABASE_URL` or weaken TLS/RLS to obtain a green diagnostic. External-Neon startup neither provisions the remote database nor creates privileged demo accounts automatically; use an existing authorized test account or the controlled setup workflow in its separate maintenance environment. This restriction does not describe the isolated local demo provisioning in section 1.

**Historical credential note:** the earlier recovery record identified historical Neon owner credentials for revocation. This document does not establish their current rotation status. Until rotation is confirmed in the Neon account, treat affected credentials as exposed, review affected branches and replace the authorized credentials in their appropriate environments. A source commit or scanner suppression cannot revoke a historical password.

## 3. Fail-closed readiness checks

For the explicit external-Neon path, after provisioning and configuring its runtime/authentication secrets:

```bash
git switch concept2cure-v2
git pull --ff-only origin concept2cure-v2
node --version              # v22.x
npm ci
npm run codespaces:doctor   # read-only: DB target, vector/schema, app-role grants
```

The doctor calls the existing `scripts/db/readiness-contract.mjs` as the serving role. It does not create tables, run migrations, rotate credentials, repair passwords or silently fall back from Neon to local PostgreSQL. Those are distinct from the default local lifecycle's explicit provisioning steps.

Common codes:

- `DB_RUNTIME_URL_MISSING`: in local mode restore the generated state through `post-start.sh`; in external-Neon mode configure the non-owner runtime secret. An owner credential is not a serving prerequisite.
- `DB_OWNER_CREDENTIAL_IN_APP`: remove owner/maintenance credentials from the serving environment and restart it. Do not copy them into `APP_DATABASE_URL`.
- `DB_TARGET_MISMATCH`: owner and app accounts identify different databases or branches.
- `DB_NEON_TLS`, `DB_NEON_OWNER_TLS`, `DB_DNS_FAILED`, `DB_AUTH_REJECTED` or `DB_UNREACHABLE`: inspect the selected external connection; do not disable TLS verification.
- `DB_SCHEMA_OR_GRANTS_NOT_READY`: schema, runtime grants, audit storage or pgvector are not ready. Repair a new authorized local development database through its provisioning owner; repair external Neon only in its separate maintenance environment.
- `RLS_NOT_ENFORCED`: use `RLS_ENFORCE=on` and verify the runtime policies. The doctor reads `current_setting('app.rls_enforce')` from the actual `app_service` connection and refuses an RLS-enabled table it owns without FORCE ROW LEVEL SECURITY. A read-only diagnostic never repairs those policies.
- `JWT_SECRET_MISSING`, `JWT_SECRET_WEAK` or `JWT_ROTATION_INVALID`: restore generated local app state or configure the external environment's authentication secret. A database passing does not establish API authentication.

For a genuinely new external development database, follow [DB readiness](DB_READINESS.md). Never run `install-fresh` on a production or shared Neon branch to manufacture a passing result.

Once the manual external-Neon diagnostic passes:

```bash
npm run dev
# In a separate terminal:
npm run codespaces:doctor -- --check-app
```

`/readyz` must establish real dependencies. The full application diagnostic requires `schemaState=ready`, `anaState=ready`, `capabilityRegistry=seeded`, and database/schema/AnA/storage dependencies each equal to `ok`. A 200 response or `/healthz` alone is insufficient. The default local `post-start.sh` distinguishes an app serving with its database/schema from full AnA readiness: no-key deterministic demo records may be accessible while AnA or search is unavailable. Do not relabel that as a working live model. Neither path may replace a selected remote DSN with a stale `.env`, expose credentials or suppress failed connectivity.

## 4. Distinguish OpenAI billing from Concept2Cure governance

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

**Verify an actual AnA turn separately.** The doctor probes above do not establish that the app's conversation path works. After the running Codespace has received its existing provider secret, load its existing application profile and use the existing verifier for one short ordinary chat turn. This may incur provider API usage:

```bash
set -a
. ~/.concept2cure-codespace/app.env
set +a
npm run verify:ana -- --model gpt-4o-mini --expect-provider openai --require-live \
  --question "Reply only OPENAI_DEMO_OK. Do not use tools or change records."
```

The configured demo identity is used by default; `--email` selects another authorized user and `--project-id` supplies an admitted project. On a deployment without development login, use the existing `ANA_VERIFY_TOKEN` secret instead. Do not print tokens or profile values. The model option remains a governed request: the actual served provider is checked. A LIVE result requires answer text, a completed provider/model receipt and the turn's finalization event; a missing finalization or interrupted response fails. A successful turn does not qualify OpenAI for CSR drafting, scientific review or signatures. See [the completion-check evidence](../evidence/F1/2026-11-13-provider-receipt-completion/README.md).

## 5. Neon automated branch safety

For the external-Neon workflow, the GitHub agent configuration is not a second
authority for model approval or database migrations. It uses `APP_DATABASE_URL`
for the serving app and does **not** auto-run Neon migrations. The default local
Codespace lifecycle provisions only its own local database through the isolated
owner helper described above. Both paths defer regulated model eligibility to
`server/services/ai-governance/approved-models.ts`. A configured OpenAI API key cannot override the high-risk/PQ rules.

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

## 6. Regression and remaining acceptance

```bash
npm run codespaces:doctor:test
bash -n scripts/startup.sh .devcontainer/post-start.sh .devcontainer/post-create.sh
```

Rehearse the path actually being presented in a **live authenticated browser**. For the no-model demonstration: Project → Author → populated synthetic CSR → its frozen source and scientific-review preview; retain the intentional approval/freeze barrier. For live AnA drafting: Project → Vault/Data Room → approved and frozen study data → real AnA model draft → governed editor save/reopen → independent scientific review → export and reopen the resulting CSR. Record actual results separately. A synthetic seed, a Bookworm rehearsal or a startup banner does not establish a hosted Codespaces run, live-provider success, scientific approval, electronic signatures, model PQ or a completed trial.
