# Handoff to Design — Regulatory Currency (the "regulatory drift" experience)

**Date:** 2026-06-29
**From:** AnA Intelligence Expansion · Claude Design cell (isolated worktree off `concept2cure-v2`)
**Lane:** A — Regulatory Currency Engine (Pillar P1 · Always-current)
**Master plan:** `ANA_INTELLIGENCE_EXPANSION_MASTER_PLAN_2026-06-29.md` §4 Lane A
**Status:** Backend tool contracts settling. **No UI built.** This is the design contract.
**Companions:** `README.md` (design system), `HANDOFF_TO_DESIGN_ana_document_studio.md` (split-pane reference), `shared/ui-contracts/ana-renderers.ts` (renderer props), `docs/ANA_SURFACE_MAP.md`

---

## 0. How to read this document

This is a reviewer-grade **design brief**, not implementation. Build against it with the standard flow `design-brief → brief-to-tasks → frontend-design → design-review`, with `accessibility-enforcement`, `motion-discipline`, `microcopy-tone`, and `regulatory-compliance-ux` as gates throughout. **No new design tokens** — every value resolves to a token already in `colors_and_type.css` / `client/src/concept2cure/design/zen.css`. Governed components only (the 28 in `README.md` §"Governed components"); raw `<button>`/`<input>` are forbidden.

---

## 1. Why this exists

AnA's regulatory knowledge is static / embedded in code (`ich-guideline-corpus.ts`, `regulatory_data/guidance.json`). When a guidance moves, a draft authored against the old text becomes silently wrong — the LDT-rule vacatur (Mar 2025) / rescission (Sep 2025) is the canonical failure: an assistant still advising the phase-out is *wrong and harmful*. Lane A adds live ingestion + freshness stamping + a change-radar. This brief specifies the **three surfaces** that make currency visible to a reviewer:

1. A **proactive currency briefing** AnA raises on the home/project surface.
2. **Per-document drift chips** — "guidance changed since this section was drafted."
3. A **currency lookup → result surface** for "is this guidance current, and what changed?"

The one-line promise: *"You see the moment a guidance moves, on the exact paragraph it touches, with the date it was last verified — before it reaches a reviewer."*

---

## 2. Where it lives (layoutMode / surface / panes)

This is **not a new module**. Drift is an attribute of the work, so it renders inside the **System-Aware Artifact Architecture** (`README.md` §"System-Aware Artifact Architecture": tree 240px · intelligence 35% · artifact 65%) across existing surfaces.

| Surface | layoutMode | Pane | What renders |
|---|---|---|---|
| Proactive briefing | `project-home`, `regulatory-workspace` | Intelligence (35%) + home `EmptyState` intel card | Currency briefing as an AnA proactive turn |
| Drift chips | `regulatory-workspace`, `editor`, `documents`, `section-workspace` | **Artifact (65%)** — per-paragraph | Inline drift chip on affected sections |
| Currency lookup / result | global AnA chat; quick-tool in `regulatory-workspace` | Intelligence (35%) | `result-card` + `findings-list` envelope |

The briefing reuses the home-surface intel card pattern already built in `client/src/concept2cure/components/ana/EmptyState.tsx` (`projectIntelligence` → `intelStats` / `intelNext`). Drift uses the artifact pane's existing `data-prov` per-paragraph hook (`README.md`: "Provenance on hover").

---

## 3. Governed components used

- **ConversationBubble** — the proactive briefing is an assistant turn (AI persona blue `#6a9bcc`).
- **Badge / WorkspaceStatusBadge** — severity drift chips; the freshness pill ("Verified 4 days ago").
- **Card / MetricCard** — the currency result (`ResultCardProps`, `shared/ui-contracts/ana-renderers.ts:70`).
- **Alert** — the highest-severity **void-rule** banner ("This guidance was vacated").
- **Table** — change-detail rows (clause → old → new → effective date).
- **Tooltip** — provenance + `last_verified` reveal on hover.
- **DataStateWrapper / LoadingState / ErrorState** — lookup states.
- **ActionBar** — "Open affected sections", "Mark reviewed" (governed; see §8).

Result renderers map to existing contracts: `result-card → ResultCardProps`, `findings-list → FindingsListProps` (`severity: 'error'|'warning'|'info'`, `ana-renderers.ts:57,86`). Do **not** invent renderers.

---

## 4. Severity model and styling (void-rule is highest)

Drift maps onto the existing earthy status palette — **never neon**. Four levels, highest first:

| Severity | Meaning | Color token (paired, never color-alone) | Icon (Lucide) | Status word |
|---|---|---|---|---|
| **void-rule** | Guidance vacated / rescinded / superseded; advice on it is unsafe | error red `#dc3545` (`--destructive`) | `Ban` | "Vacated" / "Rescinded" |
| **material** | Substantive change to a clause the draft relies on | warning amber `#d97706` | `AlertTriangle` | "Changed" |
| **minor** | Editorial / non-substantive update | stone `--text-300` | `History` | "Updated" |
| **current** | Verified unchanged within window | olive `#788c5d` | `Check` | "Current" |

- **void-rule** is the only drift level that escalates to a full-width **Alert** at the top of the artifact pane, not just a chip. It states the fact and the date, and links to the affected sections. It never auto-resolves.
- Severity is always **icon + word + color**, never color alone (`accessibility-enforcement` color-never-alone).
- Pedigree on the underlying assertion still applies: a void-rule fact carries `engine: 'external_api_live'` and a `last_verified` stamp; render the "registry-grounded vs verify-before-relying" badge per `HANDOFF_TO_DESIGN_global_ri.md` §6 and `AnaResultEnvelope.provenance` (`ana-renderers.ts:52`).

---

## 5. Region-by-region

### 5.1 Proactive currency briefing (Intelligence pane / home intel card)
- **Anatomy:** a quiet assistant turn led by the AnA blue avatar: one factual headline ("3 guidances affecting this project changed in the last 30 days"), a 1–3 row list (guidance · severity chip · effective date), and a primary `NavigationChipProps` action "Review affected sections" (`ana-renderers.ts:208`).
- **Home variant:** reuse `EmptyState` `intelNext` slot — "Next: review 2 drifted sections" — no new layout.
- **States:** all current (briefing suppressed — never show an empty "all good" banner; silence is the signal); has-drift (shown, ordered void-rule first); loading (skeleton line in intel card).
- **Microcopy:** "ICH E6(R3) reached Step 4 on 2025-01-16. Two sections cite the prior text." Never "Heads up!" or "Action needed!".

### 5.2 Per-document drift chip (Artifact pane, per paragraph)
- **Anatomy:** a small inline chip anchored to the right gutter of an affected paragraph (it rides the existing `data-prov` hook). Chip = severity icon + status word ("Changed") + a 10px `last_verified` micro-label.
- **Interaction:** hover reveals a Tooltip ("Guidance changed since this section was drafted — ICH E6(R3) §1.2, effective 2025-01-16. Drafted against the 2016 R2 text."); click opens a side detail (Table of clause → old → new → effective) in the Intelligence pane, not a modal, so the artifact stays put.
- **Placement rule:** chips live in the artifact gutter so they never reflow the regulatory prose (artifact pane is sandboxed; `README.md` §"Sandboxed artifact pane").
- **States:** resting · hover · expanded-detail-open · reviewed (chip dims to `minor` styling after a reviewer acknowledges, but the fact is not deleted — immutable history).

### 5.3 Currency lookup / result (Intelligence pane)
- **Input:** the user asks AnA ("Is the FDA Q&A on accelerated approval still current?") or runs the `guidance_change_radar` tool via a **StructuredInputDrawer** (`ana-renderers.ts:233`) when parameters are needed (jurisdiction, doc id, since-date).
- **Result:** a **ResultCard** with metrics (Status · Last verified · Effective date · Source) over a `findings-list` of detected deltas. The card header carries the `engine`/`provenance` pedigree.
- **Scope caveats are mandatory:** render `envelope.scopeCaveats` verbatim (`ana-renderers.ts:50`) — e.g. "Live source last reached 2026-06-29 14:02 UTC; not a substitute for the official register." This is the honesty contract.

---

## 6. Microcopy (per `microcopy-tone`)

- Briefing headline: "3 guidances affecting this project changed in the last 30 days."
- Drift chip tooltip: "Guidance changed since this section was drafted."
- Void-rule Alert: "This guidance was vacated on 2025-03-31. Advice that relies on it is no longer valid."
- Freshness pill: "Verified 4 days ago" / "Verified 2026-06-25".
- Lookup empty (no match): "No guidance found for that identifier. Check the document number or jurisdiction."
- Lookup degraded: "Live source unreachable. Showing last verified copy from 2026-06-12." (never silently present stale as fresh).
- Acknowledge action: "Mark reviewed" → confirms, does not celebrate. No "Done!", no exclamation, no emoji.

---

## 7. Accessibility (`accessibility-enforcement`, WCAG 2.2 AA)

- **Color-never-alone:** every severity pairs color + Lucide icon + status word (§4).
- **Focus order:** briefing → its primary action → first drift chip in document order → lookup result. Drift chips are reachable in reading order, not visually-anchored-only.
- **ARIA live for streaming:** the lookup result streams into an `aria-live="polite"` region; the proactive briefing announces once via `role="status"` (not `assertive` — it is informational, not an interruption). The void-rule Alert uses `role="alert"` (assertive) — it is the one case that warrants interruption.
- **Drift chip** is a button with `aria-expanded` and an accessible name that includes severity + guidance id (not just an icon).
- **Contrast:** the 10px `last_verified` micro-label uses ≥ `--text-300` on its background to pass AA at small size (per `HANDOFF_TO_DESIGN_ana_document_studio.md` §8).
- **Keyboard:** detail panel opens and closes with Enter/Escape; focus moves into it on open, returns to the chip on close.

---

## 8. Motion (`motion-discipline`)

- **200ms ease-out** default; no spring, bounce, or overshoot.
- Briefing enters fade + 4–8px slide-up, 200ms. Drift chips fade in (no scale) as the artifact paragraphs settle; respect the artifact pane's 80ms token-level stagger (`README.md`) — chips append on the same stagger, not their own animation.
- Detail panel: 200ms slide from the right in the Intelligence column.
- void-rule Alert: instant on first paint (do not animate an urgent compliance signal in); subsequent re-renders honor reduced-motion.
- `prefers-reduced-motion`: all of the above collapse to 1ms / no transform.

---

## 9. Part 11 / pedigree affordances (`regulatory-compliance-ux`)

- **"Mark reviewed" is a governed action.** It uses **GovernedActionConfirmProps** (`ana-renderers.ts:245`) with `reasonRequired: true` (reason-for-change captured) and `signatureRequired: false` (acknowledgement, not a sign-off). It writes an audit row; it never deletes the drift fact — the chip transitions to "reviewed", immutable history preserved.
- **Pedigree on every assertion:** the currency result and each drift fact surface `engine` + `provenance.deterministic` + `last_verified` (`ana-renderers.ts:52`). Live-API facts show the "verify before relying" badge; encoded dated facts (LDT vacatur, E6(R3), M11, PMDA v4.0, EUDAMED dates, CTIS-only) show "registry-grounded".
- **Truthful staleness:** when the live source is unreachable, the UI must say it is showing a last-verified copy and stamp the date. Never paint stale data as current.

---

## 10. Definition of done

1. A guidance change produces a proactive briefing on `project-home`/`regulatory-workspace` and a drift chip on each affected artifact paragraph.
2. void-rule changes additionally raise a top-of-artifact Alert with `role="alert"` and never auto-dismiss.
3. The currency lookup renders a `result-card` + `findings-list` with visible `last_verified`, pedigree, and `scopeCaveats`.
4. "Mark reviewed" captures reason-for-change, writes audit, and preserves the fact.
5. All severities pass color-never-alone; reduced-motion clean; no new tokens.
6. `design-review`, `accessibility-enforcement`, `regulatory-compliance-ux`, `motion-discipline`, `microcopy-tone` all clean.

---

## 11. Design-system ambiguities for the principal

- **Drift chip placement** — artifact right gutter (recommended, no reflow) vs an inline marginal mark. Confirm the gutter is acceptable on the 65% artifact width at the 1024–1279px breakpoint.
- **Acknowledgement scope** — does "Mark reviewed" clear the chip per-user or per-project? (Affects whether it is a reason-only action or a sign-off.)
- **Briefing cadence** — on every project open, or rate-limited to once per session per change? (Avoid briefing fatigue.)
