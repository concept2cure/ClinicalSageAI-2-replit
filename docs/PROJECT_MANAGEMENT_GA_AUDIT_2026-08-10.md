# Project Management Subsystem — GA Readiness Audit

**Date:** 2026-08-10
**Scope:** All project-management code — data model, API, services, client surfaces, user workflow, performance, dependencies, testing, security.
**Method:** Direct source reading with `file:line` verification of every claim. No finding is recorded here that was not traced end-to-end through client → API → service → schema → migration.

---

## 1. Verdict

**Not GA-ready. Estimated 69 engineer-days to a defensible commercial GA, 140 to a competitive one.**

The platform has genuinely strong engineering foundations — a default-deny auth boundary, fail-closed RLS, transactional writes, a zero-error typecheck baseline, 22 CI workflows. Those are real and hard-won.

But the project-management capability specifically is split across **two disjoint project identity spaces**, and the richer of the two is unreachable from the shipped UI. The consequence is not cosmetic: the features a buyer is purchasing (tasks, milestones, hierarchy, scheduling, rules) exist as ~54 tested endpoints that no user can reach, while the surface users *do* reach is missing team rosters, activity history, audit trail, notifications, and access control — each for a separately verifiable reason.

The single most important sentence in this report: **on the live project API, per-project authorization is never invoked — any authenticated org member can read, modify and delete any project in their organization.** The access-control system that would prevent this is real and correct; it is simply bound to the other project entity and never called. That is a P0 for a multi-tenant GxP product and is detailed in §4.2.

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
- **A tamper-proof Part 11 audit interceptor.** `server/startup/audit-trail.ts` HMAC-chains an entry for every mutating `/api` request, with a documented operator runbook. Its default-off posture is a GA gap (§4.4); the mechanism itself is good.
- **Proactive milestone monitoring.** `jobs/scheduleOfEventsSweep.ts` re-assesses schedule health, opens recovery tasks and fires slip alerts on a timer. It is real and running (§4.5).
- **CI that already hunts this class of bug.** `.github/workflows/ci.yml:48-80` runs guards for duplicate DDL across both migration lineages, golden-journey migration reachability, and "server SQL references a table no APPLIER creates" — with justification baselines. This audit had to correct itself twice against those guards; they are doing real work.

This is not a codebase that needs rescuing. It needs one architectural decision resolved and its consequences swept up. A striking amount of the "missing" functionality turns out to be built, tested, and pointed at the wrong entity.

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

#### 4.2 The live project API performs no per-project authorization
The access-control system is real, correct, and bound to the wrong entity.

`server/services/project-sharing-access.ts` implements a coherent three-role model (`owner`/`edit`/`use`) with `canUseProject`, `canEditProject`, `canManageProject`, backed by `project_members` and `project_visibility_settings`. `server/routes/concept2cure.ts:1243` loads it from those tables, and `:2136` inserts `visibility: 'private'` when a project is created. That machinery works.

It is keyed on `projects.id` (`integer`). The shipped UI operates entirely on `regulatory_programs` (`uuid`) — and **all 13 endpoints in `server/routes/c2c/projects.ts` contain zero calls to `canUseProject`, `canEditProject`, `canManageProject`, or `loadProjectSharingState`.** Every handler gates on one predicate only:

```sql
SELECT 1 FROM regulatory_programs WHERE id = $1 AND organization_id = $2 LIMIT 1
```

That is an organization check, not an authorization check.

**Impact:** Any authenticated member of an organization can read, modify and delete any program in that organization — including `POST /:id/evidence` and `DELETE /:id/evidence/:evId` (`c2c/projects.ts:510`, `:557`), which mutate the pinned-evidence set feeding AI generation. There is no private project on the live path, because the code that would make one private is never called. The org boundary itself holds — RLS is sound, and this is strictly intra-tenant — but for a CRO hosting competing sponsors, a blinded study, or an M&A-sensitive program, it is a deal-breaker.

**Fix:** Bind the existing sharing service to the live entity — this falls out of 4.1 and should not be solved twice. Until then, an interim membership check on the c2c routes is ~3 d of the 8. **Effort: 8 d.**

> **Correction.** An earlier draft of this finding claimed `project_members` and `project_visibility_settings` are created by no migration. That was wrong on two counts, and both corrections are recorded here rather than quietly dropped. The tables *are* defined in `db/migrations/20260401_project_sharing_visibility.sql` — a second migration lineage under `db/` that the first pass did not search. That file is not in `C2C_MIGRATION_FILES` (`scripts/db/migration-set.mjs`), so `deploy-migrate` does not apply it; but `scripts/ci/migration-reachability-baseline.json` lists "the drizzle push surface (pgTable/pgView in shared/)" among its durable apply paths, and both tables are declared as `pgTable` in `shared/schema.ts`. They are therefore created, the CI reachability guard correctly does not flag them, and the fail-open `42P01` path described in that draft is not the live behaviour. The severity is unchanged, but the mechanism is entirely different — the defect is a missing authorization call, not a missing table.

#### 4.3 Team roster is permanently empty, silently
`server/routes/c2c/projects.ts:459-464` joins `project_members pm JOIN regulatory_programs rp ON rp.id = pm.project_id`. `rp.id` is `uuid` (`shared/schema/programs.ts:45`); `pm.project_id` is `integer` referencing `projects.id` (`shared/schema.ts:5345`, and identically in `db/migrations/20260401_project_sharing_visibility.sql:39`). Postgres raises `42883 operator does not exist: uuid = integer`. The query also selects `pm.added_at`, which is not a column on that table under either definition — both have `created_at`/`accepted_at`. Both errors land in the same bare `catch { return res.json({ team: [] }); }`.
**Impact:** The team panel on Project Home shows nobody, for everybody, forever, with no error surfaced. Collaboration is invisible. The `catch` was written to absorb a missing table (`:453` — "may not exist in all environments") and instead absorbs a permanent schema mismatch.
**Fix:** Falls out of 4.1 once the id-space is settled; narrow the `catch` so the next mismatch is not swallowed. **Effort: 3 d.**

#### 4.4 The Part 11 audit trail is default-off, and production may boot without it
A global tamper-proof audit interceptor exists and is well built. `server/startup/audit-trail.ts` writes an HMAC-chained entry for **every mutating `/api` request** (`POST`/`PUT`/`PATCH`/`DELETE`), explicitly against 21 CFR Part 11 §11.10(e), with a documented operator runbook. `/api/c2c/projects` is not in its skip list, so project mutations *are* covered when it runs.

The gap is the posture, not the mechanism. It is gated on `AUDIT_TRAIL_ENABLED=true` and is **default-off**, because the chain needs `audit.tamper_proof_log` and `AUDIT_HMAC_SECRET` provisioned first. `server/startup/audit-enforcement.ts:59` warns loudly on a production boot with the trail inactive but **only fails closed when `AUDIT_REQUIRE_ENFORCE=true`** — the module says so itself: "Default behaviour is unchanged (warn, do not block boot)."

The same codebase already models the correct answer one file over: `db/rlsEnforcement.ts:93` **refuses to boot** production without `RLS_ENFORCE=on`. The audit trail deliberately stops short of that.

**Impact:** A production environment can run, indefinitely and by default, with no Part 11 audit trail — surfaced only as a boot warning. For GA that provisioning must be a launch gate, not a runbook step, and the enforcement posture should match RLS's.

**Secondary, and separate:** `server/routes/c2c/projects.ts` writes no *domain* audit rows — no `INSERT INTO audit_logs`, no `insert(auditEvents)` — while `GET /:id/activity` (`:603`) reads `audit_logs`. The tamper-proof interceptor writes to a different store (`audit.tamper_proof_log`), so it does not feed that query. The Project Home activity feed is therefore empty regardless of the flag. The orphaned `projects-management.ts` does write domain audit rows correctly at `:277`, `:365`, `:452`.

**Fix:** Provision the audit tables and set `AUDIT_REQUIRE_ENFORCE=true` for production; add domain audit writes inside the existing creation transaction to populate the activity feed. **Effort: 6 d.**

> **Correction.** An earlier draft asserted there was "no audit trail on the live project path." That was wrong: the global interceptor covers it. The finding as it now stands is about the default-off posture and the empty activity feed, both of which were verified after re-reading `server/startup/audit-trail.ts` and `audit-enforcement.ts`.

### P1 — blocks a competitive GA

#### 4.5 Proactive milestone monitoring exists, runs at boot, and reaches nobody
This is the clearest illustration of what the id-space fork costs.

`server/jobs/scheduleOfEventsSweep.ts` is a real, well-built proactive monitor. It is started at boot (`server/index.ts:256`) and periodically "re-assesses milestone health, marks slips / at-risk items, opens recovery & mitigation tasks, fires alerts, flags goals whose target dates have passed, and refreshes AnA's narrative" via `reviewScheduleHealth()`, reusing the platform's task and notification tables. `server/services/notifications/notification-service.ts` backs it.

It reads `project_schedule_of_events WHERE organization_id = $1 AND project_id = $2` (`schedule-of-events/service.ts:168`) and writes to `project_tasks` (`:719`) — both keyed on the **integer** `projects.id`. The shipped UI's projects live in `regulatory_programs`. Its API, `/api/project-schedule-of-events`, has **zero client consumers**.

**Impact:** A user of the product receives no due-date alert, no slip warning, and no escalation — not because the capability is missing, but because it is watching a set of projects the UI cannot create. Every project the wizard makes is invisible to it.

**Fix:** Rebinding, not building — this closes with 4.1 rather than as separate work. **Effort: 4 d** (down from a 12 d build).

> **Correction.** An earlier draft claimed "no notification or reminder system exists anywhere." That was wrong; it exists and is scheduled. The defect is what it is bound to.

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

#### 4.9 Application code is not route-split, though vendor code is
`vite.config.ts:59` defines a considered `manualChunks` strategy splitting `vendor-react`, `vendor-tanstack`, `vendor-charts` and Radix out of the main bundle. That part is done well.

What is missing is route-level splitting of application code: `client/src/concept2cure/v2/surfaceViews.ts` has 88 static imports and no `React.lazy` or dynamic `import()` anywhere in it or `V2App.tsx`.
**Impact:** Every user downloads all 106 surfaces to see one. Vendor chunking caps the dependency cost but not the application cost, which grows with every surface added. **Effort: 5 d.**

> **Correction.** An earlier draft said "no code splitting." Vendor chunking is configured; route-level splitting is not.

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
| Notifications & slip alerting | **Built, unreachable** | `jobs/scheduleOfEventsSweep.ts`, started at `index.ts:256`, watching the orphaned id-space (§4.5) |
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
| J6 | Track milestones; date slips | **Broken** | Milestone stack and its proactive slip-alerting sweep both orphaned — they run, but watch projects the UI cannot create (§4.5) |
| J7 | Status reporting / portfolio | **Partial** | Portfolio list renders; rollup service orphaned; no export |
| J8 | Close-out / archive | **Absent** | No archive on the live path (§4.13) |

**4 of 8 core journeys are broken; 1 is absent.** J1 and J2 — the demo path — work well, which is why the problem has stayed invisible.

---

## 7. Path to GA

### W0 — Stop the bleeding (1 week, 1 engineer)
Prevents new damage and closes the findings that are unacceptable in any shipped state.
- 4.2 — add an interim membership gate to the 13 `c2c/projects.ts` handlers, so authorization exists on the live path before the id-space work lands. Mutating routes (`POST`/`DELETE /:id/evidence`) first.
- 4.7 — fail fast in production instead of falling back to `MemStorage`.
- 4.12 — patch or re-justify the 2 high vulnerabilities.

**Exit:** A non-member is refused on every `c2c/projects` route, proven by an integration test against a real Postgres. Production refuses to boot without a database.

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
| W0 — Stop the bleeding | 11 | 1 wk | 1 wk |
| W1 — Resolve the id-space | 58 | 4 wks | 2 wks |
| W2 — Product completeness | 38 | 3 wks | 1.5 wks |
| W3 — Commercial polish | 33 | 3 wks | 1.5 wks |
| **Total** | **140** | **11 wks** | **6 wks** |

- **Minimum defensible GA** = W0 + W1 = **69 d** (~5 wks at 3 engineers). Ships an honest, coherent, auditable project tool with working access control and live milestone alerting.
- **Competitive GA** = W0–W3 = **140 d** (~11 wks at 3 engineers).

W1 carries more than the first estimate and W2 less, because three capabilities first scored as absent — proactive milestone monitoring, the notification service, and the sharing/ACL model — turned out to be built already and bound to the orphaned id-space. Reconnecting them is W1 work. **The single id-space decision is now worth roughly 40% of the total remaining effort**, which is the strongest argument for spiking it first.

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
| Further findings rest on a mistaken mechanism, as §4.2 did | M | M | Every P0/P1 above was re-verified against both migration lineages and the CI reachability baseline after that correction |
| 60 orphaned endpoints hide more broken assumptions | H | M | Re-point incrementally with a contract test per router |
| W1 estimate optimistic — id-space touches 20+ files | M | H | Timebox a 3-day spike before committing the date |
| Fixing fail-open ACL locks users out of their own projects | M | M | Backfill owner/creator as `owner` member before flipping the default |
| No e2e means regressions ship silently | H | M | Land 4.11 in W1, not W3 |

---

*Findings verified by direct source reading. Every `file:line` citation was opened and confirmed. A parallel multi-agent audit is in progress; its results will be merged into this document.*
