/** Private result orchestration for the existing qualification harness.
 * Schema and external truth remain with their canonical owners. */
import type { SubmissionBundle, Region } from '../../submission-gateways/types';
import { hasPassedPackageDtdValidation } from '../dtd-bundler';
import { evaluateExternalValidationGate, evalidatorProfile, resolveExternalValidator, runExternalValidation,
  type ExternalValidationGateResult, type ExternalValidationReport, type ExternalValidator, type EctdRegion } from '../external-validator';
import type { BackboneValidation, ValidatorRunReport } from '../backbone-validation';

export const QUALIFICATION_SCOPE = 'automated-package-validation' as const;
export type QualificationStatus = 'passed' | 'failed' | 'blocked';
export interface QualificationOutcome {
  scope: typeof QUALIFICATION_SCOPE;
  status: QualificationStatus;
  availableChecksPassed: boolean;
  blockers: string[];
  passed: boolean;
}
export interface QualificationExternalEvidence {
  sequence: string;
  packageSha256: string;
  selectedValidator: { name: string; kind: ExternalValidator['kind'] } | null;
  configured: boolean;
  requestedProfile: string | null;
  report: ExternalValidationReport | null;
  assessment: ExternalValidationGateResult;
  profileMatched: boolean;
}
export interface QualificationExecution {
  evidence: QualificationExternalEvidence;
  validator: ValidatorRunReport | null;
  failures: string[];
  blockers: string[];
}

export function qualificationOutcome(availableChecksPassed: boolean, failures: string[], blockers: string[]): QualificationOutcome {
  const reasons = [...new Set([...failures, ...blockers])];
  if (!availableChecksPassed && reasons.length === 0) reasons.push('Available validation checks did not complete successfully.');
  const status: QualificationStatus = failures.length ? 'failed' : reasons.length ? 'blocked' : 'passed';
  return { scope: QUALIFICATION_SCOPE, status, availableChecksPassed, blockers: reasons, passed: status === 'passed' };
}

/** Unrun rows stay visible and block mandatory completeness separately. */
export function executedChecksPassed(reports: ValidatorRunReport[]): boolean {
  return reports.filter(report => report.ran).every(report => report.passed);
}

export function externalRegion(region: Region): region is EctdRegion {
  return region === 'fda' || region === 'ema' || region === 'pmda';
}

interface ExternalExecutionFacts {
  selected: ExternalValidator | null;
  configured: boolean;
  requestedProfile: string | null;
  report: ExternalValidationReport | null;
  blockers: string[];
}

function requestedProfileFor(region: Region): string | null {
  if (!externalRegion(region)) return null;
  const profile = evalidatorProfile(region);
  return typeof profile === 'string' && profile.trim().length > 0 ? profile : null;
}

async function selectAndExecute(packageDir: string, region: Region, sequence: string): Promise<ExternalExecutionFacts> {
  const facts: ExternalExecutionFacts = { selected: null, configured: false,
    requestedProfile: requestedProfileFor(region), report: null, blockers: [] };
  try {
    facts.selected = await resolveExternalValidator();
    facts.configured = await facts.selected.isConfigured();
    if (!externalRegion(region)) {
      facts.blockers.push(`${sequence}: External validation for region ${region} is unsupported by the existing adapter.`);
    } else if (facts.selected.kind === 'external_engine' && !facts.requestedProfile) {
      facts.blockers.push(`${sequence}: An explicit intended external ${region.toUpperCase()} profile is not configured.`);
    } else if (facts.configured && (facts.selected.kind === 'external_engine' || facts.selected.kind === 'internal_subset')) {
      facts.report = await runExternalValidation({ packageDir, region,
        ...(facts.requestedProfile ? { profile: facts.requestedProfile } : {}) }, facts.selected);
    }
  } catch (error) {
    facts.blockers.push(`${sequence}: External validation could not be selected or assessed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return facts;
}

function localSubsetExecution(evidence: QualificationExternalEvidence): boolean {
  return evidence.selectedValidator?.kind === 'internal_subset' && evidence.assessment.errorCountKnown &&
    evidence.assessment.reportedValidatorName === evidence.assessment.selectedValidatorName;
}

function externalRow(evidence: QualificationExternalEvidence): ValidatorRunReport | null {
  const { report, assessment, selectedValidator } = evidence;
  if (!report || !assessment.errorCountKnown || (!assessment.qualifyingRun && !localSubsetExecution(evidence))) return null;
  return { name: selectedValidator?.kind === 'internal_subset' ? 'fda-criteria-subset (local)' : selectedValidator!.name,
    ran: report.ran === true, passed: report.passed,
    errorCount: assessment.externalErrorCount, warningCount: report.warningCount,
    sample: report.findings.slice(0, 5).map(finding => `[${finding.severity}] ${finding.message}`) };
}

function externalProblems(evidence: QualificationExternalEvidence): { failures: string[]; blockers: string[] } {
  const { sequence, assessment, profileMatched } = evidence;
  const failures: string[] = [];
  const blockers: string[] = [];
  if (assessment.assessmentStatus === 'failed' && profileMatched) {
    failures.push(...assessment.blockers.map(reason => `${sequence}: ${reason}`));
  } else if (assessment.assessmentStatus !== 'passed' || !profileMatched) {
    blockers.push(...assessment.blockers.map(reason => `${sequence}: ${reason}`));
  }
  if (evidence.selectedValidator?.kind === 'external_engine' && evidence.report && !profileMatched) {
    blockers.push(`${sequence}: The reported external profile does not match the requested profile.`);
  }
  if (localSubsetExecution(evidence) && assessment.externalErrorCount > 0) {
    failures.push(`${sequence}: The executed local FDA subset reported ${assessment.externalErrorCount} content error(s).`);
  }
  return { failures, blockers };
}

/** Run the exact server selection once. The existing canonical runner/catch
 * and gate remain authoritative; a subset never supplies external completion. */
export async function qualificationExternal(packageDir: string, region: Region, sequence: string, packageSha256: string): Promise<QualificationExecution> {
  const execution = await selectAndExecute(packageDir, region, sequence);
  const selectedValidator = execution.selected ? { name: execution.selected.name, kind: execution.selected.kind } : null;
  const assessment = evaluateExternalValidationGate({ report: execution.report, configured: execution.configured,
    ...(selectedValidator ? { selectedValidator } : {}), requireEvalidator: true, environment: 'production' });
  const evidence: QualificationExternalEvidence = { sequence, packageSha256, selectedValidator,
    configured: execution.configured, requestedProfile: execution.requestedProfile, report: execution.report, assessment,
    profileMatched: execution.requestedProfile !== null && execution.report?.profile === execution.requestedProfile };
  const problems = externalProblems(evidence);
  return { evidence, validator: externalRow(evidence), failures: problems.failures,
    blockers: [...execution.blockers, ...problems.blockers] };
}

/** Native failure means execution actually established invalid XML. A DOCTYPE
 * audit may instead report an unsupported/unprovable dependency without running
 * the native parser; that remains incomplete proof, with its diagnostics. */
export function nativeProblems(results: BackboneValidation[], sequence: string): { failures: string[]; blockers: string[] } {
  const failures: string[] = [], blockers: string[] = [];
  for (const result of results) {
    for (const native of [result.wellFormed, result.dtd]) {
      const reason = `${sequence}/${result.relPath}: ${native.mode}: ${native.errors.join('; ') || 'validation did not complete'}`;
      if (native.ran && !native.valid) failures.push(reason);
      else if (!native.ran) blockers.push(reason);
    }
    if (!result.doctype.valid) blockers.push(`${sequence}/${result.relPath}: ${result.doctype.errors.join('; ') || 'DOCTYPE proof is unavailable.'}`);
  }
  return { failures, blockers };
}

function observedHashMismatch(row: { fileName: string; expected: string; actual: string }): boolean {
  if (!row || typeof row.fileName !== 'string' || row.fileName.length === 0) return false;
  if (typeof row.expected !== 'string' || typeof row.actual !== 'string') return false;
  return /^[a-f0-9]{64}$/i.test(row.expected) && /^[a-f0-9]{64}$/i.test(row.actual) &&
    row.expected.toLowerCase() !== row.actual.toLowerCase();
}

function capturedIntegrityFailures(bundle: SubmissionBundle, sequence: string): string[] {
  const proof = bundle.dtdStatus?.validation;
  if (proof?.version !== 1 || !proof.integrity) return [];
  const integrity = proof.integrity;
  const mismatched = Array.isArray(integrity.mismatched) ? integrity.mismatched : [];
  const missing = Array.isArray(integrity.missingFiles) ? integrity.missingFiles : [];
  const unlisted = Array.isArray(integrity.unlistedFiles) ? integrity.unlistedFiles : [];
  return [
    ...mismatched.filter(observedHashMismatch)
      .map(row => `${sequence}: Captured supportive file ${row.fileName} hash mismatch.`),
    ...missing.filter(name => typeof name === 'string' && name.length > 0)
      .map(name => `${sequence}: Captured supportive file ${name} is missing from the recorded package.`),
    ...unlisted.filter(name => typeof name === 'string' && name.length > 0)
      .map(name => `${sequence}: Captured supportive file ${name} is not recorded in the checksum manifest.`),
  ];
}

/** The producer already verified these exact captured bytes. Preserve its
 * observed integrity faults as failures; absent or unsupported proof blocks. */
export function capturedDtdProblems(bundle: SubmissionBundle, sequence: string): { failures: string[]; blockers: string[] } {
  const studies = (bundle.leafManifest ?? []).filter(leaf => /(?:^|\/)stf-[^/]+\.xml$/.test(leaf.href)).length;
  if (hasPassedPackageDtdValidation(bundle.dtdStatus, studies)) return { failures: [], blockers: [] };
  const failures = capturedIntegrityFailures(bundle, sequence);
  const missing = [...bundle.dtdStatus?.missing ?? [], ...bundle.dtdStatus?.missingStylesheets ?? []];
  return { failures, blockers: [`${sequence}: Complete captured DTD/supportive-byte qualification proof is unavailable${missing.length ? ` (missing ${missing.join(', ')})` : ''}.`] };
}

export function sequenceValidators(results: BackboneValidation[], sequence: string): ValidatorRunReport[] {
  return results.flatMap(result => result.reports.map(report => sequence === '0000' ? report : { ...report, name: `${sequence}/${report.name}` }));
}
