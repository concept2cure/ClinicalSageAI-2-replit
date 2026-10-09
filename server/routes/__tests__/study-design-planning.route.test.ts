/**
 * POST /api/study-design/:studyId/planning — the governed partial write of
 * sponsor planning inputs (planning-inputs.ts).
 *
 * What the suite holds: a viewer is refused before anything is read; a short
 * reason, an invalid block and a missing precondition are refused BEFORE a
 * connection is taken; the design is read FOR UPDATE, tenant-scoped, inside
 * the transaction that writes it; the one writer receives the design with only
 * that block changed; the governed-action row carries the reason, the block,
 * and whether it was cleared (for an activity, which attribute was set or
 * cleared); a block that changed since the writer read it is 409 STALE_BLOCK
 * and rolled back; an unknown design is 404 and rolled back; an unknown
 * activity is 409 and rolled back; a failed write is 500 with no caught-error
 * text and rolled back; a design check that fails after the commit does not
 * report the committed write as failed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  persist: vi.fn(),
  validate: vi.fn(),
  realValidate: null as null | ((d: unknown) => unknown),
  recordGovernedAction: vi.fn(async () => ({ actionId: 'act-1', auditTrail: { ok: true } })),
}));
vi.mock('../../db', () => ({ pool: { connect: h.connect } }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: h.recordGovernedAction }));
vi.mock('../../services/study-design', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/study-design')>();
  h.realValidate = real.validateDesign as (d: unknown) => unknown;
  return { ...real, persistStudyDesignTx: h.persist, validateDesign: (d: unknown) => h.validate(d) };
});

import router from '../study-design';
import { STUDY_DESIGN_META_KIND } from '../../services/study-design/study-design-repository';

const DESIGN = {
  id: 'sd_1',
  programId: '11111111-1111-4111-8111-111111111111',
  title: 'A first-in-human study',
  phase: 'FIH',
  indication: 'solid tumours',
  objectives: [],
  estimands: [],
  endpoints: [{ name: 'DLT', role: 'primary', type: 'binary', definition: 'DLT in cycle 1' }],
  framework: { inferentialFrame: 'superiority', structuralDesign: 'single_arm', controlType: 'none' },
  population: { targetDescription: 'adults', analysisPopulations: [], eligibility: [] },
  arms: [],
  statisticalPlan: { plannedAnalyses: [] },
  safety: { dltDefinition: 'Grade 3+' },
  scheduleOfActivities: {
    epochs: [{ id: 'e1', name: 'Treatment', kind: 'treatment', order: 0 }],
    visits: [{ id: 'V1', name: 'Day 1', epochId: 'e1', studyDay: 1, isBaseline: true, order: 0 }],
    activities: [{ id: 'pk', name: 'PK', category: 'pk', order: 0, location: 'site' }],
    cells: [{ activityId: 'pk', visitId: 'V1', state: 'performed' }],
  },
};
const BOIN = { method: 'boin', targetToxicity: 0.3, doseLevels: [{ label: 'DL1' }, { label: 'DL2' }], cohortSize: 3, maxSampleSize: 30 };
const REASON = 'Record the escalation rules';

function app(role: string, withRequestClient = true) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { user: { id: 7, organizationId: 1 }, organizationId: 1, userRole: role });
    // The request's own connection, as authenticateToken attaches it (requestDb.ts).
    if (withRequestClient) Object.assign(req, { dbClient: { query: h.query } });
    next();
  });
  a.use('/api/study-design', router);
  return a;
}
const post = (body: Record<string, unknown>, role = 'member') =>
  request(app(role)).post('/api/study-design/sd_1/planning').send(body);

/** The SELECT … FOR UPDATE answers with the persisted row; everything else with nothing. */
function withRow(row: Record<string, unknown> | null) {
  h.query.mockImplementation(async (sql: string) =>
    /FROM cdisc_prm_studies/.test(sql) ? { rows: row ? [row] : [] } : { rows: [] });
}
const withDesign = (design: Record<string, unknown>) => withRow({ study_id: 'sd_1', metadata: { kind: STUDY_DESIGN_META_KIND, design } });
const statements = () => h.query.mock.calls.map(([sql]) => sql as string);
/** The governed-action row the one write recorded. */
const auditRow = () => (h.recordGovernedAction.mock.calls[0] as unknown[])[1];

beforeEach(() => {
  vi.clearAllMocks();
  h.connect.mockResolvedValue({ query: h.query, release: vi.fn() });
  h.persist.mockResolvedValue('sd_1');
  h.validate.mockImplementation((d: unknown) => h.realValidate!(d));
  withDesign(DESIGN);
});

describe('POST /api/study-design/:studyId/planning — refusals before anything is read', () => {
  it('refuses a viewer', async () => {
    const res = await post({ block: 'doseEscalation', value: BOIN, expected: null, reason: REASON }, 'viewer');
    expect(res.status).toBe(403);
    expect(h.query).not.toHaveBeenCalled();
  });

  it('refuses a short reason, an invalid block and a missing precondition, with the path, before a connection is taken', async () => {
    const short = await post({ block: 'doseEscalation', value: BOIN, expected: null, reason: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe('REASON_REQUIRED');
    const bad = await post({ block: 'doseEscalation', value: { ...BOIN, targetToxicity: 2 }, expected: null, reason: REASON });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('INVALID_PLANNING_INPUT');
    expect(bad.body.details.join(' ')).toMatch(/value\.targetToxicity/);
    const blind = await post({ block: 'doseEscalation', value: BOIN, reason: REASON });
    expect(blind.status).toBe(400);
    expect(blind.body.error).toBe('PRECONDITION_REQUIRED');
    expect(h.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/study-design/:studyId/planning — the request connection', () => {
  it('writes on the request\'s own connection, and refuses without one rather than use the shared pool', async () => {
    const ok = await post({ block: 'doseEscalation', value: BOIN, expected: null, reason: REASON });
    expect(ok.status).toBe(200);
    expect(h.connect).not.toHaveBeenCalled();
    vi.clearAllMocks();
    const res = await request(app('member', false))
      .post('/api/study-design/sd_1/planning')
      .send({ block: 'doseEscalation', value: BOIN, expected: null, reason: REASON });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('PLANNING_WRITE_FAILED');
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.persist).not.toHaveBeenCalled();
  });
});

describe('POST /api/study-design/:studyId/planning — the governed write', () => {
  it('reads the design FOR UPDATE, tenant-scoped, and writes only the block through the one writer', async () => {
    const res = await post({ block: 'doseEscalation', value: BOIN, expected: null, reason: REASON });
    expect(res.status).toBe(200);
    const select = h.query.mock.calls.find(([sql]) => /FROM cdisc_prm_studies/.test(sql as string))!;
    expect(select[0]).toMatch(/FOR UPDATE/);
    // Tenant-scoped in the predicate itself, not only by the RLS context.
    expect(select[0]).toMatch(/WHERE study_id = \$1 AND tenant_id = \$2\b/);
    expect(select[1]).toEqual(['sd_1', 1]);
    expect(h.query.mock.calls.some(([sql]) => /set_config\('app.current_tenant_id'/.test(sql as string))).toBe(true);
    const [, written, ctx] = h.persist.mock.calls[0];
    expect(written.safety).toEqual({ dltDefinition: 'Grade 3+', doseEscalation: BOIN });
    expect({ ...written, safety: DESIGN.safety }).toEqual(DESIGN);
    expect(ctx).toEqual({ tenantId: 1, userId: 7 });
    expect(h.recordGovernedAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      command: 'update', target: 'study-design:sd_1', reason: REASON,
      payload: { studyId: 'sd_1', block: 'doseEscalation', cleared: false },
    }));
    expect(statements()).toContain('COMMIT');
    expect(res.body.block).toBe('doseEscalation');
    expect(res.body.validation).toEqual(expect.objectContaining({}));
  });

  it('a clear is audited as cleared, with the block as read as its precondition', async () => {
    withDesign({ ...DESIGN, safety: { ...DESIGN.safety, doseEscalation: BOIN } });
    const res = await post({ block: 'doseEscalation', value: null, expected: BOIN, reason: 'Clear the escalation rules' });
    expect(res.status).toBe(200);
    expect(h.persist.mock.calls[0][1].safety).toEqual({ dltDefinition: 'Grade 3+' });
    expect(auditRow()).toMatchObject({ payload: { studyId: 'sd_1', block: 'doseEscalation', cleared: true } });
  });

  it('an activity write records which attribute was set and which cleared', async () => {
    const res = await post({
      block: 'activityAttributes', value: { activityId: 'pk', location: null, specimen: { type: 'blood', volumeMl: 4 } },
      expected: { location: 'site', specimen: null }, reason: 'Record the PK draw',
    });
    expect(res.status).toBe(200);
    expect(auditRow()).toMatchObject({
      payload: { studyId: 'sd_1', block: 'activityAttributes', activityId: 'pk', location: 'cleared', specimen: 'set' },
    });
  });

  it('a block that changed since it was read is refused, rolled back, and nothing is written', async () => {
    withDesign({ ...DESIGN, safety: { ...DESIGN.safety, doseEscalation: { ...BOIN, cohortSize: 6 } } });
    const res = await post({ block: 'doseEscalation', value: { ...BOIN, maxSampleSize: 36 }, expected: BOIN, reason: REASON });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STALE_BLOCK');
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.recordGovernedAction).not.toHaveBeenCalled();
    expect(statements()).toContain('ROLLBACK');
    expect(statements()).not.toContain('COMMIT');
    // An activity edited elsewhere is stale too.
    const act = await post({ block: 'activityAttributes', value: { activityId: 'pk', location: 'home' }, expected: { location: null, specimen: null }, reason: 'Record where PK is drawn' });
    expect(act.status).toBe(409);
    expect(act.body.error).toBe('STALE_BLOCK');
  });

  it('an unknown design is 404, rolled back, and nothing is written', async () => {
    withRow(null);
    const res = await post({ block: 'accrualPlan', value: null, expected: null, reason: 'Clear the accrual plan' });
    expect(res.status).toBe(404);
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.recordGovernedAction).not.toHaveBeenCalled();
    expect(statements()).toContain('ROLLBACK');
  });

  it('an unknown activity is 409 and rolled back', async () => {
    const res = await post({ block: 'activityAttributes', value: { activityId: 'nope', location: 'home' }, expected: null, reason: 'Record where PK is drawn' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('UNKNOWN_ACTIVITY');
    expect(h.persist).not.toHaveBeenCalled();
    expect(statements()).toContain('ROLLBACK');
  });

  it('a failed write is 500 with no caught-error text, and rolled back', async () => {
    h.persist.mockRejectedValueOnce(new Error('relation "cdisc_prm_studies" does not exist'));
    const res = await post({ block: 'doseEscalation', value: BOIN, expected: null, reason: REASON });
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'PLANNING_WRITE_FAILED' });
    expect(statements()).toContain('ROLLBACK');
    expect(statements()).not.toContain('COMMIT');
  });

  it('a design check that fails after the commit does not report the committed write as failed', async () => {
    h.validate.mockImplementation(() => { throw new Error('validator exploded'); });
    const res = await post({ block: 'doseEscalation', value: BOIN, expected: null, reason: REASON });
    expect(res.status).toBe(200);
    expect(statements()).toContain('COMMIT');
    expect(res.body.validation).toBeNull();
    expect(res.body.validationNote).toMatch(/recorded/);
    expect(JSON.stringify(res.body)).not.toMatch(/exploded/);
  });
});
