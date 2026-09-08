import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

import deviceCockpitRoutes from '../../server/routes/device-cockpit';

function getHandler(path: string) {
  const layer = (deviceCockpitRoutes as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.post,
  );
  if (!layer) throw new Error(`Missing route POST ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

// Every leaf is `substantive: true`, which is what makes this fixture live up to
// its name. Readiness now counts only leaves carrying real, finalized content: a
// section that merely EXISTS — still in draft, or holding a "TBD" placeholder —
// is built substantive:false and does not count toward completeness. Without the
// flag these seven read as seven missing sections and the cockpit correctly
// declined to recommend any pathway at all.
const k510Complete = [
  { sectionCode: '1', title: 'Cover letter', substantive: true },
  { sectionCode: '2', title: 'Indications for use', substantive: true },
  { sectionCode: '3', title: 'Device description', substantive: true },
  { sectionCode: '4', title: 'Proposed labeling and instructions for use', substantive: true },
  { sectionCode: '5', title: 'Biocompatibility evaluation', substantive: true },
  { sectionCode: '6', title: 'Performance testing — bench', substantive: true },
  { sectionCode: '7', title: 'Substantial equivalence comparison to predicate', substantive: true },
];

describe('POST /api/device-cockpit/assess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a cross-pathway assessment for an authenticated tenant', async () => {
    const req = createMockRequest({ body: { leaves: k510Complete, variant: 'device' } }) as any;
    req.user = { organizationId: 2 };
    const res = createMockResponse() as any;

    await getHandler('/assess')(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          variant: 'device',
          recommendedPathway: '510k',
        }),
      }),
    );
  });

  it('rejects when tenant context is missing (403)', async () => {
    const req = createMockRequest({ body: { leaves: [], variant: 'device' } }) as any;
    // no req.user → authedOrgId returns null
    const res = createMockResponse() as any;

    await getHandler('/assess')(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects an invalid body (400)', async () => {
    const req = createMockRequest({ body: { variant: 'not-a-variant' } }) as any;
    req.user = { organizationId: 2 };
    const res = createMockResponse() as any;

    await getHandler('/assess')(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});
