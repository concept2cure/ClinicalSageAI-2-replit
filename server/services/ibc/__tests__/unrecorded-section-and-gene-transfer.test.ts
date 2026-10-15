/**
 * An IBC registration's NIH Guidelines section and human-gene-transfer flag are
 * NOT RECORDED until someone records them.
 *
 * createRegistrationTx wrote `nihGuidelinesSection ?? 'not_applicable'` and
 * `involvesHumanGeneTransfer === true` (as did AnA's create_ibc_registration),
 * into NOT NULL columns defaulting to the same. A registration nobody had
 * categorised was stored as an explicit "not applicable" and "no gene
 * transfer", so the convened-IBC review requirement (NIH Guidelines III-A/B/C,
 * human gene transfer) was reported as not required for CGT / mRNA work that
 * may need it. Absent now stays NULL, the requirement is `null` (undetermined),
 * and the containment gate reports that check as not assessed.
 *
 * Through the real router and the real creating migration, on PGlite.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

let pglite: PGlite;

const query = async (sql: string, params?: unknown[]) => {
  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) return { rows: [], rowCount: 0 };
  const r = await pglite.query(sql, params as unknown[]);
  return { rows: r.rows as any[], rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length };
};

vi.mock('../../../db', () => ({
  pool: {
    query: (s: string, p?: unknown[]) => query(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => query(s, p), release: () => undefined }),
  },
  db: {},
}));
vi.mock('../../../routes/c2c/actions', () => ({ recordGovernedAction: vi.fn(async () => ({ actionId: 1 })) }));
vi.mock('../../tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));
vi.mock('../../ibc-metrics', () => ({
  recordIbcRegistrationCreated: vi.fn(),
  recordIbcApproval: vi.fn(),
  recordIbcAgentRegistered: vi.fn(),
}));

import ibcRouter from '../../../routes/ibc';
import { evaluateContainment, requiresConvenedReview, type IbcCompletenessInput } from '../ibc-logic';

const ORG = 7;
const USER = 3;
const REASON = 'Registering the vector work with the IBC.';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migration = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'member' };
  next();
});
app.use('/api/ibc', ibcRouter);

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE submissions (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO users (id) VALUES (${USER});
  `);
  await pglite.exec(migration('migrations/20260610_ibc_biosafety.sql'));
}, 60_000);

beforeEach(async () => {
  await pglite.exec('TRUNCATE ibc_biological_agents, ibc_registrations RESTART IDENTITY CASCADE;');
});

const BASE = { registrationNumber: 'R-1', title: 'AAV vector production', biosafetyLevel: 'BSL-2', reason: REASON };

const agents: IbcCompletenessInput['agents'] = [{ agentName: 'AAV9', riskGroup: 'RG1', requiredBsl: 'BSL-1' }];

describe('the registration stores what was answered, and nothing else', () => {
  it('a registration that states neither stores NULL for both and does not claim convened review is unnecessary', async () => {
    const res = await request(app).post('/api/ibc/registrations').send(BASE);
    expect(res.status).toBe(201);
    expect(res.body.requiresConvenedReview).toBeNull();
    const r = await pglite.query(`SELECT nih_guidelines_section, involves_human_gene_transfer FROM ibc_registrations WHERE id = $1`, [res.body.id]);
    expect(r.rows[0]).toEqual({ nih_guidelines_section: null, involves_human_gene_transfer: null });
  });

  it('recorded answers are stored and decide the requirement', async () => {
    const res = await request(app).post('/api/ibc/registrations').send({ ...BASE, nihGuidelinesSection: 'III-E', involvesHumanGeneTransfer: false });
    expect(res.status).toBe(201);
    expect(res.body.requiresConvenedReview).toBe(false);
  });
});

describe('the convened-review requirement is three-valued', () => {
  it.each([
    [null, null, null],
    ['III-D', null, null],
    [null, false, null],
    [null, true, true],
    ['III-B', null, true],
    ['III-E', false, false],
  ] as const)('section %s, gene transfer %s → %s', (section, hgt, expected) => {
    expect(requiresConvenedReview(section, hgt)).toBe(expected);
  });

  it('the containment gate reports the unrecorded facts as not assessed rather than as "not required"', () => {
    const r = evaluateContainment({ declaredBsl: 'BSL-2', nihGuidelinesSection: null, involvesHumanGeneTransfer: null, agents });
    expect(r.findings.some((f) => /convened/i.test(f.message))).toBe(false);
    expect(r.notAssessed.join(' ')).toMatch(/NIH Guidelines section/);
    expect(r.notAssessed.join(' ')).toMatch(/human gene transfer/);
  });

  it('GET /containment for an uncategorised registration says the requirement was not assessed', async () => {
    const created = await request(app).post('/api/ibc/registrations').send(BASE);
    await pglite.query(
      `INSERT INTO ibc_biological_agents (organization_id, registration_id, agent_name, agent_type, risk_group, required_bsl, created_by)
       VALUES ($1, $2, 'AAV9', 'viral_vector', 'RG1', 'BSL-1', $3)`,
      [ORG, created.body.id, USER],
    );
    const res = await request(app).get(`/api/ibc/registrations/${created.body.id}/containment`);
    expect(res.status).toBe(200);
    expect(res.body.containment.notAssessed.join(' ')).toMatch(/convened/i);
    expect(res.body.expiration).toMatchObject({ undetermined: true, expired: null });
  });

  it('GET /containment computes expiry from a recorded approval date, read as a date rather than a Date', async () => {
    // node-postgres returns a DATE as a Date; addYears returned it unchanged,
    // so the "expiry" was the approval date and `expired` was always false.
    const created = await request(app).post('/api/ibc/registrations').send({ ...BASE, nihGuidelinesSection: 'III-D', involvesHumanGeneTransfer: false });
    await pglite.query(`UPDATE ibc_registrations SET status = 'approved', approval_date = '2025-01-01' WHERE id = $1`, [created.body.id]);
    const res = await request(app).get(`/api/ibc/registrations/${created.body.id}/containment`);
    expect(res.body.expiration).toEqual({ undetermined: false, expirationDate: '2026-01-01', expired: true });
  });
});
