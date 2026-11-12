# The catalog read's time, 2026-11-12 (GA hardening)

The 2026-11-11 walk measured each data catalog read and each filter click at 2 to 3.5 s. This is where the time goes,
what was removed, and what is left.

## What already exists (RULE 3)

| Path | What it does |
|---|---|
| `server/services/clinical-regulatory-evidence/source-read-access.ts` (`getCurrentReadableSourceScope`) | Decides which sources a person may read, one source at a time: its project's current access, then a native Quality record's freshness. Evaluated before a read and again at its end, so access revoked during the read refuses it |
| `server/services/clinical-regulatory-evidence/record-source.ts` (`createNativeRecordAdmission`) | Reads a project's Quality register once per evaluation and admits each native record against it |
| `server/services/clinical-regulatory-evidence/data-room-search.ts`, `source-usage.service.ts` | The catalog read and its citation usage: each evaluates the scope at its start and at its end |

Nothing new: one existing function finished.

## Measured (database statement log, one read, Lumen lead, 4 projects, about 130 sources in the organisation)

| Read | Before | After |
|---|---|---|
| Catalog, first page | 2.72 s, 28,112 logged statement lines, 1,602 role lookups | 1.82 s, 18,448 lines, 696 role lookups |
| The project's own room | 1.99 s, 19,712 lines | 1.30 s, 12,472 lines |
| Catalog narrowed to one folder | 1.78 s, 17,360 lines | 1.19 s, 10,712 lines |

(The log writes about three lines per statement, so the statement counts are about a third of the line counts.)

## Fixed: one project's access was asked once per source

Each scope evaluation asked "may this person open this project?" for every source of the project: about 130 sources of
4 projects, three statements each, in each of the read's four evaluations. One evaluation now asks each project once
and reuses the answer for that project's sources. The answer is kept for one evaluation only: the end-of-read recheck
is a new evaluation and asks again, so access revoked during a read is still caught. A refusal is reused as itself, so
every source of a refused project is refused exactly as before. Each source's own recorded workspace is still checked.

`source-read-scope-parent-once.test.ts` (new, 4 cases): two projects' five sources ask twice; the next evaluation asks
again and a revoked grant refuses the read; a refused project's sources are all omitted and the other project's
admitted; a source whose recorded workspace differs is still refused.

Checks: `server/services/clinical-regulatory-evidence`, the AnA source-context suites, the sources route and the
authoring services: 157 files, 2,855 cases. Typecheck 0, no new lint warning. The catalog walk of 2026-11-11 re-run
after the change: every step passes.

## What is left, and whose decision it is

One catalog read still makes about 6,000 statements. Three structural causes, none changed here because each is a
security design, not a defect:

1. **Four scope evaluations per read** (the search's start and end, the usage summary's start and end), each over
   every source of the organisation the person can open, not only the page.
2. **The whole Quality register is read once per project per evaluation** (17 times in this read) to prove each native
   record is still what was captured.
3. **Each statement runs in its own transaction with the tenant context set** (three extra round trips per statement),
   because these reads use the pool, not one request transaction.

Running the read in one request transaction (3), or sharing one register read between an operation's start and end
evaluations (2), would each cut the time again by more than half. Both change what "re-verified at the end of the
read" means, so they are for the session that owns the source-access model and the coordinator, not a unilateral
change. Recorded in `.design/claude-convergence/COORDINATION.md`.
