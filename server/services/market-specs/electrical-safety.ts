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

export interface ElectricalApplicability {
  applicable: boolean;
  standards: ElectricalStandard[];
  testCategories: typeof ELECTRICAL_TEST_CATEGORIES;
  reviewerQuestions: string[];
  notes: string[];
}

/**
 * Resolve the applicable IEC 60601 standards for a device. Returns applicable=false
 * (with empty sets) when the device is not electrically powered.
 */
export function applicableElectricalStandards(facts: ElectricalDeviceFacts): ElectricalApplicability {
  if (!facts.electricallyPowered) {
    return { applicable: false, standards: [], testCategories: [], reviewerQuestions: [], notes: ['Not electrically powered — IEC 60601 does not apply.'] };
  }

  const conditionMet: Record<string, boolean> = {
    alarms: !!facts.hasAlarms,
    closed_loop: !!facts.closedLoopControl,
    home_use: !!facts.homeUse,
    ems: !!facts.emsUse,
  };

  const standards = IEC_60601_STANDARDS.filter((s) => s.applicability === 'always' || conditionMet[s.id]);
  const notes: string[] = [];
  if (facts.hasParticularStandard) notes.push('A device-type particular standard (IEC 60601-2-xx) also applies — identify and test to it.');

  return {
    applicable: true,
    standards,
    testCategories: ELECTRICAL_TEST_CATEGORIES,
    reviewerQuestions: ELECTRICAL_REVIEWER_QUESTIONS,
    notes,
  };
}

export default { IEC_60601_STANDARDS, ELECTRICAL_TEST_CATEGORIES, applicableElectricalStandards };
