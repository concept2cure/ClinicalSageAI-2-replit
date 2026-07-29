---
title: Tasking module — assurance pass (sufficiency, holism, use-case coverage, lineage)
date: 2026-06-03
audience: operator + Claude Design + Claude Code
branch: concept2cure-v2
basis: 3-agent verification + tenant-isolation fix + data-lineage implementation
status: foundation GA-grade; full holism gated on one product decision + the GA backlog
---

# Tasking module — assurance pass

This is the transparent record requested: is the tasking pass **sufficient**,
**holistic**, does it address **the client's tasking use cases**, and does it have
a **fully transparent lineage of decisions and data**. It is deliberately candid —
it states what is now GA-grade and what is not yet, with evidence.

## 0. Verdict (read first)

- **Sufficient for what it fixed:** yes. The two GA-critical, verifiable items were
  closed and tested — the **cross-tenant security hole** and the **absence of data
  lineage** on task mutations.
- **Holistic / all use cases:** **not yet** — and honestly so. The tasking module
  has a strong UI and now a tenant-safe, audited mutation path, but it is **not a
  single coherent system**: tasks are fragmented across three uncoordinated
  "canonical" stores, and several regulated use cases (e-sign sign-off, soft-delete,
  notifications, approvals, blueprint seeding) are gaps. These need **one product
  decision** (the canonical store) plus the **live-infra loop**. They are specified,
  not silently skipped (§3, §4).
- **Lineage of decisions:** transparent — see §1.
- **Lineage of data:** task create / transition / link now write an immutable,
  hash-chained ledger record (shipped this session, §2). Two data-lineage gaps
  remain (e-signature on sign-off; soft-delete of the record) — §2.

## 1. Decision lineage (every decision this session, with rationale)

| # | Decision | Rationale | Status |
|---|---|---|---|
| D1 | Verify tasking with 3 parallel agents (backend, cross-service, UI) before touching code | Same method that worked for Projects; avoids guessing | Done |
| D2 | Fix the cross-tenant IDOR first | P0 security; the API the UI binds to leaked/mutated across tenants | **Shipped** `31cf35b` |
| D3 | Derive org from JWT (`getSecureOrgId`), ignore client `organizationId` | Mirrors the already-safe sibling router `/api/tasks`; zero new dependency | Done |
| D4 | Add per-task org-ownership checks on by-id read/mutate paths (`findOrgTask`) | Closing the bulk leak isn't enough; `GET/PATCH/POST /:id*` must not touch another tenant's task | Done |
| D5 | Add a `supertest` regression test (5 cases) | A P0 security fix needs a guard against regression | **Shipped** `8c0a1b2` |
| D6 | Implement immutable **data lineage** on task mutations via the shared `recordGovernedAction` ledger | The user requires "transparent lineage of data"; reusing the Projects primitive avoids a second audit path (no drift) | **Shipped** `065b5e3` |
| D7 | Make lineage best-effort + graceful (never break the mutation; skip attributionless rows) | An audit write must not take down task functionality; an audit row without a real actor is worse than none | Done |
| D8 | Do **not** force reason-for-change / e-signature on routine status moves yet | E-sign needs UI reason capture + a re-auth flow; forcing it now would break the existing UI. Reserved for regulated sign-off (GA backlog) | Deferred — §4 |
| D9 | Do **not** blind-resolve the canonical-store fragmentation | It is a product decision (which of `unified_tasks` / `c2c_project_work_items` / `project_tasks` wins) with cross-surface blast radius — operator's call | Deferred — §3 |
| D10 | Do **not** blind-push schema migrations (soft-delete, org columns on graph tables) | This sandbox can't run the preview DB; the repo reverts blind regulated-schema work | Deferred to live loop — §4 |
| D11 | Ship specs (surfacing report, UI work order, handoff) for Claude Design/Code | The user wants to hand tasking to Design | **Shipped** `390cfd7` |

Nothing was changed silently; every deferral above is a named GA-backlog item with a
reason, not an omission.

## 2. Data lineage — what is now traceable

**Now traceable (shipped `065b5e3`):** every task **create / status-transition /
link** through `/api/regulatory/tasks` writes a governed record to `audit_logs` +
`c2c_ana_actions` with a **SHA-256 hash chain** — capturing the authenticated actor,
the task target (`task:<id>`), a before/after payload, a timestamp, and an optional
reason-for-change. This is the same immutable trail the Projects governed actions
use. Verified by unit tests (wiring + graceful degradation); DB persistence is
certified in the preview/CI loop (tables ship in `20260527_mutation_primitives`).

**Still missing (data-lineage gaps):**
- **E-signature on regulated sign-off** — task completion is audited but not
  e-signed; no §11.50 meaning-of-signature / §11.100 re-auth on completion. (D8)
- **Soft-delete / immutable record history** — no `deleted_at` on the task tables;
  a deleted task leaves no tombstone. (D10)
- **Other writers not yet on the ledger** — the orphaned `/api/tasks` router and the
  AnA `project_tasks` path don't call `auditTaskAction` yet; they should once the
  canonical store is chosen (§3).

## 3. Holism — the one blocker (canonical store)

Tasks live in **7 tables**, and three surfaces each treat a different one as
canonical: the tasking board reads `unified_tasks`, MDX workbench/ProjectHome read
`c2c_project_work_items`, and AnA writes `project_tasks`. An AnA-created task never
appears on the board. **No UI built over this can be holistic until one store is
declared canonical** (or a true unification layer is built). This is the first task
in the work order and an operator/designer decision (D9).

## 4. Client use-case coverage matrix

| Client tasking need | Status | Evidence / note |
|---|---|---|
| Tenant isolation (no cross-tenant task access) | ✅ Covered | fixed + tested (`31cf35b`, `8c0a1b2`) |
| Immutable audit / data lineage of task changes | ✅ Covered (unified path) | shipped `065b5e3`; other writers pending §3 |
| Create task — manual / AnA / programmatic (module sync) | ✅ Covered | `POST /unified`, AnA RI, `syncTasksFromModule` |
| Assign / reassign / auto-assign | ✅ Covered | `assigneeId`; auto-assign in `/api/tasks` |
| Cross-program status view (board / list / overview) | ✅ Covered | built UI, live |
| Dependencies / blocking / critical path | ✅ Covered | `task_dependencies` + DFS; unblock cascade |
| Search / filter / owner (mine vs everyone) | ✅ Covered | built UI |
| Cross-module rollup (CMC/IND/eCTD/Vault/…) | ✅ Covered | `syncTasksFromModule` |
| Single source of truth (one canonical store) | ❌ Gap | 3 uncoordinated stores (§3) — **headline** |
| Due / overdue / escalation **notifications** | ❌ Gap | only review tasks wired; `escalationPath`/`notificationSettings` columns unread |
| E-signature on regulated task sign-off | ❌ Gap | audited but not e-signed (D8) |
| Reason-for-change capture (UI) | ◐ Partial | optional reason now flows to the ledger; UI doesn't capture it |
| Soft-delete / immutable record history | ❌ Gap | no `deleted_at` on any task table |
| Status-transition state machine | ❌ Gap | free-text status; any value accepted |
| Templates / blueprints per submission type | ❌ Gap | catalog orphaned (zero call sites) |
| Recurring / automated task generation | ◐ Partial | `task_automation` table exists; wiring unproven |
| Project-scoped tasks (tasks for one program) | ❌ Gap | string `proj_…` vs numeric `project_id`; filter inert |
| Role-based approvals ("you sign") | ❌ Gap | Task Tray unbuilt; approval columns unwritten |
| CAPA / corrective-action tasks (ISO 14971) | ❌ Gap | siloed in `capa_actions` |
| Deficiency-remediation tasks | ❌ Gap | deficiency scan creates none |
| Collaboration / comments on tasks | ◐ Partial | json `comments` column; no thread backend |
| Time tracking (estimated / actual hours) | ◐ Partial | columns exist; not surfaced |
| Workload / throughput reporting | ◐ Partial | `/api/tasks/analytics` + dashboard metrics exist (orphaned client-side) |
| Persistent task affordance across shells (tray) | ❌ Gap | `ui_kits/task-tray` unbuilt |

**Coverage read:** the *operational core* (create, assign, track, depend, roll up,
isolate, **and now audit**) is covered; the *regulated-completeness* layer (single
store, e-sign, soft-delete, notifications, approvals, blueprint seeding) is the GA
backlog. The full backlog with priorities is in
`docs/reports/tasking-module-surfacing-report-2026-06-03.md §6`.

## 5. What "sufficient" means here

The session's mandate — get the tasking backend GA-grade where it is **safely and
verifiably** closeable from this environment, and hand Design a spec — is met: the
**security** and **data-lineage** foundations are shipped and tested on
`concept2cure-v2`. Full holism is **one product decision** (the canonical store) plus
a **live-infra backlog** (e-sign, soft-delete, notifications, consolidation) away —
all documented, prioritized, and ready. That boundary is stated, not hidden.

## 6. Pointers

- Decisions + status: this file.
- What to surface / hold: `docs/reports/tasking-module-surfacing-report-2026-06-03.md`.
- Build plan + cross-service map: `TASKING_UI_WORK_ORDER.md`.
- Entry point: `TASKING_HANDOFF.md`.
