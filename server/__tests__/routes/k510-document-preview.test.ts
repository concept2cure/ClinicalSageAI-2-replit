/** Preview scope over real SQL rows; admission is separately qualified by its canonical service. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const state = vi.hoisted(() => ({
  pg: null as PGlite | null,
  user: { id: 1, organizationId: 7 } as Record<string, unknown> | null,
  admission: vi.fn(), audit: vi.fn().mockResolvedValue({ persisted: true, chained: true, tamperProof: true }),
  failContent: false,
}));
vi.mock('../../middleware/auth', () => ({ authenticateToken: (req: Request, _res: Response, next: NextFunction) => { (req as unknown as { user: unknown }).user = state.user; next(); } }));
vi.mock('../../db', () => ({ db: {}, pool: {} }));
vi.mock('../../services/auditService', () => ({ default: { logAction: state.audit } }));
vi.mock('../../services/c2c/current-program-access', () => ({
  requireCurrentProgramAccess: (...args: unknown[]) => state.admission(...args),
  ProgramReadAccessError: class extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } },
}));
import { ProgramReadAccessError } from '../../services/c2c/current-program-access';
import preview from '../../routes/k510-document-preview';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const q = { query: (text: string, params?: unknown[]) => {
  if (state.failContent && /FROM c2c_document_sections/.test(text)) return Promise.reject(new Error('store unavailable'));
  return state.pg!.query(text, params);
} };
const app = express();
app.use((req, _res, next) => { (req as unknown as { dbClient: typeof q }).dbClient = q; next(); });
app.use('/api/510k/projects', preview);
const get = (ident = A, query = '') => request(app).get(`/api/510k/projects/${ident}/document-preview${query}`);

beforeAll(async () => {
  state.pg = new PGlite();
  // Minimal existing-store contract fixture, not a migration/install qualification.
  await state.pg.exec(`CREATE TABLE regulatory_programs(id uuid PRIMARY KEY, organization_id int, name text, code text, status text, program_type text, deleted_at timestamptz);
    CREATE TABLE projects(id int PRIMARY KEY, organization_id int, regulatory_program_id uuid);
    CREATE TABLE fda_510k_projects(id int PRIMARY KEY, organization_id int, project_id int);
    CREATE TABLE c2c_documents(id text PRIMARY KEY, org_id int, project_id uuid, doc_type text, created_at timestamptz DEFAULT now());
    CREATE TABLE c2c_document_sections(id bigserial PRIMARY KEY, document_id text, section_key text, label text, status text, content jsonb, mandatory bool, path_order int);`);
});
afterAll(async () => { await state.pg?.close(); });
beforeEach(async () => {
  vi.clearAllMocks(); state.failContent = false; state.user = { id: 1, organizationId: 7 };
  state.admission.mockResolvedValue({ actor: { userId: 1, role: 'owner' }, programId: A, projectId: 10 });
  await state.pg!.exec(`TRUNCATE regulatory_programs, projects, fda_510k_projects, c2c_documents, c2c_document_sections;
    INSERT INTO regulatory_programs(id,organization_id,name,code,status,program_type) VALUES
      ('${A}',7,'Project A','OR-801','active','510k'),('${B}',7,'Private project B','B-801','active','cer'),('${C}',8,'Other tenant','C-801','active','cer');
    INSERT INTO projects VALUES (10,7,'${A}'),(11,7,NULL);
    INSERT INTO fda_510k_projects VALUES (20,7,10),(21,7,11);
    INSERT INTO c2c_documents(id,org_id,project_id,doc_type) VALUES
      ('a-k510',7,'${A}','k510'),('a-cer',7,'${A}','cer'),('b-cer',7,'${B}','cer'),('c-cer',8,'${C}','cer');
    INSERT INTO c2c_document_sections(document_id,section_key,label,status,content,mandatory,path_order) VALUES
      ('a-k510','6.1','Substantial Equivalence','approved','{"text":"A FDA evidence"}',true,1),
      ('a-k510','6.2','Performance testing','todo','{}',true,2),
      ('a-cer','C2','Clinical evaluation scope','draft','{"text":"A clinical evidence"}',true,1),
      ('b-cer','C2','Private clinical data','approved','{"text":"B PRIVATE EVIDENCE"}',true,1),
      ('c-cer','C2','Other tenant data','approved','{"text":"OTHER TENANT"}',true,1);`);
});

describe('MDX document preview project/document isolation', () => {
  it('requires authenticated organization context', async () => { state.user = null; expect((await get()).status).toBe(403); });
  it('assembles only the primary document with exact section keys and no invented percentage', async () => {
    const res = await get();
    expect(res.status).toBe(200); expect(res.body.documentId).toBe('a-k510'); expect(res.body.docType).toBe('k510');
    expect(res.body.sections.map((row: { sectionKey: string }) => row.sectionKey)).toEqual(['6.1', '6.2']);
    expect(res.body.assembledMarkdown).toContain('A FDA evidence');
    expect(res.body.assembledMarkdown).toContain('Section pending — required for submission');
    expect(res.body.assembledMarkdown).not.toMatch(/A clinical evidence|PRIVATE|OTHER TENANT/);
    expect(res.body.completionPercentage).toBeNull(); expect(res.body.approvedCount).toBe(1);
    expect(state.admission).toHaveBeenCalledWith(q, { organizationId: 7, userId: 1, programId: A });
  });
  it('opens an explicitly requested secondary CER without borrowing another project or filing', async () => {
    const res = await get(A, '?docType=cer');
    expect(res.status).toBe(200); expect(res.body.documentId).toBe('a-cer'); expect(res.body.sections).toHaveLength(1);
    expect(res.body.assembledMarkdown).toContain('A clinical evidence');
    expect(res.body.assembledMarkdown).not.toMatch(/A FDA evidence|PRIVATE|OTHER TENANT/);
  });
  it('reports an absent requested document as empty rather than substituting the primary', async () => {
    const res = await get(A, '?docType=ivdr');
    expect(res.status).toBe(200); expect(res.body.documentId).toBeNull(); expect(res.body.sections).toEqual([]);
  });
  it('rejects invalid or repeated requested document classes', async () => {
    expect((await get(A, '?docType=ind')).status).toBe(422);
    expect((await get(A, '?docType=cer&docType=k510')).status).toBe(422);
  });
  it('keeps a failed content read distinct from an empty document', async () => {
    state.failContent = true; const res = await get();
    expect(res.status).toBe(503); expect(res.body.sections).toBeUndefined(); expect(state.audit).not.toHaveBeenCalled();
  });
  it('preserves current project-sharing denial before reading or auditing content', async () => {
    state.admission.mockRejectedValue(new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Current project access does not permit this operation.'));
    const res = await get(B, '?docType=cer');
    expect(res.status).toBe(403); expect(JSON.stringify(res.body)).not.toContain('B PRIVATE EVIDENCE'); expect(state.audit).not.toHaveBeenCalled();
  });
  it('does not resolve another tenant or a deleted program', async () => {
    expect((await get(C)).status).toBe(404);
    await state.pg!.query('UPDATE regulatory_programs SET deleted_at=now() WHERE id=$1', [A]);
    expect((await get()).status).toBe(404);
  });
  it('resolves codes and numeric identifiers through the recorded canonical anchor only', async () => {
    expect((await get('OR-801')).body.documentId).toBe('a-k510');
    expect((await get('20')).body.projectId).toBe(A);
    expect((await get('21')).status).toBe(409);
  });
  it('audits the actual program, document and requested class', async () => {
    await get(A, '?docType=cer');
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'k510_workflow.document_preview.read', tenantId: 7,
      details: expect.objectContaining({ programId: A, documentId: 'a-cer', docType: 'cer' }) }));
  });
});
