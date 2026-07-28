/**
 * The one place that decides what regulatory document class a project implies.
 *
 * ── Why this is its own module ────────────────────────────────────────────────
 * Two independent paths need the same answer:
 *
 *   • scaffoldProjectDocuments()  — creates a project's governed document when
 *                                   the project itself is created.
 *   • POST /api/authoring/docs    — binds a newly authored document to the
 *                                   governed document of the project it belongs
 *                                   to, so authoring and filing share one
 *                                   system of record instead of drifting apart.
 *
 * These mappings decide whether a document is an IND or a 510(k), and which
 * agency's rule pack governs it. Two copies of that judgement is exactly the
 * duplication this platform is being cleaned of — and the failure mode is not
 * cosmetic: one copy learning a new program type while the other does not means
 * the same project produces a governed document down one path and an unbound
 * one down the other.
 *
 * ── Fail closed, always ───────────────────────────────────────────────────────
 * Both maps are deliberately partial. Returning `null` for an unmapped input is
 * the correct outcome and callers must handle it by declining to bind, never by
 * substituting a near neighbour: filing a 510(k) as a PMA, or a device
 * submission under the wrong agency, is a worse outcome than an unbound
 * document that says so.
 */

/**
 * program_type (lowercase, as projects.ts normalises it) → c2c_documents.doc_type.
 *
 * Deliberately partial. ivd / device / ide / biologic / anda are accepted by
 * VALID_PROGRAM_TYPES but have no doc_type CHECK value and no seeded rule pack.
 * They fail closed rather than being mapped to a near neighbour.
 */
export const PROGRAM_TO_DOC_TYPE: Readonly<Record<string, string>> = {
  ind: 'ind', cta: 'cta', nda: 'nda', bla: 'bla', maa: 'maa', jnda: 'jnda',
  '510k': 'k510', de_novo: 'denovo', pma: 'pma', cer: 'cer',
};

/**
 * primary_agency → c2c_documents.agency CHECK value.
 *
 * NOT derived from shared/regulatory/document-taxonomy.ts: its Agency union
 * includes Swissmedic, ANVISA, CDSCO, HSA, ISO, IEC and IMDRF, none of which
 * passes c2c_documents_agency_check. Mapping through it would produce a
 * constraint violation at insert time.
 */
export const AGENCY_TO_CODE: Readonly<Record<string, string>> = {
  FDA: 'fda', EMA: 'ema', PMDA: 'pmda', MHRA: 'mhra', ICH: 'ich',
  TGA: 'tga', NMPA: 'nmpa', MFDS: 'mfds', HC: 'hc', HEALTH_CANADA: 'hc',
};

/** Agencies to try, in order, when the project's own agency has no rule pack. */
export const AGENCY_FALLBACKS = ['ich', 'fda'] as const;

export interface DocumentClass {
  docType: string;
  agency: string;
}

/**
 * Resolve a project's (program_type, primary_agency) to a governed document
 * class, or null when either side is unmapped.
 *
 * The agency key is normalised the way the wizard sends it — 'Health Canada',
 * 'health-canada' and 'HEALTH_CANADA' all reach the same entry.
 */
export function resolveDocumentClass(
  programType: string | null | undefined,
  primaryAgency: string | null | undefined,
): DocumentClass | null {
  if (!programType || !primaryAgency) return null;

  const docType = PROGRAM_TO_DOC_TYPE[String(programType).trim().toLowerCase()];
  const agency = AGENCY_TO_CODE[
    String(primaryAgency).trim().toUpperCase().replace(/[\s-]+/g, '_')
  ];

  if (!docType || !agency) return null;
  return { docType, agency };
}

/** Human-readable reason a binding was declined, for surfacing to the caller. */
export function describeUnmappedClass(
  programType: string | null | undefined,
  primaryAgency: string | null | undefined,
): string {
  if (!programType) return 'The project has no program type, so no document class can be derived.';
  if (!primaryAgency) return 'The project has no primary agency, so no document class can be derived.';
  if (!PROGRAM_TO_DOC_TYPE[String(programType).trim().toLowerCase()]) {
    return `No document class is defined for program type '${programType}'.`;
  }
  return `No document agency is defined for '${primaryAgency}'.`;
}
