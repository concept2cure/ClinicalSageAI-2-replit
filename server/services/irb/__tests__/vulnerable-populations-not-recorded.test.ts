/**
 * An unanswered vulnerable-populations question is NOT RECORDED, not "no".
 *
 * createSubmissionTx (and AnA's create_irb_submission) wrote
 * `involvesVulnerablePopulations === true` into a NOT NULL DEFAULT false
 * column, so a submission nobody had asked about vulnerable subjects was stored
 * as the sponsor stating none are involved. The 45 CFR 46.111(b) check
 * ("vulnerable populations are involved but no additional safeguards are
 * documented") then never fired for it and the gate reported a clean result.
 * Absent now stays NULL, and the gate reports that check as not assessed.
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
vi.mock('../../irb-metrics', () => ({
  recordIrbSubmissionCreated: vi.fn(),
  recordIrbApproval: vi.fn(),
  recordIrbReportableEvent: vi.fn(),
}));

import irbRouter from '../../../routes/irb';
import { evaluateIrbCompleteness, type IrbCompletenessInput } from '../irb-logic';

const ORG = 7;
const USER = 3;
const REASON = 'Opening the ethics submission for the study.';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const migration = (rel: string) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

const app = express();
app.use(express.json());
app.use((req: Request, _res: Response, next: NextFunction) => {
  (req as unknown as { user: unknown }).user = { id: USER, organizationId: ORG, role: 'member' };
  next();
});
app.use('/api/irb', irbRouter);

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(`
    CREATE TABLE organizations (id serial PRIMARY KEY);
    CREATE TABLE users (id serial PRIMARY KEY);
    CREATE TABLE submissions (id serial PRIMARY KEY);
    INSERT INTO organizations (id) VALUES (${ORG});
    INSERT INTO users (id) VALUES (${USER});
  `);
  await pglite.exec(migration('migrations/20260610_irb_submissions.sql'));
  await pglite.exec(migration('migrations/20260922d_irb_submission_context.sql'));
}, 60_000);

beforeEach(async () => {
  await pglite.exec('TRUNCATE irb_consent_documents, irb_sites, irb_submissions RESTART IDENTITY CASCADE;');
});

const BASE = { protocolNumber: 'P-1', title: 'A study', riskLevel: 'minimal', reason: REASON };

async function stored(id: number): Promise<boolean | null> {
  const r = await pglite.query<{ v: boolean | null }>(`SELECT involves_vulnerable_populations AS v FROM irb_submissions WHERE id = $1`, [id]);
  return r.rows[0].v;
}

/** Everything else on the gate clean: a consent document, one site, a review type. */
const clean: IrbCompletenessInput = {
  riskLevel: 'minimal',
  reviewType: 'expedited',
  involvesVulnerablePopulations: false,
  vulnerablePopulationProtections: null,
  isSingleIrb: false,
  consentWaiverRequested: false,
  approvedConsentCount: 1,
  siteCount: 1,
};

describe('the answer is stored as given, and absent stays absent', () => {
  it('a submission that does not mention vulnerable populations stores NULL, not false', async () => {
    const res = await request(app).post('/api/irb/submissions').send(BASE);
    expect(res.status).toBe(201);
    expect(await stored(res.body.id)).toBeNull();
  });

  it.each([true, false])('a recorded %s is stored as given', async (answer) => {
    const res = await request(app).post('/api/irb/submissions').send({ ...BASE, involvesVulnerablePopulations: answer });
    expect(res.status).toBe(201);
    expect(await stored(res.body.id)).toBe(answer);
  });
});

describe('the 46.111(b) check reports what it could not assess', () => {
  it('with the question unanswered and no safeguards on file, the check is not assessed and the risk is not "low"', () => {
    const r = evaluateIrbCompleteness({ ...clean, involvesVulnerablePopulations: null });
    expect(r.findings).toEqual([]);
    expect(r.notAssessed.join(' ')).toMatch(/vulnerable/i);
    expect(r.riskLevel).toBe('undetermined');
    expect(r.checksRun.join(' ')).not.toMatch(/46\.111\(b\)/);
  });

  it('with safeguards documented, the check is decided whatever the answer', () => {
    const r = evaluateIrbCompleteness({ ...clean, involvesVulnerablePopulations: null, vulnerablePopulationProtections: 'Assent plus LAR consent.' });
    expect(r.notAssessed).toEqual([]);
    expect(r.riskLevel).toBe('low');
  });

  it('a recorded "no" is still a clean answer', () => {
    const r = evaluateIrbCompleteness(clean);
    expect(r.notAssessed).toEqual([]);
    expect(r.riskLevel).toBe('low');
  });

  it('GET /completeness reports the unanswered question as not assessed', async () => {
    const created = await request(app).post('/api/irb/submissions').send(BASE);
    const id = created.body.id as number;
    await pglite.query(
      `INSERT INTO irb_consent_documents (organization_id, irb_submission_id, document_name, version, created_by) VALUES ($1, $2, 'ICF', '2.0', $3)`,
      [ORG, id, USER],
    );
    const res = await request(app).get(`/api/irb/submissions/${id}/completeness`);
    expect(res.status).toBe(200);
    expect(res.body.completeness.riskLevel).toBe('undetermined');
    expect(res.body.completeness.notAssessed.join(' ')).toMatch(/vulnerable/i);
  });
});
