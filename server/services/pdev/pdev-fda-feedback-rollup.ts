/**
 * PDEV FDA feedback → activity rollup.
 *
 * The existing q_sub_commitments table already captures every FDA
 * Pre-IND / SIR / SRD commitment with `dossier_link_kind`,
 * `dossier_link_section_id`, `text`, `blocker`, and `rolled_in`.
 *
 * This service inspects unrolled commitments for a program, proposes a
 * mapping to PDEV activities (using heuristic text matching on the
 * commitment text vs. registry activity titles / descriptions), and
 * — when explicitly invoked — applies the rollup:
 *
 *   1. Appends the commitment text to the activity's `notes`.
 *   2. Moves the activity into `agency_feedback_received` (unless it
 *      is already in a more advanced state).
 *   3. Marks the commitment row `rolled_in = true` and stamps actor.
 *   4. Emits an audit event per applied rollup.
 *
 * The proposal step is read-only and idempotent; the apply step
 * mutates and audit-logs.
 *
 * @module server/services/pdev/pdev-fda-feedback-rollup
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { regulatoryPrograms } from '../../../shared/schema/programs';
import {
  qSubmissions,
  qSubQuestions,
  qSubCommitments,
} from '../../../shared/schema/q-sub';
import { pdevProgramActivities } from '../../../shared/schema/pdev-workflow';
import {
  PDEV_ACTIVITIES,
  getActivityByKey,
  type PdevActivity,
  type PdevActivityState,
} from './pdev-activity-registry';
import auditService from '../auditService';

const logger = createScopedLogger('pdev-fda-feedback-rollup');

export interface PdevCommitmentRollupProposal {
  commitmentId: string;
  commitmentDisplayCode: string;
  commitmentText: string;
  blocker: boolean;
  qSubmissionId: string;
  /** Top match (highest score). Null when no plausible match. */
  match: {
    activityKey: string;
    workstream: string;
    confidence: number;
    matchedTerms: string[];
  } | null;
  /** Alternative matches with their scores. */
  alternatives: Array<{
    activityKey: string;
    confidence: number;
  }>;
}

export interface PdevFdaFeedbackProposalReport {
  programId: string;
  totalUnrolledCommitments: number;
  proposals: PdevCommitmentRollupProposal[];
}

export interface PdevFdaFeedbackApplyInput {
  programId: string;
  organizationId: number;
  userId: number;
  /** One mapping per commitment to apply. */
  mappings: Array<{
    commitmentId: string;
    activityKey: string;
    /** Optional override — if true, advance state even if activity is
     *  already approved/locked. Default false (preserve advanced states). */
    forceState?: boolean;
  }>;
}

export interface PdevFdaFeedbackApplyResult {
  applied: Array<{
    commitmentId: string;
    activityKey: string;
    activityStateId: string;
    newState: PdevActivityState;
    previousState: PdevActivityState;
  }>;
  skipped: Array<{
    commitmentId: string;
    reason: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic activity match — pure, testable
// ─────────────────────────────────────────────────────────────────────────────

/** Stopwords stripped before scoring. Kept short on purpose: regulatory
 *  vocabulary is technical; aggressive stopwording loses signal. */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'with', 'in', 'on',
  'be', 'is', 'are', 'will', 'shall', 'must', 'should', 'we', 'our',
  'this', 'that', 'these', 'those', 'as', 'by', 'from', 'at', 'into',
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/** Score (0..1) how well a commitment's text matches an activity. */
export function scoreActivityMatch(
  commitmentText: string,
  activity: PdevActivity
): { score: number; matchedTerms: string[] } {
  const commitTokens = new Set(tokenize(commitmentText));
  const activityCorpus = [
    activity.key.replace(/[._]/g, ' '),
    activity.title,
    activity.description,
    ...activity.requiredDocuments.map(d => d.title),
  ].join(' ');
  const activityTokens = tokenize(activityCorpus);
  if (commitTokens.size === 0 || activityTokens.length === 0) {
    return { score: 0, matchedTerms: [] };
  }
  const matched = activityTokens.filter(t => commitTokens.has(t));
  const uniqueMatched = Array.from(new Set(matched));
  // Score: matched-unique / sqrt(commitToken-count * activityToken-count).
  // Bias towards matches that are dense in BOTH corpora.
  const denom = Math.sqrt(commitTokens.size * activityTokens.length);
  const score = denom === 0 ? 0 : uniqueMatched.length / denom;
  return { score: Math.min(1, score * 2), matchedTerms: uniqueMatched.slice(0, 8) };
}

export function proposeActivityForCommitment(
  commitmentText: string
): PdevCommitmentRollupProposal['match'] & { alternatives: PdevCommitmentRollupProposal['alternatives'] } {
  const scored = PDEV_ACTIVITIES.map(a => {
    const { score, matchedTerms } = scoreActivityMatch(commitmentText, a);
    return { activity: a, score, matchedTerms };
  })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return {
      activityKey: '',
      workstream: '',
      confidence: 0,
      matchedTerms: [],
      alternatives: [],
    };
  }

  const top = scored[0];
  const alternatives = scored.slice(1, 4).map(s => ({
    activityKey: s.activity.key,
    confidence: Math.round(s.score * 100) / 100,
  }));

  return {
    activityKey: top.activity.key,
    workstream: top.activity.workstream,
    confidence: Math.round(top.score * 100) / 100,
    matchedTerms: top.matchedTerms,
    alternatives,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

const COMPLETED_STATES: ReadonlySet<PdevActivityState> = new Set([
  'approved',
  'locked',
  'submission_ready',
  'submitted',
]);

export class PdevFdaFeedbackRollupService {
  /**
   * Read-only: for each unrolled commitment, propose the best PDEV
   * activity match plus up to 3 alternatives. Caller decides what to
   * apply.
   */
  async proposeRollup(
    programId: string,
    organizationId: number,
    options?: { minConfidence?: number }
  ): Promise<PdevFdaFeedbackProposalReport | null> {
    const programRows = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, programId),
          eq(regulatoryPrograms.organizationId, organizationId)
        )
      )
      .limit(1);
    if (!programRows[0]) return null;

    const subs = await db
      .select({ id: qSubmissions.id })
      .from(qSubmissions)
      .where(eq(qSubmissions.programId, programId));
    const subIds = subs.map(s => s.id);
    if (subIds.length === 0) {
      return { programId, totalUnrolledCommitments: 0, proposals: [] };
    }

    const questions = await db
      .select({ id: qSubQuestions.id })
      .from(qSubQuestions)
      .where(inArray(qSubQuestions.qSubmissionId, subIds));
    const questionIds = questions.map(q => q.id);
    if (questionIds.length === 0) {
      return { programId, totalUnrolledCommitments: 0, proposals: [] };
    }

    const commitments = await db
      .select()
      .from(qSubCommitments)
      .where(
        and(
          inArray(qSubCommitments.qSubQuestionId, questionIds),
          eq(qSubCommitments.rolledIn, false)
        )
      );

    const minConfidence = options?.minConfidence ?? 0;
    const proposals: PdevCommitmentRollupProposal[] = [];
    for (const c of commitments) {
      const m = proposeActivityForCommitment(c.text);
      const accepted = m.activityKey && m.confidence >= minConfidence;
      // Find parent submission via question.
      const parentQ = await db
        .select({ submissionId: qSubQuestions.qSubmissionId })
        .from(qSubQuestions)
        .where(eq(qSubQuestions.id, c.qSubQuestionId))
        .limit(1);

      proposals.push({
        commitmentId: c.id,
        commitmentDisplayCode: c.displayCode,
        commitmentText: c.text,
        blocker: c.blocker,
        qSubmissionId: parentQ[0]?.submissionId ?? '',
        match: accepted
          ? {
              activityKey: m.activityKey,
              workstream: m.workstream,
              confidence: m.confidence,
              matchedTerms: m.matchedTerms,
            }
          : null,
        alternatives: m.alternatives,
      });
    }

    return {
      programId,
      totalUnrolledCommitments: commitments.length,
      proposals,
    };
  }

  /**
   * Apply a set of (commitment → activity) mappings. For each:
   *   - Append commitment text to activity notes.
   *   - Advance activity state to agency_feedback_received (unless
   *     forceState=false AND activity is already completed).
   *   - Mark commitment rolled_in=true with actor.
   *   - Audit-log.
   */
  async applyRollup(input: PdevFdaFeedbackApplyInput): Promise<PdevFdaFeedbackApplyResult> {
    // Tenant gate.
    const programRows = await db
      .select({ id: regulatoryPrograms.id })
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, input.programId),
          eq(regulatoryPrograms.organizationId, input.organizationId)
        )
      )
      .limit(1);
    if (!programRows[0]) {
      throw new Error('PDEV program not found in tenant');
    }

    const applied: PdevFdaFeedbackApplyResult['applied'] = [];
    const skipped: PdevFdaFeedbackApplyResult['skipped'] = [];

    for (const mapping of input.mappings) {
      const activity = getActivityByKey(mapping.activityKey);
      if (!activity) {
        skipped.push({
          commitmentId: mapping.commitmentId,
          reason: `Unknown activity key: ${mapping.activityKey}`,
        });
        continue;
      }

      // Load the commitment + verify it belongs to this program via join.
      const ctxRows = await db
        .select({
          id: qSubCommitments.id,
          text: qSubCommitments.text,
          displayCode: qSubCommitments.displayCode,
          rolledIn: qSubCommitments.rolledIn,
          programId: qSubmissions.programId,
        })
        .from(qSubCommitments)
        .innerJoin(qSubQuestions, eq(qSubQuestions.id, qSubCommitments.qSubQuestionId))
        .innerJoin(qSubmissions, eq(qSubmissions.id, qSubQuestions.qSubmissionId))
        .where(eq(qSubCommitments.id, mapping.commitmentId))
        .limit(1);
      const ctx = ctxRows[0];
      if (!ctx) {
        skipped.push({ commitmentId: mapping.commitmentId, reason: 'Commitment not found' });
        continue;
      }
      if (ctx.programId !== input.programId) {
        skipped.push({
          commitmentId: mapping.commitmentId,
          reason: 'Commitment belongs to a different program',
        });
        continue;
      }
      if (ctx.rolledIn) {
        skipped.push({ commitmentId: mapping.commitmentId, reason: 'Already rolled in' });
        continue;
      }

      // Load / upsert activity state.
      const existing = await db
        .select()
        .from(pdevProgramActivities)
        .where(
          and(
            eq(pdevProgramActivities.programId, input.programId),
            eq(pdevProgramActivities.activityKey, activity.key)
          )
        )
        .limit(1);

      const previousState = (existing[0]?.state ?? 'not_started') as PdevActivityState;
      const preserveAdvanced =
        !mapping.forceState && COMPLETED_STATES.has(previousState);
      const newState: PdevActivityState = preserveAdvanced
        ? previousState
        : 'agency_feedback_received';

      const now = new Date();
      const noteEntry = `[FDA · ${ctx.displayCode}] ${ctx.text}`;
      const mergedNotes = (existing[0]?.notes ? existing[0].notes + '\n\n' : '') + noteEntry;

      let stateRowId: string;
      if (existing[0]) {
        const updated = await db
          .update(pdevProgramActivities)
          .set({
            state: newState,
            notes: mergedNotes,
            stateChangedAt: now,
            stateChangedBy: input.userId,
            updatedAt: now,
          })
          .where(eq(pdevProgramActivities.id, existing[0].id))
          .returning({ id: pdevProgramActivities.id });
        stateRowId = updated[0].id;
      } else {
        const inserted = await db
          .insert(pdevProgramActivities)
          .values({
            programId: input.programId,
            activityKey: activity.key,
            workstream: activity.workstream,
            stage: activity.stage,
            state: newState,
            notes: mergedNotes,
            stateChangedAt: now,
            stateChangedBy: input.userId,
          })
          .returning({ id: pdevProgramActivities.id });
        stateRowId = inserted[0].id;
      }

      // Mark commitment rolled-in.
      await db
        .update(qSubCommitments)
        .set({
          rolledIn: true,
          rolledInAt: now,
          rolledInBy: String(input.userId),
          updatedAt: now,
        })
        .where(eq(qSubCommitments.id, mapping.commitmentId));

      void auditService.logAction({
        tenantId: input.organizationId,
        userId: input.userId,
        action: 'pdev_fda_feedback_rolled_up',
        resourceType: 'pdev_program_activity',
        resourceId: stateRowId,
        details: {
          programId: input.programId,
          activityKey: activity.key,
          commitmentId: mapping.commitmentId,
          commitmentDisplayCode: ctx.displayCode,
          previousState,
          newState,
          preservedAdvancedState: preserveAdvanced,
        },
      });

      applied.push({
        commitmentId: mapping.commitmentId,
        activityKey: activity.key,
        activityStateId: stateRowId,
        newState,
        previousState,
      });
    }

    logger.info('Applied FDA feedback rollup', {
      programId: input.programId,
      applied: applied.length,
      skipped: skipped.length,
    });

    return { applied, skipped };
  }
}

export const pdevFdaFeedbackRollupService = new PdevFdaFeedbackRollupService();

// Helper expected by routes — count unrolled commitments for a program.
// Caller MUST have already tenant-gated `programId` via regulatoryPrograms.
export async function countUnrolledCommitments(programId: string): Promise<number> {
  const result = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(qSubCommitments)
    .innerJoin(qSubQuestions, eq(qSubQuestions.id, qSubCommitments.qSubQuestionId))
    .innerJoin(qSubmissions, eq(qSubmissions.id, qSubQuestions.qSubmissionId))
    .where(
      and(
        eq(qSubmissions.programId, programId),
        eq(qSubCommitments.rolledIn, false)
      )
    );
  return result[0]?.n ?? 0;
}
