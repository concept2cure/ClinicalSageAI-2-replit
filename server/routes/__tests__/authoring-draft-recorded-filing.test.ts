/**
 * P-73 slice 2: the editor's "Draft from sources" drafts against the application the project records.
 *
 * The route built its prompt from a region label (the panel sends FDA unless changed) and the saved template
 * only. It never consulted the recorded filing or the canonical requirements resolver that AnA's batch
 * drafting uses (draft-submission-context.ts, AnaDocumentDraftingService.resolveDraftingRequirements), so a
 * Health Canada CTA section was asked for as "FDA regulatory content" with no Canadian requirements.
 * docs/design/TRIAL_APPLICATION_DRAFTING_2026-10-30.md, slice 2. Providers are stand-ins; no egress.
 */
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
// Program admission is tested on real SQL elsewhere; here the document's saved program is the open one.
vi.mock('../../services/c2c/program-access.js', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/c2c/program-access.js')>()),
  resolveOpenProgram: async (_q: unknown, ctx: { projectRef?: string | null }) => ctx.projectRef ?? null,
}));
vi.mock('../../services/clinical-regulatory-evidence/retrieval-source-link.js', () => ({
  resolveEvidenceSourceIdsByArtifact: async () => new Map(),
  resolveEvidenceSourceIdsByVaultDocuments: async () => new Map(),
}));

process.env.JWT_SECRET ||= 'authoring-draft-recorded-filing-test';
process.env.JWT_SECRET_DEV = process.env.JWT_SECRET;
import { runWithTenantScope } from '../../db/tenantStore';
import router from '../authoring.router';

const ORG_UUID = '77777777-7777-4777-8777-777777777777';
const PROGRAM = '88888888-8888-4888-8888-888888888888';
let filing: { program_type: string; primary_agency: string; metadata: unknown } | null = null;
let code = '1.2.1';
let product: Record<string, unknown> = {};
let charters: Record<string, unknown>[] = [];
let charterReadFailed = false;

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as typeof req & { dbClient: { query: typeof h.query } }).dbClient = { query: h.query };
    return runWithTenantScope({ tenantId: '7', orgUuid: ORG_UUID, role: 'member', source: 'request', caller: 'draft-filing-test' }, next);
  });
  a.use('/api/authoring', router);
  return a;
}
async function draft(region = 'FDA') {
  const token = await new SignJWT({ sub: '5', organizationId: 7, email: 'author@test.co' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('5m')
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  return request(app()).post('/api/authoring/sections/S1/ai/draft').set('Authorization', `Bearer ${token}`).send({ region });
}
const prompt = () => String(h.route.mock.calls[0][0].messages[0].content);

beforeEach(() => {
  vi.clearAllMocks(); filing = null; code = '1.2.1';
  product = {}; charters = []; charterReadFailed = false;
  h.query.mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM project_charters')) {
      if (charterReadFailed) throw new Error('unavailable');
      return { rowCount: charters.length, rows: charters };
    }
    if (s.includes('SELECT product_type, indication,')) return { rowCount: 1, rows: [{ ...product, ...filing }] };
    if (s.includes('AS reference_bytes')) return { rowCount: 1, rows: [{ reference_bytes: 0 }] };
    if (s.includes('d.status')) return { rowCount: 1, rows: [{ status: null }] };
    if (s.includes('authoring_sections')) return { rowCount: 1, rows: [{ id: 'S1', doc_id: 'D1', code, title: 'Section', content: '', module: 'M1', product_code: 'ABC', client_program_id: PROGRAM }] };
    if (s.includes('FROM regulatory_programs') && s.includes('primary_agency')) return { rowCount: filing ? 1 : 0, rows: filing ? [filing] : [] };
    return { rowCount: 0, rows: [] };
  });
  h.search.mockResolvedValue({ hits: [], coverage: null, ranking: 'text' });
  h.route.mockResolvedValue({ content: JSON.stringify({ content: 'Draft.', attributions: [] }), model: 'claude-x', provider: 'anthropic' });
});

describe('the editor drafts against the application the project records', () => {
  it('a Health Canada CTA section is drafted with its recorded application and requirements', async () => {
    filing = { program_type: 'cta', primary_agency: 'HEALTH_CANADA', metadata: null };
    const res = await draft('Health Canada');
    expect(res.status).toBe(200);
    expect(prompt()).toContain('Generate professional Health Canada regulatory content');
    expect(prompt()).toContain('RECEIVING APPLICATION ON RECORD: Clinical Trial Application (Canada) (CA_CTA), filed with Health Canada.');
    expect(prompt()).toContain('SECTION REQUIREMENTS (from the Clinical Trial Application (Canada) authoring blueprint)');
    expect(prompt()).toContain('signed HC/SC 3011');
    expect(prompt()).not.toMatch(/differs from the application on record/);
    expect(res.body.draft.metadata).toMatchObject({ submissionType: 'CA_CTA' });
    expect(res.body.draft.metadata.requirementsSource).not.toBe('none');
  });

  it('a UK CTA section asked for as FDA content says the application on record differs, and that its Module 1 has no entry', async () => {
    filing = { program_type: 'cta', primary_agency: 'MHRA', metadata: null };
    await draft('FDA');
    expect(prompt()).toContain('Clinical Trial Authorisation (UK)');
    expect(prompt()).toMatch(/requested writing region FDA differs from the application on record \(MHRA\)/);
    expect(prompt()).toContain('no UK (MHRA) Module 1 entry for 1.2.1');
  });

  it('a project whose application cannot be resolved is told so, and no jurisdiction is assumed', async () => {
    filing = { program_type: 'cta', primary_agency: 'TGA', metadata: null };
    const res = await draft('FDA');
    expect(prompt()).toContain('SUBMISSION REQUIREMENTS STATUS: UNASSESSED');
    expect(res.body.draft.metadata.submissionType ?? null).toBeNull();
  });

  it('a US IND section is drafted for FDA with the US IND record, as before', async () => {
    filing = { program_type: 'ind', primary_agency: 'FDA', metadata: null };
    code = '2.6.1';
    const res = await draft('FDA');
    expect(prompt()).toContain('Generate professional FDA regulatory content');
    expect(prompt()).toContain('RECEIVING APPLICATION ON RECORD:');
    expect(prompt()).not.toMatch(/differs from the application on record/);
    expect(res.body.draft.metadata).toMatchObject({ submissionType: 'US_IND' });
  });
});


describe('the editor uses current recorded product context', () => {
  function recordedProduct() {
    filing = { program_type: 'ind', primary_agency: 'FDA', metadata: { submissionTypeId: 'us_ind' } };
    code = '2.5';
    product = { product_type: 'monoclonal_antibody', indication: 'Recorded indication' };
    charters = [{ id: 12, version: 3, updated_at: '2026-10-30T00:00:00Z', approval_status: 'draft',
      therapeutic_area: 'oncology', development_stage: 'phase_2', target_population: 'Adults' }];
  }

  it('carries the charter and product facts into the actual gateway prompt as unqualified records', async () => {
    recordedProduct();
    const res = await draft();
    expect(res.status).toBe(200);
    expect(prompt()).toContain('RECORDED PRODUCT CONTEXT');
    expect(prompt()).toContain('phase_2');
    expect(prompt()).toContain('Recorded indication');
    expect(prompt()).toContain('Adults');
    expect(prompt()).toContain('Therapeutic Area Context — Oncology');
    expect(prompt()).toContain('not scientific evidence');
    expect(h.route.mock.calls[0][0]).toMatchObject({ organizationId: 7, userId: 5, projectId: 42 });
  });

  it('does not choose an arbitrary charter when more than one is recorded', async () => {
    recordedProduct(); charters.push({ ...charters[0], id: 13, therapeutic_area: 'neurology' });
    const res = await draft();
    expect(res.status).toBe(200);
    expect(prompt()).toContain('ambiguous');
    expect(prompt()).not.toContain('Therapeutic Area Context — Oncology');
    expect(prompt()).not.toContain('Therapeutic Area Context — Neurology');
  });

  it('does not call a provider or park a draft if the recorded facts cannot be read', async () => {
    recordedProduct(); charterReadFailed = true;
    const res = await draft();
    expect(res.status).toBe(503);
    expect(h.route).not.toHaveBeenCalled();
    expect(h.park).not.toHaveBeenCalled();
  });

  it('does not retain a response after the charter changes during generation', async () => {
    recordedProduct();
    h.route.mockImplementationOnce(async () => {
      charters[0] = { ...charters[0], version: 4, development_stage: 'phase_3' };
      return { content: JSON.stringify({ content: 'Draft.', attributions: [] }), model: 'claude-x', provider: 'anthropic' };
    });
    const res = await draft();
    expect(res.status).toBe(409);
    expect(h.park).not.toHaveBeenCalled();
  });
});
