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
 * (placement confirmed) or proposed (placement suggested) at a CTD section,
 * with the folder and the evidence kind the Vault's filing classifiers wrote.
 * A step whose section range holds other kinds of document (5.3.5.1 holds the
 * SAP and the protocol as well as the CSR) is matched by kind or title too, so
 * a SAP is never counted as the CSR. A CSR the classifiers leave at the heading
 * 5.3.5, or in Module 5 with no section, is seen but not counted as filed: it
 * is reported under `unspecificPlacement` until it has a study-type leaf. A
 * Module 2 summary or an ISS/ISE filed where its kind does not go is reported
 * under `misfiled`, with the section expected and the basis (2026-10-05,
 * step g-chain-vault-evidence; before it a SAP at 5.3.5.1 made the CSR
 * "filed", and a CSR at 5.3.5 read "not found" with eight steps blocked).
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
import {
  CFR_314_50_F,
  FDA_E3,
  FDA_ISE_GUIDANCE,
  FDA_ISS_ISE_PLACEMENT,
  FDA_SDTCG,
  FDA_STUDY_DATA_TRC,
  M4E_R2,
  practice,
  recall,
} from './regulatory-basis.js';

export type ChainStage = 'close-out' | 'study-data' | 'study-report' | 'integration' | 'summary' | 'labeling' | 'assembly';

export interface VaultEvidence {
  kind: 'vault';
  /** The CTD leaves (and everything below them) the deliverable is filed at. */
  sections: string[];
  /**
   * What identifies the deliverable among the documents at those sections. With
   * neither, any document there counts; with either, a document counts when its
   * Vault evidence kind is in `kinds` OR its title matches `titlePattern`.
   */
  titlePattern?: RegExp;
  kinds?: string[];
  /** A document whose title matches is a different deliverable, whatever else matched. */
  excludeTitle?: RegExp;
  /** A document the Vault recorded as one of these kinds is a different deliverable. */
  excludeKinds?: string[];
  /**
   * Where the Vault can hold the deliverable without a leaf it can be packaged
   * at: exactly these sections, or one of these folders with no section. Seen,
   * reported, never counted as filed.
   */
  unspecific?: { sections: string[]; folders: string[]; why: string };
  /** A title that says the document IS this deliverable, wherever it is filed. */
  misfiledPattern?: RegExp;
  /** The basis for where it goes, cited when it is filed elsewhere. */
  misfiledBasis?: E3Basis;
  /** Further sections it may be placed at, each with what the sequence then still needs. */
  alsoPlacedAt?: { sections: string[]; note: string };
}

export type ChainEvidence = VaultEvidence | { kind: 'not-visible'; why: string };

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

/**
 * Title words. The boundaries are letters and digits rather than \b, so a file
 * name such as "ABC-301_CSR.pdf" is read ('_' is a word character to \b).
 */
const CSR_TITLE = /clinical study report|(?<![a-z0-9])CSR(?![a-z0-9])/i;
const SAP_TITLE = /statistical analysis plan|(?<![a-z0-9])SAP(?![a-z0-9])/i;
const ISS_TITLE = /integrated summary of safety|(?<![a-z0-9])ISS(?![a-z0-9])/i;
const ISE_TITLE = /integrated summary of (effectiveness|efficacy)|(?<![a-z0-9])ISE(?![a-z0-9])/i;
/**
 * Documents filed in the CSR's sections that are not CSRs: the SAP, an
 * integrated summary, a Module 2 summary, and a protocol — unless the title
 * itself names a CSR, since a CSR is routinely titled by its protocol number.
 */
const NOT_A_CSR = /statistical analysis plan|(?<![a-z0-9])SAP(?![a-z0-9])|integrated summary|summary of clinical|^(?!.*(clinical study report|(?<![a-z0-9])CSR(?![a-z0-9]))).*(?<![a-z])protocol(?![a-z])/i;
/**
 * The Vault's classifiers propose a CSR at the heading 5.3.5
 * (ctd-ingestion-service.ts, vault-filing.service.ts TEXT_RULES) and a declared
 * CSR upload goes to Module 5 with no section. The platform's rule is that 5.3.5
 * does not cover 5.3.5.1 (the Vault coverage read model), and ICH M4E files a CSR under
 * 5.3.5.1, 5.3.5.2 or 5.3.5.4 by study type.
 */
const CSR_UNSPECIFIC_WHY =
  'Filed at 5.3.5 / Module 5 without a section; place at 5.3.5.1, .2 or .4 by study type before packaging.';
const ISS_ISE_REFERENCE_LEAF =
  'Placed once in Module 2; the sequence still needs a leaf in 5.3.5.3 that references it.';

export const SUBMISSION_CHAIN: readonly ChainNode[] = Object.freeze<ChainNode[]>([
  {
    id: 'sap_final', title: 'Statistical analysis plan final', stage: 'close-out', scope: 'each study',
    produces: 'The final SAP, signed and dated before the database is locked and the study unblinded.',
    dependsOn: [], files: ['5.3.5.1'],
    gate: ['Signed and dated before unblinding; any later change reported in the CSR (E3 §9.7.1, §9.8)'],
    basis: [recall('ICH E3 §9.7.1, §9.8'), recall('ICH E9 / E9(R1)')],
    evidence: { kind: 'vault', sections: ['5.3'], titlePattern: SAP_TITLE, excludeKinds: ['csr'] },
  },
  {
    id: 'database_lock', title: 'Database lock', stage: 'close-out', scope: 'each study',
    produces: 'A locked clinical database: queries resolved, medical coding complete with the MedDRA and WHODrug versions recorded, serious adverse events reconciled with the safety database, then locked and, for a blinded study, unblinded.',
    dependsOn: ['sap_final'],
    gate: ['Lock date, dictionary versions and the SAE reconciliation recorded', 'Unblinding only after the SAP is final'],
    basis: [practice('Clinical data management practice'), recall('ICH E6 data handling')],
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
    basis: [FDA_SDTCG, practice('Statistical programming QC practice')],
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
    evidence: {
      kind: 'vault', sections: ['5.3.1', '5.3.2', '5.3.3', '5.3.4', '5.3.5.1', '5.3.5.2', '5.3.5.4'],
      kinds: ['csr'], titlePattern: CSR_TITLE, excludeTitle: NOT_A_CSR,
      unspecific: { sections: ['5.3.5'], folders: ['module-5'], why: CSR_UNSPECIFIC_WHY },
    },
  },
  {
    id: 'integrated_data', title: 'Integrated analysis datasets', stage: 'integration', scope: 'the application',
    produces: 'Pooled ADaM datasets for the integrated analyses, every study re-coded to one MedDRA version, with an integration analysis plan and define.xml.',
    dependsOn: ['adam'],
    gate: ['One MedDRA version across every pooled study', 'Pooling decided and documented before the integrated results are seen'],
    basis: [practice('Integrated-analysis practice'), FDA_SDTCG],
    evidence: { kind: 'not-visible', why: NO_DATASETS },
  },
  {
    id: 'iss', title: 'Integrated Summary of Safety', stage: 'integration', scope: 'the application',
    produces: 'The integrated analysis of safety across the program that 21 CFR 314.50(d)(5)(vi) requires — an analysis, not a summary — filed in 5.3.5.3.',
    dependsOn: ['integrated_data', 'csr'], files: ['5.3.5.3'],
    gate: ['Its numbers reconcile with each CSR and with the integrated datasets'],
    reviewerChecks: ['Its absence is a refuse-to-file ground (21 CFR 314.101(d)(3), against 314.50)'],
    basis: [FDA_ISS_ISE_PLACEMENT, recall('21 CFR 314.50(d)(5)(vi)')],
    evidence: {
      kind: 'vault', sections: ['5.3.5.3'], titlePattern: ISS_TITLE,
      misfiledPattern: ISS_TITLE, misfiledBasis: FDA_ISS_ISE_PLACEMENT,
      alsoPlacedAt: { sections: ['2.7.3', '2.7.4'], note: ISS_ISE_REFERENCE_LEAF },
    },
  },
  {
    id: 'ise', title: 'Integrated Summary of Effectiveness', stage: 'integration', scope: 'the application',
    produces: 'The integrated analysis of effectiveness that 21 CFR 314.50(d)(5)(v) requires, filed in 5.3.5.3.',
    dependsOn: ['integrated_data', 'csr'], files: ['5.3.5.3'],
    gate: ['Its numbers reconcile with each CSR and with the integrated datasets'],
    reviewerChecks: ['Its absence is a refuse-to-file ground (21 CFR 314.101(d)(3), against 314.50)'],
    basis: [FDA_ISS_ISE_PLACEMENT, FDA_ISE_GUIDANCE],
    evidence: {
      kind: 'vault', sections: ['5.3.5.3'], titlePattern: ISE_TITLE,
      misfiledPattern: ISE_TITLE, misfiledBasis: FDA_ISS_ISE_PLACEMENT,
      alsoPlacedAt: { sections: ['2.7.3', '2.7.4'], note: ISS_ISE_REFERENCE_LEAF },
    },
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
    // misfiledPattern reports misfiling only; evidence is still any document at 2.7.3.
    evidence: { kind: 'vault', sections: ['2.7.3'], misfiledPattern: /summary of clinical efficacy/i, misfiledBasis: M4E_R2 },
  },
  {
    id: 'm2_7_4', title: '2.7.4 Summary of Clinical Safety', stage: 'summary', scope: 'the application',
    produces: 'Summaries of safety across the program; the ISS narrative is placed here once when suitable and referenced from 5.3.5.3.',
    dependsOn: ['iss', 'csr'], files: ['2.7.4'],
    gate: ['Every number traceable to the ISS or a CSR'],
    basis: [FDA_ISS_ISE_PLACEMENT, M4E_R2],
    evidence: { kind: 'vault', sections: ['2.7.4'], misfiledPattern: /summary of clinical safety/i, misfiledBasis: M4E_R2 },
  },
  {
    id: 'm2_7_6', title: '2.7.6 Synopses of Individual Studies', stage: 'summary', scope: 'the application',
    produces: 'The synopsis of every study, taken from each CSR’s E3 §2 synopsis.',
    dependsOn: ['csr'], files: ['2.7.6'],
    gate: ['Each synopsis identical to its CSR’s'],
    basis: [M4E_R2, recall('ICH E3 §2')],
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
    basis: [recall('21 CFR 201.56–201.57 (PLR format)')],
    evidence: { kind: 'vault', sections: ['1.14.1'] },
  },
  {
    id: 'ectd_assembly', title: 'eCTD sequence assembly', stage: 'assembly', scope: 'the application',
    produces: 'The sequence: every leaf at its CTD heading with ICH M4 granularity, a study tagging file per study, relative hyperlinks, bookmarks, and conforming file names and paths.',
    dependsOn: ['csr', 'iss', 'ise', 'm2_7_3', 'm2_7_4', 'm2_7_6', 'm2_5', 'labeling', 'sdtm', 'adam'],
    gate: ['Every leaf is a conforming PDF (list_fda_technical_rules)', 'Every cross-reference resolves'],
    basis: [recall('ICH M2 eCTD specification; FDA eCTD Technical Conformance Guide')],
    evidence: { kind: 'not-visible', why: SUBMISSION_CENTER },
  },
  {
    id: 'technical_validation', title: 'Technical validation and completeness', stage: 'assembly', scope: 'the application',
    produces: 'FDA’s eCTD validation criteria, the study-data technical rejection criteria and the PDF specifications checked; completeness reviewed against 21 CFR 314.50 and the refuse-to-file grounds of 314.101(d).',
    dependsOn: ['ectd_assembly'],
    gate: ['No high-severity validation finding; no technical rejection criterion failed'],
    basis: [FDA_STUDY_DATA_TRC, recall('21 CFR 314.101(d)')],
    evidence: { kind: 'not-visible', why: SUBMISSION_CENTER },
  },
  {
    id: 'transmission', title: 'Transmission through the FDA ESG', stage: 'assembly', scope: 'the application',
    produces: 'The sequence transmitted and acknowledged.',
    dependsOn: ['technical_validation'],
    gate: ['Acknowledgements received and filed'],
    basis: [recall('FDA Electronic Submissions Gateway')],
    evidence: { kind: 'not-visible', why: SUBMISSION_CENTER },
  },
]);

const BY_ID: ReadonlyMap<string, ChainNode> = new Map(SUBMISSION_CHAIN.map((n) => [n.id, n]));

export function getChainNode(id: string): ChainNode | undefined {
  return BY_ID.get(String(id ?? '').trim());
}

// ── Evaluation against what the Vault records ───────────────────────────────

/**
 * One live Vault document as the evaluation reads it: its CTD section (null
 * when the Vault filed it to a folder only), the folder and the evidence kind
 * the filing classifiers wrote, its placement status and its title.
 */
export interface VaultSectionFact {
  ctdSection: string | null;
  folderId?: string | null;
  evidenceKind?: string | null;
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
  /** A document whose title says what it is, filed where that kind does not go. */
  misfiled: Array<{ title: string; filedAt: string; expected: string[]; basis: E3Basis }>;
  /** A step's document held where the sequence cannot package it; counted as suggested, never filed. */
  unspecificPlacement: Array<{ step: string; document: string; filedAt: string; expected: string[] }>;
  /** A document placed where it may go, with what the sequence still needs for it. */
  placementNotes: Array<{ document: string; filedAt: string; note: string; basis: E3Basis }>;
}

function sectionMatches(section: string | null | undefined, prefixes: string[]): boolean {
  if (!section) return false;
  return prefixes.some((p) => section === p || section.startsWith(`${p}.`));
}

/** Where a document sits, in words: its section, or its folder when it has none. */
function placementOf(f: VaultSectionFact): string {
  if (f.ctdSection) return f.ctdSection;
  const m = /^module-(\d)$/.exec(f.folderId ?? '');
  return m ? `Module ${m[1]} (no section)` : `${f.folderId ?? 'no folder'} (no section)`;
}

/** Whether the document is this deliverable, by the kind the Vault recorded or its title. */
function isDeliverable(e: VaultEvidence, f: VaultSectionFact): boolean {
  const kind = f.evidenceKind ?? null;
  if (e.excludeTitle?.test(f.title)) return false;
  if (kind && e.excludeKinds?.includes(kind)) return false;
  if (!e.kinds && !e.titlePattern) return true;
  return Boolean((kind && e.kinds?.includes(kind)) || e.titlePattern?.test(f.title));
}

function isUnspecific(e: VaultEvidence, f: VaultSectionFact): boolean {
  if (!e.unspecific) return false;
  if (f.ctdSection) return e.unspecific.sections.includes(f.ctdSection);
  return Boolean(f.folderId && e.unspecific.folders.includes(f.folderId));
}

function verdictFor(node: ChainNode, facts: readonly VaultSectionFact[]): NodeVerdict {
  if (node.evidence.kind === 'not-visible') {
    return { id: node.id, title: node.title, state: 'not_visible', why: node.evidence.why };
  }
  const e = node.evidence;
  const ours = facts.filter((f) => isDeliverable(e, f));
  const matches = ours.filter((f) => sectionMatches(f.ctdSection, e.sections));
  const filed = matches.filter((f) => f.placementStatus === 'confirmed').length;
  if (filed > 0) return { id: node.id, title: node.title, state: 'filed', documents: filed };
  const suggested = matches.filter((f) => f.placementStatus === 'suggested').length;
  const unspecific = ours.filter((f) => isUnspecific(e, f)).length;
  if (unspecific > 0) return { id: node.id, title: node.title, state: 'suggested', documents: suggested + unspecific, why: e.unspecific!.why };
  if (suggested > 0) return { id: node.id, title: node.title, state: 'suggested', documents: suggested, why: 'Proposed at this section by the filing classifier; nobody has confirmed it.' };
  return { id: node.id, title: node.title, state: 'not_found' };
}

/** Where each document sits against the steps whose titles say what it is. Pure. */
function placementFindings(facts: readonly VaultSectionFact[]): Pick<ChainVerdict, 'misfiled' | 'unspecificPlacement' | 'placementNotes'> {
  const out: Pick<ChainVerdict, 'misfiled' | 'unspecificPlacement' | 'placementNotes'> = { misfiled: [], unspecificPlacement: [], placementNotes: [] };
  const vaultNodes = SUBMISSION_CHAIN.filter((n): n is ChainNode & { evidence: VaultEvidence } => n.evidence.kind === 'vault');
  for (const f of facts) {
    const filedAt = placementOf(f);
    for (const n of vaultNodes) {
      if (isUnspecific(n.evidence, f) && isDeliverable(n.evidence, f)) {
        out.unspecificPlacement.push({ step: n.id, document: f.title, filedAt, expected: n.files ?? n.evidence.sections });
      }
    }
    // Every step whose title the document carries; it is misfiled only when it
    // sits where none of them goes.
    const named = vaultNodes.filter((n) => n.evidence.misfiledPattern?.test(f.title));
    if (!named.length) continue;
    if (named.some((n) => sectionMatches(f.ctdSection, n.files ?? n.evidence.sections))) continue;
    const alt = named.find((n) => sectionMatches(f.ctdSection, n.evidence.alsoPlacedAt?.sections ?? []));
    if (alt) {
      out.placementNotes.push({ document: f.title, filedAt, note: alt.evidence.alsoPlacedAt!.note, basis: alt.evidence.misfiledBasis ?? alt.basis[0] });
      continue;
    }
    const expected = [...new Set(named.flatMap((n) => [...(n.files ?? n.evidence.sections), ...(n.evidence.alsoPlacedAt?.sections ?? [])]))];
    out.misfiled.push({ title: f.title, filedAt, expected, basis: named[0].evidence.misfiledBasis ?? named[0].basis[0] });
  }
  return out;
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
  const out: ChainVerdict = { nodes, next: [], blocked: [], filedAheadOfSources: [], ...placementFindings(facts) };
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
