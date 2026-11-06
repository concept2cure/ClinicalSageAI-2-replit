# Integrated demo-readiness evidence

Plan: F1. This packet now retains both the npm-launcher continuation and the canonical Codespaces/restart lane. Root-level launcher JSON/gzip/browser artifacts and native/qualifier artifacts name their own source and runs. Counts overlap; they must not be added. Neither lane proves live AnA generation without a provider. The source edits converge into the existing project workflow and one editor.

## Npm-launcher continuation

# Codespaces demo rehearsal — 2026-11-06

Plan: F1. Workstream W1, row D2. Deadline: one hour from the founder request (about21:00UTC). Current source: `9c047a1ff919981d8b6e13f2a4c383294fb8a745`. Scope: existing startup, sign-in, project/source/CSR preparation and one-editor actions. No model/agency/deployment call or new surface is authorized by this rehearsal.

## What already exists

- `.devcontainer/post-create.sh` and `post-start.sh` automate local PG16/pgvector, app-role runtime, demo users, canonical app on5000 and CDISC CSR preparation. These and Codespaces doctor files remain held by the Codespace setup owner.
- `scripts/startup.sh` and `scripts/ops/codespaces-doctor.mjs` gate existing npm dev; `server/config/load-env-files.ts` ignores checked-out dotenv files in Codespaces.
- `docs/evidence/DEMO/2026-11-05-csr-lifecycle/walk*.cjs` prepare the existing public CDISC pilot through real project intake, Vault upload/review/approval and the existing CSR editor. `DEMO_PREPARE_UNTIL=freeze` stops before paid drafting.
- `scripts/cre/fetch-cdisc-pilot-adam.mjs` pins original public CDISC files, outside Git. No raw rows or dataset extracts are committed here.
- `DocumentCanvas/DocumentWorkbench/RichSectionEditor` remain the one editor/canvas; no UI layout is changed.
- Current operator instructions are `docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md`; existing Codespace proof is under HUMAN-TEST/CODESPACE/2026-11-06. Neither proves a live provider.

Searches: current code, script/package names, Git history and current coordination. Runtime authoring/CSR code was not duplicated. Initial inspection finds an operational stale-server risk after a pull: post-start retains a healthy process when keys match. The existing documented forced restart is sufficient for this demo; held scripts remain unchanged.

## Rehearsal status

In progress. This executor is a local replica, not the founder's GitHub Codespace. It has no provider keys; no live AnA/complete CSR readiness is claimed. Current API secret setup was asked of the founder; credentials are never requested in chat.


## Observed startup blocker

Actual `npm run dev` with Codespaces flags and the non-owner local runtime role passes the real database/auth/RLS doctor and selects port5100, then exits before serving: `bash: line1: tsx: command not found` (`npm-dev-red.log.gz`, outer rehearsal exit1). Both `dev` and `dev:local` wrap the command in a login shell (`bash -lc`), which discards npm's local executable PATH on this host. Complete those existing launch commands with a non-login shell, preserving the same preflight, command, inspector and warning flags. No dependency or runtime policy changes.


## Launcher verified

The real six-case launcher regression is RED2/4controls before the change and GREEN6/6 afterwards. Tests use a tiny preflight fixture to isolate shell/PATH behavior and the real repositorytsx/Node executable; they do not claim database-policy coverage. Both preflight source23 andmain17 refusals still stop the server. Combined current launch/doctor suite is46/46.

Actual `npm run dev` with Codespaces flags, `app_service` only, RLSon, generated signing secrets and the real Codespaces doctor now serves the existing nativefixture on5100 (`startup-green`,23.893s). In realChromium, actualDemoaccess signs in `ana.author@concept2cure.pro` and Projects opens (two cases,9.823s). This is a local Codespaces replica; the founder's actual GitHub session/secrets are not accessible through the repository integration. Database/schema/storage are ready; AnA is503/no_provider here.

Normal direct publication pending. The launcher fix changes only `bash -lc` to `bash -c` in dev/dev:local; lock/dependencies, inspector, warnings, preflight and productUI are unchanged. Full CSRpreparation will be rehearsed after the urgent source push.


---

## Canonical Codespaces/restart and CSR qualification lane

# Codespace demo readiness repair inventory

Plan: F1. Completes: `.devcontainer/post-start.sh` and
`scripts/ops/codespaces-startup.test.mjs`. Inventory baseline:
`9c047a1ff919981d8b6e13f2a4c383294fb8a745`, canonical `concept2cure-v2`.
Demo deadline is approximately 2026-11-06 20:59 UTC. The root's current cutoff
for a completed repair/push is approximately 20:30 UTC, leaving restart time.
No new feature, broad backend repair or Codespace credential change is in scope.

## What already exists

- `.devcontainer/devcontainer.json` selects Node22, 4 cores/16GB, private
  development startup on port5000, forced RLS, and the existing create/start
  hooks. It points the operator at the existing human testing manual.
- `.devcontainer/post-create.sh` already installs dependencies, PostgreSQL16
  and pgvector, provisions the local database, creates the fictional author,
  reviewer and approver, and installs Chromium for existing CSR preparation.
  Owner and runtime credentials are generated outside the repository and kept
  separate; they are not inspected or changed in this audit.
- `.devcontainer/post-start.sh` already updates dependencies when the lockfile
  changes, runs migrations/readiness, starts the existing app with runtime
  credentials, seeds existing demo packs and the CDISC CSR study, and reports
  actual runtime/AnA state. It restarts a healthy existing app when a newly
  present provider key was absent from that process. Its healthy-app branch
  currently does not compare repository code with the running backend version.
- `server/buildStamp.ts` already caches `BUILD_COMMIT` at backend startup;
  `server/startup/inline-endpoints.ts` already serves that value and startup
  time through public GET `/api/version`. The repair reuses this existing
  mechanism rather than writing another revision stamp or process registry.
- `package.json`'s existing `dev` command sources `scripts/startup.sh`, then
  launches `tsx --inspect=0 server/index.ts`; this is not a watch-mode backend.
  The existing `dev` and `dev:local` commands used a login Bash, which drops
  npm's local binary path in this environment. The root owns their bounded
  `bash -lc` to `bash -c` repair; source/startup `main`/doctor gates stay intact.
  Reusing an older healthy process after a pull is a source-level demo risk
  pending an isolated startup-harness reproduction, not yet a proven live
  Codespace failure.
- `scripts/ops/codespaces-doctor.mjs` checks runtime DB configuration, live
  schema/grants/RLS, auth and optional readiness/provider discovery. It keeps
  blocked provider, degraded schema and missing dependency states distinct;
  no provider or governance gate is weakened for a demo.
- `scripts/ops/codespaces-doctor.test.mjs`,
  `scripts/ops/codespaces-startup.test.mjs` and
  `scripts/ops/codespaces-neon-policy.test.mjs` are the existing offline tests.
  All40 passed under Node22 at initial audit, including Bash syntax, owner
  credential separation, readiness classification and missing-key restart.
  They do not yet exercise a healthy backend from an older repository revision.
- `docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md` already describes
  fresh creation, restarting, actual provider prerequisites, sign-in people and
  the prepared CSR entry. The public CDISC pilot fetch and existing browser
  preparation stop at frozen study data; startup does not invoke paid drafting.
- Coordination currently assigns these startup/manual paths to the earlier
  Codespace setup session. The current root coordinates this deadline repair;
  no other local writer owns these files. No layout or product-screen file is
  changed by this audit.

### Search and deleted history

Read root rules, current F1 ledger and coordination holds; searched Codespace
startup hooks, existing doctor and its three tests, manual, app launch and
existing CSR prepare stop. The clone is not shallow. Ran
`git log --all --diff-filter=D` for `.devcontainer/*` and
`scripts/ops/codespaces*`; no deleted alternate startup implementation appeared.
Extend the existing hook/tests only if a bounded defect is reproduced.

## Bounded contract and evidence status

Investigate a reused Codespace after `git pull`: a healthy backend from an old
revision must not be kept while migrations/client source move forward. First
reproduce that control-flow defect with the existing isolated Bash/Node startup
harness and synthetic process metadata, without a real DB, app launch, secret
read, provider request or Codespace mutation. A fresh Codespace remains covered
by its existing path. Preserve missing-key restart, dependency installation,
owner/runtime separation, readiness wording, seed idempotency and normal PID
shutdown. Key rotation policy is outside this repair.

The accepted bounded restart contract reuses a healthy process only when both
local HEAD and `/api/version` carry the same complete40-hex commit. Missing,
malformed, unreadable or different served commits use the existing stop/start
path. A newly present key absent from the process still triggers restart first.
The version probe is local, bounded to five seconds and prints no configuration.

## RED and GREEN

Before production edits, the existing40 offline tests passed. Added regression
tests then produced **41passed/3failed** across44 cases: actual healthy-app Bash
decision code kept an older/unverified backend, and each actual package launcher
reached a stub startup gate before failing127 because local `tsx` was missing
from its login-shell PATH. Each launcher runs via actual `npm run` in a disposable
test directory with only synthetic `startup.sh` and local `tsx`; no database,
provider or live application is started.

After the bounded post-start repair and root-owned package launcher correction,
all **45tests passed** under Node22. Added coverage exercises the actual Bash
decision branch, current-commit reuse, missing-key restart, exact public build
stamp matching, nine invalid/unavailable version cases, and both package launchers.
The original40 cases remain intact. Compressed logs are in `baseline.txt.gz`,
`red.txt.gz` and `green.txt.gz`; they contain synthetic fixtures only.

These tests do not prove a real Codespace installation, deployed login, live
provider or scientific CSR lifecycle. This environment has no authorized remote
Codespace session connection for a live check. No secrets or secret files were
read. All completed changes must be pushed by the root directly to canonical
`concept2cure-v2`, with normal hooks, within the demo window.
