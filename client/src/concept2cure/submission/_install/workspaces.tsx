/**
 * Submission Center workspace slots — the single swap point for UI kits.
 *
 * Each of the seven workspaces (spec §4) is a slot rendering the Temporary
 * placeholder today. When Claude Design drops a kit, change that slot's
 * `element` to the kit component and flip `status` to 'ready'. Nothing else
 * needs to move — routing/nav read this registry, and the data is already wired
 * via the hooks named in `dataHooks` (see ./hooks).
 */
import type { ReactNode } from 'react';
import { Temporary } from './Temporary';

export type SlotStatus = 'temporary' | 'ready';

export interface WorkspaceSlot {
  id: string;
  /** Sentence-case label for nav. */
  label: string;
  /** Route pattern under the submission hub (spec §9.1). */
  routePattern: string;
  status: SlotStatus;
  /** Hooks from ./hooks a kit should consume (documentation + wiring aid). */
  dataHooks: string[];
  /** What the slot renders today. Swap for the kit component when it lands. */
  element: ReactNode;
}

export const SUBMISSION_WORKSPACE_SLOTS: WorkspaceSlot[] = [
  {
    id: 'planner',
    label: 'Planner',
    routePattern: '/submissions/:id/plan',
    status: 'temporary',
    dataHooks: ['useSubmission', 'usePlan', 'useRegionProfiles'],
    element: <Temporary workspace="Planner" note="Plan generation is live at POST /api/submissions/:id/plan." />,
  },
  {
    id: 'builder',
    label: 'Builder',
    routePattern: '/submissions/:id/builder',
    status: 'temporary',
    dataHooks: ['useSequences', 'useLeaves', 'useUpsertLeaf', 'useProvenance'],
    element: <Temporary workspace="Builder" note="The assembly tree, ingestion, and provenance are live underneath." />,
  },
  {
    id: 'sequences',
    label: 'Sequences',
    routePattern: '/submissions/:id/sequences',
    status: 'temporary',
    dataHooks: ['useSequences', 'useCreateSequence', 'useTransitionSequence'],
    element: <Temporary workspace="Sequences" note="Sequence lifecycle and transitions are live underneath." />,
  },
  {
    id: 'validation',
    label: 'Validation',
    routePattern: '/submissions/:id/validation',
    status: 'temporary',
    dataHooks: ['useExplainValidation'],
    element: <Temporary workspace="Validation" note="The eCTD validator and plain-language explain are live underneath." />,
  },
  {
    id: 'shadow-review',
    label: 'Shadow review',
    routePattern: '/submissions/:id/shadow-review',
    status: 'temporary',
    dataHooks: ['useRunShadowReview', 'useShadowReviews', 'useShadowFindings'],
    element: <Temporary workspace="Shadow review" note="The reviewer-lens engine and RTF/CRL risk are live underneath." />,
  },
  {
    id: 'cross-region',
    label: 'Cross-region',
    routePattern: '/submissions/:id/cross-region',
    status: 'temporary',
    dataHooks: ['useCrossRegion', 'useRegionProfiles'],
    element: <Temporary workspace="Cross-region" note="Cross-region gap analysis is live at POST /api/submissions/:id/cross-region." />,
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    routePattern: '/submissions/:id/dispatch',
    status: 'temporary',
    dataHooks: ['useDispatchQc'],
    element: <Temporary workspace="Dispatch" note="The QC gate is live; transmit stays behind the e-signature gate." />,
  },
];

export function getWorkspaceSlot(id: string): WorkspaceSlot | undefined {
  return SUBMISSION_WORKSPACE_SLOTS.find((w) => w.id === id);
}
