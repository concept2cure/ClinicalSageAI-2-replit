# Accessibility lens: the editor family, DocumentWorkbench, 2026-09-28

## Scope actually covered

- `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` — all 5,134 lines read in full, top to bottom, at commit `7087f46e2` (confirmed `wc -l` = 5134 and this is HEAD of `concept2cure-v2`; working tree clean, no checkout needed).
- Gates run (read-only, no `--write-baseline`): `npm run ci:token-contrast` → **PASS**, 67 pairs, 15 documented exceptions held. `npm run ci:check-chip-tones` → **PASS**, 139 literal `tone-*` class uses, all 28 resolve to a CSS rule. I also read `scripts/ci/check-chip-tones.mjs` in full: it is explicitly scoped to literal `tone-*` **class names** only (its own header says so) and does not inspect `data-*` attribute-selector styling at all — relevant to A-A-5 below, which is exactly that shape of defect on a different attribute.
- Server files traced: `server/routes/authoring.router.ts` — confirmed every endpoint this file calls exists (`PATCH /sections/:sectionId` L1647, `GET .../history` L2034, `GET .../history/verify` L2083, `POST .../revert` L2103, `POST .../comment` L2254, `PATCH /comments/:id` L2328, `POST .../cite-source` L2515, `DELETE .../cite-source/:id` L2549, `GET /documents/:id/comments` L2600, `POST .../ai/deficiency-scan` L3404, `GET /docs/:id/audit` L5758, `POST .../refresh-token` L4305, `POST /docs/:id/refresh-all` L4631, `POST /documents/:id/tracked-change-decisions[/bulk]` L5927/L6021, `POST /docs/:id/sections/reorder` L6171); read in full the reason-for-change enforcement inside the section PATCH handler, lines 1795–1839, and `shared/constants/governed-reason.ts:10`.
- Child files read far enough to verify a specific claim (not audited line-by-line — out of my assigned scope): `client/src/concept2cure/v2/useDialog.ts` (full, 102 lines — the focus-trap/Escape/return-focus hook), `client/src/concept2cure/v2/toast.tsx` (full — the live-region toast), `client/src/concept2cure/v2/dataConnect.tsx:594–690` (`EmptyState`/`ErrorState` live-region wiring), `client/src/concept2cure/v2/icons.tsx:1–145` (icon `aria-hidden` construction), `client/src/concept2cure/v2/editor/FileToVaultDialog.tsx` and `AssignReviewDialog.tsx` (grepped for dialog pattern only), `client/src/concept2cure/v2/surfaces/AuthoringFilingBar.tsx` (grepped for signing-dialog wiring), `client/src/concept2cure/_shared/components/EsignModal.tsx:255–293` (Escape/focus-trap implementation), `client/src/concept2cure/v2/surfaces/filingTarget.tsx:330–383` (to re-verify A-0928-1), `client/src/concept2cure/v2/useFilingOutline.ts` (node.status typing only).
- CSS traced for every class this file renders that carries state/contrast/motion/target-size meaning: `client/src/concept2cure/v2/styles/authoring-v2.css`, `app-v2.css`, `journey-v2.css`, `project-home-v2.css` (grepped/read in relevant sections, not cover-to-cover).
- Earlier reports read in full: `docs/evidence/reviews/2026-09-24/a11y.md`, `docs/evidence/reviews/2026-09-28/a11y.md`.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| A-A-1 | medium | `editor/DocumentWorkbench.tsx:3296-3311` | The reason-for-change field that gates every section save has no `aria-required`, `aria-describedby`, or `aria-invalid` — the 8-char floor is stated only in a placeholder that disappears once typing starts. |
| A-A-2 | medium | `editor/DocumentWorkbench.tsx:1094-1103` + `useDialog.ts:58-63,94` | Escape, while the AnA panel is open, closes the AnA panel **and** the topmost `useDialog`-based dialog together — an unadvised extra change of context. |
| A-A-3 | medium | `editor/DocumentWorkbench.tsx:3278-3295, 3328-3338, 3346-3369, 4278-4286` | Several buttons gating governed/file actions state their disabled reason only via `title`, which a native `disabled` button removes from the keyboard path entirely. |
| A-A-4 | medium | `editor/DocumentWorkbench.tsx` (~26 sites, e.g. `3618-3635`) + `app-v2.css:83,2625-2626` + `authoring-v2.css:1552,1688-1692` | The shared `.nda-open` compact button has no minimum size outside a mobile-only media query, and no padding, so it renders under the WCAG 2.2 SC 2.5.8 24×24px floor on desktop. |
| A-A-5 | medium | `editor/DocumentWorkbench.tsx:2919-2920` | The filing-outline "has a draft" status dot sets `data-s="ok"`, a value with no matching CSS rule, so it paints fully invisible; its only fallback (`title`) is keyboard-unreachable. |
| A-A-6 | low | `editor/DocumentWorkbench.tsx:4784-4794` | The comment thread whose canvas-anchor was just clicked is highlighted by a 7%-opacity background tint only — no text or icon companion. |

---

### A-A-1 — reason-for-change field: no `aria-required`, no persistent instruction (medium)

**What the code does.** The `§11.10(d)/(e)` "reason for change" input — the single funnel every section save on this surface goes through — is rendered only while dirty:

```
3301  {dirty && !docSealed && (
3302    <input
3303      className="de-input"
3304      style={{ height: 30, width: 260 }}
3305      value={changeReason}
3306      onChange={e => setChangeReason(e.target.value)}
3307      placeholder="Why this changed (at least 8 characters)"
3308      aria-label="Reason for change"
3309      data-testid="change-reason"
3310    />
3311  )}
```

It has an accessible name (`aria-label`) but no `aria-required="true"`, no `aria-describedby` pointing at a persistent note, and no `aria-invalid`. The 8-character minimum lives only in the `placeholder`, which vanishes the moment the user types anything and is never re-stated near the field.

**Why it matters.** This is not a decorative minimum: the server enforces it independently and unconditionally, refusing the write if it is not met —

```
server/routes/authoring.router.ts:1806   // §11.10(e): a content change carries its reason, checked here rather
                                          // than trusted from the client, and refused before anything is written.
1808   let changeReason: string | null = null;
1809   if (recordRevision) {
1810     const verdict = requireGovernedReason(req.body?.changeReason);
1811     if (!verdict.ok) return res.status(400).json({ error: verdict.error, field: 'changeReason' });
1812     changeReason = verdict.reason;
1813   }
```
(`GOVERNED_REASON_MIN = 8`, `shared/constants/governed-reason.ts:10`). So a person who does not retain the vanished placeholder text has no robust way to learn *why* nothing is happening, beyond guessing.

**Mitigation found (read before reporting).** The client's own funnel also enforces it and *does* announce clearly, regardless of the header button's disabled state:
```
1987  if (!systemReason && changeReasonRef.current.trim().length < 8) {
1988    fireToast(
1989      'Not saved — say why this section changed, in at least 8 characters. It is ' +
1990      'recorded with the revision, and the filing keeps it.',
1991      'error',
1992    );
```
`fireToast(msg, 'error')` renders via `C2CToast` with `role="alert"` (`toast.tsx:130-150`), a correctly-implemented live region. If Ctrl/Cmd-S reaches this callback even when focus is in this sibling `<input>` rather than the rich-text canvas, a keyboard user does get a clear, spoken explanation on the first attempt — but I could not confirm that binding scope without reading `RichSectionEditor.tsx` (lens B's file, out of my scope), so I record this as **not verified** rather than assumed.

The same defect shape, on the sibling field this pattern is closely related to, was found and **fixed this week**: `PlacementReasonField` (`client/src/concept2cure/v2/surfaces/filingTarget.tsx:355-373`) now carries `aria-required="true"`, `aria-describedby` pointing at a note that states the requirement **before** it's violated, and an `aria-hidden` asterisk — modeled on `C2CForm.tsx:130`'s convention (per the 2026-09-28 report's own investigation, which I re-read and re-verified holds at head). This file's own reason-for-change field — arguably the original instance of the governed-reason pattern in the editor — was not brought to the same standard: it also hardcodes the literal `8` three times (`1987`, `3316`, `3320`) rather than importing `GOVERNED_REASON_MIN` the way `filingTarget.tsx:25` does.

**Smallest fix.** Add `aria-required="true"` and `aria-invalid={changeReason.trim().length > 0 && changeReason.trim().length < 8 || undefined}` to the input; add a small persistent note under it (`aria-describedby`) stating the 8-character floor up front, the same shape as `PlacementReasonField`'s note; import `GOVERNED_REASON_MIN` instead of the literal `8`.

---

### A-A-2 — Escape closes the AnA panel and the topmost dialog together (medium)

**What the code does.** Two independent, non-capturing `keydown` listeners are attached directly to `document` whenever both are "on": this component's own, whenever the AnA rail is open —

```
1094  useEffect(() => {
1095    if (rail !== 'ana') return;
1096    const closeOnEscape = (event: KeyboardEvent) => {
1097      if (event.key !== 'Escape') return;
1098      event.preventDefault();
1099      closeAna();
1100    };
1101    document.addEventListener('keydown', closeOnEscape);
1102    return () => document.removeEventListener('keydown', closeOnEscape);
1103  }, [closeAna, rail]);
```

— and the shared dialog hook, whenever any of the three `useDialog`-based dialogs this file opens is mounted (`UnsavedWorkGuard` at `5079` via `useDialog(onCancel)`; `FileToVaultDialog` and `AssignReviewDialog`, both confirmed via grep to call `useDialog` the same way):

```
useDialog.ts:58   const onKey = (e: KeyboardEvent) => {
59       if (e.key === 'Escape') {
60         e.stopPropagation();
61         closeRef.current();
62         return;
63       }
...
94   document.addEventListener('keydown', onKey);
```

Neither listener is registered in the capture phase, and neither calls `stopImmediatePropagation()`. Per the DOM event model, `stopPropagation()` does **not** suppress other listeners registered on the *same* target for the *same* phase — only `stopImmediatePropagation()` does. So when the AnA rail is open (it is the **default** open rail on the non-embedded Authoring surface — `730` `useState<...>(embedded ? null : 'ana')`) and, say, the person clicks a different tree section while dirty (opening `UnsavedWorkGuard`) and presses Escape meaning only to cancel that dialog, **both** fire: the dialog correctly closes, and the AnA panel also closes as an unrequested side effect.

**Why it matters.** No data is lost (the `anaDraft` composer text is not cleared by `closeAna`), and the dialog's own intended action still completes correctly, so this does not rise to a keyboard trap or a false governed state. But it is a real, broadly-reproducible, unadvised change of context triggered by a single keypress — the person loses their open conversation pane because they dismissed an unrelated confirmation.

**Evidence this is fixable in-repo, not a hard problem.** `EsignModal.tsx` — the product's own §11.50 signature dialog — gets this right:
```
EsignModal.tsx:260   const onKey = (e: KeyboardEvent) => {
261      if (e.key === 'Escape') {
262        e.stopPropagation();
263        handleClose();
...
285   document.addEventListener('keydown', onKey, true);   // capture phase
```
Because it registers in the **capture** phase, its `stopPropagation()` there genuinely does pre-empt any bubble-phase listener (including this file's own AnA-Escape listener and `useDialog`'s), which is why I did **not** find this defect on the signature ceremony — it is specific to the three `useDialog`-based dialogs.

**Smallest fix.** In this file's own Escape effect (`1094-1103`), guard against acting while a dialog is open (e.g. `if (pendingLeave || fileToVaultOpen || assignReviewOpen) return;`), or register it in the capture phase the way `EsignModal` does. A shared fix in `useDialog.ts` (switch to `stopImmediatePropagation`) would be more central but affects all 36 call sites and is outside a single-file change.

---

### A-A-3 — disabled buttons whose reason is stated only in an unreachable `title` (medium)

**What the code does.** Four buttons follow the same shape: `disabled={cond}` with `title={cond ? '<explanation>' : ...}` and a visible label that does **not** change to reflect the state:

```
3278  {activeDoc && (
3279    <button ... onClick={() => setFileToVaultOpen(true)}
3283      disabled={dirty}
3284      title={
3285        dirty
3286          ? 'Save the open section first — the vault files the saved document.'
3287          : !programId
3288            ? 'This document is not filed under a program; the vault is program-scoped.'
3289            : 'Export this document and file the file into the project vault, with its SHA-256 recorded.'
3290      }
...
3293    >{I.vault} File to vault</button>
3295  )}
```
```
3328  <button ... onClick={() => askAna(draftPrompt)} disabled={docSealed}
3333    title={docSealed ? 'This document is frozen — new drafts cannot be inserted.' : undefined}>
3337    {I.sparkles} Draft with AnA
```
```
3346  <button ... disabled={!activeSection || docSealed} ...
3364    title={docSealed ? 'This document is frozen — its content cannot be edited.' : '...'}>
3370    {I.wand} Draft from sources
```
```
4278  <button className="nda-open" ... onClick={() => revert(r.id)}
4282    disabled={docSealed}
4283    title={docSealed ? 'This document is frozen — its content cannot be reverted.' : undefined}>
4285    {I.rotateCcw} Revert
```

`useDialog.ts` itself documents why this matters: "Disabled and inert controls are excluded because the browser will not focus them either way" (`useDialog.ts:24-25`) — a `disabled` native button is removed from the tab sequence, so its `title` is unreachable by a keyboard-only user regardless of assistive technology.

**Why it matters / mitigation.** For the three `docSealed`-gated buttons (Draft with AnA, Draft from sources, Revert), a `role="status"` banner elsewhere on the page states the same fact in visible, readable text whenever a section is open under a frozen document (`3747-3754`: "This document is frozen…"), and the header Save button changes its own label to the word **"Frozen"** rather than relying on a tooltip (`3326`) — a better pattern the other three buttons do not follow. For **File to vault**, gated on `dirty` rather than `docSealed`, there is no equivalently-placed restatement reachable before it in DOM/tab order (the "unsaved changes" text lives later, in the section masthead, `3667-3671`) — this is the least-mitigated instance. A much lower-stakes fifth instance, the streaming-gated "Next actions" chip (`4071-4079`), is self-resolving once the message finishes streaming.

**Smallest fix.** For each, either change the visible label to state the reason the way the Save button already does ("Frozen", "Save the section first…"), or move the reason into a persistently-visible sibling note referenced by `aria-describedby`, matching the pattern already used correctly elsewhere in this same file (e.g. the change-reason placeholder's intent, or the frozen-document banner).

---

### A-A-4 — `.nda-open` renders under the WCAG 2.2 SC 2.5.8 (Target Size Minimum) 24×24px floor on desktop (medium)

**What the code does.** `.nda-open` is this file's compact link-style secondary-action button, used ~26 times (Rename `3604`, Check `3640`, Dismiss `3427/3697/4490`, Verify ledger `4200`, Revert `4279`, Move section up/down `3619/3628`, Reopen/Resolve/Cancel/Reply/Show-in-text/Re-read/Remove/Ask-what-changed throughout `4342-4979`). Its CSS:
```
app-v2.css:83     .c2c-v2 button { font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; ... }
app-v2.css:2625   .c2c-v2 .nda-open{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--accent-200);font-weight:500;}
app-v2.css:2626   .c2c-v2 .nda-open svg{width:12px;height:12px;}
```
sets no padding and no minimum box size; the base button reset zeroes padding/border/margin for every `<button>`. The only rule that gives `.nda-open` a 44×44px minimum is:
```
authoring-v2.css:1552   @media (max-width: 760px) {
...
authoring-v2.css:1688     .ed-doc .nda-open,
1689       .ed-comments .nda-open {
1690       min-height: 44px;
1691       min-width: 44px;
1692     }
```
— entirely inside a mobile-width media query. Above 760px (any normal desktop viewport) no rule gives these controls a minimum box; the icon-only instances (Move up/down) are effectively ~12–14px square, and the text-bearing instances (Rename, Revert, etc.) are wide enough but only as tall as an 11.5px line box with zero padding (roughly 14–17px) — under the 24px floor in the vertical dimension either way.

**Why it matters.** SC 2.5.8 is Level AA in WCAG 2.2 and applies regardless of device unless one of its five listed exceptions holds (spacing / equivalent / inline / user-agent / essential). Several of these sit in tightly-packed flex rows (e.g. the Move-up/Move-down pair at `3618-3635`, separated by 4px) where the spacing exception is unlikely to apply; none is "in a sentence" in the sense the inline exception intends. Keyboard operability is unaffected (Tab/Enter still work); this is specifically a pointer/touch-precision concern.

**Not independently verified.** I did not render this in a browser to measure the exact computed box; the conclusion is a CSS-cascade reading (no ancestor override found), not a pixel measurement. `.nda-open` is a shared, repo-wide class defined in `app-v2.css`, so the same gap likely recurs outside this file — out of my assigned scope to confirm.

**Smallest fix.** Give `.nda-open` (or a `.ed-doc`/`.ed-comments`-scoped override, matching the pattern already used for mobile) a `min-height`/`min-width` of 24px unconditionally, not only under `@media (max-width: 760px)`.

---

### A-A-5 — filing-outline "has a draft" dot is invisible; its `title` fallback is keyboard-unreachable (medium)

**What the code does.**
```
2915  {/* Asked of BOTH stores. node.has_content reads the governed
2916      c2c_document_sections; this editor writes authoring_sections,
2917      so on its own the dot could never light for anything drafted
2918      here. See nodeHasDraft. */}
2919  {nodeHasDraft(node, bound) && (
2920    <span className="ed-dot" data-s="ok" title={node.status} />
2921  )}
```
`.ed-dot`'s only colour-bearing rules are keyed on `data-s='complete'|'review'|'draft'`:
```
authoring-v2.css:197   .ed-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
203   .ed-dot[data-s='complete'] { background: var(--success); }
206   .ed-dot[data-s='review'] { background: var(--warning); }
209   .ed-dot[data-s='draft'] { background: var(--idle); }
```
`data-s="ok"` matches none of these, and the base rule sets no `background` — so this dot paints fully transparent for every user, sighted or not. This is the same class of defect `ci:check-chip-tones` exists to catch (a hardcoded state value with no backing CSS rule) but on a `data-*` attribute rather than a `tone-*` class, which is explicitly outside that gate's documented scope (`scripts/ci/check-chip-tones.mjs:30-37`).

A second instance in the same file, `3061-3067` (`data-s="review"` for a section's comment count), *does* match a real rule and so is visible, but shares the same fallback problem: its meaning is carried only by `title={`${n} comments`}` on a non-focusable, empty `<span>` inside a `<button>` whose own accessible name is just the section code and title — unreachable by keyboard, and not reliably part of the button's computed accessible name. This one is partly mitigated: the header's "Comments N" button (`3179-3186`) restates the same count in real text once that section is open.

**Why it matters.** The "has a draft" signal on the governed filing outline — the one place a filer sees at a glance which required sections are started — currently reaches no one through any channel: not colour (broken), not text (title, unreachable). This is informational rather than blocking (clicking the node still works and reveals the truth), which is why I rate it medium rather than high.

**Smallest fix.** Correct `data-s="ok"` to a value the CSS actually defines (most likely `data-s="complete"`, matching intent), and give the dot a text equivalent reachable without a mouse — either fold "drafted" into the button's own accessible name (e.g. a visually-hidden span) or move the status into a non-`title` mechanism.

---

### A-A-6 — focused-comment highlight is colour-only (low / advisory)

```
4784   key={c.id}
4785   className="cmt"
4786   data-active={focusedCommentId === c.id || undefined}
4787   style={
4788     focusedCommentId === c.id
4789       ? { background: 'color-mix(in srgb, var(--accent-100,#2563eb) 7%, transparent)' }
4790       : undefined
4791   }
```
No CSS rule for `.cmt[data-active]` exists beyond this inline style (grepped the v2 stylesheets; none found), so the *only* signal that a comment thread is "the one whose canvas anchor you just clicked" is a 7%-opacity colour tint. Every comment's text, author and status remain fully readable regardless, so this is advisory rather than a comprehension blocker — but it is a literal instance of the "colour never alone" rule for a genuine state (currently-referenced thread). **Smallest fix:** add a left border or a small "◂ selected" indicator alongside the tint.

---

## Earlier findings re-verified

- **2026-09-24 report, "Prior state the auditor recorded"** named the `DocumentWorkbench` unsaved-changes guard as an example of the shared `useDialog` pattern (focus trap, Escape, focus-return) used consistently. **Holds** — re-verified directly: `UnsavedWorkGuard` (`editor/DocumentWorkbench.tsx:5055-5134`) calls `useDialog(onCancel)` (`5079`), renders `role="alertdialog" aria-modal="true" aria-labelledby="ed-guard-t" aria-describedby="ed-guard-d" tabIndex={-1}` (`5089-5093`), both ids resolve to real elements (`5096`, `5099`), and `useDialog.ts` (`50-101`) does implement a real Tab-wrapping focus trap and restores focus to `document.activeElement` captured at open (`56`, `97`). **New nuance this pass found and the 2026-09-24 pass could not have, since it only checked the dialog's own internals**: see A-A-2 above — this dialog's Escape-close interacts badly with this file's own, separate AnA-panel Escape listener.
- **2026-09-24 report's A1/A2/A3** — none are in `DocumentWorkbench.tsx` (`SubmissionCenter.tsx`, `AdminSurfaces.tsx`, `quality/App.tsx` respectively); out of my file's scope, not re-checked by me.
- **2026-09-28 report** recorded that `DocumentWorkbench.tsx` (~5,100 lines) was **not** read line by line that pass — only an 18-line diff covering "the change-reason/save-gate logic and a new disabled+title Revert button," seen but not evaluated. This pass closes that gap: the change-reason logic is evaluated at A-A-1, and the Revert button is evaluated as part of A-A-3.
- **A-0928-1** (`filingTarget.tsx:335`, `PlacementReasonField`) — not in my file, but directly relevant context for A-A-1. Re-verified: **fixed and holds at head**. `filingTarget.tsx:355-373` now reads:
  ```
  356   Reason for this placement<span className="req" aria-hidden="true">*</span>
  ...
  366   aria-required="true"
  367   aria-describedby={`${id}-note`}
  368   aria-invalid={short || undefined}
  ...
  371   {short ? `At least ${GOVERNED_REASON_MIN} characters.` : `Required, at least ${GOVERNED_REASON_MIN} characters. Recorded with the placement in the audit trail.`}
  ```
  I also confirmed the report's mount-point citation: `AuthoringPlaceIntoFiling` (which renders `PlacementReasonField`) is mounted from this file at `editor/DocumentWorkbench.tsx:3397` (`3396-3405`), consistent with the report's "`3389`". A-A-1 above notes that this exact fix was **not** carried back to this file's own, older reason-for-change field.
- **A-0928-2** (`Vault.tsx:296`) — not in my file, not re-checked.

## What I did NOT get to

- **No browser or assistive-technology pass at all.** Everything above is a static read. I did not verify with a real screen reader: whether `title` text is ever exposed as an accessible description on a *focusable* element in practice across browsers; whether `AnaActivity`'s narrow live region (imported, not read) actually announces "answer ready" once AnA's streamed response completes into the deliberately-non-live `role="region"` transcript (`4002-4130`) — the code comment at `3995-4000` states the design intent clearly, but I did not open `AnaActivity.tsx`/`useAnaChat.ts` to confirm the mechanism, and this matters: without it, a screen-reader user asking AnA a question may get no spoken cue that an answer arrived. **Not verified — flagging rather than guessing.**
- **RichSectionEditor.tsx** (2,716 lines) is lens B's assigned file, not mine. This means I could not confirm: whether Ctrl/Cmd-S (the mitigation I credit in A-A-1) actually fires when focus is in the sibling change-reason `<input>` rather than inside the rich-text canvas; the keyboard operability of the rich-text toolbar, the find bar, and the track-changes accept/reject controls that this file merely wires up (`onSave`, `track.onResolve`, `commentsApi`, etc., `3785-3927`).
- **Child dialog/panel components** this file mounts were not read line-by-line, only grepped far enough to confirm the specific claims above: `FileToVaultDialog.tsx`, `AssignReviewDialog.tsx`, `AuthoringFilingBar.tsx`, `AuthoringPlaceIntoFiling.tsx`, `AuthoringCollab.tsx`, `AuthoringCreateExport.tsx`, `AuthoringAiDraft.tsx`, `AuthoringExports.tsx`, `AuthoringSignatures.tsx`, `AuthoringRevisionDiff.tsx`, `ProjectFilesPanel.tsx`, `ReviewTasksPanel.tsx`, `EsignModal.tsx` (beyond its Escape/focus-trap block). A full a11y pass on any of these would need its own line-by-line read.
- **"Compare" and "restore" dialogs**, named in this lens's charge: `AuthoringRevisionDiff` (the word-level redline, `4298-4301`) is rendered **inline** in the History rail, not as a modal, so no focus-trap question applies to it here. "Restore" (Revert, `4278-4286`) has **no confirmation step at all** — it fires immediately on click. That is a safety/UX question, not itself an accessibility defect (the button is labelled and keyboard-operable either way), so I have not filed it as a finding, but I flag it as something I looked for specifically per the charge and did not find implemented as a dialog.
- **Live-rendered contrast and target-size measurement.** `ci:token-contrast` checks structural token pairs, not every inline computed style or CSS cascade outcome; A-A-4's target-size conclusion and any contrast implications of A-A-6's 7% tint are reasoned from source, not measured in a browser.
- **Motion.** I found `prefers-reduced-motion: reduce` handling for the one animation I traced that this file's loading states use (`EmptyState`'s busy-pulse, `dataConnect.tsx:665`, `app-v2.css:243-246`), and confirmed `authoring-v2.css` carries its own reduced-motion blocks (`342`, `1467`, `1812`) for `.ed-*`/editor chrome. I did not do a full motion audit (that is the motion-auditor's lens per the charge) and did not find any animation defined inline in this file itself.
- I did not re-run any gate with `--write-baseline`/`--baseline`, did not commit, and modified no file.
