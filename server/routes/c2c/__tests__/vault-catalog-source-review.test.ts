/** HTTP boundary only. Canonical source/admission SQL has separate proof. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), review: vi.fn(), query: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: mocks.query, connect: vi.fn() } }));
vi.mock('../../../services/vault/document-catalog-governance.service.js', () => ({
  readCatalogRecord: mocks.read, reviewCatalogRecord: mocks.review,
}));
import createProjectVaultRoutes from '../project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const TEXT_HASH = 'b'.repeat(64);
const endpoint = `/api/c2c/project-vault/${PROGRAM}/documents/${DOCUMENT}/catalog`;
function app() {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    Object.assign(req, { user: { organizationId: 7, id: 3, role: 'member' } });
    next();
  });
  instance.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return instance;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.read.mockResolvedValue({ documentId: DOCUMENT, extractedTextSha256: TEXT_HASH });
  mocks.review.mockResolvedValue({ ok: true, state: 'confirmed', changes: [] });
});
describe('catalog HTTP source review binding', () => {
  it('carries the session actor into canonical reads', async () => {
    const result = await request(app()).get(endpoint);
    expect(result.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({ programId: PROGRAM, documentId: DOCUMENT, organizationId: 7, userId: 3 });
  });
  it.each(['confirm', 'correct'])('carries shown-text digest and session actor into %s', async action => {
    const result = await request(app()).post(`${endpoint}/${action}`).send({
      expectedExtractedTextSha256: TEXT_HASH, contentHash: 'a'.repeat(64), revision: 'rev', userId: 999,
    });
    expect(result.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith(expect.objectContaining({
      userId: 3, expectedExtractedTextSha256: TEXT_HASH, expectedContentHash: 'a'.repeat(64), expectedRevision: 'rev',
    }));
  });
  it.each([42, null, {}, false])('refuses malformed shown-text binding (%j) without downgrading to legacy review', async digest => {
    const result = await request(app()).post(`${endpoint}/confirm`).send({ expectedExtractedTextSha256: digest });
    expect(result.status).toBe(400);
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it('preserves a canonical source-change refusal', async () => {
    mocks.review.mockResolvedValue({ ok: false, status: 409, code: 'EXTRACTED_TEXT_CHANGED', message: 'Read the source again.' });
    const result = await request(app()).post(`${endpoint}/confirm`).send({ expectedExtractedTextSha256: TEXT_HASH });
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('EXTRACTED_TEXT_CHANGED');
    expect(result.body.success).toBe(false);
  });
  it('keeps a read failure visible', async () => {
    mocks.read.mockRejectedValue(new Error('read unavailable'));
    const result = await request(app()).get(endpoint);
    expect(result.status).toBe(500);
    expect(result.body.error).toBe('CATALOG_UNAVAILABLE');
    expect(result.body.success).toBe(false);
  });
});
