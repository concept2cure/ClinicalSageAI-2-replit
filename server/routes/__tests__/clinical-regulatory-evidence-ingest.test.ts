/**
 * CRL ingestion route contract — POST /api/clinical-regulatory-evidence/crl.
 *
 * This is the write that fills the shared evidence corpus, so its guarantees are
 * narrow: platform-admin ONLY (a global-public FDA record must not be mintable by a
 * single tenant), applicationNumber required, and it NEVER fabricates — an empty
 * extraction is a 422, not a synthetic finding.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ingestCrl = vi.fn();
const extractFindingsFromText = vi.fn();
vi.mock('../../services/clinical-regulatory-evidence/crl-ingestion.service', () => ({
  ingestCrl: (...a: unknown[]) => ingestCrl(...a),
  extractFindingsFromText: (...a: unknown[]) => extractFindingsFromText(...a),
}));

import createClinicalRegulatoryEvidenceRoutes from '../clinical-regulatory-evidence-routes';

function appWith(user: Record<string, unknown> | null, org = 7) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { tenantContext: unknown }).tenantContext = { organizationId: org };
    if (user) {
      (req as unknown as { user: unknown }).user = user;
      if (user.id != null) (req as unknown as { userId: unknown }).userId = user.id;
    }
    next();
  });
  app.use('/api/clinical-regulatory-evidence', createClinicalRegulatoryEvidenceRoutes());
  return app;
}

const admin = { role: 'platform_admin', email: 'a@x.test' };   // no id → sync platform-role path, no DB
const nonAdmin = { role: 'user' };

const ORIGINAL_FLAG = process.env.ENABLE_CLINICAL_REGULATORY_GRAPH;
beforeEach(() => {
  process.env.ENABLE_CLINICAL_REGULATORY_GRAPH = 'true';
  ingestCrl.mockReset();
  extractFindingsFromText.mockReset();
});
afterEach(() => {
  if (ORIGINAL_FLAG === undefined) delete process.env.ENABLE_CLINICAL_REGULATORY_GRAPH;
  else process.env.ENABLE_CLINICAL_REGULATORY_GRAPH = ORIGINAL_FLAG;
  vi.restoreAllMocks();
});

describe('POST /crl — CRL ingestion (platform-admin only)', () => {
  it('403 for a non-platform-admin — a tenant user cannot mint global FDA evidence', async () => {
    const res = await request(appWith(nonAdmin))
      .post('/api/clinical-regulatory-evidence/crl')
      .send({ applicationNumber: 'BLA-1', findings: [{ findingText: 'x' }] });
    expect(res.status).toBe(403);
    expect(ingestCrl).not.toHaveBeenCalled();
  });

  it('400 when applicationNumber is missing', async () => {
    const res = await request(appWith(admin))
      .post('/api/clinical-regulatory-evidence/crl')
      .send({ findings: [{ findingText: 'x' }] });
    expect(res.status).toBe(400);
  });

  it('ingests structured findings → 200 with counts, scoped to the acting org', async () => {
    ingestCrl.mockResolvedValue({ source: { id: 11 }, findings: [{}, {}], outcomes: [{}], linkedStudyIds: [3], relationshipCount: 3 });
    const res = await request(appWith(admin))
      .post('/api/clinical-regulatory-evidence/crl')
      .send({ applicationNumber: 'BLA-761111', findings: [{ findingText: 'a' }, { findingText: 'b' }] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ sourceId: 11, applicationNumber: 'BLA-761111', findingCount: 2, outcomeCount: 1 });
    expect(ingestCrl).toHaveBeenCalledWith(7, expect.objectContaining({ applicationNumber: 'BLA-761111' }));
  });

  it('extracts findings from raw letter text when none are supplied', async () => {
    extractFindingsFromText.mockResolvedValue([{ findingText: 'extracted deficiency' }]);
    ingestCrl.mockResolvedValue({ source: { id: 12 }, findings: [{}], outcomes: [{}], linkedStudyIds: [], relationshipCount: 1 });
    const res = await request(appWith(admin))
      .post('/api/clinical-regulatory-evidence/crl')
      .send({ applicationNumber: 'BLA-2', text: 'A single adequate and well-controlled trial does not establish effectiveness.' });
    expect(res.status).toBe(200);
    expect(extractFindingsFromText).toHaveBeenCalled();
    expect(ingestCrl).toHaveBeenCalled();
  });

  it('422 when nothing is supplied and nothing is extractable — never fabricates', async () => {
    extractFindingsFromText.mockResolvedValue([]);
    const res = await request(appWith(admin))
      .post('/api/clinical-regulatory-evidence/crl')
      .send({ applicationNumber: 'BLA-3', text: 'B'.repeat(60) });
    expect(res.status).toBe(422);
    expect(ingestCrl).not.toHaveBeenCalled();
  });
});
