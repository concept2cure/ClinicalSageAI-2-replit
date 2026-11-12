# F1 · A project's sources read: measured, what was repaired, and what remains (2026-11-12)

Package **F1** (repair). Found by walking a controlled document end to end in the running app
(`docs/evidence/DESIGN/D7/2026-11-12-training-lists-re-read/`, walk 41). Each run, one request was refused when the
one editor opened on the new document:

- `GET /api/c2c/projects/:id/sources?limit=200&offset=0` answered **503** after 5.1 s.
- The server log held the 503 and nothing else.

Measuring that read found the larger defect. The walk's project has 168 sources, all of them Quality records (the
data room lists a project's Quality records as sources). Its read took **7.5 to 8 s** alone, and **7.7, 15.2 and
23.4 s** when three arrived together.

## Two lanes, one repair

The data room lane found the same cause the same hour and landed its repair first: `f51844891`, a per-evaluation
cache of each project's access in `source-read-access.ts`
(`docs/evidence/SPINE/S2/2026-11-12-catalog-read-time/README.md`).

This lane had made the same repair another way (`df1a57ef1`: a bracket in
`server/services/c2c/current-program-access.ts`, inside which a repeated admission is the first answer). Two
mechanisms for one job is a duplicate, so at the merge this lane's was **withdrawn**: `source-read-access.ts` and
`current-program-access.ts` are trunk's, unchanged by this lane.

What this lane leaves on trunk:

- `server/services/clinical-regulatory-evidence/record-source.ts`: a failed Quality projection logs its cause (the
  organization, the project, the error's code and message; never its detail, which can carry row values), and still
  answers 503.
- Two cases on real Postgres in `__tests__/native-catalogue-current-records.pglite.test.ts`. They hold for trunk's
  cache: one scope computation runs as many project admissions for eight sources as for two; the read is still
  refused (403) when the person leaves the organization after the first source was admitted.
- The measurements below, on a project made of Quality records, where most of the cost is not the one trunk's cache
  removes.

## What already exists

- **The read**: `GET /:id/sources` in `server/routes/c2c/projects.ts`. It calls `searchDataRoom`
  (`server/services/clinical-regulatory-evidence/data-room-search.ts`), then `summarizeSourceUsage`
  (`source-usage.service.ts`), then `gradeSources` (`data-room-grade.ts`).
- **Which sources a person may read**: `getCurrentReadableSourceScope` (`source-read-access.ts`). It verifies the
  person's project scope, admits each source's recorded parent and each Quality record, then verifies the project
  scope again. `requireSourceReadScopeStillCurrent` runs the whole computation again for the listed sources before a
  read answers; a change refuses the read with 503 `SOURCE_READ_ACCESS_CHANGED`.
- **Project admission**: `requireCurrentProgramAccess` (`server/services/c2c/current-program-access.ts`): four
  statements.
- **The Quality evidence reader**: `readQualityProjectEvidence` and `authorizeQualityEvidenceSnapshot`
  (`server/services/qms/project-evidence.ts`). Each record with an authored document is admitted through
  `authorizeQmsContentRead` (`server/services/qms/controlled-document-content.ts`), which calls the authoring
  admission `authorizeAuthoringProgram` (`server/services/authoring/authoring-program-access.ts`).
- **The Quality projection**: `syncQualityProjectSources` (`record-source.ts`), run on a catalogue's first page. Any
  failure in it became 503 `QUALITY_SOURCE_PROJECTION_UNAVAILABLE` with its cause discarded.

Nothing new: no route, service, table or mount.

## What was measured

All on the walk's project, as its author. The project grew during the day as the walks wrote records; each figure
names its source count.

**One scope computation** (`profile-scope.ts` wraps the executor and counts statements; second pass):

| | Sources | Statements | Time |
|---|---|---|---|
| Before either repair (`profile-scope.bracket-off-on.txt`, first half) | 176 | 2,008 | 2,127 ms |
| Trunk now, the data room lane's cache (`profile-scope.trunk.txt`) | 183 | 1,448 | 1,221 ms |
| With this lane's withdrawn bracket (`profile-scope.bracket-off-on.txt`, second half) | 176 | 1,176 | 1,142 ms |

When first measured, at 168 sources, one computation ran 1,835 statements, and the same project was admitted for the
same person 307 times in it. The route runs the computation four times for one page.

**The route over HTTP** (`probe-editor-sources.cjs`; `shots/probe-editor-sources.*.json`):

| | Sources | One read | Three at once |
|---|---|---|---|
| Before either repair | 168 | 7,474 and 8,021 ms | 7,713, 15,200 and 23,376 ms |
| Trunk now | 183 | 6,974 and 6,573 ms | 6,126, 12,663 and 18,729 ms |
| With the withdrawn bracket | 176 | 5,650 and 4,924 ms | 4,921, 9,670 and 14,402 ms |

**Who still asks, on trunk** (`profile-callers.ts`, `profile-callers.trunk.txt`: the callers of "is this project the
organization's" inside one computation, 183 sources, 22 of them superseded snapshots):

- 93 by way of `authorizeAuthoringProgram`: the Quality evidence reader admits each record's authored document, in
  each of its reads (`readDocuments`, `readWorkingDocument`, `collectQuality`, the release readers) and twice for each
  superseded snapshot (`historicalAuthoredParent`).
- 36 by way of `requireCurrentProgramAccess`, from `authorizeSnapshot`: a scope and its check for each superseded
  snapshot that has an authored document. These are the repeats the withdrawn bracket also answered.
- 44 directly from `readQualityProjectEvidence`.
- 183 retained-text checks, one statement each (`verifyRetainedText`).

Every save of a controlled document leaves a superseded snapshot, so the first two lines grow with a project's edit
history, not only with its number of documents.

## Tests

- `__tests__/native-catalogue-current-records.pglite.test.ts`: the two cases above. `red.txt`: before either repair,
  eight sources ran 10 admissions against 4 for two.
- `__tests__/record-source-access.test.ts`: a projection that fails on a deadlock answers 503, logs
  `{ organizationId, programId, code: '40P01', error }` once, and logs none of the error's detail.
  `red-projection-log.txt`: it fails before the change.

`green.txt`: these two files and the data room lane's `source-read-scope-parent-once.test.ts`, on the merged tree, 22
cases.

## The 503, read

With the walk's library recording what a refusal says, the 503 was not the projection:

- `code: SOURCE_READ_ACCESS_CHANGED`, "Current source access changed during the read."
- The editor opens on a document created a moment before, and the walk saves its first text inside the read. A
  Quality record changed between the read's scope and its closing check, and the read refused, as designed.
- The slower the read, the wider that window. It happened on every run of the walk.

## Not done

Recorded in `.design/claude-convergence/COORDINATION.md`.

1. **The read is still 6.6 to 7 s on this project.** Most of what remains is in the Quality evidence reader, which is
   this lane's to take next, named there before it starts: ask a project's authoring access once per register read,
   the way trunk's cache asks a project's access once per evaluation.
2. **Three reads together finish one after another**, not together. The data room lane's note gives a cause: each
   statement runs in its own transaction with the tenant context set.
3. **Neither the route nor the editor's reader reads again** on 503 `SOURCE_READ_ACCESS_CHANGED`, whose meaning is
   "read again". The editor is the coordinating session's.
