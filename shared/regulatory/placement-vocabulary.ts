/**
 * Which section-code vocabulary a submission's placements use.
 *
 * ── The problem this solves ──────────────────────────────────────────────────
 *
 * `upsertLeaf` is the one choke point every placement funnels through — the
 * REST route, AnA's `place_into_sequence`, IND-lifecycle persistence and CMC
 * placement all reach it — and it ran every section code through the CTD
 * normaliser:
 *
 *     Section code "estar.device-description" does not name a CTD section a
 *     document can be filed at. Use a CTD section code — for example 1.2,
 *     2.7.3 or 3.2.S.4.2
 *
 * That gate is correct for an eCTD sequence and was written for a real defect:
 * an unconstrained code became a FOLDER NAME and a package shipped with a
 * top-level `mm/m1-us-1-2/` directory. But a 510(k) does not file on CTD
 * headings and an IRB package does not file on anything numbered at all, so
 * the gate refused two whole submission types rather than only refusing bad
 * codes.
 *
 * The fix is not to loosen the gate. It is to make the VOCABULARY a property
 * of the submission type, so each type is validated against its own, strictly.
 * `submissions.applicationType` already exists and
 * `BACKBONE_FOR_APPLICATION` in the biostatistics bridge already maps
 * application types onto eCTD / eSTAR / CTIS — this reads that same shape
 * rather than declaring a second one.
 *
 * ── Closed list where we own the vocabulary, shape rule where we do not ──────
 *
 * The CTD gate's own docstring explains why it checks code SHAPE and not
 * membership of a published heading list: four codes this product itself
 * writes (m1.5, m1.7, m1.9, m1.13) are absent from FDA's published Module 1
 * table, so a membership gate would refuse the product's own filings. The same
 * reasoning applies to eSTAR and CTIS, whose published section sets are not
 * vendored in this repository and cannot be verified from here. Those two get
 * a shape rule.
 *
 * The IRB slots are different: they are a PRODUCT vocabulary, defined by
 * `docs/design/IRB_SUBMISSION.md` and by nobody else, so membership is
 * checkable and is checked. A misspelled IRB slot is refused by name.
 *
 * @module shared/regulatory/placement-vocabulary
 */

import { normalizeCtdCode } from './section-code';

/** The vocabularies a submission's section codes can be drawn from. */
export type PlacementVocabulary = 'ctd' | 'estar' | 'ctis' | 'irb';

export const PLACEMENT_VOCABULARIES: readonly PlacementVocabulary[] = ['ctd', 'estar', 'ctis', 'irb'] as const;

/**
 * Application type → vocabulary. Deliberately DEFAULTS TO `ctd`: every
 * submission that exists today files on CTD headings, and an unrecognised or
 * absent application type must behave exactly as it did before this module
 * existed. A new type that needs a different vocabulary is added here, never
 * inferred.
 */
const VOCABULARY_BY_APPLICATION: Record<string, PlacementVocabulary> = {
  ind: 'ctd', nda: 'ctd', bla: 'ctd', anda: 'ctd', maa: 'ctd', aada: 'ctd',
  '510k': 'estar', '510(k)': 'estar', de_novo: 'estar', 'de-novo': 'estar', pma: 'estar',
  cta: 'ctis',
  irb: 'irb', iec: 'irb', 'irb-submission': 'irb',
};

/**
 * The vocabulary for an application type. Unknown, empty and null all give
 * `ctd`, which is the behaviour every existing caller already relies on.
 */
export function vocabularyForApplicationType(applicationType: string | null | undefined): PlacementVocabulary {
  const key = typeof applicationType === 'string' ? applicationType.trim().toLowerCase() : '';
  return VOCABULARY_BY_APPLICATION[key] ?? 'ctd';
}

// ─── The IRB artifact slots ──────────────────────────────────────────────────

/**
 * The slots an IRB package is assembled from (`docs/design/IRB_SUBMISSION.md`,
 * step 3). This is a closed list because this product defines it: there is no
 * published IRB section taxonomy to be out of step with, and a typo in a slot
 * name would otherwise become a folder in an assembled package exactly as a
 * bad CTD code once did.
 *
 * Grounded in what an IRB actually reviews: 21 CFR 56.115(a)(1) (the protocol
 * and consent documents the board keeps on file), 21 CFR 50.25 (the consent
 * elements), 45 CFR 46.116 (assent and the key-information summary),
 * 21 CFR 312.53(c) (the 1572 and the investigator's qualifications) and
 * 21 CFR 54 (financial disclosure).
 */
export const IRB_SLOTS = {
  'irb.protocol': 'Protocol (the version submitted, pinned)',
  'irb.investigator-brochure': "Investigator's Brochure",
  'irb.consent': 'Informed consent form',
  'irb.assent': 'Assent form (children)',
  'irb.hipaa-authorization': 'HIPAA authorization',
  'irb.recruitment-material': 'Recruitment and advertising material',
  'irb.subject-facing-material': 'Other subject-facing material (diaries, instructions)',
  'irb.investigator-cv': "Investigator's curriculum vitae",
  'irb.investigator-licence': "Investigator's licence or credential",
  'irb.form-1572': 'Form FDA 1572 (IND studies)',
  'irb.financial-disclosure': 'Financial disclosure (21 CFR 54)',
  'irb.safety-monitoring-plan': 'Data and safety monitoring plan',
  'irb.site-documentation': 'Site documentation',
  'irb.laboratory-certification': 'Laboratory certification',
  'irb.budget-and-agreement': 'Budget and clinical trial agreement',
  'irb.application-form': "The board's own application form",
  'irb.other': 'Other supporting material',
} as const;

export type IrbSlot = keyof typeof IRB_SLOTS;

export const IRB_SLOT_CODES: readonly IrbSlot[] = Object.keys(IRB_SLOTS).sort() as IrbSlot[];

export function isIrbSlot(code: string): code is IrbSlot {
  return Object.prototype.hasOwnProperty.call(IRB_SLOTS, code);
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface SectionCodeVerdict {
  ok: boolean;
  /**
   * The vocabulary the code was judged against, so a caller can say which one
   * refused it rather than reporting a generic failure.
   */
  vocabulary: PlacementVocabulary;
  /**
   * The canonical spelling, for a packager deriving a layout. The STORED value
   * is always the caller's spelling — readers match on what was written (the
   * IND checklist looks for `m1.1.1`), so canonicalising on write would detach
   * them from their own rows.
   */
  canonical?: string;
  /** Why it was refused, naming the vocabulary and giving real examples. */
  message?: string;
}

/** Kebab-case slug: lowercase letters and digits, hyphen-separated, optionally dotted. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/**
 * Judge a section code against a vocabulary.
 *
 * The CTD branch is byte-for-byte the rule `upsertLeaf` already applied, so an
 * eCTD sequence behaves exactly as it did: `normalizeCtdCode` must recognise
 * it, and it must contain a dot, because a bare module is a CONTAINER and not
 * a place a document can go.
 */
export function validateSectionCode(raw: string, vocabulary: PlacementVocabulary): SectionCodeVerdict {
  const code = (raw ?? '').trim();
  if (!code) {
    return { ok: false, vocabulary, message: 'A section code is required; it decides where the document is filed.' };
  }
  switch (vocabulary) {
    case 'ctd':
      return ctdVerdict(code);
    case 'irb':
      return irbVerdict(code);
    default:
      return slugVerdict(code, vocabulary);
  }
}

function ctdVerdict(code: string): SectionCodeVerdict {
  const canonical = normalizeCtdCode(code);
  if (canonical === null || !canonical.includes('.')) {
    return {
      ok: false,
      vocabulary: 'ctd',
      message:
        `Section code "${code}" does not name a CTD section a document can be filed at. ` +
        `Use a CTD section code — for example 1.2, 2.7.3 or 3.2.S.4.2 — since it decides where the ` +
        `document is filed in the package. A bare module number is a container, not a section.`,
    };
  }
  return { ok: true, vocabulary: 'ctd', canonical };
}

/**
 * Membership, not shape. The slot list is this product's own, so a code that
 * is not on it is a mistake we can name — and naming it is the difference
 * between a refused write and a folder called `irb.conset` in a package that
 * went to a review board.
 */
function irbVerdict(code: string): SectionCodeVerdict {
  const lower = code.toLowerCase();
  if (!isIrbSlot(lower)) {
    return {
      ok: false,
      vocabulary: 'irb',
      message:
        `Section code "${code}" is not an IRB package slot. Use one of: ${IRB_SLOT_CODES.join(', ')}. ` +
        `Unlike the CTD and eSTAR vocabularies this list is closed, because this platform defines it.`,
    };
  }
  return { ok: true, vocabulary: 'irb', canonical: lower };
}

/**
 * Shape only, for eSTAR and CTIS.
 *
 * Their published section sets are not vendored in this repository and cannot
 * be verified from here, and the CTD gate's own docstring records what happens
 * when a membership gate outruns the list behind it: four codes this product
 * writes are absent from FDA's published Module 1 table. A shape rule refuses
 * the defect that actually occurred — a path fragment or free text becoming a
 * folder name — without pretending to a completeness this repository has not
 * earned.
 */
function slugVerdict(code: string, vocabulary: PlacementVocabulary): SectionCodeVerdict {
  const lower = code.toLowerCase();
  if (!SLUG.test(lower)) {
    const examples =
      vocabulary === 'estar'
        ? 'device-description, clinical-performance-testing, estar.clinical-investigations'
        : 'part-i.protocol, part-ii.subject-information';
    return {
      ok: false,
      vocabulary,
      message:
        `Section code "${code}" is not a ${vocabulary.toUpperCase()} section identifier. ` +
        `Use a hyphenated identifier — for example ${examples}. ` +
        `Slashes, spaces and punctuation are refused because this value becomes a folder in the assembled package; ` +
        `capitals are accepted and lower-cased, the same way a CTD code is canonicalised for layout while stored as written. ` +
        `This checks the code's SHAPE, not membership of a published section list: the ${vocabulary.toUpperCase()} ` +
        `section set is not vendored here, so a membership check would refuse codes it simply does not know.`,
    };
  }
  return { ok: true, vocabulary, canonical: lower };
}
