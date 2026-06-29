# Handoff to Design — Dossier Reconciliation (cross-module number reconciliation)

**Date:** 2026-06-29
**From:** AnA Intelligence Expansion · Claude Design cell (isolated worktree off `concept2cure-v2`)
**Lane:** B — Quick-win leverage (Pillars P2/P3)
**Master plan:** `ANA_INTELLIGENCE_EXPANSION_MASTER_PLAN_2026-06-29.md` §2.4, §4 Lane B
**Status:** `reconcile_dossier_numbers` (cross-module) settling over `data-lineage-service.ts`; per-doc checks exist. **No UI built.**
**Companions:** `README.md`, `shared/ui-contracts/ana-renderers.ts`, `docs/ANA_SURFACE_MAP.md`

---

## 0. How to read this document

Reviewer-grade design brief. Standard flow + four gates. No new tokens. Governed components only. Render against the existing `findings-list` / `result-card` contracts.

---

## 1. Why this exists

A submission dossier states the same number in many places — enrollment N, primary-endpoint result, AE counts, exposure totals — across CSR, Module 2 summaries, protocol, and SAP. If they disagree, a reviewer (or an inspector) finds it. `reconcile_dossier_numbers` walks the data lineage and reports every place a value is asserted, whether the assertions agree, and the consensus. This brief specifies the **reconciliation report surface**.

The one-line promise: *"See every place a number appears across the dossier, where they disagree, and which value the evidence supports — with a click-through to each source span."*

---

## 2. Where it lives (layoutMode / surface / panes)

- **Surface:** `review` / `review-readiness` (it is a readiness check), reachable as a quick-tool from `regulatory-workspace` and `submissions`. Result is a report, not a new module.
- **Panes (System-Aware Artifact Architecture):**
  - **Intelligence (35%):** AnA runs the reconcile, narrates the headline ("4 numbers conflict across 3 documents"), and answers follow-ups.
  - **Artifact (65%):** the **reconciliation report** — the conflicts list, expandable to source spans and consensus.
  - **Tree (240px):** optional dossier outline so a conflict can scroll the user to the document/section it lives in.

---

## 3. Governed components used

- **FindingsList** (`FindingsListProps`, `ana-renderers.ts:86`) — the conflicts, each a `Finding` with `severity`, `message`, `location` (document/section/variable), `rule`. The header chip row shows `{ errors, warnings, pass }`.
- **ResultCard** (`ana-renderers.ts:70`) — the headline summary (numbers checked · conflicts · documents spanned · consensus reached).
- **Table** — per-conflict source-span detail (document · section · stated value · context snippet · pedigree).
- **Badge / WorkspaceStatusBadge** — severity and "consensus" / "no consensus" pills.
- **NavigationChip** (`ana-renderers.ts:208`) — "Go to source" jumps to the document/section.
- **ActionBar** — "Re-run reconciliation", "Export report".
- **DataStateWrapper / LoadingState / ErrorState**, **Tooltip**.

---

## 4. Severity model

Reconciliation severity maps onto the existing `Severity = 'error' | 'warning' | 'info'` (`ana-renderers.ts:57`) and the earthy palette:

| Severity | Meaning | Color (paired) | Icon | Word |
|---|---|---|---|---|
| **error** | Hard conflict — the same defined number stated with different values | red `#dc3545` | `AlertTriangle` | "Conflict" |
| **warning** | Soft conflict — values differ within a tolerance, or units/rounding differ | amber `#d97706` | `AlertCircle` | "Check" |
| **info** | Consistent — value agrees across all sources (shown when the user asks to see verified items) | olive `#788c5d` | `Check` | "Consistent" |

Errors render before warnings (`FindingsListProps` rule). Severity is icon + word + color, never color alone.

---

## 5. Region-by-region (artifact pane)

### 5.1 Headline (ResultCard)
- Metrics: "Numbers checked: 142 · Conflicts: 4 · Documents spanned: 3 · Consensus reached: 138 / 142." A factual status word ("Conflicts present" / "Consistent") not a celebration.

### 5.2 Conflicts list (FindingsList)
- One row per conflicting value: severity chip + a plain-language message ("Enrollment N stated as 248 and 250"), `location` (the canonical concept, e.g. "Enrollment / safety population"), and an expander.
- Ordered errors-first, then warnings; consistent items are collapsed behind a "Show 138 consistent values" toggle (default hidden — the report leads with what needs attention).

### 5.3 Source spans (Table, per expanded conflict)
- Each row: **document** · **section** · **stated value** · **context snippet** (the sentence the value appears in) · **pedigree** (how the value was extracted — lineage node + confidence). A "Go to source" NavigationChip per row.
- The snippet is the load-bearing evidence — it shows the reviewer the exact text, so the conflict is verifiable, not asserted.

### 5.4 Consensus
- Per conflict, the report shows the **consensus value** (the value the lineage/evidence supports) and how it was determined ("Consensus: 248 — matches the SAP-defined safety population and 2 of 3 sources"). When no consensus can be drawn, it says so plainly ("No consensus — sources define the population differently") and does **not** guess.
- Consensus is advisory, not an auto-fix: the surface never silently rewrites a document. Resolving is a human, governed action (§8).

---

## 6. Microcopy (per `microcopy-tone`)

- Headline: "4 numbers conflict across 3 documents."
- Conflict row: "Enrollment N stated as 248 (CSR §10.1) and 250 (Module 2.7.3)."
- Consensus: "Consensus: 248. Matches the SAP-defined safety population."
- No consensus: "No consensus. The sources define the population differently."
- All-consistent: "All 142 numbers are consistent across the dossier."
- Empty (nothing to check): "No numeric assertions found to reconcile in the selected documents."
- Export: "Export reconciliation report".
- No "All good!", no emoji, no exclamation.

---

## 7. Accessibility (`accessibility-enforcement`, WCAG 2.2 AA)

- **Color-never-alone:** every severity = icon + word + color.
- **Focus order:** headline → first conflict → its expander → source-span rows (each "Go to source" reachable) → next conflict → consistent-values toggle → export.
- **ARIA live:** the reconcile streams progress into `aria-live="polite"` ("Reconciling 142 values…"); the headline announces once on completion.
- **Expanders** use `aria-expanded`; the source-span Table is a proper table with header scope.
- **"Go to source"** moves focus to the target document/section, not just scroll, so keyboard users land where the value is.
- **Contrast:** context snippets (small text) and pedigree labels use ≥ `--text-300`.

---

## 8. Motion (`motion-discipline`)

- 200ms ease-out; no spring/bounce.
- Conflict rows fade in (no scale) as the reconcile completes; honor the artifact stagger (80ms) if streaming.
- Expander opens with a 200ms height/fade; source-span Table reveals beneath.
- `prefers-reduced-motion`: instant expand, no transitions.

---

## 9. Part 11 / pedigree affordances (`regulatory-compliance-ux`)

- **Every stated value carries pedigree:** the source-span row shows the lineage extraction node + confidence (`provenance` on the envelope, `ana-renderers.ts:52`) so a reviewer can trust the report itself. A "model-assisted extraction" value is badged distinctly from a "structured-field" value.
- **The report is auditable:** running a reconcile records when, by whom, over which document versions — so the report is reproducible against a point-in-time dossier state.
- **Resolution is a governed action:** if the surface offers "accept consensus into document X", that mutation uses **GovernedActionConfirm** (`ana-renderers.ts:245`) with reason-for-change, writes audit, and versions the document — never a silent overwrite. The reconcile report records that a conflict was resolved and how.
- **Honesty boundary:** no consensus is invented; "no consensus" is a first-class outcome.

---

## 10. Definition of done

1. `reconcile_dossier_numbers` renders a headline ResultCard + a FindingsList of conflicts, errors-first.
2. Each conflict expands to a source-span Table with document/section/value/snippet/pedigree and a working "Go to source".
3. Consensus (or explicit no-consensus) is shown per conflict; consistent values are collapsible.
4. Any resolution mutation is governed (reason-for-change + audit + version), never silent.
5. All four gates clean; reduced-motion clean; no new tokens.

---

## 11. Design-system ambiguities for the principal

- **Scope of a reconcile** — whole dossier vs selected documents vs a submission sequence. Confirm the default scope and whether the user picks the document set (affects whether a pre-run selection step / StructuredInputDrawer is needed).
- **Resolution affordance** — does v1 offer "accept consensus into the document" (a write), or is it read-only reporting with the fix done manually in the editor? (Recommend read-only v1; write-back is a later governed feature.)
- **Tolerance configuration** — soft-conflict tolerance (rounding/units) — is it fixed by the engine or user-set per run?
