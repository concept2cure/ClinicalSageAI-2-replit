# D2 — a program reads the same readiness on its card and on its own page

**Row:** D2 Launch catalog (Projects). **Date:** 2026-09-24. **Session:** `session_01KnUGoX3g4R4FWKWGc2sTbN`.
Handed on by the vault/projects re-baseline (`docs/work-orders/README.md`, "→ Projects").

## 1. What was wrong

`regulatory_programs.progress_percent` is written exactly once, as the literal `0` in the
create's INSERT, and nothing updates it. The Projects **list** stopped reporting it on an
earlier day: it replaces the figure with the share of the program's governed sections that are
approved or locked (`readinessByProject`, `server/routes/c2c/projects.ts`).

The **detail** read, `GET /api/c2c/projects/:id`, was never changed. It returned the raw column,
and `ProjectHome` (a launch surface) drew it as the **"Dossier readiness"** ring. So a program
read 62% on its card and "0% complete" on its own page, and AnA was told "0% complete" in the
screen context it reads.

## 2. What changed

- The detail read carries `readiness` from the same `readinessByProject` the list uses. One
  aggregate, so a program cannot read two figures. A program with no governed sections gets 0
  (it has approved nothing), which is also what its card shows.
- `readinessByProject` returns `null` when the aggregate cannot be read, instead of an empty map.
  "Could not measure" and "measured, nothing approved" were the same answer before. On `null`
  the list keeps its stored value (unchanged behaviour, logged). The detail reports `null`, and
  ProjectHome draws no ring and tells AnA no figure.
- `progress_percent` is removed from the detail projection. A column nothing maintains is not
  offered to a reader. Its only consumer was ProjectHome.
- The create's 201 `program` goes through the same read, so it carries `readiness` (0 for a new
  program).

Three existing tests pinned the old shape, and each now pins the new one: the detail SQL must
**not** select `progress_percent` (`projects-list.test.ts`); the "existing keys" contract lists
`readiness` in its place, and the 201 equals the serializer plus `readiness`
(`projects-detail-taxonomy.test.ts`). Four ProjectHome test fixtures that sent `progress_percent`
now send `readiness`.

## 3. Proof

| | |
|---|---|
| `red/server-detail-readiness.txt` | Old route, new tests: **5 of 9 fail**. The detail has no `readiness`: it is not the list's 62, not 0 for a program with no sections, and not null when the aggregate fails. |
| `red/client-projecthome-ring.txt` | Old ProjectHome, new tests: **3 of 3 fail**. With `readiness: 62` and a stale `progress_percent: 0` the ring reads 0%, and with `readiness: null` it still draws a ring. |
| `green/server-detail-readiness.txt` | 9 of 9. |
| `green/client-projecthome-ring.txt` | 3 of 3. |

The route suite (`server/routes/c2c/__tests__/projects-*.test.ts`, 74 tests) and every
ProjectHome test file (plus `anaDrivesScreens`, 54 tests) pass.

## 4. Not done here

- **The list still shows the stored 0 when the aggregate fails.** It logs rather than pretending,
  but a card cannot say "not measured": the list's contract is `readiness: number`, and the
  portfolio mean averages it. Changing that contract is a separate change to `Projects.tsx`.
- **The numeric readiness engine** (`readiness-scoring-engine.ts`) queries a `project_id` column
  that neither `regulatory_programs` nor `program_milestones` has. That is the second half of
  this handoff, next in this lane.
- POST's card re-select still reads `COALESCE(p.progress_percent, 0)`. For a program created a
  moment ago, 0 is true.
