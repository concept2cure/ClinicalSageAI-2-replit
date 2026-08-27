import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { query, generateDocxBuffer } = vi.hoisted(() => ({
  query: vi.fn(),
  generateDocxBuffer: vi.fn(async (_title: string, content: string) => Buffer.from(content)),
}));

vi.mock('../../db.js', () => ({ pool: { query: (...args: unknown[]) => query(...args) } }));
vi.mock('../../services/docxGenerator.js', () => ({ generateDocxBuffer }));

import createArtifactsCenterRoutes from '../artifacts-center-routes';

function app() {
  const instance = express();
  instance.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantId = 17;
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
