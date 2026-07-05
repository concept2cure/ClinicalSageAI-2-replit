/**
 * Route test for GET /api/c2c/projects/:id/vault-structure (Workstream A1).
 *
 * Verifies the Vault structure is derived dynamically from the project's product
 * modality (→ vault view) and its active document build types (→ rule-pack
 * section tree merged with live status). The DB is mocked so this exercises the
 * real router + the real segment/taxonomy derivation.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../../db', () => ({
  pool: { query: (...args: unknown[]) => queryMock(...args) },
}));

import router from '../projects';

function app(orgId: number | null) {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res, next) => {
    if (orgId != null) req.organizationId = orgId;
    next();
  });
  a.use('/api/c2c/projects', router);
  return a;
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('GET /api/c2c/projects/:id/vault-structure', () => {
  it('derives the DEVICE view + eSTAR section tree for a device project', async () => {
    queryMock
      // 1) project lookup → device product type
      .mockResolvedValueOnce({ rows: [{ id: 'p1', name: 'Dev', product_type: 'device' }] })
      // 2) documents on the project (one 510(k) filing with a 2-section rule pack)
      .mockResolvedValueOnce({
        rows: [{
          id: 'doc1', doc_type: 'k510', agency: 'FDA', rule_pack_version: 'v1',
          title: '510(k)', status: 'draft', readiness: 20,
          required_sections: [
            { key: 'device-description', label: 'Device Description', mandatory: true, path_order: 1 },
            { key: 'substantial-equivalence', label: 'Substantial Equivalence', mandatory: true, path_order: 2 },
          ],
        }],
      })
      // 3) live section statuses for doc1 (one drafted, one absent → todo)
      .mockResolvedValueOnce({ rows: [{ section_key: 'device-description', status: 'drafted', version: 2, has_content: true }] });

    const res = await request(app(7)).get('/api/c2c/projects/p1/vault-structure');
    expect(res.status).toBe(200);
    expect(res.body.view).toBe('device');
    // Device folder spine (not the CTD modules).
    expect(res.body.folders.map((f: any) => f.id)).toContain('eng');
    expect(res.body.folders.map((f: any) => f.id)).not.toContain('module-1');
    expect(res.body.buildTypes).toEqual(['k510/FDA']);
    // Industry-specific framing: filing types carry their governing regulation.
    const k510 = res.body.filingTypes.find((f: any) => f.value === 'k510');
    expect(k510).toBeTruthy();
    expect(k510.regulatoryRefs).toContain('21 CFR 807');
    // Section tree merged with live status.
    const doc = res.body.documents[0];
    expect(doc.docType).toBe('k510');
    const byKey = Object.fromEntries(doc.sections.map((s: any) => [s.key, s.status]));
    expect(byKey['device-description']).toBe('drafted');
    expect(byKey['substantial-equivalence']).toBe('todo'); // no live row → todo
  });

  it('falls back to the service view when the project has no product type', async () => {
    queryMock
      // 1) project lookup → null product type
      .mockResolvedValueOnce({ rows: [{ id: 'p2', name: 'CRO study', product_type: null }] })
      // 2) org fallback distinct product types → none
      .mockResolvedValueOnce({ rows: [] })
      // 3) documents → none
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(app(7)).get('/api/c2c/projects/p2/vault-structure');
    expect(res.status).toBe(200);
    expect(res.body.view).toBe('service');
    // TMF zone folders for the service view.
    expect(res.body.folders.length).toBeGreaterThan(0);
    expect(res.body.documents).toEqual([]);
  });

  it('404s a project that is not in the caller org', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // project lookup empty
    const res = await request(app(7)).get('/api/c2c/projects/nope/vault-structure');
    expect(res.status).toBe(404);
  });

  it('403s without an organization context', async () => {
    const res = await request(app(null)).get('/api/c2c/projects/p1/vault-structure');
    expect(res.status).toBe(403);
  });
});
