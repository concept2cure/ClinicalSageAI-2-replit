/**
 * Knowledge-base 502s — the upstream's failure text stays in the log
 * (security audit 2026-09-24 IAM-18 (1); plan P1-17).
 *
 * GET /search-connectors, POST /upload and GET /context/:projectId answered 502
 * with `detail: err.message`. For the two shadow-service proxies that is the
 * transport error — the internal host and port the BFF dials; for the
 * connector search it is whatever a connector's client threw.
 *
 * These are 502s with a stable `error` sentence, not 500s, so they keep their
 * status and sentence (the first P1-17 tranche's treatment of a coded non-500:
 * `serverError()` only answers 500) and lose only the `detail`.
 *
 * Fix round: the five shadow relays (context, generate-ind-section, upload,
 * and the binary generate-docx / generate-ind-package) passed a shadow 5xx
 * answer through verbatim. They now keep the status, answer a fixed sentence
 * and log the shadow's text; a shadow 4xx still passes through.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL-UPSTREAM-DETAIL connect ECONNREFUSED 10.0.4.17:8001';

const { fetchMock, searchConnectedRepositories, logError } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  searchConnectedRepositories: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 1, organizationId: 7, role: 'editor' };
    next();
  },
}));
vi.mock('../../services/integrations/connector-search.js', () => ({ searchConnectedRepositories }));
vi.mock('../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/logger')>();
  return {
    ...actual,
    createScopedLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
  };
});
vi.stubGlobal('fetch', fetchMock);
process.env.REVIEW_ADMIN_TOKEN = 'test-admin-token';

import router from '../knowledge-base';

function app() {
  const a = express();
  a.use('/api/knowledge-base', router);
  return a;
}

function expectContained(res: request.Response, sentence: string) {
  expect(res.status).toBe(502);
  expect(res.body.error).toBe(sentence);
  expect(res.body.detail).toBeUndefined();
  expect(JSON.stringify(res.body)).not.toMatch(/SENTINEL-UPSTREAM-DETAIL|ECONNREFUSED|10\.0\.4\.17/);
  expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-UPSTREAM-DETAIL');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  fetchMock.mockRejectedValue(new Error(SENTINEL));
  searchConnectedRepositories.mockRejectedValue(new Error(SENTINEL));
});

describe('knowledge-base 502s: the status and sentence stay, the upstream text goes to the log', () => {
  it('GET /search-connectors', async () => {
    expectContained(
      await request(app()).get('/api/knowledge-base/search-connectors?q=stability'),
      'Connector search failed',
    );
  });

  it('POST /upload', async () => {
    const res = await request(app())
      .post('/api/knowledge-base/upload')
      .field('project_id', 'p1')
      .attach('files', Buffer.from('Study protocol summary.\n'), { filename: 'notes.txt', contentType: 'text/plain' });
    expectContained(res, 'Shadow service unreachable');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GET /context/:projectId', async () => {
    expectContained(await request(app()).get('/api/knowledge-base/context/p1'), 'Shadow service unreachable');
  });

  it('leaves the 422 answer unchanged', async () => {
    const res = await request(app()).get('/api/knowledge-base/search-connectors');
    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: 'Query parameter "q" is required' });
  });
});

/* Fix round (2026-10-01): the shadow service *answering* >= 500 was passed
   through verbatim — status and body — by the five proxy relays, so its own
   traceback, driver error and file path reached the caller. The leak gate
   cannot see a relay (no caught error is involved). The status is kept; the
   body becomes a fixed sentence and the shadow's text goes to the log. */
const SHADOW_SENTINEL =
  'SENTINEL-SHADOW psycopg2.errors.UndefinedTable: relation "kb_chunks" does not exist File "/srv/shadow/knowledge.py", line 88';

function shadowAnswers(status: number, body: string, contentType = 'application/json') {
  fetchMock.mockImplementation(async () => new Response(body, { status, headers: { 'content-type': contentType } }));
}

function expectShadowFailureContained(res: request.Response, status: number) {
  expect(res.text).not.toMatch(/SENTINEL-SHADOW|psycopg2|UndefinedTable|\/srv\/shadow|Traceback/);
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: 'Shadow service failed' });
  expect(JSON.stringify(logError.mock.calls)).toContain('SENTINEL-SHADOW');
}

describe('knowledge-base shadow relays: a shadow 5xx body stays in the log', () => {
  it('GET /context/:projectId (JSON 500)', async () => {
    shadowAnswers(500, JSON.stringify({ detail: SHADOW_SENTINEL }));
    expectShadowFailureContained(await request(app()).get('/api/knowledge-base/context/p1'), 500);
  });

  it('POST /generate-ind-section (plain-text 503)', async () => {
    shadowAnswers(503, `Traceback (most recent call last): ${SHADOW_SENTINEL}`, 'text/plain');
    expectShadowFailureContained(await request(app()).post('/api/knowledge-base/generate-ind-section'), 503);
  });

  it('POST /upload (JSON 500)', async () => {
    shadowAnswers(500, JSON.stringify({ detail: SHADOW_SENTINEL }));
    const res = await request(app())
      .post('/api/knowledge-base/upload')
      .field('project_id', 'p1')
      .attach('files', Buffer.from('Study protocol summary.\n'), { filename: 'notes.txt', contentType: 'text/plain' });
    expectShadowFailureContained(res, 500);
  });

  it.each(['/generate-docx', '/generate-ind-package'])('POST %s (binary relay, plain-text 500)', async (path) => {
    shadowAnswers(500, `Traceback (most recent call last): ${SHADOW_SENTINEL}`, 'text/plain');
    expectShadowFailureContained(await request(app()).post(`/api/knowledge-base${path}`), 500);
  });

  it('still relays a shadow 4xx answer with its status and body (intended behaviour)', async () => {
    const notFound = { detail: 'Project p1 has no ingested documents' };
    shadowAnswers(404, JSON.stringify(notFound));
    const res = await request(app()).get('/api/knowledge-base/context/p1');
    expect(res.status).toBe(404);
    expect(res.body).toEqual(notFound);
  });

  it('still relays a successful binary render unchanged', async () => {
    fetchMock.mockImplementation(
      async () =>
        new Response(Buffer.from('PK-docx-bytes'), {
          status: 200,
          headers: {
            'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'content-disposition': 'attachment; filename="x.docx"',
          },
        }),
    );
    const res = await request(app())
      .post('/api/knowledge-base/generate-docx')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="x.docx"');
    expect((res.body as Buffer).toString()).toBe('PK-docx-bytes');
  });
});
