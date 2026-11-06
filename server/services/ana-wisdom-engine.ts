/**
 * AnA Wisdom Accumulation Engine
 *
 * Three-tier learning system for Concept2Cure (C2C) / AnA 1.0 RI.
 * Captures lessons at project level, promotes to client wisdom when patterns
 * repeat across 3+ projects. Legacy global wisdom is quarantined until
 * contribution authority and named exact-artifact QMS promotion are proven.
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
  anaOutcomeLog,
  anaClientObjectives,
} from 'shared/schema/ana-intelligence';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createScopedLogger } from '../utils/logger';
import { SHARED_LEARNING_HOLD } from './intelligence/ana-failure-learning';

const logger = createScopedLogger('ana-wisdom-engine');

// ─── Constants ────────────────────────────────────────────────────────────────

const WISDOM_ENGINE_VERSION = '1.0.0';
const MIN_PROJECTS_FOR_CLIENT_WISDOM = 3;

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
  /** 'unrated' when no recorded fact rates it (2026-10-15: platform wisdom was rated from its stamped confidence). */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'unrated';
  category: string;
  description: string;
  recommendation: string;
  wisdomSource?: string;
  /** null: the source records no confidence (2026-10-15: a lesson's was filled in as 0.5). */
  confidenceScore: number | null;
}

export interface WisdomContextBlock {
  engineVersion: string;
  projectRisks: { description: string; severity: string }[];
  projectLesson: string | null;
  clientPattern: string | null;
  platformInsight: string | null;
  recommendedNextAction: string | null;
  sharedLearningHold: typeof SHARED_LEARNING_HOLD;
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
      therapeuticArea,
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
      logger.warn(`No project intelligence profile found for project ${projectId}, skipping lesson capture`);
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
      // 2026-10-15: stamped 0.9 / 0.7 / 0.5 from the outcome, which is already
      // in the title; nothing measured a confidence in the lesson.
      confidenceScore: null,
      importanceLevel: outcome === 'failure' ? 'high' : 'medium',
      // A string template, not a model: it was labelled 'ai' (2026-10-15).
      extractedBy: 'heuristic',
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
    logger.error('captureProjectLesson failed', { error: err });
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

    // Group by subcategory (capabilityKey) + outcome and count distinct projects
    const patternMap = new Map<string, { capabilityKey: string; outcome: string; projects: Set<number>; latestContent: string }>();

    for (const row of lessonCounts) {
      const capKey = row.subcategory ?? 'unknown';
      // Extract outcome from title format "Lesson: <capabilityKey> — <outcome>"
      const outcomeMatch = row.content.match(/(?:worked well|partially succeeded|did not work)/);
      const outcome = outcomeMatch
        ? (outcomeMatch[0] === 'worked well' ? 'success' : outcomeMatch[0] === 'partially succeeded' ? 'partial' : 'failure')
        : 'unknown';
      const key = `${capKey}::${outcome}`;
      if (!patternMap.has(key)) {
        patternMap.set(key, { capabilityKey: capKey, outcome, projects: new Set(), latestContent: row.content });
      }
      // Only add non-null projectIds to avoid counting null as a distinct project
      if (row.projectId != null) {
        patternMap.get(key)!.projects.add(row.projectId);
      }
    }

    // Get client profile for FK
    const [clientProfile] = await db
      .select({ id: clientIntelligenceProfiles.id })
      .from(clientIntelligenceProfiles)
      .where(eq(clientIntelligenceProfiles.organizationId, organizationId))
      .limit(1);

    if (!clientProfile) {
      logger.warn(`No client intelligence profile for org ${organizationId}`);
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

    const existingKeysMap = new Map(existingWisdom.map(w => [w.subcategory, true]));

    // Promote patterns seen in 3+ projects
    for (const [compositeKey, data] of patternMap) {
      if (data.projects.size < MIN_PROJECTS_FOR_CLIENT_WISDOM) continue;

      const newContent = `Pattern observed across ${data.projects.size} projects (outcome: ${data.outcome}). ${data.latestContent}`;
      // 2026-10-15: both writes below stamped min(0.95, 0.6 + 0.05·projects) as
      // the pattern's confidence. The evidence is the project count, which the
      // title and content state; no confidence was measured.

      if (!existingKeysMap.has(compositeKey)) {
        await db.insert(clientMemoryEntries).values({
          profileId: clientProfile.id,
          organizationId,
          category: 'ana_wisdom',
          subcategory: compositeKey,
          title: `Client wisdom: ${data.capabilityKey} — ${data.outcome} (${data.projects.size} projects)`,
          content: newContent,
          confidenceScore: null,
          importanceLevel: 'high',
          // A count of projects, not a model: it was labelled 'ai' (2026-10-15).
          extractedBy: 'heuristic',
          status: 'active',
        });
        promoted++;
      } else {
        // Update existing entry if evidence has grown significantly (2x or more)
        const [existingEntry] = await db
          .select({ id: clientMemoryEntries.id, content: clientMemoryEntries.content })
          .from(clientMemoryEntries)
          .where(
            and(
              eq(clientMemoryEntries.organizationId, organizationId),
              eq(clientMemoryEntries.category, 'ana_wisdom'),
              eq(clientMemoryEntries.subcategory, compositeKey),
              eq(clientMemoryEntries.status, 'active'),
            )
          )
          .limit(1);

        if (existingEntry) {
          // Extract previous project count from content (e.g., "across 3 projects")
          const prevCountMatch = existingEntry.content.match(/across (\d+) projects/);
          const prevCount = prevCountMatch ? parseInt(prevCountMatch[1], 10) : 0;

          if (prevCount > 0 && data.projects.size >= prevCount * 2) {
            await db
              .update(clientMemoryEntries)
              .set({
                content: newContent,
                confidenceScore: null,
                title: `Client wisdom: ${data.capabilityKey} — ${data.outcome} (${data.projects.size} projects)`,
              })
              .where(eq(clientMemoryEntries.id, existingEntry.id));
          }
        }
      }
    }
  } catch (err) {
    logger.error('promoteToClientWisdom failed', { error: err });
  }
  return promoted;
}

// ─── 3. Promote to Platform Wisdom ───────────────────────────────────────────

/** A cohort count cannot de-identify free-text dimensions or authorize sharing.
 * Preserve the entry point without querying tenant outcomes or legacy wisdom. */
export async function promoteToPlatformWisdom(): Promise<{ promoted: 0; holdReason: typeof SHARED_LEARNING_HOLD }> {
  return { promoted: 0, holdReason: SHARED_LEARNING_HOLD };
}

// ─── 4. Risk Detection ───────────────────────────────────────────────────────

/**
 * Returns current project-local failure lessons. Unreviewed global risk and
 * deficiency records cannot become a generation context through this helper.
 */
export async function detectProjectRisks(projectId: number, _options?: { projectOnly?: boolean }): Promise<RiskAlert[]> {
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

    // Legacy global risk/deficiency rows have no reviewed promotion receipt.
    // They remain quarantined regardless of caller options or stored counts.
    // Check project-level failure lessons.
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
      // The lesson's recorded importance; a confidence no longer raises it (2026-10-15).
      const lessonSeverity: RiskAlert['severity'] = lesson.importanceLevel === 'high' ? 'high' : 'medium';
      risks.push({
        riskId: `lesson-${lesson.id}`,
        severity: lessonSeverity,
        category: 'learned_failure',
        description: lesson.content,
        recommendation: `Review and address previous failure: ${lesson.title}`,
        wisdomSource: 'project',
        confidenceScore: lesson.confidenceScore,
      });
    }

    // Sort by severity, then recorded confidence; an unscored risk follows the
    // scored ones of its severity rather than ranking as an invented 0.5. An
    // unrated risk follows the rated ones, in the evidence order read above.
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, unrated: 4 };
    risks.sort((a, b) => {
      const sev = (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
      if (sev !== 0) return sev;
      if (a.severity === 'unrated') return 0;
      if (a.confidenceScore == null || b.confidenceScore == null) {
        return (a.confidenceScore == null ? 1 : 0) - (b.confidenceScore == null ? 1 : 0);
      }
      return b.confidenceScore - a.confidenceScore;
    });
  } catch (err) {
    logger.error('detectProjectRisks failed', { error: err });
  }
  return risks;
}

// ─── 5. Wisdom Context Builder ───────────────────────────────────────────────

/**
 * Builds a compressed ~15-line wisdom context block for prompt injection.
 * Includes project risks/lessons and, for tenant-wide recall, client patterns.
 * Global insight fields remain empty with an explicit shared-learning hold.
 */
export async function buildWisdomContext(
  projectId: number,
  organizationId: number,
  _regulatoryBody?: string,
  _projectType?: string,
  options?: { projectOnly?: boolean },
): Promise<WisdomContextBlock> {
  const block: WisdomContextBlock = {
    engineVersion: WISDOM_ENGINE_VERSION,
    projectRisks: [],
    projectLesson: null,
    clientPattern: null,
    platformInsight: null,
    recommendedNextAction: null,
    sharedLearningHold: SHARED_LEARNING_HOLD,
  };

  try {
    // Top 3 active risks
    const risks = await detectProjectRisks(projectId, options);
    block.projectRisks = risks.slice(0, 3).map(r => ({
      description: r.description.slice(0, 200),
      severity: r.severity,
    }));

    // Top project-level lesson (most recent success). 2026-10-15: ordered by the
    // confidence captureProjectLesson stamped from the outcome; it now orders by
    // the outcome the lesson's title records.
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
      .orderBy(
        sql`CASE WHEN ${projectMemoryEntries.title} LIKE '% — success' THEN 0
                 WHEN ${projectMemoryEntries.title} LIKE '% — partial' THEN 1 ELSE 2 END`,
        desc(projectMemoryEntries.createdAt),
      )
      .limit(1);

    if (topLesson) {
      block.projectLesson = topLesson.content.slice(0, 300);
    }

    // Project recall can use its own risks/lessons, never an organization's
    // portfolio pattern or a platform recommendation as this project's fact.
    if (options?.projectOnly) return block;

    // Top client-level pattern: the one seen in the most projects. 2026-10-15:
    // ordered by the stamped 0.6 + 0.05·projects; it now orders by the project
    // count the pattern's content records.
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
      .orderBy(
        sql`substring(${clientMemoryEntries.content} from 'across ([0-9]+) projects')::int DESC NULLS LAST`,
        desc(clientMemoryEntries.createdAt),
      )
      .limit(1);

    if (clientPattern) {
      block.clientPattern = clientPattern.content.slice(0, 300);
    }

    // Global insights and recommendations stay null until exact-artifact
    // reviewed promotion exists. Project and tenant-local learning continue.
  } catch (err) {
    logger.error('buildWisdomContext failed', { error: err });
  }

  return block;
}

// ─── 6. Feedback Processing ──────────────────────────────────────────────────

/**
 * Records tenant-local feedback and edit lessons. Global reinforcement and
 * automatic demotion are held with the legacy global store.
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

    // Feedback stays with its tenant outcome. It cannot reinforce, refresh or
    // reactivate unreviewed global wisdom. An edit may still teach this project.
    if (feedback === 'edited' && editDelta && outcome.projectId) {
      await captureProjectLesson({ projectId: outcome.projectId, organizationId: outcome.organizationId,
        capabilityKey: outcome.capabilityKey, outcome: 'partial', userFeedback: 'edited', editDelta,
        regulatoryBody: outcome.regulatoryBody ?? undefined, projectType: outcome.projectType ?? undefined });
    }
  } catch (err) {
    logger.error('processUserFeedback failed', { error: err });
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
    logger.error('getObjectiveProgress failed', { error: err });
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
    logger.error('checkObjectiveImpact failed', { error: err });
  }
  return impacts;
}
