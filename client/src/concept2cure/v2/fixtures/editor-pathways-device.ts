// Device / diagnostic regulatory pathway fixtures.
// De Novo, IVDR, IDE, MDR, HDE, STED, Pre-Sub, SaMD, CDx,
// Post-Market Device, IVD Pre-Sub, LDT, International Device, IVD Post-Market.
import { makeSection as _s } from './editor-pathways-types';
import type { Pathway, PathwayMap } from './editor-pathways-types';

// -- De Novo -- Classification Request (21 CFR 860.260) --

export const DENOVO_PATHWAY: Pathway = {
  id: 'denovo', kind: 'De Novo · 21 CFR 860.260', program: 'NovaSense AI Wearable — De Novo', code: 'De Novo', ta: 'dx',
  owner: 'M. Torres', dueline: 'FDA De Novo · Q2 2026', readiness: 51, active: 'dn-class',
  tree: [
    { vol: 'Administrative', items: [
      _s('dn-cover', 'A.1', 'Cover letter', 'complete', 0.98, 240),
      _s('dn-form', 'A.2', 'De Novo request form (FDA 3514)', 'complete', 0.97, 160),
      _s('dn-fee', 'A.3', 'User fee cover sheet (FDA 3601)', 'complete', 0.99, 80),
      _s('dn-truth', 'A.4', 'Truthful & accuracy statement', 'complete', 0.99, 60),
    ] },
    { vol: 'Classification & Regulatory', items: [
      _s('dn-class', 'B.1', 'Proposed classification & product code', 'draft', 0.65, 1100, { blocker: true }),
      _s('dn-reg', 'B.2', 'Regulatory history & prior submissions', 'review', 0.80, 680),
      _s('dn-risk', 'B.3', 'Risk-based classification rationale', 'draft', 0.60, 0),
      _s('dn-special', 'B.4', 'Special controls recommendation', 'draft', 0.55, 0),
    ] },
    { vol: 'Device Description', items: [
      _s('dn-desc', 'C.1', 'Device description & principle of operation', 'review', 0.82, 1800),
      _s('dn-ifu', 'C.2', 'Indications for use', 'review', 0.85, 420),
      _s('dn-label', 'C.3', 'Proposed labeling & IFU', 'draft', 0.58, 0),
      _s('dn-compare', 'C.4', 'Comparison to legally marketed devices', 'draft', 0.62, 0),
    ] },
    { vol: 'Performance & Safety Data', items: [
      _s('dn-nonc', 'D.1', 'Non-clinical performance testing (bench)', 'review', 0.78, 3400),
      _s('dn-bio', 'D.2', 'Biocompatibility (ISO 10993)', 'review', 0.80, 1200),
      _s('dn-sw', 'D.3', 'Software documentation (IEC 62304)', 'draft', 0.55, 0),
      _s('dn-cyber', 'D.4', 'Cybersecurity documentation', 'draft', 0.50, 0),
      _s('dn-ster', 'D.5', 'Sterilization & shelf life', 'draft', 0.52, 0),
      _s('dn-emc', 'D.6', 'EMC / electrical safety', 'draft', 0.50, 0),
      _s('dn-clin', 'D.7', 'Clinical evidence / performance data', 'draft', 0.48, 0, { blocker: true }),
      _s('dn-hf', 'D.8', 'Human factors / usability', 'draft', 0.45, 0),
    ] },
  ],
};

// -- IVDR -- EU IVDR Technical Documentation (Annex II/III) --

export const IVDR_PATHWAY: Pathway = {
  id: 'ivdr', kind: 'IVDR · Regulation 2017/746', program: 'QuantiDx SARS-CoV-2 — IVDR Class C', code: 'IVDR', ta: 'dx',
  owner: 'K. Lindström', dueline: 'EU IVDR submission · Q3 2026', readiness: 38, active: 'ivdr-perf',
  tree: [
    { vol: 'Annex II — Technical Documentation', items: [
      _s('ivdr-desc', '1', 'Device description & specification', 'review', 0.78, 2200),
      _s('ivdr-info', '2', 'Information supplied by manufacturer (label/IFU)', 'draft', 0.60, 0),
      _s('ivdr-design', '3', 'Design & manufacturing information', 'draft', 0.55, 0),
      _s('ivdr-gspr', '4', 'General safety & performance requirements (GSPR) checklist', 'draft', 0.52, 0, { blocker: true }),
      _s('ivdr-ba', '5', 'Benefit-risk analysis & risk management (ISO 14971)', 'draft', 0.58, 0),
      _s('ivdr-vv', '6', 'Product verification & validation', 'draft', 0.50, 0),
    ] },
    { vol: 'Annex III — Performance Evaluation', items: [
      _s('ivdr-perf', '7', 'Performance evaluation plan', 'draft', 0.55, 0, { blocker: true }),
      _s('ivdr-sci', '8', 'Scientific validity', 'draft', 0.50, 0),
      _s('ivdr-anal', '9', 'Analytical performance (sensitivity, specificity, LoD, precision)', 'draft', 0.48, 0),
      _s('ivdr-clin', '10', 'Clinical performance & clinical evidence', 'draft', 0.45, 0),
      _s('ivdr-per', '11', 'Performance evaluation report', 'draft', 0.42, 0),
    ] },
    { vol: 'Post-Market', items: [
      _s('ivdr-pms', '12', 'Post-market surveillance plan', 'draft', 0.40, 0),
      _s('ivdr-pmsp', '13', 'PMPF plan (post-market performance follow-up)', 'draft', 0.38, 0),
      _s('ivdr-sscp', '14', 'Summary of safety & clinical performance (SSCP)', 'draft', 0.35, 0),
    ] },
  ],
};

// -- IDE -- Investigational Device Exemption (21 CFR 812) --

export const IDE_PATHWAY: Pathway = {
  id: 'ide', kind: 'IDE · 21 CFR 812', program: 'CardioSync Leadless Pacer — IDE', code: 'IDE', ta: 'cv',
  owner: 'J. Chen', dueline: 'FDA IDE filing · Q2 2025', readiness: 48, active: 'ide-plan',
  tree: [
    { vol: 'Administrative', items: [
      _s('ide-cover', 'A.1', 'Cover letter', 'complete', 0.97, 240),
      _s('ide-toc', 'A.2', 'Table of contents', 'complete', 0.98, 60),
      _s('ide-form', 'A.3', 'IDE application form', 'complete', 0.96, 180),
      _s('ide-agree', 'A.4', 'Investigator agreements', 'draft', 0.60, 0),
    ] },
    { vol: 'Device & Risk', items: [
      _s('ide-desc', 'B.1', 'Device description & principle of operation', 'review', 0.82, 1600),
      _s('ide-risk', 'B.2', 'Risk analysis (ISO 14971)', 'review', 0.78, 2200),
      _s('ide-prior', 'B.3', 'Prior investigations summary', 'review', 0.80, 1400),
    ] },
    { vol: 'Clinical Investigation Plan', items: [
      _s('ide-plan', 'C.1', 'Investigational plan (clinical protocol)', 'draft', 0.62, 3800, { blocker: true }),
      _s('ide-sap', 'C.2', 'Statistical analysis plan', 'draft', 0.55, 0),
      _s('ide-icf', 'C.3', 'Informed consent form', 'draft', 0.50, 0),
      _s('ide-irb', 'C.4', 'IRB / ethics committee information', 'draft', 0.48, 0),
      _s('ide-monitor', 'C.5', 'Monitoring plan', 'draft', 0.45, 0),
    ] },
    { vol: 'Manufacturing & Testing', items: [
      _s('ide-mfg', 'D.1', 'Manufacturing information', 'review', 0.80, 1800),
      _s('ide-bench', 'D.2', 'Non-clinical bench testing', 'review', 0.82, 3600),
      _s('ide-bio', 'D.3', 'Biocompatibility', 'review', 0.78, 1200),
      _s('ide-ster', 'D.4', 'Sterilization validation', 'draft', 0.55, 0),
      _s('ide-sw', 'D.5', 'Software documentation', 'draft', 0.52, 0),
      _s('ide-label', 'D.6', 'Proposed labeling', 'draft', 0.50, 0),
    ] },
  ],
};

// -- MDR Tech Doc -- EU MDR Technical Documentation (Annex II/III) --

export const MDR_PATHWAY: Pathway = {
  id: 'mdr', kind: 'EU MDR · Regulation 2017/745', program: 'Meridian Pacing Lead — MDR Class III', code: 'MDR', ta: 'cv',
  owner: 'K. Lindström', dueline: 'EU MDR tech doc · Q2 2026', readiness: 45, active: 'mdr-gspr',
  tree: [
    { vol: 'Annex II — Technical Documentation', items: [
      _s('mdr-desc', '1', 'Device description & specification', 'review', 0.78, 2400),
      _s('mdr-info', '2', 'Information supplied by manufacturer (label/IFU)', 'draft', 0.62, 0),
      _s('mdr-design', '3', 'Design & manufacturing information', 'draft', 0.58, 0),
      _s('mdr-gspr', '4', 'GSPR checklist (Annex I) — all 23 requirements', 'draft', 0.52, 0, { blocker: true }),
      _s('mdr-ba', '5', 'Benefit-risk analysis & risk management (ISO 14971)', 'draft', 0.55, 0),
      _s('mdr-vv', '6', 'Product verification & validation', 'draft', 0.50, 0),
    ] },
    { vol: 'Annex III — Clinical Evaluation', items: [
      _s('mdr-cep', '7', 'Clinical evaluation plan (MEDDEV 2.7/1 Rev 4)', 'draft', 0.52, 0, { blocker: true }),
      _s('mdr-lit', '8', 'Literature review & appraisal', 'draft', 0.48, 0),
      _s('mdr-clin', '9', 'Clinical investigation data', 'draft', 0.45, 0),
      _s('mdr-cer', '10', 'Clinical evaluation report', 'draft', 0.42, 0),
      _s('mdr-sscp', '11', 'Summary of safety & clinical performance (SSCP)', 'draft', 0.40, 0),
    ] },
    { vol: 'Post-Market', items: [
      _s('mdr-pms', '12', 'Post-market surveillance plan', 'draft', 0.40, 0),
      _s('mdr-pmcf', '13', 'Post-market clinical follow-up (PMCF) plan', 'draft', 0.38, 0),
      _s('mdr-psr', '14', 'Periodic safety update report (PSUR/PMSR)', 'draft', 0.35, 0),
    ] },
  ],
};

// -- HDE -- Humanitarian Device Exemption (21 CFR 814.100) --

export const HDE_PATHWAY: Pathway = {
  id: 'hde', kind: 'HDE · 21 CFR 814.100', program: 'OrphaStim Neuromod — HDE', code: 'HDE', ta: 'neuro',
  owner: 'J. Chen', dueline: 'FDA HDE filing · Q4 2025', readiness: 40, active: 'hde-desc',
  tree: [
    { vol: 'Administrative', items: [
      _s('hde-cover', 'A.1', 'Cover letter', 'complete', 0.97, 200),
      _s('hde-form', 'A.2', 'HDE application form', 'complete', 0.96, 140),
      _s('hde-hud', 'A.3', 'HUD designation letter', 'complete', 0.99, 80),
    ] },
    { vol: 'Device & Indication', items: [
      _s('hde-desc', 'B.1', 'Device description', 'draft', 0.62, 0, { blocker: true }),
      _s('hde-ifu', 'B.2', 'Indications for use & intended population', 'draft', 0.58, 0),
      _s('hde-prev', 'B.3', 'Prevalence data (< 8,000 / year)', 'draft', 0.55, 0),
      _s('hde-label', 'B.4', 'Proposed labeling', 'draft', 0.50, 0),
    ] },
    { vol: 'Safety & Probable Benefit', items: [
      _s('hde-bench', 'C.1', 'Non-clinical testing', 'draft', 0.55, 0),
      _s('hde-clin', 'C.2', 'Clinical data (probable benefit)', 'draft', 0.48, 0),
      _s('hde-risk', 'C.3', 'Risk-benefit profile', 'draft', 0.45, 0),
      _s('hde-lit', 'C.4', 'Literature references', 'draft', 0.40, 0),
    ] },
  ],
};

// -- STED -- Summary Technical Documentation (IMDRF) --

export const STED_PATHWAY: Pathway = {
  id: 'sted', kind: 'STED · IMDRF N23:2017', program: 'FlexPatch Wound Sensor — STED', code: 'STED', ta: 'wound',
  owner: 'M. Torres', dueline: 'IMDRF STED · Q3 2026', readiness: 35, active: 'sted-desc',
  tree: [
    { vol: 'STED Chapters', items: [
      _s('sted-desc', '1', 'Device description (intended use, principles of operation)', 'draft', 0.55, 0, { blocker: true }),
      _s('sted-ref', '2', 'Reference to regulatory requirements & standards', 'draft', 0.50, 0),
      _s('sted-design', '3', 'Design & manufacturing', 'draft', 0.48, 0),
      _s('sted-risk', '4', 'Risk analysis (ISO 14971)', 'draft', 0.50, 0),
      _s('sted-safety', '5', 'Product safety (IEC 60601, biocompat, sterility, EMC)', 'draft', 0.45, 0),
      _s('sted-perf', '6', 'Preclinical & clinical performance', 'draft', 0.42, 0),
      _s('sted-sw', '7', 'Software (IEC 62304) & cybersecurity', 'draft', 0.40, 0),
      _s('sted-label', '8', 'Labelling (IFU, symbols)', 'draft', 0.38, 0),
    ] },
  ],
};

// -- Pre-Submission (Device) -- Q-Sub, 513(g), RFD, Breakthrough --

export const PRESUB_PATHWAY: Pathway = {
  id: 'presub', kind: 'Pre-Submission · Q-Sub', program: 'Device Pre-Sub Interaction', code: 'Q-Sub', ta: 'device',
  owner: 'J. Chen', dueline: 'FDA Pre-Sub · as scheduled', readiness: 50, active: 'ps-questions',
  tree: [
    { vol: 'Pre-Submission Package', items: [
      _s('ps-cover', 'A.1', 'Cover letter', 'complete', 0.97, 200),
      _s('ps-form', 'A.2', 'Pre-Sub request form', 'complete', 0.95, 140),
      _s('ps-desc', 'A.3', 'Device description & intended use', 'review', 0.82, 1200),
      _s('ps-questions', 'B.1', 'Specific questions for FDA feedback', 'draft', 0.62, 0, { blocker: true }),
      _s('ps-proposed', 'B.2', 'Proposed testing / clinical strategy', 'draft', 0.55, 0),
      _s('ps-nonclin', 'B.3', 'Non-clinical testing results (if available)', 'draft', 0.50, 0),
      _s('ps-pred', 'B.4', 'Predicate / classification analysis', 'draft', 0.52, 0),
      _s('ps-reg', 'B.5', 'Proposed regulatory pathway rationale', 'draft', 0.48, 0),
    ] },
  ],
};

// -- SaMD / AI-ML -- PCCP, IEC 62304, Cybersecurity --

export const SAMD_PATHWAY: Pathway = {
  id: 'samd', kind: 'SaMD / AI-ML · De Novo + PCCP', program: 'NovaSense AI — SaMD', code: 'SaMD', ta: 'dx',
  owner: 'M. Torres', dueline: 'FDA SaMD filing · Q3 2026', readiness: 38, active: 'samd-desc',
  tree: [
    { vol: 'SaMD Classification & Description', items: [
      _s('samd-desc', '1', 'Software description & SaMD classification (IMDRF N12)', 'draft', 0.55, 0, { blocker: true }),
      _s('samd-ifu', '2', 'Statement of intended use / indications', 'draft', 0.52, 0),
      _s('samd-clin', '3', 'Clinical association & scientific validity', 'draft', 0.48, 0),
    ] },
    { vol: 'Software Documentation (IEC 62304)', items: [
      _s('samd-sdp', '4', 'Software development plan', 'draft', 0.50, 0),
      _s('samd-req', '5', 'Software requirements specification', 'draft', 0.48, 0),
      _s('samd-arch', '6', 'Software architecture design', 'draft', 0.45, 0),
      _s('samd-test', '7', 'Software verification & validation', 'draft', 0.42, 0),
      _s('samd-maint', '8', 'Software maintenance plan', 'draft', 0.40, 0),
    ] },
    { vol: 'AI/ML-Specific', items: [
      _s('samd-pccp', '9', 'Predetermined Change Control Plan (PCCP)', 'draft', 0.45, 0, { blocker: true }),
      _s('samd-data', '10', 'Training data management & governance', 'draft', 0.42, 0),
      _s('samd-perf', '11', 'Algorithm performance (real-world)', 'draft', 0.40, 0),
    ] },
    { vol: 'Cybersecurity', items: [
      _s('samd-threat', '12', 'Threat model & security risk assessment', 'draft', 0.42, 0),
      _s('samd-sbom', '13', 'Software bill of materials (SBOM)', 'draft', 0.40, 0),
      _s('samd-patch', '14', 'Vulnerability / patch management plan', 'draft', 0.38, 0),
    ] },
  ],
};

// -- CDx -- Companion Diagnostic --

export const CDX_PATHWAY: Pathway = {
  id: 'cdx', kind: 'CDx · PMA / 510(k)', program: 'BX-CDx — Companion Diagnostic Assay', code: 'CDx', ta: 'dx',
  owner: 'M. Torres', dueline: 'FDA CDx filing · Q4 2026', readiness: 35, active: 'cdx-bridge',
  tree: [
    { vol: 'Administrative & Regulatory', items: [
      _s('cdx-cover', 'A.1', 'Cover letter', 'draft', 0.55, 0),
      _s('cdx-class', 'A.2', 'Classification & regulatory pathway rationale', 'draft', 0.52, 0),
      _s('cdx-agree', 'A.3', 'Co-development agreement (therapeutic + Dx)', 'draft', 0.48, 0),
    ] },
    { vol: 'Analytical Performance', items: [
      _s('cdx-desc', 'B.1', 'Assay description & principle of detection', 'draft', 0.55, 0),
      _s('cdx-valid', 'B.2', 'Analytical validation (sensitivity, specificity, precision, LoD)', 'draft', 0.50, 0),
      _s('cdx-specimen', 'B.3', 'Specimen handling & pre-analytics', 'draft', 0.48, 0),
    ] },
    { vol: 'Clinical Performance', items: [
      _s('cdx-bridge', 'C.1', 'Clinical bridging study — Dx ↔ therapeutic', 'draft', 0.45, 0, { blocker: true }),
      _s('cdx-clin', 'C.2', 'Clinical performance (PPA, NPA, concordance)', 'draft', 0.42, 0),
      _s('cdx-label', 'C.3', 'Proposed labeling (IFU, cross-reference to drug label)', 'draft', 0.40, 0),
    ] },
  ],
};

// -- Post-Market Device -- MDR Report, PMCF, FSCA, Recall --

export const PMDEVICE_PATHWAY: Pathway = {
  id: 'pmdevice', kind: 'Post-Market Device · 21 CFR 803/806', program: 'Device Post-Market Surveillance', code: 'PM-Dev', ta: 'device',
  owner: 'J. Chen', dueline: 'Ongoing · regulatory clock', readiness: 50, active: 'pmd-mdr',
  tree: [
    { vol: 'Adverse Event Reporting', items: [
      _s('pmd-mdr', '1', 'Medical device report (MDR / 21 CFR 803)', 'draft', 0.55, 0, { blocker: true }),
      _s('pmd-mir', '2', 'Manufacturer incident report (MIR) — EU', 'draft', 0.50, 0),
      _s('pmd-trend', '3', 'Trend report', 'draft', 0.48, 0),
    ] },
    { vol: 'Corrective Actions', items: [
      _s('pmd-recall', '4', 'Recall / correction report (21 CFR 806)', 'draft', 0.50, 0),
      _s('pmd-fsca', '5', 'Field safety corrective action (FSCA)', 'draft', 0.48, 0),
      _s('pmd-fsn', '6', 'Field safety notice', 'draft', 0.45, 0),
    ] },
    { vol: 'Surveillance', items: [
      _s('pmd-pmcf', '7', 'Post-market clinical follow-up (PMCF) report', 'draft', 0.45, 0),
      _s('pmd-psur', '8', 'PSUR — device', 'draft', 0.42, 0),
      _s('pmd-pms', '9', 'Post-market surveillance plan & report', 'draft', 0.40, 0),
      _s('pmd-annual', '10', 'Annual report (PMA)', 'draft', 0.38, 0),
    ] },
  ],
};

// -- IVD Pre-Sub & CLIA --

export const IVDPRESUB_PATHWAY: Pathway = {
  id: 'ivdpresub', kind: 'IVD Pre-Submission', program: 'IVD Q-Sub / CLIA Waiver', code: 'IVD-QSub', ta: 'dx',
  owner: 'M. Torres', dueline: 'FDA IVD Pre-Sub · as needed', readiness: 40, active: 'ivdps-questions',
  tree: [
    { vol: 'Pre-Submission Package', items: [
      _s('ivdps-cover', 'A.1', 'Cover letter', 'draft', 0.55, 0),
      _s('ivdps-desc', 'A.2', 'Device/assay description & intended use', 'draft', 0.52, 0),
      _s('ivdps-class', 'A.3', 'Classification & product code rationale', 'draft', 0.50, 0),
      _s('ivdps-questions', 'B.1', 'Specific questions for FDA/CDRH feedback', 'draft', 0.48, 0, { blocker: true }),
      _s('ivdps-clia', 'B.2', 'CLIA waiver justification (if applicable)', 'draft', 0.45, 0),
      _s('ivdps-proposed', 'B.3', 'Proposed analytical & clinical studies', 'draft', 0.42, 0),
    ] },
  ],
};

// -- LDT -- Laboratory Developed Test --

export const LDT_PATHWAY: Pathway = {
  id: 'ldt', kind: 'LDT · VALID Act / FDA', program: 'Lab-Developed Test Notification', code: 'LDT', ta: 'dx',
  owner: 'M. Torres', dueline: 'FDA LDT notification · Q4 2026', readiness: 32, active: 'ldt-desc',
  tree: [
    { vol: 'LDT Notification', items: [
      _s('ldt-cover', '1', 'Notification letter', 'draft', 0.55, 0),
      _s('ldt-desc', '2', 'Test description & methodology', 'draft', 0.50, 0, { blocker: true }),
      _s('ldt-ifu', '3', 'Intended use & clinical significance', 'draft', 0.48, 0),
      _s('ldt-valid', '4', 'Analytical validation summary', 'draft', 0.45, 0),
      _s('ldt-clin', '5', 'Clinical validation / performance', 'draft', 0.42, 0),
      _s('ldt-lab', '6', 'Laboratory qualifications (CLIA cert)', 'draft', 0.40, 0),
    ] },
  ],
};

// -- International Device Registration -- UKCA, HC MDL, PMDA --

export const INTLDEVICE_PATHWAY: Pathway = {
  id: 'intldevice', kind: 'International Device Registration', program: 'Global Device Market Access', code: 'Intl-Dev', ta: 'device',
  owner: 'K. Lindström', dueline: 'Per market · rolling', readiness: 35, active: 'id-desc',
  tree: [
    { vol: 'Common Technical Documentation', items: [
      _s('id-desc', '1', 'Device description & intended purpose', 'draft', 0.55, 0, { blocker: true }),
      _s('id-class', '2', 'Classification & regulatory pathway (per jurisdiction)', 'draft', 0.52, 0),
      _s('id-risk', '3', 'Risk management file (ISO 14971)', 'draft', 0.50, 0),
      _s('id-design', '4', 'Design & manufacturing information', 'draft', 0.48, 0),
      _s('id-test', '5', 'Performance testing & validation', 'draft', 0.45, 0),
      _s('id-clin', '6', 'Clinical evidence / evaluation', 'draft', 0.42, 0),
      _s('id-label', '7', 'Labelling & IFU (localized)', 'draft', 0.40, 0),
    ] },
    { vol: 'Region-Specific', items: [
      _s('id-ukca', '8', 'UKCA declaration & MHRA registration', 'draft', 0.38, 0),
      _s('id-hcmdl', '9', 'Health Canada MDL (Medical Device Licence)', 'draft', 0.35, 0),
      _s('id-pmda', '10', 'PMDA Shonin application (Japan)', 'draft', 0.32, 0),
      _s('id-doc', '11', 'EU Declaration of Conformity (DoC)', 'draft', 0.35, 0),
    ] },
  ],
};

// -- IVD Post-Market -- PMPF, Trend, PSUR-IVD, Annual --

export const IVDPOSTMARKET_PATHWAY: Pathway = {
  id: 'ivdpostmarket', kind: 'IVD Post-Market', program: 'IVD Post-Market Lifecycle', code: 'IVD-PM', ta: 'dx',
  owner: 'M. Torres', dueline: 'Ongoing · rolling', readiness: 38, active: 'ivdpm-pmpf',
  tree: [
    { vol: 'Performance Follow-Up', items: [
      _s('ivdpm-pmpf', '1', 'Post-market performance follow-up (PMPF) report', 'draft', 0.48, 0, { blocker: true }),
      _s('ivdpm-per', '2', 'Ongoing performance evaluation updates', 'draft', 0.45, 0),
    ] },
    { vol: 'Safety & Trend', items: [
      _s('ivdpm-trend', '3', 'Trend reporting', 'draft', 0.42, 0),
      _s('ivdpm-psur', '4', 'PSUR — IVD', 'draft', 0.40, 0),
      _s('ivdpm-fsca', '5', 'Field safety corrective action (IVD)', 'draft', 0.38, 0),
    ] },
    { vol: 'Registration', items: [
      _s('ivdpm-annual', '6', 'Annual device registration', 'draft', 0.40, 0),
      _s('ivdpm-sscp', '7', 'SSCP for IVD', 'draft', 0.38, 0),
    ] },
  ],
};

// -- Aggregate map for device pathways --

export const DEVICE_PATHWAYS: PathwayMap = {
  denovo: DENOVO_PATHWAY,
  ivdr: IVDR_PATHWAY,
  ide: IDE_PATHWAY,
  mdr: MDR_PATHWAY,
  hde: HDE_PATHWAY,
  sted: STED_PATHWAY,
  presub: PRESUB_PATHWAY,
  samd: SAMD_PATHWAY,
  cdx: CDX_PATHWAY,
  pmdevice: PMDEVICE_PATHWAY,
  ivdpresub: IVDPRESUB_PATHWAY,
  ldt: LDT_PATHWAY,
  intldevice: INTLDEVICE_PATHWAY,
  ivdpostmarket: IVDPOSTMARKET_PATHWAY,
};
