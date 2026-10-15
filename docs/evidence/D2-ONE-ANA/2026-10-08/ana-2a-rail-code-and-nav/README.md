# Slices 9 (second half) and 22 — the rail's code goes; the navigation lists the places

Launch row **D2**, 2026-10-08. `docs/design/ONE_ANA_ONE_CANVAS.md` slice 9 (delete the unmounted rail) and slice 22 (§5 Navigation). Two commits' worth of work, shown here together. A review round followed the first pass; its fixes are part of the same two parts below.

## What was wrong

**The rail's code.** Since `9ff77226c` `V2App` mounts no `AnaRail` (`../ana-9-rail-goes/README.md`). The component was still in `Shell.tsx` (HEAD `Shell.tsx:566-1549`: `AnaRail`, `RailSignoffs`, `projectLabel`, `openThisConversation`), with its stylesheet (`app-v2.css`, the `.ana` column, seam, scrim, the ≤900px drawer and about 80 `.ana-*` rules), a third grid column of width 0, and 14 test files that rendered it. An unmounted component that a later session can re-mount in one line is how five editor generations came back (CLAUDE.md, working agreement).

Two things only the rail drew were on no screen: the steers AnA accepted mid-run (`interjections`) and the CRL/RTF pre-mortem panel (`crlPremortem`). `useAnaChat` captures both; `ConversationThread.tsx` `toTurn` dropped both. Deleting the rail deletes the last code that drew them.

**The navigation.** The rail listed Client categories, Workspace, "Science & intelligence" (CMC, risk-based monitoring, FDA CRL library), "Explore" (AnA Command, AnA memory, Apps catalog, Artifacts Center, Conversation, three with an "AnA" badge) and Quick access. Quality, a launch app, had no entry: it was in `NAV_HIDDEN`. Four of the five primary client types opened a screen outside this release (device workstream, diagnostics, IND checklist, CRO portfolio), so choosing one showed "Not in this release".

Found in review of the first pass:

- The account menu, which now holds the client type and the Apps catalog, was clipped by the rail. The rail is collapsed (56px) by default and had `overflow:hidden`; in Chromium the 248px menu showed a 48px sliver, and a click at the centre of every one of its 15 items landed on the scrim, which closed it (`red/account-menu-collapsed-browser.txt`).
- The account button said it opened a menu (`aria-haspopup`, `aria-expanded`), but the menu had no keyboard handling: no focus on open, no arrows, no Escape.
- "My work" opened the task board on everyone's tasks (`TaskBoard.tsx:345`, `mine` starts false).
- With "Conversation" gone from the nav and Recents not built, the conversation in progress had no nav entry. "New conversation" opens Home, which starts a new one.
- Choosing the client type already chosen still moved the person off their screen.
- The demo-under-lock rule was pinned by a regex over `V2App.tsx` source, not by behaviour.
- The golden-journey e2e clicks the rail's "Artifacts Center" button, which this change removes (Not done, 1).

## What changed

**Part 1 — the rail's code is deleted.** The replacement is `client/src/concept2cure/v2/surfaces/ConversationThread.tsx`, on the shell's one chat.

- `Shell.tsx` keeps `Rail`, `TopBar` and `CmdK` (917 lines, was 1,870). `AnaRail` and the helpers only it used are gone, with their imports.
- `V2App.tsx` no longer exports `adaptChatMessage` (the rail's adapter) or imports `AnaMessage`. The `anaOpen` preference is gone. The conversation maps a turn itself (`toTurn`).
- `V2App.tsx:853`: the Live Drive bridge gives the conversation no demo starter while Live Drive is locked for the workspace. The rail applied that rule; a "Start demonstration" chip in the conversation now stays a record under a lock. `shellWiring.test.tsx` mounts the real shell under a lock and checks the chip, and checks that without a lock the same chip starts the demonstration.
- `app-v2.css:1280`: the shell grid is two tracks, nav | page. The `--ana` and `--ana-seam` tokens, the ≤900px drawer, the scrim and every rail-only `.ana-*` rule are gone. Each deleted class was searched across `client/src`; classes still drawn by a mounted component keep their rules.
- `app-v2.css:1772-1777`: the `.ana-steers`, `.ana-steer*` and `.ana-premortem` rules stay, for the conversation. `conversationRailTwins.test.tsx` now has five real cases for the accepted steers and the pre-mortem in place of two `it.todo`. Three of them fail until `ConversationThread.tsx` draws both (Not done, 1, request C). That is deliberate: CLAUDE.md requires a deleted capability's replacement to be reachable, and the red test is how this change says it is not yet.
- `tests/ui/ana-rail-phone-drawer.test.ts` pins the conversation at phone width (760px and narrower): its column and side dock stack, the dock spans the screen, the thread scrolls above a composer that never shrinks, the gutters narrow.
- `tests/ui/one-shell.test.ts`: `Shell.tsx` never called `useAnaChat`, so the allow-list is unchanged.

**Part 2 — the navigation lists the places.**

- `registryModel.ts:141` `RAIL_CORE` is the whole list: New conversation (opens Home), Projects, Vault, Submission Center, Quality, Reporting & analytics, My work, Conversation. Every destination is a launch surface. `RAIL_SPECIALIST`, `RAIL_EXPLORE` and `RAIL_QUICK` are deleted. The header (`registryModel.ts:12`) says the navigation is decided in the design record, not generated from the kit, and where each removed entry went; `registryModel.ts:124` says where the list still differs from §5, and why.
- `registryModel.ts:149`: "Conversation", last, opens the conversation in progress. It stands in for Recents (§5 item 10) until slice 3's client half is built.
- `registryModel.ts:148`, `Shell.tsx:139`: My work opens the task board on the signed-in person's own tasks. The entry asks the board for `tasking.filter {mine: 'true'}` through the same validated screen-action bus AnA's moves use (`surfaceActions.applySurfaceAction`); the board performs it once its read lands. The address is `/tasks`, as from anywhere else.
- `quality` left `NAV_HIDDEN`.
- `Shell.tsx:90` the rail renders one list, no sections, no badges.
- `Shell.tsx:297` the account menu holds the Apps catalog and the client type ("Client type", a group of `menuitemradio` items, the chosen one checked with a check mark as well as `aria-checked`). It follows the WAI-ARIA menu pattern (`Shell.tsx:363`): focus moves to the first item on open; ArrowUp, ArrowDown, Home and End move between items, which are one Tab stop; Escape closes it and returns focus to the button; Tab closes it. The button carries `aria-controls`.
- `app-v2.css:1320,1333`: the rail no longer clips; the list scrolls and clips inside `.rail-scroll`. The menu is usable from the collapsed rail.
- `Shell.tsx:416,489`: choosing the client type already chosen, in the account menu or the top bar, only closes the menu.
- `registryModel.ts` SEGMENTS: medtech, diagnostics, biopharma and CRO default to Projects. Health and academic keep Protocol development, medical writing keeps the editor; all are launch surfaces.
- `V2App.tsx:878`: one handler for choosing a client type, from the account menu or the top bar. It lands on that type's default screen.
- `app-v2.css`: rules for things the rail no longer draws are deleted (`.rail-section`, `.nav-badge`, `.nav-count`, `.nav-dot`, `.nav-item[data-focus]`, `.nav-item[aria-pressed]`, `.nav-lic[data-lic="on"]`). No className in `client/src` uses them.

## Shown

Red runs used a scratch copy of `client/`, `shared/` and `tests/`; the shared working tree was not changed for them.

| Test | Before (`red/`) | After (`green/`) |
|---|---|---|
| `tests/ui/ana-rail-phone-drawer.test.ts`: no `AnaRail` defined or imported; the grid is nav \| page; the conversation at phone width | `no-rail-code.txt` (sources at HEAD): 2 failed, 4 passed | `no-rail-code.txt`: 6 passed |
| `shellNav.test.tsx` and `registryModel.test.ts`: the places in order; every entry and every client type's default a launch surface; Quality; no badge or retired section; Conversation; My work narrows to the person's tasks; ⌘K reaches Artifacts center by the e2e's accessible names; Apps and the client type in the account menu; the menu's keyboard contract; the rail does not clip the menu | `nav-lists-the-places.txt` (sources at HEAD): 22 failed, 28 passed | `nav-lists-the-places.txt`: 50 passed |
| `shellWiring.test.tsx` (new): the real shell under a Live Drive lock gives no demo starter, and without one the chip starts the demo; choosing a client type lands on its default screen; choosing the chosen one stays put | `shell-wiring.txt` (sources at HEAD): 3 failed, 1 passed | `shell-wiring.txt`: 4 passed |
| Each review fix undone on its own (chooseSegment back to Home; My work without its action; no Conversation entry; no menu keyboard handling; the chosen type re-chosen; `.rail` clipping again) | `review-fixes-mutations.txt`: every block fails, on the cases named | the same files above, green |
| The account menu from the collapsed rail, in Chromium (Playwright 1.56.1, 1280×800, the real stylesheets in V2App's order, the Rail's own markup): is each item hit at its centre | `account-menu-collapsed-browser.txt` / `.png` (`.rail{overflow:hidden}`): 0 of 15 | `account-menu-collapsed-browser.txt` / `.png`: 15 of 15 |
| `conversationRailTwins.test.tsx` › the accepted steers and the pre-mortem | `premortem-and-steers.txt` (the working tree): 3 failed, 30 passed | `premortem-and-steers.txt` (scratch tree with requests A–D applied): 33 passed |
| Every test file that imports, mocks or reads `Shell.tsx`, `V2App.tsx`, `registryModel.ts`, `app-v2.css` or the ramp, plus the conversation suites in the table below (53 files) | — | `related-suites.txt` (working tree): 573 passed, 7 failed. Six are closed by requests A, B and C. The seventh, in `documentCanvasPolish`, read another slice's dialog mid-edit and passed 14/14 run alone |
| The same 53, plus every test that imports `ConversationThread` (62 files; `surfaceReachability` runs only in a git checkout and passes in the working tree) | — | `related-suites-with-outside-requests.txt` (scratch tree with requests A–D applied): all passed |
| `ci:undefined-css-classes`, `ci:surface-text-ramp`, `ci:canvas-path`, `ci:launch-scope`, `ci:surface-discoverability`, `ci:check-shell-css-collisions` | — | all OK |

### Where every rail test went

(a) a conversation test already covered it; (b) moved onto `ConversationThread` or the mounted shell; (c) it existed only in the rail and is gone by design; **C**: a test here that fails until request C lands. `CRT` is `conversationRailTwins.test.tsx` (new). Every file below is under `client/src/concept2cure/v2/__tests__/` unless named otherwise.

**Deleted files**

| Old file › case | Now |
|---|---|
| `anaRailHistory` › keeps the draft while history loads, then sends it after loading | (b) CRT › "typed while history loads, it is held, then sent after loading"; (a) `conversationThreadShellChat` › "keeps the reply draft while history is loading" |
| `anaRailHistory` › shows a failed load with retry and preserves a draft until recovery | (b) CRT › "typed while history failed, it is held through the retry and sent after recovery"; (a) `conversationThreadShellChat` › "shows the failed history with retry for that same thread…" |
| `anaRailContextHonesty` › Protocol development in the {biopharma, medtech, diagnostics, cro, health} domain claims no section and no blocker (5) | (c) the rail's "Working in" block; the claim is pinned on its data: `registryModel.test` › "no authoring surface reports a section or sends a prompt that presumes one" (all five client types) |
| `anaRailContextHonesty` › no authoring surface reports a section or sends a prompt that presumes one | (b) `registryModel.test`, same name |
| `anaRailContextHonesty` › the focus on an authoring surface does not change with the domain picker | (b) `registryModel.test` › "…does not change with the client type" |
| `anaRailContextHonesty` › Protocol development shows no ticket range and no doubled period | (c) the block; data: `registryModel.test` › "no registered surface puts an internal identifier in module, here or focus" (`C2C-\d`, trailing period) |
| `anaRailContextHonesty` › Vault and Tasks show no route or schema names | (c) the block; data: same case (`/api/`, `/file route`, `@shared`, `unifiedTasks`, snake_case) |
| `anaRailContextHonesty` › no registered surface puts an internal identifier… | (b) `registryModel.test`, same name |
| `anaRailContextHonesty` › Home is named Home, not by its raw id | (b) `registryModel.test`, same name |
| `anaRailContextHonesty` › there is no "Starred Items" entry | (b) `registryModel.test`, same name, over `RAIL_CORE` |
| `anaRailContextHonesty` › Projects, the destination that entry opened, is still on the rail | (b) `registryModel.test` › "…is on the rail"; `shellNav` › "exactly the places, in order" |
| `anaPremortemMount` › renders the panel when the turn produced one | **C** CRT › "mounts the panel for a turn that produced one, each risk bound to its precedent" |
| `anaPremortemMount` › shows the ranked risk bound to the precedent that grounds it | **C** the same case; the panel itself: `components/ana/__tests__/crl-premortem-panel.test.tsx` |
| `anaPremortemMount` › offers no export the rail cannot perform | **C** CRT › "offers no export the conversation cannot perform" |
| `anaPremortemMount` › adds no pre-mortem furniture to a turn that produced none | (b) CRT, same name |
| `anaRailAttach` › sends actual {csv, xlsx, json, xml} bytes and project scope… (4) | (b) CRT › "sends the actual %s bytes, scoped to the open project" (4); the picker's accept list: request D |
| `anaRailAttach` › POSTs the real File to /api/chat/upload, not just its name | (b) CRT, same name |
| `anaRailAttach` › names the uploaded file in the message once it is ready | (b) CRT › "names the uploaded file in the turn once it is ready, and sends it by id" |
| `anaRailAttach` › does NOT claim an attachment when the upload failed | (b) CRT, same name |
| `anaRailAttach` › refuses to send at all when only a failed upload is present | (b) CRT, same name |
| `anaRailAttach` › does not send while an upload is still in flight | (b) CRT, same name |
| `anaRailAttach` › shows the extraction result once read | (b) CRT › "the chip says how the file was read once it was" |
| `anaRailAttach` › shows the failure reason rather than a bare filename | (b) CRT › "the chip gives the failure reason rather than a bare filename" |
| `anaRailAttach` › rejects an unsupported type without a network call | (b) CRT, same name |
| `anaRailWorkDock` › shows the panel with the live turn by default | (b) CRT, same name |
| `anaRailWorkDock` › renders a turn as every host does: her work, then the answer, then the output | (b) CRT › "…her work, then the answer"; the output is the document on the canvas: (a) `conversationThreadCanvas` › "mounts DocumentCanvas beneath a turn whose draft carries authoringDocId…" |
| `anaRailWorkDock` › renders no panel and no chip when the rail has no chat instance | (c) the conversation always has the shell's chat |
| `anaRailWorkDock` › has one control for the panel — the header chip — and remembers the choice | (b) CRT › "the header chip opens and closes the panel, names it, and remembers the choice" |
| `anaRailWorkDock` › counts her declared plan on the chip, and only that | (b) CRT, same name |
| `anaRailWorkDock` › styles the open chip by aria-expanded… never aria-pressed | (b) CRT, same name |
| `anaRailActions` › renders the real executed actions ANA reports | (b) CRT › "an executed action is shown as a record — not a button, not a sample" |
| `anaRailActions` › renders the REAL Part 11 sign-off prompt for a governed action ANA proposed | (a) `conversationThreadSignoff` › "draws the signature prompt for a turn the server blocked pending sign-off" |
| `anaRailActions` › a non-signature governed command shows the reason-for-change sign-off | (b) CRT, same name |
| `anaRailActions` › renders a navigation target AnA resolved as a button that navigates | (a) `anaActionChips` › "a navigate chip in a thread turn is a button that navigates" |
| `anaRailActions` › does not offer a navigation chip that cannot say where it goes | (b) CRT › "a navigation chip that cannot say where it goes is a record, not a control" |
| `anaRailActions` › leaves every non-navigation executed action inert | (b) CRT › "an executed action is shown as a record…"; (a) `anaActionChips` › "renders a governed/executed action as an inert span…" |
| `anaRailActions` › invokes the rail's own startDemo with the script id and title | (a) `anaActionChips` › "a start_demo chip in an ordinary thread turn is a button that starts the demo"; (b) `shellWiring` › "not locked: the same offer is a button that starts the demonstration" |
| `anaRailActions` › is inert when Live Drive is locked for the workspace | (b) `shellWiring` › "locked for the workspace: the conversation shows the offer as a record, not a button" (mounted shell, red → green) |
| `anaRailActions` › is inert when the rail has no demo starter at all | (b) CRT › "a 'Start demonstration' chip is inert when the shell gives no demo starter" |
| `anaRailActions` › a chip that cannot name its script is never a button | (b) CRT, same rule |
| `anaRailActions` › reads Agent when AnA drives, and Ask switches her hands off | (a) `liveDriveDefaults` › "LiveDriveSwitch › is a switch whose checked state is the shell's…" (the conversation's "AnA drives" switch) |
| `anaRailActions` › Agent switches Live Drive on from Ask | (a) same; `runPolicySwitch` › "'AnA drives' still switches Live Drive, and does not touch the policy" |
| `anaRailActions` › a locked workspace reads Ask… and Agent says why instead of switching | (a) `liveDriveDefaults` › "under an entitlement lock shows the honest reason and no switch" |
| `anaRailActions` › never rewrites what the person typed | (b) CRT › "never rewrites what the person typed, with Live Drive on" |
| `anaRailMarkdown` › renders a bold term, a list and a header as elements, not symbols | (a) `conversationThreadCanvas` › "renders a heading, bold and a list as elements, not symbols; user text stays as typed" |
| `anaRailMarkdown` › never lets model text reach the DOM as script or an event handler | (a) `conversationThreadCanvas` › "a <script> in model text never reaches the DOM" |
| `anaRailMarkdown` › keeps the person's own text plain | (a) the first case above ("user text stays as typed"); CRT › "a user turn is shown as typed…" |
| `anaMessageCarriage` › carries the caveats that qualify the answer | (a) `anaAnswerCaveats` (now on the conversation, fed the hook's messages) |
| `anaMessageCarriage` › carries every part of the work record | (a) `conversationThreadSignoff` › "in flight: the phase line and the tool row are in the thread…"; `anaActivity` › "is fed by one mapping from the turn…" |
| `anaMessageCarriage` › carries why the turn stopped, and how many rounds it ran | (b) CRT › "a turn the round limit cut short says so under it, with the rounds it ran" and "a turn she ended herself claims no stop" |
| `anaMessageCarriage` › carries the steers AnA accepted | **C** CRT › "shows each accepted steer as the person's, in order" |
| `anaMessageCarriage` › carries the evidence verdict | (a) `conversationThreadCanvas` › "puts what was checked directly under the answer…" |
| `anaMessageCarriage` › carries the pre-mortem artifact | **C** CRT › "mounts the panel for a turn that produced one…" |
| `anaMessageCarriage` › carries the governed action state | (a) `conversationThreadSignoff` › "draws the signature prompt…"; CRT › "a non-signature governed command…" |
| `anaMessageCarriage` › a user turn stays a user turn and grows no work record | (b) CRT, same name |
| `anaMessageCarriage` › the body falls back to the phase only while nothing else can speak | (a) `conversationThreadSignoff` › "in flight: the phase line… with no dots" |
| `anaMessageCarriage` › never invents a caveat for a clean turn | (a) `anaAnswerCaveats` › "a clean turn gets no caveat furniture at all" |

**Files kept, their rail cases re-pointed**

| Old file › case | Now |
|---|---|
| `anaContinueHosts` › the rail › offers Continue on the latest settled turn only… | (a) same file › the conversation screen › "…and sends it on the same conversation" |
| `anaContinueHosts` › the rail › offers nothing while a turn is in flight | (a) same file › the conversation screen, same name |
| `anaContinueHosts` › the rail › keeps keyboard focus in the transcript… | (a) same file › the conversation screen, same name |
| `anaAnswerCaveats` › all 7 cases | (b) same file, same names, rendered on `ConversationThread` |
| `anaInterruptedHosts` › every `rail` row of its four `describe.each` blocks | (a) the `conversation` rows, which already ran the same cases |
| `anaMessageWarnings` › the rail › shows an AnA message's warnings | (a) same file › the conversation screen › "shows a turn's warnings, as a note, under the answer" |
| `runPolicySwitch` › the rail's menu › named radiogroup / choosing Manual / arrow keys | (b) same file › the conversation's composer foot, same names |
| `runPolicySwitch` › the rail's menu › the pull label still starts with Ask or Agent… | (c) the rail's "Control & engine" pull |
| `runPolicySwitch` › the rail's menu › Ask and Agent still switch Live Drive… | (b) same file › "'AnA drives' still switches Live Drive, and does not touch the policy" |
| `engineChoices` › the rail's Control & engine popup › names the popup it opens… | (b) same file › the conversation's engine pill, same name (its `aria-controls`: request E) |
| `homeEngine` › sends the question to the conversation screen, not the rail | renamed "…not through onAsk"; same assertions |
| `anaRunControl` › offers nothing while no run is in flight | (a) `anaRunControlStrip` › "no strip when nothing is running" |
| `anaRunControl` › offers only Stop while a run is streaming but not yet controllable | (a) `anaRunControlStrip` › "offers only Stop before the run is controllable…" |
| `anaRunControl` › pauses / offers Resume / stops / does not double-send / refuses an empty steer / pause never promises an instant stop / stop does not borrow pause's promise / never claims stopped… | (b) same file, same names, on `ConversationThread` |
| `anaRunControl` › sends a steer into the running turn; clears the box when the server accepts | (a) `oneBoxDuringRun` › "there is exactly one place to type to AnA, and it steers the run" |
| `anaRunControl` › the steer field is separate from the composer draft | (c) slice 4: the composer is the one box that steers (`oneBoxDuringRun`) |
| `anaRunControl` › KEEPS the text and says it was not sent when the server refuses | (b) same file › "…and marks the box invalid"; (a) `oneBoxDuringRun` › "a refused steer keeps its text and says so" |
| `anaRunControl` › thrown handler / handler that reports nothing / clears the refusal on edit | (b) same file, same names |
| `anaRunControl` › shows the accepted steer under the answer it shaped | **C** CRT › "shows each accepted steer as the person's, in order" |
| `anaRunControl` › adds no steer furniture to a turn never steered | (b) CRT › "adds no steer furniture to a turn that was never steered" |
| `railLicenseGating` › shows no locks for the master-admin owner grant (clicked Risk-based monitoring) | same case on Quality, a place |
| `railLicenseGating` › never locks a destination the catalog has no row for (clicked AnA Command) | same case on New conversation, which opens Home |

## Not done

1. **Changes outside this change's files that must land with it.** Each was applied in a scratch copy and the suites above pass with them (`green/related-suites-with-outside-requests.txt`). The exact text is in the commit report.
   - **A** `shellChromeTruth.test.tsx:142-160`: it expects the rail entry "Project management", a pressed "Biotech & Pharma" category, and the `.nav-item[aria-pressed]` rule. The rail lists no category now.
   - **B** `appMentions.test.tsx:146`: it lists `Shell.tsx` as a composer host. It had the rail's composer.
   - **C** `ConversationThread.tsx` and `fixtures/conversation-thread-data.ts`: carry `interjections` and `crlPremortem` through `toTurn` and draw them under the answer (the rail's markup, HEAD `Shell.tsx:1075-1096`). Until it lands, three CRT cases fail and neither thing is on any screen.
   - **G** `tests/e2e/golden-customer-journey.e2e.ts:258-261`: it clicks the rail's "Artifacts Center" button. Open the top bar's search, type "Artifacts", and click the "Artifacts center" result. `shellNav.test.tsx` › "Artifacts center, no longer a rail entry, is reached from ⌘K" runs that path by the same accessible names. The e2e itself was not run here (it needs the full server and database). Without G, Tier 5 browser smoke goes red on the first push.
2. Smaller outside changes: **D** the conversation's file picker has no `accept` list (an unsupported file is still refused before upload); **E** its engine pill has no `aria-controls`; **F** `journey-v2.css:446-460` still styles rail-only classes; **H** `scripts/audit-ui-authority.ts:124` and `config/ui-surface-registry.json` still name the deleted rail arrays and targets (`npm run audit:ui-authority`, not in CI, fails 5 checks), and four comments still name `AnaRail` or `adaptChatMessage`; **I** `authoring-v2.css:1986-2015` holds the conversation's phone layout, and says itself it belongs in `app-v2.css`; moving it is one change across both files. It sets 14px gutters on the thread while the composer keeps 24px, and stacks the progress dock under the composer, where §2.2 asks for 16px gutters and the composer at the bottom; **J** `authoring-v2.css:12-17` still sets a three-track grid on the editor screens (harmless: the zero-width track takes no child).
3. **Where the nav still differs from §5** (`registryModel.ts:124`). The labels are the registered surface names ("Vault", "Submission Center", "Reporting & analytics"), so the nav, breadcrumb, page title and ⌘K agree; §5's "Documents" (with Protocols as a child row), "Submissions" and "Records & reports" (the audit trail as the place, with tabs) rename and regroup surfaces in the surface registry. "Search ⌘K" is the top bar's button, not a nav row. My work has no count.
4. Recents (§5 item 10) is not built; "Conversation" stands in for it and goes in the Recents change.
5. Both "Get help" launchers stay. §5 replaces them with "Help & documentation", but the product has no documentation screen to open, and a launcher with nowhere to go is not offered. `shellChromeTruth.test.tsx` › "Help goes where the account menu's 'Get help' goes" pins the current one.
6. The top bar's client-domain selector stays. The design moves it to Settings › Client type too, but `shellSegmentFollowsProgram.test.tsx` (not owned) pins its label. Both places use one handler.
7. My work's filter rides the screen-action bus, whose stash lasts 20 seconds (`surfaceActions.ts` `PENDING_ACTION_TTL_MS`). If the board's read takes longer, the board opens unfiltered. A refused read is shown as the board's error, not as an empty "My work".
8. `getAnaContext` (`registryModel.ts`) has no production reader since the rail's "Working in" block went. Its honesty cases stay in `registryModel.test.ts` for the design's "Working in <project>" chip.
9. `surface-text-ramp.css` is generated from every stylesheet in the tree, including other slices' uncommitted rules. Regenerate it when the commits are cut.

**Real browser.** Only the account-menu check above: the Rail's own markup with the real stylesheets in Chromium. No capture of the running app was made.

## Addendum — what landed with it (coordinator, 2026-10-08)

Outside-file requests A, B, C, D, E, F, G, H and J were applied as written and land in the same commit.
C draws the accepted steers and the CRL/RTF pre-mortem on the conversation, so the three
`conversationRailTwins.test.tsx` cases that were red because of it are green, and no capability leaves
with the rail. I (moving the conversation's phone block into app-v2.css with 16px gutters) is not applied:
it is a layout decision for the filing-spine design.

Coordinator's run before commit: 27 test files, 333/333 — this slice's 15 files, shellChromeTruth,
appMentions, composerAttachWorks, conversationThreadShellChat, conversationThreadCanvas,
conversationThreadSignoff, shellAskGuard, railPiecesRehomed, liveDriveShell, oneBoxDuringRun,
canvasDocumentsList, shellSegmentFollowsProgram. `npm run audit:ui-authority`: passed.
