/**
 * Medical device software lifecycle (IEC 62304) — software safety classification
 * and the per-class lifecycle deliverables, with reviewer questions.
 *
 * WHY THIS EXISTS (audit gap): software documentation deficiencies are a common
 * device finding, but no IEC 62304 structure was modelled. This classifies software
 * into safety Class A/B/C and returns the lifecycle deliverables required for that
 * class (architecture/detailed design escalate with class), plus the reviewer's
 * software questions (SOUP, cybersecurity, V&V).
 *
 * HONESTY: reflects IEC 62304:2006+A1:2015 process structure + the FDA software/
 * cybersecurity guidance themes. It is the required deliverable set + reviewer
 * questions, not the V&V evidence itself.
 *
 * PURE + DETERMINISTIC: no DB, no network, no LLM.
 *
 * @module server/services/market-specs/software-lifecycle
 */

export type SoftwareSafetyClass = 'A' | 'B' | 'C';

export interface SoftwareClassification {
  class: SoftwareSafetyClass;
  rationale: string;
  caveat: string;
}

const SW_CAVEAT =
  'Per IEC 62304 §4.3: classification is determined after considering risk-control measures external to the software. Confirm against the software risk analysis.';

/**
 * Classify software into IEC 62304 safety class from the worst-case harm a software
 * failure could contribute to (after external risk controls).
 */
export function classifySoftware(facts: {
  canContributeToDeathOrSeriousInjury?: boolean;
  canContributeToNonSeriousInjury?: boolean;
}): SoftwareClassification {
  if (facts.canContributeToDeathOrSeriousInjury) {
    return { class: 'C', rationale: 'A software failure could contribute to death or SERIOUS injury.', caveat: SW_CAVEAT };
  }
  if (facts.canContributeToNonSeriousInjury) {
    return { class: 'B', rationale: 'A software failure could contribute to NON-serious injury.', caveat: SW_CAVEAT };
  }
  return { class: 'A', rationale: 'No injury or damage to health is possible from a software failure.', caveat: SW_CAVEAT };
}

export interface SoftwareDeliverable {
  id: string;
  clause: string;
  title: string;
  /** The safety classes for which the deliverable is required. */
  classes: SoftwareSafetyClass[];
}

/** IEC 62304 lifecycle deliverables, with the classes each applies to. */
export const SOFTWARE_DELIVERABLES: SoftwareDeliverable[] = [
  { id: 'development_plan', clause: '5.1', title: 'Software development plan', classes: ['A', 'B', 'C'] },
  { id: 'requirements', clause: '5.2', title: 'Software requirements specification', classes: ['A', 'B', 'C'] },
  { id: 'architecture', clause: '5.3', title: 'Software architectural design', classes: ['B', 'C'] },
  { id: 'detailed_design', clause: '5.4', title: 'Software detailed design', classes: ['C'] },
  { id: 'unit_implementation', clause: '5.5', title: 'Unit implementation and verification', classes: ['A', 'B', 'C'] },
  { id: 'integration_testing', clause: '5.6', title: 'Software integration and integration testing', classes: ['B', 'C'] },
  { id: 'system_testing', clause: '5.7', title: 'Software system testing', classes: ['A', 'B', 'C'] },
  { id: 'release', clause: '5.8', title: 'Software release (incl. known anomalies)', classes: ['A', 'B', 'C'] },
  { id: 'risk_management', clause: '7', title: 'Software risk management (incl. SOUP)', classes: ['A', 'B', 'C'] },
  { id: 'configuration_management', clause: '8', title: 'Software configuration management', classes: ['A', 'B', 'C'] },
  { id: 'problem_resolution', clause: '9', title: 'Software problem resolution', classes: ['A', 'B', 'C'] },
];

/** The reviewer's software questions (IEC 62304 + FDA software/cybersecurity themes). */
export const SOFTWARE_REVIEWER_QUESTIONS: string[] = [
  'Is the software safety classification (A/B/C) justified by the software risk analysis (after external risk controls)?',
  'Are SOUP (software of unknown provenance) items identified, with their requirements and known anomalies assessed?',
  'For Class B/C, is the architecture documented and segregation of safety-related items justified?',
  'Is verification traceable from requirements through system testing?',
  'Is cybersecurity addressed — threat model, an SBOM, and validated security controls?',
  'Is the software release accompanied by a documented list of residual/known anomalies and their risk evaluation?',
];

export function deliverablesForClass(cls: SoftwareSafetyClass): SoftwareDeliverable[] {
  return SOFTWARE_DELIVERABLES.filter((d) => d.classes.includes(cls));
}

export interface SoftwareDeliverableAssessment {
  class: SoftwareSafetyClass;
  ready: boolean;
  missing: string[];
  presentCount: number;
  totalRequired: number;
}

/** Assess which IEC 62304 deliverables for the class are present. */
export function assessSoftwareDeliverables(cls: SoftwareSafetyClass, presentDeliverableIds: string[]): SoftwareDeliverableAssessment {
  const present = new Set(presentDeliverableIds);
  const required = deliverablesForClass(cls);
  const missing = required.filter((d) => !present.has(d.id)).map((d) => d.id);
  return {
    class: cls,
    ready: missing.length === 0,
    missing,
    presentCount: required.length - missing.length,
    totalRequired: required.length,
  };
}

export default {
  classifySoftware,
  SOFTWARE_DELIVERABLES,
  SOFTWARE_REVIEWER_QUESTIONS,
  deliverablesForClass,
  assessSoftwareDeliverables,
};
