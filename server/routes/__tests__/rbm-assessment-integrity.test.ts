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

import { ProgramReadAccessError } from '../../services/c2c/current-program-access';
import { amendAssessment } from '../../services/rbm/rbm-actuator';
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
      status text DEFAULT 'open', assigned_to integer, created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now(), deleted_at timestamptz
    );
  `);
}, 60_000);

beforeEach(async () => {
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

  it('continues to add a factor to a draft', async () => {
    const out = await request(app()).post('/api/mdx/rbm-risk-items').send({ programId: PUBLIC, assessmentId: 12, ctqFactor: 'New draft factor', likelihood: 3, impact: 4 });
    expect(out.status).toBe(201);
    expect(out.body.data).toMatchObject({ assessment_id: 12, program_id: PUBLIC, ctq_factor: 'New draft factor' });
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
