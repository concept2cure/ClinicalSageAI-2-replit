/**
 * GET /api/510k/estar/entitlement — the read-only pre-check of the gate on
 * POST /official (requireEntitlement('device_assembly_readiness')).
 *
 * Until this route existed the "Generate official eSTAR (PDF)" control only
 * learned of a 403 NOT_ENTITLED after the first click. The pre-check reports
 * the SAME verdict under the SAME mode, and mirrors the middleware's rule that
 * ENTITLEMENTS_ENFORCE=off evaluates nothing — zero tier queries.
 *
 * The evaluator (evaluateOrgEntitlement) is stubbed per test: its verdict is
 * what the route forwards. The mode resolver stays REAL so ENTITLEMENTS_ENFORCE
 * is read exactly as the middleware reads it, and the off-mode short-circuit
 * under test is the route's own.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockRequest, createMockResponse } from '../setup';

vi.mock('../../server/auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
}));

// The route module reaches the database only through these; the pre-check
// itself reads nothing, so they exist to keep the import side-effect free.
vi.mock('../../server/db', () => ({ db: {}, pool: { query: vi.fn() } }));
vi.mock('../../server/db/requestDb', () => ({ requestDb: () => ({}) }));
vi.mock('../../server/services/auditService', () => ({
  default: { logAction: vi.fn(async () => undefined) },
}));

// The draft renderers pull puppeteer-cluster/pdfkit at import time; the
// pre-check never renders, so keep the module graph light.
vi.mock('../../server/export/renderers', () => ({
  renderPdfBuffersFor510k: vi.fn(),
  renderPdfBuffersPerSection: vi.fn(),
  renderCombinedPdf: vi.fn(),
  renderCombinedDocx: vi.fn(),
}));

const { mockEvaluateEntitlement } = vi.hoisted(() => ({
  mockEvaluateEntitlement: vi.fn() as ReturnType<typeof vi.fn>,
}));
vi.mock('../../server/services/entitlements/require-entitlement', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  evaluateOrgEntitlement: mockEvaluateEntitlement,
}));

import estarRoutes from '../../server/routes/510k-estar-routes';

const CAPABILITY = 'device_assembly_readiness';

function entitlementHandler() {
  const layer = estarRoutes.stack.find(
    (l: any) => l.route?.path === '/entitlement' && l.route?.methods?.get,
  );
  if (!layer) throw new Error('Missing route GET /entitlement');
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function makeReq() {
  const req = createMockRequest({}) as any;
  req.userRole = 'viewer'; // a read path: no editor role needed
  req.userId = 9;
  req.resolvedOrganizationId = 2;
  return req;
}

async function call(req: any = makeReq()) {
  const res = createMockResponse() as any;
  await entitlementHandler()(req, res);
  return res;
}

/** The evaluator's below-tier verdict, shaped exactly as evaluateOrgEntitlement shapes it. */
function belowTier(over: Record<string, unknown> = {}) {
  return {
    allowed: false,
    viaToggle: false,
    requiredTier: 'standard',
    tier: 'free',
    reason: null,
    detail: "tier 'free' is below the 'standard' minimum",
    ...over,
  };
}

/** The off-mode body: nothing evaluated, nothing invented. */
const OFF_BODY = {
  capability: CAPABILITY,
  mode: 'off',
  enforced: false,
  allowed: null,
  requiredTier: null,
  tier: null,
  reason: null,
};

let priorMode: string | undefined;
beforeEach(() => {
  priorMode = process.env.ENTITLEMENTS_ENFORCE;
  delete process.env.ENTITLEMENTS_ENFORCE;
  // A verdict that WOULD deny, so the off-mode tests prove the route never
  // asked rather than that the answer happened to be benign.
  mockEvaluateEntitlement.mockReset();
  mockEvaluateEntitlement.mockResolvedValue(belowTier());
});
afterEach(() => {
  if (priorMode === undefined) delete process.env.ENTITLEMENTS_ENFORCE;
  else process.env.ENTITLEMENTS_ENFORCE = priorMode;
});

describe('GET /api/510k/estar/entitlement — mode off evaluates nothing', () => {
  it.each([{ label: 'unset', value: undefined }, { label: "'off'", value: 'off' }])(
    'ENTITLEMENTS_ENFORCE $label: 200 mode off, allowed null, and the evaluator is NEVER called',
    async ({ value }) => {
      if (value !== undefined) process.env.ENTITLEMENTS_ENFORCE = value;

      const res = await call();

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(OFF_BODY);
      expect(mockEvaluateEntitlement).not.toHaveBeenCalled();
    },
  );
});

describe('GET /api/510k/estar/entitlement — the verdict the gate would reach', () => {
  it("mode 'on' + below tier: enforced true, allowed false, requiredTier from the evaluation — the POST would refuse", async () => {
    process.env.ENTITLEMENTS_ENFORCE = 'on';

    const res = await call();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      capability: CAPABILITY,
      mode: 'on',
      enforced: true,
      allowed: false,
      requiredTier: 'standard',
      tier: 'free',
      reason: "tier 'free' is below the 'standard' minimum",
    });
    // Evaluated once, for THIS org, on the capability the POST is gated on.
    expect(mockEvaluateEntitlement).toHaveBeenCalledTimes(1);
    expect(mockEvaluateEntitlement).toHaveBeenCalledWith(CAPABILITY, 2);
  });

  it("mode 'warn' + below tier: allowed false but enforced false — the surface must NOT lock", async () => {
    process.env.ENTITLEMENTS_ENFORCE = 'warn';

    const res = await call();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      mode: 'warn',
      enforced: false,
      allowed: false,
      requiredTier: 'standard',
      tier: 'free',
    });
  });

  it("mode 'on' + entitled (via a pilot toggle): allowed true, reason null", async () => {
    process.env.ENTITLEMENTS_ENFORCE = 'on';
    mockEvaluateEntitlement.mockResolvedValue(belowTier({ allowed: true, viaToggle: true, detail: null }));

    const res = await call();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      capability: CAPABILITY,
      mode: 'on',
      enforced: true,
      allowed: true,
      requiredTier: 'standard',
      tier: 'free',
      reason: null,
    });
  });
});

describe('GET /api/510k/estar/entitlement — reason is copy or null, never query text', () => {
  it('a failed tier lookup is reported as unknown (tier null, reason null) — the driver text never reaches the body', async () => {
    process.env.ENTITLEMENTS_ENFORCE = 'on';
    // Exactly what lookupOrgTier hands back when the query itself fails.
    const failed = 'tier lookup failed: boom ECONNREFUSED 127.0.0.1:5432';
    mockEvaluateEntitlement.mockResolvedValue(
      belowTier({ tier: null, reason: failed, detail: `tier unknown (${failed})` }),
    );

    const res = await call();

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({
      capability: CAPABILITY,
      mode: 'on',
      enforced: true,
      allowed: false,
      requiredTier: 'standard',
      tier: null,
      reason: null,
    });
    expect(JSON.stringify(payload)).not.toMatch(/boom|ECONNREFUSED|5432|lookup failed/);
  });

  it("an unknown tier with a copy reason ('organization not found') forwards that reason", async () => {
    process.env.ENTITLEMENTS_ENFORCE = 'on';
    mockEvaluateEntitlement.mockResolvedValue(
      belowTier({ tier: null, reason: 'organization not found', detail: 'tier unknown (organization not found)' }),
    );

    const res = await call();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({
      allowed: false,
      tier: null,
      reason: 'organization not found',
    });
  });
});

describe('GET /api/510k/estar/entitlement — failure envelopes', () => {
  it('500 ESTAR_ENTITLEMENT_FAILED when the evaluator throws; the body carries no error text', async () => {
    process.env.ENTITLEMENTS_ENFORCE = 'on';
    mockEvaluateEntitlement.mockRejectedValue(new Error('boom: canceling statement due to statement timeout'));

    const res = await call();

    expect(res.status).toHaveBeenCalledWith(500);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({
      error: 'ESTAR_ENTITLEMENT_FAILED',
      message: 'Failed to read the export entitlement. The problem has been logged.',
    });
    expect(JSON.stringify(payload)).not.toMatch(/boom|statement timeout/);
  });

  it('400 when no organization context resolves; nothing evaluated', async () => {
    process.env.ENTITLEMENTS_ENFORCE = 'on';
    const req = makeReq();
    // Leaves only the fixture's non-numeric tenantContext.organizationId behind.
    delete req.resolvedOrganizationId;

    const res = await call(req);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Organization context required' });
    expect(mockEvaluateEntitlement).not.toHaveBeenCalled();
  });
});
