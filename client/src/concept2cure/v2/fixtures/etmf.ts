/**
 * eTMF inspection-readiness -- DATA + deterministic core.
 *
 * Ported VERBATIM from concept2cure-v2:
 *   server/services/etmf/tmf-completeness.ts
 *     - TMF_REFERENCE_MODEL (DIA TMF Reference Model v3.x -- 11 zones,
 *       ICH E6(R2) section 8 essential documents; exact codes/names/essential)
 *     - assessTmfCompleteness({ providedArtifacts, scope }) -> result
 *   server/routes/etmf.routes.ts (mounted /api/etmf):
 *     GET  /reference-model
 *     POST /completeness                        { providedArtifacts, scope }
 *     POST /trials/:trialId/artifacts           { artifactCode, documentRef? }
 *     GET  /trials/:trialId/artifacts
 *     GET  /trials/:trialId/completeness?scope= -> TmfCompletenessResult
 *
 * GENERATED from the kit data file -- edit the kit first, then re-port.
 */

/* ---- Interfaces ---- */

export interface TmfArtifact {
  code: string;
  name: string;
  essential: boolean;
}

export interface TmfZone {
  number: number;
  name: string;
  artifacts: TmfArtifact[];
}

export interface TmfCompletenessInput {
  providedArtifacts?: string[];
  scope?: 'essential' | 'all';
}

export interface TmfCompletenessZone {
  number: number;
  name: string;
  required: string[];
  present: string[];
  missing: string[];
  complete: boolean;
}

export interface TmfCompletenessSummary {
  zoneCount: number;
  zonesComplete: number;
  totalRequired: number;
  totalMissing: number;
}

export interface TmfCompletenessResult {
  ready: boolean;
  scope: string;
  zones: TmfCompletenessZone[];
  summary: TmfCompletenessSummary;
}

export interface SampleTrial {
  trialId: string;
  title: string;
  sponsor: string;
  phase: string;
  sites: number;
  model: string;
  providedArtifacts: string[];
}

export interface FilingEntry {
  status: string;
  lagDays: number;
}

export interface TimelinessResult {
  onTime: number;
  late: number;
  lateList: { code: string; name: string; lagDays: number }[];
  worstLag: number;
  timely: boolean;
  threshold: number;
}

export interface QcResult {
  final: number;
  inQc: number;
  inQcList: { code: string; name: string; status: string }[];
  qcClean: boolean;
}

/* ---- The DIA TMF Reference Model zones with their essential artifacts ---- */
export const TMF_REFERENCE_MODEL: TmfZone[] = [
  { number: 1, name: 'Trial Management', artifacts: [
    { code: 'tmf_plan', name: 'Trial Master File Plan', essential: true },
    { code: 'monitoring_plan', name: 'Monitoring Plan', essential: true },
    { code: 'recruitment_plan', name: 'Recruitment Plan', essential: false },
    { code: 'communication_plan', name: 'Communication Plan', essential: false },
    { code: 'risk_management_plan', name: 'Risk Management Plan', essential: false },
  ] },
  { number: 2, name: 'Central Trial Documents', artifacts: [
    { code: 'protocol', name: 'Protocol and amendments', essential: true },
    { code: 'investigators_brochure', name: "Investigator's Brochure", essential: true },
    { code: 'sample_crf', name: 'Sample Case Report Form', essential: true },
    { code: 'sample_icf', name: 'Sample Informed Consent Form', essential: true },
    { code: 'insurance', name: 'Insurance / indemnity', essential: false },
  ] },
  { number: 3, name: 'Regulatory', artifacts: [
    { code: 'regulatory_submission', name: 'Regulatory submission', essential: true },
    { code: 'regulatory_approval', name: 'Regulatory approval / authorisation', essential: true },
    { code: 'import_export_license', name: 'Import/export license', essential: false },
  ] },
  { number: 4, name: 'IRB / IEC and other Approvals', artifacts: [
    { code: 'irb_submission', name: 'IRB/IEC submission', essential: true },
    { code: 'irb_approval', name: 'IRB/IEC approval', essential: true },
    { code: 'irb_composition', name: 'IRB/IEC composition / roster', essential: true },
  ] },
  { number: 5, name: 'Site Management', artifacts: [
    { code: 'site_signature_sheet', name: 'Site signature/delegation log', essential: true },
    { code: 'investigator_cv', name: 'CV of the investigator', essential: true },
    { code: 'financial_disclosure', name: 'Financial disclosure form', essential: true },
    { code: 'site_training_records', name: 'Site training records', essential: false },
    { code: 'subject_log', name: 'Subject screening/enrolment log', essential: false },
  ] },
  { number: 6, name: 'IP and Trial Supplies', artifacts: [
    { code: 'ip_accountability', name: 'IP accountability records', essential: true },
    { code: 'ip_shipment', name: 'IP shipment records', essential: true },
    { code: 'ip_storage_temp', name: 'IP storage temperature records', essential: false },
    { code: 'ip_destruction', name: 'IP destruction records', essential: false },
  ] },
  { number: 7, name: 'Safety Reporting', artifacts: [
    { code: 'safety_management_plan', name: 'Safety Management Plan', essential: true },
    { code: 'sae_reports', name: 'SAE reports', essential: true },
    { code: 'susar_reports', name: 'SUSAR reports', essential: true },
    { code: 'safety_reports_to_irb', name: 'Safety report submissions to IRB/IEC', essential: false },
  ] },
  { number: 8, name: 'Central and Local Testing', artifacts: [
    { code: 'lab_certification', name: 'Laboratory certification/accreditation', essential: true },
    { code: 'lab_normal_ranges', name: 'Laboratory normal ranges', essential: true },
    { code: 'lab_manual', name: 'Laboratory manual', essential: false },
  ] },
  { number: 9, name: 'Third Parties', artifacts: [
    { code: 'vendor_contract', name: 'Vendor/CRO contract', essential: true },
    { code: 'vendor_qualification', name: 'Vendor qualification', essential: false },
    { code: 'vendor_oversight', name: 'Vendor oversight documentation', essential: false },
  ] },
  { number: 10, name: 'Data Management', artifacts: [
    { code: 'data_management_plan', name: 'Data Management Plan', essential: true },
    { code: 'crf_completion_guidelines', name: 'CRF completion guidelines', essential: false },
    { code: 'database_lock', name: 'Database lock documentation', essential: true },
  ] },
  { number: 11, name: 'Statistics', artifacts: [
    { code: 'sap', name: 'Statistical Analysis Plan', essential: true },
    { code: 'randomization_plan', name: 'Randomization plan', essential: false },
    { code: 'statistical_report', name: 'Statistical report', essential: true },
  ] },
];

/* assessTmfCompleteness -- verbatim pure/deterministic port. */
export function assessTmfCompleteness(input?: TmfCompletenessInput): TmfCompletenessResult {
  const inp = input || {};
  const scope = inp.scope === 'all' ? 'all' : 'essential';
  const provided = new Set((inp.providedArtifacts || []).map(String));
  const zones: TmfCompletenessZone[] = TMF_REFERENCE_MODEL.map((zone) => {
    const required = zone.artifacts
      .filter((a) => (scope === 'all' ? true : a.essential))
      .map((a) => a.code);
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

/* artifact code -> friendly name (from the real reference model). */
export function tmfArtifactName(code: string): string {
  for (const z of TMF_REFERENCE_MODEL) {
    const a = z.artifacts.find((x) => x.code === code);
    if (a) return a.name;
  }
  return code;
}

/* ---- Sample trial state ---- */
export const ETMF_SAMPLE_TRIAL: SampleTrial = {
  trialId: 'BX301-301',
  title: 'BX-301 pivotal -- relapsed multiple myeloma (Phase 3)',
  sponsor: 'Concept2Cure Therapeutics',
  phase: 'Phase 3',
  sites: 42,
  model: 'DIA TMF Reference Model v3',
  providedArtifacts: [
    'tmf_plan', 'monitoring_plan',
    'protocol', 'investigators_brochure', 'sample_crf', 'sample_icf',
    'regulatory_submission', 'regulatory_approval',
    'irb_submission', 'irb_approval', 'irb_composition',
    'site_signature_sheet', 'investigator_cv', 'financial_disclosure',
    'ip_accountability', 'ip_shipment',
    'safety_management_plan', 'sae_reports', 'susar_reports',
    'lab_certification', 'lab_normal_ranges',
    'vendor_contract',
    'data_management_plan',
    'sap',
    /* also-filed optional artifacts (tracked, never dilute readiness) */
    'monitoring_plan', 'site_training_records', 'subject_log', 'ip_storage_temp', 'lab_manual',
  ],
};

/* ---- Timeliness + QC lenses ---- */
export const ETMF_FILINGS: Record<string, FilingEntry> = {
  tmf_plan: { status: 'final', lagDays: 6 }, monitoring_plan: { status: 'final', lagDays: 9 },
  protocol: { status: 'final', lagDays: 3 }, investigators_brochure: { status: 'final', lagDays: 5 },
  sample_crf: { status: 'final', lagDays: 12 }, sample_icf: { status: 'final', lagDays: 8 },
  regulatory_submission: { status: 'final', lagDays: 4 }, regulatory_approval: { status: 'final', lagDays: 7 },
  irb_submission: { status: 'final', lagDays: 11 }, irb_approval: { status: 'in_review', lagDays: 14 }, irb_composition: { status: 'final', lagDays: 19 },
  site_signature_sheet: { status: 'in_review', lagDays: 22 }, investigator_cv: { status: 'final', lagDays: 16 }, financial_disclosure: { status: 'final', lagDays: 61 },
  ip_accountability: { status: 'final', lagDays: 9 }, ip_shipment: { status: 'in_review', lagDays: 13 },
  safety_management_plan: { status: 'final', lagDays: 5 }, sae_reports: { status: 'final', lagDays: 2 }, susar_reports: { status: 'final', lagDays: 3 },
  lab_certification: { status: 'final', lagDays: 88 }, lab_normal_ranges: { status: 'final', lagDays: 20 },
  vendor_contract: { status: 'in_review', lagDays: 42 },
  data_management_plan: { status: 'final', lagDays: 15 }, sap: { status: 'final', lagDays: 7 },
};

/* Timeliness -- contemporaneous-filing read (>30 days late = a red flag). */
export function assessTmfTimeliness(
  provided?: string[],
  filings?: Record<string, FilingEntry>,
): TimelinessResult {
  const f = filings || ETMF_FILINGS;
  const LATE = 30;
  let onTime = 0;
  const late: { code: string; name: string; lagDays: number }[] = [];
  let worst = 0;
  (provided || []).forEach((code) => {
    const entry = f[code];
    if (!entry) return;
    if (entry.lagDays > LATE) {
      late.push({ code, name: tmfArtifactName(code), lagDays: entry.lagDays });
    } else {
      onTime++;
    }
    if (entry.lagDays > worst) worst = entry.lagDays;
  });
  late.sort((a, b) => b.lagDays - a.lagDays);
  return { onTime, late: late.length, lateList: late, worstLag: worst, timely: late.length === 0, threshold: LATE };
}

/* Quality -- QC lifecycle read (final = QC-complete; else awaiting QC). */
export function assessTmfQc(
  provided?: string[],
  filings?: Record<string, FilingEntry>,
): QcResult {
  const f = filings || ETMF_FILINGS;
  let finalCount = 0;
  const inQc: { code: string; name: string; status: string }[] = [];
  (provided || []).forEach((code) => {
    const entry = f[code];
    if (!entry) return;
    if (entry.status === 'final') finalCount++;
    else inQc.push({ code, name: tmfArtifactName(code), status: entry.status });
  });
  return { final: finalCount, inQc: inQc.length, inQcList: inQc, qcClean: inQc.length === 0 };
}
