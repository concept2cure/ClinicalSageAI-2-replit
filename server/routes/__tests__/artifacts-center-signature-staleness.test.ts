/**
 * Artifacts Center — a signature must not read as covering content it never saw.
 *
 * WHAT WAS WRONG. `is_signed` was `EXISTS (any active signature on this
 * artifact)`, with no reference to which version that signature covers. An
 * artifact signed at v3 and edited to v7 satisfied it exactly as well as one
 * signed a moment ago, so the gallery showed the signed badge for content
 * nobody had approved.
 *
 * WHY NOT "INVALIDATE THE SIGNATURE ON EDIT". Version content here is
 * immutable — an edit mints a new version rather than rewriting one — so the
 * old signature is not invalid and must not be marked so. It correctly covers
 * the bytes it covered. What was missing is the ability to SAY that: signed,
 * at v3, while the artifact is now v7.
 *
 * WHY `is_signed` KEEPS ITS MEANING. Some writers set `artifact_version_id` to
 * a predecessor snapshot, so redefining the badge as "signature version equals
 * current version" would report freshly-signed artifacts as unsigned.
 * Under-reporting a signature is its own falsehood. The version is reported
 * alongside and the caller compares.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import createArtifactsCenterRoutes from '../artifacts-center-routes';

function appWith(org: number | null) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as any).tenantId = org;
    next();
  });
  app.use('/api/artifacts-center', createArtifactsCenterRoutes());
  return app;
}

function row(over: Record<string, unknown> = {}) {
  return {
    artifact_id: 'artifact_1',
    title: 'IND cover letter',
    kind_source: 'regulatory_document',
    category: 'document',
    type: 'document',
    version: 7,
    updated_at: new Date('2026-08-14T09:00:00Z'),
    project_id: 4,
    content_bytes: 2048,
    model: null,
    program: 'BX-204',
    is_signed: true,
    is_reviewed: false,
    source_count: 0,
    signed_version: 7,
    ...over,
  };
}

beforeEach(() => query.mockReset());

describe('GET /api/artifacts-center — signature staleness', () => {
  it('reports a signature that covers the current version as not stale', async () => {
    query.mockResolvedValueOnce({ rows: [row({ version: 7, signed_version: 7 })] });
    const res = await request(appWith(3)).get('/api/artifacts-center');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ sig: true, sigVersion: 7, sigStale: false });
  });

  it('REGRESSION: an artifact signed at an earlier version reports stale', async () => {
    // Signed at v3, edited to v7. Previously indistinguishable from the case
    // above — both were simply `sig: true`.
    query.mockResolvedValueOnce({ rows: [row({ version: 7, signed_version: 3 })] });
    const res = await request(appWith(3)).get('/api/artifacts-center');
    const a = res.body.data[0];
    expect(a.sig).toBe(true);
    expect(a.sigVersion).toBe(3);
    expect(a.sigStale).toBe(true);
    // The badge still reports a real signature — it exists, it is just older.
    expect(a.ver).toBe('v7');
  });

  it('says it cannot tell, rather than guessing, when the signed version is unresolvable', async () => {
    query.mockResolvedValueOnce({ rows: [row({ version: 7, signed_version: null })] });
    const res = await request(appWith(3)).get('/api/artifacts-center');
    const a = res.body.data[0];
    expect(a.sig).toBe(true);
    expect(a.sigVersion).toBeNull();
    // null, not false: "we cannot tell whether this approval still applies" and
    // "this approval is current" are different claims.
    expect(a.sigStale).toBeNull();
  });

  it('reports no staleness verdict for an unsigned artifact', async () => {
    query.mockResolvedValueOnce({
      rows: [row({ is_signed: false, signed_version: null })],
    });
    const res = await request(appWith(3)).get('/api/artifacts-center');
    const a = res.body.data[0];
    expect(a.sig).toBe(false);
    expect(a.sigStale).toBeNull();
  });

  it('reports persisted review and source counts without inventing either', async () => {
    query.mockResolvedValueOnce({
      rows: [row({ is_reviewed: true, source_count: 2 })],
    });
    const res = await request(appWith(3)).get('/api/artifacts-center');
    expect(res.body.data[0]).toMatchObject({ reviewed: true, sourceCount: 2 });
    expect(query.mock.calls[0][0]).toContain('d.version_reviewed = a.version');
    expect(query.mock.calls[0][0]).toContain("json_typeof(a.metadata -> 'sourceArtifactIds')");
  });

  it('scopes the read to the caller organization', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await request(appWith(42)).get('/api/artifacts-center');
    expect(query.mock.calls[0][1]).toEqual([42]);
    expect(query.mock.calls[0][0]).toContain('a.organization_id = $1');
  });

  it('refuses without organization context', async () => {
    const res = await request(appWith(null)).get('/api/artifacts-center');
    expect(res.status).toBe(400);
  });
});
