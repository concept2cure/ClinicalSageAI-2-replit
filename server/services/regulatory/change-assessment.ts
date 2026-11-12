/**
 * Change-management decision engine.
 *
 * Pure and deterministic. Closes the audit gap "change management & regulatory
 * maintenance — partial": there was predicate-obsolescence monitoring but no
 * decision engine for whether a change needs a new submission or can be
 * documented in a Letter-to-File, and no EU "significant change" assessment.
 *
 * Backbone:
 *   - FDA "Deciding When to Submit a 510(k) for a Change to an Existing Device"
 *     (2017) — labeling, technology/engineering/performance, materials flows
 *   - FDA "Deciding When to Submit a 510(k) for a Software Change" (2017)
 *   - EU MDCG 2020-3 / IVDR Article 110(3) — "significant change" criteria
 *
 * 2026-11-12 (P-122): every input is a question a person answers yes or no, and neither engine checked one. An
 * unanswered question read as "no": with no answers at all the FDA engine returned letter_to_file and the EU engine
 * significant: false, and 'false' (text) read as yes. Each is now refused by field (ComputationRefusal), as the
 * other IVD lifecycle engines refuse an unstated input. The questions are the shared vocabulary's
 * (shared/regulatory/change-control-taxonomy.ts DEVICE_CHANGE_QUESTIONS), and each engine's rules carry a version.
 */

import { refuseUnlessStated } from '../ana-biostats/computation-engine';
import { DEVICE_CHANGE_QUESTIONS, type DeviceChangeFact } from '../../../shared/regulatory/change-control-taxonomy';

/** A only when A and B are the same set of keys: a list typed with it does not compile once they differ. */
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? A : never) : never;

/** Refuses, naming each one, the questions with no yes-or-no answer. Nothing stands in for an answer. */
function refuseUnanswered(fn: string, input: unknown, facts: readonly string[]): void {
  const given = (input ?? {}) as Partial<Record<string, unknown>>;
  refuseUnlessStated(fn, facts.map((field) => ({
    field, value: given[field], ok: typeof given[field] === 'boolean', expected: 'true or false',
  })), 'assessed');
}

/**
 * The version of each engine's rules, kept with a verdict wherever one is recorded (a Quality change record keeps
 * it, server/services/qms/changeControl.service.ts). It names the guidance and the revision of these rules.
 * __tests__/change-assessment.test.ts pins every answer set's outcome to it: a decision, rationale or trigger that
 * changes without a new version fails there.
 */
export const FDA_CHANGE_RULES = 'fda-510k-change-2017/1';
export const EU_CHANGE_RULES = 'mdcg-2020-3/1';

// ─────────────────────────────────────────────────────────────────────────────
// FDA 510(k) change decision
// ─────────────────────────────────────────────────────────────────────────────

export interface FdaChangeInput {
  /** Does the change affect the indications for use / intended use? */
  affectsIndicationsForUse: boolean;
  /** Could the change significantly affect safety or effectiveness? */
  couldSignificantlyAffectSafetyOrEffectiveness: boolean;
  /** Change to control mechanism, operating principle, or energy type? */
  changesControlMechanismOrOperatingPrinciple: boolean;
  /** Change in materials with body/patient contact or new chemical risk? */
  changesPatientContactingMaterials: boolean;
  /** Software change that introduces a new risk or modifies an existing risk control? */
  softwareChangeAffectsRisk: boolean;
  /** Risk-based assessment concluded new risks or significantly modified existing risks? */
  riskAssessmentShowsNewOrModifiedRisk: boolean;
  /**
   * If documentation/testing can demonstrate the change does NOT significantly
   * affect S&E (e.g., verification passes within existing specs).
   */
  verificationDemonstratesEquivalence: boolean;
}

export type ChangeDecision = 'letter_to_file' | 'new_510k' | 'pma_supplement_or_de_novo';

export interface FdaChangeResult {
  decision: ChangeDecision;
  rationale: string;
  /** The specific flowchart triggers that drove the decision. */
  triggers: string[];
}

/** The engine's inputs: exactly the questions asked of a person for the US, in the order they are asked. */
export const FDA_CHANGE_FACTS: readonly Exactly<keyof FdaChangeInput, DeviceChangeFact<'us'>>[] =
  DEVICE_CHANGE_QUESTIONS.us.map((q) => q.key);

/** Apply the FDA "Deciding When to Submit a 510(k) for a Change" logic. */
export function assessFdaChange(input: FdaChangeInput): FdaChangeResult {
  refuseUnanswered('assessFdaChange', input, FDA_CHANGE_FACTS);
  const triggers: string[] = [];

  if (input.affectsIndicationsForUse) {
    triggers.push('Change affects the indications for use / intended use.');
  }
  if (input.changesControlMechanismOrOperatingPrinciple) {
    triggers.push('Change to control mechanism, operating principle, or energy type.');
  }
  if (input.changesPatientContactingMaterials) {
    triggers.push('Change to patient-contacting materials.');
  }
  if (input.softwareChangeAffectsRisk) {
    triggers.push('Software change introduces or modifies a risk control.');
  }
  if (input.riskAssessmentShowsNewOrModifiedRisk) {
    triggers.push('Risk assessment shows new or significantly modified risks.');
  }
  if (input.couldSignificantlyAffectSafetyOrEffectiveness) {
    triggers.push('Change could significantly affect safety or effectiveness.');
  }

  // Intended-use change is the strongest trigger — may exceed 510(k) entirely.
  if (input.affectsIndicationsForUse) {
    return {
      decision: 'pma_supplement_or_de_novo',
      rationale:
        'A change to indications/intended use generally requires a new submission and may exceed the original device type; evaluate De Novo/PMA implications.',
      triggers,
    };
  }

  const hardTriggers =
    input.changesControlMechanismOrOperatingPrinciple ||
    input.riskAssessmentShowsNewOrModifiedRisk ||
    input.couldSignificantlyAffectSafetyOrEffectiveness;

  if (hardTriggers && !input.verificationDemonstratesEquivalence) {
    return {
      decision: 'new_510k',
      rationale:
        'The change could significantly affect safety/effectiveness and verification has not demonstrated equivalence; a new 510(k) is indicated.',
      triggers,
    };
  }

  if (triggers.length === 0) {
    return {
      decision: 'letter_to_file',
      rationale: 'No flowchart trigger is met; document the change in a Letter-to-File.',
      triggers,
    };
  }

  return {
    decision: 'letter_to_file',
    rationale:
      'Triggers were considered but verification/risk analysis demonstrates the change does not significantly affect safety or effectiveness; document the rationale and supporting V&V in a Letter-to-File.',
    triggers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EU MDR/IVDR "significant change" (Article 110(3) / MDCG 2020-3)
// ─────────────────────────────────────────────────────────────────────────────

export interface EuSignificantChangeInput {
  changesIntendedPurpose: boolean;
  /** New or modified design/performance characteristics outside original spec. */
  changesDesignOrPerformanceOutsideSpec: boolean;
  /** Change to sterilisation method or to materials. */
  changesSterilisationOrMaterials: boolean;
  /** Software change beyond bug-fix/security/cybersecurity that affects diagnosis. */
  significantSoftwareChange: boolean;
  /** Addition or modification of an operating principle / new actuation. */
  newOperatingPrinciple: boolean;
}

export interface EuSignificantChangeResult {
  significant: boolean;
  rationale: string;
  triggers: string[];
}

/** The engine's inputs: exactly the questions asked of a person for the EU, in the order they are asked. */
export const EU_CHANGE_FACTS: readonly Exactly<keyof EuSignificantChangeInput, DeviceChangeFact<'eu'>>[] =
  DEVICE_CHANGE_QUESTIONS.eu.map((q) => q.key);

/** Apply EU MDCG 2020-3 significant-change logic (transitional-provision lens). */
export function assessEuSignificantChange(
  input: EuSignificantChangeInput
): EuSignificantChangeResult {
  refuseUnanswered('assessEuSignificantChange', input, EU_CHANGE_FACTS);
  const triggers: string[] = [];
  if (input.changesIntendedPurpose) triggers.push('Change of intended purpose.');
  if (input.changesDesignOrPerformanceOutsideSpec) {
    triggers.push('Design/performance change outside originally approved specifications.');
  }
  if (input.changesSterilisationOrMaterials) triggers.push('Change to sterilisation or materials.');
  if (input.significantSoftwareChange) triggers.push('Significant software change affecting diagnosis/therapy.');
  if (input.newOperatingPrinciple) triggers.push('New operating principle or actuation.');

  const significant = triggers.length > 0;
  return {
    significant,
    rationale: significant
      ? 'At least one MDCG 2020-3 significant-change criterion is met; the change is significant and affects transitional-provision eligibility / requires notified-body assessment.'
      : 'No significant-change criterion is met; the change is non-significant.',
    triggers,
  };
}
