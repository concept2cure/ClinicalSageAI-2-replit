/**
 * Electrical safety (IEC 60601) — the general standard, the applicable collateral
 * standards (selected from device characteristics), the core test categories, and
 * the reviewer's electrical-safety questions.
 *
 * WHY THIS EXISTS (audit gap): electrical safety was unmodelled, yet it is a core
 * evidence area for active medical devices. Given device facts, this returns the
 * applicable IEC 60601 standards (general + conditional collaterals), the test
 * categories a reviewer expects (means of protection, leakage currents, dielectric
 * strength, thermal/mechanical, EMC, alarms), and the questions asked.
 *
 * HONESTY: reflects the IEC 60601-1 family structure + selection logic. Particular
 * standards (60601-2-xx) are device-type-specific and noted but not enumerated.
 * This is the expected standard/test set, not a test plan or a conformity decision.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/electrical-safety
 */

export interface ElectricalStandard {
  id: string;
  code: string;
  title: string;
  /** 'always' for the general standard; 'conditional' for collaterals selected by facts. */
  applicability: 'always' | 'conditional';
  condition?: string;
}

export const IEC_60601_STANDARDS: ElectricalStandard[] = [
  { id: 'general', code: 'IEC 60601-1', title: 'Medical electrical equipment — general requirements for basic safety and essential performance', applicability: 'always' },
  { id: 'emc', code: 'IEC 60601-1-2', title: 'Electromagnetic compatibility (collateral)', applicability: 'always' },
  { id: 'usability', code: 'IEC 60601-1-6', title: 'Usability (collateral; links to IEC 62366-1)', applicability: 'always' },
  { id: 'alarms', code: 'IEC 60601-1-8', title: 'Alarm systems (collateral)', applicability: 'conditional', condition: 'device generates clinical alarms' },
  { id: 'closed_loop', code: 'IEC 60601-1-10', title: 'Physiologic closed-loop controllers (collateral)', applicability: 'conditional', condition: 'device has a physiologic closed-loop controller' },
  { id: 'home_use', code: 'IEC 60601-1-11', title: 'Requirements for medical electrical equipment used in the home healthcare environment (collateral)', applicability: 'conditional', condition: 'intended for home/lay use' },
  { id: 'ems', code: 'IEC 60601-1-12', title: 'Requirements for equipment used in the emergency medical services environment (collateral)', applicability: 'conditional', condition: 'intended for the EMS environment' },
];

export const ELECTRICAL_TEST_CATEGORIES = [
  { id: 'means_of_protection', label: 'Means of protection (MOPP/MOOP) against electric shock' },
  { id: 'leakage_currents', label: 'Leakage currents (earth, touch, patient)' },
  { id: 'dielectric_strength', label: 'Dielectric strength / insulation' },
  { id: 'protective_earth', label: 'Protective earth continuity' },
  { id: 'thermal', label: 'Excessive temperatures / thermal safety' },
  { id: 'mechanical', label: 'Mechanical hazards / stability' },
  { id: 'emc', label: 'Electromagnetic compatibility (emissions + immunity)' },
  { id: 'essential_performance', label: 'Essential performance maintained under fault/EMC conditions' },
];

export const ELECTRICAL_REVIEWER_QUESTIONS = [
  'Are the means of protection (MOPP/MOOP) for each applied part justified by the patient-contact risk?',
  'Are leakage currents (earth, touch, patient) within IEC 60601-1 limits in normal AND single-fault conditions?',
  'Is essential performance defined, and maintained under the EMC immunity test levels (IEC 60601-1-2)?',
  'Are all applicable collateral standards (alarms, home use, closed-loop) addressed or justified as not applicable?',
  'Is the test report from an accredited lab to the current edition of the standard?',
];

export interface ElectricalDeviceFacts {
  /** Mains/battery powered medical electrical equipment. */
  electricallyPowered?: boolean;
  hasAlarms?: boolean;
  closedLoopControl?: boolean;
  homeUse?: boolean;
  emsUse?: boolean;
  /** Particular standard applies (device-type-specific 60601-2-xx). */
  hasParticularStandard?: boolean;
}

/** A standard whose applicability turns on a fact that was not stated. */
export interface UndeterminedElectricalStandard {
  id: string;
  code: string;
  title: string;
  /** 'undetermined — <fact> not stated': never read as "not applicable". */
  applicability: string;
}

export interface ElectricalApplicability {
  /** null: electricallyPowered was not stated, so whether IEC 60601 applies is undetermined. */
  applicable: boolean | null;
  /** The standards the stated facts make applicable. */
  standards: ElectricalStandard[];
  /** The standards whose deciding fact was not stated. */
  undeterminedStandards: UndeterminedElectricalStandard[];
  testCategories: typeof ELECTRICAL_TEST_CATEGORIES;
  reviewerQuestions: string[];
  notes: string[];
}

/** The fact that decides each conditional collateral. */
const CONDITION_FACT: Partial<Record<string, keyof ElectricalDeviceFacts>> = {
  alarms: 'hasAlarms',
  closed_loop: 'closedLoopControl',
  home_use: 'homeUse',
  ems: 'emsUse',
};

/**
 * Resolve the applicable IEC 60601 standards for a device. Returns applicable=false
 * (with empty sets) when the device is stated not to be electrically powered, and
 * applicable=null when that is not stated. A standard whose deciding fact is not
 * stated is listed in undeterminedStandards. 2026-10-15: every fact was read with
 * `!` / `!!`, so an omitted one answered "IEC 60601 does not apply" or dropped its
 * collateral as if stated absent.
 */
export function applicableElectricalStandards(facts: ElectricalDeviceFacts): ElectricalApplicability {
  if (facts.electricallyPowered === false) {
    return { applicable: false, standards: [], undeterminedStandards: [], testCategories: [], reviewerQuestions: [], notes: ['Not electrically powered — IEC 60601 does not apply.'] };
  }

  const standards: ElectricalStandard[] = [];
  const undeterminedStandards: UndeterminedElectricalStandard[] = [];
  for (const s of IEC_60601_STANDARDS) {
    const conditionFact = CONDITION_FACT[s.id];
    // A collateral whose condition is stated absent does not apply, powered or not.
    if (conditionFact && facts[conditionFact] === false) continue;
    const unstated = [
      ...(facts.electricallyPowered === undefined ? ['electricallyPowered'] : []),
      ...(conditionFact && facts[conditionFact] === undefined ? [conditionFact] : []),
    ];
    if (unstated.length === 0) standards.push(s);
    else undeterminedStandards.push({ id: s.id, code: s.code, title: s.title, applicability: `undetermined — ${unstated.join(' and ')} not stated` });
  }

  const notes: string[] = [];
  if (facts.hasParticularStandard) notes.push('A device-type particular standard (IEC 60601-2-xx) also applies — identify and test to it.');
  else if (facts.hasParticularStandard === undefined) notes.push('Whether a device-type particular standard (IEC 60601-2-xx) applies: undetermined — hasParticularStandard not stated.');

  if (facts.electricallyPowered !== true) {
    notes.unshift('Whether IEC 60601 applies: undetermined — electricallyPowered not stated.');
    return { applicable: null, standards, undeterminedStandards, testCategories: [], reviewerQuestions: [], notes };
  }
  return {
    applicable: true,
    standards,
    undeterminedStandards,
    testCategories: ELECTRICAL_TEST_CATEGORIES,
    reviewerQuestions: ELECTRICAL_REVIEWER_QUESTIONS,
    notes,
  };
}

export default { IEC_60601_STANDARDS, ELECTRICAL_TEST_CATEGORIES, applicableElectricalStandards };
