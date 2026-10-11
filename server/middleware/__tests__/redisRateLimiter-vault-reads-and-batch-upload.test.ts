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
  it('vault metadata reads are api reads; vault downloads, text and writes stay documents', () => {
    for (const r of ['versions', 'annotations', 'relationships', 'history']) {
      expect(getCategory(`/c2c/project-vault/${PID}/documents/${docId(0)}/${r}`, 'GET'), r).toBe('vault_metadata');
      expect(getCategory(`/api/c2c/project-vault/${PID}/documents/${docId(0)}/${r}`, 'GET'), r).toBe('vault_metadata');
    }
    expect(getCategory(`/c2c/project-vault/${PID}/documents/${docId(0)}/download`, 'GET')).toBe('documents');
    expect(getCategory(`/c2c/project-vault/${PID}/documents/${docId(0)}/text`, 'GET')).toBe('documents');
    expect(getCategory(`/c2c/project-vault/${PID}/documents/${docId(0)}/annotations`, 'POST')).toBe('documents');
    expect(getCategory('/regulatory/documents', 'POST')).toBe('documents');
  });

  it('chat uploads are upload reads', () => {
    expect(getCategory('/chat/upload', 'POST')).toBe('upload');
  });
});
