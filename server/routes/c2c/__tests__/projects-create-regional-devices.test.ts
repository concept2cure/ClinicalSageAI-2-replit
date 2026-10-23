import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...args: unknown[]) => query(...args), connect: async () => ({ query: (...args: unknown[]) => query(...args), release() {} }) } }));
const scaffold = vi.hoisted(() => vi.fn(async (): Promise<{ documentId: string | null; sectionCount: number; skipped?: string }> => ({ documentId: 'doc_test', sectionCount: 8 })));
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({ scaffoldProjectDocuments: scaffold }));
const submission = vi.hoisted(() => vi.fn());
vi.mock('../../../services/submission-service/submission-service.js', () => ({ createSubmissionTx: submission }));
vi.mock('../../../services/license-manager.js', () => ({ checkProgramQuota: async () => ({ withinQuota: true }) }));
vi.mock('../../../services/audit/chain.js', () => ({ hashPayload: () => 'test-hash', computeAuditChainSealed: async () => ({ sha256Chain: 'test-chain', hmacSeal: 'test-seal' }) }));
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
import router from '../projects';
import { clearSeats, seatMember } from './support/current-member';
import { resolveGovernedDocument } from '../../../services/c2c/governed-document-binding';

function app() {
  const a = express(); a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { organizationId: 7, userId: 3, dbClient: { query: (...args: unknown[]) => query(...args) } }); next();
  });
  a.use('/api/c2c/projects', router); return a;
}
function queueCreate() {
  for (const result of [[], [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }], [{ has_column: 1, workspace_count: 1, workspace_id: 55, default_workspace_id: null }], [], [{ id: 55, name: 'Fixture client' }], [{ id: 9001 }], [], [], [{ id: 'x', title: 'Meter' }], [{ id: 'b6d3e141-7abb-4f1d-9b8b-f0f334604a05' }]]) query.mockResolvedValueOnce({ rows: result });
}
function inserted() {
  const call = query.mock.calls.find(c => String(c[0]).includes('INSERT INTO regulatory_programs'));
  expect(call).toBeDefined();
  const columns = String(call![0]).match(/\(([\s\S]*?)\)\s*VALUES/)![1].split(',').map(v => v.trim());
  const values = String(call![0]).match(/VALUES\s*\(([\s\S]*?)\)\s*RETURNING/)![1].split(',').map(v => v.trim());
  return Object.fromEntries(columns.map((column, i) => {
    const param = values[i].match(/^\$(\d+)/);
    return [column, param ? call![1][Number(param[1]) - 1] : values[i]];
  }));
}
beforeEach(() => { query.mockReset(); scaffold.mockReset(); scaffold.mockResolvedValue({ documentId: 'doc_test', sectionCount: 8 }); submission.mockReset(); query.mockResolvedValue({ rows: [] }); clearSeats(); seatMember(7, 3, 'member'); });

const regional = [
  ['us_hde', 'hde', 'FDA', 'device'], ['ca_mdl', 'mdl', 'Health Canada', 'device'],
  ['ca_ivd_licence', 'ivd_licence', 'Health Canada', 'ivd'], ['jp_shonin', 'shonin', 'PMDA', 'device'],
  ['jp_nintei', 'ninsho', 'Registered certification body', 'device'], ['jp_todokede', 'todokede', 'PMDA', 'device'],
  ['jp_ivd_approval', 'ivd_approval', 'PMDA', 'ivd'], ['jp_cdx', 'jp_cdx', 'PMDA', 'cdx'],
] as const;
const body = (row: readonly [string, string, string, string]) => ({ name: 'Exact regional preparation', submissionTypeId: row[0], programType: row[1], primaryAgency: row[2], productType: row[3], deviceClassification: { intendedUse: 'Sponsor-stated purpose' } });

describe('regional applications create only their exact authoring project', () => {
  it.each(regional)('%s creates a governed working file without a medicinal submission', async (...row) => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send(body(row));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.meta.marketSupport.tier).toBe('author_only');
    expect(inserted()).toMatchObject({ program_type: row[1], primary_agency: row[2] === 'Health Canada' ? 'Health_Canada' : row[2] === 'Registered certification body' ? 'Registered_Certification_Body' : row[2], product_type: row[3], device_class: null, eu_mdr_class: null, eu_ivdr_class: null });
    expect(scaffold).toHaveBeenCalledWith(expect.objectContaining({ programType: row[1], primaryAgency: row[2] === 'Health Canada' ? 'Health_Canada' : row[2] === 'Registered certification body' ? 'Registered_Certification_Body' : row[2] }));
    expect(submission).not.toHaveBeenCalled();
  });
  it.each(regional)('%s can identify its source without a redundant filing ID', async (...row) => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send({ ...body(row), submissionTypeId: undefined });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(JSON.parse(String(inserted().metadata)).submissionTypeId).toBe(row[0].toUpperCase());
    expect(submission).not.toHaveBeenCalled();
  });
  it.each([
    { index: 0, alias: 'US', canonical: 'FDA', packAgency: 'fda' },
    { index: 1, alias: 'CA', canonical: 'Health_Canada', packAgency: 'hc' },
    { index: 3, alias: 'JP', canonical: 'PMDA', packAgency: 'pmda' },
    { index: 4, alias: 'jp_rcb', canonical: 'Registered_Certification_Body', packAgency: 'jp_rcb' },
  ])('$alias intake saves an authority that later raw document binding can resolve', async ({ index, alias, canonical, packAgency }) => {
    queueCreate(); const row = regional[index];
    const response = await request(app()).post('/api/c2c/projects').send({ ...body(row), primaryAgency: alias, submissionTypeId: undefined });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const saved = inserted(); expect(saved.primary_agency).toBe(canonical);
    const read = vi.fn(async (sql: string, values?: unknown[]) => {
      if (sql.includes('FROM regulatory_programs')) return { rows: [saved] };
      expect(values?.slice(2)).toEqual([row[1], [packAgency]]);
      return { rows: [{ id: 'doc_regional' }] };
    });
    expect(await resolveGovernedDocument({ db: { query: read } as never, orgId: 7, projectId: '11111111-1111-1111-1111-111111111111' })).toEqual({ documentId: 'doc_regional' });
  });
  it('program-only creation still refuses a wrong authority', async () => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send({ ...body(regional[4]), submissionTypeId: undefined, primaryAgency: 'PMDA' });
    expect(response.status).toBe(422);
    expect(query.mock.calls.some(c => String(c[0]).includes('INSERT INTO regulatory_programs'))).toBe(false);
  });
  it.each([
    ['conflicting program', { programType: 'pma', primaryAgency: 'FDA' }],
    ['conflicting regional identity', { submissionTypeId: 'jp_shonin' }],
    ['unknown filing', { submissionTypeId: 'not_a_filing' }],
    ['medicinal identity', { submissionTypeId: 'us_nda' }],
    ['wrong product family', { productType: 'ivd' }],
    ['medicinal product', { productType: 'drug' }],
    ['wrong authority', { primaryAgency: 'PMDA' }],
    ['FDA classification', { deviceClassification: { deviceClass: 'II' } }],
  ])('refuses %s before writing', async (_name, change) => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send({ ...body(regional[1]), ...change });
    expect([400, 422]).toContain(response.status);
    expect(query.mock.calls.some(c => String(c[0]).includes('INSERT INTO regulatory_programs'))).toBe(false);
    expect(submission).not.toHaveBeenCalled();
  });
  it('a missing exact pack rolls back instead of leaving an empty project', async () => {
    queueCreate(); scaffold.mockResolvedValueOnce({ documentId: null, sectionCount: 0, skipped: 'NO_RULE_PACK' });
    const response = await request(app()).post('/api/c2c/projects').send(body(regional[4]));
    expect(response.status, JSON.stringify(response.body)).toBe(422);
    expect(query.mock.calls.some(c => String(c[0]).trim() === 'ROLLBACK')).toBe(true);
    expect(query.mock.calls.some(c => String(c[0]).trim() === 'COMMIT')).toBe(false);
  });
});
