/**
 * Readiness Evaluator — Registry-aware submission readiness assessment.
 *
 * Compares expected registry documents against actual governed artifacts
 * to determine submission readiness. Works for any registry-supported
 * application type without hardcoded logic.
 *
 * @module server/services/regulatory/readinessEvaluator
 */

import { getApplicationType } from '../../../shared/regulatory/global-document-registry.js';
import { getSectionBlueprintForEntry } from '../../../shared/regulatory/project-bootstrap.js';
import { resolveRegistryId } from './registry/legacySubmissionTypeMapper.js';
import { getRequiredArtifacts, getMandatoryArtifacts, type ArtifactRequirement } from './requiredArtifactMatrix.js';
import type { RegulatoryApplicationType, SectionDefinition } from '../../../shared/regulatory/document-taxonomy.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReadinessInput {
  /** Registry ID or legacy submission type */
  registryIdOrLegacy: string;
  /** Actual sections with their statuses */
  sections: SectionStatus[];
  /** Actual governed artifacts */
  artifacts: ArtifactStatus[];
}

export interface SectionStatus {
  code: string;
  title: string;
  status: string; // 'not_started' | 'drafting' | 'draft' | 'review' | 'approved' | 'locked'
  artifactCount: number;
}

export interface ArtifactStatus {
  type: string;
  status: string; // governed artifact status
  sectionCode?: string;
}

export interface ReadinessResult {
  /** Overall readiness score (0-100) */
  score: number;
  /** Readiness level */
  level: 'not_ready' | 'early' | 'in_progress' | 'nearly_ready' | 'ready';
  /** Registry entry display name */
  applicationDisplayName: string;
  /** Dossier standard */
  dossierStandard: string;
  /** Section readiness */
  sectionReadiness: {
    total: number;
    required: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    completionPercent: number;
  };
  /** Artifact readiness */
  artifactReadiness: {
    required: number;
    present: number;
    approved: number;
    missing: string[];
    completionPercent: number;
  };
  /** Missing required items */
  gaps: ReadinessGap[];
  /** Regional-specific warnings */
  regionalWarnings: string[];
}

export interface ReadinessGap {
  type: 'section' | 'artifact';
  code: string;
  title: string;
  severity: 'critical' | 'important' | 'recommended';
  message: string;
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

/**
 * Evaluate submission readiness for a project.
 */
export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  const registryId = resolveRegistryId(input.registryIdOrLegacy) || input.registryIdOrLegacy;
  const entry = getApplicationType(registryId);

  if (!entry) {
    return buildFallbackResult(input);
  }

  const sectionBlueprint = getSectionBlueprintForEntry(entry);
  const requiredArtifacts = getMandatoryArtifacts(registryId);

  // Evaluate sections
  const sectionReadiness = evaluateSections(sectionBlueprint.sections, input.sections);

  // Evaluate artifacts
  const artifactReadiness = evaluateArtifacts(requiredArtifacts, input.artifacts);

  // Calculate overall score (60% sections, 40% artifacts)
  const overallScore = Math.round(
    sectionReadiness.completionPercent * 0.6 +
    artifactReadiness.completionPercent * 0.4
  );

  // Identify gaps
  const gaps = identifyGaps(sectionBlueprint.sections, input.sections, requiredArtifacts, input.artifacts);

  // Regional warnings
  const regionalWarnings = getRegionalWarnings(entry, input);

  return {
    score: overallScore,
    level: scoreToLevel(overallScore),
    applicationDisplayName: entry.displayName,
    dossierStandard: entry.dossierStandard,
    sectionReadiness,
    artifactReadiness,
    gaps,
    regionalWarnings,
  };
}

// ─── Internal Functions ───────────────────────────────────────────────────────

function evaluateSections(
  expected: SectionDefinition[],
  actual: SectionStatus[]
): ReadinessResult['sectionReadiness'] {
  const requiredSections = expected.filter(s => s.required);
  const actualMap = new Map(actual.map(s => [s.code, s]));

  let completed = 0;
  let inProgress = 0;
  let notStarted = 0;

  for (const req of requiredSections) {
    const sect = actualMap.get(req.code);
    if (!sect || sect.status === 'not_started') {
      notStarted++;
    } else if (['approved', 'locked', 'signed'].includes(sect.status)) {
      completed++;
    } else {
      inProgress++;
    }
  }

  return {
    total: expected.length,
    required: requiredSections.length,
    completed,
    inProgress,
    notStarted,
    completionPercent: requiredSections.length > 0
      ? Math.round((completed / requiredSections.length) * 100)
      : 100,
  };
}

function evaluateArtifacts(
  required: ArtifactRequirement[],
  actual: ArtifactStatus[]
): ReadinessResult['artifactReadiness'] {
  const actualTypes = new Set(actual.map(a => a.type));
  const approvedTypes = new Set(
    actual.filter(a => ['approved', 'locked', 'signed'].includes(a.status)).map(a => a.type)
  );

  const missing = required
    .filter(r => !actualTypes.has(r.artifactType))
    .map(r => r.label);

  return {
    required: required.length,
    present: required.filter(r => actualTypes.has(r.artifactType)).length,
    approved: required.filter(r => approvedTypes.has(r.artifactType)).length,
    missing,
    completionPercent: required.length > 0
      ? Math.round((required.filter(r => actualTypes.has(r.artifactType)).length / required.length) * 100)
      : 100,
  };
}

function identifyGaps(
  expectedSections: SectionDefinition[],
  actualSections: SectionStatus[],
  requiredArtifacts: ArtifactRequirement[],
  actualArtifacts: ArtifactStatus[]
): ReadinessGap[] {
  const gaps: ReadinessGap[] = [];
  const actualSectionMap = new Map(actualSections.map(s => [s.code, s]));
  const actualArtifactTypes = new Set(actualArtifacts.map(a => a.type));

  // Section gaps
  for (const sect of expectedSections) {
    if (!sect.required) continue;
    const actual = actualSectionMap.get(sect.code);
    if (!actual || actual.status === 'not_started') {
      gaps.push({
        type: 'section',
        code: sect.code,
        title: sect.title,
        severity: 'critical',
        message: `Required section "${sect.title}" (${sect.code}) has not been started`,
      });
    }
  }

  // Artifact gaps
  for (const art of requiredArtifacts) {
    if (!actualArtifactTypes.has(art.artifactType)) {
      gaps.push({
        type: 'artifact',
        code: art.artifactType,
        title: art.label,
        severity: 'critical',
        message: `Required artifact "${art.label}" is missing`,
      });
    }
  }

  return gaps;
}

function getRegionalWarnings(
  entry: RegulatoryApplicationType,
  input: ReadinessInput
): string[] {
  const warnings: string[] = [];

  if (entry.region === 'EU' && !input.artifacts.some(a => a.type === 'rmp')) {
    warnings.push('EU submissions typically require a Risk Management Plan (RMP)');
  }

  if (entry.region === 'JP' && !input.artifacts.some(a => a.type === 'bridging_study')) {
    warnings.push('Japan submissions may require bridging study data for non-Japanese populations');
  }

  if (entry.region === 'CN') {
    warnings.push('China submissions require Chinese translations of key documents');
  }

  return warnings;
}

function scoreToLevel(score: number): ReadinessResult['level'] {
  if (score >= 90) return 'ready';
  if (score >= 70) return 'nearly_ready';
  if (score >= 40) return 'in_progress';
  if (score >= 10) return 'early';
  return 'not_ready';
}

function buildFallbackResult(input: ReadinessInput): ReadinessResult {
  const totalSections = input.sections.length;
  const completed = input.sections.filter(s => ['approved', 'locked'].includes(s.status)).length;

  return {
    score: totalSections > 0 ? Math.round((completed / totalSections) * 100) : 0,
    level: 'early',
    applicationDisplayName: input.registryIdOrLegacy,
    dossierStandard: 'unknown',
    sectionReadiness: {
      total: totalSections,
      required: totalSections,
      completed,
      inProgress: input.sections.filter(s => !['not_started', 'approved', 'locked'].includes(s.status)).length,
      notStarted: input.sections.filter(s => s.status === 'not_started').length,
      completionPercent: totalSections > 0 ? Math.round((completed / totalSections) * 100) : 0,
    },
    artifactReadiness: { required: 0, present: 0, approved: 0, missing: [], completionPercent: 100 },
    gaps: [],
    regionalWarnings: [],
  };
}
