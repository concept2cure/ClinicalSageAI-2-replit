# C-8 — the task board's Analytics tab, and the engine beside it

The review recorded C-8 as *"task-board analytics recompute in the browser from
filtered rows while a deterministic org-scoped engine (`loadTaskAnalytics`) goes
uncalled — a client-side duplicate of a server engine"*, with the obvious
remedy: call the engine, delete the client copy.

**The premise is wrong, and acting on it would have made the figures worse.**

## They do not measure the same board

| | `loadTaskAnalytics` | the client's `stats` |
|---|---|---|
| stores | `unified_tasks` only | every work store |
| scope | the whole organisation (or one project) | the board's **filtered** rows |

`GET /api/task-management/board` (`server/routes/taskBoard.routes.ts:473`)
assembles `readOwnBoard` — `unified_tasks` — **plus** `loadUnifiedWork`, the
cross-store view over project tasks, submission-centre items and the rest. It
is uncapped. So the browser aggregates a strictly larger set of cards than the
engine knows about.

Swapping the tab onto the engine would therefore have replaced a figure that is
too narrow in one direction (filters) with one that is too narrow in another
(one store), while making it look authoritative because it came from the
server. Zero duplication is the right rule; it does not apply to two things
that compute different sets. Both were fixed where they stood.

## Defect (a) — the tab stated no scope

The figures — "Open tasks", "On critical path", "Regulatory impact", "Blocked",
"Approvals pending", "By module", "Team productivity" — are computed from
`list`, which applies the project filter, the module filter, "Assigned to me",
and drops cancelled cards unconditionally. They were rendered under those bare
labels.

So with a module selected and "Assigned to me" on:

- **"Team productivity"** showed one person, and read as the team.
- **"Blocked: 0"** read as a clear board, when it meant *no blocked card of
  that module, assigned to that reader*.

A measurement whose scope is not stated is read as the whole — the same silent
cap as the run-history window (C-1) and the capped portfolio rollup (C-12), on
the surface whose entire purpose is answering "where does this stand".

`client/src/concept2cure/v2/surfaces/taskBoardAnalyticsScope.ts` is a pure
function returning one sentence, or **null**. Null matters as much as the
sentence: a note on every load is noise a reader learns to skip, and then it is
not there when it counts. Three cases:

| state | what the tab says |
|---|---|
| figures cover every card read | nothing |
| no filter, but cancelled cards dropped | `These figures cover 2 of the 3 cards on the board. 1 cancelled card is not counted.` |
| a filter narrows the measurement | `These figures cover the 2 of 3 cards this board is filtered to — module “cmc”. Clear the filters to measure the whole board.` |

Note the second row: `list` drops cancelled cards whether or not a filter is
on, so `shown === total` is **not** the unfiltered case and the tab cannot stay
silent on the strength of "no filter is selected".

Where a filter is on, the gap between `shown` and `total` is the filter *and*
the cancelled rows together. The sentence gives both numbers and names the
filters, and claims nothing about how the difference divides — splitting it
would need a count the board does not take.

Revert-proven: with `taskAnalyticsScope` forced to return null (the pre-fix
behaviour), 5 of 8 cases fail, including both that assert the sentence reaches
the DOM, while the two that must stay silent still pass.

## Defect (b) — the engine's own figure did not add up

`teamProductivity` is what a manager reads as the team's load, and it was
neither the team nor the load:

1. **`.limit(10)`, with no total beside it.** The eleventh-busiest person and
   everyone below them was simply absent, and nothing in the response said a
   bound had been applied. The bound is kept — one row per assignee is
   unbounded in principle, and a response is not the place to discover that an
   organisation has ten thousand members — but raised to
   `TEAM_PRODUCTIVITY_CAP = 500` and reported through `teamProductivityTotal`,
   counted with `count(distinct assignee_id)` in SQL rather than from the rows
   the bound truncates. A total derived from the truncated rows would agree
   with them by construction and could never reveal a truncation.
2. **`assignee_id IS NOT NULL` with no complement.** Unassigned work — the work
   most likely to be missed — fell out of the aggregation entirely, so the
   per-assignee totals did not sum to `taskStats.totalTasks` and nothing said
   where the difference went. There is now an explicit `unassigned` bucket,
   the exact complement of that predicate, so the two partition the board.
   Always present: `totalTasks: 0` is a different fact from an absent field,
   and a client cannot render "none unassigned" from `undefined` without
   guessing.
3. **No tiebreaker.** Ordering by completed count alone meant two people with
   the same count came back in whatever order the plan produced, so the row
   that fell off the bound could differ between two identical requests.
   `assignee_id ASC` decides it.

`tests/db/task-analytics-whole-board.dbtest.ts` runs the engine against real
PostgreSQL on the two-tenant fixture, with 12 assignees (two more than the old
bound), each holding exactly one completed task so the ordering column is tied
twelve ways, plus 5 unassigned cards. Revert-proven against the pre-fix
predicates:

```
× returns every assignee under the bound, not the first ten
  → expected 10 to be greater than or equal to 12
× reports unassigned work instead of dropping it, so the parts sum to the whole
  → expected 55 to be 83
```

28 of 83 cards were unaccounted for in a figure a reader can add up. With the
fix: 6 passed (6).

## What is deliberately NOT done

The Analytics tab still computes its own figures, and that is the correct state
until the engine covers the same cards the board does. **A later session should
not "finish" C-8 by pointing the tab at `/tasks/analytics`** — that narrows the
measurement to one store. The way to converge them is to give the engine the
cross-store view the board already uses, and that is a larger change than this
finding.

`criticalPath`, `regulatoryImpact` and `approvalRequired`/`approvalStatus` are
columns on `unified_tasks`, so the engine *could* compute those three metrics
too; it does not, which is the other half of the same gap.
