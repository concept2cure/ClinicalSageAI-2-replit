/**
 * GET /api/c2c/projects/:id returns the device taxonomy the write stored.
 *
 * ── The defect (MDX demo pack, 2026-09-21, finding F9) ───────────────────────
 * POST /api/c2c/projects for a 510(k) / IVD program stored device_class,
 * regulatory_path, product_code, predicate_devices, product_type and the
 * metadata intake accepted (reviewPanel, regulationNumber, deviceFlags). The
 * read projected none of them, so Project home could not show class, product
 * code or predicate, and the shell could not tell a device program from a drug
 * program (its segment label read "Biotech & Pharma" with a 510(k) open).
 *
 * ── What is locked here ──────────────────────────────────────────────────────
 *   • the read selects and returns the device columns and the metadata-held
 *     fields, through ONE serializer;
 *   • a drug program is unchanged: every existing key is still there, and the
 *     device fields are honestly null rather than absent or invented;
 *   • the create's 201 carries the same serializer's output (`program`), so the
 *     read returns what the write stored by construction.
 */
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScaffoldResult } from '../../../services/c2c/scaffold-project-documents.js';

const query = vi.fn();
const release = vi.fn();
vi.mock('../../../db.js', () => ({
  pool: {
    query: (...a: unknown[]) => query(...a),
    connect: async () => ({ query: (...a: unknown[]) => query(...a), release }),
  },
}));
const scaffold = vi.fn<(...a: unknown[]) => Promise<ScaffoldResult>>(async () => ({ documentId: 'doc_test', sectionCount: 36 }));
vi.mock('../../../services/c2c/scaffold-project-documents.js', () => ({
  scaffoldProjectDocuments: (...a: unknown[]) => scaffold(...a),
}));
vi.mock('../../../services/license-manager.js', () => ({
  checkProgramQuota: async () => ({ withinQuota: true, currentCount: 0, maxAllowed: 10, unlimited: false }),
}));
vi.mock('../../../services/audit/chain.js', () => ({
  hashPayload: () => 'payload-hash-test',
  computeAuditChainSealed: async () => ({ sha256Chain: 'chain-test', hmacSeal: 'seal-test' }),
}));
vi.mock('../../../services/submission-service/submission-service.js', () => ({
  createSubmissionTx: async () => ({ id: 3101 }),
}));

import projectsRouter, { serializeProgramDetail } from '../projects';

const PID = '82d3b729-87a1-4714-9a21-819b538683f3';

function app(org: number | null, userId?: number) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { organizationId: number }).organizationId = org;
    if (userId !== undefined) (req as unknown as { userId: number }).userId = userId;
    next();
  });
  a.use('/api/c2c/projects', projectsRouter);
  return a;
}

/** A stored 510(k) IVD program, as regulatory_programs holds it (json columns parsed by the driver). */
const deviceRow = () => ({
  id: PID, code: 'DMN5', name: '[Demo · MDX] NeuroPanel-Dx 510(k)', program_type: '510k', status: 'active', phase: 'planning',
  priority: 'high', description: null, product_name: 'NeuroPanel-Dx', indication: 'Differential diagnosis of viral CNS infection',
  intended_use: 'Qualitative multiplexed IVD test …', primary_agency: 'FDA', target_agencies: ['FDA'],
  target_submission_date: null, actual_submission_date: null, approval_date: null, progress_percent: 0,
  lead_user_id: 1, team_members: [], created_at: '2026-09-21T17:00:00.000Z', updated_at: '2026-09-21T17:00:00.000Z',
  application_number: null, sponsor_name: 'Concept2Cure Diagnostics',
  product_type: 'ivd', device_class: 'II', regulatory_path: '510k', product_code: 'QNX',
  predicate_devices: [{ kNumber: 'K223456' }],
  metadata: { createdVia: 'v2-new-project-wizard', reviewPanel: 'Microbiology', regulationNumber: '866.3985', deviceFlags: ['softwareAiMl', 'cyberDevice', 'clinicalData'] },
});

const drugRow = () => ({
  ...deviceRow(), code: 'BX-512', name: 'BX-512 · Vorelinib (IND)', program_type: 'ind', product_name: 'Vorelinib',
  application_number: '000512', product_type: 'drug', device_class: null, regulatory_path: null, product_code: null,
  predicate_devices: [], metadata: { createdVia: 'v2-new-project-wizard' },
});

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  query.mockResolvedValue({ rows: [] });
});

describe('GET /api/c2c/projects/:id — device taxonomy', () => {
  it('selects the stored device columns and returns them for a 510(k) IVD program', async () => {
    query.mockResolvedValueOnce({ rows: [deviceRow()] });
    const res = await request(app(2)).get(`/api/c2c/projects/${PID}`);
    expect(res.status).toBe(200);

    const sql = String(query.mock.calls[0][0]);
    for (const col of ['p.product_type', 'p.device_class', 'p.regulatory_path', 'p.product_code', 'p.predicate_devices', 'p.metadata']) {
      expect(sql, `the read must select ${col}`).toContain(col);
    }

    expect(res.body).toMatchObject({
      product_type: 'ivd',
      device_class: 'II',
      regulatory_path: '510k',
      product_code: 'QNX',
      predicate_devices: [{ kNumber: 'K223456' }],
      review_panel: 'Microbiology',
      regulation_number: '866.3985',
      device_flags: ['softwareAiMl', 'cyberDevice', 'clinicalData'],
    });
    // The existing contract is intact.
    expect(res.body.sponsor_name).toBe('Concept2Cure Diagnostics');
    expect(res.body.intended_use).toBe('Qualitative multiplexed IVD test …');
  });

  it('a drug program is unchanged: existing keys present, device fields honestly null', async () => {
    query.mockResolvedValueOnce({ rows: [drugRow()] });
    const res = await request(app(2)).get(`/api/c2c/projects/${PID}`);
    expect(res.status).toBe(200);
    for (const k of ['id', 'code', 'name', 'program_type', 'status', 'phase', 'priority', 'description', 'product_name', 'indication',
      'intended_use', 'primary_agency', 'target_agencies', 'target_submission_date', 'progress_percent', 'lead_user_id',
      'team_members', 'created_at', 'updated_at', 'application_number', 'sponsor_name']) {
      expect(res.body, `key ${k}`).toHaveProperty(k);
    }
    expect(res.body.application_number).toBe('000512');
    expect(res.body.product_type).toBe('drug');
    expect(res.body.device_class).toBeNull();
    expect(res.body.regulatory_path).toBeNull();
    expect(res.body.product_code).toBeNull();
    expect(res.body.predicate_devices).toEqual([]);
    expect(res.body.review_panel).toBeNull();
    expect(res.body.regulation_number).toBeNull();
    expect(res.body.device_flags).toBeNull();
  });

  it('serializeProgramDetail never invents: a metadata string that is not JSON, or a null, yields nulls', () => {
    const out = serializeProgramDetail({ ...deviceRow(), metadata: 'not json', predicate_devices: null });
    expect(out.review_panel).toBeNull();
    expect(out.regulation_number).toBeNull();
    expect(out.device_flags).toBeNull();
    expect(out.predicate_devices).toEqual([]);
    // A driver that hands json back as a string is still read.
    const parsed = serializeProgramDetail({ ...deviceRow(), metadata: JSON.stringify({ reviewPanel: 'Neurology' }), predicate_devices: JSON.stringify([{ kNumber: 'K111111' }]) });
    expect(parsed.review_panel).toBe('Neurology');
    expect(parsed.predicate_devices).toEqual([{ kNumber: 'K111111' }]);
  });
});

describe('POST /api/c2c/projects — the create answers with the same serializer', () => {
  it('201 carries `program` from serializeProgramDetail, so the read returns what the write stored', async () => {
    const card = { id: PID, title: '[Demo · MDX] NeuroPanel-Dx 510(k)', ws: 'MDX', code: 'DMN5', stage: 'Planning', readiness: 0, status: 'active', lead: '—', blocker: null, due: '—', activity: 'Updated Sep 21' };
    query
      .mockResolvedValueOnce({ rows: [] })                    // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: PID }] })         // INSERT … RETURNING id
      // 510k creates no submission spine. Program anchor preflight → no anchor → insert.
      .mockResolvedValueOnce({ rows: [{ has_column: 1, workspace_count: 1, workspace_id: 55 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 9001 }] })
      .mockResolvedValueOnce({ rows: [] })                    // audit_logs INSERT
      .mockResolvedValueOnce({ rows: [] })                    // COMMIT
      .mockResolvedValueOnce({ rows: [card] })                // card re-select
      .mockResolvedValueOnce({ rows: [deviceRow()] });        // detail re-select (same projection as GET /:id)
    const res = await request(app(2, 1)).post('/api/c2c/projects').send({
      name: '[Demo · MDX] NeuroPanel-Dx 510(k)', productName: 'NeuroPanel-Dx', programType: '510k', productType: 'ivd',
      primaryAgency: 'FDA', indication: 'Differential diagnosis of viral CNS infection',
      deviceClassification: { deviceClass: 'II', productCode: 'QNX', regulationNumber: '866.3985', reviewPanel: 'Microbiology', predicateK: 'K223456', flags: ['softwareAiMl', 'cyberDevice', 'clinicalData'] },
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ id: PID, ws: 'MDX' });
    expect(res.body.program).toEqual(serializeProgramDetail(deviceRow()));
    expect(res.body.program).toMatchObject({ device_class: 'II', product_code: 'QNX', predicate_devices: [{ kNumber: 'K223456' }], review_panel: 'Microbiology', product_type: 'ivd' });

    // The detail re-select is the SAME SQL the read issues (one projection, one serializer).
    const detailSql = String(query.mock.calls[query.mock.calls.length - 1][0]);
    expect(detailSql).toContain('p.device_class');
    expect(detailSql).toContain('o.name AS sponsor_name');
  });
});
