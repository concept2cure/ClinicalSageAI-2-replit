# Catalog filings that reach an application type only through the wizard's 'ctd' default (sweep items 3 and 4)

**Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **For:** the filing-types session (`011Fyq…`), which owns `shared/regulatory/filing-catalog.ts`, and the coordinating session. **Read at:** trunk `3c3a6665dc`, 2026-11-12. **Nothing is changed here**: this is the list the two sessions agreed to work from. Machine-readable: `unmapped.json`, produced by `list-unmapped.ts` (read-only, no database).

## What already exists (RULE 3)

| Piece | Path | Does | Does not |
|---|---|---|---|
| The catalog | `shared/regulatory/filing-catalog.ts` (`FILING_CATALOG`, `PATHWAY_BY_ID`) | States a pathway for the filings that are an application | State one for 111 of its 251 filings; its own comment says an unmapped filing fails closed |
| Filing document classes | `shared/regulatory/filing-document-classes.ts` | Make a supplement, a report, a meeting package, a CSR its own single-document class | Cover the filings below |
| The wizard's default | `client/src/concept2cure/v2/surfaces/Projects.tsx:379` and `:631` (`ctx.pathwayKey \|\| 'ctd'`) | Gives every filing with no pathway the pathway 'ctd' | Fail closed: `programTypeFor` (`shared/constants/domain/filing-application-type.ts`) turns 'ctd' into 'nda' |
| The market verdict | `server/services/regulatory/market-support.ts` | Says what the platform offers for an application type at an agency, and why not | Know the filing chosen: asked about 'nda', its reason says NDA |
| The intake's check | POST `/api/c2c/projects` (`52a4014a6`) | Refuses a catalog filing sent as a different application type than the one it creates | Help here: for these filings the one rule itself says 'nda' |

## The list

111 of 251 catalog filings have no stated pathway and no document class. 4 of them reach their type by their id alone and are not affected by the default (`eu_asmf` → dmf, `cn_maa` → maa, `sg_nda` → nda, `eu_biosimilar_maa` → maa). The other **107 become an NDA only through the default.** The verdict below is computed with every rule pack treated as present, so it is what the platform would say at the filing's own agency when its packs are active.

### Offered, built and sequenced as an NDA (sweep item 3): 12

| Filing | Id | Agency | Lane |
|---|---|---|---|
| Design Controls / DHF | `qms_design_controls` | FDA | cross_cutting |
| Device History Record (DHR) | `qms_dhr` | FDA | cross_cutting |
| Device Master Record (DMR) | `qms_dmr` | FDA | cross_cutting |
| QMSR (21 CFR 820) | `qms_qsr_820` | FDA | cross_cutting |
| Accelerated Approval Application | `us_accel_approval` | FDA | pharma_biotech |
| CTD Module 1 — US Regional | `us_ctd_m1_regional` | FDA | cross_cutting |
| Environmental Assessment (EA) | `us_ea` | FDA | pharma_biotech |
| 15-Day Alert Report (ICSR) | `us_icsr_15day` | FDA | pharma_biotech |
| Post-Marketing Requirement (PMR) / PMC | `us_pmr` | FDA | pharma_biotech |
| Priority Review | `us_priority_review` | FDA | pharma_biotech |
| Rolling Submission / Review | `us_rolling` | FDA | pharma_biotech |
| SUPAC Supplement | `us_supac` | FDA | pharma_biotech |

### Offered, authored as an NDA (sweep item 3): 42

| Filing | Id | Agency | Lane |
|---|---|---|---|
| Accelerated Assessment | `eu_accel_assess` | EMA | pharma_biotech |
| Conditional Marketing Authorisation | `eu_cma` | EMA | pharma_biotech |
| CTD Module 1 — EU Regional | `eu_ctd_m1_regional` | EMA | cross_cutting |
| EudraVigilance Report | `eu_eudravigilance_icsr` | EMA | pharma_biotech |
| Line Extension | `eu_line_extension` | EMA | pharma_biotech |
| NeeS Submission | `eu_nees` | EMA | cross_cutting |
| Orphan Drug Designation (ODD) | `eu_orphan` | EMA | pharma_biotech |
| Paediatric Investigation Plan | `eu_pip` | EMA | pharma_biotech |
| PRIME Designation | `eu_prime` | EMA | pharma_biotech |
| Pharmacovigilance System Master File (PSMF) | `eu_psmf` | EMA | cross_cutting |
| Renewal Application | `eu_renewal` | EMA | pharma_biotech |
| Risk Management Plan | `eu_rmp` | EMA | pharma_biotech |
| Scientific Advice / Protocol Assistance | `eu_scientific_advice` | EMA | pharma_biotech |
| Type IA Variation (Minor) | `eu_variation_ia` | EMA | pharma_biotech |
| Type IB Variation | `eu_variation_ib` | EMA | pharma_biotech |
| Type II Variation (Major) | `eu_variation_ii` | EMA | pharma_biotech |
| Abbreviated New Drug Submission | `ca_ands` | Health Canada | pharma_biotech |
| Clinical Trial Application Amendment | `ca_cta_a` | Health Canada | pharma_biotech |
| CTD Module 1 — CA Regional | `ca_ctd_m1_regional` | Health Canada | cross_cutting |
| Master File (Canada) | `ca_mf` | Health Canada | pharma_biotech |
| New Drug Submission (NDS) | `ca_nds` | Health Canada | pharma_biotech |
| Pre-submission Meeting (Health Canada) | `ca_presub_meeting` | Health Canada | pharma_biotech |
| Supplemental Abbreviated New Drug Submission | `ca_sands` | Health Canada | pharma_biotech |
| Supplemental New Drug Submission | `ca_snds` | Health Canada | pharma_biotech |
| IND Application (South Korea) | `kr_ind` | MFDS | pharma_biotech |
| Marketing Application — Generic (Korea) | `kr_ma_generic` | MFDS | pharma_biotech |
| Marketing Application — New Drug (Korea) | `kr_ma_new` | MFDS | pharma_biotech |
| Clinical Trial Authorisation (UK) | `uk_cta` | MHRA | pharma_biotech |
| CTD Module 1 — UK Regional | `uk_ctd_m1_regional` | MHRA | cross_cutting |
| Innovation Passport (ILAP) | `uk_ilap` | MHRA | pharma_biotech |
| International Recognition Procedure | `uk_irp` | MHRA | pharma_biotech |
| UK Marketing Authorisation | `uk_ma` | MHRA | pharma_biotech |
| UK Marketing Authorisation Variation | `uk_variation` | MHRA | pharma_biotech |
| CTD Module 1 — CN Regional | `cn_ctd_m1_regional` | NMPA | cross_cutting |
| Registration Renewal (China) | `cn_renewal` | NMPA | pharma_biotech |
| Supplementary Application (China) | `cn_supplement` | NMPA | pharma_biotech |
| Biosimilar (TGA) | `au_biosimilar` | TGA | pharma_biotech |
| Category 1 Registration | `au_cat1` | TGA | pharma_biotech |
| Category 2 Registration | `au_cat2` | TGA | pharma_biotech |
| Clinical Trial Approval (Australia) | `au_cta` | TGA | pharma_biotech |
| CTD Module 1 — AU Regional | `au_ctd_m1_regional` | TGA | cross_cutting |
| Pre-submission Meeting (TGA) | `au_presub_meeting` | TGA | pharma_biotech |

### Not offered, for a reason that names the NDA (sweep item 4): 53

| Filing | Id | Agency | Lane |
|---|---|---|---|
| Dossiê de Desenvolvimento Clínico de Medicamento | `br_ddcm` | ANVISA | pharma_biotech |
| Dossiê Específico de Ensaio Clínico | `br_deec` | ANVISA | pharma_biotech |
| Marketing Authorization (Brazil) | `br_ma` | ANVISA | pharma_biotech |
| Form CT-04 (New Drug Clinical Trial) | `in_ct04` | CDSCO | pharma_biotech |
| Form CT-06 (Bioequivalence/Bioavailability) | `in_ct06` | CDSCO | pharma_biotech |
| Form CT-07 (Post-Marketing Study) | `in_ct07` | CDSCO | pharma_biotech |
| Form CT-11 (Clinical Trial Report) | `in_ct11` | CDSCO | pharma_biotech |
| Form CT-18 (New Drug Marketing) | `in_ct18` | CDSCO | pharma_biotech |
| Form CT-19 (Import Registration) | `in_ct19` | CDSCO | pharma_biotech |
| Form CT-21 (Generic Drug Marketing) | `in_ct21` | CDSCO | pharma_biotech |
| Certificate of Suitability (CEP) | `eu_cep` | EDQM | pharma_biotech |
| Generic Drug Application (Singapore) | `sg_gda` | HSA | pharma_biotech |
| Benefit-Risk Assessment | `ich_benefit_risk` | ICH / Global | cross_cutting |
| Clinical Summary (M2.7) | `ich_clin_summary` | ICH / Global | pharma_biotech |
| Comparability Protocol | `ich_comparability` | ICH / Global | pharma_biotech |
| Module 1 — Administrative & Regional | `ich_ctd_m1` | ICH / Global | cross_cutting |
| Module 2 — Summaries & Overviews | `ich_ctd_m2` | ICH / Global | cross_cutting |
| Module 3 — Quality | `ich_ctd_m3` | ICH / Global | cross_cutting |
| Module 4 — Nonclinical Study Reports | `ich_ctd_m4` | ICH / Global | cross_cutting |
| Module 5 — Clinical Study Reports | `ich_ctd_m5` | ICH / Global | cross_cutting |
| eCTD Backbone Structure | `ich_ectd_backbone` | ICH / Global | cross_cutting |
| Individual Case Safety Report (ICSR) | `ich_icsr` | ICH / Global | cross_cutting |
| Module 3.2.P — Drug Product | `ich_m3_dp` | ICH / Global | pharma_biotech |
| Module 3.2.S — Drug Substance | `ich_m3_ds` | ICH / Global | pharma_biotech |
| Nonclinical Overview (M2.4) | `ich_nonclin_overview` | ICH / Global | pharma_biotech |
| Nonclinical Summary (M2.6) | `ich_nonclin_summary` | ICH / Global | pharma_biotech |
| Quality Overall Summary (QOS) | `ich_qos` | ICH / Global | pharma_biotech |
| Signal Detection & Evaluation Report | `ich_signal` | ICH / Global | cross_cutting |
| Stability Protocol | `ich_stability_protocol` | ICH / Global | pharma_biotech |
| SUSAR Report | `ich_susar` | ICH / Global | pharma_biotech |
| Tabulated Summaries (M2.7.4) | `ich_tabulated_summaries` | ICH / Global | pharma_biotech |
| GCP Compliance Package | `qms_gcp_compliance` | ICH / Global | cross_cutting |
| GLP Compliance Package | `qms_glp_compliance` | ICH / Global | cross_cutting |
| GMP Inspection Readiness | `qms_gmp_inspection` | ICH / Global | cross_cutting |
| Competitive Landscape Analysis | `ri_competitive` | ICH / Global | cross_cutting |
| Gap Analysis Report | `ri_gap_analysis` | ICH / Global | cross_cutting |
| Health Authority Meeting Minutes | `ri_ha_meeting` | ICH / Global | cross_cutting |
| Regulatory Strategy Document | `ri_strategy` | ICH / Global | cross_cutting |
| MDSAP Audit Report | `qms_mdsap` | IMDRF | cross_cutting |
| ISO 13485 QMS | `qms_iso_13485` | ISO | cross_cutting |
| Quality Manual | `qms_quality_manual` | ISO | cross_cutting |
| Generic Decentralized (DCP) | `eu_generic_dcp` | National competent authority | pharma_biotech |
| GMP Certificate | `eu_gmp_cert` | National competent authority | pharma_biotech |
| Biosimilar (Japan) | `jp_biosimilar` | PMDA | pharma_biotech |
| CTD Module 1 — JP Regional | `jp_ctd_m1_regional` | PMDA | cross_cutting |
| Master File (Japan) | `jp_mf` | PMDA | pharma_biotech |
| Minor Change Notification | `jp_minor_change` | PMDA | pharma_biotech |
| Partial Change Application | `jp_partial_change` | PMDA | pharma_biotech |
| Pre-application Consultation (PMDA) | `jp_pre_consult` | PMDA | pharma_biotech |
| Sakigake Designation | `jp_sakigake` | PMDA | pharma_biotech |
| Clinical Trial Application (Switzerland) | `ch_cta` | Swissmedic | pharma_biotech |
| CTD Module 1 — CH Regional | `ch_ctd_m1_regional` | Swissmedic | cross_cutting |
| Marketing Authorisation (Switzerland) | `ch_ma` | Swissmedic | pharma_biotech |

## The agreed split (by message, 2026-11-12)

- **Filing types (`011Fyq…`):** each mapping decision, in `filing-catalog.ts` and the filing document classes, red first. Its first read: accelerated approval and rolling review are ways of filing an NDA or BLA, not their own applications; Priority Review, the Environmental Assessment, the 15-day safety report, SUPAC and PMR/PMC are documents or requests, none of them an NDA. A filing it would make not creatable goes to the founder.
- **This session, after those mappings are on origin:** remove the `\|\| 'ctd'` default (`Projects.tsx`), so a filing with no stated pathway and no document class has no application type (`filing-application-type.ts`), and the picker says so in the filing's own name (`AnaVerbs.tsx`, with the coordinating session's leave), never "NDA". Each filing whose state changes is named in that change's evidence.
- **P-122:** a wrong NDA becoming a correct single-document project removes nothing. A filing that would stop being creatable is the founder's call, asked by filing types.
