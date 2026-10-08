/**
 * What a Data Room capture IS, found by rule, never guessed (D2, Data Room
 * catalog S3; docs/design/DATA_ROOM_CATALOG_AND_CLINICAL_DATA_2026-10-08.md).
 *
 * cre_evidence_sources has had columns for product, indication, phase,
 * application, agency, trial registry id and document date since the spine,
 * and no Data Room writer ever filled one. So a project's evidence could not
 * be told apart by study, registry or data cut, and an author could not tell
 * an interim CSR from the final one.
 *
 * Two deterministic sources, each value carrying where it came from:
 *   - the PROJECT: product, indication, phase, application and agency are the
 *     project's own record (regulatory_programs), stated once there;
 *   - the TEXT: registry identifiers, the protocol number, a labelled
 *     document date and a data cut-off (the "data cut-off", "database lock"
 *     or "data lock point" the document states), each by a narrow rule that
 *     needs its label. A bare date or number is never taken for one of these.
 *     Every finding records the rule and the character offset it matched at
 *     (`catalog_evidence`), so a reviewer can turn to it.
 *
 * Nothing here writes; recordSourceProcessing does, and fills a field only
 * where it is empty.
 */

/** A value found in the text, with the rule and the offset it was found at. */
export interface Finding<T = string> {
  value: T;
  rule: string;
  offset: number;
  /** The text the rule matched, as it appears (bounded). */
  matched: string;
}

export interface TextFacts {
  /** Every registry identifier found, in document order, de-duplicated. */
  registryIds: Finding[];
  protocolNumber: Finding | null;
  /** ISO dates (YYYY-MM-DD). */
  documentDate: Finding | null;
  dataCutDate: Finding | null;
}

/** How far into the text the title-page rules look: the facts are on the first pages. */
const TITLE_SCAN = 20_000;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
/** The date shapes a regulatory title page uses. */
const DATE = `(\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[ -]${MONTH}[ ,-]*\\d{4}|${MONTH} \\d{1,2},? \\d{4}|\\d{1,2}${MONTH}\\d{4})`;

/** A real calendar date as YYYY-MM-DD, or null (31 February is not a date). */
export function isoDate(raw: string): string | null {
  const s = raw.trim();
  let y: number; let m: number; let d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  const dmy = new RegExp(`^(\\d{1,2})[ -]?${MONTH}[ ,-]*(\\d{4})$`, 'i').exec(s);
  const mdy = new RegExp(`^${MONTH} (\\d{1,2}),? (\\d{4})$`, 'i').exec(s);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [y, m, d] = [Number(dmy[3]), MONTHS[dmy[2].slice(0, 3).toLowerCase()], Number(dmy[1])];
  else if (mdy) [y, m, d] = [Number(mdy[3]), MONTHS[mdy[1].slice(0, 3).toLowerCase()], Number(mdy[2])];
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  if (y < 1950 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Registries a clinical document cites, each with its own identifier shape. */
const REGISTRY_RULES: Array<{ rule: string; re: RegExp; group: number }> = [
  { rule: 'clinicaltrials.gov NCT', re: /\bNCT\d{8}\b/g, group: 0 },
  // EU CT (CTIS) and EudraCT numbers look like dates and dose ranges, so the label is required.
  { rule: 'EU CT / CTIS, labelled', re: /\b(?:EU\s*CT|CTIS)(?:\s*(?:No\.?|Number))?\s*[:#]?\s*(\d{4}-\d{6}-\d{2}-\d{2})\b/gi, group: 1 },
  { rule: 'EudraCT, labelled', re: /\bEudraCT(?:\s*(?:No\.?|Number))?\s*[:#]?\s*(\d{4}-\d{6}-\d{2})\b/gi, group: 1 },
  { rule: 'ISRCTN', re: /\bISRCTN\d{8}\b/g, group: 0 },
  { rule: 'ANZCTR', re: /\bACTRN\d{14}\b/g, group: 0 },
  { rule: 'jRCT', re: /\bjRCT\d{10}\b/g, group: 0 },
  { rule: 'ChiCTR', re: /\bChiCTR\d{10,}\b/g, group: 0 },
];

function registryIds(text: string): Finding[] {
  const out: Finding[] = [];
  const seen = new Set<string>();
  for (const r of REGISTRY_RULES) {
    for (const m of text.matchAll(r.re)) {
      const value = m[r.group];
      if (seen.has(value)) continue;
      seen.add(value);
      out.push({ value, rule: r.rule, offset: (m.index ?? 0) + m[0].indexOf(value), matched: m[0].slice(0, 80) });
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

/** The first match of a labelled pattern in the title-page window. */
function labelled(text: string, rule: string, re: RegExp, valueOf: (m: RegExpExecArray) => string | null): Finding | null {
  const m = re.exec(text.slice(0, TITLE_SCAN));
  if (!m) return null;
  const value = valueOf(m);
  return value ? { value, rule, offset: m.index, matched: m[0].slice(0, 120) } : null;
}

/** Every text fact the rules find. Pure; the same text gives the same facts. */
export function findTextFacts(text: string | null): TextFacts {
  if (!text) return { registryIds: [], protocolNumber: null, documentDate: null, dataCutDate: null };
  return {
    registryIds: registryIds(text),
    protocolNumber: labelled(
      text, 'labelled protocol number',
      /\bProtocol\s+(?:No\.?|Number|ID|Identifier|Code)\s*[:#]?\s*([A-Z0-9][A-Z0-9._/-]{2,30}[A-Z0-9])/i,
      m => m[1],
    ),
    documentDate: labelled(
      text, 'labelled document date',
      new RegExp(`\\b(?:Document|Version|Report|Issue|Release)\\s+Date\\s*[:\\-]?\\s*${DATE}`, 'i'),
      m => isoDate(m[1]),
    ),
    dataCutDate: labelled(
      text, 'labelled data cut-off',
      new RegExp(`\\b(?:data\\s*cut-?\\s*off|database\\s+lock|data\\s+lock\\s+point)(?:\\s+date)?\\s*(?:[:\\-]|was|of|on)?\\s*(?:was|of|on)?\\s*${DATE}`, 'i'),
      m => isoDate(m[1]),
    ),
  };
}

/** The project facts a capture inherits: the project's own record, stated once there. */
export interface ProgramFacts {
  product: string | null;
  indication: string | null;
  phase: string | null;
  applicationType: string | null;
  applicationNumber: string | null;
  agency: string | null;
}

type Exec = { query: (text: string, params?: unknown[]) => Promise<{ rows: any[] }> };

/** The project's facts, read org-scoped; null when the project is not the organization's. */
export async function readProgramFacts(exec: Exec, orgId: number, programId: string): Promise<ProgramFacts | null> {
  const { rows } = await exec.query(
    `SELECT product_name, indication, phase, program_type, application_number, primary_agency
       FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
    [programId, orgId],
  );
  const r = rows[0];
  if (!r) return null;
  const t = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    product: t(r.product_name), indication: t(r.indication), phase: t(r.phase),
    applicationType: t(r.program_type), applicationNumber: t(r.application_number), agency: t(r.primary_agency),
  };
}

/**
 * The project's study this capture is about: the one study of THIS project
 * whose protocol id or study id the document names. Exactly one, or none:
 * two candidates are named in the evidence and neither is chosen, and a study
 * of another project is never considered.
 */
export async function matchStudy(
  exec: Exec,
  orgId: number,
  programId: string,
  facts: TextFacts,
): Promise<{ studyRef: number | null; candidates: Array<{ id: number; studyId: string; protocolId: string }> }> {
  const keys = [facts.protocolNumber?.value, ...facts.registryIds.map(f => f.value)].filter((k): k is string => Boolean(k));
  if (keys.length === 0) return { studyRef: null, candidates: [] };
  const { rows } = await exec.query(
    `SELECT id, study_id, protocol_id FROM cdisc_prm_studies
      WHERE tenant_id = $1 AND program_id = $2
        AND (upper(protocol_id) = ANY($3::text[]) OR upper(study_id) = ANY($3::text[]))
      ORDER BY id LIMIT 3`,
    [orgId, programId, keys.map(k => k.toUpperCase())],
  );
  const candidates = rows.map(r => ({ id: Number(r.id), studyId: String(r.study_id), protocolId: String(r.protocol_id) }));
  return { studyRef: candidates.length === 1 ? candidates[0].id : null, candidates };
}
