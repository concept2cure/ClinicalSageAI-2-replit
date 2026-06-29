# Handoff to Design — EU / Global Data (EUDAMED · EPAR · CTIS search results)

**Date:** 2026-06-29
**From:** AnA Intelligence Expansion · Claude Design cell (isolated worktree off `concept2cure-v2`)
**Lane:** D — Live EU + global data (Pillars P1/P4)
**Master plan:** `ANA_INTELLIGENCE_EXPANSION_MASTER_PLAN_2026-06-29.md` §2.3, §4 Lane D
**Status:** EUDAMED · EMA EPAR (structured) · EU CTIS connectors settling, mirroring the US openFDA / ClinicalTrials.gov pattern in `server/services/connectors/`. **No UI built.**
**Companions:** `README.md`, `shared/ui-contracts/ana-renderers.ts`, `docs/ANA_SURFACE_MAP.md`

---

## 0. How to read this document

Reviewer-grade design brief. Standard flow + four gates. No new tokens. Governed components only. **Design principle: mirror the existing data-source result pattern.** The US connectors (openFDA, ClinicalTrials.gov, PubMed, ChEMBL, CMS) already render results in chat/intelligence; EU sources must look and behave the same, so a reviewer learns one pattern, not three. Do not invent a new EU-specific result layout.

---

## 1. Why this exists

US regulatory data is strong; EU/global is the parity gap (`master plan §2.3`). EUDAMED (4 modules mandatory 28 May 2026), EMA EPAR (structured), and EU CTIS (CTIS-only since Jan 2025) are the missing live sources. This brief specifies the **search-result surfaces** for these three, consistent with the established data-source results.

The one-line promise: *"Search EUDAMED, EPAR, and CTIS from AnA and get structured, citable, freshness-stamped results in the same shape as every other data source."*

---

## 2. Where it lives (layoutMode / surface / panes)

- **Surface:** global AnA chat (these are `scope: global` search tools, `docs/ANA_SURFACE_MAP.md`), and quick-tools inside topically-related surfaces — `devices_dx` / `mdx` (EUDAMED), `regulatory-workspace` and `intelligence` (EPAR), and the clinical/`review` surfaces (CTIS).
- **Panes (System-Aware Artifact Architecture):**
  - **Intelligence (35%):** the search interaction and the results list.
  - **Artifact (65%):** when a result is opened, its structured detail renders here (e.g. an EPAR summary the user can cite into a draft).

The results render inline in chat exactly as US sources do (per `docs/ANA_SURFACE_MAP.md` §"How a result reaches a surface"), then deepen into the artifact pane on open.

---

## 3. Governed components used

- **RankedCards** (`RankedCardsProps`, `ana-renderers.ts:103`) — result lists (the same renderer used for predicate/precedent results), or **List** (`ListProps`, `ana-renderers.ts:150`) for flat result rows.
- **ResultCard** (`ana-renderers.ts:70`) — the opened result's structured summary.
- **Table** — tabular result sets (e.g. CTIS trials, EUDAMED devices/certificates).
- **Badge / WorkspaceStatusBadge** — source pill ("EUDAMED" / "EPAR" / "CTIS"), status, freshness stamp.
- **StructuredInputDrawer** (`ana-renderers.ts:233`) — advanced query parameters when the tool needs them.
- **NavigationChip** — open the official record; **Tooltip**, **DataStateWrapper / LoadingState / ErrorState**, **ActionBar** ("Cite into draft", "Export").

---

## 4. The three sources — what each result row carries

All three reuse the **same card/row anatomy** (source pill · title · key identifiers · date · pedigree · open action). Only the fields differ:

### 4.1 EUDAMED (devices)
- Result kinds: device/UDI-DI records, certificates, manufacturers/actors (SRN), vigilance/notices.
- Row fields: device name · Basic UDI-DI · risk class · manufacturer (SRN) · status · last-updated date.
- Pill: "EUDAMED". Useful in `devices_dx` / `mdx`.

### 4.2 EMA EPAR (medicines)
- Result kinds: authorized-medicine EPAR records (structured).
- Row fields: product · active substance · ATC · authorization status · marketing-authorization holder · decision date.
- Opened detail (artifact): the structured EPAR summary (indication, conditions, assessment highlights) as a ResultCard / DocumentCanvas, citable into a draft.
- Pill: "EPAR".

### 4.3 EU CTIS (clinical trials)
- Result kinds: clinical-trial records (CTIS-only since Jan 2025).
- Row fields: EU trial number · title · sponsor · phase · status · member states concerned · decision date.
- Tabular result set uses Table; a single trial opens to a ResultCard.
- Pill: "CTIS".

---

## 5. Region-by-region (intelligence + artifact)

### 5.1 Query (intelligence)
- Natural-language ("EUDAMED certificates for class III cardiac devices") routed to the connector, or a StructuredInputDrawer for precise filters (source, identifier, date range, member state, class). Default source inferred from context; the user can switch source via a Select.

### 5.2 Results list (RankedCards / List / Table)
- Consistent row anatomy (§4). Each row carries a **source pill** and a **freshness stamp** ("Retrieved 2026-06-29 · EUDAMED"). Result count line and "No results" empty state. Pagination follows the existing data-source pattern.

### 5.3 Opened result (artifact)
- The structured detail in the artifact pane, with a "Cite into draft" action that inserts a properly attributed citation (source · identifier · retrieved date) — the same citation affordance regulatory drafts already use.

---

## 6. Microcopy (per `microcopy-tone`)

- Result count: "12 EUDAMED records · retrieved 2026-06-29 14:02 UTC."
- Freshness: "Retrieved 4 minutes ago" / "Retrieved 2026-06-29".
- Empty: "No EPAR records match that query. Try the active substance or the product name."
- Source unreachable: "EUDAMED is unreachable right now. No results were retrieved." (never present a cached result as live without stamping it).
- Cite action confirm: "Cited EPAR record into the draft." (factual).
- No emoji, no exclamation, no "Found it!".

---

## 7. Accessibility (`accessibility-enforcement`, WCAG 2.2 AA)

- **Source pills** are not color-only: pill text ("EUDAMED"/"EPAR"/"CTIS") carries identity; status pairs icon + word.
- **Focus order:** query → source select → results count → first result row → open → cite. Result rows are reachable in list order.
- **ARIA live:** results stream into `aria-live="polite"` ("Retrieving EUDAMED records…", then the count); the opened detail announces once.
- **Tables** (CTIS/EUDAMED) use proper headers + scope; rows are keyboard-navigable; "Open" and "Cite" are real buttons.
- **Contrast:** freshness stamps and identifier mono text (`JetBrains Mono`) use ≥ `--text-300` at small sizes.

---

## 8. Motion (`motion-discipline`)

- 200ms ease-out; no spring/bounce.
- Result rows fade + 4–8px slide-up on arrival (the standard entrance); honor the artifact stagger when a detail streams in.
- Opening a result eases the detail into the artifact pane (200ms slide/fade), mirroring the document-pane open in `HANDOFF_TO_DESIGN_ana_document_studio.md` §6.1.
- `prefers-reduced-motion`: instant.

---

## 9. Part 11 / pedigree affordances (`regulatory-compliance-ux`)

- **Every result carries live-source pedigree:** `engine` = the external source name, `provenance.computedAt` = retrieval time, `deterministic: false` — surface the "verify before relying" badge (live external data) distinct from registry-grounded facts (`HANDOFF_TO_DESIGN_global_ri.md` §6, `ana-renderers.ts:42-52`). The freshness stamp is the visible pedigree.
- **Citations are attributed:** "Cite into draft" inserts source + identifier + retrieved-date so the draft's provenance trail is intact (artifact `data-prov` hook, `README.md`).
- **Truthful degradation:** when a source is unreachable, the surface says so and retrieves nothing rather than silently serving stale data. Any cached/last-known result is explicitly stamped as such.
- **Honesty boundary:** AnA presents EU data as retrieved external records, never as a transmission or filing capability it does not have (the platform's advise ≠ assemble ≠ transmit boundary).

---

## 10. Definition of done

1. EUDAMED, EPAR, and CTIS searches render results in the **same** card/row anatomy as the existing US data sources, each with a source pill and freshness stamp.
2. Opening a result renders its structured detail in the artifact pane with a working "Cite into draft" that attributes source + identifier + retrieved date.
3. Live-source pedigree ("verify before relying") is surfaced on every result; unreachable sources degrade truthfully.
4. Tables (CTIS/EUDAMED) and all actions are keyboard-accessible; results announce via ARIA live.
5. All four gates clean; reduced-motion clean; no new tokens.

---

## 11. Design-system ambiguities for the principal

- **Renderer choice per source** — confirm RankedCards vs List vs Table defaults per source (recommend Table for CTIS/EUDAMED tabular sets, RankedCards for relevance-ranked EPAR). Should agree with the existing US-source renderer choices for consistency.
- **Citation format** — confirm the EU citation string format (does the template service own it, or is it inline?) so "Cite into draft" matches the US-source citation style already in drafts.
- **Caching policy display** — when a source is briefly cached, what is the exact freshness-stamp wording and the staleness threshold past which a result is hidden rather than shown-with-stamp?
