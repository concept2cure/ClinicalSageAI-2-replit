/**
 * Client onboarding journey — the license-to-submission spine.
 *
 * The MDX onboarding milestone (ana-ri/mdx-onboarding-milestone.ts) answers
 * "where is this DEVICE tenant in their journey" once a program exists. This
 * generalizes that to a SEGMENT-AGNOSTIC lifecycle that starts at the very
 * first moment — a brand-new licensee with no project yet — and runs all the
 * way to a transmitted submission, so AnA is present and oriented at every
 * stage, not only once real work is underway.
 *
 *   just_licensed     — org exists, no project yet, brand new. Welcome + kick off onboarding.
 *   onboarding        — no project yet, but no longer brand new. Finish setting them up.
 *   project_started   — a project exists but little content. Orient to the first real work.
 *   authoring         — governed artifacts are being drafted. Build + reconcile.
 *   in_review         — content has reached review/approved. Pressure-test as a reviewer.
 *   submission_ready  — readiness is high across the program. Pre-flight + assemble.
 *   submitted         — a submission has been transmitted. Monitor the clock + prep for IR.
 *
 * The stage resolver is pure and fully unit-tested; signal gathering is
 * fail-soft (each query degrades to zero) exactly like the MDX evaluator, so a
 * schema difference never breaks the journey read — it just lands the client on
 * an earlier, safe stage.
 *
 * @module server/services/ana/client-journey
 */

import type { Pool, PoolClient } from 'pg';

import type { ClientSegment } from '../ana-ri/industry-wisdom-pack.js';
import { SEGMENT_LABELS } from '../ana-ri/industry-wisdom-pack.js';

export type ClientJourneyStage =
  | 'just_licensed'
  | 'onboarding'
  | 'project_started'
  | 'authoring'
  | 'in_review'
  | 'submission_ready'
  | 'submitted';

/** Live signals the stage is resolved from. All optional / fail-soft. */
export interface ClientJourneySignals {
  /** Number of projects/programs the tenant has created. */
  projectCount: number;
  /** Total governed artifacts across the tenant. */
  artifactCount: number;
  /** Artifacts that have reached review/approved/locked (advanced lifecycle). */
  advancedArtifactCount: number;
  /** Highest project readiness score seen (0-100), if known. */
  maxReadiness: number | null;
  /** Count of transmitted/submitted packages (audit signal). */
  submittedCount: number;
  /** Age of the organization in days, if known (drives the welcome vs nudge tone). */
  orgAgeDays: number | null;
}

export interface ClientJourney {
  stage: ClientJourneyStage;
  /** Human-readable label AnA can paraphrase. */
  label: string;
  /** Where the client is right now, in their terms. */
  whereYouAre: string;
  /** The next milestone on the path to submission. */
  nextMilestone: string;
  /** What AnA should offer to do RIGHT NOW — tied to a real capability. */
  anaOffer: string;
  /** Resolved segment, when known. */
  segment: ClientSegment | null;
  /** The signals the stage was resolved from (transparency). */
  signals: ClientJourneySignals;
}

/** Readiness at/above this is treated as "submission-ready" for the program. */
export const SUBMISSION_READY_THRESHOLD = 80;
/** Org younger than this (days) with no project is a fresh licensee to welcome. */
export const FRESH_LICENSE_DAYS = 3;

/**
 * Resolve the journey stage from live signals. Pure; ordered most-advanced
 * first so a submitted program is never mistaken for one still authoring.
 */
export function resolveClientJourneyStage(signals: ClientJourneySignals): ClientJourneyStage {
  if (signals.submittedCount > 0) return 'submitted';
  if ((signals.maxReadiness ?? 0) >= SUBMISSION_READY_THRESHOLD) return 'submission_ready';
  if (signals.advancedArtifactCount > 0) return 'in_review';
  if (signals.artifactCount > 0) return 'authoring';
  if (signals.projectCount > 0) return 'project_started';
  // No project yet: a fresh licensee gets the warm welcome; an older org that
  // still has no project gets a gentle "let's finish setting you up".
  if (signals.orgAgeDays == null || signals.orgAgeDays <= FRESH_LICENSE_DAYS) return 'just_licensed';
  return 'onboarding';
}

/** Segment-tailored fragment for the earliest stages, so the welcome lands in
 * the client's own terms rather than generic onboarding copy. */
function segmentFraming(segment: ClientSegment | null): string {
  switch (segment) {
    case 'mdx':
      return 'devices and diagnostics — predicate strategy through eSTAR and EU MDR';
    case 'biotech':
      return 'biologics and advanced therapies — IND through BLA, comparability, and the CMC critical path';
    case 'pharma':
      return 'small molecules — IND through NDA, the nonclinical long poles, and lifecycle variations';
    default:
      return 'your program — from the first submission planning through to the agency';
  }
}

/**
 * Build the full journey description for a stage. Pure. `anaOffer` deliberately
 * names the concrete capability AnA should reach for, so the injected guidance
 * turns into a real next action rather than a platitude.
 */
export function describeClientJourney(
  stage: ClientJourneyStage,
  opts: { segment?: ClientSegment | null; signals?: Partial<ClientJourneySignals> } = {},
): ClientJourney {
  const segment = opts.segment ?? null;
  const segLabel = segment ? SEGMENT_LABELS[segment] : null;
  const signals: ClientJourneySignals = {
    projectCount: 0,
    artifactCount: 0,
    advancedArtifactCount: 0,
    maxReadiness: null,
    submittedCount: 0,
    orgAgeDays: null,
    ...opts.signals,
  };

  const base = { segment, signals };

  switch (stage) {
    case 'just_licensed':
      return {
        ...base,
        stage,
        label: 'Just getting started — welcome.',
        whereYouAre:
          `This is a brand-new license with no project set up yet${segLabel ? ` (${segLabel})` : ''}. ` +
          'The client may not yet know what the platform is for.',
        nextMilestone: 'A first project, configured and ready to work in.',
        anaOffer:
          `Welcome them warmly as a senior colleague would on day one — say what you are for in their terms ` +
          `(${segmentFraming(segment)}) — then offer to set up their first project by walking them through a ` +
          `short onboarding questionnaire. Start it with start_intelligence_flow using the project_setup flow. ` +
          `Do not dump features; land on that one concrete first step.`,
      };
    case 'onboarding':
      return {
        ...base,
        stage,
        label: 'Onboarding — no project created yet.',
        whereYouAre: 'The client has a license but still no project configured.',
        nextMilestone: 'A first project, created from their onboarding answers.',
        anaOffer:
          'Pick up onboarding where it stands: run the project_setup flow (start_intelligence_flow) to capture ' +
          'organization, product, and regulatory scope, answer any questions they have along the way, and get a ' +
          'first project created. Keep it light — a few questions at a time, not a form dump.',
      };
    case 'project_started':
      return {
        ...base,
        stage,
        label: 'First project created — little content yet.',
        whereYouAre:
          `A project exists but there is almost nothing in it yet${
            signals.projectCount > 1 ? ` (${signals.projectCount} projects)` : ''
          }.`,
        nextMilestone: 'The first load-bearing sections drafted for their pathway.',
        anaOffer:
          'Orient them to the first real work for their submission type — the two or three sections that actually ' +
          'move the filing — and offer a readiness check so they can see the gaps quantified before drafting. ' +
          'Offer to draft the first section when they are ready.',
      };
    case 'authoring':
      return {
        ...base,
        stage,
        label: 'Authoring is the active work.',
        whereYouAre: `Drafting is underway (${signals.artifactCount} artifact${signals.artifactCount === 1 ? '' : 's'} in progress).`,
        nextMilestone: 'A complete, internally consistent draft set ready for review.',
        anaOffer:
          'Draft and expand the remaining sections, and keep the numbers consistent across protocol, SAP, CSR, and ' +
          'summary as you go. Offer the four-agent drafting council (convene_drafting_council) for a high-assurance ' +
          'section, and a consistency sweep across the dossier.',
      };
    case 'in_review':
      return {
        ...base,
        stage,
        label: 'Content is in review.',
        whereYouAre: `Sections have reached review or approval (${signals.advancedArtifactCount} advanced).`,
        nextMilestone: 'Every load-bearing section clean and submission-defensible.',
        anaOffer:
          'Shift into reviewer mode: read the sections as a hostile agency reviewer, check cross-references and ' +
          'consistency, and flag anything that would trigger a deficiency before the agency does. Offer a ' +
          'pre-mortem on the likely reviewer pushback.',
      };
    case 'submission_ready':
      return {
        ...base,
        stage,
        label: 'Readiness is high — approaching submission.',
        whereYouAre: `The program is scoring high on readiness${
          signals.maxReadiness != null ? ` (${Math.round(signals.maxReadiness)}%)` : ''
        }.`,
        nextMilestone: 'A validated, assembled submission package ready to transmit.',
        anaOffer:
          'Run the pre-flight checks, reconcile the last cross-references, and assemble the submission package. ' +
          'Walk them through the governed transmittal when the pre-flight is green — with the explicit ' +
          'confirmation the platform requires. This is the moment to be most careful and most direct about risk.',
      };
    case 'submitted':
      return {
        ...base,
        stage,
        label: 'A submission has been transmitted.',
        whereYouAre: 'At least one submission is with the agency.',
        nextMilestone: 'A clean review cycle — and a fast, complete response to anything the agency sends back.',
        anaOffer:
          'Help them track the review clock and stay ready for agency correspondence. If an information request or ' +
          'deficiency letter arrives, offer to parse it and draft the response within the clock. Keep the program ' +
          'honest about what is still open.',
      };
  }
}

/**
 * Render a journey into a proactive prompt block for the greeting path, so AnA
 * leads a returning (or new) client with where their program stands and the one
 * useful next move — instead of a bare hello. Pure. Tone floor honored (no
 * emoji, no exclamation marks) to match the rest of the enrichment blocks.
 */
export function buildClientJourneyPromptBlock(journey: ClientJourney): string {
  return (
    `\n\n## Where this client is on their journey (license → submission)\n\n` +
    `- **Stage:** ${journey.label} (\`${journey.stage}\`)\n` +
    `- **Where they are:** ${journey.whereYouAre}\n` +
    `- **Next milestone:** ${journey.nextMilestone}\n\n` +
    `This is a greeting. Lead with this: in one or two human lines, tell them where their program ` +
    `stands on the path to submission and the single most useful next move — do not open with a bare ` +
    `hello or a feature list. What to offer now: ${journey.anaOffer}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Live signal gathering (fail-soft)
// ─────────────────────────────────────────────────────────────────────────────

async function gatherJourneySignals(
  client: Pool | PoolClient,
  organizationId: number,
): Promise<ClientJourneySignals> {
  const out: ClientJourneySignals = {
    projectCount: 0,
    artifactCount: 0,
    advancedArtifactCount: 0,
    maxReadiness: null,
    submittedCount: 0,
    orgAgeDays: null,
  };

  // Projects (the generic project surface; devices also carry regulatory_programs
  // but a project row is created for both, so this is the cross-segment count).
  try {
    const { rows } = await client.query(
      `SELECT count(*)::int AS c FROM projects
       WHERE organization_id = $1 AND (status IS NULL OR status <> 'archived')`,
      [organizationId],
    );
    out.projectCount = rows[0]?.c ?? 0;
  } catch { /* fail-soft */ }

  // Governed artifacts — total, and how many have advanced past draft.
  try {
    const { rows } = await client.query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (
           WHERE status IN ('review','in_review','approved','locked','frozen','submission_ready','final')
         )::int AS advanced
       FROM concept2cure_artifacts
       WHERE organization_id = $1`,
      [organizationId],
    );
    out.artifactCount = rows[0]?.total ?? 0;
    out.advancedArtifactCount = rows[0]?.advanced ?? 0;
  } catch { /* fail-soft */ }

  // Submitted/transmitted signal from the central audit trail (segment-agnostic:
  // matches device eSTAR transmits, ESG submissions, gateway transmittals).
  try {
    const { rows } = await client.query(
      `SELECT count(*)::int AS c FROM audit_logs
       WHERE tenant_id = $1 AND (action ILIKE '%transmit%' OR action ILIKE '%submission%submit%')`,
      [organizationId],
    );
    out.submittedCount = rows[0]?.c ?? 0;
  } catch { /* fail-soft */ }

  // Organization age (welcome vs nudge tone at the pre-project stages).
  try {
    const { rows } = await client.query(
      `SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0 AS days
       FROM organizations WHERE id = $1`,
      [organizationId],
    );
    const days = rows[0]?.days;
    out.orgAgeDays = typeof days === 'number' || typeof days === 'string' ? Math.max(0, Number(days)) : null;
  } catch { /* fail-soft */ }

  return out;
}

export interface GetClientJourneyOptions {
  segment?: ClientSegment | null;
  /** Optional pre-computed max readiness (0-100) so a caller that already ran
   * the org-readiness overview doesn't pay for a second aggregate pass. */
  maxReadiness?: number | null;
}

/**
 * Resolve the tenant's current journey stage from live state and return the
 * full description AnA uses to orient them. Fail-soft throughout.
 */
export async function getClientJourney(
  client: Pool | PoolClient,
  organizationId: number,
  opts: GetClientJourneyOptions = {},
): Promise<ClientJourney> {
  const signals = await gatherJourneySignals(client, organizationId);
  if (typeof opts.maxReadiness === 'number') signals.maxReadiness = opts.maxReadiness;
  const stage = resolveClientJourneyStage(signals);
  return describeClientJourney(stage, { segment: opts.segment ?? null, signals });
}
