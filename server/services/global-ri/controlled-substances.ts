/**
 * US DEA controlled-substance scheduling expert — Controlled Substances Act.
 *
 * Substances with abuse potential are placed by the DEA into one of five
 * schedules (I–V) under the Controlled Substances Act (CSA). The schedule drives
 * the legal controls a registrant must apply: whether the substance may be
 * prescribed at all, whether prescriptions may be refilled, whether
 * manufacturing/import quotas apply, and the security/recordkeeping regime. This
 * service encodes that scheduling framework and the handling controls that follow
 * from each schedule — the judgement an RA / regulatory-pharmacology lead makes
 * when planning a development program for a scheduled (or scheduling-candidate)
 * drug.
 *
 * The placement criteria are statutory (21 USC 812(b)): each schedule is defined
 * by a combination of (1) abuse potential, (2) currently accepted medical use in
 * the US, and (3) the dependence liability. Schedule I is the only schedule with
 * NO currently accepted medical use; Schedules II–V all have an accepted medical
 * use with progressively lower abuse potential and dependence liability.
 *
 * Scheduling actions are not discretionary labels: adding, removing, or
 * transferring a substance between schedules requires DEA rulemaking (21 USC 811;
 * 21 CFR Part 1308 Subpart B), informed by the HHS/FDA scientific and medical
 * evaluation and scheduling recommendation and the statutory eight-factor
 * analysis (21 USC 811(b)–(c)). Anyone who manufactures, distributes, dispenses,
 * imports, or exports a controlled substance must register with the DEA
 * (21 USC 822; 21 CFR Part 1301), and Schedule I/II substances are additionally
 * subject to aggregate production and procurement quotas (21 USC 826;
 * 21 CFR Part 1303).
 *
 * Pure / deterministic — no DB, no IO. This is a reference aid keyed off the
 * declared schedule only. It does NOT classify a substance into a schedule (that
 * requires the eight-factor analysis and rulemaking) and it does NOT track the
 * current placement of any individual substance — substances are rescheduled by
 * rulemaking and placements change.
 *
 * References:
 *  - 21 USC 812 — Schedules of controlled substances; placement criteria (812(b))
 *    and initial schedules (812(c)).
 *  - 21 USC 811 — Authority and criteria for classification (eight-factor
 *    analysis, HHS/FDA scientific and medical evaluation).
 *  - 21 USC 826 — Production quotas (Schedule I and II).
 *  - 21 USC 822 — Persons required to register.
 *  - 21 USC 829 — Prescriptions (Schedule II no-refill rule; III/IV refill limits;
 *    V dispensing).
 *  - 21 CFR Part 1308 — Schedules of controlled substances (placement lists).
 *  - 21 CFR Part 1301 — Registration of manufacturers, distributors, dispensers.
 *  - 21 CFR Part 1303 — Quotas.
 *  - 21 CFR 1306.21–1306.27 — Refill and dispensing rules per schedule.
 *
 * Honest caveat: this models US FEDERAL (DEA) scheduling only. State controlled-
 * substance schedules and international controls (e.g. the UN Single Convention on
 * Narcotic Drugs / Convention on Psychotropic Substances administered via the
 * INCB) may classify the same substance differently. Marijuana is shown in its
 * federal Schedule I placement; state law and any pending federal rulemaking may
 * differ. Always confirm the current federal placement against 21 CFR Part 1308
 * (substances are added, removed, and transferred between schedules by rulemaking).
 *
 * @module server/services/global-ri/controlled-substances
 */

/** A DEA controlled-substance schedule under the Controlled Substances Act. */
export type Schedule = 'I' | 'II' | 'III' | 'IV' | 'V';

/** A single schedule within the CSA framework. */
export interface ScheduleInfo {
  /** The schedule label (I–V). */
  schedule: Schedule;
  /** Plain-language relative abuse potential (21 USC 812(b)). */
  abusePotential: string;
  /** Whether the substances have a currently accepted medical use in the US. */
  acceptedMedicalUse: boolean;
  /** Representative substances placed in this schedule (illustrative, not exhaustive). */
  examples: string[];
  /** The key legal controls that follow from this schedule. */
  controls: string[];
  /** Governing citation. */
  citation: string;
}

const SCHEDULE_INFO: Record<Schedule, ScheduleInfo> = {
  I: {
    schedule: 'I',
    abusePotential:
      'High potential for abuse; no currently accepted medical use in treatment in the US; lack of accepted safety for use under medical supervision',
    acceptedMedicalUse: false,
    examples: ['heroin', 'LSD', 'MDMA', 'marijuana (federal)', 'psilocybin'],
    controls: [
      'No prescriptions may be issued — Schedule I substances cannot be lawfully prescribed or dispensed',
      'Lawful handling is limited to DEA-registered research and analytical use under a Schedule I researcher registration',
      'Subject to the most restrictive security, recordkeeping, and inventory controls',
      'Subject to aggregate production and procurement quotas (21 USC 826; 21 CFR Part 1303)',
    ],
    citation: '21 USC 812(b)(1); 21 CFR 1308.11',
  },
  II: {
    schedule: 'II',
    abusePotential:
      'High potential for abuse; abuse may lead to severe psychological or physical dependence',
    acceptedMedicalUse: true,
    examples: ['oxycodone', 'fentanyl', 'morphine', 'methylphenidate', 'amphetamine'],
    controls: [
      'Currently accepted medical use, with severe restrictions',
      'Requires a written or compliant electronic prescription; no oral prescriptions except in an emergency, with follow-up written prescription',
      'NO refills permitted — a new prescription is required each time (21 CFR 1306.12)',
      'Subject to aggregate production and procurement quotas (21 USC 826; 21 CFR Part 1303)',
      'Subject to enhanced security storage, biennial inventory, and DEA Form 222 / CSOS for distribution',
    ],
    citation: '21 USC 812(b)(2); 21 CFR 1308.12',
  },
  III: {
    schedule: 'III',
    abusePotential:
      'Potential for abuse less than Schedule I and II; abuse may lead to moderate or low physical dependence or high psychological dependence',
    acceptedMedicalUse: true,
    examples: [
      'ketamine',
      'buprenorphine',
      'anabolic steroids (e.g. testosterone)',
      'codeine combinations (≤90 mg per dosage unit)',
    ],
    controls: [
      'Currently accepted medical use',
      'Requires a prescription (written, oral, or electronic)',
      'Refills permitted — up to 5 refills within 6 months of issue, if authorized (21 CFR 1306.22)',
      'Security and recordkeeping controls less restrictive than Schedule II',
    ],
    citation: '21 USC 812(b)(3); 21 CFR 1308.13',
  },
  IV: {
    schedule: 'IV',
    abusePotential:
      'Low potential for abuse relative to Schedule III; abuse may lead to limited physical or psychological dependence relative to Schedule III',
    acceptedMedicalUse: true,
    examples: [
      'benzodiazepines (e.g. alprazolam, diazepam)',
      'tramadol',
      'zolpidem',
      'carisoprodol',
    ],
    controls: [
      'Currently accepted medical use',
      'Requires a prescription (written, oral, or electronic)',
      'Refills permitted — up to 5 refills within 6 months of issue, if authorized (21 CFR 1306.22)',
      'Standard controlled-substance recordkeeping and security controls',
    ],
    citation: '21 USC 812(b)(4); 21 CFR 1308.14',
  },
  V: {
    schedule: 'V',
    abusePotential:
      'Low potential for abuse relative to Schedule IV; abuse may lead to limited physical or psychological dependence relative to Schedule IV',
    acceptedMedicalUse: true,
    examples: [
      'pregabalin',
      'antitussive preparations with limited codeine',
      'diphenoxylate/atropine',
      'lacosamide',
    ],
    controls: [
      'Currently accepted medical use; lowest abuse potential of the scheduled substances',
      'Dispensed on a prescription, or — for some products — over the counter where permitted by state law, with purchaser identification and recordkeeping',
      'Refills permitted as authorized by the prescriber',
      'Least restrictive controlled-substance recordkeeping and security controls',
    ],
    citation: '21 USC 812(b)(5); 21 CFR 1308.15',
  },
};

/** The set of modeled DEA controlled-substance schedules (I–V). */
export const CS_SCHEDULES: Schedule[] = ['I', 'II', 'III', 'IV', 'V'];

const FRAMEWORK_CITATION = '21 USC 812; 21 CFR Part 1308';

const FRAMEWORK_NOTES: string[] = [
  'Placement is statutory: a substance is assigned to a schedule by combining its abuse potential, currently accepted medical use, and dependence liability (21 USC 812(b)).',
  'Scheduling, rescheduling, and descheduling require DEA rulemaking (21 USC 811; 21 CFR Part 1308 Subpart B), informed by the HHS/FDA scientific and medical evaluation and scheduling recommendation and the statutory eight-factor analysis (21 USC 811(b)–(c)).',
  'Anyone who manufactures, distributes, dispenses, imports, or exports a controlled substance must register with the DEA (21 USC 822; 21 CFR Part 1301).',
  'Schedule I and II substances are subject to aggregate production and procurement quotas (21 USC 826; 21 CFR Part 1303).',
  'This module does NOT classify a substance into a schedule (that requires the eight-factor analysis and rulemaking) and does NOT track the current placement of any individual substance.',
  CS_CAVEAT_NOTE(),
];

function CS_CAVEAT_NOTE(): string {
  return 'US FEDERAL (DEA) scheduling only; state schedules and international (UN convention / INCB) controls may differ. Confirm the current federal placement against 21 CFR Part 1308 — substances are rescheduled by rulemaking.';
}

export interface ControlledSubstanceSchedules {
  schedules: ScheduleInfo[];
  citation: string;
  notes: string[];
}

/**
 * Return the full modeled DEA controlled-substance scheduling framework (I–V).
 * Pure / deterministic.
 */
export function getControlledSubstanceSchedules(): ControlledSubstanceSchedules {
  return {
    schedules: CS_SCHEDULES.map((s) => SCHEDULE_INFO[s]),
    citation: FRAMEWORK_CITATION,
    notes: FRAMEWORK_NOTES,
  };
}

/**
 * Return the modeled entry for a single schedule.
 * Pure / deterministic. Throws for an unmodeled schedule.
 */
export function getSchedule(schedule: Schedule): ScheduleInfo {
  const info = SCHEDULE_INFO[schedule];
  if (!info) {
    throw new Error(
      `Unknown DEA schedule "${schedule}"; modeled schedules are ${CS_SCHEDULES.join(', ')}.`,
    );
  }
  return info;
}

export interface HandlingControls {
  schedule: Schedule;
  /** Whether the substance may be prescribed at all (false only for Schedule I). */
  prescriptionAllowed: boolean;
  /** Whether prescription refills are permitted for this schedule. */
  refillsAllowed: boolean;
  /** Whether the schedule is subject to DEA production/procurement quotas (Schedule I and II). */
  quotaControlled: boolean;
  /** The key handling controls that follow from this schedule. */
  controls: string[];
  citation: string;
  notes: string[];
}

const HANDLING: Record<Schedule, { prescriptionAllowed: boolean; refillsAllowed: boolean; quotaControlled: boolean; note: string }> = {
  I: {
    prescriptionAllowed: false,
    refillsAllowed: false,
    quotaControlled: true,
    note: 'No accepted medical use — cannot be prescribed; lawful handling is limited to DEA-registered research/analytical use. Subject to production/procurement quotas.',
  },
  II: {
    prescriptionAllowed: true,
    refillsAllowed: false,
    quotaControlled: true,
    note: 'Written or compliant electronic prescription required; NO refills (a new prescription each time, 21 CFR 1306.12); subject to production/procurement quotas.',
  },
  III: {
    prescriptionAllowed: true,
    refillsAllowed: true,
    quotaControlled: false,
    note: 'Prescription required; refills permitted up to 5 within 6 months of issue if authorized (21 CFR 1306.22).',
  },
  IV: {
    prescriptionAllowed: true,
    refillsAllowed: true,
    quotaControlled: false,
    note: 'Prescription required; refills permitted up to 5 within 6 months of issue if authorized (21 CFR 1306.22).',
  },
  V: {
    prescriptionAllowed: true,
    refillsAllowed: true,
    quotaControlled: false,
    note: 'Dispensed on prescription, or over the counter for some products where permitted by state law (with purchaser ID and recordkeeping); refills as authorized.',
  },
};

/**
 * Return the DEA handling controls that follow from a schedule: whether the
 * substance may be prescribed, whether refills are permitted, whether production
 * quotas apply, and the key controls. Pure / deterministic. Throws for an
 * unmodeled schedule.
 */
export function getHandlingControls(schedule: Schedule): HandlingControls {
  const h = HANDLING[schedule];
  const info = SCHEDULE_INFO[schedule];
  if (!h || !info) {
    throw new Error(
      `Unknown DEA schedule "${schedule}"; modeled schedules are ${CS_SCHEDULES.join(', ')}.`,
    );
  }
  return {
    schedule,
    prescriptionAllowed: h.prescriptionAllowed,
    refillsAllowed: h.refillsAllowed,
    quotaControlled: h.quotaControlled,
    controls: info.controls,
    citation: info.citation,
    notes: [h.note, CS_CAVEAT_NOTE()],
  };
}
