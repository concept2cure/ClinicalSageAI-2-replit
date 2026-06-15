/**
 * Trial Master File (TMF) completeness — inspection-readiness against the DIA
 * TMF Reference Model.
 *
 * An eTMF must hold the essential documents (ICH E6(R2) §8) organized to the DIA
 * TMF Reference Model's zones. This service encodes the 11 zones and their
 * essential artifacts and assesses a trial's filed artifacts against them —
 * surfacing the missing essential documents per zone before an inspection.
 * (This is the deterministic readiness core; full document management /
 * versioning is a separate concern.)
 *
 * Pure / deterministic — no DB, no IO.
 *
 * Reference: DIA Trial Master File Reference Model v3.x (zone/artifact taxonomy);
 * ICH E6(R2) §8 Essential Documents.
 *
 * @module server/services/etmf/tmf-completeness
 */

export interface TmfArtifact {
  /** Stable artifact code (e.g. 'protocol'). */
  code: string;
  name: string;
  /** Whether the artifact is an essential document (drives default readiness). */
  essential: boolean;
}

export interface TmfZone {
  /** Zone number (1–11). */
  number: number;
  name: string;
  artifacts: TmfArtifact[];
}

/** The DIA TMF Reference Model zones with their essential artifacts. */
export const TMF_REFERENCE_MODEL: TmfZone[] = [
  {
    number: 1,
    name: 'Trial Management',
    artifacts: [
      { code: 'tmf_plan', name: 'Trial Master File Plan', essential: true },
      { code: 'monitoring_plan', name: 'Monitoring Plan', essential: true },
      { code: 'recruitment_plan', name: 'Recruitment Plan', essential: false },
      { code: 'communication_plan', name: 'Communication Plan', essential: false },
      { code: 'risk_management_plan', name: 'Risk Management Plan', essential: false },
    ],
  },
  {
    number: 2,
    name: 'Central Trial Documents',
    artifacts: [
      { code: 'protocol', name: 'Protocol and amendments', essential: true },
      { code: 'investigators_brochure', name: "Investigator's Brochure", essential: true },
      { code: 'sample_crf', name: 'Sample Case Report Form', essential: true },
      { code: 'sample_icf', name: 'Sample Informed Consent Form', essential: true },
      { code: 'insurance', name: 'Insurance / indemnity', essential: false },
    ],
  },
  {
    number: 3,
    name: 'Regulatory',
    artifacts: [
      { code: 'regulatory_submission', name: 'Regulatory submission', essential: true },
      { code: 'regulatory_approval', name: 'Regulatory approval / authorisation', essential: true },
      { code: 'import_export_license', name: 'Import/export license', essential: false },
    ],
  },
  {
    number: 4,
    name: 'IRB / IEC and other Approvals',
    artifacts: [
      { code: 'irb_submission', name: 'IRB/IEC submission', essential: true },
      { code: 'irb_approval', name: 'IRB/IEC approval', essential: true },
      { code: 'irb_composition', name: 'IRB/IEC composition / roster', essential: true },
    ],
  },
  {
    number: 5,
    name: 'Site Management',
    artifacts: [
      { code: 'site_signature_sheet', name: 'Site signature/delegation log', essential: true },
      { code: 'investigator_cv', name: 'CV of the investigator', essential: true },
      { code: 'financial_disclosure', name: 'Financial disclosure form', essential: true },
      { code: 'site_training_records', name: 'Site training records', essential: false },
      { code: 'subject_log', name: 'Subject screening/enrolment log', essential: false },
    ],
  },
  {
    number: 6,
    name: 'IP and Trial Supplies',
    artifacts: [
      { code: 'ip_accountability', name: 'IP accountability records', essential: true },
      { code: 'ip_shipment', name: 'IP shipment records', essential: true },
      { code: 'ip_storage_temp', name: 'IP storage temperature records', essential: false },
      { code: 'ip_destruction', name: 'IP destruction records', essential: false },
    ],
  },
  {
    number: 7,
    name: 'Safety Reporting',
    artifacts: [
      { code: 'safety_management_plan', name: 'Safety Management Plan', essential: true },
      { code: 'sae_reports', name: 'SAE reports', essential: true },
      { code: 'susar_reports', name: 'SUSAR reports', essential: true },
      { code: 'safety_reports_to_irb', name: 'Safety report submissions to IRB/IEC', essential: false },
    ],
  },
  {
    number: 8,
    name: 'Central and Local Testing',
    artifacts: [
      { code: 'lab_certification', name: 'Laboratory certification/accreditation', essential: true },
      { code: 'lab_normal_ranges', name: 'Laboratory normal ranges', essential: true },
      { code: 'lab_manual', name: 'Laboratory manual', essential: false },
    ],
  },
  {
    number: 9,
    name: 'Third Parties',
    artifacts: [
      { code: 'vendor_contract', name: 'Vendor/CRO contract', essential: true },
      { code: 'vendor_qualification', name: 'Vendor qualification', essential: false },
      { code: 'vendor_oversight', name: 'Vendor oversight documentation', essential: false },
    ],
  },
  {
    number: 10,
    name: 'Data Management',
    artifacts: [
      { code: 'data_management_plan', name: 'Data Management Plan', essential: true },
      { code: 'crf_completion_guidelines', name: 'CRF completion guidelines', essential: false },
      { code: 'database_lock', name: 'Database lock documentation', essential: true },
    ],
  },
  {
    number: 11,
    name: 'Statistics',
    artifacts: [
      { code: 'sap', name: 'Statistical Analysis Plan', essential: true },
      { code: 'randomization_plan', name: 'Randomization plan', essential: false },
      { code: 'statistical_report', name: 'Statistical report', essential: true },
    ],
  },
];

export interface ZoneCompleteness {
  number: number;
  name: string;
  required: string[];
  present: string[];
  missing: string[];
  complete: boolean;
}

export interface TmfCompletenessResult {
  ready: boolean;
  /** 'essential' (default) checks only essential artifacts; 'all' checks every artifact. */
  scope: 'essential' | 'all';
  zones: ZoneCompleteness[];
  summary: {
    zoneCount: number;
    zonesComplete: number;
    totalRequired: number;
    totalMissing: number;
  };
}

export interface TmfCompletenessInput {
  /** Artifact codes filed in the TMF. */
  providedArtifacts: string[];
  /** Whether to require all artifacts or only essential ones (default 'essential'). */
  scope?: 'essential' | 'all';
}

/**
 * Assess a trial's filed artifacts against the TMF Reference Model.
 * `ready` is true only when every required artifact (per scope) is present in
 * every zone. Pure / deterministic.
 */
export function assessTmfCompleteness(input: TmfCompletenessInput): TmfCompletenessResult {
  const scope = input.scope === 'all' ? 'all' : 'essential';
  const provided = new Set((input.providedArtifacts ?? []).map(String));

  const zones: ZoneCompleteness[] = TMF_REFERENCE_MODEL.map((zone) => {
    const required = zone.artifacts.filter((a) => (scope === 'all' ? true : a.essential)).map((a) => a.code);
    const present = required.filter((c) => provided.has(c));
    const missing = required.filter((c) => !provided.has(c));
    return { number: zone.number, name: zone.name, required, present, missing, complete: missing.length === 0 };
  });

  const totalRequired = zones.reduce((n, z) => n + z.required.length, 0);
  const totalMissing = zones.reduce((n, z) => n + z.missing.length, 0);

  return {
    ready: zones.every((z) => z.complete),
    scope,
    zones,
    summary: {
      zoneCount: zones.length,
      zonesComplete: zones.filter((z) => z.complete).length,
      totalRequired,
      totalMissing,
    },
  };
}

/** The reference model (zones + artifacts) for a checklist UI. */
export function getTmfReferenceModel(): TmfZone[] {
  return TMF_REFERENCE_MODEL;
}
