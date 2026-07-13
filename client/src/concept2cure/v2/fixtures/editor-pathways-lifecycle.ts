// Lifecycle, cross-cutting, and regulatory consultation pathway fixtures.
// Designation, Post-Market Pharma, PV, Clinical Documents, EUA, QMS, Advice.
// Also includes the filing-to-pathway routing map.
import { makeSection as _s } from './editor-pathways-types';
import type { Pathway, PathwayMap, FilingToPathwayMap } from './editor-pathways-types';

// -- Designation -- FDA/EMA Expedited Designations --

export const DESIGNATION_PATHWAY: Pathway = {
  id: 'designation', kind: 'Expedited Designation', program: 'BX-204 — Breakthrough Therapy', code: 'BTD', ta: 'onc',
  owner: 'R. Patel', dueline: 'FDA Designation · Q2 2025', readiness: 55, active: 'des-rationale',
  tree: [
    { vol: 'Request Package', items: [
      _s('des-cover', 'A.1', 'Cover letter', 'complete', 0.97, 240),
      _s('des-form', 'A.2', 'Designation request form', 'complete', 0.95, 160),
      _s('des-rationale', 'B.1', 'Clinical rationale & unmet need', 'draft', 0.65, 1800, { blocker: true }),
      _s('des-evidence', 'B.2', 'Preliminary clinical evidence', 'draft', 0.58, 0),
      _s('des-dev', 'B.3', 'Development program plan', 'draft', 0.52, 0),
      _s('des-nonclin', 'B.4', 'Nonclinical summary (if applicable)', 'draft', 0.50, 0),
      _s('des-lit', 'B.5', 'Literature / epidemiology references', 'draft', 0.48, 0),
    ] },
  ],
};

// -- Post-Market Pharma -- Annual Reports, PSUR, REMS, RMP, PMR --

export const POSTMARKET_PATHWAY: Pathway = {
  id: 'postmarket', kind: 'Post-Market Lifecycle', program: 'Marketed Product — Annual/Periodic', code: 'Post-Mkt', ta: 'pharma',
  owner: 'D. Kapoor', dueline: 'Annual cycle · rolling', readiness: 45, active: 'pm-psur',
  tree: [
    { vol: 'Annual Reporting', items: [
      _s('pm-annual', '1.1', 'Annual report (NDA/BLA)', 'draft', 0.55, 0),
      _s('pm-dist', '1.2', 'Distribution data', 'draft', 0.50, 0),
      _s('pm-changes', '1.3', 'Summary of changes since last report', 'draft', 0.52, 0),
    ] },
    { vol: 'Periodic Safety', items: [
      _s('pm-psur', '2.1', 'PSUR / PBRER (ICH E2C(R2))', 'draft', 0.48, 0, { blocker: true }),
      _s('pm-signal', '2.2', 'Signal evaluation summary', 'draft', 0.45, 0),
      _s('pm-rmp', '2.3', 'Risk management plan (RMP)', 'draft', 0.42, 0),
      _s('pm-rems', '2.4', 'REMS assessment', 'draft', 0.40, 0),
    ] },
    { vol: 'Post-Marketing Commitments', items: [
      _s('pm-pmr', '3.1', 'Post-marketing requirement (PMR) / PMC', 'draft', 0.45, 0),
      _s('pm-supac', '3.2', 'SUPAC supplement', 'draft', 0.42, 0),
      _s('pm-medwatch', '3.3', 'MedWatch / FAERS report (Form 3500A)', 'draft', 0.40, 0),
    ] },
  ],
};

// -- PV -- Pharmacovigilance (ICSR, PSMF, Signal, B-R) --

export const PV_PATHWAY: Pathway = {
  id: 'pv', kind: 'Pharmacovigilance · GVP', program: 'Global PV System', code: 'PV', ta: 'cross',
  owner: 'S. Williams', dueline: 'Ongoing · GVP Module V', readiness: 48, active: 'pv-icsr',
  tree: [
    { vol: 'Individual Case Safety', items: [
      _s('pv-icsr', '1', 'Individual case safety report (ICSR / E2B(R3))', 'draft', 0.55, 0, { blocker: true }),
      _s('pv-triage', '2', 'Case triage & assessment SOP', 'draft', 0.50, 0),
      _s('pv-followup', '3', 'Follow-up report procedures', 'draft', 0.48, 0),
    ] },
    { vol: 'System & Signal', items: [
      _s('pv-psmf', '4', 'Pharmacovigilance system master file (PSMF)', 'draft', 0.50, 0),
      _s('pv-signal', '5', 'Signal detection & evaluation report', 'draft', 0.45, 0),
      _s('pv-br', '6', 'Benefit-risk assessment', 'draft', 0.42, 0),
    ] },
  ],
};

// -- Clinical Document -- CTN, DSUR, ICF, PIP --

export const CLINDOC_PATHWAY: Pathway = {
  id: 'clindoc', kind: 'Clinical Document · ICH', program: 'Clinical Development Documents', code: 'ClinDoc', ta: 'cross',
  owner: 'R. Patel', dueline: 'Per protocol milestones', readiness: 42, active: 'cd-dsur',
  tree: [
    { vol: 'Trial Notification & Planning', items: [
      _s('cd-ctn', '1', 'Clinical trial notification (CTN/CTA)', 'draft', 0.55, 0),
      _s('cd-protocol', '2', 'Clinical study protocol (ICH E6)', 'draft', 0.52, 0),
      _s('cd-sap', '3', 'Statistical analysis plan', 'draft', 0.50, 0),
      _s('cd-icf', '4', 'Informed consent form', 'draft', 0.48, 0),
    ] },
    { vol: 'Safety & Reporting', items: [
      _s('cd-dsur', '5', 'Development safety update report (DSUR / ICH E2F)', 'draft', 0.50, 0, { blocker: true }),
      _s('cd-ib', '6', 'Investigator brochure (IB)', 'draft', 0.48, 0),
    ] },
    { vol: 'Pediatric', items: [
      _s('cd-psp', '7', 'Pediatric study plan (PSP) / PIP', 'draft', 0.45, 0),
      _s('cd-ped', '8', 'Pediatric extrapolation report', 'draft', 0.40, 0),
    ] },
  ],
};

// -- EUA -- Emergency Use Authorization --

export const EUA_PATHWAY: Pathway = {
  id: 'eua', kind: 'EUA · 21 USC §360bbb-3', program: 'Emergency Use Product', code: 'EUA', ta: 'emergency',
  owner: 'J. Chen', dueline: 'FDA EUA · urgent', readiness: 30, active: 'eua-safety',
  tree: [
    { vol: 'EUA Request', items: [
      _s('eua-letter', '1', 'EUA request letter', 'draft', 0.55, 0),
      _s('eua-scope', '2', 'Product scope & intended use', 'draft', 0.52, 0),
      _s('eua-safety', '3', 'Safety data (known & potential risks)', 'draft', 0.48, 0, { blocker: true }),
      _s('eua-eff', '4', 'Effectiveness data (available evidence)', 'draft', 0.45, 0),
      _s('eua-alt', '5', 'Assessment of alternatives', 'draft', 0.42, 0),
      _s('eua-cond', '6', 'Proposed conditions of authorization', 'draft', 0.40, 0),
      _s('eua-fs', '7', 'Fact sheet (HCP & recipient)', 'draft', 0.38, 0),
      _s('eua-label', '8', 'Proposed labeling', 'draft', 0.35, 0),
    ] },
  ],
};

// -- QMS -- Quality Management System Docs --

export const QMS_PATHWAY: Pathway = {
  id: 'qms', kind: 'QMS · ISO 13485 / 21 CFR 820', program: 'Enterprise QMS Documentation', code: 'QMS', ta: 'cross',
  owner: 'L. Zhang', dueline: 'Ongoing maintenance', readiness: 60, active: 'qms-manual',
  tree: [
    { vol: 'Quality System', items: [
      _s('qms-manual', '1', 'Quality manual', 'review', 0.78, 3200, { blocker: true }),
      _s('qms-policy', '2', 'Quality policy & objectives', 'review', 0.80, 1200),
      _s('qms-org', '3', 'Organization chart & responsibilities', 'review', 0.82, 800),
    ] },
    { vol: 'Design Controls', items: [
      _s('qms-dhf', '4', 'Design history file (DHF)', 'draft', 0.55, 0),
      _s('qms-dmr', '5', 'Device master record (DMR)', 'draft', 0.52, 0),
      _s('qms-dhr', '6', 'Device history record (DHR)', 'draft', 0.50, 0),
      _s('qms-dio', '7', 'Design input / output specification', 'draft', 0.48, 0),
    ] },
    { vol: 'Audit & Compliance', items: [
      _s('qms-mdsap', '8', 'MDSAP audit report', 'draft', 0.45, 0),
      _s('qms-capa', '9', 'CAPA procedures', 'review', 0.75, 1600),
      _s('qms-nc', '10', 'Nonconformance management', 'review', 0.72, 1200),
      _s('qms-train', '11', 'Training & competency records', 'draft', 0.55, 0),
    ] },
  ],
};

// -- Scientific Advice -- Regulatory Consultation --

export const ADVICE_PATHWAY: Pathway = {
  id: 'advice', kind: 'Scientific Advice / Protocol Assistance', program: 'Regulatory Consultation', code: 'Advice', ta: 'cross',
  owner: 'R. Patel', dueline: 'Agency meeting · as scheduled', readiness: 50, active: 'adv-questions',
  tree: [
    { vol: 'Briefing Package', items: [
      _s('adv-cover', 'A.1', 'Cover letter / meeting request', 'complete', 0.97, 240),
      _s('adv-bg', 'A.2', 'Product background & development history', 'review', 0.80, 1600),
      _s('adv-questions', 'B.1', 'Questions for agency feedback', 'draft', 0.62, 0, { blocker: true }),
      _s('adv-position', 'B.2', 'Sponsor position & proposed approach', 'draft', 0.55, 0),
      _s('adv-data', 'B.3', 'Supporting data package', 'draft', 0.50, 0),
      _s('adv-plan', 'B.4', 'Proposed development plan', 'draft', 0.48, 0),
    ] },
  ],
};

// -- Aggregate map for lifecycle / cross-cutting pathways --

export const LIFECYCLE_PATHWAYS: PathwayMap = {
  designation: DESIGNATION_PATHWAY,
  postmarket: POSTMARKET_PATHWAY,
  pv: PV_PATHWAY,
  clindoc: CLINDOC_PATHWAY,
  eua: EUA_PATHWAY,
  qms: QMS_PATHWAY,
  advice: ADVICE_PATHWAY,
};

// -- Filing catalog ID to pathway ID routing map --
// Maps filing catalog IDs to pathway IDs so the catalog can route
// into the editor with the right section tree.

export const FILING_TO_PATHWAY: FilingToPathwayMap = {
  // Pharma & Biotech
  pre_ind_meeting: 'ind', ind_original: 'ind', ind_amendment: 'ind', ind_annual_report: 'ind',
  ind_safety_report: 'ind', ind_serial: 'ind',
  nda_original: 'ctd', nda_supplement: 'ctd', nda_annual_report: 'ctd',
  bla_original: 'bla', bla_supplement: 'bla',
  anda_original: 'anda', anda_supplement: 'anda',
  '505b2_nda': '505b2',
  biosimilar_351k: 'biosimilar',
  maa_centralised: 'maa', maa_dcp: 'maa', maa_mrp: 'maa', maa_national: 'maa',
  dmf_type_ii: 'dmf', dmf_type_iii: 'dmf',
  csr_ich_e3: 'csr',
  // Medical Devices
  '510k_traditional': 'estar', '510k_special': 'estar', '510k_abbreviated': 'estar',
  pma_original: 'pma', pma_supplement: 'pma',
  de_novo: 'denovo',
  ide_original: 'ide', ide_supplement: 'ide',
  hde_original: 'hde',
  cer_mdr: 'cer', cer_annex_xiv: 'cer',
  mdr_tech_doc: 'mdr',
  sted_imdrf: 'sted',
  // Diagnostics & IVD
  ivdr_tech_doc: 'ivdr', ivdr_class_c: 'ivdr', ivdr_class_d: 'ivdr',
  // Defaults
  _default: 'ctd',
  // Designations
  breakthrough_therapy: 'designation', fast_track: 'designation', accelerated_approval: 'designation',
  priority_review: 'designation', rmat: 'designation', prime: 'designation',
  orphan_fda: 'designation', orphan_ema: 'designation', sakigake: 'designation',
  conditional_ma: 'designation',
  // Post-market pharma
  annual_report_nda: 'postmarket', psur_pbrer: 'postmarket', rmp: 'postmarket',
  rems_assessment: 'postmarket', pmr_pmc: 'postmarket', supac: 'postmarket',
  medwatch: 'postmarket', dsur: 'postmarket',
  // Pre-submission device
  qsub: 'presub', pre_sub: 'presub', '513g': 'presub', rfd: 'presub',
  breakthrough_device: 'presub',
  // SaMD / AI-ML
  samd_denovo: 'samd', samd_510k: 'samd', pccp: 'samd', aiml_device: 'samd',
  // QMS
  iso13485: 'qms', qsr_820: 'qms', mdsap: 'qms', design_controls: 'qms',
  // PV
  icsr: 'pv', psmf: 'pv', signal_report: 'pv', benefit_risk: 'pv',
  // Clinical docs
  ctn: 'clindoc', cta: 'clindoc', clinical_protocol: 'clindoc', dsur_e2f: 'clindoc',
  psp: 'clindoc', pip: 'clindoc', ib: 'clindoc',
  // EUA
  eua_request: 'eua', eua_amendment: 'eua',
  // CDx
  cdx_pma: 'cdx', cdx_510k: 'cdx',
  // Post-market device
  mdr_report: 'pmdevice', mir: 'pmdevice', recall_report: 'pmdevice',
  fsca: 'pmdevice', pmcf_report: 'pmdevice', pma_annual: 'pmdevice',
  // IVD pre-sub
  ivd_presub: 'ivdpresub', clia_waiver: 'ivdpresub',
  // LDT
  ldt_notification: 'ldt', ldt_valid_act: 'ldt',
  // International device
  ukca: 'intldevice', hc_mdl: 'intldevice', pmda_shonin: 'intldevice',
  nmpa_device: 'intldevice', tga_artg: 'intldevice', anvisa_device: 'intldevice',
  swissmedic_device: 'intldevice',
  // Scientific advice
  scientific_advice_ema: 'advice', type_a_meeting: 'advice', type_b_meeting: 'advice',
  type_c_meeting: 'advice', pmda_consultation: 'advice', hc_presub_meeting: 'advice',
  // IVD post-market
  pmpf_report: 'ivdpostmarket', ivd_psur: 'ivdpostmarket', ivd_fsca: 'ivdpostmarket',
  // Regional drug submissions
  jnda: 'pmda', pmda_shonin_drug: 'pmda', pmda_bridging: 'pmda',
  nmpa_nda: 'nmpa', nmpa_ind: 'nmpa', nmpa_import: 'nmpa',
  tga_cat1: 'tga', tga_cat3: 'tga', tga_generic: 'tga',
  hc_nds: 'healthcanada', hc_snds: 'healthcanada', hc_ands: 'healthcanada',
  mhra_ma: 'mhra', mhra_ilap: 'mhra',
  swissmedic_auth: 'swissmedic',
  anvisa_registro: 'anvisa', anvisa_generic: 'anvisa',
  who_pq: 'who', who_eul: 'who',
};
