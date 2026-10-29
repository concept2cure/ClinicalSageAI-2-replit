/**
 * A launch-served download is recorded before a byte is sent, and a download
 * that cannot be recorded is refused as an error, never sent as an attachment
 * (D5; recorded-downloads.contract.test.ts holds every handler to it).
 *
 * Three handlers did not meet that, found when the contract went red on
 * 2026-10-29 after they came into launch scope:
 *   - GET /api/ivdr/packs/:packId/download wrote its PACK_DOWNLOADED event
 *     through a helper that swallows a failed write, so a pack could leave
 *     unrecorded;
 *   - GET /api/programs/:programId/rtm/csv and GET /api/ivdr/classify/:id/report
 *     recorded through the governed export, but set Content-Disposition before
 *     it, so a refusal reached the browser as a saved file of error JSON.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { computeSha256 } from '../../services/storage/storage-provider';

const h = vi.hoisted(() => ({
  governance: vi.fn(async (): Promise<unknown> => ({ ok: true, id: 'gov-1' })),
  storageGet: vi.fn(),
  auditFails: false,
  rtmCall: 0,
}));
vi.mock('../../services/compute/exportGovernance', () => ({ registerExportGovernanceQuick: h.governance }));
vi.mock('../../services/storage/index.js', () => ({ getStorageProvider: () => ({ get: h.storageGet }) }));
// RTM reads through drizzle: one claim, then no links.
vi.mock('../../db', () => {
  const chain: Record<string, unknown> = {};
  chain.from = () => chain;
  chain.innerJoin = () => chain;
  chain.where = () => Promise.resolve(h.rtmCall++ === 0 ? [{ claimId: 1, claimText: 'Claim 1', claimType: 'performance',
    confidence: '0.90', extractionMethod: 'manual', sourceTitle: 'Study A', sourceType: 'csr', contentHash: 'abc', sourceFileName: 'a.pdf' }] : []);
  return { db: { select: () => chain } };
});

import rtmRouter from '../rtm-export';
import createIVDRRoutes from '../ivdr-routes';
import createIVDRBinderRoutes from '../ivdr-binder-routes';

const ORG = 7;
const PACK = '11111111-1111-4111-8111-111111111111';
const BYTES = Buffer.from('{"approved":"artifact"}');
const pack = { id: PACK, project_id: 'programme-a', pack_version: 1, status: 'SUCCEEDED',
  pdf_vault_version_id: '00000000-0000-4000-8000-000000000001', pdf_sha256: computeSha256(BYTES), pdf_size_bytes: BYTES.length };
const query = vi.fn(async (sql: string, params?: unknown[]) => {
  if (sql.includes('FROM ivdr_packs')) return { rows: [pack] };
  if (sql.includes('FROM ivdr_classifications')) {
    return { rows: [{ id: 3, device_name: 'Assay', intended_purpose: 'Detect', ivdr_class: 'C', companion_diagnostic: false,
      self_test: false, near_patient_test: false, rule_trace: [], analytes: [], organization_id: ORG, created_at: new Date(0) }] };
  }
  if (h.auditFails && params?.[1] === 'PACK_DOWNLOADED') throw new Error('audit_events is unavailable');
  return { rows: [] };
});
const pool = { query } as unknown as import('pg').Pool;

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    Object.assign(req, { tenantId: ORG, userId: 42, user: { id: 42, organizationId: ORG, name: 'Avery Author' },
      tenantContext: { organizationId: ORG }, ivdrPermissions: new Set(['*']) });
    next();
  });
  a.use('/api/rtm', rtmRouter);
  a.use('/api/ivdr', createIVDRRoutes(pool));
  a.use('/api/ivdr', createIVDRBinderRoutes(pool));
  return a;
}

beforeEach(() => {
  query.mockClear();
  h.governance.mockReset();
  h.governance.mockResolvedValue({ ok: true, id: 'gov-1' });
  h.storageGet.mockReset();
  h.storageGet.mockResolvedValue({ bytes: BYTES, sha256: computeSha256(BYTES), sizeBytes: BYTES.length,
    mime: 'application/pdf', filename: 'pack.pdf' });
  h.auditFails = false;
  h.rtmCall = 0;
});

describe('a download that cannot be recorded is refused, not sent', () => {
  it('an IVDR pack whose download event does not persist is not delivered', async () => {
    h.auditFails = true;
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=pdf`);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PACK_DOWNLOAD_NOT_RECORDED');
    expect(res.headers['content-disposition']).toBeUndefined();
    expect(res.headers['x-content-sha256']).toBeUndefined();
  });

  it('an IVDR pack is delivered once its download event persists', async () => {
    const res = await request(app()).get(`/api/ivdr/packs/${PACK}/download?format=pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(query.mock.calls.some(([, params]) => (params as unknown[] | undefined)?.[1] === 'PACK_DOWNLOADED')).toBe(true);
  });

  it('a refused RTM export is an error the browser shows, not a saved file', async () => {
    h.governance.mockResolvedValue(null);
    const res = await request(app()).get('/api/rtm/programs/7/rtm/csv');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('EXPORT_GOVERNANCE_REQUIRED');
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('a refused IVDR classification report is an error, not a saved file', async () => {
    h.governance.mockRejectedValue(new Error('Governed export registration failed: database unavailable'));
    const res = await request(app()).get('/api/ivdr/classify/3/report');
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(res.headers['content-disposition']).toBeUndefined();
  });

  it('both still deliver as attachments once recorded', async () => {
    for (const path of ['/api/rtm/programs/7/rtm/csv', '/api/ivdr/classify/3/report']) {
      const res = await request(app()).get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers['content-disposition'], path).toContain('attachment');
    }
    expect(h.governance).toHaveBeenCalledTimes(2);
  });
});
