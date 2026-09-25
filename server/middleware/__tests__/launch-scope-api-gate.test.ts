/**
 * Launch scope at the API: a path every claiming surface of which is outside the
 * launch catalog is refused when launch scope is enforced, whatever
 * MODULE_ENFORCEMENT says.
 *
 * The production failure this exists to prevent: until 2026-09-25 launch scope
 * was enforced in navigation only. The rail hid pharmacovigilance, and
 * `POST /api/pharmacovigilance/...` still answered a signed-in tenant, because
 * the one API gate (this middleware) never read launch scope and defaults to
 * `off`. Each case names the request as production would see it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/license-manager.js', () => ({ canAccessModule: vi.fn(async () => ({ allowed: true })) }));
const dbQuery = vi.hoisted(() => vi.fn(async () => ({ rows: [] as unknown[] })));
vi.mock('../../db.js', () => ({ pool: { query: (...a: unknown[]) => dbQuery(...(a as [])) } }));

import { invalidateEnforcementModeCache } from '../../services/entitlements/enforcement-mode';
import { buildPrefixMap, moduleEntitlementGate } from '../moduleEntitlementGate';

// Real launch ids (shared/constants/launch-scope.ts): `tasks` is a launch app,
// `pv-cockpit` is not, `audit-trail` is a shell surface.
const SURFACES = [
  { id: 'tasks', apiPrefixes: ['/api/task-management', '/api/approval-workflows/pending'] },
  { id: 'pv-cockpit', apiPrefixes: ['/api/pharmacovigilance', '/api/task-management'] },
  { id: 'orchestration', apiPrefixes: ['/api/approval-workflows'] },
  { id: 'insights', apiPrefixes: ['/api/pharmacovigilance-insights'] },
];

function reqFor(path: string, orgId: number | null = 42) {
  return { path, originalUrl: path, tenantContext: orgId == null ? undefined : { organizationId: orgId } } as any;
}
function resSpy() {
  const res: any = { statusCode: 0, body: null };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  return res;
}
async function run(gate: ReturnType<typeof moduleEntitlementGate>, path: string, orgId: number | null = 42) {
  const res = resSpy();
  const next = vi.fn();
  await gate(reqFor(path, orgId), res, next);
  return { res, passed: next.mock.calls.length === 1 };
}

beforeEach(() => {
  dbQuery.mockReset();
  dbQuery.mockImplementation(async () => ({ rows: [] }));
  invalidateEnforcementModeCache();
  vi.unstubAllEnvs();
  vi.stubEnv('MODULE_ENFORCEMENT', 'off');
});

describe('launch scope enforced, MODULE_ENFORCEMENT off (production as configured)', () => {
  const gate = () => moduleEntitlementGate(buildPrefixMap(SURFACES), { launchScope: 'on' });

  it('refuses a write to a surface outside the launch catalog, 403 LAUNCH_SCOPE, and does not call the route', async () => {
    const { res, passed } = await run(gate(), '/api/pharmacovigilance/cases');
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: { code: 'LAUNCH_SCOPE', message: expect.stringMatching(/not in this release/i) },
    });
  });

  it('refuses it for a request with no organisation too: scope is about the product, not the tenant', async () => {
    const { res, passed } = await run(gate(), '/api/pharmacovigilance/cases', null);
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('passes a prefix any launch surface claims, even when an out-of-scope surface claims it too', async () => {
    expect((await run(gate(), '/api/task-management/tasks')).passed).toBe(true);
  });

  it('passes the narrow launch sub-path, and refuses the rest of the out-of-scope prefix', async () => {
    expect((await run(gate(), '/api/approval-workflows/pending')).passed).toBe(true);
    expect((await run(gate(), '/api/approval-workflows/42/approve')).passed).toBe(false);
  });

  it('matches at a segment boundary: a longer, unclaimed name is not the out-of-scope prefix', async () => {
    // `/api/pharmacovigilance-insights` is its own (out-of-scope) prefix; an
    // unclaimed `/api/pharmacovigilanceX` is neither.
    expect((await run(gate(), '/api/pharmacovigilanceX/ping')).passed).toBe(true);
  });

  it('passes a path no surface claims (unmapped) and a never-gated path', async () => {
    expect((await run(gate(), '/api/stripe/webhook')).passed).toBe(true);
    expect((await run(gate(), '/api/auth/login')).passed).toBe(true);
    expect((await run(gate(), '/api/audit/events')).passed).toBe(true);
  });
});

describe('launch scope off (a development server)', () => {
  it('passes the out-of-scope path through to the module modes, which are off', async () => {
    const gate = moduleEntitlementGate(buildPrefixMap(SURFACES), { launchScope: 'off' });
    expect((await run(gate, '/api/pharmacovigilance/cases')).passed).toBe(true);
  });
});

describe('the default reads LAUNCH_SCOPE_ENFORCE once, when the gate is built', () => {
  it('production with LAUNCH_SCOPE_ENFORCE unset enforces', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', '');
    const gate = moduleEntitlementGate(buildPrefixMap(SURFACES));
    expect((await run(gate, '/api/pharmacovigilance/cases')).res.statusCode).toBe(403);
  });

  it('production with a value that is not on/off refuses to build (boot), rather than guess', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', 'yes');
    expect(() => moduleEntitlementGate(buildPrefixMap(SURFACES))).toThrow(/LAUNCH_SCOPE_ENFORCE/);
  });
});

/* The real registry (shared/constants/ui-surface-registry*.ts), not a fixture:
   the paths the validation package drives and the launch screens call, as
   production answers them. OQ-005 v0.6 is written against these. */
describe('the real registry, launch scope on', () => {
  const gate = () => moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on' });
  const refused = async (p: string) => (await run(gate(), p)).res.statusCode === 403;

  it('refuses the locked boards\' APIs: the contradiction scan and the execution history (VSR-001 §16.5)', async () => {
    expect(await refused('/api/governed-intelligence/contradictions/scan/1')).toBe(true);
    expect(await refused('/api/orchestration/executions/abc')).toBe(true);
  });

  it('passes what the launch catalog and AnA use: execute, templates, the package model, tasks, dispatch readiness', async () => {
    for (const p of [
      '/api/orchestration/execute',
      '/api/orchestration/templates',
      '/api/submission-ops/packages',
      '/api/task-management/tasks',
      '/api/approval-workflows/pending',
      '/api/regulatory-programs/1',
      '/api/study-design/1/2',
    ]) {
      expect(await refused(p), p).toBe(false);
    }
  });

  it('refuses a surface outside the catalog, and leaves the public API and webhooks alone', async () => {
    expect(await refused('/api/pharmacovigilance/cases')).toBe(true);
    expect(await refused('/api/v1/documents')).toBe(false);
    expect(await refused('/api/stripe/webhook')).toBe(false);
  });
});
