# Clean-database proof of the demo seed (2026-11-09)

**Verdict: green.** Six seed runs against a database provisioned from empty
the way `.devcontainer/post-create.sh` and `post-start.sh` provision one, each
exit 0. Run 1 of `--pack all` created everything. Runs 2, 3 and 4 created
nothing except the Module 3 compile on C2C-201, which the biotech pack
recomputes by design. Portfolio run 2 created nothing.

| Run | Command (`--pack`) | Exit | Summary line(s) |
|---|---|---|---|
| all-run1 | `all` (first, creating) | **0** | biotech `created 234, found 1`; mdx all steps `created`; lumen `created 191, found 0` |
| all-run2 | `all` | **0** | biotech `created 1, found 229` (the 1 is `module3-compile`); mdx all `existing`; lumen `created 0, found 153` |
| portfolio-run1 | `portfolio` (first) | **0** | `summary: created 124, found 0, not executed 20, refused 0` ("refused" counts wrong-workspace projects; the two placements the server refused with 409 `CSR_SCIENTIFIC_REVIEW_REQUIRED` are among the 20 not executed) |
| portfolio-run2 | `portfolio` | **0** | `summary: created 0, found 120, not executed 20, refused 0` |
| all-run3 | `all`, after the portfolio's four client workspaces exist | **0** | biotech `created 1, found 229` (`module3-compile`); mdx all `existing`; lumen `created 0, found 153` |
| all-run4 | `all` | **0** | identical to all-run3 (the normalized logs do not differ) |

Times (UTC) and exit codes as recorded at run time: `exit-codes.txt`.

## What already exists

This proof reuses the repository's own paths and adds no code.

- `scripts/db/provision.mjs`, through `npm run db:provision`, takes an empty
  database to the `/readyz` schema contract.
- `scripts/seed-admin.mjs` creates the Codespace's seven fictional sign-in
  accounts.
- `npm run dev` (`scripts/startup.sh`, then `server/index.ts`) starts the app.
- `scripts/demo/launch-demo/seed.mjs` with `packs/*.mjs` seeds the demo. It is
  the same file that `npm run demo:seed` runs.
- The Codespace glue that strings them together is
  `.devcontainer/post-create.sh` (`c2c_write_state`, `c2c_ensure_database`,
  `c2c_provision`, `c2c_seed_accounts`) and `.devcontainer/post-start.sh`
  (`c2c_start_app` and the `demo:seed` block).

## What was run

| Step | As the Codespace does | Here | Log |
|---|---|---|---|
| Database | `c2c_ensure_database`: `CREATE DATABASE … OWNER c2c_owner ENCODING UTF8 LC_COLLATE C LC_CTYPE C TEMPLATE template0` | the same statement for **`c2c_cleanproof_1`**, `OWNER postgres`, on the existing local cluster (127.0.0.1:5432) | — |
| Provision | `c2c_with_owner_env npm run --silent db:provision` | the same command, with the owner env sourced in a subshell | `provision.log`, `provision.exit.txt` |
| Accounts | `c2c_seed_accounts`: `seed-admin.mjs` for the 7-person roster, `DATABASE_URL` = owner URL | the same roster and environment (ana.author creates the organisation; the other six join `concept2cure`) | `accounts.log` |
| App | `env -u <owner names> NODE_ENV=development PORT=… ALLOWED_ORIGINS=… setsid nohup npm run dev`, with `app.env` sourced (`APP_DATABASE_URL` = app_service, `ALLOW_DEV_AUTH=1`, fresh JWT/refresh/session secrets) | the same, `PORT=5100`, with the container env `C2C_CODESPACE=1 C2C_ENVIRONMENT=development RLS_ENFORCE=on C2C_AGENT_MODE=active` | `app-excerpt.log`, `readyz-at-boot.json`, `readyz-at-end.json` |
| Seed | `DEMO_MANIFEST_ROOT=<state>/demo-manifests npm run --silent demo:seed -- --pack all --base-url http://127.0.0.1:$PORT --email $DEMO_SEED_EMAIL` | `node scripts/demo/launch-demo/seed.mjs` with the same arguments, `--email ana.author@concept2cure.pro` (the Codespace's `DEMO_SEED_EMAIL`), `DEMO_MANIFEST_ROOT` in the session scratchpad | `all-run*.log`, `portfolio-run*.log`, `run-seed.sh` |

**Provisioning** finished with exit 0 in 17 s.

- install-fresh ran all 8 of its steps: 839 public tables and 1048 RLS
  policies.
- deploy-migrate applied 466/466 migration files.
- The readiness contract was verified as app_service:
  - critical tables 2/2;
  - security-critical tables 5/5;
  - Part 11 store 1/1;
  - authoring tables 19/19;
  - SELECT reach 27/27;
  - grant audit 1331/1331.

**Accounts.** All seven seed-admin runs exited 0. Users 1 to 7 are in
organisation 2, "Concept2Cure Therapeutics", slug `concept2cure`.

**The app on :5100** loaded commit `8d30ddf6005d…`, as `/api/version` reports.
The Codespace doctor reported `DB_SCHEMA_AND_RUNTIME_GRANTS_VERIFIED`, role
app_service. `/readyz` reported `database: ok` and `schema: ok`, with
`ana: down` (`no_provider`) at both boot and end. That is the state of a
Codespace with no `ANTHROPIC_API_KEY` secret.

## Where this differs from a Codespace, and why it does not change the result

1. **Cluster.** This is the machine's existing PostgreSQL 16.15 with pgvector
   0.6.0, and its `pg_hba` trusts 127.0.0.1. The Codespace uses a fresh PGDG
   cluster with scram. Because of trust, the generated passwords are not
   checked.
2. **Owner role.** The owner is the existing superuser `postgres`, not a newly
   minted `c2c_owner SUPERUSER`. Both are superusers, which is what
   provision.mjs's preflight checks.
3. **`APP_SERVICE_DB_PASSWORD` was not set.** `app_service` already existed on
   this shared cluster (LOGIN, NOSUPERUSER, NOBYPASSRLS), so it was reused.
   - Provision took the refresh path (`refreshRuntimeRoleGrants`) instead of the
     mint path (`provisionAppServiceRole`).
   - Both paths apply the same `grantRuntimeRolePrivileges` recipe. The mint
     path would also have run `ALTER ROLE app_service … PASSWORD`, cluster-wide.
   - The grant audit (1331/1331) and the app's own boot check ran as
     app_service.
4. **`DATABASE_URL` in the provision subshell only.** It was set to the owner
   URL, because this machine has a `.env` whose `DATABASE_URL` names the shared
   `clinicalsage` database, and provision.mjs's `dotenv.config()` would load it.
   - provision.mjs uses `DATABASE_URL` only as a fallback after
     `DATABASE_OWNER_URL`, and `runAsOwner` overwrites it for the child steps,
     so the behaviour is unchanged.
   - The app ran with `C2C_CODESPACE=1`, so `server/config/load-env-files.ts`
     read no `.env` file, as in a Codespace.
   - `startup.sh` took its Codespace branch (doctor only, no `write_env_file`).
5. **No model key and no `OQ_SIGNER_*`.** That matches a Codespace without
   secrets: post-start passes no signer to the seed either. The steps that need
   them are recorded as not executed (listed below).
6. **Not run:** the post-start steps after the seed (idle window, CDISC CSR
   study preparation). They are outside the demo seed.
7. **Working tree.** The server booted at 20:26:08Z from HEAD plus one
   uncommitted edit by another session, in
   `shared/constants/domain/product-types.ts` (DMF workstream bucketing; no pack
   creates a DMF). That session's later edits landed after boot, and tsx does
   not watch, so they were not loaded. They were a shared file and a server file,
   `shared/constants/domain/filing-application-type.ts` and
   `server/routes/c2c/projects.ts`, from 20:34Z on (corrected after the
   independent audit; they were first called client files here).
8. **Side effects outside the new database:**
   - **Roles.** install-fresh's governed-content files created five NOLOGIN
     roles on the cluster: `gcc_admin_migrator`, `gcc_app_reader`,
     `gcc_app_writer`, `gcc_auditor` and `gcc_shadow_agent`. Roles are
     cluster-global. They have no members outside themselves, and 0 grants in
     `clinicalsage`.
   - **Vault files.** The app's local Vault provider added 74 files under
     `storage/vault/2/<uuid>/`. That directory is gitignored and shared with
     the :5000 instance. Keys are UUIDs, and nothing was removed or
     overwritten.
   - **Untouched:** the `clinicalsage` database and the :5000 instance. The
     :5000 server kept the same PIDs and answered `/healthz` 200 after the
     5100 instance stopped.

## Created on run 1 and found later

Full per-kind tallies, from each run's manifest: `tallies.json`.

### biotech pack

- **all-run1 created 234.** In counts per kind:
  - projects: 2 programs;
  - Vault: 6 documents and 6 filings;
  - authoring: 3 documents, 16 sections, 3 comments and 2 resolutions;
  - protocol: 1 document, 10 sections, 6 objectives, 16 criteria, 9 visits,
    6 team members, 10 SoA rows, 51 SoA cells, 6 risks, 5 milestones,
    1 amendment and 1 version;
  - 1 study design;
  - Submission Center: 1 sequence, 6 leaves and 1 transition;
  - QMS: 4 documents, 1 change control and 1 link;
  - CMC: 2 drug substances, 2 drug products, 9 methods, 11 specs, 5 stability
    programmes, 5 stability result sets, 6 batches, 5 QC results and
    1 Module 3 compile;
  - 6 tasks and 5 plan documents;
  - 1 data-room source and 1 agency communication.
- **all-run1 found 1:** the canonical IND submission. Program intake creates
  it, and the pack finds it by program id (commit adc987225).
- **all-run2, 3 and 4:** created `{module3-compile: 1}`, found 229.

### mdx pack

The mdx tally counts tasks only.

- all-run1 created 4 tasks. Every other step reads `(created)`, for example
  "program … (created, scaffold 38 sections)".
- all-run2, 3 and 4 found 4 tasks, and every step reads `(existing)`,
  `already filed` or `0 placed`.

### lumen pack

- all-run1 created 191 records, including:
  - client workspace 4;
  - 4 programs and 29 tasks;
  - the full Quality set;
  - the full RBM set;
  - 4 report runs.
- all-run2, 3 and 4 created 0 and found 153. The found count is lower because
  moves, closes and seeded readings are counted only on creation.

### portfolio pack

- **portfolio-run1 created 124:**
  - 4 client workspaces: 5 Varnhollow, 6 Petrelline, 7 Quillmont, 8 Halcyra;
  - 8 projects, 2 per sponsor workspace;
  - 16 Vault documents;
  - 8 CSR documents with 50 section texts;
  - 24 tasks;
  - 1 study design;
  - 6 comments and 3 resolutions;
  - 2 sequences;
  - 1 data-room source and 1 agency communication.
- **portfolio-run2 created 0 and found 120.** Resolutions and the data-room
  source are not re-counted as found.

### Resulting layout

The resulting layout in `c2c_cleanproof_1` is one client workspace per sponsor:

| Workspace | Projects |
|---|---|
| 2 Concept2Cure Therapeutics | C2C-101 and C2C-201 |
| 3 Concept2Cure Diagnostics (fictional demo) | NeuroPanel-Dx |
| 4 Lumen | 4 LMN programs |
| 5 to 8 | 2 portfolio projects each |

### Changes that recur on every run by design

These are not new records:

- the Module 3 compile;
- the biostatistics study design, shown as `updated`;
- the audit-trail rows those writes produce.

**Correction after the independent audit: run 2 also made 50 one-time writes the
seed's counters cannot see, because the product makes them.** Reading a
project's data-room sources (GET `/api/c2c/projects/:id/sources`, first page)
runs the product's Quality capture (`syncQualityProjectSources`, admitting what
`server/services/qms/project-evidence-queries.ts` returns). In all-run2:
- at 20:34:28 it attached **15 of Lumen's records** (5 suppliers, 4 internal
  audits, 2 management reviews, 4 GMP deviations; `cre_evidence_sources` ids
  166–180) to **C2C-101's data room**, although C2C-101 is in Concept2Cure
  Therapeutics' workspace (2) and Lumen is in workspace 4. The trigger was the
  biotech pack's read of C2C-101's sources;
- at 20:35:27 it attached 35 Lumen records to LMN-201's own data room
  (ids 181–215).
15 of all-run2's 16 chained audit entries are these `data_room.capture` events;
the 16th is `c2c.work.persist`. This is origin's product behaviour (suppliers,
audits and management reviews are read organization-wide; deviations with no
client workspace are admitted everywhere, and the Lumen pack seeds its
deviations without one), not the local commits, and no exit code changes. It
does not repeat on later runs. It is reported to the coordinating session for
the product owner and S6.

**"all-run3 same as all-run2" holds for the summary lines only.** Two audit lines
differ: biotech 16 vs 1 entries (the one-time capture above), and the mdx audit
window. The mdx "113 entries reference pack records" figure is inflated, not
only a window effect: its step matches small integer ids (2, 3, 5–8) as bare
tokens, and these collide with Lumen record ids.

## Not executed (recorded by the packs)

Every `--pack all` run has 20 lines containing "not executed", the count
post-start reports. **Corrected after the audit:** the 20 are 18 missing-signer
steps, the Shadow Review 503 (no model key) and readiness orchestration (outside
the launch catalog). The empty dispatch-QC narrative and the missing QMS
deviation record appear elsewhere in the log and are not among the 20. The
detail:

- **No second signer** (`OQ_SIGNER_EMAIL` / `OQ_SIGNER_PASSWORD`):
  - biotech:
    - review requests on the Protocol Synopsis and on Module 2.5;
    - freeze and e-signature of the Protocol Synopsis;
    - SOP-003 review;
    - CMC method validation on C2C-101 and on C2C-201;
  - mdx:
    - review and freeze of the 510(k) Summary, and its e-signature;
    - the Cybersecurity review;
    - approval of MDX-SOP-101 and MDX-SOP-102;
    - SOP-103 review;
  - lumen:
    - CMC method validation;
    - IB review;
    - approval of LMN-SOP-201 and LMN-SOP-202;
    - RACT approval.
- **No model provider:**
  - Shadow Review answered HTTP 503 on run 1. The failed run is kept, and
    later runs report "1 prior run(s), none completed (failed)".
  - The dispatch-QC narrative is null (`PROVIDER_UNAVAILABLE`) in biotech and
    mdx. The deterministic verdicts still ran.
- **Outside the launch catalog or unsupported:**
  - biotech's readiness-review orchestration (uuid-keyed program; mdx's probe
    answers HTTP 400);
  - the QMS deviation record ("not supported by the QMS API", recorded as a
    finding).

Each portfolio run lists 20 not-executed items and 0 refused:

- the enrolment register (it has no mounted writer);
- for 6 projects, study-source approval and freeze, which need two more
  signers;
- for the same 6 projects, the build from study data and AnA drafting, which
  need a frozen source and a model;
- the formal review on stage e (`REVIEWER_IS_AUTHOR`);
- freeze and e-signature of PTR-022-102 (no signer);
- the CSR placement at m5.3.5.1 on stages g and h. The server refused it with
  HTTP 409 `CSR_SCIENTIFIC_REVIEW_REQUIRED`.
- eCTD compile and dispatch on stages g and h (a person's governed action);
- approval of the information-request response (no signer).

**Known product behaviour recorded by the portfolio pack** (manifest
`knownProductBehaviour`):

- On this clean database, stage h's data room held 15 records from other
  packs:
  - 5 Lumen suppliers;
  - 2 management reviews;
  - 4 internal audits;
  - 4 GMP deviations.
- The capture came from Quality's project-evidence capture.
- No program-less change controls were captured. The local database's 21
  included the C2C-101 and NP-100 change controls. On a clean database, commit
  384e41a30 creates them on their programs from the start.

**Non-fatal notes:**

- The in-memory rate limiter answered 429 and the harness retried:
  - all-run1: 4 times;
  - all-run2, all-run3 and all-run4: once each;
  - portfolio runs: none.
- The app log has 1 error-level line, the expected Shadow Review 503, and
  12 request warnings, all expected:
  - 4 × 404 on the `/frozen` probe;
  - 4 × 409 `file-to-vault` (`CSR_SCIENTIFIC_REVIEW_REQUIRED`);
  - 4 × 400 on the orchestration probe.

## Origin versus local commits

No run failed, so no failure needed attributing.

The seven local commits change only:

- `scripts/demo/launch-demo/**` (the packs, `seed.mjs` and `lib.mjs`);
- four client files (`ProjectHome.tsx`, `ProjectRecordedContext.tsx`,
  `ProjectSide.tsx` and one test);
- evidence.

They do not touch `server/`, `shared/`, migrations, `scripts/db/` or
`.devcontainer/`. So provisioning and the server ran origin's code
(272b2e198), and the seed ran the local commits' packs.

## Left in place

- **Database `c2c_cleanproof_1`** (116 MB) on 127.0.0.1:5432. Drop it with
  `DROP DATABASE c2c_cleanproof_1` when no longer needed. The five `gcc_*`
  roles would then be droppable too.
- **The :5100 instance was stopped** by its session id. All six of its
  processes were gone; nothing else was signalled.

## Files

| File | Contents |
|---|---|
| `provision.log`, `provision.exit.txt` | `npm run db:provision`, with passwords redacted |
| `accounts.log` | the seven seed-admin runs |
| `app-excerpt.log` | error, warning, 5xx and readiness lines of the :5100 server log (first 400), passwords redacted. The full 2.2 MB log was kept out of the repository and stays in the session scratchpad |
| `readyz-at-boot.json`, `readyz-at-end.json` | `/readyz` at boot and at the end |
| `all-run1.log` … `all-run4.log`, `portfolio-run1.log`, `portfolio-run2.log` | the six seed runs |
| `exit-codes.txt` | each run's exit code and times |
| `tallies.json` | per run and pack: outcome, created and found by kind, notes |
| `run-seed.sh` | the exact seed invocation used for every run |
