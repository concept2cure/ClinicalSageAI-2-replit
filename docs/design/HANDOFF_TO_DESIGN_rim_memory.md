# Handoff to Design — RIM Memory (learned-patterns browser)

**Date:** 2026-06-29
**From:** AnA Intelligence Expansion · Claude Design cell (isolated worktree off `concept2cure-v2`)
**Lane:** E — RIM activation (Pillar P3 · Grounded-trust fabric · strategic moat)
**Master plan:** `ANA_INTELLIGENCE_EXPANSION_MASTER_PLAN_2026-06-29.md` §2.5, §4 Lane E
**Status:** `rim-interceptors.ts` scaffolded; pattern persistence/learning being made real. **No UI built.**
**Companions:** `README.md` (§"The product" — RIM is the proprietary non-LLM judgment layer), `shared/ui-contracts/ana-renderers.ts`, `docs/ANA_SURFACE_MAP.md`

---

## 0. How to read this document

Reviewer-grade design brief. Standard flow + four gates. No new tokens. Governed components only.

---

## 1. Why this exists

The **Regulatory Intelligence Model (RIM)** is the platform's stated moat: a proprietary, non-LLM layer that "accumulates regulatory judgment over time" (`README.md` §"The product"). Activated, it persists **learned patterns** — cross-program judgments, registration-grid and labeling intelligence — that AnA grounds answers on. A moat the user cannot see is not a moat. This brief specifies the **learned-patterns browser**: where a reviewer inspects what RIM has learned, how confident it is, how often it has held, and its pedigree.

The one-line promise: *"See the regulatory judgments the platform has learned — each with its confidence, how many times it has held, and where it came from — so you can trust why AnA answered the way it did."*

---

## 2. Where it lives (layoutMode / surface / panes)

- **Surface:** a quick-tool from `intelligence` and `regulatory-workspace`; also surfaced inline when a RIM pattern grounds an AnA answer (the "why" behind a recommendation links into this browser). Not a new top-level module.
- **Panes (System-Aware Artifact Architecture):**
  - **Intelligence (35%):** AnA — "what have you learned about EU device labeling?" — narrates and links to patterns.
  - **Artifact (65%):** the **patterns browser** — a filterable list of learned patterns, each expandable to occurrences and pedigree.
  - **Tree (240px):** pattern domains (Pathway · Designations · Labeling · Registration grid · Safety · Submission format) as filters.

---

## 3. Governed components used

- **RankedCards** (`RankedCardsProps`, `ana-renderers.ts:103`) — patterns presented best-first by confidence; each card's `factors`/`strengths`/`concerns` carry the evidence behind a pattern.
- **List / Table** (`ListProps`, `ana-renderers.ts:150`) — the occurrences ledger (where the pattern has held).
- **MetricCard** — per-pattern stats (confidence · occurrences · first seen · last reinforced).
- **Badge / WorkspaceStatusBadge** — confidence band and pedigree pills.
- **Input / Select** — filter/search across patterns.
- **Tooltip**, **NavigationChip** (jump to a source program/document), **DataStateWrapper / LoadingState / ErrorState**.

---

## 4. The pattern card

Each learned pattern is a RankedCard showing:

- **Statement** — the judgment in plain regulatory language ("FDA accepts a literature-based bridging rationale for this device class when a predicate shares the same intended use").
- **Confidence** — a 0–100 score with a band word ("established" ≥80 / "emerging" 50–79 / "tentative" <50). Confidence is **paired with a word**, never color-only.
- **Occurrences** — "Held in 14 of 15 programs" (the count is the trust signal; numbers over adjectives, `README.md` §Content).
- **Domain** — the pattern domain (matches the tree filter).
- **First seen / last reinforced** — dates, so a reviewer sees recency.
- **Pedigree** — RIM patterns are **not** model-assisted narrative; they are accumulated judgment. The pedigree badge reads "RIM-learned" (distinct from `deterministic_registry` and `external_api_live`, per `HANDOFF_TO_DESIGN_global_ri.md` §6). The single counter-example (the 1 of 15) is shown, not hidden.

Confidence color uses the earthy scale (olive established / amber emerging / stone tentative) — never neon, never a saturated "AI" gradient.

---

## 5. Region-by-region (artifact pane)

### 5.1 Filter / search (top)
- Search by statement text; filter by domain (tree), confidence band, and recency. A result count line ("38 learned patterns · 12 established").

### 5.2 Patterns list (RankedCards)
- Ordered by confidence (or a user-chosen sort: recency, occurrences). Each card collapsible; the recommended/highest-confidence is visually first, not color-shouted.

### 5.3 Occurrences ledger (expanded, List/Table)
- Per pattern: a ledger of programs/documents where it held or was reinforced — program · outcome (held / counter-example) · date · NavigationChip to the source. Counter-examples are flagged amber and shown inline — the moat is honest or it is worthless.

### 5.4 Pedigree panel
- How the pattern was derived (which programs/judgments fed it), the engine version, and `last_reinforced`. This is the audit view of a learned pattern.

---

## 6. Microcopy (per `microcopy-tone`)

- Pattern statement: stated as a regulatory fact, not a claim ("FDA accepts…"), with confidence attached.
- Confidence: "Established · held in 14 of 15 programs."
- Counter-example: "1 counter-example: Program K-2412 required a separate bridging study."
- Recency: "Last reinforced 2026-05-30."
- Empty (nothing learned in a domain): "No patterns learned in labeling yet. Patterns appear as the model accumulates judgment across programs."
- Low confidence: "Tentative. Confirm against current guidance before relying on this."
- No emoji, no exclamation, no "AI magic" language.

---

## 7. Accessibility (`accessibility-enforcement`, WCAG 2.2 AA)

- **Confidence is not color-only:** band word ("established"/"emerging"/"tentative") + the occurrence count carry the meaning.
- **Focus order:** search/filters → result count → first pattern card → its expander → occurrences rows → pedigree → next card.
- **ARIA live:** filtering updates an `aria-live="polite"` result count; AnA's narration of a pattern streams into a polite region.
- **Cards** are expandable with `aria-expanded`; the occurrences ledger is a proper table.
- **Contrast:** small date/recency labels and pedigree pills use ≥ `--text-300`.

---

## 8. Motion (`motion-discipline`)

- 200ms ease-out; no spring/bounce.
- Filtering re-orders the list with a simple fade (no FLIP shuffle theatrics).
- Card expand: 200ms height/fade.
- **No confidence count-up animation** (reads as marketing); values render in place.
- `prefers-reduced-motion`: instant.

---

## 9. Part 11 / pedigree affordances (`regulatory-compliance-ux`)

- **RIM patterns are pedigree-tagged at the source:** every pattern surfaces "RIM-learned" + engine version + reinforcement history (`AnaResultEnvelope.provenance`, `ana-renderers.ts:52`). When a RIM pattern grounds an AnA answer elsewhere, that answer links back here so the user can audit the judgment.
- **Honesty:** confidence and counter-examples are always shown; a pattern is never presented as certain when it is emerging/tentative. The browser distinguishes RIM-learned judgment from deterministic-registry fact and live-API fact.
- **Read-mostly surface:** the browser is primarily inspection. If a reviewer can **override or retire** a pattern, that is a governed action (GovernedActionConfirm, reason-for-change, audit) and is recorded as a reinforcement event, not a silent deletion — RIM's history is immutable.

---

## 10. Definition of done

1. The patterns browser lists RIM-learned patterns best-first by confidence, filterable by domain/band/recency.
2. Each pattern shows statement, confidence band + score, occurrence count (with counter-examples shown), dates, and "RIM-learned" pedigree.
3. Expanding a pattern shows its occurrences ledger with click-through to sources, and a pedigree panel.
4. Any override/retire is governed and recorded; nothing is silently deleted.
5. All four gates clean; reduced-motion clean; no new tokens.

---

## 11. Design-system ambiguities for the principal

- **Pedigree taxonomy** — confirm "RIM-learned" as a fourth pedigree class alongside `deterministic_registry` / `external_api_live` / `model_assisted` (this brief and the regulatory-currency brief both assume it). Needs to be canonical so badges agree.
- **Confidence bands** — confirm the 80 / 50 thresholds and band labels ("established/emerging/tentative") or supply the engine's own band scheme.
- **Override capability** — is human override of a learned pattern in scope for v1, or is the browser strictly read-only? (Recommend read-only v1.)
