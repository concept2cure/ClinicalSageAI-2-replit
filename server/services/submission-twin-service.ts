/**
 * Submission Twin Service
 *
 * Living submission intelligence layer that continuously models claims,
 * evidence, drift, regulator challenges, change impacts, and readiness
 * across the entire Concept2Cure platform.
 *
 * Core Capabilities:
 *   1. Claim-to-Evidence Integrity Map
 *   2. Narrative Drift Detection
 *   3. Regulator Challenge Simulation
 *   4. Change Consequence Intelligence
 *   5. Next Best Artifact Prediction
 *   6. Readiness + Fragility Modeling
 */

import { db } from '../db';
import {
  submissionTwinClaims,
  submissionTwinEvidenceLinks,
  submissionTwinDriftAlerts,
  submissionTwinChallenges,
  submissionTwinChangeImpacts,
  submissionTwinAssessments,
  c2cSubmissionPackages,
  c2cPackageSections,
  c2cReadinessSnapshots,
  c2cBlockers,
  concept2cureArtifacts,
  concept2cureArtifactVersions,
  c2cArtifactSectionMap,
  type SubmissionTwinClaim,
  type SubmissionTwinAssessment,
  type SubmissionTwinDriftAlert,
  type SubmissionTwinChallenge,
  type SubmissionTwinChangeImpact,
  type SubmissionTwinEvidenceLink,
} from '../../shared/schema';
import { eq, and, desc, sql, count, inArray, isNull } from 'drizzle-orm';
import { ai } from '../lib/unified-ai-client';

// ── Enum validators ──

const VALID_DRIFT_TYPES = new Set([
  'summary_detail_mismatch', 'claim_escalation_without_evidence', 'endpoint_framing_drift',
  'cmc_maturity_overstatement', 'narrative_statistical_mismatch', 'document_contradiction',
  'stale_downstream_summary',
]);

const VALID_SEVERITIES = new Set([
  'critical', 'high', 'medium', 'low', 'informational',
]);

const VALID_REVIEWER_LENSES = new Set([
  'skeptical_reviewer', 'evidence_sufficiency_skeptic', 'cmc_heavy_reviewer',
  'clinical_risk_reviewer', 'compliance_inspection', 'claims_challenger', 'biostatistics_skeptic',
]);

const VALID_SUPPORT_STRENGTHS = new Set([
  'direct', 'indirect', 'weak', 'stale', 'contradictory', 'unsupported',
]);

function validateDriftType(val: string): string {
  return VALID_DRIFT_TYPES.has(val) ? val : 'document_contradiction';
}

function validateSeverity(val: string): string {
  return VALID_SEVERITIES.has(val) ? val : 'medium';
}

function validateSupportStrength(val: string): string {
  return VALID_SUPPORT_STRENGTHS.has(val) ? val : 'unsupported';
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// ── Types ──

interface ClaimExtractionResult {
  claims: Array<{
    claimText: string;
    claimType: string;
    sectionPath: string;
    confidence: number;
    sourceLocation?: { page?: number; paragraph?: number };
  }>;
}

interface EvidenceAssessment {
  claimId: number;
  claimText: string;
  supportStrength: 'direct' | 'indirect' | 'weak' | 'stale' | 'contradictory' | 'unsupported';
  relevanceScore: number;
  evidenceText: string;
  isStatistical: boolean;
  statisticalDetail?: Record<string, unknown>;
}

interface DriftDetection {
  driftType: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  description: string;
  sourceExcerpt?: string;
  targetExcerpt?: string;
  suggestedFix?: string;
}

interface ChallengeResult {
  reviewerLens: string;
  challengeText: string;
  targetSection?: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  deficiencyLikelihood: number;
  suggestedResponse?: string;
  suggestedArtifact?: string;
}

interface FragilityZone {
  section: string;
  sectionId?: number;
  score: number;
  issues: string[];
}

interface NextBestArtifactPrediction {
  artifactType: string;
  rationale: string;
  priority: 'critical' | 'high' | 'medium';
  targetSection?: string;
}

interface FullAssessmentResult {
  assessment: SubmissionTwinAssessment;
  claims: SubmissionTwinClaim[];
  driftAlerts: SubmissionTwinDriftAlert[];
  challenges: SubmissionTwinChallenge[];
  weakZones: FragilityZone[];
  nextBestArtifact: NextBestArtifactPrediction | null;
}

// ── Service ──

class SubmissionTwinService {

  // ═══════════════════════════════════════════════════════
  // 1. CLAIM-TO-EVIDENCE INTEGRITY MAP
  // ═══════════════════════════════════════════════════════

  /**
   * Extract claims from all artifacts in a submission package.
   */
  async extractClaims(
    packageId: number,
    organizationId: number
  ): Promise<SubmissionTwinClaim[]> {
    // Get all artifacts in this package
    const artifactMappings = await db
      .select({
        artifactId: c2cArtifactSectionMap.artifactId,
        sectionId: c2cArtifactSectionMap.sectionDbId,
      })
      .from(c2cArtifactSectionMap)
      .innerJoin(
        c2cPackageSections,
        eq(c2cArtifactSectionMap.sectionDbId, c2cPackageSections.id)
      )
      .where(eq(c2cPackageSections.packageDbId, packageId));

    if (artifactMappings.length === 0) {
      return [];
    }

    const artifactIds = [...new Set(artifactMappings.map(m => m.artifactId))];

    // Get artifact content (latest versions)
    const artifacts = await db
      .select({
        id: concept2cureArtifacts.id,
        type: concept2cureArtifacts.type,
        metadata: concept2cureArtifacts.metadata,
      })
      .from(concept2cureArtifacts)
      .where(
        and(
          inArray(concept2cureArtifacts.id, artifactIds),
          eq(concept2cureArtifacts.organizationId, organizationId)
        )
      );

    // Get latest version content for each artifact
    const allClaims: SubmissionTwinClaim[] = [];

    for (const artifact of artifacts) {
      const [latestVersion] = await db
        .select({ content: concept2cureArtifactVersions.content })
        .from(concept2cureArtifactVersions)
        .where(eq(concept2cureArtifactVersions.artifactId, artifact.id))
        .orderBy(desc(concept2cureArtifactVersions.version))
        .limit(1);

      if (!latestVersion?.content) continue;

      const content = typeof latestVersion.content === 'string'
        ? latestVersion.content
        : JSON.stringify(latestVersion.content);

      if (content.length < 50) continue;

      // Find which section this artifact is in
      const mapping = artifactMappings.find(m => m.artifactId === artifact.id);

      try {
        const extracted = await this.aiExtractClaims(content);

        for (const claim of extracted.claims) {
          const [inserted] = await db
            .insert(submissionTwinClaims)
            .values({
              packageId,
              artifactId: artifact.id,
              sectionId: mapping?.sectionId ?? null,
              claimText: claim.claimText,
              claimType: claim.claimType,
              sectionPath: claim.sectionPath,
              sourceLocation: claim.sourceLocation ?? null,
              confidence: claim.confidence,
              organizationId,
            })
            .returning();

          allClaims.push(inserted);
        }
      } catch (err) {
        console.error(`[SubmissionTwin] Claim extraction failed for artifact ${artifact.id}:`, err);
      }
    }

    return allClaims;
  }

  /**
   * Assess evidence support for all active claims in a package.
   */
  async assessEvidenceIntegrity(
    packageId: number,
    organizationId: number
  ): Promise<{
    totalClaims: number;
    supportedClaims: number;
    weakClaims: number;
    unsupportedClaims: number;
    contradictedClaims: number;
    evidenceLinks: SubmissionTwinEvidenceLink[];
  }> {
    const claims = await db
      .select()
      .from(submissionTwinClaims)
      .where(
        and(
          eq(submissionTwinClaims.packageId, packageId),
          eq(submissionTwinClaims.organizationId, organizationId),
          eq(submissionTwinClaims.isActive, true)
        )
      );

    if (claims.length === 0) {
      return { totalClaims: 0, supportedClaims: 0, weakClaims: 0, unsupportedClaims: 0, contradictedClaims: 0, evidenceLinks: [] };
    }

    // Get all artifact content in this package for cross-reference
    const artifactContent = await this.getPackageArtifactContent(packageId, organizationId);

    const links: SubmissionTwinEvidenceLink[] = [];
    let supported = 0, weak = 0, unsupported = 0, contradicted = 0;

    // Batch claims for AI assessment
    const batchSize = 10;
    for (let i = 0; i < claims.length; i += batchSize) {
      const batch = claims.slice(i, i + batchSize);
      try {
        const assessments = await this.aiAssessEvidence(batch, artifactContent);

        for (const assessment of assessments) {
          const [link] = await db
            .insert(submissionTwinEvidenceLinks)
            .values({
              claimId: assessment.claimId,
              evidenceText: assessment.evidenceText,
              supportStrength: assessment.supportStrength,
              relevanceScore: assessment.relevanceScore,
              isStatistical: assessment.isStatistical,
              statisticalDetail: assessment.statisticalDetail ?? null,
              organizationId,
            })
            .returning();

          links.push(link);

          switch (assessment.supportStrength) {
            case 'direct':
            case 'indirect':
              supported++;
              break;
            case 'weak':
            case 'stale':
              weak++;
              break;
            case 'unsupported':
              unsupported++;
              break;
            case 'contradictory':
              contradicted++;
              break;
          }
        }
      } catch (err) {
        console.error('[SubmissionTwin] Evidence assessment batch failed:', err);
      }
    }

    return {
      totalClaims: claims.length,
      supportedClaims: supported,
      weakClaims: weak,
      unsupportedClaims: unsupported,
      contradictedClaims: contradicted,
      evidenceLinks: links,
    };
  }

  /**
   * Get claims with their evidence support summary for a package.
   */
  async getClaimEvidenceMap(
    packageId: number,
    organizationId: number
  ) {
    const claims = await db
      .select()
      .from(submissionTwinClaims)
      .where(
        and(
          eq(submissionTwinClaims.packageId, packageId),
          eq(submissionTwinClaims.organizationId, organizationId),
          eq(submissionTwinClaims.isActive, true)
        )
      )
      .orderBy(desc(submissionTwinClaims.confidence));

    const claimsWithEvidence = await Promise.all(
      claims.map(async claim => {
        const evidence = await db
          .select()
          .from(submissionTwinEvidenceLinks)
          .where(
            and(
              eq(submissionTwinEvidenceLinks.claimId, claim.id),
              eq(submissionTwinEvidenceLinks.organizationId, organizationId)
            )
          );

        const bestSupport = evidence.length > 0
          ? evidence.reduce((best, e) => (e.relevanceScore ?? 0) > (best.relevanceScore ?? 0) ? e : best)
          : null;

        return {
          ...claim,
          evidenceCount: evidence.length,
          bestSupportStrength: bestSupport?.supportStrength ?? 'unsupported',
          bestRelevanceScore: bestSupport?.relevanceScore ?? 0,
          hasStatisticalSupport: evidence.some(e => e.isStatistical),
          evidence,
        };
      })
    );

    return claimsWithEvidence;
  }

  // ═══════════════════════════════════════════════════════
  // 2. NARRATIVE DRIFT DETECTION
  // ═══════════════════════════════════════════════════════

  /**
   * Detect narrative drift across all artifacts in a package.
   */
  async detectDrift(
    packageId: number,
    organizationId: number
  ): Promise<SubmissionTwinDriftAlert[]> {
    const artifactContent = await this.getPackageArtifactContent(packageId, organizationId);

    if (artifactContent.length < 2) {
      return []; // Need at least 2 artifacts to detect drift
    }

    try {
      const drifts = await this.aiDetectDrift(artifactContent);

      const alerts: SubmissionTwinDriftAlert[] = [];

      for (const drift of drifts) {
        // Find source/target artifact IDs
        const sourceArtifact = artifactContent.find(a =>
          drift.sourceExcerpt && a.content.includes(drift.sourceExcerpt.substring(0, 50))
        );
        const targetArtifact = artifactContent.find(a =>
          drift.targetExcerpt && a.content.includes(drift.targetExcerpt.substring(0, 50))
        );

        const [alert] = await db
          .insert(submissionTwinDriftAlerts)
          .values({
            packageId,
            driftType: validateDriftType(drift.driftType) as any,
            severity: validateSeverity(drift.severity) as any,
            sourceArtifactId: sourceArtifact?.artifactId ?? null,
            targetArtifactId: targetArtifact?.artifactId ?? null,
            description: drift.description,
            sourceExcerpt: drift.sourceExcerpt ?? null,
            targetExcerpt: drift.targetExcerpt ?? null,
            suggestedFix: drift.suggestedFix ?? null,
            organizationId,
          })
          .returning();

        alerts.push(alert);
      }

      return alerts;
    } catch (err) {
      console.error('[SubmissionTwin] Drift detection failed:', err);
      return [];
    }
  }

  /**
   * Get active (unresolved) drift alerts for a package.
   */
  async getDriftAlerts(
    packageId: number,
    organizationId: number
  ): Promise<SubmissionTwinDriftAlert[]> {
    return db
      .select()
      .from(submissionTwinDriftAlerts)
      .where(
        and(
          eq(submissionTwinDriftAlerts.packageId, packageId),
          eq(submissionTwinDriftAlerts.organizationId, organizationId),
          eq(submissionTwinDriftAlerts.resolved, false)
        )
      )
      .orderBy(desc(submissionTwinDriftAlerts.createdAt));
  }

  /**
   * Resolve a drift alert.
   */
  async resolveDriftAlert(
    alertId: number,
    organizationId: number,
    resolvedBy: number
  ) {
    const [updated] = await db
      .update(submissionTwinDriftAlerts)
      .set({
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
      })
      .where(
        and(
          eq(submissionTwinDriftAlerts.id, alertId),
          eq(submissionTwinDriftAlerts.organizationId, organizationId)
        )
      )
      .returning();

    return updated;
  }

  // ═══════════════════════════════════════════════════════
  // 3. REGULATOR CHALLENGE SIMULATION
  // ═══════════════════════════════════════════════════════

  /**
   * Simulate regulator challenges against the submission package.
   */
  async simulateChallenges(
    packageId: number,
    organizationId: number,
    assessmentId: number,
    lenses?: string[]
  ): Promise<SubmissionTwinChallenge[]> {
    const defaultLenses = [
      'skeptical_reviewer',
      'evidence_sufficiency_skeptic',
      'cmc_heavy_reviewer',
      'clinical_risk_reviewer',
      'biostatistics_skeptic',
    ];

    const activeLenses = lenses ?? defaultLenses;

    // Get package info
    const [pkg] = await db
      .select()
      .from(c2cSubmissionPackages)
      .where(
        and(
          eq(c2cSubmissionPackages.id, packageId),
          eq(c2cSubmissionPackages.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!pkg) throw new Error(`Package ${packageId} not found`);

    // Gather claims and evidence for context
    const claims = await db
      .select()
      .from(submissionTwinClaims)
      .where(
        and(
          eq(submissionTwinClaims.packageId, packageId),
          eq(submissionTwinClaims.organizationId, organizationId),
          eq(submissionTwinClaims.isActive, true)
        )
      );

    // Get existing blockers
    const blockers = await db
      .select()
      .from(c2cBlockers)
      .where(
        and(
          eq(c2cBlockers.packageDbId, packageId),
          eq(c2cBlockers.organizationId, organizationId),
          eq(c2cBlockers.status, 'open')
        )
      );

    // Get readiness snapshot
    const [readiness] = await db
      .select()
      .from(c2cReadinessSnapshots)
      .where(
        and(
          eq(c2cReadinessSnapshots.packageDbId, packageId),
          eq(c2cReadinessSnapshots.organizationId, organizationId)
        )
      )
      .orderBy(desc(c2cReadinessSnapshots.computedAt))
      .limit(1);

    const challenges: SubmissionTwinChallenge[] = [];

    for (const lens of activeLenses) {
      try {
        const results = await this.aiSimulateReviewerChallenges(
          lens,
          pkg,
          claims,
          blockers,
          readiness
        );

        for (const result of results) {
          // Find matching claim if referenced
          const targetClaim = result.targetSection
            ? claims.find(c => c.sectionPath?.includes(result.targetSection!))
            : null;

          const [challenge] = await db
            .insert(submissionTwinChallenges)
            .values({
              packageId,
              assessmentId,
              reviewerLens: (VALID_REVIEWER_LENSES.has(lens) ? lens : 'skeptical_reviewer') as any,
              challengeText: result.challengeText,
              targetClaimId: targetClaim?.id ?? null,
              targetSection: result.targetSection ?? null,
              severity: validateSeverity(result.severity) as any,
              deficiencyLikelihood: result.deficiencyLikelihood,
              suggestedResponse: result.suggestedResponse ?? null,
              suggestedArtifact: result.suggestedArtifact ?? null,
              organizationId,
            })
            .returning();

          challenges.push(challenge);
        }
      } catch (err) {
        console.error(`[SubmissionTwin] Challenge simulation failed for lens ${lens}:`, err);
      }
    }

    return challenges;
  }

  /**
   * Get challenges for a specific assessment or package.
   */
  async getChallenges(
    packageId: number,
    organizationId: number,
    assessmentId?: number
  ) {
    const conditions = [
      eq(submissionTwinChallenges.packageId, packageId),
      eq(submissionTwinChallenges.organizationId, organizationId),
    ];

    if (assessmentId) {
      conditions.push(eq(submissionTwinChallenges.assessmentId, assessmentId));
    }

    return db
      .select()
      .from(submissionTwinChallenges)
      .where(and(...conditions))
      .orderBy(desc(submissionTwinChallenges.severity));
  }

  // ═══════════════════════════════════════════════════════
  // 4. CHANGE CONSEQUENCE INTELLIGENCE
  // ═══════════════════════════════════════════════════════

  /**
   * Analyze the impact of a change to a specific artifact.
   */
  async analyzeChangeImpact(
    packageId: number,
    changedArtifactId: number,
    changeDescription: string,
    changeType: string,
    organizationId: number
  ): Promise<SubmissionTwinChangeImpact[]> {
    // Get all artifacts in the same package
    const siblings = await this.getPackageArtifactContent(packageId, organizationId);

    // Get claims that depend on the changed artifact
    const affectedClaims = await db
      .select()
      .from(submissionTwinClaims)
      .where(
        and(
          eq(submissionTwinClaims.artifactId, changedArtifactId),
          eq(submissionTwinClaims.organizationId, organizationId),
          eq(submissionTwinClaims.isActive, true)
        )
      );

    // Get evidence links that reference the changed artifact
    const affectedEvidence = await db
      .select()
      .from(submissionTwinEvidenceLinks)
      .where(
        and(
          eq(submissionTwinEvidenceLinks.evidenceArtifactId, changedArtifactId),
          eq(submissionTwinEvidenceLinks.organizationId, organizationId)
        )
      );

    try {
      const impacts = await this.aiAnalyzeChangeImpact(
        changeDescription,
        changeType,
        affectedClaims,
        affectedEvidence,
        siblings
      );

      const records: SubmissionTwinChangeImpact[] = [];

      for (const impact of impacts) {
        const impactedArtifact = siblings.find(s =>
          impact.impactDescription.includes(s.artifactId.toString())
        );

        const [record] = await db
          .insert(submissionTwinChangeImpacts)
          .values({
            packageId,
            changedArtifactId,
            changeDescription,
            changeType,
            impactedArtifactId: impactedArtifact?.artifactId ?? null,
            impactedClaimId: impact.impactedClaimId ?? null,
            impactSeverity: validateSeverity(impact.severity) as any,
            impactDescription: impact.description,
            remediation: impact.remediation ?? null,
            organizationId,
          })
          .returning();

        records.push(record);
      }

      return records;
    } catch (err) {
      console.error('[SubmissionTwin] Change impact analysis failed:', err);
      return [];
    }
  }

  /**
   * Get unresolved change impacts for a package.
   */
  async getChangeImpacts(
    packageId: number,
    organizationId: number
  ) {
    return db
      .select()
      .from(submissionTwinChangeImpacts)
      .where(
        and(
          eq(submissionTwinChangeImpacts.packageId, packageId),
          eq(submissionTwinChangeImpacts.organizationId, organizationId),
          eq(submissionTwinChangeImpacts.resolved, false)
        )
      )
      .orderBy(desc(submissionTwinChangeImpacts.createdAt));
  }

  /**
   * Resolve a change impact.
   */
  async resolveChangeImpact(
    impactId: number,
    organizationId: number
  ) {
    const [updated] = await db
      .update(submissionTwinChangeImpacts)
      .set({ resolved: true, resolvedAt: new Date() })
      .where(
        and(
          eq(submissionTwinChangeImpacts.id, impactId),
          eq(submissionTwinChangeImpacts.organizationId, organizationId)
        )
      )
      .returning();

    return updated;
  }

  // ═══════════════════════════════════════════════════════
  // 5. NEXT BEST ARTIFACT PREDICTION
  // ═══════════════════════════════════════════════════════

  /**
   * Predict the highest-value next governed artifact to create.
   */
  async predictNextBestArtifact(
    packageId: number,
    organizationId: number
  ): Promise<NextBestArtifactPrediction> {
    // Gather all signals
    const [driftAlerts, claims, blockers, readiness] = await Promise.all([
      this.getDriftAlerts(packageId, organizationId),
      db.select().from(submissionTwinClaims).where(
        and(
          eq(submissionTwinClaims.packageId, packageId),
          eq(submissionTwinClaims.organizationId, organizationId),
          eq(submissionTwinClaims.isActive, true)
        )
      ),
      db.select().from(c2cBlockers).where(
        and(
          eq(c2cBlockers.packageDbId, packageId),
          eq(c2cBlockers.organizationId, organizationId),
          eq(c2cBlockers.status, 'open')
        )
      ),
      db.select().from(c2cReadinessSnapshots).where(
        and(
          eq(c2cReadinessSnapshots.packageDbId, packageId),
          eq(c2cReadinessSnapshots.organizationId, organizationId)
        )
      ).orderBy(desc(c2cReadinessSnapshots.computedAt)).limit(1),
    ]);

    // Get latest challenges
    const challenges = await db
      .select()
      .from(submissionTwinChallenges)
      .where(
        and(
          eq(submissionTwinChallenges.packageId, packageId),
          eq(submissionTwinChallenges.organizationId, organizationId)
        )
      )
      .orderBy(desc(submissionTwinChallenges.createdAt))
      .limit(20);

    // Evidence support summary
    const unsupportedClaims = await db
      .select({ id: submissionTwinClaims.id, claimText: submissionTwinClaims.claimText })
      .from(submissionTwinClaims)
      .leftJoin(submissionTwinEvidenceLinks, eq(submissionTwinEvidenceLinks.claimId, submissionTwinClaims.id))
      .where(
        and(
          eq(submissionTwinClaims.packageId, packageId),
          eq(submissionTwinClaims.organizationId, organizationId),
          eq(submissionTwinClaims.isActive, true),
          isNull(submissionTwinEvidenceLinks.id)
        )
      );

    try {
      return await this.aiPredictNextArtifact(
        driftAlerts,
        claims,
        unsupportedClaims,
        blockers,
        challenges,
        readiness[0] ?? null
      );
    } catch (err) {
      console.error('[SubmissionTwin] Next artifact prediction failed:', err);
      return {
        artifactType: 'Support Gap Memo',
        rationale: 'Default recommendation based on detected unsupported claims and gaps.',
        priority: 'medium',
      };
    }
  }

  // ═══════════════════════════════════════════════════════
  // 6. READINESS + FRAGILITY MODELING
  // ═══════════════════════════════════════════════════════

  /**
   * Compute readiness and fragility scores for the package.
   */
  async computeReadinessAndFragility(
    packageId: number,
    organizationId: number
  ): Promise<{
    readinessScore: number;
    fragilityScore: number;
    weakZones: FragilityZone[];
  }> {
    // Get existing readiness data
    const [readinessSnap] = await db
      .select()
      .from(c2cReadinessSnapshots)
      .where(
        and(
          eq(c2cReadinessSnapshots.packageDbId, packageId),
          eq(c2cReadinessSnapshots.organizationId, organizationId)
        )
      )
      .orderBy(desc(c2cReadinessSnapshots.computedAt))
      .limit(1);

    // Get claims and evidence state
    const claims = await db
      .select()
      .from(submissionTwinClaims)
      .where(
        and(
          eq(submissionTwinClaims.packageId, packageId),
          eq(submissionTwinClaims.organizationId, organizationId),
          eq(submissionTwinClaims.isActive, true)
        )
      );

    // Count evidence per claim (single query instead of N+1)
    const claimIds = claims.map(c => c.id);
    let evidenceCountRows: Array<{ claimId: number; cnt: number }> = [];
    if (claimIds.length > 0) {
      evidenceCountRows = (await db
        .select({
          claimId: submissionTwinEvidenceLinks.claimId,
          cnt: count(),
        })
        .from(submissionTwinEvidenceLinks)
        .where(
          and(
            inArray(submissionTwinEvidenceLinks.claimId, claimIds),
            eq(submissionTwinEvidenceLinks.organizationId, organizationId)
          )
        )
        .groupBy(submissionTwinEvidenceLinks.claimId)) as Array<{ claimId: number; cnt: number }>;
    }
    const evidenceCountMap = new Map(evidenceCountRows.map(r => [r.claimId, Number(r.cnt)]));
    const evidenceCounts = claims.map(c => ({
      claimId: c.id,
      sectionId: c.sectionId,
      count: evidenceCountMap.get(c.id) ?? 0,
    }));

    // Get drift alerts
    const driftAlerts = await this.getDriftAlerts(packageId, organizationId);

    // Get blockers
    const openBlockers = await db
      .select()
      .from(c2cBlockers)
      .where(
        and(
          eq(c2cBlockers.packageDbId, packageId),
          eq(c2cBlockers.organizationId, organizationId),
          eq(c2cBlockers.status, 'open')
        )
      );

    // Get sections for weak zone analysis
    const sections = await db
      .select()
      .from(c2cPackageSections)
      .where(eq(c2cPackageSections.packageDbId, packageId));

    // Compute per-section fragility
    const weakZones: FragilityZone[] = [];

    for (const section of sections) {
      const sectionClaims = claims.filter(c => c.sectionId === section.id);
      const sectionEvidence = evidenceCounts.filter(e => e.sectionId === section.id);
      const sectionBlockers = openBlockers.filter(b => b.sectionDbId === section.id);
      const sectionDrifts = driftAlerts.filter(d =>
        d.sourceArtifactId != null || d.targetArtifactId != null
      );

      const issues: string[] = [];

      // Unsupported claims
      const unsupported = sectionEvidence.filter(e => e.count === 0).length;
      if (unsupported > 0) {
        issues.push(`${unsupported} unsupported claim(s)`);
      }

      // Open blockers
      if (sectionBlockers.length > 0) {
        issues.push(`${sectionBlockers.length} open blocker(s)`);
      }

      // Drift alerts involving this section
      const driftCount = sectionDrifts.length;
      if (driftCount > 0) {
        issues.push(`${driftCount} drift alert(s)`);
      }

      if (issues.length > 0) {
        const score = Math.max(0, 100 - (unsupported * 15) - (sectionBlockers.length * 20) - (driftCount * 10));
        weakZones.push({
          section: section.sectionLabel ?? section.sectionKey,
          sectionId: section.id,
          score,
          issues,
        });
      }
    }

    // Compute overall scores
    const baseReadiness = readinessSnap?.readinessPercent ?? 50;
    const unsupportedTotal = evidenceCounts.filter(e => e.count === 0).length;
    const claimPenalty = claims.length > 0 ? (unsupportedTotal / claims.length) * 20 : 0;
    const driftPenalty = Math.min(20, driftAlerts.length * 4);
    const blockerPenalty = Math.min(20, openBlockers.length * 5);

    const readinessScore = Math.max(0, Math.min(100, baseReadiness - claimPenalty - driftPenalty - blockerPenalty));
    const fragilityScore = Math.min(100, claimPenalty + driftPenalty + blockerPenalty + (weakZones.length * 3));

    return {
      readinessScore: Math.round(readinessScore * 10) / 10,
      fragilityScore: Math.round(fragilityScore * 10) / 10,
      weakZones: weakZones.sort((a, b) => a.score - b.score),
    };
  }

  // ═══════════════════════════════════════════════════════
  // FULL ASSESSMENT — Orchestrates all capabilities
  // ═══════════════════════════════════════════════════════

  /**
   * Run a complete Submission Twin assessment on a package.
   * This is the primary entry point that coordinates all 6 capabilities.
   */
  async runFullAssessment(
    packageId: number,
    organizationId: number,
    triggeredBy?: number
  ): Promise<FullAssessmentResult> {
    // Create assessment record
    const [assessment] = await db
      .insert(submissionTwinAssessments)
      .values({
        packageId,
        status: 'running',
        organizationId,
        triggeredBy: triggeredBy ?? null,
      })
      .returning();

    try {
      // 1. Extract claims
      const claims = await this.extractClaims(packageId, organizationId);

      // 2. Assess evidence integrity
      const evidenceResult = await this.assessEvidenceIntegrity(packageId, organizationId);

      // 3. Detect drift
      const driftAlerts = await this.detectDrift(packageId, organizationId);

      // 4. Simulate challenges
      const challenges = await this.simulateChallenges(
        packageId,
        organizationId,
        assessment.id
      );

      // 5. Predict next best artifact
      const nextBestArtifact = await this.predictNextBestArtifact(packageId, organizationId);

      // 6. Compute readiness/fragility
      const { readinessScore, fragilityScore, weakZones } =
        await this.computeReadinessAndFragility(packageId, organizationId);

      // Generate executive summary
      const executiveSummary = await this.aiGenerateExecutiveSummary(
        claims.length,
        evidenceResult,
        driftAlerts.length,
        challenges.length,
        readinessScore,
        fragilityScore,
        weakZones,
        nextBestArtifact
      );

      // Update assessment record
      const criticalFindings = [
        ...driftAlerts.filter(d => d.severity === 'critical'),
        ...challenges.filter(c => c.severity === 'critical'),
      ].length;

      const [updatedAssessment] = await db
        .update(submissionTwinAssessments)
        .set({
          status: 'completed',
          readinessScore,
          fragilityScore,
          claimCount: claims.length,
          supportedClaimCount: evidenceResult.supportedClaims,
          unsupportedClaimCount: evidenceResult.unsupportedClaims,
          driftAlertCount: driftAlerts.length,
          challengeCount: challenges.length,
          criticalFindingCount: criticalFindings,
          nextBestArtifact: nextBestArtifact.artifactType,
          nextBestArtifactRationale: nextBestArtifact.rationale,
          weakZones: weakZones as any,
          executiveSummary,
          completedAt: new Date(),
        })
        .where(eq(submissionTwinAssessments.id, assessment.id))
        .returning();

      return {
        assessment: updatedAssessment,
        claims,
        driftAlerts,
        challenges,
        weakZones,
        nextBestArtifact,
      };
    } catch (err) {
      // Mark assessment as failed
      await db
        .update(submissionTwinAssessments)
        .set({ status: 'failed', completedAt: new Date() })
        .where(eq(submissionTwinAssessments.id, assessment.id));

      console.error('[SubmissionTwin] Full assessment failed:', err);
      throw err;
    }
  }

  /**
   * Get assessment history for a package.
   */
  async getAssessments(
    packageId: number,
    organizationId: number
  ): Promise<SubmissionTwinAssessment[]> {
    return db
      .select()
      .from(submissionTwinAssessments)
      .where(
        and(
          eq(submissionTwinAssessments.packageId, packageId),
          eq(submissionTwinAssessments.organizationId, organizationId)
        )
      )
      .orderBy(desc(submissionTwinAssessments.createdAt));
  }

  /**
   * Get a single assessment with full detail.
   */
  async getAssessmentDetail(
    assessmentId: number,
    organizationId: number
  ) {
    const [assessment] = await db
      .select()
      .from(submissionTwinAssessments)
      .where(
        and(
          eq(submissionTwinAssessments.id, assessmentId),
          eq(submissionTwinAssessments.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!assessment) return null;

    const [challenges, driftAlerts, changeImpacts] = await Promise.all([
      db.select().from(submissionTwinChallenges).where(
        and(
          eq(submissionTwinChallenges.assessmentId, assessmentId),
          eq(submissionTwinChallenges.organizationId, organizationId)
        )
      ),
      db.select().from(submissionTwinDriftAlerts).where(
        and(
          eq(submissionTwinDriftAlerts.packageId, assessment.packageId),
          eq(submissionTwinDriftAlerts.organizationId, organizationId),
          eq(submissionTwinDriftAlerts.resolved, false)
        )
      ),
      db.select().from(submissionTwinChangeImpacts).where(
        and(
          eq(submissionTwinChangeImpacts.packageId, assessment.packageId),
          eq(submissionTwinChangeImpacts.organizationId, organizationId),
          eq(submissionTwinChangeImpacts.resolved, false)
        )
      ),
    ]);

    return { assessment, challenges, driftAlerts, changeImpacts };
  }

  // ═══════════════════════════════════════════════════════
  // PRIVATE: AI Helpers
  // ═══════════════════════════════════════════════════════

  private async getPackageArtifactContent(
    packageId: number,
    organizationId: number
  ): Promise<Array<{ artifactId: number; content: string; sectionKey?: string }>> {
    const mappings = await db
      .select({
        artifactId: c2cArtifactSectionMap.artifactId,
        sectionKey: c2cPackageSections.sectionKey,
      })
      .from(c2cArtifactSectionMap)
      .innerJoin(c2cPackageSections, eq(c2cArtifactSectionMap.sectionDbId, c2cPackageSections.id))
      .where(
        and(
          eq(c2cPackageSections.packageDbId, packageId),
          eq(c2cPackageSections.organizationId, organizationId)
        )
      );

    const results: Array<{ artifactId: number; content: string; sectionKey?: string }> = [];
    const MAX_ARTIFACTS = 200; // Bound memory usage

    for (const mapping of mappings.slice(0, MAX_ARTIFACTS)) {
      const [version] = await db
        .select({ content: concept2cureArtifactVersions.content })
        .from(concept2cureArtifactVersions)
        .innerJoin(
          concept2cureArtifacts,
          eq(concept2cureArtifactVersions.artifactId, concept2cureArtifacts.id)
        )
        .where(
          and(
            eq(concept2cureArtifactVersions.artifactId, mapping.artifactId),
            eq(concept2cureArtifacts.organizationId, organizationId)
          )
        )
        .orderBy(desc(concept2cureArtifactVersions.version))
        .limit(1);

      if (version?.content) {
        const content = typeof version.content === 'string'
          ? version.content
          : JSON.stringify(version.content);

        results.push({
          artifactId: mapping.artifactId,
          content: content.substring(0, 4000),
          sectionKey: mapping.sectionKey,
        });
      }
    }

    return results;
  }

  private async aiExtractClaims(content: string): Promise<ClaimExtractionResult> {
    const raw = await ai.complete(
      [
        {
          role: 'system',
          content: `You are a regulatory submission analyst. Extract all claims, assertions, rationales, and summary statements from the document content. For each claim, categorize it as one of: efficacy, safety, cmc_quality, regulatory_precedent, statistical, labeling. Assign a confidence score (0-1) based on how explicitly the claim is stated. Return JSON: {"claims": [{"claimText": "...", "claimType": "...", "sectionPath": "...", "confidence": 0.9}]}`,
        },
        { role: 'user', content: content.substring(0, 6000) },
      ],
      { jsonMode: true, temperature: 0.2 }
    );

    const parsed = safeJsonParse(raw, { claims: [] });
    return parsed as ClaimExtractionResult;
  }

  private async aiAssessEvidence(
    claims: SubmissionTwinClaim[],
    artifactContent: Array<{ artifactId: number; content: string; sectionKey?: string }>
  ): Promise<EvidenceAssessment[]> {
    const claimSummary = claims.map(c => ({
      id: c.id,
      text: c.claimText,
      type: c.claimType,
      section: c.sectionPath,
    }));

    const contextSummary = artifactContent.map(a => ({
      section: a.sectionKey,
      excerpt: a.content.substring(0, 1500),
    }));

    const raw = await ai.complete(
      [
        {
          role: 'system',
          content: `You are a regulatory evidence analyst. For each claim, assess whether the provided document context supports it. Rate support as: direct (strong explicit support), indirect (related but not explicit), weak (tangential), stale (may be outdated), contradictory (evidence contradicts), unsupported (no evidence found). Provide relevanceScore (0-1). Flag if evidence is statistical in nature. Return JSON: {"assessments": [{"claimId": N, "claimText": "...", "supportStrength": "...", "relevanceScore": 0.8, "evidenceText": "relevant excerpt", "isStatistical": false}]}`,
        },
        {
          role: 'user',
          content: JSON.stringify({ claims: claimSummary, context: contextSummary }),
        },
      ],
      { jsonMode: true, temperature: 0.2 }
    );

    const parsed = safeJsonParse(raw, { assessments: [] });
    return (parsed.assessments ?? []) as EvidenceAssessment[];
  }

  private async aiDetectDrift(
    artifacts: Array<{ artifactId: number; content: string; sectionKey?: string }>
  ): Promise<DriftDetection[]> {
    const raw = await ai.complete(
      [
        {
          role: 'system',
          content: `You are a regulatory submission consistency analyst. Compare the provided documents and detect narrative drift: summary/detail mismatches, claim escalation without evidence, endpoint framing inconsistencies, CMC maturity overstatement, narrative-vs-statistical mismatches, document contradictions, stale summaries. Return JSON: {"drifts": [{"driftType": "summary_detail_mismatch|claim_escalation_without_evidence|endpoint_framing_drift|cmc_maturity_overstatement|narrative_statistical_mismatch|document_contradiction|stale_downstream_summary", "severity": "critical|high|medium|low|informational", "description": "...", "sourceExcerpt": "...", "targetExcerpt": "...", "suggestedFix": "..."}]}`,
        },
        {
          role: 'user',
          content: JSON.stringify(artifacts.map(a => ({
            section: a.sectionKey,
            content: a.content.substring(0, 2000),
          }))),
        },
      ],
      { jsonMode: true, temperature: 0.3 }
    );

    const parsed = safeJsonParse(raw, { drifts: [] });
    return (parsed.drifts ?? []) as DriftDetection[];
  }

  private async aiSimulateReviewerChallenges(
    lens: string,
    pkg: any,
    claims: SubmissionTwinClaim[],
    blockers: any[],
    readiness: any
  ): Promise<ChallengeResult[]> {
    const lensDescriptions: Record<string, string> = {
      skeptical_reviewer: 'You are a skeptical FDA/EMA reviewer who questions every claim and looks for gaps.',
      evidence_sufficiency_skeptic: 'You focus on whether evidence is sufficient. You look for thin support, missing studies, or over-reliance on indirect evidence.',
      cmc_heavy_reviewer: 'You focus on CMC (Chemistry, Manufacturing, Controls) quality, stability, process validation, and manufacturing readiness.',
      clinical_risk_reviewer: 'You focus on clinical risk: safety signals, adverse events, risk-benefit balance, and REMS considerations.',
      compliance_inspection: 'You think like a GCP/GMP inspector. You look for documentation gaps, audit trail issues, and regulatory compliance gaps.',
      claims_challenger: 'You systematically challenge each claim looking for overstatements, unsupported conclusions, and logical gaps.',
      biostatistics_skeptic: 'You question statistical methodology: endpoints, power, sample size, multiplicity handling, missing data approaches, and whether statistical conclusions support clinical claims.',
    };

    const claimSummary = claims.slice(0, 20).map(c => `[${c.claimType}] ${c.claimText}`).join('\n');
    const blockerSummary = blockers.slice(0, 10).map(b => `[${b.severity}] ${b.title}`).join('\n');

    const raw = await ai.complete(
      [
        {
          role: 'system',
          content: `${lensDescriptions[lens] ?? 'You are a regulatory reviewer.'} Generate 3-7 specific, actionable reviewer challenges that this submission would likely face. For each, suggest a response strategy and recommend a governed artifact to create. Return JSON: {"challenges": [{"challengeText": "...", "targetSection": "...", "severity": "critical|high|medium|low|informational", "deficiencyLikelihood": 0.7, "suggestedResponse": "...", "suggestedArtifact": "Reviewer Concern Brief|Evidence Memo|Support Gap Memo|Statistical Justification Brief|CMC Fragility Memo|Protocol Rationale Brief|Comparator Summary"}]}`,
        },
        {
          role: 'user',
          content: `Submission package: ${pkg.title ?? 'Untitled'} (${pkg.packageFamily ?? 'unknown'})
Readiness: ${readiness?.readinessPercent ?? 'unknown'}%
Open blockers: ${blockers.length}

Key claims:
${claimSummary || 'No claims extracted yet.'}

Open blockers:
${blockerSummary || 'None.'}`,
        },
      ],
      { jsonMode: true, temperature: 0.4 }
    );

    const parsed = safeJsonParse(raw, { challenges: [] });
    return (parsed.challenges ?? []) as ChallengeResult[];
  }

  private async aiAnalyzeChangeImpact(
    changeDescription: string,
    changeType: string,
    affectedClaims: SubmissionTwinClaim[],
    affectedEvidence: SubmissionTwinEvidenceLink[],
    siblings: Array<{ artifactId: number; content: string; sectionKey?: string }>
  ): Promise<Array<{
    description: string;
    severity: string;
    remediation?: string;
    impactedClaimId?: number;
  }>> {
    const raw = await ai.complete(
      [
        {
          role: 'system',
          content: `You are a change impact analyst for regulatory submissions. Given a change to an artifact, identify all downstream impacts on other documents, claims, and evidence. Return JSON: {"impacts": [{"description": "...", "severity": "critical|high|medium|low|informational", "remediation": "...", "impactedClaimId": null}]}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            change: { description: changeDescription, type: changeType },
            affectedClaims: affectedClaims.slice(0, 10).map(c => ({ id: c.id, text: c.claimText })),
            affectedEvidence: affectedEvidence.slice(0, 10).map(e => ({ id: e.id, strength: e.supportStrength })),
            relatedSections: siblings.slice(0, 10).map(s => s.sectionKey),
          }),
        },
      ],
      { jsonMode: true, temperature: 0.3 }
    );

    const parsed = safeJsonParse(raw, { impacts: [] });
    return (parsed.impacts ?? []) as Array<{
      description: string;
      severity: string;
      remediation?: string;
      impactedClaimId?: number;
    }>;
  }

  private async aiPredictNextArtifact(
    driftAlerts: SubmissionTwinDriftAlert[],
    claims: SubmissionTwinClaim[],
    unsupportedClaims: Array<{ id: number; claimText: string }>,
    blockers: any[],
    challenges: SubmissionTwinChallenge[],
    readiness: any
  ): Promise<NextBestArtifactPrediction> {
    const raw = await ai.complete(
      [
        {
          role: 'system',
          content: `You are a regulatory strategist. Based on the submission state, predict the single highest-value governed artifact to create next. Options: Evidence Memo, Comparator Summary, Protocol Rationale Brief, Submission Risk Memo, Reviewer Concern Brief, Support Gap Memo, CMC Fragility Memo, Statistical Justification Brief, Endpoint Defense Note, Executive Readiness Snapshot, Harmonization Packet, Audit Readiness Packet. Return JSON: {"artifactType": "...", "rationale": "...", "priority": "critical|high|medium", "targetSection": "..."}`,
        },
        {
          role: 'user',
          content: JSON.stringify({
            totalClaims: claims.length,
            unsupportedClaims: unsupportedClaims.length,
            driftAlerts: driftAlerts.length,
            criticalDrifts: driftAlerts.filter(d => d.severity === 'critical').length,
            openBlockers: blockers.length,
            criticalBlockers: blockers.filter((b: any) => b.severity === 'critical').length,
            topChallenges: challenges.slice(0, 5).map(c => c.challengeText),
            readinessPercent: readiness?.readinessPercent ?? null,
          }),
        },
      ],
      { jsonMode: true, temperature: 0.3 }
    );

    const parsed = safeJsonParse(raw, {} as Record<string, unknown>);
    return {
      artifactType: parsed.artifactType ?? 'Support Gap Memo',
      rationale: parsed.rationale ?? 'Based on current submission gaps.',
      priority: parsed.priority ?? 'medium',
      targetSection: parsed.targetSection,
    };
  }

  private async aiGenerateExecutiveSummary(
    claimCount: number,
    evidenceResult: { totalClaims: number; supportedClaims: number; weakClaims: number; unsupportedClaims: number; contradictedClaims: number },
    driftCount: number,
    challengeCount: number,
    readinessScore: number,
    fragilityScore: number,
    weakZones: FragilityZone[],
    nextBestArtifact: NextBestArtifactPrediction
  ): Promise<string> {
    try {
      const summary = await ai.complete(
        [
          {
            role: 'system',
            content: 'You are a regulatory strategist writing a concise (3-5 sentence) executive summary of a submission twin assessment. Be direct and actionable.',
          },
          {
            role: 'user',
            content: `Assessment results:
- ${claimCount} claims extracted, ${evidenceResult.supportedClaims} supported, ${evidenceResult.unsupportedClaims} unsupported, ${evidenceResult.contradictedClaims} contradicted
- ${driftCount} narrative drift alerts
- ${challengeCount} simulated reviewer challenges
- Readiness: ${readinessScore}/100, Fragility: ${fragilityScore}/100
- ${weakZones.length} weak zones identified
- Recommended next artifact: ${nextBestArtifact.artifactType}

Write a concise executive summary.`,
          },
        ],
        { temperature: 0.3, maxTokens: 300 }
      );

      return summary ?? 'Assessment completed. Review detailed findings.';
    } catch {
      return `Assessment complete: ${claimCount} claims, ${evidenceResult.supportedClaims} supported, ${driftCount} drift alerts, readiness ${readinessScore}%.`;
    }
  }
}

export const submissionTwinService = new SubmissionTwinService();
export default submissionTwinService;
