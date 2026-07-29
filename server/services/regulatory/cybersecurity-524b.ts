/**
 * Premarket cybersecurity for cyber devices — FDA FD&C Act §524B.
 *
 * Two deterministic assessors a §524B submission needs and that the platform did
 * not provide:
 *   - SBOM completeness against the NTIA minimum elements (supplier, component
 *     name, version, unique identifier, plus document author + timestamp and
 *     dependency relationships), with a per-component gap list.
 *   - §524B readiness: presence of the required cybersecurity artifacts (SBOM,
 *     threat model, vulnerability-management plan, security testing, secure-by-
 *     design evidence, coordinated-disclosure policy, patchability plan, security
 *     risk assessment) → a readiness score and gap list.
 *
 * Pure and deterministic.
 */

// ── SBOM completeness (NTIA minimum elements) ────────────────────────────────

export interface SbomComponent {
  componentName?: string;
  version?: string;
  supplier?: string;
  /** Unique identifier — CPE, PURL, or SWID. */
  uniqueIdentifier?: string;
  /** Known vulnerability identifiers (e.g. CVE-2024-1234) for this component. */
  knownVulnerabilities?: string[];
}

export interface SbomInput {
  components: SbomComponent[];
  /** SBOM author (document-level NTIA element). */
  author?: string;
  /** SBOM timestamp (document-level NTIA element). */
  timestamp?: string;
  /** Whether dependency relationships between components are documented. */
  dependencyRelationshipsDocumented?: boolean;
}

export interface SbomComponentGap {
  index: number;
  componentName: string;
  missingFields: string[];
}

export interface SbomCompletenessResult {
  /** 0–1 completeness over all required component + document elements. */
  completenessScore: number;
  componentCount: number;
  componentGaps: SbomComponentGap[];
  /** Document-level NTIA elements that are missing. */
  documentGaps: string[];
  /** Components carrying at least one known vulnerability. */
  vulnerableComponents: string[];
  totalKnownVulnerabilities: number;
  framework: 'FDA §524B / NTIA minimum elements';
}

const COMPONENT_FIELDS: (keyof SbomComponent)[] = [
  'componentName',
  'version',
  'supplier',
  'uniqueIdentifier',
];

function present(v: unknown): boolean {
  return typeof v === 'string' ? v.trim().length > 0 : v != null;
}

/** Score an SBOM against the NTIA minimum elements. */
export function scoreSbomCompleteness(input: SbomInput): SbomCompletenessResult {
  if (!input.components || input.components.length === 0) {
    throw new Error('SBOM requires at least one component.');
  }
  let presentCount = 0;
  let requiredCount = 0;
  const componentGaps: SbomComponentGap[] = [];
  const vulnerableComponents: string[] = [];
  let totalKnownVulnerabilities = 0;

  input.components.forEach((c, index) => {
    const missing: string[] = [];
    for (const f of COMPONENT_FIELDS) {
      requiredCount++;
      if (present(c[f])) presentCount++;
      else missing.push(f);
    }
    if (missing.length > 0) {
      componentGaps.push({ index, componentName: c.componentName ?? `component[${index}]`, missingFields: missing });
    }
    if (c.knownVulnerabilities && c.knownVulnerabilities.length > 0) {
      vulnerableComponents.push(c.componentName ?? `component[${index}]`);
      totalKnownVulnerabilities += c.knownVulnerabilities.length;
    }
  });

  // Document-level elements: author, timestamp, dependency relationships.
  const documentGaps: string[] = [];
  const docElements: [string, boolean][] = [
    ['author', present(input.author)],
    ['timestamp', present(input.timestamp)],
    ['dependencyRelationships', input.dependencyRelationshipsDocumented === true],
  ];
  for (const [name, ok] of docElements) {
    requiredCount++;
    if (ok) presentCount++;
    else documentGaps.push(name);
  }

  return {
    completenessScore: presentCount / requiredCount,
    componentCount: input.components.length,
    componentGaps,
    documentGaps,
    vulnerableComponents,
    totalKnownVulnerabilities,
    framework: 'FDA §524B / NTIA minimum elements',
  };
}

// ── §524B readiness ──────────────────────────────────────────────────────────

export const CYBER_524B_ARTIFACTS = [
  'sbom',
  'threatModel',
  'vulnerabilityManagementPlan',
  'securityTesting',
  'secureByDesign',
  'coordinatedDisclosurePolicy',
  'patchabilityPlan',
  'securityRiskAssessment',
] as const;

export type Cyber524bArtifact = (typeof CYBER_524B_ARTIFACTS)[number];

export interface Cyber524bReadinessResult {
  /** 0–1 share of required §524B artifacts present. */
  readinessScore: number;
  present: Cyber524bArtifact[];
  gaps: Cyber524bArtifact[];
  ready: boolean;
  framework: 'FDA FD&C Act §524B';
}

/** Assess §524B premarket-cybersecurity submission readiness. */
export function assess524bReadiness(
  artifacts: Partial<Record<Cyber524bArtifact, boolean>>
): Cyber524bReadinessResult {
  const present: Cyber524bArtifact[] = [];
  const gaps: Cyber524bArtifact[] = [];
  for (const a of CYBER_524B_ARTIFACTS) {
    if (artifacts[a] === true) present.push(a);
    else gaps.push(a);
  }
  return {
    readinessScore: present.length / CYBER_524B_ARTIFACTS.length,
    present,
    gaps,
    ready: gaps.length === 0,
    framework: 'FDA FD&C Act §524B',
  };
}
