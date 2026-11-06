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
