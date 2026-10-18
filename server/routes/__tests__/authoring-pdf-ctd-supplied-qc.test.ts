import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import authoringPdfRoutes from '../authoring-pdf.routes';

const clean = { ready: true, counts: { errors: 0, warnings: 0 }, findings: [] };

function app(role: string | null = 'regulatory-author') {
  const instance = express();
  instance.use(express.json());
  instance.use((req, _res, next) => {
    if (role) req.user = { id: 25, organizationId: 2, role } as typeof req.user;
    next();
  });
  instance.use('/api/authoring-pdf', authoringPdfRoutes);
  return instance;
}

describe('supplied QC scope — actual /api/authoring-pdf/ctd-readiness', () => {
  it('returns the supplied-module basis for an early IND partial QC without a dossier pass', async () => {
    const response = await request(app()).post('/api/authoring-pdf/ctd-readiness').send({ m2: clean });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ready: false, scope: { kind: 'SUPPLIED_MODULE_QC', basis: 'CALLER_SUPPLIED_UNVERIFIED', assessedModules: ['M2'] }, suppliedQc: { status: 'NO_BLOCKING_FINDINGS' }, fullDossier: { status: 'NOT_ASSESSED' } });
    expect(response.body.modules).toHaveLength(5);
  });

  it('cannot upgrade claimed program/market/application/origin into authoritative readiness', async () => {
    const response = await request(app()).post('/api/authoring-pdf/ctd-readiness').send({
      m1: clean, m2: clean, m4: { ...clean, assessed: true }, m5: { ...clean, assessed: true },
      m3: clean, programId: 'invented-program', application: 'BLA', market: 'PMDA',
      scope: { basis: 'AUTHORITATIVE_CURRENT_CONTENT' }, origin: 'server-verified',
      qualification: 'PQ_PASSED', fullDossier: { status: 'READY' },
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ ready: false, scope: { basis: 'CALLER_SUPPLIED_UNVERIFIED', omittedModules: ['M3'] }, fullDossier: { status: 'NOT_ASSESSED' }, reportQualification: { status: 'NOT_ESTABLISHED' } });
    expect(JSON.stringify(response.body)).not.toMatch(/invented-program|PQ_PASSED|server-verified|AUTHORITATIVE_CURRENT_CONTENT/);
  });

  it('returns validation refusal for contradictory supplied counts in either format', async () => {
    for (const suffix of ['', '?format=pdf']) {
      const response = await request(app()).post(`/api/authoring-pdf/ctd-readiness${suffix}`).send({ m2: { ...clean, counts: { errors: 3, warnings: 0 } } });
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { code: 'CTD_QC_INPUT_INVALID' } });
      expect(response.headers['content-type']).toContain('application/json');
    }
  });

  it('keeps no supplied QC unassessed and does not infer client context', async () => {
    const response = await request(app()).post('/api/authoring-pdf/ctd-readiness').send({});
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ assessed: false, ready: false, suppliedQc: { status: 'NOT_ASSESSED' }, fullDossier: { status: 'NOT_ASSESSED' } });
  });

  it.each([
    { name: 'one module', modules: { m2: { ...clean, checked: ['2.3'] } } },
    { name: 'all caller-claimed modules', modules: { m1: clean, m2: { ...clean, checked: ['2.3'] }, m3: clean, m4: { ...clean, assessed: true }, m5: { ...clean, assessed: true } } },
  ])('returns the same narrow scope in actual PDF for $name with claimed authoritative context', async ({ modules }) => {
    const response = await request(app()).post('/api/authoring-pdf/ctd-readiness?format=pdf').send({ ...modules, application: 'NDA', market: 'FDA', origin: 'verified', reportQualification: { status: 'PQ_PASSED' } });
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['cache-control']).toBe('private, no-store');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const document = await getDocument({ data: new Uint8Array(response.body), useSystemFonts: true }).promise;
    try {
      const lines: string[] = [];
      for (let page = 1; page <= document.numPages; page++) {
        const content = await (await document.getPage(page)).getTextContent();
        lines.push(...content.items.flatMap((item) => 'str' in item ? [item.str] : []));
      }
      const text = lines.join(' ').replace(/\s+/g, ' ');
      expect(text).toContain('Caller-supplied, unverified');
      expect(text).toContain('Caller-declared checked references: 2.3');
      expect(text).toContain('Full dossier readiness: NOT ASSESSED');
      expect(text).toContain('M3: not assessed');
      expect(text).toContain('Report qualification: NOT ESTABLISHED');
      expect(text).not.toContain('READY');
      expect(text).not.toContain('PQ_PASSED');
    } finally {
      await document.destroy();
    }
  });

  it.each([[], null, { m2: null }, { m2: { ...clean, findings: null } }])('refuses malformed request objects/modules: %j', async (body) => {
    const response = await request(app()).post('/api/authoring-pdf/ctd-readiness').set('Content-Type', 'application/json').send(JSON.stringify(body));
    expect(response.status).toBe(400);
    if (body !== null) expect(response.body).toMatchObject({ error: { code: 'CTD_QC_INPUT_INVALID' } });
  });

  it.each([[null, 401], ['viewer', 403]] as const)('retains the real role guard for %s', async (role, status) => {
    const response = await request(app(role)).post('/api/authoring-pdf/ctd-readiness').send({ m2: clean });
    expect(response.status).toBe(status);
  });
});
