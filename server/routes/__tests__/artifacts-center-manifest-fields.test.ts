/**
 * GET /api/artifacts-center — each row carries what the converged manifest
 * writes (fold F3 slice B, D2, 2026-10-29).
 *
 * The Artifacts center and the project Vault export one CSV manifest of the
 * governed artifacts, written by one builder (client artifactManifest.ts). The
 * Vault's leaves already carried a row's section, status, origin, author and
 * recorded hash (slice A); the gallery rows did not, although the shared read
 * (services/artifact-registry-read.ts) selects every one of them. The gallery
 * now passes them through, so both screens write the same columns from the
 * same read. The status is said in the Vault's vocabulary (a locked row is
 * final), one mapping for both.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));
/* The listing is bound to the projects the caller can open (fold F3 slice C,
   2026-10-29). The sharing policy is stubbed here to open project 4, the
   fixture's own; artifacts-center-accessible-projects.pglite.test.ts proves the binding. */
vi.mock('../../services/c2c/current-program-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/c2c/current-program-access')>()),
  readCurrentProgramActor: async () => ({ userId: 5, role: 'author' }),
}));
vi.mock('../../services/report-os/project-access.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/project-access')>()),
  getAccessibleReportProjectIds: async () => [4],
}));

import createArtifactsCenterRoutes from '../artifacts-center-routes';

function appWith(org: number) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).tenantId = org;
    next();
  });
  app.use('/api/artifacts-center', createArtifactsCenterRoutes());
  return app;
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 9,
    artifact_id: 'artifact_9',
    title: 'IND cover letter',
    type: 'regulatory_document',
    category: 'document',
    ctd_section: '1.2',
    status: 'locked',
    version: 7,
    updated_at: new Date('2026-08-14T09:00:00Z'),
    project_id: 4,
    content_hash: 'a'.repeat(64),
    kind_source: 'regulatory_document',
    content_bytes: 2048,
    model: null,
    compiled_from: 'module3-os',
    recorded_source: null,
    program: 'BX-204',
    author_name: 'R. Writer',
    is_signed: true,
    is_reviewed: true,
    source_count: 2,
    signed_version: 7,
    total_rows: 1,
    ...over,
  };
}

beforeEach(() => query.mockReset());

describe('GET /api/artifacts-center — the manifest fields', () => {
  it('passes through section, status, origin, author and recorded hash from the shared read', async () => {
    query.mockResolvedValueOnce({ rows: [row()] });
    const res = await request(appWith(3)).get('/api/artifacts-center');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: 'artifact_9',
      size: '2 KB',
      ctdSection: '1.2',
      status: 'final',
      origin: 'cmc-composer',
      author: 'R. Writer',
      contentHash: 'a'.repeat(64),
    });
  });

  it('says not recorded as null, never a filled-in value', async () => {
    query.mockResolvedValueOnce({
      rows: [row({ ctd_section: null, status: null, compiled_from: null, author_name: null, content_hash: null })],
    });
    const res = await request(appWith(3)).get('/api/artifacts-center');
    expect(res.body.data[0]).toMatchObject({
      ctdSection: null,
      status: 'unknown',
      origin: null,
      author: null,
      contentHash: null,
    });
  });
});
