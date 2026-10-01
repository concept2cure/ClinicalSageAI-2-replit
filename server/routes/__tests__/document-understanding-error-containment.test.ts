/**
 * A 500 from POST /api/document-understanding/analyze carries no caught-error
 * text (security audit 2026-09-24, IAM-18 (1); plan P1-17, tranche 3 set-B).
 *
 * The catch answered `{ success: false, error: String(err) }` — the error's
 * name and message, which for this route includes filesystem paths (an ENOENT
 * or EACCES names the absolute path it failed on). It now answers through
 * `serverError()` (server/lib/api-response.ts): a static INTERNAL_ERROR envelope
 * with the request id, the detail in the log.
 *
 * The path resolver is the double that fails; the route and the helper are
 * real. The 400 for a request with no source is pinned beside it unchanged.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = "SENTINEL-FS-DETAIL: EACCES: permission denied, open '/app/storage/org-7/secret.txt'";
const REQUEST_ID = 'req-p117-set-b';

const { resolvePath } = vi.hoisted(() => ({ resolvePath: vi.fn() }));
vi.mock('../../utils/document-file-roots.js', () => ({ resolveDocumentPath: (...a: unknown[]) => resolvePath(...a) }));
vi.mock('../../utils/authedOrgId.js', () => ({ requireAuthedOrgId: () => ({ ok: true, orgId: 7 }) }));

import router from '../document-understanding';

function app() {
  const a = express();
  a.use(express.json());
  a.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', REQUEST_ID);
    next();
  });
  a.use('/api/document-understanding', router);
  return a;
}

beforeEach(() => {
  resolvePath.mockReset();
  resolvePath.mockImplementation(() => {
    throw new Error(SENTINEL);
  });
});

describe('POST /api/document-understanding/analyze: the 500 body is contained', () => {
  it('answers a failure inside the analysis with INTERNAL_ERROR and the request id, never the thrown text', async () => {
    const r = await request(app()).post('/api/document-understanding/analyze').send({ filePath: 'uploads/secret.txt' });
    expect(r.status).toBe(500);
    const body = JSON.stringify(r.body);
    expect(body, 'the thrown text reached the client').not.toContain('SENTINEL-FS-DETAIL');
    expect(body).not.toContain('/app/storage');
    expect(body).not.toContain('EACCES');
    expect(r.body).toMatchObject({ error: 'INTERNAL_ERROR', correlationId: REQUEST_ID });
  });

  it('leaves the no-source 400 exactly as it was', async () => {
    const r = await request(app()).post('/api/document-understanding/analyze').send({});
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ error: 'filePath, base64Content, or url is required' });
  });
});
