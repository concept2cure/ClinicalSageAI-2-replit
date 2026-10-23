import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const query = vi.fn();
vi.mock('../../../db.js', () => ({ pool: { query: (...args: unknown[]) => query(...args), connect: async () => ({ query: (...args: unknown[]) => query(...args), release() {} }) } }));
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({ scaffoldProjectDocuments: async () => ({ documentId: 'doc_test', sectionCount: 24 }) }));
vi.mock('../../../services/license-manager.js', () => ({ checkProgramQuota: async () => ({ withinQuota: true }) }));
vi.mock('../../../services/audit/chain.js', () => ({ hashPayload: () => 'test-hash', computeAuditChainSealed: async () => ({ sha256Chain: 'test-chain', hmacSeal: 'test-seal' }) }));
vi.mock('../../../services/c2c/current-program-access', async (original) => {
  const real = await original<typeof import('../../../services/c2c/current-program-access')>();
  return { ...real, ...(await import('./support/current-member')).currentAccessDouble(real.ProgramReadAccessError) };
});
import router from '../projects';
import { clearSeats, seatMember } from './support/current-member';

function app() {
  const a = express(); a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { organizationId: 7, userId: 3, dbClient: { query: (...args: unknown[]) => query(...args) } }); next();
  });
  a.use('/api/c2c/projects', router); return a;
}
const eu = (type = 'mdr') => ({ name: 'Regional device file', productName: 'Meter', programType: type, productType: type === 'ivdr' ? 'ivd' : 'device', primaryAgency: 'EU / Notified Body', submissionTypeId: type === 'ivdr' ? 'eu_ivdr' : 'eu_mdr_techdoc' });
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
beforeEach(() => { query.mockReset(); query.mockResolvedValue({ rows: [] }); clearSeats(); seatMember(7, 3, 'member'); });

describe('EU classes use the existing regional programme columns at initialization', () => {
  it.each([
    { type: 'pma', filing: 'cdx_pma', product: 'ivd' },
    { type: 'pma', filing: 'US_CDX_510K', product: 'cdx' },
    { type: '510k', filing: 'US_PMA', product: 'device' },
    { type: 'pma', filing: 'us_cdx_typo', product: 'ivd' },
  ])('refuses contradictory named filing $filing before writes', async ({ type, filing, product }) => {
    queueCreate();
    const response = await request(app()).post('/api/c2c/projects').send({ name: 'Named device identity', programType: type, productType: product, primaryAgency: 'FDA', submissionTypeId: filing });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(query.mock.calls.some(c => /INSERT|UPDATE|DELETE/.test(String(c[0])))).toBe(false);
  });
  it.each([
    { type: 'pma', filing: 'US_CDX_PMA', product: 'cdx' },
    { type: '510k', filing: 'US_CDX_510K', product: 'cdx' },
    { type: '510k', filing: 'US_510K', product: 'samd' },
  ])('persists the compatible $product identity for $filing', async ({ type, filing, product }) => {
    queueCreate();
    const response = await request(app()).post('/api/c2c/projects').send({ name: 'Named device identity', programType: type, productType: product, primaryAgency: 'FDA', submissionTypeId: filing });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(inserted()).toMatchObject({ program_type: type, product_type: product });
  });
  it.each([
    ['pma', 'cdx_pma', 'FDA'], ['510k', 'US_CDX_510K', 'FDA'], ['ivdr', 'cdx_ivdr_d', 'EU / Notified Body'],
  ])('infers and persists CDx from %s / %s when no subtype was sent', async (type, filing, agency) => {
    queueCreate();
    const response = await request(app()).post('/api/c2c/projects').send({ name: 'Named companion diagnostic', programType: type, primaryAgency: agency, submissionTypeId: filing });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(inserted()).toMatchObject({ program_type: type, product_type: 'cdx' });
  });
  it('does not use a class-specific EU identity for an FDA application, even with an unconfirmed class', async () => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send({ name: 'Wrong regional identity', programType: '510k', productType: 'device', primaryAgency: 'FDA', submissionTypeId: 'eu_mdr_class_iii' });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(query.mock.calls.some(c => String(c[0]).includes('INSERT INTO regulatory_programs'))).toBe(false);
  });

  it.each([
    { type: 'mdr', filing: 'eu_mdr_class_iii', field: 'euMdrClass', value: 'I' },
    { type: 'mdr', filing: 'eu_mdr_class_iia', field: 'euMdrClass', value: 'IIb' },
    { type: 'ivdr', filing: 'eu_ivdr_class_a', field: 'euIvdrClass', value: 'D' },
    { type: 'ivdr', filing: 'eu_ivdr_class_cd', field: 'euIvdrClass', value: 'B' },
  ])('$filing refuses contradictory declared class $value', async ({ type, filing, field, value }) => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send({ ...eu(type), submissionTypeId: filing, [field]: value });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(query.mock.calls.some(c => String(c[0]).includes('INSERT INTO regulatory_programs'))).toBe(false);
  });

  it.each([
    { type: 'mdr', filing: 'eu_mdr_class_i', field: 'euMdrClass', value: 'Is', column: 'eu_mdr_class' },
    { type: 'mdr', filing: 'eu_mdr_class_i', field: 'euMdrClass', value: 'Im', column: 'eu_mdr_class' },
    { type: 'mdr', filing: 'eu_mdr_class_i', field: 'euMdrClass', value: 'Ir', column: 'eu_mdr_class' },
    { type: 'ivdr', filing: 'eu_ivdr_class_cd', field: 'euIvdrClass', value: 'C', column: 'eu_ivdr_class' },
    { type: 'ivdr', filing: 'eu_ivdr_class_cd', field: 'euIvdrClass', value: 'D', column: 'eu_ivdr_class' },
    { type: 'mdr', filing: 'eu_mdr_class_iii', field: 'euMdrClass', value: null, column: 'eu_mdr_class' },
  ])('$filing retains compatible or unconfirmed class $value', async ({ type, filing, field, value, column }) => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send({ ...eu(type), submissionTypeId: filing, [field]: value });
    expect(response.status, JSON.stringify(response.body)).toBe(201); expect(inserted()[column]).toBe(value);
  });

  it.each([['mdr', 'euMdrClass', 'IIa', 'eu_mdr_class', 'eu_ivdr_class'], ['ivdr', 'euIvdrClass', 'D', 'eu_ivdr_class', 'eu_mdr_class']] as const)('%s records %s without polluting the FDA class', async (type, field, value, column, other) => {
    queueCreate();
    const response = await request(app()).post('/api/c2c/projects').send({ ...eu(type), [field]: value });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const row = inserted(); expect(row[column]).toBe(value); expect(row[other]).toBeNull(); expect(row.device_class).toBeNull();
  });
  it('no stated EU class persists neither a regional nor US class', async () => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send(eu('ivdr'));
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(inserted()).toMatchObject({ eu_mdr_class: null, eu_ivdr_class: null, device_class: null });
  });
  it.each([
    ['invalid MDR class', { euMdrClass: 'II' }],
    ['invalid class shape', { euMdrClass: 2 }],
    ['IVDR class on MDR', { euIvdrClass: 'D' }],
    ['two different regional classes', { euMdrClass: 'IIa', euIvdrClass: 'D' }],
    ['FDA class on an EU filing', { deviceClassification: { deviceClass: 'II' } }],
    ['FDA predicate on an EU filing', { deviceClassification: { predicateK: 'K181234', predicateName: 'Prior meter' } }],
    ['FDA-specific flags on an EU filing', { deviceClassification: { flags: ['cliaWaived'] } }],
    ['IVD product on MDR', { productType: 'ivd' }],
    ['conflicting selected registry type', { submissionTypeId: 'eu_ivdr' }],
    ['a different MDR document class', { submissionTypeId: 'eu_cer' }],
  ])('refuses %s before a program insert', async (_label, fields) => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send({ ...eu(), ...fields });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(query.mock.calls.some(c => String(c[0]).includes('INSERT INTO regulatory_programs'))).toBe(false);
  });
  it('refuses an EU classification on an FDA project', async () => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send({ name: 'US meter', programType: '510k', productType: 'device', primaryAgency: 'FDA', euMdrClass: 'IIa' });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(query.mock.calls.some(c => String(c[0]).includes('INSERT INTO regulatory_programs'))).toBe(false);
  });
  it('refuses a non-IVD product type for IVDR even when no class was stated', async () => {
    queueCreate(); const response = await request(app()).post('/api/c2c/projects').send({ ...eu('ivdr'), productType: 'device' });
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(query.mock.calls.some(c => String(c[0]).includes('INSERT INTO regulatory_programs'))).toBe(false);
  });
});
