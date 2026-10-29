/**
 * Signed content is not edited in place (P-63), and a translation's approval
 * binds the source it translates (P-64): the label and its translations. D5,
 * 21 CFR Part 11 §11.10(e) and §11.70; docs/evidence/D5-SIGNED-CONTENT-LOCKED/2026-10-29/.
 * The hazard's half is risk-acceptance-locked.pglite.test.ts.
 *
 * Until this change an approved or effective label refused a PATCH but took a
 * symbol added or removed, which then read "changed since it was signed"
 * (84aada8f7): detected, not refused. And a translation's approval
 * (labeling-translation/v1) bound the translation alone, so it read "matches"
 * against a source that had moved on.
 *
 * Runs for real, on an in-process PGlite (signed-records.fixture.ts): the
 * labeling router and its SQL, the ceremony (signGovernedAct),
 * persistGovernedSignSignature with the content binders, the read
 * (readSignedContentStates), and AnA's symbol tool. Stubbed at their module
 * boundaries: the password check, the signer's role, the tenant context and
 * the ledger pair.
 *
 * The refused fields are listed here, as an inspector reads the recipes in the
 * binder README, not imported: signed-content-lock.test.ts pins that the
 * refusal reads the recipe's own list.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { manifestSignatureHash } from '../../services/part11/signature-persistence';
import {
  CHAIN, ORG, PROGRAM, SIGNATURE, SIGNER, WITHDRAWAL, clearSignedRecords, createSignedRecordTables, digestOf, expectLocked, manifestOf,
  signedRecords, type Db,
} from './signed-records.fixture';

const h = vi.hoisted(() => ({
  pg: null as unknown as Db,
  ledger: [] as Array<{ command: string; target: string; payload: Record<string, unknown> }>,
  role: 'member' as string,
}));

const conn = {
  query: async (sql: string, params: unknown[] = []) => {
    const r = await h.pg.query(sql, params);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  },
  release: () => undefined,
};

vi.mock('../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db.js', () => ({ pool: { query: (s: string, p?: unknown[]) => conn.query(s, p), connect: async () => conn }, getPool: () => conn, db: {} }));
vi.mock('../../db/requestDb', async (orig) => ({ ...(await orig<Record<string, unknown>>()), requestPgClient: () => conn }));
vi.mock('../../middleware/signing-attempt-limiter', () => ({
  signingAttemptLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: async () => undefined }));
vi.mock('../../services/part11/reverify-signer', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  reverifySigner: async (_u: number, creds: { password?: string }) => (creds.password === 'correct horse battery staple'
    ? { ok: true, authenticationMethod: 'password', secondFactorVerified: false }
    : { ok: false, status: 401, code: 'PASSWORD_VERIFICATION_FAILED', error: 'The password was not accepted.' }),
}));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
vi.mock('../../services/part11/resolve-signer-role', () => ({ resolveSignerOrgRole: async () => 'approver' }));
vi.mock('../../services/part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole: async () => 'approver' }));
vi.mock('../../routes/c2c/actions', () => ({
  recordGovernedAction: async (_c: unknown, p: { command: string; target: string; payload: Record<string, unknown> }) => {
    h.ledger.push({ command: p.command, target: p.target, payload: p.payload });
    return { actionId: `act_${h.ledger.length}`, auditId: `aud_${h.ledger.length}`, sha256Chain: 'c'.repeat(64) };
  },
}));

import labelingRouter from '../../routes/mdx-labeling';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as unknown as { user: unknown }).user = { id: SIGNER, organizationId: ORG, role: h.role };
    next();
  });
  a.use('/api/mdx', labelingRouter);
  return a;
}

const db = signedRecords({ query: (sql, params) => h.pg.query(sql, params) });
const { seedDoc, seedTranslation, docRow, transRow, symbolsOf, signaturesOn, signatureCount, expectedDocDigest, translationOwn, expectedTranslationV2Digest } = db;

const patchDoc = (id: number, body: Record<string, unknown>) => request(app()).patch(`/api/mdx/labeling/${id}`).send(body);
const getDoc = (id: number) => request(app()).get(`/api/mdx/labeling/${id}`);
const patchTrans = (id: number, body: Record<string, unknown>) => request(app()).patch(`/api/mdx/labeling/translations/${id}`).send(body);
const addSymbol = (docId: number, body: Record<string, unknown> = { symbolCode: '5.1.1', symbolName: 'Manufacturer' }) =>
  request(app()).post(`/api/mdx/labeling/${docId}/symbols`).send(body);
const deleteSymbol = (symId: number) => request(app()).delete(`/api/mdx/labeling/symbols/${symId}`);

beforeAll(async () => {
  const pg = new PGlite();
  h.pg = pg as unknown as Db;
  await createSignedRecordTables(pg as unknown as Parameters<typeof createSignedRecordTables>[0]);
}, 60_000);
afterAll(async () => { await (h.pg as unknown as PGlite)?.close(); });
beforeEach(async () => {
  await clearSignedRecords(h.pg);
  h.ledger.length = 0;
  h.role = 'member';
});

/** An AnA turn whose write a person confirmed, as the tool wrapper requires before it runs one. */
const ANA_CTX = { organizationId: ORG, userId: SIGNER, humanConfirmed: true } as never;

/* ─── P-63: the label ───────────────────────────────────────────────────── */

const DOC_EDITS: Array<[string, unknown]> = [
  ['deviceName', 'Aurora CGM 2'], ['docKind', 'patient_label'], ['version', '2.2'], ['language', 'de'], ['region', 'eu'],
  ['udiDi', '00812345678913'], ['expiresAt', '2030-01-31'], ['artifactId', 4242],
  // Not in the digest: the move to effective writes it and its manifest records it (act.effectiveDate).
  ['effectiveDate', '2026-12-01'],
];

describe('P-63: a labeling document that carries a signature refuses an edit of what it binds', () => {
  describe.each(['approved', 'effective', 'superseded'])('%s', (status) => {
    it.each(DOC_EDITS)('%s: 409 SIGNED_CONTENT_LOCKED, and the row is as it was', async (field, value) => {
      const id = await seedDoc({ status });
      const before = await docRow(id);
      const res = await patchDoc(id, { [field]: value });
      expectLocked(res, 'labeling-document', { fields: [field] });
      expect(await docRow(id)).toEqual(before);
    });

    it('adding a symbol: 409, naming the symbols, and none is added', async () => {
      const id = await seedDoc({ status });
      const res = await addSymbol(id);
      expectLocked(res, 'labeling-document', { child: 'labeling_symbols' });
      expect(res.body.error).toMatch(/ISO 15223-1 symbols/);
      expect(await symbolsOf(id)).toHaveLength(1);
    });

    it('removing a symbol: 409, and it stays', async () => {
      const id = await seedDoc({ status });
      const [sym] = await symbolsOf(id);
      expectLocked(await deleteSymbol(sym.id), 'labeling-document', { child: 'labeling_symbols' });
      expect(await symbolsOf(id)).toHaveLength(1);
    });
  });

  it('an edit naming a bound field beside an unbound one is refused whole: the project is not moved either', async () => {
    const id = await seedDoc({ status: 'approved' });
    const res = await patchDoc(id, { programId: PROGRAM, version: '2.2' });
    expectLocked(res, 'labeling-document', { fields: ['version'] });
    expect((await docRow(id)).program_id).toBeNull();
  });

  it('a move out of approved sent with an unbound field is refused whole: the move is made on its own, with a reason', async () => {
    const id = await seedDoc({ status: 'approved' });
    const res = await patchDoc(id, { status: 'draft', programId: PROGRAM });
    expect(res.status).toBe(409);
    expect(res.body.details.code).toBe('LABELING_DOCUMENT_CONTROLLED');
    expect(res.body.error).toMatch(/send that move on its own, with a reason\. Nothing was saved\.$/);
    expect(await docRow(id)).toMatchObject({ status: 'approved', program_id: null });
  });

  it('a field the signature does not bind stays editable: the project an approved label sits in', async () => {
    const id = await seedDoc();
    expect((await patchDoc(id, { status: 'approved', ...SIGNATURE })).status).toBe(201);
    const res = await patchDoc(id, { programId: PROGRAM });
    expect(res.status).toBe(200);
    expect((await docRow(id)).program_id).toBe(PROGRAM);
    expect((await getDoc(id)).body.data.signedContent.state).toBe('matches');
  });

  it('a symbol refused after a signed approval leaves the signature matching the label', async () => {
    const id = await seedDoc();
    expect((await patchDoc(id, { status: 'approved', ...SIGNATURE })).status).toBe(201);
    expect((await addSymbol(id)).status).toBe(409);
    expect((await getDoc(id)).body.data.signedContent.state).toBe('matches');
  });

  it('a draft or a document in review still takes edits, symbols added and removed', async () => {
    for (const status of ['draft', 'review']) {
      const id = await seedDoc({ status });
      expect((await patchDoc(id, { version: '2.2', effectiveDate: '2026-12-01' })).status).toBe(200);
      const added = await addSymbol(id);
      expect(added.status).toBe(201);
      expect((await deleteSymbol(added.body.data.id)).status).toBe(204);
    }
  });

  it("another organization's document or symbol is still a 404", async () => {
    expect((await addSymbol(424242)).status).toBe(404);
    expect((await deleteSymbol(424242)).status).toBe(404);
    expect((await patchDoc(424242, { version: '2.0' })).status).toBe(404);
  });

  it('a symbol added before this rule is still detected: the label reads "changed" against its signature', async () => {
    const id = await seedDoc();
    await patchDoc(id, { status: 'approved', ...SIGNATURE });
    await h.pg.query(`INSERT INTO labeling_symbols (labeling_document_id, organization_id, symbol_code, symbol_name) VALUES ($1, $2, '5.1.1', 'Manufacturer')`, [id, ORG]);
    expect((await getDoc(id)).body.data.signedContent.state).toBe('changed');
  });
});

describe("P-63: AnA's symbol tool is refused the same way", () => {
  it('add_labeling_symbol on an approved label: the one refusal, and no symbol', async () => {
    const { getToolHandler } = await import('../../services/ana/AnaToolExecutor');
    const id = await seedDoc({ status: 'approved' });
    const out = JSON.parse(await getToolHandler('add_labeling_symbol')!({ labeling_document_id: id, symbol_code: '5.1.1', symbol_name: 'Manufacturer' }, ANA_CTX));
    expect(out).toMatchObject({ code: 'SIGNED_CONTENT_LOCKED' });
    expect(out.error).toMatch(/is not edited in place.*Nothing was saved\.$/);
    expect(await symbolsOf(id)).toHaveLength(1);
  }, 60_000);

  it('add_labeling_symbol on a draft adds it, as before', async () => {
    const { getToolHandler } = await import('../../services/ana/AnaToolExecutor');
    const id = await seedDoc({ status: 'draft' });
    const out = JSON.parse(await getToolHandler('add_labeling_symbol')!({ labeling_document_id: id, symbol_code: '5.1.1', symbol_name: 'Manufacturer' }, ANA_CTX));
    expect(out).toMatchObject({ ok: true, symbol_code: '5.1.1' });
    expect(await symbolsOf(id)).toHaveLength(2);
  }, 60_000);
});

/* ─── P-63: the translation ──────────────────────────────────────────────── */

describe('P-63: an approved translation refuses an edit of what its approval binds', () => {
  it.each([
    ['language', 'fr'], ['translator', 'B. Schmidt'], ['translationMethod', 'machine'], ['backTranslationVerified', false], ['artifactId', 4242],
  ])('%s: 409 SIGNED_CONTENT_LOCKED, and the row is as it was', async (field, value) => {
    const { id } = await seedTranslation({ status: 'draft' }, { status: 'approved' });
    const before = await transRow(id);
    const res = await patchTrans(id, { [field]: value });
    expectLocked(res, 'labeling-translation', { fields: [field] });
    expect(res.body.error).toMatch(/move it back to review with a reason/);
    expect(await transRow(id)).toEqual(before);
  });
});

/* ─── P-64: a translation's approval binds its source ───────────────────── */

describe("P-64: a translation's approval binds the source it translates", () => {
  it('the signature binds labeling-translation/v2: the translation, and the source document version and content digest', async () => {
    const { docId, id } = await seedTranslation();
    const reviewed = await expectedTranslationV2Digest(id);
    expect((await patchTrans(id, { status: 'approved', ...SIGNATURE })).status).toBe(201);
    const [sig] = await signaturesOn(`labeling-translation:${id}`);
    expect(sig.binding_basis).toBe('labeling-translation-content-sha256');
    expect(sig.bound_payload_digest).toBe(reviewed);
    expect(manifestOf(sig)).toMatchObject({
      bindingRecipe: 'labeling-translation/v2',
      boundSource: { target: `labeling-document:${docId}`, version: '2.1', contentDigest: await expectedDocDigest(docId) },
    });
    expect(manifestOf(sig).bindingNote).toMatch(/labeling-translation\/v2.*version 2\.1/);
    expect((await getDoc(docId)).body.data.translations[0].signedContent.state).toBe('matches');
  });

  it('a source that moves on after the approval reads "source-changed", naming both versions', async () => {
    const { docId, id } = await seedTranslation();
    await patchTrans(id, { status: 'approved', ...SIGNATURE });
    expect((await patchDoc(docId, { version: '2.2' })).status).toBe(200);
    const facet = (await getDoc(docId)).body.data.translations[0].signedContent;
    expect(facet.state).toBe('source-changed');
    expect(facet.reason).toMatch(/version 2\.1/);
    expect(facet.reason).toMatch(/version 2\.2/);
    expect(facet.currentDigest).toBe(await expectedTranslationV2Digest(id));
  });

  it('a symbol added to the source reads "source-changed" too: it is the source content', async () => {
    const { docId, id } = await seedTranslation();
    await patchTrans(id, { status: 'approved', ...SIGNATURE });
    expect((await addSymbol(docId)).status).toBe(201);
    expect((await getDoc(docId)).body.data.translations[0].signedContent.state).toBe('source-changed');
  });

  it('the translation itself edited after a withdrawal reads "changed", not "source-changed"', async () => {
    const { docId, id } = await seedTranslation();
    await patchTrans(id, { status: 'approved', ...SIGNATURE });
    await patchTrans(id, { status: 'review', reason: WITHDRAWAL });
    await patchTrans(id, { translator: 'B. Schmidt' });
    expect((await getDoc(docId)).body.data.translations[0].signedContent.state).toBe('changed');
    // Both moved: the translation's own change is what it says.
    await patchDoc(docId, { version: '2.2' });
    expect((await getDoc(docId)).body.data.translations[0].signedContent.state).toBe('changed');
  });

  it('a source that cannot be bound refuses the approval: 409 SIGNATURE_CONTENT_UNBOUND, nothing signed', async () => {
    const { id } = await seedTranslation({ status: 'draft', artifact_id: 999 });
    const res = await patchTrans(id, { status: 'approved', ...SIGNATURE });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SIGNATURE_CONTENT_UNBOUND');
    expect(res.body.error.message).toMatch(/source document it translates/);
    expect(await signatureCount()).toBe(0);
    expect((await transRow(id)).status).toBe('review');
  });

  describe('an approval signed by v1 is still verified by v1, the recipe its signature records', () => {
    /** A v1 approval as the writer wrote it at 84aada8f7: the v1 digest, the recipe in its note, no bindingRecipe. */
    async function v1Signature(id: number, docId: number) {
      const digest = digestOf(await translationOwn(id, 'labeling-translation/v1'));
      const target = `labeling-translation:${id}`;
      const manifest = {
        kind: 'governed-sign', actionId: 'act_v1', auditId: 'aud_v1', auditSha256Chain: CHAIN, target, command: 'sign', reason: SIGNATURE.reason,
        meaning: 'approval', signerId: SIGNER, signerName: 'Sam Signer', signerEmail: 'signer@example.com', organizationId: ORG,
        signedAt: '2026-10-29T09:00:00.000Z', boundPayloadDigest: digest, bindingBasis: 'labeling-translation-content-sha256',
        bindingNote: `sha256 (recipe labeling-translation/v1) over translation ${id} (de) of labeling document ${docId}: translator, method, back-translation check, and no translated text artifact. No status, approval stamp or timestamp is bound.`,
      };
      await h.pg.query(
        `INSERT INTO electronic_signatures (signed_target, binding_basis, signature_type, signature_purpose, signer_id, signer_name, signer_email,
           authentication_method, authentication_timestamp, signature_hash, signature_meaning, signature_manifest, signed_at, bound_payload_digest, organization_id)
         VALUES ($1, 'labeling-translation-content-sha256', 'governed-action', $2, $3, 'Sam Signer', 'signer@example.com', 'password', now(),
           $4, 'approval', $5, '2026-10-29T09:00:00Z', $6, $7)`,
        [target, SIGNATURE.reason, SIGNER, manifestSignatureHash(manifest), JSON.stringify(manifest), digest, ORG]);
      await h.pg.query(`UPDATE labeling_translations SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [id, SIGNER]);
    }

    it('it matches, and a source that moves on does not change that: v1 never bound the source', async () => {
      const { docId, id } = await seedTranslation();
      await v1Signature(id, docId);
      expect((await getDoc(docId)).body.data.translations[0].signedContent.state).toBe('matches');
      await patchDoc(docId, { version: '2.2' });
      expect((await getDoc(docId)).body.data.translations[0].signedContent.state).toBe('matches');
    });

    it('it reads "changed" when the translation it bound changes', async () => {
      const { docId, id } = await seedTranslation();
      await v1Signature(id, docId);
      await patchTrans(id, { status: 'review', reason: WITHDRAWAL });
      await patchTrans(id, { translator: 'B. Schmidt' });
      expect((await getDoc(docId)).body.data.translations[0].signedContent.state).toBe('changed');
    });
  });
});
