# D2-1: the Projects page (Plan: D2)

Spec: `.design/claude-convergence/D2.md` §1 (row D2-1 at line 29, the change at §1.4), with
`.design/claude-convergence/BUILD_ORDER.md` §1 (the D2 row) and §5.2 item 19 (the lead's decision on `.ctable`).
Built on `concept2cure-v2` at `e4ea399d6`, 2026-11-01. Reviewed and committed by a second session (the skeptic) on
HEAD `1d789b516`; its checks, its one fix and the open items are in "Review" at the end.

Trailers for the commit: `Plan: D2` and `Completes: client/src/concept2cure/v2/surfaces/Projects.tsx`.

Nothing here is new (RULE 6). The change adds no screen, route, service, component file, table or AnA tool. It
completes the existing Projects surface, its two filter components and its stylesheet block. It moves no capability
off the page without saying where it now lives (the "Capability kept" section below).

---

## What already exists (RULE 3)

These searches were run at HEAD `e4ea399d6` before any edit:
- `grep -n` in the three surfaces and `styles/*.css` for these names: `pj-index`, `pj-summary`, `pj-toolbar`,
  `pj-search`, `pj-cards`, `ws-switch`, `ws-btn`, `WS_TONE`, `ctable`, `ct-row`, `ph-bar-track`, `rd-chip tone-`,
  `ph-eyebrow` and `Ask AnA`.
- `grep -rn` for an existing workstream label map, under the names `WS_LABEL`, `WORKSTREAM_LABEL`,
  `workstreamLabel` and "Medical Device & IVD".
- The tests that pin Projects: `grep -rlE "surfaces/Projects['\"]|ProjectPortfolioFilters|ProjectClientFilter|WS_TONE|ws-switch|ws-btn|pj-summary|pj-toolbar|pj-index|pj-search"`
  over `client/src` and `tests`.
- The ⌘K "Ask AnA" path in `Shell.tsx`.
- The portfolio projection in `server/services/c2c/project-portfolio.ts`. It was read only, not edited.

| Piece | Path (at HEAD) | What it does today | What it does not do |
|---|---|---|---|
| The surface | `client/src/concept2cure/v2/surfaces/Projects.tsx` `Projects()` (`:1305`) | Reads `GET /api/c2c/projects` through `useLiveRows`, with server filters for client, workstream and pathway (`portfolioFilterUrl`). Filters the loaded page by status, and searches title and code (never the lead, which can be an email). Shows a grid or a list. Publishes an honest AnA context (`usePublishSurfaceContext('projects', …)`, `:1475`): loading and failure are published as themselves. Registers the surface actions `projects.new-project`, `projects.open-program`, `projects.filter` and `projects.set-view` (`:1504`). | Shows no description on a card. |
| Header | `Projects.tsx:1608–1619` | `.ph` with a "Workspace" eyebrow, the `.ph-title` "Projects", a `.ph-sub` sentence and `NeedsProjectNotice`. Then "Ask AnA" (ghost, sends "Which projects are at risk this week?") and "New project" (primary), in an inline-styled flex `div`. | — |
| Stat strip | `Projects.tsx:1629–1636`, `health` memo `:1365` | "n active projects · n% average readiness · n filing within 60 days" above the toolbar on every view. Each figure is an em dash while the read is loading or has failed (`kv()`). | — |
| Paged note | `PortfolioPagedNote`, `Projects.tsx:1194` | Says when the list is the first page, and what the counts cover. | — |
| Toolbar | `Projects.tsx:1638–1656` | The search (`.pj-search`), the client select (`ProjectClientFilter`), a spacer, and the Grid / List `.seg`, whose buttons have no `aria-pressed`. | — |
| Workstream and pathway filters | `client/src/concept2cure/v2/surfaces/ProjectPortfolioFilters.tsx` `ProjectPortfolioFilters` | Two rows of `.ws-switch` / `.ws-btn` buttons with server counts ("MDX 58", "PMA 20"), with `aria-pressed` and the groups "Workstream filters" and "Pathway filters". The pathway row shows only when there is a choice. | Names no client type: "MDX" is an internal code. |
| Status filter | `Projects.tsx:1661–1669` (`portfolioStatusChoices`) | A third `.seg` row, shown only when the loaded page holds more than one status. | — |
| Client filter | `client/src/concept2cure/v2/surfaces/ProjectClientFilter.tsx` | A native select inside a `<label>` with the visible text "Client" and inline styles. Shown when there is more than one accessible client, plus the "first 200" note. Also holds the empty-state copy ("…across MDX, Biotech, and Pharma"). | — |
| Grid card | `Projects.tsx:1703–1731` | `button.pj-card` with the title; then "code · stage · Lead … · Updated …"; a readiness bar (`.ph-bar-track`) when the figure is measured; "Dossier readiness n%" and the due date; two chips, workstream (`WS_TONE`) and the raw status; and the blocked-without-cause line. | No description. |
| List | `Projects.tsx:1734–1768`, `LIST_COLUMNS` `:1276` | `.ctable`: Project, Workstream (chip), "Stage / readiness" (bar and figure), Status, Lead, Due. Inline `fontSize` 11 and 11.5 throughout. | — |
| Workstream chip tones | `WS_TONE`, `Projects.tsx:1273` | MDX → orange `tone-ai`, Biotech → `tone-ok`, Pharma → `tone-warn`: colour with no meaning. | — |
| Page CSS | `client/src/concept2cure/v2/styles/project-home-v2.css:3–40` | `.pj-index` (28/32/80 padding, no max width), `.pj-summary`, `.pj-toolbar`, `.pj-search` (a `--bg-200` border and an `--accent-200` focus border), `.pj-cards` (gap 12, `align-items:start`), and `.pj-dossier-mkts` (F23, used by `ProjectDossier.tsx`; kept). D0-2 had already deleted the old `.pj-card` restatement. | — |
| Old filter CSS | `client/src/concept2cure/v2/styles/surfaces-v2.css:139–142` | `.ws-switch`, `.ws-btn` and `.ws-btn.on`, whose only user was `ProjectPortfolioFilters.tsx`. | — |
| List CSS (shared) | `surfaces-v2.css:274–279` (`.ctable`, `.ct-head`, `.ct-row`) | Shared by 16 TSX files. `.ct-row` is 12px on a `--bg-050` table with a `--bg-000` hover. | Not D0's and not D2's. Per BUILD_ORDER §5.2 item 19 it is not re-valued here. |
| Canonical primitives | `client/src/concept2cure/v2/styles/app-v2.css:136–431` (D0) | `.ph`, `.ph-title`, `.ph-sub`, `.ph-acts`, `.btn.primary`, `.c2c-input` (including `select.c2c-input`), `.pj-card`, `.pj-card-t/-m/-r/-blk/-foot`, `.seg`, `.seg-b` (whose active state includes `[aria-pressed="true"]`) and `.c2c-empty-state`. | — |
| Card projection | `server/services/c2c/project-portfolio.ts` `PROJECT_CARD_SELECT` (S11, `805a6f0ee`) | Since S11, also projects `description`, `indication`, `agency` (primary_agency) and `program_type`, each NULL when blank. `ProjPortfolioEntry` (`Projects.tsx:1213`) already declares them as optional. | — |
| Filing in words | `filingLabel`, `Projects.tsx:195` | "IND", "510(k)", or a document class label, from the one pathway vocabulary. | — |
| Enum to words | `enumWords`, `client/src/concept2cure/v2/surfaces/projectWords.ts:28` (D3's file, read only) | "blocked" → "Blocked". | — |
| ⌘K "Ask AnA" | `client/src/concept2cure/v2/Shell.tsx:1040` (L1's file, read only) | `Ask AnA: "<anything typed>"`. | — |
| Workstream labels | none found | `PDEV_WORKSTREAM_LABELS` (`pdev/data/enums.ts`) is a different vocabulary (CMC, nonclinical and so on). The `Workstream` type in `shared/constants/domain/product-types.ts:274` has codes only. | — |

The Projects tests at HEAD were all green before the change: 9 files, 48 tests (`projects*.test.tsx`).

---

## What changed (working tree; file:line as it stands now)

### `client/src/concept2cure/v2/surfaces/Projects.tsx`

The New project wizard (lines ~300–1180) is untouched; that is D2-2. Every hunk is in the imports, the portfolio
helpers, `anaContext` or the portfolio render.

**Imports, `:9–11`.**
- `ClientChoicesNote`, `WS_LABEL` and `enumWords` (read from D3's `projectWords.ts`, unchanged).

**`PortfolioPagedNote`, `:1195`.**
- Its inline `marginBottom` is dropped. It now sits under the grid or list, where `.scaf-note`'s own top margin
  spaces it (spec item 7).

**`WS_TONE` is deleted, spec item 8.**
- Nothing renders a workstream chip any more.

**`LIST_COLUMNS`, `:1276`.**
- Its value is now `'1.8fr 150px 110px 130px 100px 120px 120px'`, for Project, Client type, Stage, Dossier
  readiness, Status, Lead and Target date (spec item 6, widened 40 px; see the deviations below).

**`stated()`, `:1279`.**
- A value counts as stated unless it is blank or is the server's `'—'`.

**`cardLine()`, `:1292`, spec item 5.**
- It returns the first of these that has content:
  1. the stated description;
  2. otherwise the filing in words, from `filingLabel(program_type)`, agency and indication, each only when stated;
  3. otherwise the stage, with "Lead …" only when a lead is stated.
- No value is invented.

**`searchPlaceholder()`, `:1305`, spec item 3.**
- "Search projects" while the read is loading, has failed, or holds 0 rows.
- "Search 1 project" or "Search n projects" for a complete read.
- "Search the first n projects" when the read is paged.

**`anaContext`, `:1503` and `:1505`, spec item 11.**
- The filter action now says "…by client type (medical device & IVD, biotech, pharma), pathway or client…".
- The view action gains "; the list shows readiness, status, lead and the portfolio figures".
- Every fact is unchanged. One code comment now says "list" where it said "card", about where the lead is read.

**Header, `:1647–1656`, spec item 1.**
- `.ph` holds the `.ph-title` "Projects" and `NeedsProjectNotice`.
- `.ph-acts` holds one `button.btn.primary` "New project" (`I.plus`).
- The eyebrow, the sub-line, the inline-styled `div` and the "Ask AnA" button are gone.

**Toolbar, `:1658–1686`, spec items 3 and 4.**
- One row, in this order:
  1. the search (with the placeholder above);
  2. `ProjectClientFilter`;
  3. `ProjectPortfolioFilters` (Client type, then Pathway);
  4. the Status `select.c2c-input.pj-filter`, labelled with "All statuses" and `enumWords` (shown by the unchanged
     `portfolioStatusChoices` rule);
  5. `.pj-toolbar-gap`;
  6. the view `.seg`, now `role="group" aria-label="View"`, whose buttons carry `aria-pressed`.
- After the row comes `ClientChoicesNote`, the "first 200" note.

**Empty, error and loading states, `:1688–1721`.**
- They are unchanged, except that the no-match hint says "client type" where it said "workstream" (`:1716`).
- The error state keeps its Retry. An error is never shown as empty: the branch order is unchanged.

**Grid card, `:1724–1748`, spec item 5.**
- `.pj-card-t` holds the title.
- `.pj-card-m` holds `cardLine(p)`. It is omitted when that line is empty.
- `.pj-card-r` holds "code · Updated Mon DD" on the left, and "Due …" only when `due_date` is set.
- When the status is blocked, `.pj-card-blk` reads "Blocked · No cause recorded", with its icon and tooltip.
- Any other non-active status is shown in words in `.pj-card-foot`.
- There is no bar, no chip and no readiness line.

**List, `:1751–1781`, spec item 6.**
- The header row is Project, Client type, Stage, `DOSSIER_READINESS_LABEL` ("Dossier readiness"), Status, Lead,
  Target date.
- The cells are:
  - the title, with `code · activity` under it (`.pj-list-sub`);
  - `WS_LABEL[p.ws] ?? p.ws`;
  - the stage;
  - `dossierReadinessValue(...)`, with the existing `title={readinessReason ?? DOSSIER_READINESS_MEANS}`;
  - the status through `enumWords` (`data-tone="warn"` and the "No cause recorded" line when blocked);
  - the lead;
  - the due date.
- Every inline `fontSize` is gone, and so are the bars and chips.

**Figures, `:1785–1794`, spec items 2 and 7.**
- The `.pj-summary` line keeps its content: the same `health` and `kv()`, the singular "Active project" and the
  "q" cover clause.
- It renders when `view === 'list'`, after the table, empty state or error.
- `PortfolioPagedNote` follows it, in both views.

### `client/src/concept2cure/v2/surfaces/ProjectPortfolioFilters.tsx`

**`optionLabel()`, `:44`.**
- Writes "Label (n)" when the server sent a count, and the label alone when it did not. No count is never shown as 0
  (this replaces `chipLabel`).

**`export const WS_LABEL`, `:52`.**
- `{ MDX: 'Medical device & IVD', Biotech: 'Biotech', Pharma: 'Pharma', CRO: 'CRO' }`.
- This is the hard edge D3-2 imports (BUILD_ORDER §0 item 4).

**`ProjectPortfolioFilters`, `:69–95`.**
- A fragment of two `select.c2c-input.pj-filter` elements.
- **Client type**, `aria-label="Client type"`:
  - "All client types (n)", then the three client types with their counts;
  - an option for a selected value outside the three, so the select never reads "All" while filtering on something
    else.
- **Pathway**, `aria-label="Pathway"`:
  - under the unchanged `pathwaysVisible` rule;
  - "All pathways (n)", then each `PATHWAY_LABEL[key] (n)`.
- The same `workstream` and `pathway` state and callbacks are used, so `portfolioFilterUrl` and `projects.filter`
  are untouched.

### `client/src/concept2cure/v2/surfaces/ProjectClientFilter.tsx`

**`portfolioClientContext`, empty hint, `:21`.**
- It now reads "…for every client type: medical device & IVD, biotech and pharma." It said "MDX, Biotech, and Pharma":
  an internal code on screen, a retired pattern.

**`ProjectClientFilter`, `:34–44`.**
- A bare `select.c2c-input.pj-filter` with `aria-label="Client"`.
- It has no visible label, no wrapping `<label>` and no inline style.
- The same visibility rule and the same options ("All clients", "Selected client" when needed, then the clients).

**`ClientChoicesNote`, `:47`.**
- The "first 200" note, split out of `ProjectClientFilter` in the same file, so that Projects renders it under the
  toolbar (spec item 4). Same text and role.

### `client/src/concept2cure/v2/styles/project-home-v2.css`

This is the `.pj-index` block only, now `:3–77`. It was `:3–40`; the spec's "11–51" had drifted.

- `.pj-index` (`:11–14`): `flex:1; min-width:0; overflow-y:auto`. Content is at most 1120 px and centred:
  `padding: 32px max(40px, calc((100% - 1120px) / 2)) 96px`. It is 24/24/80 at ≤1023 px and 20/16/72 at ≤640 px.
- `.pj-toolbar` and `.pj-toolbar-gap` (`:18–19`).
- `.pj-search` (`:20–28`):
  - 32 px high, with a `--border-control` border at `--radius-lg`;
  - one focus ring on `:focus-within`: a `--border-focus` border and a 3 px `--accent-000` halo;
  - the input sets `outline: none` on `:focus-visible`;
  - 16 px icon, 14 px text, and a `--text-300` placeholder.
- `.pj-filter` (`:30`): `width:auto; max-width:240px`.
- `@media (pointer: coarse)` (`:31–35`): the search is 44 px high with 16 px text, as D0's inputs are.
- `.pj-cards` (`:39–48`):
  - two columns with a 16 px gap and `stretch`;
  - each card at least 120 px tall;
  - the title at 15 px and the line clamped to 2 lines each;
  - `.pj-card-r` pushed to the bottom;
  - one column at ≤900 px.
  - The `.pj-card*` primitives stay D0's, in `app-v2.css`.
- The list type, scoped under `.pj-index` (`:54–60`, BUILD_ORDER §5.2 item 19, the lead's decision):
  - `.ctable` on `--bg-000`;
  - `.ct-row` at 13 px `--text-200`, with a `--bg-050` hover;
  - `outline-offset: -2px` on `:focus-visible` (the table's `overflow:hidden` would clip an outer ring);
  - `.ct-strong` in `--text-100`;
  - `.pj-list-sub` at 12 px `--text-300`;
  - `[data-tone="warn"]` in `--warning`.
  - `.ctable` and `.ct-row` themselves are not re-valued.
- `.pj-summary` (`:65–67`): 13 px `--text-300`, 12 px above it. The unused `[data-tone="err"]` rule is dropped.
- `@media (max-width: 640px)` (`:69–73`): the search takes the full row, the filters sit two per row, and there is
  no gap.
- `.pj-dossier-mkts` (`:75`): kept as it was (F23, `ProjectDossier.tsx`).

### `client/src/concept2cure/v2/styles/surfaces-v2.css`

- `.ws-switch`, `.ws-btn`, `.ws-btn.on` and their comment are deleted (HEAD `:139–142`).
- The proof that nothing else uses them: `green/ws-switch-no-user.txt`.

### `client/src/concept2cure/v2/styles/surface-text-ramp.css` (regenerated, not hand-edited)

- `node scripts/design/generate-surface-text-ramp.mjs` was run. D2-1's own share is two selectors:
  - `.ws-switch` leaves the `--bg-100` list;
  - `.pj-index .ct-row:hover` joins the `--bg-050` list.
- See `green/surface-text-ramp-D2-1.txt`. The committed file is the generator's output for HEAD's sheets plus
  D2-1's two, so it carries no other lane's share (see "Review").

### Tests

**New: `client/src/concept2cure/v2/__tests__/projectsCardLine.test.tsx`, 10 tests.** They pin:
- the `WS_LABEL` export and its exact values;
- the card line:
  - a stated description;
  - a blank description, which falls back to "IND · FDA · Moderate-to-severe plaque psoriasis in adults";
  - a partial filing, "510(k)";
  - an older payload, which falls back to "Planning · Lead Rae Okafor";
  - no "undefined", "null" or empty separator;
- `.pj-card-r`: "CODE · Updated Oct 31", with "Due …" only when a date is set;
- no bar, chip or readiness on any card;
- the header: no eyebrow, no Ask AnA, exactly one primary, inside `.ph-acts`;
- the placeholder: "Search projects" while loading, then "Search 5 projects";
- the list: "Client type" in the header, `aria-pressed` on List, `.pj-summary` absent in the grid and after
  `.ctable` in the list, and no chip in the table.

The rewritten assertions follow, each with its one-line reason. They change only what pinned the old look.

`projectsCardStatusReadiness.test.tsx`:
- The list header `'Workstream'` becomes `'Client type'`, because the column names the client type (spec item 6).
- "Labels a measured figure…" moves from the card to the list's "Dossier readiness" column, because the card carries
  no readiness (plan §2).
- "A measured 0 draws its empty bar…" becomes "no card draws a bar or states a readiness figure", because there are
  no readiness bars (plan §2).
- "The list view draws the same bars" becomes "the list view states each figure as text, with no bar" (spec item 6).
- "An unavailable figure says so, and why…" is read on the list row and its `title`, because the figure lives in the
  list now.
- "The portfolio mean…" switches to List and pins the line's absence in the grid, because the figures are the list's
  footing (spec items 2 and 7).

`projectsHonestCounts.test.tsx`:
- Figure reads switch to List, and the 60-day count also pins the line's absence in the grid, because the figures
  are the list's footing.
- "Offers no status filter…" reads the Status select and its options instead of `.seg-b`, because the status filter
  is a select (spec item 4).

`projectsPortfolioEmptyMean.test.tsx`:
- Figure reads switch to List, and the empty case pins the line's absence in the grid. Same reason.
- "Dossier readiness unavailable" and "Dossier readiness Not recorded" on the card are read on the list row, under
  the "Dossier readiness" header, because the card states no readiness.

`projectsPathwayCounts.test.tsx`:
- The buttons "MDX 58", "PMA 20", "Other 20", "All pathways 60", "Blocked" and "All" become select options:
  "Medical device & IVD (58)", "PMA (20)", "Other (20)", "All pathways (60)", and "All statuses", "Active",
  "Blocked". Changes are made through the select, because the filters are selects (spec item 4).
- Figure reads switch to List, because the figures are the list's footing.

`projectsPortfolioTruncation.test.tsx`:
- `.pj-summary` is read after switching to List.
- It also pins the placeholder: "Search the first 2 projects" when paged, and "Search 2 projects" when complete.

`projectsDirectory.test.tsx`:
- The failed read pins the line's absence in the grid, then reads the em dash in the list.
- The in-flight test switches to List first.
- The success test reads "60%" from `.pj-summary` in the list. It used to read it from the body, where the card's
  figure also matched.

`tests/e2e/projects-pathway-counts.e2e.ts` and `tests/e2e/projects-mdx-destination.e2e.ts` (Playwright; **not run
here**, see below):
- The workstream buttons and their `aria-pressed` become the Client type select's value and option text.
- "510(k) 2" becomes the Pathway select.
- `.pj-summary` in the grid becomes the search placeholder "Search 2 projects", and the summary is read after
  clicking List.

---

## Capability kept (zero capability loss, plan §2)

| Removed or demoted | Where its outcome lives now |
|---|---|
| "Workspace" eyebrow | The rail's active "Projects" and the top bar crumb say where you are. |
| Sub-line "Every regulatory project across all workstreams…" | The grid itself. The empty state's sentence still explains the page when there are no projects (`portfolioClientContext`). `NeedsProjectNotice` still says why you landed here. |
| "Ask AnA" ("Which projects are at risk this week?") | ⌘K "Ask AnA: "<question>"" (`Shell.tsx:1040`) and the Home composer. AnA reads this screen's published context wherever it is asked (`facts.programs`, `averageReadiness`, `filingWithin60Days`). |
| Stat strip above the toolbar | The same `.pj-summary` line, with the same `kv()` honesty, at the foot of the list view. The loaded count is in the search placeholder. All three figures are in the published AnA context. |
| Workstream, pathway and status segmented rows with counts | The same filters and counts as `<option>` text in toolbar selects, driving the same state, the same server URL (`portfolioFilterUrl`) and the same `projects.filter` action. |
| Card readiness bar and "Dossier readiness n%" | The list's "Dossier readiness" column: the same value through `dossierReadinessValue`, under the same name, with the same reason tooltip. Also the project's own page, and AnA context `programs[].readiness`. |
| Card workstream chip ("BIOTECH") | The list's Client type column (`WS_LABEL`) and the Client type filter. |
| Card status chip ("ACTIVE") | Active is the default and is not stated. Any other status is stated in words on the card, and blocked keeps "No cause recorded" with its tooltip. Also the list's Status column. |
| Card "Lead …" and the stage | The list's Lead and Stage columns, and the card line's fallback when nothing else is stated. |
| List bars | The same figure as text, with its reason tooltip. |
| Client filter's visible "Client" label | The select's accessible name "Client", and its first option "All clients". |

---

## Where this departs from the spec, and why

1. **The search placeholder counts the loaded page, not `counts.total`.** The spec writes
   `counts?.total ?? countFloor(...)`. But the search covers only the loaded page (`PortfolioPagedNote` says so).
   "Search 60 projects" over a page of 50 would claim a search the screen does not run (fail closed, never
   fabricate). So a complete read says "Search n projects", with the singular for 1, and a paged one says "Search the
   first n projects". The seeded stack (6 projects, not paged) reads "Search 6 projects", as the spec's example
   does. The whole-portfolio total is still the list's "n active projects".
2. **The list's readiness column header is "Dossier readiness"** (`DOSSIER_READINESS_LABEL`), not "Readiness". The
   product names this figure one way on every screen (`dossierReadiness.ts`, the QA 2026-10-08 j1 fix, pinned by
   `projectsCardStatusReadiness`). Columns 2 and 4 are 150 px and 130 px (the spec has 140 px and 110 px) so that
   "Medical device & IVD" and the header fit.
3. **The figures render whenever the view is List, after whatever the content is** (table, empty state or error),
   not only after `.ctable`. That is what §1.6 item 7 needs ("with the portfolio route forced to fail … the line reads
   em dashes and the error state offers Retry"), and the empty-read test needs it too.
4. **`cardLine` falls back to stage and lead whenever no filing field is stated,** not only for a payload without
   the fields. A blank value and the server's `'—'` count as not stated. "Lead —" is never written. `.pj-card-m`
   is omitted when the line is empty.
5. **`ClientChoicesNote`** is the existing "first 200" note, split from `ProjectClientFilter` in the same file. The
   spec has it "rendered after the toolbar". No new file or text.
6. **Added in the block, for D0 parity:**
   - the 44 px search under `pointer: coarse`;
   - `outline-offset: -2px` on list rows (keyboard focus was clipped by `.ctable`'s `overflow:hidden`);
   - an option kept for a selected client type outside the three.
7. **Copy in D2-1's own files:** "MDX" leaves the empty hint, and "workstream" becomes "client type" in the no-match
   hint (plan §2, retired: ids and enum values on screen).

---

## Tests and gates

All runs were made with `--maxWorkers=1`, on the working tree at `e4ea399d6`.

| What | Result | File |
|---|---|---|
| Red: the 7 new or rewritten files against the surface at HEAD, before the change | 26 failed, 18 passed (every file red). The 18 that pass pin behaviour kept unchanged: the blocked-card wording, search, the filter action and the mean arithmetic. | `red/projects-tests-before-change.txt` |
| Every Projects test, `projects*.test.tsx` | 10 files, 58 passed (48 at HEAD + 10 new) | `green/projects-tests.txt` |
| Other suites that render or import Projects: `anaDrivesScreens`, `anaSeesScreens`, all 13 `newProjectWizard*`, `projectDiscoveryHandoff`, `registryPickerOffers`, `wizardFilingType` | 17 files, 249 passed | `green/related-suites.txt` |
| D0 guards: `foundationsSentenceCase`, `foundationsOneDefinition`, `foundationsRetiredRatchet` | 3 files, 53 passed | `green/d0-guards.txt` |
| `npm run --silent ci:undefined-css-classes` | OK | `green/css-gates.txt` |
| `generate-surface-text-ramp.mjs --check` | OK, 3 sheets match | `green/css-gates.txt` |
| `ci:check-shell-css-collisions`, `ci:check-css-selector-shadowing`, `ci:check-chip-tones`, `ci:token-cascade`, `ci:ana-surface-context`, `check:microcopy` | OK | `green/other-gates.txt` |
| `ci:check-phantom-tokens` | **FAIL, pre-existing and not D2-1's.** `--danger-000` in D3's `.pj-quality` rule is at HEAD line 460; it moved to 496 only because the block above grew. | `green/other-gates.txt` |
| `ci:internals-in-copy` | **FAIL, not D2-1's.** The only finding is `SubmissionSeqWorkspaces.tsx:745`, RIM's lane. | `green/other-gates.txt` |
| Scoped `tsc` over the 3 surfaces, 7 tests and 2 e2e specs | No error in any D2-1 file. There are 4 errors elsewhere, all ambient declarations a scoped run lacks (CSS modules, `import.meta.env`). | `green/other-gates.txt` |

---

## Not done here, and why

- **The running-app acceptance (spec §1.6, BUILD_ORDER §4 "needs the running app") is not done.** This session's
  constraints forbid dev servers and browsers, because 4 CPUs are shared with other agents. So the following have
  not been seen, and no before or after screenshot is filed:
  - computed `text-transform` and the single orange element;
  - Lora 26 / 22;
  - the toolbar at most 40 px high at 1440 px;
  - the card radius and padding;
  - the 390 px layout and `scrollWidth`;
  - the single focus ring;
  - the dark hover.

  RULE 4 says a screen is not done until it has been opened in the running app and used. This step stays **open on
  that row** until someone captures 1440 and 390 px, light and dark, with `cap.js` (D2.md header). The two updated
  Playwright specs need the same stack.
- **The two e2e specs were edited but not run,** for the same reason. They type-check (scoped `tsc`).

---

## Review (the skeptic, 2026-11-01)

A second session checked this change against the spec, the plan and the rules, re-ran every check itself, fixed
what was wrong, and committed it. Its files are in `review/`.

**What was checked.**
- **Scope.** Every changed file is one of the track's files, a test, or this folder. All are inside package D2's
  ledger paths (`docs/design/one-design-plan.json`) or its `alwaysAllowed` globs (`tests/**`, `**/__tests__/**`,
  `docs/evidence/**`). No `server/**`, `scripts/db/**`, `migrations/**`, `projectSettingsRequest.ts`, CMC, RIM
  or `journey-v2.css` / `coverage-v2.css` file was touched. The New project wizard (D2-2) is unchanged.
- **RULE 6 and RULE 4.** Nothing new: no screen, route, service, component file, table or AnA tool.
  `ClientChoicesNote` and `WS_LABEL` sit in the files they came from. No per-type card or second editor.
- **RULE 3.** The paths and claims in "What already exists" were spot-checked and hold, for example:
  - `Shell.tsx:1040` is ⌘K's `Ask AnA: "…"` row.
  - `filingLabel` (`Projects.tsx:196`) and `enumWords` (`projectWords.ts:28`) are where this README says.
  - "Medical Device & IVD" is at `registryModel.ts:377`.
  - No workstream-code label map existed. The only sentence-case "Medical device & IVD" labels are keyed by the
    segment id `medtech`, in `fixtures/licensing.ts:101` and `fixtures/onboarding-data.ts:72`.
- **The spec, item by item** (D2 §1.4 items 1–11), and the three departures recorded above. They stand: each is the
  honest reading of what the screen does, and each is pinned by a test.
- **D0's primitives.** `.ph`, `.ph-acts`, `.btn.primary`, `.c2c-input`, `.pj-card*` and `.seg` are used, not
  restated. Every rule this change adds is under `.pj-index`, `.pj-toolbar`, `.pj-search`, `.pj-cards` or
  `.pj-summary`, with D0's tokens (`--fs-body` 14, `--fs-small` 13, `--fs-caption` 12, `--border-control`,
  `--border-focus`, `--radius-lg`). `.ctable` and `.ct-row` are not re-valued (§5.2 item 19).
- **Retired patterns and copy.** None added. There is no `text-transform`, no orange fill beyond the one primary,
  and no new box. The copy is sentence case and calm.

**Fixed in review.**
1. **A new ESLint warning.** The change raised `Projects` to complexity 17 (max 15), one warning more than HEAD,
   from three copies of `!live.loading && !live.error`. One `const settled` now serves `portfolioMean`, the search
   placeholder and `PortfolioPagedNote`. Warnings are now 7, the same 7 rules as HEAD (`review/eslint.txt`).
2. **A comment the change made untrue.** The `anaContext` comment said the header button "sends" its question; it
   is now in the past tense and names ⌘K.
3. **The ramp patch.** `green/surface-text-ramp.D2-1-only.patch` no longer applied, because HEAD's ramp moved
   (D1-4, D4-1). It is removed. The committed ramp is the generator's output for HEAD `1d789b516`'s sheets plus
   D2-1's two, byte-identical to the working-tree ramp (`green/surface-text-ramp-D2-1.txt`).

**Re-run by the skeptic.**

| What | Result | File |
|---|---|---|
| Red: the 7 test files against HEAD's three surfaces | 26 failed, 18 passed, all 7 files red, as the builder filed. HEAD's surfaces were served through a Vite `load` hook, with no checkout. | `review/red-rerun-against-HEAD-surfaces.txt`, `review/vitest.head-surfaces.config.ts.txt` |
| Green: the 10 `projects*` files plus the 17 suites that import Projects, at HEAD `1d789b516` | 306 passed, 1 failed. All 58 Projects tests pass. The failure is a Vault test in `anaDrivesScreens`; with HEAD's `Vault*.tsx` (L8's uncommitted edits set aside), that file passes 13 of 13. | `review/green-rerun.txt`, `review/vitest.head-vault.config.ts.txt` |
| D0 guards and `ci:undefined-css-classes`, HEAD alone against HEAD plus D2-1 | Identical: 3 ratchet failures (`cm-head`, `cm-kicker`, `cm-title`) on HEAD alone, from D5-2 `ff6825ef6`; the CSS gate is OK. D2-1 adds nothing. | `review/guards-and-css-gate.txt` |
| ESLint, HEAD against the working tree | 7 warnings each, the same rules. No errors. | `review/eslint.txt` |

**Open, for the coordinator.**
- **The running-app row.** 1440 and 390, light and dark, with `cap.js`, and the two e2e specs. D2-1 stays open on
  that row (RULE 4).
- **Not D2-1's.**
  - The ratchet's `cm-*` aliases in `app-v2.css` belong to the CMC lane: D5-2 zeroed their uses.
  - The `Vault*.tsx` edits in the tree (L8) fail `ci:undefined-css-classes` and one `anaDrivesScreens` test.
  - `ci:check-phantom-tokens`: `--danger-000` in D3's `.pj-quality` rule.
  - `ci:internals-in-copy`: RIM's `SubmissionSeqWorkspaces.tsx:745`.
- **The hold.** `COORDINATION.md`'s L3 / D2-1 hold can be released. D3-2 may import `WS_LABEL`.
