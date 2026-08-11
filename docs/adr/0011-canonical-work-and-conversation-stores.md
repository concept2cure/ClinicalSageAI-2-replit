# ADR-0011: Canonical work and conversation stores

## Status

**Proposed**

- Date: 2026-08-09
- Deciders: collaboration & tasking GA program; requires human approval
- Technical Story: `COLLABORATION_TASKING_UX_ASSESSMENT_2026-08-07.md` §5, finding P2

## Context

Assignable work was spread across four tables with no declared owner, and two
HTTP routers mutated the same rows under different rules.

| Table | Written by | Read by |
|---|---|---|
| `unified_tasks` | `/api/tasks` (`taskManagement.routes.ts`), `/api/regulatory/tasks` (`unifiedTasks.routes.ts`) | Task Board |
| `project_tasks` | AnA `create_task`, project bootstrap | `loadUnifiedWork()` source 1 |
| `concept2cure_review_tasks` | review workflow | `/reviews/my-queue` |
| `regulatory_filings` | filing pipeline | `loadUnifiedWork()` source 3 |

The practical consequences, each observed rather than hypothesised:

- **Two boards.** `loadUnifiedWork()` read `project_tasks` but not
  `unified_tasks`, so a task created on the Task Board was invisible to every
  "my work" surface, and a task created by AnA was invisible to the board.
- **Governance depended on which URL the client picked.** `/api/tasks` recorded a
  governed ledger entry; `/api/regulatory/tasks` accepted any status string,
  completed approval-gated tasks with no signature, and ran an org-**un**scoped
  cascade. Same rows, same regulated record, two different rulebooks.
- **No owner meant no invariant.** Nothing could state where a unit of assignable
  work *lives*, so each new producer picked a table and each new reader picked a
  query.

Conversation had the same shape at smaller scale: `concept2cure_review_threads`
existed with a complete backend and no client consumer, while the collaboration
launcher kept comments in an in-memory `window.C2C` array that a page refresh
discarded.

## Decision

We will declare **`unified_tasks` canonical for assignable work** and
**`concept2cure_review_threads` canonical for conversation**, and treat every
other table as either a *producer* that writes into the canonical store or a
*read-model* that projects from it.

Concretely, and as implemented:

1. **`loadUnifiedWork()` gains `unified_tasks` as a fourth source**
   (`source: 'board'`). Additive and reversible; it closes the two-boards problem
   without moving any data.
2. **Producers mirror forward, never backward.** AnA's `create_task` continues to
   write `project_tasks` (its own lifecycle) and mirrors into `unified_tasks`
   with a deterministic id (`TASK-PT-{orgId}-{projectTaskId}`) and
   `source_entity_type = 'project_task'`. The mirror is idempotent
   (`ON CONFLICT DO NOTHING`) and, because a row landing in the canonical
   regulated table is a governed create whoever wrote it, it records the same
   `task.create` ledger lineage the routes record.
3. **The read-model excludes mirrored rows** so nothing is counted twice:
   `sourceEntityType IS DISTINCT FROM 'project_task'`. `IS DISTINCT FROM` rather
   than `<>` is deliberate — a NULL `source_entity_type` must read as "not
   mirrored" and stay in the view.
4. **Both routers enforce identical gates.** Status domain, the transition state
   machine (409 with the allowed set), the e-signature ceremony on approval-gated
   completion (428 `ESIGN_REQUIRED`), audit, and the org-scoped unblock cascade
   now run on `/api/tasks` *and* `/api/regulatory/tasks`. Governance is a
   property of the record, not of the URL.
5. **Router consolidation is deferred, not abandoned.** With identical gates on
   both, merging them is a pure refactor with no compliance content. See
   "Consequences → Neutral".
6. **Conversation persists.** The launcher's Collaborate action posts a real
   review-thread message; `ReviewThreadsPane` is the first client consumer of the
   Phase-13 backend; the `window.C2C` in-memory task array is retired.

## Consequences

### Positive

- One question — "what work is assigned to me?" — has one answer, computed from
  one table, regardless of which surface created the work.
- A new producer has an obvious correct move: write the canonical table, or
  mirror into it with a deterministic id and a `source_entity_type` tag.
- Compliance posture is uniform. There is no longer a lower-governance path to
  the same regulated row, so a Part 11 argument can be made about the *table*
  rather than about an enumeration of routes.
- The mirror-exclusion rule gives future producers a tested pattern for adding a
  source without double-counting.

### Negative

- **The mirror is duplication, and duplication drifts.** A `project_tasks` row
  and its `unified_tasks` mirror can diverge if a future writer updates one and
  not the other. Only creation and status are mirrored today; nothing enforces
  the invariant at the database level.
- **`source_entity_type` is now load-bearing.** A producer that forgets the tag
  gets its rows double-counted in every "my work" surface — a silent, plausible
  failure. This is a convention held by code review, not a constraint.
- Two routers still exist, so the "identical gates" property is maintained by
  two call sites that must be changed together. Sharing the services
  (`task-state-machine`, `task-signoff`, `task-side-effects`) narrows but does
  not eliminate the drift surface.
- `concept2cure_review_tasks` still projects into `/reviews/my-queue` on its own
  path rather than through the unified adapter — one read-model remains outside
  the pattern.

### Neutral

- No data is moved and no table is dropped. This ADR declares ownership and
  direction of flow; it does not perform a migration. A later consolidation can
  proceed under this decision without revisiting it.
- Router consolidation becomes a scheduling question rather than a risk question.

## Alternatives Considered

### Option A: Migrate every producer to write `unified_tasks` directly

**Description:** Retire `project_tasks` as a write target; AnA and project
bootstrap POST to the canonical store; backfill existing rows.

**Pros:**

- No duplication, so no drift and no `source_entity_type` convention to hold.
- The strongest possible form of the invariant.

**Cons:**

- `project_tasks` carries schedule-of-events semantics (milestone ordering,
  proactive-plan linkage) that `unified_tasks` does not model. Migrating means
  either widening the canonical table or losing those fields.
- A destructive, non-reversible migration of regulated task history in the same
  change that introduces the e-signature ceremony — two independent risks landing
  together.

**Why not chosen:** Correct destination, wrong sequencing. The additive
read-model change closes the user-visible defect immediately and reversibly;
this remains the follow-on once the schedule-of-events fields have a home.

### Option B: Leave ownership undeclared; make each reader query all four tables

**Description:** No canonical store. Every surface unions the tables it cares
about.

**Pros:**

- No mirror, no tag convention, no migration.

**Cons:**

- Reproduces the original defect on every new surface, since correctness depends
  on each reader remembering every table.
- Gives no answer to "where does a governed task mutation get audited?", which is
  the compliance question that actually motivated this work.

**Why not chosen:** It is the status quo that produced the two-boards problem.

### Option C: Have AnA call the HTTP route rather than mirror in-process

**Description:** `command-executor.ts` issues an HTTP request to `/api/tasks`
instead of inserting, inheriting the route's gates for free.

**Pros:**

- Single write path; gates cannot be forgotten.

**Cons:**

- An in-process service calling its own HTTP layer adds a failure mode (loopback,
  auth-token minting, timeouts) without adding governance, since the route's
  gates are already available as importable services.

**Why not chosen:** The substance of the concern — *a row landing in the
canonical regulated table must be audited whoever wrote it* — is satisfied by
calling `auditTaskAction` directly from the mirror, which is what we did.

## Implementation Notes

The mirror-exclusion predicate, which every future read-model of `unified_tasks`
must apply:

```ts
// server/services/unified-work/unified-work-view.ts
// True for rows NOT mirrored from project_tasks. IS DISTINCT FROM, not <>,
// so a NULL source_entity_type still reads as "not mirrored".
sql`${unifiedTasks.sourceEntityType} IS DISTINCT FROM 'project_task'`
```

The shared gates both routers import, so a third writer inherits them:

```
server/services/tasking/task-state-machine.ts   TASK_STATUSES, isLegalTransition,
                                                 CREATABLE_TASK_STATUSES
server/services/tasking/task-signoff.ts          requireTaskSignoff -> 428
server/services/tasking/task-side-effects.ts     notifyTaskEvent,
                                                 cascadeUnblockOnCompletion
server/services/tasking/task-audit.ts            auditTaskAction
```

A producer adding a fifth source does three things: write `unified_tasks` with a
deterministic id, tag `source_entity_type`, and extend the exclusion predicate if
the origin table is itself a unified-work source.

## Related Decisions

- [ADR-0002](0002-multi-tenant-architecture.md) — every query in the canonical
  store is org-scoped; the new graph columns and lock table sit on the RLS path.
- [ADR-0003](0003-21-cfr-part-11-compliance-strategy.md) — the uniform-gates
  decision here is what lets that strategy apply to a table rather than a route list.
- [ADR-0007](0007-canonical-operating-system-schema.md) — same "declare an owner"
  pattern applied to the operating-system stores.

## References

- `COLLABORATION_TASKING_UX_ASSESSMENT_2026-08-07.md` §5 (target experience), P2
  (two competing work models)
- `docs/reports/tasking-module-surfacing-report-2026-06-03.md` §6
- `server/services/unified-work/unified-work-view.ts`

---

## Revision History

| Date       | Author | Description   |
| ---------- | ------ | ------------- |
| 2026-08-09 | collaboration & tasking GA program | Initial draft |
