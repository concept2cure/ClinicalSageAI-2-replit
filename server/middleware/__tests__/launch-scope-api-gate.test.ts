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
/* Surfaces added to the real launch catalog for one describe block, so the
   gate production builds can be asked about an app before the catalog lists it
   (CMC / Module 3, P-28, below). Empty everywhere else: every other case runs
   against the catalog exactly as shipped. */
const catalogPlus = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock('../../../shared/constants/launch-scope', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../shared/constants/launch-scope')>();
  class CatalogPlus extends Set<string> {
    has(id: string) {
      return super.has(id) || catalogPlus.ids.includes(id);
    }
  }
  return { ...real, LAUNCH_SURFACE_IDS: new CatalogPlus(real.LAUNCH_SURFACE_IDS) };
});

import { invalidateEnforcementModeCache } from '../../services/entitlements/enforcement-mode';
import { NEVER_GATED } from '../../services/entitlements/api-prefix-map';
import { launchScopeApiVerdict } from '../../services/entitlements/launch-scope-api';
import { LAUNCH_SURFACE_IDS } from '../../../shared/constants/launch-scope';
import { UI_SURFACES } from '../../../shared/constants/ui-surface-registry';
import { checkLaunchScopeApi, REAL } from '../../../scripts/ci/check-launch-scope-api';
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

  /* 2026-10-08 (docs/SURFACE_DECISIONS_2026-10-08.md): AnA Command left the
     launch scope. It and the locked Orchestration board were the only callers of
     the workflow templates and execute routes, so production refuses them now. */
  it('refuses the workflow runner AnA Command used, now that AnA Command is locked', async () => {
    for (const p of ['/api/orchestration/execute', '/api/orchestration/templates', '/api/report-os/portfolio/org']) {
      expect(await refused(p), p).toBe(true);
    }
  });

  it('passes what the launch catalog and AnA use: the package model, tasks, dispatch readiness', async () => {
    for (const p of [
      '/api/submission-ops/packages',
      '/api/task-management/tasks',
      '/api/approval-workflows/pending',
      '/api/regulatory-programs/1',
      '/api/study-design/1/2',
    ]) {
      expect(await refused(p), p).toBe(false);
    }
  });

  /* `gateway-transmittals` claimed all of /api/mdx from 2026-07-21 (its own
     note says its routes are /api/mdx/gateways), so every device-kit API
     answered as launch: risk items, clinical studies, IVD, labeling. Found by
     the AnA tool measurement (2026-09-26); the device kit is outside the launch
     catalog. */
  it('refuses the device kit under /api/mdx, and passes the launch apps that live there', async () => {
    for (const p of ['/api/mdx/risk-items/1', '/api/mdx/clinical-studies', '/api/mdx/labeling/documents', '/api/mdx/rbm-kris']) {
      expect(await refused(p), p).toBe(true);
    }
    for (const p of [
      '/api/mdx/gateways/transmittals',
      '/api/mdx/vault',
      '/api/mdx/vault/7/versions',
      '/api/mdx/qms/documents',
      '/api/mdx/admin/users',
      '/api/mdx/industry-profile',
      '/api/mdx/notifications/unread-count',
    ]) {
      expect(await refused(p), p).toBe(false);
    }
    // AnA memory left the launch scope on 2026-10-08: it listed a store nothing
    // writes. Its routes are refused with it.
    expect(await refused('/api/mdx/ana/memory'), '/api/mdx/ana/memory').toBe(true);
  });

  /* 2026-10-17 (audit, FILING_SPINE F12 + LX-13): transmit runs on the sequence
     (POST /api/submissions/sequences/:id/transmit). Gateway transmittals is a
     read-only log, and the package-model transmit it offered — with its gateway
     roster and separation-of-duties dry run — has no launch caller, so
     production refuses it. The log, its status poll, its ACK and the signed
     technical rejection stay. */
  it('refuses the package transmit, and passes the transmittal log and its reads', async () => {
    for (const p of ['/api/mdx/gateways/fda/esg/transmit', '/api/mdx/gateways/transmit-independence', '/api/mdx/gateways']) {
      expect(await refused(p), p).toBe(true);
    }
    for (const p of [
      '/api/mdx/gateways/transmittals',
      '/api/mdx/gateways/transmittals/3/status',
      '/api/mdx/gateways/transmittals/3/ack',
      '/api/mdx/gateways/transmittals/3/technical-rejection',
      '/api/submissions/sequences/7/transmit',
    ]) {
      expect(await refused(p), p).toBe(false);
    }
  });

  /* 2026-09-29: three more broad claims, each pre-dating launch scope, that let
     a hidden app's routes answer as launch. dossier-map claimed all of
     /api/global-ri and /api/rim; project-home and program-journey claimed
     /api/rim; submission-center claimed all of /api/510k/estar. No launch
     screen calls any of them except the two eSTAR sub-paths Submission Center
     uses. */
  it('refuses Global RI, RIM and the device eSTAR kit, and passes what launch screens call', async () => {
    for (const p of ['/api/global-ri/catalog', '/api/global-ri/impurities/x', '/api/rim/products', '/api/510k/estar/official', '/api/510k/estar/build']) {
      expect(await refused(p), p).toBe(true);
    }
    for (const p of ['/api/510k/estar/submissions', '/api/510k/estar/assemble']) {
      expect(await refused(p), p).toBe(false);
    }
    // The dossier map left the launch scope on 2026-10-08 (always empty for a
    // program created in the product); its read is refused with it.
    expect(await refused('/api/dossier-map'), '/api/dossier-map').toBe(true);
  });

  /* Found 2026-09-29: Projects and Project home each claimed all of /api/programs.
     Every route under it is device 510(k) predicate intelligence (21, 12 of them
     writes), the substantial-equivalence render, or an RTM over tables nothing
     writes to. No launch screen calls any of them. */
  it('refuses the device predicate-intelligence and RTM routes under /api/programs, and passes Projects', async () => {
    for (const p of [
      '/api/programs/7/predicate-intel/defense-packet/build',
      '/api/programs/7/predicate-intel/render/job-1/download',
      '/api/programs/7/se-matrix/render',
      '/api/programs/7/rtm/csv',
    ]) {
      expect(await refused(p), p).toBe(true);
    }
    expect(await refused('/api/projects')).toBe(false);
  });

  it('refuses a surface outside the catalog, and leaves the public API and webhooks alone', async () => {
    expect(await refused('/api/pharmacovigilance/cases')).toBe(true);
    expect(await refused('/api/v1/documents')).toBe(false);
    expect(await refused('/api/stripe/webhook')).toBe(false);
  });
});

/* Stage 2b. A path no surface, platform or infrastructure entry claims is outside
   the launch scope as registered. Refusing it outright could refuse a caller
   static analysis cannot see (a computed path, a server-to-server call), so it is
   REPORTED in report mode — the would-refuse lands in the enforcement report
   Master Admin → Licensing → Enforcement already reads — and refused in enforce
   mode, production's default since stage 3 (2026-09-26). */
describe('unattributed paths (stage 2b)', async () => {
  const { enforcementReport, clearObservations } = await import('../../services/entitlements/enforcement-observations');
  const snapshotObservations = () => enforcementReport('report').observations;
  const build = (unattributed?: 'report' | 'enforce') =>
    moduleEntitlementGate(buildPrefixMap(SURFACES), { launchScope: 'on', ...(unattributed ? { unattributed } : {}) });

  beforeEach(() => clearObservations());

  it('report (the default): passes the request and records the would-refuse', async () => {
    const { passed } = await run(build(), '/api/legacy-namespace/items', 42);
    expect(passed).toBe(true);
    const rows = snapshotObservations();
    expect(rows).toEqual([
      expect.objectContaining({ path: '/api/legacy-namespace/items', organizationId: 42, enforced: false, modules: ['launch-scope:unattributed'] }),
    ]);
  });

  it('enforce: refuses it 403 LAUNCH_SCOPE and records it as enforced', async () => {
    const { res, passed } = await run(build('enforce'), '/api/legacy-namespace/items', 42);
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('LAUNCH_SCOPE');
    expect(snapshotObservations()[0]).toMatchObject({ enforced: true });
  });

  it('enforce: never refuses infrastructure (the public API, webhooks) or a non-API path (the app itself)', async () => {
    const gate = build('enforce');
    expect((await run(gate, '/api/v1/documents')).passed).toBe(true);
    expect((await run(gate, '/api/firecrawl-webhooks/crawl')).passed).toBe(true);
    expect((await run(gate, '/concept2cure/projects')).passed).toBe(true);
    expect((await run(gate, '/assets/index.js')).passed).toBe(true);
    expect(snapshotObservations()).toEqual([]);
  });

  it('records one row per route, not per record: numeric and uuid segments collapse to :id', async () => {
    const gate = build();
    await run(gate, '/api/legacy-namespace/projects/123/artifacts', 42);
    await run(gate, '/api/legacy-namespace/projects/456/artifacts', 42);
    await run(gate, '/api/legacy-namespace/programs/0b7f2c1e-9a4d-4c3b-8e21-5f6a7b8c9d0e', 42);
    const rows = snapshotObservations();
    expect(rows.map((r) => [r.path, r.count]).sort()).toEqual([
      ['/api/legacy-namespace/programs/:id', 1],
      ['/api/legacy-namespace/projects/:id/artifacts', 2],
    ]);
  });

  it('a request with no organisation is recorded against organisation 0, not dropped', async () => {
    await run(build(), '/api/legacy-namespace/items', null);
    expect(snapshotObservations()[0]).toMatchObject({ organizationId: 0 });
  });

  it('production with LAUNCH_SCOPE_API_UNATTRIBUTED unset ENFORCES (stage 3); report is an explicit choice; an unknown value refuses to boot', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LAUNCH_SCOPE_ENFORCE', '');
    vi.stubEnv('LAUNCH_SCOPE_API_UNATTRIBUTED', '');
    const unset = await run(moduleEntitlementGate(buildPrefixMap(SURFACES)), '/api/legacy-namespace/x');
    expect(unset.passed).toBe(false);
    expect(unset.res.statusCode).toBe(403);
    vi.stubEnv('LAUNCH_SCOPE_API_UNATTRIBUTED', 'report');
    expect((await run(moduleEntitlementGate(buildPrefixMap(SURFACES)), '/api/legacy-namespace/x')).passed).toBe(true);
    vi.stubEnv('LAUNCH_SCOPE_API_UNATTRIBUTED', 'strict');
    expect(() => moduleEntitlementGate(buildPrefixMap(SURFACES))).toThrow(/LAUNCH_SCOPE_API_UNATTRIBUTED/);
  });

  it('outside production, unset still only reports (a development server serves everything)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('LAUNCH_SCOPE_API_UNATTRIBUTED', '');
    const gate = moduleEntitlementGate(buildPrefixMap(SURFACES), { launchScope: 'on' });
    expect((await run(gate, '/api/legacy-namespace/x')).passed).toBe(true);
  });
});

/* Stage 3. Enforcing the unclaimed remainder is safe only if nothing
   legitimate is unclaimed. The inventory of every route production mounts
   (docs/evidence/D2-API-SCOPE/2026-09-25/stage3-*) found the callers a screen's
   code does not show: the public paths the auth boundary lets through
   unauthenticated (legacy sign-in redirects, browser CSP reports, health, the
   Prometheus scrape) and the second mount of the identity router at /api/user.
   Each must pass in enforce mode with the REAL registry, and a mounted namespace
   nobody calls must not. */
describe('the real registry, unattributed paths enforced', () => {
  const gate = () => moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' });
  const passes = async (p: string) => (await run(gate(), p)).passed;

  it('never refuses a path the auth boundary serves unauthenticated (PUBLIC_API_ALLOWLIST)', async () => {
    for (const p of ['/api/login', '/api/logout', '/api/register', '/api/csp-report', '/api/metrics', '/api/cortex/health', '/api/claude/health', '/api/claude/models', '/api/time', '/api/diag', '/api/setup/status']) {
      expect(await passes(p), p).toBe(true);
    }
  });

  it('passes the identity router at its second mount, /api/user', async () => {
    expect(await passes('/api/user/me')).toBe(true);
    expect(await passes('/api/user/me/preferences')).toBe(true);
  });

  it('refuses a mounted namespace no launch screen, shell or external caller uses', async () => {
    for (const p of ['/api/cortex/chat', '/api/grants/opportunities', '/api/concept2cure/maintenance/run', '/api/stability/studies', '/api/demo/reset']) {
      const { res, passed } = await run(gate(), p);
      expect(passed, p).toBe(false);
      expect(res.statusCode, p).toBe(403);
    }
  });

  /* 2026-09-29: /api/biotech-artifacts generates ICSRs, PSURs, CIOMS forms,
     expedited safety reports, monitoring/deviation/enrollment reports and eCTD
     cover letters from the request body and records none of them: no vault
     document, no version, no audit row. Its only caller is its own route, no
     screen calls it, and pharmacovigilance and clinical operations are outside
     the release. artifacts-center no longer claims it, so production refuses
     it; a regulated document is produced only through a path that records it. */
  it('refuses the unrecorded regulatory-document generators', async () => {
    for (const p of ['/api/biotech-artifacts/pv/icsr', '/api/biotech-artifacts/pv/psur', '/api/biotech-artifacts/clinical/monitoring-report', '/api/biotech-artifacts/ectd/cover-letter', '/api/biotech-artifacts/catalog']) {
      expect(await passes(p), p).toBe(false);
    }
  });

  it('a public prefix does not widen: an exact public path is not its parent namespace', async () => {
    // /api/cortex/health is public; the rest of /api/cortex is not.
    expect(await passes('/api/cortex/health')).toBe(true);
    expect(await passes('/api/cortex/threads')).toBe(false);
  });
});

/* CMC / Module 3 joins the launch catalog (decision P-28, 2026-10-05: a US FDA
   IND for a small molecule, phase 1–2). Attribution is by longest prefix at a
   segment boundary, so while the cmc surface claimed the bare '/api/cmc', the
   flip would have made EVERY path under it answer 'launch': handlers no screen
   calls (a model drafting specifications with no organisation, a task assigned
   to a hard-coded 'CMC Team Lead', an artifact classifier acting as 'system'),
   and routes deliberately withheld until a launch screen calls them. The cmc
   surface now claims the 33 segment prefixes its screens call, and nothing
   else. Each case is asked of the real registry with the catalog plus cmc, as
   it will stand at the flip. */
describe('the real registry with CMC / Module 3 in the catalog (P-28)', () => {
  const withCmc: ReadonlySet<string> = new Set([...LAUNCH_SURFACE_IDS, 'cmc']);
  const verdict = (p: string) => launchScopeApiVerdict(p, buildPrefixMap(), NEVER_GATED, withCmc);

  /* Deleted 2026-10-05 for want of a caller (docs/evidence/CMC-M3-GA/
     2026-10-05/20-cmc-api-allowlist/), or withheld by P-28's scope boundary. */
  const NOT_LAUNCH = [
    '/api/cmc',
    '/api/cmc/insights/take-action',
    '/api/cmc/compliance/check-rules',
    '/api/cmc/generate-enhanced-blueprint',
    '/api/cmc/module3-os/classify-artifact/p-1',
    '/api/cmc/module3-os/source-lineage/p-1/3.2.P.5',
    '/api/cmc/module3-os/uploaded-sources/p-1',
    '/api/cmc/module3-os/section-labels',
    '/api/cmc/variations/classify',
    '/api/cmc/projects/p-1/process-capability',
    '/api/cmc/stability/studies',
    '/api/cmc/status',
  ];

  it('claims none of the deleted or withheld /api/cmc paths: each is unmapped, which production refuses', () => {
    const answered = Object.fromEntries(NOT_LAUNCH.map((p) => [p, verdict(p)]));
    expect(answered).toEqual(Object.fromEntries(NOT_LAUNCH.map((p) => [p, 'unmapped'])));
  });

  it('the gate production builds refuses them 403 LAUNCH_SCOPE, and serves what the CMC screens call', async () => {
    catalogPlus.ids = ['cmc'];
    try {
      const gate = moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' });
      for (const p of NOT_LAUNCH) {
        const { res, passed } = await run(gate, p);
        expect({ p, passed, status: res.statusCode, code: res.body?.error?.code }).toEqual({ p, passed: false, status: 403, code: 'LAUNCH_SCOPE' });
      }
      for (const p of [
        '/api/cmc/drug-substances',
        '/api/cmc/stability-studies/12/shelf-life',
        '/api/cmc/specifications/7/approve',
        '/api/cmc/batch-records/7/release',
        '/api/cmc/quality/qbd/p-1',
        '/api/cmc/module3-os/compile/p-1',
        '/api/cmc/module3-os/guard/final-export/p-1',
        '/api/cmc/module3-os/place-into-submission/p-1',
      ]) {
        expect((await run(gate, p)).passed, p).toBe(true);
      }
    } finally {
      catalogPlus.ids = [];
    }
  });

  /* The walker ci:launch-scope-api runs, over the CMC surface's own import
     graph from client/src/concept2cure/v2/surfaceViews.ts. */
  const walk = checkLaunchScopeApi(REAL, buildPrefixMap(), withCmc);
  const cmcCalls = [...walk.all].filter(([p, e]) => e.surfaces.has('cmc') && (p === '/api/cmc' || p.startsWith('/api/cmc/')));

  it('every /api/cmc path the CMC screens name answers launch, and ci:launch-scope-api finds nothing to refuse', () => {
    expect(walk.unresolved).toEqual([]);
    // A wrong walk root would make the assertion below pass over nothing.
    expect(cmcCalls.length).toBeGreaterThan(40);
    expect(cmcCalls.filter(([, e]) => e.verdict !== 'launch').map(([p, e]) => `${e.verdict} ${p}`)).toEqual([]);
    expect(walk.violations.map((v) => `${v.verdict} ${v.path} ← ${v.surfaces.join(', ')}`)).toEqual([]);
  });

  it('claims no /api/cmc prefix the CMC screens do not call', () => {
    const prefixes = UI_SURFACES.find((s) => s.id === 'cmc')?.apiPrefixes ?? [];
    expect(prefixes.length).toBeGreaterThan(0);
    // A mount root admits every handler mounted under it, called or not.
    expect(prefixes.filter((p) => p === '/api/cmc' || p === '/api/cmc/module3-os')).toEqual([]);
    const uncalled = prefixes.filter((pre) => !cmcCalls.some(([p]) => p === pre || p.startsWith(`${pre}/`)));
    expect(uncalled, `cmc apiPrefixes no CMC screen calls:\n  ${uncalled.join('\n  ')}`).toEqual([]);
  });
});

/* The IND lifecycle and forms screen is a feature of the Submission Center app
   (decision P-32, 2026-10-15). While `ind-checklist` claimed the bare
   '/api/ind-lifecycle', putting it in the catalog would have made every route
   under it answer launch — the 312.32 IND safety report, the E2B(R3) ICSR
   composer and the ICSR transmit to an agency gateway among them. It now claims
   the segments its screen calls; the safety namespaces are claimed by
   `pharmacovigilance`, outside the release, so production refuses them 403
   LAUNCH_SCOPE even where unattributed paths are only reported. The
   agency-questions screen stays OUTSIDE the catalog until its approval is a
   signed act, and every /api/haq-manager path is refused. Asked of the real
   registry and the real catalog. */
describe('the real registry with the IND tools in Submission Center, agency questions locked (P-32)', () => {
  /** Claimed by an out-of-scope surface: refused whatever LAUNCH_SCOPE_API_UNATTRIBUTED says. */
  const SAFETY = [
    '/api/ind-lifecycle/safety-report',
    '/api/ind-lifecycle/safety-report/classify',
    '/api/ind-lifecycle/safety-report/pdf',
    '/api/ind-lifecycle/safety-report/file',
    '/api/ind-lifecycle/safety-report/icsr',
    '/api/ind-lifecycle/safety-report/icsr/message',
    '/api/ind-lifecycle/safety-reports/7',
    '/api/ind-lifecycle/icsr-transmissions/7/transmit',
    '/api/ind-lifecycle/icsr-transmissions/7/acknowledge',
  ];
  /** HaqManager.tsx's calls: the surface is outside the release. */
  const HAQ = [
    '/api/haq-manager/rounds',
    '/api/haq-manager/questions',
    '/api/haq-manager/letters/L-1/questions/934/approve',
    '/api/haq-manager/letters/L-1/assemble',
  ];
  /** Claimed by nothing: refused in production (enforce), reported elsewhere. */
  const UNCLAIMED = [
    '/api/ind-lifecycle',
    '/api/ind-lifecycle/submission/7/safety-reports',
    '/api/ind-lifecycle/submission/7/icsr-transmissions',
    '/api/ind-lifecycle/submission/7/cockpit',
    '/api/ind-lifecycle/sequence/7/dispatch-gate',
    '/api/ind-lifecycle/portfolio',
    '/api/ind-lifecycle/readiness',
    '/api/ind-master-data',
  ];
  const CALLED = [
    '/api/ind-checklist',
    '/api/ind-lifecycle/clock',
    '/api/ind-lifecycle/cover-letter',
    '/api/ind-lifecycle/briefing-book/pdf',
    '/api/ind-lifecycle/loa',
    '/api/ind-lifecycle/right-of-reference/pdf',
    '/api/ind-lifecycle/annual-report/file',
    '/api/ind-lifecycle/amendment-plan',
    '/api/ind-lifecycle/amendment/file',
    '/api/ind-forms/',
    '/api/ind-forms/1571/build',
  ];

  it('the IND surface is in the catalog the gate reads; agency questions and pharmacovigilance are not', () => {
    expect(LAUNCH_SURFACE_IDS.has('ind-checklist')).toBe(true);
    expect(LAUNCH_SURFACE_IDS.has('haq-manager')).toBe(false);
    expect(LAUNCH_SURFACE_IDS.has('pharmacovigilance')).toBe(false);
  });

  it('refuses the safety and ICSR routes, and agency questions, 403 LAUNCH_SCOPE even when unattributed paths are only reported', async () => {
    const gate = moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'report' });
    for (const p of [...SAFETY, ...HAQ]) {
      const { res, passed } = await run(gate, p);
      expect({ p, passed, status: res.statusCode, code: res.body?.error?.code }).toEqual({ p, passed: false, status: 403, code: 'LAUNCH_SCOPE' });
    }
  });

  it('the gate production builds refuses the unclaimed IND routes too, and serves what the screens call', async () => {
    const gate = moduleEntitlementGate(buildPrefixMap(), { launchScope: 'on', unattributed: 'enforce' });
    for (const p of [...SAFETY, ...UNCLAIMED]) {
      const { res, passed } = await run(gate, p);
      expect({ p, passed, status: res.statusCode, code: res.body?.error?.code }).toEqual({ p, passed: false, status: 403, code: 'LAUNCH_SCOPE' });
    }
    for (const p of CALLED) expect((await run(gate, p)).passed, p).toBe(true);
  });

  /* The walker ci:launch-scope-api runs, over each screen's own import graph. */
  const walk = checkLaunchScopeApi(REAL, buildPrefixMap(), LAUNCH_SURFACE_IDS);
  const callsOf = (id: string) => [...walk.all].filter(([, e]) => e.surfaces.has(id));
  const owned = (p: string) => /^\/api\/(ind-lifecycle|ind-forms|ind-checklist|ind-master-data|haq-manager)(\/|$)/.test(p);

  it('every IND path the IND screen names answers launch, and ci:launch-scope-api finds nothing to refuse', () => {
    expect(walk.unresolved).toEqual([]);
    const ind = callsOf('ind-checklist').filter(([p]) => owned(p));
    // A wrong walk root would make the assertions below pass over nothing.
    expect(ind.length).toBeGreaterThanOrEqual(20);
    expect(ind.map(([p]) => p)).toContain('/api/ind-lifecycle/clock');
    expect(ind.filter(([, e]) => e.verdict !== 'launch').map(([p, e]) => `${e.verdict} ${p}`)).toEqual([]);
    expect(walk.violations.map((v) => `${v.verdict} ${v.path} ← ${v.surfaces.join(', ')}`)).toEqual([]);
    // No launch or shell screen reaches the agency-questions API.
    expect([...walk.all].filter(([p]) => p.startsWith('/api/haq-manager')).map(([p, e]) => `${p} ← ${[...e.surfaces].join(', ')}`)).toEqual([]);
  });

  it('the IND screen names no safety or ICSR route: the card is hidden and its code is outside the graph', () => {
    const named = callsOf('ind-checklist').map(([p]) => p);
    expect(named.filter((p) => /\/(safety-reports?|icsr-transmissions)(\/|$)/.test(p))).toEqual([]);
  });

  it('claims no IND prefix the IND screen does not call', () => {
    const prefixes = UI_SURFACES.find((s) => s.id === 'ind-checklist')?.apiPrefixes ?? [];
    expect(prefixes.length).toBeGreaterThan(0);
    // A mount root admits every handler mounted under it, called or not.
    expect(prefixes.filter((p) => p === '/api/ind-lifecycle')).toEqual([]);
    const calls = callsOf('ind-checklist');
    const uncalled = prefixes.filter((pre) => !calls.some(([p]) => p === pre || p.startsWith(`${pre}/`)));
    expect(uncalled, `ind-checklist apiPrefixes no screen of it calls:\n  ${uncalled.join('\n  ')}`).toEqual([]);
  });

  it('the locked agency-questions surface claims only the namespace its screen calls', () => {
    expect(UI_SURFACES.find((s) => s.id === 'haq-manager')?.apiPrefixes).toEqual(['/api/haq-manager']);
  });
});
