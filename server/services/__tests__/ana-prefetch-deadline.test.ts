import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sources = vi.hoisted(() => ({
  feedback: vi.fn(), profile: vi.fn(), rim: vi.fn(), relational: vi.fn(), external: vi.fn(),
  briefing: vi.fn(), deadline: vi.fn(), contradictions: vi.fn(),
}));
vi.mock('../ana-ri/orchestrator.js', async importOriginal => ({
  ...await importOriginal<typeof import('../ana-ri/orchestrator.js')>(),
  prefetchProjectIntelligence: sources.profile, preloadRIMContext: sources.rim,
}));
vi.mock('../intelligence/learning-loop-service.js', async importOriginal => ({
  ...await importOriginal<typeof import('../intelligence/learning-loop-service.js')>(),
  getFeedbackSummary: sources.feedback,
}));
vi.mock('../ana-ri/relational-profile-service.js', () => ({ loadRelationalOverlay: sources.relational }));
vi.mock('../external-intelligence/index.js', () => ({ buildExternalIntelBlock: sources.external }));
vi.mock('../ana/session-briefing.js', () => ({ getSessionBriefing: sources.briefing }));
vi.mock('../ana/deadline-radar.js', () => ({ getDeadlineRadar: sources.deadline, buildDeadlineRadarBlock: () => '' }));
vi.mock('../ana/contradiction-watch.js', () => ({ getOpenContradictionsForOrg: sources.contradictions, buildContradictionWatchBlock: () => '' }));
vi.mock('../decision-lifecycle-service.js', () => ({ decisionLifecycleService: { getDecisionContext: () => [] } }));

import { prefetchRouteIntelligenceContext } from '../ana-ri/chat-context-builder';

const INPUT = { organizationId: 7, projectId: 33, userId: 9, authoringContext: { sectionCode: '3.2' }, sessionStart: true };
const stalled = () => new Promise<never>(() => {});
beforeEach(() => {
  vi.useFakeTimers();
  for (const mock of Object.values(sources)) mock.mockReset();
  sources.feedback.mockResolvedValue({ totalFeedback: 0 });
  sources.profile.mockResolvedValue(null);
  sources.rim.mockResolvedValue('RIM context');
  sources.relational.mockResolvedValue('Relational context');
  sources.external.mockResolvedValue('External context');
  sources.briefing.mockResolvedValue({ block: 'Briefing context' });
  sources.deadline.mockResolvedValue({});
  sources.contradictions.mockResolvedValue([]);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('optional route prefetch deadlines', () => {
  it.each(['feedback', 'profile', 'rim', 'relational', 'external'] as const)('bounds a stalled %s source and keeps healthy context', async source => {
    sources[source].mockImplementation(stalled);
    const settled = vi.fn();
    const pending = prefetchRouteIntelligenceContext(INPUT).then(settled);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    const result = settled.mock.calls[0][0];
    expect(result.unavailableSources).toHaveLength(1);
    expect(result.contextAvailabilityBlock).toContain('Do not infer that missing context');
    expect(result.sessionBriefingBlock).toBe('Briefing context');
    if (source !== 'external') expect(result.externalIntelBlock).toBe('External context');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts independent reads together and uses one 3s wait when several stall', async () => {
    sources.feedback.mockImplementation(stalled);
    sources.profile.mockImplementation(stalled);
    sources.external.mockImplementation(stalled);
    const settled = vi.fn();
    const pending = prefetchRouteIntelligenceContext(INPUT).then(settled);
    await vi.advanceTimersByTimeAsync(0);
    expect(sources.profile).toHaveBeenCalledWith(33, 7);
    expect(sources.feedback).toHaveBeenCalledWith(33, 7);
    expect(sources.external).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(settled).toHaveBeenCalledTimes(1);
    await pending;
    expect(settled.mock.calls[0][0].unavailableSources).toHaveLength(3);
  });

  it('does not report healthy empty results as unavailable and clears the deadline timers', async () => {
    const result = await prefetchRouteIntelligenceContext(INPUT);
    expect(result.unavailableSources).toEqual([]);
    expect(result.contextAvailabilityBlock).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports rejection and the existing 1.5s proactive deadline without blocking other context', async () => {
    sources.profile.mockRejectedValue(new Error('query failed'));
    sources.briefing.mockImplementation(stalled);
    const settled = vi.fn();
    const pending = prefetchRouteIntelligenceContext(INPUT).then(settled);
    await vi.advanceTimersByTimeAsync(1_500);
    await pending;
    expect(settled.mock.calls[0][0].unavailableSources).toEqual(expect.arrayContaining(['project intelligence', 'session briefing']));
  });

  it('ignores a late source after the turn has received its bounded snapshot', async () => {
    let resolve!: (value: string) => void;
    sources.relational.mockReturnValue(new Promise<string>(r => { resolve = r; }));
    const pending = prefetchRouteIntelligenceContext(INPUT);
    await vi.advanceTimersByTimeAsync(3_000);
    const result = await pending;
    resolve('Late preferences');
    await vi.advanceTimersByTimeAsync(0);
    expect(result.relationalOverlay).toBe('');
    expect(result.unavailableSources).toEqual(['conversation preferences']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start project or org reads when their scope is absent', async () => {
    const result = await prefetchRouteIntelligenceContext({});
    expect(sources.feedback).not.toHaveBeenCalled();
    expect(sources.profile).not.toHaveBeenCalled();
    expect(sources.rim).not.toHaveBeenCalled();
    expect(sources.briefing).not.toHaveBeenCalled();
    expect(sources.contradictions).not.toHaveBeenCalled();
    expect(result.unavailableSources).toEqual([]);
  });
});
