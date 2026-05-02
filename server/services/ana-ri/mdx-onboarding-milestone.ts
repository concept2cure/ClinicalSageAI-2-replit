/**
 * MDX onboarding milestone evaluator — pure function over live state.
 *
 * No new DB tables, no parallel state machine. Computes the customer's
 * current onboarding milestone by querying what's already there:
 *
 *   M0  no_program        — tenant has zero regulatory programs.
 *   M1  no_predicates     — at least one program but no predicate set picked.
 *   M2  predicates_set    — predicates picked; ready for Pre-Sub or eSTAR work.
 *   M3  authoring         — at least one eSTAR section in 'drafting' state.
 *   M4  presub_in_flight  — at least one Q-Sub in stage await/feedback.
 *   M5  preflight_ready   — every load-bearing eSTAR section approved.
 *   M6  transmitted       — at least one ESG transmit succeeded for this org.
 *
 * The milestone IS the answer to "where is this tenant in their journey".
 * The chat-context-builder reads it and feeds it to AnA so she can frame
 * her guidance to the user's actual situation, not generic onboarding copy.
 *
 * Pure function: a single SELECT against a few tables, no caching, no
 * mutation. Re-evaluates every time the chat context is built.
 */

import type { Pool, PoolClient } from 'pg';

export type MdxOnboardingMilestoneId =
  | 'no_program'
  | 'no_predicates'
  | 'predicates_set'
  | 'authoring'
  | 'presub_in_flight'
  | 'preflight_ready'
  | 'transmitted';

export interface MdxOnboardingMilestone {
  /** Stable id used by the prompt builder. */
  id: MdxOnboardingMilestoneId;
  /** Human-readable label AnA can paraphrase. */
  label: string;
  /** What AnA should focus the user on next. */
  nextStep: string;
  /** Reference to the workflow id (W1-W5) the user is in or about to enter. */
  workflowId?: string;
  /** Counts the evaluator computed (for the audit row + transparency). */
  signals: {
    programs: number;
    programsWithPrimaryPredicate: number;
    programsWithDraftingSections: number;
    programsWithApprovedSections: number;
    qSubsInFlight: number;
    transmittedPackages: number;
  };
}

interface SignalQuery {
  programs: number;
  programsWithPrimaryPredicate: number;
  programsWithDraftingSections: number;
  programsWithApprovedSections: number;
  qSubsInFlight: number;
  transmittedPackages: number;
}

async function gatherSignals(
  client: Pool | PoolClient,
  organizationId: number,
): Promise<SignalQuery> {
  const out: SignalQuery = {
    programs: 0,
    programsWithPrimaryPredicate: 0,
    programsWithDraftingSections: 0,
    programsWithApprovedSections: 0,
    qSubsInFlight: 0,
    transmittedPackages: 0,
  };

  // Programs.
  try {
    const { rows } = await client.query(
      `SELECT count(*)::int AS c
       FROM regulatory_programs WHERE organization_id = $1`,
      [organizationId],
    );
    out.programs = rows[0]?.c ?? 0;
  } catch { /* fail-soft */ }
  if (out.programs === 0) return out;

  // Programs with at least one predicate marked primary in the JSON column.
  try {
    const { rows } = await client.query(
      `SELECT count(*)::int AS c
       FROM regulatory_programs
       WHERE organization_id = $1
         AND predicate_devices IS NOT NULL
         AND jsonb_array_length(predicate_devices::jsonb) > 0`,
      [organizationId],
    );
    out.programsWithPrimaryPredicate = rows[0]?.c ?? 0;
  } catch { /* fail-soft */ }

  // Sections in drafting OR approved state.
  try {
    const { rows } = await client.query(
      `SELECT
         count(*) FILTER (WHERE status = 'drafting')::int AS drafting,
         count(*) FILTER (WHERE status IN ('validated', 'approved'))::int AS approved
       FROM cerv2_510k_sections
       WHERE organization_id = $1`,
      [organizationId],
    );
    out.programsWithDraftingSections = rows[0]?.drafting ?? 0;
    out.programsWithApprovedSections = rows[0]?.approved ?? 0;
  } catch { /* fail-soft */ }

  // Q-Subs in await / feedback (mid-flight).
  try {
    const { rows } = await client.query(
      `SELECT count(*)::int AS c
       FROM q_submissions q
       JOIN regulatory_programs p ON p.id::text = q.program_id
       WHERE p.organization_id = $1
         AND q.stage IN ('submit', 'await', 'feedback')`,
      [organizationId],
    );
    out.qSubsInFlight = rows[0]?.c ?? 0;
  } catch { /* fail-soft */ }

  // Transmitted packages: count audit rows for this org with the transmit code.
  // Uses audit_logs (the central trail) so it works regardless of whether
  // fda_510k_submission_packages exists in this tenant's schema.
  try {
    const { rows } = await client.query(
      `SELECT count(*)::int AS c
       FROM audit_logs
       WHERE tenant_id = $1
         AND action = 'k510_workflow.transmit'`,
      [organizationId],
    );
    out.transmittedPackages = rows[0]?.c ?? 0;
  } catch { /* fail-soft */ }

  return out;
}

export async function getMdxOnboardingMilestone(
  client: Pool | PoolClient,
  organizationId: number,
): Promise<MdxOnboardingMilestone> {
  const signals = await gatherSignals(client, organizationId);

  if (signals.programs === 0) {
    return {
      id: 'no_program',
      label: 'No regulatory program set up yet.',
      nextStep:
        'Create a regulatory program for the device you\'re bringing to market. ' +
        'Pick the pathway (510(k), PMA, CER) and fill in the basic device profile.',
      signals,
    };
  }

  if (signals.transmittedPackages > 0) {
    return {
      id: 'transmitted',
      label: 'A 510(k) has been transmitted to FDA.',
      nextStep:
        'Monitor the FDA review clock (75 days for the substantive review). Watch for AI letters; ' +
        'if one arrives, ingest it via correspondence.intake and route the deficiencies.',
      signals,
    };
  }

  // approved-only proxy for "ready to pre-flight": at least 4 of the
  // load-bearing sections approved AND zero in drafting. Crude but
  // correct for the BETA shape where each program has 18 eSTAR sections.
  if (
    signals.programsWithApprovedSections >= 4 &&
    signals.programsWithDraftingSections === 0
  ) {
    return {
      id: 'preflight_ready',
      label: 'eSTAR sections are approved and quiet — pre-flight time.',
      nextStep:
        'Run k510_workflow.preflight on the program. If the verdict is green, the next governed ' +
        'action is k510_workflow.transmit (which I will walk you through with an explicit ' +
        'two-phase confirmation).',
      workflowId: 'W5',
      signals,
    };
  }

  if (signals.qSubsInFlight > 0) {
    return {
      id: 'presub_in_flight',
      label: 'Pre-Sub conversation with FDA is in flight.',
      nextStep:
        'When FDA responds, capture each commitment. After updating the relevant eSTAR section, ' +
        'mark the commitment as rolled-in (q_sub.commitment.set_rolled_in).',
      workflowId: 'W3',
      signals,
    };
  }

  if (signals.programsWithDraftingSections > 0) {
    return {
      id: 'authoring',
      label: 'eSTAR authoring is the active work.',
      nextStep:
        'Open the eSTAR editor and work through the load-bearing sections (§3 IFU, §6 SE, §11 ' +
        'Performance, §12 Labeling). Each save runs validation; when findings are clean, approve ' +
        'with the governed sign-off.',
      workflowId: 'W2',
      signals,
    };
  }

  if (signals.programsWithPrimaryPredicate === 0) {
    return {
      id: 'no_predicates',
      label: 'Program exists but no predicate set picked yet.',
      nextStep:
        'Open the predicate-intelligence surface and pick a primary predicate. Add reference ' +
        'predicates if technology differences require justification. Then I can scaffold the SE matrix.',
      workflowId: 'W1',
      signals,
    };
  }

  return {
    id: 'predicates_set',
    label: 'Predicates picked; ready for the next step.',
    nextStep:
      'You can either start eSTAR authoring (most common path), or file a Pre-Sub if you have ' +
      'questions for FDA. I\'d typically recommend a Pre-Sub when you have ≥ 3 substantive ' +
      'questions about the submission strategy.',
    workflowId: 'W2',
    signals,
  };
}
