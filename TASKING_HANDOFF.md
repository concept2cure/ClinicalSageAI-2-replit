# TASKING_HANDOFF.md — handoff to Claude Code / Claude Design

> **You are picking up the tasking module.** The built UI is strong; the backend
> is real but fragmented, and a P0 security hole was just closed. Read this, then
> the work order.

## 0. How to use this file

- **Branch:** `concept2cure-v2` only. Commit straight to it; no feature branch, no PR.
- **Before every push:** `npm install` (fresh container), `npm run typecheck` clean,
  relevant tests green, pre-push gates (`ci:ectd-stubs`, `ci:risk-codes`) pass.
- **Read order:** this file → `TASKING_UI_WORK_ORDER.md` →
  `docs/reports/tasking-module-surfacing-report-2026-06-03.md` → `ui_kits/tasking/`
  + `ui_kits/task-tray/` → `CLAUDE.md` + the design constitution.
- **Do not invent surfaces.** If it isn't in `ui_kits/`, stop and ask.

## 1. Status snapshot (2026-06-03)

### Backend — shipped this session
- **P0 cross-tenant IDOR fixed** on `/api/regulatory/tasks` (`unifiedTasks.routes.ts`,
  commit `31cf35b`): every handler derives org from the verified JWT
  (`getSecureOrgId`) and ignores client-supplied org; by-id paths verify per-task
  org ownership. **Regression test** `8c0a1b2` (5 cases). `tsc` clean.

### Backend — the big picture (verified, 3-agent sweep)
- Real primary table `unified_tasks` (the board's source), but **7 task tables**
  total and **three uncoordinated canonical stores**: the tasking board reads
  `unified_tasks`, MDX workbench/ProjectHome read `c2c_project_work_items`, and AnA
  writes `project_tasks`. An AnA-created task is invisible to the board.
- **No audit / e-signature** on task mutations (Part 11 gap); **no soft-delete** on
  any task table; **no task notifications**; status is free-text (no state machine);
  the regulatory blueprint catalog is orphaned; two task APIs are double-mounted.

### Frontend — what exists
`client/src/concept2cure/tasking/` — Rail + TopBar + TabBar + AnA dock, with
Overview / Board / List + New-task / Link-task / Task dialogs, live against
`/api/regulatory/tasks/*`, full a11y, color-never-alone chips. Reachable in `ZenApp`.

### Frontend — gaps
No real drag-and-drop; no task-detail dialog (`useTask` unused); inert project
filter; no messaging pane; **Task Tray unbuilt**; no optimistic updates.

## 2. Your mission — two tracks

- **Track A (primary): finish the tasking UI + build the persistent Task Tray.**
  Full plan in `TASKING_UI_WORK_ORDER.md §3`.
- **Track B (needs the live preview-DB + a product decision): backend GA** — the
  canonical-store decision, task audit/e-sign, soft-delete, notifications, API
  consolidation, blueprint wiring. See the report §6.

## 3. Task checklist (condensed from the work order)

1. **Resolve the canonical task store** (decision) — make board + MDX + AnA agree.
2. **Persistent Task Tray** (`_shared/components/TaskTray.tsx`) in every shell top bar.
3. **Task-detail dialog** (`GET /:id` is now org-safe; `useTask` exists).
4. **Real drag-and-drop** on the Board (keep the keyboard arrow path).
5. **Optimistic updates** on status/create/link.
6. **Project filter** (once the canonical store + project-id mapping land).
7. **Token / voice / motion / a11y pass** (move inline styles in `App.tsx` /
   `TopBar.tsx` into `app.css`).
8. **(Backend-gated)** project-messaging pane + audit/e-sign affordances.

## 4. Backend contracts

- `GET /api/regulatory/tasks/all` (org is JWT-derived — **do not send
  `organizationId`**), `GET /:id`, `POST /unified`, `PATCH /:id/status`,
  `POST /:id/link`, `GET /by-module/:module`, `GET /dashboard/unified`.
- Hooks: `useTasking`, `useProjectTasks`, `useWorkbenchTasks`.

## 5. Cross-service reach (how tasking touches everything)

Producers: rules engine, module sync (CMC/IND/MedicalDevice/eCTD/Vault/Protocol),
AnA RI, project routes, submissions, review/thread events, eCTD drafting, CMC
playbook. Consumers: tasking shell, MDX workbench + ProjectHome. **Should-but-don't:
Projects detail, submission gateway, risk→CAPA, deficiency scan, home dashboard,
intelligence, PDEV, and the Task Tray.** Detail in the work order §5.

## 6. Non-negotiables

Sentence case; no emoji/exclamation; second person. One teal accent; status colors
sacred; **color never alone**. 200ms ease-out; `prefers-reduced-motion`. Lucide,
sans shell type. WCAG 2.2 AA. No KPI farm, no second nav, no parallel UI paths.

## 7. Definition of done

One canonical task store across board + MDX + AnA; Task Tray in every shell;
task-detail dialog; real DnD with a keyboard path; optimistic updates;
tokens/voice/motion/a11y per §6; responsive at all listed widths; no console
errors; pushed to `concept2cure-v2`.

## 8. Open decisions (resolve first)

- **Canonical task store** (gates the whole UI).
- **Approvals model** for the tray's "you sign" (task audit/e-sign vs review flow).
- **Project-id mapping** (string `proj_…` ↔ numeric `unified_tasks.project_id`).

## 9. Environment caveat

Session commits show GitHub "Unverified": the provisioned SSH signing key is an
empty 0-byte file with no private key and the agent runs as `root`, so git cannot
sign. Committer identity is correct (`Claude <noreply@anthropic.com>`). Populate the
key in the environment if Verified commits are required; do not force-rewrite pushed
history to "fix" it.
