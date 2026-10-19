/**
 * POST /api/ind-forms/:formId/official-upload records the uploader's statement
 * that the attached file is the completed, signed form — and nothing else
 * makes an attachment count as that form.
 *
 * What it used to do (report_ind_ivd_irb #15, 2026-10-15): the response said
 * `complete: true`, and the IND checklist counted the form done, whenever the
 * forms engine's check found no required field missing. That check is computed
 * from the program record and what the person stated, not from the file; it
 * cannot see a signature. Any PDF that was not the platform's own unedited
 * render — an edited, unsigned one included — was filed as the completed,
 * signed 1571 / 1572 / 3674 and raised readiness.
 *
 * Now the uploader states it (`attestCompletedSigned: 'true'`), and the route
 * records it with the file: the actor is the session's user, never a request
 * field, and the time is the server's. Unstated, the form is filed and is
 * "attached — not attested".
 *
 * The PGlite harness predates the attestation columns, so the real creating
 * migration (migrations/20260903_rendered_leaf_files.sql) is applied over it —
 * the same statement every deploy runs.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any }));
vi.mock('../../db', () => ({
  get db() { return holder.db; },
  pool: {
    query: async (text: string, params?: unknown[]) => {
      const r = await holder.pglite.query(text, params as unknown[]);
      return { rows: r.rows as unknown[], rowCount: (r.rows as unknown[]).length };
    },
  },
}));
const storage = vi.hoisted(() => ({ objects: new Map<string, Buffer>() }));
vi.mock('../../services/storage', async () => {
  const { createHash } = await import('node:crypto');
  return {
    getStorageProvider: () => ({
      name: 'test',
      async put(opts: { bytes: Buffer }) {
        const id = `vv-${storage.objects.size + 1}`;
        storage.objects.set(id, opts.bytes);
        return { vaultFileId: `vf-${id}`, vaultVersionId: id, sizeBytes: opts.bytes.length, sha256: createHash('sha256').update(opts.bytes).digest('hex'), provider: 'test' };
      },
      async delete() { return true; },
    }),
  };
});
const audit = vi.hoisted(() => ({ logAction: null as any }));
vi.mock('../../services/auditService', () => {
  audit.logAction = vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true }));
  return { default: { logAction: audit.logAction } };
});

import formsRouter from '../ind-forms.routes';
import { assembleOrgIndChecklists } from '../../services/ind-lifecycle/ind-checklist-view-assembler';

const UPLOADER = 9;
const SIGNED_PDF = Buffer.from('%PDF-1.7\n% edited in Acrobat; nothing here proves a signature\n%%EOF\n', 'utf8');

let harness: IndPgliteDb;
let app: express.Express;

beforeAll(async () => {
  harness = await createIndPgliteDb({ formArtifacts: true, submissionCore: true, programSpine: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await harness.pglite.exec(fs.readFileSync(path.join(process.cwd(), 'migrations/20260903_rendered_leaf_files.sql'), 'utf8'));
  await harness.pglite.exec("INSERT INTO organizations (id, name) VALUES (1, 'Concept2Cure Therapeutics')");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).user = { id: UPLOADER, organizationId: 1, roles: ['regulatory-author'] }; next(); });
  app.use('/api/ind-forms', formsRouter);
}, 60_000);
afterAll(async () => { await harness.close(); });

/** An IND program whose record holds every 1571 fact but the phase, with its submission and 0000. */
async function seedInd(code: string): Promise<{ submissionId: number; sequenceId: number }> {
  await harness.pglite.query(
    `INSERT INTO regulatory_programs (organization_id, name, code, program_type, product_name, indication)
     VALUES (1, $1, $2, 'IND', $3, 'Ovarian cancer')`,
    [`${code} (IND)`, code, `Product ${code}`],
  );
  const facts = await request(app).put('/api/ind-forms/program-facts')
    .send({ projectIdent: code, sponsorAddress: '1 Harbor Way, Boston MA', indType: 'Commercial IND' });
  expect(facts.status, JSON.stringify(facts.body)).toBe(200);
  const sub = await harness.pglite.query<{ id: number }>(
    `INSERT INTO submissions (title, product_name, application_type, client_type, primary_region, organization_id, created_by)
     VALUES ($1, $2, 'ind', 'biotech', 'fda', 1, 9) RETURNING id`,
    [`${code} (IND)`, `Product ${code}`],
  );
  const seq = await harness.pglite.query<{ id: number }>(
    `INSERT INTO ectd_sequences (submission_id, region, sequence_number, type, status, organization_id, created_by)
     VALUES ($1, 'fda', '0000', 'original', 'draft', 1, 9) RETURNING id`,
    [sub.rows[0].id],
  );
  return { submissionId: Number(sub.rows[0].id), sequenceId: Number(seq.rows[0].id) };
}

const stored = async (leafId: number) =>
  (await harness.pglite.query(
    `SELECT f.required_fields_missing, f.completed_signed_attested_by AS by, f.completed_signed_attested_at AS at
       FROM rendered_leaf_files f JOIN submission_leaves l ON l.document_id = f.id AND l.document_table = 'rendered_leaf_files'
      WHERE l.id = $1`, [leafId],
  )).rows[0] as { required_fields_missing: string[] | null; by: number | null; at: Date | null };

async function checklistForm(submissionId: number, formId: string) {
  const rows = await assembleOrgIndChecklists(1);
  const row = rows.find((r) => r.submissionId === submissionId) as
    | { forms: Array<{ id: string; done: boolean; attachment?: unknown }> } | undefined;
  return row?.forms.find((f) => f.id === formId);
}

const leafCount = async (sequenceId: number) =>
  Number((await harness.pglite.query<{ n: number }>(`SELECT count(*)::int AS n FROM submission_leaves WHERE sequence_id = $1`, [sequenceId])).rows[0].n);

describe('official-upload records the uploader’s completed-and-signed attestation, and only that makes the form count', () => {
  it('unstated: the form is filed, checked complete, and NOT complete — the checklist says attached, not attested', async () => {
    const { submissionId, sequenceId } = await seedInd('AT-1');
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'AT-1').field('sequenceId', String(sequenceId)).field('studyPhase', 'Phase 1')
      .field('attestCompletedSigned', 'false')
      .attach('file', SIGNED_PDF, 'signed-1571.pdf');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.requiredFieldsMissing).toEqual([]);
    expect(res.body.complete, 'an unattested attachment was reported as the completed form').toBe(false);
    expect(res.body).toMatchObject({ attested: false, attestedAt: null, attestedBy: null });
    expect(await stored(res.body.leafId)).toMatchObject({ required_fields_missing: [], by: null, at: null });
    expect(await checklistForm(submissionId, 'FDA_1571')).toMatchObject({
      done: false, attachment: { attested: false, requiredFieldsMissing: [] },
    });
  });

  it('stated: recorded with the file — actor from the session, never the body; time from the server — and the form counts', async () => {
    const { submissionId, sequenceId } = await seedInd('AT-2');
    const before = Date.now();
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'AT-2').field('sequenceId', String(sequenceId)).field('studyPhase', 'Phase 1')
      .field('attestCompletedSigned', 'true')
      // A body cannot name who attested, nor when.
      .field('attestedBy', '777').field('completedSignedAttestedBy', '777').field('userId', '777')
      .field('attestedAt', '2020-01-01T00:00:00Z')
      .attach('file', SIGNED_PDF, 'signed-1571.pdf');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ attested: true, attestedBy: UPLOADER, complete: true, requiredFieldsMissing: [] });
    const at = Date.parse(res.body.attestedAt);
    expect(at).toBeGreaterThanOrEqual(before - 1000);
    expect(at).toBeLessThanOrEqual(Date.now() + 1000);
    const row = await stored(res.body.leafId);
    expect(row.by).toBe(UPLOADER);
    expect(new Date(row.at as Date).getTime()).toBe(at);
    expect(await checklistForm(submissionId, 'FDA_1571')).toMatchObject({
      done: true, attachment: { attested: true, requiredFieldsMissing: [] },
    });
    // The Part 11 row for the upload says the statement was made.
    const call = audit.logAction.mock.calls.map((c: any[]) => c[0])
      .find((a: any) => a.action === 'ind_form.official_upload' && a.resourceId === res.body.leafId);
    expect(call).toMatchObject({ userId: UPLOADER, metadata: expect.objectContaining({ completedSignedAttested: true }) });
  });

  it('attested, with a required field missing: the statement is recorded and the form still does not count', async () => {
    const { submissionId, sequenceId } = await seedInd('AT-3');
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'AT-3').field('sequenceId', String(sequenceId)).field('attestCompletedSigned', 'true')
      .attach('file', SIGNED_PDF, 'signed-1571.pdf');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ attested: true, complete: false, requiredFieldsMissing: ['phase_of_study'] });
    expect((await checklistForm(submissionId, 'FDA_1571'))?.done).toBe(false);
  });

  it('an attestation that is neither true nor false is refused, and nothing is filed', async () => {
    const { sequenceId } = await seedInd('AT-4');
    const objects = storage.objects.size;
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'AT-4').field('sequenceId', String(sequenceId)).field('attestCompletedSigned', 'yes')
      .attach('file', SIGNED_PDF, 'signed-1571.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(storage.objects.size).toBe(objects);
    expect(await leafCount(sequenceId)).toBe(0);
  });

  it('an attestation over the platform’s own unedited render is refused — the platform never signs a form', async () => {
    const { sequenceId } = await seedInd('AT-5');
    const pdf = await request(app).post('/api/ind-forms/FDA_1571/pdf').send({ projectIdent: 'AT-5', studyPhase: 'Phase 1' })
      .buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(pdf.status).toBe(200);
    const objects = storage.objects.size;
    const res = await request(app).post('/api/ind-forms/FDA_1571/official-upload')
      .field('projectIdent', 'AT-5').field('sequenceId', String(sequenceId)).field('studyPhase', 'Phase 1')
      .field('attestCompletedSigned', 'true')
      .attach('file', pdf.body as Buffer, { filename: 'FDA-1571.pdf', contentType: 'application/pdf' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('ATTESTATION_CONTRADICTED');
    expect(storage.objects.size).toBe(objects);
    expect(await leafCount(sequenceId)).toBe(0);
  }, 30_000);
});
