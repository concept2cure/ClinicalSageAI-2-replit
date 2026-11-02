/**
 * Orphan designation: the positions every interview that asks it offers,
 * written once, and the one reader of every answer ever saved to it.
 *
 * Split out of ind-submission.ts (2026-11-02, S4), as
 * protocol-development-biomarker-selection.ts was split out of the protocol.
 * Five interviews asked the same fact four ways: a yes/no in the protocol, the
 * BLA and the labeling; a granted / applied / not-applicable select in the IND
 * and the NDA; and, in the protocol, a checkbox in two other lists as well.
 * None said which regulator a "yes" meant, none could say a request was
 * refused or still to be made, and the protocol's help said the designation
 * changes the study's size, which it does not.
 *
 * Every saved answer stays readable. Interview sessions keep their answers as
 * stored JSON, so a session begun before this change still holds `true`,
 * `'yes'`, `false` or `'not_applicable'`; `orphanReadingOf` reads each, and
 * none of them reads as a grant.
 *
 * The questions where a designation changes what is owed (the user fee, PREA,
 * the exclusivity claim, the natural-history question) read the reading, not
 * the raw value, and the natural-history gates and the cross-node rule share
 * one predicate (`orphanProgrammeLeaves`), so a question cannot open on an
 * answer the rule does not count, or the reverse.
 */
import {
  OTHER_POSITION,
  type OwnPositionAllowed,
  type QuestionPredicate,
} from '../../../../../shared/types/intelligence-questions.js';
import type { FieldPredicate, QuestionField, QuestionOption } from '../types.js';

/** The five positions each regulator's question offers. */
export type OrphanStatus = 'granted' | 'applied' | 'planned' | 'refused' | 'not_requested';

/**
 * What a saved answer says. One of the five, or what an answer saved before
 * the positions existed says: a yes (`stated`, regulator unknown), a no or
 * "not applicable" (`not_held`), or the person's own words.
 */
export type OrphanReading = OrphanStatus | 'stated' | 'not_held' | 'own_words';

/** The fields that ask it. A field no flow asks is caught by the vocabulary test. */
export const ORPHAN_FIELDS = ['orphan_designation', 'eu_orphan_designation'] as const;
export type OrphanField = (typeof ORPHAN_FIELDS)[number];

const OWN_WORDS: OwnPositionAllowed = {
  prompt:
    "The designation's status in your own words: for example, a designation for a subset of the disease, or one held by another sponsor of the same drug.",
};

const US_PREA_EXCEPTION =
  'PREA does not apply to the designated indication, except that an original application for a new active ingredient, submitted on or after 18 August 2020, for a drug for an adult cancer directed at a molecular target FDA determines is substantially relevant to a pediatric cancer must include the molecularly targeted pediatric cancer investigation.';

export const US_ORPHAN_POSITIONS: ReadonlyArray<QuestionOption & { value: OrphanStatus }> = [
  {
    value: 'granted',
    label: 'FDA has designated it an orphan drug for this disease or condition',
    commits:
      'The designation covers this drug for the designated disease or condition only; the evidence standard for approval is unchanged. An NDA or a 351(a) BLA for it is exempt from the PDUFA application fee unless it also includes an indication for other than a rare disease or condition (a 351(k) biosimilar application pays BsUFA fees instead). ' +
      US_PREA_EXCEPTION +
      ' Approval for the designated use may carry 7 years of orphan-drug exclusivity; where the same drug is already approved for the same use, clinical superiority must be shown. A progress report is due within 14 months of designation and annually until approval.',
    authority:
      'FD&C Act §526 (21 USC 360bb); 21 CFR 316.24, 316.30; FD&C Act §736(a)(1)(F) (21 USC 379h); FD&C Act §505B(k), §505B(a)(3) (21 USC 355c); FD&C Act §527 (21 USC 360cc); 21 CFR 316.31, 316.34',
  },
  {
    value: 'applied',
    label: "Requested: FDA's decision is pending",
    commits:
      'Nothing attaches until FDA grants it: the application fee, PREA and exclusivity are judged as for any drug until then. The request must reach FDA before the marketing application for the same disease or condition is submitted.',
    authority: 'FD&C Act §526(a)(1); 21 CFR 316.20, 316.23(a)',
  },
  {
    value: 'planned',
    label: 'Not yet requested: a request will be made before the marketing application',
    commits:
      "The request goes to FDA's Office of Orphan Products Development before the NDA or BLA for the same disease or condition is submitted, and is not accepted after it. It documents a US prevalence below 200,000 persons, or that US sales would not be expected to recover the cost of developing the drug and making it available, and the scientific rationale for its use in the disease. Nothing attaches until it is granted.",
    authority: 'FD&C Act §526(a)(1)-(2); 21 CFR 316.20, 316.21, 316.23(a)',
  },
  {
    value: 'refused',
    label: 'FDA refused, or later revoked, the designation',
    commits:
      'No orphan consequence attaches: the application fee, PREA and exclusivity are judged as for any drug. A further request must still be made before the marketing application.',
    authority: '21 CFR 316.25 (refusal), 316.29 (revocation), 316.23(a)',
  },
  {
    value: 'not_requested',
    label: 'No US orphan designation, held or requested',
    commits:
      'PREA applies wherever the application triggers it (a new active ingredient, indication, dosage form, dosing regimen or route of administration), unless FDA waives or defers it. No orphan exemption from the application fee is available, and there is no orphan exclusivity to claim.',
    authority: 'FD&C Act §505B(a)(1); §736(a)(1); §527',
  },
];

const EU_STATUS =
  'current law; the Commission\'s 2023 pharmaceutical-legislation proposals (COM(2023) 192 and 193) would replace Regulation (EC) No 141/2000, and their status is not verified here';

const EU_SIMILARITY =
  'Where an authorised orphan medicinal product holds market exclusivity for the same condition, the marketing-authorisation application must address similarity to it.';

export const EU_ORPHAN_POSITIONS: ReadonlyArray<QuestionOption & { value: OrphanStatus }> = [
  {
    value: 'granted',
    label: 'The European Commission has designated it an orphan medicinal product',
    commits:
      'The marketing authorisation must be sought through the centralised procedure. Before authorisation, whether the designation criteria are still met is checked again, and the product leaves the Community Register if they are not. Once authorised, 10 years of market exclusivity for the designated indication (12 where the application includes the results of studies under an agreed paediatric investigation plan), reducible to 6 if the criteria are no longer met at the end of the fifth year. The designation does not exempt the product from the paediatric investigation plan. Protocol assistance and fee reductions are available. ' +
      EU_SIMILARITY,
    authority: `Regulation (EC) No 141/2000 Arts 5(12), 6, 7, 8(1)-(2); Regulation (EC) No 726/2004 Annex, point 4; Regulation (EC) No 1901/2006 Arts 7, 37 (${EU_STATUS})`,
  },
  {
    value: 'applied',
    label: 'Applied for: the COMP opinion or the Commission decision is pending',
    commits:
      'No incentive attaches until the Commission designates it. The application must precede the marketing-authorisation application. The Committee for Orphan Medicinal Products gives an opinion and the Commission decides.',
    authority: `Regulation (EC) No 141/2000 Art 5 (${EU_STATUS})`,
  },
  {
    value: 'planned',
    label: 'Not yet applied for: an application will be made before the marketing-authorisation application',
    commits:
      'The application, made before the marketing-authorisation application, shows two things. First, the product is for the diagnosis, prevention or treatment of a life-threatening or chronically debilitating condition affecting not more than 5 in 10,000 people in the EU, or of a life-threatening, seriously debilitating or serious and chronic condition for which marketing would be unlikely, without the incentives, to generate a return justifying the investment. Second, no satisfactory method is authorised for the condition, or the product will be of significant benefit to those affected.',
    authority: `Regulation (EC) No 141/2000 Arts 3(1), 5(1); Commission Regulation (EC) No 847/2000 Art 2 (${EU_STATUS})`,
  },
  {
    value: 'refused',
    label: 'Refused, withdrawn, or removed from the Community Register',
    commits:
      'No orphan incentive or market exclusivity attaches. The paediatric investigation plan applies as for any product. ' + EU_SIMILARITY,
    authority: `Regulation (EC) No 141/2000 Arts 5, 5(12), 8(1) (${EU_STATUS})`,
  },
  {
    value: 'not_requested',
    label: 'No EU orphan designation, held or applied for',
    commits:
      'The general data-exclusivity and market-protection periods apply, not orphan market exclusivity. ' + EU_SIMILARITY,
    authority: `Directive 2001/83/EC Art 10(1); Regulation (EC) No 726/2004 Art 14(11); Regulation (EC) No 141/2000 Art 8(1), (3); Commission Regulation (EC) No 847/2000 Art 3 (${EU_STATUS})`,
  },
];

interface OrphanFieldSpec {
  label?: string;
  helpText: string;
  visibleWhen?: QuestionPredicate;
}

/** The US question, as every interview that asks it asks it. */
export function usOrphanDesignationField(spec: OrphanFieldSpec): QuestionField {
  return {
    id: 'orphan_designation',
    label: spec.label ?? 'US orphan-drug designation for this disease or condition',
    type: 'select',
    required: false,
    options: [...US_ORPHAN_POSITIONS],
    allowOther: OWN_WORDS,
    helpText: spec.helpText,
    ...(spec.visibleWhen ? { visibleWhen: spec.visibleWhen } : {}),
  };
}

/** The EU question. Asked where a programme may file in the EU (the protocol). */
export function euOrphanDesignationField(spec: OrphanFieldSpec): QuestionField {
  return {
    id: 'eu_orphan_designation',
    label: spec.label ?? 'EU orphan designation (Regulation (EC) No 141/2000)',
    type: 'select',
    required: false,
    options: [...EU_ORPHAN_POSITIONS],
    allowOther: OWN_WORDS,
    helpText: spec.helpText,
    ...(spec.visibleWhen ? { visibleWhen: spec.visibleWhen } : {}),
  };
}

const POSITIONS = new Set<string>(US_ORPHAN_POSITIONS.map(o => o.value));
/* The yes and no the shared predicate coerces (trimmed, any case), so the
   reading and a gate's `eq true` leaf agree on every saved yes/no. */
const LEGACY_YES = new Set(['yes', 'y', 'true', '1']);
const LEGACY_NO = new Set(['no', 'n', 'false', '0']);

/**
 * What one saved answer to an orphan question says, or null where it says
 * nothing (blank, or a value no version of the question offered). A position
 * is matched exactly, as a gate's `in` leaf matches it.
 */
export function orphanReadingOf(value: unknown): OrphanReading | null {
  if (value === true) return 'stated';
  if (value === false) return 'not_held';
  if (typeof value !== 'string') return null;
  if (POSITIONS.has(value)) return value as OrphanStatus;
  if (value === OTHER_POSITION) return 'own_words';
  /* What the IND and the NDA offered for "No / not applicable" before
     2026-11-02. */
  if (value === 'not_applicable') return 'not_held';
  const v = value.trim().toLowerCase();
  if (LEGACY_YES.has(v)) return 'stated';
  if (LEGACY_NO.has(v)) return 'not_held';
  return null;
}

/**
 * The readings under which a programme is an orphan programme for the
 * questions that turn on it (natural history): held, sought, to be sought, a
 * pre-2026-11-02 yes, or the person's own account. A refusal, a no and
 * "not requested" are not.
 */
export const ORPHAN_PROGRAMME_READINGS: ReadonlySet<OrphanReading> = new Set<OrphanReading>([
  'granted',
  'applied',
  'planned',
  'stated',
  'own_words',
]);

/**
 * The same set, as predicate leaves a gate can carry: the positions, and the
 * saved yes (the shared predicate coerces true, 'yes', 'y', 'true' and '1'
 * alike). A test holds the two equal for every value ever offered.
 */
export function orphanProgrammeLeaves(fields: readonly OrphanField[] = ORPHAN_FIELDS): FieldPredicate[] {
  return fields.flatMap((field): FieldPredicate[] => [
    { field, operator: 'in', value: ['granted', 'applied', 'planned', OTHER_POSITION] },
    { field, operator: 'eq', value: true },
  ]);
}

/**
 * What the reading does to the PDUFA application fee, for the war game's fee
 * findings (NDA and 351(a) BLA). One statement of the exemption, so the two
 * auditors cannot drift: it is an exemption claimed on the cover sheet, not a
 * waiver requested, and it attaches only to a granted designation.
 */
export type OrphanFeeStanding = 'exempt' | 'not_yet' | 'unconfirmed' | 'unknown' | 'none';

export function orphanFeeStandingOf(reading: OrphanReading | null): OrphanFeeStanding {
  if (reading === 'granted') return 'exempt';
  if (reading === 'applied' || reading === 'planned') return 'not_yet';
  if (reading === 'stated') return 'unconfirmed';
  if (reading === null || reading === 'own_words') return 'unknown';
  return 'none';
}

const FEE_EXEMPTION = 'FD&C Act §736(a)(1)(F) (21 USC 379h(a)(1)(F))';

export const ORPHAN_FEE_NOTE: Readonly<Record<OrphanFeeStanding, string>> = {
  exempt: `The drug is orphan-designated, so the application is exempt from the PDUFA application fee unless it also includes an indication for other than a rare disease or condition (${FEE_EXEMPTION}). The exemption is claimed on the user fee cover sheet (Form FDA 3397); it is not a waiver request.`,
  not_yet: `The orphan designation is requested or planned, not granted. The fee exemption (${FEE_EXEMPTION}) attaches only to a granted designation, so the fee is owed unless FDA grants it before submission.`,
  unconfirmed: `The interview recorded an orphan designation without saying FDA granted it (an answer saved before the question offered positions). The fee exemption (${FEE_EXEMPTION}) attaches only to a granted designation.`,
  unknown: `If the drug is orphan-designated, the application is exempt from the application fee unless it also includes an indication for other than a rare disease or condition (${FEE_EXEMPTION}).`,
  none: '',
};
