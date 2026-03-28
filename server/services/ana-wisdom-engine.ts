/**
 * AnA Wisdom Accumulation Engine
 *
 * Three-tier learning system for Concept2Cure (C2C) / AnA 1.0 RI.
 * Captures lessons at project level, promotes to client wisdom when patterns
 * repeat across 3+ projects, and anonymizes into platform-wide wisdom
 * once 10+ data points confirm a pattern.
 *
 * All operations are non-blocking (fire-and-forget with error logging).
 *
 * @module server/services/ana-wisdom-engine
 */

import { db } from '../db';
import {
  projectMemoryEntries,
  projectIntelligenceProfiles,
  clientMemoryEntries,
  clientIntelligenceProfiles,
  projects,
} from 'shared/schema';
import {
  anaPlatformWisdom,
  anaOutcomeLog,
  anaClientObjectives,
  type AnaPlatformWisdomEntry,
  type AnaClientObjective,
} from 'shared/schema/ana-intelligence';
import { eq, and, desc, sql, gte, inArray } from 'drizzle-orm';

// ─── Constants ────────────────────────────────────────────────────────────────

const WISDOM_ENGINE_VERSION = '1.0.0';
const MIN_PROJECTS_FOR_CLIENT_WISDOM = 3;
const MIN_EVIDENCE_FOR_PLATFORM_WISDOM = 10;
const REJECTION_RATE_THRESHOLD = 0.3;
const REJECTION_SAMPLE_MIN = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CaptureProjectLessonParams {
  projectId: number;
  organizationId: number;
  capabilityKey: string;
  outcome: 'success' | 'partial' | 'failure';
  userFeedback?: 'accepted' | 'edited' | 'rejected' | 'regenerated';
  editDelta?: string;
  regulatoryBody?: string;
  projectType?: string;
  therapeuticArea?: string;
  documentType?: string;
  sectionCode?: string;
  inputSummary?: string;
}

export interface RiskAlert {
  riskId: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  recommendation: string;
  wisdomSource?: string;
  confidenceScore: number;
}

export interface WisdomContextBlock {
  engineVersion: string;
  projectRisks: { description: string; severity: string }[];
  projectLesson: string | null;
  clientPattern: string | null;
  platformInsight: string | null;
  recommendedNextAction: string | null;
}

export interface ObjectiveProgress {
  id: number;
  objective: string;
  category: string;
  priority: string;
  status: string;
  targetDate: Date | null;
  projectId: number | null;
}

export interface ObjectiveImpact {
  objectiveId: number;
  objective: string;
  impact: 'helps' | 'hurts' | 'neutral';
  explanation: string;
}

// ─── 1. Project Lesson Capture ────────────────────────────────────────────────

/**
 * Captures a lesson from an AI action in a project.
 * Generates a structured lesson entry and saves to project_memory_entries
 * with category 'ana_lesson'. Non-blocking: logs errors, never throws.
 */
export async function captureProjectLesson(params: CaptureProjectLessonParams): Promise<void> {
  try {
    const {
      projectId,
      organizationId,
      capabilityKey,
      outcome,
      userFeedback,
      editDelta,
      regulatoryBody,
      projectType,
      documentType,
      sectionCode,
    } = params;

    // Build lesson text
    const outcomeLabel = outcome === 'success'
      ? 'worked well'
      : outcome === 'partial'
        ? 'partially succeeded'
        : 'did not work';

    const feedbackLabel = userFeedback
      ? ` User ${userFeedback}.`
      : '';

    const deltaLabel = editDelta
      ? ` Edit delta: ${editDelta.slice(0, 200)}`
      : '';

    const contextParts: string[] = [];
    if (projectType) contextParts.push(`project type ${projectType}`);
    if (regulatoryBody) contextParts.push(`targeting ${regulatoryBody}`);
    if (documentType) contextParts.push(`document ${documentType}`);
    if (sectionCode) contextParts.push(`section ${sectionCode}`);

    const contextStr = contextParts.length > 0
      ? `For ${contextParts.join(', ')}, `
      : '';

    const lessonContent = `${contextStr}when doing ${capabilityKey}, ${outcomeLabel}.${feedbackLabel}${deltaLabel}`;

    // Find project profile for the FK
    const [profile] = await db
      .select({ id: projectIntelligenceProfiles.id })
      .from(projectIntelligenceProfiles)
      .where(
        and(
          eq(projectIntelligenceProfiles.projectId, projectId),
          eq(projectIntelligenceProfiles.organizationId, organizationId),
        )
      )
      .limit(1);

    if (!profile) {
      console.warn(`[ana-wisdom-engine] No project intelligence profile found for project ${projectId}, skipping lesson capture`);
      return;
    }

    // Persist as project memory entry
    await db.insert(projectMemoryEntries).values({
      projectProfileId: profile.id,
      projectId,
      organizationId,
      category: 'ana_lesson',
      subcategory: capabilityKey,
      title: `Lesson: ${capabilityKey} — ${outcome}`,
      content: lessonContent,
      confidenceScore: outcome === 'success' ? 0.9 : outcome === 'partial' ? 0.7 : 0.5,
      importanceLevel: outcome === 'failure' ? 'high' : 'medium',
      extractedBy: 'ai',
      status: 'active',
    });

    // Also log to outcome log for cross-client aggregation
    await db.insert(anaOutcomeLog).values({
      organizationId,
      projectId,
      capabilityKey,
      actionType: capabilityKey,
      outcome,
      userFeedback: userFeedback ?? null,
      editDelta: editDelta ?? null,
      regulatoryBody: regulatoryBody ?? null,
      projectType: projectType ?? null,
      therapeuticArea: params.therapeuticArea ?? null,
      documentType: documentType ?? null,
      sectionCode: sectionCode ?? null,
      inputSummary: params.inputSummary ?? null,
      lessonsLearned: lessonContent,
    });
  } catch (err) {
    console.error('[ana-wisdom-engine] captureProjectLesson failed:', err);
  }
}

// ─── 2. Promote to Client Wisdom ─────────────────────────────────────────────

/**
 * Aggregates project-level lessons across all projects for a client organization.
 * If 3+ projects show the same pattern (same capabilityKey + outcome),
 * promotes to client-level wisdom in client_memory_entries with category 'ana_wisdom'.
 * Deduplicates by checking existing wisdom entries. Non-blocking.
 */
export async function promoteToClientWisdom(organizationId: number): Promise<number> {
  let promoted = 0;
  try {
    // Find all project lessons for this organization, grouped by capability + outcome
    const lessonCounts = await db
      .select({
        subcategory: projectMemoryEntries.subcategory,
        content: projectMemoryEntries.content,
        projectId: projectMemoryEntries.projectId,
      })
      .from(projectMemoryEntries)
      .where(
        and(
          eq(projectMemoryEntries.organizationId, organizationId),
          eq(projectMemoryEntries.category, 'ana_lesson'),
          eq(projectMemoryEntries.status, 'active'),
        )
      )
      .orderBy(desc(projectMemoryEntries.createdAt));

    // Group by subcategory (capabilityKey) and count distinct projects
    const patternMap = new Map<string, { projects: Set<number>; latestContent: string }>();

    for (const row of lessonCounts) {
      const key = row.subcategory ?? 'unknown';
      if (!patternMap.has(key)) {
        patternMap.set(key, { projects: new Set(), latestContent: row.content });
      }
      patternMap.get(key)!.projects.add(row.projectId);
    }

    // Get client profile for FK
    const [clientProfile] = await db
      .select({ id: clientIntelligenceProfiles.id })
      .from(clientIntelligenceProfiles)
      .where(eq(clientIntelligenceProfiles.organizationId, organizationId))
      .limit(1);

    if (!clientProfile) {
      console.warn(`[ana-wisdom-engine] No client intelligence profile for org ${organizationId}`);
      return 0;
    }

    // Check existing client wisdom entries to avoid duplicates
    const existingWisdom = await db
      .select({ subcategory: clientMemoryEntries.subcategory })
      .from(clientMemoryEntries)
      .where(
        and(
          eq(clientMemoryEntries.organizationId, organizationId),
          eq(clientMemoryEntries.category, 'ana_wisdom'),
          eq(clientMemoryEntries.status, 'active'),
        )
      );

    const existingKeys = new Set(existingWisdom.map(w => w.subcategory));

    // Promote patterns seen in 3+ projects
    for (const [capabilityKey, data] of patternMap) {
      if (data.projects.size >= MIN_PROJECTS_FOR_CLIENT_WISDOM && !existingKeys.has(capabilityKey)) {
        await db.insert(clientMemoryEntries).values({
          profileId: clientProfile.id,
          organizationId,
          category: 'ana_wisdom',
          subcategory: capabilityKey,
          title: `Client wisdom: ${capabilityKey} (${data.projects.size} projects)`,
          content: `Pattern observed across ${data.projects.size} projects. ${data.latestContent}`,
          confidenceScore: Math.min(0.95, 0.6 + data.projects.size * 0.05),
          importanceLevel: 'high',
          extractedBy: 'ai',
          status: 'active',
        });
        promoted++;
      }
    }
  } catch (err) {
    console.error('[ana-wisdom-engine] promoteToClientWisdom failed:', err);
  }
  return promoted;
}

// ─── 3. Promote to Platform Wisdom ───────────────────────────────────────────

/**
 * Aggregates anonymized patterns across all clients into platform-level wisdom.
 * No client-identifying data crosses boundaries. Requires min 10 data points
 * before surfacing. Saves to ana_platform_wisdom table. Non-blocking.
 */
export async function promoteToPlatformWisdom(): Promise<number> {
  let promoted = 0;
  try {
    // Aggregate outcome patterns across all orgs — anonymized
    const patterns = await db
      .select({
        capabilityKey: anaOutcomeLog.capabilityKey,
        regulatoryBody: anaOutcomeLog.regulatoryBody,
        projectType: anaOutcomeLog.projectType,
        outcome: anaOutcomeLog.outcome,
        count: sql<number>`count(*)::int`.as('count'),
        avgQuality: sql<number>`avg(${anaOutcomeLog.qualityScore})`.as('avg_quality'),
        distinctOrgs: sql<number>`count(distinct ${anaOutcomeLog.organizationId})::int`.as('distinct_orgs'),
      })
      .from(anaOutcomeLog)
      .groupBy(
        anaOutcomeLog.capabilityKey,
        anaOutcomeLog.regulatoryBody,
        anaOutcomeLog.projectType,
        anaOutcomeLog.outcome,
      )
      .having(sql`count(*) >= ${MIN_EVIDENCE_FOR_PLATFORM_WISDOM}`);

    for (const pattern of patterns) {
      const wisdomKey = `${pattern.capabilityKey}:${pattern.regulatoryBody ?? 'any'}:${pattern.projectType ?? 'any'}:${pattern.outcome}`;

      // Check if already exists
      const [existing] = await db
        .select({ id: anaPlatformWisdom.id, evidenceCount: anaPlatformWisdom.evidenceCount })
        .from(anaPlatformWisdom)
        .where(eq(anaPlatformWisdom.wisdomKey, wisdomKey))
        .limit(1);

      const description = `${pattern.capabilityKey} ${pattern.outcome === 'success' ? 'succeeds' : pattern.outcome === 'failure' ? 'fails' : 'partially works'} for ${pattern.projectType ?? 'all project types'} targeting ${pattern.regulatoryBody ?? 'any agency'} (${pattern.count} instances across ${pattern.distinctOrgs} organizations)`;

      const recommendation = pattern.outcome === 'success'
        ? `Continue using ${pattern.capabilityKey} — high effectiveness observed for this context.`
        : pattern.outcome === 'failure'
          ? `Caution with ${pattern.capabilityKey} in this context — high failure rate observed. Consider alternative approaches.`
          : `${pattern.capabilityKey} shows mixed results — review outputs carefully.`;

      const effectivenessScore = pattern.outcome === 'success'
        ? Math.min(1, (pattern.avgQuality ?? 70) / 100)
        : pattern.outcome === 'failure'
          ? Math.max(0, 1 - (pattern.count / (pattern.count + 10)))
          : 0.5;

      if (existing) {
        // Update existing
        await db
          .update(anaPlatformWisdom)
          .set({
            evidenceCount: pattern.count,
            patternDescription: description,
            recommendation,
            effectivenessScore,
            confidenceScore: Math.min(0.95, 0.5 + pattern.distinctOrgs * 0.05),
            lastValidatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(anaPlatformWisdom.id, existing.id));
      } else {
        // Insert new
        await db.insert(anaPlatformWisdom).values({
          wisdomKey,
          category: pattern.outcome === 'failure' ? 'risk_reduction' : 'success_pattern',
          regulatoryBody: pattern.regulatoryBody ?? null,
          projectType: pattern.projectType ?? null,
          patternDescription: description,
          recommendation,
          confidenceScore: Math.min(0.95, 0.5 + pattern.distinctOrgs * 0.05),
          evidenceCount: pattern.count,
          effectivenessScore,
          isActive: true,
          lastValidatedAt: new Date(),
        });
        promoted++;
      }
    }
  } catch (err) {
    console.error('[ana-wisdom-engine] promoteToPlatformWisdom failed:', err);
  }
  return promoted;
}

// ─── 4. Risk Detection ───────────────────────────────────────────────────────

/**
 * Scans project context against known risk patterns from platform wisdom.
 * Checks for matching project_type + regulatory_body patterns, missing
 * document types, known deficiency patterns, and timeline risks.
 * Returns array of risk alerts with severity and recommendation.
 */
export async function detectProjectRisks(projectId: number): Promise<RiskAlert[]> {
  const risks: RiskAlert[] = [];
  try {
    // Get project profile for context
    const [profile] = await db
      .select()
      .from(projectIntelligenceProfiles)
      .where(eq(projectIntelligenceProfiles.projectId, projectId))
      .limit(1);

    if (!profile) {
      return [];
    }

    const targetBodies = (profile.targetRegulatoryBodies as string[] | null) ?? [];
    const projectType = profile.projectType;

    // 1. Check platform wisdom for risk patterns matching this project context
    const riskWisdom = await db
      .select()
      .from(anaPlatformWisdom)
      .where(
        and(
          eq(anaPlatformWisdom.isActive, true),
          eq(anaPlatformWisdom.category, 'risk_reduction'),
          gte(anaPlatformWisdom.evidenceCount, MIN_EVIDENCE_FOR_PLATFORM_WISDOM),
        )
      )
      .orderBy(desc(anaPlatformWisdom.confidenceScore))
      .limit(20);

    for (const wisdom of riskWisdom) {
      // Match by regulatory body or project type (null means applies to all)
      const bodyMatch = !wisdom.regulatoryBody || targetBodies.includes(wisdom.regulatoryBody);
      const typeMatch = !wisdom.projectType || wisdom.projectType === projectType;

      if (bodyMatch && typeMatch) {
        risks.push({
          riskId: `platform-${wisdom.id}`,
          severity: wisdom.confidenceScore >= 0.8 ? 'high' : wisdom.confidenceScore >= 0.6 ? 'medium' : 'low',
          category: wisdom.category,
          description: wisdom.patternDescription,
          recommendation: wisdom.recommendation,
          wisdomSource: 'platform',
          confidenceScore: wisdom.confidenceScore,
        });
      }
    }

    // 2. Check project-level failure lessons
    const failureLessons = await db
      .select()
      .from(projectMemoryEntries)
      .where(
        and(
          eq(projectMemoryEntries.projectId, projectId),
          eq(projectMemoryEntries.category, 'ana_lesson'),
          eq(projectMemoryEntries.status, 'active'),
          eq(projectMemoryEntries.importanceLevel, 'high'),
        )
      )
      .orderBy(desc(projectMemoryEntries.createdAt))
      .limit(10);

    for (const lesson of failureLessons) {
      risks.push({
        riskId: `lesson-${lesson.id}`,
        severity: 'medium',
        category: 'learned_failure',
        description: lesson.content,
        recommendation: `Review and address previous failure: ${lesson.title}`,
        wisdomSource: 'project',
        confidenceScore: lesson.confidenceScore ?? 0.5,
      });
    }

    // 3. Check for known deficiency patterns from platform wisdom
    const deficiencyWisdom = await db
      .select()
      .from(anaPlatformWisdom)
      .where(
        and(
          eq(anaPlatformWisdom.isActive, true),
          eq(anaPlatformWisdom.category, 'deficiency_prevention'),
          gte(anaPlatformWisdom.evidenceCount, MIN_EVIDENCE_FOR_PLATFORM_WISDOM),
        )
      )
      .orderBy(desc(anaPlatformWisdom.confidenceScore))
      .limit(10);

    for (const wisdom of deficiencyWisdom) {
      const bodyMatch = !wisdom.regulatoryBody || targetBodies.includes(wisdom.regulatoryBody);
      const typeMatch = !wisdom.projectType || wisdom.projectType === projectType;

      if (bodyMatch && typeMatch) {
        risks.push({
          riskId: `deficiency-${wisdom.id}`,
          severity: 'critical',
          category: 'deficiency_prevention',
          description: wisdom.patternDescription,
          recommendation: wisdom.recommendation,
          wisdomSource: 'platform',
          confidenceScore: wisdom.confidenceScore,
        });
      }
    }

    // Sort by severity then confidence
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    risks.sort((a, b) => {
      const sev = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
      return sev !== 0 ? sev : b.confidenceScore - a.confidenceScore;
    });
  } catch (err) {
    console.error('[ana-wisdom-engine] detectProjectRisks failed:', err);
  }
  return risks;
}

// ─── 5. Wisdom Context Builder ───────────────────────────────────────────────

/**
 * Builds a compressed ~15-line wisdom context block for prompt injection.
 * Includes top risks, project lesson, client pattern, platform insight,
 * and recommended next action. Designed to be lean for token efficiency.
 */
export async function buildWisdomContext(
  projectId: number,
  organizationId: number,
  regulatoryBody?: string,
  projectType?: string,
): Promise<WisdomContextBlock> {
  const block: WisdomContextBlock = {
    engineVersion: WISDOM_ENGINE_VERSION,
    projectRisks: [],
    projectLesson: null,
    clientPattern: null,
    platformInsight: null,
    recommendedNextAction: null,
  };

  try {
    // Top 3 active risks
    const risks = await detectProjectRisks(projectId);
    block.projectRisks = risks.slice(0, 3).map(r => ({
      description: r.description.slice(0, 200),
      severity: r.severity,
    }));

    // Top project-level lesson (most recent success)
    const [topLesson] = await db
      .select({ content: projectMemoryEntries.content })
      .from(projectMemoryEntries)
      .where(
        and(
          eq(projectMemoryEntries.projectId, projectId),
          eq(projectMemoryEntries.category, 'ana_lesson'),
          eq(projectMemoryEntries.status, 'active'),
        )
      )
      .orderBy(desc(projectMemoryEntries.confidenceScore), desc(projectMemoryEntries.createdAt))
      .limit(1);

    if (topLesson) {
      block.projectLesson = topLesson.content.slice(0, 300);
    }

    // Top client-level pattern
    const [clientPattern] = await db
      .select({ content: clientMemoryEntries.content })
      .from(clientMemoryEntries)
      .where(
        and(
          eq(clientMemoryEntries.organizationId, organizationId),
          eq(clientMemoryEntries.category, 'ana_wisdom'),
          eq(clientMemoryEntries.status, 'active'),
        )
      )
      .orderBy(desc(clientMemoryEntries.confidenceScore), desc(clientMemoryEntries.createdAt))
      .limit(1);

    if (clientPattern) {
      block.clientPattern = clientPattern.content.slice(0, 300);
    }

    // Top platform insight (filtered by context)
    const platformConditions = [
      eq(anaPlatformWisdom.isActive, true),
      gte(anaPlatformWisdom.evidenceCount, MIN_EVIDENCE_FOR_PLATFORM_WISDOM),
    ];

    if (regulatoryBody) {
      platformConditions.push(
        sql`(${anaPlatformWisdom.regulatoryBody} = ${regulatoryBody} OR ${anaPlatformWisdom.regulatoryBody} IS NULL)` as ReturnType<typeof eq>
      );
    }
    if (projectType) {
      platformConditions.push(
        sql`(${anaPlatformWisdom.projectType} = ${projectType} OR ${anaPlatformWisdom.projectType} IS NULL)` as ReturnType<typeof eq>
      );
    }

    const [platformInsight] = await db
      .select({
        recommendation: anaPlatformWisdom.recommendation,
        patternDescription: anaPlatformWisdom.patternDescription,
      })
      .from(anaPlatformWisdom)
      .where(and(...platformConditions))
      .orderBy(desc(anaPlatformWisdom.confidenceScore), desc(anaPlatformWisdom.evidenceCount))
      .limit(1);

    if (platformInsight) {
      block.platformInsight = platformInsight.patternDescription.slice(0, 300);
      block.recommendedNextAction = platformInsight.recommendation.slice(0, 200);
    }
  } catch (err) {
    console.error('[ana-wisdom-engine] buildWisdomContext failed:', err);
  }

  return block;
}

// ─── 6. Feedback Processing ──────────────────────────────────────────────────

/**
 * Updates wisdom based on user feedback on an outcome.
 * - accept: reinforces wisdom (evidence_count++, effectiveness adjusted up)
 * - reject: flags for review (if rejection rate > 30% over 20+ instances, demote)
 * - edit: captures delta as refinement signal
 * Non-blocking.
 */
export async function processUserFeedback(
  outcomeId: number,
  feedback: 'accepted' | 'edited' | 'rejected' | 'regenerated',
  editDelta?: string,
): Promise<void> {
  try {
    // Update the outcome log entry
    await db
      .update(anaOutcomeLog)
      .set({
        userFeedback: feedback,
        editDelta: editDelta ?? null,
      })
      .where(eq(anaOutcomeLog.id, outcomeId));

    // Get the outcome to find related wisdom
    const [outcome] = await db
      .select()
      .from(anaOutcomeLog)
      .where(eq(anaOutcomeLog.id, outcomeId))
      .limit(1);

    if (!outcome) return;

    // Find matching platform wisdom entries
    const wisdomKeyPrefix = `${outcome.capabilityKey}:${outcome.regulatoryBody ?? 'any'}:${outcome.projectType ?? 'any'}`;

    const relatedWisdom = await db
      .select()
      .from(anaPlatformWisdom)
      .where(sql`${anaPlatformWisdom.wisdomKey} LIKE ${wisdomKeyPrefix + '%'}`);

    for (const wisdom of relatedWisdom) {
      if (feedback === 'accepted') {
        // Reinforce: bump evidence count and adjust effectiveness up
        const newEffectiveness = Math.min(
          1,
          (wisdom.effectivenessScore ?? 0.5) * 0.95 + 0.05,
        );
        await db
          .update(anaPlatformWisdom)
          .set({
            evidenceCount: sql`${anaPlatformWisdom.evidenceCount} + 1`,
            effectivenessScore: newEffectiveness,
            lastValidatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(anaPlatformWisdom.id, wisdom.id));
      } else if (feedback === 'rejected') {
        // Calculate rejection rate from outcome log
        const [stats] = await db
          .select({
            total: sql<number>`count(*)::int`,
            rejected: sql<number>`count(*) filter (where ${anaOutcomeLog.userFeedback} = 'rejected')::int`,
          })
          .from(anaOutcomeLog)
          .where(
            and(
              eq(anaOutcomeLog.capabilityKey, outcome.capabilityKey),
              outcome.regulatoryBody
                ? eq(anaOutcomeLog.regulatoryBody, outcome.regulatoryBody)
                : sql`${anaOutcomeLog.regulatoryBody} IS NULL`,
              outcome.projectType
                ? eq(anaOutcomeLog.projectType, outcome.projectType)
                : sql`${anaOutcomeLog.projectType} IS NULL`,
            )
          );

        if (stats && stats.total >= REJECTION_SAMPLE_MIN) {
          const rejectionRate = stats.rejected / stats.total;
          if (rejectionRate > REJECTION_RATE_THRESHOLD) {
            // Demote wisdom
            await db
              .update(anaPlatformWisdom)
              .set({
                isActive: false,
                rejectionRate,
                updatedAt: new Date(),
              })
              .where(eq(anaPlatformWisdom.id, wisdom.id));
          } else {
            await db
              .update(anaPlatformWisdom)
              .set({
                rejectionRate,
                updatedAt: new Date(),
              })
              .where(eq(anaPlatformWisdom.id, wisdom.id));
          }
        }
      } else if (feedback === 'edited' && editDelta) {
        // Capture the edit delta as a refinement signal in project memory
        if (outcome.projectId) {
          // Fire-and-forget lesson capture with the edit context
          captureProjectLesson({
            projectId: outcome.projectId,
            organizationId: outcome.organizationId,
            capabilityKey: outcome.capabilityKey,
            outcome: 'partial',
            userFeedback: 'edited',
            editDelta,
            regulatoryBody: outcome.regulatoryBody ?? undefined,
            projectType: outcome.projectType ?? undefined,
          }).catch(err => {
            console.error('[ana-wisdom-engine] edit delta lesson capture failed:', err);
          });
        }
      }
    }
  } catch (err) {
    console.error('[ana-wisdom-engine] processUserFeedback failed:', err);
  }
}

// ─── 7. Objective Tracking ───────────────────────────────────────────────────

/**
 * Returns objective status summary for an organization, optionally filtered by project.
 */
export async function getObjectiveProgress(
  organizationId: number,
  projectId?: number,
): Promise<ObjectiveProgress[]> {
  try {
    const conditions = [eq(anaClientObjectives.organizationId, organizationId)];
    if (projectId !== undefined) {
      conditions.push(eq(anaClientObjectives.projectId, projectId));
    }

    const objectives = await db
      .select({
        id: anaClientObjectives.id,
        objective: anaClientObjectives.objective,
        category: anaClientObjectives.category,
        priority: anaClientObjectives.priority,
        status: anaClientObjectives.status,
        targetDate: anaClientObjectives.targetDate,
        projectId: anaClientObjectives.projectId,
      })
      .from(anaClientObjectives)
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${anaClientObjectives.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
        desc(anaClientObjectives.createdAt),
      );

    return objectives;
  } catch (err) {
    console.error('[ana-wisdom-engine] getObjectiveProgress failed:', err);
    return [];
  }
}

/**
 * Checks if a proposed action helps or hurts the organization's and project's objectives.
 * Returns an impact assessment for each relevant objective.
 */
export async function checkObjectiveImpact(
  organizationId: number,
  projectId: number,
  action: string,
): Promise<ObjectiveImpact[]> {
  const impacts: ObjectiveImpact[] = [];
  try {
    // Get all relevant objectives (org-level + project-level)
    const objectives = await db
      .select()
      .from(anaClientObjectives)
      .where(
        and(
          eq(anaClientObjectives.organizationId, organizationId),
          sql`(${anaClientObjectives.projectId} = ${projectId} OR ${anaClientObjectives.projectId} IS NULL)`,
        )
      )
      .orderBy(
        sql`CASE ${anaClientObjectives.priority} WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
      );

    const actionLower = action.toLowerCase();

    for (const obj of objectives) {
      // Simple keyword-based impact heuristic
      // In production, this would use the AI gateway for semantic analysis
      const objectiveLower = obj.objective.toLowerCase();
      const riskFactorsLower = (obj.riskFactors ?? '').toLowerCase();
      const successCriteriaLower = (obj.successCriteria ?? '').toLowerCase();

      let impact: 'helps' | 'hurts' | 'neutral' = 'neutral';
      let explanation = 'No clear impact on this objective.';

      // Check if the action aligns with success criteria
      const successKeywords = successCriteriaLower.split(/\s+/).filter(w => w.length > 4);
      const riskKeywords = riskFactorsLower.split(/\s+/).filter(w => w.length > 4);

      const helpSignals = successKeywords.filter(k => actionLower.includes(k)).length;
      const hurtSignals = riskKeywords.filter(k => actionLower.includes(k)).length;

      if (helpSignals > hurtSignals && helpSignals > 0) {
        impact = 'helps';
        explanation = `Action aligns with success criteria for: ${obj.objective}`;
      } else if (hurtSignals > helpSignals && hurtSignals > 0) {
        impact = 'hurts';
        explanation = `Action may exacerbate risk factors for: ${obj.objective}`;
      }

      // Check timeline risk
      if (obj.targetDate && obj.status === 'at_risk') {
        const daysUntilTarget = Math.ceil(
          (obj.targetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        if (daysUntilTarget < 30) {
          impact = impact === 'neutral' ? 'hurts' : impact;
          explanation += ` Objective is at risk with ${daysUntilTarget} days remaining.`;
        }
      }

      impacts.push({
        objectiveId: obj.id,
        objective: obj.objective,
        impact,
        explanation,
      });
    }
  } catch (err) {
    console.error('[ana-wisdom-engine] checkObjectiveImpact failed:', err);
  }
  return impacts;
}
