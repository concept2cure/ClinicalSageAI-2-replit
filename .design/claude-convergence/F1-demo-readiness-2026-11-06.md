# F1 demo readiness

Workstream W1, launch rowD2. Complete the existing Codespaces startup and project-to-editor rehearsal without adding product UI or changing held scripts.

## What already exists

The existing devcontainer provisions a local app-role database, demo identities, project packs and frozen CDISC study. Existing CSR walk and the one editor supply the rehearsal. See docs/evidence/F1/2026-11-06-demo-readiness/README.md for paths, ownership, source and exact limits. Current canonical source was fetched/fast-forwarded before work.

## Scope

Read-only peer audits; root runs all checks and Git. Rehearse existing npm dev with Codespaces flags and app_service only against the task-owned synthetic local fixture; prepare public study through existing APIs. No live provider call, dispatch or dependency/UI addition. Fix only observed defects in unheld existing code, with focused proof.

## Observed repair

Real npmdev passes Codespaces doctor but stops at tsxcommandnotfound because both existing dev scripts start a login shell. Root owns package.json (two launcher flags only); the bounded subprocess regression test is scripts/ci/__tests__/dev-entrypoint.test.mjs. Preserve preflight failure, actual installedtsx and Node22. Held Codespaces files remain unchanged.
