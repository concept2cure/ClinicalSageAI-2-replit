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
 */

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

/** Apply the FDA "Deciding When to Submit a 510(k) for a Change" logic. */
export function assessFdaChange(input: FdaChangeInput): FdaChangeResult {
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

/** Apply EU MDCG 2020-3 significant-change logic (transitional-provision lens). */
export function assessEuSignificantChange(
  input: EuSignificantChangeInput
): EuSignificantChangeResult {
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
