# The beta stack boots, provisions itself and signs a person in (2026-11-06)

Launch row D1, for human testing. `docker-compose.beta.yml` says it is the stack
for "Human Testing & QA". Before this change it could not start: the app
crash-looped. With the fixes below it:

- comes up from an empty volume;
- provisions its own database, and migrates it on every later `up`;
- reports `/readyz` 200;
- lets the first administrator be created and sign in through the UI, with the
  emailed code, over HTTPS.

## What already exists

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| Beta stack | `docker-compose.beta.yml` | db (pgvector), redis, clamav, app built from `Dockerfile.optimized`, the production boot contract | No TLS on db; no provisioning; no embedding lane; no setup token |
| Production image boot | `ci.yml` job `production-image-boot` | Builds both image targets, provisions an empty TLS database with the provision image, boots the app as `app_service`, signs a person in (`scripts/ci/image-boot-signin.mjs`) | Never ran the Compose file |
| One-command provisioning | `scripts/db/provision.mjs` (`npm run db:provision`), the image's `provision` target | Empty database to readiness contract | Its re-run over a complete database hung (below) |
| Verified TLS to Postgres | `server/db/ssl.ts` | Production turns `sslmode=require` into `verify-full`, and refuses `prefer`/`disable` for any non-loopback host | n/a |
| Self-hosted embedding lane | `terraform/modules/embedding-service` (TEI, BAAI/bge-m3), `EMBEDDING_PROVIDER=local` | Serves Vault and knowledge-base search for every organisation on the hosted stack | Absent from the beta stack |
| First-run setup | `server/routes/setup.ts` | Creates the first organisation and administrator; production requires `SETUP_TOKEN` | Not passed by the beta stack |
| Compose boot contract | `scripts/ci/check-compose-boot-contract.mjs` | Holds both production Compose stacks to the deploy preflight's variable list | Does not boot them |

Nothing was built beside these pieces. The beta stack now runs what CI's image
boot and the hosted stack already run.

## Red: the stack as committed

Run on `6f4e54d7b6` with throwaway values in every required variable.

- The app crash-looped: six restarts in 45 s, each on `The server does not
  support SSL connections`.
- The cause is the pgvector image. It serves no TLS by default (`SHOW ssl` →
  `off`). The file's comment said it did.
- Even with TLS on, two things would still have failed:
  - production verifies the certificate (`verify-full`);
  - the server creates no schema (MR-03 OPS-16), and nothing in the file
    provisioned the database.

## The fixes

**`docker-compose.beta.yml`**
- **`db-tls`**, a one-shot service, mints a self-signed certificate for the name
  `db`. The key sits on `dbtls-key`, which only `db` mounts; the certificate sits
  on `dbtls`.
- **`db`** serves TLS with that certificate (`ssl=on`).
- **`provision`** is a one-shot service on the image's own `provision` target. It
  runs `npm run db:provision` as the owner over `verify-full`, and the app waits
  for it to finish successfully. This is ci.yml's provision step.
- **The app** trusts the db certificate (`NODE_EXTRA_CA_CERTS`, `PGSSLROOTCERT`).
  It no longer holds the owner's `DATABASE_URL` or `APP_SERVICE_DB_PASSWORD`: it
  serves as `app_service` only, as CI's image boot runs it.
- **`embeddings`** is Text Embeddings Inference serving BAAI/bge-m3, configured
  as `terraform/modules/embedding-service` configures it. The app has
  `EMBEDDING_PROVIDER=local` and `EMBEDDING_LOCAL_BASE_URL=http://embeddings:8080/v1`.
  - Without it, `/readyz` said `ana: needs_election`.
  - Vault search was refused for every organisation, because production embeds
    on OpenAI only for an organisation whose placement policy elects it.
- **`SETUP_TOKEN`** is required, so the operator can create the first
  administrator. Without it, `POST /api/setup/initialize` stays closed in
  production.
- **Host size:** about 16 GB of RAM and 4 vCPUs (app, scanner and embeddings).
- **Published ports are loopback only:** Postgres, Redis (which has no password here) and the app's plain-HTTP port. They were published on every interface, so a VM with a public IP would have offered Redis to the internet. Testers reach the app through the HTTPS front on the same host. Re-verified after the change: `/readyz` is 200 through the front.

**`scripts/db/provision.mjs`**
- Over a complete database, install-fresh is now skipped. Deploy-migrate and the
  readiness contract run, which is what every later deploy runs.
- Before this, the second `up` failed. Install-fresh's `drizzle-kit push` waited
  on a prompt until it was killed after 5 minutes (exit 6).
- A partial database still runs install-fresh, with its warning, as before.

**`.env.beta.example`**
- `verify-full` in `APP_DATABASE_URL`.
- `SETUP_TOKEN` added.
- The provisioning and embedding notes now match the stack.
- The "external DATABASE_URL" line is gone; the app no longer reads it.

## Green: what was run

This session cannot build either image target or run TEI, because its network
refuses those hosts:
- `deb.debian.org` returns 403, which blocks both images' `apt-get` steps;
- `pkg-containers.githubusercontent.com` returns 403, which blocks TEI's image.

So three services ran substitutes, through an override file kept outside the
repository. Everything else is the committed file: services, variables,
volumes, dependencies, networks and the scanner image.

| Service | Ran here as | Why that is enough |
|---|---|---|
| `app` | `node:22-slim` at the image's digest, running `node dist/index.js` on this commit's `npm run build` | Same base, same command. The image itself is built and booted by ci.yml `production-image-boot` |
| `provision` | `npm run db:provision` inside `pgvector/pgvector:pg15` (for `psql`), with Node 22 | Same command, same variables |
| `embeddings` | A stand-in answering TEI's `/health` and `/v1/embeddings` (1024 values, model `BAAI/bge-m3`, base64 honoured) | Proves the app's wiring only. Its vectors carry no meaning |

Two more sandbox-only pieces stood in for what a tester's host provides:
- an HTTPS front (Caddy, `tls internal`, `https://localhost:5443`);
- an SMTP catcher (Mailpit, implicit TLS on 465, its certificate added to the
  app's trust).

A third substitution concerns storage. Mounting the repository over `/app` hides
the image's `appuser`-owned `/app/storage`, so the sandbox `chown`ed the vault
volume. The image seeds that volume itself (`Dockerfile.optimized` creates
`/app/storage/vault` owned by `appuser`).

Results:

1. **From empty volumes:** `db-tls`, then `db` healthy, then `provision` (empty
   database: install-fresh, deploy-migrate, readiness contract; exit 0), then
   `app`.
   - `/readyz` is 200 with every dependency `ok`: database, schema, ana,
     storage, virusScan, redis, worker.
   - `/healthz` is 200.
2. **A second `up` over the same database:** `provision` says "install-fresh —
   skipped", deploy-migrate runs, the contract holds (exit 0), and the app
   starts.
   - Before the `provision.mjs` change, this step failed with exit 6.
3. **`scripts/ci/image-boot-signin.mjs` against the stack**, as ci.yml runs it:
   - sign-in asks for the second factor;
   - a wrong code is refused (401);
   - the authenticator code gives a session, and `/me` answers;
   - a project is created (201);
   - EICAR is refused by the scanner (400 `FILE_SCAN_REJECTED`);
   - a clean PDF is scanned and filed (201).
4. **First administrator, through the HTTPS front:**
   - without the token: 403 `SETUP_TOKEN_INVALID`;
   - with it: 201;
   - a second call: 409 (closed).
5. **In Chromium, through the HTTPS front:**
   - the login page loads;
   - email and password lead to the code screen;
   - the emailed code "Your Concept2Cure verification code" arrives at the
     catcher;
   - typing it signs the administrator in to Home (`signed-in-home.png`);
   - Projects shows its empty state (`projects-empty.png`).
   - No page errors and no 5xx responses.
   - One console line: the CSP refused an inline style on the login page. Nothing
     visible is affected.

6. **A tester invited, on the stack rebuilt from trunk `41269e082e`:**
   - Home → "Invite your team" opens the admin console. Invite member (Reviewer)
     → Send invite.
   - The email "admin@beta.example.invalid invited you to Beta Sponsor on
     Concept2Cure" arrives. Its link opens "Set a new password".
   - The tester sets a password and signs in with the emailed code. They reach
     Home as Tess Tester, in Beta Sponsor (`tester-signed-in-home.png`).
7. **A first project, through the UI:** New project → Investigational New Drug
   Application → name, product, indication, product type (required) and
   objective → Review & create → Create project.
   - The project page opens with its six steps, the objective (version 1) and
     its work areas (`first-project-created.png`).
   - No page errors and no 4xx or 5xx API responses in steps 6–7.

Gates on the changed files:
- `ci:compose-boot-contract` and its selftest pass;
- `ci:runtime-ddl` passes;
- `ci:image-hardening` passes;
- `server/db/__tests__/readiness-contract.test.ts` passes, 18 of 18.

## Running it for testers (one VM)

1. **A Linux VM** with 16 GB of RAM, 4 vCPUs, 60 GB of disk and Docker with
   Compose. Point a DNS name at it, for example `beta.example.com`.
2. **Configure:** `cp .env.beta.example .env.beta`, then fill every value.
   - Generate each secret independently: `openssl rand -base64 48 | tr -d '\n='`.
   - `APP_URL`, `ALLOWED_ORIGINS` and `MCP_PUBLIC_URL` are `https://beta.example.com`.
   - `SMTP_*` come from a real provider (SES, Postmark, …): login codes and
     invitations are emailed.
   - `ANTHROPIC_API_KEY` is the organisation's key. It goes in this file on the
     VM, never in a chat.
3. **Start:** `docker compose -f docker-compose.beta.yml --env-file .env.beta up -d --build`.
   - The first `up` builds the image, provisions the database, and downloads
     the scanner's signatures and the embedding model.
4. **TLS in front:** `caddy reverse-proxy --from beta.example.com --to localhost:5000`.
   It obtains and renews the certificate.
5. **The first administrator, once:**

   ```
   curl -X POST https://beta.example.com/api/setup/initialize \
     -H 'Content-Type: application/json' \
     -H 'Origin: https://beta.example.com' \
     -H "X-Setup-Token: $SETUP_TOKEN" \
     -d '{"email":"…","password":"…","name":"…","organizationName":"…"}'
   ```

   The password may not contain the person's name, email or organisation.
6. **Invite the testers:** sign in, then use Home → "Invite your team".

## The self-host install, the same fix (second change)

`docker-compose.yml` had the same defects. Run as committed, the app
crash-looped five times on `The server does not support SSL connections`. Its
`sslmode=prefer` is refused for host `db` in production in any case, and
nothing provisioned the database or embedded text.

It now carries what the beta stack carries:
- `db-tls`, TLS on `db`, and `provision`;
- the app trusting the certificate and serving as `app_service` only;
- `embeddings`;
- `SETUP_TOKEN`;
- Postgres, Redis and the app published on loopback.

Its optional profiles are unchanged. Run here with the same substitutions, from
empty volumes:
- provisioning exits 0;
- `/readyz` is 200 through the HTTPS front, with every dependency `ok`;
- the CI sign-in script passes: second factor, project 201, EICAR 400, clean
  PDF 201;
- a second provisioning run skips install-fresh and exits 0.

`.env.example`'s self-host note now says the same.

## Open
- The image build and TEI were not run here (hosts refused, above). ci.yml
  `production-image-boot` builds and boots the image, but CI on
  `concept2cure-v2` is about two days behind: runs queued on 2026-11-04 were
  finishing on 2026-11-06.
