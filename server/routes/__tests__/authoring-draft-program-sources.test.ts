/** F03: the real HTTP draft door must search the document's program Vault,
 * never unrelated organization atoms. Providers are stand-ins; no egress. */
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  query: vi.fn(), search: vi.fn(), load: vi.fn(), route: vi.fn(), atoms: vi.fn(),
  park: vi.fn(async (..._args: unknown[]) => ({ id: 'draft-1', expiresAt: 'later' })), link: false,
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
  resolveEvidenceSourceIdsByArtifact: async () => h.link ? new Map([['cre_source:42', 42]]) : new Map(),
  resolveEvidenceSourceIdsByVaultDocuments: async () => h.link ? new Map([['99999999-9999-4999-8999-999999999999', 42]]) : new Map(),
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
let section = { code: '3.2.S', title: 'Drug Substance', module: 'M3' };

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
  vi.clearAllMocks(); program = PROGRAM; h.link = false;
  section = { code: '3.2.S', title: 'Drug Substance', module: 'M3' };
  h.query.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('SELECT product_type, indication,')) return { rowCount: 1, rows: [{}] };
    // The canonical reference-size aggregate returns one zero row on an empty audit set.
    if (s.includes('AS reference_bytes')) return { rowCount: 1, rows: [{ reference_bytes: 0 }] };
    if (s.includes('d.status')) return { rowCount: 1, rows: [{ status: null }] };
    if (s.includes('authoring_sections')) return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', ...section, content: '', product_code: 'ABC', client_program_id: program }] };
    return { rowCount: 0, rows: [] };
  });
  h.atoms.mockResolvedValue([{ id: 'foreign', content: 'Unrelated program assay was 99%.', title: 'Other program', sourceId: null, score: 1 }]);
  h.search.mockResolvedValue({ hits: [{ documentId: VAULT_DOC, documentTitle: 'Current project assay', text: 'Current project assay was 95%.', similarity: 1, pageNumber: 3, locator: 'p.3' }], coverage: null, ranking: 'text' });
  h.load.mockResolvedValue({ id: VAULT_DOC, programId: PROGRAM, contentHash: HASH, version: '1.0', documentTitle: 'Current project assay', fileName: 'assay.pdf', extractedText: 'Current project assay was 95%.', disposition: null, catalog: { contentHash: HASH, status: 'extracted' } });
  h.route.mockResolvedValue({ content: JSON.stringify({ content: 'The assay was 95%.', attributions: [] }), model: 'claude-x', provider: 'anthropic' });
});

describe('section draft uses current program evidence', () => {
  it('shows distant clinical context with exact receipts and quotes only from individual shown spans', async () => {
    section = { code: '2.5', title: 'Clinical Overview', module: 'M2' }; h.link = true;
    const filler = '\nBackground administrative text.\n'.repeat(150);
    const text = 'Clinical study report cover.\n' + filler +
      '\nSTUDY METHODS\nPatients were randomized double-blind with prespecified eligibility criteria.\n' + filler +
      '\nANALYSIS POPULATION\nThe intention-to-treat denominator was 300 randomized participants.\n' + filler +
      '\nSAFETY\nSerious adverse events were assessed in 299 exposed participants.\n' + filler +
      '\nLIMITATIONS\nMissing outcome data and post-hoc subgroup analyses limit interpretation.\n' + filler;
    h.search.mockResolvedValue({ hits: [{ documentId: VAULT_DOC, documentTitle: 'Clinical study report', text, similarity: 1 }], coverage: null, ranking: 'text' });
    h.load.mockResolvedValue({ id: VAULT_DOC, programId: PROGRAM, contentHash: HASH, version: '1.0', documentTitle: 'Clinical study report', fileName: 'csr.pdf', extractedText: text, disposition: null, catalog: { contentHash: HASH, status: 'extracted' } });
    expect((await draft()).status).toBe(200);
    const sent = h.route.mock.calls[0][0].messages[0].content;
    for (const fact of ['prespecified eligibility', '300 randomized participants', '299 exposed participants', 'post-hoc subgroup']) expect(sent).toContain(fact);
    expect(sent).toContain('characters omitted and not shown');
    const generator = h.park.mock.calls[0][6] as { retrievalExcerpts: Array<{ selection: { shownChars: number; spans: Array<{ start: number; end: number }> } }> };
    const receipt = generator.retrievalExcerpts[0].selection;
    expect(receipt.shownChars).toBeLessThanOrEqual(2400);
    expect(receipt.spans.length).toBeGreaterThan(1);
    expect(h.park.mock.calls[0][3]).toEqual(receipt.spans.map(span => ({ evidenceSourceId: 42, content: text.slice(span.start, span.end), title: 'Clinical study report' })));
  });
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

  it('does not deliver or park prose when the retrieved Vault version changes during generation', async () => {
    h.route.mockImplementationOnce(async () => {
      h.load.mockResolvedValue({ id: VAULT_DOC, programId: PROGRAM, contentHash: 'b'.repeat(64), version: '2.0', catalog: { contentHash: 'b'.repeat(64), status: 'extracted' } });
      return { content: JSON.stringify({ content: 'Stale assay draft.', attributions: [] }), model: 'test', provider: 'test' };
    });
    const result = await draft();
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe('DRAFT_SOURCES_UNAVAILABLE');
    expect(result.body.draft).toBeUndefined();
    expect(h.park).not.toHaveBeenCalled();
  });
});
