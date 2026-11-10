/** Signed assessment content and exact project children, exercised against real SQL. */
import express from 'express';
import request from 'supertest';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  query: null as unknown as (sql: string, args?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>,
  access: vi.fn(), write: vi.fn(),
}));
vi.mock('../../db', () => ({
  pool: {
    query: (sql: string, args?: unknown[]) => h.query(sql, args),
    connect: async () => ({ query: (sql: string, args?: unknown[]) => h.query(sql, args), release: vi.fn() }),
  },
}));
vi.mock('../../services/c2c/current-program-access', async original => ({
  ...(await original<Record<string, unknown>>()), requireCurrentProgramAccess: h.access,
}));
vi.mock('../../services/c2c/governed-program-write', async original => ({
  ...(await original<Record<string, unknown>>()), requireGovernedProgramWriteTx: h.write,
}));
vi.mock('../../services/part11/signing-authority-gate', () => ({ checkSigningAuthority: async () => null }));
vi.mock('../../services/part11/reverify-signer', () => ({ reverifySigner: async () => ({ ok: true, authenticationMethod: 'password', secondFactorVerified: false }) }));
vi.mock('../../services/part11/reverify-signer-deps', () => ({ signerReverificationDeps: () => ({}) }));
// The real actuator, with addCtqFactor observed, so a case can see the route save through it.
vi.mock('../../services/rbm/rbm-actuator', async original => {
  const actual = await original<typeof import('../../services/rbm/rbm-actuator')>();
  return { ...actual, addCtqFactor: vi.fn(actual.addCtqFactor) };
});

import { ProgramReadAccessError } from '../../services/c2c/current-program-access';
import { addCtqFactor, amendAssessment } from '../../services/rbm/rbm-actuator';
import router from '../mdx-rbm';

const PUBLIC = '11111111-1111-4111-8111-111111111111';
const PRIVATE = '22222222-2222-4222-8222-222222222222';
const PRIVATE_PROSE = 'Private project B retained risk prose';
const FOREIGN_PROSE = 'Another tenant retained risk prose';
let db: PGlite;
function app() {
  const a = express(); a.use(express.json());
  a.use((req, _res, next) => { Object.assign(req, { user: { id: 3, organizationId: 7, role: 'admin' }, dbClient: { query: h.query } }); next(); });
  a.use('/api/mdx', router); return a;
}

beforeAll(async () => {
  db = new PGlite();
  h.query = (sql, args) => db.query(sql, args);
  await db.exec(`
    CREATE TABLE rbm_risk_assessments (
      id serial PRIMARY KEY, organization_id integer NOT NULL, program_id uuid,
      title text NOT NULL, framework text DEFAULT 'ich_e6r3', overall_risk text,
      status text DEFAULT 'draft', version integer DEFAULT 1, metadata jsonb DEFAULT '{}',
      created_by integer, approved_by integer, approved_at timestamptz,
      created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), deleted_at timestamptz
    );
    CREATE TABLE rbm_risk_items (
      id serial PRIMARY KEY, organization_id integer NOT NULL, assessment_id integer, program_id uuid,
      ref_code text, category text, ctq_factor text, risk_description text,
      likelihood integer, impact integer, detectability integer, risk_score numeric, is_critical boolean DEFAULT false,
      mitigation text, residual_likelihood integer, residual_impact integer, residual_score numeric,
      status text DEFAULT 'open', assigned_to integer, metadata jsonb DEFAULT '{}', created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(), deleted_at timestamptz
    );
  `);
}, 60_000);

beforeEach(async () => {
  vi.mocked(addCtqFactor).mockClear();
  h.access.mockReset().mockImplementation(async (_q: unknown, input: { programId: string }) => {
    if (input.programId !== PUBLIC) throw new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Project access is not permitted.');
    return { programId: PUBLIC, projectId: 70, clientWorkspaceId: null, actor: { userId: 3, role: 'admin' } };
  });
  h.write.mockReset().mockImplementation(async (_q: unknown, _org: number, _user: number, programId: string) => {
    if (programId !== PUBLIC) throw new ProgramReadAccessError(403, 'PROJECT_PERMISSION_DENIED', 'Project access is not permitted.');
  });
  await db.exec(`
    TRUNCATE rbm_risk_items, rbm_risk_assessments RESTART IDENTITY;
    INSERT INTO rbm_risk_assessments
      (id, organization_id, program_id, title, framework, overall_risk, status, version, metadata, created_by, approved_by, approved_at)
    VALUES
      (10,7,'${PUBLIC}','Signed active assessment','ich_e6r3','high','active',2,'{"approvalReason":"Independent signed review"}',8,9,'2026-10-01T12:00:00Z'),
      (11,7,'${PUBLIC}','Signed historical assessment','ich_e6r3','medium','archived',1,'{"approvalReason":"Historical signed review"}',8,9,'2026-09-01T12:00:00Z'),
      (12,7,'${PUBLIC}','Editable draft assessment','ich_e6r3','medium','draft',3,'{}',3,NULL,NULL);
    INSERT INTO rbm_risk_items
      (id, organization_id, assessment_id, program_id, category, ctq_factor, risk_description, likelihood, impact, risk_score, is_critical, status)
    VALUES
      (20,7,10,'${PUBLIC}','data_integrity','Signed public factor','Signed public risk',4,4,16,true,'open'),
      (21,7,11,'${PUBLIC}','safety','Historical public factor','Historical public risk',3,3,9,false,'open'),
      (22,7,12,'${PUBLIC}','operational','Editable draft factor','Editable draft risk',2,2,4,false,'open'),
      (30,7,10,'${PRIVATE}','safety','${PRIVATE_PROSE}','Private project risk',5,5,25,true,'open'),
      (31,8,10,'${PUBLIC}','safety','${FOREIGN_PROSE}','Foreign tenant risk',5,5,25,true,'open');
  `);
});
afterAll(async () => { await db?.close(); });

async function assessment(id: number) { return (await db.query('SELECT * FROM rbm_risk_assessments WHERE id=$1', [id])).rows[0]; }
async function item(id: number) { return (await db.query('SELECT * FROM rbm_risk_items WHERE id=$1', [id])).rows[0]; }
async function openAmendment() {
  await db.exec("DELETE FROM rbm_risk_assessments WHERE status='draft'; BEGIN;");
  try {
    const out = await amendAssessment({ query: h.query }, 7, { assessmentId: 10, reason: 'Update monitoring risk basis', openedBy: 3 });
    await db.exec('COMMIT'); return out;
  } catch (error) { await db.exec('ROLLBACK'); throw error; }
}

const SIGNED = [{ label: 'active', id: 10 }, { label: 'archived', id: 11 }];
describe('signed assessments remain immutable until an amendment', () => {
  it.each(SIGNED)('refuses a title change on the $label signed version', async ({ id }) => {
    const before = await assessment(id);
    const out = await request(app()).patch(`/api/mdx/rbm-assessments/${id}`).send({ title: 'Changed signed content' });
    expect(out.status).toBe(409);
    expect(await assessment(id)).toEqual(before);
  });

  it.each(SIGNED)('cannot reopen the $label signed version with status=draft', async ({ id }) => {
    const before = await assessment(id);
    const out = await request(app()).patch(`/api/mdx/rbm-assessments/${id}`).send({ status: 'draft' });
    expect(out.status).toBe(409);
    expect(await assessment(id)).toEqual(before);
  });

  it('continues to edit an unsigned draft', async () => {
    const out = await request(app()).patch('/api/mdx/rbm-assessments/12').send({ title: 'Updated draft content' });
    expect(out.status).toBe(200);
    expect(await assessment(12)).toMatchObject({ title: 'Updated draft content', status: 'draft', approved_by: null, approved_at: null });
  });
});

describe('a signed assessment freezes its linked risk register', () => {
  it.each([{ label: 'active', id: 20 }, { label: 'archived', id: 21 }])('refuses editing a factor linked to the $label assessment', async ({ id }) => {
    const before = await item(id);
    const out = await request(app()).patch(`/api/mdx/rbm-risk-items/${id}`).send({ mitigation: 'Change signed mitigation' });
    expect(out.status).toBe(409);
    expect(await item(id)).toEqual(before);
  });

  it.each(SIGNED)('refuses adding a factor under the $label signed assessment', async ({ id }) => {
    const before = (await db.query('SELECT id FROM rbm_risk_items ORDER BY id')).rows;
    const out = await request(app()).post('/api/mdx/rbm-risk-items').send({ programId: PUBLIC, assessmentId: id, ctqFactor: 'Unsigned appended factor', likelihood: 3, impact: 4 });
    expect(out.status).toBe(409);
    expect((await db.query('SELECT id FROM rbm_risk_items ORDER BY id')).rows).toEqual(before);
  });

  it('continues to edit a factor linked to a draft', async () => {
    const out = await request(app()).patch('/api/mdx/rbm-risk-items/22').send({ mitigation: 'Reviewed draft mitigation' });
    expect(out.status).toBe(200);
    expect(await item(22)).toMatchObject({ mitigation: 'Reviewed draft mitigation', assessment_id: 12 });
  });

  // The RACT screen sent assessmentId null when the study had none; such a factor
  // is on no assessment page and in no signed content (F1 2026-11-02).
  it.each([{ label: 'omitted', extra: {} }, { label: 'null', extra: { assessmentId: null } }])(
    'refuses a factor whose assessment is $label, and writes nothing', async ({ extra }) => {
      const before = (await db.query('SELECT id FROM rbm_risk_items ORDER BY id')).rows;
      const out = await request(app()).post('/api/mdx/rbm-risk-items')
        .send({ programId: PUBLIC, ctqFactor: 'Unattached factor', likelihood: 3, impact: 4, ...extra });
      expect(out.status).toBe(422);
      expect(out.body.details).toMatchObject({ code: 'RBM_ASSESSMENT_REQUIRED' });
      expect((await db.query('SELECT id FROM rbm_risk_items ORDER BY id')).rows).toEqual(before);
    });

  it('continues to add a factor to a draft', async () => {
    const out = await request(app()).post('/api/mdx/rbm-risk-items').send({ programId: PUBLIC, assessmentId: 12, ctqFactor: 'New draft factor', likelihood: 3, impact: 4 });
    expect(out.status).toBe(201);
    expect(out.body.data).toMatchObject({ assessment_id: 12, program_id: PUBLIC, ctq_factor: 'New draft factor' });
  });
});

// POST /rbm-risk-items and AnA's add_ctq_factor save a factor through one insert,
// addCtqFactor (docs/evidence/F1/2026-11-02-rbm-outside-items/README.md).
describe('a new factor is saved by the actuator\'s one insert', () => {
  const post = (body: Record<string, unknown>) => request(app()).post('/api/mdx/rbm-risk-items').send({ programId: PUBLIC, assessmentId: 12, ...body });

  it('infers criticality from the band when isCritical is omitted, as addCtqFactor does', async () => {
    const out = await post({ ctqFactor: 'Primary endpoint assessment', likelihood: 5, impact: 4 });
    expect(out.status).toBe(201);
    expect(out.body.data).toMatchObject({ is_critical: true, assessment_id: 12 });
    expect(Number(out.body.data.risk_score)).toBe(20);
  });

  it('keeps the status, owner and ref code the RACT form posts', async () => {
    const out = await post({ ctqFactor: 'X', likelihood: 2, impact: 2, status: 'mitigating', assignedTo: 3, refCode: 'CTQ-9', isCritical: false });
    expect(out.status).toBe(201);
    expect(out.body.data).toMatchObject({ status: 'mitigating', assigned_to: 3, ref_code: 'CTQ-9', is_critical: false });
  });

  it('calls addCtqFactor once, for the tenant and the named assessment', async () => {
    const out = await post({ ctqFactor: 'Consent version control', likelihood: 3, impact: 3 });
    expect(out.status).toBe(201);
    expect(addCtqFactor).toHaveBeenCalledOnce();
    expect(addCtqFactor).toHaveBeenCalledWith(expect.anything(), 7, expect.objectContaining({ assessmentId: 12 }));
  });
});

// A seeded factor carries the library-default mark until a person saves its
// rating (rbm-assessment-seed.ts; F1 2026-11-02).
describe('the library-default mark on a seeded factor', () => {
  const MARK = { ratingSource: 'default_seed', ratingFrom: { table: 'DEFAULT_CTQ_FACTORS', ctqFactor: 'Seeded factor' } };
  const mark = (id: number) => db.query('UPDATE rbm_risk_items SET metadata = $1 WHERE id = $2', [JSON.stringify(MARK), id]);
  const metadata = async (id: number) => ((await item(id)) as { metadata: unknown }).metadata;

  // The body RbmRact.saveItem sends on an edit (RbmSurfacesA.tsx): it always
  // carries likelihood and impact, filled in from the stored row (factor 22: 2 x 2).
  const ractEdit = (over: Record<string, unknown>) => ({
    category: 'operational', ctqFactor: 'Editable draft factor', likelihood: 2, impact: 2,
    detectability: null, isCritical: false, mitigation: null, status: 'open', ...over,
  });

  it.each([
    { label: 'the mitigation alone', body: { mitigation: 'Reviewed mitigation' } },
    { label: 'the RACT form, status changed and ratings as stored', body: ractEdit({ status: 'mitigating' }) },
    { label: 'the RACT form, mitigation changed and ratings as stored', body: ractEdit({ mitigation: 'Central review + KRI' }) },
  ])('is kept by an edit of $label', async ({ body }) => {
    await mark(22);
    expect((await request(app()).patch('/api/mdx/rbm-risk-items/22').send(body)).status).toBe(200);
    expect(await metadata(22)).toEqual(MARK);
  });

  it.each([
    { label: 'the RACT form with a new likelihood', body: ractEdit({ likelihood: 3 }) },
    { label: 'the RACT form with a new impact', body: ractEdit({ impact: 4 }) },
    { label: 'the impact alone', body: { impact: 4 } },
  ])('is cleared when a person changes the rating: $label', async ({ body }) => {
    await mark(22);
    expect((await request(app()).patch('/api/mdx/rbm-risk-items/22').send(body)).status).toBe(200);
    expect(await metadata(22)).not.toHaveProperty('ratingSource');
    expect(await metadata(22)).not.toHaveProperty('ratingFrom');
  });

  it('is carried into an amendment, so the copy does not read as tailored', async () => {
    await mark(20);
    const out = await openAmendment();
    expect(out.amended).toBe(true);
    expect(out.items?.[0]).toMatchObject({ ctq_factor: 'Signed public factor', metadata: MARK });
  });
});

// POST /rbm-assessments/seed seeds only a study with no assessment, checked inside its transaction.
describe('the seed route on a study that already has an assessment', () => {
  it('answers 409 and writes nothing', async () => {
    const before = (await db.query('SELECT id FROM rbm_risk_assessments ORDER BY id')).rows;
    const out = await request(app()).post('/api/mdx/rbm-assessments/seed').send({ programId: PUBLIC });
    expect(out.status).toBe(409);
    expect(out.body.details).toMatchObject({ code: 'RBM_ASSESSMENT_EXISTS' });
    expect((await db.query('SELECT id FROM rbm_risk_assessments ORDER BY id')).rows).toEqual(before);
  });
});

describe('retained children and amendment provenance', () => {
  it('does not disclose another project or tenant child through the public assessment', async () => {
    const out = await request(app()).get('/api/mdx/rbm-assessments/10');
    expect(out.status).toBe(200);
    expect(JSON.stringify(out.body)).not.toContain(PRIVATE_PROSE);
    expect(JSON.stringify(out.body)).not.toContain(FOREIGN_PROSE);
    expect(out.body.data.items.map((row: { id: number }) => row.id)).toEqual([20]);
  });

  it('does not copy or return a private-project retained child in a public amendment', async () => {
    const out = await openAmendment();
    expect(out.amended).toBe(true);
    expect(JSON.stringify(out.items)).not.toContain(PRIVATE_PROSE);
    expect(JSON.stringify(out.items)).not.toContain(FOREIGN_PROSE);
    expect(out.items).toHaveLength(1);
    expect(out.items?.[0]).toMatchObject({ program_id: PUBLIC, ctq_factor: 'Signed public factor' });
  });

  it('records the amendment creator independently of the prior version author', async () => {
    const out = await openAmendment();
    expect(out.amended).toBe(true);
    expect(await assessment(Number(out.assessment.id))).toMatchObject({ status: 'draft', created_by: 3, approved_by: null, approved_at: null });
    expect(await assessment(10)).toMatchObject({ created_by: 8, approved_by: 9, status: 'active' });
  });

  it('requires a second person to approve the amendment opened by this actor', async () => {
    const amended = await openAmendment();
    expect(amended.amended).toBe(true);
    const id = Number(amended.assessment.id);
    const out = await request(app()).post(`/api/mdx/rbm-assessments/${id}/approve`).send({ reason: 'Independent approval required', password: 'fixture-password' });
    expect(out.status).toBe(403);
    expect(out.body.details?.code).toBe('RBM_SELF_APPROVAL');
    expect(await assessment(id)).toMatchObject({ status: 'draft', approved_by: null, approved_at: null });
  });
});
