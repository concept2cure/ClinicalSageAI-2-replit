/**
 * The post-market HTTP routes — the programme record is the only source of the
 * device facts a governed obligation set or a drafted document is computed
 * from.
 *
 * Until 2026-10-19 the class and the implantable / custom-made facts arrived as
 * query parameters, and the regulation fell back to an "ivd" substring in the
 * caller's class string. The CER surface sent `profile.deviceClass` — the US
 * 21 CFR 860 class — so a European programme's MDR assessment was computed
 * from "class II" and answered `"class II" is not an MDR device class`, while
 * its MDR class sat unread in `eu_mdr_class`. `implantable=false` and
 * `customMade=true` each REMOVE an obligation, so a caller-sent fact could
 * drop the SSCP from a programme that owes one.
 *
 * Split out of post-market-readiness.test.ts (same date) when that file
 * crossed its 500-line ceiling. The pure-computation tests stay there; these
 * are the route's own.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Both routes read regulatory_programs twice — requireProgramAccess on the
// pool, then loadProgrammeEuDeviceRow on drizzle — and listProgramDocuments
// ends in orderBy(). Nothing else in this file touches the DB.
const h = vi.hoisted(() => ({ programRows: [] as any[], docRows: [] as any[] }));

vi.mock('../../../db', () => {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(h.docRows),
    limit: () => Promise.resolve(h.programRows),
  };
  const query = (sql: string) =>
    Promise.resolve(
      /FROM regulatory_programs/.test(sql)
        ? { rows: h.programRows, rowCount: h.programRows.length }
        : { rows: [], rowCount: 0 }
    );
  return { db: chain, pool: { query }, getPool: () => ({ query }) };
});

vi.mock('../../../middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));

const PROGRAM = 'aaaaaaaa-0000-4000-8000-000000000001';

/**
 * A programme record as the routes read it. `deviceClass` — the US 21 CFR 860
 * class — is present on purpose: it must never reach an EU assessment.
 *
 * `customMade` has no store at all, no column and no intake question, so it is
 * now never stated: `computeDocStatus` says so in `assumptions` and treats the
 * device as not custom-made, which can only ADD obligations. No surface ever
 * sent it; it was reachable only by hand-writing the query.
 */
const record = (over: Record<string, unknown> = {}) => ({
  id: PROGRAM,
  productType: 'device',
  deviceClass: 'class_ii',
  euMdrClass: null,
  euIvdrClass: null,
  metadata: {},
  ...over,
});

async function app(json = false) {
  const { postMarketRouter } = await import('../../../routes/gspr-postmarket');
  const a = express();
  if (json) a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 7, organizationId: 99 };
    next();
  });
  a.use('/api/post-market', postMarketRouter);
  return a;
}

beforeEach(() => {
  h.programRows = [record()];
  h.docRows = [];
});

const url = (q = '') => `/api/post-market/programs/${PROGRAM}/documentation-status${q ? `?${q}` : ''}`;

describe('GET …/documentation-status — the class comes from the record', () => {

  it('assesses the MDR class the record states, with nothing in the query', async () => {
    h.programRows = [record({ euMdrClass: 'IIa' })];
    const res = await request(await app()).get(url('regulation=MDR'));
    expect(res.status).toBe(200);
    expect(res.body.normalisedClass).toBe('IIa');
    expect(res.body.status).toBe('assessed');
  });

  it('takes the IVDR class from its own column, not the MDR one', async () => {
    h.programRows = [record({ productType: 'ivd', euMdrClass: 'IIb', euIvdrClass: 'C' })];
    const res = await request(await app()).get(url('regulation=IVDR'));
    expect(res.status).toBe(200);
    expect(res.body.normalisedClass).toBe('C');
    const byType = Object.fromEntries(res.body.documents.map((d: any) => [d.documentType, d]));
    expect(byType.psur.required, 'IVDR C owes a PSUR').toBe(true);
    expect(byType.ssp.required, 'IVDR C owes an SSP').toBe(true);
  });

  it('a record with no EU class says so, rather than failing on the US class', async () => {
    const res = await request(await app()).get(url('regulation=MDR'));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('class_unrecognised');
    expect(res.body.classProblem).toBe(
      'The device class is not set, so the MDR post-market obligations cannot be determined.'
    );
    expect(res.body.classProblem, 'the US class must not appear in an MDR answer').not.toContain('II');
    expect(res.body.allRequiredApproved).toBe(false);
  });

  it.each(['deviceClass=IIa', 'implantable=true', 'customMade=true'])(
    'ignores %s in the query — the record decides, not the caller',
    async q => {
      const res = await request(await app()).get(url(`regulation=MDR&${q}`));
      expect(res.status).toBe(200);
      expect(res.body.normalisedClass).toBeNull();
      expect(res.body.implantable).toBeNull();
      expect(res.body.customMade).toBeNull();
    }
  );

  it('answers IVDR Class B with a PMS report and no PSUR', async () => {
    h.programRows = [record({ productType: 'ivd', euIvdrClass: 'B' })];
    const res = await request(await app()).get(url('regulation=IVDR'));
    expect(res.status).toBe(200);
    const byType = Object.fromEntries(res.body.documents.map((d: any) => [d.documentType, d]));
    expect(byType.pms_report.required).toBe(true);
    expect(byType.psur.required).toBe(false);
  });

  it('refuses a regulation that is neither MDR nor IVDR', async () => {
    const res = await request(await app()).get(url('regulation=FDA'));
    expect(res.status).toBe(422);
  });

  it('refuses a programme outside the organization before reading anything', async () => {
    h.programRows = [];
    const res = await request(await app()).get(url('regulation=MDR'));
    expect(res.status).toBe(403);
  });
});

describe('GET …/documentation-status — implantable and custom-made', () => {
  it('reads implantable from the record: an implantable Class IIa device owes an SSCP', async () => {
    h.programRows = [record({ euMdrClass: 'IIa', metadata: { deviceFlags: ['implantable'] } })];
    const res = await request(await app()).get(url('regulation=MDR'));
    expect(res.status).toBe(200);
    expect(res.body.implantable).toBe(true);
    expect(res.body.documents.find((d: any) => d.documentType === 'sscp').required).toBe(true);
  });

  it('an intake that answered the device questions and not implantable states false', async () => {
    h.programRows = [record({ euMdrClass: 'IIa', metadata: { deviceFlags: ['sterile'] } })];
    const res = await request(await app()).get(url('regulation=MDR'));
    expect(res.status).toBe(200);
    expect(res.body.implantable).toBe(false);
    expect(res.body.documents.find((d: any) => d.documentType === 'sscp').required).toBe(false);
  });

  it('a record that never answered the device questions leaves implantable unknown, not false', async () => {
    h.programRows = [record({ euMdrClass: 'IIb' })];
    const res = await request(await app()).get(url('regulation=MDR'));
    expect(res.status).toBe(200);
    expect(res.body.implantable).toBeNull();
    expect(res.body.documents.find((d: any) => d.documentType === 'sscp').obligation).toBe('undetermined');
  });

  it('custom-made is never stated, and a Class III device still owes its SSCP', async () => {
    h.programRows = [record({ euMdrClass: 'III', metadata: { deviceFlags: ['implantable'] } })];
    const res = await request(await app()).get(url('regulation=MDR'));
    expect(res.status).toBe(200);
    expect(res.body.customMade).toBeNull();
    expect(res.body.documents.find((d: any) => d.documentType === 'sscp').required).toBe(true);
    expect(res.body.assumptions.join(' ')).toContain('Custom-made was not stated');
  });

});

describe('POST …/documents/:type/generate — the record decides the regulation', () => {
  beforeEach(() => {
    h.programRows = [record({ productType: 'ivd', euIvdrClass: 'C' })];
  });

  /**
   * 2026-10-19: the regulation fell back to the IVD hint in the CALLER'S class
   * string, so an IVD programme whose class carried no "ivd" — every canonical
   * 'A'..'D' — drafted an MDR-shaped instrument. The record's product type now
   * decides, and this is the pin: the body names no class and no regulation.
   */
  it('refuses a PMCF plan for an IVD programme with 422 naming the PMPF plan', async () => {
    const res = await request(await app(true))
      .post(`/api/post-market/programs/${PROGRAM}/documents/pmcf_plan/generate`)
      .send({ deviceName: 'Acme HbA1c Assay' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/pmpf_plan/);
  });

  it('refuses an SSCP for an IVD programme, naming the SSP', async () => {
    const res = await request(await app(true))
      .post(`/api/post-market/programs/${PROGRAM}/documents/sscp/generate`)
      .send({ deviceName: 'Acme HbA1c Assay' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/ssp/);
  });

  it('refuses an SSP for a device programme, naming the SSCP', async () => {
    h.programRows = [record({ euMdrClass: 'III' })];
    const res = await request(await app(true))
      .post(`/api/post-market/programs/${PROGRAM}/documents/ssp/generate`)
      .send({ deviceName: 'Acme Hip Stem' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/sscp/);
  });
});
