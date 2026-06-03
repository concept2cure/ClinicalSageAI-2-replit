# WORK ORDER — Tasking module UI (concept2cure-v2)

> **For:** Claude Code (UI implementer).
> **Scope:** Finish the canonical tasking UI and the persistent Task Tray, and
> wire tasking into every shell. The built UI is already strong; the work is
> convergence, the tray, a few missing surfaces, and a constitution pass.
> **Authority:** the ana-ui-design-constitution + repo `CLAUDE.md` (tokens, voice,
> motion, the five destinations) WIN. Design reference: `ui_kits/tasking/` +
> `ui_kits/task-tray/`. Do not invent surfaces.
> **Companion:** `docs/reports/tasking-module-surfacing-report-2026-06-03.md`.

---

## 1. What we have today

### 1.1 Backend (on `concept2cure-v2`)

- `/api/regulatory/tasks` (`unifiedTasks.routes.ts`) — the API the UI binds to.
  **Now tenant-safe** (`getSecureOrgId`, fix `31cf35b`, test `8c0a1b2`).
  Endpoints: `GET /all`, `GET /:id`, `POST /unified`, `PATCH /:id/status`,
  `POST /:id/link`, `GET /by-module/:module`, `GET /dashboard/unified`,
  `POST /sync/:module`.
- `/api/tasks` (`taskManagement.routes.ts`) — a second, tenant-safe but
  **orphaned** API (templates, bulk, critical-path, auto-assign, analytics).
- Tables (7): `unified_tasks` (board), `c2c_project_work_items` (MDX workbench),
  `project_tasks` (AnA writes / `useProjectTasks`), plus `regulatory_tasks`,
  `drafting_tasks`, `cmc_workflow_tasks`, `submission_tasks`, and `capa_actions`.
- **Three uncoordinated canonical stores** (see the report §2) — the board, the
  MDX workbench, and AnA each use a different table. This is the headline blocker.

### 1.2 Frontend (built, live)

`client/src/concept2cure/tasking/` — Rail + TopBar + TabBar + AnA dock (⌘\), with
**Overview / Board / List** surfaces and **New-task / Link-task / Task** dialogs,
live via `taskingService` → `/api/regulatory/tasks/*`. Reachable in `ZenApp`
(`layoutMode==='tasking'`, `ZenApp.tsx:1985`). Full modal a11y; color-never-alone
chips; owner + density toggles.

Separate: `useProjectTasks` (project-scoped, `/api/concept2cure/projects/:id/tasks`)
— **has no live UI consumer**; MDX ProjectHome reads `c2c_project_work_items` via
`useWorkbenchTasks` instead.

### 1.3 Gaps (built vs designed)

No real DnD (arrow-move only); no task-detail dialog (`useTask` unused); inert
project filter; no messaging pane (no backend); **Task Tray entirely unbuilt**; no
optimistic updates.

---

## 2. Target (spec + constitution)

Tasking is a context surface, not a dashboard. One cross-program tasking
destination + a **persistent Task Tray in every shell's top bar**. Neutral shell,
single teal accent, sans, composer-first. Calm motion. WCAG 2.2 AA (the built
chips already pair tone + label + icon — preserve that).

---

## 3. Build tasks (ordered vertical slices)

1. **Resolve the canonical store (decision first).** With the designer/operator,
   declare one canonical task store (recommend `unified_tasks`) and make the board,
   the MDX workbench, and AnA read/write it — or build a unification view. Until
   this lands, the project filter and a unified "all my tasks" view stay blocked.
2. **Persistent Task Tray** — build `client/src/concept2cure/_shared/components/TaskTray.tsx`
   from `ui_kits/task-tray/`: top-bar trigger + count badge; slide-over with
   **Assigned to you / Approvals you sign / Waiting on others**; "Triage my day
   with AnA"; per-item open. Mount in every shell top bar (tasking, MDX, biopharma,
   submission, risk, authoring). Back "assigned to you" with `GET /all?assigneeId`;
   mark the approvals/waiting dimensions backend-pending. Apply color-never-alone to
   the tray's tone dots (add icon/label).
3. **Task-detail dialog** — render `useTask(id)` (the `GET /:id` path is now
   org-safe): full task view + inline status change + links + (when backend lands)
   audit/e-sign.
4. **Real drag-and-drop** on the Board (`PATCH /:id/status`), keeping the existing
   keyboard arrow-move as the accessible path.
5. **Optimistic updates** on status move / create / link (currently invalidate-only).
6. **Project filter** — once the canonical store + project-id mapping land, populate
   the inert TopBar program filter.
7. **Token / voice / motion / a11y pass** — move the inline-styled AnA dock
   (`App.tsx`) and program-filter select (`TopBar.tsx`) into `app.css`; finish the
   constitution re-skin.
8. **(Backend-gated) Project-messaging pane** and **audit/e-sign affordances** —
   design now, build when the thread endpoint and task-audit land.

---

## 4. Upstream UI needs (what feeds tasking)

- The five-destination shell, TopBar (where the Task Tray mounts), command palette.
- Auth/session: org + user id (the board's mine/everyone toggle uses the user id;
  org is now JWT-enforced server-side).
- The shared AnA composer/dock (already wired via `useAnaChat` → `/api/ana-ri/stream`).

## 5. Downstream / cross-service map (how tasking touches everything)

Tasking is the cross-cutting connective surface. Producers and consumers today:

**Producers (create tasks):** rules engine (`create_task`), `unifiedTaskService`
module sync (CMC/IND/MedicalDevice/eCTD/Vault/ProtocolDesign), `/api/tasks`
templates/bulk, AnA RI `create_task` (→ `project_tasks`), project task routes +
milestone generator, `regulatorySubmissions` (→ `regulatory_tasks`), submission
center (→ `submission_tasks`), `upsertProjectWorkItem` (review/thread/blocker →
`c2c_project_work_items`), eCTD drafting (→ `drafting_tasks`), CMC playbook
(→ `cmc_workflow_tasks`).

**Consumers (surface tasks):** the tasking shell (`unified_tasks`); MDX workbench +
ProjectHome (`c2c_project_work_items`); `useProjectTasks` (`project_tasks`, no live
UI); project-rollup + sentinel services (`unified_tasks`).

**Surfaces that should produce/consume tasks but don't (wire these):**
- concept2cure **Projects detail** — surfaces no tasks; add a tasks panel.
- **Submission gateway** — creates no filing/ESG-follow-up tasks.
- **Risk → CAPA** — `capa_actions` is siloed; ISO 14971 corrective actions never
  reach the board.
- **Deficiency scan** — finds deficiencies, creates no remediation tasks.
- **Home dashboard** — no "due today / your tasks" widget.
- **Intelligence cluster** — signals/blockers aren't materialized as tasks.
- **PDEV** — no task production/consumption.
- **Task Tray** — the intended single connective consumer across all shells (unbuilt).

## 6. Backend contracts to bind to

- `GET /api/regulatory/tasks/all?status&moduleType&assigneeId&limit&offset` (org is
  JWT-derived; do not send `organizationId`).
- `GET /api/regulatory/tasks/:id`, `POST /unified`, `PATCH /:id/status`,
  `POST /:id/link`, `GET /by-module/:module`, `GET /dashboard/unified`.
- Hooks already present: `useTasking` (queries + mutations), `useProjectTasks`
  (project-scoped), `useWorkbenchTasks` (`/api/submission-ops/workload`).

## 7. Non-negotiables (constitution)

Sentence case; no emoji / exclamation / cheerleading; second person. Body 13–15px.
One teal accent; regulatory status colors sacred; **color never alone** (tone +
label + icon — already the pattern in `state.tsx`; keep it, including any new tray
dots). 200ms ease-out, no bounce, respect `prefers-reduced-motion`. Lucide only,
sans shell type. WCAG 2.2 AA (focus trap + return focus are already correct in
`TaskDialog`). No KPI farm, no second nav inside the surface.

## 8. Acceptance criteria

One canonical task store reflected across board + MDX + AnA (no "AnA task invisible
to the board"). Task Tray live in every shell top bar. Task-detail dialog renders
`GET /:id`. Real DnD with a keyboard path. Optimistic updates. Tokens/voice/motion/
a11y per §7; responsive at 1440/1280/1024/834/768/430/390. No console errors.
Committed + pushed to `concept2cure-v2`.

## 9. Open decisions (resolve before tasks 1, 6, 8)

- **Canonical task store** — `unified_tasks` vs a unification layer (§3.1). Gates
  everything.
- **Approvals model** — does the Task Tray's "you sign" come from task audit/e-sign
  (GA backlog) or from the existing review/approval flow?
- **Project-id mapping** — how a string `proj_…` project scopes numeric
  `unified_tasks.project_id`.
