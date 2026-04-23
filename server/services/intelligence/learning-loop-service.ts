/**
 * Learning Loop Service — Closed Feedback System
 *
 * Captures user feedback on recommendations and actions, then feeds it
 * back into the intelligence layer to improve future outputs.
 *
 * Feedback types:
 *   - accept: user accepted the recommendation
 *   - dismiss: user dismissed (not useful)
 *   - resolve: user acted on it and resolved the underlying issue
 *   - override: user chose a different approach
 *
 * The loop:
 *   1. Recommendation generated → stored
 *   2. User acts on it → feedback captured
 *   3. Feedback analyzed → patterns stored in project intelligence
 *   4. Next generation benefits from historical patterns
 *
 * @module server/services/intelligence/learning-loop-service
 */

import { db } from '../../db.js';
import { eq, and, sql, desc } from 'drizzle-orm';
import {
  projectIntelligenceProfiles,
  projectMemoryEntries,
} from '../../../shared/schema.js';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type FeedbackAction = 'accepted' | 'dismissed' | 'resolved' | 'overridden';

export interface RecommendationFeedback {
  readonly recommendationId: string;
  readonly recommendationType: string;
  readonly action: FeedbackAction;
  readonly userComment?: string;
  readonly alternativeChosen?: string;
  readonly timeToAction?: number; // seconds from generation to feedback
  readonly userId: number;
  readonly projectId: number;
  readonly organizationId: number;
}

export interface SignalReliability {
  readonly validated: number;
  readonly partiallyValidated: number;
  readonly disputed: number;
  readonly totalValidations: number;
  /**
   * Aggregate reliability index in [0, 1]. Null when no validations exist
   * (insufficient evidence to weight signals). Partially-validated counts
   * as 0.5 — user edited so the signal was directionally right but not fully
   * confirmed.
   */
  readonly reliabilityIndex: number | null;
}

export interface FeedbackSummary {
  readonly totalFeedback: number;
  readonly accepted: number;
  readonly dismissed: number;
  readonly resolved: number;
  readonly overridden: number;
  readonly acceptanceRate: number;
  readonly resolutionRate: number;
  readonly averageTimeToAction: number | null;
  readonly topDismissedTypes: Array<{ type: string; count: number }>;
  /**
   * Aggregate signal validation outcomes from the closed learning loop.
   * Populated from `intelligence_signal_validation` entries written by
   * {@link linkFeedbackToRecentSignals}. Lets future RIM runs weight
   * prior signals by historical accuracy.
   */
  readonly signalReliability: SignalReliability;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEEDBACK STORAGE
// ═══════════════════════════════════════════════════════════════════════════════

// In-memory feedback store (persisted to project memory for durable storage)
// In production, this would be a dedicated table — here we use projectMemoryEntries
// with category = 'recommendation_feedback'

/**
 * Record feedback on a recommendation.
 */
export async function recordFeedback(
  feedback: RecommendationFeedback,
): Promise<void> {
  // Get or create profile
  const [profile] = await db
    .select({ id: projectIntelligenceProfiles.id })
    .from(projectIntelligenceProfiles)
    .where(and(
      eq(projectIntelligenceProfiles.projectId, feedback.projectId),
      eq(projectIntelligenceProfiles.organizationId, feedback.organizationId),
    ))
    .limit(1);

  if (!profile) return;

  // Store as a memory entry
  const values: Record<string, unknown> = {
    projectProfileId: profile.id,
    projectId: feedback.projectId,
    organizationId: feedback.organizationId,
    category: 'recommendation_feedback',
    subcategory: feedback.recommendationType,
    title: `Feedback: ${feedback.action} on ${feedback.recommendationType}`,
    content: JSON.stringify({
      recommendationId: feedback.recommendationId,
      action: feedback.action,
      userComment: feedback.userComment,
      alternativeChosen: feedback.alternativeChosen,
      timeToAction: feedback.timeToAction,
      userId: feedback.userId,
      recordedAt: new Date().toISOString(),
    }),
    sourceDocumentName: null,
    sourceDocumentType: 'system',
    confidenceScore: 1.0,
    importanceLevel: feedback.action === 'dismissed' ? 'high' : 'medium',
    isVerifiedByUser: true,
    status: 'active',
    extractedBy: 'user_feedback',
  };

  await db
    .insert(projectMemoryEntries)
    .values(values as any);

  // If dismissed, record a learned insight to avoid similar recommendations
  if (feedback.action === 'dismissed' && feedback.userComment) {
    await recordDismissalPattern(feedback, profile.id);
  }
}

/**
 * Get feedback summary for a project.
 */
export async function getFeedbackSummary(
  projectId: number,
  organizationId: number,
): Promise<FeedbackSummary> {
  try {
    const rows = await db
      .select({
        content: projectMemoryEntries.content,
        subcategory: projectMemoryEntries.subcategory,
      })
      .from(projectMemoryEntries)
      .where(and(
        eq(projectMemoryEntries.projectId, projectId),
        eq(projectMemoryEntries.organizationId, organizationId),
        eq(projectMemoryEntries.category, 'recommendation_feedback'),
        eq(projectMemoryEntries.status, 'active'),
      ))
      .orderBy(desc(projectMemoryEntries.createdAt))
      .limit(100);

    let accepted = 0;
    let dismissed = 0;
    let resolved = 0;
    let overridden = 0;
    let totalTime = 0;
    let timeCount = 0;
    const dismissedTypes = new Map<string, number>();

    for (const row of rows) {
      try {
        const data = JSON.parse(row.content);
        switch (data.action) {
          case 'accepted': accepted++; break;
          case 'dismissed': dismissed++; break;
          case 'resolved': resolved++; break;
          case 'overridden': overridden++; break;
        }
        if (data.timeToAction) {
          totalTime += data.timeToAction;
          timeCount++;
        }
        if (data.action === 'dismissed' && row.subcategory) {
          dismissedTypes.set(row.subcategory, (dismissedTypes.get(row.subcategory) ?? 0) + 1);
        }
      } catch {
        // Skip malformed entries
      }
    }

    const total = accepted + dismissed + resolved + overridden;

    const topDismissedTypes = Array.from(dismissedTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));

    const signalReliability = await getSignalReliability(projectId, organizationId);

    return {
      totalFeedback: total,
      accepted,
      dismissed,
      resolved,
      overridden,
      acceptanceRate: total > 0 ? Math.round(((accepted + resolved) / total) * 100) : 0,
      resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
      averageTimeToAction: timeCount > 0 ? Math.round(totalTime / timeCount) : null,
      topDismissedTypes,
      signalReliability,
    };
  } catch {
    return {
      totalFeedback: 0,
      accepted: 0,
      dismissed: 0,
      resolved: 0,
      overridden: 0,
      acceptanceRate: 0,
      resolutionRate: 0,
      averageTimeToAction: null,
      topDismissedTypes: [],
      signalReliability: {
        validated: 0,
        partiallyValidated: 0,
        disputed: 0,
        totalValidations: 0,
        reliabilityIndex: null,
      },
    };
  }
}

/**
 * Aggregate signal-validation outcomes written by
 * {@link linkFeedbackToRecentSignals}. Each validation entry carries a verdict
 * (`validated` / `partially_validated` / `disputed`) and the signal IDs it
 * covered; this reader rolls them up into a single reliability index RIM can
 * use to weight signal confidence.
 *
 * Returns zero-counts with `reliabilityIndex: null` when no validations exist
 * — callers should treat `null` as "insufficient evidence", not "unreliable".
 */
export async function getSignalReliability(
  projectId: number,
  organizationId: number,
): Promise<SignalReliability> {
  const empty: SignalReliability = {
    validated: 0,
    partiallyValidated: 0,
    disputed: 0,
    totalValidations: 0,
    reliabilityIndex: null,
  };

  try {
    const rows = await db
      .select({
        subcategory: projectMemoryEntries.subcategory,
        content: projectMemoryEntries.content,
      })
      .from(projectMemoryEntries)
      .where(and(
        eq(projectMemoryEntries.projectId, projectId),
        eq(projectMemoryEntries.organizationId, organizationId),
        eq(projectMemoryEntries.category, 'intelligence_signal_validation'),
        eq(projectMemoryEntries.status, 'active'),
      ))
      .orderBy(desc(projectMemoryEntries.createdAt))
      .limit(200);

    if (rows.length === 0) return empty;

    let validated = 0;
    let partiallyValidated = 0;
    let disputed = 0;
    let signalCount = 0;

    for (const row of rows) {
      let verdict: string | undefined;
      let linkedSignalCount = 1;
      try {
        const data = JSON.parse(row.content);
        verdict = data.verdict;
        if (Array.isArray(data.signalIds)) {
          linkedSignalCount = Math.max(1, data.signalIds.length);
        }
      } catch {
        continue;
      }

      // Weight by the number of signals each validation covers so a single
      // feedback event that validated 10 signals counts more than one that
      // validated a single signal.
      switch (verdict) {
        case 'validated': validated += linkedSignalCount; break;
        case 'partially_validated': partiallyValidated += linkedSignalCount; break;
        case 'disputed': disputed += linkedSignalCount; break;
      }
      signalCount += linkedSignalCount;
    }

    if (signalCount === 0) return empty;

    const reliabilityIndex =
      (validated + partiallyValidated * 0.5) / signalCount;

    return {
      validated,
      partiallyValidated,
      disputed,
      totalValidations: signalCount,
      reliabilityIndex: Number.isFinite(reliabilityIndex)
        ? Math.max(0, Math.min(1, reliabilityIndex))
        : null,
    };
  } catch {
    return empty;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHED RELIABILITY READER — for per-turn use in chat paths
// ═══════════════════════════════════════════════════════════════════════════════

interface CachedReliabilityEntry {
  value: SignalReliability;
  cachedAt: number;
}

const reliabilityCache = new Map<string, CachedReliabilityEntry>();
const RELIABILITY_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Cached variant of {@link getSignalReliability} suitable for per-turn use
 * in chat handlers. The underlying query reads up to 200 validation entries
 * per call — caching for 5 minutes keeps reliability fresh enough for live
 * UX without paying that cost on every chat turn.
 *
 * Cache is invalidated naturally by TTL; call {@link invalidateReliabilityCache}
 * explicitly after writing a new validation entry if you need immediate
 * reflection (typically not necessary — the next 5-min window will pick it up).
 */
export async function getCachedSignalReliability(
  projectId: number,
  organizationId: number,
): Promise<SignalReliability> {
  if (!Number.isFinite(projectId) || projectId <= 0 ||
      !Number.isFinite(organizationId) || organizationId <= 0) {
    return {
      validated: 0,
      partiallyValidated: 0,
      disputed: 0,
      totalValidations: 0,
      reliabilityIndex: null,
    };
  }

  const key = `${organizationId}:${projectId}`;
  const entry = reliabilityCache.get(key);
  if (entry && Date.now() - entry.cachedAt < RELIABILITY_TTL_MS) {
    return entry.value;
  }

  const value = await getSignalReliability(projectId, organizationId);
  reliabilityCache.set(key, { value, cachedAt: Date.now() });
  return value;
}

/** Invalidate the cached reliability for a specific org/project. */
export function invalidateReliabilityCache(
  projectId: number,
  organizationId: number,
): void {
  reliabilityCache.delete(`${organizationId}:${projectId}`);
}

/**
 * Get dismissal patterns to suppress unhelpful recommendation types.
 */
export async function getDismissalPatterns(
  projectId: number,
  organizationId: number,
): Promise<Map<string, number>> {
  const summary = await getFeedbackSummary(projectId, organizationId);
  const patterns = new Map<string, number>();
  for (const entry of summary.topDismissedTypes) {
    patterns.set(entry.type, entry.count);
  }
  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL VALIDATION — link feedback back to recent signals so RIM can weight them
// ═══════════════════════════════════════════════════════════════════════════════

export type SignalValidationVerdict = 'validated' | 'partially_validated' | 'disputed';

function verdictForFeedback(
  feedbackType: 'accepted' | 'rejected' | 'edited' | 'regenerated',
): SignalValidationVerdict {
  switch (feedbackType) {
    case 'accepted': return 'validated';
    case 'edited': return 'partially_validated';
    case 'rejected':
    case 'regenerated':
    default: return 'disputed';
  }
}

/**
 * Link a feedback event back to the most recent intelligence signals for the
 * same artifact, tagging each with a validation verdict. Closes the learning
 * loop: subsequent RIM runs can read these validation entries and weight
 * prior signals by their historical accuracy.
 *
 * Writes a new `intelligence_signal_validation` entry to projectMemoryEntries
 * rather than mutating the signal-summary rows — keeps the signal history
 * append-only so trend computation stays sound.
 *
 * Fire-and-forget; errors are logged and swallowed.
 */
export async function linkFeedbackToRecentSignals(params: {
  organizationId: number;
  projectId: number;
  artifactId?: string;
  feedbackType: 'accepted' | 'rejected' | 'edited' | 'regenerated';
  userId?: number;
}): Promise<void> {
  const { organizationId, projectId, artifactId, feedbackType, userId } = params;
  if (!artifactId) return;
  if (!Number.isFinite(organizationId) || organizationId <= 0) return;
  if (!Number.isFinite(projectId) || projectId <= 0) return;

  try {
    // Lazy import avoids a cycle (signal-capture imports nothing from here,
    // but this keeps the dependency direction obvious to future readers).
    const { querySignals } = await import('./signal-capture.js');
    const recent = querySignals({ organizationId, projectId, limit: 50 })
      .filter(s => s.artifactId === artifactId)
      .slice(0, 10);

    if (recent.length === 0) return;

    const [profile] = await db
      .select({ id: projectIntelligenceProfiles.id })
      .from(projectIntelligenceProfiles)
      .where(and(
        eq(projectIntelligenceProfiles.projectId, projectId),
        eq(projectIntelligenceProfiles.organizationId, organizationId),
      ))
      .limit(1);

    if (!profile) return;

    const verdict = verdictForFeedback(feedbackType);

    await db.insert(projectMemoryEntries).values({
      projectProfileId: profile.id,
      projectId,
      organizationId,
      category: 'intelligence_signal_validation',
      subcategory: feedbackType,
      title: `Signal validation (${verdict}): ${artifactId}`,
      content: JSON.stringify({
        artifactId,
        feedbackType,
        verdict,
        userId,
        signalIds: recent.map(s => s.signalId),
        signals: recent.map(s => ({
          signalId: s.signalId,
          type: s.type,
          riskLevel: s.riskLevel,
          score: s.score,
          confidence: s.confidence,
          runId: s.provenance?.runId,
        })),
        linkedAt: new Date().toISOString(),
      }),
      sourceDocumentName: null,
      sourceDocumentType: 'system',
      confidenceScore: 1.0,
      importanceLevel: verdict === 'disputed' ? 'high' : 'medium',
      isVerifiedByUser: true,
      status: 'active',
      extractedBy: 'learning_loop',
    } as any);
  } catch (err) {
    console.warn(
      '[LearningLoop] linkFeedbackToRecentSignals failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL
// ═══════════════════════════════════════════════════════════════════════════════

async function recordDismissalPattern(
  feedback: RecommendationFeedback,
  profileId: number,
): Promise<void> {
  // Update the profile's learned insights with the dismissal pattern
  const [profile] = await db
    .select({ learnedInsights: projectIntelligenceProfiles.learnedInsights })
    .from(projectIntelligenceProfiles)
    .where(eq(projectIntelligenceProfiles.id, profileId))
    .limit(1);

  if (!profile) return;

  const existing = Array.isArray(profile.learnedInsights) ? profile.learnedInsights as unknown as Array<Record<string, unknown>> : [];

  const newInsight = {
    insight: `User dismissed ${feedback.recommendationType} recommendation: "${feedback.userComment}"`,
    source: 'user_feedback',
    confidence: 0.95,
    extractedAt: new Date().toISOString(),
  };

  await db
    .update(projectIntelligenceProfiles)
    .set({
      learnedInsights: [...existing, newInsight] as any,
      updatedAt: new Date(),
    } as any)
    .where(eq(projectIntelligenceProfiles.id, profileId));
}
