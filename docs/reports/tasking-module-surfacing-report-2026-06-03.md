---
title: Tasking module — backend reality and Claude Design surfacing report
date: 2026-06-03
audience: Claude Design
branch: concept2cure-v2
basis: full code verification (3-agent sweep) + tenant-isolation fix 31cf35b + test 8c0a1b2
status: backend partially GA — read before designing the tasking surfaces
---

# Tasking module — what Claude Design must surface, and what is blocked

Grounded in a full verification of the live `concept2cure-v2` server + client code
(not the `design-system/` mirror) against the tasking kits (`ui_kits/tasking/`,
`ui_kits/task-tray/`). The tasking UI is already real and well-built; the backend
is real but **fragmented and, until this session, had a cross-tenant security
hole**. One thing must be decided before the UI is finished: **which task store
is canonical.**

---

## 1. Shipped this session (on `concept2cure-v2`)

- **P0 cross-tenant IDOR fixed** (`31cf35b`). `/api/regulatory/tasks` (the API the
  tasking UI binds to) authenticated requests but never read the authenticated
  org — it trusted a client-supplied `organizationId`, and an absent param on
  `GET /all` returned **every tenant's tasks**. `GET /:id`, `PATCH /:id/status`,
  `POST /:id/link` did no org check at all. Every handler now derives org from the
  verified JWT (`getSecureOrgId`) and ignores client input; by-id paths verify the
  task belongs to the caller's org. **Regression test** (`8c0a1b2`, 5 cases) proves
  it. Behaviour is unchanged for legitimate same-org use.
- **Immutable data lineage added** (`065b5e3`). Task create / status-transition /
  link now write the SHA-256 hash-chained `audit_logs` + `c2c_ana_actions` ledger
  (the same Projects governed-action primitive) — authenticated actor, task target,
  before/after payload, optional reason-for-change. Best-effort + graceful; 4 unit
  tests + route assertions. See `tasking-module-assurance-2026-06-03.md`.

---

## 2. Headline: three uncoordinated "canonical" task stores

This is the single most important thing for Design to understand. Tasks are split
across **7 tables**, and three different surfaces each treat a different table as
canonical:

| Surface a user sees | Reads from | Writer |
|---|---|---|
| **Cross-program tasking shell** (Board/List/Overview) | `unified_tasks` | `/api/regulatory/tasks`, module sync, rules engine |
| **MDX workbench + ProjectHome "Your tasks"** | `c2c_project_work_items` | `upsertProjectWorkItem` (review/thread/blocker events) |
| **AnA-created tasks** (chat "create a task") | `project_tasks` | AnA RI `create_task` command |

Consequence: **ask AnA to create a task inside the tasking shell and it never
appears on that shell's board** (AnA writes `project_tasks`, the board reads
`unified_tasks`). The MDX surfaces show a third set. Plus `regulatory_tasks`,
`drafting_tasks`, `cmc_workflow_tasks`, `submission_tasks`, and `capa_actions` are
siloed. Only `unified_tasks` has a one-directional sync pulling from CMC/IND/etc.;
the other stores are not reconciled.

**Design implication:** do not design "the tasks view" assuming one source. The
work order's first task is a product decision — **declare one canonical store** (or
a true unification layer) — and it gates a coherent UI.

---

## 3. Backend reality by area (verified)

| Area | Status | Notes / contract |
|---|---|---|
| Primary table `unified_tasks` | ✅ real | org FK, numeric `project_id` FK, dependency arrays, working unblock-cascade |
| Tenant isolation | ✅ now fixed | `getSecureOrgId` on every handler (was IDOR) |
| Two parallel APIs | ⚠️ | `/api/regulatory/tasks` (UI binds here) + `/api/tasks` (safe, but **orphaned** — no client). Both double-mounted again under `/api/unified-tasks` and `/api/task-management` |
| Audit / data lineage on task mutations | ◐ now partial | create/status/link now write the SHA-256-chained `audit_logs` + `c2c_ana_actions` ledger (shipped `065b5e3`); **e-signature** on sign-off + writing `approvalHistory` still missing |
| Soft-delete | ❌ missing on **all** task tables | hard deletes only |
| Status workflow | ⚠️ | free-text status; **no transition state machine** (any string accepted); only the unblock cascade is automatic |
| Task links / dependencies | ✅ real | `cross_module_task_links` + `task_dependencies` (4 dependency types, critical-path DFS), but the two link tables aren't unified and have no org column |
| Notifications on tasks | ❌ missing | due/overdue/assignment wiring exists only for review tasks; `unified_tasks.escalationPath`/`notificationSettings` columns are unread; the board bell is non-functional |
| Regulatory blueprint catalog | ❌ orphaned | 11 region blueprints exist but never seed runtime tasks (`getTaskBlueprint` has zero call sites) |
| AnA task tools | ⚠️ split | `ana-ri` has `create_task/update_task/list_tasks` (→ `project_tasks`); the main `ana/` agent has **no** task tools |
| project-id model | ⚠️ | `unified_tasks.project_id` numeric vs string `proj_…` — tasks can't scope to a concept2cure project |

---

## 4. Built tasking UI today (strong) + its gaps

Built and live (`client/src/concept2cure/tasking/`, reachable in `ZenApp` at
`layoutMode==='tasking'`): Rail + TopBar + TabBar + AnA dock (⌘\), **Overview**
(tiles + needs-attention queue), **Board** (Kanban), **List**, and **New-task /
Link-task / Task** dialogs — all live against `/api/regulatory/tasks/*`, with full
modal a11y and **color-never-alone** chips (tone + label + icon). Owner mine/everyone
toggle (server-side `assigneeId`), density toggle.

Gaps (what's designed-but-unbuilt or missing):
- **No real drag-and-drop** — board moves are arrow buttons only.
- **No task-detail dialog** — `useTask(id)` exists but nothing renders it; "open task" only sends an AnA prompt.
- **Project filter is inert** — hardcoded empty options (numeric vs string project id).
- **No project-messaging pane** — the kit's threads/bubbles are omitted (no backend thread endpoint).
- **Persistent Task Tray is entirely unbuilt** — `ui_kits/task-tray/` designs a top-bar tray (Assigned to me / Approvals you sign / Waiting on others) for every shell → intended target `client/src/concept2cure/_shared/components/TaskTray.tsx`; it does not exist.
- **No optimistic updates** — mutations invalidate-and-refetch.

---

## 5. What Claude Design must do — surface now vs hold

| Surface | Verdict | Notes |
|---|---|---|
| Board / List / Overview re-skin to the constitution (neutral shell, one teal accent, sans, 13px) | SURFACE NOW | live data is real and tenant-safe now |
| **Task-detail dialog** | SURFACE NOW | `GET /:id` is now org-safe and returns the task; `useTask` already exists |
| **Real drag-and-drop** on the board | SURFACE NOW | `PATCH /:id/status` works; replace arrow-move with DnD (keep keyboard-operable) |
| **Persistent Task Tray** (every shell top bar) | PARTIAL | build the tray UI; back it with `GET /all` for "assigned to me"; the **Approvals "you sign"** and **due/overdue** dimensions need backend (no task notifications / no approval mutation yet) — design them, mark backend-pending |
| **Project filter / project-scoped tasks** | BLOCKED | needs the project-id mapping or a canonical-store decision (§2); don't ship the filter until then |
| **Project-messaging pane** | BLOCKED | no thread endpoint (`/api/c2c/projects/:id/threads` "needs a brief") |
| **Audit / e-signature affordances on task sign-off** | BLOCKED | no task audit/approval backend yet (GA backlog §6) |
| Tokens / voice / motion / a11y | SURFACE NOW | the built UI is already close; finish the pass (move the inline-styled AnA dock + program-filter select into `app.css`) |

---

## 6. GA backlog (prioritized — needs the live-infra loop or a design decision)

1. **P0 (decision) — declare the canonical task store** and reconcile/retire the
   others, or build a true unification layer. The UI cannot be coherent until the
   tasking board, the MDX workbench, and AnA write/read the same store.
2. **P1 — e-signature on task sign-off** (the audit/data-lineage half is **done** —
   task create/status/link write the `audit_logs` + `c2c_ana_actions` SHA-256 chain,
   `065b5e3`). Still missing: the §11.50/§11.100 e-signature + reason-for-change UI
   on regulated task completion, writing `approvalHistory`, and routing the other
   writers (orphaned `/api/tasks`, AnA `project_tasks`) through the same ledger.
3. **P1 — point AnA at the canonical store** (the `ana-ri` task tools write
   `project_tasks`; add task tools to the main `ana/` agent too).
4. **P1 — consolidate the two task APIs**; remove the duplicate route mounts.
5. **P1 — soft-delete (`deleted_at`)** on the task tables; immutable history.
6. **P2 — task notifications** (due/overdue/assignment) reading the existing
   `escalationPath`/`notificationSettings` columns; wire the board bell.
7. **P2 — org-scope the graph tables** (`task_dependencies`, `cross_module_task_links`).
8. **P2 — wire the blueprint catalog** to seed per-submission-type tasks.
9. **P3 — status-transition state machine.**
10. **P3 — bridge siloed producers** (CAPA/risk corrective actions, deficiency
    remediation, submission filing tasks) into the canonical store.

---

## 7. Honest status

The GA-critical, verifiable backend fix (the cross-tenant IDOR) is shipped and
tested on `concept2cure-v2`. The remaining GA work is either a **product decision**
(the canonical store) or **regulated backend** (audit, soft-delete, notifications,
consolidation) that needs the live preview-DB/model loop — not blind pushes. This
report is the contract for the UI Claude Design can build over what's real today.
The full build plan is in `TASKING_UI_WORK_ORDER.md`; the entry point is
`TASKING_HANDOFF.md`.
