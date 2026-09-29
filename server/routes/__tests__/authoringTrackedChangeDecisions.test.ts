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
import { createHash } from 'node:crypto';
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

/** The section the audit row is filed against — its own column ($2), not metadata. */
function auditSectionId(): unknown {
  const call = mockQuery.mock.calls.find(c => String(c[0]).includes('INSERT INTO authoring_audit_trail'));
  return call ? (call[1] as unknown[])[1] : undefined;
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
    // The row is filed against the section (verified to be in the document).
    expect(auditSectionId()).toBe('S1');
    // Who PROPOSED it — distinct from the actor who decided it.
    expect(md.proposedBy).toBe('R. Author');
  });

  it('keeps the whole proposed text, with its hash — accepting strips the mark, so this is the only copy', async () => {
    /* It was cut to 500 characters. The record is append-only and the only
       place the proposed words survive once a suggestion is resolved; a
       record that keeps a prefix of what was accepted is not a record of it
       (D5, 2026-09-26). */
    await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({
        changeId: 'insertion:x',
        decision: 'accept',
        changeType: 'insertion',
        text: 'x'.repeat(5000),
      });

    const md = auditMetadata();
    expect(md.text.length).toBe(5000);
    expect(md.textSha256).toBe(createHash('sha256').update('x'.repeat(5000)).digest('hex'));
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
    // Stated as absent, never invented.
    expect(md.text).toBeNull();
    expect(md.textSha256).toBeNull();
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
      .send({ decision: 'reject', changeIds: many(2).map(c => c.changeId), changes: many(2) });

    expect(res.status).toBe(200);
    const md = auditMetadata();
    expect(md.count).toBe(2);
    expect(md.decision).toBe('reject');
    expect(md.changes).toHaveLength(2);
    expect(md.changes[0].text).toBe('proposed text 0');
  });

  it('records every change of an "Accept all", whole — no cap, nothing left out', async () => {
    /* It kept the first 20 and said how many it left out. Honest, but an
       "Accept all" is the one click that adopts a whole AI draft, and the
       record of it now holds every change it adopted (D5, 2026-09-26). */
    await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({
        decision: 'accept',
        changeIds: many(50).map(c => c.changeId),
        changes: many(50),
      });

    const md = auditMetadata();
    expect(md.changes).toHaveLength(50);
    expect(md.changes[49].text).toBe('proposed text 49');
    expect(md.changesOmittedFromSummary).toBeUndefined();
  });

  it('records the bulk act even when no per-change context is sent', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({ decision: 'accept', changeIds: ['a', 'b', 'c'] });

    expect(res.status).toBe(200);
    const md = auditMetadata();
    expect(md.count).toBe(3);
    // Each change is still named; what the client did not send is stated as absent.
    expect(md.changes.map((c: any) => [c.changeId, c.text])).toEqual([['a', null], ['b', null], ['c', null]]);
    expect(md.changesOmittedFromSummary).toBeUndefined();
  });
});

describe('the FROZEN/APPROVED document lock — accept/reject must not write past it', () => {
  /**
   * Neither handler resolved the parent document at all: no existence check,
   * no status check. `checkSectionWritable` already refuses a FROZEN/APPROVED
   * document on every other authoring write (manual save, history revert, AI
   * draft accept) via the /sections/:sectionId prefix guard — these two routes
   * sit under /documents/:id instead, outside that guard, and reached the
   * INSERT unconditionally. The sibling helper `checkDocumentWritable` already
   * exists in services/authoring/document-lock.ts for exactly this document-id
   * shape.
   */
  function dispatchByStatus(status: string | null) {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/FROM authoring_documents/.test(sql)) {
        return { rows: status ? [{ status, locked_at: null }] : [] };
      }
      return { rowCount: 1, rows: [{ id: 'row-1' }] };
    });
  }

  it('refuses a single accept/reject against a FROZEN document — no row written', async () => {
    dispatchByStatus('FROZEN');
    const res = await request(makeApp())
      .post('/api/authoring/documents/D-frozen/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({ changeId: 'insertion:x', decision: 'accept' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('DOCUMENT_FROZEN');
    expect(
      mockQuery.mock.calls.some(c => /INSERT INTO authoring_tracked_change_decisions/.test(String(c[0]))),
    ).toBe(false);
    expect(
      mockQuery.mock.calls.some(c => /INSERT INTO authoring_audit_trail/.test(String(c[0]))),
    ).toBe(false);
  });

  it('refuses a single accept/reject against an APPROVED document', async () => {
    dispatchByStatus('APPROVED');
    const res = await request(makeApp())
      .post('/api/authoring/documents/D-approved/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({ changeId: 'insertion:x', decision: 'reject' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('DOCUMENT_FROZEN');
  });

  it('still accepts against an ordinary DRAFT document — the fix is not a blanket deny', async () => {
    dispatchByStatus('DRAFT');
    const res = await request(makeApp())
      .post('/api/authoring/documents/D-draft/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({ changeId: 'insertion:x', decision: 'accept' });
    expect(res.status).toBe(200);
  });

  it('refuses a bulk accept against a FROZEN document — no rows written', async () => {
    dispatchByStatus('FROZEN');
    const res = await request(makeApp())
      .post('/api/authoring/documents/D-frozen/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({ decision: 'accept', changeIds: ['a', 'b'] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('DOCUMENT_FROZEN');
    expect(
      mockQuery.mock.calls.some(c => /INSERT INTO authoring_tracked_change_decisions/.test(String(c[0]))),
    ).toBe(false);
  });

  it('still accepts a bulk decision against an ordinary DRAFT document', async () => {
    dispatchByStatus('DRAFT');
    const res = await request(makeApp())
      .post('/api/authoring/documents/D-draft/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({ decision: 'accept', changeIds: ['a', 'b'] });
    expect(res.status).toBe(200);
  });
});

describe('bulk audit metadata carries what the single route already carries', () => {
  it('records sectionId and each change\'s proposedAt, mirroring the single route', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({
        decision: 'accept',
        changeIds: ['a', 'b'],
        sectionId: 'S9',
        changes: [
          { changeId: 'a', changeType: 'insertion', text: 'first', at: '2026-08-24T16:30:00Z' },
          { changeId: 'b', changeType: 'insertion', text: 'second', at: '2026-08-24T16:31:00Z' },
        ],
      });

    expect(res.status).toBe(200);
    const md = auditMetadata();
    // Filed against the section, as the single route is.
    expect(auditSectionId()).toBe('S9');
    expect(md.changes[0].proposedAt).toBe('2026-08-24T16:30:00Z');
    expect(md.changes[1].proposedAt).toBe('2026-08-24T16:31:00Z');
  });

  it('omits sectionId when the caller sends none, same as the single route', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({ decision: 'accept', changeIds: ['a'] });
    expect(res.status).toBe(200);
    expect(auditSectionId()).toBeNull();
  });
});

describe('proposedBy — a machine author is canonicalised, everything else is caller-asserted text', () => {
  /**
   * There is no roster this can validate a HUMAN proposer against: the human
   * authorId a mark carries is the editing client's own email, not a numeric
   * user id, and a legitimate proposer can be a co-author, a since-revoked
   * grantee, or simply someone other than the decider. What IS checkable is
   * whether the caller claims to be this server's own AI system, because that
   * is a closed, server-owned vocabulary (MACHINE_AUTHOR_IDS) — the same list
   * machineContributors validates against for the revision ledger.
   */
  it('an authorId of "ana" is canonicalised — the caller-supplied authorName is IGNORED', async () => {
    await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({
        changeId: 'insertion:x',
        decision: 'accept',
        authorId: 'ana',
        authorName: 'Someone Else Entirely',
      });

    const md = auditMetadata();
    expect(md.proposedBy).toBe('AnA (AI draft)');
    expect(md.proposedByVerified).toBe(true);
    expect(md.proposedBy).not.toBe('Someone Else Entirely');
  });

  it('an ordinary human proposer is recorded as unverified, caller-asserted text', async () => {
    await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({ changeId: 'insertion:x', decision: 'accept', authorName: 'R. Author' });

    const md = auditMetadata();
    expect(md.proposedBy).toBe('R. Author');
    expect(md.proposedByVerified).toBe(false);
  });

  it('an unrecognised authorId (not "ana") is NOT treated as a machine — recorded as its own text', async () => {
    await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({ changeId: 'insertion:x', decision: 'accept', authorId: 'gpt-5' });

    const md = auditMetadata();
    expect(md.proposedBy).toBe('gpt-5');
    expect(md.proposedByVerified).toBe(false);
  });

  it('bounds an unverified proposer name — an audit row is not a place for arbitrary text', async () => {
    await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions')
      .set('Authorization', await bearer())
      .send({ changeId: 'insertion:x', decision: 'accept', authorName: 'x'.repeat(5000) });

    expect(auditMetadata().proposedBy.length).toBe(200);
  });

  it('bulk: a machine author is canonicalised per change, mirroring the single route', async () => {
    const res = await request(makeApp())
      .post('/api/authoring/documents/D1/tracked-change-decisions/bulk')
      .set('Authorization', await bearer())
      .send({
        decision: 'accept',
        changeIds: ['a', 'b'],
        changes: [
          { changeId: 'a', authorId: 'ana', authorName: 'spoofed display name' },
          { changeId: 'b', authorName: 'R. Human' },
        ],
      });

    expect(res.status).toBe(200);
    const md = auditMetadata();
    expect(md.changes[0]).toMatchObject({ proposedBy: 'AnA (AI draft)', proposedByVerified: true });
    expect(md.changes[1]).toMatchObject({ proposedBy: 'R. Human', proposedByVerified: false });
  });
});
