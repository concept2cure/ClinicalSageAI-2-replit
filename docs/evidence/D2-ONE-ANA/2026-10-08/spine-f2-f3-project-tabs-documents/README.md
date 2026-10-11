# Spine F2 and F3 — five tabs, the start box above them; Author holds the documents, Evidence holds intake

Launch row **D2** (one AnA). Design: `docs/design/FILING_SPINE.md` §1, §2, §6 rows 3–6 and 11, §7.2 F2 and F3.
The founder's direction of 2026-10-08: the apps are features inside the work of building a filing; the project is the filing.

Paths below are short for `client/src/concept2cure/v2/…` unless they start elsewhere. Line numbers are from the working tree after the change.

## What was wrong

**F2.**
- The project page had seven tabs. Plan and Lifecycle held nothing this release can open. Each showed "Not in this release" with no button.
- Plan's `SchedulePanel` fetched only numeric ids (`SCHED_IDENT_RE`). Every writer of `window.C2C_PROJECT` publishes a `regulatory_programs` UUID (`surfaces/Projects.tsx:1126`, `mdx/MdxSurfaceHost.tsx:235`) or a number (`surfaces/TaskBoard.tsx:1110`, which the page drops). So, by reading, the panel never loaded a schedule; it only ever said "Schedule isn't wired to this workspace yet". Its "Ask AnA to generate one" asked a model for dated milestones (Rule 2).
- The start box and the Conversations list sat inside Author. Leaving Author unmounted a half-typed message. The set-stage handler said so in a comment and the registry told AnA not to switch away.

**F3.**
- "Every capability, scoped to this project" (the Workspace grid) launched organisation-level apps from inside the project.
- "Recent drafts" listed governed sections filtered on `status != 'todo'` (`server/routes/c2c/projects.ts` `/drafts`), a status editor work never moves. A row opened the editor without the draft.
- A Module completion row opened the editor's list, not the module.
- The data room sat under Author. Its "Write from these sources" opened the editor with no document and no sources.
- The Evidence blurb promised "Vault, RAG search & claim↔evidence linking".

## What changed

**F2.**
- `fixtures/project-home-data.tsx:291-320`: `PJ_LIFECYCLE` is exactly Evidence, Author, Review, Submit, Respond. Submit carries `aliases: ['plan', 'lifecycle']` and a `later` line naming what Plan and Lifecycle promised. Respond carries its own `later` line. `PJ_STAGE_TOOLS` keeps only Respond's "Response authoring"; the locked tools are named on the coming-later lines instead of as cards. The new fields live on the already-allowlisted catalog, so `ci:launch-scope` needs no new fixture import.
- `surfaces/ProjectHome.tsx:530` `ComingLater`: one line of words, no button. `StagePanel` (`:542`) no longer renders "Not in this release".
- `SchedulePanel` and its types are deleted. The design decided it goes with Plan (§2 "Plan and Lifecycle", §5). No replacement: market choice moves to Submit (Add a market and the Planner, F9/F21). The server routes and the AnA tool stay.
- `:1120` `ProjectConversations` is the Conversations list, moved out of `AuthorWorkspace`. `:1794` renders the start box and the list in `.pj-start`, above the tracker and outside the stage switch.
- `:1695` `project-home.set-stage` resolves a stage by id or alias. 'plan' and 'lifecycle' open Submit and the answer says so.
- `shared/navigation/surface-actions.ts:486-495`: the enum keeps 'plan' and 'lifecycle' as aliases. The description drops the unmount warning.

**F3.**
- `:1219-1305`: `ProjectDocuments` reads `GET /api/authoring/docs?programId=<uuid>` (every source, not only AnA's) through `useDocumentList`, and renders rows with `rowsOf`, `StatusPill` and `updatedWords` from `editor/CanvasDocumentList.tsx` and the canvas list's CSS (`cdl-*`). The row and body components themselves are a second copy of that file's private `DocumentRow` and `ListBody`, without the per-row download and the return focus (see Not done). A row's Open sets `setEditorTarget({ docType: null, docId, programId, programTitle })` and opens `document-authoring` (`:1544`). States: reading; a failed read is `ErrorState` with "Try again"; a failed refresh keeps the earlier list and says so; empty is said in words.
- `:1318` `ModuleRow`: a module row opens the project's newest document in that CTD module (`M2`, `m2` and `2` are Module 2), by id. The rollup counts governed sections (`c2c_document_sections`) and the document is an authoring document, two stores. So the button's name says the figure is the module's sections ("M2 sections (12 sections): 40% complete. Open …"), and the document it opens is written under the row in words ("Opens Clinical overview (2.5)"), with "the newest of N Module 2 documents" when the module holds more than one. A module with no document of this project, or a list that could not be read, is a row with nothing to click.
- The Workspace grid and the "Recent drafts" card are deleted, and so is the `/drafts` read. What AnA is told lists the project's documents instead of the drafts.
- Author's Documents header has two doors: "Open in Authoring" (drops any pending editor target first) and "Protocols (organisation-wide)".
- `:1786`: Evidence renders the project's files, then `DataRoom`. Author no longer has it.
- `:755-770`, `:982-1000`: "Write from these sources" is the pin-and-ask handoff. It sets `window.C2C_SOURCE_PINS` and asks in the one conversation. It hands over at most `HANDOFF_LIMIT` (10, `:577`) readable sources, the newest, because the stream inlines every pinned file into one turn and limits only each file's size (`server/routes/ana-ri/stream.ts:1460-1560`). When the list is cut, by that limit or by the server's 200-row window, the title and the message say "the N newest readable sources", not the data room's whole set. It is shown only when nothing is pinned and something is readable; with pins, "Draft with N pinned" hands over the pinned set through the same function.
- `:454-475`: Submit's Submissions header gains "Compile and download" (`ectd-compile`). It is shown only for a project that is read and is not a device or diagnostic filing (`ectdFiling`, `:1575-1576`: the program's `product_type` is not in the device family and the selection is not from the MDX workspace). The compiler builds an FDA/EMA eCTD backbone, which is not how a 510(k), De Novo or PMA is filed, and the old grid offered it to biopharma projects only. No eSTAR path is in the launch scope to offer device projects instead. "Open readiness" (`dispatch-readiness`) was already on Submit (slice 24).
- `fixtures/project-home-data.tsx:311`: Submit carries a `laterDevice` line for device and diagnostic projects. It names registrations, market access, post-market vigilance, regulatory intelligence, precedent and agency meetings, and not IND annual reports or the variation classifier.
- `fixtures/project-home-data.tsx:298`: the Evidence blurb reads "Project files and the data room the documents are written from".
- `styles/project-home-v2.css:423-443`: `.pj-start`, `.pj-later`, `.pj-stagebody`, `.pj-sec-acts`, `.pj-lmodrow`, `.pj-lmod-doc`, and a hover override for a module row with nothing to open. None sets a background, so the generated text ramp did not change. The wrapper was first named `.pj-stage`, which `journey-v2.css:70` already defines for the Program journey's stage cells; both are global under `.c2c-v2` with the same specificity, so their properties merged both ways. It is `.pj-stagebody` now, and `__tests__/projectHomeStageCss.test.tsx` fails if any class this block defines is defined by another v2 stylesheet.

**Where each grid item went.** The grid listed its segment's modules (`getSegmentModules(seg)`, `seg` from the selection's workspace, MDX → medtech). Under the launch scope it showed, for a biopharma project: `document-authoring`, `protocol-dev` (Author's Documents header), `ectd-compile` (Submit, "Compile and download", for a project that is not a device filing; `registryModel.ts:86` keeps it biopharma-only), `dispatch-readiness` (Submit, "Open readiness"), `submission-center` (Submit, "Open Submission Center"), `vault` (Evidence, "Open in Vault"; rail), `tasks` (Author, "Open My work"; rail), `insights` and `quality` (rail), `review` (⌘K and the Apps catalog; F7 adds "Open the review board" on Review), `artifacts-center` (Author's Documents list in the project; ⌘K and Live Drive until ONE_ANA slice 25), `gateway-transmittals` (⌘K and Apps catalog; F13 puts transmissions on the sequence), `audit-trail`, `part11-console`, `identity-console` (record views, admin and ⌘K), `projects` ("All projects"; rail).

## Shown

| Test | Before (red) | After (green) |
|---|---|---|
| `__tests__/projectHomeStages.test.tsx`: the tabs are exactly Evidence, Author, Review, Submit, Respond | fails at HEAD (seven tabs, Plan first) | passes |
| same: no tab says "Not in this release" | fails at HEAD ("Plan says …") | passes |
| same: Plan and Lifecycle's promises are a coming-later line on Submit, with no button | fails at HEAD | passes |
| same: set-stage "plan" opens Submit, and says so | fails at HEAD (opens Plan) | passes |
| same: set-stage "lifecycle" opens Submit | fails at HEAD (opens Lifecycle) | passes |
| same: a message typed in the start box survives switching tabs | fails at HEAD (the box is gone after leaving Author) | passes |
| same: the start box and the conversations come before the tabs and stay on every tab | fails at HEAD | passes |
| `__tests__/projectHomeDocuments.test.tsx`: lists the project's documents from the program-scoped read, status in words | fails on F2 | passes |
| same: a row opens THAT document, by id, in this program | fails on F2 | passes |
| same: a failed read is an error with a retry, never an empty list; the retry reads again | fails on F2 | passes |
| same: an empty project says so in words | fails on F2 | passes |
| same: "Recent drafts" and the grid are gone, and nothing reads `/drafts` | fails on F2 (the grid's sub-heading) | passes |
| same: a module row opens the newest document in its module; a module with none is not a button | fails on F2 ("the row named no document") | passes |
| same: "Open in Authoring" drops an older target; "Protocols (organisation-wide)" | fails on F2 | passes |
| same: Evidence has the data room and Author does not | fails on F2 ("the data room under Author") | passes |
| same: "Write from these sources" hands the readable sources to AnA and never opens the editor | fails on F2 (called `document-authoring`) | passes |
| same: the Evidence blurb says what the tab holds | fails on F2 | passes |
| same: "Compile and download" opens `ectd-compile`; "Open readiness" opens `dispatch-readiness` | fails on F2 | passes |
| same (review fix): a module row's name says the figure is the module's sections, and the document it opens is written under it, with how many the module holds | fails before the fix (`'M2 · 1 section, 0% — open Clinical ov…'`) | passes |
| same (review fix): "Write from these sources" hands over the 10 newest readable sources and says "newest" | fails before the fix (`'Ask AnA to draft from the 12 readable…'`) | passes |
| same (review fix): a list cut by the server window says "newest", even under the limit | fails before the fix (`'Use the 2 readable sources in this pr…'`) | passes |
| same (review fix): a device project is not offered the eCTD compiler, and its coming-later line names no IND work | fails before the fix ("an eCTD compile door on a 510(k)") | passes |
| same (review fix): a drug project still names IND annual-report tracking as coming later | passes before and after (the guard against over-correcting) | passes |
| `__tests__/projectHomeStageCss.test.tsx` (review fix): no class the filing-spine block of `project-home-v2.css` defines is defined by another v2 stylesheet | fails before the fix (`'.pj-stage (also journey-v2.css)'`) | passes |

Files:
- `red/projectHomeStages.txt`: HEAD `b0b1694aa` sources, 7 of 7 fail.
- `red/projectHomeDocuments.txt`: the F2 state (F2's four source files, saved aside), 11 of 11 fail.
- `green/projectHomeStages-f2-only.txt`: the F2 state alone, 7 of 7 pass.
- `red/review-fixes.txt`: the three source files as they were before the review fixes, with the final tests. 6 of 18 fail, each on its finding.
- `green/projectHomeStages.txt`, `green/projectHomeDocuments.txt`, `green/projectHomeStageCss.txt`: the final state, 7, 16 and 2 pass.
- `green/project-home-suite.txt`: every test that imports or mocks `ProjectHome`, `project-home-data` or `surface-actions` (the AnA drive, drive-queue, registry and surface-action tests among them), plus the canvas list and static UI tests. 44 files, 391 tests pass.
- `green/ci-gates.txt`: `ci:undefined-css-classes`, `ci:launch-scope`, `ci:surface-discoverability`, `ci:canvas-path`, `ci:surface-text-ramp` (after regenerating; the ramp sheets did not change), `ci:check-css-selector-shadowing` and `ci:check-shell-css-collisions` all OK. ESLint warnings: `ProjectHome.tsx` 9 → 7, `project-home-data.tsx` 0 → 0, `surface-actions.ts` 1 → 1.
- `filing-path-reachability-author-row.txt`: the F0 gate (`tests/ui/filing-path-reachability.test.ts`, another lane's) found "Author document row → that document" green through `openDocument` and asked for its baseline entry to be removed. Its owner has done that (`BASELINE_CEILING` 5). `green/filing-path-reachability.txt`: 10 of 10 pass.

Tests re-pointed, not deleted: `projectHomeStageTracker` (five stages), `projectHomeLaunchScope` (Respond and Submit name what comes later; the source tracer is checked where the data room now is; a module chip opens its module's document by id), `projectHomeDataRoom`, `projectDocumentDisposition` and `conversationFilesAdopt` (open Evidence first). `projectHomeSchedule.test.tsx` is deleted with the panel it tested.

## Not done

- The project's documents list is a second copy of the canvas list's private `DocumentRow` and `ListBody` (`editor/CanvasDocumentList.tsx:240-330`), without the per-row "Download working copy" and the return focus to Open. That file is not this slice's. The fix: export a scope-agnostic row and body from it (empty sentence, download and focus as options), render them from `ProjectDocuments`, and delete `ProjectDocumentRow` and `ProjectDocumentsBody`.
- "Write from these sources" is capped on the client. `stream.ts` still has no limit on the number of `source_ids` or on their total size; a server limit belongs there.
- A device project has no compile door on its project page. No eSTAR path is in the launch scope to put there.
- The F2-only snapshot (for the F2 commit) still shows Submit's drug coming-later line to device projects; the F3 commit adds the device line.
- A module row opens a document by its `module` field. A governed document that spans modules (one authoring document bound to the whole outline) opens at the document, not at the module's first section. The editor target cannot name a document and a section together today (`editor/DocumentWorkbench.tsx` resolves `docId` before any section).
- The editor resolves a `docId` target among the documents its list holds. The list's status filter defaults to all (`editor/DocumentWorkbench.tsx:663`), so only a filter the person changed turns the open into a stated miss. The open was not run in a browser.
- `GET /api/c2c/projects/:id/drafts` has no client caller now. The server route and `tests/schema-contract/c2c-section-timestamps.contract.test.ts` still describe it.
- `scripts/ci/launch-scope-fixture-allowlist.json` still allows `project-home-data.fileTone`, which `ProjectHome.tsx` no longer imports.
- The AnA tool `generate_schedule_of_events` and the schedule-of-events routes remain. They have no screen in v2 now.
- Respond's "Response authoring" still opens the editor with no letter. F15 owns that.
- Not checked in a real browser: the layout of the start box and the list above the tabs.
