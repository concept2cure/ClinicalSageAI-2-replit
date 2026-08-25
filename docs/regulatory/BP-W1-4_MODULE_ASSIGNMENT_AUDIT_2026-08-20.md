# BP-W1-4 — eCTD Module-Assignment Audit

**Date:** 2026-08-20 · **Auditor:** Claude (Code session) · **Registry:** shared/regulatory/global-document-registry.ts @ concept2cure-v2

**Scope.** Every active filing type in the unified catalog (232 entries; 100 carry a CTD module assignment). Each assignment was traced to a named specification — ICH M4 (+M4Q/M4S/M4E and the Annex granularity), FDA eCTD Module 1 Specification v2.3, EU Module 1 Specification v3.0, the regional M1 specifications, or the governing regulation — and the authority is now recorded ON the entry (moduleAuthority), so the audit is re-runnable. A test gate (filing-catalog-unification.test.ts) fails the build if an assignment ever lands untraced again.

**Method.** Assignments were VERIFIED, not re-derived: where the current value traces cleanly to a specification, the authority names it; where it does not, the entry is FLAGGED — the value is left as it was and the flag text records what is questionable and what the recommendation is. No module assignment was changed by this audit.

## Verdict summary

| Verdict | Count |
|---|---|
| Traced to a named specification | 91 |
| FLAGGED for SME decision | 9 |
| No module assignment (not dossier content, or none established) | 132 |

## Flagged assignments — SME decision required

| Entry | Current module | Flag |
|---|---|---|
| US_IND_AMENDMENT — IND Amendment | M5 | BP-W1-4 AUDIT FLAG: 'M5' is too narrow — an information amendment files where its content lives (protocol amendments in M5.3.5.4, chemistry in M3, administrative in M1; 21 CFR 312.31). Recommend 'M1–M5 (content-dependent)'. SME decision required. |
| EU_PSUR — PSUR / PBRER | M5 | BP-W1-4 AUDIT FLAG: PSUR/PBRER submissions go to the EU PSUR Repository as standalone sequences (Art 107b Directive 2001/83/EC; ICH E2C(R2)) — they are not Module 5 dossier content. Recommend removing the M5 assignment. SME decision required. |
| IN_CT21 — Form CT-21 (Generic Drug Marketing) | M1–M3 | BP-W1-4 AUDIT FLAG: same defect class as the corrected ANDA — a generic application scoped M1–M3 leaves no module for the bioequivalence study report, which is 5.3.1 per the ICH M4 Annex. Recommend 'M1–M5 (BE in 5.3.1)'. SME decision required. |
| KR_MA_GENERIC — Marketing Application — Generic (Korea) | M1–M3 | BP-W1-4 AUDIT FLAG: same defect class as the corrected ANDA — 'M1–M3' leaves no module for the bioequivalence evidence (5.3.1, ICH M4 Annex). Recommend 'M1–M5 (BE in 5.3.1)'. SME decision required. |
| SG_GDA — Generic Drug Application (Singapore) | M1–M3 | BP-W1-4 AUDIT FLAG: same defect class as the corrected ANDA — the bioequivalence study report is ACTD Part IV / CTD 5.3.1 content, so 'M1–M3' cannot carry it. Recommend 'M1–M5 (BE in 5.3.1)'. SME decision required. |
| US_IND_ANNUAL — Annual Report (IND) | M5 | BP-W1-4 AUDIT FLAG: an eCTD IND annual report files under m1.13 (FDA eCTD M1 v2.3), not M5; 21 CFR 312.33. Recommend 'M1 (m1.13)'. SME decision required. |
| ICH_DSUR — Development Safety Update Report (DSUR) | M5 | BP-W1-4 AUDIT FLAG: FDA accepts the DSUR as the IND annual report under eCTD m1.13 (FDA eCTD M1 v2.3); in the EU it is a CTIS submission, not dossier content. Current 'M5' traces to neither. Recommend 'M1 (m1.13, US IND)' with a regional note. SME decision required. ICH E2F. |
| ICH_ICF — Informed Consent Form (ICF) | M5 (5.3.5 — CSR appendix 16.1.3) | ICH E3 §16.1.3 (sample consent form is a CSR appendix); ICH M4 Annex 5.3.5. BP-W1-3: the row carried submissionFormat/dossierStandard 'none' and no module, so it was in the catalog as a filing type that could not be filed anywhere. SME DECISION REQUIRED — the work order offers 'assign a format and module, or remove from the catalog'. Assigned rather than removed, because the specimen ICF IS a filed artefact: it travels as CSR appendix 16.1.3 in M5.3.5. Note this is the SPECIMEN filed with the dossier, not the executed patient-signed consents, which are site records and are never submitted. |
| ICH_TABULATED_SUMMARIES — Tabulated Summaries (M2.7.4) | 2.7.4 | BP-W1-4 AUDIT FLAG: 2.7.4 is the Summary of Clinical Safety (ICH M4E); nonclinical TABULATED summaries are 2.6.3/2.6.5/2.6.7 (ICH M4S) and individual patient data listings are CSR appendix 16.2 (M5). The current assignment and the description ('individual patient data listings') match none of these. SME decision required. |

## Traced assignments

| Entry | Module | Authority |
|---|---|---|
| US_IND — Investigational New Drug Application | M1–M5 | ICH M4 (CTD organisation); FDA eCTD Module 1 Specification v2.3 (US regional M1); 21 CFR 312.23 (IND content). |
| US_NDA — New Drug Application | M1–M5 | ICH M4 Annex (M1–M5 granularity); FDA eCTD Module 1 Specification v2.3; 21 CFR 314.50. |
| US_BLA — Biologics License Application | M1–M5 | ICH M4 Annex; FDA eCTD Module 1 Specification v2.3; 21 CFR 601.2 (PHS Act §351(a)). |
| US_ANDA — Abbreviated New Drug Application | M1–M5 (BE reports in 5.3.1) | ICH M4 Annex — 5.3.1 Reports of Biopharmaceutic Studies. BP-W1-3: was M1–M3, which cannot carry the bioequivalence study reports that ARE the evidence of an ANDA. "No original clinical data" means no new safety/efficacy trials; the BE study is still a clinical study report and still Module 5. |
| US_505B2 — 505(b)(2) Application | M1–M5 | A 505(b)(2) is an NDA — ICH M4 Annex; FDA eCTD Module 1 Specification v2.3; 21 CFR 314.50. |
| US_NDA_SUPP — NDA/BLA Supplement (Prior Approval) | M1–M5 | Supplements follow the parent application's CTD structure — ICH M4; FDA eCTD M1 v2.3; 21 CFR 314.70. |
| US_BLA_SUPP — BLA Supplement (sBLA) | M1–M5 | Supplements follow the parent application's CTD structure — ICH M4; FDA eCTD M1 v2.3; 21 CFR 601.12. |
| EU_CTA — Clinical Trial Application (EU CTR) | Part I–II | Regulation (EU) 536/2014 Annex I — a CTR CTA is a Part I / Part II submission through CTIS, not an eCTD five-module dossier. The client mirror carried this correction; unified here (BP-W1-2). |
| EU_MAA — Marketing Authorisation Application | M1–M5 | ICH M4; EU Module 1 Specification v3.0 (eCTD EU regional M1); Regulation (EC) 726/2004. |
| EU_ASMF — Active Substance Master File | 3.2.S | EMA ASMF guideline (CHMP/QWP/227/02 rev); the applicant's part maps to 3.2.S per ICH M4Q. |
| EU_VARIATION_IA — Type IA Variation (Minor) | M1–M5 | Regulation (EC) 1234/2008 (variations) — affected CTD sections per ICH M4 with EU M1 v3.0 cover documentation. |
| EU_VARIATION_IB — Type IB Variation | M1–M5 | Regulation (EC) 1234/2008 — affected CTD sections per ICH M4 with EU M1 v3.0 cover documentation. |
| EU_VARIATION_II — Type II Variation (Major) | M1–M5 | Regulation (EC) 1234/2008 — affected CTD sections per ICH M4 with EU M1 v3.0 cover documentation. |
| EU_PIP — Paediatric Investigation Plan | M1 (EU regional) | Regulation (EC) No 1901/2006; EMA Paediatric Committee (PDCO). BP-W1-3: the PSP synonym was removed — a PIP is agreed with the PDCO on the EMA timeline and is not the same record, submission or deadline as an FDA PSP. |
| EU_RMP — Risk Management Plan | M1.8 | EU Module 1 Specification v3.0 — 1.8.2 risk-management plan; GVP Module V. |
| EU_RENEWAL — Renewal Application | M1 | Art 24 Directive 2001/83/EC — renewal application under EU M1 v3.0 with updated 2.4/2.5 addenda (the M1 assignment names the administrative core). |
| UK_MA — UK Marketing Authorisation | M1–M5 | ICH M4; MHRA UK eCTD Module 1 guidance (post-Brexit national procedure). |
| UK_IRP — International Recognition Procedure | M1–M5 | ICH M4; MHRA International Recognition Procedure guidance; UK eCTD Module 1. |
| UK_VARIATION — UK Marketing Authorisation Variation | M1–M5 | UK Human Medicines Regulations 2012 (as amended), mirroring Reg (EC) 1234/2008 classification; ICH M4; UK eCTD M1. |
| CA_CTA — Clinical Trial Application (Canada) | M1–M5 | ICH M4; Health Canada eCTD CA Module 1 specification; Food and Drug Regulations C.05. |
| CA_NDS — New Drug Submission (NDS) | M1–M5 | ICH M4; Health Canada eCTD CA Module 1 specification; Food and Drug Regulations C.08.002. |
| CA_SNDS — Supplemental New Drug Submission | M1–M5 | Supplements follow the parent NDS structure — ICH M4; Health Canada CA Module 1; C.08.003. |
| CA_ANDS — Abbreviated New Drug Submission | M1–M5 (BE reports in 5.3.1) | ICH M4 Annex — 5.3.1 Reports of Biopharmaceutic Studies. BP-W1-3: was M1–M3, same defect as US_ANDA — no module for the comparative bioavailability evidence the submission exists to present. |
| CA_MF — Master File (Canada) | 3.2.S | Health Canada Master File guidance; content maps to 3.2.S per ICH M4Q. |
| JP_CTN — Clinical Trial Notification | M1–M5 | ICH M4; PMDA J-eCTD Module 1 specification; PMD Act clinical trial notification. |
| JP_MKT_APPROVAL — Marketing Approval Application (Japan) | M1–M5 | ICH M4; PMDA J-eCTD Module 1 specification (J-NDA). |
| JP_MF — Master File (Japan) | 3.2.S | PMDA Master File registration system; content maps to 3.2.S per ICH M4Q. |
| JP_PARTIAL_CHANGE — Partial Change Application | M1–M5 | PMD Act partial-change approval — affected CTD sections per ICH M4; J-eCTD M1. |
| CN_CTA — Clinical Trial Application (China) | M1–M5 | NMPA Order 2019 No. 27/CDE CTD adoption; ICH M4 with CN regional Module 1. |
| CN_MAA — Marketing Authorization Application (China) | M1–M5 | NMPA CTD requirements (2019 No. 17 announcement family); ICH M4 with CN regional Module 1. |
| CN_SUPPLEMENT — Supplementary Application (China) | M1–M5 | NMPA supplementary application — affected CTD sections per ICH M4; CN regional M1. |
| CN_RENEWAL — Registration Renewal (China) | M1 | NMPA five-year re-registration — administrative dossier in the CN regional Module 1. |
| AU_CTA — Clinical Trial Approval (Australia) | M1–M5 | ICH M4; TGA AU eCTD Module 1 specification (CTA scheme). |
| AU_CAT1 — Category 1 Registration | M1–M5 | ICH M4; TGA AU eCTD Module 1 specification. |
| AU_CAT2 — Category 2 Registration | M1–M5 | ICH M4; TGA AU eCTD Module 1 specification; Category 2 relies on comparable-regulator reports. |
| CH_CTA — Clinical Trial Application (Switzerland) | M1–M5 | ICH M4; Swissmedic CH eCTD Module 1 specification; ClinO authorisation. |
| CH_MA — Marketing Authorisation (Switzerland) | M1–M5 | ICH M4; Swissmedic CH eCTD Module 1 specification; TPA Art 11. |
| BR_DDCM — Dossiê de Desenvolvimento Clínico de Medicamento | M1–M5 | ANVISA RDC 205/750 clinical development dossier; CTD organisation per ICH M4 (ANVISA CTD adoption RDC 753/2022). |
| BR_MA — Marketing Authorization (Brazil) | M1–M5 | ANVISA registration (registro) — CTD per RDC 753/2022; ICH M4. |
| IN_CT04 — Form CT-04 (New Drug Clinical Trial) | M1–M5 | CDSCO New Drugs and Clinical Trials Rules 2019 (Form CT-04); CTD organisation per ICH M4. |
| IN_CT11 — Form CT-11 (Clinical Trial Report) | M5 | CDSCO NDCT Rules 2019 (Form CT-11) — the clinical study report is M5 content per ICH M4. |
| IN_CT18 — Form CT-18 (New Drug Marketing) | M1–M5 | CDSCO NDCT Rules 2019 (Form CT-18); CTD per ICH M4. |
| IN_CT19 — Form CT-19 (Import Registration) | M1–M5 | CDSCO NDCT Rules 2019 (Form CT-19, import registration); CTD per ICH M4. |
| KR_IND — IND Application (South Korea) | M1–M5 | ICH M4 (MFDS CTD adoption); KR regional Module 1. |
| KR_MA_NEW — Marketing Application — New Drug (Korea) | M1–M5 | ICH M4 (MFDS CTD adoption); KR regional Module 1. |
| SG_NDA — New Drug Application (Singapore) | M1–M5 | HSA accepts ICH CTD or ACTD; ACTD Parts I–IV map onto CTD M1–M5 (ASEAN CTD guideline). |
| US_IND_SR — IND Safety Reports (IND-SR) | M5 | 21 CFR 312.32 — filed to the IND; report content per ICH M4 M5 conventions. Distinct from a SUSAR E2B transmission (see ICH_SUSAR). |
| ICH_PROTOCOL — Protocol & Protocol Amendments | M5 | ICH M4 Annex — 5.3.5.4 (protocols and amendments file with the study's clinical documentation); ICH E6. |
| ICH_IB — Investigator’s Brochure (IB) | M1 (US IND — FDA eCTD m1.14.4.1) | FDA eCTD Module 1 Specification v2.3 — m1.14.4.1 (investigator brochure). BP-W1-3: was M5, which is where the CLINICAL STUDY REPORTS live; the IB is regional Module 1 administrative/reference content for a US IND, so an M5 assignment puts it in the wrong backbone node and the sequence does not validate. |
| ICH_CSR — Clinical Study Report (CSR) | M5 (5.3.5) | ICH M4 Annex — 5.3.5 study reports; ICH E3 structure. |
| ICH_SAP — Statistical Analysis Plan (SAP) | M5 | ICH E9; the SAP travels as CSR Appendix 16.1.9 (ICH E3) within M5.3.5. |
| US_351K — Biosimilar Application (351(k)) | M1–M5 | ICH M4 Annex; FDA eCTD M1 v2.3; PHS Act §351(k) — full CTD with the analytical-similarity assessment in M3 and comparative clinical data in M5. |
| US_ACCEL_APPROVAL — Accelerated Approval Application | M1–M5 | An NDA/BLA under 21 CFR part 314 subpart H / part 601 subpart E — standard CTD M1–M5 (ICH M4; FDA eCTD M1 v2.3). |
| EU_CMA — Conditional Marketing Authorisation | M1–M5 | A conditional MA is a full MAA under Regulation (EC) 507/2006 — ICH M4; EU M1 v3.0. |
| US_ROLLING — Rolling Submission / Review | M1–M5 | A rolling review is the same CTD dossier submitted in completed units — ICH M4; FDA eCTD M1 v2.3; FDCA §506(c). |
| US_PSP — Pediatric Study Plan (PSP) | M1 | 21 CFR 314.55; FDCA §505B. BP-W1-3: the PIP synonym was removed — an initial PSP is submitted to FDA no later than 60 days after the end-of-Phase-2 meeting, a different agency and a different clock from the EMA PIP (EU_PIP). |
| US_CBE — CBE-30 / CBE-0 Supplement | M1–M3 | 21 CFR 314.70(c)–(d): labeling changes land in M1 (FDA eCTD M1 v2.3 m1.14), CMC changes in M3 (ICH M4Q). |
| US_NDA_ANNUAL — Annual Report (NDA/BLA) | M1 | FDA eCTD Module 1 Specification v2.3 — m1.13 annual report; 21 CFR 314.81(b)(2). |
| US_REMS — Risk Evaluation & Mitigation Strategy (REMS) | M1 | FDA eCTD Module 1 Specification v2.3 — m1.16 risk management plan; FDCA §505-1. |
| US_PMR — Post-Marketing Requirement (PMR) / PMC | M5 | Status reports travel in the annual report (21 CFR 314.81(b)(2)(vii), M1); completed PMR/PMC study reports file as M5 study reports per ICH M4. |
| US_SUPAC — SUPAC Supplement | M3 | SUPAC-IR/MR/SS guidances — the change documentation is Module 3 content (ICH M4Q granularity). |
| ICH_M3_DS — Module 3.2.S — Drug Substance | 3.2.S | ICH M4Q — 3.2.S drug substance. |
| ICH_M3_DP — Module 3.2.P — Drug Product | 3.2.P | ICH M4Q — 3.2.P drug product. |
| ICH_QOS — Quality Overall Summary (QOS) | 2.3 | ICH M4Q — Module 2.3 Quality Overall Summary. |
| ICH_COMPARABILITY — Comparability Protocol | 3.2.S/P | ICH Q5E (biologics comparability); documented in 3.2.S/3.2.P per ICH M4Q. A US comparability protocol is 21 CFR 314.70(e). |
| US_EA — Environmental Assessment (EA) | M1 | FDA eCTD Module 1 Specification v2.3 — m1.12.14 environmental analysis; 21 CFR part 25. |
| ICH_CTD_M1 — Module 1 — Administrative & Regional | M1 | ICH M4 — Module 1 is regional by definition; content per FDA eCTD M1 v2.3, EU M1 v3.0 and the other regional specifications. |
| ICH_CTD_M2 — Module 2 — Summaries & Overviews | M2 | ICH M4 / M4E / M4Q / M4S — Module 2 summaries. |
| ICH_CTD_M3 — Module 3 — Quality | M3 | ICH M4Q — Module 3 quality. |
| ICH_CTD_M4 — Module 4 — Nonclinical Study Reports | M4 | ICH M4S — Module 4 nonclinical study reports. |
| ICH_CTD_M5 — Module 5 — Clinical Study Reports | M5 | ICH M4E — Module 5 clinical study reports. |
| ICH_BENEFIT_RISK — Benefit-Risk Assessment | 2.5 | ICH M4E — 2.5.6 benefits and risks conclusions; also the core of a PBRER (ICH E2C(R2)). |
| EU_BIOSIMILAR_MAA — Biosimilar MAA | M1–M5 | ICH M4; EU M1 v3.0; similar-biological-medicinal-products guidelines (CHMP/437/04 rev) for the comparability exercise. |
| JP_BIOSIMILAR — Biosimilar (Japan) | M1–M5 | ICH M4; J-eCTD M1; PMDA biosimilar guideline (comparability against the reference product). |
| AU_BIOSIMILAR — Biosimilar (TGA) | M1–M5 | ICH M4; TGA AU eCTD M1; TGA biosimilar regulation (comparability against the reference). |
| EU_GENERIC_DCP — Generic Decentralized (DCP) | M1–M5 (BE in 5.3.1) | ICH M4 Annex — 5.3.1 Reports of Biopharmaceutic Studies. BP-W1-3: same defect class as US_ANDA — an abbreviated pathway scoped M1–M3 has no module for the bioequivalence evidence it exists to present. |
| ICH_CLIN_OVERVIEW — Clinical Overview (M2.5) | 2.5 | ICH M4E — Module 2.5 clinical overview. |
| ICH_CLIN_SUMMARY — Clinical Summary (M2.7) | 2.7 | ICH M4E — Module 2.7 clinical summary. |
| ICH_NONCLIN_OVERVIEW — Nonclinical Overview (M2.4) | 2.4 | ICH M4S — Module 2.4 nonclinical overview. |
| ICH_NONCLIN_SUMMARY — Nonclinical Summary (M2.6) | 2.6 | ICH M4S — Module 2.6 nonclinical written and tabulated summaries. |
| EU_LINE_EXTENSION — Line Extension | M1–M5 | Annex I Regulation (EC) 1234/2008 — a line extension is assessed as an MAA-shaped submission; ICH M4; EU M1 v3.0. |
| ICH_STABILITY_PROTOCOL — Stability Protocol | 3.2.P.8 | ICH M4Q — 3.2.P.8.2 (post-approval stability protocol; 3.2.S.7.2 for the substance); ICH Q1A/Q1E. |
| ICH_ECTD_BACKBONE — eCTD Backbone Structure | M1–M5 | ICH eCTD v3.2.2 (backbone/DTD) and eCTD v4.0 (HL7 RPS). |
| US_CTD_M1_REGIONAL — CTD Module 1 — US Regional | M1 | FDA eCTD Module 1 Specification v2.3. |
| EU_CTD_M1_REGIONAL — CTD Module 1 — EU Regional | M1 | EU Module 1 Specification v3.0. |
| JP_CTD_M1_REGIONAL — CTD Module 1 — JP Regional | M1 | PMDA J-eCTD specification (JP Module 1). |
| CA_CTD_M1_REGIONAL — CTD Module 1 — CA Regional | M1 | Health Canada eCTD Module 1 (CA regional) specification. |
| UK_CTD_M1_REGIONAL — CTD Module 1 — UK Regional | M1 | MHRA UK eCTD Module 1 guidance (post-Brexit national). |
| AU_CTD_M1_REGIONAL — CTD Module 1 — AU Regional | M1 | TGA AU eCTD Module 1 and regional specification. |
| CH_CTD_M1_REGIONAL — CTD Module 1 — CH Regional | M1 | Swissmedic CH eCTD Module 1 specification. |
| CN_CTD_M1_REGIONAL — CTD Module 1 — CN Regional | M1 | NMPA CTD regional Module 1 requirements. |

## Entries with no module assignment

These are not eCTD dossier content (E2B transmissions, designations, meeting requests, QMS records, device technical documentation under STED/eSTAR, work products) or have no established assignment. Absence is deliberate: an honest blank beats a guessed module.

| Entry | Dossier standard | Format |
|---|---|---|
| US_PRE_IND — Pre-IND Meeting Request | eCTD | eCTD |
| US_DMF — Drug Master File | eCTD | eCTD |
| US_510K — 510(k) Premarket Notification | eSTAR | eSTAR |
| US_PMA — Premarket Approval Application | eCTD | eCopy |
| US_DE_NOVO — De Novo Classification Request | eSTAR | eSTAR |
| US_EUA — Emergency Use Authorization | none | none |
| EU_ORPHAN — Orphan Drug Designation (ODD) | eCTD | eCTD |
| EU_CER — Clinical Evaluation Report (CER) | regional | MEDDEV 2.7/1 |
| EU_IVDR — IVDR Technical Documentation | regional | STED |
| UK_CTA — Clinical Trial Authorisation (UK) | eCTD | eCTD |
| CA_CTA_A — Clinical Trial Application Amendment | eCTD | eCTD |
| CA_SANDS — Supplemental Abbreviated New Drug Submission | eCTD | eCTD |
| JP_MINOR_CHANGE — Minor Change Notification | eCTD | eCTD |
| AU_CTN — Clinical Trial Notification (CTN) | eCTD | eCTD |
| BR_DEEC — Dossiê Específico de Ensaio Clínico | CTD | CTD |
| IN_CT06 — Form CT-06 (Bioequivalence/Bioavailability) | CTD | CTD |
| IN_CT07 — Form CT-07 (Post-Marketing Study) | CTD | CTD |
| EU_SCIENTIFIC_ADVICE — Scientific Advice / Protocol Assistance | eCTD | eCTD |
| US_ORPHAN — Orphan Drug Designation (ODD) | eCTD | eCTD |
| US_BTD — Breakthrough Therapy Designation (BTD) | none | Letter |
| EU_PRIME — PRIME Designation | eCTD | eCTD |
| US_FAST_TRACK — Fast Track Designation | none | Letter |
| US_RMAT — Regenerative Medicine Advanced Therapy (RMAT) | none | Letter |
| US_ICSR_15DAY — 15-Day Alert Report (ICSR) | none | E2B(R3) |
| US_PADER — Periodic Adverse Drug Experience Report (PADER) | none | none |
| US_513G — 513(g) Classification Request | none | Letter |
| US_QSUB — Pre-Submission (Q-Sub) | none | none |
| US_RFD — Request for Designation (RFD) | none | Letter |
| US_BREAKTHROUGH_DEVICE — Breakthrough Device Designation | none | Letter |
| US_HDE — Humanitarian Device Exemption (HDE) | regional | eCopy |
| US_IDE — Investigational Device Exemption (IDE) | none | none |
| EU_MDR_TECHDOC — EU MDR Technical Documentation | regional | STED |
| EU_SSCP — Summary of Safety & Clinical Performance (SSCP) | regional | none |
| EU_DOC — EU Declaration of Conformity (DoC) | regional | none |
| UK_DEVICE_REG — UK MHRA Registration | regional | none |
| CA_MDL — Health Canada Medical Device Licence (MDL) | regional | none |
| JP_SHONIN — PMDA Shonin (Approval) | regional | none |
| US_PMA_SUPP — PMA Supplement (Panel-Track / 180-day / Real-Time / 30-day / Special) | regional | eCopy |
| US_510K_MOD — 510(k) for Modified Device | eSTAR | eSTAR |
| US_PMA_ANNUAL — Annual Report (PMA) | none | none |
| US_MDR_REPORT — Medical Device Report (MDR) | none | eMDR |
| EU_PSUR_DEVICE — PSUR — Device (EU MDR Art. 86) | regional | none |
| EU_PMCF — Post-Market Clinical Follow-Up (PMCF) | regional | none |
| EU_FSCA — Field Safety Corrective Action (FSCA) | none | none |
| US_RECALL — Recall / Correction Report | none | none |
| US_DHF — Design History File (DHF) | none | none |
| ISO_RMF — Risk Management File (ISO 14971) | none | none |
| US_SAMD_PRESUB — SaMD Pre-Submission | none | none |
| US_PCCP — Predetermined Change Control Plan (PCCP) | none | none |
| IEC_62304 — Software Documentation (IEC 62304) | none | none |
| US_CYBERSECURITY — Cybersecurity Documentation | none | none |
| EU_IVDR_CLASSIFICATION — IVDR Classification Self-Assessment | regional | none |
| US_IVD_QSUB — IVD Pre-Submission (Q-Sub) | none | none |
| US_CLIA_WAIVER — CLIA Waiver Application | none | none |
| US_510K_IVD — 510(k) for IVD | eSTAR | eSTAR |
| US_PMA_IVD — PMA for IVD | regional | eCopy |
| US_DE_NOVO_IVD — De Novo for IVD | eSTAR | eSTAR |
| US_EUA_IVD — Emergency Use Authorization (EUA) for IVD | none | none |
| US_LDT — Laboratory Developed Test (LDT) Notification | none | none |
| US_CDX_PMA — CDx PMA | regional | eCopy |
| US_CDX_510K — CDx 510(k) (Expanded Use) | eSTAR | eSTAR |
| US_COMPLEMENTARY_DX — Complementary Diagnostic | regional | eSTAR/eCopy |
| US_CDX_CODEV — CDx Co-Development Agreement | none | none |
| EU_PER — Performance Evaluation Report (PER) | regional | none |
| EU_PERF_STUDY — Performance Study Application | regional | none |
| EU_REF_LAB — EU Reference Laboratory Consultation | regional | none |
| EU_SSCP_IVD — SSCP for IVD | regional | none |
| EU_PMPF — Post-Market Performance Follow-Up (PMPF) | regional | none |
| US_TREND_REPORT — Trend Reporting | none | none |
| US_DEVICE_REG — Annual Device Registration & Listing | none | none |
| EU_IVD_REEVAL — IVD Performance Re-Evaluation | regional | none |
| QMS_QUALITY_MANUAL — Quality Manual | none | none |
| QMS_DESIGN_CONTROLS — Design Controls / DHF | none | none |
| QMS_DMR — Device Master Record (DMR) | none | none |
| QMS_DHR — Device History Record (DHR) | none | none |
| QMS_MDSAP — MDSAP Audit Report | none | none |
| ICH_ICSR — Individual Case Safety Report (ICSR) | none | E2B(R3) |
| EU_PSMF — Pharmacovigilance System Master File (PSMF) | none | none |
| ICH_SIGNAL — Signal Detection & Evaluation Report | none | none |
| US_TYPE_A_MEETING — Type A Meeting | none | Letter |
| US_TYPE_B_MEETING — Type B Meeting | none | Letter |
| US_TYPE_C_MEETING — Type C Meeting | none | Letter |
| CA_PRESUB_MEETING — Pre-submission Meeting (Health Canada) | eCTD | eCTD |
| JP_PRE_CONSULT — Pre-application Consultation (PMDA) | CTD | CTD |
| AU_PRESUB_MEETING — Pre-submission Meeting (TGA) | none | Letter |
| JP_SAKIGAKE — Sakigake Designation | none | CTD |
| US_PRIORITY_REVIEW — Priority Review | none | none |
| EU_ACCEL_ASSESS — Accelerated Assessment | none | none |
| UK_ILAP — Innovation Passport (ILAP) | none | none |
| EU_EUDRAVIGILANCE_ICSR — EudraVigilance Report | none | E2B(R3) |
| ICH_SUSAR — SUSAR Report | none | E2B(R3) |
| EU_CEP — Certificate of Suitability (CEP) | none | none |
| EU_GMP_CERT — GMP Certificate | none | none |
| EU_NB_CONSULT — Notified Body Consultation | none | none |
| EU_MDR_CLASS_I — EU MDR Class I Self-declaration | regional | NeeS |
| EU_MDR_CLASS_IIA — EU MDR Class IIa | regional | NeeS |
| EU_MDR_CLASS_IIB — EU MDR Class IIb | regional | NeeS |
| EU_MDR_CLASS_III — EU MDR Class III | regional | NeeS |
| JP_NINTEI — Nintei Certification | CTD | CTD |
| CN_DEVICE_REG — Device Registration (NMPA) | CTD | CTD |
| AU_DEVICE_INCLUSION — Device Inclusion (ARTG) | none | ARTG |
| CH_DEVICE_CONFORMITY — Device Conformity (Swissmedic) | none | none |
| BR_DEVICE_REG — Device Registration (ANVISA) | none | none |
| EU_CLIN_INVESTIGATION — Clinical Investigation (EU MDR) | regional | NeeS |
| ISO_CIP — Clinical Investigation Plan (ISO 14155) | none | none |
| EU_SIG_CHANGE — Significant Change Notification | regional | NeeS |
| EU_MIR — Manufacturer Incident Report (MIR) | none | none |
| EU_TREND_REPORT_DEVICE — Trend Report (EU MDR) | none | none |
| EU_IVDR_CLASS_A — EU IVDR Class A | regional | NeeS |
| EU_IVDR_CLASS_B — EU IVDR Class B | regional | NeeS |
| EU_IVDR_CLASS_CD — EU IVDR Class C/D | regional | NeeS |
| EU_CDX_IVDR_D — CDx EU IVDR Class D | regional | NeeS |
| JP_CDX — CDx Approval (PMDA) | CTD | CTD |
| EU_IVD_CLIN_EVIDENCE — Clinical Evidence Summary (IVDR) | regional | NeeS |
| US_IVD_ANALYTICAL_VALIDATION — Analytical Validation Report | eSTAR | eSTAR |
| JP_IVD_APPROVAL — IVD Approval (PMDA) | CTD | CTD |
| CN_IVD_REG — IVD Registration (NMPA) | CTD | CTD |
| AU_IVD_INCLUSION — IVD Inclusion (ARTG) | none | ARTG |
| CA_IVD_LICENCE — IVD Licence (Health Canada) | none | none |
| EU_IVD_PMS_PLAN — Post-Market Surveillance Plan (IVDR) | regional | NeeS |
| EU_IVD_VIGILANCE — Vigilance Report (IVDR) | regional | NeeS |
| EU_PSUR_IVD — PSUR — IVD (IVDR Art. 81) | regional | none |
| EU_NEES — NeeS Submission | NeeS | NeeS |
| QMS_GMP_INSPECTION — GMP Inspection Readiness | none | none |
| QMS_GCP_COMPLIANCE — GCP Compliance Package | none | none |
| QMS_GLP_COMPLIANCE — GLP Compliance Package | none | none |
| QMS_QSR_820 — QSR (21 CFR 820) | none | none |
| QMS_ISO_13485 — ISO 13485 QMS | none | none |
| RI_STRATEGY — Regulatory Strategy Document | none | none |
| RI_GAP_ANALYSIS — Gap Analysis Report | none | none |
| RI_COMPETITIVE — Competitive Landscape Analysis | none | none |
| RI_HA_MEETING — Health Authority Meeting Minutes | none | none |

## Sign-off

Per the work order, this audit must not merge as settled without SME sign-off. The flags above are open questions for JM Smith; the traced authorities are assertions to be spot-checked.

- [ ] SME sign-off recorded (name, date): ______________________
