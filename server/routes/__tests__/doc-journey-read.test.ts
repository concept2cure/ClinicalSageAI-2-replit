/**
 * GET /api/doc-journey — the converged document-journey read for the v2 surface.
 *
 * The route is thin: guard the org, delegate to the real-store assembler, and shape the
 * envelope. It reads ONLY the real authoring loop (authoring_documents + doc_revisions +
 * authoring_comments + frozen_documents) via assembleOrgDocJourney — no legacy/seed blob
 * (c2c_doc_journeys is deprecated) and no fallback — so an org that has authored nothing
 * gets an honest empty list. (The full mapping is proven against real SQL in
 * doc-journey-view-assembler.pglite.integration.test.ts.)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const assembleOrgDocJourney = vi.fn();
vi.mock('../../services/authoring/doc-journey-view-assembler', () => ({
  assembleOrgDocJourney: (...a: unknown[]) => assembleOrgDocJourney(...a),
}));

import docJourneyRouter from '../doc-journey.routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/doc-journey', docJourneyRouter);
  return app;
}

// Braces matter: mockReset() returns the mock (a function), and a function
// returned from beforeEach is treated as a cleanup callback — vitest would then
// CALL the mock after each test, and a sticky rejecting implementation would
// blow up that phantom call and fail the test from the hook.
beforeEach(() => { assembleOrgDocJourney.mockReset(); });

describe('GET /api/doc-journey', () => {
  it('403 without org context, and never touches the store', async () => {
    const res = await request(appWith(null)).get('/api/doc-journey');
    expect(res.status).toBe(403);
    expect(assembleOrgDocJourney).not.toHaveBeenCalled();
  });

  it('returns the real-store stages for the acting org, source = authoring_documents', async () => {
    assembleOrgDocJourney.mockResolvedValue([
      {
        id: 'created', label: 'Created', ic: 'sparkles', when: 'Jul 2', who: 'Dana Okafor',
        ver: '1.0', done: true, active: false, sub: 'Draft started · M2', kind: 'brief',
        snap: { mode: 'brief', title: 'Document', lines: [['Document', 'Clinical Overview (CTD Module 2.5)']] },
      },
      {
        id: 'frozen', label: 'Frozen · immutable', ic: 'shieldCheck', when: 'Jul 23', who: 'dana@example.com',
        ver: '1.0', done: true, active: false, sub: 'SHA-256 abcdef012345…', kind: 'freeze',
        snap: { mode: 'assemble', heading: 'Immutable freeze', lines: [], note: 'Part 11 snapshot' },
      },
    ]);
    const res = await request(appWith(7)).get('/api/doc-journey');
    expect(res.status).toBe(200);
    expect(assembleOrgDocJourney).toHaveBeenCalledWith(7);
    expect(res.body.meta.source).toBe('authoring_documents');
    const first = res.body.data[0];
    for (const k of ['id', 'label', 'ic', 'when', 'who', 'ver', 'done', 'active', 'sub', 'kind', 'snap']) {
      expect(first).toHaveProperty(k);
    }
    expect(first.when).toBe('Jul 2');
    expect(first.snap.mode).toBe('brief');
    expect(res.body.meta.count).toBe(2);
  });

  it('honest empty list when the org has authored nothing — no fallback data', async () => {
    assembleOrgDocJourney.mockResolvedValue([]);
    const res = await request(appWith(7)).get('/api/doc-journey');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.count).toBe(0);
  });

  it('fails closed to an empty list when the store is not provisioned (42P01)', async () => {
    assembleOrgDocJourney.mockRejectedValue(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/doc-journey');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });
});
