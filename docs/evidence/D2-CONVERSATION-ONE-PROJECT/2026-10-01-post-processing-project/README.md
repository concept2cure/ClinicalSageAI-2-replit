# PF-10 S6a, second part (D2): AnA's post-processing acts on the turn's own project

`runStreamPostProcessing` (`server/routes/ana-ri/post-processing.ts`) runs after every AnA turn.

## The defect

Each step coerced the stream's project on its own:

| Step | Coercion | For `7abb1c22-…` |
|---|---|---|
| Guidance executor (auto-creates artifacts from the answer) | `Number.parseInt` | **project 7** |
| Command executor `activeProjectId` (create task, artifact…) | `Number.parseInt` | **project 7** |
| Provenance trail | `Number(…) \|\| undefined` | none |
| RIM interception | `Number(…)` | `NaN` |
| Working-memory write-back | `Number(…) \|\| null` | none, so v2 threads never reach project memory (ana MISSED-5) |
| Reliability read | `Number(…)` | `NaN` |

Project 7 is a valid, wrong project of the same organization. So for a v2 program whose UUID began with digits, AnA created artifacts under another project, and the command executor ran with that project active. `projectBelongsToTenant` admits it, because it is the organization's.

The draft writer already had its own inline resolution, from the PF-08 review.

## The change

- **`server/services/c2c/project-ref.ts` `integerProjectForRef`** is the one resolution of a project ref:
  - an integer (`parseIntegerProjectId`, fail-closed) is itself;
  - a program UUID is its anchor row, via `resolveProgramProjectAnchor`, the one reader;
  - anything else is none.
  - It answers which row, not whose: writers still ask `projectBelongsToTenant`.
  - The db is loaded only when an anchor read is needed.
- **Post-processing resolves the project once** (`turnProjectId`), and every step uses that value.
  - A step that needs a project runs only when one resolved.
  - The draft writer uses the same helper.
- **The intelligence prefix (S6a's first part) uses the same helper**, so there is one resolution.

## Evidence

| File | Shows |
|---|---|
| `01-red.txt` | Against HEAD: for `7abb…` the guidance and command executors get 7 (`{ guidance: 7, commands: 7, … }`). With no anchor, they still get 7. `'7abc'` still gets 7. |
| `02-green.txt` | Every AnA route suite, the lumen-context and c2c services, every prefix suite, the one-anchor-reader contract and the founder-path walk, all passing. Also the whole AnA, authoring and lineage tree: 326 files, 4,452 tests. `tsc` and the lint ratchet pass. |

## Still to come in S6a

The stream's own readers (`stream.ts`: memory, enrichment and the session bootstrap) still take the raw project. They go with S3, which resolves the turn's project once at thread resolution.

## Review

The review was `wf_2358b437-4c8`. It upheld one finding 2/2 for post-processing and raised the same finding for `send-message`. The remaining verifiers hit a session limit, and the finding was fixed on the post-processing evidence.

**A program with no anchor row now skipped the guidance executor**, which is the one place AnA's ` ```ana-action ` blocks are stripped. The raw JSON block was saved as the answer, shown to the person and replayed to the model, and the action's "not created" was never said. The old code ran the executor with `NaN`: the block was stripped and a failure reported.

The fix:
- **`processResponseActions` takes a null project.** It strips the blocks, creates nothing, and reports each action as not created: "No project is linked to this conversation…".
- **Post-processing and `send-message` always call it.** This also strips blocks in a conversation with no project at all, which showed them before this work too.

Tests:
- `server/services/__tests__/guidance-executor-no-project.test.ts`: the real executor strips the block and reports the action.
- `post-processing-project.test.ts`: the executor now runs with `projectId: null` for an unanchored or malformed project.

`03-red-review-fence.txt` shows both failing against HEAD. Green: the 28 files that touch the executor or its callers (350 tests), the AnA route suites and the walk.
