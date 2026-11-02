# D4-2: the artifact bar

**Package:** D4 (`Plan: D4`). **Completes:** `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`,
`client/src/concept2cure/v2/editor/DownloadMenu.tsx`, `client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx`,
`client/src/concept2cure/v2/surfaces/AuthoringCollab.tsx`, `client/src/concept2cure/v2/editor/AuthoringOversightActions.tsx`,
`client/src/concept2cure/v2/styles/authoring-v2.css`.
**Spec:** `.design/claude-convergence/D4.md` §0 item 2, §D4.B in full, §D4.G steps 1–2 (the ✻ menu, which §D4.B's
bar draws), §D4.K "Bar" and "Menus", §D4.L; `BUILD_ORDER.md` §1, D4 row "D4-2".
**Read at:** `d86ef18d1` on `concept2cure-v2`, 2026-11-01 (after `88ac297b0`, the draft-pane test fix). HEAD moved to
`378c7526e` while this was built; no commit in between touched a D4-2 path (`git diff --stat d86ef18d1 378c7526e` over
them is empty), and the red runs are against `378c7526e`.
**Status:** committed after the skeptic review (§"Skeptic review", below), at HEAD `f7b11e77a` (the shell lane's D1-2;
`git diff --stat 03af51926 f7b11e77a` over D4-2's paths is empty). HEAD then moved to `917686e04` through merges of
`origin/concept2cure-v2`; `git diff --stat f7b11e77a 917686e04` over D4-2's paths is empty, and the only stylesheet it
changes is `styles/insights-v2.css`.

---

## What already exists (RULE 3)

**Searches run** (over `client/src/concept2cure`, unless named):
- `grep -rn` for `ed-doc-h`, `ed-crumbs`, `ed-doc-commit`, `ed-doc-actions`, `ed-viewtoggle`, `Save and sign`,
  `rail-open`, `railToggleRefs`, `setRail(`, `AuthoringOversightActions`, `authoring-oversight`, `AuthoringCollab`,
  `<AuthoringCreateExport`, `<DownloadMenu`, `useMenu`, `MenuItem`, `MenuButton`, `openEditorControl`,
  `aria-haspopup="menu"`, `role="menu"`, `StatusPill`, `ToDocumentsButton`, `relTime`, `.dlm`, `.dcv-bar`.
- `git log --all --diff-filter=D --name-only -- '*MenuButton*' '*Menu.tsx' 'client/**/*Overflow*' 'client/**/*Kebab*'`:
  three deleted menus, none a menu button for the editor (`components/concept2cure-projects/ProjectMoreMenu.tsx`
  2026-08-04; `components/editor/extensions/SlashCommandMenu.tsx`, `components/ui/InlineAIMenu.tsx` 2026-06-02;
  `components/chat/AnaSlashCommandMenu.tsx` 2026-05-26).
- `grep -rlE` over `client/src` and `tests` for every test that mounts `DocumentWorkbench`, `DocumentAuthoring`,
  `DocumentCanvas`, `AuthoringCreateExport`, `AuthoringCollab`, `AuthoringOversightActions` or `DownloadMenu`, or that
  names a control this step moves (133 files; the list and both runs are under `red/` and `green/`).

| Piece | Path | What it does today (before D4-2) | What it does not do |
|---|---|---|---|
| The editor's header | `editor/DocumentWorkbench.tsx:4464–4888` (`<header className="ed-doc-h">`) | Three parts. **Crumbs** (`:4465–4499`): `workbench-back` ("Back to conversation", or the host's `backLabel`), the program headline (`.ed-program`), module, title, section code. **"Save and sign" group** (`:4507–4610`, `role="group"`): the reason field (`change-reason`, `change-reason-note`, shown while dirty), Save (`save-section`, an orange `btn primary` that reads "Saved" while disabled), `AuthoringFilingBar` (Freeze, E-sign), `AuthoringPlaceIntoFiling`. **Action wall** (`:4611–4887`): Re-file saved text, `AuthoringCreateExport` (New document, New section, Download), Section/Document (`.ed-viewtoggle`), AnA (page only), nine rail toggles (Comments, History, Sources, Signatures, Audit, Exports, Project files, Tasks, Access), Send for review with its refusal text, File to vault with its refusal text, Draft with AnA, Draft from sources (`ai-draft-open`), `AuthoringCollab`. | It is not one row: 25 controls in three to seven wrapped rows (195 px at 1440, D4.md §D4.B.2). It shows no saved time and no version. "Saved" reads as an action. |
| "Review with AnA" | `editor/AuthoringOversightActions.tsx` (25 lines), mounted at `DocumentWorkbench.tsx:4890` | A `<details>` disclosure under the header: Review section, Review document, Reconcile project evidence, Prepare targeted fixes, and a permanent note; each ask goes through `askAna` (`:2078`). | It has no menu form. |
| The menu pattern | `editor/DownloadMenu.tsx`: `useMenu` (`:194`), `MenuItem` (`:260`), `moveFocus` (`:145`), `placeMenu` (`:179`), `showInTopLayer` (`:161`), `DownloadMenu` (`:328`) | The one accessible menu button: `aria-haspopup`, arrows, Home/End, Escape and Tab, focus return, top layer, fixed placement that follows scrolling, `aria-disabled` items that keep their reason. | `useMenu` and `MenuItem` are private, so nothing else can reuse them. `MenuItem` requires a `noteId` and has no `menuitemradio` form. `moveFocus` sees only `role="menuitem"`. There is no generic menu button and no icon-only Download trigger. |
| Other menus | `v2/LiveDriveSwitch.tsx:117` (`.ana-menu`), `v2/Shell.tsx:386` / `:691` (`.acct-menu`) | The live-drive switch and the account menu (D1's shell). | Neither is in D4's paths; neither is reused here. |
| Create and export | `surfaces/AuthoringCreateExport.tsx` | New document (`:266`, opens the `C2CForm` drawer with the template picker), the refusal beside it (`:269`), New section (`:272`), `DownloadMenu` (`:280`, `testId="ed-download"`), recovery notices portalled into `authoring-creation-notices`, and the `NEW_DOCUMENT_EVENT` listener. | It always draws its two text buttons; no host can open its drawers from elsewhere. |
| Presence and lock | `surfaces/AuthoringCollab.tsx` | Root `<div style={{ display: 'flex' … }}>` (`:233`); avatars at 22 px by inline style (`:238`); Unlock (`:288`) and Lock section (`:293`) as text buttons; the takeover chip, reason and buttons. | — |
| Status words and the list's back | `editor/CanvasDocumentList.tsx`: `StatusPill` (`:192`), `ToDocumentsButton` (`:221`) | The status pill in a list row and in the canvas bar. | — |
| The canvas bar | `editor/DocumentCanvas.tsx:589` (`.dcv-bar`) | The pane's own header above the workbench (Documents, Back, title, status, project, "Esc"). | D4-5 removes it (§D4.A step 2); D4-2 does not touch it. |
| The rails | `DocumentWorkbench.tsx:5599–6500` (`{rail === 'x' && <aside className="ed-comments">}`), `closeRail` and the focus return (`:2103–2116`) | Nine readers, each with its close, Escape and focus return to the toggle that opened it (`railToggleRefs`). | The Tasks rail does not hold Freeze or E-sign, and the Exports rail does not hold Place into filing or Re-file saved text. Those mounts move in D4-3 (§D4.E, §D4.F). |
| The CSS | `styles/authoring-v2.css`: `.ed-doc-h` (`:251`), `.ed-crumbs*` (`:264–295`), `.ed-doc-commit` (`:302`), `.ed-doc-actions` (`:312`), `.ed-viewtoggle*` (`:338–353`), D0's shell `.dcv-bar*` (`:1553–1597`), `.dlm*` (`:1942–2023`), the phone block's header rules (`:2236–2252`), `.ed-back` (`:2293`), `.ed-program` (`:2316`), `.authoring-oversight*` (`:2594–2690`) | The header's wrap, the crumb trail, the menu. `.dlm-item:focus-visible` draws a 2 px `--accent` outline. | — |
| The test helpers | `editor/__tests__/workbenchAssemblyBuild.testSupport.ts` (83 lines) | Fixtures, `mounted()`, `localEdit()`, the assembly UI actions. | No helper opens a menu control. |

**Not found:** no `MenuButton`, no `openEditorControl`, no `.ed-bar`, no `.ed-reason` and no second menu-button
component in `editor/**` or `surfaces/Authoring*`. Nothing this step adds exists in another form.

---

## What changed

No screen, route, service, table, mount, AnA tool or editor was added (RULES 4–6). One function inside an existing
file, `MenuButton` (`editor/DownloadMenu.tsx`), is the one BUILD_ORDER §5.1 item 4 names for D4. One test file was
added (`editor/__tests__/workbenchBar.test.tsx`) and one helper (`openEditorControl`, in the existing support file).

| File | Change |
|---|---|
| `editor/DownloadMenu.tsx` | `useMenu` (`:211`) and `MenuItem` (`:282`) exported. `MenuItem`: `noteId` optional (an item with its own note is described by it), `role="menuitemradio"` with `checked`. `MenuButton` (`:337`): `.dlm` > `button` (`aria-haspopup`, `aria-expanded`, `aria-controls`) > `.dlm-menu[role=menu]`, `children(close)`, `buttonRef`, `after`. `DownloadMenu` (`:431`) now renders through `MenuButton` (one pattern, same keys, top layer and placement) and takes `compact` (the glyph alone, `btn ed-ico`, named "Download"). `moveFocus` also walks `menuitemradio` and skips an item that is not displayed (`shown`, `:153`): without that, the arrow keys stuck on More's phone-only group, which is `display: none` above 640 px. |
| `editor/DocumentWorkbench.tsx` | The header (`:4464–4888` at HEAD) is the bar (`:4507`, `header.dcv-bar.ed-bar`, `data-testid="ed-bar"`): title and tooltip; status (`ed-status`, opens Review tasks); `v{n}` (`ed-versions`, opens the versions); the saved state (`ed-saved`); the `.seg` view switch; `AuthoringCollab`; Save (`save-section`, `primary` only while dirty); `AuthoringFilingBar`, `AuthoringPlaceIntoFiling` and Re-file saved text, mounted as they were; AnA ✻ (`ed-ana`); Comments (`ed-comments-open`); Download (`AuthoringCreateExport triggers="download"`); More ⋯ (`ed-more`); Show the conversation (`ed-show-conversation`, page only); the back (`workbench-back`). The reason strip `.ed-reason` (`:4830`) sits under the bar while dirty. `openRail` (`:2121`) records the opener so the rail's close returns focus there (More's button for every rail More opens). The crumbs went; the project and the module are the outline header's first line (`.ed-tree-p`, `:4168`) and the title's tooltip. `AuthoringOversightActions` under the header went into the ✻ menu. The two unused refusal ids went. |
| `editor/AuthoringOversightActions.tsx` | `variant?: 'section' \| 'menu'` (default `'section'`, the old render) and `onChoose`. `'menu'` draws `role="group"` "Review with AnA": the four asks as `MenuItem`s with the same labels, rule and note (`.dlm-reason`); each closes the menu, then asks. |
| `surfaces/AuthoringCreateExport.tsx` | `triggers?: 'buttons' \| 'download'` (default buttons: other hosts unchanged) and `requests`. With `'download'` the New document / New section buttons are not drawn (`CreationButtons`, `:331`, draws them otherwise) and Download is `compact`. `useCreationRequests` (`:155`): a count that rises is one request; the counts it mounted with are not; a refused request is toasted with the refusal (`creation.refusal`, or the creation's state), never swallowed. The drawers and recovery notices stay mounted here. |
| `surfaces/AuthoringCollab.tsx` | Root `.ed-collab`; avatars, the "+n" and the takeover reason lose their inline styles (`.ed-collab-peers`, `.ed-collab-more`, `.ed-collab-reason`); Lock section and Unlock are `btn ed-ico` with the lock glyph, named by their old words, titles unchanged; the takeover buttons are `btn ghost small`, the confirm's error colour is `[data-confirm]`; Unlock (a lock you hold) shows pressed (`data-locked="mine"`). |
| `styles/authoring-v2.css` | §D4.K "Bar" as `.ed-bar*` rules (D0's `.dcv-bar` shell stays as it is: the canvas still draws its own until D4-5); `.ed-reason*`; `.ed-collab*`; `.ed-more-narrow` and the 640 px rule; `.ed-tree-p`; §D4.K "Menus" (`.dlm-*`) with `.dlm-item:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--accent-200) }`, so the keyboard's place keeps a visible ring (the D0-5 review finding); the bar (`.dcv-bar.ed-bar`) wraps at every width when its acts do not fit beside a 260 px title, its acts are
`position: relative`, wrap inside their own row and are never a sideways scroller; at 760 px and under the title takes
its own row. Deleted: `.ed-doc-commit`, `.ed-doc-actions`, `.ed-viewtoggle*`, `.ed-program`, and their phone rules. Kept with a note: `.ed-doc-h` and `.ed-crumbs*`, which `surfaces/BiopharmaProject.tsx:765` still draws (`ci:undefined-css-classes` failed on `ed-crumbs` until they were restored). |

### Where D4-2 differs from §D4.B's text, and why

1. **Freeze, E-sign, Place into filing and Re-file saved text stay in the bar, mounted exactly as they were.** §D4.B
   sends them to More › "Freeze or e-sign…" / "Place into filing…" / "Re-file saved text…", which open the Tasks and
   Exports rails. Neither rail holds those acts until D4-3 moves their mounts (§D4.E, §D4.F). Those three More items
   land with D4-3; an item now would open a rail without the act.
2. **The bar is the first child of `section.ed-doc`, where the header was**, not of `.ed`. Spanning `.ed`'s columns needs
   §D4.K's grid, which §D4.A step 3 (D4-5) brings.
3. **Not in D4-2:** the outline toggle (§D4.C, D4-4); `ToDocumentsButton`, "Open full width" and the pane's close
   (`embedded.onShowList`, `onExpand`, `closeRef`: §D4.A, D4-5). The existing back (`workbench-back`) is the bar's
   close icon now, with the same handler, accessible name and test id, because the crumbs that held it went.
4. **`treeTitleRef` stays on `.ed-tree-t`** until D4-4 can hide the outline (`filingOutlinePerMarket.test.tsx:116` pins it).
5. **The bar's status pill has no `dc-status` test id** until D4-5 removes the canvas's own bar, which carries it; two
   would collide (`canvasDocumentsList.test.tsx:538` caught it).
6. **The reason strip has no `role="group" aria-label="Reason for change"`.** The input already has that name, and 18
   lookups use `getByLabelText('Reason for change')`; a group with the same name makes every one ambiguous.
7. **The project and the module are visible now**, in `.ed-tree-p` (§D4.C step 3's line, plus the module word the
   crumbs carried: "M2", "Unassigned module", "Unbound draft"), so nothing the crumbs said is unseen between D4-2 and D4-4.
8. **More's "Sources" item carries the section's citation count** ("Sources 3") as the old toggle did, until D4-3's
   tab label takes it.
9. **The bar wraps rather than scrolls, at every width** (skeptic review: first only at 760 px and under), because the
   governed acts and E-sign's and Freeze's refusal notes are still in it. A sideways
   scroller once held Save, E-sign and Place into filing past its edge (QA 2026-10-08, j5); that is the regression
   `authoringAnaPane.test.tsx`'s "never scrolled out" case pins, now against the bar.
10. **The phone-only "Download working copy (Word)"** calls the existing `downloadWorkingCopy` and toasts its sentence.
11. `AuthoringOversightActions`' `'section'` variant has no host after D4-2; §D4.G keeps it as the default.
12. **At 640 px and under, the bar hides only what More holds whole** (the view switch, Comments, the saved text).
    §D4.K also hides `.ed-collab` (Lock section, Unlock, "locked by …", Take over), the Download menu (the controlled
    export and the PDF working copy are not in More) and "Show the conversation" (the page placement's only way back
    until D4-5's close). Hidden, each would be out of reach on a phone, where HEAD reached it by scrolling; they stay in
    the wrapped bar until a later step gives them a phone home. `workbenchBar.test.tsx` pins it.
13. `styles/surface-text-ramp.css` is generated and still names `.ed-viewtoggle` (a dead selector, harmless). It is not
    in this step's files; it is regenerated with the CSS steps (§D4.L's gate list).

---

## Every control of the header and the action wall, and where it is now

HEAD lines are `editor/DocumentWorkbench.tsx` at `378c7526e` unless named. "Reached by" is a test that opens or reads the
control in its new place, in this tree.

| Old control (file:line) | New place | Reached by |
|---|---|---|
| Back to conversation / host's back label, `workbench-back` (`:4466–4479`) | The bar's last icon (`I.close`), same handler, name and test id | `editor/__tests__/workbenchAssemblyBuild.test.tsx` (`workbench-back`), `__tests__/authoringUnsavedWork.test.tsx`, `__tests__/liveDriveBackToConversation.test.tsx` ("Back to conversation"), `quality/__tests__/ControlledDocumentWorkbench.integration.test.tsx` |
| Program headline crumb `.ed-program` (`:4481–4487`) | `.ed-tree-p` (outline header) and the title's tooltip | No test read it before or now (the program read is not stubbed in jsdom); see the running-app list below |
| Module crumb `.sep-first` (`:4489`) | `.ed-tree-p` | `__tests__/documentAuthoringDeepLink.test.tsx` ("Unbound draft"), `editor/__tests__/workbenchBar.test.tsx` ("M3") |
| Document title crumb (`:4491`) | `.dcv-bar-t` in the bar | `workbenchBar.test.tsx` |
| Section code crumb `.here` (`:4497`) | The masthead's `.ed-mast-num` (unchanged) and `v{n}`'s name ("Versions: 3 revisions of 3.2.P.8.1") | `workbenchBar.test.tsx` |
| Reason for change `change-reason` + note `change-reason-note` (`:4519–4542`) | `.ed-reason` strip under the bar, while dirty; same input, rule, `aria-required`, `aria-describedby` | `__tests__/authoringReasonForChange.test.tsx`, `editor/__tests__/authoringConversationHandoff.test.tsx`, `workbenchBar.test.tsx` |
| Save `save-section` (`:4545–4565`) | The bar; quiet state word when clean, the one `primary` while dirty | `authoringReasonForChange.test.tsx:130`, `authoringSaveFilingCommit.test.tsx:150`, `documentAuthoringEditor.test.tsx:166`, `:219`, `workbenchBar.test.tsx` |
| Freeze, E-sign (`AuthoringFilingBar`, `:4567`) | The bar, mounted unchanged (D4-3 moves it) | `editor/__tests__/workbenchDocumentAccess.test.tsx` ("Freeze document", "Sign document"), `__tests__/authoringFilingBar.test.tsx`, `workbenchBar.test.tsx` |
| Place into filing (`AuthoringPlaceIntoFiling`, `:4595`) | The bar, unchanged | `workbenchDocumentAccess.test.tsx` ("Place document"), `__tests__/documentAuthoringPlaceIntoFiling.test.tsx`, `workbenchBar.test.tsx` |
| Re-file saved text (`:4612`) | The bar, unchanged | `editor/__tests__/authoringRefileSavedText.test.tsx`, `workbenchDocumentAccess.test.tsx`, `workbenchBar.test.tsx` |
| New document (`surfaces/AuthoringCreateExport.tsx:266`) | More › "New document…" → the same drawer | `workbenchBar.test.tsx`, `editor/__tests__/sourceDocumentStartFlow.test.tsx`, `__tests__/taskDrawerCreationGuard.test.tsx` |
| Its refusal text (`AuthoringCreateExport.tsx:269`) | A toast when New document… or New section… is chosen | `workbenchBar.test.tsx` ("says a refused request in a toast") |
| New section (`AuthoringCreateExport.tsx:272`) | More › "New section…" (with a document open) → the same drawer | `workbenchBar.test.tsx`, `taskDrawerCreationGuard.test.tsx` |
| Download `ed-download` (`AuthoringCreateExport.tsx:280`) | ↓ icon in the bar, the same `DownloadMenu`; More › "Download working copy (Word)" at ≤ 640 px | `workbenchBar.test.tsx`, `__tests__/downloadWorkingCopy.test.tsx` |
| Section / Document (`.ed-viewtoggle`, `:4640`) | `.seg` in the bar, same names, `aria-pressed`; More › "Section view" / "Document view" (`menuitemradio`) at ≤ 640 px | `editor/__tests__/editorOversightNavigation.test.tsx`, `editor/__tests__/workbenchDraftPassage.test.tsx`, `workbenchBar.test.tsx` |
| AnA, opens the conversation (`:4669`, page only) | "Show the conversation" `ed-show-conversation` (page only) | `__tests__/authoringAnaPane.test.tsx`, `__tests__/authoringAnaInsertGate.test.tsx`, `authoringConversationHandoff.test.tsx`, `__tests__/workbenchA11ySweep.test.tsx`, `workbenchBar.test.tsx` |
| Comments n (`:4679`) | 💬 icon `ed-comments-open`, named "Comments n"; More › "Comments" at ≤ 640 px | `__tests__/documentAuthoringHonestReads.test.tsx`, `__tests__/documentCanvas.test.tsx`, `workbenchA11ySweep.test.tsx`, `workbenchBar.test.tsx` |
| History n (`:4691`) | "v{n}" `ed-versions`; More › "Versions" | `workbenchA11ySweep.test.tsx` (GA-4, GA-5), `documentAuthoringHonestReads.test.tsx`, `__tests__/documentCanvasPolish.test.tsx`, `workbenchBar.test.tsx` |
| Sources n `sources-rail-open` (`:4702`) | More › "Sources n", same test id | `__tests__/documentAuthoringSourcesRail.test.tsx`, `editor/__tests__/workbenchSourceReceiptOwnership.test.tsx` ("Sources 1"), `editor/__tests__/workbenchSourceSessionOwnership.test.tsx`, `__tests__/authoringRefreshAll.test.tsx`, `editor/__tests__/workbenchCitationCatalog.test.tsx` |
| Signatures (`:4719`) | More › "Signatures" | `workbenchA11ySweep.test.tsx` (GA-4) |
| Audit (`:4731`) | More › "Audit trail" | `__tests__/auditRailIntegrity.test.tsx`, `__tests__/documentAuthoringAuditRail.test.tsx`, `workbenchA11ySweep.test.tsx` |
| Exports `exports-rail-open` (`:4744`) | More › "Exports", same test id | `workbenchA11ySweep.test.tsx`, `workbenchBar.test.tsx` |
| Project files `vault-rail-open` (`:4758`) | More › "Project files", same test id | `__tests__/workbenchProjectFiles.test.tsx`, `editor/__tests__/projectFilesAssemblyFlow.test.tsx`, `editor/__tests__/workbenchRemedies.test.tsx`, `authoringConversationHandoff.test.tsx` |
| Tasks `tasks-rail-open` (`:4768`) | More › "Review tasks", same test id; the status word in the bar | `__tests__/sendForReview.test.tsx`, `__tests__/workbenchAssignReview.test.tsx`, `workbenchA11ySweep.test.tsx`, `workbenchBar.test.tsx` |
| Access `access-rail-open` (`:4777`) | More › "Access", same test id; its close returns focus to More | `workbenchDocumentAccess.test.tsx`, `workbenchBar.test.tsx` |
| Send for review `send-for-review-open` and its refusal text (`:4789–4805`) | More › "Send for review…", same test id; refused: `aria-disabled`, the refusal as the item's note and description | `sendForReview.test.tsx`, `workbenchAssignReview.test.tsx`, `workbenchA11ySweep.test.tsx` (GE-P-3), `workbenchDocumentAccess.test.tsx` |
| File to vault `file-to-vault-open` and its refusal text (`:4806–4829`) | More › "File to vault…", same test id; the three reasons or the refusal as the note | `__tests__/workbenchFileToVault.test.tsx`, `workbenchA11ySweep.test.tsx` (GE-P-3), `workbenchDocumentAccess.test.tsx` |
| Draft with AnA (`:4830–4840`) | ✻ › "Draft with AnA"; the empty section's own "Draft with AnA" stays on the page | `authoringAnaPane.test.tsx`, `__tests__/authoringAnaMarkdown.test.tsx`, `__tests__/authoringConversationContext.test.tsx`, `__tests__/canvasDocumentsList.test.tsx`, `documentCanvas.test.tsx` (all through `canonicalAuthoringFlow.tsx`'s `toolbarDraftButton` or `openEditorControl`), `workbenchBar.test.tsx` |
| Draft from sources `ai-draft-open` (`:4848–4876`) | ✻ › "Draft from sources", same test id and toggle logic; the disabled reasons as its note | `__tests__/authoringAiDraft.test.tsx`, `editor/__tests__/workbenchDraftParagraphs.test.tsx`, `workbenchDraftPassage.test.tsx`, `editor/__tests__/savedAssemblySourcesFlow.test.tsx`, `editor/__tests__/sourceFirstAssemblyFlow.test.tsx`, `authoringUnsavedWork.test.tsx`, `workbenchDocumentAccess.test.tsx`, `workbenchBar.test.tsx` |
| Lock section / Unlock and presence (`AuthoringCollab`, `:4878`) | The bar, icon-only, same names and titles | `__tests__/authoringCollab.test.tsx` (unchanged: `/Lock section/`, `/Unlock/`) |
| "Review with AnA" disclosure: Review section, Review document, Reconcile project evidence, Prepare targeted fixes, and the note (`:4890`, `editor/AuthoringOversightActions.tsx`) | ✻ › group "Review with AnA", same four asks and note | `editor/__tests__/workbenchTemplateOversight.test.tsx`, `workbenchRemedies.test.tsx`, `authoringConversationContext.test.tsx`, `authoringConversationHandoff.test.tsx`, `workbenchBar.test.tsx` |

---

## §D4.L: the tests this step updated

The helper is `openEditorControl(name, menu = 'more')` in `editor/__tests__/workbenchAssemblyBuild.testSupport.ts`: it
opens the bar's More (or ✻) menu unless open and returns the item. No assertion was removed; where a moved control was
a `button` with `disabled`, the same assertion reads the menu item's `aria-disabled`, and where focus returned to a
toggle, it returns to the control that opened the rail (More's button for More's rails).

| §D4.L row | Updated in D4-2 |
|---|---|
| Rail toggles into the More menu | `documentAuthoringSourcesRail`, `workbenchProjectFiles`, `editor/projectFilesAssemblyFlow`, `auditRailIntegrity`, `workbenchA11ySweep`, `editor/workbenchDocumentAccess`, `authoringRefreshAll`, `documentAuthoringAuditRail`, `documentAuthoringHonestReads`, `documentCanvasPolish`, `editor/workbenchCitationCatalog`, `editor/workbenchSourceReceiptOwnership`, `editor/workbenchSourceSessionOwnership`. (`documentAuthoringCommentThreads` needed no change: the Comments icon keeps the name "Comments n". `authoringReviewRouteRR5` mounts `ReviewTasksPanel` directly; its row is D4-3's.) |
| Send for review and File to vault into the menu | `sendForReview`, `workbenchAssignReview`, `workbenchFileToVault` |
| New document and New section into the menu | `editor/sourceDocumentStartFlow`, `taskDrawerCreationGuard` (`authoringCreateExport` keeps `triggers='buttons'`: unchanged) |
| Draft with AnA, Draft from sources and Review with AnA into the ✻ menu | `authoringAiDraft`, `authoringAnaPane`, `authoringAnaInsertGate`, `authoringConversationContext`, `canvasDocumentsList`, `documentCanvas`, `authoringUnsavedWork`, `editor/authoringConversationHandoff`, `editor/workbenchTemplateOversight`, `editor/workbenchRemedies`, `editor/workbenchDraftParagraphs`, `editor/workbenchDraftPassage`, `editor/savedAssemblySourcesFlow`, `editor/sourceFirstAssemblyFlow`, and the shared helper `canonicalAuthoringFlow.tsx` |
| **The "Save and sign" group** (not a §D4.L row; added here) | `authoringReasonForChange` (`:130`), `authoringSaveFilingCommit` (`:150`), `documentAuthoringEditor` (`:166`, `:219`): `screen.getByTestId('save-section')` |
| The crumbs (not a §D4.L row) | `documentAuthoringDeepLink` (`:318`: "Unbound draft" in `ed-tree-p`) |
| The toolbar's CSS (not a §D4.L row) | `downloadWorkingCopy` (the `.ed-bar-acts` rules: containing block, never a sideways scroller) |
| Lock section icon-only | `authoringCollab`: unchanged, passes |
| Freeze, E-sign, Place into filing, Re-file saved text; the canvas rows; `ReviewTasksPanel`; More formatting | D4-3, D4-5 and D4-6: their mounts and DOM did not move here |

---

## Red, then green

- **New tests red at HEAD.** `editor/__tests__/workbenchBar.test.tsx` (17 cases: the bar, the menus by name, keys and
  focus return, the ✻ menu and its asks, New document/New section through `requests`, the refusal toast, compact
  Download, the filing acts still in the bar, `MenuButton` skipping an undisplayed item and `menuitemradio`, the focus
  ring, the retired rules) run against the HEAD export: **17 of 17 fail** (`red/workbenchBar.red.txt`). On this tree:
  **17 of 17 pass** (`green/workbenchBar.green.txt`).
- **The Save-and-sign lookups.** HEAD's three test files run against the new bar: **12 fail**, each "Unable to find …
  role "group" and name "Save and sign"" (`red/save-and-sign-lookups.red.txt`). With `getByTestId('save-section')` they pass.
- **Baseline.** The 133 suites that mount the editor or name a moved control, at HEAD `378c7526e`: 1,944 tests, 19
  failing before any change (`authoringTemplateSearch` 14, `authoringConversationScopeLive` 3, `draftClaimsLine` 1,
  `auditTrailEventChainVerdict` 1; `red/baseline-HEAD-378c7526e.txt`). They fail the same way after; none is D4-2's.
- **After the product change, before the test updates:** 204 new failures in 34 suites, every one a lookup of a moved
  control (`green/suites-after.txt`). **After the updates:** those 39 suites plus `authoringAnaMarkdown`,
  `workbenchBar` and the three Save-and-sign suites: 532 tests, 530 pass; the 2 left were fixed and both suites then
  pass 47/47.
- **Wider:** 139 more suites that mount the shell, a conversation, a project or the editor: 1,480 tests, 11 failing,
  none D4-2's (`green/suites-wider.txt`: two fail at HEAD too, two read the shell lane's uncommitted `Shell.tsx`, one a
  registry label, one an order-dependent Data Room flake that passes alone).

## Gates

| Gate | Result |
|---|---|
| D0 guards (`__tests__/foundations{OneDefinition,RetiredRatchet,SentenceCase}.test.ts`) | 53/53 (`green/d0-guards.txt`) |
| `npm run ci:undefined-css-classes` | OK (`green/ci-undefined-css-classes.txt`); it failed once on `ed-crumbs` (BiopharmaProject) before those rules were kept |
| `npm run ci:canvas-path` | OK, all links (`green/ci-canvas-path.txt`) |
| `npm run ci:one-product` | 102 surfaces, 10 rail entries, none new (`green/ci-one-product.txt`) |
| ESLint, each changed file against `git show HEAD:<file>` | No new warning in any of the 45 TS/TSX files (`green/eslint-before-after.txt`; `DocumentWorkbench.tsx` 12 → 12, its complexity 494 → 477) |
| `tsc` over the changed files and their imports | 0 errors in any D4-2 file (`green/tsc-changed-files.txt`; the whole-project `tsc` runs out of memory at 8 GB here) |

## Needs the running app (not run: no dev server or browser in this step)

§D4.B.6 and §D4.O 5: the bar's height (48–52 px) and its visible-button count; orange fills (0 clean, 1 after a
keystroke); no uppercase; 390 px with `hasTouch` (44 px buttons, no sideways scroll); dark contrast of the status chip;
the menu's ring and placement; the project line's tooltip. Until D4-3 moves Freeze, E-sign, Place into filing and
Re-file saved text, the bar holds more than 12 buttons with a section open (about 16 on the page placement with a way back),
so §D4.B.6's "at most 12" (and "6 or fewer at 390") is expected to hold only after D4-3. With the skeptic's changes the bar
is two rows wherever its acts do not fit beside the title (at 1440 with a rail open, and probably clean at 1440 while the
filing acts and their refusal notes are in it), so "one row, 48–52 px" is also D4-3's to show. At 390 the bar also keeps
presence and the lock, Download and "Show the conversation" (departure 12). `tests/e2e/golden-customer-journey.e2e.ts`
was updated for the moved Send for review and Draft with AnA and was not run.

---

## Skeptic review (2026-11-02, at HEAD `f7b11e77a`)

Checked §D4.B line by line, §D4.G steps 1–2, §D4.K "Bar" and "Menus", every row of the control table against the code
and a test that reaches it, and the menu's keys. Found and fixed:

1. **The bar overflowed at desktop width.** Its acts were `flex-shrink: 0` in a row that wrapped only at 760 px and
   under. With Freeze, E-sign, their refusal notes (`max-width: 240px` each), Place into filing and Re-file saved text
   still in it, the acts are wider than the page column at 1440 with a rail open (956 px clean, about 611 px with a
   rail), so the end of the row (More, the way back) would sit past the column's edge, the j5 failure again. And
   `.ed-bar`'s gap, padding and background lost to D0's `.dcv-bar`, which sits later in the file with the same weight.
   Now `.dcv-bar.ed-bar` wraps at every width when the acts do not fit beside a 260 px title, and `.ed-bar-acts`
   (`min-width: 0`, `flex-wrap: wrap`, right-aligned) wraps inside its own row (departure 9).
2. **Focus fell to the page when a rail opened by its own act closed.** Review tasks after Send for review (`onSent`,
   "Check existing review tasks") and Exports after an export's recovery (`onCheckExports`) call `setRail` directly; at
   HEAD their bar toggles were the return target, and D4-2 removed those toggles. The close now returns focus to the
   control that opened the rail if it is still mounted, else to More, which holds every rail.
3. **Three controls went out of reach at 640 px and under.** §D4.K hides `.ed-collab` (Lock section, Unlock, "locked
   by …", Take over), the Download menu (the controlled export and the PDF working copy) and "Show the conversation"
   (the page placement's only way back until D4-5); More holds none of them. They stay in the wrapped bar
   (departure 12).
4. **"Draft from sources" on narratives held by reference** showed its description as the reason it was disabled. It
   now says why ("These narratives are held by reference …"), as "Draft with AnA" does.
5. **Tests.** Home, End, ArrowUp wrapping and Tab are now exercised on More and on `MenuButton` (Escape and focus return
   were); `workbenchCreationContext.test.tsx` asserted the notices sit outside `.ed-doc-actions`, which no longer exists,
   and now names `.ed-bar-acts`; `tests/e2e/golden-customer-journey.e2e.ts` reached Send for review and Draft with AnA as
   bar buttons and now opens More and ✻ (`chooseFromEditorMenu`). A one-line comment move in the outline header.

**Red, then green.** `workbenchBar.test.tsx` is 19 cases now; against a HEAD `f7b11e77a` export **19 of 19 fail**
(`red/workbenchBar.red-f7b11e77a.txt`); on this tree 19 of 19 pass. The two new CSS cases and the focus-return assertion
(`sendForReview.test.tsx`, "Check existing review tasks") fail against the builder's tree before these fixes
(`skeptic/red-wrap-and-focus-return.txt`, `skeptic/red-phone-width-reach.txt`: focus on `<body>`, no `.dcv-bar.ed-bar`
rule, `.ed-collab` hidden) and pass after.

**Suites** (`skeptic/suites.txt`): 151 files (every suite that imports a changed file or mounts the editor, canvas or
Authoring surface, every §D4.L file, the builder's 133, the D0 guards and `tests/ui/one-shell.test.ts`), 2,238 tests,
2,176 pass, 62 fail. All 62 are in six suites that fail with the same titles at HEAD: `auditTrailEventChainVerdict` 1,
`authoringPlaceWholeDocument` 6, `authoringTemplateSearch` 14, `documentAuthoringPlaceIntoFiling` 37, `draftClaimsLine`
1, `authoringConversationScopeLive` 3. (`authoringPlaceWholeDocument` and `documentAuthoringPlaceIntoFiling` are §D4.L
files the builder's run did not include; they fail at HEAD in the same way and mount only `AuthoringPlaceIntoFiling`.)
After the last edits, the CSS-reading suites, the edited suites, the D0 guards and one-shell: 14 files, 240/240.

**Gates** (`skeptic/gate-*.txt`): `ci:undefined-css-classes` OK; `ci:canvas-path` OK, all links; `ci:one-product` none
new; `ci:check-css-selector-shadowing` 0 new; `ci:token-contrast` OK; D0 guards pass. ESLint: no file up against
`git show HEAD:<file>` across the 47 TS files committed, 26 → 26 in total (`skeptic/eslint-before-after.txt`). `tsc`
over all 47: no error in any of them (`skeptic/tsc-changed-files.txt`: four errors elsewhere, CSS modules and
`import.meta.env` outside the narrowed config). **Not green, and not D4-2's:** `ci:check-phantom-tokens` fails on
`--danger-000` at `styles/project-home-v2.css:496` (committed in `78842ee08`); `ci:surface-text-ramp` is stale across
lanes. D4-2's share of the ramp is one selector, `.ed-viewtoggle` → `.ed-reason` (`green/surface-text-ramp.d4-2-only.patch`);
the generated file is not committed here, because regenerating it now would carry other lanes' uncommitted rules.
