/**
 * Data fixtures — ported verbatim from the bundle:
 *   - TREE : docs/design/concept2cure-design-system/project/ui_kits/ectd_coauthor/Tree.jsx
 *   - ARTIFACTS : docs/design/concept2cure-design-system/project/ui_kits/ectd_coauthor/artifacts.js
 *
 * Production note: these are the bundle's starter fixtures. Host props on
 * ClaudeEctdCoauthor let callers inject live data loaded from
 * /api/authoring/... without touching this file.
 */

export type EctdStatus = 'approved' | 'review' | 'draft' | 'blocked' | 'todo';

export interface EctdTreeChild {
  num: string;
  label: string;
  status: EctdStatus;
}

export interface EctdTreeModule {
  num: string;
  label: string;
  status: EctdStatus;
  open: boolean;
  children: EctdTreeChild[];
}

export const TREE: EctdTreeModule[] = [
  { num: '1', label: 'Administrative', status: 'approved', open: false, children: [
    { num: '1.2', label: 'Cover letter', status: 'approved' },
    { num: '1.3.1', label: 'Application form (356h)', status: 'approved' },
    { num: '1.14.1.3', label: 'Draft labeling', status: 'review' },
  ] },
  { num: '2', label: 'Summaries', status: 'review', open: true, children: [
    { num: '2.2', label: 'Introduction', status: 'approved' },
    { num: '2.3', label: 'Quality overall summary', status: 'review' },
    { num: '2.4', label: 'Nonclinical overview', status: 'draft' },
    { num: '2.5', label: 'Clinical overview', status: 'draft' },
    { num: '2.6', label: 'Nonclinical written summaries', status: 'todo' },
    { num: '2.7', label: 'Clinical summary', status: 'draft' },
  ] },
  { num: '3', label: 'Quality (CMC)', status: 'draft', open: true, children: [
    { num: '3.2.S', label: 'Drug substance', status: 'draft' },
    { num: '3.2.P', label: 'Drug product', status: 'draft' },
    { num: '3.2.A', label: 'Appendices', status: 'todo' },
  ] },
  { num: '4', label: 'Nonclinical', status: 'approved', open: false, children: [
    { num: '4.2.1', label: 'Pharmacology', status: 'approved' },
    { num: '4.2.3', label: 'Toxicology', status: 'approved' },
  ] },
  { num: '5', label: 'Clinical', status: 'review', open: false, children: [
    { num: '5.2', label: 'Tabular listing of studies', status: 'approved' },
    { num: '5.3.5', label: 'Efficacy & safety studies', status: 'review' },
    { num: '5.4', label: 'Literature references', status: 'blocked' },
  ] },
];

export interface ProvenanceInfo {
  source: string;
  model: string;
  audit: string;
  foot: string;
}

export interface DocSpan {
  t?: string;
  cite?: string;
}

export interface ParagraphBlock {
  kind: 'p';
  id: string;
  confidence: number;
  prov: ProvenanceInfo;
  spans: DocSpan[];
}

export interface HeadingBlock {
  kind: 'h2';
  text: string;
}

export type TableCell = string | { pill: 'ok' | 'warn'; text: string };

export interface TableBlockSpec {
  kind: 'table';
  head: string[];
  rows: TableCell[][];
}

export type DocBlock = ParagraphBlock | HeadingBlock | TableBlockSpec;

export interface ArtifactSection {
  path: string;
  title: string;
  module: string;
  version: string;
  lastEditedBy: string;
  lastEdited: string;
  masthead: Array<{ lbl: string; val: string }>;
  blocks: DocBlock[];
}

export const ARTIFACTS: Record<string, ArtifactSection> = {
  '2.5': {
    path: '2.5',
    title: 'Clinical overview',
    module: 'Module 2 — Common technical document summaries',
    version: 'v0.4',
    lastEditedBy: 'c2c-Opus 4.7',
    lastEdited: '2 sec ago',
    masthead: [
      { lbl: 'Application', val: 'NDA 212345' },
      { lbl: 'Sponsor',     val: 'Concept2Cure Bio' },
      { lbl: 'Module',      val: '2.5 Clinical overview' },
      { lbl: 'Version',     val: 'v0.4 · draft' },
    ],
    blocks: [
      { kind: 'h2', text: '2.5.1  Product development rationale' },
      { kind: 'p', id: 'p1', confidence: 0.94, prov: { source: 'Protocol-001 §1.2', model: 'c2c-Opus 4.7', audit: 'c2c-A9C21', foot: '21 CFR Part 11 · signed artifact' },
        spans: [
          { t: 'BX-204 is a humanized IgG1κ monoclonal antibody directed against the extracellular domain of receptor tyrosine kinase X, developed for the treatment of advanced or metastatic solid tumors with confirmed RTK-X overexpression.' },
          { cite: 'Protocol §1.2' },
        ] },
      { kind: 'p', id: 'p2', confidence: 0.88, prov: { source: 'CSR-099 §10.3', model: 'c2c-Opus 4.7', audit: 'c2c-B4A02', foot: 'RIM precedent: FDA 2023 bridging guidance' },
        spans: [
          { t: 'The Phase I first-in-human study (BX204-101) established tolerability and identified the recommended Phase II dose of 12 mg/kg administered intravenously every three weeks,' },
          { cite: 'CSR-099' },
          { t: ' supported by population-PK modeling in the target population.' },
        ] },
      { kind: 'h2', text: '2.5.4  Overview of efficacy' },
      { kind: 'p', id: 'p3', confidence: 0.96, prov: { source: 'CSR-201 §7.1', model: 'c2c-Opus 4.7', audit: 'c2c-C7E19', foot: 'Cross-cited in Module 5.3.5' },
        spans: [
          { t: 'Efficacy was evaluated in the pivotal Phase II study (BX204-201), an open-label, single-arm trial in 184 patients with RTK-X–positive advanced solid tumors who had progressed on at least one prior line of systemic therapy.' },
          { cite: 'CSR-201' },
          { t: ' The primary endpoint was objective response rate (ORR) by blinded independent central review.' },
        ] },
      { kind: 'table',
        head: ['Endpoint', 'BX-204 (n=184)', 'Historical control', 'Result'],
        rows: [
          ['Objective response rate',        '38.6% (95% CI 31.5–46.0)', '14% (pooled, 2019–2023)', { pill: 'ok', text: 'Met' }],
          ['Median duration of response',    '11.8 mo (95% CI 8.9–NE)',  '4.2 mo',                   { pill: 'ok', text: 'Met' }],
          ['Median progression-free survival','6.4 mo (95% CI 5.1–8.2)', '2.9 mo',                   { pill: 'ok', text: 'Met' }],
          ['Overall survival (interim)',     'NR (min follow-up 9 mo)',  '—',                        { pill: 'warn', text: 'Immature' }],
        ] },
      { kind: 'p', id: 'p4', confidence: 0.91, prov: { source: 'SAP §9.4, RIM-0.87', model: 'c2c-Opus 4.7', audit: 'c2c-D2F88', foot: 'Precedent match: 0.87 (RIM)' },
        spans: [
          { t: 'The observed ORR of 38.6% exceeds the pre-specified threshold of 25% derived from pooled historical controls, and the treatment effect is consistent across pre-specified subgroups including prior lines of therapy, ECOG status, and RTK-X expression level.' },
          { cite: 'SAP §9.4' },
          { t: ' The regulatory precedent for accelerated approval in this setting is established by ' },
          { cite: 'EMEA/H/C/005612' },
          { t: ' and supported by the FDA 2023 bridging guidance.' },
        ] },
    ],
  },
  '2.3': {
    path: '2.3',
    title: 'Quality overall summary',
    module: 'Module 2 — Common technical document summaries',
    version: 'v0.3',
    lastEditedBy: 'c2c-Opus 4.7',
    lastEdited: '14 min ago',
    masthead: [
      { lbl: 'Application', val: 'NDA 212345' },
      { lbl: 'Sponsor',     val: 'Concept2Cure Bio' },
      { lbl: 'Module',      val: '2.3 Quality overall summary' },
      { lbl: 'Version',     val: 'v0.3 · in review' },
    ],
    blocks: [
      { kind: 'h2', text: '2.3.S  Drug substance' },
      { kind: 'p', id: 'q1', confidence: 0.92, prov: { source: 'Module 3.2.S.1', model: 'c2c-Opus 4.7', audit: 'c2c-Q1A77', foot: 'Cross-linked with CMC Module 3.2.S' },
        spans: [
          { t: 'The drug substance, BX-204, is a recombinant humanized IgG1κ monoclonal antibody produced by fed-batch mammalian cell culture using a proprietary CHO-K1 host cell line, followed by a three-step chromatography purification train and two orthogonal viral clearance steps.' },
          { cite: '3.2.S.2.2' },
        ] },
      { kind: 'p', id: 'q2', confidence: 0.85, prov: { source: 'Stability report SR-204-2024', model: 'c2c-Opus 4.7', audit: 'c2c-Q2B15', foot: 'Stability commitment per ICH Q1A(R2)' },
        spans: [
          { t: 'Long-term stability studies at 2–8 °C support a proposed shelf life of 24 months based on 18 months of primary stability data and supporting accelerated data at 25 °C / 60% RH.' },
          { cite: 'SR-204-2024' },
        ] },
      { kind: 'h2', text: '2.3.P  Drug product' },
      { kind: 'p', id: 'q3', confidence: 0.79, prov: { source: 'Module 3.2.P.3', model: 'c2c-Opus 4.7', audit: 'c2c-Q3C09', foot: 'Medium confidence — container-closure study still enrolling' },
        spans: [
          { t: 'The drug product is supplied as a sterile, preservative-free liquid formulation in single-dose Type-I glass vials containing 20 mg/mL BX-204 at a target fill volume of 5.0 mL, closed with a chlorobutyl stopper and aluminum flip-off seal.' },
          { cite: '3.2.P.3.2' },
        ] },
    ],
  },
  '3.2.S': {
    path: '3.2.S',
    title: 'Drug substance',
    module: 'Module 3 — Quality (CMC)',
    version: 'v0.2',
    lastEditedBy: 'c2c-Opus 4.7',
    lastEdited: '1 hour ago',
    masthead: [
      { lbl: 'Application', val: 'NDA 212345' },
      { lbl: 'Sponsor',     val: 'Concept2Cure Bio' },
      { lbl: 'Module',      val: '3.2.S Drug substance' },
      { lbl: 'Version',     val: 'v0.2 · draft' },
    ],
    blocks: [
      { kind: 'h2', text: '3.2.S.1  General information' },
      { kind: 'p', id: 's1', confidence: 0.97, prov: { source: 'IND 187432', model: 'c2c-Opus 4.7', audit: 'c2c-S1A03', foot: 'Identity carried forward from IND' },
        spans: [
          { t: 'Nonproprietary name: BX-204. Proprietary name (proposed): pending. International Nonproprietary Name: rotuxizumab. CAS Registry Number: 2387451-22-9.' },
        ] },
      { kind: 'h2', text: '3.2.S.2  Manufacture' },
      { kind: 'p', id: 's2', confidence: 0.88, prov: { source: 'Batch records BR-204-2024-Q1', model: 'c2c-Opus 4.7', audit: 'c2c-S2B48', foot: 'Master cell bank fully characterized' },
        spans: [
          { t: 'BX-204 is manufactured at the Concept2Cure Bio Raleigh facility using a 2000-L fed-batch bioreactor, a master cell bank (MCB) qualified per ICH Q5A/Q5D, and a working cell bank (WCB) released to predefined acceptance criteria.' },
          { cite: '3.2.S.2.3' },
        ] },
      { kind: 'p', id: 's3', confidence: 0.74, prov: { source: 'Process validation PV-204-R2', model: 'c2c-Opus 4.7', audit: 'c2c-S3C91', foot: 'Low confidence — PPQ runs 2 of 3 complete' },
        spans: [
          { t: 'Process performance qualification (PPQ) is proposed across three consecutive at-scale runs to demonstrate reproducible performance; two of three runs are complete with all CQAs within established acceptance criteria.' },
          { cite: 'PV-204-R2' },
        ] },
    ],
  },
};

/** "Tighten/Ask" rewrite templates — one per block id. Matches App.jsx REWRITES. */
export const REWRITES: Record<string, string> = {
  p3: 'Efficacy was evaluated in BX204-201, a pivotal, multicenter, open-label, single-arm Phase II trial enrolling 184 adults with RTK-X–positive advanced or metastatic solid tumors refractory to ≥1 prior systemic therapy. The primary endpoint was confirmed objective response rate (ORR) assessed by blinded independent central review using RECIST v1.1, with response durations and progression-free survival as key secondary endpoints.',
  p4: 'The confirmed ORR of 38.6% (95% CI 31.5–46.0) exceeded the pre-specified threshold of 25%, derived from an indication-matched pooled historical control of 412 patients across five sponsor-independent datasets (2019–2023). The magnitude and consistency of effect across pre-specified subgroups — prior lines of therapy, ECOG 0 vs 1, and RTK-X IHC 2+ vs 3+ — together with the FDA 2023 bridging guidance and EMA precedent EMEA/H/C/005612, support the benefit-risk case for accelerated approval.',
  p1: 'BX-204 is a humanized IgG1κ monoclonal antibody with picomolar affinity for the extracellular domain of receptor tyrosine kinase X (RTK-X), engineered with Fc-silencing mutations (L234A/L235A) to abrogate effector function and developed for the treatment of adults with advanced or metastatic RTK-X–overexpressing solid tumors.',
  p2: 'In the Phase I first-in-human study BX204-101 (n=42), BX-204 was tolerated across seven dose levels with no dose-limiting toxicities observed; the recommended Phase II dose was established at 12 mg/kg administered intravenously every three weeks, supported by a two-compartment population-pharmacokinetic model validated against an external oncology cohort.',
  q1: 'BX-204 drug substance is a recombinant humanized IgG1κ monoclonal antibody (150 kDa, ~1,320 amino acids) produced by fed-batch mammalian cell culture in a qualified CHO-K1 host cell line, purified via a three-step chromatography train (Protein A affinity, mixed-mode cation exchange, anion-exchange polishing), with two orthogonal viral clearance operations (low-pH viral inactivation and 20 nm viral filtration) delivering a cumulative log reduction value exceeding 18 for model viruses.',
  q2: 'Long-term stability studies at 2–8 °C support a proposed shelf life of 24 months, based on 18 months of primary stability data from three registration-stability lots showing no meaningful change in any critical quality attribute, corroborated by accelerated data at 25 °C / 60% RH consistent with ICH Q1E projections.',
  q3: 'The drug product is presented as a sterile, preservative-free liquid for intravenous administration, supplied in single-dose 6-mL Type-I clear glass vials at a target concentration of 20 mg/mL BX-204, nominal fill volume 5.0 mL, closed with a 20-mm chlorobutyl stopper coated with ETFE and sealed with an aluminum flip-off overseal; container-closure integrity is demonstrated by helium leak and microbial ingress methods per USP <1207>.',
  s1: 'Nonproprietary name: BX-204. International Nonproprietary Name (INN): rotuxizumab (recommended INN list 92). Chemical Abstracts Service Registry Number: 2387451-22-9. Proprietary name: proposed; under review with the FDA Office of Surveillance and Epidemiology. Molecular formula: C6508H10024N1732O2029S44.',
  s2: 'BX-204 drug substance is manufactured at the Concept2Cure Bio Raleigh, NC facility (FEI 3012847) using a 2,000-L single-use fed-batch bioreactor; the master cell bank (MCB) and working cell bank (WCB) have been fully characterized per ICH Q5A(R2) and Q5D, including identity, viability, genetic stability across the limit of in-vitro cell age, and adventitious agent screening.',
  s3: 'Process performance qualification (PPQ) is proposed across three consecutive at-scale conformance runs; two of three runs are complete with all critical quality attributes (aggregate, charge variant distribution, glycan profile, potency) within pre-established acceptance criteria derived from the 95/99 confidence/coverage tolerance interval of the clinical manufacturing history.',
};
