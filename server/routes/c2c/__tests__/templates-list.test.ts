/**
 * GET /api/c2c/templates — list envelope contract.
 *
 * The v2 template-library surface adopts this list via useLiveList, which
 * unwraps a bare array or a `{ data }` envelope. This locks that the list
 * returns `{ data: [...] }` and that each row carries `docTypes` (the field the
 * surface renders as document-type chips), plus the 401-without-org guard.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const listTemplates = vi.fn();
// Stub the whole service module; the list route only needs listTemplates.
vi.mock('../../../services/templates', () => ({
  listTemplates: (...a: unknown[]) => listTemplates(...a),
  extractTemplateFromFile: vi.fn(),
  renderDocxWithTemplate: vi.fn(),
  templateSpecToHtml: vi.fn(),
  normalizeTemplateSpec: (s: unknown) => s,
  createTemplate: vi.fn(),
  getTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  deactivateTemplate: vi.fn(),
}));

import templatesRouter from '../templates';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    next();
  });
  app.use('/api/c2c/templates', templatesRouter);
  return app;
}

beforeEach(() => listTemplates.mockReset());

describe('GET /api/c2c/templates', () => {
  it('401 without org context', async () => {
    const res = await request(appWith(null)).get('/api/c2c/templates');
    expect(res.status).toBe(401);
  });

  it('returns a { data } envelope whose rows carry docTypes', async () => {
    listTemplates.mockResolvedValueOnce([
      { id: 'tpl_house_ctd', name: 'House CTD', docTypes: ['CTD', 'NDA'], verified: true, spec: {} },
    ]);
    const res = await request(appWith(7)).get('/api/c2c/templates');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].docTypes).toEqual(['CTD', 'NDA']);
    expect(res.body.meta.count).toBe(1);
    expect(listTemplates).toHaveBeenCalledWith(7, { projectId: undefined });
  });
});
