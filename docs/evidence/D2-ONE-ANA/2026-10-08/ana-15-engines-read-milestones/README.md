# ana-15 — the readiness and recommendation engines read milestones

Launch row **D2**. Found 2026-10-08 during the ana-14 investigation
(`scratchpad/context-warning/FINDINGS.md`, "Side finding"). Server only. No
migration.

## What was wrong

This was a production defect, for every project on every estate.

Both engines read a project's milestones with:

```sql
program_milestones WHERE program_id IN (
  SELECT id FROM regulatory_programs WHERE project_id = $project AND organization_id = $org)
```

`regulatory_programs` has no `project_id` column. No migration creates one.
Every call failed with 42703 (`column "project_id" does not exist`). The
engines treat only 42P01 (missing table) as an empty, so the error went up.

- **Readiness score: never available.** `computeReadinessScore` fails closed
  when the milestone read fails (`readiness-scoring-engine.ts:173`). So it threw
  for every project, not just lost the milestone part. Where that showed:
  - AnA: "Live readiness failed, falling back to memory"
    (`context-enrichment.ts:513`). AnA answered from stored memory and the
    person was not told.
  - RIM (`rim.ts:164`) recorded every run as `partial`, with readiness among
    the failed inputs.
  - The project-home read-model (`GET /api/project-home/:projectId`,
    `project-home-routes.ts:179`) returned no readiness and no next actions.
    No client calls it today (`ProjectHome.tsx:43` says it is deliberately not
    called), so nothing on screen was blank because of this.
  - `GET /api/intelligence/projects/:id/readiness` returned 500
    (`intelligence.ts:125`).
- **Next best actions: never available.** `generateNextActions` awaits the
  readiness score with `Promise.all` (`next-best-action-engine.ts:69`), so it
  threw too. AnA fell back to memory here as well.
- **Recommendations: no milestone items.** `generateRecommendations` runs its
  generators under `allSettled`. The milestone generator was rejected and
  logged on every call. Overdue and due-soon milestones never became
  recommendations. The rest of the list came back as if it were complete.

The link that does exist is `projects.regulatory_program_id` (uuid) →
`regulatory_programs.id` → `program_milestones.program_id`
(`migrations/20260814_projects_regulatory_program_anchor.sql`).

**Found in review: fixing the read made made-up figures live.** Without a
twin assessment the engine filled in three of its four dimensions: consistency
was the constant 70, quality was 65 ± profile counts, compliance was 80 − 5 per
risk. The trend was `stable`, delta 0, from no data. None of this was
measured. While the engine threw, none of it reached anyone. Once the read
worked, an empty project would have scored 46/100 with "Quality 65,
Consistency 70, Compliance 80", and `context-enrichment.ts:511` hands that
table to AnA followed by "Present the scores above directly". RIM would have
recorded the run `complete` on the same inputs.

The twin read itself had two more problems. A null column became a default
(quality/consistency/compliance 70, approval probability 0, a 180-day review).
And it was not scoped to the organization: the twin tables have no
organization column, and `programId` comes from a query string on the
`/readiness` route.

## What changed

- `readiness-scoring-engine.ts:414` `gatherMilestoneSignal` and
  `recommendation-engine.ts:228` Generator 3 read the project's linked program:
  `projects p JOIN regulatory_programs rp ON rp.id = p.regulatory_program_id`
  (`:430`, `:245`). Both keep the organization on the project and on the
  program, and skip a soft-deleted program (`rp.deleted_at IS NULL`).
- A project with no linked program has no milestones. The read returns no rows.
  That is an empty, not an error.
- `program_milestones.id` is a uuid. The readiness signal kept it as
  `Number(id)`, which is NaN. It is now a string (`:410`).
- **Unmeasured dimensions are null** (`:54`). Quality, consistency and
  compliance come only from a recorded twin assessment (`:198`). Without one
  they are null, the same rule `ReadinessPredictions` already follows.
  `estimateQuality` and `estimateCompliance` are removed (`:548`). Profile
  risks still reach the gap list.
- **The overall score covers what was measured** (`weightMeasured`, `:313`).
  It is the weighted average of the measured dimensions, with the weights
  re-normalised over them. With all four measured it is exactly the old
  formula (a test pins this). Without a twin assessment it is document
  completeness. A new `scoreBasis` field (`:68`) says which: `source`
  (`twin_assessment` or `no_assessment_on_record`), `measured` and
  `notMeasured`.
- **Trend** is `unknown` with a null delta when fewer than two scores are
  recorded (`:95`, `:274`), not `stable`.
- **Twin read**: an empty column is null, not a default (`numOrNull`, `:484`).
  The read runs only when `programId` is the organization's live program, by
  the one program check, `programInOrganization` (`:497`).

**Callers.** Every caller passes the integer `projects.id`: the intelligence
routes, project home, `rim.ts`, `next-best-action-engine.ts`, the
orchestrator's `preloadRIMContext` and `context-enrichment.ts` (the resolved
`projects.id` since ana-14). No caller passes a program UUID. How they handle
a null dimension:

- `context-enrichment.ts:478` already renders a non-number as `—`.
- `orchestrator.ts:737`, `project-home-routes.ts:324` and
  `next-best-action-engine.ts:127` read only `overallScore`, `trend` or pass the
  object through.
- `judgment-framework.ts:175`, `:208`, `:272`, `:293`, `:542` read
  `dimensions.x ?? 50`. That is the value they already used when readiness was
  null, so nothing changes there (see Not done).
- `ai-editing.ts:285` and `:1149` call `Math.round(dims.quality)` and the like.
  That no longer typechecks, and `Math.round(null)` would print "0%". This needs
  the outside-file change below, in the same commit.

## Shown

Test: `server/services/intelligence/__tests__/engines-read-milestones.pglite.test.ts`.
It runs the engines' SQL on PGlite with the real DDL: the program tables from
`20260524_program_workbench_schema.sql`, `projects` and `documents` from the
base migration, the anchor column and its same-organization key from their
migrations, the push-surface profile table from its drizzle definition, and
the twin tables from the runtime DDL in `submission-readiness-twin-service.ts`.

| Test | At HEAD | Milestone fix only | After (green) |
|---|---|---|---|
| readiness: linked project, overdue milestone is a critical gap | 42703 | passes | passes |
| readiness: no linked program, no milestones, no error | 42703 | passes | passes |
| readiness: score and dimensions the same with or without milestones | 42703 | passes | passes |
| readiness: nothing for another organization or a soft-deleted program | 42703 | passes | passes |
| recommendations: overdue (critical) and due in 14 days (high) | `[]`, generator failure logged | passes | passes |
| recommendations: no linked program, no milestone items, no failure | generator failure logged | passes | passes |
| recommendations: nothing for another organization or a soft-deleted program | generator failure logged | passes | passes |
| no twin: quality, consistency, compliance are null | 42703 | 65, 70, 80 | passes |
| empty project scores 0 | 42703 | 46 | passes |
| overall score is document completeness (75) | 42703 | 73 | passes |
| trend unknown with no recorded scores | 42703 | `stable`, delta 0 | passes |
| twin: recorded values used, empty column null, predictions not 0 % / 180 days | 42703 | consistency 70 | passes |
| twin: another organization reads none | 42703 | reads org 1's figures | passes |
| all four measured: the original weighted formula | `weightMeasured` missing | `weightMeasured` missing | passes |

- At HEAD: `red/engines-read-milestones.txt` (14 of 14 fail).
- Milestone fix only, before the review fix: `red/placeholder-dimensions.txt`
  (7 fail, 7 pass).
- Green: `green/engines-read-milestones.txt` (14 of 14 pass).

The scoping clauses were checked by removing them:

- without `rp.deleted_at IS NULL`: `red/mutant-no-deleted-filter.txt` (2 fail);
- without both organization clauses: `red/mutant-no-org-filter.txt` (2 fail);
- without the twin read's program check: `red/mutant-no-twin-org-check.txt`
  (1 fail).

`local-postgres-plan.txt`: on the local Postgres (`c2c_ui_screens`) the old
query fails with 42703 and the new one plans on the existing indexes.

Every test file that imports or mocks these engines or their importers (78
files): `green/importers.txt`, 1151 of 1152 pass. The one failure is
`stream-tool-carry-over.test.ts` ("a step the person declined is not
carried"). It fails the same way with both engines at HEAD
(`pre-existing/stream-tool-carry-over-at-HEAD-engines.txt`). It is not caused
by this change.

`typecheck-narrow.txt`: strict `tsc` over the engines, their callers and the
test. The only errors are the 6 `ai-editing.ts` lines named above. A scratch
copy carrying the proposed change reports none.

ESLint: `readiness-scoring-engine.ts` 2 warnings at HEAD and after (the same
two rules); `recommendation-engine.ts` 0 and 0; the new test 0.

## Not done

- **Required in the same commit, outside this slice's files:**
  `server/routes/c2c/ai-editing.ts:283-292` and `:1148-1156`. Replace each
  `Math.round(dims.x)%` with a helper that prints "not measured" for null:
  `const pct = (v: number | null) => (v === null ? 'not measured' : \`${Math.round(v)}%\`);`
  then `completeness ${pct(dims.completeness)}, quality ${pct(dims.quality)},
  consistency ${pct(dims.consistency)}, compliance ${pct(dims.compliance)}`.
  Without it the typecheck baseline grows by 6 and the edit context prints
  "quality 0%".
- `context-enrichment.ts:511` should render `scoreBasis`: say the overall score
  is document completeness when `source` is `no_assessment_on_record`, label a
  null dimension "not measured" rather than `—/100`, and replace "Present the
  scores above directly" with an instruction not to state a figure for an
  unmeasured dimension.
- `project-home-routes.ts:325` says "Ready — readiness score N" from
  `overallScore >= 75` and no critical gap. Without a twin assessment that is
  document completeness alone. It should say so, or not claim "Ready". No
  client reads this route today.
- `judgment-framework.ts` turns a null dimension into 50 (`?? 50`). That
  predates this change (it did the same when readiness was null), but it is a
  made-up input to a judgment score.
- Milestone recommendations record their evidence as
  `sourceType: 'document_state'` (`recommendation-engine.ts:275`). A milestone
  is not a document state. A `program_milestone` source type needs adding to
  the `EvidenceRef` union here and to `EvidenceSourceType` in
  `evidence-confidence-model.ts` together, because `rim.ts:206` passes one into
  the other.
- With a twin assessment, `moduleBreakdown.gapCount` is still 3 / 1 / 0 from a
  module score band, not a count of gaps (`readiness-scoring-engine.ts:218`).
- `ai-editing.ts:271` and `:1136` pass `Number(data.projectId)`, and the body
  accepts a string. A program UUID there would be NaN, Postgres would refuse
  it, and both calls `.catch(() => null)`. So the edit runs without readiness
  context and does not say so. No client calls these routes today.
- `stream-tool-carry-over.test.ts` fails without this change. Not
  investigated.
