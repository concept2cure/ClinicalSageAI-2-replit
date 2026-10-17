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
 * (sufficient | borderline | insufficient | incomplete); finding list;
 * recommendations; which inputs were assessed; persisted to
 * evidence_sufficiency_assessments.
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
import { stableStringify } from '../../../shared/canonical-json.js';

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
  /** Pre-computed claim health. Omitted, it is reported as not assessed. */
  claimHealth?: {
    /** How many current claims the check actually had to look at. Zero counts
     *  mean nothing when this is 0 — see the not-assessed finding below. */
    claimsRecorded?: number;
    assessed?: boolean;
    orphanClaimCount?: number;
    contradictedClaimCount?: number;
    unsupportedClaimCount?: number;
  };
  /** PMA pivotal endpoint outcomes (true=met, false=missed). Omitted on a PMA, not assessed. */
  pivotalEndpointsMet?: boolean | null;
  /** Optional: explicit list of evidence object IDs already known to caller; if
   *  omitted, the analyzer queries the program's evidence_objects directly. */
  evidenceOverride?: EvidenceObject[];
  trigger?: string;
  triggeredBy?: string;
  /** Defense packet readiness score (0..100) when 510K pathway. Omitted on a 510K, not assessed. */
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

/**
 * 'incomplete' (2026-10-15): the evidence was not found insufficient, but an
 * input the verdict depends on was not assessed, so it is not cleared. Such a
 * verdict used to come out 'sufficient' or 'borderline'.
 */
export type SufficiencyVerdict = EvidenceSufficiencyVerdict;

/** How an input to the verdict was obtained. 'caller_reported' = supplied in
 *  the request, not read from the program's records. */
export type SufficiencyInputStatus = 'assessed' | 'caller_reported' | 'not_assessed' | 'not_applicable';

export interface SufficiencyInputsAssessed {
  /** Scored here from the evidence inventory. */
  pillars: 'assessed';
  claimHealth: SufficiencyInputStatus;
  pivotalEndpoints: SufficiencyInputStatus;
  defenseReadiness: SufficiencyInputStatus;
}

export interface SufficiencyResult {
  assessmentId: string | null;
  programId: string;
  pathway: SubmissionPathway;
  inputsHash: string;
  verdict: SufficiencyVerdict;
  overallScore: number; // 0..100
  blocksApproval: boolean;
  assessed: SufficiencyInputsAssessed;
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

/** True when `v` is a finite number (or a numeric string), directly or nested. */
function carriesNumber(v: unknown, depth = 0): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') return v.trim() !== '' && Number.isFinite(Number(v));
  if (v == null || typeof v !== 'object' || depth >= 4) return false;
  return Object.values(v as Record<string, unknown>).some(x => carriesNumber(x, depth + 1));
}

function isQuantitative(ev: EvidenceObject): boolean {
  // Quantitative iff testResults carries a number OR qualityScore is set (the
  // two sources the finding names). 2026-10-15: `testResults != null` used to
  // accept `{}`, and any relevance score > 0 counted, though relevance says how
  // pertinent the evidence is, not what it measured.
  if (carriesNumber(ev.testResults)) return true;
  if (ev.qualityScore != null && Number(ev.qualityScore) > 0) return true;
  return false;
}

/**
 * Whether the supplied claim health describes an examination that happened.
 * Zero counts mean nothing without a denominator; a positive count proves
 * claims were looked at.
 */
function claimHealthAssessed(ch: AssessRequest['claimHealth']): boolean {
  if (ch == null || ch.assessed === false) return false;
  if (ch.claimsRecorded != null) return ch.claimsRecorded > 0;
  if (ch.assessed === true) return true;
  return (
    (ch.orphanClaimCount ?? 0) > 0 ||
    (ch.contradictedClaimCount ?? 0) > 0 ||
    (ch.unsupportedClaimCount ?? 0) > 0
  );
}

function inputsAssessed(req: AssessRequest): SufficiencyInputsAssessed {
  const supplied = (applies: boolean, present: boolean): SufficiencyInputStatus =>
    !applies ? 'not_applicable' : present ? 'caller_reported' : 'not_assessed';
  return {
    pillars: 'assessed',
    claimHealth: supplied(true, claimHealthAssessed(req.claimHealth)),
    pivotalEndpoints: supplied(req.pathway === 'PMA', typeof req.pivotalEndpointsMet === 'boolean'),
    defenseReadiness: supplied(
      req.pathway === '510K',
      typeof req.defenseReadinessScore === 'number' && Number.isFinite(req.defenseReadinessScore)
    ),
  };
}

/**
 * Digest of the assessment payload. Computed per call and returned, never
 * compared against a stored value — free to re-point
 * (docs/CANONICALIZATION_MIGRATION_2026-08.md).
 */

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
  criticalCount: number,
  inputsUnassessed: boolean
): { verdict: SufficiencyVerdict; overallScore: number; blocksApproval: boolean } {
  // Weighted average across applicable pillars
  const totalWeight = pillarScores.reduce((s, p) => s + p.weight, 0) || 1;
  const weightedScore = pillarScores.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight;
  const overallScore = Math.round(weightedScore);

  // Verdict thresholds:
  //   any critical finding OR overall < 60  → insufficient (blocks approval)
  //   an input the verdict depends on was not assessed → incomplete (not
  //     cleared, so blocks approval: the missing check could still add a
  //     critical finding). 2026-10-15: this used to fall through to
  //     borderline / sufficient.
  //   60..79  → borderline (does not block, but flags risk)
  //   ≥ 80    → sufficient
  let verdict: SufficiencyVerdict;
  let blocksApproval = false;
  if (criticalCount > 0 || overallScore < 60) {
    verdict = 'insufficient';
    blocksApproval = true;
  } else if (inputsUnassessed) {
    verdict = 'incomplete';
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

  // 4. Cross-cutting findings from claim health
  //
  // ZERO CONTRADICTIONS FROM AN UNASSESSED STORE IS NOT A CLEAN RESULT. The
  // contradiction and unsupported-claim checks below only ever ADD findings, so
  // an empty claim store contributes nothing and the verdict comes out as
  // though claim health had been examined and passed. It decides whether a
  // submission is cleared for approval, so the absence of an assessment has to
  // be visible in it rather than indistinguishable from a pass.
  //
  // 2026-10-15: an omitted claimHealth, or zero counts with no denominator,
  // used to get no finding. Both are claim health nobody examined; each
  // not-assessed input also caps the verdict at 'incomplete' (deriveVerdict).
  const assessed = inputsAssessed(req);
  if (assessed.claimHealth === 'not_assessed') {
    const ch = req.claimHealth;
    findings.push({
      code: 'SUFF-CLAIM-HEALTH-NOT-ASSESSED',
      // 'warning', not 'critical': an unassessed check is a gap in the
      // evidence FOR the verdict, not a defect found in the submission.
      // Critical here would call the evidence insufficient on the strength of
      // an absence; the verdict says 'incomplete' instead.
      severity: 'warning',
      message:
        ch == null
          ? 'Claim health was not assessed: no claim-health result was supplied, so no claim ' +
            'was checked for contradicting or missing evidence.'
          : ch.assessed === false || ch.claimsRecorded === 0
            ? 'Claim health was not assessed: no claims are recorded for this program, so the ' +
              'orphan and contradiction counts are zero because nothing was examined — not because ' +
              'nothing was found.'
            : 'Claim health was not assessed: the result supplied does not say how many claims ' +
              'were examined, so its zero counts cannot be told apart from no examination.',
      citation: '21 CFR 807.87(e); 21 CFR 814.20(b)(2)',
      recommendedFix:
        'Record and check the claims this submission makes, then re-run the assessment with ' +
        'that claim health so the counts describe an examination that happened.',
    });
  }
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
  if (assessed.pivotalEndpoints === 'not_assessed') {
    findings.push({
      code: 'SUFF-PIVOTAL-NOT-ASSESSED',
      severity: 'warning',
      pillar: 'clinical_pivotal',
      message:
        'Whether the pivotal study met its primary endpoint(s) was not supplied, so the ' +
        'pivotal-miss check did not run.',
      citation: '21 CFR 814.20(b)(6)',
      recommendedFix: 'Record whether each pivotal primary endpoint was met, then re-run the assessment.',
    });
  }
  if (assessed.defenseReadiness === 'not_assessed') {
    findings.push({
      code: 'SUFF-510K-READINESS-NOT-ASSESSED',
      severity: 'warning',
      pillar: 'predicate_substantial_equivalence',
      message:
        'No defense-packet readiness score was supplied, so the predicate-equivalence ' +
        'readiness check did not run.',
      citation: 'FDA RTA Policy for 510(k)s (2019)',
      recommendedFix: 'Build the 510(k) defense packet, then re-run the assessment with its readiness score.',
    });
  }
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
  const { verdict, overallScore, blocksApproval } = deriveVerdict(
    pillarScores,
    criticalCount,
    Object.values(assessed).includes('not_assessed')
  );

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
        // Not recorded when the caller supplied no actor (was 'system' until 2026-10-15).
        triggeredBy: req.triggeredBy ?? null,
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
          assessed,
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
    assessed,
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
