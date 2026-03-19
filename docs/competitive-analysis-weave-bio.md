# Competitive Analysis: Concept2Cure.RI vs Weave.bio

> **Date:** 2026-03-19
> **Prepared by:** Concept2Cure.RI Engineering
> **Classification:** CONFIDENTIAL — Internal Use Only

---

## Executive Summary

**Weave.bio** ($36M raised, $20M Series A led by USVP) is an AI-native regulatory authoring
platform. Their core product is IND auto-drafting. They do **one thing well** — regulatory
document authoring — and are expanding into clinical submissions (AutoCT) and HAQ response
management.

**Concept2Cure.RI** is a **full-stack biotech operating system** spanning regulatory, pharmacovigilance,
clinical operations, CMC, medical devices, 510(k), quality, collaboration, and project management.
It is ~10x broader in scope with 209 API routes, 238 services, 660+ database entities, and
support for 30+ regulatory agencies.

---

## Feature-by-Feature Rack & Stack

### REGULATORY AUTHORING

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| AI-drafted IND sections | **AutoIND** — flagship, 97% time savings, knowledge-graph-powered | IND Workspace + Wizard + Templates + AI assistance | **Weave** |
| Clinical study docs (CSR, protocols, IBs) | **AutoCT** — CSR, protocols, safety reports, IBs from source data | Protocol routes, CSR upload/search/intelligence, protocol synopsis generator | **Tie** |
| AI content refinement | Sentence-level AI refinement with user control | Co-author, AI assistance, smart blocks, predictive sections, compliance guardrails | **Concept2Cure.RI** |
| Source traceability | Sentence-level trace to source docs (key differentiator) | Citation enforcement, source links, traceability mapping, NLI verification | **Weave** (more mature) |
| Template engine | Unified Editor with template/content toggle, flexible prompt blocks | DOCX Factory, template registry, CTD templates, dynamic content assembly | **Tie** |

### eCTD SUBMISSIONS

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| eCTD assembly/packaging | Submission Builder — eCTD-formatted templates | Full eCTD pyramid (Modules 1-5), compile, export, validate, scaffold, v4.0 validator | **Concept2Cure.RI** |
| eCTD validation | Not detailed publicly | eCTD v4.0 DTD validation, multi-agency validation, checksum verification | **Concept2Cure.RI** |
| Direct agency submission | Not available | ESG Submission Service (FDA ESG, EMA, PMDA, HC gateway) | **Concept2Cure.RI** |
| Multi-region support | FDA, EMA (planned: Japan, LatAm) | FDA, EMA, PMDA, Health Canada — all live (30+ agencies in pathway intelligence) | **Concept2Cure.RI** |

### PHARMACOVIGILANCE

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| ICSR / E2B(R3) | Not offered | Full E2B(R3) XML generation, FAERS routes, EMA AE export | **Concept2Cure.RI** |
| PSUR/PBRER | Not offered | PSUR/PBRER generator per ICH E2C(R2) | **Concept2Cure.RI** |
| CIOMS Forms | Not offered | CIOMS I Form generator | **Concept2Cure.RI** |
| Expedited safety reports | Not offered | 7-day/15-day expedited report generator per ICH E2A | **Concept2Cure.RI** |
| Signal detection | Not offered | Sentinel routes, pharmacovigilance dashboard, GVP Module IX | **Concept2Cure.RI** |
| DSUR / PADER | Not offered | Periodic safety reports: DSUR, PSUR, PBRER, PADER | **Concept2Cure.RI** |

### CLINICAL OPERATIONS

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| Trial management | Not offered | Clinical Operations Dashboard, trial tracking, enrollment reports | **Concept2Cure.RI** |
| Site monitoring | Not offered | Monitoring Visit Report generator, site assessment | **Concept2Cure.RI** |
| Protocol deviations | Not offered | Deviation Report generator with root cause and CAPA | **Concept2Cure.RI** |
| Enrollment tracking | Not offered | Enrollment Report with site-level data and projections | **Concept2Cure.RI** |
| Adaptive trial operations | Not offered | Adaptive trial operations service, estimand engine | **Concept2Cure.RI** |
| Dropout forecasting | Not offered | Dropout forecast routes | **Concept2Cure.RI** |

### CMC / MANUFACTURING

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| CMC documentation | Parexel partnership for CMC validation | CMC Dashboard, Blueprint Service, Module 3 templates, manufacturing routes | **Concept2Cure.RI** |
| Quality management | Not offered | Quality management API, validation routes, CTQ factors, section quality gates | **Concept2Cure.RI** |
| Supply chain | Not offered | Supply chain routes | **Concept2Cure.RI** |
| Analytical methods | Not offered | Analytical methods documentation and validation | **Concept2Cure.RI** |
| Batch management | Not offered | Batch genealogy tracking, batch status lifecycle | **Concept2Cure.RI** |

### MEDICAL DEVICES / 510(k)

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| 510(k) submissions | Not offered | Full suite: eSTAR routes, compliance tracker, predicate finder, SE matrix | **Concept2Cure.RI** |
| Clinical Evaluation Report | Not offered | CER generator (PDF + DOCX + XML), CER analytics, CER device profiles | **Concept2Cure.RI** |
| IVDR compliance | Not offered | IVDR binder routes, IVDR DOCX generation | **Concept2Cure.RI** |
| MDR / EU MDR | Not offered | Medical device routes, MAUD routes | **Concept2Cure.RI** |
| Predicate intelligence | Not offered | Predicate finder service, equivalence API | **Concept2Cure.RI** |

### HAQ / AGENCY RESPONSE

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| Health Authority Questions | **HAQ Manager** — auto-extract, track, draft responses, cross-team collab | Not explicitly available as standalone module | **Weave** |

### DOCUMENT GENERATION

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| PDF generation | Not detailed | PDFKit + Puppeteer + jsPDF — full production pipeline | **Concept2Cure.RI** |
| DOCX generation | Presumably generates DOCX | DOCX Factory with regulatory formatting, template registry | **Tie** |
| XML/eCTD export | eCTD-formatted output | xmlbuilder2, eCTD index.xml, E2B(R3) XML | **Concept2Cure.RI** |
| PPTX presentations | Not offered | PPTX Generator for board decks and regulatory briefings | **Concept2Cure.RI** |
| Artifact download hub | Not detailed | Document Artifacts Hub — 10 doc types, one-click generate/download/vault | **Concept2Cure.RI** |

### COLLABORATION & ENTERPRISE

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| Real-time collaboration | Centralized workspace | Yjs CRDT real-time sync, cursor presence, document locking | **Concept2Cure.RI** |
| Multi-tenant | Not detailed | Full multi-tenant (org + workspace isolation, RBAC) | **Concept2Cure.RI** |
| SSO / Enterprise auth | AWS security controls | SSO, enterprise auth, MFA, Part 11 compliance | **Concept2Cure.RI** |
| Audit trails | Version-controlled audit trail | Immutable HMAC-SHA256 audit logs, 21 CFR Part 11 | **Concept2Cure.RI** |

### AI / INTELLIGENCE

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| LLM integration | Generative AI + knowledge graphs | Claude + OpenAI, AI gateway, provider routing | **Tie** |
| Multi-agent AI | Not offered | Agent swarm (10 agent types), LangGraph orchestration, HITL | **Concept2Cure.RI** |
| Knowledge graphs | Knowledge graph for IND data | GraphRAG, biostat KG, regulatory KG, foresight KG, vector search | **Concept2Cure.RI** |
| Regulatory intelligence | Not detailed | Regulatory Intelligence Feed, foresight AI, precedent engine, digital twin | **Concept2Cure.RI** |
| Predictive analytics | Not offered | Foresight AI engine, dropout forecast, simulation, outcome prediction | **Concept2Cure.RI** |
| Biostatistics | Not offered | Power analysis, Monte Carlo, interim analysis, CDISC (37 tables), estimands | **Concept2Cure.RI** |

### PROJECT MANAGEMENT

| Feature | Weave.bio | Concept2Cure.RI | Winner |
|---------|-----------|----------------|--------|
| Task management | Not offered as standalone | Unified task routes, project hierarchy, milestones, dependencies | **Concept2Cure.RI** |
| Mission control | Not offered | Mission Control with 15+ sub-dashboards | **Concept2Cure.RI** |
| Program management | Not offered | Programs v2, program wizard, program analytics, NDA/BLA/IND pyramids | **Concept2Cure.RI** |
| FDA forms | Not offered | FDA Form Generator (1571, 1572, 1580, etc.) | **Concept2Cure.RI** |
| Billing / licensing | Not public | Stripe integration, credit metering, seat-based licensing, feature entitlements | **Concept2Cure.RI** |

---

## Scorecard Summary

| Domain | Weave.bio | Concept2Cure.RI | Winner |
|--------|-----------|----------------|--------|
| IND Auto-Drafting | 9/10 | 7/10 | **Weave** |
| Source Traceability | 9/10 | 7/10 | **Weave** |
| HAQ Management | 8/10 | 3/10 | **Weave** |
| Clinical Doc Authoring | 7/10 | 7/10 | Tie |
| eCTD Assembly & Validation | 6/10 | 9/10 | **Concept2Cure.RI** |
| Direct Agency Submission | 0/10 | 8/10 | **Concept2Cure.RI** |
| Multi-Region Regulatory | 4/10 | 9/10 | **Concept2Cure.RI** |
| Pharmacovigilance | 0/10 | 9/10 | **Concept2Cure.RI** |
| Clinical Operations | 0/10 | 8/10 | **Concept2Cure.RI** |
| CMC / Manufacturing | 2/10 | 8/10 | **Concept2Cure.RI** |
| Medical Devices / 510(k) | 0/10 | 9/10 | **Concept2Cure.RI** |
| Document Generation | 5/10 | 9/10 | **Concept2Cure.RI** |
| Project Management | 0/10 | 8/10 | **Concept2Cure.RI** |
| AI/ML Infrastructure | 7/10 | 9/10 | **Concept2Cure.RI** |
| Multi-Tenant Enterprise | 3/10 | 9/10 | **Concept2Cure.RI** |
| Compliance (21 CFR Part 11) | 4/10 | 8/10 | **Concept2Cure.RI** |
| **TOTAL** | **64/160** | **127/160** | **Concept2Cure.RI** |

---

## Where Weave Beats Us (3 Gaps to Close)

### Gap 1: IND Auto-Drafting Depth
**Weave's advantage:** AutoIND generates complete IND first drafts from uploaded source data
in ~3 hours (vs ~100 hours manual). Takeda validated 97% time savings with no critical errors.
Their knowledge graph extracts structured data from source PDFs and auto-drafts sections.

**Our position:** IND Workspace, IND Wizard, and templates exist but require more manual input.
AI-assisted drafting is available but not as deeply automated from raw source files.

**Recommended action:** Build "IND AutoDraft" feature that ingests nonclinical study reports,
CMC data, and clinical protocols, then auto-generates complete IND sections using our
existing agent swarm and RAG pipeline.

### Gap 2: Source Traceability (Sentence-Level)
**Weave's advantage:** Every generated sentence links back to the exact source sentence
in the uploaded document. Two-click verification from output to input.

**Our position:** We have citation enforcement (NLI-based), source links, and traceability
mapping, but sentence-level click-through is not fully implemented end-to-end.

**Recommended action:** Leverage our existing `sentenceTraceabilityService.ts` and
`citationEnforcementService.ts` to build end-to-end sentence-level source linking with
inline popover previews in the document editor.

### Gap 3: HAQ Response Manager
**Weave's advantage:** Dedicated HAQ Manager (launched Nov 2025) that auto-extracts FDA/EMA
questions from agency letters, tracks response deadlines, generates draft responses from
prior submissions, and enables cross-functional collaboration.

**Our position:** No equivalent standalone module. Regulatory intelligence exists but
not structured around HAQ response workflows.

**Recommended action:** Build HAQ Response Manager with:
- PDF extraction of agency question letters (FDA IR, EMA D120, PMDA queries)
- Question-by-question tracking with assignees and deadlines
- AI-drafted responses using prior submission data and knowledge base
- Cross-functional review workflow with approval gates

---

## Where We Dominate (12 Verticals Weave Doesn't Touch)

1. **Pharmacovigilance** — ICSR E2B(R3), PSUR/PBRER, CIOMS, expedited reports, signal detection
2. **Clinical Operations** — Trial management, monitoring, enrollment, deviation tracking
3. **Medical Devices** — Full 510(k) lifecycle, CER, IVDR, MDR, predicate finder
4. **CMC / Manufacturing** — Quality management, supply chain, batch records, analytical methods
5. **Direct Agency Submission** — FDA ESG, EMA, PMDA, Health Canada gateways
6. **Multi-Region (30+ agencies)** — vs Weave's 2 (FDA, EMA)
7. **Document Artifacts** — 10+ document types with one-click generation/download/vault
8. **PPTX Generation** — Board decks and regulatory briefings
9. **FDA Forms** — Auto-generated 1571, 1572, 1580
10. **Project/Program Management** — Mission Control, task boards, milestones, program analytics
11. **Regulatory Intelligence** — Predictive analytics, digital twin, foresight AI, precedent engine
12. **Biostatistics** — Power analysis, Monte Carlo, interim analysis, CDISC, estimand engine

---

## Strategic Positioning

**Weave.bio** = A **scalpel** — excellent at IND authoring for small biotechs needing fast INDs.
Narrow but deep. $36M raised, Parexel partnership, Takeda validation.

**Concept2Cure.RI** = A **full surgical suite** — end-to-end biotech operating system covering
every function from preclinical through postmarket. 10x broader capability set with
enterprise-grade multi-tenant architecture, 21 CFR Part 11 compliance, and 30+ agency support.

**Competitive moat:** Weave competes on IND speed. We compete on platform breadth, regulatory
depth, and the fact that a biotech startup can run their entire regulatory operation on
Concept2Cure.RI without needing 5 other tools. Closing the 3 gaps above would eliminate
Weave's remaining advantages while maintaining our massive lead in every other dimension.

---

## Sources

- [Weave Bio $20M Series A (BusinessWire)](https://www.businesswire.com/news/home/20251016053611/en/Weave-Bio-Secures-20M-Series-A-Funding-to-Enhance-Its-AI-Native-Regulatory-Platform)
- [Weave Bio HAQ Manager Launch (BusinessWire)](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase)
- [Parexel-Weave Partnership](https://newsroom.parexel.com/news-releases/news-release-details/parexel-announces-ai-partnership-weave-bio-accelerate-regulatory)
- [Weave Bio: AI-Powered Regulatory Automation (Excedr)](https://www.excedr.com/blog/weave-bio-ai-powered-regulatory-automation-for-drug-development)
- [AutoCT Product Page](https://weave-bio.webflow.io/products/autoct)
- [Weave Bio Platform](https://www.weave.bio/)
- [Fierce Biotech Coverage](https://www.fiercebiotech.com/sponsored/weaves-ai-platform-aims-revolutionize-regulatory-workflows-pharma)
- [HAQ Manager Details (HIT Consultant)](https://hitconsultant.net/2025/11/06/weave-bio-launches-haq-manager-ai-automation-accelerates-health-authority-question-responses/)
