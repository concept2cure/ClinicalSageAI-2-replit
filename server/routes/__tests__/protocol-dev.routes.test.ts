/**
 * GET /api/protocol-dev — the converged protocol read for the v2 ProtocolDev surface.
 *
 * Proves the sentence that was false before the convergence: a protocol created
 * through the REAL authoring store (protocol_documents + children, written by the
 * CRUD routes and the AnA tools) reaches this read — instead of only the seed-only
 * c2c_protocol_dev blob. And that the read falls back to the legacy blob for an org
 * that has no real protocols yet (demo/legacy), non-destructively.
 */

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listProtocolDocuments = vi.fn();
const getProtocolDocument = vi.fn();
const getCompleteness = vi.fn();
vi.mock('../../services/protocol-development/protocol-development-service', () => ({
  listProtocolDocuments: (...a: unknown[]) => listProtocolDocuments(...a),
  getProtocolDocument: (...a: unknown[]) => getProtocolDocument(...a),
  getCompleteness: (...a: unknown[]) => getCompleteness(...a),
}));

const poolQuery = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => poolQuery(...a) } }));

import protocolDevRouter from '../protocol-dev.routes';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (org != null) (req as unknown as { tenantContext: unknown }).tenantContext = { organizationId: org };
    next();
  });
  app.use('/api/protocol-dev', protocolDevRouter);
  return app;
}

beforeEach(() => {
  listProtocolDocuments.mockReset();
  getProtocolDocument.mockReset();
  getCompleteness.mockReset();
  poolQuery.mockReset();
});

describe('GET /api/protocol-dev', () => {
  it('403 without organization context', async () => {
    const res = await request(appWith(null)).get('/api/protocol-dev');
    expect(res.status).toBe(403);
  });

  it('serves a real protocol_documents record shaped to the PdevDoc contract', async () => {
    listProtocolDocuments.mockResolvedValue([{ id: 5 }]);
    getProtocolDocument.mockResolvedValue({
      id: 5, title: 'A Phase 3 NSCLC Study', protocol_kind: 'clinical', protocol_number: 'NSCLC-301',
      version: '0.3', status: 'in_development', updated_at: '2026-07-30T00:00:00Z',
      sections: [{ id: 11, section_key: 's1', title: 'Synopsis', content: 'Body text', required: true, status: 'complete', order_index: 0 }],
      objectives: [{ id: 21, objective_type: 'primary', objective: 'Demonstrate OS benefit', endpoint: 'Overall survival' }],
      eligibility: [{ id: 31, kind: 'inclusion', criterion: 'Adults with stage IV NSCLC' }, { id: 32, kind: 'exclusion', criterion: 'Prior immunotherapy' }],
      visits: [{ id: 41, visit_name: 'Screening', timepoint: 'Day -28' }],
      team: [], versions: [],
    });
    getCompleteness.mockResolvedValue({ requiredCompletionPct: 68, requiredTotal: 10, requiredComplete: 7, findings: [{ severity: 'high', message: 'Statistical section incomplete' }], readyToFinalize: false });

    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('protocol_documents');
    const doc = res.body.data[0];
    expect(doc.title).toBe('A Phase 3 NSCLC Study');
    expect(doc.shortTitle).toBe('NSCLC-301');
    expect(doc.completeness).toBe(68);
    expect(doc.objectives[0].endpoint).toBe('Overall survival');
    expect(doc.eligibility.inclusion).toHaveLength(1);
    expect(doc.eligibility.exclusion).toHaveLength(1);
    expect(doc.soa.visits[0].label).toBe('Screening');
    expect(doc.completenessFindings[0]).toMatchObject({ sev: 'high', text: 'Statistical section incomplete' });
    // Register-form sub-entities are honest-empty until Phase 2 maps them.
    expect(doc.risks).toEqual([]);
    expect(getProtocolDocument).toHaveBeenCalledWith(7, 5);
    expect(poolQuery).not.toHaveBeenCalled();               // never touched the legacy blob
  });

  it('falls back to the legacy c2c_protocol_dev blob when the org has no real protocols', async () => {
    listProtocolDocuments.mockResolvedValue([]);            // no real docs
    poolQuery.mockResolvedValue({ rows: [{ id: 'PROT-DEMO', title: 'Demo Protocol', short_title: 'DEMO', kind: 'clinical', version: '0.7', status: 'draft', sponsor: 'Demo', pi: 'Dr X', updated: '2m ago', completeness: 50, open_section: 's1', sections: [], content: {}, objectives: [], eligibility: null, soa: null, risks: [{ id: 'r1' }], milestones: [], budget: null, amendments: [], deviations: [], reviews: [], consent: [], completeness_findings: [] }] });

    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('c2c_protocol_dev');
    expect(res.body.meta.legacy).toBe(true);
    expect(res.body.data[0].title).toBe('Demo Protocol');
    expect(res.body.data[0].risks).toHaveLength(1);         // legacy blob preserved intact
  });

  it('falls back to legacy when the real store is unprovisioned (42P01)', async () => {
    listProtocolDocuments.mockRejectedValue(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
    poolQuery.mockResolvedValue({ rows: [{ id: 'PROT-DEMO', title: 'Legacy', sections: [], content: {}, objectives: [] }] });
    const res = await request(appWith(7)).get('/api/protocol-dev');
    expect(res.status).toBe(200);
    expect(res.body.meta.source).toBe('c2c_protocol_dev');
    expect(res.body.data[0].title).toBe('Legacy');
  });
});
