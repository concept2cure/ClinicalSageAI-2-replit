---
title: Collaboration & Tasking — end-to-end assessment of code, UI, and the path to a coherent experience
date: 2026-08-07
branch: claude/collab-tasking-ux-assessment-7s441u
basis: full read of the shipped server routes, services, schema, client surfaces, fixtures, styles and tests
supersedes-context: docs/reports/tasking-module-surfacing-report-2026-06-03.md (still accurate; most of its backlog is still open)
status: assessment only — no behaviour changed by this document
---

# Collaboration & Tasking — end-to-end assessment

## 0. Verdict

The platform has **more collaboration and tasking capability than its users can
reach**, and the part users *can* reach is wired to the weakest of the available
backends. This is not a "we need to build more" problem. It is an integration,
consolidation and interaction-design problem.

Three findings dominate everything else:

1. **A complete, tested collaboration backend is shipped with zero client
   consumers.** Review threads, threaded comments, `request_changes`, review
   tasks, resolve/reopen with PM work-item linkage, a personal work queue
   (`/reviews/my-queue`), a project queue, notifications with read/dismiss, and
   deadline escalation all exist in `server/routes/concept2cure.ts`
   (≈ lines 14394–16750), have DDL in `migrations/phase13_review_threads_tasks.sql`,
   and have a 17-case E2E spec (`tests/e2e/review-collaboration.e2e.spec.ts`).
   **Nothing in `client/` calls any of it.** A repo-wide search for
   `review-threads`, `my-queue`, or `project-queue` in `client/` returns nothing.

2. **The collaboration UI users actually see does not persist anything.** The
   universal FAB (`CollabLauncher.tsx`) is mounted on every surface
   (`V2App.tsx:396`). Its "New task" writes to a module-level JavaScript array
   (`CollabLauncher.tsx:288–311`) and its "Collaborate" message writes nothing at
   all (`:404–422`). Both are honestly labelled as such in the UI — which means
   the product ships a prominent, always-visible action whose own copy tells the
   user it does not work.

3. **Task state is fragmented across seven stores and *two competing
   unification layers that do not include each other*.** `unified_tasks` is the
   store the Task Board reads. `loadUnifiedWork()`
   (`server/services/unified-work/unified-work-view.ts`) is a newer "one answer to
   what's outstanding" service that merges `project_tasks` +
   `c2c_project_work_items` + `estar_submissions` — and **omits `unified_tasks`
   entirely**. The MDX Workbench renders a second Kanban board from that second
   layer with different columns and different vocabulary. Ask AnA to create a
   task and it lands in a third place (`project_tasks`,
   `command-executor.ts:878`) that neither board shows.

Below: the system as built (§1), the structural problems (§2), a defect register
with file:line evidence (§3), a UX critique of the shipped surfaces (§4), the
target experience (§5), and a sequenced plan (§6).

---

## 1. The system as built

### 1.1 Data layer — seven task stores, three comment/thread stores

| Store | Table | Written by | Read by |
|---|---|---|---|
| Unified tasks | `unified_tasks` | `/api/tasks/*`, `/api/regulatory/tasks/*`, module sync, demo seed | v2 **Task Board**, Client Review Zone |
| Project work items | `c2c_project_work_items` | `upsertProjectWorkItem` (review/thread/blocker events) | MDX **Workbench** board, `loadUnifiedWork` |
| Legacy/WBS + AnA | `project_tasks` | AnA RI `create_task`, schedule-of-events sweep | `loadUnifiedWork` only |
| Review tasks | `concept2cure_review_tasks` | `/api/concept2cure/.../review-tasks` | **nothing** |
| Review threads | `concept2cure_review_threads` | `/api/concept2cure/.../review-threads` | **nothing** |
| Thread comments | `concept2cure_thread_comments` | `/review-threads/:id/comments` | **nothing** |
| Regulatory tasks | `regulatory_tasks` | module sync source | sync only |
| Drafting / CMC workflow | `drafting_tasks`, `workflow_tasks` | module-local | module-local |

Two notification stores also exist and are both real: `mdx_notifications`
(`server/services/notifications/notification-service.ts`) and
`concept2cure_notifications`. Neither fires on a task assignment.

`unified_tasks` (`shared/schema.ts:7036`) is a genuinely well-modelled table: 9
indexes, org FK, dependency arrays, approval workflow columns, impact/risk
scoring, lifecycle phase, `client_visibility`, escalation path and notification
settings. **Several of its best columns are never written and never read** —
`escalationPath`, `notificationSettings`, `approvalHistory`, `approvers`,
`aiSuggestions`, `riskLevel`.

### 1.2 API layer — the same concept mounted four times

```
/api/tasks                → taskManagement.routes.ts   (register-core-routes.ts:118)
/api/task-management      → taskManagement.routes.ts   (register-advanced-platform-routes.ts:206)
/api/task-management      → taskBoard.routes.ts        (register-regulatory-routes.ts:274)  ← /board, /assignees only
/api/regulatory/tasks     → unifiedTasks.routes.ts     (register-core-routes.ts:119)
/api/unified-tasks        → unifiedTasks.routes.ts     (register-advanced-platform-routes.ts:207)
```

Two routers, four prefixes, five mounts. They are **not equivalent**:

| Behaviour | `taskManagement.routes.ts` | `unifiedTasks.routes.ts` |
|---|---|---|
| Part 11 audit ledger on mutations | ❌ **none** | ✅ `auditTaskAction` on create/transition/link |
| Unblock-cascade on completion | ❌ none | ✅ `updateDependentTasks` |
| `moduleType` contract | free text (`z.string()`) | enum of 6 |
| `priority` contract | `low\|medium\|high\|critical` | `low\|medium\|high\|critical` |
| Auto-assign | ✅ `getOptimalAssignee` | ❌ |
| Templates / bulk / analytics | ✅ | ❌ |

**The Task Board UI calls the unaudited one.** `TaskBoard.tsx:124` PATCHes
`/api/tasks/tasks/:id`; `:140` POSTs `/api/tasks/tasks`. So every task created or
moved from the shipped board is **outside the 21 CFR Part 11 ledger**, while the
audited path (`/api/regulatory/tasks`) has no UI. The board's own disclosure
panel (`TaskBoard.tsx:419`) states this accurately — which is commendable
honesty and an unacceptable shipping state for a GxP product.

### 1.3 UI layer

| Surface | File | Data | State |
|---|---|---|---|
| **Task Board** (Board / Critical path / Analytics / Table) | `v2/surfaces/TaskBoard.tsx` (741 ln) | live `unified_tasks` | real reads, real create/move, broken filters |
| **Collab FAB + modal** (New task / Collaborate) | `v2/surfaces/CollabLauncher.tsx` (576 ln) | in-memory array | **mock** |
| **Authoring presence + lock** | `v2/surfaces/AuthoringCollab.tsx` (200 ln) | live `/api/realtime-collab` | real, in-process only |
| **Workbench board** | `mdx/workbench/` + `useWorkbench.ts` | `/api/submission-ops/workload` | real, different store |
| **Client Review Zone** | `mdx/components/ClientReviewZone.tsx` | `/api/mdx/client-review` | real, read-only |
| **Task Tray** (designed in `ui_kits/task-tray/`) | — | — | **never built** |
| **Review threads / comments UI** | — | — | **never built** |

---

## 2. The five structural problems

### P1 — The best backend has no front end; the visible front end has no backend

This is the single highest-leverage fact in the assessment. The Phase-13
collaboration layer answers exactly the questions the product needs to answer —
*what is waiting on me, what did someone ask me to change, what is overdue, what
did I say about this section* — and it is fully implemented, org-scoped and
E2E-tested. It is invisible.

Meanwhile the FAB that appears on every screen creates ghost tasks that vanish on
refresh. The gap is not capability. It is a missing 300 lines of client code and
one product decision.

### P2 — Two unification layers that don't know about each other

`unified_tasks` was built to be *the* unification. `loadUnifiedWork()` was built
later, for the same purpose, over three different tables, and does not query
`unified_tasks`:

```ts
// server/services/unified-work/unified-work-view.ts:1–17
//   1. project_tasks
//   2. c2c_project_work_items
//   3. estar_submissions
```

Consequence: `GET /api/submission-ops/unified-work` and
`GET /api/task-management/board` can both be correct and **share no rows**. The
user sees two Kanban boards, both labelled as their work, with disjoint contents
and different column names (`pending / in-progress / review / completed` vs
`todo / review / blocked / done`).

### P3 — Tasks have no home in the user's mental model

Tasking is modelled as a *destination* (a rail entry, a surface). Every piece of
real collaboration research — and this repo's own kit design
(`ui_kits/task-tray/app.jsx:3`, *"Tasking is connective tissue, accessed
in-place — not a destination"*) — says the opposite. The designed persistent Task
Tray was never built. The result: to find out whether anyone is waiting on you,
you must navigate away from the work.

### P4 — The UI leaks its own engineering into a regulated customer product

The Task Board ships:
- a `<details>` panel titled **"Engineering reality — backend status"** listing
  unwired audit code, stubbed notifications and route-path mismatches
  (`TaskBoard.tsx:415–423`);
- a **"Task sources"** provenance strip exposing the seven-table fragmentation as
  a user-facing feature, with a footnote *"no single reconciliation store"*
  (`:263–275`);
- raw endpoint chips in modal footers — `POST /api/tasks/tasks`,
  `POST /tasks/from-template/:id (not yet wired)` (`:652`, `:734`);
- `<code>sourceEntityType: workspace</code>` in the launcher's context bar
  (`CollabLauncher.tsx:318`).

This began as an admirable anti-fabrication discipline and has hardened into a
product that explains its own incompleteness to the customer. In a GxP tool sold
to regulatory affairs teams, "the background executor is not yet wired"
(`TaskBoard.tsx:391`) on screen is a procurement risk, not transparency.

### P5 — Collaboration is not durable, and locks are advisory-only in a Part 11 product

`server/routes/realtime-collab.ts` is security-hardened and honest (the header
documents and fixes a real lock-theft vulnerability). But everything is
`Map`-based, per-process:

- Locks live in `DocumentLockManager` (`:377`) — **lost on restart, not shared
  across instances**. Behind more than one replica, two authors can hold the same
  section lock simultaneously.
- Presence lives in `YjsRoomManager` (`:239`) with **no idle sweep**. `lastSeen`
  is written (`:333`) and never read for eviction. `removeUser` is the only exit
  path, so a closed laptop leaves a ghost in the roster indefinitely.
  `AuthoringCollab.tsx:105` comments *"the server also expires idle members"* —
  it does not.
- No lock acquisition or release is audited, and there is no takeover/steal path.
  A 30-minute lock held by someone who went to lunch blocks a submission-critical
  section with no in-product remedy.

---

## 3. Defect register

Severity: **S1** user-visible broken behaviour · **S2** wrong/misleading output ·
**S3** friction, a11y, polish.

### 3.1 Task Board — filters and identity

| # | Sev | Defect | Evidence |
|---|---|---|---|
| D1 | **S1** | **The project filter always returns zero tasks.** The `<select>` is populated from `TB_PROJECTS` fixture slugs (`bx204`, `or902`, `iv415`) but rows carry `project = String(projectId)` — a numeric FK. `proj === t.project` can never match. | `TaskBoard.tsx:106`, `:282`; fixture `task-board-data.ts:134`; server `taskBoard.routes.ts:229` |
| D2 | **S1** | **"My tasks" always returns zero.** Hardcoded to a fixture short-id: `t.assignee === 'jc'`. Real assignees are numeric id strings. | `TaskBoard.tsx:107` |
| D3 | **S1** | **Every owner name renders blank and every avatar renders `?`.** `TB_TEAM[t.assignee]` is keyed `jc/mw/am/...`; `t.assignee` is `"42"`. Affects cards, detail panel, critical-path rows, Table view, and the Analytics "Team productivity" panel, which groups real rows under empty labels. | `TaskBoard.tsx:70`, `:324`, `:349`, `:381`, `:407`, `:467` |
| D4 | **S1** | **Blocked tasks disappear from the Board view.** Columns are the 4 `TB_COLS` ids; `status = 'blocked'` matches none, so blocked rows render in no column — while the Analytics tile counts them and the AnswerLead narrates them. The user is told work is blocked and cannot find it. | `TaskBoard.tsx:111`, `:298`; `TB_COLS` at `task-board-data.ts:107` |
| D5 | **S1** | **"Advance" on a blocked task silently sets it to `pending`.** `move()` does `order.indexOf('blocked')` → `-1`, then `min(3, -1+1)` → index `0`. Reachable from Table view and the detail panel. | `TaskBoard.tsx:116–129` |
| D6 | **S2** | **Selecting priority "urgent" fails with `[object Object]`.** The form offers `urgent` (`:622`); the server enum is `low\|medium\|high\|critical` (`taskManagement.routes.ts:62`). The 400 returns `error.errors` (a ZodIssue array) and the client renders `String(body.error)`. Same mismatch in the launcher (`CL_PRI`, `collab-data.ts:142`). | `TaskBoard.tsx:143`, `:622` |
| D7 | **S2** | **Module chips are grey for all seeded and enum-created tasks.** `TB_MOD` keys are `'Medical Device'` / `'Protocol Design'` (with spaces); the service, the demo seed and the enum all use `MedicalDevice` / `ProtocolDesign`. Falls through to `#888`. | `task-board-data.ts:92`; `unifiedTaskService.ts:28,46`; `scripts/seed/ga-demo.d/20-tasks-approvals.mjs:53` |
| D8 | **S2** | **The dependency picker only offers tasks matching the broken project filter**, and is capped at 6 with no search — so on real data it is empty. | `TaskBoard.tsx:641` |

### 3.2 Task Board — actions and workflow

| # | Sev | Defect | Evidence |
|---|---|---|---|
| D9 | **S1** | **"Start workflow" creates nothing.** It builds `TaskItem`s with client-side random ids and pushes them into `window.C2C` — the in-memory store the board no longer reads. The tasks are invisible the moment the modal closes. The button's own chip says *"(not yet wired)"*. | `TaskBoard.tsx:428`, `:678–697`, `:734` |
| D10 | **S1** | **The workflow feature is unreachable end-to-end even if wired.** `POST /tasks/from-template/:templateId` exists and works, but there is **no `GET /templates`** route and **no seed** for `task_templates`. The five templates shown are fixtures (`TB_WORKFLOWS`). | `taskManagement.routes.ts:458` (POST from-template), `:888` (POST /templates only) |
| D11 | **S1** | **Board mutations are not audited.** `PATCH /api/tasks/tasks/:id` and `POST /api/tasks/tasks` never call `auditTaskAction`. The audited handlers are on the *other* router, which has no UI. | `taskManagement.routes.ts:270`, `:331` vs `unifiedTasks.routes.ts:94`, `:383` |
| D12 | **S1** | **Completing a blocking task does not unblock its dependents from the board.** The cascade lives in `unifiedTaskService.updateDependentTasks`, reached only via `/api/regulatory/tasks/:id/status`. The board's PATCH writes status directly. | `taskManagement.routes.ts:343`; `unifiedTaskService.ts:738` |
| D13 | **S2** | **`POST /tasks/:taskId/notify` returns `{success:true, message:'Notification sent'}` and does nothing** — the emit is commented out. A lying endpoint. | `taskManagement.routes.ts:966–987` |
| D14 | **S2** | **No task event ever produces a notification**, despite two working notification services and an `escalationPath` column. Assignment, due-soon, overdue, blocked, approval-requested: all silent. | `notification-service.ts`; no caller from any task path |
| D15 | **S3** | **No optimistic update.** Every move awaits the PATCH, then bumps `reloadKey` and refetches the entire org board. On a busy org this is a visible stall per card move. | `TaskBoard.tsx:87`, `:125` |

### 3.3 Server-side correctness

| # | Sev | Defect | Evidence |
|---|---|---|---|
| D16 | **S2** | **Priority ordering is alphabetical, not semantic.** `orderBy(desc(priority))` on a `text` column yields `medium → low → high → critical`. This is the default order of `GET /api/regulatory/tasks/all` and the demo-seed contract. | `unifiedTaskService.ts:182` |
| D17 | **S2** | **`GET /api/regulatory/tasks/:id` fetches up to 2000 rows to find one.** `findOrgTask` calls `getAllUnifiedTasks({limit:2000})` then `.find()`. Same for `PATCH /:id/status` and both endpoints of `POST /:id/link` (3 full scans per link). | `unifiedTasks.routes.ts:69–72` |
| D18 | **S2** | **`linkTasks` appends duplicates.** `array_append` with no dedupe — link the same pair twice and `blockedBy` carries the id twice; the unblock cascade filters by value so it self-heals, but counts and chips double. | `unifiedTaskService.ts:255–263` |
| D19 | **S2** | **No cycle detection on dependencies.** `POST /tasks/dependencies` validates org membership but not acyclicity. `calculateCriticalPath` then relies on a `visited` set that is cleared per root but shared across sibling branches, so it both misses valid paths and depends on that set to avoid infinite recursion on a cycle. | `taskManagement.routes.ts:637`, `:180–215` |
| D20 | **S2** | **`task_dependencies` and `cross_module_task_links` have no org column.** `taskBoard.routes.ts` compensates by filtering both endpoints against the org's own task-id set (correct); `calculateCriticalPath` does not scope the same way. | `taskBoard.routes.ts:190–220`; `taskManagement.routes.ts:150–160` |
| D21 | **S2** | **Due dates are humanised server-side in UTC.** `humanizeDue` compares UTC day boundaries, so a user at UTC−8 sees "today" for a task that is tomorrow local, and the label is frozen until the next refetch. The client then *parses that English string* — `/overdue/.test(t.due)` — in five places, which is also the only overdue signal the AnswerLead has. This blocks i18n outright. | `taskBoard.routes.ts:114–127`; `TaskBoard.tsx:205`, `:323`, `:352`, `:408`, `:470` |
| D22 | **S2** | **Blueprint milestones are computed and thrown away.** `bootstrapFromRegistry` returns `{sections, milestones}`; project creation inserts `project_sections` and ignores `milestones` entirely. Every new project therefore starts with a fully populated section tree and a **completely empty task board**. | `concept2cure.ts:2254–2290`; `projectBootstrapFromRegistry.ts:165`, `:215` |
| D23 | **S3** | **Status is free text with no state machine.** Any string is accepted by `PATCH`; nothing prevents `completed → pending` or an unknown status that renders in no column (see D4). | `taskManagement.routes.ts:327` |
| D24 | **S3** | **No soft delete on any task table.** No `deleted_at`; the only removal path is a hard delete, which is a Part 11 record-retention problem. | `shared/schema.ts:7036` |

### 3.4 Real-time collaboration

| # | Sev | Defect | Evidence |
|---|---|---|---|
| D25 | **S1** | **Locks are per-process.** Two replicas = two independent lock tables = concurrent "exclusive" edits. | `realtime-collab.ts:377` |
| D26 | **S1** | **Presence never expires.** No idle sweep; `lastSeen` is written and never used to evict. Ghost collaborators accumulate. The client comment asserting server-side expiry is wrong. | `realtime-collab.ts:297–337`; `AuthoringCollab.tsx:105` |
| D27 | **S2** | **No lock takeover, no expiry countdown, no owner contact.** The UI shows `locked by <label>` and offers nothing else. A stale 30-minute lock has no in-product remedy. | `AuthoringCollab.tsx:187` |
| D28 | **S2** | **Lock acquire/release is unaudited** in a system whose section locks gate regulated authoring. The file says so plainly (`:576–586`) and is right to; it is still a gap. | `realtime-collab.ts:592`, `:625` |
| D29 | **S3** | **20-second heartbeat runs regardless of tab visibility**, and leave-on-unmount uses a normal `fetch` with no `keepalive`, so a tab close usually never reaches the server. Combined with D26, rosters only grow. | `AuthoringCollab.tsx:131`, `:106` |

### 3.5 Accessibility — WCAG 2.2 AA

`TaskBoard.tsx` contains **zero `aria-*` attributes**. Specifics:

| # | Sev | Defect | Evidence |
|---|---|---|---|
| D30 | **S1** | **Task cards are not reachable by keyboard.** `<div className="tb-card" onClick=...>` — no `role`, no `tabIndex`, no key handler. The primary object of the primary surface cannot be opened without a mouse. | `TaskBoard.tsx:305` |
| D31 | **S1** | **All four modals lack `role="dialog"`, `aria-modal`, focus trap, focus restore, and Escape-to-close.** They close only on scrim click. Screen-reader users are never told a dialog opened; keyboard users cannot get out. Applies to `TaskDetail`, `TaskCreate`, `WorkflowStart` and the Collab modal. | `TaskBoard.tsx:450`, `:608`, `:700`; `CollabLauncher.tsx:539` |
| D32 | **S2** | **Icon-only controls have `title` but no accessible name.** The move buttons (`:327`), the flag chips (`:308`), the close buttons (`:454`) render an SVG with no text and no `aria-label`. `title` is not a reliable accessible name and is invisible to touch. | `TaskBoard.tsx:326–329` |
| D33 | **S2** | **Unlabelled form controls.** Both filter `<select>`s have no `<label>` and no `aria-label`; the flag toggles are `<button>`s carrying pressed state via a CSS class with no `aria-pressed`. | `TaskBoard.tsx:280–288`, `:633–637` |
| D34 | **S2** | **The board never announces changes.** Column counts, the AnswerLead headline and the loading→loaded transition are silent; no `aria-live` region anywhere. | `TaskBoard.tsx:226–241` |
| D35 | **S3** | **The FAB's `⌘⇧T` shortcut is undiscoverable** — bound in a `keydown` listener with no hint in the UI, no shortcut help, and no announcement. | `CollabLauncher.tsx:487–492` |
| D36 | **S3** | **`prefers-reduced-motion` is not honoured** by the FAB/toast/modal transitions. | `app-v2.css:452` and neighbours |

### 3.6 Content and trust

| # | Sev | Defect | Evidence |
|---|---|---|---|
| D37 | **S2** | Engineering-status disclosure panel shipped to customers. | `TaskBoard.tsx:415–423` |
| D38 | **S2** | Raw API endpoints rendered as UI chrome in three modals. | `TaskBoard.tsx:652`, `:734`; `CollabLauncher.tsx:389`, `:453` |
| D39 | **S2** | The "Task sources" strip exposes internal table fragmentation as a product feature, and on live data is almost always `Board: n` and five zeros. | `TaskBoard.tsx:263–275` |
| D40 | **S3** | The rail badge "My Tasks · 12" is a **hardcoded constant**. | `registryModel.ts:111` |
| D41 | **S3** | Auto-assign is presented as intelligent ("workload-balanced", "optimal assignee") but is a JS sort of every org member by summed `estimated_hours` on active tasks, taking the first — no skill, role, module or availability input. `getOptimalAssignee` accepts a `taskData` argument and never reads it. | `taskManagement.routes.ts:229–267` |

---

## 4. UX critique of the shipped surfaces

### 4.1 What is genuinely good — keep it

- **The honesty envelope.** `dataConnect.tsx` (`useLiveRows`, shape guards,
  `EmptyState` with tone) is a better data-state discipline than most production
  React apps have. Loading / error / empty are distinct, deliberate and
  well-written. Do not weaken this while fixing §3.6 — the problem is *engineering
  detail in customer copy*, not honesty itself.
- **`AnswerLead`.** Leading the board with *"N tasks stand between you and
  <milestone>, and M are overdue"* plus a primary action is exactly right for this
  audience. It is the strongest interaction idea in the whole area. It is
  currently computed from broken inputs (D3, D21) — fix the inputs, keep the
  pattern, and extend it to every collaboration surface.
- **Security posture.** The tenant-isolation work in `unifiedTasks.routes.ts`,
  `taskBoard.routes.ts` and `realtime-collab.ts` is careful and well-documented,
  including server-computed `mine` on locks so the client never infers identity.
- **`ClientReviewZone`.** Read-first, server-side visibility filtering, honest
  per-group empty states. This is the model for how the rest should be built.
- **The kit designs.** `ui_kits/task-tray/app.jsx` already contains the right
  answer to P3 (tray, not destination; "Assigned to you / Waiting on / Approvals
  you sign"; AnA triage at the top). Build it.

### 4.2 Where the experience actually breaks down

Walk the four real jobs a regulatory user has:

**"What needs me today?"** — There is no answer. The rail badge is a constant
(D40). "My tasks" returns nothing (D2). There is no tray (P3). The one endpoint
that answers this question precisely — `/reviews/my-queue`, which returns
threads, tasks, unread count, overdue, due-soon, change-requests and approvals in
one call — has no UI (P1).

**"Ask a colleague about this section."** — The FAB's Collaborate tab is a
compose box that discards the message (`CollabLauncher.tsx:404`). The real
mechanism — a review thread anchored to a section, with `request_changes`
comments and a resolve/reopen lifecycle — exists and is unreachable.

**"Hand this off with the context."** — Quick-task captures rich context
(`sourceEntityType`, `sourceEntityId`, `sourceLabel`, a note) and then drops all
of it into a module-level array. Meanwhile the real create path
(`TaskBoard.tsx:585`) sends *none* of it — no description, no source entity, no
tags, no note. The context-capture the launcher designed is exactly what the
board's create omits.

**"Prove who did what."** — Board mutations bypass the ledger (D11). Locks are
unaudited (D28). Approval gates render a chip and a sentence about e-signature
(`TaskBoard.tsx:474–479`) with no signing action behind it.

### 4.3 Interaction-level notes

- **No drag and drop**, and the arrow-button substitute is the more accessible
  choice — but it is unlabelled (D32) and the cards aren't focusable (D30), so it
  gets the cost of both approaches and the benefit of neither.
- **Four view tabs, no persistence.** `view`, `proj`, `mod`, `mine` all reset on
  navigation. `proj` seeds from `window.C2C_TASK_FILTER` but never writes back.
  None are in the URL, so no board state is shareable or bookmarkable — a real
  loss for a tool whose users forward links to colleagues.
- **No bulk actions, no search, no sort.** With a real org's task volume the
  Table view is a wall.
- **No pagination or virtualisation.** `GET /board` returns every task in the
  org, unbounded, and renders all of them.
- **The detail panel is read-only** except Advance/Move-back. No reassign, no
  reschedule, no comment, no attachment, no history — despite `comments` and
  `attachments` counts being rendered on every card.
- **Density.** 9.5–12.5px type across the board (`app-v2.css:432–476`) is below
  comfortable reading size for a surface people live in all day.

---

## 5. Target experience

Three principles, in priority order.

### Principle 1 — One work object, one queue, everywhere

Declare **`unified_tasks` canonical** for *assignable work* and
**`concept2cure_review_threads` canonical** for *conversation*. Everything else
becomes either a producer that writes into them or a read-model that projects
from them.

Concretely:
- `loadUnifiedWork()` gains `unified_tasks` as a fourth source **immediately** —
  this is additive, reversible, and closes the two-boards problem in one change.
- AnA's `create_task` writes `unified_tasks` (keeping `project_tasks` as a
  read-only legacy source in the unified view).
- Review tasks (`concept2cure_review_tasks`) keep their own table but project
  into the unified view via the same adapter pattern already in
  `unified-work-view.ts` — the file is designed for exactly this and adding a
  fourth `*ToUnified` function is ~30 lines.
- The **`/reviews/my-queue` payload becomes the contract for "my work"** — it
  already returns the right shape.

### Principle 2 — Tasking is connective tissue, not a destination

Build the **Task Tray** the kit already designed
(`client/src/concept2cure/_shared/components/TaskTray.tsx`), mounted in every
shell top bar:

- Trigger with a **real** count from `/reviews/my-queue`
  (`totalTasks + approvalsNeeded`), replacing the hardcoded 12.
- Slide-over with three groups — **Assigned to you · Approvals you sign · Waiting
  on others** — plus overdue/due-soon separation, which `my-queue` already
  computes.
- "Triage my day with AnA" as the lead action.
- Each row deep-links to the *work*, not to the board.

Then the Task Board becomes what it should be: the **planning** surface (critical
path, dependencies, workload, analytics) rather than the inbox.

### Principle 3 — Every collaboration action must survive a refresh, and be attributable

- Retire the `window.C2C` in-memory store entirely. The FAB's Quick task POSTs to
  the real create; Collaborate POSTs a review thread comment.
- Route **all** task mutations through one audited service, so the ledger is
  unconditional rather than a property of which URL the client happened to pick.
- Notify on assignment, due-soon, overdue, blocked and approval-requested using
  the notification service that already exists.

### 5.1 Specific interaction targets

| Job | Target |
|---|---|
| What needs me | Tray opens in ≤1 action from any surface; overdue first; AnA triage available |
| Assign work in context | FAB captures the entity, persists it, notifies the assignee, and the task deep-links back to the entity |
| Discuss a section | Anchored thread in the authoring canvas; `request_changes` creates a linked task; resolve closes both |
| Move work | Keyboard-operable board with optimistic move + undo toast; blocked has a real column; illegal transitions are prevented, not silently rewritten |
| Prove it | Every mutation in the ledger; approval gates carry a real e-signature step; task history visible in the detail panel |

---

## 6. Sequenced plan

Ordered by **user-visible value per unit of risk**. Phases 0–2 are the ones that
change the product; 3–4 are the durability and compliance debt.

### Phase 0 — Stop shipping broken affordances (days)

Small, isolated, no schema change, no product decision required.

1. Fix D1/D2/D3 by replacing the `TB_PROJECTS`/`TB_TEAM` fixtures with the live
   rosters the board already fetches (`/api/projects`, and
   `/api/task-management/assignees`, which exists and is used only by the create
   form today). This alone makes the board usable on real data.
2. Fix D6 (align the priority list to the server enum, render ZodIssues as
   readable text) and D7 (align module keys).
3. Fix D4/D5: add a **Blocked** column and make `move()` operate on an explicit
   transition map rather than array index arithmetic.
4. Remove or gate the engineering disclosures (D37–D39) behind a dev flag.
   Replace the endpoint chips with plain-language outcome copy.
5. Either wire "Start workflow" to `POST /tasks/from-template/:id` **and** add
   `GET /templates` + a seed, or remove the button until it works (D9/D10).
6. Delete `POST /tasks/:taskId/notify` or implement it (D13).

**Acceptance:** a signed-in user on seeded demo data can filter by project, see
their own tasks, read owner names, find blocked work, and move a card without a
silent wrong transition.

### Phase 1 — Surface the collaboration backend that already exists (1–2 weeks)

7. Build the **Task Tray** against `/reviews/my-queue` + `/approval-workflows/pending`.
8. Build the **review-thread panel** in the authoring canvas against
   `/projects/:p/artifacts/:a/review-threads` + `/review-threads/:id/comments`,
   with `request_changes` → linked review task.
9. Rewire the FAB: Quick task → `POST /api/tasks/tasks` **with** the context it
   already collects (description, `sourceEntityType`/`Id`, tags); Collaborate →
   `POST /review-threads/:id/comments` or a new thread.
10. Delete `window.C2C` and the `TB_*` fixtures once no consumer remains.
11. Wire the notification inbox to `/notifications/my` + read/dismiss.

**Acceptance:** every action in the FAB survives a refresh; the tray count is
real; a comment written in the canvas is visible to another user in another
session; assigning a task notifies the assignee.

### Phase 2 — One work model (2–3 weeks, one product decision)

12. Add `unified_tasks` as a source in `loadUnifiedWork()` and reconcile the
    column vocabulary between the two boards.
13. Point AnA's `create_task`/`update_task`/`list_tasks` at the canonical store.
14. Persist `bootstrapResult.milestones` at project creation (D22) so a new
    project has a populated board on day one.
15. Consolidate the two task routers into one audited service; keep the old
    prefixes as thin aliases for one release.
16. Add the transition state machine (D23) and semantic priority ordering (D16).

**Acceptance:** a task created anywhere — board, FAB, AnA, template, project
bootstrap — appears in every place that claims to show the user's work.

### Phase 3 — Accessibility and interaction quality (1–2 weeks, parallel to Phase 2)

17. D30–D36: focusable cards, dialog semantics with focus trap and Escape,
    accessible names on icon controls, labelled filters, `aria-live` for board
    changes, reduced-motion support.
18. Optimistic moves with an undo toast (D15).
19. URL-persisted board state (view, project, module, assignee) so boards are
    shareable.
20. Search, sort, bulk actions and virtualisation on the Table view.

**Acceptance:** the board is fully operable by keyboard and screen reader; an
axe-core pass on the surface is clean; a board view can be shared by URL.

### Phase 4 — Durability and Part 11 (2–3 weeks)

21. Move locks and presence to Redis or Postgres with TTL-based expiry (D25/D26),
    add takeover-with-audit and an expiry countdown in the UI (D27).
22. Audit lock acquire/release (D28).
23. E-signature on regulated task sign-off, writing `approvalHistory`.
24. Soft delete (`deleted_at`) on the task tables (D24).
25. Cycle detection on dependencies; org columns on the graph tables (D19/D20).
26. Client-side relative dates from raw ISO timestamps; retire the humanised-string
    parsing (D21) — a prerequisite for i18n.

---

## 7. What to measure

Instrument before Phase 1 so the work is provable:

| Metric | Why |
|---|---|
| Tray open rate / DAU | Does tasking become connective tissue? |
| Time from "task assigned" → "task opened" | The notification + tray value |
| % of tasks with a `sourceEntityId` | Is context actually captured? |
| Tasks created via FAB vs board vs AnA | Where work really originates |
| % of task mutations with a ledger entry | Should reach 100% after Phase 2 |
| Threads per artifact; % resolved | Is discussion happening in-product? |
| Board sessions ending with zero interaction | The "dead surface" signal today |
| Lock contention events / stale-lock takeovers | Justifies Phase 4 |

---

## 8. One-paragraph summary for the operator

The collaboration and tasking system is not under-built — it is under-connected.
A complete, tested, tenant-safe review-collaboration backend (threads, comments,
change requests, a personal queue, notifications, escalation) ships today with no
user interface, while the collaboration control that appears on every screen
writes to a JavaScript variable and says so in its own copy. The task board reads
real data through an unaudited API path while the audited path sits unused, and
its filters, owner names and workflow launcher are still bound to fixtures, so on
real data the project filter and "My tasks" both return nothing and every owner
renders blank. Two separate "unified" layers exist and exclude each other, so the
product shows two Kanban boards of the same person's work with no rows in common.
The highest-value next move is not new capability: it is Phase 0 (fix the fixture
bindings and the broken transitions — days) followed by Phase 1 (build the Task
Tray and the review-thread panel over backends that already exist — one to two
weeks). That sequence turns roughly 300 lines of missing client code into the
"what needs me today" answer the product currently cannot give.
