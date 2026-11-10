# D1-4: Your work, quiet (D1 §D1.G)

**Package:** D1, Shell, Home and the conversation (`Plan: D1`).
**Step:** D1-4 of `.design/claude-convergence/BUILD_ORDER.md` §1 D1: `TaskTray.tsx` (header, triage, rows; export
`TRIAGE_ASK`), `OpenWork.tsx` (`WorkRow` dot), `NotificationOpenButton.tsx`, and the tray block of `app-v2.css`.
**Spec:** `.design/claude-convergence/D1.md` §D1.G (steps 1–5), with §D1.C step 5 (`TRIAGE_ASK` is one source for the
tray and Home) and §D1.J 3 (nothing under 12px in Your work).
**Read at:** `9bf83a8f0f` on `concept2cure-v2`, 2026-11-01. The spec's line numbers (trigger 160–173, panel 238–290,
CSS 865–902) were read at `e11b3bfb72`; the lines below are re-read at `9bf83a8f0f`.
**Order:** D1-4 goes first in lane L1, because D6-1 imports `TRIAGE_ASK` (BUILD_ORDER §0 item 4, a hard edge).

This step adds no screen, route, service, table, mount, AnA tool or component file (RULE 6). It finishes the three
existing components and re-values their existing rules.

---

## What already exists (RULE 3)

### Searches run

- `grep -rn` over `client/src` for `TaskTray`, `OpenWork`, `NotificationOpenButton`, `tt-triage`, `tt-close`,
  `tt-read`, `tt-dot`, `tt-head`, `tt-group-head`, `tt-item`, `tt-scrim`, `tt-panel`, `Triage my day`,
  `Triage everything`, `TRIAGE_ASK`.
- `grep -n '\.tt-'` over every `client/src/concept2cure/v2/styles/*.css`, the generated `surface-text-ramp.css`
  included.
- `git log --all --diff-filter=D` on `*TaskTray*`, `*OpenWork*`, `*NotificationOpen*`, `*Triage*`, `*triage*`: no
  deleted predecessor of any of the three components (the hits are gstack tooling and a sonar script).
- `grep -rln` over `client/src/concept2cure/v2/__tests__` for the same names, to find every test that pins the look.

### The three components

| Piece | Path (lines at `9bf83a8f0f`) | What it does today | What it does not do |
|---|---|---|---|
| The bell | `v2/TaskTray.tsx` `TaskTrayOwner` 93–202, trigger 161–174 | The real open-work total (my-work total plus unread notices), "?" when a count read failed, `aria-label` "Your work — n items waiting". Mounted once, in the top bar (`Shell.tsx:781`, `onNav` and `onAsk`). | Overdue is not in its name or tone (D1-2's step 6, not this step). |
| The panel header | `TaskTray.tsx` `TrayPanel` 240–246 | `<b>Your work</b>`, meta `` `${total} assigned · ${overdue} overdue` `` ("16 assigned · 0 overdue"), or "loading…"; close `className="tt-close"` with `I.close`, `aria-label="Close"`. | — |
| Triage | `TaskTray.tsx` 250–254 | `className="tt-triage"`, `I.sparkles` then "Triage my day with AnA"; `onAsk('Triage everything assigned to me across all projects and tell me what to do first')`. The ask is an **inline string at 251**; nothing exports it. `triage` (142–146) refuses to leave when a surface guard or an account change holds the canvas. | No exported constant: D6-1 and Home's starter (D1-6b) cannot share it. |
| Notices | `TaskTray.tsx` 261–282 | Group "Messages & alerts" with "Notification preferences" (`btn ghost small`, 262); honest loading, failed and empty states (263–270); each notice a `.tt-item.tt-notif` with a dot coloured by severity (critical → `tt-dot-err`, warning → `tt-dot-warn`, **anything else → `tt-dot-ok`, green**, 273), title, body, `NotificationOpenButton` (277) and Mark read (`className="tt-read"`, `I.check`, `aria-label` `Mark "<title>" read`, `title="Mark read"`, 279). | — |
| Foot | `TaskTray.tsx` 285–287 | "Open the task board", `go('tasks')` behind the same leave guard. | — |
| Rows | `v2/OpenWork.tsx` `WorkRow` 96–108 | A button `.tt-item`: `<span className={`tt-dot tt-dot-${tone}`}>`, title, sub-line, arrow. Tone: assigned `overdue → err`, `dueSoon \|\| blocked → warn`, else **`ok` (a green dot)** (117); approvals always `err` (161, 165); reviews always `warn` (192, 196). The words already say "3d overdue", "due in 14d", "blocked", "waiting on the review". | A row with nothing to flag still carries a green dot. |
| Shared groups | `OpenWork.tsx` `OpenWorkGroups` 208–229 | One reading and one rendering for the tray and Home's "Your open items" (`surfaces/HomeSections.tsx:208`, inside `.home-open`, `surfaces-v2.css:72`). So `WorkRow` and the `.tt-group*` / `.tt-item*` rules also draw Home's list. | — |
| Notice's open button | `v2/NotificationOpenButton.tsx` 43 | `className="btn ghost"` (32px), "Open linked record" or the verified target's label, busy and retry words, error as `.tt-item-sub` `role="alert"` (44). Used only by `TaskTray.tsx:277`. | — |

### Other users of the selectors this step re-values

| Selector | Other user (not changed by this step) | Consequence here |
|---|---|---|
| `.tt-head`, `.tt-head b`, `.tt-scroll`, `.tt-panel`, `.tt-scrim` | `NotificationPreferences.tsx:131–133`, `OrganizationAccess.tsx:118–120` (their own drawers) | Their headers take the same 16px title and padding: one drawer header. |
| `.tt-close` | `NotificationPreferences.tsx:132`, `OrganizationAccess.tsx:119`: a **text** "Close" button, placed right by the rule's `margin-left:auto` | Its rule must keep serving those two. The tray's own close becomes a `.btn`, so the old rule is limited to closes that are not `.btn` (`:where(:not(.btn))`, zero specificity, so their phone rule still wins as today). |
| `.tt-item`, `.tt-item-body` | `NotificationPreferences.tsx:120` (`<label className="tt-item">`) | The structural declarations (flex, full width, left-aligned, no border) stay; only the values the spec names change. |
| `.tt-read` | none (only `TaskTray.tsx:279`) | Its 24px look is replaced by D0's `.btn small`; the class stays as the hook of the phone rule. |
| `.tt-scrim` | `journey-v2.css:464–466, 566` alias it to the drawer scrim (D0 §4.2.14); `app-v2.css:1022` keeps its layer under the panel | Untouched. |
| `.tt-item:hover`, `.tt-more:hover`, `.tt-close:hover`, `.tt-read:hover` | the generated `styles/surface-text-ramp.css:226–227` (the `--bg-050` block) and `:556–557` (the `--bg-100` block) | The generator derives these from the sheets; `ci:surface-text-ramp` fails until it is re-run (`node scripts/design/generate-surface-text-ramp.mjs`). Never hand-edited. |
| `.tt-badge` | the trigger | **D1-2's** (`D1.md` §D1.B step 7; BUILD_ORDER §1 D1-2 names `.tt-badge` and `.tt-trigger[data-overdue] .tt-badge`). Not touched here: it stays 10px orange until D1-2. |

### The CSS, at `9bf83a8f0f` (`client/src/concept2cure/v2/styles/app-v2.css`, the "Task Tray" block, 1016–1078)

| Selector (line) | Today |
|---|---|
| `.tt-head` (1040) | `padding:14px 16px`, hairline under it. |
| `.tt-head b` (1041) | 14px / 600. |
| `.tt-head-meta` (1042) | **11px**, `--text-400`. |
| `.tt-close`, `:hover` (1043–1044) | 26px square, radius 6, `margin-left:auto`, `--text-400`, hover `--bg-100`. |
| `.tt-triage`, `:hover`, `svg` (1045–1047) | **A tinted orange box**: `--accent-100` 8% fill, 1px `--accent-100` border, 12.5px / 600; the sparkles icon orange. |
| `.tt-scroll`, `.tt-group` (1048–1049) | `padding:0 14px 14px`; 16px between groups. |
| `.tt-group-head` (1050) | 12px / 600 `--text-400` (sentence case already since D0-3). |
| `.tt-item`, `:hover` (1051–1052) | `padding:9px 10px`, radius 9, hover `--bg-050`. |
| `.tt-dot`, `-err`, `-warn`, `-ok` (1053–1056) | 8px dot; red, amber, **green**. |
| `.tt-item-title` (1058) | **12.5px** / 500. |
| `.tt-item-sub` (1059) | **11px** `--text-400`, two lines. |
| `.tt-go`, `.tt-item:hover .tt-go` (1060–1061) | `--text-400`, **orange on hover**. |
| `.tt-read`, `:hover` (1063–1064) | 24px square, hover **green**. |
| `.tt-empty` (1065) | **11.5px** `--text-400`. |
| `.tt-more`, `:hover` (1066–1067) | **11.5px** `--text-300`, hover `--bg-050`. |
| `.tt-foot`, `:hover` (1068–1069) | 12px / 500 `--text-300`, **orange on hover**. |
| `@media (max-width:760px)` (1074–1078) | Close and Mark read 44px square; Triage, Show more, the foot and every `.tt-panel .btn` 44px tall (RR5 phone acceptance). |

### Tests that read this code

| Test | What it pins | Effect of this step |
|---|---|---|
| `__tests__/taskTrayHonestReads.test.tsx` | Honest failed reads; the badge; the triage button by name `/Triage my day with AnA/` (178); "Open the task board" (192, 198, 209); no "99 assigned" after an actor change (226) | Unchanged: names and behaviour kept. |
| `__tests__/taskTrayNoticeOpens.test.tsx` | Notice opening; Mark read by name `Mark "Maintenance tonight" read` (124) | Unchanged. |
| `__tests__/taskTrayApprovalsFromAuthoring.test.tsx` | The approvals group by its head text and `.tt-group` (71) | Unchanged. |
| `__tests__/taskDrawerCreationGuard.test.tsx` | The tray's Close by name inside the "Your work" dialog (114) | Unchanged. |
| `__tests__/notificationRecordJourney.test.tsx`, `notificationNavigationGuard.test.tsx`, `notificationSharedSignature.test.tsx` | `NotificationOpenButton` by role and name | Unchanged. |
| `__tests__/homeOpenItems.test.tsx`, `reviewRouteInbox.test.tsx` | Home's open items and the review-route rows through `OpenWorkGroups` | Unchanged. |
| `__tests__/reviewRoutePhoneWidth.test.ts:123–134` | The 760px rule: `.tt-close` and `.tt-read` 44px square; `.tt-triage`, `.tt-more`, `.tt-foot`, `.tt-panel .btn` 44px tall | Unchanged: the tray's Close and Mark read keep their `tt-close` / `tt-read` hooks beside `btn`, so the rule still reaches them. |

All ten suites above: **87 passed** at `9bf83a8f0f` (run before any change).

---

## The change (D1 §D1.G)

Commits since the read (`505449d7a`, `05337588f`, `e4ea399d6`, `95dbf007c`) touched none of the files below.

| File | Change | Spec |
|---|---|---|
| `v2/TaskTray.tsx` | `export const TRIAGE_ASK` (the string that was inline at 251); the triage row calls `onAsk(TRIAGE_ASK)`. | §D1.C step 5, §D1.G step 2; BUILD_ORDER §0 item 4 |
| `TaskTray.tsx` `TrayPanel` header | Meta reads `` `${total} assigned · ${overdue ? `${overdue} overdue` : 'none overdue'}` ``. Close is `className="btn tt-close"`, `I.close`, `aria-label="Close"`. | §D1.G step 1 |
| `TaskTray.tsx` triage | `className="btn ghost tt-triage"`, `<span className="tt-spark" aria-hidden="true">✻</span>` then "Triage my day with AnA" (the `I.sparkles` icon goes). Same handler, same leave guard. | §D1.G step 2 |
| `TaskTray.tsx` notices | The dot shows only for `warning` (`tt-dot-warn`) and `critical` (`tt-dot-err`); any other severity renders `tt-dot` with `data-quiet`. Mark read is `className="btn small tt-read"` with `I.check`, same name and `title`. Notification preferences is `btn small` (was `btn ghost small`), still in the group head. | §D1.G step 4 |
| `v2/OpenWork.tsx` `WorkRow` | An `ok` row renders `tt-dot` with `data-quiet` (kept for alignment, hidden); `err` and `warn` keep their dot. The tone rules and words are unchanged. Home's "Your open items" uses the same row. | §D1.G step 3 |
| `v2/NotificationOpenButton.tsx` | `btn ghost` → `btn ghost small`. | §D1.G step 4 |
| `styles/app-v2.css`, the tray block | `.tt-head`, `.tt-head b` (16/600), `.tt-head-meta` (`flex:1`, 13px `--text-300`), `.tt-triage` (left-aligned, full width, 36px, on `.btn.ghost`), `.tt-spark`, `.tt-group-head` (13px/500 `--text-300`, flex, `text-transform:none`), `.tt-item` (10px 12px, radius 8, hover `--bg-100`), `.tt-item-title` (14px), `.tt-item-sub` (13px `--text-300`), `.tt-dot[data-quiet]{visibility:hidden}`, `.tt-item:hover .tt-go, .tt-foot:hover` (`--text-100`, was orange), `.tt-foot` (13px): the spec's values, with each rule's structural declarations kept. Deleted: the tinted `.tt-triage` and its `:hover` and `svg` rules, `.tt-dot-ok` (no user left), the 24px `.tt-read` and its green hover. | §D1.G step 5 |
| `styles/app-v2.css`, two more rules in the same block | `.tt-empty` and `.tt-more` 11.5px → `var(--fs-small,13px)`; `.tt-empty` `--text-400` → `--text-300` (D0 §3's empty-state hint). | §D1.J 3: nothing under 12px in Your work |
| `styles/app-v2.css` `.tt-close` | The old 26px rule and its hover now read `.tt-close:where(:not(.btn))`: they keep drawing the **text** "Close" of the Notification preferences and Organizations drawers (`NotificationPreferences.tsx:132`, `OrganizationAccess.tsx:119`), and no longer override the tray's `.btn` close. `:where()` adds no rank, so the 760px rule still makes both kinds a 44px square. | Consequence of step 1 |
| `styles/surface-text-ramp.css` (generated) | Re-generated by `node scripts/design/generate-surface-text-ramp.mjs`, never hand-edited: `.tt-item:hover` moves from the `--bg-050` block to `--bg-100`; `.tt-close:hover` becomes `.tt-close:where(:not(.btn)):hover`; `.tt-read:hover` leaves. | D1 §D1.I's gate list (`ci:surface-text-ramp`) |

### Deviations from the spec's literal text, and why

1. **The close is `btn tt-close`, not `btn`; Mark read is `btn small tt-read`, not `btn small`.** The 760px rule
   (`app-v2.css`, the RR5 phone acceptance, pinned by `reviewRoutePhoneWidth.test.ts:123–128`) makes `.tt-close` and
   `.tt-read` 44px squares. With the classes dropped, the rule would stay (the other drawers use `.tt-close`) and the
   test would stay green, while the tray's own Close shrank to 42×44 and Mark read to 36×44 at 390px: a silent loss.
   The hooks carry no look of their own at desktop width.
2. **`.tt-item`, `.tt-item-title`, `.tt-item-sub` and `.tt-foot` are re-valued, not replaced.** The spec's lines name
   only the changed values. Replacing the whole rule with them would drop `display:flex`, `width:100%`, `border:0`
   and the rest from a plain `<button>` (`.tt-item` is not a `.btn`) and from `NotificationPreferences.tsx:120`'s
   `<label className="tt-item">`.
3. **`type="button"`** is added to the close, triage and Mark read buttons. There is no form in the panel, so no
   behaviour changes.

## Capability kept (zero loss)

| Removed or demoted | Where its outcome lives now |
|---|---|
| Tinted triage box with the sparkles icon | The same button, name ("Triage my day with AnA"), ask (`TRIAGE_ASK`, now exported) and leave guard, as a quiet ghost row led by the ✻. |
| Green dot on every row | The row's words ("due in 14d", "3d overdue", "blocked", "waiting on the review"); the red and amber dots stay where they mean something. The dot's slot stays, so titles stay aligned. |
| Green dot on an info notice | The notice's title and body; warning and critical keep their dot. |
| "0 overdue" | "none overdue"; any number still shown ("1 overdue"). |
| 26px close, 24px Mark read | The same buttons, handlers, accessible names and `title` as D0's `.btn` / `.btn.small`; 44px squares at 760px and below, as before. |
| Orange hover on the row arrow and the foot | The hover still darkens them, to `--text-100`. |
| `btn ghost` (32px) "Open linked record", `btn ghost small` "Notification preferences" | The same buttons and handlers, as `btn ghost small` and `btn small`. |

## Tests

- **New:** `client/src/concept2cure/v2/__tests__/taskTrayQuiet.test.tsx`, 12 tests: `TRIAGE_ASK` exported and asked
  by the triage row; the triage row is `btn ghost tt-triage` led by an `aria-hidden` ✻ with no icon; "n assigned ·
  none overdue" and "1 overdue"; the close is a `.btn`; a row due in 14 days has a `data-quiet` dot while late and
  blocked rows keep `tt-dot-err` / `tt-dot-warn` (§D1.G acceptance 2); notices' dots for warning and critical only;
  Mark read `btn small`, the open button `btn ghost small`, preferences `btn small`; and in the tray's rules no
  `--accent` except `.tt-spark`, no font size under 12px, `.tt-group-head` `text-transform:none`,
  `.tt-dot[data-quiet]` hidden, the title 16px and the counts 13px (§D1.G acceptance 1, §D1.J 3). `.tt-badge` is
  excluded: it is D1-2's.
  - **Red** at `505449d7aa` (no D1-4 file differs from `9bf83a8f0f`), before any change: **10 failed, 2 passed**
    (`red/taskTrayQuiet.txt`). The two that pass pin kept behaviour ("1 overdue" was always shown when non-zero,
    and the parser finds the tray block). Each failure is the case it exists for: `TRIAGE_ASK` undefined;
    `['tt-triage']` not a ghost button; "2 assigned · 0 overdue"; no `data-quiet`; `['tt-read']` not `btn small`;
    five orange rules; four sizes under 12px; no `text-transform:none`; a 14px title.
  - **Green** after: **12 passed** (`green/taskTrayQuiet.txt`).
- **Rewritten:** none. No existing test pinned the old look in a way this step changes (§D1.I lists no D1-4 test).
- **Neighbours, green after** (`green/neighbours.txt`): 18 files, **193 passed**: the new test; the ten suites
  above; `notificationPreferences`, `notificationPreferenceSafety`, `organizationAccessOwnership`,
  `accountSelfServiceOwnership` (the other drawers on `.tt-head` / `.tt-close`); and the three D0 guards
  (`foundationsOneDefinition`, `foundationsRetiredRatchet`, `foundationsSentenceCase`).
- **Known red, not this step's:** `shellChromeTruth.test.tsx` "draws the current page…" fails at HEAD and after,
  identically: it pins `.nav-item[aria-current="page"]{background:var(--accent-000)` which `app-v2.css` at HEAD no
  longer has (`git show HEAD:…app-v2.css | grep -c` → 0). `D1.md` §D1.A item 8 records it red at HEAD; D1-1
  rewrites it.

## Gates (`green/gates.txt`)

`ci:undefined-css-classes` OK; `ci:surface-text-ramp` OK; `ci:check-shell-css-collisions` OK (22, baseline 22);
`ci:check-css-selector-shadowing` OK (its note that `.reg-eyebrow` is no longer shadowed is D0's, outside this
block); `ci:token-contrast` OK; `ci:design-system` OK; `check:microcopy` OK; `npx eslint` on the three source files
and the new test: 0 errors, 1 warning, the same one as at `9bf83a8f0f` (`TaskTrayOwner` complexity 20, a function
this step does not touch). A narrow `tsc --noEmit` over the four files reports nothing in them.

## For the committer

- **Stage exactly:** `client/src/concept2cure/v2/TaskTray.tsx`, `client/src/concept2cure/v2/OpenWork.tsx`,
  `client/src/concept2cure/v2/NotificationOpenButton.tsx`, `client/src/concept2cure/v2/styles/app-v2.css`,
  `client/src/concept2cure/v2/__tests__/taskTrayQuiet.test.tsx`, `docs/evidence/DESIGN/D1/D1-4/`.
- **The generated ramp is shared with D4-1 right now.** The D4-1 session (authoring-v2.css,
  rich-section-editor.css, uncommitted) has regenerated `styles/surface-text-ramp.css` in the same tree, so the
  working-tree file holds both steps' selectors. Do **not** `git add` it. Stage this step's share alone, without
  touching the working tree: `git apply --cached docs/evidence/DESIGN/D1/D1-4/green/surface-text-ramp.d1-4.patch`
  (15 lines: the three `.tt-*` selectors and the `--bg-050` count; built by the generator from the sheets at HEAD
  plus this step's `app-v2.css`; checked with `git apply --cached --check`). Whichever of D1-4 and D4-1 commits
  second regenerates the sheet in full.
- **Trailers:** `Plan: D1`, `Completes: client/src/concept2cure/v2/TaskTray.tsx`. Every file is in D1's ledger paths
  or in `alwaysAllowed` (`**/__tests__/**`, `docs/evidence/**`).

## Not done here, and why

- **The running-app checks** (§D1.G acceptance 1's computed colours, 4's 390px and dark): this step ran no dev
  server or browser (shared 4-CPU host). They belong to D1's package walk (§D1.J), with screenshots.
- **Two things for that walk to look at,** both as the spec has them:
  - `.tt-group-head`'s `padding:16px 20px 6px` sits inside `.tt-scroll`'s 14px padding, so a group head starts 34px
    from the panel's edge, while the title starts at 20px and a row's (hidden or shown) dot at 26px. If the walk
    shows the heads out of line, `16px 12px 6px` lines them up with the rows' left edge.
  - `NotificationOpenButton` sits in `.tt-item-body`, a flex column, so its button stretches to the row's width.
    That is unchanged from HEAD (the spec did not touch it); `.btn.small` only makes it 28px tall.
- **Approval and review rows keep a dot on every row** (always red and amber, `OpenWork.tsx` 161–196): the spec
  quiets only `ok`.
- **`.tt-badge`** (10px, orange) and the trigger's `data-overdue`: D1-2's (§D1.B steps 6–7).

## Skeptic review (before commit)

- **Red, re-run independently:** the new test against HEAD's own sources, extracted to a scratch folder with
  `git archive` so the shared tree was not touched: **10 failed, 2 passed**, each failure the case it pins
  (`red/taskTrayQuiet.head-mirror.txt`).
- **The ramp patch is exact:** `surface-text-ramp.css` regenerated in a scratch mirror of HEAD's stylesheets plus
  this step's `app-v2.css` is byte-identical to HEAD's sheet with `green/surface-text-ramp.d1-4.patch` applied, and
  `--check` passes there. The commit stages that patch alone (`git apply --cached`), so the committed sheets agree.
- **Green after:** 22 files, 271 passed: the new test, every suite that imports `TaskTray`, `OpenWork` or
  `NotificationOpenButton`, the other drawers on `.tt-head` / `.tt-close`, `reviewRoutePhoneWidth`,
  `shellButtonResetYields` and the three D0 guards. The other 15 suites that read `app-v2.css` give 7 failures, none
  from this step: `shellChromeTruth` (red at HEAD, D1-1's), `runPolicySwitch` (its `authService` mock lacks
  `authService`, which `editor/authoringCurrentRead.ts` reads) and `projectHomeStageCss` (`.pj-sec-acts` is in
  `app-v2.css` at HEAD outside the tray block).
- **Gates:** `ci:undefined-css-classes`, `ci:surface-text-ramp`, `ci:check-shell-css-collisions`,
  `ci:check-css-selector-shadowing`, `ci:token-contrast`, `ci:design-system`, `ci:class-vocabulary`, `ci:one-product`
  and `check:microcopy` OK. ESLint: the same single `complexity` warning on `TaskTrayOwner` as at HEAD.
- **Left as the spec wrote it:** `.tt-head b{font-size:16px}` and `.tt-spark{font-size:15px}` are literal. There is
  no 16px sans token (`--fs-prose` is Lora prose), D0's own drawer title `.de-h-t` is a literal 16px, and tying the ✻
  to `--fs-section` would couple a glyph to the section-heading size.
