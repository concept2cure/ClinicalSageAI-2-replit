/**
 * POST /api/study-design/:studyId/planning — the governed partial write of
 * sponsor planning inputs (planning-inputs.ts).
 *
 * What the suite holds: a viewer is refused before anything is read; a short
 * reason and an invalid block are refused BEFORE a connection is taken; the
 * design is read FOR UPDATE, tenant-scoped, inside the transaction that
 * writes it; the one writer receives the design with only that block changed;
 * the governed-action row carries the reason and the block; an unknown design
 * is 404 and rolled back; an unknown activity is 409 and rolled back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  persist: vi.fn(),
  recordGovernedAction: vi.fn(async () => ({ actionId: 'act-1', auditTrail: { ok: true } })),
}));
vi.mock('../../db', () => ({ pool: { connect: h.connect } }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: h.recordGovernedAction }));
vi.mock('../../services/study-design', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/study-design')>()),
  persistStudyDesignTx: h.persist,
}));

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
    activities: [{ id: 'pk', name: 'PK', category: 'pk', order: 0 }],
    cells: [{ activityId: 'pk', visitId: 'V1', state: 'performed' }],
  },
};
const BOIN = { method: 'boin', targetToxicity: 0.3, doseLevels: [{ label: 'DL1' }, { label: 'DL2' }], cohortSize: 3, maxSampleSize: 30 };

function app(role: string) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, { user: { id: 7, organizationId: 1 }, organizationId: 1, userRole: role });
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

beforeEach(() => {
  vi.clearAllMocks();
  h.connect.mockResolvedValue({ query: h.query, release: vi.fn() });
  h.persist.mockResolvedValue('sd_1');
  withRow({ study_id: 'sd_1', metadata: { kind: STUDY_DESIGN_META_KIND, design: DESIGN } });
});

describe('POST /api/study-design/:studyId/planning — refusals before anything is read', () => {
  it('refuses a viewer', async () => {
    const res = await post({ block: 'doseEscalation', value: BOIN, reason: 'Record the escalation rules' }, 'viewer');
    expect(res.status).toBe(403);
    expect(h.connect).not.toHaveBeenCalled();
  });

  it('refuses a short reason and an invalid block, with the path, before a connection is taken', async () => {
    const short = await post({ block: 'doseEscalation', value: BOIN, reason: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe('REASON_REQUIRED');
    const bad = await post({ block: 'doseEscalation', value: { ...BOIN, targetToxicity: 2 }, reason: 'Record the escalation rules' });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('INVALID_PLANNING_INPUT');
    expect(bad.body.details.join(' ')).toMatch(/value\.targetToxicity/);
    expect(h.connect).not.toHaveBeenCalled();
  });
});

describe('POST /api/study-design/:studyId/planning — the governed write', () => {
  it('reads the design FOR UPDATE, tenant-scoped, and writes only the block through the one writer', async () => {
    const res = await post({ block: 'doseEscalation', value: BOIN, reason: 'Record the escalation rules' });
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
      command: 'update', target: 'study-design:sd_1', reason: 'Record the escalation rules',
      payload: { studyId: 'sd_1', block: 'doseEscalation', cleared: false },
    }));
    expect(h.query.mock.calls.map(([sql]) => sql)).toContain('COMMIT');
    expect(res.body.block).toBe('doseEscalation');
  });

  it('an unknown design is 404 and nothing is written', async () => {
    withRow(null);
    const res = await post({ block: 'accrualPlan', value: null, reason: 'Clear the accrual plan' });
    expect(res.status).toBe(404);
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.recordGovernedAction).not.toHaveBeenCalled();
  });

  it('an unknown activity is 409 and rolled back', async () => {
    const res = await post({ block: 'activityAttributes', value: { activityId: 'nope', location: 'home' }, reason: 'Record where PK is drawn' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('UNKNOWN_ACTIVITY');
    expect(h.persist).not.toHaveBeenCalled();
    expect(h.query.mock.calls.map(([sql]) => sql)).toContain('ROLLBACK');
  });
});
