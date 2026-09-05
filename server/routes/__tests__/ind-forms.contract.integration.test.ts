/**
 * IND forms router HTTP contract — FDA Forms 1571/1572/3674/3454/3455 over the
 * mounted router (supertest), db pointed at in-process PGlite, faked auth.
 * Validates auth/RBAC, form listing, field-map build, PDF rendering (with the
 * X-Form-* headers), the 1572-per-investigator path, and the DB-backed
 * pdf-from-records flow (master-data lookups, tenant scoping, 404s).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../db', () => ({ get db() { return holder.db; } }));
// logAction resolves an AuditWriteResult (server/services/auditService.ts) and
// the artifact routes dereference it (.persisted / .error), so the mock must
// resolve the real success shape — resolving undefined makes the route throw a
// TypeError and 500.
vi.mock('../../services/auditService', () => ({
  default: {
    logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })),
  },
}));

import formsRouter from '../ind-forms.routes';
import { createSponsor, createInvestigator } from '../../services/ind-master-data/ind-master-data-service';

let harness: IndPgliteDb;
let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
let sponsorId: string;
let investigatorId: string;

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use((req, _res, next) => {
    if (currentUser) (req as any).user = currentUser;
    next();
  });
  app.use('/api/ind-forms', formsRouter);
  return app;
}
let app: express.Express;

beforeAll(async () => {
  harness = await createIndPgliteDb({ formArtifacts: true });
  holder.db = harness.db;
  app = makeApp();
  const ctx = { organizationId: 1, userId: 9 };
  const sponsor = await createSponsor({ name: 'Acme Therapeutics', contactEmail: 'ra@acme.example' }, ctx);
  sponsorId = sponsor.id;
  const inv = await createInvestigator({ firstName: 'Pat', lastName: 'Smith', credentials: 'MD' }, ctx);
  investigatorId = inv.id;
  // Seed a project (org 1) for the governed-artifact route's org-scoping check.
  await harness.pglite.exec("INSERT INTO projects (id, organization_id, name) VALUES (1, 1, 'Test IND Project')");
  // PGlite bootstrap can exceed the global 10s hookTimeout when the full
  // suite runs under load; give it explicit headroom.
}, 60_000);
afterAll(async () => {
  await harness.close();
});

describe('auth + RBAC', () => {
  it('401/403 unauthenticated or wrong role', async () => {
    currentUser = null;
    const unauth = await request(app).get('/api/ind-forms/');
    expect([401, 403]).toContain(unauth.status);
    currentUser = { id: 9, organizationId: 1, roles: ['viewer'] };
    const forbidden = await request(app).get('/api/ind-forms/');
    expect(forbidden.status).toBe(403);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });
});

describe('form discovery + build', () => {
  it('GET / → 200 lists the supported form ids', async () => {
    const res = await request(app).get('/api/ind-forms/');
    expect(res.status).toBe(200);
    expect(res.body.forms).toEqual(
      expect.arrayContaining(['FDA_1571', 'FDA_1572', 'FDA_1574', 'FDA_3674', 'FDA_3454', 'FDA_3455', 'FDA_356H']),
    );
    expect(res.body.formDefinitions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        formId: 'FDA_356H', implementationStatus: 'full', version: 'unverified',
        governance: expect.objectContaining({ failClosed: true }),
        fields: expect.arrayContaining([expect.objectContaining({ id: 'application_type', required: true })]),
      }),
    ]));
    expect(res.body.releaseReadiness).toEqual(expect.objectContaining({
      releaseReady: false, catalogComplete: false, officialAssetsVerified: false,
    }));
  });

  it('POST /FDA_1571/build → 200 returns a field map + missingRequired', async () => {
    const res = await request(app).post('/api/ind-forms/FDA_1571/build').send({ sponsorName: 'Acme', drugName: 'C2C-001' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('fields');
    expect(res.body).toHaveProperty('missingRequired');
  });

  it('POST /nope/build → 400 for an unsupported form', async () => {
    const res = await request(app).post('/api/ind-forms/nope/build').send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});

describe('cross-form QC', () => {
  it('POST /qc → 200 ready for a complete, consistent IND form set', async () => {
    const res = await request(app)
      .post('/api/ind-forms/qc')
      .send({
        forms: [
          { formId: 'FDA_1571', fields: { sponsor_name: 'Acme', drug_name: 'C2C-001' }, missingRequired: [] },
          { formId: 'FDA_1572', fields: { sponsor_name: 'Acme', drug_name: 'C2C-001' }, missingRequired: [] },
          { formId: 'FDA_3674', fields: { sponsor_name: 'Acme', drug_name: 'C2C-001' }, missingRequired: [] },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.present).toContain('FDA_1571');
  });

  it('POST /qc → 200 not ready when sponsor name diverges', async () => {
    const res = await request(app)
      .post('/api/ind-forms/qc')
      .send({
        forms: [
          { formId: 'FDA_1571', fields: { sponsor_name: 'Acme', drug_name: 'C2C-001' }, missingRequired: [] },
          { formId: 'FDA_1572', fields: { sponsor_name: 'Acme Bio', drug_name: 'C2C-001' }, missingRequired: [] },
          { formId: 'FDA_3674', fields: { sponsor_name: 'Acme', drug_name: 'C2C-001' }, missingRequired: [] },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(false);
    expect(res.body.findings.some((f: any) => f.code === 'CONSISTENCY')).toBe(true);
  });

  it('POST /qc → 400 without forms[]', async () => {
    const res = await request(app).post('/api/ind-forms/qc').send({});
    expect(res.status).toBe(400);
  });
});

describe('PDF rendering', () => {
  it('POST /FDA_3674/pdf → 200 application/pdf with X-Form-* headers', async () => {
    const res = await request(app).post('/api/ind-forms/FDA_3674/pdf').send({ drugName: 'C2C-001' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers).toHaveProperty('x-form-field-coverage');
    expect(res.headers).toHaveProperty('x-form-used-official-template');
    // 3674 is a dynamic XFA form: its AcroForm layer is empty, but its XFA
    // packets carry 178 fillable fields, so the vendored FDA template fills
    // through the datasets packet and the response says so honestly. The
    // reconstruction is now only the fallback when no template is installed.
    expect(res.headers['x-form-used-official-template']).toBe('true');
    expect(res.headers['x-form-reconstructed']).toBe('false');
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('POST /nope/pdf → 400 for an unsupported form', async () => {
    const res = await request(app).post('/api/ind-forms/nope/pdf').send({});
    expect(res.status).toBe(400);
  });

  it('POST /1572/pdf-all → 200 returns base64 PDFs per investigator', async () => {
    const res = await request(app)
      .post('/api/ind-forms/1572/pdf-all')
      .send({ investigators: [{ firstName: 'Pat', lastName: 'Smith' }] });
    expect(res.status).toBe(200);
    expect(res.body.formId).toBe('FDA_1572');
    expect(Array.isArray(res.body.documents)).toBe(true);
    expect(res.body.documents.length).toBeGreaterThanOrEqual(1);
    expect(typeof res.body.documents[0].pdfBase64).toBe('string');
  });

  it('POST /3455/pdf-all → 200 returns one disclosure PDF per disclosing investigator', async () => {
    const res = await request(app)
      .post('/api/ind-forms/3455/pdf-all')
      .send({
        sponsorName: 'Acme',
        sponsor: { authorizedRepName: 'John Officer' },
        investigators: [
          { name: 'Dr. Pat Smith', financial: { hasDisclosableInterest: true, interestTypes: ['significant_equity'] } },
          { name: 'Dr. Kim Lee', financial: { hasDisclosableInterest: false } },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.formId).toBe('FDA_3455');
    expect(Array.isArray(res.body.documents)).toBe(true);
    // Only the one disclosing investigator yields a form.
    expect(res.body.documents.length).toBe(1);
    expect(typeof res.body.documents[0].pdfBase64).toBe('string');
  });

  it('POST /3455/pdf-all → 200 with an empty documents array when none disclose', async () => {
    const res = await request(app)
      .post('/api/ind-forms/3455/pdf-all')
      .send({
        sponsorName: 'Acme',
        sponsor: { authorizedRepName: 'John Officer' },
        investigators: [{ name: 'Dr. Kim Lee', financial: { hasDisclosableInterest: false } }],
      });
    expect(res.status).toBe(200);
    expect(res.body.formId).toBe('FDA_3455');
    expect(res.body.documents).toEqual([]);
  });
});

describe('pdf-from-records (DB-backed)', () => {
  it('401 when unauthenticated', async () => {
    currentUser = null;
    const res = await request(app).post('/api/ind-forms/FDA_1571/pdf-from-records').send({ sponsorId });
    expect(res.status).toBe(401);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('POST /1571/pdf-from-records → 200 PDF from stored sponsor', async () => {
    const res = await request(app).post('/api/ind-forms/FDA_1571/pdf-from-records').send({ sponsorId });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('POST /1572/pdf-from-records → 200 with investigator records', async () => {
    const res = await request(app)
      .post('/api/ind-forms/FDA_1572/pdf-from-records')
      .send({ investigatorIds: [investigatorId] });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
  });

  it('POST /1571/pdf-from-records → 404 for an unknown sponsor', async () => {
    const res = await request(app)
      .post('/api/ind-forms/FDA_1571/pdf-from-records')
      .send({ sponsorId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('does not load another org\'s sponsor (tenant scoping → 404)', async () => {
    currentUser = { id: 9, organizationId: 2, roles: ['regulatory-author'] };
    const res = await request(app).post('/api/ind-forms/FDA_1571/pdf-from-records').send({ sponsorId });
    expect(res.status).toBe(404);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });
});

describe('governed artifact (DB-backed)', () => {
  it('401 when unauthenticated', async () => {
    currentUser = null;
    const res = await request(app).post('/api/ind-forms/FDA_1571/artifact').send({ projectId: 1, sponsorName: 'Acme' });
    expect(res.status).toBe(401);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('400 without a projectId (a governed artifact must associate with a project)', async () => {
    const res = await request(app).post('/api/ind-forms/FDA_1571/artifact').send({ sponsorName: 'Acme' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('404 for a project in another org (never create an artifact under another tenant)', async () => {
    currentUser = { id: 9, organizationId: 2, roles: ['regulatory-author'] };
    const res = await request(app).post('/api/ind-forms/FDA_1571/artifact').send({ projectId: 1, sponsorName: 'Acme' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });

  it('201 persists a governed form artifact (structured field map) the platform now knows exists', async () => {
    const res = await request(app)
      .post('/api/ind-forms/FDA_1571/artifact')
      .send({ projectId: 1, sponsorName: 'Acme Therapeutics', drugName: 'C2C-001' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ formId: 'FDA_1571', projectId: 1 });
    expect(typeof res.body.artifactId).toBe('string');
    expect(typeof res.body.contentHash).toBe('string');
    expect(Array.isArray(res.body.missingRequired)).toBe(true);

    // A governed row now exists — org-/project-scoped, typed 'form'.
    const { rows } = await harness.pglite.query(
      'SELECT type, category, organization_id, project_id, content, content_hash FROM concept2cure_artifacts WHERE artifact_id = $1',
      [res.body.artifactId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ type: 'form', category: 'document', organization_id: 1, project_id: 1 });
    // content is the deterministic structured field map, NOT PDF bytes.
    const stored = JSON.parse((rows[0] as any).content);
    expect(stored.formId).toBe('FDA_1571');
    expect(stored).toHaveProperty('fields');
    expect((rows[0] as any).content_hash).toBe(res.body.contentHash);
  });
});

describe('per-investigator governed artifacts (DB-backed)', () => {
  it('201 persists ONE governed artifact per investigator for 1572', async () => {
    const res = await request(app)
      .post('/api/ind-forms/FDA_1572/artifact-all')
      .send({
        projectId: 1,
        sponsorName: 'Acme Therapeutics',
        drugName: 'C2C-001',
        investigators: [
          { name: 'Dr. Pat Smith', facilityName: 'Site A', irbName: 'IRB A' },
          { name: 'Dr. Kim Lee', facilityName: 'Site B', irbName: 'IRB B' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ formId: 'FDA_1572', projectId: 1 });
    expect(Array.isArray(res.body.artifacts)).toBe(true);
    expect(res.body.artifacts).toHaveLength(2);
    // Each artifact names its own investigator.
    expect(res.body.artifacts.map((a: any) => a.investigatorName).sort()).toEqual(['Dr. Kim Lee', 'Dr. Pat Smith']);

    // Both governed rows exist, org-/project-scoped, titled per investigator.
    const { rows } = await harness.pglite.query(
      "SELECT title, organization_id, project_id, metadata FROM concept2cure_artifacts WHERE artifact_id = ANY($1)",
      [res.body.artifacts.map((a: any) => a.artifactId)],
    );
    expect(rows.length).toBe(2);
    for (const r of rows as any[]) {
      expect(r.organization_id).toBe(1);
      expect(r.project_id).toBe(1);
      expect(String(r.title)).toContain('FDA Form 1572 —');
    }
  });

  it('201 persists one artifact per DISCLOSING investigator for 3455 (non-disclosing excluded)', async () => {
    const res = await request(app)
      .post('/api/ind-forms/FDA_3455/artifact-all')
      .send({
        projectId: 1,
        sponsorName: 'Acme',
        sponsor: { authorizedRepName: 'John Officer' },
        studyTitle: 'A Phase 1 Study',
        investigators: [
          { name: 'Dr. Pat Smith', financial: { hasDisclosableInterest: true, interestTypes: ['significant_equity'] } },
          { name: 'Dr. Kim Lee', financial: { hasDisclosableInterest: false } },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.formId).toBe('FDA_3455');
    expect(res.body.artifacts).toHaveLength(1);
    expect(res.body.artifacts[0].investigatorName).toBe('Dr. Pat Smith');
  });

  it('201 with an empty artifacts array for 3455 when no investigator discloses (certify none on 3454)', async () => {
    const res = await request(app)
      .post('/api/ind-forms/FDA_3455/artifact-all')
      .send({
        projectId: 1,
        sponsorName: 'Acme',
        investigators: [{ name: 'Dr. Kim Lee', financial: { hasDisclosableInterest: false } }],
      });
    expect(res.status).toBe(201);
    expect(res.body.artifacts).toEqual([]);
  });

  it('400 for a form that is not per-investigator (use /:formId/artifact instead)', async () => {
    const res = await request(app)
      .post('/api/ind-forms/FDA_1571/artifact-all')
      .send({ projectId: 1, sponsorName: 'Acme' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('404 for a project in another org (never create per-investigator artifacts under another tenant)', async () => {
    currentUser = { id: 9, organizationId: 2, roles: ['regulatory-author'] };
    const res = await request(app)
      .post('/api/ind-forms/FDA_1572/artifact-all')
      .send({ projectId: 1, investigators: [{ name: 'Dr. Pat Smith' }] });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });
});
