/**
 * Evidence Sufficiency Analyzer
 *
 * "Do we actually have enough evidence to support approval, or are we making
 * an expensive binder of wishful thinking?"
 *
 * Deterministic, no-LLM. Pure function over:
 *   - evidence_objects (the evidence inventory)
 *   - the device profile (program flags: software, sterile, electrical, IVD,
 *     patient contact, implantable)
 *   - chosen pathway (PMA / DE_NOVO / 510K)
 * Optionally augmented by:
 *   - extended evidenceClaims (orphans / contradictions)
 *   - gspr_program_mappings (EU pathway readiness)
 *   - post_market_documents (PMA needs an approved post-approval plan)
 *   - existing defense_packets (510K predicate strength)
 *
 * Output: per-pillar score 0..100 and an overall score; verdict
 * (sufficient | borderline | insufficient); finding list; recommendations;
 * persisted to evidence_sufficiency_assessments.
 */

import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import { db } from '../../db';
import { evidenceObjects, type EvidenceObject } from '../../../shared/schema/programs';
import { evidenceSufficiencyAssessments } from '../../../shared/schema/evidence-sufficiency';
import type {
  EvidenceSufficiencyVerdict,
  SubmissionPathway,
} from '../../../shared/schema/evidence-sufficiency';
import { pillarsForPathway, type Pillar, type PillarCode } from './pillars';

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

export interface DeviceProfileFlags {
  isSoftware?: boolean;
  isAiMl?: boolean;
  isSterile?: boolean;
  hasPatientContact?: boolean;
  isElectrical?: boolean;
  isIvd?: boolean;
  isImplantable?: boolean;
}

export interface AssessRequest {
  organizationId: number;
  programId: string;
  pathway: SubmissionPathway;
  profile: DeviceProfileFlags;
  /** Optional: pre-computed claim health to enrich findings. */
  claimHealth?: {
    orphanClaimCount?: number;
    contradictedClaimCount?: number;
    unsupportedClaimCount?: number;
  };
  /** Optional: PMA pivotal endpoint outcomes (true=met, false=missed). */
  pivotalEndpointsMet?: boolean | null;
  /** Optional: explicit list of evidence object IDs already known to caller; if
   *  omitted, the analyzer queries the program's evidence_objects directly. */
  evidenceOverride?: EvidenceObject[];
  trigger?: string;
  triggeredBy?: string;
  /** Defense packet readiness score (0..100) when 510K pathway. */
  defenseReadinessScore?: number | null;
  dryRun?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface PillarScore {
  pillar: PillarCode;
  name: string;
  score: number;       // 0..100
  weight: number;
  evidenceCount: number;
  approvedCount: number;
  satisfied: boolean;
}

export type FindingSeverity = 'critical' | 'warning' | 'info';

export interface SufficiencyFinding {
  code: string;
  severity: FindingSeverity;
  pillar?: PillarCode;
  message: string;
  citation: string;
  recommendedFix?: string;
}

export interface SufficiencyResult {
  assessmentId: string | null;
  programId: string;
  pathway: SubmissionPathway;
  inputsHash: string;
  verdict: EvidenceSufficiencyVerdict;
  overallScore: number; // 0..100
  blocksApproval: boolean;
  pillarScores: PillarScore[];
  findings: SufficiencyFinding[];
  recommendations: string[];
  summary: {
    pillarCount: number;
    satisfiedPillars: number;
    criticalCount: number;
    warningCount: number;
    evidenceObjectCount: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function pillarApplicableToProfile(p: Pillar, profile: DeviceProfileFlags): boolean {
  switch (p.code) {
    case 'biocompatibility':
      return profile.hasPatientContact === true;
    case 'sterilization':
      return profile.isSterile === true;
    case 'electrical_safety':
      return profile.isElectrical === true;
    case 'software_lifecycle':
      return profile.isSoftware === true || profile.isAiMl === true;
    case 'cybersecurity':
      return profile.isSoftware === true || profile.isAiMl === true;
    default:
      return true;
  }
}

function isQuantitative(ev: EvidenceObject): boolean {
  // Heuristic: quantitative iff testResults JSON exists OR qualityScore is set
  // OR the evidence-confidence-model captured a relevance score above zero.
  if (ev.testResults != null) return true;
  if (ev.qualityScore != null && Number(ev.qualityScore) > 0) return true;
  if (ev.relevanceScore != null && Number(ev.relevanceScore) > 0) return true;
  return false;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function computeInputsHash(req: AssessRequest, evidenceCount: number): string {
  const payload = {
    pathway: req.pathway,
    profile: req.profile,
    claimHealth: req.claimHealth ?? null,
    pivotalEndpointsMet: req.pivotalEndpointsMet ?? null,
    defenseReadinessScore: req.defenseReadinessScore ?? null,
    evidenceCount,
  };
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// Pillar scoring
// ─────────────────────────────────────────────────────────────────────────────

function scorePillar(
  p: Pillar,
  evidence: EvidenceObject[]
): { pillarScore: PillarScore; finding: SufficiencyFinding | null } {
  const matches = evidence.filter(e => p.evidenceTypes.includes(e.evidenceType));
  const approved = matches.filter(e => e.status === 'approved');

  let satisfied = approved.length >= p.minimumApprovedEvidence;

  // Quantitative requirement
  if (satisfied && p.requiresQuantitative) {
    if (!approved.some(isQuantitative)) {
      satisfied = false;
    }
  }

  // 0..100 score: satisfied=100; approved-but-not-quantitative=60; pending-only=30; none=0
  let score = 0;
  if (satisfied) score = 100;
  else if (approved.length >= p.minimumApprovedEvidence) score = 60; // missing quantitative
  else if (approved.length > 0) score = 50; // partial
  else if (matches.length > 0) score = 30; // pending evidence
  else score = 0;

  const pillarScore: PillarScore = {
    pillar: p.code,
    name: p.name,
    score,
    weight: p.weight,
    evidenceCount: matches.length,
    approvedCount: approved.length,
    satisfied,
  };

  let finding: SufficiencyFinding | null = null;
  if (!satisfied) {
    finding = {
      code: `SUFF-${p.code.toUpperCase()}`,
      severity: p.missingSeverity,
      pillar: p.code,
      message: matches.length === 0
        ? `${p.name} has no evidence in the inventory.`
        : approved.length < p.minimumApprovedEvidence
        ? `${p.name} has ${approved.length} of ${p.minimumApprovedEvidence} required approved evidence object(s).`
        : `${p.name}: required quantitative finding (testResults / qualityScore) is missing.`,
      citation: p.citation,
      recommendedFix:
        approved.length < p.minimumApprovedEvidence
          ? `Add ${p.minimumApprovedEvidence - approved.length} approved evidence object(s) of type: ${p.evidenceTypes.join(' or ')}.`
          : 'Attach the underlying numeric test result or quality-score data to the evidence object.',
    };
  }

  return { pillarScore, finding };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verdict
// ─────────────────────────────────────────────────────────────────────────────

function deriveVerdict(
  pillarScores: PillarScore[],
  criticalCount: number
): { verdict: EvidenceSufficiencyVerdict; overallScore: number; blocksApproval: boolean } {
  // Weighted average across applicable pillars
  const totalWeight = pillarScores.reduce((s, p) => s + p.weight, 0) || 1;
  const weightedScore = pillarScores.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight;
  const overallScore = Math.round(weightedScore);

  // Verdict thresholds:
  //   any critical finding OR overall < 60  → insufficient (blocks approval)
  //   60..79  → borderline (does not block, but flags risk)
  //   ≥ 80    → sufficient
  let verdict: EvidenceSufficiencyVerdict;
  let blocksApproval = false;
  if (criticalCount > 0 || overallScore < 60) {
    verdict = 'insufficient';
    blocksApproval = true;
  } else if (overallScore < 80) {
    verdict = 'borderline';
  } else {
    verdict = 'sufficient';
  }
  return { verdict, overallScore, blocksApproval };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry
// ─────────────────────────────────────────────────────────────────────────────

export async function assessSufficiency(req: AssessRequest): Promise<SufficiencyResult> {
  // 1. Pull evidence (or use override)
  const evidence: EvidenceObject[] =
    req.evidenceOverride ??
    (await db
      .select()
      .from(evidenceObjects)
      .where(
        and(
          eq(evidenceObjects.organizationId, req.organizationId),
          eq(evidenceObjects.programId, req.programId)
        )
      ));

  // 2. Filter pillars to the pathway + device profile
  const pillars = pillarsForPathway(req.pathway).filter(p =>
    pillarApplicableToProfile(p, req.profile)
  );

  // 3. Score each pillar; collect findings
  const pillarScores: PillarScore[] = [];
  const findings: SufficiencyFinding[] = [];
  for (const p of pillars) {
    const { pillarScore, finding } = scorePillar(p, evidence);
    pillarScores.push(pillarScore);
    if (finding) findings.push(finding);
  }

  // 4. Cross-cutting findings from claim health (optional)
  if (req.claimHealth?.contradictedClaimCount && req.claimHealth.contradictedClaimCount > 0) {
    findings.push({
      code: 'SUFF-CLAIM-CONTRADICT',
      severity: 'critical',
      message: `${req.claimHealth.contradictedClaimCount} claim(s) have contradicting evidence.`,
      citation: '21 CFR 807.87(e); 21 CFR 814.20(b)(2)',
      recommendedFix:
        'Resolve each contradiction by either updating the claim to match the evidence or by superseding the contradicting evidence.',
    });
  }
  if (req.claimHealth?.unsupportedClaimCount && req.claimHealth.unsupportedClaimCount > 0) {
    findings.push({
      code: 'SUFF-CLAIM-UNSUPPORTED',
      severity: 'warning',
      message: `${req.claimHealth.unsupportedClaimCount} claim(s) lack supporting evidence links.`,
      citation: '21 CFR 814.20(b)(2)',
    });
  }

  // 5. Pathway-specific cross-cutting checks
  if (req.pathway === 'PMA' && req.pivotalEndpointsMet === false) {
    findings.push({
      code: 'SUFF-PIVOTAL-MISS',
      severity: 'critical',
      pillar: 'clinical_pivotal',
      message:
        'Pivotal study primary endpoint(s) not met. PMA approval is unlikely without an alternative effectiveness narrative.',
      citation: 'FDA "Acceptance and Filing Reviews for PMAs" (2019); 21 CFR 814.20(b)(6)',
    });
  }

  if (
    req.pathway === '510K' &&
    req.defenseReadinessScore !== null &&
    req.defenseReadinessScore !== undefined &&
    req.defenseReadinessScore < 60
  ) {
    findings.push({
      code: 'SUFF-510K-READINESS',
      severity: 'critical',
      pillar: 'predicate_substantial_equivalence',
      message: `Defense readiness score is ${req.defenseReadinessScore}/100; predicate equivalence story is weak.`,
      citation: 'FDA RTA Policy for 510(k)s (2019)',
    });
  }

  // 6. Counts + verdict
  const criticalCount = findings.filter(f => f.severity === 'critical').length;
  const warningCount = findings.filter(f => f.severity === 'warning').length;
  const { verdict, overallScore, blocksApproval } = deriveVerdict(pillarScores, criticalCount);

  // 7. Recommendations — top three highest-weight unsatisfied pillars
  const recommendations: string[] = pillarScores
    .filter(p => !p.satisfied)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map(
      p =>
        `Close ${p.name} gap: ${p.evidenceCount === 0 ? 'no evidence yet' : 'evidence is incomplete or non-quantitative'}.`
    );

  // 8. Persist (unless dryRun)
  const inputsHash = computeInputsHash(req, evidence.length);
  let assessmentId: string | null = null;

  const pillarScoreMap: Record<string, number> = {};
  for (const p of pillarScores) pillarScoreMap[p.pillar] = p.score;

  const summary = {
    pillarCount: pillarScores.length,
    satisfiedPillars: pillarScores.filter(p => p.satisfied).length,
    criticalCount,
    warningCount,
    evidenceObjectCount: evidence.length,
  };

  if (!req.dryRun) {
    const [row] = await db
      .insert(evidenceSufficiencyAssessments)
      .values({
        organizationId: req.organizationId,
        programId: req.programId,
        pathway: req.pathway,
        triggeredBy: req.triggeredBy ?? 'system',
        trigger: req.trigger ?? 'manual',
        inputsHash,
        verdict,
        overallScore,
        pillarScores: pillarScoreMap,
        findings,
        findingCount: findings.length,
        criticalCount,
        warningCount,
        recommendations,
        blocksApproval,
        inputsSnapshot: {
          profile: req.profile,
          claimHealth: req.claimHealth ?? null,
          pivotalEndpointsMet: req.pivotalEndpointsMet ?? null,
          defenseReadinessScore: req.defenseReadinessScore ?? null,
        },
        summary,
      })
      .returning({ id: evidenceSufficiencyAssessments.id });
    assessmentId = row?.id ?? null;
  }

  return {
    assessmentId,
    programId: req.programId,
    pathway: req.pathway,
    inputsHash,
    verdict,
    overallScore,
    blocksApproval,
    pillarScores,
    findings,
    recommendations,
    summary,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Read
// ─────────────────────────────────────────────────────────────────────────────

export async function getAssessment(organizationId: number, assessmentId: string) {
  const [row] = await db
    .select()
    .from(evidenceSufficiencyAssessments)
    .where(
      and(
        eq(evidenceSufficiencyAssessments.id, assessmentId),
        eq(evidenceSufficiencyAssessments.organizationId, organizationId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function listProgramAssessments(
  organizationId: number,
  programId: string,
  limit = 50
) {
  return db
    .select()
    .from(evidenceSufficiencyAssessments)
    .where(
      and(
        eq(evidenceSufficiencyAssessments.organizationId, organizationId),
        eq(evidenceSufficiencyAssessments.programId, programId)
      )
    )
    .limit(limit);
}

void inArray;
