/* global window */
/* Phase 9 — Universal Authoring · data
 * ───────────────────────────────────────────────────────────
 * One canonical document model + (doc_type × agency) rule packs.
 * Every editor that lives today in the codebase (EstarEditor,
 * PmaEditor, CerEditor, ectd_coauthor, pdev/AiDraft) collapses
 * onto the AUTH_DOCS shape below.
 *
 * Schema (informative; lifts to mdx/data/authoring.ts in v2):
 *
 *   AuthDoc {
 *     id: string                          // c2c document id
 *     program: { code, title, indication, sponsor }
 *     type:   DocTypeId                   // see AUTH_DOC_TYPES
 *     agency: AgencyId                    // see AUTH_AGENCIES
 *     version: string                     // semver-ish
 *     state:  'draft'|'review'|'approved'|'locked'
 *     readiness: 0..100
 *     lastSaved: ISO8601
 *     outline: AuthSection[]              // tree, recursive .children
 *     evidence: EvidenceItem[]            // shared vault entries linked into this doc
 *     reviewers: Reviewer[]
 *     anaThread: AnaTurn[]                // conversation log for this doc
 *   }
 *
 *   AuthSection {
 *     id, path, label, owner, status,
 *     mandatory, dueAt, citationCount,
 *     paragraphs: Paragraph[]
 *     children?: AuthSection[]
 *   }
 *
 *   Paragraph {
 *     id, text, prov: { source, model, confidence, auditId, foot },
 *     citations: [{ evidenceId, span }],
 *     status: 'drafted'|'edited'|'approved'|'flagged'
 *   }
 */

/* ───────── Agencies — first-class rule packs at launch ───────── */
window.AUTH_AGENCIES = [
  { id: 'fda',    label: 'FDA',          full: 'U.S. Food and Drug Administration',          region: 'United States',  esubmit: 'ESG / FDA Gateway' },
  { id: 'ema',    label: 'EMA',          full: 'European Medicines Agency',                  region: 'European Union', esubmit: 'CESP · EMA Gateway' },
  { id: 'pmda',   label: 'PMDA',         full: 'Pharmaceuticals and Medical Devices Agency', region: 'Japan',          esubmit: 'PMDA Gateway' },
  { id: 'hc',     label: 'Health Canada',full: 'Health Canada',                              region: 'Canada',         esubmit: 'CESG' },
  { id: 'mhra',   label: 'MHRA',         full: 'Medicines and Healthcare products Regulatory Agency', region: 'United Kingdom', esubmit: 'MHRA Submissions' },
  { id: 'ich',    label: 'ICH harmonized',full: 'International Council for Harmonisation',    region: 'Multi-region',   esubmit: 'agency-neutral' },
  { id: 'tga',    label: 'TGA',          full: 'Therapeutic Goods Administration',           region: 'Australia',      esubmit: 'TGA Business Services' },
  { id: 'nmpa',   label: 'NMPA',         full: 'National Medical Products Administration',   region: 'China',          esubmit: 'NMPA eCTD Gateway' },
];

/* ───────── Document types ─────────
 * Each has: id, label, family (regulatory category), defaultAgencies, modules. */
window.AUTH_DOC_TYPES = [
  { id: 'ind',         label: 'IND',                 family: 'biopharma · investigational', defaultAgencies: ['fda', 'hc', 'mhra'],         icon: 'beaker' },
  { id: 'cta',         label: 'CTA',                 family: 'biopharma · investigational', defaultAgencies: ['ema', 'mhra', 'pmda', 'hc'], icon: 'beaker' },
  { id: 'nda',         label: 'NDA',                 family: 'biopharma · marketing',       defaultAgencies: ['fda'],                       icon: 'fileText' },
  { id: 'bla',         label: 'BLA',                 family: 'biopharma · marketing',       defaultAgencies: ['fda'],                       icon: 'fileText' },
  { id: 'maa',         label: 'MAA',                 family: 'biopharma · marketing',       defaultAgencies: ['ema'],                       icon: 'fileText' },
  { id: 'k510',        label: '510(k)',              family: 'medtech',                     defaultAgencies: ['fda'],                       icon: 'module' },
  { id: 'denovo',      label: 'De Novo',             family: 'medtech',                     defaultAgencies: ['fda'],                       icon: 'module' },
  { id: 'pma',         label: 'PMA',                 family: 'medtech',                     defaultAgencies: ['fda'],                       icon: 'module' },
  { id: 'cer',         label: 'Clinical Evaluation Report', family: 'medtech · EU MDR',     defaultAgencies: ['ema'],                       icon: 'shieldOk' },
  { id: 'psur',        label: 'PSUR / PBRER',        family: 'pharmacovigilance',           defaultAgencies: ['ema', 'fda', 'pmda'],        icon: 'scroll' },
  { id: 'ib',          label: 'Investigator Brochure', family: 'clinical',                  defaultAgencies: ['ich'],                       icon: 'book' },
  { id: 'protocol',    label: 'Protocol',            family: 'clinical',                    defaultAgencies: ['ich'],                       icon: 'fileText' },
  { id: 'csr',         label: 'Clinical Study Report (E3)', family: 'clinical',             defaultAgencies: ['ich'],                       icon: 'fileText' },
  { id: 'briefing',    label: 'Briefing Book',       family: 'meeting requests',            defaultAgencies: ['fda', 'ema', 'pmda'],        icon: 'quote' },
  { id: 'mod3',        label: 'Module 3 · CMC',      family: 'biopharma · quality',         defaultAgencies: ['ich'],                       icon: 'beaker' },
  { id: 'mod2',        label: 'Module 2 summaries',  family: 'biopharma · summary',         defaultAgencies: ['ich'],                       icon: 'section' },
];

/* ───────── Outline templates — the rule pack contract ─────────
 * Keyed by `${docType}:${agency}`; falls back to `${docType}:ich` then `${docType}:fda`.
 * Each section: { id, path, label, mandatory, owner?, status?, foot? } */
window.AUTH_OUTLINES = {
  /* IND × FDA — eCTD Module 1–5 (US Module 1) */
  'ind:fda': [
    { id: 'm1',      path: 'M1',      label: 'Module 1 · Administrative (US)', mandatory: true, children: [
      { id: 'm1.1',  path: '1.1',     label: 'Forms (1571, 1572, 3674)',     mandatory: true,  status: 'approved' },
      { id: 'm1.2',  path: '1.2',     label: 'Cover letter',                  mandatory: true,  status: 'drafted'  },
      { id: 'm1.3',  path: '1.3',     label: 'Administrative information',    mandatory: true,  status: 'drafted'  },
      { id: 'm1.14', path: '1.14',    label: 'Labeling',                      mandatory: false, status: 'todo'     },
    ]},
    { id: 'm2',      path: 'M2',      label: 'Module 2 · Summaries',          mandatory: true, children: [
      { id: 'm2.2',  path: '2.2',     label: 'Introduction',                  mandatory: true,  status: 'drafted'  },
      { id: 'm2.3',  path: '2.3',     label: 'Quality overall summary',       mandatory: true,  status: 'review'   },
      { id: 'm2.4',  path: '2.4',     label: 'Nonclinical overview',          mandatory: true,  status: 'drafted'  },
      { id: 'm2.5',  path: '2.5',     label: 'Clinical overview',             mandatory: true,  status: 'review', owner: 'JC' },
      { id: 'm2.6',  path: '2.6',     label: 'Nonclinical written and tabulated summaries', mandatory: true, status: 'drafted' },
      { id: 'm2.7',  path: '2.7',     label: 'Clinical summary',              mandatory: true,  status: 'drafted'  },
    ]},
    { id: 'm3',      path: 'M3',      label: 'Module 3 · Quality (CMC)',      mandatory: true, children: [
      { id: 'm3.2.s', path: '3.2.S',  label: 'Drug substance',                mandatory: true,  status: 'review', owner: 'AR' },
      { id: 'm3.2.p', path: '3.2.P',  label: 'Drug product',                  mandatory: true,  status: 'drafted' },
      { id: 'm3.2.a', path: '3.2.A',  label: 'Appendices',                    mandatory: false, status: 'todo' },
    ]},
    { id: 'm4',      path: 'M4',      label: 'Module 4 · Nonclinical',        mandatory: true, children: [
      { id: 'm4.2.1',path: '4.2.1',   label: 'Pharmacology',                  mandatory: true,  status: 'approved' },
      { id: 'm4.2.2',path: '4.2.2',   label: 'Pharmacokinetics',              mandatory: true,  status: 'approved' },
      { id: 'm4.2.3',path: '4.2.3',   label: 'Toxicology',                    mandatory: true,  status: 'review' },
    ]},
    { id: 'm5',      path: 'M5',      label: 'Module 5 · Clinical',           mandatory: true, children: [
      { id: 'm5.2',  path: '5.2',     label: 'Tabular listings of studies',   mandatory: true,  status: 'drafted'  },
      { id: 'm5.3.5',path: '5.3.5',   label: 'Study reports of efficacy and safety', mandatory: true, status: 'todo' },
      { id: 'm5.4',  path: '5.4',     label: 'Literature references',         mandatory: false, status: 'drafted' },
    ]},
  ],

  /* IND × MHRA (UK CTA) — Mod 1 swaps to UK admin */
  'ind:mhra': [
    { id: 'm1', path: 'M1', label: 'Module 1 · Administrative (UK)', mandatory: true, children: [
      { id: 'm1.0.uk', path: '1.0', label: 'Cover letter (UK)', mandatory: true, status: 'drafted' },
      { id: 'm1.2.uk', path: '1.2', label: 'Application form', mandatory: true, status: 'todo' },
      { id: 'm1.3.uk', path: '1.3', label: 'SmPC, labeling, package leaflet', mandatory: true, status: 'todo' },
    ]},
  ],

  /* CTA × EMA (EU) — Mod 1 EU */
  'cta:ema': [
    { id: 'm1', path: 'M1', label: 'Module 1 · Administrative (EU)', mandatory: true, children: [
      { id: 'm1.0', path: '1.0', label: 'Cover letter',           mandatory: true, status: 'drafted' },
      { id: 'm1.2', path: '1.2', label: 'Comprehensive ToC',      mandatory: true, status: 'todo' },
      { id: 'm1.3', path: '1.3', label: 'Product information',    mandatory: true, status: 'todo' },
      { id: 'm1.4', path: '1.4', label: 'Information on experts', mandatory: true, status: 'drafted' },
      { id: 'm1.5', path: '1.5', label: 'Specific requirements',  mandatory: false, status: 'todo' },
    ]},
    { id: 'm2', path: 'M2', label: 'Module 2 · Summaries (ICH)', mandatory: true, status: 'review' },
  ],

  /* 510(k) × FDA — eSTAR sections */
  'k510:fda': [
    { id: 'admin',    path: 'A', label: 'Administrative',          mandatory: true, status: 'approved', children: [
      { id: 'fda3514', path: 'A1', label: 'FDA Form 3514',         mandatory: true, status: 'approved' },
      { id: 'covers',  path: 'A2', label: 'Cover letter',          mandatory: true, status: 'drafted'  },
      { id: 'indicat', path: 'A3', label: 'Indications for use',   mandatory: true, status: 'review'   },
    ]},
    { id: 'device',   path: 'B', label: 'Device description',      mandatory: true, status: 'drafted', children: [
      { id: 'desc',    path: 'B1', label: 'Device description',    mandatory: true, status: 'drafted' },
      { id: 'tech',    path: 'B2', label: 'Technological comparison', mandatory: true, status: 'review' },
    ]},
    { id: 'subst',    path: 'C', label: 'Substantial equivalence', mandatory: true, status: 'review', owner: 'JC', children: [
      { id: 'pred',    path: 'C1', label: 'Predicate device(s)',   mandatory: true, status: 'review' },
      { id: 'se',      path: 'C2', label: 'SE discussion',         mandatory: true, status: 'drafted' },
    ]},
    { id: 'perf',     path: 'D', label: 'Performance testing',     mandatory: true, status: 'drafted', children: [
      { id: 'bench',   path: 'D1', label: 'Bench testing',         mandatory: true, status: 'drafted' },
      { id: 'animal',  path: 'D2', label: 'Animal / clinical',     mandatory: false, status: 'todo' },
      { id: 'biocomp', path: 'D3', label: 'Biocompatibility',      mandatory: true, status: 'drafted' },
      { id: 'sterile', path: 'D4', label: 'Sterilization / shelf life', mandatory: true, status: 'review' },
      { id: 'sw',      path: 'D5', label: 'Software',              mandatory: false, status: 'todo' },
      { id: 'cyber',   path: 'D6', label: 'Cybersecurity',         mandatory: false, status: 'todo' },
    ]},
    { id: 'labeling', path: 'E', label: 'Labeling',                mandatory: true, status: 'drafted' },
  ],

  /* PMA × FDA — Modular PMA */
  'pma:fda': [
    { id: 'admin', path: 'A', label: 'Administrative information', mandatory: true, status: 'drafted' },
    { id: 'sum',   path: 'B', label: 'Summary of safety and effectiveness data (SSED)', mandatory: true, status: 'review', owner: 'JC' },
    { id: 'preclin', path: 'C', label: 'Preclinical studies',     mandatory: true, status: 'drafted' },
    { id: 'clin',  path: 'D', label: 'Clinical investigations',  mandatory: true, status: 'review' },
    { id: 'mfg',   path: 'E', label: 'Manufacturing information', mandatory: true, status: 'drafted' },
    { id: 'lbl',   path: 'F', label: 'Labeling',                  mandatory: true, status: 'drafted' },
  ],

  /* CER × EMA (EU MDR) — MEDDEV 2.7/1 Rev 4 outline */
  'cer:ema': [
    { id: 'scope',   path: 'A0', label: 'Scope of the clinical evaluation',   mandatory: true, status: 'approved' },
    { id: 'sota',    path: 'A1', label: 'State of the art',                    mandatory: true, status: 'review', owner: 'AR' },
    { id: 'devdesc', path: 'A2', label: 'Device description and equivalence',  mandatory: true, status: 'drafted' },
    { id: 'eval',    path: 'A3', label: 'Clinical evaluation methodology',     mandatory: true, status: 'drafted' },
    { id: 'data',    path: 'A4', label: 'Clinical data sources',               mandatory: true, status: 'review' },
    { id: 'appraise',path: 'A5', label: 'Appraisal of clinical data',          mandatory: true, status: 'drafted' },
    { id: 'risk',    path: 'A6', label: 'Risk-benefit analysis',               mandatory: true, status: 'todo'   },
    { id: 'pms',     path: 'A7', label: 'PMS / PMCF linkage',                  mandatory: true, status: 'todo'   },
    { id: 'concl',   path: 'A8', label: 'Conclusions',                         mandatory: true, status: 'todo'   },
  ],

  /* PSUR × EMA */
  'psur:ema': [
    { id: 'intro',     path: '1',  label: 'Introduction',                    mandatory: true, status: 'drafted' },
    { id: 'status',    path: '2',  label: 'Worldwide marketing authorization status', mandatory: true, status: 'drafted' },
    { id: 'actions',   path: '3',  label: 'Actions taken in the reporting interval for safety reasons', mandatory: true, status: 'review' },
    { id: 'estimexp',  path: '5',  label: 'Estimated exposure and use patterns', mandatory: true, status: 'drafted' },
    { id: 'safety',    path: '6',  label: 'Data in summary tabulations',     mandatory: true, status: 'review', owner: 'AR' },
    { id: 'sigeval',   path: '15', label: 'Signal and risk evaluation',       mandatory: true, status: 'drafted' },
    { id: 'br',        path: '17', label: 'Benefit-risk analysis evaluation', mandatory: true, status: 'todo' },
    { id: 'concl',     path: '18', label: 'Conclusions and actions',          mandatory: true, status: 'todo' },
  ],

  /* Investigator Brochure × ICH */
  'ib:ich': [
    { id: 'summary',   path: '1', label: 'Summary',                          mandatory: true, status: 'approved' },
    { id: 'intro',     path: '2', label: 'Introduction',                     mandatory: true, status: 'drafted' },
    { id: 'physchem',  path: '3', label: 'Physical, chemical, pharmaceutical properties and formulation', mandatory: true, status: 'review' },
    { id: 'nonclin',   path: '4', label: 'Nonclinical studies',              mandatory: true, status: 'drafted' },
    { id: 'effhuman', path: '5', label: 'Effects in humans',                 mandatory: true, status: 'review', owner: 'JC' },
    { id: 'summary2',  path: '6', label: 'Summary of data and guidance for the investigator', mandatory: true, status: 'drafted' },
  ],

  /* Protocol × ICH (E6 R3-aware) */
  'protocol:ich': [
    { id: 'genrl',     path: '1', label: 'General information',              mandatory: true, status: 'approved' },
    { id: 'rat',       path: '2', label: 'Background and rationale',         mandatory: true, status: 'drafted' },
    { id: 'obj',       path: '3', label: 'Objectives and endpoints',         mandatory: true, status: 'review', owner: 'BK' },
    { id: 'design',    path: '4', label: 'Trial design',                     mandatory: true, status: 'review' },
    { id: 'pop',       path: '5', label: 'Population and selection criteria', mandatory: true, status: 'drafted' },
    { id: 'treat',     path: '6', label: 'Treatments and interventions',     mandatory: true, status: 'drafted' },
    { id: 'assess',    path: '7', label: 'Assessments and procedures',       mandatory: true, status: 'drafted' },
    { id: 'stat',      path: '8', label: 'Statistical considerations',       mandatory: true, status: 'review' },
    { id: 'ethics',    path: '9', label: 'Ethics, regulatory and quality oversight', mandatory: true, status: 'drafted' },
  ],

  /* CSR × ICH (E3) */
  'csr:ich': [
    { id: 'syn',       path: '1',  label: 'Title page and synopsis',         mandatory: true, status: 'drafted' },
    { id: 'invs',      path: '6',  label: 'Investigators and admin',         mandatory: true, status: 'drafted' },
    { id: 'intro',     path: '7',  label: 'Introduction',                    mandatory: true, status: 'drafted' },
    { id: 'obj',       path: '8',  label: 'Study objectives',                mandatory: true, status: 'approved' },
    { id: 'design',    path: '9',  label: 'Investigational plan',            mandatory: true, status: 'review' },
    { id: 'eff',       path: '11', label: 'Efficacy evaluation',             mandatory: true, status: 'review', owner: 'JC' },
    { id: 'saf',       path: '12', label: 'Safety evaluation',               mandatory: true, status: 'drafted' },
    { id: 'discuss',   path: '13', label: 'Discussion and overall conclusions', mandatory: true, status: 'drafted' },
  ],

  /* Briefing Book × FDA (Pre-IND, Type A/B/C/D) */
  'briefing:fda': [
    { id: 'intro',     path: '1', label: 'Introduction and purpose',         mandatory: true, status: 'drafted' },
    { id: 'product',   path: '2', label: 'Product overview',                 mandatory: true, status: 'drafted' },
    { id: 'devplan',   path: '3', label: 'Development plan',                 mandatory: true, status: 'review', owner: 'JC' },
    { id: 'quest',     path: '4', label: 'Questions for the agency',         mandatory: true, status: 'review' },
    { id: 'support',   path: '5', label: 'Supporting summaries',             mandatory: true, status: 'drafted' },
    { id: 'app',       path: '6', label: 'Appendices',                       mandatory: false, status: 'todo' },
  ],

  /* Module 3 CMC × ICH */
  'mod3:ich': [
    { id: 's',  path: '3.2.S', label: 'Drug substance',  mandatory: true, status: 'review' },
    { id: 'p',  path: '3.2.P', label: 'Drug product',    mandatory: true, status: 'drafted' },
    { id: 'a',  path: '3.2.A', label: 'Appendices',      mandatory: false, status: 'todo' },
    { id: 'r',  path: '3.2.R', label: 'Regional information', mandatory: true, status: 'drafted' },
  ],

  /* Module 2 × ICH */
  'mod2:ich': [
    { id: '2.2', path: '2.2', label: 'Introduction',                          mandatory: true, status: 'drafted' },
    { id: '2.3', path: '2.3', label: 'Quality overall summary',               mandatory: true, status: 'review' },
    { id: '2.4', path: '2.4', label: 'Nonclinical overview',                  mandatory: true, status: 'drafted' },
    { id: '2.5', path: '2.5', label: 'Clinical overview',                     mandatory: true, status: 'review', owner: 'JC' },
    { id: '2.6', path: '2.6', label: 'Nonclinical written / tabulated summaries', mandatory: true, status: 'drafted' },
    { id: '2.7', path: '2.7', label: 'Clinical summary',                      mandatory: true, status: 'drafted' },
  ],
};

/* ───────── Evidence library (vault entries the doc links into) ───────── */
window.AUTH_EVIDENCE = [
  { id: 'csr-099',     kind: 'CSR',         title: 'BX204-101 Phase I CSR', meta: '184 subjects · 2024-03', tag: 'sponsor', conf: 0.96 },
  { id: 'csr-201',     kind: 'CSR',         title: 'BX204-201 Phase II CSR (pivotal)', meta: 'ORR 38.6% · 2025-09', tag: 'sponsor', conf: 0.98 },
  { id: 'sap-v3',      kind: 'SAP',         title: 'Statistical Analysis Plan v3', meta: 'Approved 2024-11-08', tag: 'sponsor', conf: 0.99 },
  { id: 'fda-2023-bx', kind: 'Guidance',    title: 'FDA 2023 oncology bridging guidance', meta: 'Section IV.C', tag: 'agency', conf: 0.91 },
  { id: 'ema-h-5612',  kind: 'Precedent',   title: 'EMEA/H/C/005612 Assessment Report', meta: 'Section 4.3', tag: 'agency', conf: 0.87 },
  { id: 'pmda-y-203',  kind: 'Consultation',title: 'PMDA Y-203 consultation response', meta: '2024-08-12', tag: 'agency', conf: 0.76 },
  { id: 'iso-10993',   kind: 'Standard',    title: 'ISO 10993-1:2018 biocompatibility', meta: 'A1:2022 amendment', tag: 'standard', conf: 0.99 },
  { id: 'iec-62304',   kind: 'Standard',    title: 'IEC 62304 software lifecycle',     meta: 'Class B applied',     tag: 'standard', conf: 0.99 },
  { id: 'mdr-annex2',  kind: 'Regulation',  title: 'EU MDR Annex II §6.1',             meta: 'Technical documentation', tag: 'regulation', conf: 0.99 },
  { id: 'meddev-271',  kind: 'Guidance',    title: 'MEDDEV 2.7/1 Rev 4',               meta: 'Sections 8 + 9',        tag: 'agency',     conf: 0.94 },
  { id: 'ich-e3',      kind: 'Guideline',   title: 'ICH E3 (CSR structure)',           meta: 'Step 4 final',          tag: 'standard',   conf: 0.99 },
  { id: 'rim-bx-204',  kind: 'RIM precedent', title: 'RIM precedent — anti-RTK-X bridging', meta: '12 matches · score 0.89', tag: 'rim', conf: 0.89 },
];

/* ───────── Reviewers / owners ───────── */
window.AUTH_REVIEWERS = [
  { id: 'JC', name: 'Jordan Chen',  role: 'Reg Affairs lead', tone: 'lead' },
  { id: 'AR', name: 'Alex Reyes',   role: 'CMC / quality',    tone: 'reviewer' },
  { id: 'BK', name: 'Brooke Kim',   role: 'Biostatistics',    tone: 'reviewer' },
  { id: 'MS', name: 'Marina Stein', role: 'Medical writer',   tone: 'author' },
  { id: 'TP', name: 'Theo Park',    role: 'Clinical safety',  tone: 'reviewer' },
];

/* ───────── Programs (the doc lives under one) ───────── */
window.AUTH_PROGRAMS = [
  { code: 'NDA 212345',  title: 'BX-204',         indication: 'RTK-X+ solid tumors',          sponsor: 'Concept2Cure Bio' },
  { code: 'IND 178902',  title: 'BX-301',         indication: 'Relapsed MM',                  sponsor: 'Concept2Cure Bio' },
  { code: 'K243829',     title: 'BX-D2 device',   indication: 'Cardiac monitoring',           sponsor: 'Concept2Cure Med' },
  { code: 'CER 2025-01', title: 'BX-D2 device',   indication: 'Cardiac monitoring',           sponsor: 'Concept2Cure Med' },
];

/* ───────── Sample sections — fully populated for the demo doc
 * The shell shows skeleton paragraphs for any section without a body
 * entry; this fixture covers the section the conversational mode
 * opens on by default. */
window.AUTH_SECTION_BODY = {
  'm2.5': {
    heading: 'Clinical overview',
    subheading: 'NDA 212345 · BX-204',
    paragraphs: [
      { id: 'p1', tag: 'h2', text: '1. Product overview' },
      { id: 'p2', text: 'BX-204 is a humanized IgG1κ monoclonal antibody targeting the extracellular domain of receptor tyrosine kinase X (RTK-X), engineered with Fc-silencing mutations (L234A/L235A) to abrogate effector function and developed for adults with advanced or metastatic RTK-X–overexpressing solid tumors.',
        prov: { source: 'CSR-099, IB v3.1, IND module 2.7.4', model: 'AnA 1.0', confidence: 0.94, auditId: 'aud_8b21f', foot: 'Drafted from IND §2.7.4 · 2 sources · CFR-11 chain verified' },
        citations: [{ ev: 'csr-099' }],
      },
      { id: 'p3', tag: 'h2', text: '2. Pivotal efficacy' },
      { id: 'p4', text: 'Efficacy was evaluated in BX204-201, a pivotal, multicenter, open-label, single-arm Phase II trial enrolling 184 adults with RTK-X-positive advanced solid tumors refractory to ≥1 prior systemic therapy. The primary endpoint was confirmed objective response rate (ORR) assessed by blinded independent central review per RECIST v1.1.',
        prov: { source: 'CSR-201, SAP v3, Protocol BX204-201', model: 'AnA 1.0', confidence: 0.95, auditId: 'aud_8b22a', foot: 'Drafted from CSR-201 §6.1 · 3 sources · 1 reviewer edit' },
        citations: [{ ev: 'csr-201' }, { ev: 'sap-v3' }],
      },
      { id: 'p5', text: 'The confirmed ORR of 38.6% (95% CI 31.5–46.0) exceeded the pre-specified threshold of 25% derived from an indication-matched pooled historical control of 412 patients across five sponsor-independent datasets (2019–2023). The magnitude and consistency of effect across pre-specified subgroups, together with the FDA 2023 oncology bridging guidance and precedent EMEA/H/C/005612, support the benefit-risk case for accelerated approval.',
        prov: { source: 'CSR-201, FDA 2023 bridging guidance, EMA precedent', model: 'AnA 1.0', confidence: 0.92, auditId: 'aud_8b22b', foot: 'Strengthened against RIM precedent 0.89 · 2025-04-12' },
        citations: [{ ev: 'csr-201' }, { ev: 'fda-2023-bx' }, { ev: 'ema-h-5612' }],
      },
      { id: 'p6', tag: 'h2', text: '3. Safety' },
      { id: 'p7', text: 'Across the 184-subject pivotal cohort and the supportive Phase I population (n=42), the most common treatment-emergent adverse events were grade 1–2 infusion reactions (24.5%), fatigue (18.5%) and rash (11.4%). Grade ≥3 events related to study drug occurred in 6.5% of subjects; one treatment-related grade 5 event (immune-mediated pneumonitis) was reported.',
        prov: { source: 'CSR-201 §10.4, IB v3.1', model: 'AnA 1.0', confidence: 0.88, auditId: 'aud_8b22c', foot: 'Needs reviewer attention · pneumonitis disclosure pending' },
        citations: [{ ev: 'csr-201' }],
      },
      { id: 'p8', tag: 'h2', text: '4. Benefit-risk conclusion' },
      { id: 'p9', text: 'The clinical evidence supports a favorable benefit-risk profile for BX-204 in the proposed indication. The accelerated approval pathway is recommended on the basis of a confirmed ORR that meets the pre-specified threshold, a safety profile consistent with mechanism, and durable responses in the post-platinum subset.',
        prov: { source: 'CSR-201 §13, RIM precedent', model: 'AnA 1.0', confidence: 0.86, auditId: 'aud_8b22d', foot: 'Author-edited · last reviewed 11 minutes ago' },
        citations: [{ ev: 'csr-201' }, { ev: 'rim-bx-204' }],
      },
    ],
  },

  'c2': {  /* 510(k) — SE discussion */
    heading: 'Substantial equivalence discussion',
    subheading: 'K243829 · BX-D2 cardiac monitor',
    paragraphs: [
      { id: 'p1', tag: 'h2', text: '1. Predicate identification' },
      { id: 'p2', text: 'The proposed BX-D2 cardiac monitor is substantially equivalent to the legally marketed predicate K221456 (PrediCare CM-100, cleared 2022-08-19), and to the reference device K201123 for software class B claims. Both share the intended use of continuous ambulatory single-lead ECG monitoring in adults.',
        prov: { source: 'K221456 510(k) summary, FDA product code DSI', model: 'AnA 1.0', confidence: 0.93, auditId: 'aud_d29a', foot: 'Drafted from predicate match · RIM 0.91' },
      },
      { id: 'p3', text: 'Technological characteristics are equivalent in indications for use, anatomical site, energy source (rechargeable Li-ion), sampling rate (250 Hz), and sensor topology. The only meaningful difference is the on-device arrhythmia detection algorithm — addressed in Section C2 of this submission via bench data and the special controls invoked by IEC 62304 Class B.',
        prov: { source: 'Bench protocol BP-D2-001, IEC 62304 §5', model: 'AnA 1.0', confidence: 0.9, auditId: 'aud_d29b', foot: 'Cross-checks IEC 62304 Class B controls' },
        citations: [{ ev: 'iec-62304' }],
      },
    ],
  },
};

/* ───────── Seed conversation (the “Build with AnA” thread) ───────── */
window.AUTH_SEED_THREAD = [
  { role: 'user', text: 'Open NDA 212345 §2.5 against the Phase II CSR and the FDA 2023 bridging guidance.' },
  { role: 'ai', blocks: [
    { kind: 'p',    text: 'Loaded NDA 212345 — clinical overview. Pulling sources and the active rule pack first.' },
    { kind: 'tool', label: 'Rule pack', value: 'IND × FDA · eCTD Module 1–5 · ICH M4 base' },
    { kind: 'tool', label: 'Pulled',    value: 'Protocol BX204-201, CSR-099, CSR-201, SAP v3' },
    { kind: 'tool', label: 'Matched',   value: 'FDA 2023 bridging guidance · RIM precedent 0.91' },
    { kind: 'tool', label: 'Matched',   value: 'EMA precedent EMEA/H/C/005612 (0.87)' },
    { kind: 'p',    text: 'Drafted §2.5.1, §2.5.2 and the efficacy summary against your corpus. Hover any paragraph for provenance. Select a span to ask me to strengthen, tighten, or find precedent.' },
    { kind: 'chip', title: '§2.5 Clinical overview', meta: '4 sections · 11 citations · v0.4 draft' },
  ]},
];

/* ───────── REWRITES (text→strengthened-text replacements, used by selection toolbar) ───────── */
window.AUTH_REWRITES = {
  p4: 'Efficacy was evaluated in BX204-201, a pivotal, multicenter, open-label, single-arm Phase II trial enrolling 184 adults with RTK-X–positive advanced or metastatic solid tumors refractory to ≥1 prior systemic therapy. The primary endpoint was confirmed objective response rate (ORR) assessed by blinded independent central review using RECIST v1.1, with response duration and progression-free survival as key secondary endpoints. Baseline characteristics were balanced with the historical control set used for the bridging argument.',
  p5: 'The confirmed ORR of 38.6% (95% CI 31.5–46.0) exceeded the pre-specified threshold of 25%, derived from an indication-matched pooled historical control of 412 patients across five sponsor-independent datasets (2019–2023). The magnitude and consistency of effect across pre-specified subgroups — prior lines of therapy, ECOG 0 vs 1, and RTK-X IHC 2+ vs 3+ — combined with the FDA 2023 bridging guidance and EMA precedent EMEA/H/C/005612, support the benefit-risk case for accelerated approval.',
  p2: 'BX-204 is a humanized IgG1κ monoclonal antibody with picomolar affinity for the extracellular domain of receptor tyrosine kinase X (RTK-X), engineered with Fc-silencing mutations (L234A/L235A) to abrogate effector function and developed for the treatment of adults with advanced or metastatic RTK-X–overexpressing solid tumors.',
};

/* ───────── Compliance gates — Phase 9.2 / Moat #1 ─────────
 * Inline validators that run while drafting. Each finding pins to a
 * (paragraphId, matchText) tuple. In v2 these come from a server-side
 * validator service that joins:
 *   - the (doc_type, agency) rule pack's required-claim list,
 *   - the section's evidence chain (vault + RIM),
 *   - cross-section consistency (numbers, citations, definitions).
 * Severity: 'err' (block submission) | 'warn' (reviewer attention) | 'info'.
 * Category: 'number' | 'citation' | 'consistency' | 'evidence' | 'style'. */
window.AUTH_GATES = {
  p2: [
    { id: 'g1', match: 'L234A/L235A', sev: 'info',
      category: 'consistency',
      title: 'Cross-document term check',
      desc: 'Fc-silencing mutations are referenced as "L234A/L235A" here, "LALA" in M3 §3.2.S.1. Both are valid IgG1 nomenclature.',
      fix: 'Standardize on "L234A/L235A (LALA)" across both sections',
      apply: 'L234A/L235A (LALA)' },
  ],
  p4: [
    { id: 'g2', match: '184 adults', sev: 'err',
      category: 'number',
      title: 'Source data mismatch',
      desc: 'CSR-201 §6.1 (Table 14.1.1) reports the safety population as n=186 (184 evaluable + 2 screen-failure withdrawn after dosing). This section claims 184; the safety section will cite 186.',
      fix: 'Update to "186 adults dosed (184 efficacy-evaluable per protocol)"',
      apply: '186 adults dosed (184 efficacy-evaluable per protocol)' },
    { id: 'g3', match: '≥1 prior', sev: 'warn',
      category: 'consistency',
      title: 'Inclusion criterion threshold',
      desc: 'Protocol BX204-201 v3.1 §5.1.4 specifies "≥1 prior platinum-based regimen". This section omits the platinum-based qualifier, which the agency may flag as scope drift.',
      fix: 'Add "platinum-based" qualifier',
      apply: '≥1 prior platinum-based systemic therapy' },
  ],
  p5: [
    { id: 'g4', match: '38.6%', sev: 'info',
      category: 'evidence',
      title: 'Source anchored',
      desc: 'ORR 38.6% verified against CSR-201 §6.2 Table 14.2.1 and the matched SAP §9.4 analysis plan.',
      fix: null,
      apply: null },
    { id: 'g5', match: 'pre-specified threshold of 25%', sev: 'err',
      category: 'citation',
      title: 'Superseded citation',
      desc: 'The 25% threshold cites FDA 2023 oncology bridging guidance §IV.C. That guidance was superseded by FDA 2024 oncology accelerated-approval guidance §V.B (March 2024). The new threshold framework requires citing both.',
      fix: 'Add citation to FDA 2024 §V.B alongside FDA 2023',
      apply: 'pre-specified threshold of 25% (FDA 2024 oncology accelerated-approval guidance §V.B, consistent with FDA 2023 bridging guidance §IV.C)' },
    { id: 'g6', match: 'EMA precedent EMEA/H/C/005612', sev: 'warn',
      category: 'evidence',
      title: 'Cross-agency precedent strength',
      desc: 'EMEA/H/C/005612 is a strong RIM match (0.87). Consider adding PMDA Y-203 (0.76) to strengthen the JNDA filing argument, since this section is shared with the JNDA pack.',
      fix: 'Add PMDA Y-203 as supporting precedent',
      apply: 'EMA precedent EMEA/H/C/005612 and PMDA consultation Y-203' },
  ],
  p7: [
    { id: 'g7', match: 'grade 5 event', sev: 'err',
      category: 'consistency',
      title: 'Pharmacovigilance disclosure gap',
      desc: 'A grade 5 (fatal) treatment-related event is disclosed here but the PV signals queue shows the case is still under final adjudication. Disclosure must align with the PSUR for BX-099 and the upcoming label.',
      fix: 'Mark as "pending adjudication" until PV signal s2 closes',
      apply: 'one treatment-related event with a fatal outcome (Grade 5, pending final adjudication)' },
  ],
};

/* Category labels for the popover header */
window.AUTH_GATE_CATEGORIES = {
  number:      'Number check',
  citation:    'Citation check',
  consistency: 'Cross-document consistency',
  evidence:    'Evidence chain',
  style:       'Style',
};

/* ───────── Slash commands surfaced in the composer */
window.AUTH_SLASH_COMMANDS = [
  { id: 'cite',      label: '/cite',      hint: 'attach an evidence chip to the selection' },
  { id: 'precedent', label: '/precedent', hint: 'search RIM for a regulatory precedent' },
  { id: 'tighten',   label: '/tighten',   hint: 'shorten while preserving claims' },
  { id: 'strengthen',label: '/strengthen',hint: 'strengthen against best precedent' },
  { id: 'diff',      label: '/diff',      hint: 'show a side-by-side diff vs prior version' },
  { id: 'review',    label: '/review',    hint: 'request review from a named reviewer' },
  { id: 'flag',      label: '/flag',      hint: 'flag for reviewer attention' },
  { id: 'crossref',  label: '/crossref',  hint: 'cross-reference to another section' },
  { id: 'validate',  label: '/validate',  hint: 'run agency rule-pack validators on this section' },
  { id: 'translate', label: '/translate', hint: 'translate against an alternate agency pack' },
];

/* ───────── Skills / tool palette ───────── */
window.AUTH_SKILLS = [
  { id: 'draft.section',     label: 'Draft section',            hint: 'Generate from corpus + rule pack' },
  { id: 'draft.compare',     label: 'Compare to predicate',     hint: '510(k) substantial equivalence' },
  { id: 'evidence.pull',     label: 'Pull evidence',            hint: 'Vault + RIM corpus search' },
  { id: 'risk.benefit',      label: 'Risk-benefit synthesis',   hint: 'Subgroup + historical control' },
  { id: 'translate.agency',  label: 'Translate agency pack',    hint: 'CTD ↔ eSTAR ↔ CER ↔ JNDA' },
  { id: 'validate.pack',     label: 'Validate against pack',    hint: 'Run mandatory-section + format checks' },
  { id: 'precedent.search',  label: 'Precedent search',         hint: 'Match across FDA, EMA, PMDA, MHRA' },
  { id: 'submission.compile',label: 'Compile submission',       hint: 'Bind sections into agency package' },
];

/* Default open doc + section for the demo. */
window.AUTH_DEFAULT = {
  programIdx: 0,
  docType: 'ind',
  agency: 'fda',
  openSectionId: 'm2.5',
  state: 'draft',
  version: 'v0.4',
  readiness: 78,
};
