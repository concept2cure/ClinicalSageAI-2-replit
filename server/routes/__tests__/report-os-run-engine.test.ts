/**
 * POST /api/report-os/runs runs what it names, over the program it names
 * (QA 2026-10-08, journey j8).
 *
 *   - "Every typed report returns the same readiness digest": a type no engine
 *     computes is refused (422 REPORT_TYPE_NOT_COMPUTED), and nothing is
 *     computed or written; a register runs from its own provider, not the
 *     readiness orchestrator.
 *   - "510(k) equivalence matrix runs for this biopharma organisation": a type
 *     that does not apply to the program's recorded product type is refused
 *     (422 REPORT_TYPE_NOT_APPLICABLE).
 *   - "Reporting scope is fixed to project 1": a run may name the open program
 *     by its UUID; the server resolves its project with the strict anchor
 *     resolver, and refuses a program with no project record (409).
 *   - "the digest names the scope by internal id": the run stores the
 *     project's name for the renderer.
 *
 * The router's own imports are real; the database facade, the auth middleware,
 * the entitlement gate, the readiness computation, the domain provider, the
 * segment derivation, the anchor resolver and the audit writer are replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = await vi.hoisted(async () => (await import('./_report-os-route-harness')).createReportOsHarness());
const x = vi.hoisted(() => ({ domain: vi.fn(), segments: vi.fn(), anchor: vi.fn() }));

vi.mock('../../db', () => ({ db: h.db, pool: h.pool, getPool: () => h.pool, getDb: () => h.db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({ authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: h.gate,
}));
vi.mock('../../services/report-os/orchestrator', () => ({ computeInitialRun: h.compute }));
vi.mock('../../services/report-os/research-compliance-report-providers', () => ({ computeDomainReport: x.domain }));
vi.mock('../../services/report-os/segment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/segment')>()),
  deriveScopeSegments: x.segments,
}));
vi.mock('../../services/c2c/program-project-anchor', () => ({ resolveProgramProjectAnchor: x.anchor }));
vi.mock('../../services/auditService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auditService')>()),
  writeChainedAuditRow: h.audit,
}));

import reportOsRouter from '../report-os';
import { driverRow, resetReportOsHarness } from './_report-os-route-harness';
import { reportRuns, reportSnapshots } from '@shared/schema/report-os';

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  (req as unknown as { user: { id: number; role: string; organizationId: number } }).user = { id: 5, role: 'manager', organizationId: 7 };
  next();
});
app.use('/api/report-os', reportOsRouter);

const PROGRAM = 'd979e567-4622-46f1-8cb7-8bf434227f25';
const HLV = { id: 11, code: 'H', name: 'HLV-333 — Investigational New Drug Application' };
const type = (typeId: string, label: string, family: string, allowedClientSegments: string[]) => ({
  typeId, label, family, allowedScopes: ['program', 'project', 'submission', 'document'], allowedClientSegments,
});
const DIGEST = type('readiness.executive_digest', 'Executive Readiness Digest', 'readiness', ['pharma', 'device', 'biotech']);
const RMP = type('ema.rmp_psur_signal_alignment', 'EMA RMP / PSUR Signal Alignment Report', 'ema_post_market', ['pharma', 'biotech']);
const SEND = type('nonclinical.study_send_register', 'Nonclinical Study & SEND Readiness Register', 'nonclinical_module4', ['pharma', 'biotech']);
const RUN = {
  id: 52, runUuid: '00000000-0000-4000-8000-000000000052', organizationId: 7, scopeType: 'project', scopeId: '11',
  reportTypeId: DIGEST.typeId, status: 'partial', confidence: null, blockers: [] as string[],
  dependencySummary: { providers: [], summary: {}, criticalBlockers: [] },
  createdAt: new Date('2026-10-08T06:00:00Z'), completedAt: new Date('2026-10-08T06:00:00Z'),
};

/** Everything the route wrote on its transaction, as one string. */
const written = () => JSON.stringify(h.params);
const post = (body: Record<string, unknown>) => request(app).post('/api/report-os/runs').send(body);

beforeEach(() => {
  resetReportOsHarness(h);
  h.respond.fn = (sql, arrayMode) =>
    !arrayMode ? [] : /"report_runs"/.test(sql) ? [driverRow(reportRuns, RUN)] : /"report_snapshots"/.test(sql) ? [driverRow(reportSnapshots, { id: 3, runId: 52, organizationId: 7, scopeType: 'project', scopeId: '11', snapshotVersion: 1, isLatest: true })] : [];
  x.domain.mockReset().mockResolvedValue({
    summary: { studies: 2, byStatus: { completed: 2 }, sendValidated: 1 },
    provider: { provider: 'nonclinical_studies', observedAt: '2026-10-08T06:00:00Z', status: 'ready' },
  });
  x.segments.mockReset().mockResolvedValue(['biotech']);
  x.anchor.mockReset().mockResolvedValue(11);
});

describe('a type no engine computes', () => {
  it('is refused 422 and nothing is computed or written', async () => {
    h.queued.select.push([RMP], [HLV]);
    const res = await post({ scopeType: 'project', scopeId: '11', reportTypeId: RMP.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('REPORT_TYPE_NOT_COMPUTED');
    expect(res.body.error).toMatch(/No engine computes the EMA RMP \/ PSUR Signal Alignment Report/);
    expect(h.compute).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });
});

describe('a register', () => {
  it('runs from its own provider, not the readiness orchestrator', async () => {
    h.queued.select.push([SEND], [HLV]);
    const res = await post({ scopeType: 'project', scopeId: '11', reportTypeId: SEND.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(h.compute).not.toHaveBeenCalled();
    expect(x.domain).toHaveBeenCalledWith(SEND.typeId, 7);
    expect(written()).toMatch(/nonclinical_studies/);
    expect(written()).not.toMatch(/submission_readiness/);
  });

  it('is refused for a program whose product type it does not apply to', async () => {
    x.segments.mockResolvedValue(['device']);
    h.queued.select.push([SEND], [HLV]);
    const res = await post({ scopeType: 'project', scopeId: '11', reportTypeId: SEND.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('REPORT_TYPE_NOT_APPLICABLE');
    expect(res.body.error).toMatch(/applies to pharma \/ biotech programs; this program is recorded as device/);
    expect(x.segments).toHaveBeenCalledWith(7, 11);
    expect(x.domain).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });
});

describe('the open program names the scope', () => {
  it('resolves the program through the strict anchor resolver and runs over its project', async () => {
    h.queued.select.push([DIGEST], [HLV]);
    const res = await post({ scopeType: 'project', programId: PROGRAM, reportTypeId: DIGEST.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(x.anchor).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ programId: PROGRAM, orgId: 7, strict: true }));
    expect(h.compute).toHaveBeenCalledWith(7, 'project', '11', expect.anything());
  });

  it('refuses a program with no project record: 409, nothing computed', async () => {
    x.anchor.mockResolvedValue(null);
    h.queued.select.push([DIGEST], [HLV]);
    const res = await post({ scopeType: 'project', programId: PROGRAM, reportTypeId: DIGEST.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.code).toBe('PROGRAM_NOT_ANCHORED');
    expect(h.compute).not.toHaveBeenCalled();
    expect(h.statements).toEqual([]);
  });

  it('refuses a scope id that is not the program’s project', async () => {
    h.queued.select.push([DIGEST], [HLV]);
    const res = await post({ scopeType: 'project', programId: PROGRAM, scopeId: '1', reportTypeId: DIGEST.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.code).toBe('SCOPE_PROGRAM_MISMATCH');
    expect(h.compute).not.toHaveBeenCalled();
  });
});

describe('the run names its scope', () => {
  it('stores the project’s name for the renderer, not only its row id', async () => {
    h.queued.select.push([DIGEST], [HLV]);
    const res = await post({ scopeType: 'project', scopeId: '11', reportTypeId: DIGEST.typeId });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(written()).toMatch(/"scopeLabel\\?":\\?"HLV-333 — Investigational New Drug Application/);
  });
});

/*
 * A register with data computes with no blocker, so its run is stored
 * 'completed'. The renderer read 'completed' as a request for final, so the run
 * read "Status: final" — unsigned and unsealed — and Finalize was not offered
 * (found in the 2026-10-08 after-check of the register fix above). A run is
 * final only once finalized; until then it renders below final.
 */
describe('a run computed with no blocker', () => {
  it('renders below final until it is finalized', async () => {
    const completed = { ...RUN, reportTypeId: SEND.typeId, status: 'completed', blockers: [] as string[] };
    h.queued.select.push([completed], [{ label: SEND.label, truthfulnessRules: { allowPartial: true, requireBlockers: true } }]);
    h.respond.fn = (sql) => (/FROM report_runs/.test(sql) ? [{ status: 'completed' }] : []);
    const res = await request(app).get(`/api/report-os/runs/${RUN.id}/rendered`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('partial');
    expect(JSON.stringify(res.body.data.sections)).not.toMatch(/Status: final/);
  });
});
