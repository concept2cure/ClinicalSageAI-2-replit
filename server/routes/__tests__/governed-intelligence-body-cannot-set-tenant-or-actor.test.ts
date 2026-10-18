/**
 * A request body cannot name the tenant or the actor of a governed record.
 *
 * Every write and search under /api/governed-intelligence built its argument
 * as { organizationId: <session>, createdBy: <session>, ...req.body }, so a
 * body carrying organizationId searched or wrote another tenant's records, and
 * one carrying createdBy / decidedBy / performedBy recorded an assumption, a
 * decision or its transition as someone else's. Only the services are
 * replaced; the router, its guards and its identity helpers run.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { h, record } = vi.hoisted(() => {
  const h = { calls: [] as Array<{ fn: string; arg: Record<string, unknown> }> };
  const record = (fn: string) => async (...args: unknown[]) => {
    const arg = args[args.length - 1] as Record<string, unknown>;
    h.calls.push({ fn, arg });
    return fn.endsWith('search') || fn === 'searchFindings' ? [] : { id: 'x' };
  };
  return { h, record };
});

vi.mock('../../services/assumption-registry-service', () => ({
  assumptionRegistryService: { search: record('assumptions.search'), create: record('assumptions.create'), supersede: record('assumptions.supersede') },
}));
vi.mock('../../services/decision-record-service', () => ({
  decisionRecordService: { search: record('decisions.search'), create: record('decisions.create'), transition: record('decisions.transition') },
}));
vi.mock('../../services/contradiction-engine-service', () => ({
  contradictionEngineService: { searchFindings: record('searchFindings'), createOverlayRule: record('createOverlayRule') },
  ContradictionReviewOutcomeUnknown: class extends Error {},
  ContradictionReviewRefusal: class extends Error {},
  ContradictionScanScopeError: class extends Error {},
}));
vi.mock('../../services/reactive-dependency-service', () => ({
  reactiveDependencyService: { registerDependency: record('registerDependency') },
}));
vi.mock('../../middleware/orgMembership', () => ({
  requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
  governedActorId: () => 17,
}));

import router from '../assumption-decision-contradiction';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    (req as any).user = { id: 17, organizationId: 5, role: 'member' };
    next();
  });
  a.use('/api/governed-intelligence', router);
  return a;
}

const HOSTILE = { organizationId: 999, createdBy: 'mallory', decidedBy: 'mallory', performedBy: 'mallory' };
const ID = '0b7e1d2a-1111-4222-8333-944455556666';

beforeEach(() => {
  h.calls.length = 0;
});

describe('/api/governed-intelligence', () => {
  it.each([
    ['/assumptions/search', 'assumptions.search', null],
    ['/assumptions', 'assumptions.create', 'createdBy'],
    [`/assumptions/${ID}/supersede`, 'assumptions.supersede', 'performedBy'],
    ['/decisions/search', 'decisions.search', null],
    ['/decisions', 'decisions.create', 'decidedBy'],
    [`/decisions/${ID}/transition`, 'decisions.transition', 'performedBy'],
    ['/contradictions/search', 'searchFindings', null],
    ['/dependencies', 'registerDependency', null],
    ['/overlays', 'createOverlayRule', null],
  ])('POST %s takes the tenant and actor from the session, not the body', async (path, fn, actorField) => {
    await request(app()).post(`/api/governed-intelligence${path}`).send({ title: 'T', ...HOSTILE });
    const call = h.calls.find((c) => c.fn === fn);
    expect(call, `${fn} was not called`).toBeDefined();
    expect(call!.arg.organizationId).toBe(5);
    if (actorField) expect(call!.arg[actorField]).toBe('17');
  });
});
