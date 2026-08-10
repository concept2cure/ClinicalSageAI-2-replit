# ADR-0011: Canonical project identity space

## Status

**Proposed**

- Date: 2026-08-10
- Deciders: requires human approval before execution — this decision moves live tenant data
- Technical Story: `docs/PROJECT_MANAGEMENT_GA_AUDIT_2026-08-10.md` §3, findings 4.1–4.5

## Context

Project management is implemented **twice, on incompatible key types**, and the shipped UI
uses the thinner of the two.

| Entity | Table | Key | Owned by | Client call sites |
|---|---|---|---|---:|
| Program | `regulatory_programs` | `uuid` | `routes/c2c/projects.ts` (13 endpoints) | **28** |
| Project | `projects` | `serial` | 7 routers (55 endpoints) | **1** |

Measured by searching all of `client/`, `ui_kits/`, and every `.ts/.tsx/.js/.jsx/.html` file
outside `server/`, tests and docs:

| Router | Endpoints | Consumers |
|---|---:|---:|
| `project-sections.ts` | 21 | 0 |
| `project-rules.ts` | 10 | 0 |
| `project-modules.ts` | 9 | 0 |
| `project-hierarchy.ts` | 8 | 0 |
| `project-schedule-of-events.ts` | 6 | 0 |
| `project-home-routes.ts` | 1 | 0 |
| `projects-management.ts` | 5 | 1 (a picker dropdown) |

**60 of 74 project endpoints have no consumer anywhere in the repository.**

The fork is already documented in the code. `client/src/concept2cure/v2/surfaces/ProjectHome.tsx:12-17`:

> `id` is the C2C regulatory_programs UUID … It is NOT a numeric projects.id, so the numeric
> project-home read-model (`/api/project-home/:projectId`) is **deliberately NOT called** from
> here (parseInt of a UUID would load a different project in the same org).

The read-model was built, tested, and quarantined behind a comment because its key type does
not match the UI's.

### What the fork actually costs

The audit initially scored several capabilities as *absent*. Re-verification showed they are
**built and running, bound to the unreachable `serial` entity**:

- **Access control.** `services/project-sharing-access.ts` implements a correct
  `owner`/`edit`/`use` model over `project_members` + `project_visibility_settings`, keyed on
  `projects.id`. The live router never calls it — all 13 `c2c/projects.ts` handlers gate on
  `organization_id` alone. `project_members.project_id` is `INTEGER REFERENCES projects(id)`
  (`db/migrations/20260401_project_sharing_visibility.sql:39`), so it **cannot store
  membership for a uuid-keyed program at all**.
- **Proactive milestone monitoring.** `jobs/scheduleOfEventsSweep.ts` starts at
  `server/index.ts:256` and fires slip alerts, opens recovery tasks and flags passed target
  dates — against `project_schedule_of_events WHERE project_id = $2`, the integer space. It
  watches projects the UI cannot create.
- **Domain audit trail.** `projects-management.ts` writes `audit_logs` rows at `:277`, `:365`,
  `:452`; `c2c/projects.ts` writes none, while `GET /:id/activity:603` reads that table.
- **Quota metering.** `license-manager.ts:429` counts `FROM projects` — always `0` for a
  tenant whose projects are all programs.

Two user-visible symptoms follow directly:

1. `TaskBoard.tsx:552` populates its project picker from `/api/projects` (integer) while the
   portfolio reads `regulatory_programs`. **A user's task-board project list and their
   portfolio list are different lists from different tables.**
2. `GET /api/c2c/projects/:id/team` joins `regulatory_programs.id (uuid) = project_members.project_id (integer)`,
   raising `42883`, swallowed by a bare `catch` → the team panel is empty for everyone, forever.

The audit estimates that reconnecting this capability is **~40% of all remaining GA effort**.

## Decision

**Converge on `regulatory_programs` (`uuid`) as the canonical project identity.** Re-key the
project-management stack's `project_id` columns to `uuid` and repoint the orphaned routers at
the canonical entity.

Rationale, in order of weight:

1. **It is where the live data is.** The UI, the vault, the document scaffold, the pinned
   evidence store and 28 client call sites already use it. Migrating *it* to `serial` would
   rewrite rows customers have created and break the eCTD/vault linkage.
2. **`uuid` is the correct key for this domain.** Program identifiers appear in submission
   correspondence and cross-environment exports; a guessable sequential integer is a weaker
   choice for a record that leaves the system.
3. **The direction of travel already points here.** `regulatory_programs` carries
   `deleted_at`, `lead_user_id`, `target_submission_date`, `progress_percent` — the fields the
   product actually renders.

**This ADR does not authorise execution.** It requires the spike in Implementation Notes to
land first, because the estimate has not been validated against the real column inventory.

## Consequences

**Positive**

- One project list backs the portfolio, the task board, quota counting and the sweep.
- ~55 endpoints of built, tested capability become reachable without being rewritten.
- Access control, slip alerting and the activity feed start working as a by-product.
- `project_members` becomes usable for programs, unblocking read-side project privacy — which
  today cannot be implemented at all (see ADR-0011 note in the audit's §4.2).

**Negative / risk**

- Touches 20+ files and every table with a `project_id` FK. The audit flags the 30-day
  estimate as the one most worth spiking before a date is committed.
- Requires a data migration over live tenant rows. Mitigation: dual-write, backfill,
  shadow-read and parity proof before any destructive step.
- Flipping access control on can **lock users out of projects they legitimately use** —
  there is no membership data for programs today. Mitigation: backfill `lead_user_id` and
  creator as `owner` members *before* the default flips.
- The two migration lineages (ADR-0006) make "which shape does this environment actually
  have" unanswerable from code. That ADR should be resolved first or in parallel.

**Neutral**

- The `projects` table is not dropped by this decision. It is frozen, and its remaining
  consumer (`TaskBoard.tsx`'s picker) is repointed. Deprecation is a separate ADR once parity
  is proven.

## Alternatives Considered

**A. Converge on `projects` (`serial`).** Rejected. It has the richer schema and the better PM
model, which makes it tempting — but it holds no live customer data, and migrating
`regulatory_programs` onto it would rewrite the id-space that the vault, document scaffold and
eCTD linkage are keyed on. The cost lands on production rows rather than on unreferenced code.

**B. A bridge/alias table mapping `uuid ↔ serial`.** Rejected as the primary strategy. It
makes both id-spaces permanent, doubles the surface every future feature must satisfy, and
leaves the "two project lists" symptom in place. It remains viable as a *transitional*
mechanism during dual-write, and the spike should evaluate it in that narrower role.

**C. Leave the fork and rebuild the missing capability on `regulatory_programs`.** Rejected.
It discards ~55 working endpoints and re-implements access control, scheduling and rules that
already exist and are tested. Strictly more work for a worse outcome.

**D. Do nothing until after GA.** Rejected. The P0 authorization gap (audit §4.2) cannot be
fully closed while programs have no membership store — only the interim mutation-side gate
shipped alongside this ADR is possible, and read-side privacy stays impossible.

## Implementation Notes

**Gate: a 3-day spike before any date is committed.** It must produce:

1. A complete inventory of `project_id` columns across both migration lineages, with row
   counts per environment, and the subset that are FKs to `projects(id)`.
2. A decision on transitional strategy — bridge table (Alternative B) vs. direct re-key —
   grounded in that inventory.
3. A backfill plan for `project_members` from `regulatory_programs.lead_user_id` that provably
   locks nobody out, with the query written and dry-run.
4. A revised estimate against the real inventory, replacing the audit's 30-day figure.

**Sequencing, once approved:**

1. Backfill ownership rows first — before any authorization default changes.
2. Dual-write new writes to both id-spaces; shadow-read and diff for a soak period.
3. Repoint routers one at a time, each behind a contract test (the audit warns that 60
   orphaned endpoints may hide further broken assumptions — expect to find some).
4. Flip reads. Freeze `projects`. Deprecate in a follow-up ADR.

**Do not** attempt this as a single migration. Every step above must be independently
revertible.

## Related Decisions

- **ADR-0006 (Canonical migration lineage)** — the two-lineage problem that makes the physical
  schema environment-dependent. Directly compounds the risk here.
- **ADR-0002 (Multi-tenant architecture)** — the org boundary this decision must not weaken.
  Note that the boundary itself is sound; the gap is intra-tenant.
- **ADR-0003 (21 CFR Part 11 compliance strategy)** — the activity feed and domain audit rows
  that the fork leaves empty.

## References

- `docs/PROJECT_MANAGEMENT_GA_AUDIT_2026-08-10.md` — the audit, §3 and §4.1–4.5
- `client/src/concept2cure/v2/surfaces/ProjectHome.tsx:12-17` — the fork, documented in code
- `db/migrations/20260401_project_sharing_visibility.sql:39` — `project_id INTEGER`
- `server/routes/c2c/projects.ts` — the live router
- `server/services/project-sharing-access.ts` — the unreachable access model

## Revision History

| Date | Change |
|---|---|
| 2026-08-10 | Initial proposal, from the project-management GA readiness audit |
