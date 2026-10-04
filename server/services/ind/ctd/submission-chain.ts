/**
 * From database lock to a filed marketing application: every deliverable, what
 * it is written from, where it is filed, the check it must pass before the
 * next step relies on it, and what FDA checks when it arrives.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Nothing on the platform modelled what happens after a study closes. The
 * workflows AnA was given put the Module 2 summaries before the reports they
 * summarise (fixed 2026-10-04, ana-submission-sequence-truth.test.ts); the US
 * NDA task blueprint listed "Clinical Study Reports (5.3)" as one 60-day task;
 * and no record anywhere said that 2.7.3 cannot be finished until the ISE
 * exists, that the ISE needs pooled datasets on one MedDRA version, or that a
 * study's TS dataset decides whether FDA's gateway accepts the sequence at all.
 * This is that record, in dependency order, so the order AnA names is a
 * property of the data rather than of a prompt.
 *
 * ── What the platform can see ────────────────────────────────────────────────
 * evaluateChain() reads only what the Vault records: a document filed
 * (placement confirmed) or proposed (placement suggested) at a CTD section.
 * Steps the Vault cannot hold — the lock itself, the datasets (the Vault refuses
 * .xpt and define.xml, and the eCTD packager files PDF leaves only), the TLF
 * outputs, the eCTD sequence — are reported `not_visible` with the reason,
 * never as missing and never as done. A dependency that cannot be seen is
 * named as assumed, not as satisfied.
 *
 * Reference structure, like the rest of server/services/ind/ctd: the sponsor
 * owns the plan; this says what the regulations and FDA's published
 * specifications ask for, and what the platform can see of it.
 */

import type { E3Basis } from './types.js';
import { CFR_314_50_F, FDA_E3, FDA_SDTCG, FDA_STUDY_DATA_TRC } from './csr-e3-basis.js';

const CHECKED = '2026-10-04';

const FDA_ISS_ISE_PLACEMENT: E3Basis = {
  ref: 'FDA, Placement of Integrated Summaries of Safety and Effectiveness (ISS/ISE) in the eCTD',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/drugs/electronic-regulatory-submission-and-review/placement-integrated-summaries-safety-and-effectiveness-issise-applications-submitted-ectd-format',
  checked: CHECKED,
};
const FDA_ISE_GUIDANCE: E3Basis = {
  ref: 'FDA, Integrated Summary of Effectiveness (2015)',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/media/72335/download',
  checked: CHECKED,
};
const M4E_R2: E3Basis = {
  ref: 'ICH M4E(R2), as published by FDA',
  confidence: 'regulator-text',
  url: 'https://www.fda.gov/media/93569/download',
  checked: CHECKED,
};
const RECALL = (ref: string): E3Basis => ({ ref, confidence: 'recall' });
const PRACTICE = (ref: string): E3Basis => ({ ref, confidence: 'platform-convention' });

export type ChainStage = 'close-out' | 'study-data' | 'study-report' | 'integration' | 'summary' | 'labeling' | 'assembly';

export type ChainEvidence =
  | { kind: 'vault'; sections: string[]; titlePattern?: RegExp }
  | { kind: 'not-visible'; why: string };

export interface ChainNode {
  id: string;
  title: string;
  stage: ChainStage;
  scope: 'each study' | 'the application';
  produces: string;
  /** Ids of the steps this one is written from. Every id precedes this node in CHAIN. */
  dependsOn: string[];
  /** CTD headings the deliverable is filed under. */
  files?: string[];
  /** What must be true before the next step relies on it. */
  gate: string[];
  /** What FDA checks when the deliverable arrives. */
  reviewerChecks?: string[];
  basis: E3Basis[];
  /** How the platform can see this step done today. */
  evidence: ChainEvidence;
}

const NOT_DOCUMENTS =
  'Close-out and lock are recorded in the EDC and data-management systems, not as Vault documents, so the platform cannot see them.';
const NO_DATASETS =
  'The Vault does not accept .xpt or define.xml files and the eCTD packager files PDF leaves only, so the platform cannot see the datasets.';
const SUBMISSION_CENTER =
  'Sequence state lives in the Submission Center; assess_dispatch_readiness and validate_ectd_package report it.';

export const SUBMISSION_CHAIN: readonly ChainNode[] = Object.freeze<ChainNode[]>([
  {
    id: 'sap_final', title: 'Statistical analysis plan final', stage: 'close-out', scope: 'each study',
    produces: 'The final SAP, signed and dated before the database is locked and the study unblinded.',
    dependsOn: [], files: ['5.3.5.1'],
    gate: ['Signed and dated before unblinding; any later change reported in the CSR (E3 §9.7.1, §9.8)'],
    basis: [RECALL('ICH E3 §9.7.1, §9.8'), RECALL('ICH E9 / E9(R1)')],
    evidence: { kind: 'vault', sections: ['5.3'], titlePattern: /statistical analysis plan|\bSAP\b/i },
  },
  {
    id: 'database_lock', title: 'Database lock', stage: 'close-out', scope: 'each study',
    produces: 'A locked clinical database: queries resolved, medical coding complete with the MedDRA and WHODrug versions recorded, serious adverse events reconciled with the safety database, then locked and, for a blinded study, unblinded.',
    dependsOn: ['sap_final'],
    gate: ['Lock date, dictionary versions and the SAE reconciliation recorded', 'Unblinding only after the SAP is final'],
    basis: [PRACTICE('Clinical data management practice'), RECALL('ICH E6 data handling')],
    evidence: { kind: 'not-visible', why: NOT_DOCUMENTS },
  },
  {
    id: 'sdtm', title: 'SDTM tabulation datasets', stage: 'study-data', scope: 'each study',
    produces: 'SDTM datasets (SAS XPORT v5, one dataset per file, split above 5 GB), including the Trial Summary (TS) and Demographics (DM) domains, with the annotated CRF, define.xml and the clinical study data reviewer’s guide.',
    dependsOn: ['database_lock'],
    gate: ['Conformance checked before the analysis datasets are derived', 'TS carries the study start date; DM present; define.xml complete'],
    reviewerChecks: ['Technical rejection 1734: no TS dataset for the study', 'Technical rejection 1736: no DM or define.xml', 'Study Data Technical Conformance Guide: XPORT v5, dataset size, define.xml metadata, reviewer’s guide'],
    basis: [FDA_STUDY_DATA_TRC, FDA_SDTCG],
    evidence: { kind: 'not-visible', why: NO_DATASETS },
  },
  {
    id: 'adam', title: 'ADaM analysis datasets', stage: 'study-data', scope: 'each study',
    produces: 'ADaM datasets including ADSL, with define.xml, the analysis data reviewer’s guide and the analysis programs, traceable to SDTM.',
    dependsOn: ['sdtm', 'sap_final'],
    gate: ['Every analysis variable traceable to SDTM and to the CRF', 'Derivations as the SAP specifies'],
    reviewerChecks: ['Technical rejection 1736: no ADSL or define.xml', 'Traceability of the results back to the CRF data (Study Data Technical Conformance Guide)'],
    basis: [FDA_STUDY_DATA_TRC, FDA_SDTCG],
    evidence: { kind: 'not-visible', why: NO_DATASETS },
  },
  {
    id: 'tlf', title: 'Tables, listings and figures', stage: 'study-data', scope: 'each study',
    produces: 'The SAP’s section 14 tables and figures and section 16.2 listings, programmed from ADaM, each traceable to its program and dataset.',
    dependsOn: ['adam'],
    gate: ['Independently quality-checked (for example by double programming) before any number is written into a report'],
    basis: [FDA_SDTCG, PRACTICE('Statistical programming QC practice')],
    evidence: { kind: 'not-visible', why: 'TLF outputs are not a document type the Vault distinguishes; the CSR carries them in sections 14 and 16.2.' },
  },
  {
    id: 'csr', title: 'Clinical study report', stage: 'study-report', scope: 'each study',
    produces: 'The ICH E3 report with its appendices, every number verified against the section 14 outputs, and the case report form of every patient who died or left the study because of an adverse event.',
    dependsOn: ['tlf'],
    files: ['5.3.5.1', '5.3.5.2', '5.3.5.4', '5.3.1', '5.3.3', '5.3.4'],
    gate: ['Every number in the synopsis, the body and the tables agrees', 'Signed where the authority requires it (E3 §16.1.5)'],
    reviewerChecks: ['21 CFR 314.50(f)(2): CRFs for deaths and adverse-event withdrawals, unless waived'],
    basis: [FDA_E3, CFR_314_50_F],
    evidence: { kind: 'vault', sections: ['5.3.1', '5.3.2', '5.3.3', '5.3.4', '5.3.5.1', '5.3.5.2', '5.3.5.4'] },
  },
  {
    id: 'integrated_data', title: 'Integrated analysis datasets', stage: 'integration', scope: 'the application',
    produces: 'Pooled ADaM datasets for the integrated analyses, every study re-coded to one MedDRA version, with an integration analysis plan and define.xml.',
    dependsOn: ['adam'],
    gate: ['One MedDRA version across every pooled study', 'Pooling decided and documented before the integrated results are seen'],
    basis: [PRACTICE('Integrated-analysis practice'), FDA_SDTCG],
    evidence: { kind: 'not-visible', why: NO_DATASETS },
  },
  {
    id: 'iss', title: 'Integrated Summary of Safety', stage: 'integration', scope: 'the application',
    produces: 'The integrated analysis of safety across the program that 21 CFR 314.50(d)(5)(vi) requires — an analysis, not a summary — filed in 5.3.5.3.',
    dependsOn: ['integrated_data', 'csr'], files: ['5.3.5.3'],
    gate: ['Its numbers reconcile with each CSR and with the integrated datasets'],
    reviewerChecks: ['Its absence is a refuse-to-file ground (21 CFR 314.101(d)(3), against 314.50)'],
    basis: [FDA_ISS_ISE_PLACEMENT, RECALL('21 CFR 314.50(d)(5)(vi)')],
    evidence: { kind: 'vault', sections: ['5.3.5.3'], titlePattern: /integrated summary of safety|\bISS\b/i },
  },
  {
    id: 'ise', title: 'Integrated Summary of Effectiveness', stage: 'integration', scope: 'the application',
    produces: 'The integrated analysis of effectiveness that 21 CFR 314.50(d)(5)(v) requires, filed in 5.3.5.3.',
    dependsOn: ['integrated_data', 'csr'], files: ['5.3.5.3'],
    gate: ['Its numbers reconcile with each CSR and with the integrated datasets'],
    reviewerChecks: ['Its absence is a refuse-to-file ground (21 CFR 314.101(d)(3), against 314.50)'],
    basis: [FDA_ISS_ISE_PLACEMENT, FDA_ISE_GUIDANCE],
    evidence: { kind: 'vault', sections: ['5.3.5.3'], titlePattern: /integrated summary of (effectiveness|efficacy)|\bISE\b/i },
  },
  {
    id: 'm2_7_clinpharm', title: '2.7.1 and 2.7.2 Biopharmaceutic and clinical pharmacology summaries', stage: 'summary', scope: 'the application',
    produces: 'The summaries of the biopharmaceutic and clinical pharmacology studies.',
    dependsOn: ['csr'], files: ['2.7.1', '2.7.2'],
    gate: ['Each study summarised agrees with its report'],
    basis: [M4E_R2],
    evidence: { kind: 'vault', sections: ['2.7.1', '2.7.2'] },
  },
  {
    id: 'm2_7_3', title: '2.7.3 Summary of Clinical Efficacy', stage: 'summary', scope: 'the application',
    produces: 'Data summaries of efficacy across the program, not a complete exposition; the ISE narrative is placed here once when suitable and referenced from 5.3.5.3.',
    dependsOn: ['ise', 'csr'], files: ['2.7.3'],
    gate: ['Every number traceable to the ISE or a CSR'],
    basis: [FDA_ISE_GUIDANCE, FDA_ISS_ISE_PLACEMENT, M4E_R2],
    evidence: { kind: 'vault', sections: ['2.7.3'] },
  },
  {
    id: 'm2_7_4', title: '2.7.4 Summary of Clinical Safety', stage: 'summary', scope: 'the application',
    produces: 'Summaries of safety across the program; the ISS narrative is placed here once when suitable and referenced from 5.3.5.3.',
    dependsOn: ['iss', 'csr'], files: ['2.7.4'],
    gate: ['Every number traceable to the ISS or a CSR'],
    basis: [FDA_ISS_ISE_PLACEMENT, M4E_R2],
    evidence: { kind: 'vault', sections: ['2.7.4'] },
  },
  {
    id: 'm2_7_6', title: '2.7.6 Synopses of Individual Studies', stage: 'summary', scope: 'the application',
    produces: 'The synopsis of every study, taken from each CSR’s E3 §2 synopsis.',
    dependsOn: ['csr'], files: ['2.7.6'],
    gate: ['Each synopsis identical to its CSR’s'],
    basis: [M4E_R2, RECALL('ICH E3 §2')],
    evidence: { kind: 'vault', sections: ['2.7.6'] },
  },
  {
    id: 'm2_5', title: '2.5 Clinical Overview', stage: 'summary', scope: 'the application',
    produces: 'The critical analysis of the clinical data and the benefit-risk conclusions, generally about 30 pages.',
    dependsOn: ['m2_7_clinpharm', 'm2_7_3', 'm2_7_4'], files: ['2.5'],
    gate: ['Interprets the summaries rather than repeating them', 'Every number agrees with 2.7 and the reports'],
    basis: [M4E_R2],
    evidence: { kind: 'vault', sections: ['2.5'] },
  },
  {
    id: 'labeling', title: 'Draft labeling', stage: 'labeling', scope: 'the application',
    produces: 'Draft prescribing information whose adverse reactions come from the ISS and whose clinical studies come from the ISE and the CSRs.',
    dependsOn: ['m2_5', 'iss', 'ise'], files: ['1.14.1'],
    gate: ['Every claim traceable to the clinical data'],
    basis: [RECALL('21 CFR 201.56–201.57 (PLR format)')],
    evidence: { kind: 'vault', sections: ['1.14.1'] },
  },
  {
    id: 'ectd_assembly', title: 'eCTD sequence assembly', stage: 'assembly', scope: 'the application',
    produces: 'The sequence: every leaf at its CTD heading with ICH M4 granularity, a study tagging file per study, relative hyperlinks, bookmarks, and conforming file names and paths.',
    dependsOn: ['csr', 'iss', 'ise', 'm2_7_3', 'm2_7_4', 'm2_7_6', 'm2_5', 'labeling', 'sdtm', 'adam'],
    gate: ['Every leaf is a conforming PDF (list_fda_technical_rules)', 'Every cross-reference resolves'],
    basis: [RECALL('ICH M2 eCTD specification; FDA eCTD Technical Conformance Guide')],
    evidence: { kind: 'not-visible', why: SUBMISSION_CENTER },
  },
  {
    id: 'technical_validation', title: 'Technical validation and completeness', stage: 'assembly', scope: 'the application',
    produces: 'FDA’s eCTD validation criteria, the study-data technical rejection criteria and the PDF specifications checked; completeness reviewed against 21 CFR 314.50 and the refuse-to-file grounds of 314.101(d).',
    dependsOn: ['ectd_assembly'],
    gate: ['No high-severity validation finding; no technical rejection criterion failed'],
    basis: [FDA_STUDY_DATA_TRC, RECALL('21 CFR 314.101(d)')],
    evidence: { kind: 'not-visible', why: SUBMISSION_CENTER },
  },
  {
    id: 'transmission', title: 'Transmission through the FDA ESG', stage: 'assembly', scope: 'the application',
    produces: 'The sequence transmitted and acknowledged.',
    dependsOn: ['technical_validation'],
    gate: ['Acknowledgements received and filed'],
    basis: [RECALL('FDA Electronic Submissions Gateway')],
    evidence: { kind: 'not-visible', why: SUBMISSION_CENTER },
  },
]);

const BY_ID: ReadonlyMap<string, ChainNode> = new Map(SUBMISSION_CHAIN.map((n) => [n.id, n]));

export function getChainNode(id: string): ChainNode | undefined {
  return BY_ID.get(String(id ?? '').trim());
}

// ── Evaluation against what the Vault records ───────────────────────────────

/** One live Vault document with a CTD section, as the evaluation reads it. */
export interface VaultSectionFact {
  ctdSection: string;
  placementStatus: string;
  title: string;
}

export type NodeState = 'filed' | 'suggested' | 'not_found' | 'not_visible';

export interface NodeVerdict {
  id: string;
  title: string;
  state: NodeState;
  /** Documents that evidence it (filed or suggested). */
  documents?: number;
  why?: string;
}

export interface ChainVerdict {
  nodes: NodeVerdict[];
  /** Not yet filed, and nothing it depends on is known to be missing. */
  next: Array<{ id: string; assumes: string[] }>;
  /** Not yet filed, and something it is written from is not filed either. */
  blocked: Array<{ id: string; waitsOn: string[] }>;
  /** Filed while something it is written from is not found — check what it was written from. */
  filedAheadOfSources: Array<{ id: string; missing: string[] }>;
}

function sectionMatches(section: string, prefixes: string[]): boolean {
  return prefixes.some((p) => section === p || section.startsWith(`${p}.`));
}

function verdictFor(node: ChainNode, facts: readonly VaultSectionFact[]): NodeVerdict {
  if (node.evidence.kind === 'not-visible') {
    return { id: node.id, title: node.title, state: 'not_visible', why: node.evidence.why };
  }
  const { sections, titlePattern } = node.evidence;
  const matches = facts.filter((f) => sectionMatches(f.ctdSection, sections) && (!titlePattern || titlePattern.test(f.title)));
  const filed = matches.filter((f) => f.placementStatus === 'confirmed').length;
  if (filed > 0) return { id: node.id, title: node.title, state: 'filed', documents: filed };
  const suggested = matches.filter((f) => f.placementStatus === 'suggested').length;
  if (suggested > 0) return { id: node.id, title: node.title, state: 'suggested', documents: suggested, why: 'Proposed at this section by the filing classifier; nobody has confirmed it.' };
  return { id: node.id, title: node.title, state: 'not_found' };
}

/**
 * Where a program stands, from the documents its Vault records. Pure: the
 * caller reads the facts, this decides. `not_visible` is never treated as done
 * or as missing — a step that depends on one names it under `assumes`.
 */
export function evaluateChain(facts: readonly VaultSectionFact[]): ChainVerdict {
  const nodes = SUBMISSION_CHAIN.map((n) => verdictFor(n, facts));
  const state = new Map(nodes.map((v) => [v.id, v.state]));
  const missing = (s: NodeState | undefined) => s === 'not_found' || s === 'suggested';
  const out: ChainVerdict = { nodes, next: [], blocked: [], filedAheadOfSources: [] };
  for (const node of SUBMISSION_CHAIN) {
    const own = state.get(node.id);
    const waitsOn = node.dependsOn.filter((d) => missing(state.get(d)));
    if (own === 'filed' && waitsOn.length) out.filedAheadOfSources.push({ id: node.id, missing: waitsOn });
    if (!missing(own)) continue;
    if (waitsOn.length) out.blocked.push({ id: node.id, waitsOn });
    else out.next.push({ id: node.id, assumes: node.dependsOn.filter((d) => state.get(d) === 'not_visible') });
  }
  return out;
}
