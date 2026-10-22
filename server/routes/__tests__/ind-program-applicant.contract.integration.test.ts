/** Existing program-facts route: explicit existing-sponsor binding and governed receipts. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createIndPgliteDb, type IndPgliteDb } from '../../db/pglite-harness';
import { pglitePool } from '../../services/ana-ri/__tests__/pglite-pool.fixture';

const holder = vi.hoisted(() => ({ db: null as any, pglite: null as any, auditFails: false, commitAckLost: false }));
const query = async (text: string, params?: unknown[]) => {
  const result = await holder.pglite.query(text, params);
  return { rows: result.rows, rowCount: result.rows.length };
};
vi.mock('../../db', () => ({
  get db() { return holder.db; },
  pool: {
    query: async (text: string, params?: unknown[]) => {
      const result = await holder.pglite.query(text, params);
      return { rows: result.rows, rowCount: result.rows.length };
    },
    connect: async () => {
      const client = pglitePool(() => holder.pglite).client;
      return { ...client, query: async (...args: Parameters<typeof client.query>) => {
        const result = await client.query(...args);
        if (args[0] === 'COMMIT' && holder.commitAckLost) throw new Error('private lost commit acknowledgement');
        return result;
      } };
    },
  },
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true, chained: true, tamperProof: true })) },
  writeChainedAuditRow: vi.fn(async (client: { query: typeof query }, entry: Record<string, unknown>) => {
    if (holder.auditFails) throw new Error('private audit database failure');
    await client.query('INSERT INTO applicant_audit_probe (entry) VALUES ($1::jsonb)', [JSON.stringify(entry)]);
  }),
}));
import formsRouter from '../ind-forms.routes';

const PROGRAM = 'ba131111-1111-4111-8111-111111111111';
const FOREIGN_PROGRAM = 'ba132222-2222-4222-8222-222222222222';
const SPONSOR = 'ba133333-3333-4333-8333-333333333333';
const FOREIGN_SPONSOR = 'ba134444-4444-4444-8444-444444444444';
const REASON = 'Record the approved applicant for this program.';
let harness: IndPgliteDb;
let currentUser: any = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).user = currentUser; next(); });
app.use('/api/ind-forms', formsRouter);

beforeAll(async () => {
  harness = await createIndPgliteDb({ programSpine: true });
  holder.db = harness.db;
  holder.pglite = harness.pglite;
  await harness.pglite.exec(`
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
    ALTER TABLE regulatory_programs ADD COLUMN IF NOT EXISTS lead_user_id INTEGER;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS organization_users (organization_id INTEGER, user_id INTEGER, role TEXT);
    CREATE TABLE applicant_audit_probe (entry JSONB NOT NULL);
    INSERT INTO organizations (id,name) VALUES (1,'Tenant organization'),(2,'Other tenant');
    INSERT INTO users VALUES (9,'active');
    INSERT INTO organization_users VALUES (1,9,'manager');
    INSERT INTO regulatory_programs (id,organization_id,name,code,program_type,product_name,updated_at)
      VALUES ('${PROGRAM}',1,'Program','APP-IND','IND','Product','2026-10-21T10:11:12.123456Z'),
             ('${FOREIGN_PROGRAM}',2,'Other program','OTHER-IND','IND','Other product',now());
    INSERT INTO ind_sponsors (id,organization_id,name,duns,contact_name,contact_phone,contact_email)
      VALUES ('${SPONSOR}',1,'Recorded applicant','123456789','Regulatory contact','+1 617 555 0100','ra@example.org'),
             ('${FOREIGN_SPONSOR}',2,'Foreign applicant','987654321','Other contact','+1 212 555 0101','other@example.org');
  `);
}, 60_000);
afterAll(async () => { await harness.close(); });
beforeEach(async () => {
  holder.auditFails = false;
  holder.commitAckLost = false;
  currentUser = { id: 9, organizationId: 1, roles: ['regulatory-author'] };
  await query("UPDATE organization_users SET role='manager' WHERE organization_id=1 AND user_id=9");
});

async function readProgram() {
  const response = await request(app).get('/api/ind-forms/').query({ projectIdent: 'APP-IND' });
  expect(response.status).toBe(200);
  return response.body.program;
}
async function save(patch: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const program = await readProgram();
  return request(app).put('/api/ind-forms/program-facts').send({
    projectIdent: PROGRAM, reason: REASON, expectedFactsVersion: program.factsVersion,
    ...patch, ...extra,
  });
}

describe('the existing recorded program facts', () => {
  it('exposes an exact microsecond revision and an honest unbound state', async () => {
    const program = await readProgram();
    expect(program.factsVersion).toBe('2026-10-21T10:11:12.123456Z');
    expect(program.applicantSponsorId).toBeNull();
    expect(program.boundSponsor).toBeNull();
    expect(program.primaryAgency).toBe('FDA');
  });

  it('binds the existing sponsor and number with one audited program receipt; forms read that record', async () => {
    const res = await save({ applicantSponsorId: SPONSOR, applicationNumber: '001234', sponsorAddress: 'Program address' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      programId: PROGRAM, applicantSponsorId: SPONSOR, applicationNumber: '001234',
      sponsorAddress: 'Program address', indType: null, sponsorName: 'Recorded applicant',
      boundSponsor: { id: SPONSOR, name: 'Recorded applicant', duns: '123456789' },
      auditTrail: { persisted: true, chained: true },
    });
    expect(res.body.factsVersion).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
    const program = await readProgram();
    expect(program.formMetadata).toMatchObject({
      sponsorName: 'Recorded applicant', indNumber: '001234',
      sponsor: { name: 'Recorded applicant', address: 'Program address', contactName: 'Regulatory contact',
        contactPhone: '+1 617 555 0100', contactEmail: 'ra@example.org' },
    });
    const audit = (await query('SELECT entry FROM applicant_audit_probe ORDER BY ctid DESC LIMIT 1')).rows[0].entry;
    expect(audit).toMatchObject({ action: 'ind_form.program_facts.update', reason: REASON,
      details: { reason: REASON, after: { applicantSponsorId: SPONSOR, applicationNumber: '001234' } } });
  });

  it('pins form applicant identity to the program record despite caller overrides', async () => {
    expect((await save({ applicantSponsorId: SPONSOR, applicationNumber: '001234', sponsorAddress: 'Program address' })).status).toBe(200);
    const built = await request(app).post('/api/ind-forms/FDA_1571/build').send({
      projectIdent: PROGRAM, sponsorName: 'Caller override', indNumber: '999999',
      sponsor: { name: 'Other applicant', address: 'Other address', contactName: 'Other person',
        contactPhone: '+1 999 555 0199', contactEmail: 'other@example.org' },
    });
    expect(built.status).toBe(200);
    expect(built.body.fields).toMatchObject({
      sponsor_name: 'Recorded applicant', ind_number: '001234', sponsor_address: 'Program address',
      sponsor_contact_name: 'Regulatory contact', sponsor_contact_phone: '+1 617 555 0100', sponsor_contact_email: 'ra@example.org',
    });
  });

  it('preserves the bound registry signatory and refuses to replace it with stated metadata', async () => {
    await query('UPDATE ind_sponsors SET signatory_name=$1, signatory_title=$2 WHERE id=$3', ['Recorded signatory', 'Regulatory director', SPONSOR]);
    expect((await save({ applicantSponsorId: SPONSOR })).status).toBe(200);
    for (const stated of [{}, { sponsor: { authorizedRepName: 'Caller signatory', authorizedRepTitle: 'Caller title' } }]) {
      const built = await request(app).post('/api/ind-forms/FDA_3454/build').send({ projectIdent: PROGRAM, ...stated });
      expect(built.status).toBe(200);
      expect(built.body.fields).toMatchObject({ authorized_rep_name: 'Recorded signatory', authorized_rep_title: 'Regulatory director' });
    }
  });

  it('holds the same precise program revision across session time zones', async () => {
    const before = await readProgram();
    await query("SET TIME ZONE 'America/Los_Angeles'");
    try { expect((await readProgram()).factsVersion).toBe(before.factsVersion); }
    finally { await query("SET TIME ZONE 'UTC'"); }
  });

  it('enforces the same-tenant binding against direct SQL too', async () => {
    await expect(query('UPDATE regulatory_programs SET applicant_sponsor_id=$1 WHERE id=$2', [FOREIGN_SPONSOR, PROGRAM]))
      .rejects.toMatchObject({ code: '23503' });
    expect((await readProgram()).applicantSponsorId).toBe(SPONSOR);
  });
});

describe('governed program fact changes and receipts', () => {
  it('refuses a stale read rather than overwrite a newer binding', async () => {
    const before = await readProgram();
    expect((await save({ sponsorAddress: 'New recorded address' })).status).toBe(200);
    const stale = await save({ sponsorAddress: 'Stale address' }, { expectedFactsVersion: before.factsVersion });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('PROGRAM_FACTS_CONFLICT');
    expect((await readProgram()).sponsorAddress).toBe('New recorded address');
  });

  it('requires a stated reason and read revision', async () => {
    expect((await save({ sponsorAddress: 'Unsaved' }, { reason: '' })).status).toBe(400);
    expect((await save({ sponsorAddress: 'Unsaved' }, { expectedFactsVersion: undefined })).status).toBe(400);
  });

  it('reports an unavailable record read as an error rather than an unbound or missing program', async () => {
    const original = holder.db;
    holder.db = { select() { throw new Error('private query failure'); } };
    try {
      const response = await request(app).get('/api/ind-forms/').query({ projectIdent: PROGRAM });
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('PROGRAM_FACTS_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.toContain('private query');
      expect(response.body).not.toHaveProperty('program');
    } finally { holder.db = original; }
  });

  it('refuses a foreign sponsor without changing the program', async () => {
    const before = await readProgram();
    const response = await save({ applicantSponsorId: FOREIGN_SPONSOR, sponsorAddress: 'Foreign binding' });
    expect(response.status).toBe(404);
    expect((await readProgram()).factsVersion).toBe(before.factsVersion);
  });

  it('refuses invalid FDA application numbers and malformed sponsor IDs', async () => {
    expect((await save({ applicationNumber: 'IND123456' })).status).toBe(400);
    expect((await save({ applicantSponsorId: 'not-a-uuid' })).status).toBe(400);
  });

  it('rechecks current persisted authority despite an admitted regulatory-author session', async () => {
    await query("UPDATE organization_users SET role='viewer' WHERE organization_id=1 AND user_id=9");
    const response = await save({ sponsorAddress: 'Revoked writer' });
    expect(response.status).toBe(403);
  });

  it('rolls the facts and revision back when its chained audit cannot be written', async () => {
    const before = await readProgram();
    holder.auditFails = true;
    const response = await save({ sponsorAddress: 'Must roll back' });
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private audit');
    const after = await readProgram();
    expect(after.factsVersion).toBe(before.factsVersion);
    expect(after.sponsorAddress).toBe(before.sponsorAddress);
  });

  it('reports a lost commit acknowledgement as unconfirmed while the persisted change stands', async () => {
    holder.commitAckLost = true;
    const response = await save({ indType: 'Research IND' });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PROGRAM_FACTS_UNCONFIRMED');
    expect(response.body.error.message).toMatch(/could not be confirmed/);
    expect(response.body.error.message).not.toMatch(/Nothing was written/);
    expect((await readProgram()).indType).toBe('Research IND');
  });

  it('clears only stated facts and retains other recorded facts', async () => {
    const response = await save({ applicantSponsorId: null, applicationNumber: null });
    expect(response.status).toBe(200);
    expect(response.body.applicantSponsorId).toBeNull();
    expect(response.body.boundSponsor).toBeNull();
    expect(response.body.applicationNumber).toBeNull();
    expect(response.body.sponsorName).toBe('Tenant organization');
    expect(response.body.sponsorAddress).toBe('New recorded address');
  });
});
