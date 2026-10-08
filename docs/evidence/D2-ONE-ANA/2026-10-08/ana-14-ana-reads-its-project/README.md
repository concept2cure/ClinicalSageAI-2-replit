# ana-14 — AnA reads the project it is in

Launch row **D2**. Investigation: `scratchpad/context-warning/FINDINGS.md`
(2026-10-08), fixes 1 to 4. Reviewed the same day (two lenses: correctness
and regressions; design, Part 11 and honest state). The review findings are
fixed here, and listed under "Review".

## What was wrong

This was a production defect, for every client. The v2 app names the open
project by its `regulatory_programs` UUID. AnA's project readers key on the
integer `projects.id`, which links to the program through
`projects.regulatory_program_id`. The stream route passed the UUID straight to
them.

- **Project profile.** `getProjectIntelligence(Number(uuid))` is NaN, and
  Postgres refuses it (22P02). On every project-scoped turn the budget marked
  the profile unavailable. The person read "Some project context could not be
  loaded for this reply", and the model was told the profile was missing.
- **Project memory used by eCTD, safety, CSR, device, CMC, CMS and
  diagnostics.** `project_memory_entries WHERE project_id = '<uuid>'` failed.
  The failure came back as `''`, so it counted as a healthy empty. Neither the
  person nor the model was told.
- **Every other integer reader in enrichment** (foresight, precedents, CRL/RTF,
  readiness, recommendations, claims, cross-module, signals, knowledge search,
  biostatistics). Each got NaN or the UUID.
- **Route prefetch.** `Number(uuid)` skipped the project's feedback, profile
  and regulatory snapshot. The relational overlay was sent NaN, and its read
  failed whole, so AnA also lost her notes about the person. The session
  briefing was sent NaN too.
- **Memory, session bootstrap, tool-run log, relational reflection.** Memory
  searched with the UUID, and the bootstrap dropped it. The tool-run log and the
  reflection got NaN or null.

So on every project-scoped turn AnA answered without the project's profile,
memory or notes. Every reply carried a warning that named nothing a person
could check.

## What changed

**Three answers, kept apart.** A turn's project is one of three things
(`TurnProject`, `context-enrichment.ts:203`):

- **linked**: an integer `projects.id`, or the row the program is linked to.
  Every reader reads it.
- **none**: a program with no linked `projects` row. There are no project
  records, so nothing is read and nothing is unavailable.
- **unresolved**: the lookup failed or ran out of time. Whether records exist
  is not known. It is reported as `project-record`, with why, and nothing is
  said about the project's records.

The changes:

- **One strict resolution.** `program-project-anchor.ts:356`
  `strictProjectRowForRef` gives the same answer as `project-ref.ts`
  `integerProjectForRef`: an integer is itself, `proj_7` is 7, a program UUID
  is its lowest-id anchor row (org-scoped), anything else is null. One
  difference: a lookup that could not complete throws. `integerProjectForRef`
  logs it and answers null, on purpose, and its header tells a caller that
  must fail on "could not tell" to pass `strict` to
  `resolveProgramProjectAnchor` itself. That is what this does, in one place,
  for the stream and enrichment. A test pins that the two agree ref by ref
  wherever the lookup completes (`project-ref-anchor-read.test.ts`). A program
  with no organization to scope it throws too.
- **The stream resolves once, with a deadline.** `stream.ts:345`
  `resolveTurnProject` starts at `:1060`, before the thread work, and is
  bounded by `TURN_PROJECT_DEADLINE_MS` (3 s, `:330`), the deadline every other
  optional pre-gateway read has. It is awaited at `:1169`. The integer goes to:
  - the prefetch (`:1173`), which feeds the relational overlay and the
    session briefing;
  - memory (`:1264`) and enrichment (`:1276`, as the whole `TurnProject`);
  - the session bootstrap (`:1400`);
  - the tool-run log (`:2501`) and the relational reflection (`:3343`).

  The inline `proj_`/`Number` converter for the bootstrap is gone. It used to
  drop a program UUID, so a v2 project's memory atoms never loaded.
- **Enrichment takes the stream's answer, or resolves inside its budget.**
  `context-enrichment.ts:1344`: with no `project` from the caller, it resolves
  once, before any read, inside the same 3 s budget. An unresolved project
  (from either) marks `project-record` with its reason (`:1352`). Every
  integer reader takes `ProjectRowId = number | null` (`:188`), so the type
  checker refuses a UUID. The CMC Module 3 build-state reads key on the program
  UUID (`$1::text::uuid`), so they keep it (`enrichWithModule3BuildState`,
  `:863`).
- **No affirmative absence without a read.** `enrichWithDomainMemory`
  (`:777`) returns `''` when there is no project row (`:789`). Only a read
  that completed and found no rows earns "No safety data found for this
  project yet". A read that failed throws, the budget marks the source, and
  the model is told.
- **The model is told why a program has no project data.** For a program with
  no linked project, a `## Project records` notice (`:1932`) says no project
  memory, profile, readiness, workflow progress, signals or recommendations
  were read, and not to state or imply that the project has or lacks any
  record. Like the availability notice, it is added after the composer, so
  trimming cannot drop it.
- **A request that reads several sources reports each one.** `/submit`,
  `/assess`, `/status`, `/help`, `/preflight`, `/twin`, `/audit`, `/review`,
  `/strategy`, `/scan`, `/report`, `/ib`, `/haq`, `/risk`, `/cmc` and the
  natural-language HAQ and CMC triggers read each part under its own name
  (`parts`, `:1361`). One failed part no longer discards the others. CMC is
  two parts: the CMC memory (`cmc`) and the Module 3 build state
  (`cmc-build-state`).
- **Why, not only that.** The budget (`:1125`) records `timeout` or `error`
  for each unavailable source, as `enrichmentMeta.unavailableReasons`. The
  model's block reads, for example, `Enrichment context unavailable: ectd (read
  failed), workflow (took too long to read)`.
- **Plain words for the person.** `stream.ts:456` `unavailableContextWarning`
  names the context and the reason, and says the answer does not draw on it.
  Every key the budget can record has a label (`:383`), with its grammatical
  number stored, not guessed from a final "s". Slash-command and trigger keys
  map to the reader they ran (`:416`); `app:<id>/<source>` and `proactive-*`
  read as their source (`:441`); anything else is "requested context", never
  the key. For example:
  - "Could not read the project records for this reply. The answer does not
    draw on them."
  - "The submission workflow status took too long to read for this reply. The
    answer does not draw on it."
  - "Could not read for this reply: project profile. Took too long to read:
    submission workflow status. The answer does not draw on them."

  The same text goes into the turn record.
- `chat-context-builder.ts:155`: when the caller passes no resolved id, the
  prefetch uses `parseIntegerProjectId` instead of `Number`. A UUID is then no
  project, never NaN.
- `relational-profile-service.ts:133`: the overlay sends only a positive
  integer project id, otherwise null. This matches what `reflectAfterTurn`
  already did.

## Review

| Finding | Severity | Now |
|---|---|---|
| A failed anchor lookup became `null`, so `/safety`, `/cmc`, `/csr`, eCTD told the model "No … data found for this project yet", and the person saw nothing (two reviewers) | blocker | Strict resolution. The lookup failing is `unresolved`, marked `project-record` (error); no project row never gives the "No … data found" sentence. |
| The stream's lookup had no deadline and held the turn before any context read | major | Bounded at 3 s (`TURN_PROJECT_DEADLINE_MS`). A timeout reaches enrichment as `unresolved` (timeout) and the person is told. |
| A program with no linked project lost the submission workflow block, and the model was not told | major | The model is told (`## Project records`, naming workflow progress). Rendering the registry steps with progress "not tracked" needs `workflow-orchestration.ts`; requested below. |
| A failed part of a composite command discarded the others | minor | Each part is read and reported on its own. |
| Raw keys in the warning ("the cmc", "the app:fda/ectd"), and "it"/"them" guessed from a final "s" | minor ×3 | Labels for every key, with number stored. A test runs every key the budget can record. |
| README said the `project-record` timeout covered the stream | minor | It does now: the stream's own lookup is bounded and reported. |

## Shown

`red/` is the current tests against HEAD (`7a6edef06`), all five source files.
`red/before-review/` is the current tests against this slice as it stood
before review (the implementer's `stream.ts` and `context-enrichment.ts`,
`program-project-anchor.ts` at HEAD). Each file's second line names its
sources. Edited files were restored and checked by sha256 after each run.

| Test | HEAD (red) | Before review (red) | After (green) |
|---|---|---|---|
| `services/ana-ri/__tests__/context-enrichment-program-project.test.ts` (26): linked UUID read as 42; unlinked reads nothing, nothing unavailable, model told why; 42703 is not a failure; eCTD memory by 42; unlinked `/safety` `/cmc` `/csr` `/device` `/cms` `/diagnostics` `/ectd` and Module 2.5 give no "No … data found" (×8); CMC build state keeps the UUID; a resolved project is used as given; integer needs no lookup; failed lookup on `/safety` `/cmc` `/csr` Module 2.5 → `project-record` (error), no absence asserted (×4); unresolved from the caller keeps its reason; no organization is could-not-tell; `/submit` keeps readiness when eCTD fails; `/cmc` keeps the build state when CMC memory fails; failed domain read is reported; timeout and error each recorded; a stalled lookup → `project-record` (timeout) | 25 fail | 18 fail (`before-review`: `unavailable=[]` and "No safety data found for this project yet" on a failed lookup; `/submit` → `submit (read failed)` and readiness gone) | 26/26 |
| `routes/ana-ri/__tests__/stream-project-anchor.test.ts` (25): a UUID reaches memory, prefetch, enrichment, bootstrap, tool-run log and reflection as 42, resolved once; unlinked → `none`; failed lookup → `unresolved` (error); stalled lookup → prefetch within the deadline, `unresolved` (timeout); warning in plain words on the stream; 19 wording cases; every budget key reads as plain words | 25 fail | 20 fail (the stalled lookup: "Test timed out in 15000ms", the turn never reached the prefetch) | 25/25 |
| `services/c2c/__tests__/project-ref-anchor-read.test.ts` (11): `integerProjectForRef` through the real anchor reader (6 pins); `strictProjectRowForRef` agrees ref by ref, 42703 → null, other errors throw, no organization throws, loader only for a UUID (5) | 5 fail (no strict resolver) | 5 fail | 11/11 |
| `services/ana-ri/__tests__/prefetch-program-project.test.ts` (4): the resolved id reaches profile, feedback, snapshot, overlay and briefing; no resolved id → no project, never NaN (×2); `proj_33` → 33 | 4 fail (NaN) | 4/4 (unchanged by review) | 4/4 |
| `services/ana-ri/__tests__/relational-overlay-project-id.test.ts` (5): NaN, 0, -1 and 1.5 read the person alone; 42 passes | 4 fail | 5/5 (unchanged by review) | 5/5 |
| `routes/ana-ri/__tests__/stream-tool-carry-over.test.ts` (12): the warning case expects "The claims and evidence records took too long to read for this reply. …" | wording case fails | wording case fails | passes |
| Live probe 2 (`probe2.out`, local `c2c_ui_screens`, no linked program; then a database that cannot be reached) | — | `before-review/probe2.out`: unlinked and failed lookup both give "No … data found" on `/safety`, `/cmc`, Module 2.5, `unavailable=[]` | `green/probe2.out`: unlinked → no absence asserted, `## Project records` notice; failed lookup → `project-record` (error), the model told "read failed" |
| Investigator's probe (`scratchpad/context-warning/probe.ts`) | `red/probe.out`: UUID turns `unavailable=["project-profile"]`, `failed=["ectd",…]` | — | `green/probe.out`: `unavailable=[]`; `ectd` is in `failed` (no block) because nothing is asserted about a project nobody read |

In every column, the one other failure in `stream-tool-carry-over.test.ts` is
"a step the person declined is not carried…". It fails on HEAD with HEAD's
test file too (`red/pre-existing-on-HEAD-stream-suite.txt`).

Regression set (`green/regression-suite.txt`): every test file that imports or
mocks a changed file (by grep), plus all of `routes/ana-ri/__tests__`,
`services/ana-ri/__tests__`, `services/c2c/__tests__`,
`services/lumen-context/__tests__` and the anchor contracts. 157 files, 2216
tests: 2214 passed, 2 failed. Neither failure is from this slice: the
carry-over case above, and `tests/schema-contract/chat-thread-access.contract.test.ts`,
which imports no changed file (it matched the grep on a comment).

Typecheck (`green/typecheck-scoped.txt`): a scoped `tsc` over the changed and
new files reports no errors in them, and is shown catching a misuse of the new
types. The full `tsc -p tsconfig.json` ran out of heap at 6 GB on this shared
machine. Running the full check (24 GB, as in `package.json`) is left to the
coordinator.

ESLint (`green/eslint-counts.txt`): no file has more warnings than HEAD.
stream 23/23, context-enrichment 6/6, chat-context-builder 4/4,
relational-profile-service 3/3, program-project-anchor 1/1, and 0 in each
test file.

## Not done

- **The submission workflow for a program with no linked project.** The
  workflow's steps come from `WORKFLOW_REGISTRY`, not from project data, but
  `getWorkflowStatus` (`workflow-orchestration.ts`, not this slice's file)
  needs a project id, and without one marks every tracked step not done ("0%",
  every critical step a blocker). So the block is left out and the model is
  told progress was not read. Rendering the steps with progress "not tracked"
  needs a no-project branch there (requested).
- **`integerProjectForRef` cannot be strict.** `project-ref.ts` (another
  owner) does not forward `strict`. Once it does, `strictProjectRowForRef` can
  be replaced by `integerProjectForRef(…, { strict: true })` and deleted
  (requested). Until then the two agree ref by ref, pinned by a test.
- **Post-processing resolves the project again,** non-strictly
  (`post-processing.ts` `turnProjectId`). It is a second lookup per turn, not a
  second implementation. It could take the stream's answer (requested).
- **Memory "not configured" status** (fix 5): a separate slice. In dev,
  without an embedding key, memory still shows "Could not be read".
- **Readiness and recommendations query `regulatory_programs.project_id`,
  which does not exist** (`recommendation-engine.ts:234`,
  `readiness-scoring-engine.ts:361`). `/assess` still lands in `failed` in the
  probe. A separate slice.
- **The Module 3 build state still swallows its own read failure** (as it did
  on HEAD). It is now its own source, so making it throw would report it; it
  was left as it was, because for a legacy integer project its
  `$1::text::uuid` cast fails every time and would warn on every `/cmc` turn.
- `buildChatContext` (`chat-context-builder.ts`) has no production caller. Its
  memory and account-context calls still use `Number(projectId)`.
- `stream.ts`, the `answer_intelligence_question` fast path, still uses
  `Number(ref) || null`. A UUID gives null there, never a wrong project.
- **No linked-program live run.** The local database has no `projects` row
  linked to a program, so the linked case is shown by the tests only.
