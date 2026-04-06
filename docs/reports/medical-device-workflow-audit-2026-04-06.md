# Medical Device & Diagnostics Workflow Audit (SME)

**Date:** 2026-04-06
**Purpose:** Audit all client needs across the Medical Device & Diagnostics workflow and align the Concept2Cure platform offering accordingly.

## 1. Submission Pathways an MD&D Client Encounters

### FDA (US)
| Pathway | Class | Trigger | Effort |
|---|---|---|---|
| **510(k)** Premarket Notification | Class II (most common) | Substantial equivalence to a predicate | Low–Med |
| **Special 510(k)** | Class II | Modification to own cleared device | Low |
| **Abbreviated 510(k)** | Class II | Reliance on consensus standards/guidance | Low–Med |
| **De Novo** | Class I/II (novel, low-mod risk) | No predicate exists | Med–High |
| **PMA** (Premarket Approval) | Class III | High-risk, no predicate, life-supporting | High |
| **HDE** (Humanitarian Device Exemption) | Rare disease (< 8,000 pts/yr) | Humanitarian Use Device designation | Med |
| **IDE** (Investigational Device Exemption) | Pre-market | Significant-risk clinical study | Med |
| **Q-Sub** (Pre-Sub, SIR, Study Risk Det.) | Any | FDA early engagement | Low |
| **513(g)** Request for Information | Any | Classification determination | Low |
| **Combination Product** | Any | Drug+device, biologic+device | High |

### EU & UK
| Pathway | Trigger |
|---|---|
| **MDR Class I/IIa/IIb/III** Technical Documentation (Annex II/III) | EU market access |
| **IVDR Class A/B/C/D** Technical Documentation | EU IVD market access |
| **CER** Clinical Evaluation Report (MDR Article 61, Annex XIV) | All MDR devices |
| **PER** Performance Evaluation Report (IVDR Annex XIII) | All IVDR devices |
| **PSUR** Periodic Safety Update Report | MDR Class IIa+, IVDR Class C/D |
| **PMCF / PMPF Plan** | Post-market clinical/performance follow-up |
| **UKCA** | UK conformity assessment |
| **Notified Body** submission package | MDR Class IIa+ / IVDR Class B+ |

### Other Markets
| Region | Pathway |
|---|---|
| Health Canada | Class I/II/III/IV Medical Device License |
| TGA (Australia) | ARTG Inclusion |
| PMDA (Japan) | Pre-market Approval / Notification |
| NMPA (China) | Class I/II/III registration |
| ANVISA (Brazil) | Medical Device Registration |

## 2. Core Workflows by Stage

### Stage A — Strategy & Pathway
1. Device intended use & indications definition
2. Classification determination (Class I/II/III, IVD A–D)
3. Pathway selection (510(k) vs PMA vs De Novo vs Exempt)
4. Predicate device search (510(k) database, FDA AccessGUDID)
5. Substantial equivalence analysis
6. Q-Submission (Pre-Sub) strategy & FDA meeting prep
7. Reimbursement & coding strategy (CPT/HCPCS, Medicare LCD)
8. Global market access strategy

### Stage B — Design & Development
9. Design controls (21 CFR 820.30 / ISO 13485 §7.3) — DHF, DMR
10. Risk management (ISO 14971) — Risk Mgmt Plan, Risk Analysis, FMEA, RMR
11. Software lifecycle (IEC 62304) — for SaMD and software-controlled devices
12. Cybersecurity (FDA premarket guidance, IEC 81001-5-1) — Threat Model, SBOM
13. Human factors / usability (IEC 62366-1, FDA HFE guidance) — Use Spec, Task Analysis, Summative Eval
14. Biocompatibility (ISO 10993 series) — test selection matrix
15. Sterilization validation (ISO 11135 EO, 11137 radiation, 17665 steam)
16. EMC & electrical safety (IEC 60601-1 / 60601-1-2)
17. Performance testing (bench, animal, simulated use)
18. Packaging & shelf life (ASTM D4169, ISO 11607)

### Stage C — Clinical Evidence (when applicable)
19. Clinical evaluation plan (CEP) — MDR Annex XIV
20. Literature search & appraisal (PRISMA-style)
21. Clinical investigation plan (ISO 14155)
22. IDE submission (FDA) / NB approval (EU)
23. CER / PER drafting
24. PMCF/PMPF plan
25. Real-world evidence integration

### Stage D — Submission Building
26. Pathway-specific package assembly:
   - 510(k): Eligibility, intended use, predicate, SE, performance data, labeling
   - PMA: 21 modules — clinical, manufacturing, labeling, etc.
   - De Novo: classification request + risk-benefit
   - MDR Tech Doc: Annex II §1–8 + Annex III PMS
   - IVDR Tech Doc: Annex II §1–9 + Annex III PMS
27. Standards consensus declaration
28. Declaration of Conformity (EU)
29. 510(k) Summary or Statement
30. Labeling & IFU (21 CFR 801, EU MDR Annex I §23)
31. UDI assignment & GUDID submission
32. eCopy formatting (FDA) / eSTAR

### Stage E — Quality System
33. ISO 13485 / 21 CFR 820 implementation
34. SOPs & work instructions
35. Supplier controls (SCAR)
36. CAPA management
37. Internal audit program
38. Management review

### Stage F — Post-Market
39. Post-market surveillance (PMS Plan, MDR Article 83)
40. Vigilance reporting:
   - FDA: MDR (Medical Device Report) — 21 CFR 803
   - EU: Manufacturer Incident Report (MIR), Field Safety Notice (FSN)
41. PSUR (Periodic Safety Update Report) — MDR/IVDR
42. Trend reporting (MDR Article 88)
43. FSCAs (Field Safety Corrective Actions)
44. Recall management (21 CFR 806)
45. UDI maintenance & GUDID updates
46. Annual reports (PMA Annual Report, etc.)
47. Inspection readiness (FDA QSIT, EU Notified Body audits, MDSAP)

## 3. Critical Documents/Artifacts an MD&D Client Produces

| Category | Key Documents |
|---|---|
| **Strategy** | Pathway determination memo, Predicate analysis, Q-Sub package |
| **Design** | DHF, DMR, Design Inputs, Outputs, V&V Protocols & Reports, Traceability Matrix |
| **Risk** | Risk Mgmt Plan, Risk Analysis, FMEA (dFMEA, pFMEA, uFMEA), Risk Mgmt Report |
| **Software** | SRS, SDD, V&V Protocol, Cybersecurity Plan, Threat Model, SBOM, AML |
| **Human Factors** | Use Specification, Task Analysis, Use Error Analysis, Formative Studies, Summative Validation Report |
| **Biocompat** | Test Plan (ISO 10993-1 endpoints), Test Reports, Biological Eval Report |
| **Sterilization** | Validation Protocol & Report, Bioburden, Sterility, EO Residuals (if EO) |
| **Performance** | Bench Test Protocols & Reports, Animal Study Reports |
| **Clinical** | CEP, CER, CIP, Clinical Study Report, PMCF Plan & Report |
| **Submission** | 510(k) Summary, PMA Modules, MDR Tech Doc, DoC, CE Marking, Labeling, IFU |
| **Quality** | Quality Manual, SOPs, Process Validation, Supplier Quality, CAPA records |
| **Post-Market** | PMS Plan, PSUR, MIR/MDR reports, FSCA, Trend Reports, Recall records |

## 4. Specialized Tools an MD&D Client Needs

### Already in Concept2Cure Platform
- Document Vault — governed document storage ✓
- SOP Management ✓
- CAPA Management ✓
- Post-Market Surveillance ✓
- Inspection Readiness ✓
- Precedent Intelligence ✓ (covers approval history, but not device-specific predicate search)
- Regulatory Intelligence ✓
- Document Editor ✓
- Communication Center ✓

### GAPS — Missing Specialized Device Tools
1. **Device Pathway Navigator** — classification (Class I/II/III), pathway selection, product code lookup
2. **Predicate Finder** — FDA 510(k) database search, substantial equivalence analysis
3. **Risk Management (ISO 14971)** — hazard analysis, FMEA, risk control matrix
4. **SaMD & Cybersecurity** — IEC 62304 lifecycle, FDA cyber premarket, SBOM, threat modeling
5. **Human Factors (IEC 62366)** — use specification, task analysis, summative validation
6. **Biocompatibility Planner (ISO 10993)** — test endpoint selection matrix
7. **Q-Submission Assistant** — FDA Pre-Sub package builder, meeting prep
8. **Standards Library** — applicable consensus standards tracker (60601, 14971, 13485, 14155, etc.)
9. **UDI Manager** — UDI assignment, GUDID submission

## 5. Recommended Catalog Updates

### Add to "Featured" (1 new)
- **Device Pathway Navigator** — used at project kickoff, every device project starts here

### Add to "Intelligence" (1 new)
- **Predicate Finder** — daily-use research tool for 510(k) work

### Add to "Authoring" (1 new)
- **Q-Submission Assistant** — strategic FDA engagement, early-stage planning

### Add to "Specialist" (4 new)
- **Risk Management (ISO 14971)**
- **SaMD & Cybersecurity**
- **Human Factors (IEC 62366)**
- **Biocompatibility Planner**

### Update Existing
- **Medical Device & Diagnostics** — expand description to clarify it's the unified hub for 510(k), PMA, De Novo, CER, IVDR submission building (the routing already handles this)

**Total new apps: 7. Updated total: 25 apps in catalog.**

## 6. Routing Strategy (Chat-First Compliant)

Per the design constitution, new specialized device apps must NOT introduce new screens. Each new app routes via one of:

1. **Chat-first contextual entry** — opens chats layout with a primed AnA prompt (`setExternalChatMessage`) that initiates the specialized conversation. This is the canonical pattern for specialist tools that don't have dedicated workspace UI.

2. **Existing tool panel** — for tools that already have backend infrastructure (Risk Management could route to a future risk panel; for now, chat-first).

3. **Existing workspace view** — for tools that map to documents/vault/inspection.

**Routing decisions:**
| App | Route | Mechanism |
|---|---|---|
| Device Pathway Navigator | Chat with priming prompt | setExternalChatMessage + setLayoutMode('chats') |
| Predicate Finder | Chat with priming prompt | setExternalChatMessage + setLayoutMode('chats') |
| Q-Submission Assistant | Chat with priming prompt | setExternalChatMessage + setLayoutMode('chats') |
| Risk Management | Chat with priming prompt | setExternalChatMessage + setLayoutMode('chats') |
| SaMD & Cybersecurity | Chat with priming prompt | setExternalChatMessage + setLayoutMode('chats') |
| Human Factors | Chat with priming prompt | setExternalChatMessage + setLayoutMode('chats') |
| Biocompatibility Planner | Chat with priming prompt | setExternalChatMessage + setLayoutMode('chats') |

This is the "app as conversational entry point" pattern that respects chat-first design.
