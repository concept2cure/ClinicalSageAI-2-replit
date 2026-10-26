# D2 client journey: Slice A.2 Projects

Starting point: `b3661f72dd2130bf22ceae6c1b428d8a16b93b71`, canonical branch `concept2cure-v2`.
Plan: `.design/client-journey/SLICE_A2_PLAN.md`, rechecked against current code before each sub-slice.

## What already exists

- `client/src/concept2cure/v2/shellProject.ts` owns the open project, URL identity, per-tab mirror and visit guards. It does not remember a lifecycle step; `ProjectHome.tsx` keeps that step in component state and loses it on remount. Existing shell and project-home tests cover identity and default steps. No related step-persistence implementation was found in deleted history.
- `server/routes/c2c/projects.ts` provides the canonical project creator, program detail and paged portfolio read. GET and the create response duplicate the card projection. The anchor already holds `client_workspace_id`; the portfolio omits it.
- `server/services/c2c/current-program-access.ts` and `program-project-anchor.ts` establish current program/anchor access before reads. Any portfolio filter/count must retain that boundary and its final current-access check.
- `client/src/concept2cure/v2/surfaces/Projects.tsx` already provides the wizard, workstream/status/search controls and readiness mean; `shared/navigation/surface-actions.ts` owns surface-action contracts.
- `projectDoors.ts`, the MDX Overview and `useMdxPrograms.ts` already provide the device navigation and portfolio. These are completed or converged, not replaced.

Discovery commands: `rg` across shell step, project creation/list/readiness, client workspace, pathway and alias implementations; `git log --all --diff-filter=D` over the related shell/project files. The plan's detailed inventory remains the reference; individual entries below record corrections and verification limits. Founder-gated admissions and parity-dependent folds retain their guards.

## A2.1: remember the project's selected step

Completed: a validated step is preserved in the existing per-tab shell-project channel. Same-project republishing preserves it; different-project visits, tenant clear and mismatched URL restores do not carry it. ProjectHome subscribes to that channel and remembers both a person's choice and the initial empty-project Plan default. Explicit Tasks handoff > pending surface action > remembered step > first-open default. Invalid stored steps are discarded. No new store, route or global key.

Red: 12/15 new unit/component cases failed before implementation, including the actual TopBar chip returning Author after a template copy. The focused browser test independently failed for the same expected Plan/received Author assertion after real signup, wizard creation and template creation (`A2.1/browser-red.txt`).

Green: 15/15 new cases, 74/74 existing cases across eight shell/project/navigation suites, and the focused real-browser flow pass. The browser verifies Plan after the chip, one started document in the filing plan, Plan after reload, and Evidence after Vault→chip (`A2.1/browser-green.txt`, `A2.1/returned-plan.png`). This used the isolated deploy-shaped PostgreSQL database as `app_service` with `RLS_ENFORCE=on`, development-only `ALLOW_DEV_AUTH=1`, and no AI provider. The golden first-session journey now asserts the remembered Plan after Home's project-card return; that longer fixture-dependent journey was not rerun as a whole.

Scoped ESLint: zero errors, existing warnings only. First-open defaults, bare-workId Review fallback and pending-action precedence remain covered. Source: `shellProject.ts`, `ProjectHome.tsx`; proof: `shellProjectStep.test.ts`, `projectHomeStepReturn.test.tsx`, `project-step-return.e2e.ts`.
