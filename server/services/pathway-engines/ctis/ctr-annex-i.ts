/**
 * EU CTR Annex I — the one record of what an initial clinical-trial application
 * dossier contains (Regulation (EU) No 536/2014, Annex I, headings B–R, plus
 * the Article 7(1)(h) biological-samples aspect of the Part II assessment).
 *
 * The CTIS readiness engine (`ctis-mapper.ts`) reads these rows and nothing
 * else: a slot exists because a row exists, and a slot is satisfied only by a
 * leaf filed at the row's `ctisSlug` or carrying one of its `documentTypes`.
 * There is no title or CTD-prefix guessing — a US CSR at 5.3.5.1 is not a
 * protocol, and an "Open-label" title is not IMP labelling.
 *
 * PART II IS PER MEMBER STATE. A Part II row is satisfied for state X only by a
 * leaf at `part-ii.<x>.<segment>` (the member state is carried in the slug —
 * DECISIONS.md #17 — so no schema change). The slug shape is already admitted
 * by the CTIS placement vocabulary (`shared/regulatory/placement-vocabulary.ts`,
 * SLUG regex).
 *
 * REQUIREMENT KINDS
 *   - required       absent → missing; cannot be recorded not-applicable.
 *   - if-applicable  absent → undetermined until filed or recorded
 *                    not-applicable. Blocks readiness, because "the sponsor did
 *                    not say" is not "it does not apply".
 *   - conditional    absent → reported for a human to confirm
 *                    (checkApplicability); does not block. Used where the
 *                    trigger is a fact about the trial (an AxMP is used, advice
 *                    was obtained, samples are stored) that a filing gap check
 *                    cannot see.
 *
 * BASIS. Each row says whether its wording was read from the EUR-Lex text
 * (checked 2026-10-05 via search of eur-lex.europa.eu; the host is blocked for
 * direct fetch here) or is recall. See
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-05-record/g-ctis-annex-i-readiness-facts.md.
 *
 * PURE DATA: no DB, no network, no LLM.
 *
 * @module server/services/pathway-engines/ctis/ctr-annex-i
 */

export const CTR_536_2014_URL = 'https://eur-lex.europa.eu/eli/reg/2014/536/oj/eng';

export type CtrAnnexIPart = 'I' | 'II';

export type CtrAnnexIRequirement =
  | { kind: 'required' }
  | { kind: 'if-applicable'; reason: string }
  | { kind: 'conditional'; reason: string };

export interface CtrAnnexIBasis {
  url: string;
  confidence: 'regulator-text' | 'recall';
  /** What was read (regulator-text) or what is remembered and owed a read (recall). */
  note: string;
}

export interface CtrAnnexIRow {
  /** Annex I heading letter, or 'Art 7(1)(h)' for the samples aspect. */
  letter: string;
  /** Stable slot id reported by the engine (and by assess_pathway_readiness). */
  id: string;
  title: string;
  part: CtrAnnexIPart;
  perMemberState: boolean;
  requirement: CtrAnnexIRequirement;
  /**
   * Canonical CTIS placement. Part I: the exact section code. Part II: the
   * state-less form; a leaf satisfies state X only at `part-ii.<x>.<segment>`.
   */
  ctisSlug: string;
  /**
   * Explicit document-type ids. Part I: a leaf of one of these types satisfies
   * the row wherever it is filed. Part II: the type identifies the document but
   * cannot say which Member State it is for, so unless the leaf is also at
   * `part-ii.<x>.<segment>` it makes the row undetermined for every state —
   * never present.
   */
  documentTypes: readonly string[];
  basis: CtrAnnexIBasis;
}

const textBasis = (note: string): CtrAnnexIBasis => ({ url: CTR_536_2014_URL, confidence: 'regulator-text', note });
const recallBasis = (note: string): CtrAnnexIBasis => ({ url: CTR_536_2014_URL, confidence: 'recall', note });

const REQUIRED: CtrAnnexIRequirement = { kind: 'required' };

export const CTR_ANNEX_I: readonly CtrAnnexIRow[] = [
  // ── Part I (assessed jointly by the Member States concerned) ───────────────
  {
    letter: 'B', id: 'cover-letter', title: 'Cover letter', part: 'I', perMemberState: false,
    requirement: REQUIRED, ctisSlug: 'part-i.cover-letter', documentTypes: ['cover_letter'],
    basis: recallBasis('Annex I heading B "Cover letter". Heading wording from recall; not read in this change.'),
  },
  {
    letter: 'C', id: 'eu-application-form', title: 'EU application form', part: 'I', perMemberState: false,
    requirement: REQUIRED, ctisSlug: 'part-i.eu-application-form', documentTypes: ['eu_application_form'],
    basis: recallBasis('Annex I heading C "EU application form" (structured data in CTIS). Recall; a Form FDA 356h is not it.'),
  },
  {
    letter: 'D', id: 'protocol', title: 'Protocol', part: 'I', perMemberState: false,
    requirement: REQUIRED, ctisSlug: 'part-i.protocol', documentTypes: ['clinical_protocol', 'protocol'],
    basis: recallBasis('Annex I heading D "Protocol". Recall. A protocol annex (part-i.protocol.annex) is not the protocol.'),
  },
  {
    letter: 'E', id: 'investigators-brochure', title: "Investigator's brochure", part: 'I', perMemberState: false,
    requirement: REQUIRED, ctisSlug: 'part-i.investigators-brochure', documentTypes: ['investigator_brochure'],
    basis: recallBasis(
      "Annex I heading E \"Investigator's brochure\". Recall: where the IMP is authorised and used within its " +
        'authorisation, the SmPC serves as the IB — file it at this slug; an SmPC is not accepted here by type alone.',
    ),
  },
  {
    letter: 'F', id: 'gmp-manufacturing', title: 'Documentation relating to compliance with GMP for the IMP', part: 'I', perMemberState: false,
    requirement: {
      kind: 'if-applicable',
      reason: 'Annex I F: no documentation is needed where the IMP is authorised and not modified. Record not-applicable only in that case.',
    },
    ctisSlug: 'part-i.gmp-manufacturing', documentTypes: ['gmp', 'manufacturing_authorisation', 'qp_declaration'],
    basis: textBasis(
      'Annex I F: "No documentation needs to be submitted where the investigational medicinal product is authorised ' +
        'and is not modified, whether or not it is manufactured in the Union." Heading wording itself from recall.',
    ),
  },
  {
    letter: 'G', id: 'impd-quality', title: 'IMPD — quality data', part: 'I', perMemberState: false,
    requirement: REQUIRED, ctisSlug: 'part-i.impd-quality', documentTypes: ['impd_quality'],
    basis: recallBasis(
      'Annex I G "Investigational medicinal product dossier" — quality part. Recall. A CTD Module 3 section is ' +
        'not an IMPD-Q by position; the simplified dossier for authorised IMPs is filed at this slug.',
    ),
  },
  {
    letter: 'G', id: 'impd-safety-efficacy', title: 'IMPD — non-clinical and clinical (safety and efficacy) data', part: 'I', perMemberState: false,
    requirement: REQUIRED, ctisSlug: 'part-i.impd-safety-efficacy', documentTypes: ['impd_safety_efficacy'],
    basis: recallBasis(
      'Annex I G — safety and efficacy part. Recall: this part may cross-refer to the IB instead of repeating it; ' +
        'the cross-reference is still filed at this slug. A CTD Module 2/4/5 section is not an IMPD-S&E.',
    ),
  },
  {
    letter: 'H', id: 'auxiliary-medicinal-products', title: 'Auxiliary medicinal product dossier', part: 'I', perMemberState: false,
    requirement: { kind: 'conditional', reason: 'Only where the trial uses an auxiliary medicinal product that is not authorised (recall).' },
    ctisSlug: 'part-i.auxiliary-medicinal-products', documentTypes: ['auxiliary_medicinal_product'],
    basis: recallBasis('Annex I heading H "Auxiliary medicinal product dossier" and its trigger, from recall.'),
  },
  {
    letter: 'I', id: 'scientific-advice', title: 'Scientific advice', part: 'I', perMemberState: false,
    requirement: { kind: 'conditional', reason: 'Only where scientific advice on the trial was obtained (recall).' },
    ctisSlug: 'part-i.scientific-advice', documentTypes: ['scientific_advice'],
    basis: recallBasis('Annex I heading I "Scientific advice and paediatric investigation plan", from recall.'),
  },
  {
    letter: 'I', id: 'paediatric-investigation-plan', title: 'Paediatric investigation plan decision', part: 'I', perMemberState: false,
    requirement: { kind: 'conditional', reason: 'Only where the trial is part of an agreed PIP (recall).' },
    ctisSlug: 'part-i.paediatric-investigation-plan', documentTypes: ['pip', 'pip_decision'],
    basis: recallBasis('Annex I heading I, PIP part, from recall.'),
  },
  {
    letter: 'J', id: 'labelling', title: 'Content of the labelling of the IMP', part: 'I', perMemberState: false,
    requirement: REQUIRED, ctisSlug: 'part-i.labelling', documentTypes: ['imp_labelling'],
    basis: recallBasis('Annex I heading J (labelling per Annex VI), from recall. Commercial product labelling is not IMP labelling.'),
  },

  // ── Part II (assessed by each Member State concerned for its territory) ─────
  {
    letter: 'K', id: 'recruitment-arrangements', title: 'Recruitment arrangements', part: 'II', perMemberState: true,
    requirement: { kind: 'if-applicable', reason: 'Annex I K: a separate document is needed unless the recruitment procedures are described in the protocol.' },
    ctisSlug: 'part-ii.recruitment-arrangements', documentTypes: ['recruitment_arrangements'],
    basis: textBasis(
      'Annex I K "Recruitment arrangements (information per Member State concerned)": a separate document shall describe ' +
        'the procedures for inclusion of subjects and the first act of recruitment, unless described in the protocol.',
    ),
  },
  {
    letter: 'L', id: 'subject-information-consent', title: 'Subject information, informed consent form and procedure', part: 'II', perMemberState: true,
    requirement: REQUIRED, ctisSlug: 'part-ii.subject-information', documentTypes: ['informed_consent', 'subject_information'],
    basis: textBasis(
      'Annex I L "Subject information, informed consent form and informed consent procedure (information per Member State concerned)".',
    ),
  },
  {
    letter: 'M', id: 'investigator-suitability', title: 'Suitability of the investigator', part: 'II', perMemberState: true,
    requirement: REQUIRED, ctisSlug: 'part-ii.investigator-suitability', documentTypes: ['investigator_cv', 'investigator_suitability'],
    basis: recallBasis('Annex I heading M "Suitability of the investigator (information per Member State concerned)", from recall.'),
  },
  {
    letter: 'N', id: 'facilities-suitability', title: 'Suitability of the facilities', part: 'II', perMemberState: true,
    requirement: REQUIRED, ctisSlug: 'part-ii.facilities-suitability', documentTypes: ['facility_suitability'],
    basis: textBasis('Annex I N "Suitability of the facilities (information per Member State concerned)" — heading only.'),
  },
  {
    letter: 'O', id: 'insurance', title: 'Proof of insurance cover or indemnification', part: 'II', perMemberState: true,
    requirement: { kind: 'if-applicable', reason: 'Annex I O: proof of insurance, a guarantee or a similar arrangement is submitted "if applicable".' },
    ctisSlug: 'part-ii.insurance', documentTypes: ['insurance'],
    basis: textBasis(
      'Annex I O "Proof of insurance cover or indemnification (information per Member State concerned)": proof of insurance, ' +
        'a guarantee, or a similar arrangement shall be submitted, if applicable.',
    ),
  },
  {
    letter: 'P', id: 'financial-arrangements', title: 'Financial and other arrangements', part: 'II', perMemberState: true,
    requirement: REQUIRED, ctisSlug: 'part-ii.financial-arrangements', documentTypes: ['financial_arrangement', 'compensation'],
    basis: textBasis(
      'Annex I P "Financial and other arrangements (information per Member State concerned)": financing, financial transactions ' +
        'and compensation paid to subjects and investigator/site, and any other sponsor–site agreement.',
    ),
  },
  {
    letter: 'Q', id: 'fee-payment', title: 'Proof of payment of fee', part: 'II', perMemberState: true,
    requirement: { kind: 'if-applicable', reason: 'Annex I Q: proof of payment is submitted "if applicable". Which states charge a fee is recall, not modelled.' },
    ctisSlug: 'part-ii.fee-payment', documentTypes: ['fee_payment'],
    basis: textBasis('Annex I Q "Proof of payment of fee (information per Member State concerned)": proof of payment shall be submitted, if applicable.'),
  },
  {
    letter: 'R', id: 'data-protection', title: 'Proof that data will be processed in compliance with Union data-protection law', part: 'II', perMemberState: true,
    requirement: REQUIRED, ctisSlug: 'part-ii.data-protection', documentTypes: ['data_protection'],
    basis: textBasis(
      'Annex I R: a statement by the sponsor or his or her representative that data will be collected and processed in ' +
        'accordance with Directive 95/46/EC shall be provided (now read as Regulation (EU) 2016/679 — recall).',
    ),
  },
  {
    letter: 'Art 7(1)(h)', id: 'biological-samples', title: 'Collection, storage and future use of biological samples', part: 'II', perMemberState: true,
    requirement: { kind: 'conditional', reason: 'Only where the trial collects biological samples (Art 7(1)(h)).' },
    ctisSlug: 'part-ii.biological-samples', documentTypes: ['biological_samples'],
    basis: textBasis(
      'Article 7(1)(h): the Part II assessment covers compliance with the applicable rules for the collection, storage and ' +
        'future use of biological samples of the subject.',
    ),
  },
];

export const CTR_ANNEX_I_PART_I: readonly CtrAnnexIRow[] = CTR_ANNEX_I.filter((r) => r.part === 'I');
export const CTR_ANNEX_I_PART_II: readonly CtrAnnexIRow[] = CTR_ANNEX_I.filter((r) => r.part === 'II');

/** The slot segment of a Part II row: `part-ii.subject-information` → `subject-information`. */
export function partIISegment(row: CtrAnnexIRow): string {
  return row.ctisSlug.slice('part-ii.'.length);
}
