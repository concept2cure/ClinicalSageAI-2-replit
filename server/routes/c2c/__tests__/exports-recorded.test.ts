/**
 * A generated file is recorded before it is delivered.
 *
 * POST /api/concept2cure/artifacts/export-{docx,pdf,pptx} (the Conversation
 * Thread's ".docx" button, AnA's exports) and POST /api/c2c/templates/:id/render
 * produced a regulated-looking document from request content and handed it back
 * with nothing recorded: no audit row, no hash, no trace of who produced what.
 * The owner's rule (2026-09-29): a document the system produces is registered.
 * Each now delivers through sendAuditedDownload: an EXPORT_GENERATED audit row
 * carrying the SHA-256 of the exact bytes delivered, and no delivery when that
 * row does not persist.
 */
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const logAction = vi.hoisted(() => vi.fn());
vi.mock('../../../services/auditService', () => ({ default: { logAction: (...a: unknown[]) => logAction(...a) } }));
vi.mock('../../../services/compute/artifactWriteback', () => ({ registerArtifactWithGovernance: vi.fn() }));

// exports.ts: the router's own auth/tenant chain is replaced by a stub that
// sets the principal, as the real chain would.
vi.mock('../../../auth', () => ({ authMiddleware: (_q: Request, _s: Response, n: NextFunction) => n() }));
vi.mock('../../../middleware/tenantContext', () => ({
  tenantContextMiddleware: (_q: Request, _s: Response, n: NextFunction) => n(),
  requireOrganizationContext: (_q: Request, _s: Response, n: NextFunction) => n(),
}));
vi.mock('../shared', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../shared');
  return {
    ...actual,
    concept2cureRateLimiter: (_q: Request, _s: Response, n: NextFunction) => n(),
    getOrganizationId: () => 7,
    getUserId: () => 3,
  };
});
const DOCX = Buffer.from('PK\u0003\u0004 a docx body');
vi.mock('../../../services/docxGenerator', () => ({ generateDocxBuffer: vi.fn(async () => DOCX) }));

// templates.ts: the template service.
const getTemplate = vi.hoisted(() => vi.fn());
const renderDocxWithTemplate = vi.hoisted(() => vi.fn());
vi.mock('../../../services/templates', () => ({
  listTemplates: vi.fn(),
  extractTemplateFromFile: vi.fn(),
  renderDocxWithTemplate: (...a: unknown[]) => renderDocxWithTemplate(...a),
  templateSpecToHtml: vi.fn(),
  normalizeTemplateSpec: (s: unknown) => s,
  createTemplate: vi.fn(),
  getTemplate: (...a: unknown[]) => getTemplate(...a),
  updateTemplate: vi.fn(),
  deactivateTemplate: vi.fn(),
}));

import exportsRouter from '../exports';
import templatesRouter from '../templates';

const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const binary = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

function exportsApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/concept2cure', exportsRouter);
  return app;
}
function templatesApp() {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _s: Response, n: NextFunction) => {
    Object.assign(req as any, { organizationId: 7, userId: 3 });
    n();
  });
  app.use('/api/c2c/templates', templatesRouter);
  return app;
}

beforeEach(() => {
  logAction.mockReset();
  logAction.mockResolvedValue({ persisted: true });
  getTemplate.mockReset();
  getTemplate.mockResolvedValue({ id: 'tpl_1', spec: {} });
  renderDocxWithTemplate.mockReset();
  renderDocxWithTemplate.mockResolvedValue({ buffer: DOCX, filename: 'IND_Cover.docx' });
});

describe('POST /api/concept2cure/artifacts/export-docx', () => {
  const body = { title: 'Nonclinical Overview', content: '# 2.4 Nonclinical overview' };

  it('records EXPORT_GENERATED with the SHA-256 of the delivered bytes, then delivers them', async () => {
    const res = await request(exportsApp()).post('/api/concept2cure/artifacts/export-docx').send(body).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(logAction).toHaveBeenCalledTimes(1);
    const row = logAction.mock.calls[0][0];
    expect(row).toMatchObject({ organizationId: 7, userId: 3, action: 'EXPORT_GENERATED' });
    expect(row.details.sha256).toBe(sha(res.body));
    expect(res.headers['x-export-sha256']).toBe(sha(res.body));
  });

  it('delivers nothing when the record does not persist', async () => {
    logAction.mockResolvedValue({ persisted: false, error: 'connection refused' });
    const res = await request(exportsApp()).post('/api/concept2cure/artifacts/export-docx').send(body);
    expect(res.status).toBe(503);
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(JSON.stringify(res.body)).toContain('UNAUDITED_EXPORT_REFUSED');
  });
});

describe('POST /api/c2c/templates/:id/render', () => {
  const body = { format: 'docx', document: { metadata: { title: 'IND Cover Letter' }, sections: [] } };

  it('records EXPORT_GENERATED with the SHA-256 of the delivered bytes, then delivers them', async () => {
    const res = await request(templatesApp()).post('/api/c2c/templates/tpl_1/render').send(body).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(logAction).toHaveBeenCalledTimes(1);
    const row = logAction.mock.calls[0][0];
    expect(row).toMatchObject({ organizationId: 7, userId: 3, action: 'EXPORT_GENERATED', resourceId: 'tpl_1' });
    expect(row.details.sha256).toBe(sha(res.body));
  });

  it('delivers nothing when the record does not persist', async () => {
    logAction.mockResolvedValue({ persisted: false });
    const res = await request(templatesApp()).post('/api/c2c/templates/tpl_1/render').send(body);
    expect(res.status).toBe(503);
    expect(res.headers['content-disposition']).toBeUndefined();
  });
});
