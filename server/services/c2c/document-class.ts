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
 * Still deliberately partial. ivd / device / biologic remain unmapped, and that
 * is a product decision rather than a gap: none of the three names a pathway.
 * "device" could be a 510(k), a De Novo, a PMA or an IDE, and those are four
 * different submissions with four different outlines — guessing one would file a
 * customer's product down the wrong pathway, which is materially worse than
 * declining. They fail closed until the wizard asks the question that resolves
 * them.
 *
 * anda and ide were in that list for the wrong reason: they name their pathway
 * exactly, and were unmapped only because no CHECK value and no pack existed.
 * migrations/20260806b supplies both, so they are mapped here.
 */
export const PROGRAM_TO_DOC_TYPE: Readonly<Record<string, string>> = {
  ind: 'ind', cta: 'cta', nda: 'nda', anda: 'anda', bla: 'bla', maa: 'maa', jnda: 'jnda',
  '510k': 'k510', de_novo: 'denovo', pma: 'pma', ide: 'ide', cer: 'cer',
  // EU MDR / IVDR technical documentation. Mapped for the same reason anda and
  // ide are and device/ivd are not: each names ONE dossier structure, enumerated
  // by the Regulation itself (MDR Annex II+III, IVDR Annex II+III). There is
  // nothing to guess. migrations/20260810b supplies both packs.
  mdr: 'mdr', ivdr: 'ivdr',
  // A DMF / ASMF is 3.2.S (+3.2.A/3.2.R) content: the harmonised Module 3 pack
  // is its honest outline. It resolves through AGENCY_FALLBACKS to mod3:ich
  // because no agency seeds a dmf-specific pack — the ICH baseline is the right
  // claim for a master file whose applicant's part maps to 3.2.S per ICH M4Q.
  dmf: 'mod3',
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

/**
 * Agencies to try, in order, when the project's own agency has no rule pack.
 *
 * ── Why 'fda' is NOT in this list ─────────────────────────────────────────────
 * It used to be, and it made this module violate the rule stated at the top of
 * this file. No rule pack exists for hc, nmpa, tga or mfds, so a Health Canada
 * NDS fell through to the FDA pack — and scaffold-project-documents.ts:158
 * writes the RESOLVED agency into c2c_documents, not the project's. The customer
 * got a document row asserting `agency: 'fda'`, bound to `ich-m4-v2.1`, titled
 * "<product> — NDA × FDA · 505(b)(1) · eCTD M1–M5", with 71 US sections, while
 * their programme said Health Canada. Same for China and Australia — an 8-item
 * TGA clinical trial notification was served as a 71-section US marketing
 * application.
 *
 * That is exactly the near-neighbour substitution the header forbids, and in a
 * Part 11 table it is worse than a wrong outline: the record itself states the
 * wrong agency. Removing 'fda' turns those cases into NO_RULE_PACK — visible,
 * honest, and no artifact to mistake for a real dossier.
 *
 * 'ich' stays. ICH is not a jurisdiction; it is the harmonised CTD parent, and a
 * document bound to it is honest about being the neutral baseline rather than
 * some other country's submission.
 *
 * This costs US filings nothing. The caller iterates `[agency, ...FALLBACKS]`,
 * so an FDA project matches 'fda' on the first pass and never reaches here.
 */
export const AGENCY_FALLBACKS = ['ich'] as const;

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
