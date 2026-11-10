# S11: the portfolio card carries the project's description and filing (2026-11-01)

**Package:** S11 (`docs/design/one-design-plan.json`; `server/services/c2c/project-portfolio.ts` is in its paths).
**Build order:** `.design/claude-convergence/BUILD_ORDER.md` §1, the D2 row "S11 or F1 (not D2)"; §3 Wave 0
("S11 (the portfolio projection) can proceed on the server only"). **Spec:** `.design/claude-convergence/D2.md`
§0 (the S11 row), §1.4 items 5 and 10, §3 item 2.
**Hold:** `COORDINATION.md` "Holds on other files": `project-portfolio.ts` is held by the coordinating session for
this work.
**Work, named:** complete `server/services/c2c/project-portfolio.ts`. Nothing new: no route file, service, table,
mount, migration or AnA tool.

Trailers for the reviewer's commit:

```
Plan: S11
Completes: server/services/c2c/project-portfolio.ts
```

## What already exists (RULE 3)

| Piece | Path | What it does today | What it did not do |
|---|---|---|---|
| The card projection | `server/services/c2c/project-portfolio.ts` `PROJECT_CARD_SELECT` | `id, title, ws, pathway, code, stage, status, lead, due, due_date, activity, client_workspace_id, client_name`. The list (`PROJECT_CARD_LIST_SQL`) and the creator's 201 re-read (`PROJECT_CARD_CREATED_SQL`) both use it. | It did not include `description`, `indication`, `primary_agency` or `program_type`, so D2's card could not show its one line without a second read. |
| The four facts, stored | `regulatory_programs` columns `description TEXT`, `indication TEXT`, `primary_agency TEXT NOT NULL`, `program_type TEXT NOT NULL`, created by `migrations/20260524_program_workbench_schema.sql`, entry 1 of `C2C_MIGRATION_FILES`. Drizzle mirror: `shared/schema/programs.ts` `regulatoryPrograms`. | They exist on every deployed database. | Nothing. **No schema change is needed.** |
| The detail read | `server/routes/c2c/projects.ts` `PROGRAM_DETAIL_SQL` / `serializeProgramDetail` (`GET /api/c2c/projects/:id` and the 201's `program`) | Already projects `description, indication, intended_use, primary_agency, program_type` for **one** project. | It is a per-project read. Using it for each card would be the second read the D2 row exists to avoid. It is unchanged. |
| The writer | `server/routes/c2c/projects.ts` `POST /` (lines ~688–710, 888–902) | Writes `program_type` (normalised to lower case), `primary_agency`, and `indication` (only what was stated; `str(body.indication) \|\| null`). The wizard (`Projects.tsx` ~531–534) sends the device **intended use** as `indication` for a device filing. It writes no `description`. | Out of scope here (held for S1). See the open items. |
| The list route | `server/routes/c2c/projects.ts` `GET /` (~line 611) | Runs `PROJECT_CARD_LIST_SQL`, adds readiness per row, returns `{ data, meta }`. | Unchanged: it passes rows through, so the four new keys reach the client with no route change. |
| The client type | `client/src/concept2cure/v2/surfaces/Projects.tsx` `ProjPortfolioEntry` (S11 and D2 paths) | Types the card rows the Projects surface reads through `useLiveRows`. | It did not declare the four keys. D2 §1.4 item 5 asks for them as optional `string \| null`. |
| Other readers of the list | `Surfaces.tsx` (`HomeProgram`), `SubmissionCenter.tsx`, `paletteProjects.ts`, `company-documents/CompanyProgramPicker.tsx`, `quality/ControlledDocumentDialogs.tsx`, `projectIntakeRequest.ts` (201 receipt; `shared/project-intake-workspace.ts` `isProjectIntakeReceipt`) | Each reads a subset of keys. The receipt check is not a strict key set. | Unaffected by additive keys. None was widened: they are outside S11's paths and do not need the fields. |
| Existing tests | `server/services/c2c/__tests__/project-portfolio-vocabulary.test.ts` (static, no blocker; pathway filter); `server/routes/c2c/__tests__/projects-create-anchor.pglite.test.ts:203` (the 201 card has the list card's keys) | They pin the vocabulary and the shared shape. | Neither read the card's description or filing. |

Searches run:
- `grep -rn "project-portfolio"` over the `.ts`, `.tsx`, `.mjs` and `.js` files: one route caller and two client comments.
- `grep -rn "api/c2c/projects"` in `client/src`: six readers, listed above.
- The columns: `regulatory_programs` in `shared/schema/programs.ts` and `migrations/20260524_program_workbench_schema.sql`.
- Snapshot or contract pins on the card keys (`PROJECT_CARD`, `due_date` in `server`, `tests`, `shared` and `client/src`):
  none.
- History. `git log -S "primary_agency AS agency" --since=2026-05-01` on the two server files found nothing. `git log
  --diff-filter=D` on `*portfolio*` / `*Portfolio*` found only the CMC portfolio router and dashboard (`e073f9a0b`,
  `7a144fd1e`), which are unrelated. This projection had never existed.

## The change

`server/services/c2c/project-portfolio.ts`:
- `PROJECT_CARD_SELECT` gains `description`, `indication`, `agency` (from `primary_agency`) and `program_type`. These
  are the names D2.md §1.4 item 10 and `cardLine` use.
- Each passes through `stated(column)`, which is `CASE WHEN col ~ '[^[:space:]]' THEN col END`. A stated value is
  read exactly as stored. NULL, empty and whitespace-only all read as `null`. Nothing is defaulted, trimmed or
  derived (fail closed). Its parameter is the literal union `StatedColumn`, not `string` (added in review, below).
- Both callers pick the change up. The earlier keys and their values are unchanged.

`client/src/concept2cure/v2/surfaces/Projects.tsx`: `ProjPortfolioEntry` declares the four as optional `string | null`,
as D2.md §1.4 item 5 asks. This is a type-only change: no render or behaviour changes. `cardLine` and the card markup
stay D2-1's.

Why `stated()` and not D2's literal `p.description AS description`: the literal form passes a blank value through as
if it had been stated. `red/2-blank-passed-through.txt` shows it: a device's `indication` of `'   '` reached the
card. D2.md §3 item 3 notes that seeded descriptions are empty, so this is the demo case.

## Evidence

| File | What it shows |
|---|---|
| `red/1-fields-absent.txt` | The new test against HEAD's projection: 3 of 4 fail. The four keys are absent from the list and the 201, and an absent key is `undefined`, not `null`. The additivity case passes, as the regression guard should. |
| `red/2-blank-passed-through.txt` | The test against the literal spec projection: the fail-closed case fails because a blank indication (`"   "`) is returned. |
| `green/1-projection-tests.txt` | The new test and the existing vocabulary test: 7/7 pass. |
| `green/2-callers.txt` | The list route (`projects-list.test.ts`), the creator's 201 on PGlite (`projects-create-anchor.pglite.test.ts`, including the 201-keys-equal-list-keys check), the client-workspace facets, and the two Projects surface tests: 84 pass and 3 fail. The 3 are pre-existing (next row). |
| `green/3-preexisting-at-HEAD.txt` | The same 3 `projects-client-workspaces.pglite.test.ts` failures with this change reverted (HEAD's file, restored afterwards). They are pathway counts: the fixture seeds 10 `IND` rows and expects them under `other`, but `ind` became its own pathway in `37d1e890e` ("Pathways: IND, NDA, BLA, ANDA, CTA and MAA are pathways"). They are not this change and are not fixed here. |
| `green/4-gates.txt` | `ci:sql-interpolation` OK (the baseline is unchanged) and `ci:column-reachability` OK. |

Test: `server/services/c2c/__tests__/project-portfolio-card-facts.pglite.test.ts` runs PGlite with the real DDL:
`0000_sweet_joseph` tables, `20260527_mutation_primitives`, `20260929_actor_names`,
`20260524_program_workbench_schema` and `20260814_projects_regulatory_program_anchor`. It covers three programs (an
IND with every fact stated, a 510(k) with no description and a blank indication, and an MAA with a whitespace-only
description) through both callers.

Not run: the full `tsc` (the shared 4 CPUs). Instead, an isolated `tsc --noEmit --strict` over `project-portfolio.ts`
reported no error in that file. The errors it did report were in other files, from the ad-hoc compiler options. The
client change is four optional interface fields, and the Projects surface tests pass.

## Open items (not done here; outside this track)

1. **Stale facet fixture.** `server/routes/c2c/__tests__/projects-client-workspaces.pglite.test.ts`, lines 205–283, still
   expects `IND` under `other`, so 3 tests are red at HEAD. The fix is in the fixture or its expected counts, under
   the package that owns the pathway vocabulary (`37d1e890e`; F1).
2. **Device intended use.** A device's intended use reaches `indication` only through the wizard (`Projects.tsx`
   ~534). A program written by another path into `intended_use` alone shows no filing line. The card does not
   `COALESCE` the two: they are different facts. Whether the card line should read `intended_use` for a device is a
   D2 spec question.
3. **The agency default lives in the writer, not here.** `POST /api/c2c/projects` stores `'FDA'` when no agency is
   sent (`str(body.primaryAgency) || 'FDA'`), and the wizard sends `selTpl?.agency || 'FDA'`. The market-support
   verdict is computed against that value, so it is the market creation admitted. The projection reports it as
   stored. If a stated-only agency is wanted, that is a writer change under S1 (`projects.ts` is held for S1).
4. **No description is written yet.** The creator writes no `description`, and seeded rows are empty (D2.md §3
   item 3). Cards show the filing line (`program_type · agency · indication`) until a writer or DATA supplies one.

## Review (skeptic, 2026-11-01)

The review reran every claim above from scratch copies, without touching the working file and without `git stash`.

- **Paths.** All four paths are in S11's ledger `paths` (`server/services/c2c/project-portfolio.ts`,
  `client/src/concept2cure/v2/surfaces/Projects.tsx`) or always allowed (`**/__tests__/**`, `docs/evidence/**`). None
  is in a held or locked row of `COORDINATION.md`. `Projects.tsx`'s only working-tree hunk is the interface.
- **Nothing new (RULE 6).** No route file, service, table, mount, migration or AnA tool. The four columns are the
  existing TEXT columns of `20260524_program_workbench_schema.sql`, and no later file alters their type. The "What
  already exists" rows were checked against the code: the writer's `'FDA'` default (`projects.ts:719`), the
  stated-only indication (`:724`), `PROGRAM_DETAIL_SQL` (`:462`), the wizard's device intended use as `indication`,
  and the loose receipt check (`shared/project-intake-workspace.ts`).
- **Red, then green, rerun.** `review/red-1-rerun.txt`: HEAD's projection fails 3 of 4. `review/red-2-rerun.txt`:
  D2's literal wording fails the blank case on `indication: "   "`. `review/green-rerun.txt`: 49/49 across the new
  test, the vocabulary test, the creator's 201 on PGlite (201 keys equal list keys) and the list route.
- **Callers.** `review/callers-rerun.txt`: 9 server route files (178 pass; the 3 failures are the facet fixture's
  pathway counts in `projects-client-workspaces.pglite.test.ts`, which this change does not touch; that file last
  changed on 2026-10-26, before `37d1e890e` made `ind` a pathway) and 8 Projects surface files (42/42).
- **Lint.** `project-portfolio.ts`: 0 problems before and after. `Projects.tsx`: the same 7 complexity and size
  warnings as HEAD, moved down 9 lines. The new test: 0.
- **One fix.** `stated()` took any `string` and put it into SQL text, and `ci:sql-interpolation` cannot see SQL
  built in a module constant (its own stated gap). Its parameter is now the literal union `StatedColumn`, as
  `projectAnchorFrom` already does for `'$3' | '$6'`. `review/typeguard.txt` shows a `string` argument refused
  (TS2345). The real file typechecks clean.
- **Observations, not defects.** `description` is unbounded TEXT, and the list returns up to 200 rows. Nothing writes
  it yet, and the detail read already returns it whole. If long descriptions appear, the card's two-line clamp is
  client-side only. D2.md §1.4 item 10 still words the projection literally. It is now done, with blank handling, so
  D2-1 has nothing to do there.
