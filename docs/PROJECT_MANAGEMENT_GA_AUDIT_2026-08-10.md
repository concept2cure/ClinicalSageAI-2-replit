# Project Management Subsystem — GA Readiness Audit

**Date:** 2026-08-10
**Scope:** All project-management code — data model, API, services, client surfaces, user workflow, performance, dependencies, testing, security.
**Method:** Direct source reading with `file:line` verification of every claim. No finding is recorded here that was not traced end-to-end through client → API → service → schema → migration.

---

## 1. Verdict

**Not GA-ready. Estimated 67 engineer-days to a defensible commercial GA, 138 to a competitive one.**

The platform has genuinely strong engineering foundations — a default-deny auth boundary, fail-closed RLS, transactional writes, a zero-error typecheck baseline, 22 CI workflows. Those are real and hard-won.

But the project-management capability specifically is split across **two disjoint project identity spaces**, and the richer of the two is unreachable from the shipped UI. The consequence is not cosmetic: the features a buyer is purchasing (tasks, milestones, hierarchy, scheduling, rules) exist as ~54 tested endpoints that no user can reach, while the surface users *do* reach is missing team rosters, activity history, audit trail, notifications, and access control — each for a separately verifiable reason.

The single most important sentence in this report: **on the live project API, per-project authorization is never invoked — any authenticated org member can read, modify and delete any project in their organization.** The access-control system that would prevent this is real and correct; it is simply bound to the other project entity and never called. That is a P0 for a multi-tenant GxP product and is detailed in §4.2.

| Dimension | Score | Note |
|---|---|---|
| Security (tenant boundary) | 8/10 | Auth boundary + fail-closed RLS are excellent |
| Security (intra-tenant ACL) | 2/10 | ACL exists and is correct, but the live API never invokes it — §4.2 |
| Data model | 3/10 | Two competing project entities on incompatible key types — §3 |
| API surface | 4/10 | Well-built, but 81% unreachable |
| Services / business logic | 5/10 | Real logic, wrong id-space |
| Client UI | 5/10 | Honest, well-built, but thin over a broken backend |
| User workflow | 3/10 | 4 of 8 core journeys break — §6 |
| Performance | 5/10 | Unbounded list, no route-level splitting, N+1 path recompute |
| Dependencies | 6/10 | 270 deps; both high-severity findings correctly accepted (§4.12); clean typecheck |
| Testing / CI | 6/10 | Strong CI, no project-lifecycle e2e |
| Feature completeness | 3/10 | No Gantt, no dependency/critical path, no reporting; alerting built but orphaned |
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
| 4.12 | ~~31 npm vulnerabilities (2 high)~~ **Withdrawn** — already correctly accepted, see below | `.trivyignore:37-51` | 0 d |
| 4.13 | No archive / close-out on the live path | `c2c/projects.ts` has no project `DELETE` or archive; only `projects-management.ts:329` does | 4 d |
| 4.14 | Task data fragmented across 4 stores | `server/routes/taskBoard.routes.ts:133` names them: `projectTasks`, `project_tasks`, `crossModuleTaskLinks`, an in-memory pyramid | 10 d |
| 4.15 | No Gantt, dependency graph, or critical path | `projectTasks.dependsOn` exists (`shared/schema.ts:6859`) with no engine reading it; no timeline library in `package.json` | 20 d |
| 4.16 | Unused heavy dependency | `react-window` in `package.json:374`, imported nowhere in `client/src` | 0.5 d |

> **4.12 withdrawn.** The first pass listed the two high-severity `npm audit` findings as work. They are already accepted, correctly, and the acceptance is better than this audit's summary of it.
>
> `.trivyignore:37-51` records that `image-size@1.2.1` is pulled solely by `pptxgenjs@4.0.1`, that **no fixed version exists** (the latest published `image-size` is 2.0.2, still in range, and 2.x is outside what `pptxgenjs` accepts), and that it is therefore not remediable by a bump or an override. `npm audit`'s own `fixAvailable` confirms this from the other direction: its proposed fix is `pptxgenjs@1.1.5`, `isSemVerMajor: true` — a *downgrade* across three majors, not a fix.
>
> The load-bearing part of any risk acceptance is the reachability claim, so it was checked rather than taken on trust. The note says `image-size` only reads dimensions of first-party images embedded into generated decks. It is in fact narrower than that: `server/services/pptxGenerator.ts` contains **no `addImage` call at all** — it builds decks from a title and markdown text (`:114`, `:269`), reached from `nanoBananaService.ts:223` and a `concept2cure.ts:12329` export route. No attacker-supplied image reaches the parser on this path, because no image does.
>
> The correct action is the one already taken: accept, document, and re-check when upstream moves. The existing `TODO(security)` names the exact condition. Patching this would have meant churning the lockfile to downgrade a working dependency across three major versions in exchange for nothing.

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
- ~~4.12 — patch or re-justify the 2 high vulnerabilities.~~ Withdrawn: already accepted with a sound, verified justification (see §4). No work.

**Exit:** A non-member is refused on every `c2c/projects` route, proven by an integration test against a real Postgres. Production refuses to boot without a database.

### W1 — Resolve the id-space (4 weeks, 2 engineers)
The decision everything else waits on. Written up for approval as **[ADR-0011: Canonical project identity space](adr/0011-canonical-project-identity-space.md)**, which gates execution behind a 3-day spike because the 30-day estimate has not been validated against the real column inventory.

**Recommendation: converge on `regulatory_programs` (UUID)** — it is what the UI, the vault, the document scaffold, and 22 client call sites already use; migrating it to `serial` would break live data and the eCTD/vault linkage. Re-key the PM stack's `project_id` columns to `uuid` and repoint the orphaned routers.
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
| W0 — Stop the bleeding | 9 | 1 wk | 1 wk |
| W1 — Resolve the id-space | 58 | 4 wks | 2 wks |
| W2 — Product completeness | 38 | 3 wks | 1.5 wks |
| W3 — Commercial polish | 33 | 3 wks | 1.5 wks |
| **Total** | **138** | **11 wks** | **6 wks** |

- **Minimum defensible GA** = W0 + W1 = **67 d** (~5 wks at 3 engineers). Ships an honest, coherent, auditable project tool with working access control and live milestone alerting.
- **Competitive GA** = W0–W3 = **138 d** (~11 wks at 3 engineers).

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



---

## Appendix A — Findings from a partial parallel audit (unverified)

**Status: triage queue, not findings.** Read this section differently from the rest of the
document. Everything above was traced end-to-end by hand. Everything below came from a
parallel multi-agent audit that was **stopped after 5 of 10 dimensions**, before its
adversarial verification stage ran. These claims have *not* been checked, and the body of this
report is itself a record of how often an unverified first pass is wrong — five corrections,
four of them in the same direction.

They are recorded because discarding 58 plausible P0/P1 leads would be worse
than publishing them with a clear warning. Each needs the same end-to-end verification the
findings above got before it is treated as real or estimated.

### A.1 The one lead verified so far

**Client-supplied `organizationId` overrides the authenticated tenant** —
`server/api/cmc/projectRoutes.ts:487`:

```js
const organizationId =
  Number(req.body?.organizationId) ||
  (Number.isFinite(orgIdFromAuth) ? orgIdFromAuth : 0);
```

The request body wins over the JWT-derived org. This directly contradicts the doctrine the
codebase states for itself in `utils/tenantContext.ts` — *"Organization ID must come from the
verified JWT token, NOT from user-supplied headers"* — and `projectId` is taken from the URL
with no ownership check.

**The agent filed this as a P0 cross-tenant write. That overstates it, and the correction
matters.** `regulatory_documents` carries `organization_id`, so migration
`0021_enable_rls_everywhere.sql` covers it, and the policy is `FOR ALL … USING (…) WITH CHECK
(…)` — the `WITH CHECK` arm blocks an INSERT carrying another tenant's org id. In production,
where `RLS_ENFORCE=on` is required to boot, the write fails at the database.

So the accurate finding is narrower and still real: **the application layer has no tenant
control on this path and actively prefers attacker-supplied input; RLS is the only thing
stopping it.** `RLS_ENFORCE` defaults to *off* outside production, so the cross-tenant write
does succeed in dev and staging. Rated **P1** — a defense-in-depth failure with non-production
exposure, not a production breach.

### A.2 Unverified P0-severity claims (15)

| Sev | Category | Claim | Cited evidence |
|---|---|---|---|
| P0 | completeness | The PM UI is read-only apart from project creation — no edit, delete, member, or milestone mutation exists | Grep of `apiRequest('POST'|'PATCH'|'DELETE'|'PUT'` and `liveMutateOrNull` across Projects.tsx, ProjectHome.tsx, Biopharm |
| P0 | correctness | POST /api/project-rules is unconditionally broken — INSERT targets a column that does not exist | server/routes/project-rules.ts:159-168 inserts into `max_executions_per_day`, and the PATCH field map at server/routes/p |
| P0 | correctness | Two incompatible project id-spaces are surfaced through one selection channel; the numeric-keyed surfaces can never resolve a project chosen from the portfolio | `GET /api/c2c/projects` projects `p.id::text` from `regulatory_programs` whose PK is `uuid('id')` (server/routes/c2c/pro |
| P0 | correctness | UUID-to-integer join in the project team endpoint, swallowed by a bare catch — team list is permanently empty | server/routes/c2c/projects.ts:456-467: `JOIN regulatory_programs rp ON rp.id = pm.project_id` where `regulatory_programs |
| P0 | data-model | Four mutually incompatible "project" entities with cross-wired child tables | `projects` int-serial PK at shared/schema.ts:5235-5237; `cer_projects` int-serial PK at shared/schema.ts:3332-3335; `reg |
| P0 | data-model | Hard project delete against 28 FKs declared with no ON DELETE behaviour | server/routes/projects-management.ts:359 `await db.delete(projects).where(eq(projects.id, projectId));` — no transaction |
| P0 | data-model | Selected project lives only in a mutable window global — deep links and reloads silently lose it | Projects.tsx:389 `window.C2C_PROJECT = { id: pr.id, ... }` is the sole write for the list flow (also Projects.tsx:166 fo |
| P0 | dependency | No durable migration path for any project-management table — the deploy applier contains zero PM migrations | migrations/meta/_journal.json contains exactly one entry (`0000_sweet_joseph`), so drizzle's runtime migrate() replays o |
| P0 | performance | GET /api/c2c/projects/:id/activity scans the tenant's whole audit_logs table with an unindexable jsonb predicate | server/routes/c2c/projects.ts:599-609 — `SELECT ... FROM audit_logs al WHERE al.tenant_id = $2 AND (al.resource_id = $1  |
| P0 | performance | GET /api/projects and /api/project-hierarchy/flat return SELECT * over the wide projects table with no pagination, including the unbounded settings blob | server/routes/projects-management.ts:72-82 — `db.select().from(projects).where(eq(projects.organizationId, organizationI |
| P0 | security | Client-supplied organizationId overrides authenticated tenant on POST /api/cmc/projects/:projectId/documents | server/api/cmc/projectRoutes.ts:486-489: `const orgIdFromAuth = Number(getOrgId(req)); const organizationId = Number(req |
| P0 | tenancy | Cross-tenant IDOR in CMC drug-product sub-resources: mutations keyed on productId alone | server/api/cmc/projectRoutes.ts:687-707 `router.put('/projects/:projectId/drug-products/:productId')` does `db.update(dr |
| P0 | tenancy | Cross-tenant IDOR: GET/PUT /projects/:projectId/cmc and GET /projects/:projectId/context read and write another tenant's project | server/routes/concept2cure.ts:13970-13976 GET /projects/:projectId/cmc: `db.select().from(projects).where(eq(projects.id |
| P0 | tenancy | Cross-tenant IDOR: project task endpoints in concept2cure.ts have no org scoping at all | server/routes/concept2cure.ts:13161-13168 `router.get('/projects/:projectId/tasks')` builds `db.select().from(projectTas |
| P0 | tenancy | Nine project-management tables have no tenant column and therefore receive no RLS policy at all | migrations/0021_enable_rls_everywhere.sql:79-99 selects only tables whose information_schema.columns include `organizati |

### A.3 Unverified P1-severity claims (43)

| Sev | Category | Claim | Cited evidence |
|---|---|---|---|
| P1 | correctness | 'Filing < 60 days' KPI on the portfolio is always zero — the client regexes a date string the server never emits | Projects.tsx:383 `{ l: 'Filing < 60 days', n: String(projects.filter(p => /days/.test(p.due)).length), … }`. The server  |
| P1 | correctness | AnA's create_project writes a column that does not exist and omits two NOT NULL columns | server/services/ana-ri/command-executor.ts:259-262 `INSERT INTO projects (organization_id, name, description, status, su |
| P1 | correctness | DELETE /api/projects/:projectId cannot delete any non-empty project — FK NO ACTION surfaces as an opaque 500 | server/routes/projects-management.ts:348 performs a hard `db.delete(projects).where(eq(projects.id, projectId))` with no |
| P1 | correctness | Five aggregate GET endpoints in project-sections are unreachable — shadowed by router.get('/:code') registered first | server/routes/project-sections.ts:263 registers `router.get('/:code', ...)`. Registered AFTER it, and therefore never ma |
| P1 | correctness | Project creation is not transactional — sections, intelligence profile and initial thread are fire-and-forget after the 201 | server/routes/concept2cure.ts:2226-2340: the project row is inserted and the response object is built (line 2195), then  |
| P1 | correctness | Rollup counts tasks from `unified_tasks` while every PM writer uses `project_tasks` — progress/health numbers are structurally wrong | server/services/project-rollup-service.ts:176-187 aggregates total/completed/blocked/overdue FROM `unified_tasks`. The P |
| P1 | correctness | Rules-engine `create_task` action is dead on arrival — INSERT omits two NOT NULL columns | server/services/rules-engine/actions/index.ts:54-72 inserts into `unified_tasks` with columns (title, description, prior |
| P1 | correctness | Schedule-of-events upsert names a unique constraint the migration does not create | server/services/projects/schedule-of-events/service.ts:396 `ON CONFLICT (organization_id, project_id) DO UPDATE`. db/mig |
| P1 | correctness | Six GET routes are permanently unreachable due to Express declaration-order shadowing | Express 5 (package.json:308 "express": "^5.2.1") matches routes in declaration order. server/routes/project-sections.ts: |
| P1 | correctness | Start-workflow and Quick-task write to an in-browser store and never persist | TaskBoard.tsx:428 `onInstantiate={(tasks) => { tasks.forEach(t => (window as any).C2C && (window as any).C2C.addTask(t)) |
| P1 | correctness | TaskBoard's project filter is a hardcoded 3-project fixture that cannot match real task rows | TaskBoard.tsx:282 populates the project `<select>` from `TB_PROJECTS`, defined in fixtures/task-board-data.ts:134-139 as |
| P1 | correctness | Work-item dedup is a read-then-write race with no supporting unique constraint; the source_ref column added to fix it is dead | server/routes/concept2cure.ts:16487-16498 SELECTs on (sourceType, sourceId, orgId) then branches to UPDATE or INSERT. sh |
| P1 | correctness | regulatory_programs carries a deleted_at that is never written and is filtered by only some readers | shared/schema/programs.ts:99 declares `deletedAt: timestamp('deleted_at')`. Grep across server/ finds no `UPDATE regulat |
| P1 | data-model | No project lifecycle state machine — status is free text and the only 'blocking' mechanism cannot block | shared/schema.ts:5254 `status: text('status').default('planning').notNull()` — no CHECK, no enum, comment only. Write pa |
| P1 | data-model | Project knowledge document manifest stored as an unbounded JSON array inside projects.settings, rewritten in full on every upload | server/routes/concept2cure.ts:4507-4530 — `normalizeKnowledge(settings)` → `documents: [...knowledge.documents, document |
| P1 | data-model | Relational data modelled as json blobs, using `json` rather than `jsonb` | Team membership lives in a blob: shared/schema/programs.ts:88 `teamMembers: json('team_members').$type<TeamMember[]>()`  |
| P1 | data-model | Same entity returned in snake_case by writes and camelCase by reads on /api/projects | GET /api/projects (server/routes/projects-management.ts:70-90) returns Drizzle rows → camelCase (organizationId, clientW |
| P1 | data-model | Two incompatible task status vocabularies on the same entity within one router | server/routes/concept2cure.ts:13191 (POST /projects/:projectId/tasks) validates `status: z.enum(['todo','in-progress','r |
| P1 | data-model | project_milestones has two rival physical shapes; the Drizzle model matches neither reconciled shape | db/migrations/20260730_project_milestones_reconciliation.sql:4-28 documents it verbatim: the 0000 baseline/shared/schema |
| P1 | performance | All ~106 v2 surfaces are statically imported into one chunk — no code splitting for PM surfaces | client/src/concept2cure/v2/surfaceViews.ts has 88 top-level static `import { X } from './surfaces/...'` statements (line |
| P1 | performance | GET /api/c2c/projects/:id/vault-structure and GET /api/c2c/project-vault/:id issue one section query per document (N+1) | server/routes/c2c/projects.ts:687-695 — `for (const d of docsRes.rows) { const secRes = await pool.query('SELECT section |
| P1 | performance | GET /api/project-hierarchy/:id/tree and /:id/rollup perform a bulk UPDATE of projects.metadata on every read | server/services/project-rollup-service.ts:158 calls `this.persistRollups(nodeMap, organizationId)` from inside `getTree( |
| P1 | performance | GET /api/project-hierarchy/programs is an N+1: one COUNT query per program row | server/routes/project-hierarchy.ts:70-89 — `db.select().from(projects)` (no LIMIT, no column list) then `await Promise.a |
| P1 | performance | Materialized-path descendant queries cannot use the path index | server/services/project-rollup-service.ts:100-108 `WHERE ... (p.path LIKE $2 || '/%' OR p.path = $2 OR p.parent_project_ |
| P1 | performance | No caching layer of any kind on PM reads; the repo's cache modules are dead code | server/cache/tenantCache.ts is a bounded LRU with TTL and invalidation, but `grep getFromCache|storeInCache|invalidateCa |
| P1 | performance | No data-fetching cache, dedup, retry, or cancellation — every navigation refetches the whole project workspace | Grep for `useQuery|QueryClientProvider|invalidateQueries` across client/src/concept2cure/v2 (excluding __tests__) return |
| P1 | performance | No pagination on any PM list endpoint except rule execution logs | Unpaginated with no LIMIT: GET /api/projects (projects-management.ts:72), GET /api/project-hierarchy/flat (project-hiera |
| P1 | performance | No pagination on any project list endpoint — unbounded result sets | GET /api/projects returns every project for the org with no LIMIT (server/routes/projects-management.ts:70-80). GET /api |
| P1 | performance | Org-wide readiness recomputes two identical org-scoped alert summaries once per project | server/services/ana/org-readiness-overview.ts:294-324 loops every project in the org through `getProjectReadinessAggrega |
| P1 | performance | ProjectRollupService.recomputePaths recurses one project at a time with 3 sequential queries per node | server/services/project-rollup-service.ts:389-429 — per node it runs `SELECT id, parent_project_id`, optionally `SELECT  |
| P1 | performance | Synchronous PDF/DOCX text extraction and AI embedding on the upload request path | server/routes/concept2cure.ts:4296 — `const extracted = await extractUploadedText(file.buffer, file.mimetype, safeOrigin |
| P1 | performance | The performance-index migration is never applied and would fail if it were | migrations/20260331_performance_indexes.sql is absent from scripts/db/migration-set.mjs (0 hits). Its statements also re |
| P1 | performance | assembleProjectKnowledgeCorpus fetches every knowledge atom with no LIMIT before truncating to a 160 KB budget | server/services/projects/retrieval-mode.ts:158-168 — `SELECT a.title, a.content FROM lumen_data_atoms a WHERE a.organiza |
| P1 | performance | computeReadinessScore runs twice per GET /api/project-home/:projectId | server/routes/project-home-routes.ts:171-176 runs `Promise.allSettled([computeReadinessScore(svcCtx), generateNextAction |
| P1 | performance | project_tasks has zero indexes on any provisioned database | shared/schema.ts:6830-6865 declares `projectTasks` with no third argument — no index callback at all. migrations/0000_sw |
| P1 | performance | v2 data layer has no caching, deduplication, or request coalescing; ProjectHome fires 7 uncoordinated requests per open | client/src/concept2cure/v2/dataConnect.tsx:366-401 — `useLiveData` is a bare `React.useEffect` + `liveGetOrNull(path)` + |
| P1 | security | Destructive project operations are gated on read-level permission; `canEditProject` is imported and never called | server/services/project-sharing-access.ts:118/130/143 define canUseProject / canEditProject / canManageProject. server/r |
| P1 | security | Project membership and visibility are not enforced by any router except concept2cure.ts | server/services/project-sharing-access.ts implements visibility ('private'|'org_public'), share roles ('owner'|'edit'|'u |
| P1 | ux | Four distinct error envelopes across the PM API; two routers leak raw internal error text | Shapes in use: `{error: string}` (server/routes/projects-management.ts:96, project-hierarchy.ts:97, project-modules.ts:9 |
| P1 | ux | HTTP status never reaches the UI, so 403 / 404 / 500 / offline all render the same 'sign in and retry' message | queryClient.ts:63-73 — `apiRequest` THROWS `ApiRequestError` for every non-OK status except 401. dataConnect.tsx:290-293 |
| P1 | ux | Lifecycle stage tracker emits invalid ARIA (tablist with non-tab children) and encodes stage state in colour alone | ProjectHome.tsx:132 `<div className="pj-lc" role="tablist" aria-label="Project lifecycle">` whose children (ProjectHome. |
| P1 | ux | No focus trap anywhere in v2; the New-Project wizard modal has no dialog semantics, no Escape, and no focus management | Projects.tsx:187-188 `<div className="esign-bd" onClick={onClose}><div className="esign-modal" onClick={e => e.stopPropa |
| P1 | ux | Progress bars and section status dots carry no accessible value — status is colour and width only | Projects.tsx:469-471 and :495-497 render `<div className="ph-bar-track"><div className="ph-bar-fill" data-tone={…} style |

### A.4 What to do with this

Three of these overlap findings already confirmed in the body (the id-space fork, the
uuid/integer team join, the absence of route-level code splitting), which is mild corroboration
that the run was not producing noise. Several others — the `POST /api/project-rules` insert
naming a non-existent column, the Express declaration-order shadowing that makes six GETs
unreachable, the rollup counting `unified_tasks` while every writer uses `project_tasks` — are
concrete and cheap to verify, and would be genuine defects if true.

The tenancy cluster in A.2 deserves attention first, and the same calibration as A.1: check
whether RLS already covers each path before rating it, because on this codebase it usually
does, and the difference between "exploitable" and "app-layer control missing" is the whole
finding.

---

*Findings in the body were verified by direct source reading; every `file:line` citation was
opened and confirmed. Five claims from the first pass were wrong and are corrected in place
rather than removed — four of them wrong in the same direction, crediting the codebase with
less than it had. Appendix A holds unverified leads from a parallel run that was stopped early;
they are triage, not findings.*
