/**
 * PDEV Orchestrator — read-side joiner across existing program primitives.
 *
 * Given a `regulatoryPrograms.id`, this service joins:
 *   - regulatoryPrograms                              (program metadata)
 *   - ind_package_plans + plan_documents              (IND assembly state)
 *   - q_submissions + q_sub_meetings + q_sub_questions (Pre-IND / INTERACT)
 *   - fda_communications                              (raw FDA correspondence)
 *   - pdev_program_activities                         (per-activity state)
 *   - pdev_readiness_snapshots                        (latest readiness rollup)
 *
 * into a single PDEV view that downstream routes can return. No new
 * audit / approval machinery is created here — writes always go through
 * `auditService` (dual-write hash-chain) elsewhere.
 *
 * Tenant isolation: every read joins through `regulatoryPrograms` first
 * to gate by `organization_id`. Callers pass `organizationId` and we
 * refuse to return a program that doesn't match.
 *
 * @module server/services/pdev/pdev-orchestrator
 */

import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db';
import { createScopedLogger } from '../../utils/logger';
import { regulatoryPrograms, type RegulatoryProgram } from '../../../shared/schema/programs';
import {
  pdevProgramActivities,
  pdevReadinessSnapshots,
  type PdevProgramActivity,
  type PdevReadinessSnapshot,
} from '../../../shared/schema/pdev-workflow';
import { qSubmissions } from '../../../shared/schema/q-sub';
import { fdaCommunications } from '../../../shared/schema';
import {
  PDEV_ACTIVITIES,
  PDEV_WORKSTREAMS,
  type PdevActivity,
  type PdevWorkstream,
  type PdevActivityState,
} from './pdev-activity-registry';

const logger = createScopedLogger('pdev-orchestrator');

// ─────────────────────────────────────────────────────────────────────────────
// Types — the unified view returned to routes
// ─────────────────────────────────────────────────────────────────────────────

export interface PdevWorkstreamRollup {
  workstream: PdevWorkstream;
  totalActivities: number;
  completedActivities: number;
  inFlightActivities: number;
  blockedActivities: number;
  notStartedActivities: number;
  blockingActivities: number;
  blockingResolved: number;
  /** 0–100 readiness. */
  readinessScore: number;
}

export interface PdevActivityView {
  /** Registry definition. */
  registry: PdevActivity;
  /** Per-program state row, if it exists; null when the activity has
   *  never been touched. */
  state: PdevProgramActivity | null;
}

export interface PdevProgramView {
  program: RegulatoryProgram;
  workstreams: PdevWorkstreamRollup[];
  activities: PdevActivityView[];
  /** Latest readiness snapshot per workstream, plus 'overall'. */
  latestSnapshots: PdevReadinessSnapshot[];
  /** Pre-IND / INTERACT submissions known for the program. */
  qSubmissionCount: number;
  /** FDA correspondence count for the underlying organization + project. */
  fdaCorrespondenceCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const COMPLETED_STATES: ReadonlySet<PdevActivityState> = new Set([
  'approved',
  'locked',
  'submission_ready',
  'submitted',
]);

const IN_FLIGHT_STATES: ReadonlySet<PdevActivityState> = new Set([
  'drafting',
  'ai_draft_generated',
  'evidence_linked',
  'human_review_required',
  'in_review',
  'changes_requested',
  'agency_feedback_received',
  'revision_required',
]);

const BLOCKED_STATES: ReadonlySet<PdevActivityState> = new Set(['revision_required']);

/** Compute a workstream rollup from a set of (registry, state?) pairs. */
export function computeWorkstreamRollup(
  workstream: PdevWorkstream,
  activities: PdevActivityView[]
): PdevWorkstreamRollup {
  let completed = 0;
  let inFlight = 0;
  let blocked = 0;
  let notStarted = 0;
  let blocking = 0;
  let blockingResolved = 0;

  for (const a of activities) {
    const state = (a.state?.state ?? 'not_started') as PdevActivityState;
    if (COMPLETED_STATES.has(state)) completed += 1;
    else if (BLOCKED_STATES.has(state)) blocked += 1;
    else if (IN_FLIGHT_STATES.has(state)) inFlight += 1;
    else notStarted += 1;

    if (a.registry.blocksIndAssembly) {
      blocking += 1;
      if (COMPLETED_STATES.has(state)) blockingResolved += 1;
    }
  }

  const total = activities.length;
  // Readiness = completed / total weighted 60 %, plus blocking-resolved / blocking
  // weighted 40 %. Blocking activities matter disproportionately for IND assembly.
  const completedRatio = total === 0 ? 0 : completed / total;
  const blockingRatio = blocking === 0 ? 1 : blockingResolved / blocking;
  const readinessScore = Math.round((completedRatio * 60 + blockingRatio * 40) * 100) / 100;

  return {
    workstream,
    totalActivities: total,
    completedActivities: completed,
    inFlightActivities: inFlight,
    blockedActivities: blocked,
    notStartedActivities: notStarted,
    blockingActivities: blocking,
    blockingResolved,
    readinessScore,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator
// ─────────────────────────────────────────────────────────────────────────────

export class PdevOrchestrator {
  /**
   * Load a program with all PDEV view data. Returns null if the program
   * does not exist or belongs to a different organization.
   */
  async getProgramView(
    programId: string,
    organizationId: number
  ): Promise<PdevProgramView | null> {
    // 1. Program row, tenant-gated.
    const programRows = await db
      .select()
      .from(regulatoryPrograms)
      .where(
        and(
          eq(regulatoryPrograms.id, programId),
          eq(regulatoryPrograms.organizationId, organizationId)
        )
      )
      .limit(1);

    const program = programRows[0];
    if (!program) {
      logger.warn('pdev: program not found or tenant-denied', { programId, organizationId });
      return null;
    }

    // 2. Per-activity state rows for this program. Registry is closed,
    //    so the join is registry-driven: every activity gets a row in
    //    the view, even if no state row exists yet.
    const stateRows = await db
      .select()
      .from(pdevProgramActivities)
      .where(eq(pdevProgramActivities.programId, programId));

    const stateByKey = new Map<string, PdevProgramActivity>();
    for (const row of stateRows) {
      stateByKey.set(row.activityKey, row);
    }

    const activities: PdevActivityView[] = PDEV_ACTIVITIES.map(registry => ({
      registry,
      state: stateByKey.get(registry.key) ?? null,
    }));

    // 3. Workstream rollups.
    const workstreams: PdevWorkstreamRollup[] = PDEV_WORKSTREAMS.map(ws =>
      computeWorkstreamRollup(
        ws,
        activities.filter(a => a.registry.workstream === ws)
      )
    );

    // 4. Latest snapshot per workstream.
    const snapshotRows = await db
      .select()
      .from(pdevReadinessSnapshots)
      .where(eq(pdevReadinessSnapshots.programId, programId))
      .orderBy(desc(pdevReadinessSnapshots.createdAt))
      .limit(50);

    const seen = new Set<string>();
    const latestSnapshots: PdevReadinessSnapshot[] = [];
    for (const snap of snapshotRows) {
      if (seen.has(snap.workstream)) continue;
      seen.add(snap.workstream);
      latestSnapshots.push(snap);
    }

    // 5. Q-Submission and FDA correspondence counts. Program identity is
    //    text in q_submissions and integer project_id in fda_communications,
    //    so we count tolerantly.
    const qSubs = await db
      .select({ id: qSubmissions.id })
      .from(qSubmissions)
      .where(eq(qSubmissions.programId, programId));

    const fdaComms = await db
      .select({ id: fdaCommunications.id })
      .from(fdaCommunications)
      .where(eq(fdaCommunications.organizationId, organizationId));

    return {
      program,
      workstreams,
      activities,
      latestSnapshots,
      qSubmissionCount: qSubs.length,
      fdaCorrespondenceCount: fdaComms.length,
    };
  }
}

export const pdevOrchestrator = new PdevOrchestrator();
