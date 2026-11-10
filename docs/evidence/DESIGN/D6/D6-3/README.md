# D6-3: Vault, the library first (D6 §C)

**Package:** D6, Work areas II (`Plan: D6`). **Completes:** `client/src/concept2cure/v2/surfaces/Vault.tsx`.
**Step:** D6-3 of `.design/claude-convergence/BUILD_ORDER.md` §1 D6: the library first, its views as tabs, the
inspector (the record docked with `.de[data-docked]`), the upload flow.
**Spec:** `.design/claude-convergence/D6.md` §C (C.3 the pattern, C.4 the change, C.5 capability kept, C.6
acceptance), applying `D5.md` §WA (the work-area pattern, its CSS landed in D5-0 `943b78cb7`) and `D0.md` §3–§4.2
(the primitives in `styles/app-v2.css`, used and never redefined). BUILD_ORDER §5.2 item 11: the spec's
`app-v2.css` `.vd-lane*` / `.vd-room*` / `.vd-cov*` do not exist and are not created; Vault's band rules are the
`.vd-*` block in `styles/misc-surfaces-v2.css`.
**Read at:** `14dce5e387` on `concept2cure-v2`, 2026-11-01 (the session started at `f5c46642a`; the three commits
between touch none of the files below). The spec's line numbers were read at `6ffca88a09`; the lines below are
re-read at `14dce5e387`.

This step adds no screen, route, service, table, mount, AnA tool or component file (RULE 6). It moves the existing
lanes under views of the one Vault work area (RULE 4: one work area, not a card or screen per document type), and
re-values the existing `.vd-*` rules.

---

## What already exists (RULE 3)

### Searches run

- Every function and `useState` in `surfaces/Vault.tsx` (`grep -n "^function\|^export function\|useState"`).
- Every `Vault*.tsx` / `vault*.ts` under `surfaces/` and where each sub-component is rendered
  (`grep -rln "<VaultSeals\b"` and the same for each): every one is rendered only by `Vault.tsx`, except
  `DocumentDisposition` (also `ProjectHome.tsx`) and `RecordHistory` (also `SubmissionSeqWorkspaces.tsx`).
- `useSurfaceActionHandlers('vault'` and the three directives it registers.
- Every `.vd-` selector in every v2 stylesheet (`grep -n "vd-" styles/*.css`), and the generated
  `styles/surface-text-ramp.css`.
- `.page-inner.etmf` (the 1280px widening), `.de[data-docked]`, `.wa-split`, `[data-work-area]`, `.sp-starters`,
  `.sp-primary`, `.sp-ask`, `.source-work-action`.
- `git log --all --diff-filter=D` on `client/**/*Vault*` and `client/**/*vault*`: the predecessors are the
  folded MDX `VaultSurface.tsx` and the Artifacts center (`b9de04c62`, fold F3, both now inside this Vault),
  `vaultRouteText.ts` (`488b15e1e`, moved to `v2/reviewRoute`), `VaultSources.tsx` (`2895218b8`), and the pre-v2
  islands deleted 2026-04/05. None is a Vault page to be revived; the Vault is this one.
- Tests: every `__tests__` file that imports a Vault file, renders `<Vault`, or reads a Vault source or
  `misc-surfaces-v2.css` as text (79 files, `red/vault-suites.list`), plus `shellAskGuard.test.tsx`, which clicks
  "Search connected sources" through the shell.

### The page (`surfaces/Vault.tsx`, 3032 lines)

| Piece | Path (lines at `14dce5e387`) | What it does today | What it does not do |
|---|---|---|---|
| Root and header | `VaultForProject` render 2037–2165 | `.vd-wrap` > `.vd-top`: the eyebrow "Documents · project vault" (`sp-eyebrow`, 2041), `h1.vd-title` (the rail label), `.vd-sub` with `vaultHeaderParts` (spine, counts, "N unfiled — needs review", "N awaiting confirmation"); then "Open project" (`sp-ask`, 2059–2066), "Inspection readiness" (`sp-ask`, when `available('etmf')`, 2069–2077), the "File type" select (`vault-upload-type`, 2093–2111), the `FileDropZone` around "Add files" (`sp-primary`, `vault-upload-button`), "Add a folder" (`sp-ask`) and "or drop files or a folder here" (2116–2149), "Ask AnA to import" (`sp-ask`, 2152–2162). Eight controls in two rows. | No back link; the drop target is only the header strip. |
| Notes above the lanes | 2167–2247 | `VaultUploadStaging` when files are staged; the upload/download note; the missing-target and other-project notes; each `checkInOffers` row ("Upload as a new version of …", `sp-ask`); `VaultPlaceIntoSubmission` when open; the uploads-window note; one note per `vault.unavailable` branch. All `scaf-note` with inline `style`. | — |
| Connected repositories | `.vd-coexist` 2249–2266 | "AnA can search your connected repositories (Veeva Vault, SharePoint, OneDrive) in place. Importing from them into the Vault comes in a later release; upload files here meanwhile." and "Search connected sources", which calls `onAsk('Search my connected repositories for documents relevant to this project.')`. | The "later release" sentence advertises an absent capability (plan §2, retired). |
| No project / loading / error | 2271–2300 | No project: `EmptyState` "Open a project to see its vault" with "Go to Projects", then the organisation's governed artifacts. Loading: "Loading the project vault…". Error: `vaultReadFailure(status)` words and a retry only when one can help. | — |
| Data room lane | `DataRoomLane` 495–587, mounted 2303 | Captured › Classified › Filed to vault counts, `RoomNotes`, "Show N sources", `DataRoomFileBar` / `RoomPick` (File into Vault, VR-11), and a failure said as a failure. A three-line explanation when empty. `.vd-dr` band. | — |
| Coverage | `VaultCoverage.tsx`, mounted 2310 | "Required sections: N of M have a confirmed document", provenance line, "Show sections" listing modules and each missing section with Upload (the page's picker) and "File here" (the governed `/file` call). | — |
| Seals | `VaultSeals.tsx`, mounted 2321 | The seal list (when, who, why, count, hash), Verify per seal with the verdict in words, the closing archive once intact, and "Seal this Vault…" (`sp-primary`, 252) opening the shared `EsignModal` ceremony. A failed list read is said, never "no seals". | — |
| Uploads lane | `UploadsLane` 606–692, mounted 2327 (not while searching) | Every cabinet leaf with its type, title (opens its folder and selects it), size/date/owner, folder and status chip; "Open filing cabinet"; "Show all N in this window". | — |
| Governed artifacts | `GovernedArtifactsLane` (`VaultGovernedArtifacts.tsx` 87–193), mounted 2338; `OrganizationGovernedArtifacts` (`VaultOrganizationArtifacts.tsx` 303–349), mounted 2345 | The project's branch: total, by status, signatures and reviews, "Open governed artifacts", "Export manifest" (CSV). Across projects: show/hide, the listing with Download DOCX, Open in editor, Ask AnA per row, export manifest. Failures are said. | — |
| Fixity | `VaultFixityCheck.tsx`, mounted 2347 | "Check stored files" (`sp-ask`) re-proves every stored version, records each verdict, and states the result and every failure by name. | — |
| The library | `.vd-grid` 2370–3023 | `aside.vd-tree` ("Document structure", `VaultTree`); `section.vd-list` with `.vd-breadcrumb` (program crumb › folder, or the search state), the search box (`Search this vault`), "Include earlier versions", "Accessible projects", "Saved views" (`VaultSavedViews`), `VaultFindFilterRow` (Type, Filing, Classification, Evidence kind, Review, CTD section), the failed-search alert, pending/searching notes, `ConfirmSuggestedBar`, `FolderExportButton`, then either `VaultLibraryResults` (accessible projects) or `.vd-cols` + `.vd-rows` of `button.vd-row`; `aside.vd-detail`. Grid `290px 1fr 320px` (`misc-surfaces-v2.css:362`). | Below the fold at 1440: under eight bands. |
| The record | `aside.vd-detail` 2577–3022 | Status, version and review-stage chips; `vd-d-title`; meta; preview; flag; `VaultHoldNotice`; `DocumentDisposition`; then for an upload: Submission ("Place into filing…", `sp-primary`, 2651), Dossier filing (folder, filed by, looks like, CTD section, rationale, reason input, "Confirm filing" `sp-primary` 2730, Move, Unfile), `VaultEditDetails`, `VaultCatalogRecord`, File (size, SHA-256), `VaultVersions`, `VaultAnnotations`, `VaultRelationships`, `DocumentHistory`; for a search hit the tree does not list, its versions, annotations, relationships and history; for a governed artifact `ArtifactGovernanceDetail`, `ArtifactVersions`, `ArtifactAuditReport`; for an authored section the honest indexing, version and linked-evidence notes. Actions (`.vd-d-actions` 2951): `VaultSourceBuildAction`, "Work on document" (`VaultSourceWorkButton`, `sp-primary`), "Open in editor" (`sp-primary`, 2955), "Ask AnA", Download / Download DOCX / "No file to download". | Always a right column; not the D0 inspector. |
| AnA's hands | 1638–1748 | `vault.search` (sets `q`), `vault.open-folder` (opens the named folder), `vault.focus-document` (selects a leaf by title, code or artifact id; the organisation row with no project). Retry contract via `notifySurfaceActionReady`. | None of them can reach a view other than the one page. |
| AnA's context | 1850–1955 | Loading, failure, library mode, search states published as such; facts for counts, coverage, data room, artifacts, filters, saved view, folder, selection; `availableActions` include "Upload files into the vault…". | — |

### The other files of this step

| File | What it renders today (lines at `14dce5e387`) |
|---|---|
| `VaultCatalogRecord.tsx` | `vd-d-seclbl` "Catalog record" (395); "Confirm as written" `sp-primary` (371, `vault-catalog-confirm`); "Correct record" `sp-ask` (376); the correction form's "Save correction" `sp-primary` (301) and Cancel `sp-ask` (304); "Try again" and "Reload catalog record" `sp-ask` (339, 398). |
| `VaultSeals.tsx` | `section.vd-seals` with `vd-d-seclbl` "Seals", the explanation paragraph, Verify / Download closing archive / Try again `sp-ask` (193, 205, 248), "Seal this Vault…" `sp-primary` (252, `vault-seal-open`). |
| `VaultCoverage.tsx` | `.vd-dr` band; "Show sections" (`vd-dr-toggle`), the per-section Upload and File here (`vd-dr-toggle`). |
| `VaultFixityCheck.tsx` | `.vd-fix` band with `.vd-dr-head`, "Check stored files" `sp-ask` (87). |
| `VaultGovernedArtifacts.tsx` | `GovernedArtifactsLane` as a `.vd-dr` band; `ArtifactGovernanceDetail` / `ArtifactVersions` / `ArtifactAuditReport` headed by `vd-d-seclbl`; `sp-ask` Try again (313) and Read the audit report (475). |
| `VaultOrganizationArtifacts.tsx` | `.vd-dr` band with its own show/hide; the listing a `.ctable` with `.art-*` row actions; Try again `sp-ask` (273). |
| `VaultUploadStaging.tsx` | `section.vd-stage` boxed, `h3.vd-d-seclbl` "Files to upload" (focused on open), rows, "Upload N files" `sp-primary` (334), Cancel/Close `sp-ask` (339), Remove `sp-ask` (205). |
| `VaultLibraryResults.tsx` | The accessible-projects results (`.vd-lib`), Download per hit `sp-ask` (210). |

### CSS that this step re-values or relies on

| Selector | Where (lines at `14dce5e387`) | Today |
|---|---|---|
| `.vd-wrap`, `.vd-top`, `.vd-coexist*`, `.vd-title`, `.vd-sub`, `.vd-upload-type*`, `.vd-upload-zone*` | `misc-surfaces-v2.css` 330–353, 397–399 | A full-height flex column with its own background; a bordered toolbar header; the coexist band; the upload strip. |
| `.vd-grid`, `.vd-tree*`, `.vd-folder*`, `.vd-list*`, `.vd-rows`, `.vd-row*`, `.vd-detail`, `.vd-d-*` | `misc-surfaces-v2.css` 362–396, 498–526 | `290px 1fr 320px`; 10.5–12.5px text; orange `--accent-000/200` on the selected folder and row. |
| `.vd-dr*`, `.vd-fix`, `.vd-seals`, `.vd-seal*`, `.vd-stage*` | `misc-surfaces-v2.css` 442–497, 516–526 | Full-bleed `--bg-050` bands with 24px side padding; orange text toggles (`vd-dr-toggle`). |
| The 1200px rule | `misc-surfaces-v2.css` 531–554 | Stacks the three panes and the header below 1200px. |
| `.page-inner.etmf, .page-inner.indl{max-width:1280px}` | `coverage-v2.css:834` (the spec's "866") | The widening for owner tables. |
| `.vd-breadcrumb`, `.vd-crumb*`, `.vd-search*`, `.vd-filters`, `.vd-filter*`, `.vd-cols`, `.vd-row` grid, `.vd-col-*`, `.vd-num`, `.vd-sub`, `.vd-sub-x`, `.vd-build` | `coverage-v2.css` 862–938 | The list's toolbar and grid. **Not this step's lines** (only 834 is), so every rule here is reached by class choice in the markup, not edited. |
| `.page-inner`, `.ph*`, `.btn*`, `.tabs`/`.tab`, `.c2c-input`, `.rd-chip`, `.pj-sec-h`, `.c2c-empty-state` | `app-v2.css` 136–431 (D0 foundations) | Used, not redefined. |
| `[data-work-area]` placement, `.pj-more`, `.wa-split`, `.sp-starters[data-layout="row"]` | `app-v2.css` 3871–3933 (D5-0) | Used. |
| `.de`, `.de-bd`, `.de-h`, `.de-x`, `.de-body`, `.de[data-docked]` | `journey-v2.css` 464–529 | The D0 drawer and its docked inspector. |
| `.sp-primary`, `.sp-ask` | `journey-v2.css` 271–277, 316–317 | Not deleted (D4's `authoring-v2.css` still uses `sp-primary`); this step stops using them in its files. |
| Surfaces in the generated ramp | `surface-text-ramp.css` 361–370, 561, 708, 814 | Lists `.vd-coexist`, `.vd-dr`, `.vd-fix`, `.vd-seal`, `.vd-searchbar`, `.vd-folder:hover`, `.vd-row:hover`, `.vd-stage .c2c-input:disabled`, `.vd-crumb:hover` because they paint a tinted surface. |

### Tests that read this code

79 suites (`red/vault-suites.list`): **814 passed, 3 failed** before any change
(`red/vault-suites-before-change.txt`). The three failures are not this step's: `vaultLibrarySearch`,
`vaultPlaceFromVault` and `vaultVersionCompare` assert `apiRequest` was called with exactly two arguments, and the
live-data reader now passes a third and fourth (`undefined`, an `AbortSignal`). Each fails alone too.

Pins on what this step changes: `vaultHeaderHonesty.test.tsx` (`.vd-top` text, `.vd-sub-x .vd-sub-part`),
`shellAskGuard.test.tsx` ("Search connected sources"), `vaultViewOnly.test.tsx` ("Ask AnA to import" absent for a
viewer), and every suite that drives a lane by role now that the lanes sit in views (counted in the results below).
Class hooks the suites query and this step keeps: `.vd-tree`, `.vd-folder`, `.vd-fcount`, `.vd-list`,
`.vd-breadcrumb`, `.vd-rows`, `.vd-row`, `.vd-detail`, `.vd-d-title`, `.vd-d-actions`, `.vd-dr-open`, and every
`data-testid` (`vault-seal-open`, `vault-catalog-confirm`, `vault-upload-zone-files`, `vault-upload-button`,
`vault-upload-type`, `vault-place-into-submission`, `vault-confirm-filing`, `vault-filing-block`, …).

---

## The change (D6 §C.4)

Not committed (the coordinating session commits it, `Plan: D6`, `Completes: client/src/concept2cure/v2/surfaces/Vault.tsx`).
Nothing outside the step's files was edited except tests (always allowed) and this folder.

| File | Change | Spec |
|---|---|---|
| `surfaces/Vault.tsx` root | `.vd-wrap` → `<div className="page-inner vd vd-wrap" data-work-area="vault">`. For the writing roles the existing `FileDropZone` (`vault-upload-zone`, same props, label "Vault: drop files or a folder here to add them") now wraps the **whole page**, so a drop anywhere stages the files; its `onFiles` also shows the Uploads view. A viewer gets the page without a drop zone, as before. | C.4 1, 2; C.6 4 |
| header | The eyebrow "Documents · project vault" is deleted; `vd-title` → `h1.ph-title`; `vd-sub` → `p.ph-sub` with the same `vaultHeaderParts` pieces (`.vd-sub-part` kept, so a dot never stands alone). `.ph-acts`: "Inspection readiness" (`btn ghost`, only where `available('etmf')`), "Add a folder" (`btn ghost`), "Add files" (`btn primary`, `vault-upload-button`, the same disabled reason with no project). Both upload buttons show the Uploads view, then open the picker through the zone's `controlsRef`. "Open project" → the `.pj-back` link with the project's title (`onNav('project-home')`). | C.4 1, 2 |
| starters | `.sp-starters[data-layout="row"]`: "What is missing for this filing?", "Which documents are not yet effective?", "Search my connected repositories" (the `.vd-coexist-cta` prompt verbatim). | C.4 3 |
| `.vd-coexist` | Deleted, with its "comes in a later release" sentence. | C.4 4 |
| notes | The upload/download note, missing-target and other-project notes, the filing decision's outcome, the uploads-window note and every `vault.unavailable` branch sit in one `.vd-notes` column above the tabs (no inline styles; an error note is `data-tone="error"`). | C.4 5 ("unavailable notes stay above the tabs") |
| views | `useState<VaultView>('library')` and a `.tabs` `role="tablist"` "Vault views": Library, "Uploads · {uploads}" (the server's programme-wide count), Required documents, Governed artifacts, Seals & fixity; `role="tab"`, `aria-selected`, `aria-controls`, roving `tabIndex`, Arrow/Home/End. Each view is a `role="tabpanel"`; the inactive ones are `hidden` but stay mounted, so a fixity result, a seal verdict or a staged upload survives a look at another view and every panel makes the reads it always made. No project open: no tabs; the empty state and the organisation's governed artifacts, as before. | C.4 5 |
| AnA's hands | `vault.search`, `vault.open-folder`, `vault.focus-document` show the Library first; `focus-document` also opens the record (the drawer below 1280px). `openUpload` and `openArtifacts` (the lanes' doors into the tree) show the Library. A document named from another screen (`pendingTarget` "here") shows the Library and its record; one just uploaded is selected for the Library while the Uploads view keeps its receipts on screen. | C.4 5; C.6 3 |
| Uploads view | "Type for files added next" (the same `docType` select, `vault-upload-type`), and while nothing is staged "Drop files or a folder anywhere on this page, or use Add files." with `btn ghost small` "Ask AnA to import" (the old prompt, `IMPORT_ASK`); then `VaultUploadStaging`, the check-in offers ("Upload as a new version of …", `btn ghost small`), `DataRoomLane`, `UploadsLane`. | C.4 5, 6 |
| Required documents view | `VaultCoverage` with `defaultOpen` (the sections listed). | C.4 5 |
| Governed artifacts view | `GovernedArtifactsLane` and `OrganizationGovernedArtifacts`. | C.4 5 |
| Seals & fixity view | `VaultSeals`, `VaultFixityCheck`. | C.4 5 |
| Library | `.vd-grid` (`+ .wa-split` when the record docks) > `.vd-browse` (tree 220 \| list) + the record 360. The tree's caption is the project's line (`vault.program`) as a button that opens the first folder (the old breadcrumb root's act); "Document structure" is the tree's accessible name. Toolbar row: the search (`c2c-input`, 16px icon, `flex:1 1 320px`, "Search this vault"), "Saved views" (`btn ghost small`, `aria-expanded`), the toggles "Earlier versions" and "All my projects" (renamed from "Include earlier versions" / "Accessible projects"; same state). The facets, saved-view forms and their buttons drop to a second row (`vd-facets`/`vd-facet`; every `vd-crumb` button → `btn ghost small`). `.vd-breadcrumb` now says only where the list is (folder, or what narrows it). Rows: `button.vd-row` keeps every field — name with its CTD code, blocker, filing-status chip, then type, versions, review stage, owner and date on one 13px line; selected row `aria-current` with a `--bg-100` fill (was orange). Below 1024px the tree is a drawer opened by a "Structure" `btn ghost small`. | C.3; C.4 7, 8 |
| the record | `aside.vd-detail.de[data-docked]` (D0's inspector) beside the list at ≥1280px; below, the same record in a `.de-bd` > `.de` drawer (`VaultDrawer`: `useDialog`, Escape, scrim click, focus back to the row) opened by a row. `.de-h`: the name (`num · title`, 14/600), the filing-status and review-stage chips and the version line, the meta line; a close button only in the drawer. `.de-body`: preview, flag, hold notice, disposition, then `.vd-d-actions` (all `btn ghost small`: Work on document / Open in editor, Place into filing…, Download / Download DOCX / No file to download, Ask AnA, Build in editor), then each part a `<details className="pj-more vd-sec">` with its existing heading as the summary, the first open: upload — Dossier filing, Details, Catalog record, File, Versions, Review annotations, Related documents, History; search hit — Versions, Review annotations, Related documents, History; artifact — Governed artifact, Versions, Audit report; authored — Version, Corpus indexing, Linked evidence. "Confirm filing", "Move", "Unfile" → `btn ghost small`. | C.4 9 |
| `DataRoomLane`, `UploadsLane` (in `Vault.tsx`) | Sections: `<section className="pj-sec">` + `.pj-sec-h` (`h2` + `.sec-sub` count + `.pj-sec-acts` of `btn ghost small`). The Data room's counts are its `.sec-sub`; its explanation is `<details className="pj-more"><summary>How files reach the Vault</summary>`. | C.4 11 |
| `VaultSeals.tsx` | A section: `h2` "Seals", `.sec-sub` "None yet" / "N seals", "Seal this Vault…" `btn ghost small` in `.pj-sec-acts` (`vault-seal-open`, same ceremony); the explanation → `<details className="pj-more"><summary>What a seal records</summary>`; Verify, Download closing archive, Try again → `btn ghost small`. | C.4 10, 11 |
| `VaultCatalogRecord.tsx` | "Confirm as written" and "Save correction" → `btn primary small` (a form's submit inside the record); Correct record, Cancel, Try again, Reload → `btn ghost small`; the "Catalog record" heading moves to the record's summary. | C.4 9, 10 |
| `VaultCoverage.tsx` | A section ("Vault coverage", the server's count as `.sec-sub`, the toggle as its action); `defaultOpen`; Upload and File here → `btn ghost small`; the document select is a `c2c-input`. With no coverage block (an older server) it says the read carried none instead of rendering nothing. | C.4 5, 11 |
| `VaultFixityCheck.tsx` | A section: `h2` "Stored files", its sentence as `.sec-sub`, "Check stored files" `btn ghost small` in `.pj-sec-acts`. | C.4 11 |
| `VaultGovernedArtifacts.tsx` | `GovernedArtifactsLane` is a section (Open governed artifacts, Export manifest as `btn ghost small`); the detail panels lose their own headings to the record's summaries; Try again and Read the audit report → `btn ghost small`. | C.4 9, 11 |
| `VaultOrganizationArtifacts.tsx` | A section (show/hide and Export manifest as `btn ghost small`); the version chip is a neutral `rd-chip` (was an orange inline style); the format a `rd-chip`; the project name loses `mono`; row actions `btn ghost small`. | C.4 11; D0 §3 |
| `VaultUploadStaging.tsx` | "Upload N files" → `btn primary small` (the list's submit); Remove, Cancel/Close → `btn ghost small`; heading class `vd-stage-t` (15/600, still the focused `h3`). | C.4 5, 10 |
| `VaultLibraryResults.tsx` | Download → `btn ghost small`. | C.4 8 |
| `styles/misc-surfaces-v2.css` 327–592 (the `.vd-*` block) | Rewritten on D0's ramp (nothing under 12px, no orange but focus): `.vd-wrap` loses `height`, `display:flex` and its background; `.vd-drop[data-dragging]` is one 2px `--border-focus` ring; deleted `.vd-top`, `.vd-title`, `.vd-sub`, `.vd-upload-type*` chrome, `.vd-upload-zone*`, `.vd-coexist*`, `.vd-searchbar`/`.vd-search*`, `.vd-tree-lbl`, `.vd-list-hdr`, `.vd-row-b`, `.vd-ev*`, `.vd-dr` / `.vd-fix` bands and `.vd-dr-head`/`-title`, `.vd-seals` card, `.vd-dr-err-strip`, the 1200px stacking block. New placement for the library (`.vd-browse` 220 \| 1fr, the docked record sticky with its body scrolling), the toolbar (`.vd-find*`, `.vd-toggle`, `.vd-facet*`), the two-line rows, the record's disclosures (`.vd-sec`, and the one rule that hides a sub-panel's own first heading under its summary), the Uploads view (`.vd-upload*`, `.vd-stage-t`), the seal list. Kept, re-valued: every rule other Vault files use (`.vd-dr-meta`, `.vd-dr-err`, `.vd-dr-toggle` now quiet and underlined, not orange, `.vd-d-seclbl`, `.vd-d-filing*`, `.vd-d-move-sel`, `.vd-ver*`, `.vd-cmp*`, `.vd-confirm*`, `.vd-dr-file*`, `.vd-stage*`, `.vd-lib*`, `.vd-dr-open` and its 900px rule pinned by `vaultFiledDocumentVisible.test.tsx`). | C.4 12; BUILD_ORDER §5.2 item 11 |
| `styles/coverage-v2.css:834` (the spec's "866") | `.c2c-v2 .page-inner.vd` joins the 1280px widening. Nothing else in the sheet changed. | C.3; C.4 12 |

### Capability kept (C.5, as built)

| Removed or demoted | Where its outcome lives now |
|---|---|
| "Documents · project vault" eyebrow | Rail and breadcrumb; the project by the back link. |
| "Open project" | The back link (`onNav('project-home')`). |
| File type select in the header | Uploads view, "Type for files added next" (same `docType`, `vault-upload-type`); each staged row still sets its own type. |
| "or drop files or a folder here" | Drop anywhere on the page (the same `FileDropZone`), and the Uploads view's line. |
| "Ask AnA to import" | The Uploads view's action, same prompt (writing roles only, as before). |
| Connected repositories band, "Search connected sources" | The third starter, same prompt. The "later release" sentence is not kept. |
| Data room, Coverage, Seals, Uploads, Governed artifacts (×2), Fixity bands | The same components as sections of Uploads, Required documents, Governed artifacts, Seals & fixity; the uploads count in the tab label; counts in `.sec-sub`. |
| The lanes stepping aside while a search runs | No longer needed: they are other views, not bands above the results. |
| Library at the bottom | The first view. |
| The always-there right column | The docked inspector at ≥1280px, a drawer below; the same panels as disclosures, the first open. |
| The record's "Submission" heading and its sentence | "Place into filing…" in the record's actions; the sentence is its `title`, and the dialog it opens says the same. |
| Orange "Seal this Vault…", "Place into filing…", "Confirm filing", "Open in editor", "Work on document" | The same acts, `btn ghost small`. One orange per view: "Add files" (plus a form's own submit while that form is open: Save correction / Confirm as written, Upload N files). |
| Five list columns with a header | The same five fields on two lines per row (the list column is ~480px beside the docked record at 1440). |
| `vd-crumb` program root | The tree's caption, same act. |
| Uppercase type labels and status chips | Already sentence case since D0-3; words at 13px `--text-300`, chips through `vaultStatus`. |

### Deviations from the spec's literal text, and why

1. **The record's acts keep their names** ("Open in editor", "Work on document", "Place into filing…") rather than "Open" / "Place
   into submission", and Download and Ask AnA stay in the actions row: eight suites find them by these names and by
   `.vd-d-actions`, and "Place into filing" is the product's word for that dialog everywhere else.
2. **Place into filing renders at page level**, not inside the Uploads view: it is its own fixed drawer, and inside a
   `hidden` panel it would be invisible when opened from the Library's record.
3. **A sub-panel from a file outside this step** (VaultVersions, VaultAnnotations, VaultRelationships, VaultEditDetails,
   RecordHistory) draws its own first heading; one scoped rule hides it under the disclosure's summary, so the heading
   reads once. The step's own panels (catalog record, governed artifact, versions, audit report) lost their headings in
   the markup.
4. **The authored record opens on Version**, not on "Corpus indexing", whose only content is that indexing is not
   reported.
5. **coverage-v2.css 862–938 holds older Vault rules** outside this step's one line. The markup stopped using the classes
   that conflicted (`vd-search`, `vd-filters`/`vd-filter*`, `vd-crumb`, `vd-cols`, `vd-col-type/owner/mod`, `vd-sub`,
   `vd-sub-x`), so those rules now match nothing; the two hooks the suites keep (`.vd-breadcrumb`, `.vd-row`, whose grid
   is `display:grid !important` there) are restated in the `.vd-*` block at a higher rank. **For the sheet's holder:**
   delete 862–938's dead rules (and `.vd-sub`, `.vd-sub-x`, `.vd-build` at 935–938), and make the comment above 834 say
   three surfaces.
6. **`ci:surface-text-ramp` is stale** after this step: the bands lost their `--bg-050` fill. The regenerated output is
   `green/surface-text-ramp.regenerated.patch` (its `.vd-*` lines are this step's; its `.rail-logo` lines follow another
   session's uncommitted `app-v2.css`). `surface-text-ramp.css` is not a D6-3 file and is modified in this tree by
   another session, so it was not regenerated here.

### Tests

New: `__tests__/vaultWorkArea.test.tsx` (11): the work area's markup contract and one primary; arrow keys; `vault.search`
from Seals & fixity shows the Library with the query; `vault.focus-document` from Uploads opens the record; Add files
shows Uploads and opens the picker; a drop on the list stages in Uploads; a viewer gets no upload; the docked record and
its disclosures; the drawer below 1280px (Escape, focus back to the row); the structure drawer below 1024px; the seal and
fixity acts as quiet buttons in their sections. **Red** against HEAD's files put back for the run: 11 of 11 fail
(`red/vaultWorkArea.head.txt`). **Green** on the change: 11 of 11 (`green/vaultWorkArea.txt`).

Updated (each with a one-line `// D6-3:` reason at the line): `vaultHeaderHonesty` (`.vd-top` → `.ph`, `.vd-sub-x` →
`.ph-sub`, the picker in an open project's Uploads view and its new label), `vaultSurfaceAnaContext` and
`vaultGovernedArtifacts` (`.ph-sub`; the artifacts lane's alert read in its view), `vaultCheckInVersion`,
`vaultLibrarySearch`, `vaultSavedViews`, `vaultSearchFilters` (the renamed toggles and the held-folder reason),
`vaultCoverage` and `vaultViewOnly` (sections listed open; the other views checked with `hidden: true`),
`vaultDataRoomFile`, `vaultFixityCheck`, `vaultArtifactLeaf`, `vaultOrganizationArtifacts` (click the view's tab
first), `anaDrivesScreens` (the narrowing asserted on the Library's list), `shellAskGuard` (the starter's name),
`foundationsRetiredRatchet` (`sp-eyebrow` 19 → 18, the ratchet's own instruction).

Results: 81 suites, **839 passed, 3 failed** (`green/vault-suites-after-change.txt`); the 3 are the 3 that fail before
any change (`red/vault-suites-before-change.txt`), same assertion, same line. `shellAskGuard`'s "⌘K on a surface that
owns its conversation" (document-authoring, no Vault) failed once in the first run and passed in the next two.

### Gates

- D0 guards (`foundationsOneDefinition`, `foundationsRetiredRatchet`, `foundationsSentenceCase`): 53 passed
  (`green/gates.txt`).
- `npm run --silent ci:undefined-css-classes`: OK (`green/gates.txt`). Its first run named `vd-d-head` and `vd-seals`;
  both classes were dropped from the markup.
- eslint on the nine files and the seventeen tests: 0 errors, 5 warnings, the same five rule/site pairs as HEAD
  (`green/eslint.txt`).
- Typecheck of the nine files (a narrow `tsconfig` extending the root one): no error in them.

### Not done here, and why

- **The running-app acceptance** (C.6 1, 2, 5's media query in a browser, 7, and D5 §WA.6 at 1440/390, light and dark)
  and the before/after screenshots: this step ran no server or browser. They belong to the lane's acceptance pass.
- **Other Vault files still use `sp-primary`/`sp-ask`** inside the record and the list (VaultVersions,
  VaultAnnotations, VaultRelationships, VaultEditDetails, VaultConfirmSuggested, VaultDataRoomFiling, VaultFolderExport,
  VaultLifecycle, VaultReviewRoute, VaultUploadManifestControls, VaultVersionRestore, VaultVersionViewer,
  DocumentDisposition): they are D6's by the ledger (`Vault*.tsx`) but not in this step's file list.
- **`ci:surface-text-ramp`** and the coverage-v2.css dead rules: deviations 5 and 6.

---

## Skeptic review (second session, before the commit)

Read against D6 §C line by line, D5 §WA.4.2, D0 §3 and the hard constraints; every file diffed against HEAD. The
step stays inside its file list (plus tests and this folder); no primitive is redefined (the D0 guards pass); no new
component file, route, service or table. Two defects were found and fixed, each shown failing first
(`skeptic/red-builder-vault.txt`, the builder's `Vault.tsx` put back for the run).

| # | Defect in the builder's change | Fix (`surfaces/Vault.tsx`) | Test, red on the builder's file |
|---|---|---|---|
| 1 | Below 1280px the record is a modal drawer (`useDialog`, a document-level Tab and Escape listener). A dialog opened from it kept losing the keys: Tab inside **Place into filing** (or **Work on document**), which the page draws over the record, was pulled back into the record behind it; and Escape inside a dialog drawn within the record (a review route's form) closed the whole record and unmounted the form with it. HEAD's record was not modal, so this was new. | `VaultDrawer` takes `suspended`: while Place into filing or the source import is open, the record's focus hold is off (`useDialog(…, !suspended)`), and it comes back when they close. Its Escape ignores a press while a dialog is open inside it, so that dialog closes alone. | `vaultWorkArea` "below 1280px, Place into filing opened from the record keeps the keyboard"; `vaultReviewRoute` "Escape closes the route form and leaves the record it was opened from". |
| 2 | When the Vault read fails, the header still offers "Add files" (as at HEAD), but the staging rows had moved into the Uploads view, which is not drawn in the error state: chosen or dropped files were staged invisibly, with no way to upload or cancel them. At HEAD they were listed under the header. | The Uploads view's upload block (`uploadBlock`) is also drawn under the error state whenever files are staged or a check-in offer is pending. | `vaultWorkArea` "when the Vault cannot be read, files added are still staged on screen". |

Checked and kept as the builder left it:
- Red first: `vaultWorkArea`'s 11 tests fail against HEAD's nine files (`skeptic/vaultWorkArea-at-HEAD.txt`, rerun here).
- Every `data-testid` in the nine files is kept; every removed visible control has its place in the capability table.
- One more deviation the table records but the deviations list did not: the list has **no column header row**
  (C.3's sketch shows "Name Type Modified"); the five fields are on two lines per row, so a header would label one line
  of two. Recorded here so the acceptance pass judges it in the browser.
- Two orange fills appear only while a form is open ("Upload N files" while files are staged, the catalog record's
  "Confirm as written" / "Save correction"), as C.4 step 10 allows for a form's own submit.

Results after the fixes: 117 suites (`skeptic/suites.list`: every test importing or rendering a changed file, the
builder's 81 among them), **1325 passed, 4 failed** (`skeptic/suites-after-fix.txt`). Three are the three that fail at
HEAD (`apiRequest` called with four arguments). The fourth, `shellWiring` "locked for the workspace: the
conversation shows the offer as a record", renders the conversation, not the Vault, and fails the same way with HEAD's
Vault files put back (`skeptic/shellWiring-with-HEAD-vault.txt`). D0 guards 53/53; `ci:undefined-css-classes` OK; eslint:
the same four `Vault.tsx` rule/site pairs as HEAD (max-lines, max-lines-per-function, complexity ×2), none new;
typecheck of `Vault.tsx` and its imports: no error in a Vault file.

Still open:
- `ci:surface-text-ramp` is stale on this change alone: another session committed its own regeneration meanwhile, and
  `green/surface-text-ramp.regenerated.patch` is now re-made against the current HEAD. It applies cleanly and changes
  only `.vd-*` selectors and two counts. `surface-text-ramp.css` is not in this step's file list, so it is left for the
  lead: `node scripts/design/generate-surface-text-ramp.mjs`.
- The running-app acceptance (C.6 1, 2, 5, 7; D5 §WA.6 at 1440 and 390, light and dark) is still not done.
- `coverage-v2.css` 862–938's dead Vault rules and the "two surfaces" comment above line 834 (deviation 5).
