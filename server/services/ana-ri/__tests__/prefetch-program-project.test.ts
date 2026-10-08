/**
 * AnA's per-turn prefetch reads the project a PROGRAM is anchored to, never NaN.
 *
 * QA 2026-10-08 (j5, "AnA's relational overlay fails silently on every project
 * turn (program UUID coerced to NaN)"): the composer names the open project by
 * its regulatory_programs UUID. prefetchRouteIntelligenceContext converted it
 * with Number(projectId) — NaN — and handed that to loadRelationalOverlay
 * outside the isFinite guard the other project reads had, so every turn logged
 * `invalid input syntax for type integer: "NaN"` and AnA got no relational
 * notes. The session briefing took the same NaN.
 *
 * The id is now resolved once through the one project-ref resolver
 * (services/c2c/project-ref.ts): an integer is itself, a program UUID is its
 * anchored projects row, anything else is no project.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  feedback: vi.fn(), profile: vi.fn(), rim: vi.fn(), relational: vi.fn(), external: vi.fn(),
  briefing: vi.fn(), deadline: vi.fn(), contradictions: vi.fn(), ref: vi.fn(),
}));
vi.mock('../orchestrator.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../orchestrator.js')>()),
  prefetchProjectIntelligence: h.profile, preloadRIMContext: h.rim,
}));
vi.mock('../../intelligence/learning-loop-service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../intelligence/learning-loop-service.js')>()),
  getFeedbackSummary: h.feedback,
}));
vi.mock('../relational-profile-service.js', () => ({ loadRelationalOverlay: h.relational }));
vi.mock('../../external-intelligence/index.js', () => ({ buildExternalIntelBlock: h.external }));
vi.mock('../../ana/session-briefing.js', () => ({ getSessionBriefing: h.briefing }));
vi.mock('../../ana/deadline-radar.js', () => ({ getDeadlineRadar: h.deadline, buildDeadlineRadarBlock: () => '' }));
vi.mock('../../ana/contradiction-watch.js', () => ({ getOpenContradictionsForOrg: h.contradictions, buildContradictionWatchBlock: () => '' }));
vi.mock('../../decision-lifecycle-service.js', () => ({ decisionLifecycleService: { getDecisionContext: () => [] } }));
vi.mock('../../c2c/project-ref.js', () => ({ integerProjectForRef: h.ref }));

import { prefetchRouteIntelligenceContext } from '../chat-context-builder';

const PROGRAM = '099991d1-dac8-43c5-b88a-8baab26194ee';

beforeEach(() => {
  for (const m of Object.values(h)) m.mockReset();
  h.feedback.mockResolvedValue({ totalFeedback: 0 });
  h.profile.mockResolvedValue(null);
  h.rim.mockResolvedValue('');
  h.relational.mockResolvedValue('Relational notes');
  h.external.mockResolvedValue('');
  h.briefing.mockResolvedValue({ block: 'Briefing' });
  h.deadline.mockResolvedValue({});
  h.contradictions.mockResolvedValue([]);
});

const anyNaN = (calls: unknown[][]) => JSON.stringify(calls.map((c) => c.map((a) => (typeof a === 'number' && Number.isNaN(a) ? 'NaN!' : a)))).includes('NaN!');

describe('prefetch — program UUID → anchored project', () => {
  it('reads the relational overlay, briefing and project context for the anchored project', async () => {
    h.ref.mockResolvedValue(11);
    const result = await prefetchRouteIntelligenceContext({ projectId: PROGRAM, organizationId: 1, userId: 9, sessionStart: true });

    expect(h.ref).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ ref: PROGRAM, orgId: 1 }));
    expect(h.relational).toHaveBeenCalledWith({ organizationId: 1, userId: 9, projectId: 11 });
    expect(h.briefing).toHaveBeenCalledWith({ organizationId: 1, projectId: 11 });
    expect(h.feedback).toHaveBeenCalledWith(11, 1);
    expect(h.profile).toHaveBeenCalledWith(11, 1);
    expect(result.relationalOverlay).toBe('Relational notes');
  });

  it('an unanchored program is no project: no NaN reaches any read, and nothing is reported missing', async () => {
    h.ref.mockResolvedValue(null);
    const result = await prefetchRouteIntelligenceContext({ projectId: PROGRAM, organizationId: 1, userId: 9, sessionStart: true });

    expect(h.relational).toHaveBeenCalledWith({ organizationId: 1, userId: 9, projectId: null });
    expect(h.briefing).toHaveBeenCalledWith({ organizationId: 1, projectId: null });
    expect(h.feedback).not.toHaveBeenCalled();
    expect(h.profile).not.toHaveBeenCalled();
    for (const m of [h.relational, h.briefing, h.feedback, h.profile, h.rim]) expect(anyNaN(m.mock.calls)).toBe(false);
    expect(result.unavailableSources).toEqual([]);
  });

  it('an integer project id is still itself', async () => {
    h.ref.mockResolvedValue(33);
    await prefetchRouteIntelligenceContext({ projectId: 33, organizationId: 1, userId: 9 });
    expect(h.relational).toHaveBeenCalledWith({ organizationId: 1, userId: 9, projectId: 33 });
    expect(h.profile).toHaveBeenCalledWith(33, 1);
  });

  it('no project named: the resolver is not asked and the overlay is user-level', async () => {
    await prefetchRouteIntelligenceContext({ projectId: null, organizationId: 1, userId: 9 });
    expect(h.ref).not.toHaveBeenCalled();
    expect(h.relational).toHaveBeenCalledWith({ organizationId: 1, userId: 9, projectId: null });
  });
});
