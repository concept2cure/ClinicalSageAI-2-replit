# PF-15, MISSED-2 (D7 for D2): a CMC interview is filed only under a project of its own organization

Plan: `docs/design/PROJECT_FIRST_PLAN_2026-09-26.md` §PF-15, "An interview
session started with a foreign projectRef is refused".

## The defect

A CMC interview (`start_intelligence_flow` → answers → `commit_intelligence_flow`)
writes register records (drug substance, drug product, container closure,
process, formulation, material specs, characterization) and their Module 3
sources under the session's project.

- **At start.** `createInterviewSession` stored the project it was given, and
  never asked whose it was. That id comes from the shell's `projectRef`, from
  the integer `projectId`, or from the model's own `project_id` tool input.
- **At commit.** The commit checked the project only when the session had
  none and one was supplied at commit time. A session bound at start was
  trusted.

So an interview started under another organization's project, an id naming
none, or a program since deleted filed every register record there. The
commit-time check never ran for it.

## The fix

The one membership check, `project-membership.ts` `projectBelongsToTenant`
(a live program or a `projects` row of the organization; it no longer admits a
deleted program since `369cc698`), is asked at both points:

- **`createInterviewSession`** (`interview-sessions.ts`): a stated project the
  organization does not hold is refused `PROJECT_NOT_IN_TENANT` before the row
  is inserted. A lookup that cannot complete throws, and nothing is created.
  With no project, nothing is looked up and the session starts unbound, as
  before.
- **`commitInterviewSession`** (`interview-commit.ts`): the project the records
  file under is checked on **every** commit, bound at start or at commit. This
  also covers sessions created before the start-time check.
- `start_intelligence_flow` already reports a failed persist as "not started",
  so the AnA tool says why and starts nothing.

## Tests

- `server/services/cmc/__tests__/interview-sessions.test.ts`:
  - the project is checked before the INSERT;
  - a foreign project is refused with no INSERT;
  - a lookup failure creates nothing;
  - no project means no lookup.
- `server/services/cmc/__tests__/interview-commit.test.ts`: a session bound at
  start to a project the tenant does not hold is refused at commit. The check
  names that project and organization, and nothing is held or written. The
  harness admits the fixture project by default, and the existing stranger
  case states `projectInTenant: false`.
- `server/services/ana/__tests__/intelligence-flow-sessions.test.ts`: the AnA
  start tool with a project the organization does not hold says so, returns no
  session and writes no row.
- The check's own SQL is proven on PGlite in
  `server/services/cmc/__tests__/project-membership.pglite.test.ts`
  (`../2026-09-29-cmc-project-scope/`).

## Red, then green

- `01-red.txt`: the two service files are restored to trunk, and the suites
  run against them. **5 fail**:
  - the create order;
  - the create refusal;
  - the create lookup failure;
  - the commit refusal of a bound session;
  - the AnA start refusal.
- `02-green.txt`: the interview, AnA interview-flow, AnA capability-tool, CMC
  service, CMC route and cmc-changes suites: **50 files, 565 tests pass.**
