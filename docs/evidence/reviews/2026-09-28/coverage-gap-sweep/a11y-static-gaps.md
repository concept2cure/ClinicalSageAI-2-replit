
# Accessibility lens — gap closure (a11y-static-gaps): DocumentWorkbench.tsx, RichSectionEditor.tsx, ProtocolDev*.tsx

**Repo:** `/home/user/ClinicalSageAI-2-replit`, branch `concept2cure-v2`, head `494b4fc14` (two commits ahead of the `232ecae9c` named in the task, on the same branch — no divergence). Read-only throughout; no file edited; no gate run with `write-baseline`; git used read-only.

## Why this pass exists

The 2026-09-28 periodic review (`docs/evidence/reviews/2026-09-28/`) named this exact gap in its own report: *"Not read line-by-line: `DocumentWorkbench.tsx` (~5,100 lines) and `RichSectionEditor.tsx` (~2,700 lines) — only the diffed hunks (18 lines) were read... `ProtocolDev*` family beyond `ProtocolDevSoa.tsx`'s 9-line diff was not opened."* The 2026-09-24 report recorded the identical caveat. Nothing already recorded as an open finding in either report touches these files, so nothing below is a re-report — this was confirmed by reading `docs/evidence/reviews/2026-09-24/a11y.md` and `docs/evidence/reviews/2026-09-28/a11y.md` in full before starting.

## Gates run (read-only)

- `npm run ci:token-contrast` → **PASS** (67 pairs, 15 documented exceptions held).
- `npm run ci:check-chip-tones` → **PASS** (139 literal tone uses, all 28 resolve to a CSS rule).

Both pass, as they did in the prior reviews. Neither gate checks ARIA state exposure (aria-pressed/aria-expanded/aria-selected) or live-region wrapping, which is where every finding below sits — the gates are the wrong instrument for this class of defect, which is why a line-by-line read was assigned.

## Findings (most severe first)

| ID | Sev | File:line | One-line |
|---|---|---|---|
| GA-1 | **blocker** | `DocumentWorkbench.tsx:3301` | Section-save reason requirement + its disabled Save button are both unreachable to keyboard/SR users once you start typing |
| GA-2 | high | `ProtocolDevWorkspace.tsx:295` (+ `DocumentWorkbench.tsx:3166`, `ProtocolDevProjections.tsx:279`) | Current tab/rail/projection selection exposed only by CSS class, no ARIA state |
| GA-3 | high | `RichSectionEditor.tsx:413` | `aria-pressed` misapplied to one-shot ribbon commands (Undo, Redo, Insert table, etc.) |
| GA-4 | medium | `DocumentWorkbench.tsx:1094` | Escape closes only the AnA rail; 6 of 9 right-rail panels have no close control |
| GA-5 | medium | `DocumentWorkbench.tsx:4199` | "Ledger BROKEN" integrity verdict not in a live region |
| GA-6 | medium | `DocumentWorkbench.tsx:3549` | Section-rename widget loses focus to `<body>` on Cancel/Escape/Save |
| GA-7 | medium | `ProtocolDevReviews.tsx:61` | "Assigned to another user" explanation hidden in a disabled button's title |

Full evidence, exact reproduction and fix for each is in the structured findings above.

### Why GA-1 is rated blocker and the others are not

GA-1 is the same defect class independently confirmed and fixed this week as **A-0928-1** (`docs/evidence/reviews/2026-09-28/a11y.md`) — a required-reason field paired with a disabled submit button whose only explanation is a `title` attribute, which a `disabled` button removes from the keyboard-operable path entirely. That fix landed in `filingTarget.tsx` only; `DocumentWorkbench.tsx` — explicitly flagged in both prior reports as unread — carries an unfixed instance of the identical pattern on the editor's single most-used control (Save a section). It is arguably worse than the fixed instance: the fixed version at least kept a persistent `aria-describedby` note that updated live; this one relies on placeholder text that vanishes the moment a user types anything. And the fix already exists in this same repository: `ProtocolDevSection.tsx` states the identical §11.10 reason requirement as permanent visible text and never hides the "why can't I save" fact behind a disabled control — proving this is not a hard problem, just an inconsistently-applied one.

GA-2 and GA-3 are high rather than blocker because the underlying actions remain keyboard-operable — only the *state* (which tab/rail/toggle is active) fails to reach assistive technology, which is a real but non-blocking WCAG 4.1.2 failure. GA-4 through GA-7 are medium: each is a genuine, reproducible AA-relevant gap, but each has a working (if inconvenient) alternate path — the toggle button remains reachable, the ledger text is discoverable by navigating to it, focus can be re-established manually, and the reviewer-disposition row's status is otherwise visible even though the disablement reason is not.

## What this pass did and did not cover

**Covered:** every line of `DocumentWorkbench.tsx` and `RichSectionEditor.tsx`, and every file in the ProtocolDev family (`ProtocolDev.tsx`, `ProtocolDevWorkspace.tsx`, `ProtocolDevSection.tsx`, `ProtocolDevSoa.tsx`, `ProtocolDevForms.tsx`, `ProtocolDevRegisters.tsx`, `ProtocolDevReviews.tsx`, `ProtocolDevPanes.tsx`, `ProtocolDevDesign.tsx`, `ProtocolDevDerivation.tsx`, `ProtocolDevProjections.tsx`, `ProtocolDevCompliance.tsx`, `ProtocolDevSigning.tsx`, `ProtocolDevShared.tsx`), plus the shared `ProtocolGov.tsx` primitives they render through. For each interactive element: keyboard reachability, focus management on open/close, ARIA role/name/state, live-region wrapping of async results, and colour-vs-text/icon carriage of status.

**Not covered (no silent caps):**
- No browser or assistive-technology pass — everything above is a static source read. Rendered focus-ring visibility, actual VoiceOver/NVDA announcement wording, and real Tab-order behaviour in the browser were not verified.
- TipTap/ProseMirror plugin internals behind `RichSectionEditor` (suggestion-mark popups, table-extension keymaps) were not traced beyond the component file itself; the fully keyboard-operable side panel for tracked changes means any mouse-only inline popup is a convenience, not the only path, but this was not independently confirmed live.
- Server routes behind these surfaces were not read — client-only scope, per the assignment.
- Touch-target sizing (SC 2.5.8) and `prefers-reduced-motion` were out of charge for this lens per the skill file (motion belongs to the motion-auditor).
- No second "refute" pass was run against these findings (the 2026-09-28 review's verification step was not available in this session's toolset) — treat severities as one auditor's judgment.
- The local reference Postgres was not used — none of these findings are data-shape dependent.

## Notable positives worth recording (not findings, but load-bearing context for severity calls)

- `RichSectionEditor.tsx`'s `RB` component itself documents a *previously fixed* mouse-only-toolbar defect (lines 396-411) with the correct `onMouseDown`-preventDefault / `onClick`-activates pattern — the ribbon buttons that DO pass `active` are exemplary; GA-3 is about the ones that don't.
- The AnA rail in `DocumentWorkbench.tsx` (open/close focus management, Escape, return-focus-to-trigger) and the governed unsaved-changes guard (`useDialog`) are both correctly built and were the basis for judging GA-4 and GA-6 as regressions relative to a known-good pattern in the same file, not absence of any pattern at all.
- `ProtocolDevCompliance.tsx`, `ProtocolDevDerivation.tsx`, `ProtocolDevDesign.tsx`, `ProtocolDevRegisters.tsx` (`RiskRow`'s custom `role="button"` with full keyboard support) and `ProtocolDevReviews.tsx`'s `ConsentTab` (`sr-only` text pairing every colour-coded checkmark) are all well-built and formed most of this session's baseline for what "correct" looks like in this codebase, which is why the deviations above stand out as concrete, fixable regressions rather than a wholesale rewrite.

---

**Covered.** Full line-by-line static read (not diff-only) at head 494b4fc14 (concept2cure-v2) of: client/src/concept2cure/v2/editor/DocumentWorkbench.tsx (5,134 lines) and client/src/concept2cure/v2/editor/RichSectionEditor.tsx (2,716 lines) in full; and the entire ProtocolDev*.tsx family: ProtocolDev.tsx, ProtocolDevWorkspace.tsx, ProtocolDevSection.tsx, ProtocolDevSoa.tsx, ProtocolDevForms.tsx, ProtocolDevRegisters.tsx, ProtocolDevReviews.tsx, ProtocolDevPanes.tsx, ProtocolDevDesign.tsx, ProtocolDevDerivation.tsx, ProtocolDevProjections.tsx, ProtocolDevCompliance.tsx, ProtocolDevSigning.tsx, ProtocolDevShared.tsx (all read in full). Also read ProtocolGov.tsx (the shared governance-primitive module these files import from: StatusBadge, FindingsList, Btn, Citation) since its output shapes recur throughout the ProtocolDev family and a defect there would multiply. For every interactive element found: checked keyboard reachability/operability (Tab order, Enter/Space activation, Escape), focus management on open/close of dialogs and inline edit widgets, ARIA role/name/state correctness, live-region wrapping of async save/error/check results, and whether status/severity is carried by text or icon in addition to colour. Ran `npm run ci:token-contrast` (PASS, 67 pairs) and `npm run ci:check-chip-tones` (PASS, 139 uses) read-only, no write-baseline. Cross-checked docs/evidence/reviews/2026-09-2{4,6,8}/a11y.md to confirm none of the findings below were already recorded as open (all three prior reports explicitly name these exact files as un-read/sampled-only gaps, and none of A1/A2/A3/A-0928-1/A-0928-2 touches DocumentWorkbench.tsx, RichSectionEditor.tsx or any ProtocolDev*.tsx file).

**Not covered.** No browser or assistive-technology (VoiceOver/NVDA/keyboard) pass was performed — every finding below is a static source read; anything that depends on actual rendered focus-ring visibility, real screen-reader announcement wording/timing, or CSS-computed contrast of dynamic inline styles was not verified live. Did not read the TipTap/ProseMirror plugin internals behind RichSectionEditor (suggestion marks, table extension keymaps, citation node, caption numbering) — only the React component file itself; inline pop-up menus on tracked-change marks inside the contentEditable region may be mouse-only, but this was not traced because the fully keyboard-operable side panel (Accept/Reject/Jump, RichSectionEditor.tsx:2126-2157) already gives a complete keyboard path, so it was not pursued further. Did not open server routes behind any of these surfaces (server/routes/authoring.router.ts, protocol-dev.routes.ts, etc.) — scope was the client per the assignment. Did not verify touch-target sizing (SC 2.5.8) or `prefers-reduced-motion` (explicitly out of this lens's charge per the skill file — belongs to the motion auditor). Did not independently re-verify severity by dispatching a second "refute" pass, unlike the 2026-09-28 review's process (no such tooling was available in this run); treat the severities below as a single auditor's judgment, not cross-checked. Did not touch the local reference Postgres — none of these findings are data-shape dependent; they are markup/ARIA facts visible from source, so no DB session was opened.

## Independent verification

Each finding went to three agents, each told to refute it through one lens: reachability, reproduction or intent. A finding is confirmed when two of the three could not. Low findings had one reproduction verifier.

### GA-1 — **confirmed** (3 of 3)

- **reach** — real: Checked read-only at head 59b0d8f9a. The task named 232ecae9c, but the hunk is the same, shifted by about 5 lines.

**The code matches the claim.**
- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3309-3319`: the reason field renders only when `dirty && !docSealed`. It is an `<input>`, not a textarea as the finding says. It has `aria-label="Reason for change"` and no `required`, `aria-required` or `aria-describedby`. The only statement of the 8-character rule is the placeholder "Why this changed (at least 8 characters)".
- `:3320-3334`: the Save button is `disabled` when `changeReason.trim().length < 8`. Its only explanation is a `title`, "Say why this section changed, in at least 8 characters…". A disabled button cannot take focus, so a keyboard user never reaches that tooltip.

**It is reachable in the launch catalog.**
- `surfaceViews.ts:302,461` registers the `'document-authoring'` surface as `DocumentAuthoring`, which mounts `DocumentWorkbench` (`surfaces/DocumentAuthoring.tsx:39,98`).
- `editor/DocumentCanvas.tsx:386` mounts it again for "Open full editor" from the AnA conversation.
- The toolbar holding the field and Save is not behind the `!embedded` condition, so both mounts render it. Tests exercise it through `data-testid="change-reason"` (`authoringReasonForChange.test.tsx:122`, `documentAuthoringEditor.test.tsx:122`).

**No other layer fully prevents it.**
- ⌘S does go through the same save path (`DocumentWorkbench.tsx:1995-2001`). With a short reason it shows an error toast stating the requirement. `toast.tsx:145` renders error toasts as `role="alert"`, so the rule is announced.
- But that shortcut is bound only on the editor's own keydown (`RichSectionEditor.tsx:1480-1484`). It does not fire from the reason field, and it does nothing for a user who tabs to the Save button.
- The placeholder is exposed as the field's description on first focus and disappears once the user types.
- So a keyboard or screen-reader user who has typed 3 characters and tabs past the field to Save gets no reachable explanation of why Save stays inert.

**It is not already recorded.**
- The 2026-09-28 a11y report (`docs/evidence/reviews/2026-09-28/a11y.md:44`) says it read "the change-reason/save-gate" hunk of DocumentWorkbench and filed nothing against it. Its findings are only A-0928-1 (`filingTarget.tsx`) and A-0928-2 (`Vault.tsx`).
- No 2026-09-24, 09-26 or 09-28 report, including `editor-family/fixes` and `ectd-lane-second-pass`, records this control as open.

**The finding overstates in three places.** It says the user has no way at all to learn why Save is inert, but ⌘S in the editor gives an announced alert and the placeholder serves as the initial description. The element is an `<input>`, not a textarea. And the verification of A-0928-1 already ruled that this class is not a blocker, because the flow can still be completed.

**Coverage.** I checked where the component is mounted and registered, whether the toolbar is conditional, the ⌘S path and the toast role, and the prior review registers. I did not run a browser or assistive-technology pass, so actual NVDA or VoiceOver behaviour on a disabled button's `title` in browse mode was not observed.

- **repro** — real: I could not refute it. The task named 232ecae9c, but the checkout is at 59b0d8f9a. The code is the same at both. At 232ecae9c the input is at DocumentWorkbench.tsx:3301-3310 and Save at 3311-3325; at 59b0d8f9a they are at 3309-3319 and 3320-3333.

Static facts from the code:
- The `<input data-testid="change-reason">` has `aria-label="Reason for change"` and `placeholder="Why this changed (at least 8 characters)"`.
- It has no `required`, no `aria-required` and no `aria-describedby`. The file's only `aria-describedby` is at :5118, on the unsaved-work guard.
- Save is `disabled={!dirty || saving || docSealed || changeReason.trim().length < 8}`. When the reason is short, its only explanation is a `title`.

Runtime reproduction: I copied the setup of the repo's own authoringReasonForChange.test.tsx (it mounts the real DocumentAuthoring, which renders DocumentWorkbench) into a scratch root at scratchpad/ga1root. I ran it with the repo's vitest.config.ts under jsdom, edited the section, typed "abc" into the reason field, and measured with dom-accessibility-api. Results:
- Reason field: `fieldName="Reason for change"`, `fieldDesc=""`, `required=false`, `aria-required=null`, `aria-describedby=null`. The placeholder is gone once the field has a value.
- Save: `saveDisabled=true`, `saveName="Save"`. `b.focus()` leaves `document.activeElement !== b`, so a keyboard user cannot focus it.
- The ">= 8 characters" rule appears nowhere in the document's text content (`bodyTextHasRule=false`). No role=alert, role=status or aria-live region contains it; the live regions hold only unrelated text.

So a keyboard or screen-reader user who has typed a reason shorter than 8 characters gets no focusable, persistent or announced statement of why Save is inert. The same goes for any sighted user who does not hover.

Why the "no way, none" wording and the blocker rating are overstated:
1. The rule does reach the disabled button's accessible description through `title`. A screen reader in browse or virtual mode can arrow onto a disabled button and may read it; Tab cannot reach it.
2. The Cmd-S path goes through the save funnel (:1987-1999 at 232ecae9c, :1995 at head). There it calls `fireToast(..., 'error')`, which renders in C2CToast with `role="alert"` (toast.tsx:36-40), so that path is announced.
3. While the field is empty, the placeholder is exposed and is usually read on focus.

The flow is therefore completable, and the rating should match A-0928-1: major under WCAG 3.3.2 and 4.1.2, not blocker.

- **intent** — real: Checked at the current checkout (59b0d8f9a). The finding cited 232ecae9c, where the code sits about 7 lines higher. At head, client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3309-3319 renders the reason input only when `dirty && !docSealed`. It has `aria-label="Reason for change"`, no `required` or `aria-required`, and no `aria-describedby`. The 8-character rule appears only in the placeholder: "Why this changed (at least 8 characters)". The Save button at :3320-3336 is `disabled={... || changeReason.trim().length < 8}` and explains why only in `title` ("Say why this section changed, in at least 8 characters…"). A disabled native button cannot take focus, so keyboard and screen-reader users cannot reach that title. No live region near the button states the requirement.

I found no evidence that this was deliberate. The comment at the site (:3304-3308) justifies an inline field over a modal, to avoid friction on repeated saves. It says nothing about accessibility or the title-only explanation. The history of the lines shows two commits: c402dbb6b (canvas wiring) and fde9d704e. The fde9d704e message says only that "the client states the same floor where the reason is typed (workbench save button, toast and title…)". That is a Part 11 fix, and accessibility is not discussed.

The repository's own standard treats this pattern as a blocker. docs/evidence/reviews/2026-09-28/a11y.md A-0928-1 filed the identical shape (required reason with no aria-required, explanation only in a disabled button's title) and fixed it in filingTarget.tsx. That report also says it read this exact change-reason/save-gate hunk only as a diff (line 44) and filed nothing on it. The finding is not recorded as open in the 09-24, 09-26 or 09-28 reviews. C2CForm.tsx:130 sets aria-required from the field definition, and ProtocolDevSection.tsx:280 shows the requirement as always-visible `<span className="pde-sec-state">` text, so the fix is already a pattern in this repo.

One mitigation lowers the severity. The save funnel at :1995-2001 fires an error toast ("Not saved — say why this section changed, in at least 8 characters…") when ⌘S or the unsaved-work guard's Save is used with a short reason. So a user who knows the ⌘S shortcut gets told the rule. Clicking Save or tabbing to it gives nothing, because the disabled button is skipped. The placeholder is announced only while the field is empty.

Coverage: I read the site (:3240-3340), the save funnel (:1985-2010), the history and commit message of the site, the 09-24/09-26/09-28 review files for prior records, and the ProtocolDevSection comparison line. I did not render the page or run it under assistive technology, and I did not check whether the toast container is an aria-live region.

### GA-2 — **confirmed** (3 of 3)

- **reach** — real: The finding holds up on reachability, but it is not new severity-wise. It rates medium, not high. Only files were read and grepped; no browser or screen-reader run was done.

Reachable in production:
- `surfaceViews.ts:330` and `:549` register `'protocol-dev'` to `ProtocolWorkspace`. That is the lazy import of `surfaces/ProtocolDev`, which imports and renders `ProtocolWorkspaceDoc` from `ProtocolDevWorkspace.tsx` (`ProtocolDev.tsx:22`).
- `registryModel.ts:243` and `:259` make `protocol-dev` the default surface for the Health Systems and Academic segments. It is also in the CRO focus list (`:228`), the nav groups (`:690`, `:717`) and the segment actions (`:982`, `:994`). `AUTHORING_SURFACES` (`:1098`) places it in the Authoring app. The 09-28 microcopy report records that it joined the launch catalog's Authoring app on 2026-09-21.
- I found no environment or feature flag gating it in `surfaceViews.ts`.
- `ProtocolDevWorkspace.tsx:366` renders `<TabStrip>` unconditionally for any loaded protocol.

The defect is at head:
- In `TabStrip` (`ProtocolDevWorkspace.tsx:295-301`), the container is a plain `<div className="pd-tabs">` and each tab is a `<button className={'pd-tab' + (tab === t.id ? ' on' : '')}>`.
- There is no `role="tablist"`, no `role="tab"`, no `aria-selected`, no `aria-current` and no `aria-pressed`. No wrapper supplies them either (lines 357-367).
- The selected state exists only in CSS (`research-v2.css:119`, `.pd-tab.on`).
- So assistive technology gets 16 buttons with no programmatic selected state. That fails WCAG 4.1.2.

Two corrections:
- The WCAG 1.4.1 (use of colour) claim is weak for this strip. `.on` also adds a bottom border and font-weight 600, so the state is not shown by colour alone.
- High is overstated. Every tab is still a keyboard-operable button with a visible text label. Only the selected state is missing.

The sibling sites also hold:
- `DocumentWorkbench.tsx:3175-3200+`: the AnA, Comments, History and other rail toggles set only `data-active`. They have no `aria-pressed` or `aria-expanded`, although the view toggle right next to them (`:3151-3172`) does use `aria-pressed`. DocumentWorkbench is the canonical editor, so these are reachable.
- `ProtocolDevProjections.tsx:280-284`: the projection picker shows which item is open only through `variant` `primary` vs `outline`.

Not previously recorded: the 09-24 and 09-28 a11y reports list the `ProtocolDev*` family and DocumentWorkbench as "not read line by line", and a grep of `docs/evidence/reviews/2026-09-2{4,6,8}` finds no tablist, `aria-selected` or `aria-pressed` finding for these files. A3 was `quality/App.tsx` and is closed.

- **repro** — real: Reproduced by reading the code at the working-tree HEAD (59b0d8f9a). I ran `git diff 232ecae9c HEAD` on all three files and it came back empty, so the result also holds at the requested commit 232ecae9c.

(1) client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx:295-301. `TabStrip` renders `<div className="pd-tabs">` containing one `<button className={'pd-tab' + (tab === t.id ? ' on' : '')} onClick=...>` for each entry in `TABS` (defined at :41). The only thing that changes on the selected button is the `on` class. A grep of the file for `role="tab"`, `aria-selected`, `aria-current` and `tabpanel` finds nothing. It is reachable: rendered at :366 inside `ProtocolWorkspaceDoc`, which ProtocolDev.tsx:242 mounts. So a screen reader announces each tab as an ordinary button (icon plus label) and never says which one is selected. That fails WCAG 4.1.2 (the selected state is not exposed programmatically) and 1.4.1 (the state is shown by styling only).

(2) client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:3179, 3188, 3199, 3210, 3225, 3236, 3249, 3262, 3271. The AnA, Comments, History, Sources, Signatures, Audit, Exports, Vault/Project files and Tasks rail toggles show their open state only through `data-active={rail === 'x' || undefined}`. None of them has `aria-pressed` or `aria-expanded`. The same file already uses the correct pattern a few lines earlier, `aria-pressed={viewMode === ...}` at :3157 and :3167, so the omission on the rail toggles is local to them.

(3) client/src/concept2cure/v2/surfaces/ProtocolDevProjections.tsx:279-283. The projection picker marks the open projection only with `variant={open?.id === p.id ? 'primary' : 'outline'}`. The shared component makes this worse: `PG.Btn` (ProtocolGov.tsx:260-270) accepts only icon, children, onClick, variant, disabled, block and title. It cannot forward any aria-* prop, so no caller can currently add the state.

Not previously recorded: the 2026-09-24 a11y.md A3 finding concerns only quality/App.tsx. The 2026-09-28 a11y.md checked only newly introduced forbidden patterns, and the microcopy.md mention of ProtocolDev is about redaction (M-0928-2). None of the 09-24, 09-26 or 09-28 reviews mentions pd-tab, TabStrip, the rail `data-active` toggles or the projection picker state.

Covered: static trace of all three sites, reachability of TabStrip, and whether PG.Btn can forward ARIA props. Not covered: no run in a browser or screen reader and no axe run. The claim about what is announced is inferred from the DOM, which is deterministic here. Severity: this is a real 4.1.2 failure on a launch-catalog Authoring surface. It does not block any action, since every tab can still be reached and activated by keyboard, so medium is a better fit than high.

- **intent** — real: I tried to refute this and could not. The code at head (232ecae9c) confirms it.

1. The main claim holds. `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx:295-301` `TabStrip` renders `<div className="pd-tabs">` holding `<button className={'pd-tab' + (tab === t.id ? ' on' : '')} onClick=...>`. It has no role, no `aria-selected`, no `aria-current` and no `aria-label`. `grep 'role=\|aria-'` on the file finds only `role="status"` (line 140) and `role="alert"` (line 288). The tab body at line 366 has no tabpanel either. The selected state lives only in the CSS: `research-v2.css:119` `.pd-tab.on{color;border-bottom-color;font-weight:600}`.

2. Nothing shows this is a deliberate choice. There is no comment at the site. The strip arrived in commit 74c65d280, "The Protocol development surface becomes a builder, not a viewer", with no a11y rationale. The repo's own convention runs against it: `role="tablist"` appears in quality/App.tsx:295 (the A3 fix, 4f0becb6), SubmissionCenter.tsx:940, ProjectHome.tsx:185, CollabLauncher.tsx:879, Pyramid.tsx:682, IndLifecycle.tsx:1296, Etmf.tsx:415, Rbm.tsx:250 and pdev/Workstream.tsx:193. So this is an omission, not a design decision.

3. The DocumentWorkbench part also holds, but the path in the finding is wrong. The file is `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, not `v2/surfaces/`. The rail toggles at lines 3179, 3188, 3199, 3210, 3225, 3236, 3249, 3262 and 3271 carry only `data-active={rail === 'x' || undefined}`. Nearby toggles in the same file already use `aria-pressed={viewMode === 'document'}` (around line 3167), so leaving it off the rail toggles is inconsistent, not intended.

4. The ProtocolDevProjections part holds too. At `ProtocolDevProjections.tsx:281`, `PG.Btn variant={open?.id === p.id ? 'primary' : 'outline'}` is the only thing that marks which projection is open.

5. It has not been reported before. Checked 2026-09-22, 24, 26 and 28: none records TabStrip, pd-tab or these rail toggles. The 2026-09-28 a11y.md:44 lists as not covered both "ProtocolDev* family beyond ProtocolDevSoa.tsx" and the DocumentWorkbench body. This is exactly that gap.

6. What it violates: WCAG 2.2 SC 4.1.2 (Name, Role, Value). The selected or pressed state of these controls is not exposed to assistive technology, so a screen-reader user hears 16 identical buttons and cannot tell which one is active. SC 1.4.1 is weaker here. `.on` also changes font-weight and adds a bottom border, so the state is not shown by colour alone. The only real failure is 4.1.2.

Correction to the finding: DocumentWorkbench is under v2/editor/, not v2/surfaces/.

### GA-3 — **confirmed** (3 of 3)

- **reach** — real: I tried to refute this finding on reachability and could not. The defect is real, but "high" overstates it.

The defect is in the code at head. In client/src/concept2cure/v2/editor/RichSectionEditor.tsx, lines 413-448, the `RB` component sets `aria-pressed={active ?? false}` on every button with no condition. These buttons use `RB` with no `active` prop, so each one exposes aria-pressed="false" and is announced as a toggle that is "not pressed":
- Undo and Redo (2072-2077)
- Insert table (1981-1986)
- +Row, +Col, -Row, -Col, Merge, Split and Delete table (1989-2027)
- Insert an image (2030-2036)

Toggle header row and Toggle header column (2019-2024) are real toggles, but they are never given `active`, so they read "not pressed" even when the table already has a header row. The comment at 405-411 explains why aria-pressed should be "false" rather than absent on toggles. It does not account for the non-toggle commands that use the same component.

It is reachable in production:
- `RichSectionEditor` is the canonical editor, imported by client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:78 and rendered at :3796 with no `chrome` prop.
- `chrome` defaults to 'full' (RichSectionEditor.tsx:462), and the ribbon renders when `full && boot.mode === 'rich' && !readOnly` (:1886), which is the normal case when editing a section.
- DocumentWorkbench is the Authoring surface's editor. That surface is registered in client/src/concept2cure/v2/surfaceViews.ts:302 and :461 ('document-authoring', lazyOwnedSurface), which is the Authoring entry of the launch catalog.
- No wrapper, CSS or parent removes the attribute; it is emitted straight onto the DOM `<button>`.

It has not been reported before. docs/evidence/reviews/2026-09-24/a11y.md:46 and 2026-09-28/a11y.md:44 both list RichSectionEditor.tsx as not read line by line, and no open finding in 2026-09-2{4,6,8} covers aria-pressed.

On severity: this is a WCAG 4.1.2 Name, Role, Value misstatement for screen-reader users. It blocks no task: every button still works from the keyboard and has a correct aria-label. Medium is the fair rating, not high.

- **repro** — real: Reproduced at HEAD 59b0d8f9a. RichSectionEditor.tsx has not changed since the review ref 232ecae9c (`git diff 232ecae9c HEAD` on the file is empty). Line 435 in `RB` (declared at 413) sets `aria-pressed={active ?? false}` unconditionally. These buttons pass no `active` prop: Insert table (1981), Add row/col and Delete row/col (1989-1998), Merge and Split (2005/2012), Toggle header row/col (2019/2022), Delete table (2025), Undo/Redo (2072/2075) and Comment on the selection (2102).

Method: a jsdom vitest outside the repo (scratchpad ga3/ga3.test.tsx, run with a scratch config rooted at the repo, no repo files touched). It renders `<RichSectionEditor value="<p>x</p>" chrome="full">` and dumps every `button.rse-rb`.
- Before inserting a table: all 17 ribbon buttons carry aria-pressed="false", including "Undo (⌘Z)", "Redo (⌘⇧Z)" and "Insert table (3 columns × 3 rows, header row)".
- After fireEvent.click on Insert table (which inserts withHeaderRow:true): the table renders `<th>` cells (th count = 3), and all 25 buttons carry aria-pressed="false". That includes "Add row below", "Delete row", "Delete column", "Merge the selected cells", "Split the merged cell", "Delete table", and "Toggle header row", which reads "false" even though the header row is present. The test's asserts `undo.getAttribute('aria-pressed')==='false'` and `hdr.getAttribute('aria-pressed')==='false'` both passed.

So assistive technology exposes these one-shot commands as toggle buttons that are "not pressed" (a WCAG 4.1.2 role/state error). The one stateful table control never reports its true state. The existing test richSectionEditorOperable.test.tsx:73 only checks that Bold carries aria-pressed="false", so nothing guards non-toggles. grep finds no aria-pressed entry in docs/evidence/reviews/2026-09-2{4,6,8}/, so this is not a re-report.

Severity: this is an a11y correctness defect on the Authoring surface. It does not lose data or break a security boundary, so medium fits better than the auditor's "high".

Coverage: I covered RB and every RB call site in RichSectionEditor.tsx. I did not check other ribbons (DocumentWorkbench, ProjectFilesPanel) or test with a real screen reader.

- **intent** — real: Refutation failed. Everything below was read at head (232ecae9c) in client/src/concept2cure/v2/editor/RichSectionEditor.tsx.

1. The code does what the finding says. `RB` (lines 413-448) always renders `aria-pressed={active ?? false}` (line 434). Under WAI-ARIA, any button that carries aria-pressed is a toggle button, so every RB is announced as a toggle.

2. The doc-comment that looks like a deliberate choice only covers real toggles. Lines 409-410 say: "`aria-pressed` is `false` rather than absent when off: omitting it tells a screen reader 'not a toggle' instead of 'not pressed'." That argument only makes sense for controls that have a pressed state. The only test that pins it, `richSectionEditorOperable.test.tsx:69-74`, checks Bold alone, which is a real toggle. Nothing in the code, the comment or the tests argues that Undo or Delete table should be toggles. The side effect was never considered, so it is not a documented design decision. It also contradicts the comment's own reasoning: for Undo, the right announcement is exactly "not a toggle".

3. The affected buttons pass no `active` prop, so they are all announced as toggles that are "not pressed":
   - Insert table (1981)
   - Add row below, Add column right, Delete row, Delete column (1989-1998)
   - Merge (2005) and Split (2012)
   - Delete table (2025)
   - Insert an image (2031)
   - Undo (2072) and Redo (2075)
   - Comment on the selection (2102)
   - Previous match and Next match (2201, 2204)
   
   Toggle header row and Toggle header column (2019, 2022) really are stateful, but no `active` is passed, so they are always announced "not pressed", even inside a table whose header row is on. That exposes a wrong state (WCAG 2.2 SC 4.1.2 Name, Role, Value).

4. The genuine toggles all pass a real `active`: Bold, Italic, Underline, Superscript, Subscript, Highlight, the two lists, the three alignments, Link, Cross-reference, Cite, Find and Match case. So the correct split already exists at the call sites; only the wrapper erases it.

5. It is not already reported. The 2026-09-24 and 2026-09-28 a11y reports (09-24 a11y.md:46, 09-28 a11y.md:44) and the 09-28 README (:46) all list RichSectionEditor.tsx as not read line by line. None of the 09-24, 09-26 or 09-28 reviews has an aria-pressed finding on this file.

On severity: I disagree with the auditor's "high". Every control can still be named and operated, and the only error is the state a screen reader announces. It is a real WCAG failure, but it is not blocking.

Coverage: I read the RB definition and its comment (395-448), every RB call site (1907-2207), and the operability test that pins aria-pressed. `git log -L` on the line only resolves to a large import commit (4876e2829), so the history adds no design rationale beyond the comment. I did not render the component or run a screen reader.

### GA-4 — **confirmed** (2 of 3)

- **reach** — real: I tried to refute this on reachability and could not. The line numbers have shifted: the working tree HEAD is 59b0d8f9a, not the 232ecae9c the task names. The defect itself is still present.

Reachable in production:
- DocumentWorkbench is the editing core of the Authoring surface. It is lazily registered at client/src/concept2cure/v2/surfaceViews.ts:302 as DocumentAuthoring, which renders it at surfaces/DocumentAuthoring.tsx:98.
- It is also mounted in the conversation canvas at editor/DocumentCanvas.tsx:386 (embedded, reached from ConversationThread.tsx:23).
- The six toggle buttons are drawn on neither a feature flag nor `embedded`: Comments 3187, History 3198, Sources 3209, Signatures 3224, Audit 3235, Exports 3248. Only the AnA button is gated, `!embedded` at 3174.

The Escape handler covers AnA only. DocumentWorkbench.tsx:1099-1107 is `useEffect(() => { if (rail !== 'ana') return; ... closeOnEscape ... })`. There is no other keydown listener in the file for the rail. The only other Escape handling is at 3563, local to an input.

None of the six panels has a close control. Each one's header is a plain heading div or span, plus at most a Refresh or Re-read button:
- history 4192-4194 `<div className="ed-comments-h">Revision history</div>`
- signatures 4324-4326
- exports 4336-4338
- audit 4347-4358 (header row holds only a Refresh button)
- sources 4467-4480 (only a Re-read all button)
- comments 4719-4721

`aria-label="Close` appears in the file only at 3975 (AnA). Project files (4695) and Tasks (4713) pass `onClose={() => setRail(null)}`.

What the user hits:
- **Authoring surface:** with History, Audit or any of the other four rails open, Escape does nothing. The rail closes only by moving focus back to the header toggle and pressing it again.
- **Embedded canvas:** worse. DocumentCanvas.tsx:188-200 has a document-level Escape listener that skips only dialogs, ProseMirror and form fields. With focus on the page body or a rail button, Escape collapses the whole canvas instead of closing the rail.

Not previously reported: the 2026-09-24 and 2026-09-28 a11y.md mention Escape only for EsignModal and GovernedConfirmDialog. The 2026-09-26 folder has only security.md.

Severity: not a WCAG 2.2 AA failure. SC 2.1.2 No Keyboard Trap is satisfied because the toggle stays reachable with Shift+Tab, and no AA criterion requires Escape to close a non-modal side panel. It is an inconsistency: three of the nine rails close properly and six do not.

- **repro** — real: Head is 59b0d8f9a, not the 232ecae9c the task names, so the line numbers have moved. The code is the same in both commits.

What the code does:
- The Escape listener is at client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:1098-1107. It starts with `if (rail !== 'ana') return;`.
- Nothing else in the file closes a rail on Escape. The only other Escape handlers are at 3563 (an inline control) and 5103 (a dialog).
- `setRail(null)` is called in only three places: closeAna (1057), and the onClose of ProjectFilesPanel (4695) and ReviewTasksPanel (4713).
- Six rail asides have only a heading element and no close control: history (4192, `<div className="ed-comments-h">Revision history</div>`), signatures (4324), exports (4336), audit (4347), sources (4467) and comments (4719). The audit and sources headings do contain a Refresh / Re-read all button, but neither one closes the rail.
- The comment in client/src/concept2cure/v2/styles/authoring-v2.css:39-40 says that below 1204px the floating rail "stays open, keeps its own close button". That is false for these six rails.

Reproduction:
- I wrote a vitest+jsdom test in the scratchpad (…/scratchpad/ga4.test.tsx, run with …/scratchpad/vitest.ga4.config.ts). No repository file was changed.
- It uses the same mocked-API DocumentAuthoring harness as client/src/concept2cure/v2/__tests__/workbenchProjectFiles.test.tsx.
- For each rail it clicks the toggle in the .ed-doc-actions toolbar, counts the in-panel buttons whose accessible name matches /close/i, and dispatches Escape on `document`.
- Results:
  - Comments, History (Revision history), Sources (Drafted from), Signatures, Audit, Exports: closeButtonsInPanel=0 and openAfterEscape=true.
  - Controls, which show the query does detect close buttons: Project files closeButtonsInPanel=1, Tasks closeButtonsInPanel=1. Escape also leaves both of these open, which the finding did not claim.

I did not get the AnA Escape control to render. The AnA toggle is behind `!embedded` and never appeared in this harness, so that test timed out. The static read of 1098-1107 still shows Escape closes AnA only.

Consequence: on the Authoring surface, a keyboard user who opens any of the six rails cannot close it with Escape and finds no close control inside it. The only way to close it is to Shift+Tab back to the header toggle. That toggle sits inside a horizontal scroller, and below 1204px the rail floats over the document (z-index 5). In the DocumentCanvas host, the canvas's own document-level Escape listener (DocumentCanvas.tsx:189-201) collapses the whole canvas instead of closing the rail. I did not render the canvas case; it is a code read only.

Covered: static trace at head, and the jsdom reproduction of all eight non-AnA rails on the Authoring surface. Not covered: a real-browser check of whether the floating rail visually hides its toggle between 761px and 1204px, and a screen-reader pass. No database was involved.

Not previously recorded: the 2026-09-24/26/28 reviews contain nothing on this. a11y.md:43 lists Escape-to-close as not verified, and only for EsignModal and GovernedConfirmDialog.

- **intent** — not real: Checked at HEAD 59b0d8f9a. The task named 232ecae9c; DocumentWorkbench.tsx changed by about 30 lines since then, so the lines have moved. The Escape effect is now at 1100-1108, the rails at 4192/4324/4336/4347/4467/4719 and the toggles at 3187-3272. The auditor has the facts right: the Escape handler returns early unless rail === 'ana', and the history, signatures, exports, audit, sources and comments asides have no close button of their own. The finding still does not hold up as a defect against the repo's rules.

(1) The main claim is wrong. "No close control at all" is false. Each of the six rails has a visible toolbar button that is always rendered and labelled with text, and it toggles its rail closed (`onClick={() => setRail(rail === 'history' ? null : 'history')}` and the same for the others, 3187-3249). That is the standard disclosure pattern. The auditor admits there is no keyboard trap, so accessibility-enforcement hard rule 4 is met. No WCAG 2.2 AA success criterion requires Escape to dismiss a non-modal complementary panel: 2.1.2 is met, and 1.4.13 covers hover/focus content only.

(2) Treating AnA differently has a defensible reason in the code. Only the AnA rail moves focus when it opens: the only `.focus()` calls in the file are at 1116 (the AnA composer) and 1118 (return focus). Because AnA moves focus away from its trigger, it needs Escape plus focus return (1034-1122). The other six rails never take focus. After opening one, keyboard focus is still on the toggle that opened it, so one Enter or Space closes it, with no Shift+Tab needed. A document-level Escape that closes whichever rail is open would also compete with Escape inside the editor. DocumentCanvas.escapeBelongsToInner (DocumentCanvas.tsx:100-108) deliberately treats .ProseMirror, inputs and dialogs as owning Escape. In embedded/canvas mode, Escape already exits: the whole canvas collapses (DocumentCanvas.tsx:178-202).

(3) What is left is a soft item on a pre-ship checklist ("Can I dismiss modals/panels with Escape?", accessibility-enforcement SKILL.md:38) and the a11y-auditor phrasing "Escape closes what it should". Neither is a hard rule. No comment at the site documents the AnA-only scoping. c402dbb6b copied the effect over unchanged from DocumentAuthoring. So intent is not written down, but the focus-behaviour reason in (2) makes the scoping defensible. Per the default-to-false instruction: not real.

Scope: I read the Escape/focus effects, all nine rail render sites and the toolbar toggles in DocumentWorkbench.tsx, the canvas Escape handler in DocumentCanvas.tsx, the accessibility-enforcement skill, the 2026-09-24/26/28 reviews (searched for Escape and toggle-state), and the history of the effect. I ran nothing in a browser or with assistive technology.

Separate from this finding and not verified: the toolbar toggles show their state only through `data-active` and have no `aria-pressed` or `aria-expanded` (3179-3272), so screen readers are not told the open/closed state. That may fail WCAG 4.1.2 Name, Role, Value, and it does not appear in the 09-24/26/28 reviews.

### GA-5 — **confirmed** (3 of 3)

- **reach** — real: I could not refute this finding. It is reachable in production and no other layer covers it. I checked it at HEAD 54506dacd, not the 232ecae9c named in the task, so the line numbers have moved by a few.

Reachability:
(1) The surface is registered. client/src/concept2cure/v2/surfaceViews.ts:302 and :461 register 'document-authoring', which is surfaces/DocumentAuthoring.tsx, and that file renders <DocumentWorkbench> at line 98. DocumentCanvas.tsx:386 also mounts DocumentWorkbench, from ConversationThread.tsx:23. So the AnA canvas path reaches the same code.
(2) The History toolbar button (DocumentWorkbench.tsx:3196-3200) is always rendered and has no flag. It calls setRail('history'), and the rail renders at :4192 whenever a section is active.
(3) 'Verify ledger' (:4211) calls verifyLedger (:1685-1695). That hits GET /api/authoring/sections/:sectionId/history/verify, defined at server/routes/authoring.router.ts:2083 and mounted on the production path through registerInlineAiWorkflowRoutes in server/startup/routes.ts:173.

No live region covers the verdict:
- verifyLedger only calls setLedger('checking' | 'error' | body) and fires no toast on any branch. The toast.tsx live region is therefore never used here.
- The 'error', 'Ledger intact' and 'Ledger BROKEN … treat this section's record as disputed' results are plain <span> elements (:4213-4238) inside an unattributed <div> inside <aside className="ed-comments">.
- Grepping DocumentWorkbench.tsx, DocumentCanvas.tsx and DocumentAuthoring.tsx for aria-live, role="alert" and role="log" finds only :2807, :4491 and :4547, none of which is an ancestor of the ledger result. The role="status" hits (2804, 2949, 3020, 3424, 3691, 3756, 4374, 4524, 4558) are not ancestors either.
- While the check runs, the button is disabled (:4213), which can also drop focus. The one textual change on the button (Recomputing… back to Verify ledger) does not carry the verdict.

A screen-reader user who presses Verify ledger gets no announcement of 'BROKEN'. This is a WCAG 2.2 SC 4.1.3 (Status Messages) failure.

Not previously recorded: grepping docs/evidence/reviews/2026-09-2{4,6,8} for ledger together with live, aria, status, announce, 4.1.3 or screen returned nothing on this control.

Covered: surface registration, both mount paths, rail toggle, the handler, the server route mount, and the ancestor ARIA of the render block. Not covered: I did not run the app with a real screen reader. The conclusion is static and based on the absence of any live-region ancestor or toast.

- **repro** — real: I checked this by reading the code at head (9d2134b52; the task brief said 232ecae9c). I did not render the component in a browser or jsdom and did not run a screen reader. That was not needed, because the failure is that an attribute is missing from the markup, which the code shows directly.

1. `verifyLedger` in client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:1685-1695 does only three things. It calls setLedger('checking'), then readJson('/api/authoring/sections/:id/history/verify'), then either setLedger('error') or setLedger(body). No branch calls a toast, a `window.claude`-style announcer, a focus move, or the SR-only announcers that exist elsewhere (Shell.tsx:1283, dataConnect.tsx:527/653, AnaActivity.tsx:472). The state is declared at line 790.

2. The result is rendered in the history rail at DocumentWorkbench.tsx:4189-4240. The markup is: aside.ed-comments, then a plain div with only inline style, then the button, then three branches that are all bare `<span>` elements with no role and no aria-live:
   - the 'error' span at 4205-4210
   - the "Ledger intact" span with class sp-tone-ok at 4215-4220
   - the "Ledger BROKEN at N point(s) … treat this section's record as disputed" span at 4222-4238

3. `grep aria-live` on DocumentWorkbench.tsx returns no matches. `grep role="status"|role="alert"` returns matches at 2804, 2807, 2949, 3020, 3424, 3691, 3756, 4374, 4491, 4524, 4547 and 4558. None of them is on or around 4189-4240, so no ancestor live region covers the ledger spans. The rest of the file uses the pattern consistently: the outline-read failure at 2807 has role=alert, the section check at 3691 has role=status, and the source-refresh results at 4491, 4547 and 4558 have role=alert or role=status. The ledger verdict is the exception.

4. The only screen-reader-visible change is on the button. While checking, it is `disabled` and its label changes to "Recomputing ledger…"; afterwards it goes back to "Verify ledger". A screen-reader user therefore hears nothing about the verdict. That includes the BROKEN case, which tells the user the hash chain was altered or forked. This fails WCAG 2.2 SC 4.1.3. Also, disabling the focused button during the check can drop focus to the document body in Chromium, which makes the silent verdict harder to find.

5. The issue is not recorded in the earlier reviews. 2026-09-24/a11y.md:46 and 2026-09-28/a11y.md:44 both say DocumentWorkbench.tsx was not read line by line, and a grep of docs/evidence/reviews/2026-09-2{4,6,8}/ finds no finding about ledger live regions.

Severity: medium. It is an a11y defect on the most consequential integrity signal in the Authoring history rail. It does not affect data correctness: the verdict is computed on the server and shown correctly on screen.

- **intent** — real: I tried to refute this and could not. I found no documented decision that justifies leaving the verdict out of a live region.

1. Code at head (232ecae9c): `verifyLedger` is at client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:1685-1695. It sets `ledger` to 'checking', then to 'error' or to the server verdict, and fires no toast on any branch. The result is rendered at DocumentWorkbench.tsx:~4198-4230. The container `<div style={{display:'flex',...}}>` has no role or aria-live, and it holds a button and conditional plain `<span>`s: the 'error' span, the 'Ledger intact' span with `sp-tone-ok`, and the 'Ledger BROKEN … treat this section's record as disputed' span, which is shown only by color and weight.

2. Intent: the only comment at the site (lines ~4193-4196, "The ledger: history as a checkable fact … reports exactly what it found") and the comment above `verifyLedger` are about computation honesty. Neither mentions announcement or focus handling. The block came in with commit c402dbb6b ("WN: the canvas that expands into the full editor…"), the only commit in `git log -L` for the range. That commit handled aria-live on purpose elsewhere (it has a comment explaining why a clock was kept out of a live region), so its authors knew about the pattern. This block did not get it.

3. The file's own convention contradicts this spot. Its other async results use role="status" or role="alert", for example lines 2804, 2807, 3424, 3691, 3756, 4374, 4491, 4524, 4547 and 4558. The ledger verdict is the exception.

4. While the check runs, the button is `disabled={ledger === 'checking'}`, so a keyboard or screen-reader user's focus sits on a disabled control. When it finishes, nothing is announced. This fails WCAG 2.2 SC 4.1.3 (Status Messages), and the message it fails to announce is the Part 11 §11.10(e) integrity verdict.

5. Not already recorded: I grepped docs/evidence/reviews/2026-09-24, 2026-09-26 and 2026-09-28 for ledger, live region and verify ledger and found nothing on this. 2026-09-28/a11y.md:44 and 2026-09-24/a11y.md:46 both say DocumentWorkbench.tsx was not read line by line, so this is a genuine gap in coverage. The separate ABSENT-AS-CLEAN/2026-09-22 entry on `verifyLedger([])` is a server-side logic finding about an empty chain, not this.

Coverage: I read the `verifyLedger` callback, the history-rail ledger render block, every role/aria-live occurrence in DocumentWorkbench.tsx, git history for the range, and the three review folders. I did not run anything in a browser or with assistive technology, did not read the rest of DocumentWorkbench.tsx, and did not use the database, since it is not relevant to this finding.

### GA-6 — **confirmed** (3 of 3)

- **reach** — real: I tried to refute this on reachability and could not. I checked at the current HEAD, 9d2134b52; the task named 232ecae9c, and line numbers have moved by about 8.

Reachability:
- DocumentWorkbench is the editing core of the Authoring surface, which is in the launch catalog. surfaces/DocumentAuthoring.tsx:39 imports it and renders it at :98. surfaceViews.ts:302 registers that surface with lazyOwnedSurface.
- The Rename button (DocumentWorkbench.tsx:3610-3618, `onClick={openRename}`) is hidden only when `docSealed` is true (line 873). So it is available on every unsealed document in section view, which is the normal drafting state.

The defect is present:
- `openRename` (2470-2475) only sets state. It saves no ref to the button and does not record `document.activeElement`.
- The rename group is a separate branch of a ternary (3557-3603). Focus sits inside it: `autoFocus` on the code input, then Tab to the other input or the buttons.
- Four exits call `setRenaming(false)`: Escape (3563-3565), the Cancel button (3599), saving with nothing changed (2486), and a successful save (2515). Each one unmounts the group. The static header, with a new Rename button, renders in its place.
- The only other code that touches `renaming` is the effect at 2466-2468, which also just sets it to false. Neither path calls `.focus()`.
- In the DOM, removing the focused node moves `document.activeElement` to `<body>`. React does not restore focus.
- No shell-level focus-restore layer exists: grep for focusin and restoreFocus under v2 found nothing.
- The success toast announces text; it does not take focus.
- The same file does return focus elsewhere (`anaReturnFocusRef`, `useDialog`), so the rename widget is the odd one out.

Result: a keyboard or screen-reader user who renames or cancels lands on `<body>` and has to Tab from the top of the page. This fails WCAG 2.4.3 Focus Order.

Not previously reported: no finding in docs/evidence/reviews/2026-09-24, 09-26 or 09-28 (a11y.md, part11-ux.md) mentions the section-rename widget. The only "rename" hits are unrelated (the A3 icon-key rename and the Q3 helper rename).

Severity: low to medium. Focus is lost, but nothing is trapped and no data is lost.

What I covered: DocumentWorkbench.tsx lines 2455-2530 and 3480-3620, how Authoring mounts it, grep for global focus managers, and the prior review files. What I did not do: run it in a browser or jsdom. The conclusion rests on standard DOM focus behaviour on unmount.

- **repro** — real: Reproduced. Checked at HEAD 9d2134b52; the task named 232ecae9c, and line numbers here run about 8 higher than the finding's. Reproduced in client/src/concept2cure/v2/editor/DocumentWorkbench.tsx.

What the code does:
- State and handlers are at 2462-2515. `openRename` (2470-2475) only sets code, title and `renaming=true`. It captures no ref and does not record document.activeElement.
- The widget is at 3557-3603: `renaming ? <div role="group" ...> : <>header + Rename button</>`.
- Three exits call `setRenaming(false)`: Escape (3563-3565), Cancel (3599), and saveRename, both for no change (2486) and after success (2515).
- None of these exits calls `.focus()`. No useEffect watches `renaming` to restore focus.
- The `renaming` branch replaces the whole group with the header subtree, so the focused input or button is removed from the DOM.
- The Rename button that is re-rendered (3611-3617) is a new element with no ref.
- `anaReturnFocusRef` (1027-1047) is a restore-focus pattern in the same file. It is not applied here.
- The client has no global focus-restoration utility. A grep for focusout, MutationObserver focus and restoreFocus finds only EsignModal and GovernedConfirmDialog, which handle their own focus.

Run: a jsdom + react-dom (repo node_modules) script copies the exact conditional-render structure: a group with an autoFocus input, Rename and Cancel buttons and an Escape keydown handler, else a header with a Rename button. Output:
- Escape: after open, focus = INPUT[Section code]; after exit, focus = <body>
- Cancel: after open, focus = INPUT[Section code]; after exit, focus = <body>
- Save: after open, focus = INPUT[Section code]; after exit, focus = <body>

So in all three exits, keyboard and screen-reader users lose their place and fall back to the top of the document (WCAG 2.4.3 Focus Order).

Limits of the test: the full DocumentWorkbench was not mounted, only a copy of its structure; the unmount behaviour it shows is the same one the real component hits.

Not already reported: grep of docs/evidence/reviews/2026-09-24, 09-26 and 09-28 for "renam" finds no open rename-focus finding. The only hits are the QMS tablist note in a11y.md and requireGovernedReason in part11-ux.md, both unrelated.

On severity: failure paths (401, !ok, catch) return without setting `renaming` to false. The group stays mounted and focus stays on the control that was used, so those paths are not affected.

- **intent** — real: I checked this against head 9d2134b52. The line numbers have shifted about 8 lines from the finding, but the code is the same.

- **Rename state.** Declared in client/src/concept2cure/v2/editor/DocumentWorkbench.tsx at 2462-2476. `openRename` only copies code and title into state and calls `setRenaming(true)`. It does not store `document.activeElement` or any ref to the trigger.
- **The three exits.** Escape at 3563-3566, Cancel at 3599, and a successful `saveRename()` at 2486 and 2515 all call `setRenaming(false)` and nothing else. No `.focus()` follows any of them.
- **Why focus is lost.** The `role="group"` at 3558 is conditionally unmounted. The element that had focus is inside it: the autoFocus code input, the title input, or the Rename/Cancel button. React then mounts a new Rename button at 3610-3618 with no ref. Focus falls to `<body>`.

It does not look deliberate:
- The block comment at 2455-2461 covers only the server-honesty contract and says nothing about focus.
- `git log -L` shows one commit touching this code, c402dbb6b ("WN: the canvas that expands…"), and it does not mention focus.
- The same file does return focus elsewhere: `anaReturnFocusRef` is declared at 1027, set at 1040 and 1047, and focus is restored at 1118-1119.
- The repo's own design docs make return-focus-to-trigger a requirement and call its absence a gap: docs/design/ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md:735, 916, 920 and docs/design/FULL_FEATURE_INVENTORY_FOR_DESIGN.md:547.

It is not a duplicate. A search of docs/evidence/reviews/2026-09-24, 2026-09-26 and 2026-09-28 for "rename" and "focus" found no open finding on this widget. The A-0928-1 and A3 entries are about other surfaces.

The impact is smaller than the finding says. Chrome and Firefox keep a sequential-navigation starting point where the removed node was, so the next Tab usually lands nearby rather than at the top of the document. Screen-reader users still lose their place, and focus sits on `<body>` after every Cancel, Escape or save. That is a WCAG 2.2 SC 2.4.3 (Focus Order) focus-management defect against the repo's own stated pattern.

The unmount driven by the `activeSectionId` effect at 2467 comes from navigation, so it is out of scope. I did not do a runtime or browser check; this is a static read only.

### GA-7 — **confirmed** (3 of 3)

- **reach** — real: I could not refute this on reachability. I read the code at HEAD 9d2134b52; the task named 232ecae9c, but the file is the same one the finding cites.

The code path is reachable in the launch catalog:
(1) Protocol development is in the launch scope. shared/constants/launch-scope.ts:64-79 lists 'protocol-dev' in the Authoring modules (a founder decision of 2026-09-21).
(2) The surface is registered. client/src/concept2cure/v2/surfaceViews.ts:549 maps 'protocol-dev' to ProtocolWorkspace, and registryModel.ts:982 and :993 link to it from the CRO and Health Systems nav.
(3) ProtocolDevWorkspace.tsx:235 renders `<ReviewsTab doc={doc} onEdit={canWrite ? onEdit : undefined} />`. Any user with write access therefore gets the 'Record disposition' button on every review row.
(4) The disabled state happens in normal use. The 'Request a review' form has a 'Reviewer account' select (ProtocolDevForms.tsx:159 and :309) that sends reviewerUserId. The server stores it (protocol-reviews-service.ts:60-78) and returns it (pdev-view-assembler.ts:66). ProtocolDevReviews.tsx:43-46 then sets `someoneElses` for every writer except the assigned reviewer.
(5) No other layer shows the reason. The row (lines 48-56) shows only the name, StatusBadge, role, due date and disposition. Line 65 uses native `disabled`, and research-v2.css:69 styles `.pg-btn:disabled` with opacity .5 and cursor:not-allowed. The only place the reason appears is `title` at line 66. No aria-describedby, visible note or test covers it: grep finds the string only in this file.
(6) The 2026-09-28 a11y review did not read this file (docs/evidence/reviews/2026-09-28/a11y.md:44 says "ProtocolDev* family beyond ProtocolDevSoa.tsx's 9-line diff was not opened"). The open finding A-0928-1 covers the same pattern in filingTarget.tsx and its three dialogs, not this row. So this is not a re-report.

Two limits on the claim:
- The server refuses anyone but the assigned user anyway, so there is no integrity or Part 11 impact. The loss is information only.
- The screen-reader part is overstated. Because aria-label supplies the button's name, Chromium exposes `title` as the accessible description, and some screen readers read it in browse mode on a disabled button. The keyboard-only sighted user, however, has no way to learn why the button is dimmed. This is a WCAG 1.3.1 / 3.3.2-style gap of the same kind as A-0928-1, with a smaller blast radius.

- **repro** — real: Reproduced at HEAD 9d2134b52; ProtocolDevReviews.tsx is unchanged from 232ecae9c. In ReviewerRow (client/src/concept2cure/v2/surfaces/ProtocolDevReviews.tsx:39-79), `someoneElses` (line 46) is true whenever the review has a numeric `reviewerUserId` that is not the signed-in user's id. The server always sends that field: pdev-view-assembler.ts:66 maps `reviewer_user_id` to a Number or null. When `someoneElses` is true, the button at lines 61-74 gets native `disabled` (line 65). The only explanation is `title=...` (line 66). It has no aria-describedby and no aria-disabled, and neither the header comment's promised "reason" nor any other text appears on the row.

I tested this in jsdom with a scratchpad vitest file (outside the repo, using the repo's vitest config and aliases). I rendered the real `ReviewsTab` with `useAuthUser` mocked to id 11 and a review of {reviewer:'Dr Iyer', reviewerUserId:99, status:'assigned', dueDate:'2026-10-01'}. The output was: `disabled= true title= Assigned to another user. Only they can sign this disposition. aria-describedby= null aria-disabled= null`, and `btn.focus()` left `document.activeElement !== btn` (the focus check printed false). The row's full textContent was "Dr IyerAssignedScientific · due 2026-10-01 · no disposition recordedRecord disposition". A regex for /another user|assigned to/ matched nothing on the row or anywhere else in the rendered tab.

So a keyboard-only user tabs straight past the control and never hears or sees why they cannot record a disposition. A mouse user sees the reason only on hover. The row itself looks identical to a review the user can sign: the badge just says "Assigned".

Not previously recorded: no file in docs/evidence/reviews/2026-09-2{4,6,8}/ mentions ProtocolDevReviews, "Record disposition" or this title. The 2026-09-28 a11y A-0928-1 finding is the same defect class, but it covers filingTarget.tsx, AuthoringPlaceIntoFiling.tsx and VaultPlaceIntoSubmission.tsx, not this file.

Caveat: in browse mode, some screen readers still land on disabled buttons and may read `title` as a description. The failure is certain for keyboard-only sighted users and for Tab navigation, and it is inconsistent for AT. Severity is below GA-1/A-0928-1 because this is one control per review row and the server refuses the action anyway, so this is an explanation gap, not a wrong-data risk.

Coverage: I covered the ReviewerRow render path and the assembler's source of reviewerUserId. I did not run a real browser or screen reader, and I did not check the CSS for pde-review-*.

- **intent** — real: I tried to refute this and could not. The code does not match its own stated intent or the repository's documented design rule.

1) The stated intent is that the reason is given, not hidden. The file header (ProtocolDevReviews.tsx:9-11), added in d622ca53a, says: "only the assigned user can sign it, so the button is disabled, with the reason, for anyone else." ReviewerRow's comment at :44 says: "say so before the click." Nothing in the header or in that commit says the reason is meant to be tooltip-only. The title is how the reason was delivered, not a considered decision about who can reach it.

2) The repository's own design rule asks for text. docs/design/ANA_DOCUMENT_STUDIO_DESIGN_ADVISORY.md:406 says: "Disabled-with-reason — a governed control the user can't use now is disabled *and* states why in text." Line 273 says: "Tooltip + inline text both." FULL_FEATURE_INVENTORY_FOR_DESIGN.md:41 says the reason is "never clickable-then-403". A review disposition is a governed Part 11 electronic signature (commit d622ca53a). At head, the only way the reason is delivered is `title` on a button that is also `disabled` (lines 64-66). A disabled button cannot take keyboard focus, so a sighted keyboard user cannot bring up the tooltip. Screen-reader users get it at most as an accessible description in browse mode, depending on the reader. Nothing else in the row shows who the review is assigned to: the name, StatusBadge and the pde-review-meta text at :49-55 cover only the role, due date and disposition.

3) This pattern is already classed as a defect. The 2026-09-28 a11y review (docs/evidence/reviews/2026-09-28/a11y.md:24, :73) rates the same pattern, "explains why ... disabled only via a `title` attribute on a button that is `disabled`", as blocker A-0928-1 in the filing dialogs. So by the repository's own standard this is not accepted design. It is also not a duplicate: a11y.md:44 says the "ProtocolDev* family beyond ProtocolDevSoa.tsx's 9-line diff was not opened", so this site was never recorded. One precedent points the other way: part11-ux 2026-09-24 Q6 accepted "disabled with the reason in its title" for Revert. But that was an affordance fix, and the later a11y review supersedes it for keyboard and screen-reader reachability.

Severity: the server fails closed with 403 for anyone but the assigned user, so there is no data or authorisation risk. The harm is that a keyboard or screen-reader user sees a governed signature action they cannot use and is not told why.

