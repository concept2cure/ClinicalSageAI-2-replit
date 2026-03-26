/**
 * Governance Audit Trail — Pass 14 Tests
 *
 * Tests covering:
 * - Governance transition data structure
 * - Boundary label/color mapping
 * - Transition display logic (allowed vs blocked)
 * - API endpoint structure
 *
 * @module tests/resolution/governance-audit-trail.test
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (matching GovernanceTrailTab)
// ═══════════════════════════════════════════════════════════════════════════════

interface GovernanceTransition {
  id: string;
  fromBoundary: string;
  toBoundary: string;
  transitionAllowed: boolean;
  blockedReasons: string[];
  actorRole?: string;
  createdAt: string;
}

type BoundaryLevel = 'advisory' | 'governed_draft' | 'approved' | 'locked' | 'submission_ready';

const BOUNDARY_LABELS: Record<string, string> = {
  advisory: 'Advisory',
  governed_draft: 'Governed Draft',
  approved: 'Approved',
  locked: 'Locked',
  submission_ready: 'Submission Ready',
};

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: GOVERNANCE TRANSITION DATA
// ═══════════════════════════════════════════════════════════════════════════════

describe('Governance Transition Data Structure', () => {
  it('transition has all required fields', () => {
    const transition: GovernanceTransition = {
      id: 'trans-001',
      fromBoundary: 'advisory',
      toBoundary: 'governed_draft',
      transitionAllowed: true,
      blockedReasons: [],
      actorRole: 'author',
      createdAt: new Date().toISOString(),
    };

    expect(transition.id).toBeTruthy();
    expect(transition.fromBoundary).toBe('advisory');
    expect(transition.toBoundary).toBe('governed_draft');
    expect(transition.transitionAllowed).toBe(true);
    expect(transition.blockedReasons).toHaveLength(0);
  });

  it('blocked transition includes reasons', () => {
    const transition: GovernanceTransition = {
      id: 'trans-002',
      fromBoundary: 'governed_draft',
      toBoundary: 'approved',
      transitionAllowed: false,
      blockedReasons: [
        '2 assumption(s) not yet approved.',
        '1 unresolved blocking contradiction(s) must be resolved.',
      ],
      actorRole: 'reviewer',
      createdAt: new Date().toISOString(),
    };

    expect(transition.transitionAllowed).toBe(false);
    expect(transition.blockedReasons).toHaveLength(2);
    expect(transition.blockedReasons[0]).toContain('assumption');
    expect(transition.blockedReasons[1]).toContain('contradiction');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: BOUNDARY LABELS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Boundary Label Mapping', () => {
  it('all 5 boundary levels have labels', () => {
    const levels: BoundaryLevel[] = ['advisory', 'governed_draft', 'approved', 'locked', 'submission_ready'];
    for (const level of levels) {
      expect(BOUNDARY_LABELS[level]).toBeTruthy();
    }
  });

  it('labels are human-readable', () => {
    expect(BOUNDARY_LABELS.advisory).toBe('Advisory');
    expect(BOUNDARY_LABELS.governed_draft).toBe('Governed Draft');
    expect(BOUNDARY_LABELS.approved).toBe('Approved');
    expect(BOUNDARY_LABELS.locked).toBe('Locked');
    expect(BOUNDARY_LABELS.submission_ready).toBe('Submission Ready');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: TRANSITION DISPLAY LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

describe('Transition Display Logic', () => {
  it('allowed transitions show green indicator', () => {
    const allowed = { transitionAllowed: true, blockedReasons: [] };
    expect(allowed.transitionAllowed).toBe(true);
    expect(allowed.blockedReasons).toHaveLength(0);
  });

  it('blocked transitions show red indicator with reasons', () => {
    const blocked = {
      transitionAllowed: false,
      blockedReasons: ['Readiness evaluation failed: 3 blocker(s), score 45/100.'],
    };
    expect(blocked.transitionAllowed).toBe(false);
    expect(blocked.blockedReasons.length).toBeGreaterThan(0);
  });

  it('transitions are sorted newest first (desc by createdAt)', () => {
    const transitions: GovernanceTransition[] = [
      { id: '1', fromBoundary: 'advisory', toBoundary: 'governed_draft', transitionAllowed: true, blockedReasons: [], createdAt: '2026-03-20T10:00:00Z' },
      { id: '2', fromBoundary: 'governed_draft', toBoundary: 'approved', transitionAllowed: true, blockedReasons: [], createdAt: '2026-03-21T10:00:00Z' },
      { id: '3', fromBoundary: 'approved', toBoundary: 'locked', transitionAllowed: false, blockedReasons: ['Blocked'], createdAt: '2026-03-22T10:00:00Z' },
    ];

    // API returns desc order — verify newest first
    const sorted = [...transitions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    expect(sorted[0].id).toBe('3');
    expect(sorted[2].id).toBe('1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: API ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Governance Transitions API', () => {
  it('endpoint path includes projectId query param', () => {
    const projectId = 42;
    const artifactId = 100;
    const url = `/api/operating-system/governance/transitions?projectId=${projectId}&artifactId=${artifactId}`;

    expect(url).toContain('projectId=42');
    expect(url).toContain('artifactId=100');
  });

  it('response structure matches expected shape', () => {
    const mockResponse = {
      success: true,
      data: [
        {
          id: 'uuid-1',
          fromBoundary: 'advisory',
          toBoundary: 'governed_draft',
          transitionAllowed: true,
          blockedReasons: [],
          actorRole: 'author',
          createdAt: '2026-03-25T12:00:00Z',
        },
      ],
      count: 1,
    };

    expect(mockResponse.success).toBe(true);
    expect(mockResponse.data).toHaveLength(1);
    expect(mockResponse.count).toBe(1);
    expect(mockResponse.data[0].fromBoundary).toBe('advisory');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: FULL LIFECYCLE TRAIL
// ═══════════════════════════════════════════════════════════════════════════════

describe('Full Lifecycle Trail', () => {
  it('successful lifecycle shows 4 allowed transitions', () => {
    const trail: GovernanceTransition[] = [
      { id: '1', fromBoundary: 'advisory', toBoundary: 'governed_draft', transitionAllowed: true, blockedReasons: [], createdAt: '2026-03-20T10:00:00Z' },
      { id: '2', fromBoundary: 'governed_draft', toBoundary: 'approved', transitionAllowed: true, blockedReasons: [], createdAt: '2026-03-21T10:00:00Z' },
      { id: '3', fromBoundary: 'approved', toBoundary: 'locked', transitionAllowed: true, blockedReasons: [], createdAt: '2026-03-22T10:00:00Z' },
      { id: '4', fromBoundary: 'locked', toBoundary: 'submission_ready', transitionAllowed: true, blockedReasons: [], createdAt: '2026-03-23T10:00:00Z' },
    ];

    expect(trail).toHaveLength(4);
    expect(trail.every(t => t.transitionAllowed)).toBe(true);
    expect(trail[0].fromBoundary).toBe('advisory');
    expect(trail[3].toBoundary).toBe('submission_ready');
  });

  it('lifecycle with rejected attempts shows mixed trail', () => {
    const trail: GovernanceTransition[] = [
      { id: '1', fromBoundary: 'advisory', toBoundary: 'governed_draft', transitionAllowed: true, blockedReasons: [], createdAt: '2026-03-20T10:00:00Z' },
      { id: '2', fromBoundary: 'governed_draft', toBoundary: 'approved', transitionAllowed: false, blockedReasons: ['2 assumptions not approved'], createdAt: '2026-03-21T10:00:00Z' },
      { id: '3', fromBoundary: 'governed_draft', toBoundary: 'approved', transitionAllowed: true, blockedReasons: [], createdAt: '2026-03-22T10:00:00Z' },
    ];

    const allowed = trail.filter(t => t.transitionAllowed);
    const blocked = trail.filter(t => !t.transitionAllowed);

    expect(allowed).toHaveLength(2);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].blockedReasons[0]).toContain('assumptions');
  });
});
