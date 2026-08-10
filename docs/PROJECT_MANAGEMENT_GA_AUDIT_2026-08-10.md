# Project Management Subsystem — GA Readiness Audit

**Date:** 2026-08-10
**Scope:** All project-management code — data model, API, services, client surfaces, user workflow, performance, dependencies, testing, security.
**Method:** Direct source reading with `file:line` verification of every claim. No finding is recorded here that was not traced end-to-end through client → API → service → schema → migration.

---

## 1. Verdict

**Not GA-ready. Estimated 62 engineer-days to a defensible commercial GA, 145 to a competitive one.**

The platform has genuinely strong engineering foundations — a default-deny auth boundary, fail-closed RLS, transactional writes, a zero-error typecheck baseline, 22 CI workflows. Those are real and hard-won.

But the project-management capability specifically is split across **two disjoint project identity spaces**, and the richer of the two is unreachable from the shipped UI. The consequence is not cosmetic: the features a buyer is purchasing (tasks, milestones, hierarchy, scheduling, rules) exist as ~54 tested endpoints that no user can reach, while the surface users *do* reach is missing team rosters, activity history, audit trail, notifications, and access control — each for a separately verifiable reason.

The single most important sentence in this report: **project-level access control is currently non-functional, and every project is readable by every member of the organization.** That is a P0 for a multi-tenant GxP product and is detailed in §4.2.

| Dimension | Score | Note |
|---|---|---|
| Security (tenant boundary) | 8/10 | Auth boundary + fail-closed RLS are excellent |
| Security (intra-tenant ACL) | 2/10 | Project ACL fails open — §4.2 |
| Data model | 3/10 | Two competing project entities; core tables never migrated |
| API surface | 4/10 | Well-built, but 81% unreachable |
| Services / business logic | 5/10 | Real logic, wrong id-space |
| Client UI | 5/10 | Honest, well-built, but thin over a broken backend |
| User workflow | 3/10 | 4 of 8 core journeys break — §6 |
| Performance | 5/10 | No pagination, no code splitting, N+1 in path recompute |
| Dependencies | 6/10 | 270 deps, 31 vulns, clean typecheck |
| Testing / CI | 6/10 | Strong CI, no project-lifecycle e2e |
| Feature completeness | 3/10 | No Gantt, dependencies, notifications, reporting |
| **Overall** | **~40%** | |

---

## 2. What is genuinely strong

Stated first because a careless audit would get these wrong, and because the remediation plan depends on them holding.

- **Default-deny authentication.** `server/middleware/authBoundary.ts` mounts once before all route registration; every `/api` request passes through it, with a documented allowlist and a `warn`/`enforce` soak mode. Route files do not need to remember to add auth.
- **Fail-closed RLS.** `migrations/0021_enable_rls_everywhere.sql` applies a uniform tenant policy to every table with an org column, and uses `FORCE ROW LEVEL SECURITY` — correctly noting that on Neon the app role owns the tables and plain `ENABLE` would be silently ineffective. `server/db/rlsEnforcement.ts:93` **refuses to boot in production** unless `RLS_ENFORCE=on`, and rejects aliases so `grep RLS_ENFORCE=on` is the whole check.
- **Transactional project creation.** `server/routes/c2c/projects.ts:236-266` wraps the program insert and document scaffold in one transaction, with a `SAVEPOINT`-correct retry on unique-code collision.
- **Clean typecheck.** `.typecheck-baseline.json` is at `errorCount: 0`, ratcheted down from 2,598 with the history preserved.
- **Honest empty states.** `ProjectHome.tsx:31-36` renders `EmptyState` for slices with no reachable backend "rather than a fabricated fixture." The code documents its own gaps accurately — this audit largely confirms comments the authors already wrote.

This is not a codebase that needs rescuing. It needs one architectural decision resolved and its consequences swept up.

---

## 3. The core architectural finding

### Two project identity spaces

Project management is implemented twice, on incompatible key types, and the UI uses the thinner one.

| Router | Endpoints | Backing table | Key type | Real client consumers |
|---|---:|---|---|---:|
| `project-sections.ts` | 21 | `projects` | `serial` | **0** |
| `project-rules.ts` | 10 | `projects` | `serial` | **0** |
| `project-modules.ts` | 9 | `projects` | `serial` | **0** |
| `project-hierarchy.ts` | 8 | `projects` | `serial` | **0** |
| `project-schedule-of-events.ts` | 6 | `projects` | `serial` | **0** |
| `project-home-routes.ts` | 1 | `projects` | `serial` | **0** |
| `projects-management.ts` | 5 | `projects` | `serial` | 1 (a dropdown) |
| `c2c/projects.ts` | 13 | `regulatory_programs` | `uuid` | **22** |
| `c2c/project-vault.ts` | 1 | `regulatory_programs` | `uuid` | 6 |

**60 of 74 project endpoints (81%) have no consumer anywhere in the repository** — verified by searching all of `client/`, `ui_kits/`, and every `.ts/.tsx/.js/.jsx/.html` file outside `server/`, tests, and docs. `ui_kits/projects/` is a standalone design prototype (`App.jsx` + `index.html` + `styles.css`), not wired into the app.

**The evidence chain:**

1. `client/.../surfaces/Projects.tsx:152` — the New Project wizard posts to `/api/c2c/projects`.
2. `server/routes/c2c/projects.ts:220` — that handler inserts into `regulatory_programs`.
3. `shared/schema/programs.ts:45` — `regulatory_programs.id` is `uuid('id').primaryKey().defaultRandom()`.
4. `shared/schema.ts:5237` — `projects.id` is `serial('id').primaryKey()`.
5. `client/.../surfaces/ProjectHome.tsx:12-17` states it outright:

   > `id` is the C2C regulatory_programs UUID … It is NOT a numeric projects.id, so the numeric project-home read-model (`/api/project-home/:projectId`) is **deliberately NOT called** from here (parseInt of a UUID would load a different project in the same org).

The team knows. The read-model was built, tested, and then quarantined behind a comment because its key type doesn't match the UI's.

**The user-visible symptom.** `client/.../surfaces/TaskBoard.tsx:552` populates its project picker from `useLiveRows<ProjectOpt>('/api/projects')` — the integer `projects` table — while the portfolio and project home read `regulatory_programs`. **A user's task-board project list and their portfolio project list are different lists drawn from different tables.** Creating a project in the portfolio does not make it selectable on the task board, and vice versa.

Everything in §4 is either a direct consequence of this fork or a gap it has masked.

---

## 4. Finding register

### P0 — blocks GA

#### 4.1 Project-management feature set is unreachable
Covered in §3. 60 orphaned endpoints including all hierarchy, rules, module-integration, section, and schedule-of-events capability.
**Impact:** The differentiated PM capability cannot be demonstrated, sold, or used.
**Fix:** Pick one id-space and converge (§7, W1). **Effort: 30 d.**

#### 4.2 Project access control fails open — every project is org-public
This is the most serious finding in the audit. Four verified links:

1. **The tables were never migrated.** `project_members` and `project_visibility_settings` are defined in `shared/schema.ts:5306` and `:5345` but created by **zero migrations** — `grep -c "project_members" migrations/0000_sweet_joseph.sql` returns `0`, and no other migration creates either table. (By contrast `project_tasks` and `project_workflow_stages` *are* created in `0000_sweet_joseph.sql`.)
2. **Reads soft-degrade.** `server/routes/concept2cure.ts:1288-1291` catches the resulting `42P01` via `isMissingTableError(error)` and returns `fallback`. `server/routes/c2c/projects.ts:456-468` does the same with a bare `catch { return res.json({ team: [] }); }`.
3. **The fallback defaults to public.** `server/services/project-sharing-access.ts:96-103` — when `settings.projectSharing` is absent, it returns `{ visibility: 'org_public', legacyFallbackApplied: true }`.
4. **`org_public` short-circuits every check.** `project-sharing-access.ts:125` — `if (sharing.visibility === 'org_public') return true;` in `canUseProject`, before any membership test.

**Impact:** On any database provisioned from migrations, private projects do not exist. Every member of an organization can read every project. The org boundary still holds (RLS is sound), so this is intra-tenant — but for a CRO hosting competing sponsors, a blinded study, or an M&A-sensitive program, this is a deal-breaker and a probable contractual breach.
**Fix:** Write the migrations, remove the fail-open fallback, default to `private`, add a boot-time assertion that both tables exist. **Effort: 8 d.**

#### 4.3 Team roster is permanently empty, silently
`server/routes/c2c/projects.ts:459-464` joins `project_members pm JOIN regulatory_programs rp ON rp.id = pm.project_id`. `rp.id` is `uuid`; `pm.project_id` is `integer` referencing `projects.id`. Postgres raises `42883 operator does not exist: uuid = integer` — and even before that, the table does not exist (`42P01`). The query also selects `pm.added_at`, which is not a column on `project_members` (`shared/schema.ts:5345` has `created_at`/`accepted_at`). All three errors land in the same bare `catch` and return `{ team: [] }`.
**Impact:** The team panel on Project Home shows nobody, for everybody, forever, with no error surfaced. Collaboration is invisible.
**Fix:** Falls out of 4.2 once the id-space is settled. **Effort: 3 d.**

#### 4.4 No audit trail on the live project path — 21 CFR Part 11 gap
`server/routes/c2c/projects.ts` contains **zero** audit writes (no `INSERT INTO audit_logs`, no `insert(auditEvents)`) — verified by grep across the file and `scaffold-project-documents.ts`. It *reads* `audit_logs` at `:603` to render an activity feed.
By contrast `projects-management.ts` — the orphaned router — audit-logs correctly at `:277`, `:365`, `:452`.
**Impact:** Project creation, update, and document scaffolding on the path users actually use produce no audit record. The Project Home activity feed is consequently always empty. For a platform selling into GxP, an unauditable record-creating action is a finding in any customer audit or inspection.
**Fix:** Add audit writes inside the existing creation transaction; backfill the activity read. **Effort: 6 d.**

### P1 — blocks a competitive GA

#### 4.5 No notification or reminder system
No due-date alerting, assignment notification, escalation, or digest exists anywhere. `nodemailer@9.0.1` is a dependency; nothing in `server/jobs/`, `server/workers/`, or `workers/` connects a project date to it — the only "due" logic is `server/jobs/regulatoryHorizonScan.ts:49`, which schedules source scans.
**Impact:** A project tool that never tells anyone anything. Users must open the app to discover a slipped date. This is table stakes and its absence is immediately obvious in a demo. **Effort: 12 d.**

#### 4.6 Project quota is not enforced, counts the wrong table, and fails open
Three independent defects in one control:
- `enforceProjectQuota` (`server/services/quotaEnforcementService.js:423`) is **never mounted** on any route — the creation path in `c2c/projects.ts` has no quota, license, or entitlement check at all.
- `checkProjectQuota` (`server/services/license-manager.ts:429`) counts `SELECT COUNT(*) FROM projects` — the table the UI never writes to. It returns `0` regardless of how many projects exist.
- Its `catch` returns `{ withinQuota: true }` — explicitly fail-open (`license-manager.ts:443`).

**Impact:** Plan limits are unenforceable; revenue leaks silently. **Effort: 4 d.**

#### 4.7 Silent fallback to in-memory storage
`server/storage.ts:4385-4390` — when `pool` is falsy the app logs `logger.warn('Database not available, using in-memory storage')` and serves from `MemStorage`, which holds `projects`, `projectTasks`, `projectModules`, and `projectWorkflowStages` in plain arrays (`:671-676`).
**Impact:** A misconfigured `DATABASE_URL` yields an app that appears to work and accepts writes that vanish on restart, behind a single `warn`. **Effort: 1 d** (fail fast in production).

#### 4.8 Unbounded list endpoints
`GET /api/c2c/projects` (`c2c/projects.ts:129-146`) selects all org programs `ORDER BY p.updated_at DESC` with no `LIMIT` and no pagination. `GET /api/projects` (`projects-management.ts:70-84`) does the same over `projects`.
**Impact:** Response size and latency grow linearly with tenant size; no client-side virtualization compensates (`react-window` is a dependency but is imported nowhere in `client/src`). **Effort: 4 d.**

#### 4.9 No code splitting — all 106 surfaces bundled eagerly
`client/src/concept2cure/v2/surfaceViews.ts` has 88 static imports and no `React.lazy` or dynamic `import()` anywhere in it or `V2App.tsx`.
**Impact:** Every user downloads all 106 surfaces to see one. With 203 production dependencies this is the dominant first-paint cost. **Effort: 5 d.**

#### 4.10 `recomputePaths` is N+1 and non-transactional
`server/services/project-rollup-service.ts:405-429` — per node: one query for the parent path, one `UPDATE`, one query for children, then a serial recursive call per child. No transaction wraps the traversal.
**Impact:** Moving a node near the root of a deep tree issues O(n) sequential round trips; a mid-traversal failure leaves the materialized `path` column partially updated, corrupting ancestor/descendant queries. **Effort: 2 d** (single recursive CTE `UPDATE`).

### P2 — quality and completeness

| # | Finding | Evidence | Effort |
|---|---|---|---:|
| 4.11 | No project-lifecycle e2e test | `tests/e2e/` has 15 specs; none covers create → invite → task → complete | 8 d |
| 4.12 | 31 npm vulnerabilities (2 high) | `npm audit`: `image-size` (allowlisted in `.trivyignore`), `pptxgenjs` — both DoS | 2 d |
| 4.13 | No archive / close-out on the live path | `c2c/projects.ts` has no project `DELETE` or archive; only `projects-management.ts:329` does | 4 d |
| 4.14 | Task data fragmented across 4 stores | `server/routes/taskBoard.routes.ts:133` names them: `projectTasks`, `project_tasks`, `crossModuleTaskLinks`, an in-memory pyramid | 10 d |
| 4.15 | No Gantt, dependency graph, or critical path | `projectTasks.dependsOn` exists (`shared/schema.ts:6859`) with no engine reading it; no timeline library in `package.json` | 20 d |
| 4.16 | Unused heavy dependency | `react-window` in `package.json:374`, imported nowhere in `client/src` | 0.5 d |

---

## 5. Feature completeness

| Capability | Status | Evidence |
|---|---|---|
| Project/program hierarchy | **Built, unreachable** | `project-hierarchy.ts`, 8 endpoints, 0 consumers |
| Tasks & assignment | **Fragmented** | 4 stores; picker reads a different table than the portfolio |
| Milestones & deadlines | **Built, unreachable** | `projectMilestones`, `c2cMilestones`, `programMilestones` |
| Dependencies / critical path | **Absent** | `dependsOn` column with no scheduling engine |
| Gantt / timeline editing | **Absent** | no timeline library |
| Resource & capacity | **Absent** | — |
| Templates | **Partial** | `scaffold-project-documents.ts` scaffolds docs from rule packs |
| Approvals / e-signature | **Partial** | e-sign exists platform-wide; not bound to project plan items |
| Comments / @mentions | **Absent** | — |
| Notifications | **Absent** | §4.5 |
| Reporting / portfolio rollup | **Partial** | `report-os.ts` schema exists; `project-rollup-service.ts` is orphaned |
| Cross-project search | **Absent** | — |
| Time / budget tracking | **Schema only** | `projects.budget`, `projectTasks.estimatedHours` — never read |
| RAID / risk register | **Partial** | `projects.riskAssessment` jsonb; no register UI |
| Audit trail | **Broken on live path** | §4.4 |
| Integrations (MS Project, Jira, Veeva) | **Absent** | — |
| Public API / webhooks | **Present** | `/api/v1` with API-key auth; no project resources exposed |

**Regulatory-specific PM** — submission back-planning, HA meeting planning, commitment tracking — has schema (`project-charter.ts`: `timelinePhases`, `projectCommitments`; `ha-interactions.ts`: `commitmentMilestones`) and surfaces (`IndLifecycle.tsx`, `AgencyMeetings.tsx`), but they are not bound to the project plan. This is the strongest available differentiator and it is currently unrealized.

---

## 6. User workflow assessment

| # | Journey | Status | Break point |
|---|---|---|---|
| J1 | Sign up → first project | **Works** | Wizard → `POST /api/c2c/projects`, transactional, scaffolds docs |
| J2 | Setup: pathway, region, target date | **Works** | Registry-driven; persists to `regulatory_programs` |
| J3 | Invite teammates, set roles | **Broken** | §4.2 + §4.3 — roster always empty; no invite/accept flow; all projects org-public |
| J4 | Daily: what's due, who owns what | **Broken** | Task board reads a different project table than the portfolio (§3) |
| J5 | Document work, review, sign-off | **Partial** | Doc scaffold works; review routing not bound to project plan |
| J6 | Track milestones; date slips | **Broken** | Milestone stack orphaned; nothing propagates or alerts (§4.5) |
| J7 | Status reporting / portfolio | **Partial** | Portfolio list renders; rollup service orphaned; no export |
| J8 | Close-out / archive | **Absent** | No archive on the live path (§4.13) |

**4 of 8 core journeys are broken; 1 is absent.** J1 and J2 — the demo path — work well, which is why the problem has stayed invisible.

---

## 7. Path to GA

### W0 — Stop the bleeding (1 week, 1 engineer)
Prevents new damage and closes the two findings that are unacceptable in any shipped state.
- 4.2 — migrate `project_members` / `project_visibility_settings`; default `private`; delete the fail-open fallback; boot-time table assertion.
- 4.7 — fail fast in production instead of falling back to `MemStorage`.
- 4.12 — patch or re-justify the 2 high vulnerabilities.

**Exit:** A project created private is invisible to a non-member, proven by an integration test against a real Postgres. Production refuses to boot without a database.

### W1 — Resolve the id-space (4 weeks, 2 engineers)
The decision everything else waits on. **Recommendation: converge on `regulatory_programs` (UUID)** — it is what the UI, the vault, the document scaffold, and 22 client call sites already use; migrating it to `serial` would break live data and the eCTD/vault linkage. Re-key the PM stack's `project_id` columns to `uuid` and repoint the orphaned routers.
- 4.1 — re-key and reconnect hierarchy, rules, modules, sections, schedule-of-events.
- 4.3 — team roster (falls out).
- 4.4 — audit writes on the live path.
- 4.14 — collapse the 4 task stores into one.

**Exit:** `/api/project-home/:id` is called by `ProjectHome.tsx`. One project list backs both the portfolio and the task board. Every project mutation writes an audit row.

### W2 — Product completeness (5 weeks, 3 engineers)
- 4.5 notifications · 4.6 quota enforcement · 4.13 archive/close-out · 4.15 dependencies + critical path + timeline · J7 reporting and export.

**Exit:** A slipped milestone emails its owner. A plan limit blocks the 11th project. A portfolio status report exports.

### W3 — Commercial polish (3 weeks, 2 engineers)
- 4.8 pagination · 4.9 code splitting · 4.10 path recompute · 4.11 lifecycle e2e · 4.16 dependency cleanup · WCAG 2.2 AA pass on PM surfaces.

**Exit:** Lighthouse and axe clean on PM surfaces; p95 project-home < 500 ms at 100 projects × 500 docs × 50 users.

### Effort model

| Wave | Engineer-days | 3 engineers | 6 engineers |
|---|---:|---:|---:|
| W0 | 11 | 1 wk | 1 wk |
| W1 | 51 | 4 wks | 2 wks |
| W2 | 50 | 4 wks | 2 wks |
| W3 | 33 | 3 wks | 1.5 wks |
| **Total** | **145** | **12 wks** | **6.5 wks** |

- **Minimum defensible GA** = W0 + W1 = **62 d** (~5 wks at 3 engineers). Ships an honest, coherent, auditable project tool with working access control.
- **Competitive GA** = W0–W3 = **145 d** (~12 wks at 3 engineers).

### Scope cuts for v1
Do not build: resource/capacity management, time and budget tracking, MS Project / Smartsheet / Jira integration, mobile-native, offline. Position as "regulatory program management," not "a PM tool" — competing with Smartsheet on generic PM features is not winnable and not what the buyer wants. The differentiator is submission back-planning bound to the eCTD dossier, which W2 delivers.

---

## 8. Go / no-go checklist

- [ ] A private project is provably invisible to a non-member (integration test, real Postgres)
- [ ] Every project mutation writes an immutable audit row with actor, timestamp, and before/after
- [ ] One project list backs the portfolio, the task board, and quota counting
- [ ] Project-lifecycle e2e green in CI: create → invite → assign → complete → archive
- [ ] p95 `/api/c2c/projects` < 300 ms at 500 projects/tenant, paginated
- [ ] Plan limits enforced on create, fail-closed
- [ ] Zero high/critical vulnerabilities, or documented and time-boxed
- [ ] Notification delivery verified end-to-end with bounce handling
- [ ] WCAG 2.2 AA on all PM surfaces
- [ ] Production refuses to boot without a database and without `RLS_ENFORCE=on` (second half already true)
- [ ] Customer data export and GDPR delete cover project records
- [ ] Runbook for the top 5 support scenarios

---

## 9. Top risks

| Risk | L | I | Mitigation |
|---|---|---|---|
| Id-space migration corrupts live tenant data | M | H | Dual-write + backfill + shadow-read before cutover; no destructive step until parity is proven |
| §4.2 already breached a customer confidentiality term | L | H | Legal review; check access logs for cross-project reads before remediation lands |
| 60 orphaned endpoints hide more broken assumptions | H | M | Re-point incrementally with a contract test per router |
| W1 estimate optimistic — id-space touches 20+ files | M | H | Timebox a 3-day spike before committing the date |
| Fixing fail-open ACL locks users out of their own projects | M | M | Backfill owner/creator as `owner` member before flipping the default |
| No e2e means regressions ship silently | H | M | Land 4.11 in W1, not W3 |

---

*Findings verified by direct source reading. Every `file:line` citation was opened and confirmed. A parallel multi-agent audit is in progress; its results will be merged into this document.*
