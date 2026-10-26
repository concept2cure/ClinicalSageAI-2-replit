/** F03: the real HTTP draft door must search the document's program Vault,
 * never unrelated organization atoms. Providers are stand-ins; no egress. */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  query: vi.fn(), search: vi.fn(), load: vi.fn(), route: vi.fn(), atoms: vi.fn(),
  park: vi.fn(async (..._args: unknown[]) => ({ id: 'draft-1', expiresAt: 'later' })),
}));
vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => h.query(...a) }, getPool: () => ({ query: (...a: unknown[]) => h.query(...a) }),
  // The actual router verifies the signed numeric principal and invokes its
  // membership reader. This unit provides that reader's owned membership row.
  db: { select: () => {
    const chain = { from: () => chain, leftJoin: () => chain, where: () => chain,
      limit: async () => [{ role: 'member', orgUuid: '77777777-7777-4777-8777-777777777777' }] };
    return chain;
  } },
}));
vi.mock('../../services/ai-gateway/gateway.js', () => ({ getGateway: () => ({ getEnabledProviders: () => ['anthropic'], route: h.route }) }));
vi.mock('../../services/enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({ searchHybrid: h.atoms }) }));
vi.mock('../../services/vault/document-passage-search.js', () => ({ searchDocumentPassages: h.search }));
vi.mock('../../services/vault/document-catalog.service.js', () => ({ loadDocumentForOrg: h.load }));
vi.mock('../../services/clinical-regulatory-evidence/draft-candidate-store.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/clinical-regulatory-evidence/draft-candidate-store.js')>()),
  createDraftCandidate: (...a: unknown[]) => h.park(...a),
}));
// This unit isolates canonical Vault passage wiring. Fresh project admission
// runs against actual SQL in authoringAssemblyDraftSafety.pglite.test.ts.
vi.mock('../../services/ana/project-scope-admission', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/ana/project-scope-admission')>()),
  admitAnaProjectScope: async (_q: unknown, input: { projectRef: string }) => ({ projectId: 42, programId: input.projectRef, projectRef: input.projectRef }),
}));
vi.mock('../../services/clinical-regulatory-evidence/retrieval-source-link.js', () => ({
  resolveEvidenceSourceIdsByArtifact: async () => new Map(),
  resolveEvidenceSourceIdsByVaultDocuments: async () => new Map(),
}));

process.env.JWT_SECRET ||= 'authoring-draft-program-sources-test';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;
import { runWithTenantScope } from '../../db/tenantStore';
import router from '../authoring.router';

const ORG_UUID = '77777777-7777-4777-8777-777777777777';
const PROGRAM = '88888888-8888-4888-8888-888888888888';
const VAULT_DOC = '99999999-9999-4999-8999-999999999999';
const HASH = 'a'.repeat(64);
let program: string | null = PROGRAM;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as typeof req & { dbClient: { query: typeof h.query } }).dbClient = { query: h.query };
    return runWithTenantScope({ tenantId: '7', orgUuid: ORG_UUID, role: 'member', source: 'request', caller: 'draft-program-test' }, next);
  });
  a.use('/api/authoring', router);
  return a;
}
async function draft() {
  const token = await new SignJWT({ sub: '5', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  return request(app()).post('/api/authoring/sections/S1/ai/draft').set('Authorization', `Bearer ${token}`).send({ region: 'FDA' });
}

beforeEach(() => {
  vi.clearAllMocks(); program = PROGRAM;
  h.query.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    // The canonical reference-size aggregate returns one zero row on an empty audit set.
    if (s.includes('AS reference_bytes')) return { rowCount: 1, rows: [{ reference_bytes: 0 }] };
    if (s.includes('d.status')) return { rowCount: 1, rows: [{ status: null }] };
    if (s.includes('authoring_sections')) return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', code: '3.2.S', title: 'Drug Substance', content: '', module: 'M3', product_code: 'ABC', client_program_id: program }] };
    return { rowCount: 0, rows: [] };
  });
  h.atoms.mockResolvedValue([{ id: 'foreign', content: 'Unrelated program assay was 99%.', title: 'Other program', sourceId: null, score: 1 }]);
  h.search.mockResolvedValue({ hits: [{ documentId: VAULT_DOC, documentTitle: 'Current project assay', text: 'Current project assay was 95%.', similarity: 1, pageNumber: 3, locator: 'p.3' }], coverage: null, ranking: 'text' });
  h.load.mockResolvedValue({ id: VAULT_DOC, programId: PROGRAM, contentHash: HASH, version: '1.0', documentTitle: 'Current project assay', fileName: 'assay.pdf', extractedText: 'Current project assay was 95%.', disposition: null, catalog: { contentHash: HASH, status: 'extracted' } });
  h.route.mockResolvedValue({ content: JSON.stringify({ content: 'The assay was 95%.', attributions: [] }), model: 'claude-x', provider: 'anthropic' });
});

describe('section draft uses current program evidence', () => {
  it('searches program Vault passages and parks the exact version receipt without invented citations', async () => {
    const res = await draft();
    expect(res.status).toBe(200);
    expect(h.search).toHaveBeenCalledWith(expect.objectContaining({ query: expect.any(Function) }), { organizationId: 7, userId: 5, organizationUuid: ORG_UUID, query: 'M3 3.2.S Drug Substance ABC' }, { limit: 5, programId: PROGRAM });
    expect(h.load).toHaveBeenCalledWith(VAULT_DOC, 7, { executor: h.search.mock.calls[0][0], userId: 5, programId: PROGRAM, currentOnly: true });
    expect(h.atoms).not.toHaveBeenCalled();
    const prompt = h.route.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Current project assay was 95%.');
    expect(prompt).not.toContain('Unrelated program');
    expect(h.park.mock.calls[0][3]).toEqual([]); // No canonical CRE link is fabricated.
    expect(h.park.mock.calls[0][6]).toMatchObject({ vaultSources: { programId: PROGRAM, retrievedBy: 5, documents: [{ documentId: VAULT_DOC, contentHash: HASH, version: '1.0' }] } });
  });

  it('reports unavailable scope without searching every program as a fallback', async () => {
    program = null;
    const res = await draft();
    expect(res.status).toBe(200);
    expect(res.body.draft.metadata.retrievalStatus).toBe('failed');
    expect(h.search).not.toHaveBeenCalled();
    expect(h.atoms).not.toHaveBeenCalled();
  });

  it('rejects a returned passage whose current document belongs to another program', async () => {
    h.load.mockResolvedValue({ id: VAULT_DOC, programId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contentHash: HASH, version: '1.0', catalog: { contentHash: HASH, status: 'extracted' } });
    const res = await draft();
    expect(res.body.draft.metadata.retrievalStatus).toBe('failed');
    expect(h.route.mock.calls[0][0].messages[0].content).not.toContain('Current project assay was 95%.');
  });
});
