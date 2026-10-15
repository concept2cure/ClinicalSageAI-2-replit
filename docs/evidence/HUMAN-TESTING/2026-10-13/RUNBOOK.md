# Human testing: how to bring concept2cure-v2 up, and what is testable

**Date** 2026-10-13. **Branch** `concept2cure-v2`. **Verified on** commit `81084c377`
(plus the trunk merges around it). This was run end to end on this machine; every
figure below is an observation, not an expectation.

---

## 1. Bring it up

Four commands. The second and third are both required — see the notes.

```bash
createdb c2c_human        # or any fresh database

# (a) schema from empty, WITH a real non-superuser runtime role
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/c2c_human?sslmode=disable" \
APP_SERVICE_DB_PASSWORD="<choose one>" \
SEED_DEMO_USER=1 \
node scripts/db/install-fresh.mjs

# (b) the out-of-band migration set — NOT optional
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/c2c_human?sslmode=disable" \
APP_SERVICE_DB_PASSWORD="<the same>" \
node scripts/db/deploy-migrate.mjs

# (c) boot, production-shaped
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/c2c_human?sslmode=disable" \
APP_DATABASE_URL="postgresql://app_service:<the same>@127.0.0.1:5432/c2c_human?sslmode=disable" \
RLS_ENFORCE=on EXPORT_REVIEW_GATE=enforce NODE_ENV=development ALLOW_DEV_AUTH=1 \
PORT=5000 SESSION_SECRET=dev-session-secret \
JWT_SECRET=dev-jwt-secret-32-char-minimum-value \
REFRESH_TOKEN_SECRET=dev-refresh-token-secret-32-char-min \
CONCEPT2CURE_SIGNER_MODE=dev \
npx tsx server/index.ts
```

Then open **http://127.0.0.1:5000** and click **Demo access** under "DEV ONLY".

### Why each env var is there, not cargo cult

- **`APP_SERVICE_DB_PASSWORD` on (a)** mints the `app_service` role. Without it
  `install-fresh` ends with a warning that is easy to skim past and matters a
  great deal: with a single-role posture *"Postgres exempts a table owner from
  its own policies unless FORCE ROW LEVEL SECURITY is set, so on this database
  the policies on every RLS-enabled, non-FORCE table are inert and its rows are
  readable across tenants."* Testing tenant isolation as the owner tests nothing.
- **(b) is not optional.** `install-fresh` says so itself: without the
  out-of-band set *"the routes reading those tables fall back to sample data."*
  Human testing against sample data is worse than no testing.
- **`APP_DATABASE_URL` on (c)** is what makes the app connect as the
  non-superuser. Verified live: `pg_stat_activity` showed `app_service` holding
  3 connections and only `psql` as `postgres`.
- **`RLS_ENFORCE=on`** turns the policies from documentation into enforcement.
- **`ALLOW_DEV_AUTH=1` + `NODE_ENV=development`** are both required for the
  Demo access button; the dev-login endpoint 404s (not 403) without them.
- **`SEED_DEMO_USER=1`** is for test environments only — it creates a
  known-password admin. `install-fresh` tells you to leave it unset in
  production, and that is correct.

---

## 2. What came up

```
install-fresh    EXIT 0 · 808 public tables · 1006 RLS policies
                 tenant isolation: every integer tenant-keyed table is policied ✓
                 runtime role app_service: LOGIN · non-superuser · NOBYPASSRLS
                   · USAGE on all application schemas · can read tenant tables ✓
deploy-migrate   EXIT 0 · 375/375 · "safe to roll services"
                 tenant_isolation_policy 19/19 · grant audit 1299/1299 relations
```

### Health

| endpoint | result |
|---|---|
| `GET /healthz` | **200** `{"ok":true}` |
| `GET /readyz` | **503** — `failed: ["ana"]` |

`/readyz` is red **on purpose and honestly**: database ok, schema ok, storage ok,
redis/worker skipped, and `ana: down` with `anaState: "no_provider"` —

> "No AI provider is configured. Set `ANTHROPIC_API_KEY` (or
> `AI_BEDROCK_ENABLED` / `AI_VERTEX_ENABLED`) — without one, every AnA turn
> returns 503 GATEWAY_UNAVAILABLE. `OPENAI_API_KEY` or `KIMI_API_KEY` alone
> answer chat but not regulatory drafting, which only an `approvedForHighRisk`
> model may serve."

This is the one thing blocking a whole testing lane. **See §4.**

### Authenticated session

`POST /api/auth/dev-login` returns a real JWT (`organizationId: 2`, `role: admin`,
a session id). `GET /api/auth/me` → **200**:

```json
{"email":"…","displayName":"JM Smith","roles":["admin","user"],
 "permissions":["governed:write","report:finalize","audit:attest"],
 "organizationId":"2","organizationName":"Concept2Cure Therapeutics",
 "signing":{"authenticatorRequired":false,"authenticatorEnrolled":false}}
```

### API surfaces, as that session

| endpoint | result |
|---|---|
| `/api/projects` | 200 — the org's own project only |
| `/api/task-management/board` | 200 `{data:[], total:0, meta:{partial:false, unreadSources:[]}}` |
| `/api/audit-trail/ledger` | 200 — zero counts with chain metadata |
| `/api/artifacts-center` | 200 `{data:[], total:0}` |
| `/api/project-home/1` (another org's project) | **404 `PROJECT_NOT_FOUND`** |

Note `partial: false` and `unreadSources: []` — the board is reporting that its
emptiness is complete rather than truncated. That is the honest-state contract
working, and it is what §3 is checking.

### UI, driven in a real Chromium

Sign-in page renders (styled, i18n picker, DEV ONLY / Demo access). After Demo
access, `/concept2cure` shows "Good afternoon, JM", org "Concept2Cure
Therapeutics", and an honest **"No programs yet"** rather than seeded demo data.

Three launch-catalog surfaces walked, **zero 5xx and zero page errors across the
whole walk**:

- `/concept2cure/submission-center` — Submissions, Planner, Builder, Sequences,
  Validation, Shadow review, Dispatch
- `/concept2cure/cmc` — Overview, Substance & product, Specifications,
  Stability, Batch records, Change control, Quality by design, Module 3 build
- `/concept2cure/program-journey` — "No program journey data yet. Once a program
  is provisioned for this organization…"

Screenshots are committed beside this file: `c2c-shell.png` (sign-in),
`c2c-authed.png` (home, authenticated), `c2c-submission-readiness.png`,
`c2c-cmc-module-3.png`, `c2c-program-journey.png`.

The Submission center's device panel is worth seeing, because it is the
four-state discriminator rather than a fabricated percentage:

> "510(k) device assembly readiness: **nothing assemblable yet** · 11 required
> sections missing · **applicability of 7 sections not established** (other
> pathways not assessed here)"

"Missing", "not established" and "not assessed here" are three different claims,
and the surface keeps them apart.

---

## 3. Tenant isolation, proven through the running app

Not from a unit test — through the real server, as `app_service`, with
`RLS_ENFORCE=on`. Two projects seeded directly in the database, one per
organisation:

```
org1: ORG1-SECRET-must-not-be-visible
org2: ORG2-VISIBLE-concept2cure
```

`GET /api/projects` as the **org-2** admin returned `ORG2-VISIBLE-concept2cure`
and nothing else. Occurrences of `ORG1-SECRET` in that response: **0**. And
`/api/project-home/1`, a project id belonging to org 1, answered
**404 `PROJECT_NOT_FOUND`** — fail closed, not a leak and not a 500.

This is the end-to-end check that the session's isolation work (parent-scoped
child RLS, the `citation_chains` tenant key, the `capa_records`/`q_submissions`
spec and their five descendants) holds in a running application rather than only
in the migration.

---

## 4. What a tester cannot exercise yet

**AnA / any AI-assisted drafting.** No provider credential is configured in this
environment, so `/readyz` is 503 on `ana` and every AnA turn will return
`503 GATEWAY_UNAVAILABLE`. The composer is visible on the home surface and will
refuse — which is correct behaviour, not a bug, but it means the whole
conversational and drafting lane is untestable until a key is set.

To open that lane: set `ANTHROPIC_API_KEY` in the environment's secrets (or
enable Bedrock/Vertex). Per RULE 2 only an `approvedForHighRisk` model may serve
regulatory drafting, so a chat-only provider will not unlock Authoring.

**Everything data-driven starts empty.** `SEED_DEMO_USER=1` creates the admin
and nothing else; there is deliberately no demo programme, document or
submission. A tester's first act has to be creating a project ("Start a new
Biotech & Pharma project"), because every surface honestly reports nothing until
a programme exists. If you want a populated starting state for testers, that is
a seed decision to make explicitly — and under RULE 1 reference data only
reaches a deployed database through a file in `C2C_MIGRATION_FILES`.

**Trunk CI has not confirmed any of this.** The GitHub organisation's
hosted-runner concurrency has produced zero completed `CI` runs in over twelve
hours. Everything above is a local observation on a database built from empty.
