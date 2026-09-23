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
 * The CTD gate checks code SHAPE, not membership of a published heading list,
 * and the reason is about what this repository can check rather than about
 * what FDA publishes. The only machine-readable Module 1 vocabulary vendored
 * here is `server/services/ectd/controlled-vocab/cv-v4-data.ts`, and it
 * enumerates LEAF Contexts of Use only — `us_1.5.1`, `us_1.7.1`, `us_1.9.1`,
 * `us_1.13.1` … — with no entry for the heading nodes those leaves hang from.
 * This product writes heading-level codes: `ind-document-renderer.ts` and
 * `ind-lifecycle-persistence.ts` both file an IND annual report at `m1.13`. A
 * membership gate built from the one list we have would therefore refuse the
 * product's own filings.
 *
 * To be clear about what is and is not being claimed: 1.5 Application Status,
 * 1.7 Fast Track, 1.9 Pediatric Administrative Information and 1.13 Annual
 * Report ARE sections of FDA's Module 1 — this repo carries them itself, in
 * `server/services/regional-ctd-templates.ts`. They are headings missing from
 * a leaf-only derivation, not codes missing from FDA's table. That table is
 * not vendored in a form a validator can read, which is the actual blocker.
 * The same holds for eSTAR and CTIS, whose published section sets are not
 * vendored here at all. All three get a shape rule.
 *
 * The IRB slots are different: they are a PRODUCT vocabulary, defined by
 * `docs/design/IRB_SUBMISSION.md` and by nobody else, so membership is
 * checkable and is checked. A misspelled IRB slot is refused by name.
 *
 * The REGISTRY slots are closed for the same reason, and one stronger. They
 * are not copied from a published taxonomy; they are derived from the modules
 * `server/services/study-design/registration-projection.ts` actually emits, so
 * the vocabulary and the projection are two views of one list.
 * `REGISTRY_MODULE_SLOTS` is that derivation written down, and the engine's
 * test walks every module both projectors emit and fails if one has no slot —
 * which is what stops the two drifting apart.
 *
 * @module shared/regulatory/placement-vocabulary
 */

import { normalizeCtdCode } from './section-code';

/** The vocabularies a submission's section codes can be drawn from. */
export type PlacementVocabulary = 'ctd' | 'estar' | 'ctis' | 'irb' | 'registry';

export const PLACEMENT_VOCABULARIES: readonly PlacementVocabulary[] = ['ctd', 'estar', 'ctis', 'irb', 'registry'] as const;

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
  // Trial-registry filings. These are NEW types, not a repurposing: `cta`
  // stays `ctis` because a CTIS clinical trial application files on the CTIS
  // dossier structure, while a registry RECORD files on the slots below.
  registry: 'registry', 'trial-registry': 'registry',
  ctgov: 'registry', 'clinicaltrials.gov': 'registry', 'ctgov-registration': 'registry',
  'ctis-registration': 'registry',
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

// ─── The trial-registry slots ────────────────────────────────────────────────

/**
 * The slots a trial-registry filing is assembled from — ClinicalTrials.gov
 * under FDAAA 801 / 42 CFR Part 11, and the EU CTIS under Regulation (EU)
 * 536/2014.
 *
 * Closed, like the IRB list, and derived rather than invented: nine of the
 * eleven are exactly the modules `registration-projection.ts` emits, folded so
 * that the ClinicalTrials.gov and CTIS names for one thing share a slot
 * ("Conditions" and "Medical conditions" are the same place to file). The
 * derivation is `REGISTRY_MODULE_SLOTS` below.
 *
 * Two slots come from the obligation rather than from the projection, and are
 * marked as such so nobody later reads them as drift:
 *   • `registry.results` — clinical trial results information under 42 CFR
 *     part 11 subpart C (§ 11.48 sets out what the results information is;
 *     § 11.44 sets its deadlines), which is a filing the projection does not
 *     model (it projects the registration record).
 *   • `registry.other` — supporting material, the same escape hatch
 *     `irb.other` provides; without one a legitimate attachment has nowhere to
 *     go and the closed list becomes a wall.
 */
export const REGISTRY_SLOTS = {
  'registry.arms-and-interventions': 'Arms, groups and interventions / investigational products',
  'registry.conditions': 'Condition or medical condition studied',
  'registry.design': 'Study design — type, purpose, phase, allocation, model, masking',
  'registry.eligibility': 'Eligibility, population and planned enrollment',
  'registry.identification': 'Trial identification — brief, official and full titles',
  'registry.member-states': 'Member state(s) concerned (EU CTIS)',
  'registry.other': 'Other supporting material',
  'registry.outcome-measures': 'Objectives, outcome measures and endpoints',
  'registry.results': 'Results information (42 CFR part 11 subpart C, § 11.48 / summary of results)',
  'registry.sponsor': 'Sponsor, responsible party and oversight',
  'registry.status': 'Recruitment status and study dates',
} as const;

export type RegistrySlot = keyof typeof REGISTRY_SLOTS;

export const REGISTRY_SLOT_CODES: readonly RegistrySlot[] = Object.keys(REGISTRY_SLOTS).sort() as RegistrySlot[];

export function isRegistrySlot(code: string): code is RegistrySlot {
  return Object.prototype.hasOwnProperty.call(REGISTRY_SLOTS, code);
}

/**
 * Projection module name → slot. This IS the derivation: every module name on
 * the left is a `RegistrationModule.name` that `projectCtGov` or `projectCtis`
 * emits today. A projector that renames or adds a module and does not appear
 * here fails the engine's drift test rather than silently losing its content.
 */
export const REGISTRY_MODULE_SLOTS: Readonly<Record<string, RegistrySlot>> = {
  // ClinicalTrials.gov (FDAAA 801 / PRS)
  'Study identification': 'registry.identification',
  'Study status': 'registry.status',
  'Sponsor and oversight': 'registry.sponsor',
  'Study design': 'registry.design',
  'Conditions': 'registry.conditions',
  'Arms and interventions': 'registry.arms-and-interventions',
  'Outcome measures': 'registry.outcome-measures',
  'Eligibility': 'registry.eligibility',
  // EU CTIS (Regulation (EU) 536/2014)
  'Trial identification': 'registry.identification',
  'Sponsor': 'registry.sponsor',
  'Member states concerned': 'registry.member-states',
  'Medical conditions': 'registry.conditions',
  'Objectives and endpoints': 'registry.outcome-measures',
  'Trial design': 'registry.design',
  'Population': 'registry.eligibility',
  'Products': 'registry.arms-and-interventions',
};

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
    case 'registry':
      return registryVerdict(code);
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
 * Membership, not shape — and for a reason the IRB branch does not have.
 *
 * The registry slots are DERIVED from the modules the registration projection
 * emits (`REGISTRY_MODULE_SLOTS`), so a code outside the list is not merely
 * unrecognised: it names a place the projection has no content for, and a
 * filing assembled from it would carry a section nothing fills. Naming the
 * real slots in the refusal is the whole value of a closed list.
 */
function registryVerdict(code: string): SectionCodeVerdict {
  const lower = code.toLowerCase();
  if (!isRegistrySlot(lower)) {
    return {
      ok: false,
      vocabulary: 'registry',
      message:
        `Section code "${code}" is not a trial-registry filing slot. Use one of: ${REGISTRY_SLOT_CODES.join(', ')}. ` +
        `Like the IRB list and unlike the CTD and eSTAR vocabularies this list is closed, because it is derived ` +
        `from the registry record this platform projects.`,
    };
  }
  return { ok: true, vocabulary: 'registry', canonical: lower };
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
