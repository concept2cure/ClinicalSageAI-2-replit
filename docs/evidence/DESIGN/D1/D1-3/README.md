# D1-3: the ⌘K palette (D1 §D1.F)

**Package:** D1, Shell, Home and the conversation (`Plan: D1`).
**Step:** D1-3 of `.design/claude-convergence/BUILD_ORDER.md` §1 D1: `v2/Shell.tsx` (`CmdK`, and `useRecentThreads` in the
same file), and in `styles/app-v2.css` the ⌘K block (the spec's 2351–2384 and `:416`, found by selector), deleting
`.cmdk-foot*`.
**Spec:** `.design/claude-convergence/D1.md` §D1.F (steps 1–6), with §D1.I (the tests: `cmdkPlaces`, `cmdkLicenseGating`,
`shellProjectRailAndPalette`, and the placeholder in `shellNav`, `shellAskGuard`, `shellProtocolLeaveGuard`).
**Read at:** `1c48581ae` on `concept2cure-v2`, 2026-11-02 (D1-4 `14dce5e38`, D1-1 `7a9b896b9`, D1-2 `f7b11e77a`;
`1c48581ae` touches only the plan's ledger and decisions). The tree is mid-merge (another session's merge of origin,
`MERGE_HEAD` `4ea4b534e`); none of its staged or unmerged paths is a D1-3 file. The spec's line numbers were read at
`e11b3bfb72`; the lines below are re-read at `1c48581ae`. Re-checked at `75cc3c1c8` before filing: `Shell.tsx` and
`app-v2.css` are unchanged since `1c48581ae`; D4-2's commit `b6a46499f` took this step's hunk of
`golden-customer-journey.e2e.ts` with its own (see "For the committer").
**Order:** after D1-4, D1-1 and D1-2, the last of the shell lane's four (BUILD_ORDER §1 D1, "Order"). D1-2's README asks
that it be pushed with this step: at ≤640px Collaborate and New task left the top bar for ⌘K (§D1.B step 3), and this
step is where ⌘K gains them.

This step adds no screen, route, service, table, mount, AnA tool or component file (RULE 6). `useRecentThreads` and
the palette's two helpers are functions inside `Shell.tsx` (BUILD_ORDER §5.1 item 4 lists `useRecentThreads`). It
reaches three existing things from the palette: the person's conversations (the route the sidebar's Recents reads),
the launcher (`surfaces/CollabLauncher.tsx`, through the top bar's own `openLauncher`) and the conversation screen
(`window.C2C_CONVO = { id }`, the shell's one conversation channel).

---

## What already exists (RULE 3)

### Searches run

- `grep -rn` over `client/src`, `shared`, `tests`, `scripts` (`.ts`, `.tsx`, `.css`, `.mjs`, `.json`) for `CmdK`, `cmdk`,
  `Command palette`, `Search surfaces`, `Jump to`, `Quick actions`, `'Surfaces'`, `_hd_`, `cmdk-foot`, `cmdk-hdr`,
  `cmdk-empty`, `Ask AnA`, `Recent conversations`, `useRecentThreads`, `chat/threads`, `RailRecents`, `C2C_CONVO = {`,
  `openLauncher`, `C2C.open`, `Message a colleague`, `launch:task`, `New task`, `breadcrumbTierOf`, `AI_ACTIONS`.
- `grep -rln` over `client/src/concept2cure/v2/__tests__`, `tests/ui`, `tests/e2e` for the same names, to find every
  test and walk that pins the palette's words, groups, placeholder or look.
- `git log --all --diff-filter=D --name-only` on `*CommandPalette*`, `*commandPalette*`, `*Palette*`, `*palette*`,
  `*CmdK*`, `*cmdk*`, `*CommandMenu*` (the clone is not shallow: `git rev-parse --is-shallow-repository` → `false`).
  Found: `components/concept2cure-home/CommandPalette.tsx` and `mdx/shell/CmdK.tsx` (deleted in `2895218b8`,
  2026-08-04, "one shell"), `components/command/ZenCommandPalette.tsx` (`d04381632`, 2026-05-01), and two slash-command
  menus (`SlashCommandMenu.tsx`, `AnaSlashCommandMenu.tsx`, 2026-05/06). `Shell.tsx` `CmdK` is the one palette that
  replaced them; nothing here rebuilds any of them.
- `git log -S "Recent conversations"` over `client/src/concept2cure`: `4a5cc0d22` (2026-10-31) removed Home's "Recent
  conversations" list (`HomeConversations`) when the sidebar's Recents took its place (and `d97388005` before it). This
  step does not bring that list back on Home; it lists the same conversations in the palette, from the same read.
- `server/routes/chat/threads.ts` `listThreads` (35–135): what the palette can read. Without `project_id` or
  `program_id` it lists the caller's own threads in the organisation, newest first, titled by their first message,
  `?limit` up to 50; a failed read answers an error status, never `{ threads: [] }`.

### The pieces this step changes

| Piece | Path (lines at `1c48581ae`) | What it does today | What it does not do |
|---|---|---|---|
| Palette | `v2/Shell.tsx` `CmdK` 914–1265 | A modal dialog ("Command palette"), always mounted by `V2App.tsx` (1355–1364), opened by ⌘K and the sidebar's Search. Field placeholder **'Search surfaces, or ">" for actions…'** (1187); a clear button (`.tbtn`). **Empty query** (1024–1032): **"Jump to"** (the places, `RAIL_CORE` by the rail's own visibility rule, each through `navResult`), then "This project" (the open project's six steps, `PJ_LIFECYCLE`, hinted with the project's code), then **"Quick actions"** (Run validation, Export document). **A search** (1034–1100): ">" lists `AI_ACTIONS`; otherwise "This project" (matching steps), "Projects" (`projectItems`, with its reading and failed-read notes), **"Surfaces"** (`UI_SURFACES` matching label, notes, id, group and AnA tool families, minus launch-scope locks and pages the account menu withholds, `offeredTo` / `ADMIN_AUDIENCE`), "Actions" (up to three matching `AI_ACTIONS`), then an **"AnA"** header over the row **'Ask AnA: "…"'** with the hint "Ask AnA". Arrow keys, Enter and Escape (1135–1153); a locked row opens `NavUnlockPanel` (rendered outside the open branch, 1163–1170); every other row asks the leave guard (`canLeave(dialogRef.current)`) and dispatches by kind (1106–1132). A **footer** (1253–1258): "↑↓ navigate", "↵ select", "esc close", "/ jump · > action". | No recent conversations. No New task, no Message a colleague. |
| Hints | `Shell.tsx` `navResult` 973–1000 | A locked row's hint is its reason (`lockShortReason`); every other nav row's is `breadcrumbTierOf(s)?.label`. Among the places only CMC / Module 3 has one: **"Biotech & Pharma"** (computed at `1c48581ae` for every `RAIL_CORE` entry; the other nine have none). Steps carry the project's code; projects their code; actions "Action" / "Action · e-sign". | — |
| Result kinds and dispatch | `Shell.tsx` `CmdKItem` 853–879, `run` 1106–1132 | Kinds `header`, `note`, `nav` (with `applies` for a place's or step's screen action), `project`, `action`, `ask`. | No conversation kind, no launcher kind. |
| Recents read | `Shell.tsx` `RailRecents` 531–569 (the read at 533–537), `RAIL_RECENTS` 506 | `useLiveData` on `GET /api/chat/threads?limit=15` with `hasKeys('threads')`; honest "Loading…", "Couldn't load your conversations." and "Your conversations appear here."; each thread reopens it through `Rail`'s `onOpen` (368–374: leave guard, close the phone drawer, `window.C2C_CONVO = { id }`, `onNav('conversation-thread')`). | Read only by the sidebar. |
| Launcher | `Shell.tsx` `openLauncher` 774–776 (D1-2); `surfaces/CollabLauncher.tsx` `C2C.open` 397–399 | The top bar's Collaborate and New task call `openLauncher('collab' \| 'task')`, i.e. `window.C2C.open(mode)`, which opens the launcher modal on that tab with the screen's context; ⌘⇧T does the same. At ≤640px both top-bar buttons are hidden (D1-2, `app-v2.css` `.topbar .tb-collab, .topbar .tb-newtask`). | Not in ⌘K, so at phone width neither is reachable from the chrome. |
| Project search | `v2/paletteProjects.ts` (helpers) | The Projects group: `GET /api/c2c/projects?limit=200` while the palette is open; match by title and code; a failed read says so. | Unchanged by this step. |
| Locks | `v2/navEntitlements.tsx`, `v2/NavUnlockPanel.tsx` | The verdicts the rail and the palette share; a locked row stays a focusable row named with its reason, and opens the unlock panel. | Unchanged by this step. |

### The CSS, at `1c48581ae` (`client/src/concept2cure/v2/styles/app-v2.css`)

| Selector (line) | Today |
|---|---|
| `.cmdk-list` (611), `.cmdk-empty` (612), `.cmdk-foot-hint` (613) | "Port helpers" (the spec's `:416`). `.cmdk-list{max-height:380px}` is overridden by the later `.cmdk-list` at 2480 (listed in `scripts/ci/css-selector-shadowing-baseline.json:7`); `.cmdk-empty` is a centred 12px `--text-400` line; `.cmdk-foot-hint` pushes the footer's last hint right. |
| `.cmdk-in input` focus (290) | D0's input block (§4.2.5): `.cmdk-in input:focus-visible{outline:none}`. Kept as D0's; not redeclared. |
| `.cmdk-bd` (2475) | Fixed, `rgba(20,20,19,.3)`, no blur, `padding-top:12vh`, `z-index:50`, no entrance. |
| `.cmdk` (2476) | 620px, `--bg-000`, radius 16, `--v2-shadow-lg`. |
| `.cmdk-in`, `.ico`, `input` (2477–2479) | 14px 16px padding; the search glyph `--text-400`; the field 15px. |
| `.cmdk-list` (2480) | `max-height:340px`, scrolls. |
| `.cmdk-item` (2481) | 9px 11px, radius 6, full width, **13px**. |
| `.cmdk-item.on` (2482) | **`--accent-000`, an orange tint**, for the pointer and the keyboard cursor alike. |
| `.cmdk-item .ico` (2483) | **`--accent-100`, every row's icon orange**, 15px. |
| `.cmdk-item .lbl` (2484), `.hint` (2485) | The label takes the row; the hint **11px** `--text-400`. |
| `.cmdk-foot` (2486) | The footer: **10px** `--text-400` with a top rule. |
| `.cmdk-hdr` (2487) | `--fs-caption` (12px), 600, `--text-400`. Its words are sentence case in the markup ("Jump to", "Surfaces", "AnA"); the uppercase of the spec's capture (10px, `text-transform:uppercase`, `letter-spacing:.06em`) was this rule's, swept by D0-3 (`fafcda621`). |
| Lock rules (2508–2525) | `.cmdk-item[data-locked]` mutes to `--text-300` (not `--text-400`, for contrast), restores on `.on`, the lock glyph `--warning` on `.on`, and keeps the glyph when the rail is collapsed. **Kept unchanged** (spec: "keep the lock rules"). |

The generated `surface-text-ramp.css` lists no `.cmdk*` selector at `1c48581ae`; it is regenerated, never edited by hand
(BUILD_ORDER §2.1). `ci:surface-text-ramp` is red at `1c48581ae` already (the Vault share, coordinator task 42).

### Tests and walks that read this code

| Test | What it pins | Effect of this step |
|---|---|---|
| `__tests__/cmdkPlaces.test.tsx` | The empty query's "Jump to" lists the ten places in the rail's order; a place opens as the rail opens it; release locks are not listed; the open project's steps. | "Go to" (§D1.I); gains the new groups' cases (below). |
| `__tests__/cmdkLicenseGating.test.tsx` | The eight lock contracts, in both the empty list and a search. | Unchanged in what it asserts; its comments say "Go to" (§D1.I). |
| `__tests__/cmdkAudience.test.tsx` | Administration pages by audience. | **Unchanged** (the task's condition); it must still pass. |
| `__tests__/shellProjectRailAndPalette.test.tsx` | Projects by title and code; a failed project read is said; "Ask AnA" in words a person knows. | Unchanged (it has no "Jump to"); the Ask row keeps its name. |
| `__tests__/capabilityBrowser.test.tsx` | Audit trail stays reachable from a search; the folded console has no row. | Unchanged. |
| `__tests__/projectFeatureBreadcrumb.test.tsx:210` | Finds the field by `/Search surfaces/`; the project features' hint "Projects". | The new placeholder; the hint cases are unchanged (a project feature still hints its group). |
| `__tests__/shellNav.test.tsx:268, 349, 351`, `shellAskGuard.test.tsx:122`, `shellProtocolLeaveGuard.test.tsx:66` | Find the field by `/Search surfaces/`. | The new placeholder (§D1.I). |
| `tests/e2e/golden-customer-journey.e2e.ts:324` | `getByPlaceholder(/Search surfaces/)`. | The new placeholder. (Playwright, not run on this host.) |
| `tests/e2e/launch-walk-no-lock.e2e.ts:141` | Labels the empty-query walk "⌘K Jump to". | "⌘K Go to". (Playwright, not run on this host.) |

---

## The change (D1 §D1.F)

| File | Change | Spec |
|---|---|---|
| `v2/Shell.tsx` `CmdK`, the words | Placeholder **"Search projects, conversations and pages, or type > for actions"**. Groups: "Jump to" → **"Go to"**, "Quick actions" → **"Actions"**, "Surfaces" → **"Pages"**. The "AnA" header is gone; the row **'Ask AnA: "…"'** stays (same id `ask`, kind, label, icon and `onAsk`), last in a search's list, with no hint. D2 relies on that row. | step 1 |
| `Shell.tsx` `useRecentThreads(limit, enabled)` | The threads read of `RailRecents`, factored into a hook in the same file (no new file): `GET /api/chat/threads?limit=<limit>` while `enabled`, a reply whose `threads` is not a list is a failed read; it returns `{ threads, loading, failed }`. `RailRecents` uses it (`useRecentThreads(15)`, same URL, same three honest states, same rows). | step 2 |
| `Shell.tsx` `CmdK`, the empty query | **"This project"** (when open; it moved up from after the places), **"Recent conversations"** (`useRecentThreads(5, open)`: read only while the palette is open, as `usePaletteProjects(open)` is; each row opens the conversation by `openConversation`, `window.C2C_CONVO = { id }` then `conversation-thread`, behind the leave guard), **"Go to"** (the places), **"Actions"**. A failed read adds the header and the existing note kind: "Conversations could not be read, so none are listed here." None, or a read still running, adds no group (`recentItems`). | step 2 |
| `Shell.tsx` `openConversation` | The sidebar's Recents body (`window.C2C_CONVO = { id }`, `onNav('conversation-thread')`), lifted out of `Rail`'s `onOpen` so the sidebar and the palette open a conversation one way (zero duplication), as D1-2 lifted `openNewConversation`. Each caller still asks its own leave guard first. | step 2 |
| `Shell.tsx` `CmdK`, the launcher | "Actions" gains **New task** (`launch:task`, `checkSquare`) and **Message a colleague** (`launch:collab`, `messageSquare`), kind `launch` (`LAUNCH_ACTIONS`). `run` closes the palette and calls `openLauncher('task' \| 'collab')`, the top bar's own function (`window.C2C.open(mode)`), with no leave guard, as the top bar's buttons have none: the launcher opens over the screen and leaves nothing. At ≤640px, where D1-2 hid the top bar's two buttons, these rows are their path. | step 3 |
| `Shell.tsx` `navResult` | A place's row (`PALETTE_PLACE_IDS`: every `RAIL_CORE` entry by the id it opens) has no hint; a locked place still shows its lock reason; every other row keeps `breadcrumbTierOf`, the project's code, or "Action" as before. In practice this takes "Biotech & Pharma" off CMC / Module 3 (the only place with a tier hint). | step 4 |
| `Shell.tsx` `CmdK`, the footer | Deleted: "↑↓ navigate", "↵ select", "esc close", "/ jump · > action". The arrow keys, Enter and Escape are handled as before (the `onKey` effect is unchanged). | step 5 |
| `Shell.tsx` `openPaletteResult` | The navigation half of `run` (a place or step with its screen action, a project, a conversation, an AnA action, the question) moved to one function beside `projectItems`, unchanged except the new `thread` branch. Without it `run` would reach complexity 19 (a new ESLint warning); `CmdK` drops from 267 to 252 lines. | — (structure) |
| `styles/app-v2.css`, the ⌘K block | Replaced by the spec's block: `.cmdk-bd` (z-index 80, `padding:14vh 16px 16px`, `rgb(20 20 19 / .24)`, `backdrop-filter:blur(4px)`, `de-fade`), `.c2c-v2.dark .cmdk-bd` (`rgb(0 0 0 / .5)`), `.cmdk` (640px, `--canvas-elevated`, radius 16), `.cmdk-in` (12px 16px), its glyph `--text-300`, the field (no border or fill, `--fs-section` 15px, `--text-100`), `.cmdk-list` (`min(440px,60vh)`), `.cmdk-hdr` (12px/500, `text-transform:none`, `--text-300`), `.cmdk-item` (36px, radius 8, 14px `--text-200`), `.cmdk-item.on` (`--bg-100`, `--text-100`; dark `--bg-200`), the icon 16px `--text-300`, the hint 12px `--text-300`, `.cmdk-empty` (13px `--text-300`), the ≤640px rule (the dialog 8px from the top, rows 44px), and reduced motion (no entrance). **Deleted:** `.cmdk-foot`, `.cmdk-foot-hint`, and the "port helpers" copies of `.cmdk-list` and `.cmdk-empty` (the spec's `:416`; the first was already overridden). **Kept unchanged:** the lock rules and D0's `.cmdk-in input:focus-visible`. | step 6 |
| `styles/app-v2.css`, the lock block's comment | One sentence: the generic hint is `--text-300` since D1-3 (it said `--text-400`). No lock rule changes. | step 6 ("keep the lock rules") |
| `styles/surface-text-ramp.css` (generated) | **Not edited in the tree.** D1-3's share is `green/surface-text-ramp.d1-3.patch`: `.cmdk-item.on` joins `--bg-100` and `.c2c-v2.dark .cmdk-item.on` joins `--bg-200`. See "For the committer". | §D1.I gate list |

### Deviations from the spec's literal text, and why

1. **New task and Message a colleague are also found by a search** (a typed term matching their label lists them under
   "Actions"; ">" lists them after the AI actions). The spec adds them to the empty query's "Actions". A palette row that
   vanishes as soon as its own name is typed is a dead end, and on a phone these rows are the only way to both.
2. **Structure the spec's block leaves as it was, kept:** `.cmdk-item{width:100%}` (a flex button does not stretch on
   its own), `.cmdk-item .ico{flex-shrink:0}`, `.cmdk-item .lbl{flex:1}` (pushes the hint right), `.cmdk-hdr{user-select:none}`,
   and `.cmdk-in input{min-width:0}`. Added to `.lbl`: `min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`,
   so a conversation's title (up to 120 characters, the sidebar's cut) is one line. The accessible name stays whole.
3. **`.cmdk-empty` is left-aligned** (the spec's rule has no `text-align`; the deleted port helper centred it): the
   "No results for" line and the notes now sit under the rows' text, as Claude's do.
4. **While the conversations are read, the palette shows no group** rather than a "Reading…" note. The Projects group
   shows a note under a search because an absent group there would read as "no project matches"; with nothing typed,
   an absent group claims nothing, and a note on every open would flash. A failed read is said (the spec's note).
5. **The recent conversations' icon is `messageCircle`** (the palette draws an icon on every row; `messageSquare` is
   Communication's and Collaborate's).
6. **`useRecentThreads` takes `enabled`** (the spec writes `useRecentThreads(limit)`), because `CmdK` is always mounted
   (`V2App.tsx`) and should read only while open. Its guard also requires `threads` to be a list: `{ threads: null }`
   is a failed read (before, `RailRecents` would have thrown on `.slice`).
7. **The palette's CSS checks live in `cmdkPlaces.test.tsx`, and the stylesheet parser moved** from
   `shellQuietChrome.test.tsx` into `__tests__/_cssRules.ts` (a helper, not a test), so the two files share one parser.
   Added to `shellQuietChrome.test.tsx` directly, the checks took it to 548 counted lines, a new `max-lines` warning.
   `shellQuietChrome`'s own cases are unchanged (44 pass, as before).

## Capability kept (zero loss)

| Removed or demoted | Where its outcome lives now |
|---|---|
| Footer "↑↓ navigate", "↵ select", "esc close" | The same keys, handled by the same `onKey` effect in `CmdK` (`cmdkPlaces.test.tsx` "a conversation opens … by Enter"; `shellProtocolLeaveGuard.test.tsx`'s keyboard cases). |
| Footer "/ jump · > action" | ">" is named in the placeholder. A leading "/" is still accepted and ignored (`term` strips `^[/>]`), as before; it was never more than a plain search. |
| "AnA" header | The 'Ask AnA: "…"' row, unchanged in id, label, icon and handler (`shellProjectRailAndPalette`, `shellAskGuard`, `shellProtocolLeaveGuard` pass). |
| Tier hint on places ("Biotech & Pharma" on CMC / Module 3) | The place's own name. A project feature still hints "Projects" (`projectFeatureBreadcrumb`'s hint cases pass); a locked place still shows its reason (`cmdkLicenseGating`, 11 pass). |
| "Jump to", "Quick actions", "Surfaces" | The same rows under "Go to", "Actions", "Pages". |
| Orange selected row and icons | The same cursor (`.on`, set by the pointer and the arrow keys) as a soft fill; icons in grey. |
| — (added reach) | The person's five newest conversations with nothing typed; New task and Message a colleague (the phone's path to both since D1-2). |

## Tests

All runs: `npx vitest run --config vitest.config.ts --maxWorkers=1`.

- **New, red first** (`red/tests-at-head.txt`: the final test text against HEAD's `Shell.tsx` and `app-v2.css`, in a
  scratch export of HEAD's `client/`, `shared/`, `server/`, `services/`, `.design/`, `docs/design/`, `config/` and the
  vitest config, byte-identical sources checked with `diff`):
  - `cmdkPlaces.test.tsx`, +18 cases: with nothing typed the groups are This project, Recent conversations, Go to,
    Actions; the conversations, newest first, are read as `?limit=5` and only while the palette is open; a conversation
    opens as the sidebar's Recents opens it, by click and by Enter; a failed read says so and none adds no group; a place
    carries no hint and Actions are Run validation, Export document, New task, Message a colleague; each launcher row
    calls `C2C.open('task' | 'collab')` and closes the palette without navigating; the placeholder and no footer;
    "Pages", no "Surfaces" or "AnA" header, the Ask row last with no hint; ">" lists the AI actions and "new task" finds
    New task. And the palette's rules in `app-v2.css`: the blur, dim and fade (off under reduced motion) and the dark
    dim; the 640px `--canvas-elevated` dialog; 36px/14px rows, the `--bg-100` cursor (`--bg-200` dark), grey icons, 12px
    hints; 12px sentence-case groups; the field with no ring of its own and D0's focus rule intact; no orange and
    nothing under 12px; 44px rows and the 8px top at phone width; no `.cmdk-foot` rule, one `.cmdk-list` and one
    `.cmdk-empty`, the lock rules kept.
    Red: **17 of the 18 new cases failed**; "finds the palette's rules" passes at HEAD (the rules exist, re-valued here).
- **Rewritten, each with its one-line reason in the file** (§D1.I): `cmdkPlaces` ("Jump to" → "Go to"; red 1),
  `shellNav` (2), `shellAskGuard` (3), `shellProtocolLeaveGuard` (7) and `projectFeatureBreadcrumb` (4): the field found
  by its new placeholder, red at HEAD because the old words are gone; `cmdkLicenseGating`: its comments say "Go to"
  (assertions unchanged; green at HEAD and after). Red total: **34 failed, 130 passed** (164) in 8 files;
  `cmdkAudience` (unchanged, the task's condition) and `shellQuietChrome` (parser moved only) pass at HEAD.
  - e2e (Playwright, not run on this host): `golden-customer-journey.e2e.ts` finds the field by its new placeholder;
    `launch-walk-no-lock.e2e.ts` names the empty-query walk "⌘K Go to".
- **Green** (`green/tests-after.txt`): those 8 files plus `railRecents`, `shellProjectRailAndPalette`,
  `capabilityBrowser` and the three D0 guards: **14 files, 259 passed, 0 failed** (D0's `foundationsOneDefinition` 17,
  `foundationsRetiredRatchet` 33, `foundationsSentenceCase` 3).
- **Neighbours** (`green/neighbours.txt`: every client test that imports `Shell` or `V2App` or reads `app-v2.css`, the
  D0 guards, and the seven `tests/` files that read `Shell.tsx` or `app-v2.css`; 53 files): **639 passed, 29 failed**,
  in five files untouched here, every one of the 29 red at HEAD the same way (`red/neighbours-head-failing.txt`, the
  same five files in the HEAD export: 27 + the 2 of `clientNamesSlice1` once its server imports were exported):
  `railLicenseGating` 9, `accountMenuMasterLicensing` 10, `accountMenuBilling` 3 (the `toHaveBeenCalledWith('GET',
  NAV_URL)` against a four-argument call, recorded by D1-1), `runPolicySwitch` 5 (the conversation composer's foot,
  D1-5's), `clientNamesSlice1` 2 ("Not in client copy", recorded by D1-1 and D1-2). The neighbour run used the test text
  before the CSS checks moved into `cmdkPlaces` (sources identical); the final text is the green run above.

## Gates (`green/gates.txt`, `green/eslint.txt`, `red/eslint-head.txt`, `green/tsc-narrow.txt`, `green/surface-text-ramp.txt`)

- `ci:undefined-css-classes` OK (no class added; `cmdk-foot*` left with its markup); `ci:check-css-selector-shadowing`
  OK, 0 new (it now lists `.c2c-v2 .cmdk-list` as a stale baseline entry: the duplicate is gone);
  `ci:check-shell-css-collisions` OK (22, baseline 22); `ci:one-product` OK (10 rail entries, none new);
  `ci:token-contrast` OK; `ci:design-system` OK; `check:microcopy` OK.
- ESLint on the 11 changed or new `.ts`/`.tsx` files: 0 errors and **no new warning** against `red/eslint-head.txt`.
  Existing ones moved: `Shell.tsx` 905 → 934 lines, `Rail` 253 → 252, `CmdK` 267 → 252; `_cssRules.ts` has none.
- Narrow `tsc` over `Shell.tsx`, the seven changed tests and `_cssRules.ts`: the same 5 ambient-type errors as D1-1 and
  D1-2 (`*.module.css`, `*.svg`, `ImportMetaEnv`), none in a D1-3 change.
- `ci:surface-text-ramp`: **red at HEAD already** (task 42). In a scratch repo of HEAD's tracked sheets: regenerated,
  green; plus this step's `app-v2.css`, red; plus `green/surface-text-ramp.d1-3.patch`, green. Remade at `75cc3c1c8`
  after D4-2 and D7-D moved the base; the share is the same.

## For the committer

- **Stage exactly:** `client/src/concept2cure/v2/Shell.tsx`, `client/src/concept2cure/v2/styles/app-v2.css`; the tests
  `client/src/concept2cure/v2/__tests__/` `cmdkPlaces.test.tsx`, `shellQuietChrome.test.tsx`, `_cssRules.ts` (new
  helper), `shellNav.test.tsx`, `shellAskGuard.test.tsx`, `shellProtocolLeaveGuard.test.tsx`,
  `projectFeatureBreadcrumb.test.tsx`, `cmdkLicenseGating.test.tsx`; `tests/e2e/launch-walk-no-lock.e2e.ts`; and
  `docs/evidence/DESIGN/D1/D1-3/`. Other sessions have uncommitted files in the tree: commit with
  `git commit -- <paths>`.
- **`tests/e2e/golden-customer-journey.e2e.ts` is already committed.** Its one D1-3 hunk (the field found by
  `/^Search projects, conversations and pages/`) was taken into D4-2's commit `b6a46499f` with that session's own hunks,
  before this step's `Shell.tsx`. Until D1-3 lands, that walk looks for a placeholder HEAD does not render. Nothing to
  stage for it here; land D1-3 soon after, or note it in the commit.
- **The generated ramp:** `green/surface-text-ramp.d1-3.patch` is this step's share against the ramp regenerated from
  `75cc3c1c8`'s sheets. It does not apply to the committed ramp, which is stale already (task 42): regenerate the ramp
  (`node scripts/design/generate-surface-text-ramp.mjs`) in a tree whose only uncommitted CSS is this step's
  `app-v2.css` (that takes every share), or land the stale shares first and `git apply --index` the patch.
- **Trailers:** `Plan: D1`, `Completes: client/src/concept2cure/v2/Shell.tsx`. Every file is in D1's ledger paths
  (`Shell.tsx`, `styles/**`) or `alwaysAllowed` (`**/__tests__/**`, `tests/**`, `docs/evidence/**`).
- **Push with D1-2** if D1-2 is still unpushed: at ≤640px the top bar hides New task and Collaborate, and this step's
  "Actions" rows are their phone path (D1-2's README, "Open, for the coordinator").

## Not done here, and why

- **The running-app checks** (§D1.F acceptance 1–5 at 1440 and 390, light and dark: no orange in any `.cmdk`
  descendant, the blur, no ring on the field, the 8px top and 44px rows at 390, `--bg-200` in dark, New task opening the
  launcher on its Task tab): no dev server or browser on the shared 4-CPU host. They belong to D1's package walk
  (§D1.J). For that walk to look at: `backdrop-filter` is unprefixed (Safari 18 and later); the clear button `.tbtn` in
  the field stays 24px at phone width (the spec does not name it); the Ask row, having no header, reads as the last row
  of whichever group precedes it ("Pages" or "Actions"), which is what the spec asks.
- **If the conversations arrive after the person has already moved the cursor** with the arrow keys, the cursor keeps its
  index, not its row (the list grows above it). The read takes one request on open; the palette's projects read has the
  same shape. Not in the spec.
- **`scripts/ci/css-selector-shadowing-baseline.json:7`** (`.c2c-v2 .cmdk-list`) is now stale, like D1-2's
  `.tb-cmdk .lbl` (line 18); the gate logs both and passes. `scripts/**` is not in D1's paths.
- **Playwright walks** (`golden-customer-journey`, `launch-walk-no-lock`): edited, not run on this host. The launch walk
  now also clicks the empty list's conversations, New task and Message a colleague; each opens what it names and Escape
  closes it.
