/**
 * editor-health-data.ts
 * Fixture data and types for the Editor Health & Readiness surfaces.
 *
 * Ported from kit editor-health.jsx -- contains section context map,
 * M1 builder checklists, status metadata, and market definitions.
 */

/* ── Types ─────────────────────────────────────────────────────────── */

export interface SectionAction {
  id: string;
  label: string;
  desc: string;
  ic: string;
  verb: string;
}

export interface SectionContextEntry {
  type: string;
  needs: string[];
  evidence: string[];
  deficiencies: string[];
  actions: SectionAction[];
}

export interface M1ChecklistItem {
  id: string;
  label: string;
  ref: string;
  status: 'complete' | 'draft' | 'not_started' | 'in_review';
  notes: string;
}

export interface M1StatusMetaEntry {
  label: string;
  color: string;
  bg: string;
}

export interface M1MarketDef {
  id: string;
  agency: string;
  flag: string;
  instrument: string;
  region: string;
}

/** Shape of window.RCE_MARKETS_MATRIX consumed by DossierReadiness. */
export interface MarketsMatrixTarget {
  id: string;
  flag: string;
  agency: string;
  instrument: string;
  region: string;
}

export interface MarketsMatrixModule {
  label: string;
  common: boolean;
  markets: Record<string, number>;
}

export interface MarketsMatrixGap {
  sev: 'err' | 'warn';
  doc: string;
  note: string;
  module: string;
}

export interface MarketsMatrix {
  program: string;
  targets: MarketsMatrixTarget[];
  modules: MarketsMatrixModule[];
  gaps: Record<string, MarketsMatrixGap[]>;
}

export interface HealthMetrics {
  readiness: number;
  contradictions: number;
  warnings: number;
  missingEvidence: number;
  regGaps: number;
  wordCount: number;
  isEmpty: boolean;
}

export interface Recommendation {
  sev: 'err' | 'warn' | 'info' | 'ok';
  text: string;
  action: string;
}

/* ── Deep section context map ──────────────────────────────────────── */

export const SEC_CONTEXT: Record<string, SectionContextEntry> = {
  '1.1': { type: 'Cover letter', needs: ['Application form', 'Fee schedule', 'Contact details', 'Serial number'],
    evidence: ['Administrative package'], deficiencies: ['Missing serial number', 'Incorrect form version'],
    actions: [
      { id: 'validate_form', label: 'Validate form fields', desc: 'Check completeness against agency requirements', ic: 'shieldCheck', verb: 'preflight' },
    ] },
  '1.2': { type: 'Administrative information', needs: ['Labeling', 'Patent info', 'Exclusivity claims', 'Environmental assessment'],
    evidence: ['PI/USPI', 'Patent certificates'], deficiencies: ['Missing environmental assessment', 'Incomplete patent listing'],
    actions: [
      { id: 'check_patent', label: 'Check patent consistency', desc: 'Cross-reference Orange Book entries', ic: 'search', verb: 'precedent' },
    ] },
  '2.2': { type: 'Introduction to module 2', needs: ['Product overview', 'Development rationale', 'Application scope'],
    evidence: ['TPP', 'Development plan'], deficiencies: ['Missing development rationale'],
    actions: [] },
  '2.3': { type: 'Quality overall summary', needs: ['Drug substance characterization', 'Drug product formulation', 'Specifications', 'Stability overview', 'Container closure'],
    evidence: ['CMC data package', 'CoA', 'Stability reports', 'Analytical validation'], deficiencies: ['Incomplete batch analysis', 'Missing container closure justification', 'Stability data gaps'],
    actions: [
      { id: 'check_specs', label: 'Check specifications consistency', desc: 'Compare S/P specifications against Module 3', ic: 'alertTriangle', verb: 'contradictions' },
      { id: 'stability_gap', label: 'Evaluate stability completeness', desc: 'Gap analysis vs ICH Q1A/Q5C requirements', ic: 'search', verb: 'gap' },
      { id: 'cmc_readiness', label: 'Assess CMC readiness', desc: 'Module 3 completeness for submission', ic: 'shieldCheck', verb: 'readiness' },
    ] },
  '2.4': { type: 'Nonclinical overview', needs: ['Pharmacology summary', 'PK/ADME overview', 'Toxicology summary', 'Carcinogenicity assessment', 'Reproductive toxicology'],
    evidence: ['Nonclinical study reports', 'SEND datasets', 'Tox tables'], deficiencies: ['Missing bridging to clinical', 'Incomplete tox species justification', 'Impurities qualification gap'],
    actions: [
      { id: 'bridge_clin', label: 'Bridge to clinical findings', desc: 'Map nonclinical to clinical observations', ic: 'gitCompare', verb: 'review' },
      { id: 'impurity_qual', label: 'Check impurity qualification', desc: 'Cross-reference ICH M7/Q3A thresholds', ic: 'alertTriangle', verb: 'gap' },
    ] },
  '2.5': { type: 'Clinical overview', needs: ['Efficacy summary', 'Safety summary', 'Benefit-risk assessment', 'PK overview', 'Special populations', 'Dose rationale'],
    evidence: ['CSR', 'TPP', 'Statistical analysis plan', 'ISS/ISE', 'Bridging study data'], deficiencies: ['Ungrounded efficacy claims', 'Missing subgroup analysis', 'Incomplete benefit-risk', 'Weak dose-response rationale'],
    actions: [
      { id: 'check_fda', label: 'Check FDA consistency', desc: 'Evaluate against FDA review expectations', ic: 'shieldCheck', verb: 'review' },
      { id: 'onc_prec', label: 'Compare to approved precedents', desc: 'Find analogous approvals in this TA', ic: 'search', verb: 'precedent' },
      { id: 'eval_ready', label: 'Evaluate readiness', desc: 'Section completeness for submission', ic: 'alertTriangle', verb: 'readiness' },
      { id: 'harmonize_27', label: 'Harmonize with §2.7', desc: 'Align endpoint language with Clinical Summary', ic: 'gitCompare', verb: 'harmonize' },
      { id: 'br_assess', label: 'Strengthen benefit-risk', desc: 'Structured B-R framework per ICH M4E(R2)', ic: 'penLine', verb: 'edit' },
    ] },
  '2.6': { type: 'Nonclinical written summaries', needs: ['Pharmacology written summary', 'PK written summary', 'Toxicology written summary'],
    evidence: ['Study reports Module 4', 'Tabulated summaries'], deficiencies: ['Incomplete dose-response data', 'Missing tox tables', 'NOAEL discrepancy'],
    actions: [
      { id: 'check_noael', label: 'Check NOAEL consistency', desc: 'Cross-reference across studies', ic: 'alertTriangle', verb: 'contradictions' },
    ] },
  '2.7': { type: 'Clinical summary', needs: ['Biopharm summary', 'Clinical efficacy summary', 'Clinical safety summary', 'Literature references', 'Synopses'],
    evidence: ['CSR tables', 'ISS/ISE', 'SDTM/ADaM datasets', 'TLFs'], deficiencies: ['Inconsistent endpoint definitions', 'Missing disposition data', 'Table/text discrepancy'],
    actions: [
      { id: 'check_tables', label: 'Check table/text consistency', desc: 'Find discrepancies between narrative and tables', ic: 'alertTriangle', verb: 'contradictions' },
      { id: 'harmonize_25', label: 'Harmonize with §2.5', desc: 'Align with Clinical Overview language', ic: 'gitCompare', verb: 'harmonize' },
      { id: 'missing_disp', label: 'Check disposition completeness', desc: 'Verify all required tabulations are present', ic: 'search', verb: 'gap' },
    ] },
  '3.2': { type: 'Body of CMC data', needs: ['S.1-S.7 Drug Substance', 'P.1-P.8 Drug Product', 'A.1-A.3 Appendices'],
    evidence: ['Analytical reports', 'Process validation', 'Stability data', 'Container closure testing'], deficiencies: ['Missing validation data', 'Incomplete characterization', 'Stability gaps'],
    actions: [
      { id: 'check_ice', label: 'ICH compliance check', desc: 'Evaluate against Q1-Q14 requirements', ic: 'shieldCheck', verb: 'review' },
    ] },
  '5.3': { type: 'Clinical study reports', needs: ['Study report per protocol', 'Statistical outputs', 'Case report forms', 'Individual patient data'],
    evidence: ['CSRs', 'SAPs', 'TLFs', 'SDTM/ADaM'], deficiencies: ['Missing locked datasets', 'Unsigned protocols', 'Incomplete TLFs'],
    actions: [
      { id: 'check_csr', label: 'CSR completeness check', desc: 'Verify ICH E3 structure compliance', ic: 'shieldCheck', verb: 'preflight' },
      { id: 'compare_sap', label: 'Compare results to SAP', desc: 'Check pre-specified vs post-hoc analyses', ic: 'gitCompare', verb: 'contradictions' },
    ] },
};

/** Fallback for sections not in the map. */
export const SEC_DEFAULT: SectionContextEntry = {
  type: 'Document section', needs: ['Section content', 'Supporting evidence', 'Cross-references'],
  evidence: ['Source documents'], deficiencies: ['Incomplete content', 'Missing references'],
  actions: [
    { id: 'check_default', label: 'Check regulatory compliance', desc: 'Review against guidance requirements', ic: 'shieldCheck', verb: 'review' },
    { id: 'gap_default', label: 'Run gap analysis', desc: 'Identify missing content', ic: 'alertTriangle', verb: 'gap' },
    { id: 'prec_default', label: 'Find precedent', desc: 'Search approved analogues', ic: 'search', verb: 'precedent' },
  ],
};

/* ── M1 market-specific document checklists ─────────────────────────── */

export const M1_CHECKLISTS: Record<string, M1ChecklistItem[]> = {
  fda: [
    { id: 'fda-cover',  label: 'Cover letter',                            ref: '21 CFR 314.50(a)',   status: 'complete',    notes: 'Submitted with BLA supplement' },
    { id: 'fda-356h',   label: 'Form 356h -- Application form',           ref: '21 CFR 314.50',      status: 'draft',       notes: 'Sections 4, 6, 11 incomplete' },
    { id: 'fda-admin',  label: '1.3 Administrative information',          ref: 'CTD M1.3',           status: 'complete',    notes: '' },
    { id: 'fda-labels', label: '1.3.1 US Prescribing Information (USPI)', ref: '21 CFR 201.56',      status: 'draft',       notes: 'Black box warning language under review' },
    { id: 'fda-med',    label: '1.3.2 Medication guide',                  ref: '21 CFR 208',          status: 'not_started', notes: '' },
    { id: 'fda-fin',    label: '1.7 Financial disclosure (Form 3455)',     ref: '21 CFR 54',           status: 'complete',    notes: 'All investigators disclosed' },
    { id: 'fda-dsur',   label: '1.9.1 DSUR (annual safety update)',       ref: 'ICH E2F',             status: 'draft',       notes: 'Q3 2025 reporting period -- draft in progress' },
    { id: 'fda-patent', label: '1.11 Patent certification (Para IV)',     ref: '21 CFR 314.50(i)',    status: 'not_started', notes: 'Orange Book search pending' },
  ],
  ema: [
    { id: 'ema-appform', label: '1.0 Application form (eAF)',                ref: 'EC Reg 726/2004',    status: 'not_started', notes: 'eAF v4.3 -- submitter credentials required' },
    { id: 'ema-toc',     label: '1.1 Table of contents',                     ref: 'CTD M1.1',           status: 'draft',       notes: 'Auto-generated from eCTD TOC' },
    { id: 'ema-spc',     label: '1.3.1 SmPC (Summary of Product Chars)',     ref: 'Dir 2001/83 Art 11', status: 'not_started', notes: 'Critical gap -- required for MAA' },
    { id: 'ema-label',   label: '1.3.2 Labeling',                            ref: 'Dir 2001/83 Art 63', status: 'not_started', notes: '' },
    { id: 'ema-pil',     label: '1.3.3 Package leaflet (PIL)',               ref: 'Dir 2001/83 Art 59', status: 'not_started', notes: 'Readability testing required' },
    { id: 'ema-rmp',     label: '1.8.2 Risk Management Plan (RMP)',          ref: 'Dir 2001/83 Art 8',  status: 'not_started', notes: 'Critical gap -- CHMP requires RMP for all biologics' },
    { id: 'ema-pbrer',   label: '1.9.1 PBRER / PSUR',                        ref: 'ICH E2C(R2)',        status: 'draft',       notes: 'Reporting interval under review' },
    { id: 'ema-impd',    label: '2.8 IMPD (Investigational product)',         ref: 'Dir 2001/20 Art 13', status: 'not_started', notes: 'EMA-specific supplement to M2' },
    { id: 'ema-psmf',    label: '1.9.2 PSMF (PV system master file)',         ref: 'GVP Module II',      status: 'draft',       notes: 'PV system audit Q2 2025 complete' },
  ],
  pmda: [
    { id: 'pmda-cov',      label: 'Cover letter (Japanese)',                  ref: 'PAL Art 14',           status: 'not_started', notes: 'Requires D-MAH (Japan local agent) signature' },
    { id: 'pmda-agent',    label: 'Local agent (D-MAH) appointment',          ref: 'PAL Art 14-5',         status: 'not_started', notes: 'Critical -- no D-MAH engaged' },
    { id: 'pmda-spc-jp',   label: '1.3.1 Japanese SPC (Iyakuhin Youran)',     ref: 'MHW Notification 1997', status: 'not_started', notes: 'Requires certified translation from English SmPC' },
    { id: 'pmda-label-jp', label: '1.3.2 Japanese labeling',                  ref: 'PAL Art 68-2',          status: 'not_started', notes: '' },
    { id: 'pmda-pil-jp',   label: '1.3.3 Japanese PIL (patient leaflet)',     ref: 'PMDA guidance 2015',    status: 'not_started', notes: 'Readability testing in Japanese required' },
    { id: 'pmda-gmp',      label: '1.4 GMP compliance statement',             ref: 'PAL Art 14-2',          status: 'draft',       notes: 'Awaiting facility inspection outcome' },
    { id: 'pmda-rms',      label: '1.8 Risk management strategy (J-RMP)',     ref: 'PMDA guidance 2012',    status: 'not_started', notes: 'Japan-specific RMP with additional risk minimization measures' },
    { id: 'pmda-consult',  label: 'Pre-NDA consultation record',              ref: 'PMDA pre-sub',          status: 'draft',       notes: 'Briefing meeting Jun 2025 -- minutes drafted' },
  ],
  mhra: [
    { id: 'mhra-admin',   label: 'M1 administrative package (UK)',       ref: 'MHRA guidance 2021', status: 'not_started', notes: 'Post-Brexit format -- not initiated' },
    { id: 'mhra-appform', label: 'UK application form',                  ref: 'HMR 2012',          status: 'not_started', notes: '' },
    { id: 'mhra-spc',     label: 'UK SmPC',                              ref: 'HMR 2012 Sch 10',   status: 'not_started', notes: 'Must differ from EU SmPC in regulatory references' },
    { id: 'mhra-pil',     label: 'UK patient information leaflet (PIL)', ref: 'HMR 2012 Sch 11',   status: 'not_started', notes: 'Readability testing required' },
    { id: 'mhra-label',   label: 'UK labeling',                          ref: 'HMR 2012 Sch 12',   status: 'not_started', notes: '' },
    { id: 'mhra-advice',  label: 'MHRA scientific advice record',        ref: 'MHRA sci advice',    status: 'draft',       notes: 'Informal advice received Q1 2025; formal SA not requested' },
    { id: 'mhra-nims',    label: 'NIMS (national implementation plan)',   ref: 'MHRA NI',            status: 'not_started', notes: 'Required if seeking national authorization' },
  ],
  hc: [
    { id: 'hc-form',    label: 'HC administrative forms (HC-SC 3011)',  ref: 'C.08.002 FDR',      status: 'not_started', notes: 'Not initiated' },
    { id: 'hc-pm-en',   label: 'Product Monograph -- English',          ref: 'C.08.003.1 FDR',    status: 'draft',       notes: 'Based on USPI; HC format adaptation required' },
    { id: 'hc-pm-fr',   label: 'Product Monograph -- French',           ref: 'C.08.003.1 FDR',    status: 'not_started', notes: 'Required under Official Languages Act' },
    { id: 'hc-ci-en',   label: 'Consumer Information (Patient) -- EN',  ref: 'Health Canada 2019', status: 'not_started', notes: '' },
    { id: 'hc-ci-fr',   label: 'Consumer Information (Patient) -- FR',  ref: 'Health Canada 2019', status: 'not_started', notes: '' },
    { id: 'hc-qual',    label: 'Quality Overall Summary (QOS)',          ref: 'CTD M2.3',           status: 'draft',       notes: 'HC-specific QOS template needed' },
    { id: 'hc-covlet',  label: 'HC cover letter',                       ref: 'HC guidance',         status: 'not_started', notes: '' },
    { id: 'hc-pvm',     label: 'Pharmacovigilance plan (PBRER)',         ref: 'HC MHPD guidance',   status: 'draft',       notes: 'Plan aligned to FDA DSUR; HC adaptation needed' },
  ],
};

/* ── Status color metadata ─────────────────────────────────────────── */

export const M1_STATUS_META: Record<string, M1StatusMetaEntry> = {
  complete:    { label: 'Complete',    color: 'var(--success)', bg: 'color-mix(in srgb,var(--success) 12%,transparent)' },
  draft:       { label: 'Draft',       color: 'var(--warning)', bg: 'color-mix(in srgb,var(--warning) 10%,transparent)' },
  not_started: { label: 'Not started', color: 'var(--text-400)', bg: 'var(--bg-200)' },
  in_review:   { label: 'In review',   color: 'var(--warning)', bg: 'color-mix(in srgb,var(--warning) 8%,transparent)' },
};

/* ── Market definitions ────────────────────────────────────────────── */

export const M1_MARKETS: M1MarketDef[] = [
  { id: 'fda',  agency: 'FDA',           flag: 'US', instrument: 'BLA',   region: 'US' },
  { id: 'ema',  agency: 'EMA',           flag: 'EU', instrument: 'MAA',   region: 'EU' },
  { id: 'pmda', agency: 'PMDA',          flag: 'JP', instrument: 'J-NDA', region: 'JP' },
  { id: 'mhra', agency: 'MHRA',          flag: 'UK', instrument: 'NI',    region: 'UK' },
  { id: 'hc',   agency: 'Health Canada', flag: 'CA', instrument: 'NDS',   region: 'CA' },
];

/* ── Section context lookup ────────────────────────────────────────── */

export function getSectionContext(secNum: string | undefined): SectionContextEntry {
  if (!secNum) return SEC_DEFAULT;
  const prefix = secNum.split('.').slice(0, 2).join('.');
  return SEC_CONTEXT[prefix] || SEC_DEFAULT;
}
