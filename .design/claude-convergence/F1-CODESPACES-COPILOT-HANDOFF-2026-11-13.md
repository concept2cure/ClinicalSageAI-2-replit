# Verify the existing Codespaces demo and Copilot handoff

F1, W1, launch rows D1/D2. Starting checkout: `2a667bf51` on `concept2cure-v2`.
User direction: continue Claude Code's existing work, make the demo work in a
simple GitHub Codespace, and publish everything where its Copilot can read it.
No new screen, editor, route, table, service, model or deployment is proposed.

## What already exists

- `.devcontainer/devcontainer.json` selects Node 22 on Debian bookworm, requests
  four cores/16 GB, forwards private port 5000 and invokes the existing creation
  and start scripts. `.nvmrc`, `package.json` and `.npmrc` enforce Node 22 and the
  authoritative lockfile.
- `.devcontainer/post-create.sh` installs locked dependencies, PostgreSQL 16 and
  pgvector, document export tools, the existing readiness schema and fictional
  demo accounts. Owner credentials stay in private provisioning state; the app
  receives only its non-owner `app_service` connection.
- `.devcontainer/post-start.sh` checks locked dependencies, provisions current
  schema, checks the running commit, starts the existing app, seeds the existing
  demonstration packs and prepares the existing CSR study. Recent bootstrap,
  supplied-key and browser-preparation repairs already landed; preserve them.
- `scripts/ops/codespaces-doctor.mjs` and the existing Node test suites diagnose
  prerequisites, process readiness and explicitly requested provider probes.
  A running manual editor is not proof of a live qualified drafting provider.
- `scripts/demo/launch-demo/seed.mjs` and its existing biotech/device/Lumen packs
  supply fictional projects, records and reviewable CSRs through product APIs.
  Existing scientific review, signature, model and filing gates remain enforced.
- `docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md` is the operator's
  current Codespaces guide. Today's upstream evidence includes a native
  bookworm setup/start and cached restart; this continuation must identify
  exactly what it reruns instead of relabelling earlier evidence as new.
- `.github/copilot-instructions.md`, root `AGENTS.md` and `CLAUDE.md` already
  require the canonical branch and plan. The Copilot file is a protected plan
  file, so this F1 slice does not rewrite it. Existing
  `.devcontainer/AGENT_RULES.md` can point Copilot to the canonical pull/start/
  verification procedure and existing guide, with no second implementation.
- `DocumentCanvas.tsx` and `DocumentWorkbench.tsx` remain the one document
  surface. The current roadmap and coordination record govern their owners;
  no editor or filing capability is moved or hidden by this slice.

Searches: current devcontainer/startup/doctor/demo callers; repository rules,
plan/ledger and current coordination; current Copilot instructions; deleted
history of `.devcontainer`, `scripts/startup.sh`, Editor and Canvas paths. Existing
startup and documentation are verified or repaired, never rebuilt alongside.

## Verification and publication

Root owns Git and all install/test/build/server/browser jobs. Focused reviewers
may inspect disjoint files; no agent runs an install or modifies shared files
without an explicit assignment. Reproduce a real blocker before a code repair.
Use the declared Node 22 bookworm image for setup where feasible, retain the
proxy/CA, keep secrets out of logs and Git, and distinguish no-provider readiness
from a completed live AnA turn. No new key is created until its OpenAI target
selection is confirmed. No qualification, sender or scientific gate is bypassed.

Record exact source, commands and exits in
`docs/evidence/F1/2026-11-13-codespaces-copilot-handoff/`. Commit and push verified
increments directly to `concept2cure-v2` with normal hooks and required trailers.
