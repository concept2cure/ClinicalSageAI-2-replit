# F1 · One read admits a project once, however many of its sources it lists (2026-11-12)

Package **F1** (repair). Found by walking a controlled document end to end in the running app
(`docs/evidence/DESIGN/D7/2026-11-12-training-lists-re-read/`, walk 41). Each run, one request was refused when the
one editor opened on the new document:

- `GET /api/c2c/projects/:id/sources?limit=200&offset=0` answered **503** after 5.1 s.
- The server log held the 503 and nothing else.

Measuring that read found the larger defect. The walk's project has 168 sources, all of them Quality records (the
data room lists a project's Quality records as sources). Its read took **7.5 to 8 s** alone, and **7.7, 15.2 and
23.4 s** when three arrived together.

## What already exists

- **The read**: `GET /:id/sources` in `server/routes/c2c/projects.ts`. It calls `searchDataRoom`
  (`server/services/clinical-regulatory-evidence/data-room-search.ts`), then `summarizeSourceUsage`
  (`source-usage.service.ts`), then `gradeSources` (`data-room-grade.ts`).
- **Which sources a person may read**: `getCurrentReadableSourceScope`
  (`server/services/clinical-regulatory-evidence/source-read-access.ts`). It verifies the person's project scope,
  admits each source's recorded parent and each Quality record, then verifies the project scope again
  (`requireProgramScopeStillCurrent`). `requireSourceReadScopeStillCurrent` runs the whole computation again for
  the listed sources before a read answers; a change refuses the read with 503 `SOURCE_READ_ACCESS_CHANGED`.
- **Project admission**: `requireCurrentProgramAccess` (`server/services/c2c/current-program-access.ts`): four
  statements (the project is the organization's; the actor is a current member; the one tracking record; sharing).
- **A per-read cache of the same kind**: `createNativeRecordAdmission` (`record-source.ts`) already reads a
  project's Quality evidence once per invocation: "One closure per read invocation … A later end-of-read check
  creates another closure, so changed facts or revoked grants cannot use this cache."
- **The Quality projection**: `syncQualityProjectSources` (`record-source.ts`), run on a catalogue's first page.
  Any failure in it became 503 `QUALITY_SOURCE_PROJECTION_UNAVAILABLE` with its cause discarded.
- **The lane's own note**: the data room catalog lane's handoff in `.design/claude-convergence/COORDINATION.md`
  ("Next for whoever picks this up: … the 2 to 3.5 s catalog read"). That lane left on 2026-11-12 and holds nothing.

Nothing new: no route, service, table or mount.

## What was measured

`profile-scope.ts` wraps the executor and counts the statements of one `getCurrentReadableSourceScope` for the
project, as its author. `profile-scope.txt` is its output on the same data (176 sources by then), with the bracket
switched off and on, second pass:

| One scope computation, 176 sources | Statements | Time |
|---|---|---|
| Before | 2,008 | 2,127 ms |
| After | 1,176 | 1,142 ms |

When first measured, at 168 sources, one computation ran 1,835 statements, and the same project was admitted for the
same person **307 times** in it: four statements each, 1,228 of the 1,835. The route runs the computation four times
for one page (the search's scope and its check, the usage summary's scope and its check).

`profile-sources.ts` times the route's stages in process, first pass (`profile-sources.after.txt`):

| Stage | Before (168 sources) | After (176 sources) |
|---|---|---|
| `getCurrentReadableSourceScope` | 1,876 ms | 1,397 ms |
| `requireSourceReadScopeStillCurrent` | 1,819 ms | 1,253 ms |
| `searchDataRoom` (projection, scope, two queries, check) | 3,765 ms | 2,854 ms |
| `summarizeSourceUsage` (scope, query, check) | 3,246 ms | 2,218 ms |

`probe-editor-sources.cjs` reads the route over HTTP as the author (`shots/probe-editor-sources.before.json`,
`.after.json`):

| | Before (168 sources) | After (176 sources) |
|---|---|---|
| One read | 7,474 and 8,021 ms | 5,650 and 4,924 ms |
| Three at once | 7,713, 15,200 and 23,376 ms | 4,921, 9,670 and 14,402 ms |

## What changed

- `current-program-access.ts`: `withinOneProgramAdmission(read)` brackets one evaluated read. Inside it, a repeat of
  `requireCurrentProgramAccess` by the same actor, for the same project, on the same executor, is the first answer.
  - A refusal is never kept: the next record asks again.
  - A writer's locking admission (`forShare`) and a retained-lifecycle read (`includeDeleted`) are never answered
    from it.
  - Outside a bracket nothing changes.
  - The bracket's store is the process's. The development loader loads this module twice (once for an import
    statement, once for `import()`), and with a store per copy the Quality evidence reader's 34 repeats were not
    found (`profile-callers.ts`).
- `source-read-access.ts`: `getCurrentReadableSourceScope` admits its rows inside one bracket. The scope is verified
  before the bracket and again after it, outside it, as before. A grant withdrawn while the rows are admitted still
  refuses the read.
- `record-source.ts`: a failed Quality projection logs its cause (the organization, the project, the error's code and
  message; never its detail, which can carry row values), and still answers 503.

## Tests

`server/services/clinical-regulatory-evidence/__tests__/native-catalogue-current-records.pglite.test.ts`, on real
Postgres:

- one scope computation runs as many project admissions for eight sources as for two;
- the read is still refused (403) when the person leaves the organization after the first source was admitted.

`red.txt`: before the change, eight sources ran 10 admissions against 4 for two. `mutation.txt`: with the closing
verification moved inside the bracket, the second case fails ("promise resolved instead of rejecting"), so it is the
case that guards the bracket. `green.txt`: `server/services/clinical-regulatory-evidence`, `server/services/c2c` and
the Quality project-evidence suite pass, 90 files. The run's two failures are
`report-os/__tests__/quality-evidence-report.test.ts`, which needs the reporting PDF fonts this machine does not have
(`REPORT_PDF_FONTS_UNAVAILABLE`); it fails the same way with this change stashed. Of the 154 other test files that
name these readers, 152 pass and the other two are PDF exports that fail for the same fonts.

`server/services/clinical-regulatory-evidence/__tests__/record-source-access.test.ts`: a projection that fails on a
deadlock answers 503, logs `{ organizationId, programId, code: '40P01', error }` once, and logs none of the error's
detail. `red-projection-log.txt`: it fails before the change.

## The 503, read

With the walk's library recording what a refusal says, the 503 was not the projection:

- `code: SOURCE_READ_ACCESS_CHANGED`, "Current source access changed during the read."
- The editor opens on a document created a moment before, while the register is still writing its first records.
  A Quality record changed between the read's scope and its closing check, and the read refused, as designed.
- The slower the read, the wider that window. At 5 s it happened on every run of the walk.

## Not done, and handed on

Recorded in `.design/claude-convergence/COORDINATION.md` for the coordinating session:

1. **The read is still 5 s.** What remains in one scope computation of 176 sources (`profile-scope.txt`,
   `profile-callers.ts`):
   - 121 times, a Quality record's authored document is admitted through `authorizeAuthoringProgram`
     (`server/services/authoring/authoring-program-access.ts`, by way of `authorizeQmsContentRead`): the same four
     project statements each time, and three reads of the authored document. About 850 of the 1,176 statements;
   - 176 retained-text checks, one statement each (`verifyRetainedText`, `record-source.ts`);
   - the route runs the computation four times for one page.
2. **Three reads together finish one after another** (4.9, 9.7, 14.4 s), not together. Not diagnosed.
3. **The editor's reader does not retry** a 503 `SOURCE_READ_ACCESS_CHANGED`, whose meaning is "read again".
