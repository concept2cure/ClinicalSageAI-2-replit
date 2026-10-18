/**
 * An IBC registration's declared containment level and recombinant-DNA flag
 * are NOT RECORDED until someone records them.
 *
 * ibc_registrations.biosafety_level was `NOT NULL DEFAULT 'BSL-1'`, so a
 * registration whose containment nobody had declared carried a declared BSL-1
 * that the containment gate then compared against the agents (a critical
 * "declared BSL-1 is below …" finding about a declaration nobody made, or a
 * clean pass for RG1 agents); the route refused a registration without one.
 * involves_recombinant_dna was `NOT NULL DEFAULT false` and createRegistrationTx
 * wrote `involvesRecombinantDna === true`, so an unanswered question was stored
 * as "no recombinant DNA". Both are now NULL until stated, and the gate reports
 * the containment check as not assessed.
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
import { createRegistrationTx } from '../ibc-service';
import { evaluateContainment } from '../ibc-logic';

const ORG = 7;
const USER = 3;
const REASON = 'Registering the vector work with the IBC.';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migration = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
const client = { query: (s: string, p?: unknown[]) => query(s, p) };

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

const stored = async (id: number) =>
  (await pglite.query(`SELECT biosafety_level, involves_recombinant_dna FROM ibc_registrations WHERE id = $1`, [id])).rows[0];

describe('the registration stores the containment and recombinant-DNA answers it was given, and nothing else', () => {
  it('a registration that states neither stores NULL for both, not BSL-1 and "no"', async () => {
    const res = await request(app).post('/api/ibc/registrations').send({ registrationNumber: 'R-1', title: 'AAV vector production', reason: REASON });
    expect(res.status).toBe(201);
    expect(await stored(res.body.id)).toEqual({ biosafety_level: null, involves_recombinant_dna: null });
  });

  it('the service passes an unstated recombinant-DNA answer as NULL, and stated answers as given', async () => {
    const unstated = await createRegistrationTx(client, ORG, USER, { registrationNumber: 'R-2', title: 'x', biosafetyLevel: 'BSL-2' });
    expect(await stored(unstated.id)).toEqual({ biosafety_level: 'BSL-2', involves_recombinant_dna: null });
    const no = await createRegistrationTx(client, ORG, USER, { registrationNumber: 'R-3', title: 'x', biosafetyLevel: 'BSL-1', involvesRecombinantDna: false });
    expect(await stored(no.id)).toEqual({ biosafety_level: 'BSL-1', involves_recombinant_dna: false });
  });
});

describe('the containment gate does not compare against a level nobody declared', () => {
  const agents = [{ agentName: 'Lentiviral vector', riskGroup: 'RG2' as const, requiredBsl: 'BSL-2' as const }];

  it('reports the containment check as not assessed and the risk as undetermined', () => {
    const r = evaluateContainment({ declaredBsl: null, nihGuidelinesSection: 'III-D', involvesHumanGeneTransfer: false, agents });
    expect(r.findings.some((f) => /Declared containment/.test(f.message))).toBe(false);
    expect(r.notAssessed.join(' ')).toMatch(/declared containment level is not recorded/);
    expect(r.checksRun.join(' ')).not.toMatch(/declared containment at or above/);
    expect(r.riskLevel).toBe('undetermined');
    expect(r.highestRequiredBsl).toBe('BSL-2');
  });

  it('GET /containment for a registration with no declared level says so', async () => {
    const created = await request(app).post('/api/ibc/registrations').send({
      registrationNumber: 'R-4', title: 'x', nihGuidelinesSection: 'III-D', involvesHumanGeneTransfer: false, reason: REASON,
    });
    await pglite.query(
      `INSERT INTO ibc_biological_agents (organization_id, registration_id, agent_name, agent_type, risk_group, required_bsl, created_by)
       VALUES ($1, $2, 'Lentiviral vector', 'viral_vector', 'RG2', 'BSL-2', $3)`,
      [ORG, created.body.id, USER],
    );
    const res = await request(app).get(`/api/ibc/registrations/${created.body.id}/containment`);
    expect(res.status).toBe(200);
    expect(res.body.containment.riskLevel).toBe('undetermined');
    expect(res.body.containment.notAssessed.join(' ')).toMatch(/declared containment level is not recorded/);
  });
});
