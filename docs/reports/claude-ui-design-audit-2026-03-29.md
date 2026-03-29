# Claude UI Design Principles Audit

**Date:** 2026-03-29
**Auditor:** Claude Code (Opus 4.6)
**Scope:** UI additions in the current session across 3 files

**Files audited:**
1. `client/src/concept2cure/components/chat/AnaPersistentPanel.tsx`
2. `client/src/concept2cure/components/workflow/SubmissionReadiness.tsx`
3. `client/src/concept2cure/ZenApp.tsx` (no session-relevant UI changes found)

---

## UI Elements Audited

| ID | Element | File | Lines |
|----|---------|------|-------|
| E1 | Grounding mode badges (emerald/amber/blue/red) | AnaPersistentPanel.tsx | 4132-4162 |
| E2 | Enrichment failures indicator | AnaPersistentPanel.tsx | 4174-4180 |
| E3 | Memory atoms hover panel | AnaPersistentPanel.tsx | 4183-4221 |
| E4 | Next-step violet chip | AnaPersistentPanel.tsx | 4424-4443 |
| E5 | Grounding recovery chips (amber/red/stone) | AnaPersistentPanel.tsx | 4378-4422 |
| E6 | Executed commands receipt cards | AnaPersistentPanel.tsx | 4044-4065 |
| E7 | SubmissionReadiness: Fix Now button (violet) | SubmissionReadiness.tsx | 328-340 |
| E8 | SubmissionReadiness: Status strip (emerald/amber/red counts) | SubmissionReadiness.tsx | 240-253 |
| E9 | SubmissionReadiness: Refresh button | SubmissionReadiness.tsx | 257-265 |
| E10 | SubmissionReadiness: Title icon (violet Send) | SubmissionReadiness.tsx | 216 |

---

## PASS Items (with evidence)

### Principle 1: Calm Over Loud
- **E1 PASS** -- Grounding badges use muted semantic colors (`emerald-50`, `amber-50`, `blue-50`, `red-50`) with 50-weight backgrounds. Colors carry meaning (grounded=safe, inferred=attention, blocked=critical, actioned=interactive). Correct use per the palette.
- **E2 PASS** -- Enrichment failures use `text-amber-600`, appropriate for a warning/attention state.
- **E5 PASS** -- Recovery chips use `amber-50`, `red-50`, `stone-50` backgrounds with `/60` opacity borders. Muted and calm.
- **E6 PASS** -- Executed command cards use `emerald-50/60` for success and `red-50/60` for failure with `/60` opacity, keeping them muted.
- **E8 PASS** -- Status breakdown uses `text-[11px]` with semantic colors (`emerald-600`, `amber-600`, `red-600`, `stone-400`). Compact, factual.

### Principle 2: Typography Hierarchy
- **E1 PASS** -- `text-[10px] font-medium` for badges. Correct metadata size.
- **E2 PASS** -- `text-[10px]` for failure indicator. Correct.
- **E3 PASS** -- `text-[10px]` throughout the hover panel. Section label uses `text-[10px] font-medium uppercase tracking-wide`. Correct.
- **E4 PASS** -- `text-[11px] font-medium` for the chip. Within documented button-sm size.
- **E5 PASS** -- `text-[11px] font-medium` for recovery chips. Correct.
- **E6 PASS** -- `text-[12px]` for receipt cards. Within body text range.
- **E7 PASS** -- `text-xs font-medium` for Fix Now button. Correct.
- **E8 PASS** -- `text-[11px]` for count labels. Correct.
- **E9 PASS** -- Refresh button uses `text-sm font-medium`. Acceptable for a button.

### Principle 3: Progressive Disclosure
- **E1 PASS** -- Grounding badges only appear when `msg.grounding?.mode` exists. Not shown by default.
- **E2 PASS** -- Enrichment failures only shown when failures exist. Hidden when 0.
- **E3 PASS** -- Memory atom details are hidden behind `group-hover:block`. Excellent progressive disclosure -- summary count visible, detail on hover.
- **E4 PASS** -- Next-step chip only renders on the last assistant message AND only when `**Next step:**` text is detected. Context-appropriate.
- **E5 PASS** -- Recovery chips only appear when grounding mode is NOT `grounded`. Smart contextual display.
- **E6 PASS** -- Command receipts only shown when `executedCommands` array is non-empty.

### Principle 5: Animation (200ms ease-out)
- **E5 PASS** -- All recovery chips have `transition-colors`. Correct.
- **E4 PASS** -- Next-step chip has `transition-colors`. Correct.
- **E7 PASS** -- Fix Now button has `transition-colors`. Correct.
- **E9 PASS** -- Refresh button has `transition-colors`. Correct.

### Principle 6: Density Without Clutter
- **E1 PASS** -- `px-1.5 py-0.5` badge sizing. Matches documented badge dimensions.
- **E3 PASS** -- Hover panel uses `p-2`, `space-y-1`, `max-h-40 overflow-y-auto`. Compact.
- **E5 PASS** -- `px-2.5 py-1` chip sizing. Slightly above documented `px-2 py-1` for button-sm but reasonable for touch targets.
- **E6 PASS** -- `px-3 py-2` for receipt cards, `space-y-1` gap. Compact.
- **E8 PASS** -- `gap-3` between status counts. Within documented range.

### Principle 7: Inline Intelligence
- **E1 PASS** -- Grounding badges appear inline below each message. Intelligence surfaced where user is reading.
- **E2 PASS** -- Failure indicator inline with other message metadata.
- **E3 PASS** -- Memory context visible inline with hover detail. Not behind navigation.
- **E4 PASS** -- Next-step appears directly after the conversation message.
- **E5 PASS** -- Recovery actions appear contextually at the conversation point where they are relevant.

### Principle 8: Conversation-First
- **E1-E6 PASS** -- All elements are within the chat message rendering flow. They augment the conversation, not replace it.
- **E7-E9** -- SubmissionReadiness is a workspace tool view, not a dashboard replacement. Acceptable.

### Principle 9: Trust Through Restraint
- **E1 PASS** -- Uses factual labels: "Grounded", "Inferred", "Actioned", "Blocked". No emotional language.
- **E2 PASS** -- Factual: "2 sources unavailable". No alarm.
- **E4 PASS** -- Just shows the AI's recommendation as a clickable action. No celebration.
- **E6 PASS** -- Uses factual check/cross marks with action name and message. No celebration.
- **E8 PASS** -- Factual counts: "3 ready", "2 in progress". No emotional framing.

### Principle 10: No Chrome
- **E3 PASS** -- Hover panel uses `border-stone-200` (slightly visible, not heavy chrome). `shadow-lg` is noted as a concern (see WARNINGS).
- **E5 PASS** -- Chip borders at `/60` opacity. Barely visible.
- **E6 PASS** -- Receipt cards use `border-emerald-100` and `border-red-100`. Very subtle.

### Principle 11: Mobile as Overlay
- Not directly testable from code audit of these specific elements. All elements use flex-wrap and truncation which is responsive-friendly.

---

## FAIL Items

### FAIL 1: Unauthorized color -- violet (E4, E7, E10)
- **File:** `AnaPersistentPanel.tsx:4436`
- **Element:** Next-step chip uses `text-violet-700 bg-violet-50 hover:bg-violet-100 border-violet-200/60`
- **File:** `SubmissionReadiness.tsx:330`
- **Element:** Fix Now button uses `bg-violet-600 hover:bg-violet-700 text-white shadow-sm`
- **File:** `SubmissionReadiness.tsx:216`
- **Element:** Title icon uses `text-violet-500`
- **Principle violated:** #1 (Calm Over Loud) -- Color palette
- **Why:** `violet` is NOT in the approved semantic color palette. The palette defines: `stone` (neutrals), `emerald` (success), `amber` (warning), `red` (critical), `blue` (interactive/link). Violet is not listed. The Fix Now button additionally uses a solid `bg-violet-600` fill with `shadow-sm`, making it the loudest element on SubmissionReadiness -- it shouts.
- **Fix:** Use `blue-600` for interactive/action buttons (the palette's designated interactive color), or `stone-900` for primary actions (as already used for the Export Package button on the same page).

### FAIL 2: Unauthorized color -- violet in memory atom layer badges (E3)
- **File:** `AnaPersistentPanel.tsx:4202`
- **Element:** Project memory layer badge uses `text-violet-600 bg-violet-50`
- **Principle violated:** #1 (Calm Over Loud) -- Color palette
- **Why:** Same as FAIL 1. `violet` is not in the approved palette. Memory layer badges should use only approved semantic colors.
- **Fix:** Use `blue-600 bg-blue-50` for project memory (interactive/informational) or `stone-600 bg-stone-50`.

### FAIL 3: Missing `data-testid` on stateful elements (E1, E2, E3, E4, E5, E6)
- **File:** `AnaPersistentPanel.tsx:4132-4443`
- **Elements:** Grounding badge (line 4133), enrichment failure span (line 4175), memory atom hover panel (line 4184), next-step chip (line 4434), recovery chips (lines 4387-4420), executed command cards (line 4047)
- **Principle violated:** #12 (Accessibility as Default) -- "Every stateful element has `data-testid`"
- **Why:** None of these new UI elements have `data-testid` attributes. The only `data-testid` in the entire AnaPersistentPanel file is not on any of these elements.
- **Fix:** Add `data-testid` to each: `data-testid="grounding-badge"`, `data-testid="enrichment-failures"`, `data-testid="memory-atoms-panel"`, `data-testid="next-step-chip"`, `data-testid="grounding-recovery-chips"`, `data-testid="executed-command-receipt"`.

### FAIL 4: Missing `aria-label` on interactive recovery chip buttons (E5)
- **File:** `AnaPersistentPanel.tsx:4387-4420`
- **Elements:** "Select a project" button (4387), "Load project context" button (4395), "How to unblock" button (4406), "Improve answer" button (4415)
- **Principle violated:** #12 (Accessibility as Default) -- "Every interactive element needs `aria-label`"
- **Why:** These buttons have visible text labels but no `aria-label`. While visible text provides basic accessibility, the design principles explicitly require `aria-label` on all interactive elements. The buttons also lack `data-testid`.
- **Fix:** Add `aria-label` matching or extending the visible label, e.g., `aria-label="Select a project to ground the response"`.

### FAIL 5: Missing `aria-label` on next-step chip button (E4)
- **File:** `AnaPersistentPanel.tsx:4434`
- **Element:** Next-step button
- **Principle violated:** #12 (Accessibility as Default)
- **Why:** No `aria-label`. The dynamic text content is truncated to 80 chars in the visible span but there is no aria-label providing the full text.
- **Fix:** Add `aria-label={`Next step: ${nextStep}`}`.

### FAIL 6: Missing `aria-label` on Refresh button (E9)
- **File:** `SubmissionReadiness.tsx:257`
- **Element:** Refresh button has `title` but no `aria-label`
- **Principle violated:** #12 (Accessibility as Default)
- **Why:** `title` is not a substitute for `aria-label`. Screen readers may not announce `title`.
- **Fix:** Add `aria-label="Refresh readiness status"`.

### FAIL 7: Executed command receipt cards use color alone for success/failure (E6)
- **File:** `AnaPersistentPanel.tsx:4049-4054`
- **Element:** Command receipts differentiate success/failure by color (`emerald-50` vs `red-50`)
- **Principle violated:** #12 (Accessibility as Default) -- "Color never carries meaning alone -- always pair with icon or text"
- **Partially mitigated:** The check/cross marks (`✓`/`✗`) at line 4057 DO provide a non-color signal. However, for screen readers, these Unicode characters may not be announced clearly.
- **Fix:** Add `role="status"` and `aria-label={cmd.success ? 'Command succeeded' : 'Command failed'}` to each receipt card.

---

## WARNINGS

### WARNING 1: `shadow-lg` on memory atoms hover panel
- **File:** `AnaPersistentPanel.tsx:4192`
- **Element:** `shadow-lg` on hover panel
- **Principle:** #1 (Calm Over Loud) -- "no shadows deeper than `shadow-sm`"
- **Severity:** Minor. Hover panels need some elevation distinction. `shadow-lg` is heavier than allowed but functionally reasonable for a floating panel. Consider `shadow-md` or `shadow-sm`.

### WARNING 2: `animate-spin` on Refresh icon
- **File:** `SubmissionReadiness.tsx:263`
- **Element:** `RefreshCw` icon with `animate-spin` during refresh
- **Principle:** #5 (Animation: Purposeful and Brief) -- "no bounce, no spring, no overshoot"
- **Severity:** Minor. `animate-spin` is a continuous rotation, not a bounce. Acceptable for a refresh spinner on an icon-only inline indicator, but the principles prefer content-shaped loading. Since this is an inline action indicator (not a content area), it is borderline acceptable.

### WARNING 3: `shadow-sm` on Fix Now button
- **File:** `SubmissionReadiness.tsx:330`
- **Element:** `shadow-sm` on the Fix Now button
- **Principle:** #5 (Animation) -- Hover transitions should be `transition-colors` only, "no shadow changes"
- **Severity:** Minor. This is a static shadow, not a hover-transition shadow. The button does use `transition-colors` for hover. Static `shadow-sm` is within the allowed range.

### WARNING 4: Blue-700 for "actioned" grounding mode
- **File:** `AnaPersistentPanel.tsx:4141`
- **Element:** `text-blue-700 bg-blue-50` for actioned mode
- **Principle:** #1 -- `blue` is designated for "interactive/link"
- **Severity:** Low. "Actioned" implies an action was taken, which loosely maps to "interactive". Acceptable but could be more semantically precise.

### WARNING 5: Grounding badge visibility requires hover
- **File:** `AnaPersistentPanel.tsx:4094-4097`
- **Element:** The entire metadata row (containing grounding badge, enrichment failures, memory atoms) is in a `showActions` conditional with `opacity-0` / `opacity-100`
- **Principle:** #3 (Progressive Disclosure) -- This is actually good practice for progressive disclosure, but it means accessibility tools may not discover these elements easily when hidden.
- **Severity:** Low. Consider `sr-only` fallback or `aria-hidden` toggling.

---

## Implementation Checklist Results

| Check | Result | Notes |
|-------|--------|-------|
| Follows stone palette -- no unauthorized colors | **FAIL** | `violet` used in 4 locations (FAIL 1, 2) |
| Text hierarchy uses only documented sizes | **PASS** | All sizes within `text-[10px]` to `text-sm` range |
| Interactive elements have hover states with `transition-colors` | **PASS** | All buttons/chips include `transition-colors` with hover variants |
| Loading uses content-shaped skeletons | **PASS** | SubmissionReadiness uses `DataStateWrapper` (which provides skeletons) |
| Animations are 200ms ease-out | **PASS** | No custom durations found; `transition-colors` defaults are standard |
| Every icon-only button has `aria-label` | **FAIL** | Refresh button missing `aria-label` (FAIL 6) |
| Every stateful element has `data-testid` | **FAIL** | 6+ new stateful elements missing `data-testid` (FAIL 3). Only Fix Now button has one. |

---

## Summary

| Category | Count |
|----------|-------|
| **PASS** | 37 principle checks passed |
| **FAIL** | 7 violations found |
| **WARNING** | 5 items flagged |

**Critical failures:** The two most impactful are:
1. **Violet color usage** (FAIL 1, 2) -- 4 locations using an unauthorized color. This is a systematic palette violation.
2. **Missing `data-testid`** (FAIL 3) -- All 6 new AnaPersistentPanel UI elements lack test IDs.

**Positive notes:** Typography hierarchy is excellent throughout. Progressive disclosure is well-implemented (hover panels, conditional rendering). Conversation-first principle is respected -- all additions augment the chat flow. The SubmissionReadiness component properly uses `DataStateWrapper`, `WorkspaceHeader`, `WorkspaceCanvas`, `WorkspaceStatusStrip`, and `WorkspaceStatusBadge` from the governed component registry.
