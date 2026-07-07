// Pharma / CTD regulatory pathway fixtures.
// IND, BLA, ANDA, 505(b)(2), Biosimilar, MAA, DMF.
import { makeSection as _s } from './editor-pathways-types';
import type { Pathway, PathwayMap } from './editor-pathways-types';

// -- IND -- Investigational New Drug Application (21 CFR 312) --

export const IND_PATHWAY: Pathway = {
  id: 'ind', kind: 'IND · 21 CFR 312', program: 'BX-204 — Phase I/II IND', code: 'IND', ta: 'onc',
  owner: 'R. Patel', dueline: 'FDA IND filing · Q1 2025', readiness: 58, active: 'ind-prot',
  tree: [
    { vol: 'Module 1 — Administrative', items: [
      _s('ind-1571', '1.1', 'FDA Form 1571 (IND cover sheet)', 'complete', 0.99, 120),
      _s('ind-cv', '1.2', 'Cover letter', 'complete', 0.97, 280),
      _s('ind-toc', '1.3', 'Table of contents', 'complete', 0.98, 60),
      _s('ind-intro', '1.4', 'Introductory statement & general investigational plan', 'review', 0.82, 1200),
      _s('ind-ib', '1.5', 'Investigator brochure (IB)', 'review', 0.78, 4800, { blocker: true }),
      _s('ind-prot', '1.6', 'Clinical protocol(s)', 'draft', 0.68, 3200, { blocker: true }),
      _s('ind-icf', '1.7', 'Informed consent form (ICF)', 'draft', 0.55, 0),
      _s('ind-1572', '1.8', 'FDA Form 1572 (investigator statement)', 'draft', 0.60, 180),
      _s('ind-fda3674', '1.9', 'FDA Form 3674 (ClinicalTrials.gov certification)', 'draft', 0.65, 60),
    ] },
    { vol: 'Module 2 — CTD Summaries', items: [
      _s('ind-qos', '2.3', 'Quality overall summary', 'review', 0.76, 2100),
      _s('ind-nco', '2.4', 'Nonclinical overview', 'review', 0.80, 1800),
      _s('ind-co', '2.5', 'Clinical overview', 'draft', 0.55, 0),
      _s('ind-ncs', '2.6', 'Nonclinical written & tabulated summaries', 'draft', 0.52, 0),
    ] },
    { vol: 'Module 3 — Chemistry, Manufacturing & Controls', items: [
      _s('ind-ds', '3.2.S', 'Drug substance', 'review', 0.82, 3600),
      _s('ind-dp', '3.2.P', 'Drug product', 'review', 0.78, 2800),
      _s('ind-ea', '3.3', 'Environmental assessment / exclusion', 'draft', 0.50, 0),
    ] },
    { vol: 'Module 4 — Nonclinical Study Reports', items: [
      _s('ind-pharm', '4.2.1', 'Pharmacology studies', 'review', 0.85, 4200),
      _s('ind-pk', '4.2.2', 'Pharmacokinetics / ADME', 'review', 0.82, 2800),
      _s('ind-tox', '4.2.3', 'Toxicology studies (GLP)', 'review', 0.84, 6200),
    ] },
    { vol: 'Module 5 — Clinical', items: [
      _s('ind-sap', '5.1', 'Statistical analysis plan (SAP)', 'draft', 0.50, 0),
      _s('ind-clin-prot', '5.2', 'Clinical study protocol', 'draft', 0.68, 3200),
      _s('ind-prev', '5.3', 'Previous human experience', 'draft', 0.45, 0),
    ] },
  ],
};

// -- BLA -- Biologics License Application (42 USC 262) --

export const BLA_PATHWAY: Pathway = {
  id: 'bla', kind: 'BLA · PHS Act §351(a)', program: 'BX-204 mAb — BLA', code: 'eCTD', ta: 'onc',
  owner: 'A. Müller', dueline: 'FDA BLA filing · Q4 2026', readiness: 42, active: 'bla-25',
  tree: [
    { vol: 'Module 1 — Administrative & Prescribing', items: [
      _s('bla-356h', '1.1', 'FDA Form 356h', 'draft', 0.60, 120),
      _s('bla-cl', '1.2', 'Cover letter', 'draft', 0.55, 0),
      _s('bla-admin', '1.3', 'Administrative information', 'draft', 0.50, 0),
      _s('bla-label', '1.14', 'Draft labeling / package insert', 'draft', 0.45, 0),
      _s('bla-pi', '1.14.3', 'Prescribing information (USPI)', 'draft', 0.40, 0),
      _s('bla-rems', '1.14.5', 'REMS (if applicable)', 'draft', 0.35, 0),
    ] },
    { vol: 'Module 2 — CTD Summaries', items: [
      _s('bla-toc', '2.1', 'CTD table of contents', 'draft', 0.50, 0),
      _s('bla-intro', '2.2', 'Introduction', 'draft', 0.50, 0),
      _s('bla-qos', '2.3', 'Quality overall summary', 'draft', 0.48, 0),
      _s('bla-nco', '2.4', 'Nonclinical overview', 'draft', 0.50, 0),
      _s('bla-25', '2.5', 'Clinical overview', 'draft', 0.52, 0, { blocker: true }),
      _s('bla-26', '2.6', 'Nonclinical written & tabulated summaries', 'draft', 0.45, 0),
      _s('bla-271', '2.7.1', 'Summary of biopharmaceutic studies', 'draft', 0.48, 0),
      _s('bla-272', '2.7.2', 'Summary of clinical pharmacology', 'draft', 0.50, 0),
      _s('bla-273', '2.7.3', 'Summary of clinical efficacy', 'draft', 0.46, 0),
      _s('bla-274', '2.7.4', 'Summary of clinical safety', 'draft', 0.44, 0),
    ] },
    { vol: 'Module 3 — Quality (CMC — Biologics)', items: [
      _s('bla-3s1', '3.2.S.1', 'Drug substance — general information', 'draft', 0.55, 0),
      _s('bla-3s2', '3.2.S.2', 'Drug substance — manufacture (cell line, upstream, downstream)', 'draft', 0.50, 0),
      _s('bla-3s3', '3.2.S.3', 'Characterisation (primary/higher-order structure, glycosylation, variants)', 'draft', 0.48, 0),
      _s('bla-3s4', '3.2.S.4', 'Control of drug substance (specs, analytical methods)', 'draft', 0.52, 0),
      _s('bla-3s7', '3.2.S.7', 'Stability — drug substance', 'draft', 0.45, 0),
      _s('bla-3p1', '3.2.P.1', 'Drug product — description & composition', 'draft', 0.50, 0),
      _s('bla-3p3', '3.2.P.3', 'Drug product — manufacture (formulation, fill-finish)', 'draft', 0.48, 0),
      _s('bla-3p5', '3.2.P.5', 'Control of drug product', 'draft', 0.45, 0),
      _s('bla-3p8', '3.2.P.8', 'Stability — drug product', 'draft', 0.42, 0),
      _s('bla-comp', '3.2.R', 'Comparability protocols (process changes)', 'draft', 0.40, 0),
    ] },
    { vol: 'Module 4 — Nonclinical', items: [
      _s('bla-pharm', '4.2.1', 'Pharmacology (in vitro binding, MOA, efficacy models)', 'draft', 0.55, 0),
      _s('bla-pk', '4.2.2', 'Pharmacokinetics / tissue distribution', 'draft', 0.52, 0),
      _s('bla-tox', '4.2.3', 'Toxicology (repeat-dose, reproductive, immunotoxicity)', 'draft', 0.50, 0),
    ] },
    { vol: 'Module 5 — Clinical Study Reports', items: [
      _s('bla-csr1', '5.3.1', 'BA/BE study reports', 'draft', 0.50, 0),
      _s('bla-csr-pk', '5.3.3', 'Clinical pharmacology (PK/PD) study reports', 'draft', 0.48, 0),
      _s('bla-csr-eff', '5.3.5', 'Efficacy & safety study reports (pivotal + supportive)', 'draft', 0.45, 0, { blocker: true }),
      _s('bla-lit', '5.4', 'Literature references', 'draft', 0.40, 0),
    ] },
  ],
};

// -- DMF -- Drug Master File (21 CFR 314.420) --

export const DMF_PATHWAY: Pathway = {
  id: 'dmf', kind: 'DMF · 21 CFR 314.420', program: 'API-742 — Type II DMF (Drug Substance)', code: 'eCTD', ta: 'cmc',
  owner: 'L. Zhang', dueline: 'FDA DMF filing · Q4 2025', readiness: 62, active: 'dmf-3s2',
  tree: [
    { vol: 'Administrative', items: [
      _s('dmf-cover', 'A.1', 'Transmittal letter', 'complete', 0.98, 160),
      _s('dmf-loa', 'A.2', 'Letter of authorization (LOA)', 'complete', 0.97, 120),
      _s('dmf-toc', 'A.3', 'Table of contents', 'complete', 0.99, 40),
      _s('dmf-app', 'A.4', 'Applicant & agent information', 'complete', 0.98, 80),
    ] },
    { vol: 'Drug Substance (3.2.S)', items: [
      _s('dmf-3s1', '3.2.S.1', 'General information (nomenclature, structure)', 'complete', 0.94, 680),
      _s('dmf-3s2', '3.2.S.2', 'Manufacture (synthesis route, process controls, critical steps)', 'review', 0.82, 5400, { blocker: true }),
      _s('dmf-3s3', '3.2.S.3', 'Characterisation (elucidation of structure, impurities)', 'review', 0.80, 2400),
      _s('dmf-3s4', '3.2.S.4', 'Control of drug substance (specs, analytical methods, validation)', 'review', 0.78, 3200),
      _s('dmf-3s5', '3.2.S.5', 'Reference standards', 'draft', 0.60, 0),
      _s('dmf-3s6', '3.2.S.6', 'Container closure system', 'draft', 0.55, 0),
      _s('dmf-3s7', '3.2.S.7', 'Stability (ICH Q1A/Q1B/Q1E)', 'draft', 0.58, 0),
    ] },
    { vol: 'Facilities & Regulatory', items: [
      _s('dmf-fac', 'F.1', 'Manufacturing facility information', 'review', 0.82, 920),
      _s('dmf-gmp', 'F.2', 'GMP compliance / inspection history', 'draft', 0.60, 0),
      _s('dmf-ea', 'F.3', 'Environmental assessment', 'draft', 0.50, 0),
    ] },
  ],
};

// -- ANDA -- Abbreviated New Drug Application (21 CFR 314) --

export const ANDA_PATHWAY: Pathway = {
  id: 'anda', kind: 'ANDA · 21 CFR 314.94', program: 'Generic Metformin XR 500mg — ANDA', code: 'eCTD', ta: 'pharma',
  owner: 'D. Kapoor', dueline: 'FDA ANDA filing · Q1 2026', readiness: 55, active: 'anda-be',
  tree: [
    { vol: 'Module 1 — Administrative', items: [
      _s('anda-356h', '1.1', 'FDA Form 356h', 'complete', 0.98, 120),
      _s('anda-cl', '1.2', 'Cover letter', 'complete', 0.97, 240),
      _s('anda-piv', '1.3', 'Paragraph IV certification (if applicable)', 'draft', 0.60, 0),
      _s('anda-pi', '1.14', 'Draft labeling / USPI', 'draft', 0.55, 0),
      _s('anda-bio', '1.15', 'Bioequivalence statement', 'draft', 0.58, 0),
    ] },
    { vol: 'Module 2 — Summaries', items: [
      _s('anda-qos', '2.3', 'Quality overall summary', 'draft', 0.52, 0),
      _s('anda-bps', '2.7.1', 'Summary of bioequivalence studies', 'draft', 0.50, 0),
    ] },
    { vol: 'Module 3 — Quality (CMC)', items: [
      _s('anda-ds', '3.2.S', 'Drug substance (refer to DMF)', 'review', 0.80, 1200),
      _s('anda-dp-desc', '3.2.P.1', 'Drug product — description & composition', 'review', 0.82, 480),
      _s('anda-dp-dev', '3.2.P.2', 'Drug product — pharmaceutical development', 'review', 0.78, 2800),
      _s('anda-dp-mfg', '3.2.P.3', 'Drug product — manufacture', 'review', 0.76, 3200),
      _s('anda-dp-ctl', '3.2.P.5', 'Drug product — control (specs, dissolution)', 'draft', 0.62, 0),
      _s('anda-dp-stab', '3.2.P.8', 'Drug product — stability', 'draft', 0.58, 0),
    ] },
    { vol: 'Module 5 — Bioequivalence', items: [
      _s('anda-be', '5.3.1', 'Bioequivalence study report(s)', 'draft', 0.55, 0, { blocker: true }),
      _s('anda-diss', '5.3.2', 'Comparative dissolution data', 'draft', 0.50, 0),
    ] },
  ],
};

// -- MAA -- Marketing Authorization Application (EU/EMA) --

export const MAA_PATHWAY: Pathway = {
  id: 'maa', kind: 'MAA · Directive 2001/83/EC', program: 'BX-204 mAb — EU MAA (Centralised)', code: 'eCTD', ta: 'onc',
  owner: 'A. Müller', dueline: 'EMA MAA filing · Q1 2027', readiness: 35, active: 'maa-smpc',
  tree: [
    { vol: 'Module 1 — EU Administrative (Region-specific)', items: [
      _s('maa-form', '1.0', 'Application form', 'draft', 0.55, 0),
      _s('maa-smpc', '1.3.1', 'Summary of product characteristics (SmPC)', 'draft', 0.50, 0, { blocker: true }),
      _s('maa-pl', '1.3.2', 'Package leaflet (PIL)', 'draft', 0.45, 0),
      _s('maa-label', '1.3.3', 'Labelling (outer/inner packaging)', 'draft', 0.42, 0),
      _s('maa-expert', '1.4', 'Expert reports / declarations', 'draft', 0.48, 0),
      _s('maa-orphan', '1.5', 'Orphan designation (if applicable)', 'draft', 0.40, 0),
      _s('maa-env', '1.6', 'Environmental risk assessment', 'draft', 0.38, 0),
      _s('maa-pip', '1.7', 'Paediatric investigation plan compliance', 'draft', 0.35, 0),
    ] },
    { vol: 'Module 2 — CTD Summaries', items: [
      _s('maa-toc', '2.1', 'CTD table of contents', 'draft', 0.50, 0),
      _s('maa-intro', '2.2', 'Introduction', 'draft', 0.50, 0),
      _s('maa-qos', '2.3', 'Quality overall summary', 'draft', 0.48, 0),
      _s('maa-nco', '2.4', 'Nonclinical overview', 'draft', 0.50, 0),
      _s('maa-co', '2.5', 'Clinical overview', 'draft', 0.45, 0),
      _s('maa-ncs', '2.6', 'Nonclinical summaries', 'draft', 0.42, 0),
      _s('maa-cs', '2.7', 'Clinical summaries', 'draft', 0.40, 0),
    ] },
    { vol: 'Module 3 — Quality', items: [
      _s('maa-ds', '3.2.S', 'Drug substance', 'draft', 0.48, 0),
      _s('maa-dp', '3.2.P', 'Drug product', 'draft', 0.45, 0),
      _s('maa-app', '3.2.A', 'Appendices', 'draft', 0.40, 0),
      _s('maa-reg', '3.2.R', 'Regional information (TSE, GMP, QP)', 'draft', 0.38, 0),
    ] },
    { vol: 'Module 4 — Nonclinical', items: [
      _s('maa-pharm', '4.2.1', 'Pharmacology', 'draft', 0.50, 0),
      _s('maa-pk', '4.2.2', 'Pharmacokinetics', 'draft', 0.48, 0),
      _s('maa-tox', '4.2.3', 'Toxicology', 'draft', 0.45, 0),
    ] },
    { vol: 'Module 5 — Clinical', items: [
      _s('maa-csr', '5.3', 'Clinical study reports', 'draft', 0.42, 0, { blocker: true }),
      _s('maa-lit', '5.4', 'Literature references', 'draft', 0.40, 0),
    ] },
  ],
};

// -- 505(b)(2) -- Hybrid NDA --

export const NDA_505B2_PATHWAY: Pathway = {
  id: '505b2', kind: '505(b)(2) NDA', program: 'MetaGlip XR 1000mg — 505(b)(2)', code: 'eCTD', ta: 'pharma',
  owner: 'S. Williams', dueline: 'FDA 505(b)(2) filing · Q3 2026', readiness: 44, active: '505-bridge',
  tree: [
    { vol: 'Module 1 — Administrative', items: [
      _s('505-356h', '1.1', 'FDA Form 356h', 'draft', 0.60, 120),
      _s('505-cl', '1.2', 'Cover letter', 'draft', 0.55, 0),
      _s('505-505stmt', '1.3', '505(b)(2) statement / right of reference', 'draft', 0.52, 0),
      _s('505-patent', '1.4', 'Patent certification (Paragraph III/IV)', 'draft', 0.50, 0),
      _s('505-label', '1.14', 'Draft labeling / USPI', 'draft', 0.48, 0),
    ] },
    { vol: 'Module 2 — Summaries', items: [
      _s('505-qos', '2.3', 'Quality overall summary', 'draft', 0.50, 0),
      _s('505-nco', '2.4', 'Nonclinical overview (bridging rationale)', 'draft', 0.52, 0),
      _s('505-co', '2.5', 'Clinical overview (bridging rationale)', 'draft', 0.48, 0),
    ] },
    { vol: 'Module 3 — Quality (CMC)', items: [
      _s('505-ds', '3.2.S', 'Drug substance', 'draft', 0.55, 0),
      _s('505-dp', '3.2.P', 'Drug product (new formulation)', 'draft', 0.52, 0),
      _s('505-comp', '3.2.P.2', 'Pharmaceutical development (bridging dissolution)', 'draft', 0.50, 0),
    ] },
    { vol: 'Module 4 — Nonclinical', items: [
      _s('505-bridge-nc', '4.1', 'Nonclinical bridging study / lit review', 'draft', 0.50, 0),
      _s('505-tox', '4.2', 'Toxicology (only if new safety signals)', 'draft', 0.45, 0),
    ] },
    { vol: 'Module 5 — Clinical (Bridging)', items: [
      _s('505-bridge', '5.1', 'Bridging study report (BA/BE or clinical endpoint)', 'draft', 0.48, 0, { blocker: true }),
      _s('505-pk', '5.3.1', 'Relative BA / comparative PK studies', 'draft', 0.45, 0),
      _s('505-lit', '5.4', 'Literature references (relied-upon RLD data)', 'draft', 0.50, 0),
    ] },
  ],
};

// -- Biosimilar -- 351(k) BsUFA --

export const BIOSIMILAR_PATHWAY: Pathway = {
  id: 'biosimilar', kind: '351(k) Biosimilar · BsUFA', program: 'BX-204-BS — Biosimilar mAb', code: 'eCTD', ta: 'onc',
  owner: 'A. Müller', dueline: 'FDA 351(k) filing · Q2 2027', readiness: 32, active: 'bs-totality',
  tree: [
    { vol: 'Module 1 — Administrative', items: [
      _s('bs-356h', '1.1', 'FDA Form 356h', 'draft', 0.50, 0),
      _s('bs-cl', '1.2', 'Cover letter', 'draft', 0.48, 0),
      _s('bs-label', '1.14', 'Draft labeling', 'draft', 0.42, 0),
    ] },
    { vol: 'Module 2 — Summaries', items: [
      _s('bs-qos', '2.3', 'Quality overall summary (analytical similarity)', 'draft', 0.45, 0),
      _s('bs-totality', '2.5', 'Clinical overview — totality of evidence', 'draft', 0.40, 0, { blocker: true }),
    ] },
    { vol: 'Module 3 — Analytical Similarity', items: [
      _s('bs-struct', '3.2.S.3', 'Structural / functional characterisation (vs. reference product)', 'draft', 0.48, 0),
      _s('bs-finger', '3.S.F', 'Analytical fingerprinting (orthogonal methods)', 'draft', 0.45, 0),
      _s('bs-mfg', '3.2.S.2', 'Manufacturing process (cell line, platform)', 'draft', 0.42, 0),
      _s('bs-dp', '3.2.P', 'Drug product (formulation differences, if any)', 'draft', 0.40, 0),
      _s('bs-stab', '3.2.P.8', 'Stability — comparative', 'draft', 0.38, 0),
    ] },
    { vol: 'Module 4 — Nonclinical', items: [
      _s('bs-anim', '4.1', 'Animal PK / PD comparative study', 'draft', 0.42, 0),
      _s('bs-tox', '4.2', 'Animal toxicity (if needed by INTERACT advice)', 'draft', 0.38, 0),
    ] },
    { vol: 'Module 5 — Clinical (Stepwise)', items: [
      _s('bs-pkpd', '5.1', 'Comparative clinical PK/PD study', 'draft', 0.40, 0, { blocker: true }),
      _s('bs-eff', '5.2', 'Comparative clinical efficacy trial (if residual uncertainty)', 'draft', 0.35, 0),
      _s('bs-immuno', '5.3', 'Immunogenicity assessment (comparative)', 'draft', 0.38, 0),
      _s('bs-switch', '5.4', 'Switching / interchangeability study (if seeking I-designation)', 'draft', 0.32, 0),
    ] },
  ],
};

// -- Aggregate map for pharma / CTD pathways --

export const CTD_PATHWAYS: PathwayMap = {
  ind: IND_PATHWAY,
  bla: BLA_PATHWAY,
  dmf: DMF_PATHWAY,
  anda: ANDA_PATHWAY,
  maa: MAA_PATHWAY,
  '505b2': NDA_505B2_PATHWAY,
  biosimilar: BIOSIMILAR_PATHWAY,
};
