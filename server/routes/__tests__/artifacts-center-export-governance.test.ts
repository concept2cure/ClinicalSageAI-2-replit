import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { query, generateDocxBuffer } = vi.hoisted(() => ({
  query: vi.fn(),
  generateDocxBuffer: vi.fn(async (_title: string, content: string) => Buffer.from(content)),
}));

vi.mock('../../db.js', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));
vi.mock('../../services/docxGenerator.js', () => ({ generateDocxBuffer }));
const logAction = vi.hoisted(() => vi.fn());
vi.mock('../../services/auditService', () => ({ default: { logAction: (...a: unknown[]) => logAction(...a) } }));
vi.mock('../../services/compute/artifactWriteback', () => ({ registerArtifactWithGovernance: vi.fn() }));

import createArtifactsCenterRoutes from '../artifacts-center-routes';

function app() {
  const instance = express();
  instance.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantId = 17;
    (req as any).user = { id: 5, organizationId: 17 };
    next();
  });
  instance.use('/api/artifacts-center', createArtifactsCenterRoutes());
  return instance;
}

function artifact(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Synthetic evidence assessment',
    content: 'Persisted customer-authored content.',
    metadata: { generationMethod: 'manual' },
    version: 2,
    is_signed: false,
    is_reviewed: false,
    ...overrides,
  };
}

beforeEach(() => {
  query.mockReset();
  generateDocxBuffer.mockClear();
  logAction.mockReset();
  logAction.mockResolvedValue({ persisted: true });
  process.env.EXPORT_REVIEW_GATE = 'enforce';
});

afterEach(() => {
  process.env.NODE_ENV = 'test';
  delete process.env.EXPORT_REVIEW_GATE;
});

describe('Artifacts Center persisted-review export gate', () => {
  it('denies export when the current persisted version has no approval', async () => {
    query.mockResolvedValueOnce({ rows: [artifact()] });

    const response = await request(app()).get(
      '/api/artifacts-center/artifact_1/export?format=docx'
    );

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('HUMAN_REVIEW_REQUIRED');
    expect(generateDocxBuffer).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toContain("d.decision = 'approve'");
    expect(query.mock.calls[0][0]).toContain('d.version_reviewed = a.version');
    expect(query.mock.calls[0][0]).toContain('v.version = a.version');
    expect(query.mock.calls[0][1]).toEqual(['artifact_1', 17]);
  });

  it('fails closed by default in production', async () => {
    process.env.EXPORT_REVIEW_GATE = 'off';
    process.env.NODE_ENV = 'production';
    query.mockResolvedValueOnce({ rows: [artifact()] });

    const response = await request(app()).get(
      '/api/artifacts-center/artifact_1/export?format=docx'
    );

    expect(response.status).toBe(403);
  });

  it('exports only after a persisted approval and labels the bytes and headers as draft', async () => {
    query.mockResolvedValueOnce({ rows: [artifact({ is_reviewed: true })] });

    const response = await request(app()).get(
      '/api/artifacts-center/artifact_1/export?format=docx'
    );

    expect(response.status).toBe(200);
    expect(response.headers['x-concept2cure-draft']).toBe('true');
    expect(response.headers['x-concept2cure-agency-validated']).toBe('false');
    expect(response.headers['x-concept2cure-human-review-recorded']).toBe('true');
    expect(response.headers['x-concept2cure-export-authorization']).toBe(
      'persisted-review-decision'
    );
    expect(generateDocxBuffer).toHaveBeenCalledWith(
      'Synthetic evidence assessment',
      expect.stringContaining('DRAFT — NOT AGENCY-VALIDATED')
    );
  });

  it('reports a current-version signature as recorded human review', async () => {
    query.mockResolvedValueOnce({ rows: [artifact({ is_signed: true })] });

    const response = await request(app()).get('/api/artifacts-center/artifact_1/export?format=txt');

    expect(response.status).toBe(200);
    expect(response.headers['x-concept2cure-human-review-recorded']).toBe('true');
    expect(response.headers['x-concept2cure-export-authorization']).toBe(
      'current-version-signature'
    );
  });

  it('does not allow an approval of an older artifact version to authorize export', async () => {
    query.mockResolvedValueOnce({ rows: [artifact({ version: 3, is_reviewed: false })] });

    const response = await request(app()).get('/api/artifacts-center/artifact_1/export?format=txt');

    expect(response.status).toBe(403);
    expect(response.body.message).toContain('current artifact version');
  });
});

/* Approved or signed regulatory content leaving the system is the export a
   reviewer most needs on the record (D5, 2026-10-01): an EXPORT_GENERATED row
   carrying the SHA-256 of the exact bytes delivered, and no file without it. */
describe('Artifacts Center export is recorded before it is delivered', () => {
  const sha = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
  const binary = (res: any, cb: any) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  for (const format of ['docx', 'txt'] as const) {
    it(`${format}: records EXPORT_GENERATED with the SHA-256 of the delivered bytes`, async () => {
      query.mockResolvedValueOnce({ rows: [artifact({ is_reviewed: true })] });
      const res = await request(app())
        .get(`/api/artifacts-center/artifact_1/export?format=${format}`)
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      const row = logAction.mock.calls.map(([e]) => e).find((e: any) => e.action === 'EXPORT_GENERATED');
      expect(row).toBeTruthy();
      expect(row.organizationId).toBe(17);
      expect(row.userId).toBe(5);
      expect(JSON.stringify(row)).toContain(sha(res.body as Buffer));
      expect(res.headers['x-export-sha256']).toBe(sha(res.body as Buffer));
      expect(res.headers['x-concept2cure-export-authorization']).toBe('persisted-review-decision');
    });

    it(`${format}: delivers nothing when the record does not persist`, async () => {
      logAction.mockResolvedValue({ persisted: false });
      query.mockResolvedValueOnce({ rows: [artifact({ is_reviewed: true })] });
      const res = await request(app()).get(`/api/artifacts-center/artifact_1/export?format=${format}`);
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('UNAUDITED_EXPORT_REFUSED');
      expect(res.headers['content-disposition']).toBeUndefined();
    });
  }
});
