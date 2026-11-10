/**
 * The application user fee: the positions the NDA and BLA interviews offer,
 * written once, the one reader of every answer saved to them, and whether a
 * claimed orphan exemption is supported by the rest of the interview.
 *
 * Split out of nda-submission.ts (2026-11-02, S4). Both interviews asked a
 * yes/no "PDUFA user fee paid". An orphan-designated application is exempt
 * from the application fee (FD&C Act §736(a)(1)(F)), so its correct answer
 * was "no", and the NDA node and the war game both called that a critical
 * refuse-to-file. A yes/no could not tell paid, exempt, waived and unpaid
 * apart, and the BLA asked a 351(k) biosimilar about PDUFA, whose fees it
 * does not pay.
 *
 * Interview answers are stored JSON and are not migrated: a saved true reads
 * as paid and a saved false as not paid, which is what the question asked.
 */
import type { OwnPositionAllowed, QuestionPredicate } from '../../../../../shared/types/intelligence-questions.js';
import { OTHER_POSITION } from '../../../../../shared/types/intelligence-questions.js';
import type { FieldPredicate, QuestionField, QuestionOption } from '../types.js';
import { orphanReadingOf } from './ind-submission-orphan-designation.js';

export type UserFeeStatus = 'paid' | 'orphan_exempt' | 'waiver_granted' | 'not_paid';
export type UserFeeReading = UserFeeStatus | 'own_words';

const BSUFA = 'for a 351(k) biosimilar, the biosimilar user fee, FD&C Act §744H (21 USC 379j-52) (recall)';

export const USER_FEE_POSITIONS: ReadonlyArray<QuestionOption & { value: UserFeeStatus }> = [
  {
    value: 'paid',
    label: 'Paid, or paid with the submission',
    commits:
      'The fee is no bar to the application being received for filing. The payment identification goes on the user fee cover sheet: Form FDA 3397 under PDUFA, or Form FDA 3792 under BsUFA for a 351(k) biosimilar.',
    authority: `FD&C Act §736(a)(1), (e) (21 USC 379h); ${BSUFA}`,
  },
  {
    value: 'orphan_exempt',
    label: 'Not payable: exempt as an orphan-designated drug',
    commits:
      'Holds only while FDA has granted orphan-drug designation and the application includes no indication other than the designated rare disease or condition. The exemption is claimed on the user fee cover sheet; it is not a waiver request. It is not available to a 351(k) biosimilar application.',
    authority: 'FD&C Act §736(a)(1)(F) (21 USC 379h(a)(1)(F)); FD&C Act §526 (21 USC 360bb)',
  },
  {
    value: 'waiver_granted',
    label: 'Waived or reduced by FDA',
    commits:
      "FDA has decided a waiver or reduction request on the statute's own grounds (for example, a small business submitting its first human drug application). The decision is cited on the cover sheet and filed with the application. A request still pending is not a waiver.",
    authority: `FD&C Act §736(d) (21 USC 379h(d)); ${BSUFA}`,
  },
  {
    value: 'not_paid',
    label: 'Not yet paid',
    commits: 'The application is incomplete and is not accepted for filing until every fee owed is paid.',
    authority: 'FD&C Act §736(e) (21 USC 379h(e))',
  },
];

const OWN_WORDS: OwnPositionAllowed = {
  prompt: "The fee's status in your own words: for example, a waiver or reduction request FDA has not yet decided.",
};

/** The fee question, as the NDA and the BLA ask it. */
export function userFeeField(spec: { label: string; helpText: string; required?: boolean }): QuestionField {
  return {
    id: 'user_fee_paid',
    label: spec.label,
    type: 'select',
    ...(spec.required ? { required: true } : {}),
    options: [...USER_FEE_POSITIONS],
    allowOther: OWN_WORDS,
    helpText: spec.helpText,
  };
}

/**
 * The answers under which the application is not held back by the fee, for
 * the goal-date question's gate: a position that settles it, and the saved
 * yes. The reader below agrees with it for every value (a test holds them).
 */
export const FEE_SETTLED_LEAVES: readonly FieldPredicate[] = [
  { field: 'user_fee_paid', operator: 'in', value: ['paid', 'orphan_exempt', 'waiver_granted'] },
  { field: 'user_fee_paid', operator: 'eq', value: true },
];
export const FEE_SETTLED: QuestionPredicate = { anyOf: [...FEE_SETTLED_LEAVES] };

/** The same set, as readings. */
export const FEE_SETTLED_READINGS: ReadonlySet<UserFeeReading> = new Set<UserFeeReading>(['paid', 'orphan_exempt', 'waiver_granted']);

const POSITIONS = new Set<string>(USER_FEE_POSITIONS.map(o => o.value));
const LEGACY_YES = new Set(['yes', 'y', 'true', '1']);
const LEGACY_NO = new Set(['no', 'n', 'false', '0']);

/** What one saved answer to the fee question says, or null where it says nothing. */
export function userFeeReadingOf(value: unknown): UserFeeReading | null {
  if (value === true) return 'paid';
  if (value === false) return 'not_paid';
  if (typeof value !== 'string') return null;
  if (POSITIONS.has(value)) return value as UserFeeStatus;
  if (value === OTHER_POSITION) return 'own_words';
  const v = value.trim().toLowerCase();
  if (LEGACY_YES.has(v)) return 'paid';
  if (LEGACY_NO.has(v)) return 'not_paid';
  return null;
}

/**
 * What the fee answer and the designation say together:
 *   settled        paid, waived, or an exemption the designation supports;
 *   exemption_*    the orphan exemption claimed where it does not hold, or
 *                  cannot be confirmed from the interview;
 *   unpaid         not paid (the designation decides whether an exemption
 *                  was available; see ORPHAN_FEE_NOTE);
 *   unstated       blank, or in the person's own words.
 */
export type UserFeeVerdict =
  | 'settled'
  | 'exemption_biosimilar'
  | 'exemption_not_granted'
  | 'exemption_unconfirmed'
  | 'unpaid'
  | 'unstated';

export function userFeeVerdictOf(fee: unknown, orphanDesignation: unknown, biosimilar: boolean): UserFeeVerdict {
  const reading = userFeeReadingOf(fee);
  if (reading === 'paid' || reading === 'waiver_granted') return 'settled';
  if (reading === 'not_paid') return 'unpaid';
  if (reading !== 'orphan_exempt') return 'unstated';
  if (biosimilar) return 'exemption_biosimilar';
  const orphan = orphanReadingOf(orphanDesignation);
  if (orphan === 'granted') return 'settled';
  if (orphan === null || orphan === 'stated' || orphan === 'own_words') return 'exemption_unconfirmed';
  return 'exemption_not_granted';
}

export type UnsupportedExemption = Extract<UserFeeVerdict, `exemption_${string}`>;

export const UNSUPPORTED_EXEMPTION_NOTE: Readonly<Record<UnsupportedExemption, string>> = {
  exemption_biosimilar:
    'The orphan exemption from the application fee is claimed for a 351(k) biosimilar application. A 351(k) application pays the biosimilar user fee under BsUFA, which holds no orphan exemption; the PDUFA exemption (FD&C Act §736(a)(1)(F)) applies only to an NDA or a 351(a) BLA.',
  exemption_not_granted:
    'The orphan exemption from the application fee is claimed, but the interview says FDA has not granted orphan-drug designation (it is requested, planned, refused or not held). The exemption (FD&C Act §736(a)(1)(F)) attaches only to a granted designation, so the fee is owed and the application is not accepted for filing until it is paid (§736(e)).',
  exemption_unconfirmed:
    'The orphan exemption from the application fee is claimed, and the interview does not say FDA granted orphan-drug designation. The exemption (FD&C Act §736(a)(1)(F)) attaches only to a granted designation and only while the application includes no indication other than the designated rare disease or condition.',
};

export function isUnsupportedExemption(verdict: UserFeeVerdict): verdict is UnsupportedExemption {
  return verdict.startsWith('exemption_');
}
