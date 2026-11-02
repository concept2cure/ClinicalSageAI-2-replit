# D1–D7: the merged build order

This is the merged build order that commit `18261a908` promised ("The merged build order follows when the synthesis
finishes"). It orders what the specs already say and adds nothing to the plan. Where a spec disagrees with the code
at HEAD or with another spec, §5 says so. This file does not amend the specs.

**Read at:** `b7c7cf9f0` on `concept2cure-v2`, 2026-11-01.
- At that commit, D0 has landed only its three guards (`78677693b`). D0-1 to D0-5 are not committed yet.
- `COORDINATION.md` (`b7c7cf9f0`) locks these files for D0: `design-system/**`, `client/src/concept2cure/v2/styles/**`,
  `AnswerLead.tsx`, `icons.tsx`, `C2CForm.tsx` and `dataConnect.tsx`.

**Sources:**
- `D0.md` §0, §4.6, §4.7 and §4.8;
- the "Order", "The change", "Tests" and "Open items" sections of `D1.md` to `D7.md`;
- the ledger `docs/design/one-design-plan.json` (each package's `paths`);
- `docs/design/ONE_DESIGN_PLAN.md` §3 and §4.6;
- `CLAUDE.md` RULES 0, 3, 4, 5 and 6.

**Line numbers drift.** The specs were read at different commits: `90c663884f` (D0), `e11b3bfb72` (D1–D3),
`943a44b5bd` (D4) and `6ffca88a09` (D5–D7). Since then, the helper commits (`424a2e2aa`, `465bc23a8`, `6661f4690`,
`943a44b5b`, `8629698e3`) and D0 itself have moved the lines. A builder therefore finds each rule by its selector,
not its line number. The helper work that the specs said to wait for is now at HEAD, checked by grep:
- `wizardMissing` and `WizardFilingSetup` in `Projects.tsx`;
- `ProjectHeaderDoors` and `useQualityDocumentIds` in `ProjectHome.tsx`;
- `workAreasFor` in `ProjectCoreWork.tsx`;
- `defaultPresetFor` and `ResultLead` in `Biostatistics.tsx`;
- `railTargetOf` in `Shell.tsx`;
- `ProjectComingLater.tsx` deleted;
- the `SubmissionSeqWorkspaces.tsx` rewrite, in `8629698e3`.

---

## 0. The order on one page

1. **D0 gates all styling.** D0-1, then D0-2, then D0-3, then D0-4 must land first. D0-3 sweeps every v2
   stylesheet, and D0-4 also edits two sheets: it replaces `.al-*` at `app-v2.css:3572–3588` and deletes
   `coverage-v2.css:245–261` (`D0.md` §4.4). No D1–D7 session touches `styles/**` until **D0-4** is pushed and the
   lock row in `COORDINATION.md` is deleted. That row holds `styles/**` for "D0-1 to D0-5".
2. **D5-0 comes next, alone on `app-v2.css` and `journey-v2.css`.** It is the work-area CSS block (`D5.md` §WA.4.1)
   in `app-v2.css`. D5, D6 and D7 all cite it, and the D6 and D7 specs forbid any of their steps before it. It should
   carry D1's `.sp-starters[data-layout="row"]` rule, which D5 §0 allows. D4-1 and D2-1 touch neither sheet and use
   no work-area rule, so they may start beside it (§3, Wave 1a).
3. **Then up to eleven lanes run in parallel.** The lanes are split by TSX ownership (§3). The CSS still goes through
   one holder per stylesheet at a time (plan §4.6). `app-v2.css` is the bottleneck.
4. **Six hard cross-package edges:**
   - D5-1 removes `CmcModule.tsx`'s `StageBand` import before D3 deletes `StageBand`.
   - D2-1 exports `WS_LABEL` before D3-2 imports it.
   - D1 exports `TRIAGE_ASK` from `TaskTray.tsx` before D6-1 uses it. The constant does not exist today: the ask is an
     inline string at `TaskTray.tsx:251`.
   - D0-4 adds `AnswerLead emphasis` before D7-A2 uses it.
   - D7-A1 builds the context row before D7-A2 moves the sequence select into it.
   - `.rbm-ana-composer` (D7-C) and `.rc-composer` (D7-D) must be in D0's composer `:is()` list before those steps
     rely on it. D0 §4.2.16 does **not** list them. It says they join "when their owners (D4, D7) confirm". So either
     D7's confirmation reaches the D0 builder before D0-2 lands, or D7-C and D7-D each add their selector to that list
     in `app-v2.css` (§5.2 item 20).
5. **Three decisions block steps.** They are the founder's or the lead's, not a session's:
   - D1's ledger fix: `Surfaces.tsx`, `workDock.ts` and `surfaceViews.ts`.
   - D7's ledger fix: `client/src/concept2cure/quality/**`.
   - D4's three corrections to D0 §4.2.17 and its four asks of D0. These must reach the D0 builder **before D0-2
     lands**. (At this review, the working-tree `D0.md`, not yet committed, has taken all of them into §4.2.17 as an
     "Amended 2026-11-01" note. See §5.2 item 6.)
6. **A retired name that reaches zero is retired in the same commit.**
   - When a commit brings a name to 0, it deletes every selector for that name in every v2 sheet, in that same commit.
   - This is because `foundationsRetiredRatchet.test.ts` fails "at 0 while the alias is still in the CSS"
     (`78677693b`).
   - After D0-2, every alias sits in D0's `:is()` lists in `app-v2.css`. So each zeroing commit takes an `app-v2.css`
     turn, even when its own sheet is another one: D1-6 (`landing-newproj`), D5-1 (`cm-subtab`, `cm-connect`, and
     §4.2.18's neutralising rules), D5-2 (`cm-head`, `cm-kicker`, `cm-title`), D6-2 (`cc-tab`) and D7-A1 (`sc-ws`).
   - The ratchet reads **every** `.css` in `styles/`, the generated `surface-text-ramp.css` among them. At HEAD that
     sheet names `.pj-stageband` and `.cm-connect`. So the zeroing commit also regenerates it
     (`node scripts/design/generate-surface-text-ramp.mjs`). It is never hand-edited.
   - So "D0-6" is not a later step. It happens inside each owner's zeroing commit (§5.2 item 2).

---

## 1. Per package

Each package below gives:
- the files each step changes, taken from the spec's "The change" sections;
- the D0 primitives it uses;
- the files of other packages it depends on;
- its steps in order.

Every commit carries `Plan: <ID>` and `Completes: <existing path>`.

### D1: shell, Home and the conversation (`D1.md`)

**Files**

| Step (proposed; the spec gives sections A–H, not numbered commits) | TSX/TS | CSS |
|---|---|---|
| D1-1 Sidebar (§D1.A) | `v2/Shell.tsx` (`Rail`, `RailRecents`, `AccountMenu`); `v2/V2App.tsx` (`onOpenRail`) | `app-v2.css` 1361–1373 (phone), 1392–1468 (rail) |
| D1-2 Top bar (§D1.B) | `Shell.tsx` (`TopBar`; delete `ProjectChip`); `V2App.tsx:1325` (`data-surface`); `TaskTray.tsx` trigger (`data-overdue`, label); after the ledger fix, `surfaceViews.ts:203` reads "Loading…" (step 8) | `app-v2.css` 1478–1545; `.tt-badge` (the spec's `:845`, `:853` at HEAD) and the new `.tt-trigger[data-overdue] .tt-badge`; delete `.tb-cmdk*`, `.tb-org*`, `.tb-task*`, `.tb-proj*`; `.scaf-note[aria-busy]` |
| D1-3 ⌘K (§D1.F) | `Shell.tsx` (`CmdK`, `useRecentThreads` in the same file) | `app-v2.css` 2351–2384; delete `.cmdk-foot*` |
| D1-4 Your work (§D1.G) | `TaskTray.tsx` (header, triage, rows; **export `TRIAGE_ASK`**); `OpenWork.tsx` (`WorkRow` dot); `NotificationOpenButton.tsx` | `app-v2.css` 865–902 |
| D1-5 Conversation (§D1.E; contract §D1.D) | `surfaces/ConversationThread.tsx` (header, empty state, `AnaTurn`, inline artifact card, composer, side column; **export `STARTER_ASKS`**); `AnaWorkPanel.tsx` (`AnaProgressChip`); `workDock.ts` step 9 (after the ledger fix) | `app-v2.css` 2658–2837; `authoring-v2.css` (the thread `.ct-ana-text.ana-md` override only); `ana-v2.css` (§0.1) |
| D1-6 Home (§D1.C) | `surfaces/HomeSections.tsx` (`HomeProjects`, `HomeProgram`; delete `HomeWelcome`). After the ledger fix: move `Home` from `surfaces/Surfaces.tsx` into `HomeSections.tsx`, and update the import at `V2App.tsx:79`. `HomeSetup.tsx` is reordered only. | `surfaces-v2.css` 8–12, 23, 40, 49–89 (including 76–77); `app-v2.css`: delete the `.landing-newproj` alias from D0's button `:is()` lists (step 7 takes the name to 0) |
| D1-7 Drive strip (§D1.H) | none (`LiveDriveOverlay.tsx` reused) | `app-v2.css` 1698–1735 |

**Tests.**
- Rewritten: the tests in §D1.I.
- New: `shellQuietChrome.test.tsx` and `conversationReadingColumn.test.ts`.
- D1-6 brings `landing-newproj` to 0 in `foundationsRetiredRatchet.test.ts`. Its alias goes from D0's button `:is()`
  list in the same commit.

**D0 primitives used.**
- From D0-1: the `--fs-*` tokens. Every size is written `var(--fs-…, px)`.
- From D0-2: `.btn`, `.btn.ghost` and `.btn.small` (§4.2.4).
- The composer chrome `:is(.landing-composer, .pj-composer, .ct-composer)` (§4.2.16).
- The drawer pieces `.de`, `.de-bd`, `.tt-scrim` and `.de[data-docked]` (§4.2.14).
- `.sp-starter` (§4.7), `.pj-card` (§4.2.6) and `.rd-chip` (§4.2.10).
- `.cmdk-in input:focus-visible` (§4.2.5).

**Other packages' files.**
- Reads `enumWords` from `surfaces/projectWords.ts`, which is D3's under the `project*.ts` glob.
- Edits one block of `authoring-v2.css`, D4's main sheet.
- D6-1 imports its `TRIAGE_ASK`.
- D2 relies on ⌘K keeping its "Ask AnA" row.

**Order.** D1-4, D1-1, D1-2, D1-3, then D1-6a (step 7 and D1-6's CSS, except the `.landing-settings` popover rule),
D1-5, D1-6b (steps 1–6 and that rule, after the ledger fix), and D1-7 in any free slot.
- **D1-4 goes first**, because it unblocks D6-1. Nothing in it needs D1-1 to D1-3. It shares `TaskTray.tsx` with
  D1-2's trigger, so it simply goes before D1-2.
- `Shell.tsx` is shared by D1-1, D1-2 and D1-3, so they run in sequence.
- **D1-6's CSS goes before D1-5.** D1-5's composer (§D1.E step 6) uses `.landing-settings` as a fixed popover, and
  `.landing-state` for its state chips. At HEAD, `.landing-settings` is only Home's in-flow strip, with a top border
  (`surfaces-v2.css:87`), and `.landing-state` is in no sheet. Only D1-6's `surfaces-v2.css` block (§D1.C step 8)
  makes the first a popover and defines the second, along with the contract's
  `:is(.landing-composer, .pj-composer, .ct-composer) .landing-crow`. That block lands as D1-6a with step 7, with one
  exception: the `.landing-settings { position: fixed; … }` rule. Before Home's step 4 markup, which waits for the
  ledger fix and places the popover with `fixedMenuPlacement`, that rule would turn Home's in-flow settings strip
  into an unplaced fixed box. So D1-5 scopes the popover rule to `.ct-composer .landing-settings`, and D1-6b
  generalises it. The alternative is that D1-5's settings popover waits for D1-6b.
- D1-6b comes after D1-4 and D1-5, because it imports `TRIAGE_ASK` and `STARTER_ASKS`.
- D1-6 steps 1–6, D1-5 step 9 and D1-2 step 8's words wait for the ledger fix (§0.2). D1-6 step 7 and its CSS do
  not, except the `.landing-settings` popover rule, which goes with step 4.

### D2: Projects (`D2.md`)

| Step | TSX/TS | CSS |
|---|---|---|
| D2-1 The Projects page | `surfaces/Projects.tsx` (header, toolbar, cards, list; `cardLine`; delete `WS_TONE`; `anaContext` words); `surfaces/ProjectPortfolioFilters.tsx` (selects; **export `WS_LABEL`**); `surfaces/ProjectClientFilter.tsx` | `project-home-v2.css` 11–51; `surfaces-v2.css` 146–148 (delete `.ws-switch`, `.ws-btn`); regenerate `surface-text-ramp.css` |
| D2-2 New project's look | `Projects.tsx` (wizard 590–1170; delete the Team members field) | `project-home-v2.css` `.npw-*` 52–230; `app-v2.css` `.rpk-*` 3168–3260 (`RegistryPicker` markup is D1's; CSS only, announced to D1) |
| S1 (not D2) | `Projects.tsx` (the objective field, D2 §2.4 item 6) **plus** `server/routes/c2c/projects.ts` (POST accepts `objective`), in one commit | none |
| S11 or F1 (not D2) | `server/services/c2c/project-portfolio.ts` (`PROJECT_CARD_SELECT` adds `description`, `indication`, `agency`, `program_type`) | none |

**D0 primitives used.**
- The header: `.ph`, `.ph-title`, `.ph-sub` and `.ph-acts`.
- Buttons: `.btn.primary` and `btn ghost small`.
- Inputs: `.c2c-input`.
- Cards: `.pj-card`, with `-t`, `-m`, `-r`, `-blk` and `-foot`.
- `.seg` and `.seg-b`, `.ct-head` (§4.2.11), `.c2c-empty-state` and `.rd-chip`.
- **Not D0's:** `.ctable` and `.ct-row`. `D2.md` §1.4 item 6 says the list's type "comes from D0's `.ctable` /
  `.ct-row` rules", but D0 §4.2.11 restyles only `.ct-head`. `.ctable` and `.ct-row` are unowned rules at
  `surfaces-v2.css:288–293`, where `.ct-row` is 12px, and 16 TSX files use them. Once D2 deletes the inline sizes,
  the rows read 12px, not the 13px title the spec states (§5.2 item 19).

**Other packages' files.**
- `ProjectDiscoveryHandoff.tsx` (D3's file): D3-4 makes D2's one-attribute change.
- Reads `enumWords` from D3's `projectWords.ts`.

**Order.** D2-1, then D2-2 (both edit `Projects.tsx`), then S1's objective commit. The S11 projection is not
blocking, because `cardLine` falls back.

### D3: the project page (`D3.md`)

| Step | TSX/TS | CSS |
|---|---|---|
| D3-1 The frame | `surfaces/ProjectHome.tsx` (header, composer and starters, conversations, steps); `surfaces/ProjectStages.tsx` (`StageTracker` as `.seg`); `fixtures/project-home-data.tsx` (`PJ_LIFECYCLE[].starter` and `starterDevice`). **Removes the `StageBand` render at `ProjectHome.tsx:2012–2013`, but keeps the component until D5-1 lands** (§5.2 item 1). | `app-v2.css` `.pj-lc*` 690–699, `.pj-*` 1063–1245; `project-home-v2.css` 314, 432–440, 510–513, 549–569; delete `journey-v2.css:40` |
| D3-1b (after D5-1) | `ProjectStages.tsx`: delete `StageBand` | delete `.pj-stageband*` from every sheet (`app-v2.css` 701–736 and 1103–1107); in the ratchet, take `pj-stageband` and "What to do now" to 0 |
| D3-2 Project knowledge (after D2-1 and D3-3) | `ProjectHome.tsx` (the four reads of §4.10 lifted into `ProjectWorkspace`; `ProjectWorkPanel` reads the lifted unified-work read; `DossierReadinessCard` rendered in Author as it leaves the side); `ProjectSide.tsx`, `ProjectRecords.tsx` (`{ state, activity }` props), `ProjectRecordedContext.tsx`, `ProjectCoreWork.tsx`, `ProjectDossier.tsx`, `ProjectMarkets.tsx` (`ProjectStatusLine`); **`ProjectPlan.tsx`: export `targetWords`** (the About card's Target submission, §4.8 item 1; not exported at HEAD); **`ProjectRespond.tsx`: `inbox` and `fire` props** (§4.7 Respond item 4, so the Filing card and Respond share one inbox read) | the CSS of §4.12, including the `.pj-side` rules for `ProjectSkills.tsx` (an unowned file, CSS only) |
| D3-3 The two drawers | `ProjectSettings.tsx` (drawer through the existing `useDialog.ts`, which is unchanged; the new `request` prop), `ProjectTeamResponsibilities.tsx` (`showNote`), `ProjectTeamSharing.tsx`, `ProjectHome.tsx` (Team drawer; `settingsRequest` and `openSettings` wired to the header) | `project-settings.css` 10–12 and the `.pj-settings-panel` grid |
| D3-4 The step bodies | `ProjectPlan.tsx` (delete the `team` prop), `ProjectHome.tsx` (Evidence, Author, Review), `ProjectMarkets.tsx` (header doors, `VerdictDetail`), `ProjectRespond.tsx` (sections, Commitments), `ProjectDossier.tsx` (`ring={false}`, disclosures), `ProjectDiscoveryHandoff.tsx` (D2's change) | §4.12 |
| S1 (not D3) | `projectSettingsRequest.ts` gains `useProjectObjective`; `server/routes/charters.ts` | none |
| S9, S10, S11 | behaviour only, on D3's layout (§0 of `D3.md`) | none |

**D0 primitives used.**
- Cards: `.pj-card`, `.pj-card-h` and `.pj-card-h-go`.
- `.seg` and `.seg-b` (with `data-on`); `.btn*`; `.pj-sec-h`.
- The drawer family: `.de-bd`, `.de`, `.de-h`, `.de-x`, `.de-body`, `.de-f`, `.de-btn`, `.de-gov`, `.de-label`,
  `.de-input`, `.de-select` and `.de-textarea`.
- The `.pj-composer` chrome; `.sp-starter`; `.rd-chip` tones.
- `EmptyState` and `ErrorState`; `C2CToast` (`.de-toast`).
- Not a D0 primitive: `.pj-title` is D3's own rule. D0 §4.2.2 leaves it in `app-v2.css` for D3, which sets it to the
  `.ph-title` metrics.
- D1's composer contract (§D1.D).

**Other packages' files (imports and consumers).**
- `WS_LABEL` from D2's `ProjectPortfolioFilters.tsx`.
- `useAgencyInbox` and `AgencyInboxList` from D6's `AgencyInbox.tsx` (`AgencyInbox.tsx:194` and `:453`).
- `MarketGateDetail` from D7's `DispatchReadiness.tsx:205`. It is rendered in `ProjectMarkets.tsx` and
  `MarketBlockers.tsx`.
- `CommitmentRowView` and `CommitmentFulfilDialog`, from S9's `Commitment*.tsx`.
- `getSurfaceMeta`.

**Order.**
1. D3-1. Its header renders `ProjectSettings` as today, without `request`, until D3-3 adds that prop.
2. D3-3.
3. D3-2, after D2-1 and D3-3.
4. D3-4.
5. D3-1b, as soon as D5-1 has landed.

`ProjectHome.tsx` is in all four main steps, so they run in sequence.

The spec's §0 table orders D3-1, D3-2, D3-3, D3-4, but its sections refer forward:
- D3-1's header (§4.2) passes `request={settingsRequest}` and calls `openSettings`. `request` is a new
  `ProjectSettings` prop that D3-3 adds (§4.9 item 2), and `ProjectSettings` has no such prop at HEAD.
- D3-2's About "Edit" also calls `openSettings`, and its Team card's "Manage" opens D3-3's Team drawer.
- D3-2's About card reads `targetWords`, which the spec exports from `ProjectPlan.tsx` only in D3-4.
- D3-2's Filing and Team rows read the lifted inbox and unified-work reads (§4.10). D3-4 was to move `ProjectRespond`
  and `ProjectWorkPanel` onto them, so in between each read would run twice.
- D3-2 takes `DossierReadinessCard` out of `ProjectSide`, but D3-4 was to add it to Author. In between, the card
  would be on no screen.

So D3-3 goes before D3-2, and D3-2 takes those pieces from D3-4.

### D4: the canvas and the editor (`D4.md` §0 gives the order)

| Step | Files |
|---|---|
| D4-1 CSS only | `authoring-v2.css`, `rich-section-editor.css`: the serif page, quiet notes, the one-row ribbon, outline rows, the page-scroll fix, dark `color-scheme` (scoped to `.ed` and `.dcv`) |
| D4-2 The bar (§D4.B) | `editor/DocumentWorkbench.tsx`, `editor/DownloadMenu.tsx` (export `useMenu` and `MenuItem`, add `MenuButton` and `compact`), `surfaces/AuthoringCreateExport.tsx` (`triggers` and `requests`), `surfaces/AuthoringCollab.tsx`, `editor/AuthoringOversightActions.tsx` (`variant="menu"`), and the §D4.L tests (helper `openEditorControl` in `editor/__tests__/workbenchAssemblyBuild.testSupport.ts`) |
| D4-3 The inspector (§D4.E, §D4.F) | `DocumentWorkbench.tsx`, `editor/ReviewTasksPanel.tsx` (`onClose` optional) |
| D4-4 The outline (§D4.C) | `DocumentWorkbench.tsx` |
| D4-5 Two placements and the chip (§D4.A, §D4.I) | `surfaces/DocumentAuthoring.tsx`, `editor/DocumentCanvas.tsx`, `editor/CanvasDocumentList.tsx` |
| D4-6 Writing surface and AnA (§D4.D, §D4.G, §D4.H) | `editor/RichSectionEditor.tsx`, `surfaces/AuthoringAiDraft.tsx`, `editor/DraftAlternatives.tsx`, `editor/authoringConversationOrigin.ts`, and the `.ed-tools` wrapper in `DocumentWorkbench.tsx` |
| D4-7 Other D4 screens (§D4.J) | `surfaces/Review.tsx`, `ReviewThreads.tsx`, `DocJourney.tsx`, `AuthoringEngine.tsx` |

`authoring-v2.css` changes in these ranges:
- 23–60, 62–217, 219–453 (including 368–380), 580–635, 1314–1466, 1531–1606, 1758, 1964–1990 and 2516–2580;
- the `.dlm-*` rules, all of which live in `authoring-v2.css`.

**D0 primitives used.**
- The artifact shell `.dcv-expanded` and `.dcv-bar` (§4.2.17, with D4's three corrections, §5.2 item 6).
- `.de[data-docked]` for the inspector.
- `.seg` and `.seg-b`; `.btn*`; `.sp-starter`; `.c2c-input`; `.rd-chip`.
- `.ph` and `.pj-sec-h` for Review; `.reg-kpis` (§4.2.7) for DocJourney.
- The `--fs-*` tokens, each written with a fallback.

**Other packages' files.**
- None is edited.
- It relies on D1's `ConversationThread.tsx` split DOM and the saved-editor handoff (`:1416–1443`).
- It edits only the split's CSS, `.ct-main[data-canvas-open] > .ct-conv` and `.ct-canvas-pane`. D0-2 also edits
  `.ct-canvas-pane`.
- It routes two items to D1 that D1's spec does not take (§5.2 items 7 and 8).
- The ledger gives `editor/StudyData*.tsx` to S3 as well. D4 does not change those files.

**Order.** D4-1 to D4-7 in sequence, as the spec sets them. D4-2, D4-3 and D4-4 all edit `DocumentWorkbench.tsx`
(6,699 lines). The `ci:canvas-path` gate (all six links) stays green at every step.

### D5: CMC / Module 3 and Biostatistics (`D5.md` §0)

| Step | TSX/TS | CSS |
|---|---|---|
| D5-0 The work-area pattern | none | `app-v2.css`: a new block directly after D0's foundations block. It holds `[data-work-area]` placement, the typographic `.pj-sec`, `.pj-more` generalised, `.wa-split`, and the 390 rules. Also `journey-v2.css` 287–291 (the `.sp-starters` grid default). It carries D1's `.sp-starters[data-layout="row"]` rule. |
| D5-1 The CMC frame | `surfaces/CmcModule.tsx` (`CMC_NAV.half`, the render, `CmStarters` and `CmHead` as functions, `Kpi` wrapper, `CmPush`; delete `CmConnectBar`; **drop the `StageBand` import**) | `journey-v2.css` 347–421 (the `.cm*` block; delete `.cm-connect*`); `app-v2.css`: D0 §4.2.18's `.cm-connect` neutralising rules and the `.cm-subtab` alias in D0's tabs `:is()` list (both names reach 0 here) |
| D5-2 CMC tab bodies | `CmcModule.tsx` (`CmOverview` … `CmPathway`; export `CmHead`), `cmcRegisters.tsx` (`RegisterCard`), `CmcModule3Build.tsx`, `CmcQuality.tsx`, `CmcPlaceIntoSubmission.tsx`, `CmcRegisterLinks.tsx`, `cmcShared.tsx` (the state-label map), `cmcAgencyQuestions.tsx`, `CmcSectionEvidence.tsx`, `cmcRecordHistory.tsx` (labels only) | `app-v2.css`: the `.cm-head`, `.cm-kicker` and `.cm-title` aliases in D0's header `:is()` lists, deleted when they reach 0 |
| D5-3 Biostatistics | `Biostatistics.tsx` (root, header; stop rendering `ResultLead`, then delete it), `biostatBridge.tsx`, `biostatEngineResult.tsx`, `engineResultHtml.ts` (`h1` to `h2` if it emits one) | `coverage-v2.css` 277–340 (`.bs-*`), and the `.c2c-v2 [data-work-area] .sp-row[aria-pressed="true"]` rule (`D5.md` §B.4 item 5). The spec names no sheet for it. It is a work-area rule, so D5-0's block in `app-v2.css` should carry it; otherwise D5-3 needs an `app-v2.css` turn. |
| D5-4 Biostat workbench | `BiostatWorkbench.tsx` | none |
| S7, S3 | behaviour only, on D5's layout | none |

**Ratchet.** D5-1 and D5-2 together take these names to 0, and the commit that reaches 0 deletes their aliases:
- `cm-subtab`, `cm-connect` and "This work flows into" (D5-1);
- `cm-head`, `cm-kicker` and `cm-title` (3 uses each across `CmcModule.tsx`, `CmcModule3Build.tsx` and
  `CmcQuality.tsx`; they reach 0 at the end of D5-2).

**D0 primitives used.**
- Layout and header: `.page-inner`, `.ph*`, `.pj-sec-h`.
- Controls: `.btn*`, `.c2c-input`, `.seg`, `.tabs` and `.tab`.
- Content: `.pj-card`, `.reg-kpis` and `.reg-kpi` (doors kept), `.rd-chip`, `.reg-tbl`.
- States: the `.c2c-empty-state` and the `.de` C2CForm drawers.
- `.sp-starter`.
- From D3: `.pj-back` (exists at `app-v2.css:1065`) and `.pj-sec-acts` (exists at `project-home-v2.css:440`).

**Other packages' files.** It drops the import of D3's `StageBand`. It reads `useShellProject` and `getSurfaceMeta`.

**Order.**
1. D5-0, first in Wave 1.
2. Then two lanes in parallel. Their TSX does not overlap, and their own sheets do not either (`journey-v2.css`
   against `coverage-v2.css`). But D5-1 and D5-2 also take `app-v2.css` turns for the alias deletions, and so does
   D5-3 if the `.sp-row` rule is not in D5-0:
   - CMC: D5-1, then D5-2 (both edit `CmcModule.tsx`).
   - Biostatistics: D5-3, then D5-4.

`COORDINATION.md` assigns D5 layout to the CMC session (`01GJidg5…`).

### D6: Tasks, Communication and Vault (`D6.md` §0)

| Step | TSX/TS | CSS |
|---|---|---|
| D6-1 Tasks | `surfaces/TaskBoard.tsx` (default view List, grouped by due date; starters using D1's `TRIAGE_ASK`; `[Mine \| Everyone]` seg; Analytics "By source"; `pj-more`); `surfaces/taskBoardAnalyticsScope.ts` (`projectName` argument) | `app-v2.css`: `.tb-src*` 798–800, `.tb-kanban*` 811–834, `.tb-col*`, `.tb-card*`, `.tb-an-*`, `.tb-gaps`, `.tb-alert`, `.tb-notice`. D6-1 re-values `.tb-alert` and `.tb-notice` in place itself: the spec's "D0's quiet inline note" (§A.4 item 10) is not in `D0.md`. The spec also lists `surfaces-v2.css:289` (`.ctable`); see §5.2 item 10. |
| D6-2 Communication | `CommunicationCenter.tsx`, `AgencyInbox.tsx` (`CC_CHANNEL_LABEL`, `CC_CLOSURE_LABEL`, letter rows), `AgencyResponses.tsx`, `HaMeetings.tsx` | `commcenter-v2.css` (8, 83–87, `.cc-btn*`, `.cc-inbox-head`). `cc-tab` reaches 0, so its alias in D0's tabs `:is()` list in **`app-v2.css`** goes in the same commit. |
| D6-3 Vault | `Vault.tsx` (views, tabs, docked record), `VaultSeals.tsx`, `VaultCatalogRecord.tsx`, `VaultCoverage.tsx`, `VaultFixityCheck.tsx`, `VaultGovernedArtifacts.tsx`, `VaultOrganizationArtifacts.tsx`, `VaultUploadStaging.tsx`, `VaultLibraryResults.tsx` | `misc-surfaces-v2.css` 350–560 (`.vd-*`), `coverage-v2.css:866`. The spec's `app-v2.css` `.vd-lane*`, `.vd-room*` and `.vd-cov*` do not exist (§5.2 item 11). |
| S9, S10, S6 | behaviour only, on D6's layout | none |

**D0 primitives used.**
- The WA block (D5-0).
- Header and controls: `.ph*`, `.btn*`, `.seg`, `.tabs` and `.tab`, `.c2c-input`.
- Content: `.reg-kpis`, `.reg-tbl`, `.pj-card`.
- The drawer `.de`, docked (`[data-docked]`) for the Vault record.
- The `.tb-detail` alias of the drawer (§4.2.14).
- The existing `.sp-list` and `.sp-row`.
- Not in D0: the "quiet inline note" that `D6.md` §A.4 item 10 cites for `.tb-alert` and `.tb-notice`. D0 defines no
  such primitive, so D6-1 writes those two rules itself.

**Other packages' files.**
- Imports `TRIAGE_ASK` from D1's `TaskTray.tsx`.
- `AgencyInboxList` (D6-2) is rendered by D3's `ProjectRespond.tsx`.

**Order.** The three steps share no TSX, so they are three parallel lanes. Two limits apply:
- D6-1 waits for D1-4.
- D6-3's `coverage-v2.css` edit queues behind D5-3 and D7-A1 on that sheet.

`COORDINATION.md` routes Vault layout through the coordinator.

### D7: Submission Center, Quality, risk-based monitoring, and Reporting & analytics (`D7.md` §0)

| Step | TSX/TS | CSS |
|---|---|---|
| D7-A1 Submission Center | `SubmissionCenter.tsx` (root, header, starters, context row, tabs, Submissions section), `SubmissionProgramAnchor.tsx` | `coverage-v2.css` 450–470 (`.sc-*`; add `.sc-context`). `sc-ws` reaches 0, so its alias in D0's tabs `:is()` list in **`app-v2.css`** goes in the same commit. |
| D7-A2 Workspaces and the one verdict | `SubmissionSeqWorkspaces.tsx`, `SequenceAssembleTestPackage.tsx`, `SubmissionRequiredDeliverables.tsx`, `DispatchReadiness.tsx` (`AnswerLead emphasis="verdict"`; head and foot) | the `.dr2-*` head rules in `coverage-v2.css` |
| D7-A3 Compile & export | `EctdCompile.tsx` (header, Format seg with `version` lifted), `EctdCompileReference.tsx`, `EctdModuleReadiness.tsx`, `EctdCompileDtdEvidence.tsx`, `EctdFiledState.tsx` | none named |
| S5 reach | `EctdCompileReference.tsx` / `EctdCompile.tsx`: an "eCTD 4.0 preview" calling the existing `POST /api/ectd/v4/forward-compat` | none |
| D7-B Quality (**after the ledger fix**) | `quality/App.tsx`, `SopRegister.tsx`, `ChangeControl.tsx`, `QmsRecords.tsx`, `qmsRegisterKit.tsx`; **`quality/ControlledDocumentDialogs.tsx`**, whose `ControlledDocumentSetup` template select (`:97–103`) is the "first field" of §B.4 item 5. It shows `t.label` only today, and the item asks for the number prefix as the hint and the description per option. | `quality/app.css` |
| D7-C Risk-based monitoring | `Rbm.tsx`, `RbmSurfaces.tsx` (`RbmAnaDock` on `.de[data-docked]`), `RbmSurfacesA.tsx`, `RbmSurfacesB.tsx`, `RbmIngest.tsx` | `rbm-v2.css` (16, 19–21, 35–51); `app-v2.css`: add `.rbm-ana-composer` to D0's composer `:is()` lists, unless D0-2 already did (§0 item 4) |
| D7-D Reporting & analytics | `Insights.tsx`, `Insights*Panel.tsx` (`Bundles`, `Catalog`, `Runs`, `Schedules`), `ComplianceReports.tsx` | `insights-v2.css` (8, 24, 54, 81, 182–185, 262); `app-v2.css`: add the find field's selector to D0's composer `:is()` lists, unless D0-2 already did (§5.2 item 20) |
| S8, S11 | behaviour only, on D7's layout | none |

**D0 primitives used.**
- The WA block.
- Header and controls: `.ph*`, `.btn*`, `.seg`, `.tabs`, `.c2c-input`.
- Content: `.reg-kpis`, `.reg-tbl`, `.rd-chip`, `.pj-card`.
- The drawer `.de[data-docked]` for the RBM dock; dialogs `.cl-modal` and `.rbm-modal` (§4.2.15).
- Composer chrome for `.rc-composer` and `.rbm-ana-composer`. **D0 does not define these yet.** §4.2.16's list is
  `.landing-composer`, `.pj-composer` and `.ct-composer`, and it adds the other two only "when their owners (D4, D7)
  confirm". D7 §C.4 item 6 says D0 "names it", and §D.4 item 3 says `.rc-composer` "is in D0 §4.2.16's list". Both
  are wrong against `D0.md`, including the working-tree amendment. See §0 item 4.
- `AnswerLead emphasis="verdict"` (D0-4).

**Other packages' files.** D3's Submit step renders `MarketGateDetail` from `DispatchReadiness.tsx`.

**Order.**
- D7-A1, then D7-A2: A2 moves the "Working sequence" select into A1's context row, and A2 also needs D0-4.
- D7-A3, then the S5 reach (same file).
- D7-B, D7-C and D7-D are independent lanes.

`COORDINATION.md` assigns Submission Center's layout to the RIM session (`011e42…`).

---

## 2. Conflict matrix

### 2.1 Stylesheets

The rule (plan §4.6): one session holds a sheet at a time. That holder commits, pushes, regenerates
`surface-text-ramp.css`, and releases. Ranges are as the specs cite them; they drift (see the header).

| Sheet | Who edits it, and where | How to sequence it |
|---|---|---|
| `styles/app-v2.css` | **D0-1:** root 68–77, the `.small` utility, plain links. **D0-2:** the foundations block after `:190`, plus about 25 deletions (175–190, 214–262, 436–442, 495–517, 701–736 neutralised, 848 and 989–990 drawer aliases, 1103–1110, 1123, 1127–1129, 1185–1221, 2053–2068, 2077, 2152, 2178–2179, 2194, 2242, 2513–2515, 2582, 2589, 2778–2786). **D0-4:** 3572–3588 (`.al-*`). **D5-0:** the WA block after D0's block. **D1:** 845–902, 1361–1373, 1392–1468, 1478–1545, `.tb-task` 2068–2075, 1698–1735, 2351–2384, 2658–2837, `.scaf-note[aria-busy]`. **D2-2:** 3168–3260. **D3-1:** 690–736 and 1063–1245. **D3-1b:** 701–736 and 1103–1107 (`.pj-stageband*`). **D6-1:** the `.tb-*` board rules (798–834 and the rest). **Ratchet-zero alias deletions** in D0's `:is()` lists: D1-6 (`landing-newproj`), D5-1 and D5-2 (`cm-*`, and §4.2.18's `.cm-connect` rules), D6-2 (`cc-tab`), D7-A1 (`sc-ws`). **Composer-list additions:** D7-C (`.rbm-ana-composer`) and D7-D (the find field), unless D0-2 takes them (§0 item 4). **D5-0 or D5-3:** `[data-work-area] .sp-row[aria-pressed="true"]`. **Asked of D0 by D4 (now in the working-tree `D0.md`, §5.2 item 6):** `.c2c-v2.dark { color-scheme: dark }`, `.scaf-note` (2296), `.nda-open` (2619). | D0-1, D0-2, D0-3, D0-4, then D5-0, then one holder at a time. The overlaps are real: D3-1's range contains D0-2's deletions (1103–1129, 1185–1221) and D0 §4.2.18 (701–736); D1-5's range contains D0-2's composer edit (2778–2786); D1-4 adjoins D0-2's `.tt-panel` edit (848). So none of them starts before D0-2. **This sheet is the bottleneck:** about 15 separate commits want it after D0. |
| `styles/surfaces-v2.css` | **D0-2:** 14–19 and 30, 43 (composer, `.landing-newproj`), 60, 149–151 (`.seg`), 201–203 (`.tabs`), 250 (`.btn.sm`), 289 (`.ct-head`). **D1-6:** 8–12, 23, 40, 49–89 (including 76–77). **D2-1:** 146–148. **D6-1:** lists 289 (`.ctable`). | D0, then D1-6 and D2-1 one at a time. D6-1 does not edit 289 (§5.2 item 10). |
| `styles/journey-v2.css` | **D0-2:** 10–11, 94–98, 110, 274–295 (`.sp`, `.sp-head`, `.sp-primary` hover, `.sp-starter`), 349–356, 391–395 (neutralised), 436, 459–538 (drawer, inputs, toast). **D3-1:** 40. **D5-0:** 287–291. **D5-1:** 347–421. | D0-2, then D5-0, then D5-1. D3-1's single line can go in any free slot after D0-3. |
| `styles/project-home-v2.css` | **D0-2:** 37–50. **D2-1:** 11–51, which includes 37–50, already gone. **D2-2:** 52–230. **D3-1 and D3-2:** 314, 432–440, 510–513, 549–569. | D0-2, then D2-1, then D2-2. The D3 ranges are disjoint but still take turns. |
| `styles/coverage-v2.css` | **D0-2:** 204–209, 811, 857–861, 450–451 (the tab alias). **D0-4:** 245–261. **D5-3:** 277–340. **D7-A1:** 450–470. **D7-A2:** `.dr2-*`. **D6-3:** 866. | D0, then D5-3, D7-A1, D7-A2 and D6-3 one at a time. |
| `styles/misc-surfaces-v2.css` | **D0-2:** 27–28, 55–73, 709–719, the `.sp-head` restatement, `.pdev-toast`. **D6-3:** 350–560. | D0, then D6-3. |
| `styles/commcenter-v2.css` | **D0-2:** the `.sp-head` restatement and the `.cc-tabs` alias. **D6-2.** | D0, then D6-2. |
| `styles/authoring-v2.css` | **D0-2:** §4.2.17, 1470–1537 and 1620–1640, and `.ct-canvas-pane`. **D1-5:** the `.ct-ana-text.ana-md` block. **D4-1 to D4-7:** the ranges in §1. **D4's "Chip and list"** (1531–1606) overlaps **D0's shell** (1470–1537). `.sp-primary` is still used here at 2508 (D6 §C.4.12). | D0-2, whose §4.2.17 must take D4's corrections or leave D4's lines alone (§5.2 item 6). Then D4-1. D1-5's one block goes between two D4 steps. |
| `styles/rich-section-editor.css` | D0-3 (sweep); D4-1; D4-6. | D0-3, then D4. |
| `styles/rbm-v2.css` | **D0-2:** 409 (`.rbm-modal` alias). D0-3. **D7-C.** | D0, then D7-C. |
| `styles/insights-v2.css` | D0-3. **D7-D.** | D0, then D7-D. |
| `styles/ana-v2.css` | D0-3. **D1-5** (§0.1). | D0, then D1. |
| `styles/project-settings.css` | D0-3. **D3-3.** | D0, then D3-3. |
| `styles/ectd-v2.css` | D0-3. `.ec-composer` waits for an owner (§5.2 item 13). | D0 only. |
| `styles/admin-access.css`, `workflows-v2.css`, `submission-v2.css` | D0-2 and D0-3 only. | D0 only. |
| `styles/pyramid-v2.css` | D0-3. S11 also owns it. | D0, then S11. |
| `styles/surface-text-ramp.css` | **Generated** (`node scripts/design/generate-surface-text-ramp.mjs`). Regenerated by D0-3 and by every step that changes casing or text size (D1, D2-1, D3, D4, D5, D6, D7). | Never merged by hand. The holder of the sheet that changed regenerates it after rebasing. |
| `design-system/colors_and_type.css`, `README.md`, `preview/*` | **D0-1, D0-3, D0-5** only (D0's paths). D4 asks that `p` lose `font-family` and that the README name the menu pattern. | D0 only (§5.2 item 6). |
| `client/src/concept2cure/quality/app.css` | **D7-B** after the ledger fix. Otherwise F1 runs the sweep (D0 §4.8). | One of the two, not both. |

### 2.2 Components and modules needed by more than one package

| File (ledger owner) | Also needed by | Constraint |
|---|---|---|
| `surfaces/ProjectStages.tsx` (D3) | D5: `CmcModule.tsx:79` imports `StageBand`, rendered at `:3152` | D3 §4.6 item 2 deletes `StageBand`; D5 §A.4 step 3 drops the import. **D5-1 must land before the deletion**, or the build breaks. This is why D3-1 is split into D3-1 and D3-1b. |
| `surfaces/ProjectPortfolioFilters.tsx` (D2) | D3-2's About card imports `WS_LABEL` | D2-1 before D3-2. |
| `TaskTray.tsx` (D1; also S9) | D6-1 and D1-6 use `TRIAGE_ASK` | The constant does not exist (`TaskTray.tsx:251` inlines the ask). D1-4 exports it first; a copy would break zero duplication. |
| `surfaces/ConversationThread.tsx` (D1) | D1-6 uses `STARTER_ASKS` (`:73`, not exported today). D4 uses the split DOM and handoff (`:1416–1443`) without editing them. | D1-5 before D1-6. D4's canvas tests (`conversationThreadCanvas`, `canvasAutoOpen`, `canvasDocumentsList`) run in D1-5's commit. |
| `surfaces/AgencyInbox.tsx` (D6; S10) | D3-4 lifts `useAgencyInbox`; `ProjectRespond.tsx` renders `AgencyInboxList` | Either order. D3's Respond acceptance runs again after D6-2 (`D6.md` §0). |
| `surfaces/DispatchReadiness.tsx` (D7; S5) | `MarketGateDetail` is rendered by D3's `ProjectMarkets.tsx` and `MarketBlockers.tsx` | Either order. D3's Submit acceptance (`D3.md` §6 item 12) runs again after D7-A2. |
| `surfaces/AnaVerbs.tsx` (D1, which does not change it) | D2-2 restyles `RegistryPicker` (`.rpk-*` in `app-v2.css`) | CSS only. D2 announces the change to D1. |
| `surfaces/ProjectDiscoveryHandoff.tsx` (D3) | D2 §2.4 item 5 | D3-4 makes the change. |
| `surfaces/projectWords.ts` (D3; S1) | D1-6 and D2-1 import `enumWords` | Read only. |
| `surfaces/projectSettingsRequest.ts` (D3; S1) | S1 adds `useProjectObjective`; D3 renders `ProjectObjective` | D3 renders nothing until S1's hook exists (`D3.md` §4.3). |
| `AnswerLead.tsx` (D0) | D7-A2 (`emphasis`); D5, D6 and D7 delete renders | D0-4 before D7-A2. |
| `client/src/concept2cure/v2/useDialog.ts` (the ledger lists `useDialog.tsx`, D0 §0) | D3-3 (settings and Team drawers) | Used as it is. No package edits it. |

**Files the specs need that their package does not own:**

| File | Needed by | Who can commit it |
|---|---|---|
| `surfaces/Surfaces.tsx`, `workDock.ts`, `surfaceViews.ts` | D1 | D1 after a `Plan: PLAN` ledger fix (`D1.md` §0.2) |
| `client/src/concept2cure/quality/**` | D7-B | D7 after a ledger fix, or F1 (`D7.md` §0) |
| `shared/constants/ui-surface-registry.ts:233` | D4 routes the crumb label to D1 | S1 or F1 (§5.2 item 7) |
| `registryModel.ts` | D5 §8 item 1, D6 §8 item 1 | F1, R1, L1 or PLAN |
| `shared/types/submission-ui.ts` | D7 §8 item 2 | Not a D7 path |
| `server/services/c2c/project-portfolio.ts` | D2 | S11 or F1 |
| `server/routes/c2c/projects.ts`, `server/routes/charters.ts` | D2 and D3 | S1 |
| `v2/ProjectSkills.tsx` | D3 | Unowned; D3 changes its CSS only |
| `Company*.tsx` | D6 §8 item 3 | S10 or F1 |
| `surfaces/EctdCoauthor.tsx` | D0 §4.2.16 | A D7 path that no D7 section covers |

### 2.3 Test files several packages edit

- **`__tests__/foundationsRetiredRatchet.test.ts` (D0).** Each package lowers the baseline for the names it reduces,
  and deletes the alias at 0, in the same commit. Those packages are:
  - D1-6;
  - D3-1b;
  - D4-7 (the `reg-*` names in `DocJourney.tsx` and `AuthoringEngine.tsx`);
  - D5 (`cm-*`, `reg-cta`);
  - D6 (`cc-tab`, `btn sm`);
  - D7 (`sc-ws`, `reg-*`, `reg-cta`);
  - F1, for the unowned uses.

  Two commits must not edit this file at the same time. The names whose every use sits in one D package, by a regex
  count over client TSX at `b7c7cf9f0` (the test's TypeScript parser is authoritative):

  | Package | Names that reach 0 |
  |---|---|
  | D5 | `cm-head`, `cm-kicker`, `cm-title`, `cm-subtab`, `cm-connect`, "This work flows into" |
  | D1 | `landing-newproj` |
  | D7 | `sc-ws` |
  | D6 | `cc-tab` |
  | D3 | `pj-stageband`, "What to do now" |
  | D6 (the spec keeps them; §5.2 item 12) | `cl-toast`, `tb-detail` |
  | D7 (the spec keeps it) | `rbm-modal` |

- **`foundationsOneDefinition.test.ts` and `foundationsSentenceCase.test.ts` (D0).** Every package's CI reads them,
  and edits to the sentence-case allowlist must take turns.
- **The `ConversationThread` suites.** D1-5 rewrites `conversationThreadShellChat`, `conversationRemembers` and
  `runPolicySwitch`; D4 rewrites the canvas suites. Each package runs the other's set.
- **The `projectHome*` suites (D3).** D6-2 and D7-A2 also run `projectRespondStage` and the Submit tests.

### 2.4 S packages on D files (each package's ledger paths)

| S package | D-package files in its paths | Rule |
|---|---|---|
| S1 | `Projects.tsx` (D2); `ProjectHome.tsx`, `Project*.tsx`, `project*.ts` (D3) | Behaviour only. One session per file. The objective field ships with its server half in one commit. |
| S3 | `Biostat*.tsx`, `biostat*.ts*` (D5); `editor/StudyData*.tsx` (D4) | Behaviour only. |
| S5 | `Submission*.tsx`, `Ectd*.tsx`, `DispatchReadiness.tsx` (D7) | Behaviour only. The 4.0 preview is S5's commit. |
| S6 | `Vault*.tsx`, `vault*.ts` (D6) | Behaviour only. |
| S7 | `Cmc*.tsx`, `cmc*.ts*` (D5) | Behaviour only. |
| S8 | `Rbm*.tsx`, `rbm*.ts*` (D7) | Behaviour only. |
| S9 | `Task*.tsx`, `task*.ts*` (D6); `TaskTray.tsx` (D1); `ProjectTeam*.tsx`, `ProjectPlan.tsx` (D3); `Commitment*.tsx` | Behaviour only. |
| S10 | `AgencyInbox.tsx`, `CommunicationCenter*.tsx`, `AgencyResponses*.tsx` (D6); `ProjectRespond.tsx` (D3) | Behaviour only. |
| S11 | `Projects.tsx` (D2); `ProjectPlan.tsx` (D3); `Insights*.tsx` (D7); `pyramid-v2.css` | Behaviour only. |

Plan §3: "When a screen is in a queued design package's files, the S package changes only behaviour there, never the
layout." D1–D7 are `open`, so either the S commit lands first and the D step rebases, or the reverse. Two sessions
never hold the same file at once.

---

## 3. Waves and the critical path

**Wave 0: now, held by the coordinating session.**
- D0-1, then D0-2, then D0-3, then D0-4, in that order. D0-5 can go at any time (`design-system/**` only).
- Meanwhile, with no `client/` file touched:
  - the two ledger fixes (D1 and D7) are decided;
  - D4's §D4.K corrections and asks are given to the D0 builder before D0-2. At this review the working-tree `D0.md`
    carries them, not yet committed;
  - D7 confirms `.rbm-ana-composer` and the Insights find field as text composers, so that D0-2 can list them
    (§0 item 4). Otherwise D7-C and D7-D add them later;
  - S1 (the charter read and versioned write) and S11 (the portfolio projection) can proceed on the server only.

**Wave 1a: after D0-4 is pushed and the `styles/**` lock row is deleted.** D0-4 is the last D0 step that edits a v2
sheet: it changes `.al-*` in `app-v2.css` and `coverage-v2.css`.
- **D5-0, alone on `app-v2.css` and `journey-v2.css`.** It is one short commit to those two sheets. It carries
  `.sp-starters[data-layout="row"]` and the generalised `.pj-more` and `.pj-sec` rules. It should also carry the
  `[data-work-area] .sp-row[aria-pressed="true"]` rule (§1, D5-3).
- **Beside it, D4-1 and D2-1 may start.** D4-1 touches only `authoring-v2.css` and `rich-section-editor.css`, and
  D2-1 only `project-home-v2.css` and `surfaces-v2.css` 146–148. Neither uses a work-area rule. Starting D2-1 here
  also brings forward D3-2, which waits for it.

**Wave 1b: parallel lanes.** No two lanes share a TSX file that a spec changes. (L4's ledger glob `Project*.tsx`
also matches L3's three files; see the L4 row.) The CSS goes through the per-sheet holder (§2.1). L1, L3, L4, L5, L7 and
L9 each take at least one `app-v2.css` turn, for their own rules or for a ratchet alias deletion. L10 and L11 take
one unless D0-2 adds their composer selectors, and L6 takes one unless D5-0 carries the `.sp-row` rule. L2 and L8 take
none.

| Lane | Steps, in order | TSX files | Sheets | Session (`COORDINATION.md`) |
|---|---|---|---|---|
| L1 Shell | D1-4, D1-1, D1-2, D1-3, D1-6a (step 7 and D1-6's CSS, except the `.landing-settings` popover rule), D1-5, D1-6b (steps 1–6 and that rule, after PLAN), D1-7 | `Shell.tsx`, `V2App.tsx`, `TaskTray.tsx`, `OpenWork.tsx`, `Notification*.tsx`, `AnaWorkPanel.tsx`, `Home*.tsx`, `ConversationThread.tsx` (and, after PLAN, `Surfaces.tsx`, `workDock.ts`, `surfaceViews.ts`) | `app-v2.css`, `surfaces-v2.css`, `ana-v2.css`, one block of `authoring-v2.css` | coordinator |
| L2 Editor | D4-1 to D4-7 | `editor/**`, `Authoring*.tsx`, `DocumentAuthoring.tsx`, `DocJourney.tsx`, `Review*.tsx` | `authoring-v2.css`, `rich-section-editor.css` | coordinator |
| L3 Projects | D2-1, D2-2, then S1's objective field | `Projects.tsx`, `ProjectPortfolioFilters.tsx`, `ProjectClientFilter.tsx` | `project-home-v2.css` 11–230, `surfaces-v2.css` 146–148, `app-v2.css` `.rpk-*` | coordinator |
| L4 Project page | D3-1; D3-3; D3-2 (after D2-1 and D3-3); D3-4; D3-1b (after D5-1) | `ProjectHome.tsx`, `ProjectStages.tsx`, `ProjectSide.tsx`, `ProjectRecords.tsx`, `ProjectRecordedContext.tsx`, `ProjectCoreWork.tsx`, `ProjectDossier.tsx`, `ProjectMarkets.tsx`, `ProjectSettings.tsx`, `ProjectTeamResponsibilities.tsx`, `ProjectTeamSharing.tsx`, `ProjectPlan.tsx`, `ProjectRespond.tsx`, `ProjectDiscoveryHandoff.tsx`, `fixtures/project-home-data.tsx`. These are named, not globbed, because `Project*.tsx` (D3's ledger glob) also matches L3's `Projects.tsx`, `ProjectPortfolioFilters.tsx` and `ProjectClientFilter.tsx`, which the gate would admit under `Plan: D3`. | `app-v2.css` `.pj-*`, `project-home-v2.css` 314–570, `journey-v2.css:40`, `project-settings.css` | coordinator |
| L5 CMC | D5-1, D5-2 | `Cmc*.tsx`, `cmc*.ts(x)` | `journey-v2.css` 347–421; `app-v2.css` (the `cm-*` aliases and §4.2.18's `.cm-connect` rules) | CMC session `01GJidg5…` |
| L6 Biostatistics | D5-3, D5-4 | `Biostat*.tsx`, `biostat*.ts(x)`, `engineResultHtml.ts` | `coverage-v2.css` 277–340 | CMC session (D5) |
| L7 Communication | D6-2 | `CommunicationCenter.tsx`, `AgencyInbox.tsx`, `AgencyResponses.tsx`, `HaMeetings.tsx` | `commcenter-v2.css`; `app-v2.css` (the `cc-tab` alias) | coordinator |
| L8 Vault | D6-3 | `Vault*.tsx` | `misc-surfaces-v2.css` 350–560, `coverage-v2.css:866` | through the coordinator |
| L9 Submission | D7-A1, D7-A2 (needs D0-4); D7-A3, then the S5 reach | `Submission*.tsx`, `Sequence*.tsx`, `Dispatch*.tsx`, `Ectd*.tsx` | `coverage-v2.css` 450–470 and `.dr2-*`; `app-v2.css` (the `sc-ws` alias) | RIM session `011e42…` |
| L10 RBM | D7-C | `Rbm*.tsx` | `rbm-v2.css`; `app-v2.css` (the composer list, unless D0-2 took it) | coordinator |
| L11 Reporting | D7-D | `Insights*.tsx`, `ComplianceReports.tsx` | `insights-v2.css`; `app-v2.css` (the composer list, unless D0-2 took it) | coordinator |

**Wave 2: these start when their inbound edge lands.**

| Step | Waits for |
|---|---|
| D6-1 Tasks | D1-4; uses `app-v2.css` `.tb-*` |
| D3-2 | D2-1 and D3-3 (§1, D3 order) |
| D3-1b | D5-1 |
| D7-A2 | D7-A1 and D0-4 |
| D7-B | the Quality ledger fix |
| D1-6 steps 1–6 and D1-5 step 9 | the D1 ledger fix |
| S1's objective field | D2-2 and S1's server half |
| `ProjectObjective` rendering | S1's hook |
| D2's description card line | the S11 or F1 projection (not blocking) |

**Wave 3: cross-acceptance, evidence and close.**
- D3's Respond runs again after D6-2, and D3's Submit after D7-A2.
- The crumb words wait for the `ui-surface-registry.ts` label (§5.2 item 7).
- Each package then files its evidence under `docs/evidence/DESIGN/<ID>/`, gets its six-lens review, and is closed
  under `Plan: PLAN` (plan §3).
- Evidence captures need a window when no session is editing `client/`. `D3.md` §8 item 4 saw Vite reload the page
  twice during capture.

**The critical path.**
- **The dependency chain:** D0-1, D0-2, D0-3, D0-4, D5-0, D5-1, D3-1b. No D5, D6 or D7 step can start before D5-0.
  D3 closes last of the dependency chains: it also waits on D2-1 and D3-3 (for D3-2), and it re-runs its acceptance
  after D6-2 and after D0-4, D7-A1 and D7-A2.
- **The longest lane by volume: D4.** It has seven serial steps. D4-2 to D4-4 are in one 6,699-line file, and §D4.L
  lists about 40 test files. It has no inbound edge after D0-4, so it should start first, in Wave 1a beside D5-0.
- **The throughput limit: `app-v2.css`.** About 15 post-D0 commits need it:
  - D5-0;
  - seven D1 slices;
  - D2-2;
  - D3-1 and D3-1b;
  - D6-1;
  - the ratchet alias deletions of D1-6, D5-1, D5-2, D6-2 and D7-A1;
  - D7-C's and D7-D's composer-list additions, unless D0-2 takes them.

  Keep each `app-v2.css` change a small, CSS-only commit, so the holder releases the sheet quickly.

---

## 4. Acceptance: what needs the running app, and what a test can prove

A test can prove a check that a unit or text test can pin: DOM order, roles and names, text, handlers, state, label
maps, absent strings, CSS as text, and ratchet counts. That does not exempt the screen from being seen:
- plan §3 step 3 requires 1440 and 390, light and dark, screenshots of the running app for every package;
- RULE 4 says "a screen is not done until it was opened in the running app and used".

Two facts about the seeded stack (`http://127.0.0.1:5100`):
- `POST /api/ana-ri/stream` answers 503 there (`D1.md` header). A check that needs AnA's **reply** cannot pass on
  that stack. Sending the question can still be checked.
- Captures need a quiet `client/` (§3, Wave 3).

### D1

**A unit or text test can prove:**
- **Sidebar (A):**
  - §D1.A 7 (`shellChromeTruth`);
  - A 1, the first two rows are New conversation and Search (`shellQuietChrome`);
  - A 4, Recents lists projects then conversations, and a failed project read hides only the projects (mocked fetch,
    `railRecents`);
  - A 5, the account button's second line is the organisation; the menu item opens the drawer, and Escape returns
    focus.
- **Top bar (B):**
  - B 1, exactly three buttons and no text (`shellQuietChrome`);
  - B 2, the crumb text and `aria-current` (`topBarProject`, `projectFeatureBreadcrumb`);
  - B 3, the accessible name contains "overdue";
  - B 6, ⌘⇧T and Get help.
- **Home (C):** C 3 (`homeEngine`); C 4, a starter sends or navigates; C 5, the Manual chip shows; C 6, the row text.
- **Conversation (E):**
  - E 4, the header controls by name and test id;
  - E 5, a default-hidden dock with no `.ct-side` (`workDock` unit test plus a render);
  - E 6, the popover's radiogroup (`runPolicySwitch`);
  - E 7, the named suites;
  - E 10, the failed send's honest line (mocked 503);
  - the `conversationReadingColumn` CSS-text checks: the `.ct-col` measure, no `.ct-ana-av` rule, and the serif
    override.
- **⌘K (F):** F 1, the group names; F 2, the results and Enter; F 3, New task.
- **Your work (G):** G 2, the dot rule; G 3 (`taskTrayHonestReads`).
- **Package (J):** J 6, the honest failed-read states (mocked fetch).

**Needs the running app:**
- **Colour:**
  - every orange count (A 1, C 2, J 2);
  - the `--bg-200` fill and its dark values (A 3, B 5, C 8, E 9, J 7).
- **Type:**
  - Lora 32 and 26 px for the greeting;
  - prose at 16 px with a 26.4 px line height;
  - nothing under 12 px (E 2, J 3).
- **Layout:**
  - `.home-below` starts at or below 852 px (C 1);
  - `.ct-col` is centred and 768 px wide (E 1);
  - the 390 drawer is 300 px and the rail has `display: none` (A 6);
  - `scrollWidth` at 390 (C 7, E 8, J 4);
  - 44 px under `pointer: coarse`.
- **Behaviour:**
  - the popover opens unclipped (C 5);
  - the spark pulses, and reduced motion stops it (E 3);
  - the focus order starts at Skip to content (J 5);
  - the drive strip's position and its tour (H);
  - the zero-loss ledger walk (J 8).

### D2

**A unit or text test can prove:**
- **Projects (§1.6):**
  - 1, no `.ph-eyebrow`; 3, no "Ask AnA";
  - 5, the card's structure: no bar, no chip, the `.pj-card-m` and `.pj-card-r` text;
  - 6, the placeholder text;
  - 7, `.pj-summary` comes after `.ctable`, with its text and its em dashes on failure (mock);
  - 8, the filter leaves one card and the URL carries `ws=MDX`;
  - 12, the rewritten tests.
- **New project (§2.6):**
  - 3, no `.c2c-empty-state` in `.npw`, and the objective field once S1 lands;
  - 4, the Review rows' text;
  - 5, Escape and focus return;
  - 7, the wizard tests, and S1's POST-body test.

**Needs the running app:**
- the computed uppercase, the orange count, and Lora 26 / 22 (§1.6 items 1–3);
- the toolbar is at most 40 px high at 1440 (4);
- the card's radius and padding (5);
- the 390 layout: two selects per row, New project on its own row, `scrollWidth` (9);
- one focus ring (10);
- the dark hover (11);
- §2.6 items 2 (border colours) and 6 (the step rail scrolls; 44 px).

### D3

**A unit or text test can prove:**
- 1, the DOM order by `compareDocumentPosition`, and the side cards in order on every step.
- 3, in part: no `pj-stageband` test id, and no "What to do now" or "Next step".
- 4, the byline text and the settings button's name.
- 5, the objective's states, with the hook mocked.
- 6, a starter fills the box and sends nothing; `C2C_CONVO` is unchanged; Enter opens the thread.
- 7, six `.seg-b` with `aria-current` and `data-on`.
- 8, Plan's rows are sorted, there is no Team section, and the `workId` handoff opens Plan.
- 9 and 10, the sections and doors (with an `onNav` spy), and no `.pj-map-ring`.
- 11, Review has no tasks list, and Respond shows the Commitments empty state.
- 12, the Filing, Team, Work areas and Records text and clicks (mocked reads); Escape and focus for the Team drawer.
- 13, the governed confirmation flow.
- 16, `anaContext` reads `'unavailable'` when a read is blocked.
- `tests/ui/pj-title-authority.test.ts` and `projectHomeStageCss`.

**Needs the running app:**
- 2, the main column has the same width on all six steps;
- 3, the computed uppercase and orange;
- 4, Lora 26 / 22;
- 6, the composer chrome (radius 20, `--canvas-elevated`);
- 7, the active fill in light and dark, and the track scrolls at 390;
- 13, the drawer is 440 px with no `backdrop-filter`, and full width at 390;
- 14, phone;
- 15, dark and contrast;
- the seeded values: "6 open · next due Nov 5", "0 of 72 sections", "Dispatch blocked · 4 blockers".

### D4

**A unit or text test can prove:**
- the §D4.L rewrites: menu items, test ids, inspector tabs by role, `ReviewTasksPanel`'s optional `onClose`, the More
  formatting row;
- §D4.O 6, the right inspector tab opens, and Escape returns focus;
- 7, the outline toggle persists (`localStorage` in jsdom);
- 8, `EsignModal` opens and Cancel returns focus;
- 9, the ✻ menu fills the composer and opens `ai-draft-panel`;
- 10, the chip has no `.dcv-actions` or `.dcv-body`;
- 14: `ci:canvas-path`, `ci:one-product`, `tests/ui/one-shell.test.ts`.

**Needs the running app:**
- 1, one visible `.dcv-bar`, `scrollTop` 0 after 6 s, the bar's top at 48;
- 2, the computed uppercase;
- 3, the orange count before and after one keystroke;
- 4, Lora 16 px with a 27.2 px line height, and a column of at most 720 px;
- 5, the bar is at most 52 px high with at most 12 (or 6) visible buttons, each at least 44 px at 390;
- 6, the inspector overlays without moving the page's scroll;
- 11, phone; 12, dark (the `color-scheme` checkbox, contrast); 13, reduced motion;
- §D4.A: the URL change on "Show the conversation", and `.ct-conv` is 420–560 px;
- Download gives a real file.

### D5

**A unit or text test can prove:**
- **The pattern (§WA.6):**
  - 1, the `data-work-area` attribute is present;
  - 2, exactly one `h1.ph-title` with the rail label's text;
  - 5, no plain `.al-lead`, and none of the banned strings;
  - 6, at most three starters, and a click calls `onAsk`.
- **CMC (§A.6):**
  - 2, the tab and half state;
  - 3, `cmc.open-tab` and `__cmSetTab` (existing tests);
  - 4, as a structural proxy: the `.btn.primary` count per tab;
  - 8, the named tests.
- **Biostatistics (§B.6):**
  - 3, the editor handoff and the save-reuse rule (mocked);
  - 4, no visible 12-hex or `AAA-000` text in the rendered DOM;
  - 5, the assessment heading's text;
  - 7, the named tests.

**Needs the running app:**
- **The pattern:** WA 1, `max-width` computes to 1120; 2, Lora 26 / 22; 3, uppercase; 4, orange fills; 7, the 390
  checks; 8, dark; 9, visible focus.
- **CMC:** A 1, the first viewport's contents; A 5, Substance & product is under 1,600 px; A 6, row actions are not
  clipped, and the table scrolls inside its section.
- **Biostatistics:** B 2, the artifact's 48 px bar, Lora 16 and 72ch; B 6, the 390 order and padding.
- **Blocked on the stack:** A 7 needs AnA's reply ("cites the section count").

### D6

**A unit or text test can prove:**
- **Tasks (A):**
  - A 1, the List is the default, with its group headings and sort (mock);
  - A 2, the `ph-sub` text, and the scope note names the project (a `taskBoardAnalyticsScope.ts` unit test);
  - A 3, one `.btn.primary`;
  - A 4, `tasking.set-view` and `tasking.filter`.
- **Communication (B):**
  - B 1, the `ph-sub` text and one primary;
  - B 2, a letter's actions and the pinned hand-off (mock);
  - B 4, the absent string;
  - B 6, `ProjectRespond` still renders the letters.
- **Vault (C):**
  - C 3, `vault.search` switches to Library;
  - C 4, Add files switches to Uploads;
  - C 6, the seal and fixity handlers.

**Needs the running app:**
- A 5, the board scroll-snaps and the page does not scroll sideways (today +205 px);
- A 6, dark contrast at 3:1;
- B 3, the computed monospace;
- B 5, 390;
- C 1, the library is above the fold;
- C 2, the orange and uppercase counts (uppercase today: 97);
- C 5, the record docks at 1440 and becomes a drawer at 1100, by media query;
- C 7, 390;
- the WA checks.

### D7

**A unit or text test can prove:**
- **Submission Center (A):**
  - A 2, the banned strings are absent;
  - A 3, exactly one `.al-lead[data-emphasis="verdict"]` reading "Not yet. …", whose fix acts open their workspaces;
  - A 4, the context-row select drives Builder, Validation and Dispatch;
  - A 5, the Format seg exists, and `POST /api/ectd/v4/forward-compat` is called (fetch mock);
  - A 6, the named tests.
- **Quality (B):** the type field lists nine templates and creates the same document; the `quality/__tests__`
  rewrites.
- **Risk-based monitoring (C):** the dock is closed by default; a starter opens it and sends; ten `role="tab"`.
- **Reporting & analytics (D):** a find suggestion runs the router; Preview plan changes the locks; the `Insights*`
  tests.

**Needs the running app:**
- A 1, everything above 400 px, with Lora 26;
- A 3, `.al-h` computes to Lora 20 px;
- the WA checks;
- **Quality:** rows at most 48 px; no sideways scroll at 390 (today +520 px); the title on one line;
- **Risk-based monitoring:**
  - Escape closes the dock below 1024 px (media query);
  - the ten tabs fit one row at 1440;
  - no orange on Overview;
  - at 390, the title is 22 px on one line and the select is not clipped;
- **Reporting & analytics:** one column at every width; the orange count is 1 or 0 (today 4); the reports are
  reachable at 390.
- **Blocked on the stack:** C's "seed one through 'Seed risk assessment'". The seed buttons send AnA a request
  (§C.4 step 7), and AnA answers 503 on that stack.

---

## 5. Conflicts: with RULE 6, and between specs

### 5.1 RULE 6 (nothing new)

Each "The change" section was searched for a new screen, route file, service, table, mount, AnA tool, engine,
integration, model or component file. **None was found.** Every file the specs name exists at `b7c7cf9f0`, checked
with `ls` over the full list. Items to watch:

1. **D7-A3 step 13, the eCTD 4.0 preview.** It is a new client caller of the existing
   `POST /api/ectd/v4/forward-compat` (`server/routes/ectd-v4.ts`). That is a reach, which plan §1 goal 2 allows, and
   it adds no route. It belongs under **S5** (whose paths include `EctdCompileReference.tsx`), not under D7, and the
   spec already says so.
2. **D1-6's move of `Home`.** `Home` moves from `Surfaces.tsx` into the existing `HomeSections.tsx`, so no file is
   added (RULE 6, "split, don't add"). But `Surfaces.tsx` is not in D1's paths, so the move waits for the ledger fix.
3. **D7-B deletes the nine Quality template cards** (RULE 4 convergence). The working agreement requires the commit
   to name the replacement and its gate:
   - the replacement is the template field that "New controlled document" opens. `SopRegister.tsx:340` calls
     `setSetup({})`, which renders `ControlledDocumentSetup` from `quality/ControlledDocumentDialogs.tsx` (its
     template select is at `:97–103`). `quality/NewControlledDocumentForm.tsx` is an 18-line wrapper over that same
     component, used by `ChangeControl.tsx`. So the field is not in `SopRegister.tsx`;
   - the gate is the rewritten `quality/__tests__` case.

   These files are outside D7's paths until the ledger fix.
4. **New functions inside existing files.** None of these is on RULE 6's list, and none adds a file:
   - D1: `useRecentThreads`, `openArtifact`;
   - D2: `cardLine`;
   - D3: `ProjectObjective`, and S1's `useProjectObjective`;
   - D4: `MenuButton`;
   - D5: `CmStarters`;
   - D6: `dueWithinDays`, `CC_CHANNEL_LABEL`, `CC_CLOSURE_LABEL`;
   - D7: `.sc-context`.
5. **Tension with RULE 4, reported but not resolved.**
   - RULE 4 lists two things "to converge, not extend": the rail's "CMC / Module 3" work area, which belongs in the
     project's document start and the one editor; and `ProjectCoreWork.tsx`'s workspaces.
   - The specs keep both: D5 gives CMC a "Module 3" half with its build board (`D5.md` §A.4), and D3 keeps the work
     areas as doors (`D3.md` §4.8 item 4).
   - Both specs follow plan §2 and §1a (P-79), which list CMC and the work areas.
   - No spec does RULE 4's convergence, and no package owns it. That is for the founder or lead.

### 5.2 Between specs (each with how the build order handles it)

1. **`StageBand`.** `D3.md` §4.6 item 2 deletes it from `ProjectStages.tsx`, but `CmcModule.tsx:79` imports it and
   `:3152` renders it. Only `D5.md` §A.4 step 3 removes that import. → D3-1 / D3-1b split (§1 D3); D5-1 comes first.
2. **Ratchet zero.** Four specs defer the alias removal to "D0-6, when the ratchet reaches 0": D3 §4.12, D5 §A.4
   step 7, D6 §B.4 step 10 and D7 §A.4 step 6. D1 §D1.C deletes `.home-first .landing-newproj` but not D0's alias.
   The guard as committed (`78677693b`) fails at 0 while any selector for the name is left in any v2 sheet.
   → The zeroing commit deletes the alias. D0-6 is not a separate step.
3. **`.sp-starters[data-layout="row"]`.** `D1.md` §D1.C step 8 puts it in `surfaces-v2.css`. `D5.md` §0 and §WA put
   it in `app-v2.css` and say that "D1 drops its copy". → D5-0 carries it, and D1-6 does not add it. One definition.
4. **`.pj-more` and `.pj-main .pj-sec`.** Both `D3.md` §4.12 and `D5.md` §WA.4.1 define them, and §WA says
   "whichever lands second deletes its own copy". `.pj-more` exists in no sheet at `b7c7cf9f0`. → D5-0 lands first,
   so D3 omits its copy.
5. **`project-home-v2.css:37–50`.** It is deleted by both D0-2 (§4.2.6) and D2-1 (§1.4 step 9). → D2-1 finds it gone.
6. **D0 §4.2.17 against D4.** `D4.md` §D4.K makes three corrections to D0's artifact shell:
   - `.dcv-bar .btn` → `.dcv-bar .btn.ed-ico`;
   - no per-section 32/48 padding;
   - one hairline at `.ct-canvas-pane`.

   It also makes four asks of D0:
   - drop `font-family` from the bare `p` in `colors_and_type.css`;
   - set `.c2c-v2.dark { color-scheme: dark }`;
   - re-value `.scaf-note` and `.nda-open`;
   - name the menu pattern in the README.

   None of these is in the committed D0 spec, and `design-system/**` is D0's alone. D4 also writes "Chip and list"
   over `authoring-v2.css` 1531–1606, which overlaps D0's 1470–1537. → The decision belongs before D0-2 lands, which
   is now. Otherwise D4 keeps its scoped overrides and the asks stay open on D0.
   **Status at this review:** the working-tree `D0.md` (modified, not yet committed) has an "Amended 2026-11-01 by the
   coordinating session" note in §4.2.17. It takes all three corrections, and it takes the asks into D0-1/D0-2 and
   D0-5's README. Once that is committed, this item is closed except for the 1531–1537 overlap, which the amendment
   does not address.
7. **The crumb label.** `D4.md` §0 routes "Concept2Cure.RI › The editor" to D1. But the label is in
   `shared/constants/ui-surface-registry.ts:233`, which is in S1's paths (`shared/constants/**`) and F1's, not
   D1's, and `D1.md` §D1.B does not take it. → S1 or F1.
8. **The divider and the rail's auto-collapse.** `D4.md` §D4.M item 4 says these are "in `ConversationThread.tsx`
   and `Shell.tsx` (D1)". `D1.md` does not include them. → No package owns them yet.
9. **The client type on Projects' cards.** `D1.md` §D1.C.5 says "The client type stays on Projects' cards (D2)".
   `D2.md` §1.4 step 5 removes the workstream chip from the card; the client type moves to the list view's Client
   type column and filter. → D1's ledger row should name the list view and the filter.
10. **D6-1 and `styles/surfaces-v2.css:289` (`.ctable`).** `D2.md` §1.4 step 6 still uses `.ctable` for Projects'
    list, `admin-access.css` defines it too, and D0-2 §4.2.11 restyles that line. → D6-1 deletes only its own
    `.ctable` markup in `TaskBoard.tsx` and does not edit the sheet.
11. **D6-3 and the Vault band CSS.** `D6.md` §C.4 step 11 deletes "`.vd-lane*`, `.vd-room*`, `.vd-cov*` … in
    `app-v2.css`". None of these selectors exists in any sheet at `b7c7cf9f0`. Vault's band rules are the `.vd-*`
    rules in `misc-surfaces-v2.css` (for example, `.vd-dr*`). → D6-3 likely needs no `app-v2.css` slot.
12. **`.cl-toast` and `.tb-detail`.** D0 §4.7 assigns `.cl-toast` (in `CollabLauncher.tsx`) and `.tb-detail` (in
    `TaskBoard.tsx`) to D6. `D6.md` migrates neither: §A.4 step 11 keeps `.tb-detail` on D0's alias, and
    `CollabLauncher.tsx` is not in any "The change" section. Both names have all their uses in D6 files. → They stay
    above 0 until a D6 addendum or F1.
13. **`.ec-composer`.** D0 §4.2.16 adds it to the composer chrome "when [its] owners (D4, D7) confirm". The class is
    used only by `surfaces/EctdCoauthor.tsx`, which is a D7 path (`Ectd*.tsx`, also S5). No D7 section covers that
    file, and D4 does not own it. → Unowned; D7 or F1.
14. **The commitments read.** `D3.md` §8 item 3 reports a defect: `CommunicationCenter.tsx:239–280` keys the
    commitments read on the project UUID, but `server/routes/c2c/agency-responses.ts:596–597` takes
    `Number(projectId)`, which is `NaN` for a UUID. It is assigned to "D6 / S10", but `D6.md` does not include it.
    → It is behaviour, so S10 or F1.
15. **The `.landing-crow` row on the project page's composer.** `D1.md` §D1.D says the project page's composer has
    a textarea, send, and "+ attach (reusing `useChatUpload` and `seedFiles`)". `D3.md` §4.4 specifies the textarea,
    send and starters only, with no attach and no `.landing-crow`. → The lead decides; D1 §0.3 item 4 says D3
    adopts the contract.
16. **`registryModel.ts`.** `D6.md` §8 item 1 calls it "D1's or F1's file". It is in no D package (only F1, R1, L1
    and PLAN). The same holds for `D5.md` §8 item 1's convergence of the workbench.
17. **Naming drift.**
    - D1 deletes `ProjectChip` (§D1.B step 4), but D0 §5 and D4 §D4.A.5 still cite "the top bar's project chip". The
      outcome is kept by D1's project crumb.
    - D1 §D1.E step 13 calls D3's `ProjectRecordedContext` "Project knowledge", while D3 §4.8 item 5 titles that
      card "What AnA knows".
18. **Ledger mismatches D0 already recorded.** The ledger names `useDialog.tsx` and `Toast*.tsx`, but the files are
    `useDialog.ts` and `toast.tsx`, and `v2/ui/**` does not exist. No D1–D7 step needs to edit those files.
19. **`.ctable` and `.ct-row` are not D0's.** `D2.md` §1.4 item 6 deletes the list's inline `fontSize` 11 and 11.5,
    because "type comes from D0's `.ctable` / `.ct-row` rules". D0 §4.2.11 restyles only `.ct-head`, at
    `surfaces-v2.css:289`. `.ctable` and `.ct-row`, at `surfaces-v2.css:288–293` with `.ct-row` at 12px, are unowned,
    and 16 TSX files use them as class tokens. Besides `Projects.tsx` they include the MDX surfaces, the admin
    surfaces, `CroPortfolio.tsx`, `Labeling*.tsx`, `TaskBoard.tsx` (D6), `BiostatWorkbench.tsx` (D5) and
    `VaultOrganizationArtifacts.tsx` (D6). → D2-1 either scopes its list's type under `.pj-index`, inside its own
    `project-home-v2.css` range, or the row type goes to F1 as a shared change. Re-valuing `.ct-row` unscoped would
    restyle 15 other files under `Plan: D2`.
    The lead decides.
    **Decided by the lead, 2026-11-01:** D2-1 scopes its list's type under `.pj-index`, inside its own
    `project-home-v2.css` range. `.ct-row` is not re-valued under `Plan: D2`. A shared re-value of `.ctable` and
    `.ct-row` is an F1 change on its own, if one is ever wanted.
20. **`.rc-composer` and `.rbm-ana-composer` are not in D0's composer list.** D0 §4.2.16 lists only
    `.landing-composer`, `.pj-composer` and `.ct-composer`, and adds the other two "when their owners (D4, D7)
    confirm". `D7.md` §C.4 item 6 and §D.4 item 3 treat both as already listed. In Insights, `.rc-composer`
    (`Insights.tsx:2204`) wraps the plan-tier switch (`.rc-tier`), the preview notice, the "Find a report" label, the
    field and the guardrail line. The
    single-line field that §D.4 item 3 describes is `.rc-input`, so listing `.rc-composer` would frame the whole block.
    → Whichever selector is meant, D7 confirms it before D0-2 (Wave 0), or D7-C and D7-D add their selector to D0's
    list in `app-v2.css` (§0 item 4).
    **Decided by the lead, 2026-11-01:** D0-2 is not reopened. D7-C adds `.rbm-ana-composer`, and D7-D adds
    `.rc-input` (the single-line field, not the `.rc-composer` block), to D0's composer `:is()` lists in `app-v2.css`,
    each in its own lane's `app-v2.css` turn.
    **Superseded for D7-D by the lead, 2026-11-01 (L11's owner, `011HLkY…`, raised it):** "Find a report" answers
    through a fixed router (`roRouteReply`), not AnA, and FILING_SPINE §7.2 F6 (pinned by
    `insightsNoChatLookalike.test.tsx`) says nothing but the conversation may look like talking to AnA. ONE_DESIGN_PLAN
    §2 gives Projects "a search field", not a composer. So the field is D0's inline input, `.c2c-input`, with "Find" as
    `btn ghost` beside it; neither `.rc-composer` nor `.rc-input` joins the composer list, and D7-D takes no
    `app-v2.css` turn. D7-C's `.rbm-ana-composer` is unchanged: that one does talk to AnA.

**Not checked here, and left to the builders:**
- whether each spec's line ranges still match after D0 lands;
- whether `charter_sections` is on every applier (plan §1a S1 item 4, "Unverified").

---

## Review

Critic's pass, 2026-11-01. It checks this file against `D0.md` to `D7.md` (the working tree), the ledger
`docs/design/one-design-plan.json` (globs checked with the gate's own `globToRegExp`), and the code at HEAD
`2270a9f2b`. D0-1 has landed since this file was read at `b7c7cf9f0`. Corrected in place:

**Files a spec changes that this file had omitted**
1. **D1-2.** `.tt-badge` and the new `.tt-trigger[data-overdue] .tt-badge` (`D1.md` §D1.B step 7) were added to its
   CSS.
2. **D3-2.** `D3.md` §4.8 item 1 reads `targetWords`, which is not exported at HEAD, so `ProjectPlan.tsx` (its
   `export`) was added. So was `ProjectRespond.tsx` (`inbox` and `fire` props), so that the Filing card and Respond
   share one inbox read. Both had sat in D3-4.
3. **D7-B.** `quality/ControlledDocumentDialogs.tsx` was added. §B.4 item 5's "first field" is
   `ControlledDocumentSetup`'s template select (`:97–103`), and it shows only `t.label` today. §5.1 item 3 had placed
   that field in `SopRegister.tsx`. It is not there; it is reached from `SopRegister.tsx:340`.
4. **`app-v2.css` turns that some steps had not listed.** These steps take a name to 0, and after D0-2 its alias
   sits in D0's `:is()` lists in `app-v2.css`: D1-6 (`landing-newproj`), D5-1 (`cm-subtab`, `cm-connect`, and
   §4.2.18's rules), D5-2 (`cm-head`, `cm-kicker`, `cm-title`), D6-2 (`cc-tab`) and D7-A1 (`sc-ws`). Their §1 cells
   now include it, and so do the sheets of lanes L5, L7 and L9.
5. **The generated sheet.** Each zeroing commit also regenerates `surface-text-ramp.css`. The ratchet reads every
   `.css` in `styles/`, and at HEAD that sheet names `.pj-stageband` and `.cm-connect`.
6. **D5-3.** D5-3's `[data-work-area] .sp-row[aria-pressed="true"]` rule has no sheet in the spec. It is routed to
   D5-0's block; otherwise D5-3 needs an `app-v2.css` turn.

**Packages called disjoint that share a file**
7. **L3 and L4.** L4 claimed `Project*.tsx`. That glob, and D3's ledger glob, also match L3's `Projects.tsx`,
   `ProjectPortfolioFilters.tsx` and `ProjectClientFilter.tsx`. L4 now names its files.
8. **"No two lanes share" and D5's two lanes.** The Wave 1b claim is qualified to the TSX the specs change, and it
   now says which lanes take `app-v2.css` turns. D5's "their TSX and CSS ranges do not overlap" is qualified too:
   both CMC and Biostatistics can need `app-v2.css`.

**Dependencies on a D0 class that `D0.md` does not define**
9. **D2 and `.ctable` / `.ct-row`.** D2 relied on "D0's `.ctable` / `.ct-row`", but D0 §4.2.11 restyles only
   `.ct-head`. The other two are unowned rules at `surfaces-v2.css:288–293`, used by 16 TSX files. See §1 D2 and new
   §5.2 item 19.
10. **D6-1 and the "quiet inline note".** D6-1 relied on "D0's quiet inline note" for `.tb-alert` and `.tb-notice`.
    There is none, so D6-1 writes those two rules itself.
11. **D7-C, D7-D and the composer list.** They relied on `.rbm-ana-composer` and `.rc-composer` being in D0
    §4.2.16's composer list. D0 defers both "until owners confirm", and the working-tree amendment does not add them.
    This is now a sixth hard edge (§0 item 4), a Wave 0 item, an `app-v2.css` entry for L10 and L11, and new §5.2
    item 20. That item also notes that `.rc-composer` wraps the whole find block; the field itself is `.rc-input`.
12. **D3 and `.pj-title`.** It was listed as a D0 primitive. It is D3's own rule, set to the `.ph-title` metrics.

**Wave and step order**
13. **The styles gate is D0-4, not D0-3.** D0-4 edits `app-v2.css:3572–3588` and `coverage-v2.css:245–261`, and the
    `COORDINATION.md` lock holds `styles/**` for D0-1 to D0-5. This is fixed in §0 item 1, the Wave 1a trigger and the
    critical path.
14. **D4-1 and D2-1 need not wait for D5-0.** They touch neither of its sheets and use no work-area rule, so they may
    start beside it in Wave 1a. D2-1 earlier also brings forward D3-2.
15. **L1 order.** D1-4 now runs first. It was "goes early" in the text but fourth in the lane. D1-6's CSS (D1-6a) now
    goes before D1-5, because D1-5's composer needs `.landing-state` and the popover `.landing-settings`. The original
    claim that "all of [D1-6's] CSS" can precede the ledger fix was wrong for the
    `.landing-settings { position: fixed }` rule. Before Home's step 4 markup, it would leave Home's in-flow strip as
    an unplaced fixed box. D1-5 scopes that rule to `.ct-composer` until D1-6b.
16. **D3 order.** D3 now runs D3-1, D3-3, D3-2, D3-4, D3-1b. The spec's sections refer forward:
    - the header passes `request` to `ProjectSettings`, a prop that D3-3 adds;
    - About's "Edit" and the Team card's "Manage" open D3-3's drawers;
    - D3-2's rows read the §4.10 lifted reads that D3-4 was to move `ProjectRespond` and `ProjectWorkPanel` onto;
    - D3-2 takes `DossierReadinessCard` off the side column, and D3-4 was to put it in Author. In between, the card
      would be on no screen.

**Status noted, not corrected**
- At this review, `.design/claude-convergence/D0.md` is modified in the working tree and not committed. It carries
  an "Amended 2026-11-01" note that takes D4's three corrections and four asks. §0 item 5 and §5.2 item 6 say so.
  The `authoring-v2.css` 1531–1537 overlap stays open.

**Checked and found right**
- At HEAD:
  - `TRIAGE_ASK` is inline at `TaskTray.tsx:251`;
  - `STARTER_ASKS` is not exported (`ConversationThread.tsx:73`);
  - `StageBand` is imported at `CmcModule.tsx:79` and rendered at `:3152`.
- At `b7c7cf9f0`, `.pj-more` and `.vd-lane*` / `.vd-room*` / `.vd-cov*` are absent.
- All uses of `tb-detail`, `cl-toast` and `rbm-modal` are in D6 or D7 files.
- Every file this order names exists.
- Every step's file is inside its package's ledger paths, except the three D1 files and `quality/**`, which §0
  already flags.
- Every other primitive cited is defined in `D0.md`: `.ph*`, `.btn*`, `.c2c-input`, `.pj-card*`, `.seg*`,
  `.tabs` / `.tab`, `.reg-kpis`, `.reg-tbl`, `.rd-chip`, `.c2c-empty-state`, `.de*` including `[data-docked]`,
  `.de-toast` / `.cl-toast`, `.cl-modal` / `.rbm-modal`, `.dcv-*`, `.sp-starter`, `AnswerLead emphasis` and the
  `--fs-*` tokens.
