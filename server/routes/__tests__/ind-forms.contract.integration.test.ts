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
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
/* `db` is drizzle over PGlite; `pool` is the duck-typed shim the raw-SQL
   services use (submission-spine resolves a program's canonical submission +
   latest sequence through it). Both point at the SAME in-process database, so a
   leaf written through drizzle is visible to the spine's SQL and vice versa. */
vi.mock('../../db', () => ({
  get db() { return holder.db; },
  pool: {
    query: async (text: string, params?: unknown[]) => {
      const r = await holder.pglite.query(text, params as unknown[]);
      return { rows: r.rows as unknown[], rowCount: (r.rows as unknown[]).length };
    },
  },
}));
/* Object bytes never touch the disk in a test: the storage provider is the only
   tenant boundary for them, so it is faked in memory and asserted on. */
const storage = vi.hoisted(() => ({ objects: new Map<string, Buffer>(), deletes: [] as string[] }));
vi.mock('../../services/storage', () => ({
  getStorageProvider: () => ({
    name: 'test',
    async put(opts: { bytes: Buffer; filename: string }) {
      const id = `vv-${storage.objects.size + 1}`;
      storage.objects.set(id, opts.bytes);
      return {
        vaultFileId: `vf-${id}`,
        vaultVersionId: id,
        sizeBytes: opts.bytes.length,
        sha256: createHash('sha256').update(opts.bytes).digest('hex'),
        provider: 'test',
      };
    },
    async delete(id: string) { storage.deletes.push(id); return true; },
  }),
}));
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
import { templatePathFor } from '../../services/ind-forms/ind-form-fill-service';

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
  harness = await createIndPgliteDb({ formArtifacts: true, submissionCore: true, programSpine: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  app = makeApp();
  const ctx = { organizationId: 1, userId: 9 };
  const sponsor = await createSponsor({ name: 'Acme Therapeutics', contactEmail: 'ra@acme.example' }, ctx);
  sponsorId = sponsor.id;
  const inv = await createInvestigator({ firstName: 'Pat', lastName: 'Smith', credentials: 'MD' }, ctx);
  investigatorId = inv.id;
  // Seed a project (org 1) for the governed-artifact route's org-scoping check.
  await harness.pglite.exec("INSERT INTO projects (id, organization_id, name) VALUES (1, 1, 'Test IND Project')");
  await harness.pglite.exec("INSERT INTO organizations (id, name) VALUES (1, 'Concept2Cure Therapeutics'), (2, 'Other Sponsor Inc')");
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

// ───────────────────────────────────────────────────────────────────────────
// The open program is the source of the form facts, and a sponsor's completed
// official form is filed into the program's sequence.
// ───────────────────────────────────────────────────────────────────────────

/** A completed, signed form as a sponsor would hand it back. */
const SIGNED_PDF = Buffer.from('%PDF-1.7\n% completed and signed by the sponsor\n%%EOF\n', 'utf8');

async function seedProgram(opts: {
  org?: number;
  code: string;
  name: string;
  productName: string;
  programType?: string;
  applicationNumber?: string | null;
  indication?: string | null;
}): Promise<string> {
  const r = await harness.pglite.query(
    `INSERT INTO regulatory_programs
       (organization_id, name, code, program_type, product_name, application_number, indication)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      opts.org ?? 1,
      opts.name,
      opts.code,
      opts.programType ?? 'IND',
      opts.productName,
      opts.applicationNumber ?? null,
      opts.indication ?? null,
    ],
  );
  return String((r.rows[0] as { id: string }).id);
}

/** The canonical submission (and, unless withSequence is false, its 0000). */
async function seedSpine(opts: {
  org?: number;
  title: string;
  productName: string;
  withSequence?: boolean;
}): Promise<{ submissionId: number; sequenceId: number | null }> {
  const org = opts.org ?? 1;
  const sub = await harness.pglite.query(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ($1,$2,'ind','biotech','fda',$3,9) RETURNING id`,
    [opts.title, opts.productName, org],
  );
  const submissionId = Number((sub.rows[0] as { id: number }).id);
  if (opts.withSequence === false) return { submissionId, sequenceId: null };
  const seq = await harness.pglite.query(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
     VALUES ($1,'fda','0000','original','draft',$2,9) RETURNING id`,
    [submissionId, org],
  );
  return { submissionId, sequenceId: Number((seq.rows[0] as { id: number }).id) };
}

async function leafRows(sequenceId: number): Promise<Array<Record<string, unknown>>> {
  const r = await harness.pglite.query(
    `SELECT id, section_code, title, document_table, document_id, document_type, checksum, deleted_at
       FROM submission_leaves WHERE sequence_id = $1 ORDER BY id`,
    [sequenceId],
  );
  return r.rows as Array<Record<string, unknown>>;
}

describe('the open program supplies the form facts', () => {
  it('GET /?projectIdent → the program record, what each form will produce, and nothing placed yet', async () => {
    await seedProgram({
      code: 'BX-900', name: 'BX-900 · listing (IND)', productName: 'Zelavir · BX-900',
      applicationNumber: '000900', indication: 'Refractory X',
    });
    await seedSpine({ title: 'BX-900 · listing (IND)', productName: 'Zelavir · BX-900' });

    const res = await request(app).get('/api/ind-forms/').query({ projectIdent: 'BX-900' });
    expect(res.status).toBe(200);
    expect(res.body.program).toMatchObject({
      code: 'BX-900',
      programType: 'IND',
      sponsorName: 'Concept2Cure Therapeutics',
      productName: 'Zelavir · BX-900',
      indication: 'Refractory X',
      applicationNumber: '000900',
      // Exactly what the builders receive — the IND number lands in the IND box.
      formMetadata: {
        sponsorName: 'Concept2Cure Therapeutics',
        drugName: 'Zelavir · BX-900',
        indication: 'Refractory X',
        indNumber: '000900',
      },
    });
    expect(res.body.placements).toEqual([]);
    // The render statement travels with the listing, before anything is rendered.
    const plan1571 = res.body.renderPlans.find((p: any) => p.formId === 'FDA_1571');
    expect(plan1571).toMatchObject({ method: 'official-xfa-datasets', officialTemplate: true });
    expect(plan1571.sponsorCompletes.map((f: any) => f.id)).toContain('ind_type');
  });

  it('GET / without a program still lists the forms and their plans', async () => {
    const res = await request(app).get('/api/ind-forms/');
    expect(res.status).toBe(200);
    expect(res.body.program).toBeNull();
    expect(res.body.renderPlans).toHaveLength(res.body.forms.length);
  });

  it('GET /?projectIdent → 404 for a program that is not this organization\'s', async () => {
    await seedProgram({ org: 2, code: 'ZZ-1', name: 'Other', productName: 'Other product' });
    expect((await request(app).get('/api/ind-forms/').query({ projectIdent: 'ZZ-1' })).status).toBe(404);
    expect((await request(app).get('/api/ind-forms/').query({ projectIdent: 'NOPE-1' })).status).toBe(404);
  });

  it('POST /FDA_1571/build fills sponsor, drug, indication and IND number from the record — none of them typed', async () => {
    await seedProgram({
      code: 'BX-901', name: 'BX-901 (IND)', productName: 'Ravonib · BX-901',
      applicationNumber: '000901', indication: 'Metastatic Y',
    });
    const res = await request(app).post('/api/ind-forms/FDA_1571/build').send({ projectIdent: 'BX-901', serialNumber: '0000' });
    expect(res.status).toBe(200);
    expect(res.body.fields).toMatchObject({
      sponsor_name: 'Concept2Cure Therapeutics',
      drug_name: 'Ravonib · BX-901',
      indication: 'Metastatic Y',
      ind_number: '000901',
      serial_number: '0000',
    });
    // `projectIdent` addresses the program; it is not form content.
    expect(res.body.fields).not.toHaveProperty('projectIdent');
  });

  it('a stated value wins over the record, and a blank one does not erase it', async () => {
    await seedProgram({ code: 'BX-902', name: 'BX-902 (IND)', productName: 'Product 902', applicationNumber: '000902' });
    const res = await request(app)
      .post('/api/ind-forms/FDA_1571/build')
      .send({ projectIdent: 'BX-902', drugName: 'Typed name wins', indication: '   ' });
    expect(res.body.fields.drug_name).toBe('Typed name wins');
    expect(res.body.fields.sponsor_name).toBe('Concept2Cure Therapeutics');
    // A blank input is "not stated": it must not overwrite the record, and it
    // must not satisfy missingRequired either.
    expect(res.body.fields.indication).toBe('');
    expect(res.body.missingRequired).toContain('indication');
  });

  it('a build that NAMES an unresolvable program is refused, not answered from typed fields', async () => {
    const res = await request(app).post('/api/ind-forms/FDA_1571/build').send({ projectIdent: 'GHOST-1', sponsorName: 'Typed' });
    expect(res.status).toBe(404);
  });
});

describe('a sponsor\'s completed official form is filed into the sequence', () => {
  it('places the signed form as a Module 1 leaf pointing at the retained bytes', async () => {
    await seedProgram({ code: 'BX-910', name: 'BX-910 (IND)', productName: 'Product 910', applicationNumber: '000910' });
    const { sequenceId } = await seedSpine({ title: 'BX-910 (IND)', productName: 'Product 910' });

    const res = await request(app)
      .post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'BX-910')
      .attach('file', SIGNED_PDF, { filename: 'signed-1571.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      formId: 'FDA_1571',
      sectionCode: 'm1.1',
      documentType: 'form_1571',
      sequenceNumber: '0000',
      sha256: createHash('sha256').update(SIGNED_PDF).digest('hex'),
      byteSize: SIGNED_PDF.length,
      replaced: false,
      originalFileName: 'signed-1571.pdf',
    });

    const leaves = await leafRows(sequenceId!);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({
      section_code: 'm1.1',
      document_table: 'rendered_leaf_files',
      document_type: 'form_1571',
      checksum: res.body.md5,
    });
    // The bytes really were retained, and they are the bytes that were sent.
    const stored = await harness.pglite.query(`SELECT sha256, byte_size, rendered_from FROM rendered_leaf_files WHERE id = $1`, [leaves[0].document_id]);
    expect(stored.rows[0]).toMatchObject({ rendered_from: 'ind_form_sponsor_upload', byte_size: SIGNED_PDF.length });

    // And the listing now reports it as placed.
    const listed = await request(app).get('/api/ind-forms/').query({ projectIdent: 'BX-910' });
    expect(listed.body.placements).toEqual([
      expect.objectContaining({ formId: 'FDA_1571', sectionCode: 'm1.1', sequenceNumber: '0000' }),
    ]);
  });

  it('re-attaching a corrected signature replaces the leaf instead of filing the form twice', async () => {
    await seedProgram({ code: 'BX-911', name: 'BX-911 (IND)', productName: 'Product 911' });
    const { sequenceId } = await seedSpine({ title: 'BX-911 (IND)', productName: 'Product 911' });
    const first = await request(app).post('/api/ind-forms/FDA_1572/official-upload')
      .field('projectIdent', 'BX-911').attach('file', SIGNED_PDF, 'a.pdf');
    const corrected = Buffer.from('%PDF-1.7\n% corrected signature\n%%EOF\n', 'utf8');
    const second = await request(app).post('/api/ind-forms/FDA_1572/official-upload')
      .field('projectIdent', 'BX-911').attach('file', corrected, 'b.pdf');

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.replaced).toBe(true);
    expect(second.body.leafId).toBe(first.body.leafId);
    const leaves = (await leafRows(sequenceId!)).filter((l) => l.deleted_at == null);
    expect(leaves).toHaveLength(1);
    expect(leaves[0].checksum).toBe(second.body.md5);
  });

  it('files the financial certification at its own catalogued section, not with the forms', async () => {
    await seedProgram({ code: 'BX-912', name: 'BX-912 (IND)', productName: 'Product 912' });
    await seedSpine({ title: 'BX-912 (IND)', productName: 'Product 912' });
    const res = await request(app).post('/api/ind-forms/FDA_3454/official-upload')
      .field('projectIdent', 'BX-912').attach('file', SIGNED_PDF, 'signed-3454.pdf');
    expect(res.status).toBe(201);
    expect(res.body.sectionCode).toBe('m1.3.4');
  });

  it('refuses a file that is not a PDF by its bytes, whatever it claims to be', async () => {
    await seedProgram({ code: 'BX-913', name: 'BX-913 (IND)', productName: 'Product 913' });
    await seedSpine({ title: 'BX-913 (IND)', productName: 'Product 913' });
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'BX-913')
      .attach('file', Buffer.from('PK\x03\x04 not a pdf'), { filename: 'claims.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not a PDF/i);
  });

  it('refuses the BLANK official template — attaching it would file an unsigned form as a signed one', async () => {
    await seedProgram({ code: 'BX-914', name: 'BX-914 (IND)', productName: 'Product 914' });
    await seedSpine({ title: 'BX-914 (IND)', productName: 'Product 914' });
    // The real vendored FDA asset, byte for byte.
    const blank = fs.readFileSync(templatePathFor('FDA_1571'));
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'BX-914').attach('file', blank, 'FDA_1571.pdf');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BLANK_TEMPLATE');
  }, 30_000);

  it('will not invent a sequence to file into', async () => {
    await seedProgram({ code: 'BX-915', name: 'BX-915 (IND)', productName: 'Product 915' });
    await seedSpine({ title: 'BX-915 (IND)', productName: 'Product 915', withSequence: false });
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'BX-915').attach('file', SIGNED_PDF, 'x.pdf');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_SEQUENCE');
  });

  it('will not file into a program that has no submission record at all', async () => {
    await seedProgram({ code: 'BX-916', name: 'BX-916 (IND)', productName: 'Product 916' });
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'BX-916').attach('file', SIGNED_PDF, 'x.pdf');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_SUBMISSION_SPINE');
  });

  it('never files into another organization\'s program', async () => {
    await seedProgram({ org: 2, code: 'BX-917', name: 'BX-917 (IND)', productName: 'Product 917' });
    await seedSpine({ org: 2, title: 'BX-917 (IND)', productName: 'Product 917' });
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'BX-917').attach('file', SIGNED_PDF, 'x.pdf');
    expect(res.status).toBe(404);
  });

  it('requires the open program, and refuses an unsupported form', async () => {
    const noIdent = await request(app).post('/api/ind-forms/FDA_1571/official-upload').attach('file', SIGNED_PDF, 'x.pdf');
    expect(noIdent.status).toBe(400);
    const badForm = await request(app).post('/api/ind-forms/nope/official-upload')
      .field('projectIdent', 'BX-910').attach('file', SIGNED_PDF, 'x.pdf');
    expect(badForm.status).toBe(400);
  });

  it('requires the regulatory-author role', async () => {
    currentUser = { id: 9, organizationId: 1, roles: ['viewer'] };
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'BX-910').attach('file', SIGNED_PDF, 'x.pdf');
    expect(res.status).toBe(403);
    currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  });
});
