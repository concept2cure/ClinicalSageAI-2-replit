# spine F0, F6, F8 — the filing path gate; "Find a report"; the open project in the top bar

Launch row **D2**. Design: `docs/design/FILING_SPINE.md` §1, §4 (Navigation), §6
rows 9 and 10, and slices F0, F6 and F8 in §7.2. Founder's direction
(2026-10-08): the apps are features inside the work of building a publishable
filing; there is one AnA; the UI must make sense against that.

Line numbers are from HEAD `b0b1694aa` unless they name the new code. This
README is the state after review (2026-10-08): the gate's reader resolves names
lexically, the baseline holds five hops after F3, and Reporting's result says
how a run ended.

## What was wrong

- **F0.** Nothing checked that the filing path can be walked. Six hops had no
  in-product control, and nothing failed: the screens still rendered.
  - Review tab → document: the project's Review stage is an empty state whose one
    button opens the scrapped `task-board` alias (`ProjectHome.tsx:1899`).
  - Unstarted outline node → started section: the click only toasts "no draft yet
    in this document" (`DocumentWorkbench.tsx:3430`).
  - Market row → its sequence: no market row names a sequence, "Open in
    Submission Center" carries nothing (`AuthoringPlaceIntoFiling.tsx:387`), and
    `SubmissionCenter.tsx` reads no nav params.
  - Dispatched sequence → Transmit: no client calls
    `POST /api/submissions/sequences/:seqId/transmit` (`server/routes/submissions.ts:1762`).
  - Respond → response sequence: the Respond stage is the tool list only
    (`ProjectHome.tsx:1925`).
  - Author document row → that document: rows open the editor with no document
    (`ProjectHome.tsx:1552`, `:1421`).
- **F6.** Reporting's left pane was built as a chat: an arrow "Send" composer
  (`Insights.tsx:1351`), the person's words echoed in a right-aligned bubble
  (`:1308`), the answer in a bubble beside AnA's mark, the blue asterisk
  (`:1310-1312`), three pulsing dots while it "typed" (`:1330`), and the mark
  again on the header, the opener and the empty canvas (`:1281`, `:1296`,
  `:1368`). What answered was `roRouteReply` (`:492`), a fixed router. The name
  "AnA" had already been removed (`insightsNotAna.test.tsx`); the shape of a
  conversation had not. There is one AnA, and she is the conversation.
- **F8.** No screen named the open project. The top bar's control was "Switch
  client domain" (`Shell.tsx:518-545`), a second place to set the client type,
  which the account menu's Client type already sets (`Shell.tsx:404`, wave 2A).

## What changed

- **F0** — `tests/ui/filing-path-reachability.test.ts` (new) and
  `tests/ui/filing-path-reachability.baseline.json` (new).
  - Each hop starts at located code: a project stage's JSX (the right side of
    `stage === '<id>' && …` in `ProjectHome.tsx`), the editor outline row's
    `onClick` (`.ed-tree-row` in `DocumentWorkbench.tsx`), or the Submission
    Center modules for Transmit.
  - A hop is green when that code reaches its target call: `setEditorTarget`
    with a `docId`; `POST /api/authoring/sections`; nav params to
    `submission-center` with a `sequenceId` or a `followUp`, which
    `SubmissionCenter.tsx` must read with `consumeNavParams('submission-center')`;
    a client call to `/sequences/${id}/transmit`.
  - "Reaches" follows what the code hands control to (calls, rendered
    components, passed handlers) into their definitions, four levels deep, over
    a TypeScript parse with comments blanked. A green hop prints the chain it
    followed, with file and line.
  - Names are resolved lexically from the place they are used (`resolveAt`,
    `:213`): the nearest enclosing function or block that declares the name
    wins, then the module, then its imports (`exportedBinding`, `:250`,
    including `export default` and re-exports). A parameter or destructured prop
    stops the search. A name passed on (`onClick={x}`, `f(x)`) is followed only
    when it is bound to a function or `useCallback` (`isFunctionCode`, `:290`).
    Before review the reader searched the whole file for any definition with the
    name, so a row's local `openDocument` was credited with the page's.
  - The last block of the test (`:564`) runs the reader on in-memory fixtures:
    three shapes that must stay red (a shadowed handler, a name the row never
    binds, data passed as a prop) and two that must be green (the page passes
    its handler; the row's own handler opens the document).
  - The baseline holds the five hops still red, each with its slice and reason.
    `author-row-to-document` left it: F3 (another lane, in the same working
    tree) made the Author rows open their document, through `openDocument`
    (`ProjectHome.tsx`, `const openDocument`, which calls `setEditorTarget` with
    the document id). `BASELINE_CEILING` is 5
    (`:65`).
  - The test fails when a hop outside the baseline is red, when a baselined hop
    is green, when a hop's start cannot be located, and when the baseline is not
    exactly `BASELINE_CEILING` entries. The baseline only falls.
  - `FILING_PATH_SOURCE_ROOT` points the reads at another tree, so the evidence
    below is made on scratch copies, never on the working tree.
- **F6** — `client/src/concept2cure/v2/surfaces/Insights.tsx`.
  - The composer is a field labelled "Find a report" with a "Find" button
    (`:1378`, `:1385`). Enter does what the button does. The words stay in the
    field after a search.
  - The thread is gone. The router's answer is one result section, which the next
    search replaces (`:1343`, state `FoundResult` `:447`, `findReport` `:1179`).
    Its choices and its plan lock sit inside it.
  - The result says how a run ended. It says "Running the … for …" when the run
    starts. On success it becomes "The … for … ran against the governed record
    and is shown in the report canvas" (`:1170`). When the run is refused or
    cannot start (no editor role, a refusal from the engine, a rendered document
    that did not come back), the result's sentence is dropped and the alert says
    why (`runReport`, `:1146`). Before review the page could show "Running the X"
    beside "X wasn't run". A counter (`foundSeq`, `:1109`) keeps a late run from
    overwriting a newer search's result.
  - The result's live region (`role="status"`) is mounted before the first
    search, empty, so the first result is announced; the section is named
    "Result" only while it holds one.
  - A run in flight is a sentence in a status region, "Running the report…"
    (`:1360`). A run that produced no report says why in an alert (`:1361`),
    never as an empty canvas.
  - No AnA mark anywhere on the screen: header, opener ("Where to start" is a
    plain grey eyebrow), result, busy line and empty canvas. The opener's preset
    button lost its sparkles icon.
  - `roRouteReply` (`:492`) is unchanged and is still the router. Its return type
    is renamed `RouteReply`; the guardrail line says "Find a report matches your
    words to a governed report type and runs it" (`:310`).
  - Only existing CSS classes are used (`rc-*`, `ro-*`, `gov-label`, `btn
    primary`); `insights-v2.css` is not touched.
- **F8** — `client/src/concept2cure/v2/Shell.tsx` and `styles/app-v2.css`.
  - `ProjectChip` (`Shell.tsx:453`) replaces the client-domain control. It reads
    `useShellProject()`: the project's code, or its title when it has no code; it
    opens `project-home`. With no project it reads "No project open" and opens
    `projects`; its accessible name adds ". Choose one in Projects" (`:462`,
    `sr-only`), because the title tooltip alone does not reach a screen reader.
    A project known only by id reads "Open project" rather than an invented
    name. It carries `aria-current="page"` on the project page.
  - The client type is chosen only in the account menu. The chip's segment
    state, menu and imports (`PRIMARY_SEGMENTS`, `SEGMENTS`, `getSegment`,
    `segmentForShellProject`) are removed from Shell. `TopBar` keeps `segment`
    and `onSegment` in its props, unread, so `V2App.tsx` is unchanged here.
  - `.tb-proj` rules appended at the end of `app-v2.css` (`:3767`). Hover moves
    the border only, so the chip adds no selector to the text ramp. "No project
    open" is dashed and muted, and says so in words.
  - `__tests__/shellSegmentFollowsProgram.test.tsx` pinned the old control's
    label. It now pins what remains true: the program → segment mapping (pure,
    unchanged); the top bar shows no client type, with or without a program, so
    the F9 defect (a client type beside a program it does not describe) has no
    place to return; the account menu's Client type is the one place it is
    chosen, and opening a program does not change it.

## Shown

| Test | Before (red) | After (green) |
|---|---|---|
| F0 gate, working tree (F3 in it) | `red/f0-head-without-F3.txt`: HEAD `b0b1694aa` snapshot; 1 failed, "Author document row" red and not baselined | `green/f0-working-tree.txt`: 10 of 10 (5 hop checks, 5 reader fixtures) |
| F0 gate, the five baselined hops each given a minimal implementation in a scratch copy of the working tree (`tools/f0-green-patches.mjs`) | `red/f0-hop-green-but-baselined.txt`: refused; each hop green through the code its patch added, with file:line | — |
| F0 gate, each hop patched alone | `red/f0-each-hop-flips-alone.txt`: only that hop turns green, five times | — |
| F0 gate, a baseline entry removed while its hop is red | `red/f0-baseline-entry-removed.txt`: 2 failed (red-not-baselined; ceiling 4 vs 5) | — |
| F0 reader fixtures (shadowing, unbound name, data prop) | `red/f0-reader-name-search.txt`: the pre-review reader spliced into a temporary copy; the 3 "stays red" cases fail because it calls them green (the first through the page's `openDocument`) | `green/f0-working-tree.txt` |
| F0 gate, the reviewer's probe on a scratch copy: Review stage → `<ReviewRow onNav={onNav} />` whose local `openDocument` only calls `onNav` | — (the pre-review reader called it green, per the review) | `green/f0-reviewer-shadow-probe.txt`: 10 of 10, the hop stays red and baselined |
| `insightsNoChatLookalike.test.tsx` | `red/insightsNoChatLookalike.txt`: HEAD, 7 of 7 fail, each on its own cause. `red/insightsNoChatLookalike-before-review.txt`: the pre-review Insights.tsx, 4 fail ("Running the" left after a refusal and a viewer's run; no outcome on success; no live region before the first search) | `green/insightsNoChatLookalike.txt`: 7 of 7 |
| `topBarProject.test.tsx` and re-pointed `shellSegmentFollowsProgram.test.tsx` | `red/topBarProject.txt`: HEAD, 8 failed; the account-menu cases pass at HEAD too, as they should. `red/topBarProject-before-review.txt`: pre-review Shell.tsx, 1 failed (no action in the empty chip's name) | `green/topBarProject.txt`: 11 of 11 |
| Every test that imports, mounts or reads Shell.tsx, V2App, Insights.tsx or app-v2.css, in place | — | `green/related-suites-in-place.txt`: 50 files, 706 pass, 11 fail in 3 files outside this slice, each only on `getByLabelText('Send')` |
| The same 3 with the one-line re-point, on temporary copies | — | `green/insights-send-to-find-repoint.txt`: 3 files, 12 of 12 |
| `ci:undefined-css-classes`, ramp regenerate, `ci:surface-text-ramp` | — | `green/css-gates.txt`: OK; the ramp sheets are unchanged |
| ESLint per changed file vs HEAD | — | `green/eslint-counts.txt`: Shell 6 → 5, Insights 7 → 7, re-pointed test 1 → 0, new files 0 |
| `audit:ui-authority` | — | `green/audit-ui-authority.txt`: 47 of 47 |

The scratch trees are `git archive HEAD client/src` and a copy of the working
tree's `client/src` taken during this run; other lanes kept editing
`ProjectHome.tsx` afterwards, which the working-tree run covers.

## Not done

- **Must land with this slice.** Three Insights tests outside this slice still
  click the old button: `insightsFinalizeSigned.test.tsx:110`,
  `insightsCanvasAccessible.test.tsx:95`, `insightsExportProducesFile.test.tsx:106`.
  Each needs one line, `fireEvent.click(screen.getByLabelText('Send'))` →
  `fireEvent.click(screen.getByRole('button', { name: 'Find' }))`. Without it,
  11 tests fail. The passing run with that change is in
  `green/insights-send-to-find-repoint.txt`.
- **Commit order.** The baseline assumes F3's `ProjectHome.tsx` change. Commit
  F0 in the same commit as F3 or after it; on HEAD alone the gate fails
  (`red/f0-head-without-F3.txt`).
- The reader follows a component as a whole: a component whose body contains a
  matching call counts, even if no button in it runs that call. It does not
  follow handlers passed inside objects (`{ onOpen: open }`) or JSX spreads.
- `TopBar` still accepts `segment` and `onSegment`, unread. Dropping them needs
  `V2App.tsx:1203-1204` and the test call sites (`shellChromeTruth.test.tsx`,
  `shellNav.test.tsx`, and this slice's two) to stop passing them.
- `segmentForShellProject` (`shellProject.ts:152`) has no product caller now;
  only its test reads it. Either a later change uses it (for example, to suggest
  the client type when a program opens) or deletes it.
- Rules no longer rendered, left in place because their sheets are not this
  slice's: `.tb-dom*` (`app-v2.css:644-664`), and in `insights-v2.css` the
  bubble, mark, typing and send rules (`.rc-msg`, `.rc-user`, `.rc-bub`,
  `.rc-ana-bub`, `.rc-ana-msg`, `.rc-ana-body`, `.rc-ana-mark`, `.rc-typing`,
  `.rc-send`, `.rc-op-head`, `.rc-empty-mark`).
  `scripts/visual-qa/check-surface-styling.mjs:163` still probes `.rc-ana-mark`.
- `ci:canvas-path` was not run: no conversation, canvas or editor file changed.
- Not checked in a real browser or with a screen reader.

## Coordinator's note (2026-10-08): F0 landed from another session

While this slice ran, another session landed F0 on trunk (`4536fe4c2`, "The filing path is checked hop by
hop"). One gate, not two: this slice's F0 test, baseline and their red/green runs were set aside and are not
committed; trunk's gate stands. F6 and F8 land from this folder.
