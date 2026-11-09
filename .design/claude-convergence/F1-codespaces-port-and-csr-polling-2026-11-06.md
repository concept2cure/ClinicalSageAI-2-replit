# Finish Codespaces port selection and CSR polling

Plan: F1. Workstream W1, rowD2. Source baseline: `f6127e72231bd9e9f302f596a672f58b1b40db15`. Stay in the existing startup and one-editor workflow; no new product surface, service, route, table, dependency or provider policy. Root owns all jobs and Git.

## What already exists

- `scripts/startup.sh` owns `is_port_in_use`, `select_app_port`, and the existing Codespaces doctor-before-start flow. It scans up to20 ports on every conflict, including Codespaces.
- `.devcontainer/post-start.sh` polls its requested `C2C_PORT`, while `devcontainer.json` forwards5000. Silent fallback can start the backend on5001 while the user still opens5000. Those setup files remain with their owner; complete the existing unheld port selector by refusing busy requested ports in Codespaces only. Preserve local fallback and the real preflight.
- `client/src/concept2cure/v2/surfaces/CsrBuildProgress.tsx` already polls the narrative run every2seconds inside the existing CSR editor controls. Its `useNarrativeRun` accepts every completed response. An older running response can replace a newer completed outcome and restart polling.
- `csrNarrativeBuild.test.tsx` already covers running/completed/stalled/refused narrative states and QC. Extend that real component test with deferred out-of-order status replies, then retire superseded reads in the existing hook. No layout change.
- `StudyDataBuild.tsx` and `CsrRunBuilds.tsx` already remount project/document/run scopes; they are not duplicated or edited here.

Searches: current files/callers/routes, current coordination, full-history deleted-file searches for port and CSR progress tests. No deleted alternate implementation was found. The active CSR-draft route/accept/UI holds and the founder's D4-3 demo hold remain intact.

## Verification

First observe RED using actual sourced Bash against real TCP listeners and deferred real-component status replies. Keep free-port/local fallback controls, current narrative outcomes and refusals. Run focused tests and actual local application/browser checks appropriate to these existing paths, then normal direct hooked publication. No live model or agency request. Provider availability in the founder Codespace remains unverified.
