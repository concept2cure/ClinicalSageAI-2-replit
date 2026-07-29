# Handoff to Design — HEOR / Market Access (budget-impact & cost-effectiveness)

**Date:** 2026-06-29
**From:** AnA Intelligence Expansion · Claude Design cell (isolated worktree off `concept2cure-v2`)
**Lane:** F — Segment depth · HEOR/payer for MDX (Pillar P4 · Cross-segment breadth)
**Master plan:** `ANA_INTELLIGENCE_EXPANSION_MASTER_PLAN_2026-06-29.md` §2.6, §4 Lane F
**Status:** Backend tools registered (`model_budget_impact`, `model_cost_effectiveness`, `model_markov_cohort`, `run_probabilistic_sensitivity`, `search_medicare_coverage`); nav target `market-access` resolves; **screen not built** (`docs/ANA_SURFACE_MAP.md` §"Gaps" #2).
**Companions:** `README.md`, `shared/ui-contracts/ana-renderers.ts`, `docs/ANA_SURFACE_MAP.md`

---

## 0. How to read this document

Reviewer-grade design brief, not implementation. Standard flow + the four gates (`accessibility-enforcement`, `motion-discipline`, `microcopy-tone`, `regulatory-compliance-ux`). No new tokens. Governed components only. The result renderers already exist as typed contracts in `shared/ui-contracts/ana-renderers.ts` — render against them, do not invent.

---

## 1. Why this exists

For MDX/IVD clients, HEOR is the revenue deliverable: a payer will not reimburse without a budget-impact (BIM) and cost-effectiveness (CEA) story. The four models are built and callable, but render only inline in chat today. This brief specifies the **Market Access surface** that turns four tool results into a payer-dossier-grade workspace.

The one-line promise: *"Model budget impact and cost-effectiveness, see the ICER plane and acceptability curve in the house palette, and frame it as a payer-dossier section — without leaving AnA."*

---

## 2. Where it lives (layoutMode / surface / panes)

- **Surface:** `market-access` (registered nav target; `navigate_to({ target: "market-access" })` resolves). Lives as a project surface, optionally a tab under `report-engine` / `intelligence` (`docs/ANA_SURFACE_MAP.md`).
- **Panes (System-Aware Artifact Architecture):**
  - **Tree (240px):** the dossier outline — Population & comparator · Budget impact · Cost-effectiveness · Sensitivity · Coverage evidence. Selecting a node scrolls the artifact.
  - **Intelligence (35%):** AnA chat — assemble inputs, run a model, explain a result.
  - **Artifact (65%):** the **payer-dossier section** — input summary, the four visualizations, narrative, export. This is the "live regulatory work product" pane and is where AMCP-dossier framing lives.

---

## 3. Governed components used

- **StructuredInputDrawer** (`ana-renderers.ts:233`) — model inputs (population size, uptake, unit costs, utilities, WTP threshold, discount rate, time horizon, transition matrix).
- **MetricCard / Card / ResultCard** (`ResultCardProps`, `ana-renderers.ts:70`) — headline figures (net budget impact, ICER, NMB, probability cost-effective).
- **The four charts** (`ana-renderers.ts:155`):
  - `chart:bars` → **BarsChartProps** — per-year budget impact (+ optional cumulative line).
  - `chart:icer-plane` → **IcerPlaneChartProps** — incremental cost vs effect, ICER, WTP line, optional PSA cloud.
  - `chart:ceac` → **CeacChartProps** — acceptability curve (probability cost-effective across WTP).
  - `chart:trace` → **CohortTraceChartProps** — Markov cohort state membership over cycles.
- **Table** — coverage evidence rows (from `search_medicare_coverage` / CMS NCD/LCD), and the input/assumptions table.
- **Tabs** — switch between the four model views without losing the input context.
- **ActionBar** — "Run model", "Add to dossier", "Export".
- **DataStateWrapper / LoadingState / ErrorState**, **Tooltip**.

---

## 4. Results visualization — earthy palette, no neon

Charts must read as a reviewer's report, not a dashboard. The chart palette is drawn **only** from the existing system colors (`README.md` §Color):

- **Series fills:** olive `#788c5d`, terracotta `#d97757` (sparingly — primary series only), amber `#d97706`, and stone steps `--text-300` / `--text-400` for secondary/reference series. No saturated blues/greens/purples. The AnA blue `#6a9bcc` is reserved for the assistant and must not appear in data marks.
- **Axes, gridlines, baselines:** barely-visible borders `#e8e6dc` / `#f4f3ee`. Gridlines are hairline, never bold.
- **Backgrounds:** charts render on `--background` cream `#faf9f5` / card `#ffffff`. **No black renderings** (`README.md` §"No black renderings"). No gradient fills, no glow, no drop-shadowed bars.
- **ICER plane quadrants:** label the four quadrants in stone text; the WTP threshold line is a hairline terracotta dashed line; the PSA cloud is low-opacity stone dots (olive where dominant). Dominance is stated in words, never by color alone.
- **CEAC / cumulative lines:** 1.5–2px stroke, olive or terracotta, matching the icon stroke weight of the system.
- **Data labels** are 10–11px stone, mono for numbers (`JetBrains Mono`), aligned to the 4px grid.

Every chart pairs its color encoding with a text legend and direct value labels so it survives grayscale print (payer dossiers are printed).

---

## 5. Region-by-region (artifact pane)

### 5.1 Population & comparator (top)
- A compact assumptions Table: intervention, comparator, population size, perspective (payer/societal), horizon, discount rate, currency/year. Every assumption is editable via the StructuredInputDrawer; changing one marks downstream results stale (see §8).

### 5.2 Budget impact (BarsChart)
- Per-year net budget impact bars (years 1–N) with an optional cumulative line. ResultCard above it: "Net budget impact, year 1–5: $X" + per-member-per-month figure if provided. CSV export of the underlying table (`table-csv` / `TableCsvProps`).

### 5.3 Cost-effectiveness (IcerPlane + ResultCard)
- IcerPlaneChart with the incremental cost/effect point, ICER value, and WTP line. ResultCard metrics: **ICER** ($/QALY), **NMB** (net monetary benefit at the stated WTP), incremental cost, incremental QALYs, dominance verdict in words.

### 5.4 Sensitivity (CEAC, optionally Markov trace)
- CeacChart (probability cost-effective across WTP) from `run_probabilistic_sensitivity`. If a `model_markov_cohort` was run, the CohortTrace tab shows state membership over cycles with total cost/QALY.

### 5.5 Coverage evidence
- Table of relevant CMS NCD/LCD coverage documents (`search_medicare_coverage`) — title, type (NCD/LCD/Article), contractor, effective date, link. Each row carries pedigree (external source + retrieved date).

### 5.6 Payer-dossier framing
- A "Add to dossier" action assembles the section into an AMCP-format-aware narrative (DocumentCanvas, `ana-renderers.ts:121`) — clinical value, economic value, budget impact, model assumptions, limitations. `missingSections` render as a prominent banner, never hidden (the honesty contract).

---

## 6. Microcopy (per `microcopy-tone`)

- Input drawer title: "Budget-impact inputs" / "Cost-effectiveness inputs".
- Run action: "Run model" → while running "Running model" (no spinner copy theatrics).
- Result headline: "ICER: $48,200 per QALY at a $50,000 threshold." Factual, no adjective.
- Dominance: "Intervention dominates comparator (lower cost, higher QALYs)." or "Dominated."
- Stale result: "Inputs changed since this was run. Re-run to update." (link to re-run).
- Empty: "No model has been run. Enter inputs to see budget impact and cost-effectiveness."
- Caveats (always rendered from `envelope.scopeCaveats`): "Model output, not a coverage determination. Assumptions are user-supplied."
- No "Great result!", no exclamation, no emoji.

---

## 7. Accessibility (`accessibility-enforcement`, WCAG 2.2 AA)

- **Charts are not color-only:** every series has a text legend and direct value labels; dominance and significance are stated in words. Provide a "View as table" toggle for each chart (the CSV/table is the accessible equivalent).
- **Focus order:** tree node → input drawer → run → result cards → charts (each chart focusable with an accessible summary) → export.
- **ARIA live:** model run streams status into `aria-live="polite"`; the headline result announces once on completion.
- **Chart summary:** each chart has an `aria-label` or visually-hidden summary sentence ("Budget impact rises from $1.2M in year 1 to $4.1M in year 5").
- **Contrast:** olive/amber/terracotta series and their labels meet AA against cream/white; 10px mono numbers use ≥ `--text-300`.
- **Keyboard:** tabs, drawer fields, and export are all keyboard-operable; no chart interaction is mouse-only.

---

## 8. Motion (`motion-discipline`)

- 200ms ease-out; no spring/bounce/overshoot.
- Charts draw in with a single 200ms fade — **no sequential bar-grow animation, no count-up numbers** (these read as marketing). Bars and lines appear in place.
- Tab switches cross-fade content 150ms.
- Stale-result banner slides in 200ms when an input changes.
- `prefers-reduced-motion`: charts paint instantly; no transitions.

---

## 9. Part 11 / pedigree affordances (`regulatory-compliance-ux`)

- **Pedigree on every figure:** each result envelope carries `engine` (e.g. `'seeded-monte-carlo'` for PSA, `'deterministic'` for BIM) and `provenance` (`engineVersion`, `computedAt`, `hash`, `deterministic`) — surface a "deterministic" vs "seeded simulation" badge so a reviewer knows what is reproducible (`ana-renderers.ts:42-52`). PSA results state the seed.
- **Assumptions are auditable:** the input set used for a given result is captured and shown in the assumptions Table; re-running with changed inputs creates a new versioned result, never an in-place overwrite.
- **"Add to dossier" is a governed action** (it produces a submittable-adjacent artifact): GovernedActionConfirm with reason-for-change; the dossier section records who assembled it and when.
- **Honesty boundary:** the surface never presents model output as a coverage determination; `scopeCaveats` are always rendered.

---

## 10. Definition of done

1. `market-access` surface renders the tree/intelligence/artifact split with the four model views.
2. Each model runs from a StructuredInputDrawer and renders its typed chart + ResultCard with pedigree.
3. Charts use only the earthy system palette, carry text legends + value labels, and offer a table view.
4. Coverage evidence (CMS) renders with source + date pedigree.
5. "Add to dossier" assembles an AMCP-framed section with visible missing-sections and reason-for-change.
6. All four gates clean; reduced-motion clean; no new tokens.

---

## 11. Design-system ambiguities for the principal

- **Chart library** — does the repo already standardize a charting primitive, or do we build SVG charts against the contract props? (Affects motion/a11y implementation; recommend lightweight in-house SVG to keep the palette and stroke discipline.)
- **Currency/locale** — payer dossiers are market-specific (USD vs EUR). Confirm whether the surface is US-first (CMS coverage) or multi-market in v1.
- **AMCP template ownership** — is the dossier narrative template provided by the template service, or authored here? (Mirrors the template question in `HANDOFF_TO_DESIGN_ana_document_studio.md` §10.)
