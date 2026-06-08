/**
 * CER Conformance Validator
 *
 * Deterministic completeness/structure conformance checklist for an EU
 * Clinical Evaluation Report, executed against the ACTUAL report content (not a
 * fabricated verdict). It checks that the mandatory CER elements required by
 * MEDDEV 2.7/1 rev 4 and MDR 2017/745 Annex XIV (Part A) / Annex I (GSPR) — or
 * the IVDR 2017/746 Annex XIII performance-evaluation equivalents — are present
 * and non-empty.
 *
 * Scope (honest): this is a structural/completeness conformance check. It does
 * NOT assess the scientific adequacy of the clinical evidence or sufficiency of
 * the benefit-risk determination — those require expert clinical judgement. A
 * `valid: true` here means every MANDATORY element is present, not that the CER
 * would pass a Notified Body review.
 */

export type CerRegulatoryFramework =
  | 'MDR_2017_745'
  | 'IVDR_2017_746'
  | 'UK_MDR_2002'
  | 'Swiss_MedDO';

export interface CerConformanceCheck {
  id: string;
  requirement: string;
  reference: string;
  severity: 'mandatory' | 'recommended';
  status: 'pass' | 'fail';
  detail: string;
}

export interface CerConformanceResult {
  valid: boolean;
  framework: string;
  checkedAt: string;
  checks: CerConformanceCheck[];
  summary: { total: number; passed: number; failed: number; mandatoryFailed: number };
}

/** A CER report shape — only the fields the validator inspects. */
export interface CerReportLike {
  regulatoryFramework?: string | null;
  deviceName?: string | null;
  deviceClass?: string | null;
  executiveSummary?: unknown;
  deviceDescription?: unknown;
  essentialRequirements?: unknown;
  clinicalBackground?: unknown;
  clinicalEvidence?: unknown;
  literatureReview?: unknown;
  riskBenefitAnalysis?: unknown;
  conclusions?: unknown;
}

/** True when a value carries real content (non-empty string / non-empty object/array). */
function hasContent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as object).length > 0;
  return true; // numbers/booleans count as present
}

const IS_IVDR = (fw?: string | null): boolean => fw === 'IVDR_2017_746';

/**
 * Run the conformance checklist against a CER report.
 */
export function validateCerConformance(cer: CerReportLike): CerConformanceResult {
  const fw = cer.regulatoryFramework ?? 'unknown';
  const ivdr = IS_IVDR(fw);
  const evalRef = ivdr
    ? 'IVDR 2017/746 Annex XIII (Performance Evaluation)'
    : 'MDR 2017/745 Annex XIV Part A / MEDDEV 2.7/1 rev 4';

  const spec: Array<Omit<CerConformanceCheck, 'status'> & { ok: boolean }> = [
    {
      id: 'framework',
      requirement: 'Regulatory framework is declared',
      reference: 'MDR 2017/745 / IVDR 2017/746',
      severity: 'mandatory',
      ok: hasContent(cer.regulatoryFramework) && fw !== 'unknown',
      detail: 'The applicable regulatory framework must be recorded on the report.',
    },
    {
      id: 'device_identification',
      requirement: 'Device is identified (name and class)',
      reference: `${evalRef} — device identification`,
      severity: 'mandatory',
      ok: hasContent(cer.deviceName) && hasContent(cer.deviceClass),
      detail: 'Device name and risk class must be present.',
    },
    {
      id: 'executive_summary',
      requirement: 'Executive summary is present',
      reference: 'MEDDEV 2.7/1 rev 4 §7',
      severity: 'mandatory',
      ok: hasContent(cer.executiveSummary),
      detail: 'A summary of the clinical evaluation and its conclusion is required.',
    },
    {
      id: 'device_description',
      requirement: 'Device description and intended purpose are present',
      reference: ivdr ? 'IVDR Annex XIII §1.1' : 'MDR Annex XIV Part A(1)(a)',
      severity: 'mandatory',
      ok: hasContent(cer.deviceDescription),
      detail: 'Description, intended purpose and indications must be documented.',
    },
    {
      id: 'clinical_background',
      requirement: 'Clinical background / state of the art is present',
      reference: 'MEDDEV 2.7/1 rev 4 §8',
      severity: 'mandatory',
      ok: hasContent(cer.clinicalBackground),
      detail: 'The medical condition and current state of the art must be established.',
    },
    {
      id: 'clinical_evidence',
      requirement: ivdr
        ? 'Performance evidence (scientific validity / analytical / clinical performance) is present'
        : 'Clinical evidence (clinical data) is present',
      reference: evalRef,
      severity: 'mandatory',
      ok: hasContent(cer.clinicalEvidence),
      detail: 'A clinical/performance evaluation must be supported by data, not assertion.',
    },
    {
      id: 'gspr_conformity',
      requirement: ivdr
        ? 'General Safety & Performance Requirements (Annex I) conformity is demonstrated'
        : 'General Safety & Performance Requirements (Annex I GSPR) conformity is demonstrated',
      reference: ivdr ? 'IVDR Annex I' : 'MDR Annex I (GSPR)',
      severity: 'mandatory',
      ok: hasContent(cer.essentialRequirements),
      detail: 'Conformity with the applicable GSPRs must be addressed.',
    },
    {
      id: 'benefit_risk',
      requirement: 'Benefit-risk analysis is present',
      reference: ivdr ? 'IVDR Annex I §1, §8' : 'MDR Annex I §1, §8',
      severity: 'mandatory',
      ok: hasContent(cer.riskBenefitAnalysis),
      detail: 'An acceptable benefit-risk determination must be documented.',
    },
    {
      id: 'conclusions',
      requirement: 'Conclusions are present',
      reference: 'MEDDEV 2.7/1 rev 4 §11',
      severity: 'mandatory',
      ok: hasContent(cer.conclusions),
      detail: 'The clinical evaluation must state explicit conclusions.',
    },
    {
      id: 'literature_review',
      requirement: 'Literature review is present',
      reference: 'MEDDEV 2.7/1 rev 4 §9 (literature route)',
      severity: 'recommended',
      ok: hasContent(cer.literatureReview),
      detail: 'A documented literature search/appraisal strengthens the evaluation.',
    },
  ];

  const checks: CerConformanceCheck[] = spec.map(({ ok, ...rest }) => ({
    ...rest,
    status: ok ? 'pass' : 'fail',
  }));

  const failed = checks.filter(c => c.status === 'fail');
  const mandatoryFailed = failed.filter(c => c.severity === 'mandatory').length;

  return {
    valid: mandatoryFailed === 0,
    framework: fw,
    checkedAt: new Date().toISOString(),
    checks,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      mandatoryFailed,
    },
  };
}
