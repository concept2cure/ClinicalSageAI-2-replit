# ana-24 — The project page holds readiness and submissions (slice 24)

Launch row **D2**. Design: `docs/design/ONE_ANA_ONE_CANVAS.md` slice 24 and §2.3.

## What was wrong

The founder said the product was split into separate apps instead of following
the client's work. Three places showed it.

- With a project open, the Submission Center still listed every submission of
  the organization (`GET /api/submissions`). "New submission" asked which
  programme the submission was for, although a project was already open.
- On Project home, the Submit stage showed one empty state: "Submissions open in
  the Submission Center". It listed no submissions and gave no readiness verdict.
  To learn whether its sequence could be sent, a person had to leave the project.
- The author stage had a "Tasks & readiness" panel titled "Tasks & submission
  readiness aren't wired to this workspace yet". Its button opened the task board
  on everyone's tasks.

The review of the first build found four more defects, all fixed here:

- **A false "no submission".** The gate reads only the submission whose
  application type is the program's type. So an IND project whose only
  submission is an MAA, and every CER project, was told "No submission for this
  project yet". The list right below showed the submission. The readiness screen
  said the same: "This program has no submission recorded".
- **A bare all-clear.** A cleared verdict showed only "Cleared to dispatch". The
  server had said a gate was not assessed (no agency-grade validator configured,
  the common installation). The readiness screen says so; the project page did
  not.
- **The two panels disagreed on a legacy submission.** The gate can read a
  submission with no project recorded, matched by name. The list (the server's
  anchor scope) does not hold it, and said "No submissions for this project yet"
  under a verdict on it.
- **Submission Center wording and focus.** Pressing the scope toggle dropped
  keyboard focus to `<body>` (WCAG 2.4.3). A project known only by its id read
  "Submissions of the open project, the open project". A failed scoped read
  said "These are your organization's submissions". AnA's miss on another
  project's submission said "No submission named X in this portfolio", as if it
  did not exist.

## What changed

- `client/src/concept2cure/v2/surfaces/programSequence.ts` (new). This is the one
  module the readiness screen and the project page share. Nothing in it was
  copied; it was moved here.
  - `useProgramSequence`, `discoverProgramSequence`, the `Discovery` type and the
    wire types were moved here from `DispatchReadiness.tsx`. `useProgramSequence`
    also takes a `reloadKey`, so a reader can offer "Try again".
  - `useSequenceDispatchReadiness` (`:421`) is the readiness screen's verdict
    read, moved here: `GET /api/submissions/sequences/:seqId/dispatch-readiness`.
    It uses the server's composed `gate` and never recomputes it. One change: in
    the render after discovery finds a sequence and before its read starts, the
    state is now `evaluating`. Before, it was briefly `no-sequence`.
  - The `no-submission` state now carries the program's type and the
    submissions recorded to the program of other types (`:275`). The
    `sequence` and `no-sequence` states carry the submission's title and how it
    was matched.
  - `noSubmissionWords` (`:349`) is the one wording of that state for both
    screens. With other submissions: "No IND submission for <subject> yet" and
    it names them ('MAA "ONC-221 EU MAA"'). With none recorded: "No submission
    for <subject> yet", which is then true. With no program type: it says the
    gate cannot tell which submission to read. `programTypeLabel` (`:182`)
    gives "IND", "510(k)", "De Novo", or the type as given ("CER").
  - `programSubmissionsPath` (`:28`) builds the project-scoped list read.
    `notOfferedCount` (`:33`) reads the server's `meta.notOffered` and returns
    null when the server sent no count. The client never computes it.
  - The status chip maps `SUB_STATUS_TONE` and `SUB_STATUS_LABEL` were moved here
    from `SubmissionCenter.tsx`.
- `surfaces/DispatchReadiness.tsx` reads through the shared hooks (`:121`). Its
  `no-submission` screen (`:228`) and AnA summary (`notReadySummary`, `:28`)
  use `noSubmissionWords`: the type that is missing, and the program's other
  submissions by name. A program with nothing recorded keeps "No submission for
  <program> yet" (`dispatchReadinessProgramScope.test.tsx` pins it).
- `surfaces/SubmissionCenter.tsx`
  - `:421-431`: with a project open (`shellProgramId(readShellProject())`, a
    `regulatory_programs` uuid), it reads `GET /api/submissions?programId=<uuid>`.
    `useLiveRows` keeps the envelope's `meta`.
  - `ProjectScopeLine` (`:349`) is one line under the title, for example
    "Submissions of ONC-221, the open project. 3 other submissions in your
    organization are not shown." It has a button to show all of the
    organization's submissions, and a button to go back. With no server count,
    it says nothing about others, and the button stays. The words sit in one
    `<span>` and the button in one place in both states, so a toggle keeps the
    same button and focus stays on it. A project with no known name is "the
    open project" once (`openProjectKnownName`, `:440`).
  - `:1141`: with a project open, the create form has no Programme picker. It
    shows a read-only "Project" field with the project's name, and the POST
    carries that project's id (`openProgramme`, `:330`).
  - A project with no submissions says "No submissions for <project> yet". A
    failed scoped read says "this project's submissions could not be read"
    (`:1188`).
  - AnA is told whose submissions are counted (`facts.listScope`, `:914`). Its
    miss on a submission outside the project (`scopedMissReason`, `:384`) says
    it is not among the open project's submissions, gives the server's count of
    the others, and names the "Show all" button only the person can press.
  - With no project open, it works exactly as before.
- `surfaces/ProjectHome.tsx`
  - The Submit stage (`:1887`) is `ProjectSubmitStage` (`:505`). It makes one
    discovery and one scoped list read and gives both to its two panels, so one
    panel cannot deny what the other shows.
  - Dispatch readiness comes first (`ProjectReadiness`, `:407`). It shows the
    server's verdict ("Cleared to dispatch", "Dispatch blocked", or "No verdict
    from the server") with an icon and words, not colour alone. It also shows
    the server's blockers, the server's error/warning/info counts, and the
    sequence it gated. Under a cleared verdict, `NotAssessedLines` (`:324`)
    gives each gate the server cleared without assessing, with the server's own
    sentence; with no gate breakdown, it says "External validator not run" when
    the server says it did not run. "Not ready" states are said in plain words
    (`notReadyCopy`, `:281`): no submission of the project's type (naming the
    others), no sequence, could not read (with Try again), and checking. "Open
    readiness" appears only while `dispatch-readiness` is in the launch scope.
  - The project's submissions come next (`ProjectSubmissions`, `:458`). Each row
    shows the application type, title and product, status in words, region and
    stage. Loading, a failure with Try again, and "No submissions for this
    project yet" are separate states. When the verdict above is for a
    submission matched by name (`legacyGated`, `:452`), the list says "No
    submission is recorded to this project" and names it, or adds a line under
    the rows. "Open Submission Center" stays, and the Center now opens on this
    project.
  - `MyWorkLine` (`:1286`) takes the place of "Tasks & readiness". It says in one
    line: "Your work is not filtered to this project yet. My work lists it for
    every project." "Open My work" sends `tasking.filter` with `mine` through the
    validated action bus, so the board opens on the person's own tasks. The
    `tasks` surface is in the launch scope (Projects app,
    `shared/constants/launch-scope.ts:53`).
    - Deletion check (working agreement). The removed panel was an empty state
      with a button to `task-board`, which is an alias of `tasks`
      (`DEEP_LINK_ALIASES` in `registryModel.ts`). Its user outcomes are still
      reachable:
      - My work: `MyWorkLine`, proven by `projectHomeMyWorkLine.test.tsx`;
      - the readiness verdict: the Submit stage, proven by
        `projectHomeSubmitStage.test.tsx`;
      - the task board: the Review stage's "Open task board" button, unchanged.
- No CSS changed. Every class the new panels use already had a rule:
  - `dr2-*` is in `coverage-v2.css`, and `sp-state` is in `journey-v2.css`.
    V2App loads both globally, and the readiness screen uses the same classes.
  - `pj-file*`, `pj-desc`, `scaf-note` and `pj-card-h-go` are in `app-v2.css`.
  - `sc-mb` is in `submission-v2.css`, which the Submission Center imports.

## Shown

| Test | Before (red) | After (green) |
|---|---|---|
| `__tests__/submissionCenterOpenProject.test.tsx`: with a project open, reads `?programId=`, not the organization | fails at HEAD | passes |
| same: says whose submissions these are and the server's count of others | fails at HEAD | passes |
| same: shows all of the organization's on request, and goes back | fails at HEAD | passes |
| same: no count from the server, no number guessed, button kept | fails at HEAD | passes |
| same: create has no programme picker; names the project; POST carries its id | fails at HEAD (the Programme select is there) | passes |
| same: with no project open, reads and creates as before | passes (a pin) | passes |
| same: the scope toggle keeps keyboard focus, both directions | fails before the review fix (a new button) | passes |
| same: a project known only by its id is "the open project" once | fails before the review fix | passes |
| same: a failed scoped read does not call the list the organization's | fails before the review fix | passes |
| same: AnA's miss on another project's submission says it is not listed here, with the server's count | fails before the review fix ("in this portfolio") | passes |
| `__tests__/projectHomeSubmitStage.test.tsx`: lists the project's submission from the scoped read | fails at HEAD | passes |
| same: empty project is an empty state, not a failure | fails at HEAD | passes |
| same: failed read has Try again, and the retry reads again | fails at HEAD | passes |
| same: "Open Submission Center" stays | passes (a pin) | passes |
| same: the server's verdict, blockers and counts, above the submissions; "Open readiness" | fails at HEAD | passes |
| same: a cleared verdict, in words | fails at HEAD | passes |
| same: no `gate` in the response is "unanswered", never cleared | fails at HEAD | passes |
| same: no submission and no sequence, in plain words (the hint names the IND) | fails at HEAD and before the review fix | passes |
| same: an IND project whose only submission is an MAA is not told it has none; the MAA is named | fails before the review fix ("No submission for this project yet") | passes |
| same: a CER project names its submission instead of denying it | fails before the review fix | passes |
| same: a verdict on a submission matched by name is named by the list | fails before the review fix ("No submissions for this project yet") | passes |
| same: a cleared verdict states each gate the server did not assess, in its words | fails before the review fix | passes |
| same: a cleared verdict with no gate breakdown says the external validator did not run | fails before the review fix | passes |
| same: a cleared verdict whose validator ran shows no caveat | passes (a pin) | passes |
| `__tests__/projectHomeMyWorkLine.test.tsx`: the one line, and no "readiness aren't wired" | fails at HEAD | passes |
| same: "Open My work" opens the board on the person's own tasks | fails at HEAD | passes |
| `__tests__/dispatchReadinessOtherTypes.test.tsx`: the readiness screen and AnA say the IND is missing and name the MAA | fails at HEAD and before the review fix | passes |
| same: a program with nothing recorded is still "no submission", with its type named | fails at HEAD and before the review fix | passes |
| every test file that imports, mocks or scans the four changed modules | n/a | see `green/vitest.txt` |

Runs:
- `red/vitest.txt`: the four new test files against the committed
  `SubmissionCenter.tsx`, `DispatchReadiness.tsx` and `ProjectHome.tsx`:
  26 failed, 2 passed (the two pins).
- `red/review-fixes.txt`: the same files against the slice as first built,
  before the review fixes: 12 failed, 16 passed.
- `green/vitest.txt`: 41 files, every one that imports, mocks or names the four
  changed modules. That includes the four older `dispatchReadiness*.test.tsx`
  files, every `projectHome*` and `submissionCenter*` file,
  `tests/ui/pj-title-authority`, `tests/ui/surface-registry-coverage`,
  `tests/ui/one-shell` and `tests/schema-contract/c2c-section-timestamps.contract`.

Gates:
- ESLint warnings are not above HEAD (counted with
  `git show HEAD:<f> | npx eslint --stdin --stdin-filename <f>`): ProjectHome
  9/9, SubmissionCenter 5/5, DispatchReadiness 2/2. The new module and the four
  new tests have 0.
- `ci:undefined-css-classes`, `ci:launch-scope`, `ci:fixture-fallback` and
  `check:microcopy` are OK.
- A scoped `tsc` (a scratch config extending `tsconfig.json`, listing the eight
  slice files) finds no error in them. Its four errors are outside the slice:
  CSS-module and `import.meta.env` types the global d.ts normally supplies.
- The surface text ramp was not run because no CSS changed.

## Not done

- **Sequences in the submissions list.** The design says the panel lists the
  project's sequences. The rows `listSubmissions` returns
  (`server/services/submission-service/submission-service.ts:276`) carry no
  sequence count and no latest sequence. So each row shows only fields the row
  has. Showing sequences means one read per submission
  (`/api/submissions/:id/sequences`) or a server field. Neither was added.
- **One verdict per project.** The readiness panel gates the sequence the
  readiness screen gates: the latest sequence of the project's submission of
  its own application type. A project with a second submission (say an EU MAA
  beside the IND) shows one verdict, and now names the MAA only when there is no
  IND. A CER project has no gate in practice: the Submission Center's create
  form offers no CER application type (`SC_APPTYPES`). The panel says "No CER
  submission for this project yet" and names what the project has, rather than
  gating something else.
- **Submission Center and legacy submissions.** The Center's project scope is
  the server's anchor scope. A legacy submission with no project recorded,
  which the readiness gate reads by name, is not in the project's list there and
  is counted among the organization's others. The project page says so; the
  Center does not.
- **AnA cannot widen the Center's scope.** Only the person's "Show all" button
  does. A bus action for it means a change to
  `shared/navigation/surface-actions`, which this slice does not own. AnA's miss
  now says where the button is.
- **The open project stays open.** Nothing clears the shell project in a tab, so
  every visit to the Center after the first project opened is project-scoped
  until the person presses "Show all". That is the shell's channel
  (`shellProject.ts`), not this slice's.
- **My work filtered to the project.** It waits for the integer-project-id
  mapping (`docs/design/PROJECT_FIRST_PLAN_2026-09-26.md`). The line says so.
- **Lane L60.** Rehearsing the IND path's clicks after this change belongs to
  L60. It was not run here. The full pre-push `ci:pushed-typecheck` was not run.
