/**
 * Nonclinical + SEND deterministic logic (Capability C2C-04)
 *
 * Pure, DB-free, LLM-free: the study-type → CTD Module 4 section mapping, the
 * SENDIG required-domain catalog per study type, and the SEND submission-
 * readiness gate. Grounded in ICH M4, the CDISC SENDIG, and the FDA Study Data
 * Technical Conformance Guide; each finding cites its basis.
 *
 * @module server/services/nonclinical/nonclinical-logic
 */

import type { NonclinicalStudyType, SendValidationStatus } from '../../../shared/schema/nonclinical';

/** Study type → CTD Module 4 section (ICH M4 / M4S organization). */
const CTD_SECTION: Record<NonclinicalStudyType, string> = {
  single_dose_tox: '4.2.3.1',
  repeat_dose_tox: '4.2.3.2',
  genotoxicity: '4.2.3.3',
  carcinogenicity: '4.2.3.4',
  reproductive_tox: '4.2.3.5',
  local_tolerance: '4.2.3.6',
  safety_pharmacology: '4.2.1.3',
  adme_pk: '4.2.2',
  immunotoxicity: '4.2.3.7',
  other: '4.2.3',
};

export function ctdSectionFor(studyType: NonclinicalStudyType): string {
  return CTD_SECTION[studyType];
}

/**
 * SEND domains expected for a study type (SENDIG 3.x). DM (demographics), TS
 * (trial summary), EX (exposure), and the relevant findings domains. This is a
 * pragmatic baseline — the IG enumerates conditional domains too.
 */
const REQUIRED_DOMAINS: Record<NonclinicalStudyType, string[]> = {
  // General-toxicology findings: body weight, clinical obs, labs, organ weights, macro/micro path.
  single_dose_tox: ['TS', 'DM', 'EX', 'CL', 'BW', 'MA', 'MI'],
  repeat_dose_tox: ['TS', 'DM', 'EX', 'BW', 'CL', 'LB', 'OM', 'MA', 'MI', 'FW'],
  carcinogenicity: ['TS', 'DM', 'EX', 'BW', 'CL', 'MA', 'MI', 'TF'], // TF = tumor findings
  reproductive_tox: ['TS', 'DM', 'EX', 'BW', 'CL', 'RE', 'FX', 'PM'], // repro/fetal/pup domains
  safety_pharmacology: ['TS', 'DM', 'EX', 'CV', 'RP', 'NV'], // CV/respiratory/CNS
  genotoxicity: ['TS', 'DM', 'EX', 'GT'],
  local_tolerance: ['TS', 'DM', 'EX', 'CL', 'MA', 'MI'],
  adme_pk: ['TS', 'DM', 'EX', 'PC', 'PP'],
  immunotoxicity: ['TS', 'DM', 'EX', 'IS', 'LB'],
  other: ['TS', 'DM', 'EX'],
};

export function requiredSendDomains(studyType: NonclinicalStudyType): string[] {
  return REQUIRED_DOMAINS[studyType];
}

/**
 * Whether a study type is in SEND scope. FDA requires SEND for certain study
 * types (general tox, carc, and — per later requirement dates — safety pharm and
 * repro/DART). ADME/PK and standalone genetic-tox are generally out of mandatory
 * SEND scope. Pure.
 */
export function sendInScope(studyType: NonclinicalStudyType): boolean {
  return ['single_dose_tox', 'repeat_dose_tox', 'carcinogenicity', 'safety_pharmacology', 'reproductive_tox'].includes(studyType);
}

export type SendFindingSeverity = 'critical' | 'major' | 'minor';
export type SendRiskLevel = 'high' | 'medium' | 'low';

export interface SendFinding {
  severity: SendFindingSeverity;
  message: string;
  basis: string;
}

export interface SendReadinessInput {
  studyType: NonclinicalStudyType;
  domainsPresent: string[];
  defineXmlPresent: boolean;
  nsdrcPresent: boolean;
  validationStatus: SendValidationStatus;
  validatorErrorCount: number;
}

/**
 * SEND submission-readiness gate. For in-scope study types: the required domains
 * must be present, define.xml is mandatory, the nSDRG is expected, and the
 * package must validate without errors. Pure — cited findings + risk level.
 */
export function evaluateSendReadiness(p: SendReadinessInput): { findings: SendFinding[]; riskLevel: SendRiskLevel; missingDomains: string[] } {
  const findings: SendFinding[] = [];

  if (!sendInScope(p.studyType)) {
    return { findings: [{ severity: 'minor', message: `Study type ${p.studyType} is generally outside mandatory SEND scope; confirm against current requirement dates.`, basis: 'FDA Study Data Standards Catalog' }], riskLevel: 'low', missingDomains: [] };
  }

  const required = requiredSendDomains(p.studyType);
  const present = new Set(p.domainsPresent.map((d) => d.toUpperCase()));
  const missingDomains = required.filter((d) => !present.has(d));
  if (missingDomains.length > 0) {
    findings.push({ severity: 'major', message: `Missing required SEND domain(s): ${missingDomains.join(', ')}.`, basis: 'CDISC SENDIG 3.x' });
  }
  if (!p.defineXmlPresent) {
    findings.push({ severity: 'critical', message: 'define.xml (dataset metadata) is required for a SEND submission.', basis: 'FDA Study Data Technical Conformance Guide' });
  }
  if (!p.nsdrcPresent) {
    findings.push({ severity: 'minor', message: 'No nonclinical Study Data Reviewer’s Guide (nSDRG) is attached.', basis: 'PHUSE nSDRG; FDA Technical Conformance Guide' });
  }
  if (p.validationStatus === 'errors' || p.validatorErrorCount > 0) {
    findings.push({ severity: 'critical', message: `SEND validation has ${p.validatorErrorCount} open error(s); reject-risk at the gateway.`, basis: 'FDA Study Data Technical Conformance Guide' });
  } else if (p.validationStatus === 'not_validated') {
    findings.push({ severity: 'major', message: 'SEND package has not been validated.', basis: 'FDA Study Data Technical Conformance Guide' });
  }

  const riskLevel: SendRiskLevel = findings.some((f) => f.severity === 'critical')
    ? 'high'
    : findings.some((f) => f.severity === 'major')
      ? 'medium'
      : 'low';
  return { findings, riskLevel, missingDomains };
}
