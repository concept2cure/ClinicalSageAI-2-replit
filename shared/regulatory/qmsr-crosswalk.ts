/**
 * QMSR crosswalk — the one record of how each ISO 13485:2016 clause the
 * platform reasons about is cited under the FDA Quality Management System
 * Regulation (QMSR, 21 CFR 820), and which removed QSR section it replaced.
 *
 * WHY: the QMSR has been in force since 2026-02-02 (currency fact `us-qmsr`).
 * 21 CFR 820.10 requires a quality management system that complies with
 * ISO 13485:2016, incorporated by reference; 820.35 adds record requirements
 * (complaints, servicing, UDI) and 820.45 adds labeling and packaging
 * controls. The 1996 QSR sections 820.20 to 820.250 are removed. The platform
 * cited only the removed sections and never 820.10, 820.35 or 820.45, so a
 * client was pointed at sections that no longer exist.
 *
 * One row per id; `citeQms(id, asOf)` is the only rendering. On and after the
 * effective date it gives the QMSR basis and names the QSR section as
 * "formerly", so a record indexed to the QSR stays findable; before it, the
 * QSR section alone.
 *
 * BASIS: rows whose QMSR citation is stated in the eCFR text of 21 CFR 820 are
 * `regulator-text`; rows that rely on the ISO 13485:2016 subclause numbering
 * (ISO text, not a regulator page) are `recall`. Every legacy QSR section is
 * recall of the removed 1996 text. See
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-qmsr-crosswalk-assess-qms-facts.md.
 *
 * No IO, no clock: identical input gives identical output. Client- and
 * server-safe: its only import is shared/regulatory/regulatory-basis.ts, which
 * has no imports.
 *
 * @module shared/regulatory/qmsr-crosswalk
 */

import { basisProblems, type RegulatoryBasis } from './regulatory-basis.js';

/** Currency-registry id of the QMSR fact (server/services/regulatory-currency/currency-registry.ts). */
export const QMSR_FACT_ID = 'us-qmsr';
/** The `us-qmsr` fact's effectiveDate. A test pins the two together. */
export const QMSR_EFFECTIVE = '2026-02-02';
/** The last day the QSR applied. */
export const QSR_LAST_DAY = '2026-02-01';

/** Ids: the QMS clause ids of market-specs/quality-system.ts and the design-control element ids. */
export type QmsrCrosswalkId =
  | 'qms_general'
  | 'management'
  | 'resources'
  | 'design_controls'
  | 'purchasing'
  | 'production'
  | 'measuring_equipment'
  | 'feedback_complaints'
  | 'nonconforming'
  | 'capa'
  | 'designPlan'
  | 'designInputs'
  | 'designOutputs'
  | 'designReviews'
  | 'designVerification'
  | 'designValidation'
  | 'designTransfer'
  | 'designChanges'
  | 'traceability';

export interface QmsrCrosswalkRow {
  id: QmsrCrosswalkId;
  title: string;
  /** ISO 13485:2016 clause number, e.g. '7.3.3'. */
  iso13485Clause: string;
  /** The current citation: a QMSR section and the ISO 13485:2016 clause it reaches. */
  qmsrBasis: string;
  /** The removed QSR section(s) this replaced; shown only as "formerly". */
  legacyQsr: string;
  /** Provenance of the QMSR citation. */
  basis: RegulatoryBasis;
}

const CHECKED = '2026-10-05';
const ECFR_820_10 = 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820/subpart-A/section-820.10';
const ECFR_820_35 = 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820/subpart-B/section-820.35';
const ECFR_820 = 'https://www.ecfr.gov/current/title-21/chapter-I/subchapter-H/part-820';
const SEARCH_EXTRACT = 'search extract of the eCFR page; verbatim re-read owed';
const ISO_RECALL =
  '21 CFR 820.10 incorporating ISO 13485:2016 is regulator text (eCFR, checked 2026-10-05); the ISO subclause numbering is from the standard, not a regulator page, and the legacy QSR section is recall of the removed 1996 text.';

function recall(ref: string): RegulatoryBasis {
  return { ref, confidence: 'recall', url: ECFR_820, factId: QMSR_FACT_ID, note: ISO_RECALL };
}

function designElement(
  id: QmsrCrosswalkId,
  title: string,
  clause: string,
  para: string,
): QmsrCrosswalkRow {
  const qmsrBasis = `21 CFR 820.10(c) → ISO 13485:2016 §${clause}`;
  return { id, title, iso13485Clause: clause, qmsrBasis, legacyQsr: `21 CFR 820.30(${para})`, basis: recall(qmsrBasis) };
}

export const QMSR_CROSSWALK: readonly QmsrCrosswalkRow[] = Object.freeze([
  {
    id: 'qms_general',
    title: 'Quality management system, documentation and records',
    iso13485Clause: '4',
    qmsrBasis: '21 CFR 820.10 → ISO 13485:2016 §4 (medical device file §4.2.3; control of records §4.2.5 with 21 CFR 820.35)',
    legacyQsr: '21 CFR 820.20, 820.40, 820.180, 820.181',
    basis: recall('21 CFR 820.10; 21 CFR 820.35; ISO 13485:2016 §4'),
  },
  {
    id: 'management',
    title: 'Management responsibility',
    iso13485Clause: '5',
    qmsrBasis: '21 CFR 820.10 → ISO 13485:2016 §5',
    legacyQsr: '21 CFR 820.20',
    basis: recall('21 CFR 820.10; ISO 13485:2016 §5'),
  },
  {
    id: 'resources',
    title: 'Resource management',
    iso13485Clause: '6',
    qmsrBasis: '21 CFR 820.10 → ISO 13485:2016 §6',
    legacyQsr: '21 CFR 820.25 (personnel), 820.70 (environment)',
    basis: recall('21 CFR 820.10; ISO 13485:2016 §6'),
  },
  {
    id: 'design_controls',
    title: 'Design and development',
    iso13485Clause: '7.3',
    qmsrBasis: '21 CFR 820.10(c) → ISO 13485:2016 §7.3',
    legacyQsr: '21 CFR 820.30',
    basis: {
      ref: '21 CFR 820.10(c) (design and development, ISO 13485:2016 clause 7.3 and its subclauses)',
      confidence: 'regulator-text',
      url: ECFR_820_10,
      checked: CHECKED,
      factId: QMSR_FACT_ID,
      note: `${SEARCH_EXTRACT}. Applies to class II and III devices and the class I devices listed in 820.10(c).`,
    },
  },
  {
    id: 'purchasing',
    title: 'Purchasing',
    iso13485Clause: '7.4',
    qmsrBasis: '21 CFR 820.10 → ISO 13485:2016 §7.4',
    legacyQsr: '21 CFR 820.50',
    basis: recall('21 CFR 820.10; ISO 13485:2016 §7.4'),
  },
  {
    id: 'production',
    title: 'Production and service provision',
    iso13485Clause: '7.5',
    qmsrBasis:
      '21 CFR 820.10 → ISO 13485:2016 §7.5; 21 CFR 820.45 (labeling and packaging controls); 21 CFR 820.35 (servicing records, ISO 13485:2016 §7.5.4)',
    legacyQsr:
      '21 CFR 820.60, 820.65 (identification, traceability), 820.70, 820.75 (production, process validation), 820.120, 820.130 (labeling, packaging), 820.200 (servicing)',
    basis: recall('21 CFR 820.10; 21 CFR 820.35; 21 CFR 820.45; ISO 13485:2016 §7.5'),
  },
  {
    id: 'measuring_equipment',
    title: 'Control of monitoring and measuring equipment',
    iso13485Clause: '7.6',
    qmsrBasis: '21 CFR 820.10 → ISO 13485:2016 §7.6',
    legacyQsr: '21 CFR 820.72',
    basis: recall('21 CFR 820.10; ISO 13485:2016 §7.6'),
  },
  {
    id: 'feedback_complaints',
    title: 'Feedback, complaint handling and reporting to regulatory authorities',
    iso13485Clause: '8.2',
    qmsrBasis:
      '21 CFR 820.10 → ISO 13485:2016 §8.2; 21 CFR 820.35 (complaint records, including any UDI); 21 CFR 803 (medical device reporting)',
    legacyQsr: '21 CFR 820.198',
    basis: {
      ref: '21 CFR 820.35 (records of complaints: device name, date received, any UDI or UPC)',
      confidence: 'regulator-text',
      url: ECFR_820_35,
      checked: CHECKED,
      factId: QMSR_FACT_ID,
      note: `${SEARCH_EXTRACT}. The ISO 13485:2016 §8.2 numbering is from the standard (recall).`,
    },
  },
  {
    id: 'nonconforming',
    title: 'Control of nonconforming product',
    iso13485Clause: '8.3',
    qmsrBasis: '21 CFR 820.10 → ISO 13485:2016 §8.3',
    legacyQsr: '21 CFR 820.90',
    basis: recall('21 CFR 820.10; ISO 13485:2016 §8.3'),
  },
  {
    id: 'capa',
    title: 'Corrective and preventive action',
    iso13485Clause: '8.5.2',
    qmsrBasis: '21 CFR 820.10 → ISO 13485:2016 §8.5.2 (corrective action), §8.5.3 (preventive action)',
    legacyQsr: '21 CFR 820.100',
    basis: recall('21 CFR 820.10; ISO 13485:2016 §8.5.2, §8.5.3'),
  },
  designElement('designPlan', 'Design and development planning', '7.3.2', 'b'),
  designElement('designInputs', 'Design and development inputs', '7.3.3', 'c'),
  designElement('designOutputs', 'Design and development outputs', '7.3.4', 'd'),
  designElement('designReviews', 'Design and development review', '7.3.5', 'e'),
  designElement('designVerification', 'Design and development verification', '7.3.6', 'f'),
  designElement('designValidation', 'Design and development validation', '7.3.7', 'g'),
  designElement('designTransfer', 'Design and development transfer', '7.3.8', 'h'),
  designElement('designChanges', 'Control of design and development changes', '7.3.9', 'i'),
  designElement('traceability', 'Design and development files', '7.3.10', 'j'),
]);

const BY_ID = new Map<string, QmsrCrosswalkRow>(QMSR_CROSSWALK.map((r) => [r.id, r]));

/** The crosswalk row for an id, or undefined. */
export function qmsrRow(id: string): QmsrCrosswalkRow | undefined {
  return BY_ID.get(id);
}

/**
 * True when `asOf` is a real calendar date written as YYYY-MM-DD. Delegates to
 * the one ISO-date rule in regulatory-basis.ts (its `checked` check) rather
 * than keeping a second copy of it here.
 */
function isIsoDate(asOf: string): boolean {
  return basisProblems({ ref: 'asOf', confidence: 'recall', checked: asOf }).length === 0;
}

/**
 * The citation in force on `asOf` (YYYY-MM-DD).
 *
 * On and after {@link QMSR_EFFECTIVE}: the QMSR basis, then the removed QSR
 * section as "formerly … (QSR, until 2026-02-01)". Before it: the QSR section
 * alone. Throws on an unknown id or a malformed date rather than guessing.
 */
export function citeQms(id: QmsrCrosswalkId, asOf: string): string {
  const row = BY_ID.get(id);
  if (!row) throw new Error(`citeQms: no QMSR crosswalk row "${String(id)}"`);
  if (typeof asOf !== 'string' || !isIsoDate(asOf)) {
    throw new Error(`citeQms: asOf "${String(asOf)}" is not a YYYY-MM-DD date`);
  }
  if (asOf < QMSR_EFFECTIVE) return row.legacyQsr;
  return `${row.qmsrBasis}; formerly ${row.legacyQsr} (QSR, until ${QSR_LAST_DAY})`;
}

/**
 * The QSR → QMSR transition note served with the QMS clause list. Built from
 * the constants above so the dates and section numbers have one home.
 */
export function qmsrTransitionNote(): string {
  return (
    `FDA QMSR (21 CFR 820, final rule FR 2024-01709) is in force from ${QMSR_EFFECTIVE} (currency fact ${QMSR_FACT_ID}). ` +
    '21 CFR 820.10 requires a quality management system that complies with ISO 13485:2016, incorporated by reference; ' +
    '21 CFR 820.35 adds record requirements (complaints, servicing, UDI) and 21 CFR 820.45 adds labeling and packaging controls. ' +
    `The QSR sections 820.20 to 820.250 are removed; the QSR applied until ${QSR_LAST_DAY}, and each clause names its former QSR section only as "formerly". ` +
    'The QMSR does not use the terms Design History File, Device Master Record or Device History Record. ' +
    'ISO 13485:2016 §4.2.3 (medical device file) and §7.3.10 (design and development files) are ISO clauses, not FDA terms.'
  );
}
