/**
 * A locked or submitted filing is not changed by the editor (D2 / D5).
 *
 * POST /api/c2c/documents/:id/lock and /:id/submit set c2c_documents.status
 * (the lock also locked_at). The filing PATCH refused such a document ("its
 * sections must not be edited in place"), but the one writer of filed text,
 * commitSectionToFiling, never read it. So after a signed lock, with its
 * re-authentication and separation of duties, an editor save still changed
 * the filed text and recorded it as an ordinary edit. The approval signature
 * still moved its sections to approved.
 *
 * Shown on the REAL routers and migrations (./_filing-write-harness):
 *   - an editor save into a locked filing is refused, 403 FILING_LOCKED, in
 *     the editor's own words; neither the filed text nor the editing copy
 *     moves, and no revision is written;
 *   - the same for a submitted filing (FILING_SUBMITTED), and for a lock
 *     recorded only by locked_at;
 *   - an approval signature over a locked filing approves none of its
 *     sections, and says why;
 *   - the filing PATCH still refuses a locked document, through the same rule.
 * The status the lock route writes is set directly: the route's own
 * ceremony (re-authentication, separation of duties) has its own suite
 * (server/routes/c2c/__tests__/document-lock-ceremony.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import {
  FILING_JWT_SECRET, PASSWORD, T, makeFiling as makeFilingIn, signToken, startFilingApp, type FilingApp,
} from './_filing-write-harness';

process.env.JWT_SECRET = FILING_JWT_SECRET;
process.env.JWT_SECRET_DEV = FILING_JWT_SECRET;
process.env.AUDIT_HMAC_KEY = 'filing-lock-test-audit-hmac-key-not-a-real-secret';

const h = vi.hoisted(() => ({ db: null as unknown, pool: null as unknown }));
vi.mock('../../../db', () => ({
  get db() { return h.db; },
  get pool() { return h.pool; },
  getPool: () => h.pool,
  query: (text: string, params?: unknown[]) =>
    (h.pool as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params),
}));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => 'approver' }));
vi.mock('../../part11/reverify-signer-deps', () => ({
  signerReverificationDeps: () => ({
    loadPasswordHash: async () => 'stored-hash',
    comparePassword: async (plain: string) => plain === 'signer-password',
    isMfaEnabled: async () => false,
    verifyMfaToken: async () => false,
    isAccountActive: async () => true,
    isAccountLocked: async () => false,
    recordFailedAttempt: async () => {},
    warn: () => {},
  }),
}));

/* pg-pool throws on a second release of one client ("Release called on client
   which has already been released to the pool"); the PGlite harness's release
   is a no-op. So each connection's releases are counted here. */
const doubleReleases: string[] = [];
function countingReleases(pool: { connect: () => Promise<{ query: unknown; release: () => void }> }) {
  return new Proxy(pool, {
    get(target, key) {
      if (key !== 'connect') return Reflect.get(target, key);
      return async () => {
        const c = await target.connect();
        let released = false;
        return { ...c, release: () => { if (released) doubleReleases.push(String(new Error().stack)); released = true; c.release(); } };
      };
    },
  });
}

let filing: FilingApp;
let token = '';
const as = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
const q = <R = any>(sql: string, params?: unknown[]) => filing.q<R>(sql, params);

beforeAll(async () => {
  filing = await startFilingApp((built) => { h.db = built.db; h.pool = countingReleases(built.pool as never); });
  token = await signToken({});
}, T);
afterAll(async () => { await filing?.jdb.close(); });

const makeFiling = (keys: string[]) => makeFilingIn(filing, as, keys);
const save = (sectionId: string, content: string) =>
  as(request(filing.app).patch(`/api/authoring/sections/${sectionId}`)).send({ content, changeReason: 'drafting the section' });

/** What a refused save must leave exactly as it was. */
async function state(f: { doc: string; sectionIds: Record<string, string> }) {
  return {
    filed: await q(`SELECT section_key, status, content->>'text' AS text FROM c2c_document_sections WHERE document_id = $1 ORDER BY section_key`, [f.doc]),
    copy: await q(`SELECT id, content FROM authoring_sections WHERE id::text = ANY($1::text[]) ORDER BY id`, [Object.values(f.sectionIds)]),
    revisions: await q(`SELECT count(*)::int AS n FROM doc_revisions WHERE section_id::text = ANY($1::text[])`, [Object.values(f.sectionIds)]),
  };
}

describe('an editor save into a locked or submitted filing is refused', () => {
  it.each([
    ['locked', `status = 'locked', locked_at = now()`, 'FILING_LOCKED', /is locked/],
    ['submitted', `status = 'submitted', submitted_at = now()`, 'FILING_SUBMITTED', /has been submitted/],
    ['locked by locked_at alone', `locked_at = now()`, 'FILING_LOCKED', /is locked/],
  ])('%s: 403, in its own words, and nothing moves', async (_name, set, code, words) => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Text filed before the lock.')).status).toBe(200);
    await q(`UPDATE c2c_documents SET ${set} WHERE id = $1`, [f.doc]);
    const before = await state(f);

    const res = await save(f.sectionIds['2.5'], 'Text that must not reach a locked filing.');

    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.code).toBe(code);
    expect(String(res.body.message)).toMatch(words);
    expect(String(res.body.message)).toMatch(/Nothing was saved/);
    expect(await state(f), 'the filed text, the editing copy and the revision ledger').toEqual(before);
  }, T);

  it('a draft filing still takes the save (the rule is not a blanket refusal)', async () => {
    const f = await makeFiling(['2.5']);
    const res = await save(f.sectionIds['2.5'], 'Ordinary drafting.');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filing).toMatchObject({ committed: true });
  }, T);
});

describe('an approval signature over a locked filing approves none of its sections', () => {
  it('the signature stands on the editing copy; the filing does not move, and the reply says why', async () => {
    const f = await makeFiling(['2.5']);
    expect((await save(f.sectionIds['2.5'], 'Clinical overview text.')).status).toBe(200);
    await q(`UPDATE c2c_documents SET status = 'locked', locked_at = now() WHERE id = $1`, [f.doc]);

    const res = await as(request(filing.app).post(`/api/authoring/docs/${f.authoringDocId}/e-sign`)).send({
      meaning: 'APPROVER', intent: 'I approve this filing for submission.', password: PASSWORD,
    });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filingApproval).toMatchObject({ approved: [], notApproved: ['2.5'], documentId: f.doc });
    expect(String(res.body.filingApproval.reason)).toMatch(/is locked/);
    expect(await q(`SELECT status FROM c2c_document_sections WHERE document_id = $1`, [f.doc])).toEqual([{ status: 'drafted' }]);
  }, T);
});

describe('the filing PATCH refuses a locked document through the same rule', () => {
  it('409 DOCUMENT_LOCKED, with the sentence, and the status does not move', async () => {
    const f = await makeFiling(['2.5']);
    await q(`UPDATE c2c_documents SET status = 'locked', locked_at = now() WHERE id = $1`, [f.doc]);
    const res = await request(filing.app).patch(`/api/c2c/documents/${f.doc}/sections/2.5`).send({ status: 'review', reason: 'Ready for review.' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error).toBe('DOCUMENT_LOCKED');
    expect(String(res.body.message)).toMatch(/is locked/);
    expect(await q(`SELECT status FROM c2c_document_sections WHERE document_id = $1`, [f.doc])).toEqual([{ status: 'todo' }]);
    expect(doubleReleases, 'a refusal released its connection twice').toEqual([]);
  }, T);

  it('the seal refusal beside it releases its connection once', async () => {
    const f = await makeFiling(['2.5']);
    await q(`UPDATE authoring_documents SET status = 'FROZEN' WHERE id = $1`, [f.authoringDocId]);
    const res = await request(filing.app).patch(`/api/c2c/documents/${f.doc}/sections/2.5`).send({ status: 'review', reason: 'Ready for review.' });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(doubleReleases, 'the seal refusal released its connection twice').toEqual([]);
  }, T);
});
