/**
 * Companion diagnostics (CDx) co-development.
 *
 * The platform uniquely holds both the therapeutic (IND/NDA) and device sides,
 * yet had no linkage between them — the natural CDx differentiator. This module
 * validates the drug↔Dx linkage and scores contemporaneous-co-development
 * readiness against the elements FDA expects for a CDx (the IVD that selects
 * patients for a specific therapeutic product).
 *
 * Pure and deterministic.
 */

export const CDX_CODEVELOPMENT_ELEMENTS = [
  'therapeuticProductIdentified',
  'diagnosticDeviceIdentified',
  'biomarkerDefined',
  'intendedUseAlignment', // the Dx selects patients for the therapeutic
  'analyticalValidation',
  'clinicalValidation', // Dx clinical performance in the therapeutic's trial population
  'labelingCrossReference', // drug + Dx labels reference each other
  'contemporaneousReview', // drug and Dx reviewed contemporaneously
] as const;

export type CdxElement = (typeof CDX_CODEVELOPMENT_ELEMENTS)[number];

export interface CdxReadinessResult {
  /** 0–1 share of CDx co-development elements present. */
  readinessScore: number;
  present: CdxElement[];
  gaps: CdxElement[];
  /**
   * Whether the core drug↔Dx linkage is established (therapeutic + device +
   * biomarker + intended-use alignment). Without it there is no companion pair.
   */
  linkageEstablished: boolean;
  ready: boolean;
  framework: 'FDA CDx co-development';
}

const LINKAGE_CORE: CdxElement[] = [
  'therapeuticProductIdentified',
  'diagnosticDeviceIdentified',
  'biomarkerDefined',
  'intendedUseAlignment',
];

/** Assess companion-diagnostic co-development readiness and drug↔Dx linkage. */
export function assessCdxReadiness(
  elements: Partial<Record<CdxElement, boolean>>
): CdxReadinessResult {
  const present: CdxElement[] = [];
  const gaps: CdxElement[] = [];
  for (const e of CDX_CODEVELOPMENT_ELEMENTS) {
    if (elements[e] === true) present.push(e);
    else gaps.push(e);
  }
  const linkageEstablished = LINKAGE_CORE.every(e => elements[e] === true);
  return {
    readinessScore: present.length / CDX_CODEVELOPMENT_ELEMENTS.length,
    present,
    gaps,
    linkageEstablished,
    ready: gaps.length === 0,
    framework: 'FDA CDx co-development',
  };
}
