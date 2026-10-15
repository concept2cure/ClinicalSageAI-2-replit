/**
 * GET /api/ind-generation/status and /device-status: a section with an
 * artifact is DRAFTED; it is complete only once approved or locked.
 *
 * Until 2026-10-15 both answered `completedSections` = every section whose
 * status was anything but 'not_started', so a project of unapproved drafts
 * read fully "completed", and /status's modules[...].completion was the share
 * of ALL sections with an artifact at any status (audit report_ind_ivd_irb
 * finding 29).
 *
 * The router is real; global fetch stands in for the server's own artifact
 * route, answering as that route does (as in ind-generation-fail-closed.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response as ExpressResponse } from 'express';
import request from 'supertest';

const { route } = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock('../../services/ai-gateway/index.js', () => ({ getGateway: () => ({ route }) }));

import router from '../ind-generation';
import { IND_SECTIONS } from '../../services/ind/ind-section-registry';

const TOKEN = 'Bearer caller-token-7-41';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: ExpressResponse, next: NextFunction) => {
    (req as unknown as { user: Record<string, unknown> }).user = { id: 41, userId: 41, organizationId: 7, role: 'user' };
    next();
  });
  a.use('/api/ind-generation', router);
  return a;
}

const fetchMock = vi.fn(async (_url?: unknown, _init?: unknown): Promise<Response> => {
  throw new Error('fetch not scripted');
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('GET /status', () => {
  it('a project whose every section is an unapproved draft is drafted, with nothing complete', async () => {
    fetchMock.mockResolvedValue(
      json(200, { success: true, data: IND_SECTIONS.map((s, i) => ({ id: `a${i}`, ctdSection: s.code, status: 'draft' })) }),
    );
    const r = await request(app()).get('/api/ind-generation/status/3').set('Authorization', TOKEN);
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.completedSections, 'a draft was counted as a completed section').toBeUndefined();
    expect(d.draftedSections).toBe(IND_SECTIONS.length);
    expect(d.approvedSections).toBe(0);
    expect(d.requiredSections).toBe(IND_SECTIONS.filter((s) => s.required).length);
    expect(d.requiredApprovedSections).toBe(0);
    for (const [name, m] of Object.entries(d.modules as Record<string, { completion: number | null }>)) {
      expect(m.completion, `${name} read complete from drafts`).toBe(0);
    }
  });

  it('counts a required section complete only when its artifact is approved or locked', async () => {
    const required = IND_SECTIONS.filter((s) => s.required);
    fetchMock.mockResolvedValue(
      json(200, {
        success: true,
        data: [
          { id: 'a1', ctdSection: required[0].code, status: 'approved' },
          { id: 'a2', ctdSection: required[1].code, status: 'locked' },
          { id: 'a3', ctdSection: required[2].code, status: 'in_review' },
        ],
      }),
    );
    const r = await request(app()).get('/api/ind-generation/status/3').set('Authorization', TOKEN);
    expect(r.status).toBe(200);
    expect(r.body.data.draftedSections).toBe(3);
    expect(r.body.data.approvedSections).toBe(2);
    expect(r.body.data.requiredApprovedSections).toBe(2);
  });
});

describe('GET /device-status', () => {
  it('reports a draft-only project as drafted, not completed', async () => {
    fetchMock.mockResolvedValue(json(200, { success: true, data: [] }));
    const empty = await request(app()).get('/api/ind-generation/device-status/IVDR/3').set('Authorization', TOKEN);
    expect(empty.status).toBe(200);
    const codes: string[] = empty.body.data.sections.map((s: { code: string }) => s.code);
    expect(codes.length).toBeGreaterThan(1); // precondition

    fetchMock.mockResolvedValue(
      json(200, { success: true, data: codes.map((code, i) => ({ id: `d${i}`, ctdSection: code, status: 'draft' })) }),
    );
    const r = await request(app()).get('/api/ind-generation/device-status/IVDR/3').set('Authorization', TOKEN);
    expect(r.status).toBe(200);
    expect(r.body.data.completedSections, 'a draft was counted as a completed section').toBeUndefined();
    expect(r.body.data.draftedSections).toBe(codes.length);
    expect(r.body.data.approvedSections).toBe(0);
    expect(r.body.data.requiredApprovedSections).toBe(0);
  });
});
