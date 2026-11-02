# D2-2: the New project flow's look (Plan: D2)

Spec: `.design/claude-convergence/D2.md` §2 (the D2-2 row at line 30; the change at §2.4), with
`.design/claude-convergence/BUILD_ORDER.md` §1 (the D2 row "D2-2") and D0.md §4.2 (the primitives in `app-v2.css`,
used here and never redefined). Built on `concept2cure-v2` at `a7e9f2e6b`, 2026-11-02, after D2-1 (`78842ee08`),
so the wizard matches the Projects page it opens from.

Trailers for the commit: `Plan: D2` and `Completes: client/src/concept2cure/v2/surfaces/Projects.tsx`.

Nothing here is new (RULE 6). The change adds no screen, route, service, component file, table or AnA tool. It
completes the existing New project view of the Projects surface and its `.npw-*` stylesheet block.

---

## What already exists (RULE 3)

These searches were run at HEAD `a7e9f2e6b` before any edit:
- `grep -n` in `Projects.tsx` for `npw-`, `STEP_LABELS`, `Team members`, `Team assignment`, `ProjectDiscoveryHandoff`,
  `RegistryPicker`, `WizardFilingSetup`, `wizardMissing`, `ph-eyebrow`, `sparkles`, `EmptyState` and `objective`.
- `grep -rn` for `.npw-*` and `.rpk-*` in `client/src/concept2cure/v2/styles/*.css`, and for every `npw-` class in
  TSX outside `Projects.tsx` (the classes are shared; see the table).
- Where a person is added to a project today: `grep -rn` for `ProjectTeamSharing`, `Grant sharing`, `Manage team`,
  `Team card` and `<h2>Team</h2>` in `client/src/concept2cure/v2/surfaces`; the sharing route's candidate query
  (`server/routes/c2c/project-sharing.ts:85`); `server/services/seat-licensing.ts`; D3.md §4.8–§4.9.
- The objective: `git show --stat 505449d7a` and its evidence README
  (`docs/evidence/SPINE/S1/2026-11-01-objective-at-creation/README.md`), and `projectIntakeRequest.ts`.
- The tests that pin the wizard or read the stylesheet: `grep -rlE "surfaces/Projects['\"]|project-home-v2\.css|npw-"`
  over `client/src` and `tests`.
- Deleted history: `git log --all --diff-filter=D --name-only -- '*NewProject*' '*Wizard*' '*wizard*' '*npw*'
  '*TeamAssign*' '*TeamPicker*'`.

| Piece | Path (at HEAD) | What it does today | What it does not do |
|---|---|---|---|
| The flow | `client/src/concept2cure/v2/surfaces/Projects.tsx` `NewProjectWizard` / `NewProjectWizardSession` (`:302–1181`) | A full-canvas view of the Projects surface (not a route, not a modal): crumb, header, a three-step rail, a scrolling body and a pinned footer. `useDialog` gives focus on open, Escape and focus return. Creates through `createProjectIntake` (`projectIntakeRequest.ts`) with a re-verified client workspace, then opens the project. Publishes its own AnA context per step (`wizardScreenContext`, `:275`). | — |
| Header | `Projects.tsx:628–637` | `.npw-head` with a "Workspace" `.ph-eyebrow`, the `.ph-title` "New project" and a `.ph-sub` sentence ("What are you filing? Choose the filing, describe the product, …"). | — |
| Step rail | `Projects.tsx:645–669`, `STEP_LABELS` `:272` | Three `li.npw-step` with `data-state` and `aria-current="step"`, each a button holding a numbered disc (`I.check` when done) and the visible kicker "Step N" above the step name. A step ahead is disabled. | — |
| Step 1 note | `Projects.tsx:679–685` | `.npw-seg-note`: an `I.sparkles` icon, "Tailored for {segment}" and "The filings for your client type come first…", in a tinted (`--accent-000`) bordered box. | — |
| Step 1 catalogue | `RegistryPicker`, `client/src/concept2cure/v2/surfaces/AnaVerbs.tsx:139` (D1's file, not edited); CSS `app-v2.css:3291–3385` (the spec's "3168–3260" has drifted) | Tabs by product kind, search, region and agency `.rpk-fchip` rows, the "built here" tier, category groups and a card per filing (`.rpk-type`) with agency, region, dossier and CTD chips in four colours; the selected chip and card in orange. | — |
| Step 2 fields | `Projects.tsx:705–963` | Market-support line (`WizardFilingSetup`), saved discovery (`ProjectDiscoveryHandoff`), client workspace, name (with the duplicate-name note), product, indication or device class, product type, target date, the FDA device fields (`.npw-grid`), indications for use, product characteristics (`.npw-flag`), the risk-based monitoring flag, then a "Team members" field. | Does not ask for the objective (that field is S1's commit, below). |
| "Team members" | `Projects.tsx:951–962` | An `EmptyState` (`I.info`) titled "Team assignment isn't available yet": "You'll be able to add teammates once the project exists and org members can be listed." A roadmap message in a box. The create body sends `teamMembers: team`, an always-empty list (`:383`). | Adds no one. |
| Where people are added today | `client/src/concept2cure/v2/surfaces/ProjectHome.tsx:2026–2031` (the Plan step's `<h2>Team</h2>` section) rendering `ProjectTeamResponsibilities` and `ProjectTeamSharing` (`ProjectTeamSharing.tsx:25`) | "Project sharing": an "Organization member" select (the organisation's active members, `project-sharing.ts:85`), a "New sharing role" (Use / Edit) and "Grant sharing"; per-member role change and revoke. Pinned reachable by `projectHomeTeamSetup.test.tsx` ("ProjectHome reaches its existing sharing controls") and, right after a create, by `newProjectWizardWorkspace.test.tsx:225–260`. D3 §4.8–§4.9 moves the same components to a Team card and drawer, still headed "Team". | Is not named anywhere in the wizard. |
| Step 3 review | `Projects.tsx:967–1081` | `dl.npw-review` of every value the create call will send, derived as it derives them; then `.npw-next`, a green-bordered tinted box with `I.sparkles`: "Your project is saved to the portfolio and opens in its workspace…". | — |
| Footer | `Projects.tsx:1151–1178` | Cancel, Back, the missing-field note (`wizardMissing`, `role="status"`, `#npw-missing`), Continue / Create project (the one primary). | — |
| Outcome | `Projects.tsx:1098–1144` | Two permanent live regions; `ErrorState` for a failed create (never an empty result), a quiet notice when the project exists but no dossier was started. | — |
| Wizard CSS | `client/src/concept2cure/v2/styles/project-home-v2.css:78–283` (the spec's "52–230" has drifted with D2-1) | `.npw` column layout; header 22/32 padding; the rail with orange current disc and underline, `--success` done disc, 11–12.5px text; `.npw-inner` centred at 1180 / 760; the tinted note; `auto-fit` 280px field grid; 11.5px labels, 11px `--text-400` help; 13px inputs; `.npw-review` on `--bg-050`; the green `.npw-next` box; the footer centred at 1180. | — |
| Shared `.npw-*` classes | `ProjectSettings.tsx:209–217` (`.npw-fields`, `.npw-field`, `.npw-field-l`, `.npw-field-help`), `DiscoveryQuestions.tsx:68–167` (`.npw-grid`, `.npw-field*`, `.npw-flags`, `.npw-flag*`), `ProjectDiscoveryHandoff.tsx:45–54` and `:109–118` (`.npw-review`, `.npw-field-help`, and `.npw-seg-t` on its `<h3>` "Start from your saved discovery"); `project-settings.css:12`, `discovery-onboarding.css:2–17` | The project settings panel and onboarding discovery reuse the wizard's field, flag and review classes. | — |
| Generated ramp | `client/src/concept2cure/v2/styles/surface-text-ramp.css:175` | Lists `.c2c-v2 .npw-review` as a `--bg-050` surface. Already stale at HEAD (`--check` fails on Vault and other lanes' rules, before this change). | — |
| The objective | Server half `505449d7a` (Plan: S1): `POST /api/c2c/projects` accepts `objective` | — | The field. D2.md §0 puts it in S1's row ("S1 (not D2)"), §2.4 item 6 says "S1's commit, this layout", BUILD_ORDER orders "D2-2, then S1's objective commit", and S1's README says the field ships "under `Plan: S1`, after D2-2". **So D2-2 does not add it.** D2-2 lays out what it needs (below). |
| Primitives used | `client/src/concept2cure/v2/styles/app-v2.css` D0 block `:136–431`; `.sr-only` `:1010` | `.ph-title`, `.ph-sub`, `.btn`, `.btn.ghost`, `.btn.primary` (and `:disabled`, `pointer: coarse` 44px), `.c2c-input` (one focus ring, 14px, 44px coarse), `.c2c-empty-state`, `.sr-only`. | — |
| Deleted history | `7a144fd1e` (2026-05-01) deleted `client/src/components/510k/TeamAssignment.jsx` and `ProjectCreationWizard.jsx`; `2895218b8` deleted `NewProjectDialog.tsx` | Old team picker and creation dialogs outside the Claude design. | Nothing to restore: the sharing controls above are the current way people join a project. |

The tests that pin the wizard: the 12 `newProjectWizard*.test.tsx`, `projectsNewProjectAction.test.tsx`,
`wizardFilingType.test.ts`, `projectDiscoveryHandoff.test.tsx`, `registryPickerOffers.test.tsx`,
`registryPickerReference.test.tsx`, `anaDrivesScreens.test.tsx` and `anaSeesScreens.test.tsx`. Baseline at HEAD with
every suite that imports `Projects.tsx` or reads `project-home-v2.css`, plus the D0 guards and the two team-sharing
suites: 35 files, 395 passed, 1 failed (`projectHomeStageCss`: `.pj-sec-acts` is also in `app-v2.css`, in D3's
block, not D2-2's) — `baseline/related-suites-at-HEAD.txt`.

---

## What changed (working tree; file:line as it stands now)

### `client/src/concept2cure/v2/surfaces/Projects.tsx` (the wizard only; the portfolio is D2-1's and is untouched)

- **Header, `:630–639`, spec §2.4 item 1.** The "Workspace" `.ph-eyebrow` is deleted. The `.ph-sub` reads "Choose the
  filing, describe the project, then review what will be recorded. The filing decides the dossier outline the project
  is built against." The crumb "Projects / New project" above says where this is.
- **Step rail, `:642–672`, item 2.** Markup, `STEP_LABELS` and `aria-current` kept. The "Step N" span is now
  `className="sr-only"` (`app-v2.css:1010`): read by screen readers, not shown. The disc numbers the step.
- **Step-1 note, `:682–688`, item 3.** The two divs and their text are kept; the `I.sparkles` icon is deleted.
- **Team members, `:953–957`, item 7.** The "Team members" `npw-field` and its `EmptyState` ("Team assignment isn't
  available yet") are deleted. `teamMembers: team` stays in the create body unchanged (the creator-only list the
  server expects); the comment on `team` (`:380–385`) now names where people are added.
- **Review note, `:1071–1079`, items 7 and 8.** Under the `dl`, one `p.npw-review-note`: "Your project is saved to the
  portfolio and opens in its workspace, where you can add documents and author sections with AnA. After it is
  created, share it with people in your organization from its Team section." The first sentence is `.npw-next`'s,
  kept word for word; its green box and spark are gone (see departures).
- **Not changed:** every field, its validation and its help; the filing choice; `wizardMissing` and the footer note;
  Continue / Create; `doCreate` and the create body; the outcome regions; `useDialog` (focus, Escape, focus return);
  the step buttons' keyboard order; `wizardScreenContext`. The review `dl` markup is unchanged (item 8).

### `client/src/concept2cure/v2/styles/project-home-v2.css` (the `.npw-*` block only, now `:78–234`; was `:78–283`)

Spec §2.4 item 9, restated where the block shares classes with other screens (departures below).
- **One gutter with the Projects page (`:104`, `:113`, `:143`, `:215`).** `.npw-head`, `.npw-steps`, `.npw-inner` and
  `.npw-foot` all pad `max(40px, calc((100% - 1120px) / 2))`, the expression D2-1's `.pj-index` uses; 24px at ≤1023px
  and 16px at ≤640px (`:219–234`). `.npw-scroll` loses its own padding; `.npw-inner` is no longer centred at
  1180 / 760: the catalogue takes the 1120 column and the form steps a 640px measure (`:144`), both left-aligned
  with the header.
- **Step rail (`:113–137`).** A hairline under the full rail; the row (`ol`) scrolls inside itself and never wraps;
  its `-1px` bottom margin lays the current step's 2px underline over the hairline. 40px items; 20px disc
  (`--border-strong` hairline, `--text-300`, 12px); name 14px weight 500 `--text-300`. Done: disc and name
  `--text-200` (no `--success`). Current: ink underline, ink-filled disc with a `--bg-000` digit, name `--text-100`
  weight 600. The keyboard ring sits inside the button (`:123`), because the scrolling row clips outside it.
- **Step-1 note (`:148–155`).** No box, no fill: "Tailored for …" (13px weight 500 `--text-200`) and the sentence
  (13px `--text-300`) run as one line. The base `.npw-seg-t` (`:149`) stays a 13px weight 600 `--text-100` heading,
  because step 2's saved-discovery `<h3>` uses it; the note overrides it (added by the review, below).
- **Form (`:157–183`).** 16px rhythm; `.npw-h2` 15px weight 600 `--text-100`, 12px to its body. Labels 13px weight
  500 `--text-200`; help 12px `--text-300`; `.npw-field-opt` for S1. In the wizard: two columns, one below 720px
  (`:181`, `:224`); inputs 36px (D0's form height) with D0's own 14px type and padding, and 44px under
  `pointer: coarse` (`:182–183`; the old 36px rule also beat D0's touch height).
- **Flags (`:185–200`).** 12/14 padding, radius 12, label 14px `--text-100`, why-line 13px `--text-300`.
- **Review (`:202–210`).** One `--border` frame at radius 12 on `--bg-000` (no `--bg-050` fill); rows 10/16 with a
  `--border-subtle` hairline; term 13px `--text-300` at 180px; value 14px `--text-100`, wrapping anywhere; one column
  below 720px. `.npw-review-note` 13px `--text-300`.
- **Footer (`:214–217`, `:230–233`).** Pinned, hairline above, on `--bg-000`, aligned to the gutter. At ≤640px the
  missing-field note takes its own row above the buttons; it stays mounted (it is a live region), only reordered.
- **Deleted:** `.npw-step-k` (the kicker is `.sr-only`), `.npw-seg-note .ico`, `.npw-next` and its icon rules, the
  `.npw-head .ph-sub` margin restatement (D0's `.ph-sub` margin applies), every `--accent-*`, `--success`,
  `--text-400` and `--text-500` use, and every font size below 12px or outside the `--fs-*` scale.

### Tests

**New: `client/src/concept2cure/v2/__tests__/newProjectWizardLook.test.tsx`, 17 tests.** Red at HEAD (16 failed, 1
passed: the block-found check) — `red/newProjectWizardLook-at-HEAD.txt`, run with HEAD's `Projects.tsx` and
stylesheet served by `red/vitest.head.config.ts.txt` (no file edited). Green after — `green/newProjectWizardLook.txt`.
- **The header and rail (3):** no eyebrow and the new sub-line; "Step N" in `.sr-only` for each step, no visible
  kicker, the three names, `aria-current="step"` on the first; the step-1 note without its icon, both sentences kept.
- **Team members (3):** step 2 has no "Team members" / "Team assignment" text and no `.c2c-empty-state`; step 3 has no
  `.npw-next` and no icon, and the note directly after the `dl` reads both sentences; Create still POSTs
  `teamMembers: []` and opens the project. **The replacement is reachable:** the third test reads the review's
  "from its Team section", then renders `ProjectHome`, opens Plan, finds the heading "Team" and, inside that section,
  the "Organization member" select and "Grant sharing". **Shown failing** when the project page's Team heading is
  renamed and when its sharing controls are removed (a Vite transform over `ProjectHome.tsx`, no file edited):
  `red/reachability-fails-when-team-heading-removed.txt`, `red/reachability-fails-when-team-sharing-removed.txt`,
  config `red/vitest.mutate-team.config.ts.txt`.
- **The stylesheet, read as text (11):** the block is found; no `--accent` (the view's one orange is D0's
  `.btn.primary`); every `font-size` is a `--fs-*` token; no `--text-400/500`; the current step in ink, a done step
  in `--text-200`, no status colour; the step-1 note has no box, and no `.npw-step-k`, `.npw-next` or note icon rule
  remains; the review frame (radius 12, `--bg-000`, hairline rows, no `--bg-050/100`); the four parts on one gutter
  and the 640px form measure; 36px fields with the 44px touch height restored; the two-column grid scoped to `.npw`
  while the shared `.npw-fields` keeps `auto-fit`.

**Tests that pinned the old look: none needed a change.** All 13 New project suites (the 12 `newProjectWizard*` and
`projectsNewProjectAction`) and every other suite below pass unchanged: their labels, roles, `data-testid`s,
`.npw-review-row` / `.npw-review` / `.npw-form` reads and "Step 1" in the current step's text are all kept.

---

## Where this departs from the spec, and why

1. **The objective field is not added.** D2.md §0 puts it in S1's row, §2.4 item 6 says "S1's commit, this layout",
   BUILD_ORDER §1 orders "D2-2, then S1's objective commit", and S1's evidence README says the field ships "under
   `Plan: S1`, after D2-2". D2-2 lays out what it needs: `.npw-field-wide`, `.npw-field-l`, `.npw-field-help`, the 36px
   `.c2c-input` (a `textarea` included) and **`.npw-field-opt`** (`:171`), which S1 cannot add itself because S1's
   ledger does not reach `styles/**`. The place for it is after the "Product name" label (`Projects.tsx:765–773`) and
   before Indication; the review row goes after "Project name" (`:986–989`).
2. **The review sentence says "from its Team section", not "from its Team card. Everyone you add works on licensed
   seats."** At HEAD there is no Team card: people are added on the project's Plan step, under the heading "Team"
   (`ProjectHome.tsx:2027`), through `ProjectTeamSharing`. D3 §4.8 moves the same components into a card still headed
   "Team", so "its Team section" is true now and after D3. The seat clause is dropped: the sharing route offers the
   organisation's active members (`project-sharing.ts:85`) and checks no seat, so "share it with people in your
   organization" is what the screen can promise. The reachability test pins the heading; if D3 renames it, that
   test fails and this sentence is updated with it.
3. **`.npw-next` (not named in the spec) is converged into the review note.** It was a green-bordered tinted box with
   AnA's spark, the pattern item 3 removes from the step-1 note ("the spark marks AnA, not a note") and plan §2
   retires ("next step" guidance boxes). Its sentence is kept word for word as the note's first sentence.
4. **`npw-step-k` leaves the markup; the span is `className="sr-only"` alone.** The spec writes
   `"npw-step-k sr-only"`, but with the kicker hidden `.npw-step-k` has no rule left, and `ci:undefined-css-classes`
   refuses a class no stylesheet defines.
5. **Layout rules shared with other screens are scoped to `.npw`.** `ProjectSettings.tsx` (D3) uses `.npw-fields` in a
   panel that relies on `auto-fit` (and `project-settings.css:12` at ≤600px), and onboarding's `DiscoveryQuestions.tsx`
   uses `.npw-grid` with its own media rule (`discovery-onboarding.css:16`). So the spec's two-column grid and its
   720px collapse are written `.c2c-v2 .npw .npw-fields` / `.npw .npw-grid`, and the shared base rules keep their
   layout. The **type** changes in the shared rules (labels 13px `--text-200`, help 12px `--text-300`, flags 14/13px,
   review 13/14px) do reach those screens: each raises text that was below D0's 12px floor or on `--text-400`, to
   D0's form type (`.de-label`, `.de-desc`). Their inputs keep 36px (`.npw-field .c2c-input`) and now also get 44px
   on touch.
6. **Spacing inside the flex form.** The spec's `margin: 0 0 6px` on `.npw-h2`, `12px 0 0` on `.npw-review` and
   `.npw-review-note` assume block flow, but `.npw-form` is a flex column with a gap (a layout rule the spec keeps).
   The block uses a 16px gap with no margins, and `-4px` under the heading, for D0's 12px heading-to-body rhythm.
7. **Added for D0 parity, as D2-1 did:** the 44px touch height for wizard inputs; the inset keyboard ring on step
   buttons; the 24px gutter at ≤1023px; the footer's note on its own row at ≤640px.
8. **The spec's line ranges have drifted:** the wizard is `Projects.tsx:302–1181` at HEAD (spec 590–1170), the
   `.npw-*` block `project-home-v2.css:78–283` (spec 52–230), the `.rpk-*` block `app-v2.css:3291–3385` (spec
   3168–3260).

---

## Capability kept (zero capability loss, plan §2)

| Removed or demoted | Where its outcome lives now |
|---|---|
| "Workspace" eyebrow | The crumb "Projects / New project"; the rail's active "Projects". |
| Visible "Step N" kickers | Each step's disc number and name, `aria-current="step"`, and "Step N" still read by screen readers. |
| The step-1 tinted box and spark | The same two sentences, one quiet line above the catalogue. |
| "Team members" field ("Team assignment isn't available yet") | The project page's Team section: "Project sharing" with "Organization member", "New sharing role" and "Grant sharing" (`ProjectHome.tsx:2026–2031`, `ProjectTeamSharing.tsx`), reachable on the new project's Plan step right after Create (`newProjectWizardWorkspace.test.tsx`, `projectHomeTeamSetup.test.tsx`, and the new reachability test). The review step now says where. |
| `.npw-next` green box and spark | Its sentence, word for word, in the review note. |
| Filled review table | The same rows and values, hairline-separated. |
| Orange current step | Ink underline, ink disc, weight 600, and `aria-current`. |

---

## Deferred, with what each needs

### The `RegistryPicker`'s `.rpk-*` rules (`app-v2.css:3291–3385`; the D0 lane holds `app-v2.css`)

`RegistryPicker` (`AnaVerbs.tsx:139`, D1's markup, not edited) is rendered only by this wizard (its one caller,
`Projects.tsx:693`). D2.md §2.4 item 9's `.rpk-*` block applies as written, with these current values to replace:
- `.rpk-tab` (`:3292`): 11.5px `--text-400`, `7px 12px` → 36px high, `0 10px`, 14px weight 500 `--text-300`,
  `margin-bottom:-1px`. `.rpk-tab[data-on]` (`:3293`): `--accent-200` text and underline, weight 600 → `--text-100`
  for both, weight 500. `.rpk-tab-n` (`:3296`): 10px at 0.6 opacity → 12px `--text-300`, opacity 1.
  `.rpk-compact .rpk-tab` (`:3379`) is 11px; no caller passes `compact`, so it can go to 12px or be left.
- `.rpk-cat-h` (`:3299`): 12px weight 600 `--text-400` → 13px weight 500 `--text-200`, `margin: 16px 0 8px`.
  `.rpk-cat-n` (`:3300`): 10px `--text-500` → 12px `--text-300`. `.rpk-cat-grid` (`:3301`): gap 6 → 8; one column at
  ≤720px.
- `.rpk-type` (`:3304`): radius 6, 1.5px border, `8px 10px` → radius 12 (`--radius-xl`), 1px `--border`,
  `12px 14px`; hover `--bg-050` + `--border-strong` (was `--text-500`). **`.rpk-type[data-on]` (`:3306`):
  `--accent-200` border on `--accent-000` → `--bg-050` with a `--text-100` border and `inset 0 0 0 1px --text-100`**
  (§2.6 item 2). `.rpk-type-n` (`:3307`): 11.5px → 14px weight 500, `margin-bottom: 6px`.
- `.rpk-chip` (`:3313`): 10px, radius 3, `--bg-300` / `--text-400` → 12px, `1px 6px`, `--radius-md`, `--bg-100` /
  `--text-200`. **`.rpk-chip-agency` / `-region` / `-dossier` / `-ctd` (`:3380–3383`): `--ai`, `--success`,
  `--accent-200` and `--warning` tints → the same neutral style** (`:is(...)` with `.rpk-chip`): none of them is a status.
- `.rpk-filters` (`:3371`): `6px 10px` → `10px 0`, gap 6. `.rpk-filter-label` (`:3373`): 12px weight 600 `--text-500`
  → 13px weight 400 `--text-300`, min-width 56px. `.rpk-fchip` (`:3374`): 10px, radius 3, `--bg-100`, `--text-400` →
  24px high, `0 8px`, `--radius-md`, `--bg-000`, 12px `--text-200`; hover `--border-strong` / `--text-100`.
  **`.rpk-fchip.on` (`:3376`): orange → `--text-100` border and text, weight 600, `--bg-000`.**
- `.rpk-search` (`:3366–3370`): 36px; input 12px → 14px; icon, placeholder and clear `--text-500` → `--text-300`.
- `.rpk-result-note` (`:3377`): 11px `--text-400` → 13px `--text-300`, `8px 0`. `.rpk-empty` (`:3384`): 12px
  `--text-500` → 13px `--text-300`. `.rpk-tier-h` / `.rpk-tier-s` (`:3310–3311`): 13px / 12px → `--fs-section` /
  `--fs-small`.
- No `text-transform` is left in the block (D0-3 removed it), so §2.6 item 1 already holds for `.rpk-*`.
- When it lands, regenerate the text ramp: `.rpk-fchip` leaves `--bg-100` and the chips move from `--bg-300` to
  `--bg-100`, both of which the generator tracks.
- D0 §4.7 also lists `.rpk-tab` among the retired tab names to converge on `.tabs` / `.tab`. That is a markup change
  in D1's `AnaVerbs.tsx`, not D2's.

### The generated text ramp (`surface-text-ramp.css`, not in this step's files)

`ci:surface-text-ramp` already fails at HEAD (other lanes' rules). D2-2's share is one selector: `.c2c-v2 .npw-review`
leaves the `--bg-050` list in all three places, because the review no longer has a fill. The type changes move
nothing in the ramp. The share is `green/surface-text-ramp.D2-2-share.patch`; it applies to HEAD's ramp
(`git apply --check`), or the holder of the ramp regenerates it.

---

## Tests and gates

All runs with `--maxWorkers=1` on the working tree at `a7e9f2e6b`. No server or browser was started.

| What | Result | File |
|---|---|---|
| Baseline at HEAD: the 35 suites that import `Projects.tsx` or read `project-home-v2.css`, the D0 guards, the two team-sharing suites | 395 passed, 1 failed: `projectHomeStageCss` (`.pj-sec-acts` also in `app-v2.css`, D3's block) | `baseline/related-suites-at-HEAD.txt` |
| Red: `newProjectWizardLook` against HEAD (served by `red/vitest.head.config.ts.txt`) | 16 failed, 1 passed | `red/newProjectWizardLook-at-HEAD.txt` |
| Red: the review's `.npw-seg-t` test on the builder's tree, before its fix | 1 failed | `red/review-seg-t-heading-unstyled.txt` |
| Red: the reachability test with the project page's Team heading renamed / its sharing removed | 1 failed each | `red/reachability-fails-when-team-*.txt` |
| Green: `newProjectWizardLook` | 17 passed | `green/newProjectWizardLook.txt` |
| Green (rerun by the review, after its fix, at `891e277d0`): the 13 New project suites, the D0 guards, `newProjectWizardLook`, every other suite that imports `Projects.tsx` or reads `project-home-v2.css`, the two team suites, `projectSettingsArchive`, `onboardingDiscovery`, `useOnboardingDiscovery` (38 files) | 435 passed, 1 failed: the same pre-existing `projectHomeStageCss` case (it now also names `coverage-v2.css`, from `e0534a80f`, D5-3b; nothing in this change defines `.pj-sec-acts`). All 13 New project suites unchanged and green; D0 guards (`foundationsSentenceCase`, `foundationsOneDefinition`, `foundationsRetiredRatchet`) green | `green/related-suites.txt` |
| `ci:undefined-css-classes` | OK | `green/gates.txt` |
| `check:microcopy`, `ci:check-shell-css-collisions`, `ci:check-css-selector-shadowing`, `ci:check-chip-tones`, `ci:token-cascade`, `ci:one-product`, `ci:token-contrast` | OK | `green/gates.txt` |
| `ci:internals-in-copy` | **FAIL, pre-existing, not D2-2's:** `SubmissionSeqWorkspaces.tsx:745` (RIM) | `green/gates-preexisting-failures.txt` |
| `ci:check-phantom-tokens` | **FAIL, pre-existing, not D2-2's:** `--danger-000` in D3's `.pj-quality` rule (HEAD line 496, now 444 because this block is shorter) | `green/gates-preexisting-failures.txt` |
| `ci:surface-text-ramp` | **FAIL, stale at HEAD before any edit;** D2-2's share is the patch above | `green/surface-text-ramp-check.txt` |
| ESLint, `Projects.tsx` at HEAD against the working tree plus the new test | 7 warnings each, the same 7 rules; no errors; none in the test | `green/eslint.txt` |
| Scoped `tsc` over `Projects.tsx` and the new test | No error in either. 4 errors elsewhere, the ambient declarations a scoped run lacks (CSS modules, `import.meta.env`), as D2-1 recorded | `green/tsc-scoped.txt` |
| `ci:one-design-plan` | Not run: it reads commits, and this step is not committed. Every path is in package D2's ledger (`Projects.tsx`, `styles/**`) or `alwaysAllowed` (`**/__tests__/**`, `docs/evidence/**`). | — |

---

## Not done here, and why

- **The running-app acceptance (D2.md §2.6 items 1–6) is not done.** No dev server or browser may be started in this
  session. Not yet seen: computed `text-transform` in `.npw`; the only orange being Continue / Create; two columns at
  1440 and one at 390; no horizontal scroll at 390 with the rail scrolling inside itself; footer buttons at least
  44px on a coarse pointer; light and dark. RULE 4: the step stays **open on that row** until someone captures the
  three steps at 1440 and 390, light and dark, with `$S/wiz.js` (D2.md header). §2.6 item 2's selected-card border
  also waits for the `.rpk-*` turn.
- **`.rpk-*`** waits for an `app-v2.css` turn (above), and is announced to D1 before it lands (D2.md §0).
- **The ramp** is regenerated by its holder, with the patch above as D2-2's share.

## Review (the skeptic's pass)

Rerun by the reviewer at `891e277d0`, with `--maxWorkers=1`, no server or browser:
- The diff is only the wizard: `Projects.tsx` hunks at `:382` (the `team` comment) and `:627–1079`; the stylesheet's
  hunks fall inside the `.npw-*` block (HEAD `:89–283`). D2-1's header, toolbar, cards and list are untouched.
- Red at HEAD reproduced (16 of 17 with the review's test, 15 of 16 without it), green after; the 13 New project
  suites, the D0 guards and the related suites pass (one pre-existing failure, above). ESLint on `Projects.tsx`: 7
  warnings at HEAD and after, the same rules; none in the test. `ci:undefined-css-classes`,
  `ci:check-css-selector-shadowing` and `ci:token-cascade` pass after the fix.
- The objective field: D2.md §0 and §2.4 item 6 and BUILD_ORDER (`:144`, `:162`) put it in S1's commit, after D2-2.
  It is not added here. (S1's README says both "ships with D2-2" (`:21`) and "under `Plan: S1`, after D2-2"
  (`:260`); the spec and BUILD_ORDER decide.)
- The review sentence's claims hold: the Plan step's `<h2>Team</h2>` section renders `ProjectTeamSharing`
  (`ProjectHome.tsx:2026–2031`), and the sharing route's candidates are the organisation's active members, with no
  seat check (`server/routes/c2c/project-sharing.ts:85`).

**One defect found and fixed.** The builder moved every `.npw-seg-t` declaration under `.npw-seg-note`, so the base
class had no rule. `ProjectDiscoveryHandoff.tsx:110` heads step 2's saved-discovery section with
`<h3 class="npw-seg-t">Start from your saved discovery</h3>`. Under Tailwind's preflight that heading fell to the
body's size and weight 400 (it was 12.5px weight 600 `--text-100`), so it no longer read as a heading. The fix is
one base rule, `.c2c-v2 .npw-seg-t { margin: 0; font-size: var(--fs-small); font-weight: 600; color: var(--text-100); }`
(`project-home-v2.css:149`). The step-1 note's inline override still wins there. The test "keeps `.npw-seg-t` a
heading where step 2 uses it" failed on the builder's tree (`red/review-seg-t-heading-unstyled.txt`) and passes now.

## For the commit

```
git add client/src/concept2cure/v2/surfaces/Projects.tsx \
        client/src/concept2cure/v2/styles/project-home-v2.css \
        client/src/concept2cure/v2/__tests__/newProjectWizardLook.test.tsx \
        docs/evidence/DESIGN/D2/D2-2
```

Trailers: `Plan: D2`, `Completes: client/src/concept2cure/v2/surfaces/Projects.tsx`. The message names where team
members are added now: the project's Team section (`ProjectHome.tsx` → `ProjectTeamSharing.tsx`, "Grant sharing"),
proven reachable by `newProjectWizardLook.test.tsx` and `projectHomeTeamSetup.test.tsx`.
