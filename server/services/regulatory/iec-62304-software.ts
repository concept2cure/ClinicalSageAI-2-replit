/**
 * Software lifecycle (IEC 62304) + premarket cybersecurity engine.
 *
 * Pure and deterministic. Closes the audit gap "Software lifecycle (IEC 62304)
 * & cybersecurity — absent": there was SaMD classification but no software
 * safety class, SDLC artifact completeness, SBOM/SOUP management, or FDA
 * premarket-cybersecurity (SPDF) assessment.
 *
 * Backbone:
 *   - IEC 62304:2006+A1:2015 §4.3 — software safety classification (A/B/C)
 *   - IEC 62304 §5 — development process artifacts per safety class
 *   - IEC 62304 §8 — SOUP / configuration management
 *   - FDA "Cybersecurity in Medical Devices" (2023) — Secure Product
 *     Development Framework (SPDF), SBOM, threat modeling
 *   - AAMI TIR57 — security risk management
 */

// ─────────────────────────────────────────────────────────────────────────────
// IEC 62304 software safety classification
// ─────────────────────────────────────────────────────────────────────────────

export type SoftwareSafetyClass = 'A' | 'B' | 'C';

export interface SafetyClassInput {
  /** Can a software failure contribute to a hazardous situation? */
  canContributeToHazard: boolean;
  /**
   * Worst-case harm if the hazard is not controlled by external measures:
   *  - 'none'         → Class A
   *  - 'non_serious'  → Class B
   *  - 'serious_death'→ Class C
   */
  worstCaseHarm: 'none' | 'non_serious' | 'serious_death';
  /** Whether an external (hardware/independent) risk control removes the hazard. */
  externalRiskControlRemovesHazard: boolean;
}

export interface SafetyClassResult {
  safetyClass: SoftwareSafetyClass;
  rationale: string;
}

/** Classify software safety class per IEC 62304 §4.3 (incl. A1:2015 logic). */
export function classifySoftwareSafety(input: SafetyClassInput): SafetyClassResult {
  if (!input.canContributeToHazard) {
    return { safetyClass: 'A', rationale: 'Software cannot contribute to a hazardous situation.' };
  }
  // If an external measure removes the hazard, the contribution is mitigated to A.
  if (input.externalRiskControlRemovesHazard) {
    return {
      safetyClass: 'A',
      rationale: 'Hazardous situation is removed by an external (independent) risk control.',
    };
  }
  if (input.worstCaseHarm === 'serious_death') {
    return { safetyClass: 'C', rationale: 'Failure can result in death or serious injury.' };
  }
  if (input.worstCaseHarm === 'non_serious') {
    return { safetyClass: 'B', rationale: 'Failure can result in non-serious injury.' };
  }
  return { safetyClass: 'A', rationale: 'Failure cannot result in injury.' };
}

// ─────────────────────────────────────────────────────────────────────────────
// SDLC artifact completeness
// ─────────────────────────────────────────────────────────────────────────────

export const SDLC_ARTIFACTS = [
  'development_plan', // §5.1
  'software_requirements', // §5.2
  'architecture', // §5.3 (B/C)
  'detailed_design', // §5.4 (C)
  'unit_implementation_verification', // §5.5 (B/C verification)
  'integration_testing', // §5.6 (B/C)
  'system_testing', // §5.7
  'release', // §5.8
  'configuration_management', // §8
  'problem_resolution', // §9
] as const;
export type SdlcArtifact = (typeof SDLC_ARTIFACTS)[number];

/** Artifacts required by safety class (A is a subset; C requires all). */
const REQUIRED_BY_CLASS: Record<SoftwareSafetyClass, SdlcArtifact[]> = {
  A: ['development_plan', 'software_requirements', 'system_testing', 'release', 'configuration_management', 'problem_resolution'],
  B: [
    'development_plan', 'software_requirements', 'architecture',
    'unit_implementation_verification', 'integration_testing', 'system_testing',
    'release', 'configuration_management', 'problem_resolution',
  ],
  C: [...SDLC_ARTIFACTS],
};

export interface SdlcCompleteness {
  safetyClass: SoftwareSafetyClass;
  required: SdlcArtifact[];
  present: SdlcArtifact[];
  missing: SdlcArtifact[];
  completenessScore: number;
  compliant: boolean;
}

/** Assess SDLC artifact completeness for the given safety class. */
export function assessSdlcCompleteness(
  safetyClass: SoftwareSafetyClass,
  presentArtifacts: SdlcArtifact[]
): SdlcCompleteness {
  const required = REQUIRED_BY_CLASS[safetyClass];
  const presentSet = new Set(presentArtifacts);
  const present = required.filter(a => presentSet.has(a));
  const missing = required.filter(a => !presentSet.has(a));
  return {
    safetyClass,
    required,
    present,
    missing,
    completenessScore: required.length === 0 ? 1 : present.length / required.length,
    compliant: missing.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOUP / SBOM
// ─────────────────────────────────────────────────────────────────────────────

export interface SoupComponent {
  name: string;
  version: string;
  /** Whether functional + performance requirements for the SOUP are documented (§8.1.2). */
  requirementsDocumented: boolean;
  /** Whether known anomalies / CVEs have been evaluated (§7.1.3, cybersecurity). */
  anomaliesEvaluated: boolean;
  /** Count of unresolved known vulnerabilities. */
  knownVulnerabilities?: number;
}

export interface SbomAssessment {
  componentCount: number;
  /** SOUP items missing documented requirements. */
  missingRequirements: string[];
  /** SOUP items with unevaluated anomalies/CVEs. */
  unevaluatedAnomalies: string[];
  totalKnownVulnerabilities: number;
  /** Whether the SBOM is complete enough for an FDA submission. */
  submissionReady: boolean;
}

/** Assess a SOUP/SBOM list per IEC 62304 §8 and FDA SBOM expectations. */
export function assessSbom(components: SoupComponent[]): SbomAssessment {
  const missingRequirements = components.filter(c => !c.requirementsDocumented).map(c => `${c.name}@${c.version}`);
  const unevaluatedAnomalies = components.filter(c => !c.anomaliesEvaluated).map(c => `${c.name}@${c.version}`);
  const totalKnownVulnerabilities = components.reduce((s, c) => s + (c.knownVulnerabilities ?? 0), 0);
  return {
    componentCount: components.length,
    missingRequirements,
    unevaluatedAnomalies,
    totalKnownVulnerabilities,
    submissionReady:
      components.length > 0 &&
      missingRequirements.length === 0 &&
      unevaluatedAnomalies.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FDA premarket cybersecurity (SPDF)
// ─────────────────────────────────────────────────────────────────────────────

export const CYBERSECURITY_ELEMENTS = [
  'threat_model', // STRIDE / data-flow threat model
  'security_risk_assessment', // AAMI TIR57 security risk management
  'sbom', // software bill of materials
  'vulnerability_management_plan', // coordinated disclosure + patching
  'security_architecture', // security views / trust boundaries
  'penetration_testing', // security testing evidence
  'security_controls', // authentication, encryption, integrity
  'security_labeling', // customer security documentation
] as const;
export type CybersecurityElement = (typeof CYBERSECURITY_ELEMENTS)[number];

export interface CybersecurityAssessment {
  present: CybersecurityElement[];
  missing: CybersecurityElement[];
  completenessScore: number;
  /** RTA-blocking elements for an FDA premarket cybersecurity review. */
  blockers: string[];
  submissionReady: boolean;
}

const CYBER_RTA_CRITICAL: CybersecurityElement[] = [
  'threat_model',
  'security_risk_assessment',
  'sbom',
  'vulnerability_management_plan',
];

/** Assess FDA SPDF / premarket cybersecurity documentation completeness. */
export function assessCybersecurity(
  presentElements: CybersecurityElement[]
): CybersecurityAssessment {
  const presentSet = new Set(presentElements);
  const present = CYBERSECURITY_ELEMENTS.filter(e => presentSet.has(e));
  const missing = CYBERSECURITY_ELEMENTS.filter(e => !presentSet.has(e));
  const blockers = CYBER_RTA_CRITICAL.filter(e => !presentSet.has(e)).map(
    e => `Missing RTA-critical cybersecurity element: ${e}`
  );
  return {
    present,
    missing,
    completenessScore: present.length / CYBERSECURITY_ELEMENTS.length,
    blockers,
    submissionReady: blockers.length === 0,
  };
}
