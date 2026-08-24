/**
 * Tracked-change decisions — the record has to say WHAT was decided.
 *
 * `authoring_tracked_change_decisions` stores an id, a verdict, an actor and a
 * timestamp. It stores nothing about the change itself — and accepting a
 * suggestion STRIPS its mark, so by the time anyone reads the row, the id it
 * names no longer exists in the document. The row is an index; the audit trail
 * is where the change is actually recorded.
 *
 * That matters most for rejections. An accepted change reaches the record
 * indirectly, because its text lands in the next revision. A rejected one
 * alters nothing at all, so if the audit row does not carry the words, the fact
 * that a reviewer refused a deletion of the safety paragraph is recorded
 * nowhere.
 */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../../db', () => {
  const api = {
    query: (...a: unknown[]) => mockQuery(...a),
    connect: async () => ({ query: (...a: unknown[]) => mockQuery(...a), release: () => {} }),
  };
  return { pool: api, getPool: () => api, query: (...a: unknown[]) => mockQuery(...a), db: {} };
});

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-tracked-changes';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;

import router from '../authoring.router';

async function bearer(): Promise<string> {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ sub: 'u1', organizationId: 7, email: 'reviewer@test.co' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(secret);
  return `Bearer ${token}`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/authoring', router);
  return app;
}

/** The metadata argument of the audit INSERT, parsed. */
function auditMetadata(): any {
  const call = mockQuery.mock.calls.find(c =>
    String(c[0]).includes('INSERT INTO authoring_audit_trail'),
  );
  if (!call) return null;
  const raw = (call[1] as unknown[])[10]; // metadata is $11
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async () => ({ rowCount: 1, rows: [{ id: 'row-1' }] }));
});

describe('POST /documents/:id/tracked-change-decisions', () => {
  it('records the refused TEXT, not just an id the document no longer holds', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({
        changeId: 'deletion:abc123',
        decision: 'reject',
        changeType: 'deletion',
        text: 'Patients with hepatic impairment were excluded.',
        authorName: 'R. Author',
        at: '2026-08-24T16:30:00Z',
        sectionId: 'S1',
      });

    expect(res.status).toBe(200);
    const md = auditMetadata();
    expect(md.decision).toBe('reject');
    expect(md.changeType).toBe('deletion');
    expect(md.text).toBe('Patients with hepatic impairment were excluded.');
    expect(md.sectionId).toBe('S1');
    // Who PROPOSED it — distinct from the actor who decided it.
    expect(md.proposedBy).toBe('R. Author');
  });

  it('bounds the recorded text — an audit row is not a copy of the section', async () => {
    await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({
        changeId: 'insertion:x',
        decision: 'accept',
        changeType: 'insertion',
        text: 'x'.repeat(5000),
      });

    expect(auditMetadata().text.length).toBe(500);
  });

  it('still records the decision when no context is supplied', async () => {
    // Context is additive; a caller that sends none must not be refused.
    const res = await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({ changeId: 'insertion:x', decision: 'accept' });

    expect(res.status).toBe(200);
    const md = auditMetadata();
    expect(md.decision).toBe('accept');
    expect(md.text).toBeUndefined();
  });

  it('refuses a verdict that is neither accept nor reject', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({ changeId: 'x', decision: 'maybe' });
    expect(res.status).toBe(400);
  });
});

describe('POST /documents/:id/tracked-change-decisions/bulk', () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      changeId: `insertion:${i}`,
      changeType: 'insertion',
      text: `proposed text ${i}`,
      authorName: 'R. Author',
    }));

  it('records one act, with the changes it covered', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({ decision: 'reject', changeIds: ['a', 'b'], changes: many(2) });

    expect(res.status).toBe(200);
    const md = auditMetadata();
    expect(md.count).toBe(2);
    expect(md.decision).toBe('reject');
    expect(md.changes).toHaveLength(2);
    expect(md.changes[0].text).toBe('proposed text 0');
  });

  it('caps the summary AND says how many it left out', async () => {
    await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({
        decision: 'accept',
        changeIds: many(50).map(c => c.changeId),
        changes: many(50),
      });

    const md = auditMetadata();
    expect(md.changes).toHaveLength(20);
    // A truncated record that reads as complete is the failure mode.
    expect(md.changesOmittedFromSummary).toBe(30);
  });

  it('records the bulk act even when no per-change context is sent', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({ decision: 'accept', changeIds: ['a', 'b', 'c'] });

    expect(res.status).toBe(200);
    const md = auditMetadata();
    expect(md.count).toBe(3);
    expect(md.changes).toBeUndefined();
    expect(md.changesOmittedFromSummary).toBeUndefined();
  });
});
