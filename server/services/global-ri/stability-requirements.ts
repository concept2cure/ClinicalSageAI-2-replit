/**
 * Stability-requirements expert — WHO/ICH climatic zones + ICH storage conditions.
 *
 * Determining the correct stability study design and storage conditions is a
 * core RA CMC task: it drives shelf-life justification, the climatic zone(s) of
 * the intended market(s), and what "significant change" testing is triggered.
 * This service encodes the WHO/ICH climatic zones and the ICH Q1A(R2) storage
 * condition sets for room-temperature, refrigerated, and frozen products, plus
 * the harmonised study design (batches, frequency, time points).
 *
 * Pure / deterministic — no DB, no IO. The encoded conditions/zone assignment
 * are a reference aid; the actual conditions and zone(s) depend on the intended
 * market and the specific product, per the current ICH/WHO guidance.
 *
 * References:
 *   - ICH Q1A(R2) — Stability Testing of New Drug Substances and Products
 *     (long-term, intermediate, accelerated conditions; study design).
 *   - ICH Q1B — Photostability Testing of New Drug Substances and Products.
 *   - ICH Q1C — Stability Testing for New Dosage Forms.
 *   - ICH Q1D — Bracketing and Matrixing Designs for Stability Testing.
 *   - ICH Q1E — Evaluation of Stability Data.
 *   - WHO TRS (Technical Report Series) — climatic zones I–IVb.
 *
 * @module server/services/global-ri/stability-requirements
 */

export type StorageCondition = 'room' | 'refrigerated' | 'frozen';

/** A WHO/ICH climatic zone with its representative long-term test condition. */
export interface ClimaticZone {
  /** Zone identifier (I, II, III, IVa, IVb). */
  id: string;
  /** Zone name. */
  name: string;
  /** Short description of the climate. */
  description: string;
  /** The long-term storage/test condition commonly assigned to the zone. */
  longTermCondition: string;
}

/** A single stability test condition (temperature, humidity, minimum duration). */
export interface StabilityConditionSpec {
  /** Storage temperature including tolerance (e.g. '25°C ± 2°C'). */
  temperature: string;
  /** Relative humidity including tolerance, or null when not controlled (e.g. frozen). */
  humidity?: string | null;
  /** Minimum data duration at submission, in months. */
  minimumDurationMonths: number;
}

/** The set of ICH storage conditions for a given storage category. */
export interface StabilityConditions {
  storageCondition: StorageCondition;
  longTerm: StabilityConditionSpec;
  /** Intermediate condition (null when not applicable, e.g. refrigerated/frozen). */
  intermediate: StabilityConditionSpec | null;
  /** Accelerated condition (null when not applicable, e.g. frozen). */
  accelerated: StabilityConditionSpec | null;
  citation: string;
  notes: string[];
}

/** The harmonised ICH Q1A(R2) study design. */
export interface StudyDesign {
  /** Minimum number of primary batches. */
  minimumBatches: number;
  /** Long-term testing frequency description. */
  longTermFrequency: string;
  /** Accelerated (and intermediate) study time points, in months. */
  acceleratedTimePointsMonths: number[];
  citation: string;
  notes: string[];
}

const ICH_Q1A = 'ICH Q1A(R2)';
const WHO_ZONES_CIT = 'WHO TRS climatic zones (Zones I–IVb)';

/** The five WHO/ICH climatic zones. */
export const CLIMATIC_ZONES: ClimaticZone[] = [
  {
    id: 'I',
    name: 'Temperate',
    description: 'Temperate climate.',
    longTermCondition: '21°C / 45% RH',
  },
  {
    id: 'II',
    name: 'Subtropical & Mediterranean',
    description: 'Subtropical and Mediterranean climate.',
    longTermCondition: '25°C / 60% RH',
  },
  {
    id: 'III',
    name: 'Hot & dry',
    description: 'Hot and dry climate.',
    longTermCondition: '30°C / 35% RH',
  },
  {
    id: 'IVa',
    name: 'Hot & humid',
    description: 'Hot and humid climate.',
    longTermCondition: '30°C / 65% RH',
  },
  {
    id: 'IVb',
    name: 'Hot & very humid',
    description: 'Hot and very humid climate (e.g. ASEAN region).',
    longTermCondition: '30°C / 75% RH',
  },
];

const CLIMATIC_ZONE_BY_ID: Record<string, ClimaticZone> = Object.fromEntries(
  CLIMATIC_ZONES.map((z) => [z.id, z]),
);

/** The modeled storage-condition categories. */
export const STORAGE_CONDITIONS: StorageCondition[] = ['room', 'refrigerated', 'frozen'];

const MARKET_CAVEAT =
  'Storage conditions and climatic-zone assignment depend on the intended market and the specific product, per the current ICH/WHO guidance.';

const STABILITY_CONDITIONS: Record<StorageCondition, StabilityConditions> = {
  room: {
    storageCondition: 'room',
    longTerm: { temperature: '25°C ± 2°C', humidity: '60% RH ± 5%', minimumDurationMonths: 12 },
    intermediate: { temperature: '30°C ± 2°C', humidity: '65% RH ± 5%', minimumDurationMonths: 6 },
    accelerated: { temperature: '40°C ± 2°C', humidity: '75% RH ± 5%', minimumDurationMonths: 6 },
    citation: ICH_Q1A,
    notes: [
      'Long-term may alternatively be run at 30°C ± 2°C / 65% RH ± 5% (covers Zones III/IVa) — minimum 12 months at submission.',
      'Intermediate (30°C ± 2°C / 65% RH ± 5%) is tested only if a "significant change" occurs at the accelerated condition.',
      MARKET_CAVEAT,
    ],
  },
  refrigerated: {
    storageCondition: 'refrigerated',
    longTerm: { temperature: '5°C ± 3°C', humidity: null, minimumDurationMonths: 12 },
    intermediate: null,
    accelerated: { temperature: '25°C ± 2°C', humidity: '60% RH ± 5%', minimumDurationMonths: 6 },
    citation: ICH_Q1A,
    notes: [
      'For products labeled for storage at 2–8°C; long-term at 5°C ± 3°C, accelerated at 25°C ± 2°C / 60% RH ± 5%.',
      'A "significant change" at the accelerated condition is evaluated per ICH Q1A(R2) (no separate intermediate condition).',
      MARKET_CAVEAT,
    ],
  },
  frozen: {
    storageCondition: 'frozen',
    longTerm: { temperature: '-20°C ± 5°C', humidity: null, minimumDurationMonths: 12 },
    intermediate: null,
    accelerated: null,
    citation: ICH_Q1A,
    notes: [
      'For products labeled for storage at ≤ -15°C; long-term at -20°C ± 5°C with no accelerated condition.',
      'In lieu of an accelerated study, conduct a one-time short study at an elevated temperature (e.g. 5°C ± 3°C or 25°C ± 2°C) per ICH Q1A(R2).',
      MARKET_CAVEAT,
    ],
  },
};

const STUDY_DESIGN: StudyDesign = {
  minimumBatches: 3,
  longTermFrequency:
    'Every 3 months over the first year, every 6 months over the second year, then annually through the proposed shelf life.',
  acceleratedTimePointsMonths: [0, 3, 6],
  citation: ICH_Q1A,
  notes: [
    'At least 3 primary batches; bracketing/matrixing designs per ICH Q1D may reduce the number of samples tested.',
    'Photostability testing is conducted per ICH Q1B; data evaluation per ICH Q1E; new dosage forms per ICH Q1C.',
    MARKET_CAVEAT,
  ],
};

/**
 * Look up a WHO/ICH climatic zone by id (I, II, III, IVa, IVb).
 * Pure / deterministic. Returns null for an unknown zone id.
 */
export function getClimaticZone(zoneId: string): ClimaticZone | null {
  return CLIMATIC_ZONE_BY_ID[zoneId] ?? null;
}

/**
 * Get the ICH Q1A(R2) storage conditions for a storage category.
 * Pure / deterministic. Throws for an unmodeled storage condition.
 */
export function getStabilityConditions(storageCondition: StorageCondition): StabilityConditions {
  const conditions = STABILITY_CONDITIONS[storageCondition];
  if (!conditions) {
    throw new Error(`No stability conditions modeled for storage condition "${storageCondition}".`);
  }
  return conditions;
}

/**
 * Get the harmonised ICH Q1A(R2) stability study design.
 * Pure / deterministic.
 */
export function getStudyDesign(): StudyDesign {
  return STUDY_DESIGN;
}
