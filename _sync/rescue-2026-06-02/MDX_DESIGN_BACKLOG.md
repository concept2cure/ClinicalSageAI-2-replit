# Handoff to Claude Design — MDX design backlog (post-Phase 3)

**From:** Claude Code (concept2cure-v2 implementation team)
**To:** Claude Design (`design-system/ui_kits/mdx/` owner)
**Status:** Draft. Phase 2 (MDX workstream) and Phase 3 (Projects) implementation contracts are met. The backend implements ~70–75% more capability than the kit currently surfaces, and several workflows that real MDX clients pay for have neither UI nor backend yet. This document hands the implementation team's findings back to design **organized around the MDX client base, not around the codebase.**

> **Naming note.** This document uses **Wave 1 / Wave 2 / …** for sequencing the MDX-specific surfaces below. Those labels are MDX-internal and **orthogonal** to the design-system's existing roadmap labels (Phase 1 Home, Phase 2 MDX, Phase 3 Projects, Phase 4 Artifact workbench, Phase 5 Auth, Phase 6 Admin per `design-system/CLAUDE.md`). Treat the waves below as additional MDX surfaces to be slotted into the design-system's roadmap, not as replacements for it.

---

## Context

We've shipped the chat-first home, the MDX workstream (Overview, K510, PMA, CER, CerWorkbench, Editors, Workbench, PreSub), and Projects (list + detail). Implementation has wired every kit button to a real backend or AnA prompt.

**The product mandate is universal coverage of the MDX client base.** This isn't a "pick a beachhead segment" problem — every segment in §1.1 is a customer, and every persona in §1.2 is a user. The sequencing question is therefore not *which segment to build for first*; it's *which surfaces serve the most segments at once*. That's how this report sequences post-Phase-3 MDX: by cross-segment density.

The segmentation, persona, pain, procurement, and competitive sections (§1–§5) exist to make sure each surface is designed against real clients across the whole base. The matrix in §4 shows which surfaces are tablestakes for which segments. The phase plan in §10 sequences by row-density in that matrix — universal-tablestakes first, near-universal next, segment-defining surfaces in parallel after that.

If you only read one thing, read §4 and §10.

---

## Section 1 — Who the MDX client actually is

### 1.1 — Six client segments

The "MDX client" is not one buyer. They split into six segments with sharply different pain, sharply different procurement criteria, and sharply different "killer demo" moments. A surface that's tablestakes for one segment is irrelevant for another.

| # | Segment | Profile | Typical annual volume | Lives-or-dies on |
|---|---|---|---|---|
| **A** | Class II 510(k)-only device shop | Orthopedic instruments, surgical tools, simple monitors. 5–50 employees. | 1–3 × 510(k); minor complaints/MDRs | Predicate selection, eSTAR conformance, post-market complaint clock |
| **B** | Class III PMA implantable shop | Cardiovascular, neuro, orthopedic implants. 50–500 employees. | 1 × PMA / 5–7 years; 2–4 × IDE / supplements; ongoing PAS | IDE trial integrity, FDA panel prep, post-approval studies, MDR clock |
| **C** | EU MDR / IVDR-only company | EU-domiciled medtech or US company with EU exposure. Many IVDs forced into IVDR. | 1–3 × CE-mark per device family; ongoing PSUR, PMCF, FSCA | NB scarcity, IVDR transition deadline, GSPR coverage, EUDAMED rollout |
| **D** | AI/ML SaMD vendor | Radiology AI, decision support, monitoring algorithms. Often startup-stage. | 1–2 × 510(k); continuous model retraining | PCCP, GMLP traceability, cyber premarket, drift monitoring |
| **E** | Diagnostics / IVD company | Lab-developed tests, kit IVDs, companion diagnostics. | 510(k) (Class II IVD) or PMA (Class III IVD) + CE-IVDR | Analytical & clinical performance studies, dual FDA + IVDR filing |
| **F** | Combination product (drug-device) | Drug-eluting stent, prefilled syringe, autoinjector. Often inside biotech/pharma. | NDA/BLA + 510(k)/PMA for the device constituent | Cross-CDER/CDRH coordination, primary-mode-of-action determination, DMF on device constituent |

A surface that ships to "MDX clients" without naming the segment it serves probably under-serves each one of these. **Every post-Phase-3 MDX ask in this report is tagged with the segments it's tablestakes for.**

### 1.2 — Buyer personas (cross-segment)

Inside each segment, six personas drive procurement and own day-to-day platform use. The kit's information architecture should make their job visible from the first navigation click.

| Persona | Segments | What they buy on | What kills the deal |
|---|---|---|---|
| **VP / Sr. Director Regulatory** | All | Submission strategy, agency relationships, cross-jurisdiction change-impact, time-to-filing | If the platform can't show "where are we against the submission timeline" in 5 seconds |
| **Head of QA** (often = Head of RA in small shops) | All | DHF/DMR completeness, CAPA aging, complaint clock, audit-readiness, training matrix | If they can't produce an inspector-ready DHF view from one click |
| **RA Manager / Submissions Lead** | All | eSTAR validity, ESG transmit reliability, RTA preflight, predicate dossier | If eSTAR validation fails downstream of the platform |
| **Clinical Affairs / Clinical Ops Lead** | B, E (and F when device drives) | IDE trial integrity, PMCF execution, RWE pipeline, registry sync | If trial-data integrity isn't auditable |
| **CISO / Software Lead** | D, plus any segment with software | SBOM, threat model, secure-development maturity, FDA cyber RTA | If SBOM regenerate isn't one-click |
| **Notified Body interface owner** | C, E (when CE-marked) | NB audit calendar, finding tracker, certificate management, EUDAMED records | If NB findings aren't traceable to corrective actions |

The kit today shows status pills and program cards aimed at the VP/RA persona. **The QA persona, the Clinical Ops persona, the CISO persona, and the NB interface persona have effectively no surface.** That's the structural gap.

---

## Section 2 — Quantified pain points the platform must remove

Every feature ask in this report ties back to one or more of these. They drive ROI conversations, not feature lists.

| # | Pain | Quantification | Source |
|---|---|---|---|
| 1 | 510(k) RTA failure on first submission | ~30% of 510(k)s receive an RTA hold on first pass; each cycle adds 60–90 days and ~$50k–$200k of rework | FDA RTA acceptance metrics, MDUFA reports |
| 2 | 510(k) median FDA review time | 177 days for traditional 510(k) (FY24); MDUFA goal is 90 days substantive review | FDA MDUFA V performance reports |
| 3 | FDA Q-Sub round-trips | 60–75 days to a Pre-Sub meeting; missing critical info costs 2–3 cycles (6+ months) | FDA Q-Submission Program guidance, Jan 2023 |
| 4 | IVDR transition cliff | ~85% of legacy CE-marked IVDs need fresh IVDR review by May 2027; NB capacity is the bottleneck | EU IVDR (Reg 2017/746); MDCG capacity reports |
| 5 | MDR transition (legacy devices) | Original May 2024 deadline extended to 2027/2028 contingent on NB submission and PMS plan; clients managing parallel MDD + MDR programs | MDR amending Reg 2023/607 |
| 6 | FDA cybersecurity RTA | Effective Mar 2023 — 510(k)s with deficient cyber section receive automatic RTA. SaMD vendors hit hardest. | FDA Refuse-to-Accept Cybersecurity Update, Mar 2023 |
| 7 | PCCP-without-PCCP cost | Without an FDA-cleared PCCP, every model retrain triggers a new 510(k) (~$50k–$300k each); with PCCP, modifications proceed without resubmission | FDA PCCP Guidance, finalized Dec 2024 |
| 8 | Field action / recall cost | Average device recall: $600k–$5M direct cost + brand damage; FDA expects correction notice within 10 business days of decision | 21 CFR 806; industry benchmarks |
| 9 | 483 / Warning Letter response window | 15 business days for 483 response, 15 calendar days for Warning Letter; consent decree risk if escalated | FDA inspection guidance |
| 10 | NB scarcity | Average 12–18 month wait for NB review under MDR; clients that miss the slot lose a year | MDCG reports, NB capacity surveys |

These are the financial and timeline events the platform must demonstrably move. Every post-Phase-3 MDX surface is justified against one or more.

---

## Section 3 — Procurement criteria and competitive displacement

### 3.1 — Procurement gating criteria (cross-segment)

These are the questions a buyer's procurement team asks before signing. If the answer is wrong, the deal dies regardless of feature richness.

1. **Implementation time** — under 90 days for the first program, under 30 for subsequent
2. **Coexist with current QMS/RIM** — no rip-and-replace; bidirectional sync with incumbent
3. **Inspector / NB audit readiness** — one-click investigator-grade view (Section 9.2.4 in this report)
4. **21 CFR Part 11 + GAMP 5 validation pack** — vendor-supplied IQ/OQ/PQ, audit trail review evidence, compliance certificate
5. **Pricing** — per-program, per-seat, or hybrid; predictable for a small shop
6. **Customer support SLA** — submission-cycle support (we won't recompete a submission deadline)
7. **Reference customers in segment** — segment-specific references; a Class III implantable shop won't trust a Class II reference

### 3.2 — Competitive landscape — coexist vs. compete

**Coexist with (clients won't rip):**
- **MasterControl** — QMS-of-record for many medtech, weak on submissions
- **Greenlight Guru** — DHF/eQMS for small-mid medtech, weak on submissions, FDA-only
- **Trackwise (Sparta)** — legacy enterprise CAPA/complaint
- **Veeva Vault QMS** — newer; coexists if client owns it
- **Arena PLM** — strong on DHF/DMR/ECO; coexists

**Compete with (head-to-head on submissions):**
- **Veeva Vault RIM Submissions** — strong incumbent, expensive, slow to implement, weak on MDR depth and AI
- **Rimsys** — MDR-strong, smaller footprint, growing, weak on FDA-side
- **CARA / Generis** — submission archive plays
- **In-house spreadsheet + SharePoint** — still the dominant "incumbent" for small shops

### 3.3 — What differentiates this platform

The five differentiators that, if shipped, beat all four head-to-head competitors. **Each is a post-Phase-3 MDX design ask.**

| # | Differentiator | Owners (persona) | Targets segments |
|---|---|---|---|
| 1 | **AI co-author grounded on the program** — drafts 510(k) §4–20, MEDDEV CER, PMS reports with paragraph-level citations to source artifacts. Not a generic LLM. | RA Manager, VP Reg | All |
| 2 | **Predicate / equivalence intelligence** — auto-pull 510(k) summaries, MAUDE, recalls; generate SE matrix with gap callouts | RA Manager | A, E |
| 3 | **Cross-jurisdiction change-impact engine** — single design change → filing matrix per market with cost/timeline | VP Regulatory | All except D-only |
| 4 | **PCCP-native AI/ML lifecycle** — model version, training-data card, drift threshold, predetermined modifications | CISO, ML Lead | D (segment-defining), partial for AI in B/E |
| 5 | **Inspector-mode read-only export** — one-click Part 11-compliant time-boxed view for FDA/NB | Head of QA, NB interface owner | All — closes Head of QA buyer |

---

## Section 4 — Pathway-specific feature priority

Mapping the design asks (full list in §6) against the six segments. **Bold = tablestakes for that segment**, plain = nice-to-have, dash = irrelevant.

| Surface (from §6) | A 510(k) | B PMA | C EU MDR | D SaMD | E IVD | F Combo |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Predicate Intelligence Workbench | **■** | ■ | – | ■ | **■** | ■ |
| GSPR coverage dashboard | – | – | **■** | – | **■** | – |
| PMS / PMCF document workbench | ■ | **■** | **■** | ■ | **■** | ■ |
| Approval + e-signature modal | **■** | **■** | **■** | **■** | **■** | **■** |
| Decision lineage visualizer | ■ | **■** | **■** | ■ | ■ | **■** |
| Compliance scan results panel | **■** | **■** | **■** | **■** | **■** | **■** |
| Citation search + sentence traceability | ■ | **■** | **■** | **■** | **■** | **■** |
| Confidence + provenance meter | ■ | **■** | ■ | **■** | **■** | ■ |
| RIM signal activity feed | ■ | ■ | ■ | **■** | ■ | ■ |
| Working memory + locked-facts viewer | ■ | ■ | ■ | **■** | ■ | ■ |
| Module 3 / eCTD build state explorer | – | – | – | – | – | **■** |
| Governance observability dashboard | ■ | ■ | ■ | ■ | ■ | ■ |
| Tamper-proof audit + chain badge | **■** | **■** | **■** | **■** | **■** | **■** |
| Knowledge graph navigator | – | ■ | ■ | ■ | ■ | ■ |
| Artifact version diff + ancestry | **■** | **■** | **■** | **■** | **■** | **■** |
| ISO 14971 risk workbench | **■** | **■** | **■** | **■** | **■** | **■** |
| CAPA + complaint + MDR triage | **■** | **■** | **■** | **■** | **■** | **■** |
| Cross-jurisdiction change-impact | ■ | **■** | **■** | ■ | **■** | **■** |
| UDI lifecycle (GUDID + EUDAMED) | **■** | **■** | **■** | ■ | **■** | ■ |
| IDE trial management | – | **■** | – | – | ■ | – |
| Inspector-mode read-only export | **■** | **■** | **■** | **■** | **■** | **■** |
| 513(g) / De Novo intake | ■ | – | – | **■** (novel SaMD) | ■ | – |
| Cybersecurity / SBOM / threat model | ■ | ■ | ■ | **■** | ■ | ■ |
| AI/ML PCCP authoring | – | ■ (if AI) | ■ (if AI) | **■** | ■ (if AI) | ■ (if AI) |
| Establishment Reg (FURLS) | **■** | **■** | – | **■** | **■** | **■** |
| NB interface + EUDAMED | – | – | **■** | – | **■** | – |

The bold-cell density across rows is the priority signal:

- **Universal tablestakes (every column bold):** approval/e-sig modal, compliance scan, tamper-proof audit, version diff, ISO 14971, CAPA/MDR, inspector-mode export.
- **High coverage (5+ segments tablestakes):** PMS workbench, citation traceability, change-impact engine, UDI.
- **Segment-defining (1–2 segments only, but mandatory there):** PCCP (D), IDE management (B), NB interface + EUDAMED (C, E), Module 3 / eCTD (F), GSPR (C, E).

This is what a segment-aware phase plan looks like (§10).

---

## Section 5 — Pain → feature → segment traceability

Closes the loop between §2 (pain) and §6 (asks). Each row says: this pain costs clients X; this feature removes it; these segments need it.

| Pain (#) | Feature that removes it | Segments | Killer demo moment |
|---|---|---|---|
| 1 (RTA bounce) | Predicate Intelligence + eSTAR validator surfaces + RTA preflight | A, D, E | "Show me the RTA preflight for OR-801 §11" → preflight passes with 0 blockers |
| 2 (review time) | AI co-author with section drafting + citation traceability | All | "Draft §11 from the predicate" → Claude produces sourced narrative in 30s |
| 3 (Q-Sub round-trips) | Q-Sub thread manager + commitment rollover + meeting-minutes ingest | All | "Roll the FDA commitment into §6.1" → cross-reference badge appears |
| 4, 5 (IVDR/MDR transition) | GSPR coverage + NB interface + EUDAMED records | C, E | "What's our GSPR coverage on IV-415" → 87% conform, 2 gaps blocking |
| 6 (cyber RTA) | Cybersecurity / SBOM / threat-model surface | D plus any software-containing | "Regenerate SBOM and run cyber-RTA preflight" → all rules pass |
| 7 (PCCP cost) | AI/ML PCCP authoring + drift monitoring | D + AI in B, E | "Show the predetermined modifications for v2.1" |
| 8 (recall cost) | Recall / corrections tracker + 10-day notice composer | All | Composer shows 10-day countdown; affected lots / distribution tagged |
| 9 (483 response) | Inspector-mode export + 483 response workspace | All | "Generate 483 response packet" → DHF + audit trail + corrective actions exported |
| 10 (NB scarcity) | NB calendar + finding-to-CAPA mapping | C, E | NB audit calendar with months-to-window indicator |

---

## Section 6 — Surfaces Claude Design needs to ship

[All §1 entries from the prior draft remain — Predicate Intelligence Workbench, GSPR coverage dashboard, PMS/PMCF document workbench, Approval workflow + e-signature modal, Decision lineage / governance state machine, Compliance scan results panel, Citation search + sentence-level traceability heatmap, Confidence + provenance meter, RIM signal activity feed, Working memory + locked-facts viewer, Module 3 build state explorer, Governance observability dashboard, Tamper-proof audit log + chain-integrity badge, Knowledge graph navigator, Artifact version diff + ancestry. Each remains tagged with backend file paths.]

**What's new vs. the prior draft:** every surface header now also carries:
- **Segments tablestakes for** — a–f tags from §1.1
- **Personas served** — from §1.2
- **Pain # addressed** — from §2

so design can prioritize against the segment matrix in §4.

---

## Section 7 — Backend half-built capabilities

[§3 from the prior draft — AI/ML PCCP plans, QC specifications + investigations, Adaptive trial orchestration, Resolution bundles + supersession, Assumption tracking, Contradiction-consequence service, Next-best-action engine, Precedent mining, Proactive commitment engine, Learning loop. Each tagged to segments per §1.1. PCCP is critical for D; QC for E and F; adaptive trial for B; precedent mining for A and E.]

---

## Section 8 — Net-new workflows (full stack)

[§4 from the prior draft — ISO 14971, CAPA/MDR triage, Cross-jurisdiction change-impact, UDI lifecycle, IDE trial management, Inspector-mode export, 513(g)/De Novo, Cybersecurity/SBOM, FURLS, Governance boundary explorer. Each tagged to segments and personas.]

---

## Section 9 — Latent fields and half-shipped affordances

[§2 from the prior draft — fixes-array activation, comment Apply, status transitions, Q-Sub commitment rollover, vault audit-trail viewer, editor quick actions, AnA mode switcher, cross-program artifact links, signal adjudication modal, enrollment-close action, validator rule reference. These are kit-mechanical fixes and apply across all segments.]

---

## Section 10 — Wave plan (universal-coverage, sequenced by cross-segment density)

The product mandate is universal coverage of the MDX client base — every segment in §1.1 is a customer, every persona in §1.2 is a user. Phasing is therefore **not** about choosing a beachhead segment. Phasing is about **which surfaces serve the most segments at once**, so each phase moves the whole client base forward, not just one slice of it.

The §4 matrix is the priority signal: count the bold ■ cells per row and rank.

### Wave 1 — Universal tablestakes (every segment, every persona)

Six surfaces are bold across **all 6 segments** in §4. They're 21 CFR Part 11 mandates, audit prerequisites, and inspector-readiness baseline. Until these are shipped, no segment is fully served.

- Approval + e-signature modal (§6)
- Tamper-proof audit + chain-integrity badge (§6)
- Compliance scan results panel (§6)
- Artifact version diff + ancestry (§6)
- Inspector-mode read-only export (§8)
- Half-shipped affordance fixes (§9.1, .2, .3, .4, .5, .8) — kit-mechanical hygiene
- ISO 14971 risk workbench (§8) — universally tablestakes; foundational
- CAPA + complaint + MDR/vigilance triage queue (§8) — universally tablestakes

### Wave 2 — Near-universal (5 of 6 segments)

Surfaces that hit five segments. Combined with Wave 1, this lands the entire client base at "core regulatory submission and post-market complete."

- PMS / PMCF document workbench (§6)
- Citation search + sentence-level traceability heatmap (§6)
- Predicate Intelligence Workbench (§6)
- Cross-jurisdiction change-impact engine (§8)
- UDI lifecycle (GUDID + EUDAMED) (§8)
- Confidence + provenance meter (§6)

### Wave 3 — Multi-segment governance and AI auditability (3–4 segments tablestakes, broad reach)

Closes the "AI you can audit" story for every segment that uses the AI co-author, plus governance for regulated-data-rich segments.

- Decision lineage / governance state machine (§6)
- RIM signal activity feed (§6)
- Working memory + locked-facts viewer (§6)
- AI/ML PCCP authoring (§7.1) — segment-defining for D, broadens to B/E/F where AI is in scope
- Cybersecurity / SBOM / threat model (§8) — universal for any software-containing device

### Wave 4 — Segment-defining surfaces (parallel build; all of these unlock specific segments)

Each surface here is mandatory for one or two segments and irrelevant for others. They ship in **parallel**, not sequentially — universal coverage requires all of them. They are listed together because they share the property of being narrow but non-negotiable.

- GSPR coverage dashboard (§6) — segments C, E
- IDE trial management (§8) — segment B
- NB interface + EUDAMED records (§8) — segments C, E
- Module 3 / eCTD build state explorer (§6) — segment F
- Q-Sub / pre-sub thread manager (extends existing PreSub) — all segments
- 513(g) / De Novo intake (§8) — segments A, D, E (novel-device pathways)

### Wave 5 — Quality system and operational depth

Displaces Greenlight Guru / MasterControl on segment A and E; rounds out QSR coverage for all segments.

- QC specifications + investigations queue (§7.2)
- Resolution bundles + supersession console (§7.4)
- Assumption tracking lifecycle (§7.5)
- Next-best-action engine in Project Home (§7.7)
- Precedent mining surface (§7.8) — replaces PrecedentSurface stub
- Recall / 21 CFR 806 corrections tracker (§8)
- Field Safety Notice / FSCA composer (EU MDR Article 96)

### Wave 6 — Observability, infrastructure, and remaining net-new

- Governance observability dashboard (§6)
- Knowledge graph navigator (§6)
- Establishment Registration (FURLS) (§8)
- Governance boundary explorer (§8)
- Adaptive trial console (§7.3)
- Learning loop service surface (§7.10)
- Contradiction-consequence preview (§7.6)
- Proactive commitment engine (§7.9)

### Why this sequencing serves the universal mandate

- Wave 1 + Wave 2 together hit every segment on every persona's tablestakes list. After Wave 2 ships, every MDX client has a usable core product.
- Wave 3 closes the AI-auditability story, which is the platform's main differentiator across all segments.
- Wave 4 is parallelized — the segment-defining surfaces ship at the same time, not sequentially, because skipping any of them leaves a segment uncovered.
- Waves 5–6 are depth and operational rounding — they raise quality across all segments without picking a winner.

An earlier draft of this report grouped surfaces into segment-specific demo arcs (one phase per segment). That's the wrong frame for this product. With a universal-coverage mandate, the question is *which surface index serves the broadest base* — and §4's row-density gives a cleanly justifiable answer. The wave-based plan above replaces it.

---

## Section 11 — Critical files for design reference

[§5 from the prior draft — full file path table for each backend capability. Unchanged.]

---

## Section 12 — Bottom-line numbers

- **6 client segments**, all in scope per the universal-coverage mandate
- **6 buyer personas**, of which the kit today serves ~2 well (RA Manager, VP Reg). Phases 4–7 cover the remaining four.
- **10 quantified pain points** driving procurement
- **5 differentiators** vs. Veeva Vault RIM, Rimsys, MasterControl, Greenlight Guru
- **10 fully built backend capabilities** (UI gap)
- **10 backend-half-built capabilities** (route + UI gap)
- **10 net-new workflows** (full-stack gap)
- **156 endpoints, 199 services, 394 Drizzle tables**, ~25–30% UI coverage
- **6 waves** (§10) sequenced by cross-segment density — universal first, near-universal next, segment-defining in parallel

**The structural insight:** With a universal-coverage mandate, Wave 1 ships the surfaces that are tablestakes for **every** segment in §4 (approval modal, audit trail, compliance scan, version diff, inspector-mode export, ISO 14971, CAPA/MDR, half-shipped affordance fixes). Wave 2 adds the surfaces tablestakes for 5 of 6 segments. Wave 3 closes AI auditability across the base. Wave 4 ships the segment-defining surfaces **in parallel** so no segment is left out. The codebase is rich enough to ship Wave 1 on the existing backend with no route-build work; design is the only blocker.

---

## Verification

This is a design handoff, not an implementation. Verification means design has acknowledged each ask and either:

- accepted into a future phase with a target buyer (segment + persona) and ship date, or
- rejected with rationale, or
- restated the ask differently — design may surface a workflow as a different shape than implementation suggests.

For each accepted ask, the implementation team:

1. Confirms backend coverage is sufficient or scopes the gap (with route-build estimates for §7 items).
2. Wires the surface to the backend.
3. Runs `npx tsc --noEmit` clean before shipping.
4. Smoke-tests the user flow end-to-end against representative seed programs from segments A, B, C, D, E, and F so universal coverage is demonstrably maintained.

For Section 7 items, expect a small route-build effort (1–2 days each) before UI wiring. For Section 8 items, expect a multi-week full-stack effort each.

**Recommended next step for Claude Design:** start Wave 1 (§10). Every surface in Wave 1 is tablestakes for every segment, so no segment-selection question has to be answered before design begins. Implementation is ready to wire each surface as it lands in `ui_kits/mdx/`.
