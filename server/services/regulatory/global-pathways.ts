/**
 * Global IVD market-access pathway descriptors + readiness.
 *
 * Pure and deterministic. Closes the audit gap "global breadth beyond US/EU":
 * there was a PMDA shōnin engine but no structured Health Canada, NMPA, ANVISA,
 * TGA, or MDSAP coverage for IVDs.
 *
 * Each descriptor captures the authority, the submission instrument, whether a
 * local in-country representative is required, and whether MDSAP / a quality
 * certificate can be leveraged. The readiness function scores a device's
 * documentation set against a jurisdiction's core requirements.
 */

export type Jurisdiction =
  | 'ca_health_canada'
  | 'cn_nmpa'
  | 'br_anvisa'
  | 'au_tga'
  | 'mdsap';

export interface PathwayDescriptor {
  jurisdiction: Jurisdiction;
  authority: string;
  instrument: string;
  localRepresentativeRequired: boolean;
  /** Whether MDSAP certification is accepted/leveraged by this authority. */
  mdsapLeverage: boolean;
  /** Core documentation requirements (used by the readiness scorer). */
  coreRequirements: string[];
  notes: string;
}

export const PATHWAYS: Record<Jurisdiction, PathwayDescriptor> = {
  ca_health_canada: {
    jurisdiction: 'ca_health_canada',
    authority: 'Health Canada',
    instrument: 'Medical Device Licence (MDL) — IVDD risk classes I–IV',
    localRepresentativeRequired: false,
    mdsapLeverage: true,
    coreRequirements: [
      'device_classification',
      'iso_13485_mdsap_certificate',
      'safety_effectiveness_evidence',
      'labelling',
      'quality_plan',
    ],
    notes: 'MDSAP certificate is mandatory for Class II–IV MDL applications.',
  },
  cn_nmpa: {
    jurisdiction: 'cn_nmpa',
    authority: "China NMPA (National Medical Products Administration)",
    instrument: 'IVD registration (Class I filing / Class II–III registration)',
    localRepresentativeRequired: true,
    mdsapLeverage: false,
    coreRequirements: [
      'device_classification',
      'type_testing_chinese_lab',
      'clinical_evaluation_or_trial',
      'chinese_labelling',
      'local_agent',
      'quality_system',
    ],
    notes: 'Type testing typically required at an NMPA-recognised Chinese laboratory; local clinical data often expected.',
  },
  br_anvisa: {
    jurisdiction: 'br_anvisa',
    authority: 'Brazil ANVISA',
    instrument: 'Registro / Cadastro (risk-based)',
    localRepresentativeRequired: true,
    mdsapLeverage: true,
    coreRequirements: [
      'device_classification',
      'bgmp_or_mdsap_certificate',
      'safety_effectiveness_evidence',
      'portuguese_labelling',
      'brazil_registration_holder',
    ],
    notes: 'MDSAP accepted in lieu of B-GMP inspection for many device classes.',
  },
  au_tga: {
    jurisdiction: 'au_tga',
    authority: 'Australia TGA',
    instrument: 'ARTG inclusion (IVD classes 1–4)',
    localRepresentativeRequired: true,
    mdsapLeverage: true,
    coreRequirements: [
      'device_classification',
      'conformity_assessment_evidence',
      'iso_13485_certificate',
      'australian_sponsor',
      'labelling',
    ],
    notes: 'EU/MDSAP conformity-assessment evidence can support TGA inclusion; an Australian sponsor is required.',
  },
  mdsap: {
    jurisdiction: 'mdsap',
    authority: 'MDSAP (AU, BR, CA, JP, US)',
    instrument: 'Single QMS audit certificate (ISO 13485 + jurisdictional requirements)',
    localRepresentativeRequired: false,
    mdsapLeverage: true,
    coreRequirements: [
      'iso_13485_qms',
      'management_process',
      'design_development_process',
      'capa_process',
      'production_service_controls',
    ],
    notes: 'One audit recognised by five regulators; foundational to CA/BR/AU pathways above.',
  },
};

export interface PathwayReadinessResult {
  jurisdiction: Jurisdiction;
  authority: string;
  present: string[];
  missing: string[];
  readinessScore: number;
  ready: boolean;
  localRepresentativeRequired: boolean;
  mdsapLeverage: boolean;
}

/** Score a device's available documentation against a jurisdiction's requirements. */
export function assessPathwayReadiness(
  jurisdiction: Jurisdiction,
  availableDocuments: string[]
): PathwayReadinessResult {
  const descriptor = PATHWAYS[jurisdiction];
  const have = new Set(availableDocuments);
  const present = descriptor.coreRequirements.filter(r => have.has(r));
  const missing = descriptor.coreRequirements.filter(r => !have.has(r));
  return {
    jurisdiction,
    authority: descriptor.authority,
    present,
    missing,
    readinessScore: descriptor.coreRequirements.length === 0
      ? 1
      : present.length / descriptor.coreRequirements.length,
    ready: missing.length === 0,
    localRepresentativeRequired: descriptor.localRepresentativeRequired,
    mdsapLeverage: descriptor.mdsapLeverage,
  };
}

/** List all supported global pathway descriptors. */
export function listPathways(): PathwayDescriptor[] {
  return Object.values(PATHWAYS);
}
