/**
 * CDISC validation router HTTP contract — SDTM domain conformance + Define-XML
 * generation over the mounted router (supertest), with faked auth. The services
 * are pure (no DB), so no db mock is needed.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Route logic only — pass-through the rate limiter.
vi.mock('../../middleware/rateLimiter', () => ({
  createRateLimiter: () => (_req: any, _res: any, next: any) => next(),
  default: (_req: any, _res: any, next: any) => next(),
}));

import cdiscRouter from '../cdisc-validation.routes';

let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
let app: express.Express;

beforeAll(() => {
  app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    if (currentUser) (req as any).user = currentUser;
    next();
  });
  app.use('/api/cdisc-validation', cdiscRouter);
});

describe('SDTM domain conformance', () => {
  it('403 without the regulatory-author role', async () => {
    currentUser = { id: 9, organizationId: 1, roles: ['viewer'] };
    const res = await request(app).post('/api/cdisc-validation/sdtm-domain/conformance').send({ domain: 'DM', variables: [] });
    expect(res.status).toBe(403);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('400 without domain/variables', async () => {
    const res = await request(app).post('/api/cdisc-validation/sdtm-domain/conformance').send({ domain: 'DM' });
    expect(res.status).toBe(400);
  });

  it('200 with a verdict for a DM dataset', async () => {
    const res = await request(app)
      .post('/api/cdisc-validation/sdtm-domain/conformance')
      .send({ domain: 'DM', variables: [{ name: 'STUDYID', dataType: 'Char' }] });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ready');
    expect(res.body).toHaveProperty('findings');
  });
});

describe('Define-XML generation', () => {
  const body = {
    studyName: 'C2C-001',
    datasets: [
      { name: 'DM', label: 'Demographics', variables: [{ name: 'STUDYID', label: 'Study Identifier', dataType: 'text', keySequence: 1 }] },
    ],
  };

  it('200 JSON with gaps + counts + xml', async () => {
    const res = await request(app).post('/api/cdisc-validation/define-xml').send(body);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('valid');
    expect(res.body.datasetCount).toBe(1);
    expect(res.body.xml).toContain('def:DefineVersion="2.1.0"');
  });

  it('?format=xml → 200 application/xml', async () => {
    const res = await request(app).post('/api/cdisc-validation/define-xml?format=xml').send(body);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('<ItemGroupDef OID="IG.DM"');
  });

  it('400 without studyName/datasets', async () => {
    const res = await request(app).post('/api/cdisc-validation/define-xml').send({ studyName: 'x' });
    expect(res.status).toBe(400);
  });
});
