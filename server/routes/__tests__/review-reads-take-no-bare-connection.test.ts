/**
 * Six review reads no longer read on a bare pool connection.
 *
 * The pool sets the tenant on a checked-out connection only at BEGIN
 * (server/db/poolInstrumentation.ts). `pool.query`, the runtime `query` export
 * and the request's own client set it for each statement. These routes took a
 * connection with `pool.connect()` and read on it with no BEGIN, so on tables
 * with forced row-level security the parent row was invisible and the answer
 * was 404 "not found for this organization", for every organization:
 *
 *   GET /api/ha-interactions/interactions/:id/readiness
 *   GET /api/nonclinical/studies/:id/send-readiness      (called by Nonclinical.tsx)
 *   GET /api/iacuc/protocols/:id/completeness
 *   GET /api/ibc/registrations/:id/containment
 *   GET /api/financial-disclosures/disclosures/:id       (and its review)
 *   GET /api/effort-certification/:id/validation
 *
 * Found on 2026-11-12 through the same defect on /api/irb, in the running app
 * (docs/evidence/DESIGN/R1/2026-11-12-irb-submission-record/). Every suite was
 * green because a mocked pool handed `connect()` the same executor as
 * `query()`. Here `connect()` is refused outright, and each reader probes the
 * executor it was handed: the probe must arrive on the tenant-scoped path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const S = vi.hoisted(() => {
  const scoped = vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 }));
  /** The request's own client (db/requestDb.ts): tenant-scoped, as the route's other reads use. */
  const requestClient = { query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [], rowCount: 0 })) };
  type Probe = { query: (sql: string, params?: unknown[]) => Promise<unknown> };
  /** A reader that uses the executor it was handed, then answers with `input`. */
  const reader = (name: string, input: unknown) => vi.fn(async (client: Probe) => { await client.query(`probe ${name}`); return input; });
  return { scoped, requestClient, reader, connects: 0 };
});

vi.mock('../../db', () => {
  const connect = async () => { S.connects += 1; throw new Error('A read took a bare pool connection: it carries no tenant before BEGIN.'); };
  const pool = { query: S.scoped, connect };
  return { pool, getPool: () => pool, query: S.scoped, db: {} };
});
vi.mock('../../db/requestDb', async (orig) => ({ ...(await orig<object>()), requestPgClient: () => S.requestClient }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn(async () => ({ actionId: 1 })) }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn(async () => undefined) }));

vi.mock('../../services/ha-interactions/ha-service', async (orig) => ({
  ...(await orig<object>()),
  submissionOfInteraction: vi.fn(async () => null),
  getInteractionReadinessInput: S.reader('ha', { interactionType: 'type_b', status: 'requested', hasBriefingBook: false, questionCount: 0, scheduledDate: null }),
}));
vi.mock('../../services/nonclinical/nonclinical-service', async (orig) => ({
  ...(await orig<object>()),
  getSendReadinessInput: S.reader('nonclinical', { studyType: 'repeat_dose_toxicity', domainsPresent: [], defineXmlPresent: false, nsdrcPresent: false, validationStatus: 'not_validated', validatorErrorCount: 0 }),
}));
vi.mock('../../services/iacuc/iacuc-service', async (orig) => ({
  ...(await orig<object>()),
  getProtocolCompletenessInput: S.reader('iacuc', { painCategory: 'C', threeRsReplacement: 'a', threeRsReduction: 'b', threeRsRefinement: 'c', painJustification: null, speciesCount: 1, plannedAnimalTotal: 24, approvalDate: null, expirationDate: null }),
}));
vi.mock('../../services/ibc/ibc-service', async (orig) => ({
  ...(await orig<object>()),
  getContainmentInput: S.reader('ibc', { declaredBsl: 'BSL-2', nihGuidelinesSection: 'III-D', involvesHumanGeneTransfer: false, approvalDate: null, expirationDate: null, agents: [] }),
}));
vi.mock('../../services/financial-disclosures/fcoi-service', async (orig) => ({
  ...(await orig<object>()),
  loadDisclosureSnapshot: S.reader('fcoi', { row: { id: 4 }, formType: 'FDA_3454', hasDisclosableInterests: false, disclosurePeriodStart: null, disclosurePeriodEnd: null, interests: [] }),
}));
vi.mock('../../services/effort-certification/effort-service', async (orig) => ({
  ...(await orig<object>()),
  loadStatement: S.reader('effort', { statement: { id: 4 }, lines: [] }),
}));

import haRouter from '../ha-interactions';
import nonclinicalRouter from '../nonclinical';
import iacucRouter from '../iacuc';
import ibcRouter from '../ibc';
import fcoiRouter from '../financial-disclosures';
import effortRouter from '../effort-certification';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => { Object.assign(req, { user: { id: 3, organizationId: 7, role: 'member' } }); next(); });
  a.use('/api/ha-interactions', haRouter);
  a.use('/api/nonclinical', nonclinicalRouter);
  a.use('/api/iacuc', iacucRouter);
  a.use('/api/ibc', ibcRouter);
  a.use('/api/financial-disclosures', fcoiRouter);
  a.use('/api/effort-certification', effortRouter);
  return a;
}

const probes = (fn: { mock: { calls: unknown[][] } }) => fn.mock.calls.map((c) => String(c[0])).filter((sql) => sql.startsWith('probe '));

beforeEach(() => { S.scoped.mockClear(); S.requestClient.query.mockClear(); S.connects = 0; });

describe('review reads run inside the tenant scope', () => {
  const POOLED: Array<[string, string, string]> = [
    ['nonclinical send-readiness', '/api/nonclinical/studies/4/send-readiness', 'probe nonclinical'],
    ['IACUC completeness', '/api/iacuc/protocols/4/completeness', 'probe iacuc'],
    ['IBC containment', '/api/ibc/registrations/4/containment', 'probe ibc'],
    ['a financial disclosure', '/api/financial-disclosures/disclosures/4', 'probe fcoi'],
    ['effort validation', '/api/effort-certification/4/validation', 'probe effort'],
  ];

  it.each(POOLED)('%s reads through the scoped query, and takes no connection', async (_name, url, probe) => {
    const res = await request(app()).get(url);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(S.connects).toBe(0);
    expect(probes(S.scoped)).toEqual([probe]);
  });

  it('agency-meeting readiness reads on the request\'s own client, as the route\'s other reads do', async () => {
    const res = await request(app()).get('/api/ha-interactions/interactions/4/readiness');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(S.connects).toBe(0);
    expect(probes(S.requestClient.query)).toEqual(['probe ha']);
  });
});
