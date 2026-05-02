/**
 * MDX context resolver tests — block composition + degrade-on-failure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { signalsMock, milestoneMock } = vi.hoisted(() => ({
  signalsMock: vi.fn(),
  milestoneMock: vi.fn(),
}));

vi.mock('../mdx-proactive-signals', () => ({
  buildMdxProactiveSnapshot: (...a: any[]) => signalsMock(...a),
}));

vi.mock('../mdx-onboarding-milestone', () => ({
  getMdxOnboardingMilestone: (...a: any[]) => milestoneMock(...a),
}));

import { buildMdxContextBlock } from '../mdx-context-resolver';

const fakeClient = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildMdxContextBlock', () => {
  it('renders the active surface block when activeNav matches', async () => {
    signalsMock.mockResolvedValue({ alerts: [], generatedAt: '', organizationId: 1 });
    milestoneMock.mockResolvedValue({
      id: 'authoring',
      label: 'eSTAR authoring is the active work.',
      nextStep: 'Author §6.',
      workflowId: 'W2',
      signals: {
        programs: 1,
        programsWithPrimaryPredicate: 1,
        programsWithDraftingSections: 5,
        programsWithApprovedSections: 0,
        qSubsInFlight: 0,
        transmittedPackages: 0,
      },
    });

    const result = await buildMdxContextBlock(fakeClient, {
      organizationId: 1,
      activeNav: 'pre-sub',
      activeProgramCode: 'OR-801',
    });

    expect(result.systemPromptBlock).toContain('Active surface: Pre-Sub manager');
    expect(result.systemPromptBlock).toContain('Onboarding milestone: eSTAR authoring');
    expect(result.systemPromptBlock).toContain('Active program: **OR-801**');
    expect(result.systemPromptBlock).toContain('Governed-mutation contract');
    expect(result.payload.surface?.key).toBe('pre-sub');
  });

  it('renders without a surface when activeNav is unknown', async () => {
    signalsMock.mockResolvedValue({ alerts: [], generatedAt: '', organizationId: 1 });
    milestoneMock.mockResolvedValue(null);

    const result = await buildMdxContextBlock(fakeClient, {
      organizationId: 1,
      activeNav: 'gibberish',
    });

    expect(result.systemPromptBlock).toContain('Active surface: (unknown)');
    expect(result.payload.surface).toBeNull();
  });

  it('surfaces critical alerts in the block', async () => {
    signalsMock.mockResolvedValue({
      organizationId: 1,
      generatedAt: '',
      alerts: [
        {
          id: 'q-sub-deadline:q-1',
          kind: 'q_sub.target_date_approaching',
          severity: 'critical',
          organizationId: 1,
          message: 'Q251142 target date is in 2 days; current stage is "await".',
          detail: {},
        },
        {
          id: 'commitment-blocker:c-1',
          kind: 'q_sub.commitment_blocker_open',
          severity: 'warn',
          organizationId: 1,
          message: 'Open blocker commitment cm-1.',
          detail: {},
        },
      ],
    });
    milestoneMock.mockResolvedValue({
      id: 'authoring',
      label: 'authoring',
      nextStep: 'x',
      signals: {
        programs: 1, programsWithPrimaryPredicate: 1,
        programsWithDraftingSections: 0, programsWithApprovedSections: 0,
        qSubsInFlight: 0, transmittedPackages: 0,
      },
    });

    const result = await buildMdxContextBlock(fakeClient, {
      organizationId: 1,
      activeNav: 'pre-sub',
    });

    expect(result.systemPromptBlock).toContain('Proactive alerts (2)');
    expect(result.systemPromptBlock).toContain('!! **q_sub.target_date_approaching**');
    expect(result.systemPromptBlock).toContain('! **q_sub.commitment_blocker_open**');
    // Critical first (sort by severity).
    expect(result.payload.alerts[0].severity).toBe('critical');
  });

  it('truncates beyond 12 alerts', async () => {
    signalsMock.mockResolvedValue({
      organizationId: 1,
      generatedAt: '',
      alerts: Array.from({ length: 20 }, (_, i) => ({
        id: `a-${i}`,
        kind: 'estar.section_stale' as const,
        severity: 'info' as const,
        organizationId: 1,
        message: `stale section ${i}`,
        detail: {},
      })),
    });
    milestoneMock.mockResolvedValue(null);
    const result = await buildMdxContextBlock(fakeClient, {
      organizationId: 1,
      activeNav: 'estar-editor',
    });
    expect(result.systemPromptBlock).toContain('and 8 more');
  });

  it('skips proactive snapshot when includeProactive=false', async () => {
    milestoneMock.mockResolvedValue(null);
    const result = await buildMdxContextBlock(fakeClient, {
      organizationId: 1,
      activeNav: 'pre-sub',
      includeProactive: false,
    });
    expect(signalsMock).not.toHaveBeenCalled();
    expect(result.payload.alerts).toEqual([]);
  });

  it('degrades gracefully when both downstreams throw', async () => {
    signalsMock.mockRejectedValue(new Error('db down'));
    milestoneMock.mockRejectedValue(new Error('db down'));
    const result = await buildMdxContextBlock(fakeClient, {
      organizationId: 1,
      activeNav: 'pre-sub',
    });
    expect(result.systemPromptBlock).toContain('Active surface: Pre-Sub manager');
    expect(result.systemPromptBlock).toContain('Governed-mutation contract');
    // No milestone / alerts blocks rendered.
    expect(result.systemPromptBlock).not.toContain('Onboarding milestone');
    expect(result.systemPromptBlock).not.toContain('Proactive alerts');
    expect(result.payload.milestone).toBeNull();
    expect(result.payload.alerts).toEqual([]);
  });
});
