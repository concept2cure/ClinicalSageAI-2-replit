/**
 * Regulatory template library (extended pathways) -- ported verbatim from concept2cure-v2:
 *   app/editor-ta-templates.jsx -> REG_TEMPLATES (mdr through who)
 *
 * GENERATED from the kit data file -- edit the kit first, then re-port.
 */

import type { TemplateGroup } from './editor-templates-data';

/* ---- Extended pathway templates ---- */

export const REG_TEMPLATES_EXTENDED: Record<string, readonly TemplateGroup[]> = {

  /* EU MDR Technical Documentation */
  mdr: [
    { group: 'Annex II — Technical Documentation', items: [
      { id: 't-mdr-desc', num: '1', label: 'Device description & specification' },
      { id: 't-mdr-info', num: '2', label: 'Information supplied by manufacturer (label/IFU)' },
      { id: 't-mdr-design', num: '3', label: 'Design & manufacturing information' },
      { id: 't-mdr-gspr', num: '4', label: 'GSPR checklist (Annex I — 23 requirements)' },
      { id: 't-mdr-ba', num: '5', label: 'Benefit-risk analysis & risk management (ISO 14971)' },
      { id: 't-mdr-vv', num: '6', label: 'Product verification & validation' },
    ] },
    { group: 'Annex III — Clinical Evaluation', items: [
      { id: 't-mdr-cep', num: '7', label: 'Clinical evaluation plan (MEDDEV 2.7/1)' },
      { id: 't-mdr-lit', num: '8', label: 'Literature review & appraisal' },
      { id: 't-mdr-clin', num: '9', label: 'Clinical investigation data' },
      { id: 't-mdr-cer', num: '10', label: 'Clinical evaluation report' },
      { id: 't-mdr-sscp', num: '11', label: 'SSCP' },
    ] },
    { group: 'Post-Market', items: [
      { id: 't-mdr-pms', num: '12', label: 'PMS plan' },
      { id: 't-mdr-pmcf', num: '13', label: 'PMCF plan & report' },
      { id: 't-mdr-psur', num: '14', label: 'PSUR — device' },
    ] },
  ],

  /* HDE */
  hde: [
    { group: 'Administrative', items: [
      { id: 't-hde-form', num: 'A.2', label: 'HDE application form' },
      { id: 't-hde-hud', num: 'A.3', label: 'HUD designation letter' },
    ] },
    { group: 'Device & Evidence', items: [
      { id: 't-hde-desc', num: 'B.1', label: 'Device description' },
      { id: 't-hde-prev', num: 'B.3', label: 'Prevalence data (< 8,000/year)' },
      { id: 't-hde-bench', num: 'C.1', label: 'Non-clinical testing' },
      { id: 't-hde-clin', num: 'C.2', label: 'Clinical data (probable benefit)' },
      { id: 't-hde-risk', num: 'C.3', label: 'Risk-benefit profile' },
    ] },
  ],

  /* STED (IMDRF) */
  sted: [
    { group: 'STED Chapters', items: [
      { id: 't-sted-desc', num: '1', label: 'Device description (intended use, principles)' },
      { id: 't-sted-ref', num: '2', label: 'Reference to regulatory requirements & standards' },
      { id: 't-sted-design', num: '3', label: 'Design & manufacturing' },
      { id: 't-sted-risk', num: '4', label: 'Risk analysis (ISO 14971)' },
      { id: 't-sted-safety', num: '5', label: 'Product safety (IEC 60601, biocompat, sterility, EMC)' },
      { id: 't-sted-perf', num: '6', label: 'Preclinical & clinical performance' },
      { id: 't-sted-sw', num: '7', label: 'Software (IEC 62304) & cybersecurity' },
      { id: 't-sted-label', num: '8', label: 'Labelling (IFU, symbols)' },
    ] },
  ],

  /* Designation */
  designation: [
    { group: 'Designation Request', items: [
      { id: 't-des-cover', num: 'A.1', label: 'Cover letter / request letter' },
      { id: 't-des-rationale', num: 'B.1', label: 'Clinical rationale & unmet need' },
      { id: 't-des-evidence', num: 'B.2', label: 'Preliminary clinical evidence' },
      { id: 't-des-plan', num: 'B.3', label: 'Development program plan' },
      { id: 't-des-bt', num: '—', label: 'Breakthrough therapy designation request (FDA)' },
      { id: 't-des-ft', num: '—', label: 'Fast track designation request (FDA)' },
      { id: 't-des-acc', num: '—', label: 'Accelerated approval justification (FDA)' },
      { id: 't-des-pr', num: '—', label: 'Priority review request (FDA)' },
      { id: 't-des-rmat', num: '—', label: 'RMAT designation request (FDA CBER)' },
      { id: 't-des-prime', num: '—', label: 'PRIME designation request (EMA)' },
      { id: 't-des-orphan-fda', num: '—', label: 'Orphan drug designation request (FDA)' },
      { id: 't-des-orphan-ema', num: '—', label: 'Orphan designation request (EMA)' },
      { id: 't-des-sakigake', num: '—', label: 'SAKIGAKE designation request (PMDA)' },
      { id: 't-des-cond', num: '—', label: 'Conditional MA request (EMA)' },
    ] },
  ],

  /* Post-Market Pharma */
  postmarket: [
    { group: 'Annual / Periodic', items: [
      { id: 't-pm-annual', num: '1.1', label: 'Annual report (NDA/BLA)' },
      { id: 't-pm-psur', num: '2.1', label: 'PSUR / PBRER (ICH E2C(R2))' },
      { id: 't-pm-rmp', num: '2.3', label: 'Risk management plan (RMP)' },
      { id: 't-pm-rems', num: '2.4', label: 'REMS assessment report' },
    ] },
    { group: 'Safety & Commitments', items: [
      { id: 't-pm-signal', num: '2.2', label: 'Signal evaluation summary' },
      { id: 't-pm-pmr', num: '3.1', label: 'Post-marketing requirement (PMR/PMC)' },
      { id: 't-pm-supac', num: '3.2', label: 'SUPAC supplement' },
      { id: 't-pm-medwatch', num: '3.3', label: 'MedWatch report (FDA 3500A)' },
      { id: 't-pm-dsur', num: '3.4', label: 'Development safety update report (DSUR / ICH E2F)' },
    ] },
  ],

  /* Pre-Submission (Device) */
  presub: [
    { group: 'Pre-Submission Package', items: [
      { id: 't-ps-cover', num: 'A.1', label: 'Cover letter' },
      { id: 't-ps-desc', num: 'A.3', label: 'Device description & intended use' },
      { id: 't-ps-questions', num: 'B.1', label: 'Specific questions for FDA feedback' },
      { id: 't-ps-strategy', num: 'B.2', label: 'Proposed testing / clinical strategy' },
      { id: 't-ps-pred', num: 'B.4', label: 'Predicate / classification analysis' },
      { id: 't-ps-pathway', num: 'B.5', label: 'Proposed regulatory pathway rationale' },
    ] },
  ],

  /* SaMD / AI-ML */
  samd: [
    { group: 'SaMD Classification', items: [
      { id: 't-samd-desc', num: '1', label: 'Software description & SaMD classification (IMDRF N12)' },
      { id: 't-samd-ifu', num: '2', label: 'Statement of intended use / indications' },
      { id: 't-samd-clin', num: '3', label: 'Clinical association & scientific validity' },
    ] },
    { group: 'Software Documentation', items: [
      { id: 't-samd-sdp', num: '4', label: 'Software development plan (IEC 62304)' },
      { id: 't-samd-req', num: '5', label: 'Software requirements specification' },
      { id: 't-samd-arch', num: '6', label: 'Software architecture design' },
      { id: 't-samd-test', num: '7', label: 'Software verification & validation' },
    ] },
    { group: 'AI/ML & Cybersecurity', items: [
      { id: 't-samd-pccp', num: '9', label: 'Predetermined Change Control Plan (PCCP)' },
      { id: 't-samd-gmlp', num: '—', label: 'Good Machine Learning Practice (GMLP) report' },
      { id: 't-samd-data', num: '10', label: 'Training data management & governance' },
      { id: 't-samd-perf', num: '11', label: 'Algorithm performance (real-world)' },
      { id: 't-samd-threat', num: '12', label: 'Threat model & security risk assessment' },
      { id: 't-samd-sbom', num: '13', label: 'Software bill of materials (SBOM)' },
    ] },
  ],

  /* QMS */
  qms: [
    { group: 'Quality System', items: [
      { id: 't-qms-manual', num: '1', label: 'Quality manual' },
      { id: 't-qms-policy', num: '2', label: 'Quality policy & objectives' },
      { id: 't-qms-org', num: '3', label: 'Organization chart & responsibilities' },
    ] },
    { group: 'Design Controls', items: [
      { id: 't-qms-dhf', num: '4', label: 'Design history file (DHF)' },
      { id: 't-qms-dmr', num: '5', label: 'Device master record (DMR)' },
      { id: 't-qms-dio', num: '7', label: 'Design input / output specification' },
      { id: 't-qms-vv', num: '—', label: 'Design verification & validation report' },
    ] },
    { group: 'Audit & Compliance', items: [
      { id: 't-qms-mdsap', num: '8', label: 'MDSAP audit report' },
      { id: 't-qms-capa', num: '9', label: 'CAPA procedures' },
      { id: 't-qms-nc', num: '10', label: 'Nonconformance management' },
      { id: 't-qms-train', num: '11', label: 'Training & competency records' },
      { id: 't-qms-mgmt', num: '—', label: 'Management review report' },
      { id: 't-qms-supplier', num: '—', label: 'Supplier qualification report' },
    ] },
  ],

  /* Pharmacovigilance */
  pv: [
    { group: 'Case Safety', items: [
      { id: 't-pv-icsr', num: '1', label: 'ICSR (E2B(R3) format)' },
      { id: 't-pv-sop', num: '2', label: 'Case triage & assessment SOP' },
      { id: 't-pv-followup', num: '3', label: 'Follow-up report procedures' },
      { id: 't-pv-aggregate', num: '—', label: 'Aggregate safety report' },
    ] },
    { group: 'System & Signal', items: [
      { id: 't-pv-psmf', num: '4', label: 'PV system master file (PSMF)' },
      { id: 't-pv-signal', num: '5', label: 'Signal detection & evaluation report' },
      { id: 't-pv-br', num: '6', label: 'Benefit-risk assessment' },
      { id: 't-pv-sdea', num: '—', label: 'Signal detection and evaluation assessment' },
    ] },
  ],

  /* Clinical Documents */
  clindoc: [
    { group: 'Trial Notification & Planning', items: [
      { id: 't-cd-ctn', num: '1', label: 'Clinical trial notification (CTN/CTA)' },
      { id: 't-cd-protocol', num: '2', label: 'Clinical study protocol (ICH E6)' },
      { id: 't-cd-sap', num: '3', label: 'Statistical analysis plan' },
      { id: 't-cd-icf', num: '4', label: 'Informed consent form' },
      { id: 't-cd-dmp', num: '—', label: 'Data management plan' },
    ] },
    { group: 'Safety & Reporting', items: [
      { id: 't-cd-dsur', num: '5', label: 'DSUR (ICH E2F)' },
      { id: 't-cd-ib', num: '6', label: 'Investigator brochure (IB)' },
      { id: 't-cd-tmf', num: '—', label: 'Trial master file (TMF) index' },
    ] },
    { group: 'Pediatric', items: [
      { id: 't-cd-psp', num: '7', label: 'Pediatric study plan (PSP)' },
      { id: 't-cd-pip', num: '—', label: 'Paediatric investigation plan (PIP) — EMA' },
      { id: 't-cd-ped', num: '8', label: 'Pediatric extrapolation report' },
    ] },
  ],

  /* EUA */
  eua: [
    { group: 'EUA Request', items: [
      { id: 't-eua-letter', num: '1', label: 'EUA request letter' },
      { id: 't-eua-scope', num: '2', label: 'Product scope & intended use' },
      { id: 't-eua-safety', num: '3', label: 'Safety data (known & potential risks)' },
      { id: 't-eua-eff', num: '4', label: 'Effectiveness data' },
      { id: 't-eua-alt', num: '5', label: 'Assessment of alternatives' },
      { id: 't-eua-cond', num: '6', label: 'Proposed conditions of authorization' },
      { id: 't-eua-fs', num: '7', label: 'Fact sheet (HCP & recipient)' },
    ] },
  ],

  /* CDx */
  cdx: [
    { group: 'Administrative', items: [
      { id: 't-cdx-cover', num: 'A.1', label: 'Cover letter' },
      { id: 't-cdx-class', num: 'A.2', label: 'Classification & regulatory pathway' },
      { id: 't-cdx-agree', num: 'A.3', label: 'Co-development agreement' },
    ] },
    { group: 'Performance', items: [
      { id: 't-cdx-desc', num: 'B.1', label: 'Assay description & principle' },
      { id: 't-cdx-valid', num: 'B.2', label: 'Analytical validation' },
      { id: 't-cdx-bridge', num: 'C.1', label: 'Clinical bridging study — Dx ↔ therapeutic' },
      { id: 't-cdx-perf', num: 'C.2', label: 'Clinical performance (PPA, NPA)' },
    ] },
  ],

  /* Post-Market Device */
  pmdevice: [
    { group: 'AE Reporting', items: [
      { id: 't-pmd-mdr', num: '1', label: 'Medical device report (MDR / 21 CFR 803)' },
      { id: 't-pmd-mir', num: '2', label: 'Manufacturer incident report (MIR) — EU' },
      { id: 't-pmd-trend', num: '3', label: 'Trend report' },
    ] },
    { group: 'Corrective Actions', items: [
      { id: 't-pmd-recall', num: '4', label: 'Recall / correction report' },
      { id: 't-pmd-fsca', num: '5', label: 'Field safety corrective action (FSCA)' },
      { id: 't-pmd-fsn', num: '6', label: 'Field safety notice' },
    ] },
    { group: 'Surveillance', items: [
      { id: 't-pmd-pmcf', num: '7', label: 'PMCF report' },
      { id: 't-pmd-psur', num: '8', label: 'PSUR — device' },
      { id: 't-pmd-annual', num: '10', label: 'Annual report (PMA)' },
    ] },
  ],

  /* IVD Pre-Sub */
  ivdpresub: [
    { group: 'Pre-Submission', items: [
      { id: 't-ivdps-cover', num: 'A.1', label: 'Cover letter' },
      { id: 't-ivdps-desc', num: 'A.2', label: 'Device/assay description & intended use' },
      { id: 't-ivdps-questions', num: 'B.1', label: 'Specific questions for CDRH feedback' },
      { id: 't-ivdps-clia', num: 'B.2', label: 'CLIA waiver justification' },
      { id: 't-ivdps-studies', num: 'B.3', label: 'Proposed analytical & clinical studies' },
    ] },
  ],

  /* LDT */
  ldt: [
    { group: 'LDT Notification', items: [
      { id: 't-ldt-cover', num: '1', label: 'Notification letter' },
      { id: 't-ldt-desc', num: '2', label: 'Test description & methodology' },
      { id: 't-ldt-ifu', num: '3', label: 'Intended use & clinical significance' },
      { id: 't-ldt-valid', num: '4', label: 'Analytical validation summary' },
      { id: 't-ldt-clin', num: '5', label: 'Clinical validation / performance' },
      { id: 't-ldt-lab', num: '6', label: 'Laboratory qualifications (CLIA cert)' },
    ] },
  ],

  /* International Device Registration */
  intldevice: [
    { group: 'Common Documentation', items: [
      { id: 't-id-desc', num: '1', label: 'Device description & intended purpose' },
      { id: 't-id-class', num: '2', label: 'Classification (per jurisdiction)' },
      { id: 't-id-risk', num: '3', label: 'Risk management file (ISO 14971)' },
      { id: 't-id-test', num: '5', label: 'Performance testing & validation' },
      { id: 't-id-clin', num: '6', label: 'Clinical evidence / evaluation' },
    ] },
    { group: 'Region-Specific', items: [
      { id: 't-id-ukca', num: '—', label: 'UKCA declaration & MHRA registration' },
      { id: 't-id-hc', num: '—', label: 'Health Canada MDL application' },
      { id: 't-id-pmda', num: '—', label: 'PMDA Shonin application (Japan)' },
      { id: 't-id-nmpa', num: '—', label: 'NMPA registration application (China)' },
      { id: 't-id-tga', num: '—', label: 'TGA registration / ARTG inclusion (Australia)' },
      { id: 't-id-anvisa', num: '—', label: 'ANVISA registration (Brazil)' },
      { id: 't-id-swiss', num: '—', label: 'Swissmedic conformity assessment (Switzerland)' },
      { id: 't-id-doc', num: '—', label: 'EU Declaration of Conformity (DoC)' },
    ] },
  ],

  /* Scientific Advice */
  advice: [
    { group: 'Briefing Package', items: [
      { id: 't-adv-cover', num: 'A.1', label: 'Cover letter / meeting request' },
      { id: 't-adv-bg', num: 'A.2', label: 'Product background & development history' },
      { id: 't-adv-questions', num: 'B.1', label: 'Questions for agency feedback' },
      { id: 't-adv-position', num: 'B.2', label: 'Sponsor position & proposed approach' },
      { id: 't-adv-plan', num: 'B.4', label: 'Proposed development plan' },
      { id: 't-adv-ema', num: '—', label: 'EMA Scientific Advice request form' },
      { id: 't-adv-pmda', num: '—', label: 'PMDA consultation request (面談申請書)' },
      { id: 't-adv-hc', num: '—', label: 'Health Canada pre-submission meeting request' },
    ] },
  ],

  /* IVD Post-Market */
  ivdpostmarket: [
    { group: 'Performance Follow-Up', items: [
      { id: 't-ivdpm-pmpf', num: '1', label: 'PMPF report' },
      { id: 't-ivdpm-per', num: '2', label: 'Ongoing performance evaluation updates' },
    ] },
    { group: 'Safety & Registration', items: [
      { id: 't-ivdpm-trend', num: '3', label: 'Trend reporting' },
      { id: 't-ivdpm-psur', num: '4', label: 'PSUR — IVD' },
      { id: 't-ivdpm-fsca', num: '5', label: 'FSCA — IVD' },
      { id: 't-ivdpm-sscp', num: '7', label: 'SSCP for IVD' },
    ] },
  ],

  /* ---- Region-Specific Templates ---- */

  /* PMDA (Japan) */
  pmda: [
    { group: 'J-NDA / J-CTD', items: [
      { id: 't-pmda-form', num: '—', label: 'Shonin application form (承認申請書)' },
      { id: 't-pmda-m1', num: '1', label: 'Module 1 — Japan-specific administrative documents' },
      { id: 't-pmda-ctd15', num: '1.5', label: 'Origin / course of discovery' },
      { id: 't-pmda-ctd17', num: '1.7', label: 'GMP-related documents (PMDA format)' },
      { id: 't-pmda-ctd111', num: '1.11', label: 'Certification of foreign manufacturer (外国製造業者認定)' },
      { id: 't-pmda-ctd112', num: '1.12', label: 'Package insert (添付文書)' },
      { id: 't-pmda-rmp', num: '—', label: 'RMP (医薬品リスク管理計画書)' },
      { id: 't-pmda-ctdr', num: '3.2.R', label: 'Regional information (Japan-specific quality data)' },
      { id: 't-pmda-bridging', num: '—', label: 'Bridging study evaluation report (ICH E5)' },
      { id: 't-pmda-ethnic', num: '—', label: 'Ethnic factors assessment (日本人データ)' },
    ] },
    { group: 'Device (PMDA)', items: [
      { id: 't-pmda-shonin', num: '—', label: 'Medical device Shonin application' },
      { id: 't-pmda-sted', num: '—', label: 'STED for PMDA submission' },
      { id: 't-pmda-clin-dev', num: '—', label: 'Clinical trial notification (治験届)' },
    ] },
  ],

  /* NMPA (China) */
  nmpa: [
    { group: 'Drug Registration (CDE)', items: [
      { id: 't-nmpa-form', num: '—', label: 'Drug registration application form (药品注册申请表)' },
      { id: 't-nmpa-m1', num: '1', label: 'Module 1 — China-specific administrative documents' },
      { id: 't-nmpa-proof', num: '1.1', label: 'Proof documents (GMP certificate, CEP)' },
      { id: 't-nmpa-spc', num: '1.3', label: 'Proposed SPC / package insert (说明书)' },
      { id: 't-nmpa-label', num: '1.4', label: 'Proposed labeling (标签)' },
      { id: 't-nmpa-ethnic', num: '—', label: 'Ethnic sensitivity assessment (种族敏感性)' },
      { id: 't-nmpa-bridging', num: '—', label: 'Multi-regional clinical trial data (MRCT / ICH E17)' },
      { id: 't-nmpa-ctd', num: '2–5', label: 'CTD Modules 2–5 (eCTD format)' },
    ] },
    { group: 'Device (NMPA)', items: [
      { id: 't-nmpa-devform', num: '—', label: 'Device registration application (医疗器械注册申请表)' },
      { id: 't-nmpa-techdoc', num: '—', label: 'Technical documentation (per NMPA format)' },
      { id: 't-nmpa-clinical', num: '—', label: 'Clinical evaluation report (临床评价报告)' },
    ] },
  ],

  /* TGA (Australia) */
  tga: [
    { group: 'Drug (TGA)', items: [
      { id: 't-tga-form', num: '—', label: 'Application form (Category 1 / Category 3)' },
      { id: 't-tga-aust', num: '—', label: 'Australian-specific data (PI, CMI)' },
      { id: 't-tga-pi', num: '—', label: 'Product information (PI)' },
      { id: 't-tga-cmi', num: '—', label: 'Consumer medicines information (CMI)' },
      { id: 't-tga-ger', num: '—', label: 'Generic evaluation report' },
      { id: 't-tga-ctd', num: '2–5', label: 'CTD Modules 2–5 (eCTD format)' },
    ] },
    { group: 'Device (TGA)', items: [
      { id: 't-tga-artg', num: '—', label: 'ARTG application' },
      { id: 't-tga-conform', num: '—', label: 'Conformity assessment (in-house / NATA)' },
      { id: 't-tga-devcie', num: '—', label: 'Australian Declaration of Conformity' },
    ] },
  ],

  /* Health Canada */
  healthcanada: [
    { group: 'NDS / SNDS / ANDS', items: [
      { id: 't-hc-form', num: '—', label: 'Drug submission application form (HC/SC 3011)' },
      { id: 't-hc-pm', num: '—', label: 'Product monograph (PM)' },
      { id: 't-hc-m1', num: '1', label: 'Module 1 — Canada-specific administrative information' },
      { id: 't-hc-nds', num: '—', label: 'New drug submission (NDS)' },
      { id: 't-hc-snds', num: '—', label: 'Supplemental NDS (SNDS)' },
      { id: 't-hc-ands', num: '—', label: 'Abbreviated NDS (ANDS)' },
      { id: 't-hc-noc-c', num: '—', label: 'NOC/c (Notice of Compliance with conditions)' },
      { id: 't-hc-ped', num: '—', label: 'Pediatric assessment' },
    ] },
    { group: 'Device (HC)', items: [
      { id: 't-hc-mdl', num: '—', label: 'Medical device licence application' },
      { id: 't-hc-class', num: '—', label: 'Device classification (Class I–IV)' },
      { id: 't-hc-devform', num: '—', label: 'HC application for Class III/IV devices' },
    ] },
  ],

  /* MHRA (UK) */
  mhra: [
    { group: 'Drug (MHRA)', items: [
      { id: 't-mhra-form', num: '—', label: 'Marketing authorisation application form (UK)' },
      { id: 't-mhra-smpc', num: '—', label: 'SmPC (UK national)' },
      { id: 't-mhra-pil', num: '—', label: 'Patient information leaflet (PIL, UK)' },
      { id: 't-mhra-ilap', num: '—', label: 'ILAP (Innovative Licensing & Access Pathway) submission' },
      { id: 't-mhra-ctd', num: '2–5', label: 'CTD Modules 2–5' },
    ] },
    { group: 'Device (MHRA)', items: [
      { id: 't-mhra-ukca', num: '—', label: 'UKCA declaration of conformity' },
      { id: 't-mhra-reg', num: '—', label: 'Device registration (MHRA)' },
      { id: 't-mhra-clinical', num: '—', label: 'Clinical investigation notification (UK)' },
    ] },
  ],

  /* Swissmedic */
  swissmedic: [
    { group: 'Drug (Swissmedic)', items: [
      { id: 't-swiss-form', num: '—', label: 'Authorisation application form' },
      { id: 't-swiss-spc', num: '—', label: 'Swiss SPC (Arzneimittelinformation)' },
      { id: 't-swiss-ctd', num: '2–5', label: 'CTD Modules 2–5 (eCTD format)' },
      { id: 't-swiss-temp', num: '—', label: 'Temporary authorisation (COVID / compassionate)' },
    ] },
    { group: 'Device (Swissmedic)', items: [
      { id: 't-swiss-ca', num: '—', label: 'Conformity assessment (MedDO)' },
      { id: 't-swiss-reg', num: '—', label: 'Device registration (Swissmedic)' },
    ] },
  ],

  /* ANVISA (Brazil) */
  anvisa: [
    { group: 'Drug (ANVISA)', items: [
      { id: 't-anvisa-form', num: '—', label: 'Registration application (Petição de registro)' },
      { id: 't-anvisa-bula', num: '—', label: 'Package insert (Bula)' },
      { id: 't-anvisa-ctd', num: '2–5', label: 'CTD Modules 2–5 (eCTD format)' },
      { id: 't-anvisa-similarity', num: '—', label: 'Similarity study dossier (biosimilar/generic)' },
      { id: 't-anvisa-gmp', num: '—', label: 'GMP certificate (CBPF)' },
    ] },
    { group: 'Device (ANVISA)', items: [
      { id: 't-anvisa-devreg', num: '—', label: 'Device registration (Registro de produto médico)' },
      { id: 't-anvisa-devclass', num: '—', label: 'Device classification (Classes I–IV)' },
      { id: 't-anvisa-inmetro', num: '—', label: 'INMETRO certification (if applicable)' },
    ] },
  ],

  /* WHO (Prequalification / EUL) */
  who: [
    { group: 'WHO Prequalification', items: [
      { id: 't-who-eoi', num: '—', label: 'Expression of interest (EOI)' },
      { id: 't-who-dossier', num: '—', label: 'WHO prequalification dossier (CTD format)' },
      { id: 't-who-site', num: '—', label: 'Site master file (WHO format)' },
      { id: 't-who-specs', num: '—', label: 'Finished product specifications' },
    ] },
    { group: 'WHO EUL', items: [
      { id: 't-who-eul', num: '—', label: 'Emergency use listing dossier' },
      { id: 't-who-safety', num: '—', label: 'Safety & efficacy data package (EUL)' },
    ] },
  ],
};
