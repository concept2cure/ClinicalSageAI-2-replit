/** Real vendored templates/parser and mounted router; authentication and the
 * template inventory failure cases are explicit seams, with no program data. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({ templates: vi.fn(), query: vi.fn() }));
vi.mock('../../db', () => ({ db: {}, pool: { query: h.query } }));
vi.mock('../../auth', () => ({ authMiddleware: (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.headers.authorization) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  Object.assign(req, { user: { id: 3, organizationId: 7, role: 'admin' } }); next();
} }));
vi.mock('../../export/renderers', () => ({ renderPdfBuffersFor510k: vi.fn() }));
vi.mock('../../services/pathway-engines/estar/estar-template-registry', async original => ({
  ...(await original<object>()), listVendoredTemplates: h.templates,
}));

let app: express.Express;
let inventory: Awaited<ReturnType<typeof import('../../services/pathway-engines/estar/estar-template-registry').listVendoredTemplates>>;
beforeAll(async () => {
  const actual = await vi.importActual<typeof import('../../services/pathway-engines/estar/estar-template-registry')>('../../services/pathway-engines/estar/estar-template-registry');
  inventory = await actual.listVendoredTemplates();
  app = express(); app.use(express.json());
  app.use('/api/510k/estar', (await import('../510k-estar-routes')).default);
}, 120_000);
beforeEach(() => { h.templates.mockReset(); h.templates.mockResolvedValue(inventory); h.query.mockReset(); h.query.mockResolvedValue({ rows: [] }); });
afterEach(() => { vi.unstubAllEnvs(); });
const url = (type = '510k', variant = 'device') => `/api/510k/estar/attachment-slots?type=${type}&variant=${variant}`;
const get = (type = '510k', variant = 'device') => request(app).get(url(type, variant)).set('Authorization', 'fixture-auth');

describe('authenticated template-derived eSTAR attachment catalog', () => {
  it('requires authentication before reading any template', async () => {
    expect((await request(app).get(url())).status).toBe(401);
    expect(h.templates).not.toHaveBeenCalled();
  });
  it.each([['510k','device',113],['510k','ivd',145],['de_novo','device',113],['de_novo','ivd',145],['pma','device',113],['pma','ivd',145]] as const)('returns the actual verified %s/%s slots', async (type, variant, count) => {
    const response = await get(String(type), String(variant));
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ descriptorId: `${type}-${variant}`, type, variant, templateVersion: expect.any(String) });
    expect(response.body.slots).toHaveLength(count);
    expect(response.body.slots).toContainEqual(expect.objectContaining({
      somPath: 'root.CoverLetter.CLAddAttachment110', field: 'CLAddAttachment110',
      description: expect.stringContaining('Cover Letter'), chapters: ['/CHAPTER 1/CH1.01/'], singleAttachment: expect.any(String),
    }));
    expect(h.query).not.toHaveBeenCalled();
  });
  it.each(['missing', 'mismatch', 'unpinned'])('refuses a %s template instead of an available empty catalog', async state => {
    h.templates.mockResolvedValue(state === 'missing' ? [] : inventory.map(t => ({ ...t, integrity: state })));
    const response = await get();
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('ESTAR_ATTACHMENT_CATALOG_UNAVAILABLE');
    expect(response.body.slots).toBeUndefined();
  });
  it('keeps PreSTAR administrative preparation outside the marketing attachment picker', async () => {
    const response = await get('q_sub');
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('ESTAR_ATTACHMENT_SELECTION_UNSUPPORTED');
    expect(h.templates).not.toHaveBeenCalled();
  });
  it('reports a failed read without inventing empty template availability', async () => {
    h.templates.mockRejectedValue(new Error('private template read failed'));
    const response = await get();
    expect(response.status).toBe(500);
    expect(response.body.error).toBe('ESTAR_ATTACHMENT_CATALOG_FAILED');
    expect(JSON.stringify(response.body)).not.toContain('private');
  });
});
