/**
 * AnA global-submission-plan advisor — pure advisory wrapper over the MDX planner.
 *
 * A third grounded, deterministic advisor AnA ("AnA 1.0 RI") can call:
 *   - adviseGlobalSubmissionPlan — turns planGlobalSubmission() into a plain-
 *     language-ready, honest multi-market submission plan with prioritized actions.
 *
 * NO LLM, NO fabrication. Everything is derived from the global-market registry +
 * planner. Transmission is NEVER claimed (the registry invariant carries through).
 *
 * @module server/services/ana-advisory/submission-plan-advisor
 */

import { planGlobalSubmission } from '../mdx-submission-planner/planner';
import type { DeviceProfile } from '../mdx-submission-planner/types';
import type { MarketId } from '../global-markets/types';
import type { AnaAdvisoryToolSpec } from './types';

export interface SubmissionPlanAdviceInput {
  profile: DeviceProfile;
  targetMarkets: MarketId[];
}

export interface SubmissionPlanMarketLine {
  marketId: string;
  authority: string;
  dossierStandard: string;
  readinessBand: string;
  canAssemble: boolean;
  topNextAction?: string;
}

export interface SubmissionPlanAdvice {
  headline: string;
  markets: SubmissionPlanMarketLine[];
  assembleCapableMarkets: string[];
  marketsNeedingWork: string[];
  unknownMarkets: string[];
  blockers: string[];
  provenance: { generatedAt: string; modules: string[] };
}

/**
 * Produce structured, honest multi-market submission-plan advice by composing
 * {@link planGlobalSubmission} and shaping its per-market plans. Never claims the
 * platform can transmit to any authority.
 */
export function adviseGlobalSubmissionPlan(input: SubmissionPlanAdviceInput): SubmissionPlanAdvice {
  const targets = Array.isArray(input.targetMarkets) ? input.targetMarkets : [];
  const plan = planGlobalSubmission(input.profile, targets);

  const markets: SubmissionPlanMarketLine[] = plan.marketPlans.map((m) => ({
    marketId: m.marketId,
    authority: m.authorityShort ?? m.authority,
    dossierStandard: m.dossierStandard,
    readinessBand: m.readiness.band,
    canAssemble: m.canAssemble,
    topNextAction: m.nextActions[0]?.action,
  }));

  const ready = plan.readinessSummary.ready;
  const partial = plan.readinessSummary.partial;
  const notStarted = plan.readinessSummary.notStarted;
  const headline =
    targets.length === 0
      ? 'No target markets supplied — specify markets (e.g. "us-fda", "eu-mdr-ivdr") to plan a submission.'
      : `Across ${markets.length} market(s): ${ready} ready, ${partial} partial, ${notStarted} not started. ` +
        `The platform can assemble for ${plan.assembleCapableMarkets.length} (${plan.assembleCapableMarkets.join(', ') || 'none'}); ` +
        `it cannot transmit to any authority — you file each submission.`;

  return {
    headline,
    markets,
    assembleCapableMarkets: plan.assembleCapableMarkets,
    marketsNeedingWork: markets.filter((m) => m.readinessBand !== 'ready').map((m) => m.marketId),
    unknownMarkets: plan.unknownMarkets.map((u) => u.requestedId),
    blockers: plan.globalBlockers,
    provenance: {
      generatedAt: new Date().toISOString(),
      modules: ['mdx-submission-planner/planner', 'global-markets/market-readiness'],
    },
  };
}

/** Tool descriptor so AnA can register this advisor. */
export const SUBMISSION_PLAN_TOOL_SPEC: AnaAdvisoryToolSpec = {
  name: 'advise_global_submission_plan',
  description:
    'Produce an honest, multi-market regulatory submission plan for a device or IVD across the global ' +
    'market registry. For each target market reports the dossier standard, readiness band, whether the ' +
    'platform can assemble the dossier, and the top next action. Never claims transmission to any authority.',
  input_schema: {
    type: 'object',
    properties: {
      profile: {
        type: 'object',
        description: 'The device / IVD profile to plan for.',
        properties: {
          name: { type: 'string', description: 'Device or IVD name.' },
          isIvd: { type: 'boolean', description: 'Whether the product is an in-vitro diagnostic.' },
          riskTier: { type: 'string', description: 'Optional risk tier/class descriptor.' },
          intendedUse: { type: 'string', description: 'Optional intended-use statement.' },
          availableArtifacts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Artifact element ids the manufacturer has produced.',
          },
        },
        required: ['name', 'isIvd', 'availableArtifacts'],
      },
      targetMarkets: {
        type: 'array',
        items: { type: 'string' },
        description: 'Target market ids to plan for (e.g. "us-fda", "eu-mdr-ivdr", "jp-pmda").',
      },
    },
    required: ['profile', 'targetMarkets'],
  },
};

export default { adviseGlobalSubmissionPlan, SUBMISSION_PLAN_TOOL_SPEC };
