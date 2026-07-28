# Chapter 13 — Competitive rack-and-stack

Twelve offering categories, five closest competitors each — **66 competitor profiles**, researched live on the web with source URLs, and scored against a per-category rubric alongside this platform.

**Method.** Categories are derived from `shared/regulatory/app-registry.ts`, the codebase's own canonical offering taxonomy, so the comparison is against what is actually sold rather than what a slide claims. Competitor facts carry URLs; our scores carry `file:line`. Everything is scored on **what ships and is reachable** — a capability a user cannot navigate to does not win deals, and this platform currently surfaces 5 of 96 registered surfaces in its global navigation (Chapter 09).

## Scorecard

| Category | Verdict | Us | Best competitor | Gap |
|---|---|:--:|:--:|:--:|
| [Agentic AI assistant layer over regulatory work (life scien…](13-competitive/agentic-ai-assistant-layer-over-regulatory-work-life-scien.md) | 🟡 Credible challenger | **3.2** | 3.9 | -0.7 |
| [Medical device & IVD regulatory (510(k), De Novo, PMA) and …](13-competitive/medical-device-ivd-regulatory-510-k-de-novo-pma-and.md) | 🔴 Not competitive | **2.1** | 4.2 | -2.1 |
| [Regulatory intelligence & global market planning (life scie…](13-competitive/regulatory-intelligence-global-market-planning-life-scie.md) | 🟠 Niche-viable | **2.1** | 4.6 | -2.5 |
| [EU MDR / IVDR clinical evaluation (CER / PER) software](13-competitive/eu-mdr-ivdr-clinical-evaluation-cer-per-software.md) | 🔴 Not competitive | **1.8** | 4.3 | -2.6 |
| [Regulatory document authoring & AI co](13-competitive/regulatory-document-authoring-ai-co.md) | 🔴 Not competitive | **1.9** | 4.7 | -2.9 |
| [Biostatistics, SAP authoring & statistical programming](13-competitive/biostatistics-sap-authoring-statistical-programming.md) | 🔴 Not competitive | **1.6** | 4.6 | -3.0 |
| [Regulatory Information Management (RIM) & eCTD submission p…](13-competitive/regulatory-information-management-rim-ectd-submission-p.md) | 🔴 Not competitive | **1.8** | 4.9 | -3.2 |
| [Clinical study reporting (CSR) & medical writing automation](13-competitive/clinical-study-reporting-csr-medical-writing-automation.md) | 🔴 Not competitive | **1.5** | 4.7 | -3.2 |
| [QMS: SOP / document control, CAPA, change control, deviatio…](13-competitive/qms-sop-document-control-capa-change-control-deviatio.md) | 🔴 Not competitive | **1.6** | 4.9 | -3.2 |
| [eTMF and regulated document management / Vault DMS](13-competitive/etmf-and-regulated-document-management-vault-dms.md) | 🔴 Not competitive | **1.7** | 4.9 | -3.3 |
| [Labeling, SPL and artwork management](13-competitive/labeling-spl-and-artwork-management.md) | 🔴 Not competitive | **1.4** | 4.7 | -3.4 |
| [Pharmacovigilance & drug safety (safety database of record,…](13-competitive/pharmacovigilance-drug-safety-safety-database-of-record.md) | 🔴 Not competitive | **1.1** | 5.0 | -3.9 |

**Verdict distribution:** 🔴 Not competitive ×10 · 🟠 Niche-viable ×1 · 🟡 Credible challenger ×1

**Across all twelve categories: us 1.8 / 5, best-in-category competitor 4.6 / 5.**

## How to read these numbers

A 1.8-versus-4.6 average and ten "not competitive" verdicts is a severe result, and it is severe **because of the lens, which was chosen deliberately**. Every dimension was scored on what *ships and is reachable today* — not on what is architected, coded, or nearly done. Three properties of this platform get punished hard by that lens, and all three are documented elsewhere in this audit:

1. **Reachability.** 5 of 96 registered surfaces are in the global navigation (Chapter 09). A capability a buyer cannot click to does not score, however good the code behind it is. Several categories here are scored near-zero on surfaces that demonstrably exist in the codebase.
2. **Validation.** Every IQ/OQ/PQ execution record is blank and the VSR reads `DRAFT` (Chapter 07). In this market that is not a deduction — it is disqualification. Multiple category analyses independently reached the same conclusion: **the product does not reach technical evaluation** without a qualification package, regardless of engine quality.
3. **Incumbency.** The comparators are Veeva, LORENZ, Certara, Oracle, MasterControl and Cytel — decades of install base, agency familiarity, and accumulated edge-case handling. A 4.6 average for "best in category" is what a mature category looks like.

**So the scores measure procurement-readiness, not engineering quality.** They are the right lens for a buyer and the wrong lens for judging the codebase, and this audit uses both: Chapters 04–11 assess the engineering, which is frequently strong.

### The one number that matters most

**The agentic AI layer scores 3.2 and is the sole "credible challenger" — the only category within striking distance of the leader (−0.7).** Every other category is 2.1 or below.

That is a strategically decisive result, and it was reached independently of Chapter 16, which had already argued on code evidence that the AI/grounding layer is the platform's real moat. Two separate methods converging on the same conclusion is the strongest signal in this audit:

- **Where breadth was the thesis, breadth lost.** Competing against Veeva on RIM, Oracle on pharmacovigilance, or MasterControl on QMS means competing on install base and validation packages — the two things this platform most lacks. Those are −3.2, −3.9 and −3.2 gaps respectively, and no amount of engineering closes them soon.
- **Where governed AI was the thesis, it nearly won** — against competitors whose own AI is frequently announced-but-not-shipped.

The strategic reading is uncomfortable but clear: **the platform is priced and positioned as a 12-category suite, and it is competitive in one.** Concentrating on that one — and on the device/IVD category that scores next-highest at 2.1 and where the code is genuinely deep — is the difference between a viable challenger and a broad also-ran.

## The named competitors

| Vendor | Categories where it is a closest competitor |
|---|---|
| Veeva Systems | 5 — Regulatory document authoring & AI co; Regulatory Information Management (RIM) & eCTD submission p…; eTMF and regulated document management / Vault DMS; Labeling, SPL and artwork management; Agentic AI assistant layer over regulatory work (life scien… |
| Certara | 3 — Regulatory document authoring & AI co; Biostatistics, SAP authoring & statistical programming; Agentic AI assistant layer over regulatory work (life scien… |
| Weave Bio | 3 — Regulatory document authoring & AI co; Regulatory Information Management (RIM) & eCTD submission p…; Agentic AI assistant layer over regulatory work (life scien… |
| Yseop | 2 — Regulatory document authoring & AI co; Agentic AI assistant layer over regulatory work (life scien… |
| Rimsys | 2 — Medical device & IVD regulatory (510(k), De Novo, PMA) and …; Regulatory intelligence & global market planning (life scie… |
| Narrativa | 1 — Regulatory document authoring & AI co |
| Peer AI | 1 — Regulatory document authoring & AI co |
| LORENZ Life Sciences Group | 1 — Regulatory Information Management (RIM) & eCTD submission p… |
| Certara (GlobalSubmit) | 1 — Regulatory Information Management (RIM) & eCTD submission p… |
| EXTEDO (Cencora PharmaLex) | 1 — Regulatory Information Management (RIM) & eCTD submission p… |
| Greenlight Guru | 1 — Medical device & IVD regulatory (510(k), De Novo, PMA) and … |
| Ketryx | 1 — Medical device & IVD regulatory (510(k), De Novo, PMA) and … |
| Veeva MedTech (Vault RIM / RegulatoryOne / QualityOne) | 1 — Medical device & IVD regulatory (510(k), De Novo, PMA) and … |
| MasterControl | 1 — Medical device & IVD regulatory (510(k), De Novo, PMA) and … |
| Celegence — CAPTIS / CAPTIS Copilot | 1 — EU MDR / IVDR clinical evaluation (CER / PER) software |
| DistillerSR | 1 — EU MDR / IVDR clinical evaluation (CER / PER) software |
| CiteMed | 1 — EU MDR / IVDR clinical evaluation (CER / PER) software |
| Nested Knowledge — AutoLit | 1 — EU MDR / IVDR clinical evaluation (CER / PER) software |
| Vespper | 1 — EU MDR / IVDR clinical evaluation (CER / PER) software |
| Cytel | 1 — Biostatistics, SAP authoring & statistical programming |
| Domino Data Lab | 1 — Biostatistics, SAP authoring & statistical programming |
| SAS Institute | 1 — Biostatistics, SAP authoring & statistical programming |
| Veristat | 1 — Biostatistics, SAP authoring & statistical programming |
| Certara — CoAuthor | 1 — Clinical study reporting (CSR) & medical writing automation |
| Yseop — Yseop Copilot | 1 — Clinical study reporting (CSR) & medical writing automation |
| Narrativa — Clinical Atlas (CSR Atlas) / Navigator | 1 — Clinical study reporting (CSR) & medical writing automation |
| AlphaLife Sciences — AuroraPrime RMA | 1 — Clinical study reporting (CSR) & medical writing automation |
| Clinion — Clinion CSR Automation | 1 — Clinical study reporting (CSR) & medical writing automation |
| Oracle Argus Safety (Oracle Life Sciences "Safety One") | 1 — Pharmacovigilance & drug safety (safety database of record,… |
| ArisGlobal LifeSphere Safety (NavaX) | 1 — Pharmacovigilance & drug safety (safety database of record,… |
| Veeva Vault Safety (with Vault Safety.AI and Veeva Safety Signal) | 1 — Pharmacovigilance & drug safety (safety database of record,… |
| IQVIA Vigilance Platform | 1 — Pharmacovigilance & drug safety (safety database of record,… |
| AB Cube SafetyEasy Suite (also distributed by EXTEDO) | 1 — Pharmacovigilance & drug safety (safety database of record,… |
| Montrium | 1 — eTMF and regulated document management / Vault DMS |
| TransPerfect Life Sciences | 1 — eTMF and regulated document management / Vault DMS |
| Phlexglobal (a PharmaLex company) | 1 — eTMF and regulated document management / Vault DMS |
| Florence Healthcare | 1 — eTMF and regulated document management / Vault DMS |
| Medable | 1 — eTMF and regulated document management / Vault DMS |
| Veeva Systems — Vault Quality (Vault QMS + QualityDocs + Training + Station Manager + Validation Management) | 1 — QMS: SOP / document control, CAPA, change control, deviatio… |
| MasterControl — Quality Excellence | 1 — QMS: SOP / document control, CAPA, change control, deviatio… |
| Dot Compliance — eQMS (QMS Xpress / Compliance Xpand / Enterprise Xact) with Dottie AI | 1 — QMS: SOP / document control, CAPA, change control, deviatio… |
| Qualio | 1 — QMS: SOP / document control, CAPA, change control, deviatio… |
| Greenlight Guru — Quality Management System (with Greenlight Guru AI) | 1 — QMS: SOP / document control, CAPA, change control, deviatio… |
| Clarivate — Cortellis Regulatory Intelligence | 1 — Regulatory intelligence & global market planning (life scie… |
| Citeline (Norstella) — RegIntel | 1 — Regulatory intelligence & global market planning (life scie… |
| RegDesk | 1 — Regulatory intelligence & global market planning (life scie… |
| Freyr — Freyr GRI / freya.intelligence (Freyr IMPACT) | 1 — Regulatory intelligence & global market planning (life scie… |
| Veeva Systems — Vault RIM (Registrations) + Vault AI | 1 — Regulatory intelligence & global market planning (life scie… |
| Kallik | 1 — Labeling, SPL and artwork management |
| Loftware | 1 — Labeling, SPL and artwork management |
| ArisGlobal | 1 — Labeling, SPL and artwork management |
| Freyr | 1 — Labeling, SPL and artwork management |
| Esko (Veralto) | 1 — Labeling, SPL and artwork management |
| GlobalVision / Schlafender Hase | 1 — Labeling, SPL and artwork management |
| ArisGlobal (being acquired by Dassault Systèmes) | 1 — Agentic AI assistant layer over regulatory work (life scien… |
| IQVIA | 1 — Agentic AI assistant layer over regulatory work (life scien… |

## Per-category detail

- [Agentic AI assistant layer over regulatory work (life scien…](13-competitive/agentic-ai-assistant-layer-over-regulatory-work-life-scien.md) — 🟡 Credible challenger
- [Medical device & IVD regulatory (510(k), De Novo, PMA) and …](13-competitive/medical-device-ivd-regulatory-510-k-de-novo-pma-and.md) — 🔴 Not competitive
- [Regulatory intelligence & global market planning (life scie…](13-competitive/regulatory-intelligence-global-market-planning-life-scie.md) — 🟠 Niche-viable
- [EU MDR / IVDR clinical evaluation (CER / PER) software](13-competitive/eu-mdr-ivdr-clinical-evaluation-cer-per-software.md) — 🔴 Not competitive
- [Regulatory document authoring & AI co](13-competitive/regulatory-document-authoring-ai-co.md) — 🔴 Not competitive
- [Biostatistics, SAP authoring & statistical programming](13-competitive/biostatistics-sap-authoring-statistical-programming.md) — 🔴 Not competitive
- [Regulatory Information Management (RIM) & eCTD submission p…](13-competitive/regulatory-information-management-rim-ectd-submission-p.md) — 🔴 Not competitive
- [Clinical study reporting (CSR) & medical writing automation](13-competitive/clinical-study-reporting-csr-medical-writing-automation.md) — 🔴 Not competitive
- [QMS: SOP / document control, CAPA, change control, deviatio…](13-competitive/qms-sop-document-control-capa-change-control-deviatio.md) — 🔴 Not competitive
- [eTMF and regulated document management / Vault DMS](13-competitive/etmf-and-regulated-document-management-vault-dms.md) — 🔴 Not competitive
- [Labeling, SPL and artwork management](13-competitive/labeling-spl-and-artwork-management.md) — 🔴 Not competitive
- [Pharmacovigilance & drug safety (safety database of record,…](13-competitive/pharmacovigilance-drug-safety-safety-database-of-record.md) — 🔴 Not competitive
