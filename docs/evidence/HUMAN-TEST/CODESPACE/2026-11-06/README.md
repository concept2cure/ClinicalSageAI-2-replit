# A Codespace that sets itself up, run in this container (2026-11-06)

Launch row D1/D2, package L1. The founder had the model keys and "can't get it to work" in a Codespace. This
record shows `.devcontainer/post-create.sh` and `.devcontainer/post-start.sh` being run from a clean state, and the
app being used in Chromium afterwards. The founder's steps are in
[`docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md`](../../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md),
under "Open a Codespace".

**Outcome.** Both scripts exited 0 on a new PostgreSQL cluster with an empty state directory, at `020af067`:
- post-create took 1m22s here (npm's cache was warm).
- post-start took 11m01s: the database came up, the app started, the demo was seeded and the CSR study prepared.
- A second post-start took 4s: it applied migrations again and found the app running.

In Chromium the walk went Demo access sign-in → Home → Projects (seven projects) → the CDISCPILOT01 project → AnA →
the CSR document in the editor, where **Build CSR draft** is offered over the frozen study data.

**There was no model key here.** AnA answers "No AI provider is configured", `/readyz` answers 503 with only `ana`
down, and no model output was produced or shown.

## What already exists (RULE 3)

| Path | What it did before this change | What it does now |
|---|---|---|
| `.devcontainer/devcontainer.json` | Node 22 bookworm image, `C2C_CODESPACE=1`, `RLS_ENFORCE=on`, forwarded 3000/5000/5173/8000/5432 | Forwards 5000 only, with `openBrowser`. Sets `hostRequirements` to 4 cores / 16 GB. Opens the Codespaces doc. |
| `.devcontainer/post-create.sh` | `npm ci` and the doctor's self-tests; no database | The steps below, plus the shared helpers post-start sources |
| `.devcontainer/post-start.sh` | Ran the doctor only, and said "NEVER claim the app started" | Database, migrations, app, demo data, CSR study. Claims "serving" only after `/readyz` says so. |
| `scripts/db/provision.mjs` (`npm run db:provision`) | Empty database → readiness contract; a re-run is deploy-migrate | Unchanged. Called as the owner, in a subshell. |
| `scripts/seed-admin.mjs` | Creates or resets an admin on a local database | Unchanged. Creates the three demo people (owner subshell). |
| `scripts/startup.sh` `main()` + `scripts/ops/codespaces-doctor.mjs` | Codespaces gate: requires `APP_DATABASE_URL`, refuses owner credentials | Unchanged. It is the gate `npm run dev` passes. |
| `server/startup/env.ts` `assertCodespacesNoOwnerCredential` | Refuses owner credentials at boot | Unchanged |
| `server/auth/dev-auth-policy.ts`, `Concept2CureLogin.tsx` (`VITE_DEV_LOGIN_EMAIL`) | **Demo access** under **Dev only** when `ALLOW_DEV_AUTH=1` in development | Configured by `app.env` |
| `scripts/demo/launch-demo/seed.mjs` + `lib.mjs` | Demo packs through the API; manifests written into `docs/evidence/DEMO/` | Takes `DEMO_MANIFEST_ROOT`. The Codespace writes its manifests to its state directory, not over committed evidence. |
| `scripts/cre/fetch-cdisc-pilot-adam.mjs` | Fetches the CDISC pilot ADaM files, checked against pinned SHA-256 | Unchanged. Fetches into `~/.concept2cure-codespace/cdisc-pilot`, outside the repository. |
| `docs/evidence/DEMO/2026-11-05-csr-lifecycle/walk.cjs` (+ `walk-prepare.cjs`) | The CSR demo's preparation, walked in a browser | `DEMO_PREPARE_UNTIL=freeze` stops it before the build, so the setup never spends the founder's key. Its codespace log and screenshots are gitignored. |
| `docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md` | The only Codespaces doc (manual setup) | Gains "Open a Codespace": secrets, branch, wait, sign in, AnA drafting a CSR |

Searches run: `codespace` across `README.md`, `AGENTS.md` and `docs/**` (one doc, the one above); `dev-login`,
`VITE_DEV_LOGIN_EMAIL`, `seedGaDemoUser`, `seed-admin`, `MANIFEST_ROOT`, `ALLOWED_ORIGINS`, `listen(`. No new script,
route, table or screen was added.

## What the scripts do

**post-create.** The steps run in this order:
1. `npm ci`, then the doctor's self-tests.
2. Install PostgreSQL 16 + pgvector: the distribution's packages when it has both, otherwise the PGDG apt repository.
3. Create a UTF8 cluster listening on localhost.
4. Generate passwords with `openssl rand -hex`.
5. Write two files under `~/.concept2cure-codespace/`. The directory is 0700 and the files 0600, outside the repository:
   - `owner.env`: the owner DSN and the app_service password. Only `c2c_with_owner_env` reads it, in a subshell.
   - `app.env`: the app_service DSN, random JWT/refresh/session secrets, `ALLOW_DEV_AUTH=1` and the demo identities.
     It holds no owner credential.
6. Create the superuser `c2c_owner` and the database `concept2cure`.
7. Run `npm run db:provision`.
8. Create three fictional people with `scripts/seed-admin.mjs`:
   - `ana.author@concept2cure.pro`
   - `rhea.reviewer@concept2cure.pro`
   - `ava.approver@concept2cure.pro`
9. Install Chromium only if Playwright's browser is missing.

**post-start.**
- Starts the cluster and runs `db:provision` again, which applies new migrations.
- Starts `npm run dev` with `setsid nohup`, logging to `/tmp/concept2cure-app.log`. The environment is `app.env`,
  `NODE_ENV=development` and `ALLOWED_ORIGINS` (the forwarded `https://$CODESPACE_NAME-5000.$domain` and the
  loopback origins). Every owner name the doctor refuses is removed with `env -u`, and a name that was set is
  reported (never its value).
- Waits until `/readyz` reports database and schema ok, then prints its verdict.
- Seeds the demo packs once.
- Fetches the CDISC pilot data and prepares the CSR study once.
- Prints the URL and how to sign in.

## What was run (this container)

This container is Ubuntu 24.04, not the devcontainer image:
- **Docker** has no running daemon here.
- **`deb.debian.org`** (the image's apt source) and **`apt.postgresql.org`** were refused by this session's egress
  proxy. So the image and its PGDG install path could not be exercised. `mcr.microsoft.com` was reachable.
- **The scripts were therefore run directly**, with the devcontainer's `containerEnv` (`C2C_CODESPACE=1`,
  `RLS_ENFORCE=on`, `C2C_ENVIRONMENT=development`, `C2C_AGENT_MODE=active`, `HOME=/root`) and the Codespaces variables
  (`CODESPACES=true`, `CODESPACE_NAME=proof-codespace`, `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN=app.github.dev`).
- **PostgreSQL 16 + pgvector** came from Ubuntu's packages, the same `postgresql-16-pgvector` package name the PGDG
  path installs.
- **Port 5433, not 5432.** This sandbox runs its own PostgreSQL on 5432 (`/var/lib/postgresql/c2c-local`), so the run
  used `C2C_DB_PORT=5433`. A Codespace has nothing on 5432. The script names that conflict as BLOCKED rather than
  failing obscurely.
- **A planted `DATABASE_URL`** (`postgresql://planted:planted@example.invalid/x`) was in post-start's environment. It
  was reported as "Not passing DATABASE_URL to the app". In the server processes `DATABASE_URL` is the empty string
  `startup.sh` exports in Codespace mode, which the doctor and the boot check treat as absent.

Logs (credentials masked; none were present): [`post-create.log`](post-create.log), [`post-start.log`](post-start.log),
[`post-start-restart.log`](post-start-restart.log). The browser walk is [`walk.cjs`](walk.cjs) and its log is
[`screenshots/walk-log.txt`](screenshots/walk-log.txt).

## What passed

| Check | Result |
|---|---|
| post-create from no cluster and no state | exit 0. Provisioned, and the readiness contract was verified as `app_service`. |
| post-start from cold | exit 0. `/readyz` reported serving, not ready: `ana` (`no_provider`); database, schema and storage ok. |
| post-start again | exit 0 in 4s: install-fresh skipped, deploy-migrate run, the app found running |
| The app's database role | 21 connections, all `app_service` (`rolsuper=f`, `rolbypassrls=f`) |
| The app's environment | No `DATABASE_OWNER_URL`, `APP_SERVICE_DB_PASSWORD` or owner password. `DATABASE_URL` empty. |
| The Codespaces doctor gate in `npm run dev` | passed: DB contract, JWT and `RLS_ENFORCE=on` |
| State files | `~/.concept2cure-codespace` is 0700, `owner.env` and `app.env` 0600. No generated secret appears in the repository. |
| Demo seed (`--pack all`) | biotech 199 created, lumen 39 created, mdx seeded. Manifests went to the state directory. `git status` stayed clean. |
| CDISC pilot fetch | 10 files, each matched its pinned SHA-256 |
| CSR study preparation (walk.cjs `prepare`, until freeze) | passed in all six steps: project created; seven files uploaded; each sent, review-signed and approved by three people; M5 lists the CSR once; the CSR shows "Build from the study's data"; the manifest frozen as the document's study data |
| Browser | Demo access → Home → Projects (7: the CDISCPILOT01 study and 6 `[Demo …]` projects) → project → AnA → the CSR editor, with **Build CSR draft** visible |
| `npm run codespaces:doctor:test` | 36/36. The new test fails, as it should, when an owner URL is put into `app.env` and when the app is started without the owner-name removals (both mutations reverted). |

Screenshots (1440×900 at 2×): [`01-sign-in`](screenshots/01-sign-in.png), [`02-home`](screenshots/02-home.png),
[`03-projects`](screenshots/03-projects.png), [`04-project`](screenshots/04-project.png),
[`05-ana-composer`](screenshots/05-ana-composer.png), [`06-ana-answer`](screenshots/06-ana-answer.png),
[`07-csr-build-from-study-data`](screenshots/07-csr-build-from-study-data.png).

## Blocked or not done, by name

- **No model key in this container.** The founder's `ANTHROPIC_API_KEY` is what makes AnA draft. Here:
  - `06-ana-answer` shows the app's honest refusal.
  - `/api/ana-ri/stream` answered 503, the only 5xx in the walk.
  - The CSR build was not started.

  `/readyz` itself says `OPENAI_API_KEY` alone answers chat but not regulatory drafting. The doc says so.
- **The devcontainer image was not run.** There is no Docker daemon, and the image's apt sources were refused (above).
  The PGDG branch of `c2c_install_postgres` is written from the PostgreSQL project's published instructions and was
  not executed here.
- **The efficacy transcription is not in the repository.** `cdiscpilot01-efficacy-results.json` would be Tables
  14-3.01/14-3.02 of the published CSR. Without it, the manifest says efficacy was "not supplied". Nothing was invented.
- **Two 429s on `route-candidates`** appeared in the CSR walk's API log. These are the rate limiter during the
  scripted walk; the step passed.
