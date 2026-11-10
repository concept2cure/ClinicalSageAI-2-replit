# D3-1: the project page's frame

**Package:** D3 (`Plan: D3`). **Completes:** `client/src/concept2cure/v2/surfaces/ProjectHome.tsx`.
**Spec:** `.design/claude-convergence/D3.md` §4.1 (frame), §4.2 (header), §4.3 (objective), §4.4 (composer and
starters), §4.5 (conversations), §4.6 (steps), §4.9 "Project settings" (the drawer), §4.12 (CSS for these), and
acceptance items 1–4, 6, 7, 13 and 14 of §6.
**Read at:** `daf361c0f5` on `concept2cure-v2`, 2026-11-06.

No screen, route, service, component, table, mount or AnA tool was added (RULES 4 and 6). `StageBand` was deleted:
its guidance moved to the composer's suggestion for the step (ledger below). No test file was added; the cases that
pinned the old frame were rewritten in place. Two cases were added to `projectHomeIdentityFacts.test.tsx`.

---

## What already exists (RULE 3)

**Searches run:** `grep -rn` over `client/src/concept2cure/v2` for `StageBand`, `pj-stageband`, `What to do now`,
`StartConversation`, `pj-start-h`, `ProjectConversations`, `ProjectObjective`, `StageTracker`, `pj-lc`,
`ProjectSettings`, `pj-settings`, `useDialog`, `de-bd`, `sp-starter`, `filingTypeWords`, `workstreamForFilingType`,
`WS_LABEL`. `git log --all --diff-filter=D` on `*StageBand*`, `*ProjectSettings*`, `*ProjectObjective*` (none deleted).

| Piece | Path | What it did before D3-1 | What it did not do |
|---|---|---|---|
| The page | `surfaces/ProjectHome.tsx` `ProjectWorkspace` | The header (name, a byline of eight chips, the settings panel beside it) above a two-column grid. Steps, then `StageBand`, then the step body in the main column. The aside held About, the objective, the project's conversations and, on Author only, `ProjectSide`. | It did not keep the main column one width across steps. It had no suggestions. It put the conversation box in the aside under a "Start a conversation in {product}" heading. |
| The composer | `ProjectHome.tsx` `StartConversation` (`:1182` at the base) | A textarea named by the heading; Enter starts a thread in the project (`window.C2C_CONVO`, `conversation-thread`). | No suggestions. Its send row's spacer was `<span className="sp" />`, the surface page's class (128px of padding). |
| The conversations | `ProjectHome.tsx` `ProjectConversations` | The project's threads, paged, with AnA's working marker (`useMyLiveRuns`). Each row said "Resume". Inline styles. | — |
| The steps | `surfaces/ProjectStages.tsx` `StageTracker`, `StageBand` | Six tabs with an orange underline. A band under them: the step's name and blurb, "What to do now: …" and "Next step ›". | — |
| The step data | `fixtures/project-home-data.tsx` `PJ_LIFECYCLE` | Each step's `label`, `icon`, `blurb`, `now`, `nowDevice` (AnA's facts read `now`). | No `starter`. |
| The objective (S1) | `surfaces/ProjectObjective.tsx` | The charter's objectives section: read, versioned write with a reason, history, "Ask AnA to propose it". Shown as a boxed card in the aside. | — |
| Project settings | `surfaces/ProjectSettings.tsx`, `styles/project-settings.css` | A text button that opened a full-width panel inside the header; a hand-written Escape listener. Governed save (`GovernedConfirmDialog`), receipts, archive. | No focus trap. Focus did not return to the button. |
| D0's primitives | `styles/journey-v2.css` (`.seg`, `.de-bd`, `.de`, `.de-h`, `.de-body`, `.de-f`, `.de-x`), `useDialog.ts`, `.sp-starter` | The segmented control, the drawer and its focus handling, the suggestion chip. | — |
| Filing words | `surfaces/projectWords.ts` `filingTypeWords`, `enumWords` | Stored values in words ("IND", "Active"). | — |
| Client type | `shared/constants/domain/product-types.ts` `workstreamForFilingType` (the server's `workstreamSqlCase` is built from it) | The project list's client type. | The page did not use it. Opened by its address, the page had no client type. |

---

## What changed

### §4.1 The frame
`.pj-main` now holds, in order: the header, AnA's composer with its suggestions, the project's conversations, the
steps, the step's one-line blurb, then the step body. `aside.pj-side` starts with an `h2` "Project knowledge"
(`aria-labelledby="pj-knowledge-h"`). The grid is `1fr 320px` and one column under 900px of container width
(`@container`). The main column is **764px on all six steps** at 1440 (walk). The Author-only `ProjectSide` in the
aside stays until D3-2.

### §4.2 The header
The name is Lora 26px weight 500 (22px at 390), with a 32px gear button "Project settings" beside it. The byline
(`bylineChips`) says the filing in words, the region, the indication, a status only when it is not "active", and a
priority only when it is high or critical, in tone. The code, the client type, the phase, and an ordinary status or
priority moved to Project knowledge as facts. "not recorded" shows when a value is absent. The client type is now
derived as the project list derives it, so a page opened by its address no longer says "not recorded" for an IND
(red below).

### §4.3 The objective
S1's `ProjectObjective` sits under the name and description: an "Objective" label with "Ask AnA to propose it" and
"Edit" at the column's edge, the objective and criteria in 15px text (68ch measure), the sources, and the versions
in a `details.pj-more`. No box, no tint. A failed read is a quiet `role="note"` line.

### §4.4 The composer and its suggestions
The heading is gone. The textarea is named "Ask AnA about this project" and described by a visually hidden sentence.
Its placeholder is "How can I help with this project?". Under it, a "Suggestions" group: the open step's `starter`
(device filings use `starterDevice`), then "What is due this week, and who has it?". Submit offers no starter for
a filing that builds no sequence. Plan offers "Which documents does this filing need?" when no plan is listed. A
suggestion fills the box and moves focus there. It never sends (walk: no POST). The send row's `.sp` spacer is
gone (red below).

### §4.5 Conversations
They sit under the composer in `.pj-main`. Each row is `.pj-file.pj-thread` with its title, then AnA's working marker
or the date. "Resume this conversation" is the row's `title`. "Show older conversations" is a ghost small button. No
inline styles.

### §4.6 The steps
`StageTracker` is D0's segmented control (`.seg` / `.seg-b` / `data-on`). `.pj-lc`, `.pj-lc-stage`,
`data-status="active"` and `aria-current="step"` are kept. At 390 the control scrolls inside itself, and the page
does not scroll sideways. `StageBand` and its CSS are deleted. The blurb is one line under the control
(`.pj-step-blurb`).

### §4.9 Project settings, as a drawer (the settings half of D3-3)
The gear button carries `aria-haspopup="dialog"`, `aria-expanded` and `aria-controls`. `SettingsPanel` renders inside
D0's drawer: eyebrow "Project", title "Project settings", a close button named "Close settings", the fields in
`.de-body`, and "Reload saved settings" / "Review settings change" in `.de-f`. `useDialog(onClose, !s.review)` replaces
the hand-written Escape listener. It traps focus and returns focus to the gear (walk). It releases both to the
governed confirmation while that is open. `project-settings.css` loses the inline-panel rules. A failed note is in
`--error`; a quiet one is `--text-300`.

Left for D3-3: the Team drawer, and the `request` prop that opens settings focused on a field.

### CSS (`app-v2.css`, `project-home-v2.css`, `project-settings.css`)
- Deleted: the `.pj-stageband*` rules, `aside.pj-step-side`, `.pj-top-actions` and `.pj-start-h`. Also the settings
  panel's float, its `flex-basis:100%`, its 44px top margin and its box.
- Added under `.pj`, using D0's tokens: rules for the title row, the byline, the objective, the composer and its
  suggestions, the thread rows, the steps and blurb, the two-column facts and the Project knowledge heading.
- `foundationsRetiredRatchet`: `pj-stageband` 2 → 0, "What to do now" 1 → 0.

---

## Capability kept (D3.md §5, the rows D3-1 touches)

| Removed or demoted | Where its outcome lives now |
|---|---|
| "Start a conversation in {product}" heading | The composer's accessible name and description; the placeholder. Enter still starts a thread in the project (`projectHomeStartBox.test.tsx`). |
| `StageBand`: the step's name and blurb | The segmented control's label and `title`, and `.pj-step-blurb` under it. |
| `StageBand`: "What to do now: …" | The step's suggestion under the composer, which fills the box. `PJ_LIFECYCLE[].now` / `nowDevice` are still in AnA's facts. |
| `StageBand`: "Next step ›" | The next item in the segmented control, one click. `project-home.set-stage` is unchanged. |
| The tabs' orange underline | `.seg-b[data-on]`, `aria-current="step"`, `data-status="active"`. |
| Conversations in the aside | The same list, paging and working markers, under the composer (`projectHomeStages.test.tsx`, `projectHomeWorkingMarker.test.tsx`). |
| Byline: client type, code, phase, active status, medium or low priority | Project knowledge facts: Client type, Code, Phase, Status, Priority (`projectHomeStatusChip.test.tsx`, `projectHomeIdentityFacts.test.tsx`). A non-active status and a high or critical priority stay on the byline, in tone. |
| The objective card in the aside | The same component, reads, writes, history and "Ask AnA to propose it", under the name. |
| The inline settings panel | The same fields, reads, governed save, receipts and archive, in a drawer from the gear (`ProjectSettings.test.tsx`, `projectSettingsArchive.test.tsx`, `projectHomeSettingsHonesty.test.tsx`). |

## Not in D3-1, and why

- **The objective as a composer suggestion** (§4.4 item 5.1, "Propose this project's objective from its protocol"
  when none is recorded). S1 shipped the objective with its own "Ask AnA to propose it" button, which shows on every
  read. A suggestion would offer the same request twice. It was not added. **For the lead:** if both are wanted,
  `ProjectObjective` can report its state upward and `ProjectWorkspace` prepends the suggestion.
- **§4.6 item 4** (a Tasks handoff opens Plan). This goes with moving Tasks and approvals to Plan, which is D3-4.
- **§4.8** (the seven knowledge cards) is D3-2. The facts gained the byline's rows here so nothing was lost in between.

---

## Tests (each rewritten case was red against the new frame first, then rewritten; trunk comparison by `git stash`)

| File (`client/src/concept2cure/v2/__tests__/`) | Change |
|---|---|
| `projectHomeNextStep.test.tsx` | The band's per-step and device copy → each step's suggestion (and device suggestion); no band; the composer is never sent. |
| `projectHomeStartBox.test.tsx` | Accessible name and description; "the open step's suggestion fills the box and never sends". |
| `projectHomeStages.test.tsx` | Conversations in `.pj-main`, after the composer and before the steps. |
| `projectHomePlan.test.tsx` | "not told to see every document by the step band" → its suggestion asks which documents it needs. |
| `projectHomeDocuments.test.tsx`, `ProjectHome.mdxWorkflow.test.tsx` | `.pj-stageband-blurb` → `.pj-step-blurb`. |
| `projectHomeStatusChip.test.tsx` | "ACTIVE reads green" → active is the ordinary state, with no byline chip and nothing in alert tone. "LOW is not a warning" → not in the byline, "Low" as a fact. The blocked, at-risk, unknown and critical tone cases are unchanged. |
| `projectHomeIdentityFacts.test.tsx` | A count of "not recorded" → by row. **Added:** the client type is derived for a page opened by its address; an unknown filing type is still "not recorded" (red: `red/client-type-by-address.txt`). |
| `projectHomeWorkingMarker.test.tsx` | "Resume" is the row's `title`; the row shows the date. |
| `projectHomeOwnershipBoundary.test.tsx` | The composer's new name. |
| `ProjectSettings.test.tsx`, `projectSettingsArchive.test.tsx`, `projectHomeSettingsHonesty.test.tsx` | The panel is a named dialog; "Close settings". |
| `foundationsRetiredRatchet.test.ts` | Baselines lowered (above). |

**Result** (`green/project-suites.txt`): 80 suites, 873 tests, 1 failure. The failure is `projectHomeStageCss`'s
class-clash case, which fails on trunk too. D3-1 removes one of its clashes (`.pj` in `project-settings.css`) and
adds none.

## The running app (CLAUDE.md RULE 4)

`node docs/evidence/DESIGN/D3/D3-1/walk.cjs http://127.0.0.1:5000 <programId>`. Local stack, full migration set, one
dev-login, the "Durability walk IND" project (IND, FDA). Log: `walk.json` (`"result": "pass"`). Shots: `screenshots/`.

- 1440 and 390, light and dark: the name, the composer, a suggestion, six steps with one current, "Project
  knowledge", no band, no "What to do now", no sideways scroll, and the theme on `body`.
- A suggestion fills the box, focus is in the box, and no POST to `/api/chat` or `/api/ana` is made.
- Each of the six steps opens and offers its own suggestion. `.pj-main` is 764px on every step. No element under
  `.pj` is uppercase.
- The gear opens a dialog named "Project settings", focus moves into it, it closes by "Close settings" or Escape, and
  focus returns to the gear.

Three defects found by the walk, fixed in this change (`red/`):
1. `390-title-squeezed.txt`: at 390 the name was squeezed to 0px wide beside the gear (`project-settings.css`).
2. `client-type-by-address.txt`: "Client type: not recorded" for an IND opened by its address.
3. `composer-spacer.txt`: the empty composer was 229px tall because of a `.sp` spacer (also on trunk); now 133px.

## Gates (`green/`)

`ci:typecheck-no-regression` 0 errors (baseline 0). ESLint on the changed files: 6 warnings, the same as trunk.
`ci:undefined-css-classes`, `ci:surface-text-ramp`, `ci:check-phantom-tokens`, `ci:one-product`,
`ci:check-shell-css-collisions` and `ci:token-contrast` all pass. `ci:check-css-selector-shadowing` reports four
stylesheets this change does not touch (journey, protocol-dev-editing, research, submission), as on trunk.
