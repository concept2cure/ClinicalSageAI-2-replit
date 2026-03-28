/**
 * Readiness Matrix — Registry-driven submission readiness assessment.
 *
 * Compares project artifacts against the registry's required artifacts
 * and section blueprint to determine submission readiness.
 *
 * @module shared/regulatory/readiness-matrix
 */

import type { SectionDefinition } from './document-taxonomy';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReadinessResult {
  /** Overall readiness score (0-100) */
  score: number;
  /** Whether the submission is ready to file */
  isReady: boolean;
  /** Total required items */
  totalRequired: number;
  /** Completed required items */
  completedRequired: number;
  /** Items that exist but need work */
  inProgress: number;
  /** Required items that don't exist yet */
  missing: ReadinessGap[];
  /** Items that exist but aren't approved */
  notApproved: ReadinessGap[];
  /** Items that are regionally incompatible */
  incompatible: ReadinessGap[];
  /** Module-level breakdown */
  moduleBreakdown: ModuleReadiness[];
}

export interface ReadinessGap {
  sectionCode: string;
  sectionTitle: string;
  module: number;
  reason: string;
  severity: 'critical' | 'major' | 'minor';
}

export interface ModuleReadiness {
  module: number;
  moduleName: string;
  totalSections: number;
  completedSections: number;
  score: number;
}

// ─── Assessment Function ──────────────────────────────────────────────────────

/**
 * Assess submission readiness by comparing project artifacts against
 * the registry's section blueprint.
 */
export function assessReadiness(
  blueprint: SectionDefinition[],
  artifacts: Array<{ ctdSection?: string; status?: string }>,
  requiredArtifacts: string[] = []
): ReadinessResult {
  const missing: ReadinessGap[] = [];
  const notApproved: ReadinessGap[] = [];
  const incompatible: ReadinessGap[] = [];
  let completedRequired = 0;
  let inProgress = 0;

  const requiredSections = blueprint.filter(s => s.required);
  const totalRequired = requiredSections.length + requiredArtifacts.length;

  // Check each required section
  for (const section of requiredSections) {
    const artifact = artifacts.find(a => a.ctdSection === section.code);

    if (!artifact) {
      missing.push({
        sectionCode: section.code,
        sectionTitle: section.title,
        module: section.module,
        reason: 'Section has not been drafted',
        severity: 'critical',
      });
    } else if (artifact.status === 'approved' || artifact.status === 'locked') {
      completedRequired++;
    } else if (artifact.status === 'draft' || artifact.status === 'drafting') {
      inProgress++;
      notApproved.push({
        sectionCode: section.code,
        sectionTitle: section.title,
        module: section.module,
        reason: `Section is in ${artifact.status} status — needs review and approval`,
        severity: 'major',
      });
    } else if (artifact.status === 'review' || artifact.status === 'in_review') {
      inProgress++;
      notApproved.push({
        sectionCode: section.code,
        sectionTitle: section.title,
        module: section.module,
        reason: 'Section is pending review approval',
        severity: 'minor',
      });
    }
  }

  // Check required artifact types
  for (const artifactType of requiredArtifacts) {
    // This is a simplified check — in production, match against artifact metadata
    const exists = artifacts.some(a => a.ctdSection === artifactType || (a as any).type === artifactType);
    if (exists) {
      completedRequired++;
    } else {
      missing.push({
        sectionCode: artifactType,
        sectionTitle: artifactType.replace(/_/g, ' '),
        module: 0,
        reason: `Required artifact '${artifactType}' not found`,
        severity: 'critical',
      });
    }
  }

  // Calculate module breakdown
  const modules = [...new Set(blueprint.map(s => s.module))].sort();
  const MODULE_NAMES: Record<number, string> = {
    0: 'General', 1: 'Administrative', 2: 'Summaries', 3: 'Quality',
    4: 'Nonclinical', 5: 'Clinical',
  };

  const moduleBreakdown: ModuleReadiness[] = modules.map(mod => {
    const modSections = blueprint.filter(s => s.module === mod && s.required);
    const modComplete = modSections.filter(s => {
      const art = artifacts.find(a => a.ctdSection === s.code);
      return art && (art.status === 'approved' || art.status === 'locked');
    });
    return {
      module: mod,
      moduleName: MODULE_NAMES[mod] || `Module ${mod}`,
      totalSections: modSections.length,
      completedSections: modComplete.length,
      score: modSections.length > 0 ? Math.round((modComplete.length / modSections.length) * 100) : 100,
    };
  });

  const score = totalRequired > 0 ? Math.round((completedRequired / totalRequired) * 100) : 0;

  return {
    score,
    isReady: missing.length === 0 && notApproved.length === 0,
    totalRequired,
    completedRequired,
    inProgress,
    missing,
    notApproved,
    incompatible,
    moduleBreakdown,
  };
}
