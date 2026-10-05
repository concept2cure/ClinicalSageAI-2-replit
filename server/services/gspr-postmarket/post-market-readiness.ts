/**
 * Post-Market Documentation Status
 *
 * Aggregates the post-market document set for a program into an HONEST status
 * view: for each EU MDR/IVDR post-market document type, whether the device owes
 * it, whether an instance exists, its lifecycle status, and whether its content
 * passes the existing completeness validator.
 *
 * What a device owes is decided by one table, EU_POSTMARKET_OBLIGATIONS, keyed
 * by regulation, normalised device class, and two stated facts — implantable
 * and custom-made. Nothing is read out of free text: "IIb implantable" is not a
 * class, and an unrecognised class fails closed (status 'class_unrecognised':
 * only the class-independent obligations — PMS plan, PMCF/PMPF — are stated,
 * every class-dependent one is 'undetermined', and the set is never "all
 * approved").
 *
 * Deliberately NOT a fabricated "readiness %": it reports factual presence,
 * status and gate results per document type, each cited to its MDR/IVDR
 * article. "allRequiredApproved" is a literal AND over the required set — it
 * does not imply Notified-Body readiness or scientific sufficiency.
 *
 * Every article reference in the table is recall: none was re-read against the
 * EUR-Lex text (regulator hosts are blocked in the authoring environment), and
 * each row's basis says so. The PSUR cadence and recipient rules are under a
 * pending amendment, COM(2025) 1023 (16 Dec 2025); per product decision 25
 * (docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/DECISIONS.md)
 * this table states current law until that proposal is adopted.
 */

import { listProgramDocuments, validateDocument } from './post-market.service';
import type {
  PostMarketDocument,
  PostMarketDocumentType,
} from '../../../shared/schema/gspr-postmarket';
import {
  basisLabel,
  type RegulatoryBasis,
} from '../../../shared/regulatory/regulatory-basis';

export type EuRegulation = 'MDR' | 'IVDR';
export type EuMdrClass = 'I' | 'Is' | 'Im' | 'Ir' | 'IIa' | 'IIb' | 'III';
export type EuIvdrClass = 'A' | 'B' | 'C' | 'D';
export type EuDeviceClass = EuMdrClass | EuIvdrClass;

export type DocLifecycleStatus =
  | 'missing'
  | 'draft'
  | 'under_review'
  | 'approved'
  | 'superseded'
  | 'withdrawn';

/**
 * - required: the regulation requires the document for this device.
 * - required-or-justified: required unless the PMS plan justifies why it is not
 *   applicable (PMCF/PMPF). The platform does not record that justification, so
 *   it counts as required until the document is present and approved.
 * - not-required: no row of the table applies to this device.
 * - undetermined: a fact the rule depends on was not stated (implantable), or
 *   the device class is not recognised. Never counted as satisfied.
 */
export type ObligationStatus = 'required' | 'required-or-justified' | 'not-required' | 'undetermined';

export interface DocTypeStatus {
  documentType: PostMarketDocumentType;
  /** true for 'required' and 'required-or-justified'. */
  required: boolean;
  obligation: ObligationStatus;
  present: boolean;
  status: DocLifecycleStatus;
  latestVersion?: number;
  documentId?: string;
  gatePasses?: boolean;
  criticalFindings?: number;
  /** The basis as a reader sees it, including whether it was checked. */
  citation: string;
  basis: RegulatoryBasis[];
  /** Set when the obligation applies. */
  cadence?: string;
  recipient?: string;
  /** Why the obligation is undetermined, or what a justification must say. */
  note?: string;
}

export interface PostMarketFacts {
  /** Whether the device is implantable. null/undefined = not stated. */
  implantable?: boolean | null;
  /** Whether the device is custom-made. null/undefined = not stated. */
  customMade?: boolean | null;
}

export interface PostMarketDocStatusReport {
  programId: string;
  deviceClass: string | null;
  regulation: EuRegulation;
  /**
   * 'class_unrecognised' = the class-dependent obligations could not be decided
   * (they are 'undetermined'); the set is never all-approved.
   */
  status: 'assessed' | 'class_unrecognised';
  normalisedClass: EuDeviceClass | null;
  classProblem?: string;
  implantable: boolean | null;
  customMade: boolean | null;
  /** What the computation assumed for a fact that was not stated. */
  assumptions: string[];
  documents: DocTypeStatus[];
  requiredTotal: number;
  requiredPresent: number;
  requiredApprovedCount: number;
  undeterminedTotal: number;
  allRequiredApproved: boolean;
  generatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// The obligations table
// ─────────────────────────────────────────────────────────────────────────────

export interface EuPostMarketObligation {
  id: string;
  regulation: EuRegulation;
  documentType: PostMarketDocumentType;
  /** Classes the row applies to outright. */
  classes: readonly EuDeviceClass[];
  /** Classes the row applies to only when the device is implantable. */
  implantableClasses?: readonly EuDeviceClass[];
  /** The row does not apply to a custom-made device. */
  excludesCustomMade?: boolean;
  obligation: 'required' | 'required-or-justified';
  article: string;
  /** Who the row covers, for the not-required citation. */
  scope: string;
  cadence: string;
  recipient: string;
  /** Recipient instead of `recipient` when the device is implantable. */
  implantableRecipient?: string;
  basis: RegulatoryBasis;
}

const MDR_URL = 'https://eur-lex.europa.eu/eli/reg/2017/745/oj';
const IVDR_URL = 'https://eur-lex.europa.eu/eli/reg/2017/746/oj';
const RECALL_NOTE = 'Not re-read against the EUR-Lex text; regulator hosts are blocked in the authoring environment.';

const mdr = (ref: string): RegulatoryBasis => ({ ref, confidence: 'recall', url: MDR_URL, note: RECALL_NOTE });
const ivdr = (ref: string): RegulatoryBasis => ({ ref, confidence: 'recall', url: IVDR_URL, note: RECALL_NOTE });

const MDR_ALL: readonly EuMdrClass[] = ['I', 'Is', 'Im', 'Ir', 'IIa', 'IIb', 'III'];
const MDR_CLASS_I: readonly EuMdrClass[] = ['I', 'Is', 'Im', 'Ir'];
const IVDR_ALL: readonly EuIvdrClass[] = ['A', 'B', 'C', 'D'];

const MDR_PSUR_MADE_AVAILABLE =
  'Made available to the notified body involved in the conformity assessment and, on request, to competent authorities (MDR Art 86(3))';
const MDR_PSUR_SUBMITTED =
  'Submitted to the notified body through EUDAMED (MDR Art 86(2), Art 92); the notified body adds its evaluation';
const MDR_PSUR_PROPOSAL_NOTE = 'COM(2025) 1023 (16 Dec 2025) proposes changing this; not adopted.';

/**
 * EU post-market documents by regulation and class. At most one row decides a
 * document type for a given device (pinned by post-market-readiness.test.ts).
 */
export const EU_POSTMARKET_OBLIGATIONS: readonly EuPostMarketObligation[] = Object.freeze([
  // ── MDR (Regulation (EU) 2017/745) ────────────────────────────────────────
  {
    id: 'mdr-pms-plan',
    regulation: 'MDR',
    documentType: 'pms_plan',
    classes: MDR_ALL,
    obligation: 'required',
    article: 'MDR Art 84; Annex III §1.1',
    scope: 'every MDR device',
    cadence: 'Maintained throughout the device lifetime as part of the technical documentation',
    recipient: 'Technical documentation (Annex III); assessed by the notified body where one is involved',
    basis: mdr('MDR Art 84'),
  },
  {
    id: 'mdr-pms-report',
    regulation: 'MDR',
    documentType: 'pms_report',
    classes: MDR_CLASS_I,
    obligation: 'required',
    article: 'MDR Art 85',
    scope: 'Class I (including Is, Im, Ir)',
    cadence: 'Updated when necessary',
    recipient: 'Made available to the competent authority on request (MDR Art 85)',
    basis: mdr('MDR Art 85'),
  },
  {
    id: 'mdr-psur-iia',
    regulation: 'MDR',
    documentType: 'psur',
    classes: ['IIa'],
    obligation: 'required',
    article: 'MDR Art 86',
    scope: 'Class IIa, IIb and III',
    cadence: `Updated when necessary and at least every two years (MDR Art 86(1)). ${MDR_PSUR_PROPOSAL_NOTE}`,
    recipient: MDR_PSUR_MADE_AVAILABLE,
    implantableRecipient: MDR_PSUR_SUBMITTED,
    basis: mdr('MDR Art 86'),
  },
  {
    id: 'mdr-psur-iib',
    regulation: 'MDR',
    documentType: 'psur',
    classes: ['IIb'],
    obligation: 'required',
    article: 'MDR Art 86',
    scope: 'Class IIa, IIb and III',
    cadence: `Updated at least annually (MDR Art 86(1)). ${MDR_PSUR_PROPOSAL_NOTE}`,
    recipient: MDR_PSUR_MADE_AVAILABLE,
    implantableRecipient: MDR_PSUR_SUBMITTED,
    basis: mdr('MDR Art 86'),
  },
  {
    id: 'mdr-psur-iii',
    regulation: 'MDR',
    documentType: 'psur',
    classes: ['III'],
    obligation: 'required',
    article: 'MDR Art 86',
    scope: 'Class IIa, IIb and III',
    cadence: `Updated at least annually (MDR Art 86(1)). ${MDR_PSUR_PROPOSAL_NOTE}`,
    recipient: MDR_PSUR_SUBMITTED,
    basis: mdr('MDR Art 86'),
  },
  {
    id: 'mdr-pmcf-plan',
    regulation: 'MDR',
    documentType: 'pmcf_plan',
    classes: MDR_ALL,
    obligation: 'required-or-justified',
    article: 'MDR Annex XIV Part B; Annex III §1.1(b)',
    scope: 'every MDR device, unless the PMS plan justifies why PMCF is not applicable',
    cadence: 'Part of the PMS plan; kept current with the clinical evaluation',
    recipient: 'Technical documentation; assessed by the notified body where one is involved',
    basis: mdr('MDR Annex XIV Part B'),
  },
  {
    id: 'mdr-pmcf-evaluation',
    regulation: 'MDR',
    documentType: 'pmcf_evaluation',
    classes: MDR_ALL,
    obligation: 'required-or-justified',
    article: 'MDR Annex XIV Part B',
    scope: 'every MDR device with a PMCF plan',
    cadence: 'Documents each analysis of the PMCF findings; updates the clinical evaluation report',
    recipient: 'Part of the clinical evaluation report and the technical documentation',
    basis: mdr('MDR Annex XIV Part B'),
  },
  {
    id: 'mdr-sscp',
    regulation: 'MDR',
    documentType: 'sscp',
    classes: ['III'],
    // MDR Annex VIII Rule 8 (recall): an implantable device is Class IIa (teeth)
    // or higher, so no Class I device is implantable and none owes an SSCP.
    implantableClasses: ['IIa', 'IIb'],
    excludesCustomMade: true,
    obligation: 'required',
    article: 'MDR Art 32',
    scope: 'implantable and Class III devices, other than custom-made or investigational devices',
    cadence: 'Kept up to date with the clinical evaluation (recall; MDCG 2019-9 not re-read)',
    recipient: 'Validated by the notified body and made public through EUDAMED (MDR Art 32)',
    basis: mdr('MDR Art 32'),
  },
  // ── IVDR (Regulation (EU) 2017/746) ───────────────────────────────────────
  {
    id: 'ivdr-pms-plan',
    regulation: 'IVDR',
    documentType: 'pms_plan',
    classes: IVDR_ALL,
    obligation: 'required',
    article: 'IVDR Art 79; Annex III §1.1',
    scope: 'every IVDR device',
    cadence: 'Maintained throughout the device lifetime as part of the technical documentation',
    recipient: 'Technical documentation (Annex III); assessed by the notified body where one is involved',
    basis: ivdr('IVDR Art 79'),
  },
  {
    id: 'ivdr-pms-report',
    regulation: 'IVDR',
    documentType: 'pms_report',
    classes: ['A', 'B'],
    obligation: 'required',
    article: 'IVDR Art 80',
    scope: 'Class A and B',
    cadence: 'Updated when necessary',
    recipient: 'Made available to the notified body and the competent authority on request (IVDR Art 80)',
    basis: ivdr('IVDR Art 80'),
  },
  {
    id: 'ivdr-psur-c',
    regulation: 'IVDR',
    documentType: 'psur',
    classes: ['C'],
    obligation: 'required',
    article: 'IVDR Art 81',
    scope: 'Class C and D',
    cadence: 'Updated at least annually (IVDR Art 81(1))',
    recipient:
      'Made available to the notified body involved in the conformity assessment and, on request, to competent authorities (IVDR Art 81)',
    basis: ivdr('IVDR Art 81'),
  },
  {
    id: 'ivdr-psur-d',
    regulation: 'IVDR',
    documentType: 'psur',
    classes: ['D'],
    obligation: 'required',
    article: 'IVDR Art 81',
    scope: 'Class C and D',
    cadence: 'Updated at least annually (IVDR Art 81(1))',
    recipient: 'Submitted to the notified body through EUDAMED (IVDR Art 81, Art 87); the notified body adds its evaluation',
    basis: ivdr('IVDR Art 81'),
  },
  {
    id: 'ivdr-ssp',
    regulation: 'IVDR',
    documentType: 'ssp',
    classes: ['C', 'D'],
    obligation: 'required',
    article: 'IVDR Art 29',
    scope: 'Class C and D, other than devices for performance studies',
    cadence: 'Kept up to date with the performance evaluation (recall; MDCG 2022-9 not re-read)',
    recipient: 'Validated by the notified body and made public through EUDAMED (IVDR Art 29)',
    basis: ivdr('IVDR Art 29'),
  },
  {
    id: 'ivdr-pmpf-plan',
    regulation: 'IVDR',
    documentType: 'pmpf_plan',
    classes: IVDR_ALL,
    obligation: 'required-or-justified',
    article: 'IVDR Annex XIII Part B; Annex III §1.1',
    scope: 'every IVDR device, unless the PMS plan justifies why PMPF is not applicable',
    cadence: 'Part of the PMS plan; kept current with the performance evaluation',
    recipient: 'Technical documentation; assessed by the notified body where one is involved',
    basis: ivdr('IVDR Annex XIII Part B'),
  },
  {
    id: 'ivdr-pmpf-evaluation',
    regulation: 'IVDR',
    documentType: 'pmpf_evaluation',
    classes: IVDR_ALL,
    obligation: 'required-or-justified',
    article: 'IVDR Annex XIII Part B',
    scope: 'every IVDR device with a PMPF plan',
    cadence: 'Documents each analysis of the PMPF findings; updates the performance evaluation report',
    recipient: 'Part of the performance evaluation report and the technical documentation',
    basis: ivdr('IVDR Annex XIII Part B'),
  },
]);

/** The document types each regulation's post-market file is made of, in display order. */
export const EU_POSTMARKET_DOCUMENT_TYPES: Readonly<Record<EuRegulation, readonly PostMarketDocumentType[]>> =
  Object.freeze({
    MDR: ['pms_plan', 'pms_report', 'psur', 'pmcf_plan', 'pmcf_evaluation', 'sscp'],
    IVDR: ['pms_plan', 'pms_report', 'psur', 'pmpf_plan', 'pmpf_evaluation', 'ssp'],
  });

// ─────────────────────────────────────────────────────────────────────────────
// Class normalisation — exact vocabulary, no guessing
// ─────────────────────────────────────────────────────────────────────────────

const MDR_CLASS_BY_KEY: Readonly<Record<string, EuMdrClass>> = { I: 'I', IS: 'Is', IM: 'Im', IR: 'Ir', IIA: 'IIa', IIB: 'IIb', III: 'III' };
const IVDR_CLASS_BY_KEY: Readonly<Record<string, EuIvdrClass>> = { A: 'A', B: 'B', C: 'C', D: 'D' };

/**
 * The regulation's class for a stated class string, or null. Accepts the class
 * itself with an optional "Class" prefix, any case ("Class IIb", "iib", "IS");
 * anything else — another regulation's class, or text such as "IIb implantable"
 * — is not recognised.
 */
export function normaliseEuDeviceClass(
  deviceClass: string | null | undefined,
  regulation: EuRegulation
): EuDeviceClass | null {
  if (typeof deviceClass !== 'string') return null;
  const key = deviceClass.trim().replace(/^class\s+/i, '').toUpperCase();
  const table: Readonly<Record<string, EuDeviceClass>> = regulation === 'MDR' ? MDR_CLASS_BY_KEY : IVDR_CLASS_BY_KEY;
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolution
// ─────────────────────────────────────────────────────────────────────────────

interface ResolvedObligation {
  obligation: ObligationStatus;
  basis: RegulatoryBasis[];
  citation: string;
  cadence?: string;
  recipient?: string;
  note?: string;
}

function rowsFor(regulation: EuRegulation, documentType: PostMarketDocumentType): EuPostMarketObligation[] {
  return EU_POSTMARKET_OBLIGATIONS.filter(o => o.regulation === regulation && o.documentType === documentType);
}

function citationOf(rows: readonly EuPostMarketObligation[], withScope: boolean): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const r of rows) {
    const label = withScope ? `${basisLabel(r.basis)} — ${r.scope}` : basisLabel(r.basis);
    if (!seen.has(label)) {
      seen.add(label);
      parts.push(label);
    }
  }
  return parts.join('; ');
}

function uniqueBases(rows: readonly EuPostMarketObligation[]): RegulatoryBasis[] {
  const byRef = new Map<string, RegulatoryBasis>();
  for (const r of rows) if (!byRef.has(r.basis.ref)) byRef.set(r.basis.ref, r.basis);
  return [...byRef.values()];
}

function justificationNote(o: EuPostMarketObligation): string | undefined {
  if (o.obligation !== 'required-or-justified') return undefined;
  return (
    'Required unless the PMS plan justifies why it is not applicable. The platform does not record that ' +
    'justification, so this stays outstanding until the document is present and approved.'
  );
}

/** The obligation a row states for a device it applies to. */
function resolvedFrom(o: EuPostMarketObligation, recipient: string): ResolvedObligation {
  return {
    obligation: o.obligation,
    basis: [o.basis],
    citation: citationOf([o], false),
    cadence: o.cadence,
    recipient,
    note: justificationNote(o),
  };
}

function resolveObligation(
  regulation: EuRegulation,
  cls: EuDeviceClass,
  documentType: PostMarketDocumentType,
  implantable: boolean | null,
  customMade: boolean
): ResolvedObligation {
  const rows = rowsFor(regulation, documentType);
  for (const o of rows) {
    if (o.excludesCustomMade && customMade) continue;
    const outright = o.classes.includes(cls);
    const viaImplant = o.implantableClasses?.includes(cls) ?? false;
    if (outright) {
      const recipient =
        o.implantableRecipient === undefined || implantable === false
          ? o.recipient
          : implantable === true
            ? o.implantableRecipient
            : `Depends on whether the device is implantable, which was not stated. Implantable: ${o.implantableRecipient}. Otherwise: ${o.recipient}`;
      return resolvedFrom(o, recipient);
    }
    if (viaImplant && implantable === true) return resolvedFrom(o, o.implantableRecipient ?? o.recipient);
    if (viaImplant && implantable === null) {
      return {
        obligation: 'undetermined',
        basis: [o.basis],
        citation: citationOf([o], true),
        note: `Required if the device is implantable (${o.article}); whether it is implantable was not stated.`,
      };
    }
  }
  return {
    obligation: 'not-required',
    basis: uniqueBases(rows),
    citation: citationOf(rows, true),
  };
}

function latestByType(docs: PostMarketDocument[]): Map<PostMarketDocumentType, PostMarketDocument> {
  const latest = new Map<PostMarketDocumentType, PostMarketDocument>();
  for (const d of docs) {
    const t = d.documentType as PostMarketDocumentType;
    const cur = latest.get(t);
    if (!cur || (d.version ?? 1) > (cur.version ?? 1)) latest.set(t, d);
  }
  return latest;
}

function classProblemFor(deviceClass: string | null, regulation: EuRegulation): string {
  if (typeof deviceClass !== 'string' || deviceClass.trim() === '') {
    return `The device class is not set, so the ${regulation} post-market obligations cannot be determined.`;
  }
  const vocabulary = regulation === 'MDR' ? 'I, Is, Im, Ir, IIa, IIb or III' : 'A, B, C or D';
  return `"${deviceClass}" is not an ${regulation} device class (${vocabulary}), so the post-market obligations cannot be determined.`;
}

/** True when a row that excludes custom-made devices could apply to this device. */
function dependsOnCustomMade(regulation: EuRegulation, cls: EuDeviceClass, implantable: boolean | null): boolean {
  return EU_POSTMARKET_OBLIGATIONS.some(
    o =>
      o.regulation === regulation &&
      o.excludesCustomMade === true &&
      (o.classes.includes(cls) || (implantable !== false && (o.implantableClasses?.includes(cls) ?? false)))
  );
}

const CLASS_VOCABULARY: Readonly<Record<EuRegulation, readonly EuDeviceClass[]>> = { MDR: MDR_ALL, IVDR: IVDR_ALL };

/**
 * The class is not recognised. A row whose `classes` cover the regulation's
 * whole vocabulary (the PMS plan, PMCF/PMPF) does not depend on the class, so it
 * still resolves to its obligation — showing it as optional would be false.
 * Every other row depends on the class and stays undetermined.
 */
function resolveWithoutClass(
  regulation: EuRegulation,
  t: PostMarketDocumentType,
  classProblem: string,
  customMade: boolean
): ResolvedObligation {
  const rows = rowsFor(regulation, t);
  const everyClass = rows.find(
    o =>
      CLASS_VOCABULARY[regulation].every(c => o.classes.includes(c)) && !(o.excludesCustomMade === true && customMade)
  );
  if (everyClass) return resolvedFrom(everyClass, everyClass.recipient);
  return { obligation: 'undetermined', basis: uniqueBases(rows), citation: citationOf(rows, true), note: classProblem };
}

function docTypeStatus(t: PostMarketDocumentType, r: ResolvedObligation, doc: PostMarketDocument | undefined): DocTypeStatus {
  const base = {
    documentType: t,
    required: r.obligation === 'required' || r.obligation === 'required-or-justified',
    obligation: r.obligation,
    citation: r.citation,
    basis: r.basis,
    ...(r.cadence !== undefined ? { cadence: r.cadence } : {}),
    ...(r.recipient !== undefined ? { recipient: r.recipient } : {}),
    ...(r.note !== undefined ? { note: r.note } : {}),
  };
  if (!doc) return { ...base, present: false, status: 'missing' };
  const validation = validateDocument(doc);
  return {
    ...base,
    present: true,
    status: (doc.status as DocLifecycleStatus) ?? 'draft',
    latestVersion: doc.version ?? 1,
    documentId: doc.id,
    gatePasses: validation.passesGate,
    criticalFindings: validation.criticalCount,
  };
}

/**
 * Pure computation: collapse the program's documents (all types/versions) into a
 * per-type status report. Exposed for direct testing without a DB.
 */
export function computeDocStatus(
  docs: PostMarketDocument[],
  deviceClass: string | null,
  regulation: EuRegulation,
  programId: string,
  facts: PostMarketFacts = {}
): PostMarketDocStatusReport {
  const latest = latestByType(docs);
  const implantable = typeof facts.implantable === 'boolean' ? facts.implantable : null;
  const customMade = typeof facts.customMade === 'boolean' ? facts.customMade : null;
  const normalisedClass = normaliseEuDeviceClass(deviceClass, regulation);
  const classProblem = normalisedClass === null ? classProblemFor(deviceClass, regulation) : undefined;

  const assumptions: string[] = [];
  if (normalisedClass !== null && customMade === null && dependsOnCustomMade(regulation, normalisedClass, implantable)) {
    assumptions.push('Custom-made was not stated; the device is treated as not custom-made, which can only add obligations.');
  }

  const documents = EU_POSTMARKET_DOCUMENT_TYPES[regulation].map(t =>
    docTypeStatus(
      t,
      normalisedClass === null
        ? resolveWithoutClass(regulation, t, classProblem ?? '', customMade ?? false)
        : resolveObligation(regulation, normalisedClass, t, implantable, customMade ?? false),
      latest.get(t)
    )
  );

  const req = documents.filter(d => d.required);
  const requiredApprovedCount = req.filter(
    d => d.present && d.status === 'approved' && d.gatePasses === true
  ).length;
  const undeterminedTotal = documents.filter(d => d.obligation === 'undetermined').length;

  return {
    programId,
    deviceClass,
    regulation,
    status: normalisedClass === null ? 'class_unrecognised' : 'assessed',
    normalisedClass,
    ...(classProblem !== undefined ? { classProblem } : {}),
    implantable,
    customMade,
    assumptions,
    documents,
    requiredTotal: req.length,
    requiredPresent: req.filter(d => d.present).length,
    requiredApprovedCount,
    undeterminedTotal,
    // Fail closed: an unrecognised class or any undetermined row is never "all approved".
    allRequiredApproved:
      normalisedClass !== null && undeterminedTotal === 0 && req.length > 0 && requiredApprovedCount === req.length,
    generatedAt: new Date().toISOString(),
  };
}

/** DB-backed wrapper: load the program's documents and compute the status report. */
export async function getPostMarketDocStatus(
  organizationId: number,
  programId: string,
  deviceClass: string | null,
  regulation: EuRegulation,
  facts: PostMarketFacts = {}
): Promise<PostMarketDocStatusReport> {
  const docs = await listProgramDocuments(organizationId, programId);
  return computeDocStatus(docs, deviceClass, regulation, programId, facts);
}
