/**
 * The route prefetch and the relational overlay read the project the person is
 * in (ana-14, 2026-10-08).
 *
 * prefetchRouteIntelligenceContext took Number(projectId): NaN for the program
 * UUID the v2 app sends. The project feedback, profile and regulatory snapshot
 * reads were skipped, and the relational overlay and session briefing were sent
 * NaN; the overlay's read failed whole, the person's own notes included
 * (server.log:11715). The stream route now resolves the integer projects.id
 * once and passes it (projectIdNumber); without it, only an integer names a
 * project, and a UUID is no project rather than NaN.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  feedback: vi.fn(), profile: vi.fn(), rim: vi.fn(), relational: vi.fn(), external: vi.fn(),
  briefing: vi.fn(), deadline: vi.fn(), contradictions: vi.fn(), query: vi.fn(),
}));
vi.mock('../../../db.js', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../../../db', () => ({ pool: { query: h.query }, getPool: () => ({ query: h.query }), db: { query: h.query } }));
vi.mock('../orchestrator.js', async importOriginal => ({
  ...await importOriginal<typeof import('../orchestrator.js')>(),
  prefetchProjectIntelligence: h.profile, preloadRIMContext: h.rim,
}));
vi.mock('../../intelligence/learning-loop-service.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../intelligence/learning-loop-service.js')>(),
  getFeedbackSummary: h.feedback,
}));
vi.mock('../relational-profile-service.js', () => ({ loadRelationalOverlay: h.relational }));
vi.mock('../../external-intelligence/index.js', () => ({ buildExternalIntelBlock: h.external }));
vi.mock('../../ana/session-briefing.js', () => ({ getSessionBriefing: h.briefing }));
vi.mock('../../ana/deadline-radar.js', () => ({ getDeadlineRadar: h.deadline, buildDeadlineRadarBlock: () => '' }));
vi.mock('../../ana/contradiction-watch.js', () => ({ getOpenContradictionsForOrg: h.contradictions, buildContradictionWatchBlock: () => '' }));
vi.mock('../../decision-lifecycle-service.js', () => ({ decisionLifecycleService: { getDecisionContext: () => [] } }));

import { prefetchRouteIntelligenceContext } from '../chat-context-builder';

const PROGRAM = 'd6160c9f-33d2-4be9-b779-eb27375f6e49';
const INPUT = { organizationId: 7, projectId: PROGRAM, userId: 9, authoringContext: { sectionCode: '3.2' }, sessionStart: true };

beforeEach(() => {
  for (const mock of Object.values(h)) mock.mockReset();
  h.query.mockResolvedValue({ rows: [] });
  h.feedback.mockResolvedValue({ totalFeedback: 0 });
  h.profile.mockResolvedValue({ regulatoryStrategy: 'Retain stability arm' });
  h.rim.mockResolvedValue('RIM context');
  h.relational.mockResolvedValue('Relational context');
  h.external.mockResolvedValue('');
  h.briefing.mockResolvedValue({ block: '' });
  h.deadline.mockResolvedValue({});
  h.contradictions.mockResolvedValue([]);
});

describe('route prefetch with a program UUID', () => {
  it('reads the project the route resolved: profile, feedback, snapshot, overlay and briefing get 42', async () => {
    const result = await prefetchRouteIntelligenceContext({ ...INPUT, projectIdNumber: 42 });

    expect(result.projectIdNumber).toBe(42);
    expect(h.profile).toHaveBeenCalledWith(42, 7);
    expect(h.feedback).toHaveBeenCalledWith(42, 7);
    expect(h.rim).toHaveBeenCalledWith('42', 7);
    expect(h.relational).toHaveBeenCalledWith(expect.objectContaining({ projectId: 42 }));
    expect(h.briefing).toHaveBeenCalledWith(expect.objectContaining({ projectId: 42 }));
    expect(result.projectProfile).toEqual({ regulatoryStrategy: 'Retain stability arm' });
    expect(result.unavailableSources).toEqual([]);
    // The orchestrator still names the project as the person did.
    expect(result.orchestratorAuthoringContext?.projectId).toBe(PROGRAM);
  });

  it.each([null, undefined])('with no project id resolved (%s), a UUID is no project: never NaN', async projectIdNumber => {
    const result = await prefetchRouteIntelligenceContext({ ...INPUT, projectIdNumber });

    expect(result.projectIdNumber).toBeNull();
    expect(h.profile).not.toHaveBeenCalled();
    expect(h.relational).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }));
    expect(h.briefing).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }));
    expect(result.unavailableSources).toEqual([]);
  });

  it('an integer project id still names its project without the route resolving it', async () => {
    const result = await prefetchRouteIntelligenceContext({ ...INPUT, projectId: 'proj_33' });
    expect(result.projectIdNumber).toBe(33);
    expect(h.profile).toHaveBeenCalledWith(33, 7);
  });
});
