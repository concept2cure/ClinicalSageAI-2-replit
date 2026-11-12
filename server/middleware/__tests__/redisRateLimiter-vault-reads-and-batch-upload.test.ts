/**
 * The /api limiter's document and upload buckets, as one signed-in user meets
 * them in the Vault and the Data room (QA 2026-10-08, rate limits).
 *
 * ── The defects ──────────────────────────────────────────────────────────────
 * 1. getCategory() matches any path with a `documents` segment to the `documents`
 *    bucket, 20 a minute per user (platform-limits.ts RATE_LIMITS.documents). That
 *    bucket is for document generation, export and download, where content
 *    leaves the system. The Vault's document-scoped METADATA reads (versions,
 *    annotations, relationships, history) also carry a `documents` segment, so a
 *    document open used the bucket up: about five opens in a minute (four reads
 *    each) were enough for "Too many document requests", and so were the reads
 *    that follow a posted annotation and the Send for review POST, which shares
 *    the bucket.
 * 2. Each file in a Data room drop is one POST to /api/chat/upload, which the
 *    `upload` bucket counted at 10 a minute per user. A drop of fifteen files was
 *    filed ten and refused five ("Too many file uploads. Please wait.").
 *
 * 3. The same class outside the Vault (2026-10-25, the D2 first-session journey,
 *    CLIENT_JOURNEY_2026-10-25.md decision 13): a project's document list and a
 *    document's outline (/api/c2c/documents), the editor's record panels for the
 *    open document (its review requests, comments and tracked-change decisions)
 *    and its source-coverage summary (/api/data-origins/document) were all
 *    counted in `documents`. Opening a project, starting a document from its
 *    template and coming back to the editor once from AnA used the bucket up, and
 *    Send for review said the document's existing review requests could not be
 *    read, so no reviewer could be chosen.
 *
 * The guards at the bottom are the abuse protection that must stay: downloads and
 * document writes keep 20 a minute per user, a flood of metadata reads is refused,
 * and a flood of uploads is refused.
 *
 * No REDIS_URL in tests → the in-memory store, the same counting as production's
 * fallback. Each test uses its own bearer token, so each test is one fresh user.
 */
import { describe, expect, it } from 'vitest';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import { createRedisRateLimiter, getCategory } from '../redisRateLimiter';

const PID = '11111111-1111-4111-8111-111111111111';
const docId = (n: number) => `2222222${n}-2222-4222-8222-222222222222`;
const docPath = (n: number) => `/api/c2c/project-vault/${PID}/documents/${docId(n)}`;
const READS = ['versions', 'annotations', 'relationships', 'history'] as const;
/** What one editor open reads, outside the Vault (defect 3). */
const EDITOR_READS = (n: number) => [
  '/api/c2c/documents',
  `/api/c2c/documents/${docId(n)}/outline`,
  `/api/authoring/documents/${docId(n)}/reviews`,
  `/api/authoring/documents/${docId(n)}/comments`,
  `/api/authoring/documents/${docId(n)}/tracked-change-decisions`,
  '/api/data-origins/document',
];

let users = 0;
/** A distinct bearer token per test: one user, one fresh set of buckets. */
const newUser = () => `Bearer rl-test-${process.pid}-${++users}`;

/** The mounted limiter with the real default rules, and the routes the Vault and the Data room call. */
function app() {
  const a = express();
  a.use('/api', createRedisRateLimiter());
  const ok = (_req: Request, res: Response) => {
    res.status(200).json({ success: true });
  };
  for (const r of READS) a.get(`/api/c2c/project-vault/:id/documents/:docId/${r}`, ok);
  a.post('/api/c2c/project-vault/:id/documents/:docId/annotations', ok);
  a.get('/api/c2c/project-vault/:id/documents/:docId/download', ok);
  a.post('/api/regulatory/documents', ok);
  a.post('/api/chat/upload', ok);
  a.get('/api/c2c/documents', ok);
  a.get('/api/c2c/documents/:id/outline', ok);
  a.get('/api/c2c/documents/:id/sections/:key', ok);
  for (const r of ['reviews', 'comments', 'tracked-change-decisions']) a.get(`/api/authoring/documents/:id/${r}`, ok);
  a.post('/api/authoring/documents/:id/reviews', ok);
  a.get('/api/data-origins/document', ok);
  a.get('/api/c2c/project-vault/:id/documents/:docId/catalog', ok);
  a.get('/api/mdx/qms/documents', ok);
  a.get('/api/mdx/qms/documents/review-due', ok);
  a.get('/api/mdx/qms/documents/:id', ok);
  return a;
}

describe('a document open is not refused by the document read limit', () => {
  it('a user who opens eight documents in a minute is not refused a read', async () => {
    const a = app();
    const auth = newUser();
    const statuses: number[] = [];
    for (let d = 0; d < 8; d++) {
      for (const r of READS) {
        statuses.push((await request(a).get(`${docPath(d)}/${r}`).set('Authorization', auth)).status);
      }
    }
    expect(statuses, 'document metadata reads were refused as document requests').toEqual(Array(32).fill(200));
  });

  it('a posted annotation and the list read that follows it are both accepted after several opens', async () => {
    const a = app();
    const auth = newUser();
    for (let d = 0; d < 6; d++) {
      for (const r of READS) await request(a).get(`${docPath(d)}/${r}`).set('Authorization', auth);
    }
    const post = await request(a).post(`${docPath(0)}/annotations`).set('Authorization', auth).send({ kind: 'comment', body: 'x' });
    const reread = await request(a).get(`${docPath(0)}/annotations`).set('Authorization', auth);
    expect([post.status, reread.status]).toEqual([200, 200]);
  });

  it('metadata reads keep a per-user ceiling: the 601st in a minute is refused', async () => {
    const a = app();
    const auth = newUser();
    const statuses: number[] = [];
    for (let i = 0; i < 601; i++) {
      statuses.push((await request(a).get(`${docPath(i % 8)}/${READS[i % 4]}`).set('Authorization', auth)).status);
    }
    expect(statuses.slice(0, 600).every((s) => s === 200), 'a read inside the ceiling was refused').toBe(true);
    expect(statuses[600]).toBe(429);
  });
});

describe('the editor and a project are not refused their record reads (defect 3)', () => {
  it('a person who opens the editor six times in a minute is not refused a read', async () => {
    const a = app();
    const auth = newUser();
    const statuses: number[] = [];
    for (let d = 0; d < 6; d++) {
      for (const path of EDITOR_READS(d)) statuses.push((await request(a).get(path).set('Authorization', auth)).status);
    }
    expect(statuses, 'the editor\'s record reads were refused as document requests').toEqual(Array(36).fill(200));
  });

  it('after those opens, Send for review is still accepted', async () => {
    const a = app();
    const auth = newUser();
    for (let d = 0; d < 6; d++) {
      for (const path of EDITOR_READS(d)) await request(a).get(path).set('Authorization', auth);
    }
    const send = await request(a).post(`/api/authoring/documents/${docId(0)}/reviews`).set('Authorization', auth).send({});
    expect(send.status).toBe(200);
  });

  it('a section\'s text keeps the 20-a-minute ceiling: the 21st in a minute is refused', async () => {
    const a = app();
    const auth = newUser();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      statuses.push((await request(a).get(`/api/c2c/documents/${docId(0)}/sections/s${i}`).set('Authorization', auth)).status);
    }
    expect(statuses).toEqual([...Array(20).fill(200), 429]);
  });
});

/*
 * 4. The same class again (2026-11-11, the GA click-through, measured at a person's pace in the running app). Three
 *    more reads a screen makes as it opens were counted in `documents`: a selected Vault document's catalog record,
 *    and the controlled-document register and its review-due list, which the project page and Quality both read.
 *    One project page, five Vault documents and one Quality visit used the bucket up, and the Download that
 *    followed was refused ("Too many document requests. Please wait.").
 */
describe('browsing the Vault, the project page and Quality does not use up the download limit (defect 4)', () => {
  /** What the screens read: the project page and Quality (the register, review-due), then a Vault document selected. */
  const browse = async (a: ReturnType<typeof app>, auth: string, documents: number) => {
    const statuses: number[] = [];
    const get = async (path: string) => statuses.push((await request(a).get(path).set('Authorization', auth)).status);
    for (let visit = 0; visit < 4; visit++) { await get('/api/mdx/qms/documents'); await get('/api/mdx/qms/documents/review-due'); }
    for (let d = 0; d < documents; d++) await get(`${docPath(d % 8)}/catalog`);
    return statuses;
  };

  it('a person who visits the project page and Quality and selects sixteen Vault documents is not refused a read', async () => {
    const statuses = await browse(app(), newUser(), 16);
    expect(statuses, 'a register or catalog-record read was refused as a document request').toEqual(Array(24).fill(200));
  });

  it('after that browsing, a Download is still accepted', async () => {
    const a = app();
    const auth = newUser();
    await browse(a, auth, 16);
    expect((await request(a).get(`${docPath(0)}/download`).set('Authorization', auth)).status).toBe(200);
  });

  it('a controlled document itself keeps the 20-a-minute ceiling: the 21st in a minute is refused', async () => {
    const a = app();
    const auth = newUser();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await request(a).get(`/api/mdx/qms/documents/${docId(i % 8)}`).set('Authorization', auth)).status);
    expect(statuses.slice(0, 20)).toEqual(Array(20).fill(200));
    expect(statuses[20]).toBe(429);
  });

  it('the bucket each is counted in', () => {
    expect(getCategory(`${docPath(1)}/catalog`, 'GET')).toBe('document_metadata');
    expect(getCategory('/api/mdx/qms/documents', 'GET')).toBe('document_metadata');
    expect(getCategory('/api/mdx/qms/documents/review-due', 'GET')).toBe('document_metadata');
    // The catalog record's review acts, a new controlled document and the document itself stay document requests.
    expect(getCategory(`${docPath(1)}/catalog/confirm`, 'POST')).toBe('documents');
    expect(getCategory('/api/mdx/qms/documents', 'POST')).toBe('documents');
    expect(getCategory(`/api/mdx/qms/documents/${docId(1)}`, 'GET')).toBe('documents');
  });
});

describe('document downloads and document writes keep the 20-a-minute ceiling', () => {
  it('the 21st download in a minute is refused', async () => {
    const a = app();
    const auth = newUser();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await request(a).get(`${docPath(0)}/download`).set('Authorization', auth)).status);
    expect(statuses).toEqual([...Array(20).fill(200), 429]);
  });

  it('a document write (Send for review) shares the 20-a-minute ceiling and the 21st is refused', async () => {
    const a = app();
    const auth = newUser();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) statuses.push((await request(a).post('/api/regulatory/documents').set('Authorization', auth).send({})).status);
    expect(statuses).toEqual([...Array(20).fill(200), 429]);
  });
});

describe('a Data room drop is not refused for a normal batch of files', () => {
  it('a batch of fifteen files dropped at once by one user is not refused', async () => {
    const a = app();
    const auth = newUser();
    // The client starts every file's POST at once (useChatUpload.addFiles).
    const responses = await Promise.all(
      Array.from({ length: 15 }, () => request(a).post('/api/chat/upload').set('Authorization', auth).send({})),
    );
    expect(responses.map((r) => r.status), 'files refused by the per-user upload limit').toEqual(Array(15).fill(200));
  });

  it('a flood of uploads by one user is still refused: the 61st in a minute is', async () => {
    const a = app();
    const auth = newUser();
    const statuses: number[] = [];
    let last = { body: {} as Record<string, unknown> };
    for (let i = 0; i < 61; i++) {
      const r = await request(a).post('/api/chat/upload').set('Authorization', auth).send({});
      statuses.push(r.status);
      last = r as unknown as typeof last;
    }
    expect(statuses.slice(0, 60).every((s) => s === 200), 'an upload inside the ceiling was refused').toBe(true);
    expect(statuses[60]).toBe(429);
    expect(last.body).toMatchObject({ message: 'Too many file uploads. Please wait.' });
  });
});

describe('the bucket each path is counted in', () => {
  it('vault metadata reads are document metadata; vault downloads, text and writes stay documents', () => {
    for (const r of ['versions', 'annotations', 'relationships', 'history']) {
      expect(getCategory(`/c2c/project-vault/${PID}/documents/${docId(0)}/${r}`, 'GET'), r).toBe('document_metadata');
      expect(getCategory(`/api/c2c/project-vault/${PID}/documents/${docId(0)}/${r}`, 'GET'), r).toBe('document_metadata');
    }
    expect(getCategory(`/c2c/project-vault/${PID}/documents/${docId(0)}/download`, 'GET')).toBe('documents');
    expect(getCategory(`/c2c/project-vault/${PID}/documents/${docId(0)}/text`, 'GET')).toBe('documents');
    expect(getCategory(`/c2c/project-vault/${PID}/documents/${docId(0)}/annotations`, 'POST')).toBe('documents');
    expect(getCategory('/regulatory/documents', 'POST')).toBe('documents');
  });

  it('the editor\'s and a project\'s record reads are document metadata; section text, the document and writes stay documents', () => {
    for (const path of EDITOR_READS(0)) {
      expect(getCategory(path, 'GET'), path).toBe('document_metadata');
      expect(getCategory(path.replace(/^\/api/, ''), 'GET'), path).toBe('document_metadata');
    }
    expect(getCategory(`/c2c/documents/${docId(0)}/sections/s1`, 'GET')).toBe('documents');
    expect(getCategory(`/c2c/documents/${docId(0)}`, 'GET')).toBe('documents');
    expect(getCategory(`/authoring/documents/${docId(0)}/reviews`, 'POST')).toBe('documents');
    expect(getCategory(`/authoring/documents/${docId(0)}/comments`, 'POST')).toBe('documents');
    expect(getCategory('/c2c/documents', 'POST')).toBe('documents');
  });

  // Walked 2026-11-10 (CSR path): since 2026-11-09 the editor reads the open document's review route when it opens,
  // and Send for review reads who the route admits. Both were metered as document content, 20 a minute. Opening the
  // CSR a few times in a minute spent that, and POST …/request-review answered 429 "Too many document requests":
  // the same refusal the two entries above record, for the third time.
  it('the review route of the open document and who it admits are record reads; sending for review stays a write', () => {
    for (const read of ['review-route', 'route-candidates']) {
      expect(getCategory(`/api/authoring/documents/${docId(0)}/${read}`, 'GET'), read).toBe('document_metadata');
      expect(getCategory(`/authoring/documents/${docId(0)}/${read}`, 'GET'), read).toBe('document_metadata');
    }
    expect(getCategory(`/api/authoring/documents/${docId(0)}/request-review`, 'POST')).toBe('documents');
    expect(getCategory(`/api/authoring/documents/${docId(0)}/review-route/reassign`, 'POST')).toBe('documents');
    expect(getCategory(`/api/authoring/documents/${docId(0)}/review-route/hand-back`, 'POST')).toBe('documents');
  });

  // Walked 2026-11-10 (Quality, D7 C17): the same two reads on a QMS controlled document were still metered as document
  // content. An author wrote the procedure in the editor, sent it for review and opened Reassign within the minute:
  // GET …/route-candidates?for=reassign answered 429, so the sheet said who may take it over could not be read.
  it("a QMS controlled document's review route and who it admits are record reads too; its route acts stay writes", () => {
    for (const read of ['review-route', 'route-candidates']) {
      expect(getCategory(`/api/mdx/qms/documents/31/${read}`, 'GET'), read).toBe('document_metadata');
      expect(getCategory(`/mdx/qms/documents/31/${read}`, 'GET'), read).toBe('document_metadata');
    }
    expect(getCategory('/api/mdx/qms/documents/31/review-route/reassign', 'POST')).toBe('documents');
    expect(getCategory('/api/mdx/qms/documents/31/review-route', 'POST')).toBe('documents');
    expect(getCategory('/api/mdx/qms/documents/31', 'PATCH')).toBe('documents');
    expect(getCategory('/api/mdx/qms/documents/31/versions', 'GET')).toBe('documents');
  });

  it('chat uploads are upload reads', () => {
    expect(getCategory('/chat/upload', 'POST')).toBe('upload');
  });
});
