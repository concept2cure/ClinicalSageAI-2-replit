# Accessibility lens: the editor family, the ProtocolDev family, 2026-09-28

Reviewed read-only at commit `7087f46e23ae763cc88c3ec3a05b3c0575649aec` (`concept2cure-v2`), which is also repo HEAD with a clean working tree (verified: `git rev-parse HEAD` matches, `git status --short` empty, `git diff 7087f46e2 HEAD` empty for these paths). No file was edited, created, deleted, or staged. No gate was run with `--write-baseline`/`--baseline`.

## Scope actually covered

All fifteen named files, read in full, every line:

| File | Lines |
|---|---|
| `client/src/concept2cure/v2/surfaces/ProtocolDev.tsx` | 1–233 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevCompliance.tsx` | 1–210 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevDerivation.tsx` | 1–457 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevDesign.tsx` | 1–317 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevForms.tsx` | 1–392 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevPanes.tsx` | 1–202 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevProjections.tsx` | 1–304 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevRegisters.tsx` | 1–294 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevReviews.tsx` | 1–158 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevSection.tsx` | 1–283 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevShared.tsx` | 1–55 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevSigning.tsx` | 1–112 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevSoa.tsx` | 1–284 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevWorkspace.tsx` | 1–524 |
| `client/src/concept2cure/v2/surfaces/ProtocolDevWrites.ts` | 1–425 |

4,250 lines total — matches the charge's count, confirming the full file set was read (also cross-checked with `git ls-tree` at `7087f46e2`).

**Shared modules read in full to trace mutation/dialog paths** (not part of the fifteen, but load-bearing for correctly judging them): `client/src/concept2cure/v2/surfaces/ProtocolGov.tsx` (1–281, defines `PG.Btn`/`StatusBadge`/`Citation`/`FindingsList`/`CompletenessGate`/`AuditTrail`/`Ic`/`toast`, used on nearly every page in scope), `client/src/concept2cure/v2/C2CForm.tsx` (1–251, the governed drawer every "reason for change" form in this family renders through), `client/src/concept2cure/v2/useDialog.ts` (1–101, the focus-trap/Escape/focus-return hook `C2CForm` uses), `client/src/concept2cure/v2/toast.tsx` (1–151, the live-region toast every governed write's confirmation/error in this family fires through), `client/src/concept2cure/v2/surfaces/ProtocolRegisterForms.tsx` (1–234, the create-forms for risk/milestone/amendment/deviation/objective/eligibility).

**Traced by targeted grep only** (confirmed the specific claim, not read end-to-end): `client/src/concept2cure/_shared/components/EsignModal.tsx` (confirmed `role="dialog"`, `aria-modal="true"`, Escape handling, a `FOCUSABLE`-query Tab-trap and a `restoreFocusRef` for focus-return, at lines 169, 230, 238, 269–281, 360–361); `client/src/concept2cure/v2/icons.tsx:133` (confirmed every icon glyph renders `aria-hidden="true" focusable="false"` by construction, so every `PG.Ic`/icon-beside-text pattern in scope is not a source of duplicate/unlabelled announcements).

**Server files read/traced** to verify governed-write claims: `server/routes/protocol-development.ts` (full route list via grep — 20 routes including `/sections/:id`, `/visits`, `/documents/:id/finalize`; the finalize handler read in full, lines 496–529); `server/routes/protocol-reviews.ts` (route list via grep; the disposition-signature handler read in full, lines 165–206); `server/routes/protocol-soa.ts` and `server/routes/protocol-risks.ts` (route lists via grep, confirming `/cells`, `/cells/clear`, `/risks/:id` exist as the client claims). Both signed-act routes confirmed to answer refusals as `{error:{code,message}}`, which is what the client's `refusal()`/`detailOf()` helpers expect — so an alert reaching the screen after a rejected e-signature carries the server's real sentence, not just an HTTP status.

**Gates run** (read-only): `npm run ci:token-contrast` → **PASS** (67 pairs, text ≥4.5:1/non-text ≥3:1, 15 documented exceptions held). `npm run ci:check-chip-tones` → **PASS** (139 literal tone uses, 28 resolve to a CSS rule). Neither gate checks ARIA correctness, keyboard operability, color-as-sole-carrier, or target size — see findings below, all of which required the line-by-line read, not the gates.

**Headline, stated up front:** every governed-write ceremony this pass traced — reason-for-change capture, the two electronic signatures (finalize, review disposition), audit-trail recording, re-read-after-write — is real, wired to the server routes it claims, and gated correctly. I found **no blocker**: no path where a regulated record is created, changed, signed or released without the control the product claims, and no place where a person is shown a false governed state. Every finding below is about *perceiving or operating* a true state (focus visibility, ARIA correctness, color-as-sole-carrier, target size), not about the record's integrity.

## Findings

| id | severity | file:line | summary |
|---|---|---|---|
| A-C-1 | medium | `ProtocolDevDerivation.tsx:172–173` | The design-derivation "Accept" checkbox — the only control that selects which protocol-evidenced fields get written into the governed study design — has no visible focus indicator; the app-wide CSS reset zeroes its outline and nothing restores one. |
| A-C-2 | medium | `ProtocolDevWorkspace.tsx:295–300` | The 16-tab `TabStrip` switching every register/section of the protocol has no `role="tablist"`/`role="tab"`/`aria-selected` — a screen reader cannot tell which tab is current from the control itself. |
| A-C-3 | medium | `ProtocolDevRegisters.tsx:91–102` | `RiskRow` is a `<div role="button">` where the sibling `RiskHeatMap` in the same file already shows a real `<button>` works; it has no explicit accessible name, so AT reads the entire row's text (and this refines, not confirms, the 2026-09-24 report's claim that this exact code "carries … aria-label"). |
| A-C-4 | medium | `ProtocolDevSection.tsx:208–214`; `ProtocolDevSoa.tsx:261–267` | Two "Reason for change (governed)" fields have a visible `<label>` whose wording differs from their `aria-label`, which wins for the accessible name — WCAG 2.5.3 Label in Name — on the field gating every write on that pane. |
| A-C-5 | medium | `ProtocolDevSoa.tsx:198–213` | Every schedule-of-assessments cell is a `<td role="checkbox">`: the cell's native table-cell/row-column-header semantics are discarded for the ARIA widget role, and the accessible name relies solely on the `title` attribute fallback rather than `aria-label`. |
| A-C-6 | medium | `ProtocolDevPanes.tsx:52–61` (+ `research-v2.css:130–133`) | The section-outline status dot's colour is the only *visible* carrier of "complete" vs. "draft" vs. "not started" — the text equivalent (`sr-only`) is invisible to sighted users, so a colour-vision-deficient author cannot tell them apart without opening each section. |
| A-C-7 | medium | `ProtocolDevSoa.tsx:218–224` (+ `research-v2.css:208–210`) | The schedule-of-assessments footer flags an under-scheduled visit (fewer than 3 assessments) by colour alone (`.pd-soa-tot.low{color:var(--warning)}`) — no icon, symbol or text accompanies it. |
| A-C-8 | medium | `ProtocolDevSoa.tsx:141–158` (+ `protocol-dev-editing.css:103–104`) | The rename/remove icon buttons on every schedule-of-assessments visit column compute to a ~22×18 CSS-pixel target, below the WCAG 2.2 SC 2.5.8 24×24px floor, with only 1px between the two adjacent targets. |
| A-C-9 | low (advisory) | `ProtocolDevReviews.tsx:61–74` | A disabled "Record disposition" button's only explanation ("Assigned to another user…") is a `title` on a `disabled` (hence unfocusable) button; partly mitigated because the row's own visible reviewer name lets a careful reader infer it. |
| A-C-10 | low (advisory) | `ProtocolDevRegisters.tsx:223–244` | `BudgetTable`'s `<th>` column headers carry no `scope="col"`. |
| A-C-11 | low (advisory) | `ProtocolDevReviews.tsx:145–148`; `ProtocolDevRegisters.tsx:280–287` | Progress/bar-styled `<div>`s (consent-completeness meter, budget category bars) carry no `role="progressbar"`/`aria-valuenow`; mitigated because the percentage/value is also rendered as adjacent text. |
| A-C-12 | low (advisory) | `ProtocolDevSection.tsx:247–252, 280` | The section save-readiness text (`pde-sec-state`, e.g. "State a reason for change to save" → "Ready to save") updates with no `aria-live`, so a screen-reader user who has moved on won't hear the transition. |

---

### A-C-1 — Design-derivation "Accept" checkbox has no visible focus indicator (medium)

**What the code does.** `ProtocolDevDerivation.tsx:170–177`:
```tsx
function Accept({ path, label, checked, onToggle }: AcceptProps) {
  return (
    <label className="pde-rowbtn" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <input type="checkbox" checked={checked} aria-label={label} onChange={() => onToggle(path)} />
      <span>{label}</span>
    </label>
  );
}
```
This is the sole control on every row of the "Proposed" and "Conflicts" buckets (rendered at lines 187 and 208) that decides which protocol-evidenced field gets written into the bound study design when the author later submits the `ApplyDrawer` (`ProtocolDevDerivation.tsx:284–319`, `POST /api/protocol-development/documents/:id/design-derivation/apply`, confirmed server-side at `protocol-development.ts:328`).

The app resets every native input's outline globally: `client/src/concept2cure/v2/styles/app-v2.css:85`:
```css
.c2c-v2 input, .c2c-v2 textarea, .c2c-v2 select { font: inherit; color: inherit; background: transparent; border: 0; outline: 0; }
```
There is a global restore for `button` and `select` focus (`app-v2.css:84,94`) but **none for bare `input`**. The only class-level candidate, `.pde-rowbtn:focus-visible{outline:2px solid var(--accent-200);outline-offset:1px;}` (`protocol-dev-editing.css:58`), targets the `.pde-rowbtn` element — here that class is on the `<label>`, which a browser never gives keyboard focus to (focus goes to the wrapped `<input>`); it correctly fires for every *other* `.pde-rowbtn` use in this family, all of which are real `<button>`s (e.g. `ProtocolDevSoa.tsx:147,151,171`). I grepped every `.css` file under `client/src/concept2cure/v2/styles/` for any rule touching `input[type="checkbox"]:focus`/`:focus-visible` in this class's scope and found only one, scoped to `.dcv .de-field`/`.ed .de-field` (`authoring-v2.css:2085–2086`) — a different component family, not reachable from this checkbox.

**Why it matters to a regulated user.** A sighted keyboard-only user tabbing through a long list of proposed/conflicting fields cannot see which checkbox currently has focus, so pressing Space risks accepting (or leaving unaccepted) the wrong field into a governed study-design record. This is the exact "`outline: none` with no replacement" pattern the skill calls "always a finding" (`SKILL.md` Hard Rule 2), on a control that decides governed content. It is not a blocker because the `ApplyDrawer` restates the accepted paths by name before the write (`ProtocolDevDerivation.tsx:308`, `${paths.length} path(s) accepted: ${paths.join(', ')}`), giving one more chance to catch a mis-click, and because screen-reader users are unaffected (the `aria-label`/`aria-checked` state is announced regardless of the CSS outline).

**Smallest fix.** Add a `:focus-visible` rule scoped to a real selector on the checkbox itself (e.g. give it a class, or add `.pde-rowbtn input:focus-visible{outline:2px solid var(--accent-200); outline-offset:1px;}`) rather than relying on the wrapping label's (never-firing) rule.

### A-C-2 — 16-tab `TabStrip` exposes no ARIA tab state (medium)

**What the code does.** `ProtocolDevWorkspace.tsx:295–301`:
```tsx
function TabStrip({ tab, onTab }: { tab: string; onTab: (id: string) => void }) {
  return (
    <div className="pd-tabs">{TABS.map((t) => (
      <button key={t.id} className={'pd-tab' + (tab === t.id ? ' on' : '')} onClick={() => onTab(t.id)}>
        <Ic n={t.icon} s={14} />{t.label}</button>))}</div>
  );
}
```
`TABS` (lines 41–73) lists 16 entries (Document, Objectives, Eligibility, Schedule of assessments, Study design, Design derivation, Compliance, IRB package, Statistics, Risk register, Milestones, Budget, Amendments, Deviations & CAPA, Reviews, Consent). No `role="tablist"` on the wrapping `<div>`, no `role="tab"`/`aria-selected` on each `<button>`, no `aria-controls`. The active tab's only state marker is the CSS class `.on` (`research-v2.css:119`: colour + `border-bottom` + `font-weight:600` — not colour-alone visually, but not exposed to assistive technology as a *state* at all). Each button is individually tab-stoppable (no roving tabindex / arrow-key movement per the ARIA APG Tabs pattern).

**Why it matters to a regulated user.** This is the exact defect class the 2026-09-24 report's A3 finding fixed elsewhere in the app (`quality/App.tsx`, "one tab stop; Arrow/Home/End move and select") — un-fixed here, in a file neither prior review opened. A screen-reader user tabbing the strip cannot learn which register they are currently viewing from the tab control itself. Impact is bounded because the freshly-shown panel's own `<h2>` (via `PaneHead`, `ProtocolDevShared.tsx:37`) discloses context once reached — the user is not shown a false state, just not told the true one efficiently from the tab row.

**Smallest fix.** `role="tablist"` on the wrapper, `role="tab"` + `aria-selected={tab===t.id}` + `aria-controls` on each button, one tab stop with Arrow/Home/End moving selection (mirroring the pattern already shipped for the QMS tablist).

### A-C-3 — `RiskRow` is a non-native interactive `<div>` with no explicit accessible name (medium)

**What the code does.** `ProtocolDevRegisters.tsx:86–120`:
```tsx
function RiskRow({ r, open, onPick }: { r: Row; open: boolean; onPick: () => void }) {
  ...
  return (
    <div
      className={'pd-risk' + (open ? ' on' : '')}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); }
      }}
    >
      <div className="pd-risk-top">
        <span className="pd-risk-score" data-tone={cellTone(l, i)}>{l * i}</span>
        <span className="pd-risk-haz">{str(r.hazard)}</span><PG.StatusBadge status={str(r.status)} />
      </div>
      <div className="pd-risk-meta">...</div>
      {open && (<div className="pd-risk-mit"><b>Mitigation: </b>{str(r.mitigation) || 'Not recorded.'}...</div>)}
    </div>
  );
}
```
No nested interactive descendants exist inside it, so a real `<button>` would have worked here exactly as the sibling `RiskHeatMap` cell already does 30 lines above it (`ProtocolDevRegisters.tsx:66–76`, a real `<button aria-label="Likelihood…">`). There is no `aria-label`/`aria-labelledby`, so per the accessible-name computation the name is built from the entire visible subtree — the score, hazard, status word, category chip, "Inherent L×I", "→", residual text and, once `open`, the full mitigation paragraph and owner line — a long, shape-shifting name.

**Re-verification note.** The 2026-09-24 report cites this exact code (as `ProtocolDevRegisters.tsx:91-102`) as an example that "carr[ies] tabIndex, Enter/Space handling **and aria-label**." `git log f14f5510..7087f46e2 -- client/src/concept2cure/v2/surfaces/ProtocolDev*` shows only `ProtocolDevSoa.tsx` changed in this family since that head, so this is not a regression — the prior report's phrasing does not hold literally for this file today: there is no `aria-label` attribute here.

**Why it matters to a regulated user.** Functionally keyboard-operable (Tab, Enter/Space work) and not empty of a name, so not a blocker — but per the skill's explicit rule ("a `<div role="button">` where `<button>` belongs is a finding"), and the resulting name is impractical for a screen-reader user scanning a risk register.

**Smallest fix.** Replace the `<div role="button" tabIndex={0} onKeyDown={...}>` with a `<button type="button">` (drop the manual key handling, native semantics cover it), and add a concise `aria-label` (e.g. `` `Risk: ${r.hazard}, score ${l*i}` ``) independent of the expandable mitigation text.

### A-C-4 — "Reason for change" label text and `aria-label` disagree (medium)

**What the code does.** `ProtocolDevSection.tsx:207–217`:
```tsx
return (
  <label className="pde-reason">
    <span>Reason for change (governed) — required before the section can be saved</span>
    <textarea
      value={reason}
      onChange={(e) => onReason(e.target.value)}
      placeholder="Why this section is being changed — written to the audit trail with the save."
      aria-label="Reason for change, required before saving the section"
    />
  </label>
);
```
and `ProtocolDevSoa.tsx:261–268`:
```tsx
<label className="pd-soa-reason">
  <span>Reason for change (governed) — required before the grid can be edited</span>
  <input
    value={reason}
    onChange={(e) => setReason(e.target.value)}
    placeholder="Why the schedule is being changed — written to the audit trail with every cell"
    aria-label="Reason for change, required before editing the schedule of assessments"
  />
</label>
```
In both, `aria-label` wins for the accessible name over the wrapping `<label>`'s visible text, and in both the two strings differ (not a substring of each other): "…(governed) — required before the section can be saved" vs. "…, required before saving the section"; "…(governed) — required before the grid can be edited" vs. "…, required before editing the schedule of assessments."

**Why it matters to a regulated user.** WCAG 2.5.3 Label in Name (A): a voice-control user (Dragon, Voice Access, Voice Control) who reads the visible label and speaks it cannot reliably target the field, because speech-to-command matching is against the accessible name, not the visible text. Screen-reader users are unaffected (they get a clear name either way). This is a repeated pattern across two of the fifteen files, each on the field that gates every write in its pane — and it is the field this codebase's own convention (`C2CForm.tsx:216–223`, `aria-hidden` on the asterisk, matching visible+accessible names) exists specifically to get right elsewhere.

**Smallest fix.** Delete the redundant `aria-label` (the wrapping `<label>` already supplies an accessible name matching the visible text) or make the two strings identical.

### A-C-5 — Schedule-of-assessments grid cell is `<td role="checkbox">` (medium)

**What the code does.** `ProtocolDevSoa.tsx:198–213`:
```tsx
<td
  key={vid}
  className={'pd-soa-cell' + (on ? ' on' : '') + (editable ? '' : ' ro')}
  onClick={() => onToggle(aid, vid)}
  onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(aid, vid); } }}
  role="checkbox"
  aria-checked={on}
  aria-disabled={!editable}
  aria-busy={saving === aid + ':' + vid}
  tabIndex={editable ? 0 : -1}
  title={str(a.label) + ' · ' + str(v.label) + (editable ? '' : ' — enter a reason for change to edit')}
>
  {on ? <span className="pd-soa-x">{'✕'}</span> : null}
</td>
```
Overloading `role="checkbox"` onto the native `<td>` discards its native cell role and, with it, the row/column-header association a screen reader's table-navigation mode relies on (`<th>` "Assessment" and `<th>` visit headers, `ProtocolDevSoa.tsx:137,166,187`). There is no `aria-label`/`aria-labelledby`; the only name source is the `title` attribute, which is a valid *fallback* in the accessible-name computation but not the robust mechanism the skill directs to (`aria-label`) and is not universally reliable across AT/browser pairs — **I could not verify in a real screen reader whether `title` is actually surfaced as the name here.**

**Mitigation already present.** The `title` string concatenates both the assessment and visit label (`"12-lead ECG · Week 12"`), so *if* the fallback works, the identifying information that table-header association would otherwise supply is present anyway, redundantly, in the name itself.

**Why it matters to a regulated user.** This is the entire schedule-of-assessments authoring surface — a core, Part-11-relevant record. `aria-checked`/`aria-disabled`/`aria-busy` are correctly used (state is real), and read-only cells are correctly pulled from Tab order (`tabIndex={-1}` when `!editable`, matching disabled-control convention, not itself a defect). The risk is specifically for AT users who navigate the grid by table-structure commands rather than linear Tab.

**Smallest fix.** Add an explicit `aria-label` (e.g. the same string already built for `title`) so the name does not depend on fallback behaviour; consider `role="grid"`/`role="gridcell"` on the table/cell (WAI-ARIA APG Grid pattern) instead of `role="checkbox"` directly on a `<td>`, or nest a real `<input type="checkbox">` inside an un-overridden `<td>`.

### A-C-6 — Section-outline completion dot is colour-only for sighted users (medium)

**What the code does.** `ProtocolDevPanes.tsx:52–61`:
```tsx
<button key={str(s.id)} className={'pd-tree-row' + (activeSec === s.id ? ' on' : '')} onClick={() => onSec(s)}>
  <span className="pd-tree-dot" data-status={str(s.status)} aria-hidden="true" />
  <span className="sr-only">{str(s.status)}</span>
  <span className="pd-tree-num">{str(s.num)}</span>
  <span className="pd-tree-t">{str(s.title)}</span>
  {!s.required && <span className="pd-tree-opt">opt</span>}
</button>
```
`research-v2.css:130–133`:
```css
.pd-tree-dot{width:8px;height:8px;border-radius:50%;border:1.5px solid var(--bg-400);}
.pd-tree-dot[data-status="complete"]{background:var(--success);border-color:var(--success);}
.pd-tree-dot[data-status="draft"]{background:var(--warning);border-color:var(--warning);}
.pd-tree-dot[data-status="not_started"]{background:transparent;border-color:var(--bg-400);}
```
"complete" and "draft" are both filled 8px circles, differing only by hue; the file's own comment acknowledges the hazard ("Section completion was this dot's colour alone…") and adds `aria-hidden="true"` plus a `sr-only` status span — which fixes the screen-reader case but leaves the *visible* channel exactly colour-only, since `sr-only` text is not visible.

**Why it matters to a regulated user.** A colour-vision-deficient author browsing the outline to find unfinished sections cannot distinguish "complete" from "draft" rows without opening each one — WCAG 1.4.1 Use of Color. Not the design's only completion signal (opening the section shows the real status via `PG.StatusBadge`, `ProtocolDevSection.tsx:232`), so the outline itself is merely unreliable, not the only source of truth.

**Smallest fix.** Give the dot a shape/pattern difference in addition to colour (e.g. an outline-only ring for draft vs. solid for complete, or a small check glyph for complete as `MilestonesTab`'s `pd-tl-node` already does at `ProtocolDevPanes.tsx:126`), or add a visible (not `sr-only`) abbreviation.

### A-C-7 — "Low" per-visit total flagged by colour alone (medium)

**What the code does.** `ProtocolDevSoa.tsx:218–224`:
```tsx
<tfoot><tr>
  <th className="pd-soa-rh foot">Per-visit total</th>
  {visits.map((v) => {
    const total = visitTotal(str(v.id));
    return <td key={str(v.id)} className={'pd-soa-tot' + (total < 3 ? ' low' : '')}>{total}</td>;
  })}
</tr></tfoot>
```
`research-v2.css:208–210`:
```css
.pd-soa-rh.foot,.pd-soa-tot{background:var(--bg-050);font-weight:600;}
.pd-soa-tot{font-family:var(--font-mono);color:var(--text-300);}
.pd-soa-tot.low{color:var(--warning);}
```
Every `.pd-soa-tot` cell already has `font-weight:600`, so `.low` adds only a colour change — no icon, no suffix text, no symbol.

**Why it matters to a regulated user.** The raw number is still visible as text (so no information is hidden), but the *flag* — "this visit is under-scheduled" — is carried by colour alone, defeating the purpose of a scannable warning for a colour-vision-deficient reviewer, who would have to independently know and apply the "<3" rule to every cell themselves.

**Smallest fix.** Add a small icon or a textual marker (e.g. an asterisk with a footnote, or literal "low") beside the number when `total < 3`.

### A-C-8 — Visit-header rename/remove buttons are under the WCAG 2.2 target-size floor (medium)

**What the code does.** `ProtocolDevSoa.tsx:141–158`:
```tsx
<span className="pde-soa-vh">
  <button type="button" className="pde-rowbtn" aria-label={'Rename visit ' + label} title={'Rename visit ' + label}
    onClick={...}>
    <PG.Ic n="penLine" s={12} />
  </button>
  <button type="button" className="pde-rowbtn" aria-label={'Remove visit ' + label} title={'Remove visit ' + label}
    onClick={...}>
    <PG.Ic n="minus" s={12} />
  </button>
</span>
```
`protocol-dev-editing.css:103–104`:
```css
.pde-soa-vh{display:flex;justify-content:center;gap:1px;margin-top:5px;}
.pde-soa-vh .pde-rowbtn,.pde-soa-rh .pde-rowbtn{padding:2px 4px;line-height:0;}
```
With `line-height:0` set, the box model is fully deterministic (no font-metric ambiguity): content is a single fixed-size 12×12px icon (`ProtocolGov.tsx:52–63`), padding 2px/4px, border `1px solid transparent` (`protocol-dev-editing.css:54`). Computed target ≈ 22px wide × 18px tall — below the WCAG 2.2 SC 2.5.8 Target Size (Minimum) 24×24px floor — and the two buttons sit only `gap:1px` apart, so the SC's spacing exception (a 24px circle not overlapping an adjacent target) does not apply either. `SoaRowHead`'s single remove-assessment button (`ProtocolDevSoa.tsx:171–174`) uses the identical class combination; I did not verify its vertical spacing to the next row's equivalent button closely enough to say whether the spacing exception could apply there — flagging that one with lower confidence than the paired visit-header buttons.

**Why it matters to a regulated user.** New in WCAG 2.2, explicitly Level AA, and named in this lens's charge. Affects pointer/touch users with reduced dexterity or tremor on the schedule-of-assessments' only per-visit structural-edit controls; does not affect keyboard reachability (Tab still lands on them regardless of pixel size).

**Smallest fix.** Increase padding on `.pde-soa-vh .pde-rowbtn`/`.pde-soa-rh .pde-rowbtn` (or the icon size) so the box reaches 24×24px, or increase `gap` between the two so a 24px circle around each does not overlap the other.

### A-C-9 — Disabled "Record disposition" button's reason is title-only (low, advisory)

`ProtocolDevReviews.tsx:61–74`:
```tsx
<button
  type="button"
  className="pg-btn outline"
  aria-label={'Record disposition for ' + (name || 'this reviewer')}
  disabled={someoneElses}
  title={someoneElses ? 'Assigned to another user. Only they can sign this disposition.' : undefined}
  onClick={...}
>
  <PG.Ic n="penLine" s={14} />Record disposition
</button>
```
Same shape as the previously-confirmed A-0928-1 pattern (`docs/evidence/reviews/2026-09-28/a11y.md`) — a `disabled` button cannot take focus, so its `title` is unreachable by keyboard/screen reader. Rated **advisory, not medium**, because the row's own visible reviewer name (`ProtocolDevReviews.tsx:49`) is the assigned reviewer, so a screen-reader user reading the row linearly can reasonably infer why the button beside a name other than their own is disabled — an inference, not a stated reason, hence still worth fixing.

**Smallest fix.** Move the reason into a visible, always-rendered text node beside the button (as `ProtocolDevSection.tsx:280`'s `pde-sec-state` already does for a save button), or keep the button enabled and let the click produce a `role="alert"` refusal.

### A-C-10 — `BudgetTable` headers lack `scope="col"` (low, advisory)

`ProtocolDevRegisters.tsx:226–227`:
```tsx
<table className="pd-bg-table">
  <thead><tr><th>Category</th><th>Line item</th><th className="r">Per subject</th></tr></thead>
```
A single header row is usually still inferred correctly by AT without `scope`, but the skill names `<th scope>` explicitly as the "before reaching for ARIA" baseline. Low-severity robustness item.

**Smallest fix.** Add `scope="col"` to each `<th>`.

### A-C-11 — Bar visualisations with no `role="progressbar"` (low, advisory)

`ProtocolDevReviews.tsx:145–148` (consent-completeness meter) and `ProtocolDevRegisters.tsx:282–287` (budget category bars) both render a filled `<div>` sized by inline `style={{width: pct+'%'}}` with no `role="progressbar"`/`aria-valuenow`/`aria-valuemin`/`aria-valuemax`. In both cases the same value is also rendered as plain text immediately beside the bar (`pd-consent-pct`, `pd-cat-v`), so no information is actually hidden from AT — this is a robustness/best-practice gap, not a failure to convey the value.

**Smallest fix.** Add `role="progressbar"` with the three `aria-value*` attributes to the track element in each case.

### A-C-12 — Section save-readiness text is not a live region (low, advisory)

`ProtocolDevSection.tsx:247–252,280`:
```tsx
function saveState({ writable, hasChange, reasonOk }): string {
  if (!writable) return 'Read-only';
  if (!hasChange) return 'No unsaved changes';
  if (!reasonOk) return 'State a reason for change to save';
  return 'Ready to save';
}
...
<span className="pde-sec-state">{state}</span>
```
This text changes as the author types a reason (e.g. from "State a reason for change to save" to "Ready to save") with no `aria-live`, so a screen-reader user who has moved focus elsewhere will not hear the transition; they can still discover it by navigating back to the row, and the Save button's own enabled/disabled state is independently exposed.

**Smallest fix.** `aria-live="polite"` on the `pde-sec-state` span (WCAG 4.1.3 Status Messages).

## Earlier findings re-verified

Neither prior report records a numbered finding (A1/A2/A3 in `docs/evidence/reviews/2026-09-24/a11y.md`; A-0928-1/A-0928-2 in `docs/evidence/reviews/2026-09-28/a11y.md`) against any of the fifteen `ProtocolDev*` files — all five target `SubmissionCenter.tsx`, `AdminSurfaces.tsx`, `quality/App.tsx`, `filingTarget.tsx`, and `Vault.tsx` respectively. **There is nothing numbered to inherit as open, fixed, or regressed in this file set.**

The only ProtocolDev-family mention in either report is background, not a finding: the 2026-09-24 report's "Prior state the auditor recorded" section says clickable `role="button"` divs including `ProtocolDevRegisters.tsx:91-102` "carry `tabIndex`, Enter/Space handling and `aria-label`." I re-read that exact code at head (see **A-C-3** above): `tabIndex={0}` and Enter/Space handling are present; `aria-label` is not. `git log f14f5510..7087f46e2 -- client/src/concept2cure/v2/surfaces/ProtocolDev*` shows the only commit touching this family in that range is `2fb69da5`, which touched only `ProtocolDevSoa.tsx` — so this is not a regression, the code is byte-identical to what the 2026-09-24 auditor read; their summary sentence bundling three files together does not hold literally for this one. I cannot speak to whether it holds for the other two files named there (`ProjectHome.tsx`, `TaskBoard.tsx`), which are outside this pass's scope.

Both prior reports explicitly flag the gap this pass exists to close: 2026-09-24 — "`ProtocolDevDesign/Compliance/Projections/Reviews/Shared`… were grepped for the target patterns, not read line by line"; 2026-09-28 — "`ProtocolDev*` family beyond `ProtocolDevSoa.tsx`'s 9-line diff was not opened." I confirmed via `git log`/`git show` that the one change to this family since either head is `2fb69da5` (2026-09-25), which rewrote `ProtocolDevSoa.tsx:56–60` so a rejected write's 401 response reports a plain-language sentence instead of leaking the envelope's raw code or `HTTP 401` onto the screen (fixing an unrelated CI gate, `ci:error-envelope`, but relevant to this lens's forms rule: an error should say what happened, not emit a token). No other content in these fifteen files has changed since `f14f5510`/`aff7eae16`.

## What I did NOT get to

- **No browser or assistive-technology pass anywhere in this report.** Every finding is a static code read. In particular, not verified live: whether `title` actually supplies the accessible name for `ProtocolDevSoa.tsx:198–213`'s `role="checkbox"` `<td>` in real NVDA/JAWS/VoiceOver (A-C-5); whether `RiskRow`'s content-derived name (A-C-3) is announced usably rather than truncated; actual rendered focus-ring visibility and colour rendering; live-region announcement timing/interruption for the `role="status"`/`role="alert"` regions I found correctly marked up (there are many, and they read correctly from source, but I did not hear one announced).
- **`RichSectionEditor.tsx`** (~2,700 lines per the 2026-09-24 report), the actual rich-text editor `ProtocolDevSection.tsx:163–179` mounts for section bodies — not read this pass. Only its call-site contract (`format="text"`, `ariaLabel`, `readOnly`, `onSave`, `storageKey`) was checked. The charge's lens names "keyboard operability of the editor, its toolbars and menus" explicitly, and that surface is this component, not the fifteen files audited here.
- **`EsignModal.tsx`** — grepped only, for the specific markers (`role="dialog"`, `aria-modal`, Escape, a Tab-trap, focus-restore); not read line by line, so I cannot certify every branch of its focus management, only that the four load-bearing pieces exist at the lines cited above.
- **`IrbPackage.tsx`** and **`biostatBridge.tsx`** — imported and dispatched to by `ProtocolDevWorkspace.tsx:34,268,271,30` for the "IRB package" and "Statistics" tabs, but neither matches the `ProtocolDev*` glob in the charge, so neither was opened.
- **Server route bodies beyond the two signing routes** — I confirmed by grep that `/cells`, `/cells/clear` (`protocol-soa.ts`), `/risks/:id` PATCH (`protocol-risks.ts`), and the design-derivation GET/apply pair (`protocol-development.ts:307,328`) exist at the claimed paths, but did not open their handler bodies, so I cannot certify their error-envelope shape matches `{error:{code,message}}` the way I confirmed for `finalize` and `disposition` — if any of them answers differently, an alert toast for that specific refusal could show a less specific message than the ones I traced fully.
- **Contrast of specific tokens in specific components** (`--warning` on `.pd-soa-tot`, `--success`/`--warning` on `.pd-tree-dot`) beyond the passing `ci:token-contrast` gate's 67 declared pairs — I did not independently recompute these; the gate checks declared token pairs, not every component-specific application, and passing it does not certify my A-C-6/A-C-7 colour-alone findings are also contrast-compliant (a separate question I did not re-verify).
- **Motion, per the charge's division of labour** ("depth on motion belongs to the motion-auditor; just flag its absence"): the only feature-specific reduced-motion rule I found is `protocol-dev-editing.css:141–143`, `@media (prefers-reduced-motion: reduce){.c2c-v2 .pde-rowbtn{transition:none;}}`, which covers exactly one transition. I did not check whether `.pd-heat-cell:not(:disabled):hover{transform:scale(1.06);...}` (`research-v2.css:226`) or `.pd-tab`'s colour transition (`research-v2.css:117`) — both used throughout this family — have an equivalent reduced-motion carve-out; flagging the absence of a confirmed one, not asserting a violation.
- **Touch target sizing beyond A-C-8**: I checked the two clearest icon-only cases deterministically (fixed icon size, `line-height:0`); I did not exhaustively re-measure every other small control in the family (e.g., `PG.Citation`'s inline chip, `pd-tab` icons) against the 24×24px floor.
