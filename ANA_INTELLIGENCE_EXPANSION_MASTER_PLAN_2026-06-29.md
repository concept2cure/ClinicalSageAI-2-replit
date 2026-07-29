# AnA Intelligence Expansion — Master Plan

**Owner:** Office of the Chief Intelligence Officer
**Date:** 2026-06-29
**Status:** Strategy ratified · execution lanes pending priority confirmation
**Mandate:** Make the platform — and especially **AnA** — a true subject-matter expert across every client segment, every service/feature, and every regulatory body we serve, and to surpass every competitor on the dimensions that matter.

---

## 0. How this plan was built

Five specialty intelligence subagents ran in parallel against (a) the live codebase and (b) the external 2026 regulatory + competitive landscape:

1. **AnA architecture map** — tool registry, gateway, memory, agentic loop, stranded engines.
2. **Regulatory-coverage map** — advisors, ICH/guidance corpora, submission pipelines, connectors, gap matrix by segment.
3. **Segment/persona/entitlement map** — 7 segments, 8 personas, tiers, RBAC, surface registry.
4. **2026 regulatory landscape** — FDA/ICH/EU/PMDA/NMPA/MHRA/HC/TGA + machine-readable standards, with a Top-15 capability list.
5. **Competitive landscape** — Veeva, Certara/Pinnacle 21, ArisGlobal/NavaX, Clarivate/Cortellis, Citeline, Yseop, Greenlight Guru, Harvey, plus white-space analysis.

This document is the synthesis and the program of record. Every claim below is traceable to a file path or a cited external source captured in the research transcripts.

---

## 1. Where we stand (the honest baseline)

AnA is **already one of the most complete regulatory authoring agents in existence** — this is not a greenfield build, it is a sharpening.

**Strengths (verified in code):**
- **279 registered tools / 252+ live handlers** across 14 domains (`server/services/ana/AnaToolDefinitions.ts`, `AnaToolExecutor.ts`).
- **Multi-provider AI gateway** (Anthropic-primary, OpenAI/Moonshot fallback), SSE streaming, bounded **agentic tool loop** with kernel planning/replanning (`server/services/ana/agentic-loop.ts`, `kernel-router.ts`).
- **3-layer pgvector memory** (working/client/project) + grounding, contradiction, gap detectors (`memory-context-assembler.ts`).
- **Determinism pedigree** on every output (`registry → query → live-API → model-assisted`) — our trust spine (`tool-pedigree.ts`).
- **Mature submission assembly**: FDA eSTAR (510(k)/De Novo), eCTD v3.2.2/v4.0, EU MDR/IVDR tech-doc + CER/PER, IND lifecycle, PMA mapping (`server/services/pathway-engines/*`, `ectd/*`, `ind-lifecycle/*`).
- **15 jurisdictions** + **full ICH Q/S/E/M index** encoded, **honest-by-construction** advisory layer (never claims transmission it can't perform).
- **7 segments / 8 personas / tiered entitlements / RBAC** already modeled (`shared/constants/ui-surface-registry.ts`, `entitlements/mdx-entitlements.ts`, `governance/permissions.ts`).

**The strategic reality (from the competitive scan):** the durable moats in this market are **proprietary regulatory data** (Cortellis/Citeline) and **unified GxP platforms** (Veeva/ArisGlobal) — *not the LLM*. Incumbents already ship agentic AI in production. Therefore our win is **not "more model"** — it is **grounded trust + agentic cross-segment breadth + Part-11-by-design**, in the one place none of them sit: a single assistant spanning pharma + biotech + device + IVD/MDX + CRO that **closes the regulatory-intelligence → authoring loop end-to-end**.

---

## 2. The gaps that matter (prioritized)

### 2.1 CRITICAL — Knowledge currency / staleness risk
AnA's regulatory knowledge is **static / embedded in code** (`ich-guideline-corpus.ts`, `regulatory_data/guidance.json`, `global-ri/*`). The 2026 landscape moved hard:
- **LDT final rule was VACATED (Mar 2025) and RESCINDED (Sep 2025)** — an assistant advising the old phase-out is *wrong and harmful*.
- **ICH E6(R3)** Step 4 (Jan 2025; Annex 2 Jun 2026), **M11 CeSHarP** structured protocol (EU effective Jun 2026), **PMDA eCTD v4.0 mandatory 1 Apr 2026**, **EUDAMED 4 modules mandatory 28 May 2026**, **CTIS-only since Jan 2025**, **EU AI Act** high-risk obligations from Aug 2026.

There is **no live ingestion + freshness-stamping + change-radar**. This is simultaneously our **biggest credibility risk** and the **#1 competitive white space** (rivals gesture at "intelligence agents"; none close the loop into the draft).

### 2.2 HIGH — Submission-grade data/standards services (genuinely absent)
- **MedDRA v29.0 / WHODrug (Mar 2026)** coding — required for every safety narrative, CSR AE table, PSUR/DSUR, **E2B(R3)** ICSR. Absent.
- **CDISC SDTM/ADaM + define.xml / Dataset-JSON** generation — validators exist; **generators do not**. This is the gap between "writes the CSR" and "ships the data package."
- **HL7 SPL** + **ISO IDMP/SPOR** labeling artifacts — absent.
- **PSUR/DSUR/RMP** generators, **cross-market variation-sequencing optimizer** — absent.

### 2.3 HIGH — Live EU + global data parity
US data is strong (openFDA, ClinicalTrials.gov, PubMed, ChEMBL, CMS). **EUDAMED, EMA EPAR (structured), EU CTIS feed** are missing; PMDA/NMPA are restricted web connectors only.

### 2.4 MEDIUM — Quick wins (leverage already in the building)
- **4 stranded stats engines** (`monte-carlo`, `assurance`, `event-projection`, `analytical-performance-extensions`) — built, untested as tools, **not exposed to AnA**.
- **Semantic working memory** — feature-complete, flag-gated off.
- **Dossier-wide numerical reconciliation** — per-doc checks exist; cross-module reconcile is partial.

### 2.5 MEDIUM — The RIM moat is dormant
The **Regulatory Intelligence Model** (the "proprietary non-LLM layer that accumulates judgment over time" — our stated moat) is **scaffolded but not operational** (`intelligence/rim-interceptors.ts` minimal; no pattern persistence/learning). This is the asset that, activated, becomes our answer to Cortellis/Citeline's data moat.

### 2.6 MEDIUM — Segment depth
- **CRO multi-sponsor**: typed end-to-end but **no sponsor switcher / tenant-scoped UI**.
- **Academic**: first-class tier, thinly modeled (no IIT/IRB surfaces).
- **IVD/MDX**: strong, but **companion-diagnostics (CDx) dual drug+device** depth and **HEOR/payer modeling** (the revenue deliverable) are light.
- **Two segment axes** (`IndustryMode` vs `CompanyType`) will drift — must pick one canonical.

---

## 3. The strategy: five pillars

| Pillar | Outcome | Beats |
|---|---|---|
| **P1 · Always-current** | Live guidance ingestion + freshness stamps + change-radar that propagates into drafts/gap-analyses | ArisGlobal Intelligence Agents, Cortellis AI Assistant |
| **P2 · Submission-grade data** | MedDRA/WHODrug coding, CDISC SDTM/ADaM/define.xml, SPL/IDMP, PSUR/DSUR/RMP | Certara/Pinnacle 21, Yseop |
| **P3 · Grounded-trust fabric** | Pedigree on *every* assertion, Part-11 audit/e-sig/reason-for-change on every governed action, RIM activated | Every bolt-on-compliance rival |
| **P4 · Cross-segment breadth** | One agent fluent across pharma+biotech+device+IVD/MDX+CRO; CRO multi-sponsor; CDx; HEOR | Siloed RIM ≠ eQMS ≠ PV vendors |
| **P5 · Vendor-neutral reach** | MCP/API bridges to Veeva, Argus, Lorenz, Greenlight rather than fighting lock-in | Incumbent lock-in |

**Non-negotiables carried into every lane:** reviewer-grade voice; sentence case, no emoji; governed component registry only; determinism pedigree surfaced; 21 CFR Part 11 audit on every mutation; WCAG 2.2 AA; honest-by-construction (advise ≠ assemble ≠ transmit).

---

## 4. Execution lanes

Each lane is independently shippable behind existing patterns (`AnaToolDefinitions.ts` + `AnaToolExecutor.ts` registration, per-tenant policy, Part-11 audit). Lanes map to the pillars.

### Lane A — Regulatory Currency Engine (P1) ★ recommended first
- Connector service that ingests + freshness-stamps live guidance (FDA guidance repository, EMA, MHRA, ICH, openFDA) with `last_verified` provenance.
- `guidance_change_radar` tool: detect deltas vs the embedded corpus; flag "guidance changed since this section was drafted."
- **Correctness backstop:** encode the LDT vacatur, E6(R3), M11, PMDA v4.0 mandate, EUDAMED dates, CTIS-only as first-class, dated facts.
- Surface: AnA proactive briefing + per-document "regulatory drift" chips.

### Lane B — Quick-win leverage (P2/P3, lowest effort) ★ recommended parallel
- Wire the **4 stranded stats engines** as deterministic tools (`run_monte_carlo`, `compute_assurance`, `project_events`, `assess_analytical_method_validation`).
- Ship **`reconcile_dossier_numbers`** (cross-module) over `data-lineage-service.ts`.
- Flip on **semantic working memory** behind a tenant flag with telemetry.

### Lane C — Submission-grade data services (P2)
- **MedDRA + WHODrug** coding service (license-gated) → `code_meddra` / `code_whodrug`; feed safety narratives, AE tables, E2B(R3).
- **CDISC** SDTM/ADaM + define.xml/Dataset-JSON generation + conformance (host on `validate-completeness-engine.ts`).
- **SPL/IDMP** generation/validation; **PSUR/DSUR/RMP** generators.

### Lane D — Live EU + global data (P1/P4)
- **EUDAMED, EMA EPAR (structured), EU CTIS** connectors mirroring the US openFDA/CT.gov pattern in `server/services/connectors/`.

### Lane E — RIM activation (P3, strategic moat)
- Make `rim-interceptors.ts` real: persist learned patterns, cross-program judgment, registration-grid + labeling intelligence; expose pedigree-tagged RIM outputs.

### Lane F — Segment depth (P4)
- CRO multi-sponsor switcher + tenant-scoped scoping + portfolio home.
- CDx dual drug+device pathway depth; **HEOR/payer (budget-impact, ICER, AMCP dossier)** for MDX.
- Academic IIT/IRB surfaces; collapse the two segment axes to one canonical.

### Lane G — UI (Claude Design, every lane)
Each lane's surfaces are designed via the in-repo designer skills (`design-brief` → `design-tokens` → `frontend-design` → `design-review`, with `accessibility-enforcement`, `motion-discipline`, `microcopy-tone`, `regulatory-compliance-ux`) against the governed component registry and the cream/terracotta/olive system.

---

## 5. Sequencing (recommended)

1. **Now:** Lane A (Currency Engine) + Lane B (quick wins) in parallel — closes the credibility/safety gap and banks visible value with low risk.
2. **Next:** Lane C (MedDRA/WHODrug, then CDISC) — unlocks submission-grade pharma/biotech data packages.
3. **Then:** Lane D (EU/global data) for geographic parity; Lane E (RIM) for the durable moat.
4. **Continuous:** Lane F segment depth, prioritized by actual client mix (HEOR/CDx first if MDX-heavy; MedDRA/CDISC/SPL first if pharma-heavy).
5. **Per lane:** Lane G design pass before merge.

Each lane runs as a specialty-subagent build cell: **research → design (Claude Design) → implement → adversarial verify → Part-11/a11y review → PR**.

---

## 6. Operating model (how the CIO runs this)

- **Specialty build cells**, one per lane, spawned as subagents with tight scope and structured returns.
- **Governance gates** every PR must pass: pedigree surfaced, Part-11 audit on mutations, WCAG 2.2 AA, governed components only, honesty boundary intact, tests green.
- **Definition of done per capability:** registered tool + executor handler + tenant policy + audit + pedigree + tests + designed surface + docs.
- **Branch:** `claude/platform-expertise-expansion-i2o3jo`; draft PR per lane.

---

## 7. Success metrics

- **Currency:** % of regulatory assertions carrying a `last_verified ≤ 30d` stamp; zero known-stale advisories (LDT-class errors → 0).
- **Submission-grade:** % of safety/CSR/CDISC artifacts produced without manual downstream coding/validation.
- **Trust:** % of AnA assertions with surfaced pedigree + citation; Part-11 audit coverage of governed actions = 100%.
- **Breadth:** segments with a complete, designed end-to-end pathway (target 7/7); CRO multi-sponsor live.
- **Competitive:** match-or-beat checklist (Pinnacle 21 CDISC parity, Yseop <7% re-authoring, LifeSphere 40–50% PV false-positive reduction, Cortellis-grade citation).

---

## 8. Open decisions for the principal

1. **First build lane(s)** — confirm A+B parallel, or reprioritize to your client mix.
2. **Client mix weighting** — pharma/biotech vs device/IVD-MDX vs CRO (drives C vs F ordering).
3. **Licensed data** — MedDRA / WHODrug / CDISC library licensing (gates Lane C depth).
4. **Canonical segment axis** — `IndustryMode` (recommended) vs `CompanyType`.
5. **Vendor-neutral scope** — which incumbent bridges (Veeva/Argus/Lorenz/Greenlight) to prioritize in Lane E/G.

---

*This plan is the program of record. Lanes are revised as research and shipping inform them. Nothing here claims a capability the platform cannot honestly produce.*
