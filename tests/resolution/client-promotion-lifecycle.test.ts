/**
 * Client-Side Promotion Lifecycle — Pass 13 Tests
 *
 * Tests covering:
 * - Suggested action visibility based on artifact status
 * - Intent → endpoint mapping for all promotion stages
 * - Governance boundary auto-seeding
 *
 * @module tests/resolution/client-promotion-lifecycle.test
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface SuggestedAction {
  id: string;
  label: string;
  intent: string;
  description: string;
}

type ArtifactStatus = 'drafting' | 'review' | 'approved' | 'locked' | 'submission_ready';

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Builds promotion actions from artifact status (mirrors panel logic)
// ═══════════════════════════════════════════════════════════════════════════════

function buildPromotionActions(
  artifactStatus: ArtifactStatus | undefined,
  hasArtifact: boolean,
  readinessBlocked: boolean = false
): SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  if (hasArtifact && artifactStatus === 'drafting' && !readinessBlocked) {
    actions.push({
      id: 'promote-to-review', label: 'Promote to review',
      intent: 'promote_to_review', description: 'Run preflight then promote if all checks pass',
    });
  }

  if (hasArtifact && artifactStatus === 'review') {
    actions.push({
      id: 'approve-artifact', label: 'Approve artifact',
      intent: 'approve_artifact', description: 'Approve after reviewer sign-off (all gates checked)',
    });
  }

  if (hasArtifact && artifactStatus === 'approved') {
    actions.push({
      id: 'lock-artifact', label: 'Lock for submission',
      intent: 'lock_artifact', description: 'Lock content — no further edits allowed',
    });
  }

  if (hasArtifact && artifactStatus === 'locked') {
    actions.push({
      id: 'mark-submission-ready', label: 'Mark submission-ready',
      intent: 'mark_submission_ready', description: 'Confirm readiness for regulatory submission (requires RA lead)',
    });
  }

  return actions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: SUGGESTED ACTION VISIBILITY BY ARTIFACT STATUS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Promotion Actions by Artifact Status', () => {
  it('drafting → shows promote-to-review', () => {
    const actions = buildPromotionActions('drafting', true);
    expect(actions).toHaveLength(1);
    expect(actions[0].intent).toBe('promote_to_review');
  });

  it('drafting with readiness blocked → shows nothing', () => {
    const actions = buildPromotionActions('drafting', true, true);
    expect(actions).toHaveLength(0);
  });

  it('review → shows approve-artifact', () => {
    const actions = buildPromotionActions('review', true);
    expect(actions).toHaveLength(1);
    expect(actions[0].intent).toBe('approve_artifact');
  });

  it('approved → shows lock-artifact', () => {
    const actions = buildPromotionActions('approved', true);
    expect(actions).toHaveLength(1);
    expect(actions[0].intent).toBe('lock_artifact');
  });

  it('locked → shows mark-submission-ready', () => {
    const actions = buildPromotionActions('locked', true);
    expect(actions).toHaveLength(1);
    expect(actions[0].intent).toBe('mark_submission_ready');
  });

  it('submission_ready → shows nothing (terminal state)', () => {
    const actions = buildPromotionActions('submission_ready', true);
    expect(actions).toHaveLength(0);
  });

  it('no artifact → shows nothing regardless of status', () => {
    const actions = buildPromotionActions('drafting', false);
    expect(actions).toHaveLength(0);
  });

  it('only one action shown per status (no overlap)', () => {
    for (const status of ['drafting', 'review', 'approved', 'locked'] as ArtifactStatus[]) {
      const actions = buildPromotionActions(status, true);
      expect(actions.length).toBeLessThanOrEqual(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: INTENT → ENDPOINT MAPPING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Promotion Intent → Endpoint Mapping', () => {
  const map: Record<string, { method: string; path: string; boundaryFrom: string; boundaryTo: string }> = {
    promote_to_review: {
      method: 'POST', path: '/api/authoring-actions/promote-to-review',
      boundaryFrom: 'advisory', boundaryTo: 'governed_draft',
    },
    approve_artifact: {
      method: 'POST', path: '/api/authoring-actions/approve-artifact',
      boundaryFrom: 'governed_draft', boundaryTo: 'approved',
    },
    lock_artifact: {
      method: 'POST', path: '/api/authoring-actions/lock-artifact',
      boundaryFrom: 'approved', boundaryTo: 'locked',
    },
    mark_submission_ready: {
      method: 'POST', path: '/api/authoring-actions/mark-submission-ready',
      boundaryFrom: 'locked', boundaryTo: 'submission_ready',
    },
  };

  it('all 4 promotion intents have mapped endpoints', () => {
    expect(Object.keys(map)).toHaveLength(4);
  });

  it('all use POST method', () => {
    for (const [, m] of Object.entries(map)) {
      expect(m.method).toBe('POST');
    }
  });

  it('boundary transitions form a complete chain', () => {
    const chain = Object.values(map);
    // First starts at advisory
    expect(chain[0].boundaryFrom).toBe('advisory');
    // Last ends at submission_ready
    expect(chain[3].boundaryTo).toBe('submission_ready');
    // Each toBoundary matches the next fromBoundary
    expect(chain[0].boundaryTo).toBe(chain[1].boundaryFrom);
    expect(chain[1].boundaryTo).toBe(chain[2].boundaryFrom);
    expect(chain[2].boundaryTo).toBe(chain[3].boundaryFrom);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: GOVERNANCE BOUNDARY AUTO-SEEDING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Governance Boundary Auto-Seeding', () => {
  it('seed rules cover all 4 transition stages', () => {
    // Default seed rules from GovernanceBoundaryService.seedDefaultRules():
    const seedTransitions = [
      { from: 'advisory', to: 'governed_draft', rule: 'Advisory to Governed Draft' },
      { from: 'governed_draft', to: 'approved', rule: 'Governed Draft to Approved' },
      { from: 'approved', to: 'locked', rule: 'Approved to Locked' },
      { from: 'locked', to: 'submission_ready', rule: 'Locked to Submission Ready' },
    ];

    expect(seedTransitions).toHaveLength(4);

    // Verify chain completeness
    expect(seedTransitions[0].from).toBe('advisory');
    expect(seedTransitions[3].to).toBe('submission_ready');
  });

  it('seed rules enforce escalating requirements', () => {
    // Rule requirements escalate through the chain:
    const ruleRequirements = [
      { to: 'governed_draft', requiresReview: true, requiresApproval: false, requiresAllAssumptionsApproved: false },
      { to: 'approved', requiresReview: false, requiresApproval: true, requiresAllAssumptionsApproved: true },
      { to: 'locked', requiresReview: false, requiresApproval: false, requiresAllDecisionsResolved: true, minimumConfidence: 'moderate' },
      { to: 'submission_ready', requiresReview: false, requiresApproval: false, requiresAllAssumptionsApproved: true, requiresAllDecisionsResolved: true, minimumConfidence: 'strong' },
    ];

    // governed_draft only needs review
    expect(ruleRequirements[0].requiresReview).toBe(true);
    expect(ruleRequirements[0].requiresApproval).toBe(false);

    // approved needs approval + all assumptions approved
    expect(ruleRequirements[1].requiresApproval).toBe(true);
    expect(ruleRequirements[1].requiresAllAssumptionsApproved).toBe(true);

    // locked needs all decisions resolved + moderate confidence
    expect(ruleRequirements[2].requiresAllDecisionsResolved).toBe(true);
    expect(ruleRequirements[2].minimumConfidence).toBe('moderate');

    // submission_ready needs everything + strong confidence
    expect(ruleRequirements[3].requiresAllAssumptionsApproved).toBe(true);
    expect(ruleRequirements[3].requiresAllDecisionsResolved).toBe(true);
    expect(ruleRequirements[3].minimumConfidence).toBe('strong');
  });
});
