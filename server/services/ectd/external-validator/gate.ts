/**
 * External-validation dispatch gate (pure) — the fail-closed decision logic.
 *
 * Required production clearance needs a configured, explicitly external adapter
 * and its identity-matched, coherent, clean report. A subset, missing selection,
 * invalid report or failed execution cannot supply that clearance. Classification
 * comes from the server's selected adapter, not from submitted report metadata.
 *
 * Staging / flag-unset remains advisory. `cleared` expresses blocking policy;
 * `assessmentStatus` expresses the external assessment's actual outcome. Neither
 * a configured URL nor a matched report proves qualified coverage or acceptance.
 *
 * @module server/services/ectd/external-validator/gate
 */

import { tallyFindings, type ExternalValidationFinding, type ExternalValidationReport, type ExternalValidatorKind } from './types';

export interface ExternalValidationGateInput {
  /** The report, or null when validation was not attempted / the engine threw. */
  report: ExternalValidationReport | null;
  /** Server-selected identity/classification; missing or invalid is unknown. */
  selectedValidator?: { name: string; kind: ExternalValidatorKind };
  /** Configuration discovery (isConfigured()), not licence/provider qualification. */
  configured: boolean;
  /** Wired from ECTD_REQUIRE_EVALIDATOR. */
  requireEvalidator: boolean;
  environment: 'staging' | 'production';
}

export interface ExternalValidationGateResult {
  /** Coherent supplied report's errors; zero is a compatibility placeholder when unknown. */
  externalErrorCount: number;
  /** False means the numeric placeholder is not an observed clean content count. */
  errorCountKnown: boolean;
  /** Whether the supplied report strictly declares execution, including a subset. */
  ran: boolean;
  /** True only for an explicitly external adapter with configuration established. */
  configured: boolean;
  validatorKind: ExternalValidatorKind;
  selectedValidatorName: string | null;
  reportedValidatorName: string | null;
  /** Matching coherent external execution, including one that found errors. */
  qualifyingRun: boolean;
  assessmentStatus: 'passed' | 'failed' | 'not_assessed' | 'invalid';
  /** Required production policy is active; distinct from the assessment outcome. */
  enforced: boolean;
  blockers: string[];
  /** True when this gate adds no blocker. */
  cleared: boolean;
}

function identityName(value: unknown): string | null {
  // Keep exact identity: never trim/case-fold a report into the selected engine.
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function selectedKind(value: unknown, name: string | null): ExternalValidatorKind {
  if (!name) return 'unknown';
  switch (value) {
    case 'external_engine':
    case 'internal_subset':
    case 'unavailable':
    case 'unknown':
      return value;
    default:
      return 'unknown';
  }
}

function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function knownFindings(value: unknown): value is ExternalValidationFinding[] {
  return Array.isArray(value) && value.every(finding =>
    finding !== null && typeof finding === 'object' &&
    ['error', 'warning', 'info'].includes(finding.severity),
  );
}

/** Inspect executed content counts only; an unrun operational failure is not content. */
function coherentExecution(report: ExternalValidationReport): boolean {
  if (report.ran !== true || typeof report.passed !== 'boolean') return false;
  if (!(report.ranAt instanceof Date) || !Number.isFinite(report.ranAt.getTime())) return false;
  if (!identityName(report.profile) || !knownFindings(report.findings)) return false;
  if (!validCount(report.errorCount) || !validCount(report.warningCount)) return false;
  const counts = tallyFindings(report.findings);
  return counts.errorCount === report.errorCount && counts.warningCount === report.warningCount && report.passed === (counts.errorCount === 0);
}

function assessReport(
  report: ExternalValidationReport | null,
  facts: Pick<ExternalValidationGateResult, 'configured' | 'reportedValidatorName' | 'selectedValidatorName' | 'errorCountKnown'>,
): ExternalValidationGateResult['assessmentStatus'] {
  if (!facts.configured || report == null) return 'not_assessed';
  if (!facts.reportedValidatorName || facts.reportedValidatorName !== facts.selectedValidatorName) return 'invalid';
  // Preserve an unrun operational error with zero content errors: it never
  // supplies a qualifying assessment, and its diagnostic stays in the report.
  if (report.ran === false) return 'not_assessed';
  if (!facts.errorCountKnown) return 'invalid';
  return report.passed ? 'passed' : 'failed';
}

function requiredBlockers(facts: Omit<ExternalValidationGateResult, 'blockers' | 'cleared'>): string[] {
  if (facts.validatorKind === 'internal_subset') {
    return ['The internal FDA criteria subset cannot satisfy the required external-validator assessment. Configure and run an external engine for this production dispatch.'];
  }
  if (facts.validatorKind !== 'external_engine') {
    return [`External validation is required for production but the selected adapter is ${facts.validatorKind}; no qualifying external run is established.`];
  }
  if (!facts.configured || facts.assessmentStatus === 'not_assessed') {
    return [`External validation is required for production but did not run (configured=${facts.configured}, ran=${facts.ran}). Configure EVALIDATOR_BINARY/EVALIDATOR_ENDPOINT and the intended profile, then run the validator.`];
  }
  if (facts.assessmentStatus === 'invalid') {
    return [`External validation is required for production but the report is invalid or does not match the selected engine (${facts.selectedValidatorName}; reported=${facts.reportedValidatorName}).`];
  }
  if (facts.assessmentStatus === 'failed') {
    return [`External eValidator reported ${facts.externalErrorCount} error-severity finding(s). Resolve them before required production dispatch.`];
  }
  return [];
}

export function evaluateExternalValidationGate(
  input: ExternalValidationGateInput,
): ExternalValidationGateResult {
  const selectedValidatorName = identityName(input.selectedValidator?.name);
  const reportedValidatorName = identityName(input.report?.validator);
  const validatorKind = selectedKind(input.selectedValidator?.kind, selectedValidatorName);
  const configured = validatorKind === 'external_engine' && input.configured === true;
  const ran = input.report?.ran === true;
  const errorCountKnown = input.report != null && coherentExecution(input.report);
  const externalErrorCount = errorCountKnown ? input.report!.errorCount : 0;
  const enforced = input.requireEvalidator === true && input.environment === 'production';
  const assessmentStatus = assessReport(input.report, { configured, reportedValidatorName, selectedValidatorName, errorCountKnown });
  const qualifyingRun = configured && (assessmentStatus === 'passed' || assessmentStatus === 'failed');
  const facts = {
    externalErrorCount,
    errorCountKnown,
    ran,
    configured,
    validatorKind,
    selectedValidatorName,
    reportedValidatorName,
    qualifyingRun,
    assessmentStatus,
    enforced,
  };
  const blockers = enforced ? requiredBlockers(facts) : [];
  return { ...facts, blockers, cleared: blockers.length === 0 };
}
