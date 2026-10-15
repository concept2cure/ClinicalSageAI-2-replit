/**
 * The IND lifecycle and forms screen claims, in production, the routes it
 * calls — and 15-day safety reporting stays shut by name (decision P-32,
 * 2026-10-15; docs/LAUNCH_DEFINITION_OF_DONE.md "### P-32").
 *
 * P-32 made the `ind-checklist` surface a feature of the Submission Center app.
 * The agency-questions surface (`haq-manager`) stays OUTSIDE it, by the
 * coordinator's decision on P-32: its approve records a status with no Part 11
 * signature, and the FDA response package is assembled from those approvals.
 * Its claim was narrowed to what its screen calls, and every path of it is
 * refused. Attribution is by longest prefix at a segment boundary
 * (api-prefix-map.ts), so while `ind-checklist` claimed the bare
 * `/api/ind-lifecycle`, putting the surface in the catalog would have made
 * EVERY route under it answer `launch` — the 312.32 IND safety report, the
 * E2B(R3) ICSR composer and the ICSR transmit to an agency gateway among them.
 * The surface now claims the segments its screens call, and a pharmacovigilance
 * surface outside the release claims the safety routes, so they are refused
 * 403 LAUNCH_SCOPE even when unattributed paths are only reported.
 *
 * Asked of the real registry and the real prefix map; the safety routes are
 * enumerated from the routers themselves (indLifecycleRoutes(), the same
 * introspection the OpenAPI document is generated from), so a safety route
 * added later is covered without editing this file.
 */
import { describe, expect, it } from 'vitest';
import { buildPrefixMap, modulesForPath, NEVER_GATED } from '../api-prefix-map';
import { launchScopeApiVerdict } from '../launch-scope-api';
import { LAUNCH_SURFACE_IDS } from '../../../../shared/constants/launch-scope';
import { indLifecycleRoutes } from '../../../routes/ind-lifecycle/openapi';

const prefixMap = buildPrefixMap();
const verdict = (path: string) => launchScopeApiVerdict(path, prefixMap, NEVER_GATED);
/** `{param}` → a concrete segment, as a request carries it. */
const fill = (p: string) => p.replace(/\{[^}]+\}/g, '7');

/** Every IND path the launch screen calls, with the call site. */
const CALLED = [
  // client/src/concept2cure/v2/surfaces/IndLifecycle.tsx
  '/api/ind-checklist', //                         the checklist read (useLiveRows)
  '/api/ind-lifecycle/clock', //                   the 30-day clock, from the server engine (useServerClock)
  '/api/ind-lifecycle/cover-letter', //            assembleCoverLetter
  '/api/ind-lifecycle/cover-letter/pdf', //        downloadCoverLetterPdf
  '/api/ind-lifecycle/briefing-book', //           wired['briefing-book']
  '/api/ind-lifecycle/briefing-book/pdf',
  '/api/ind-lifecycle/loa', //                     wired.loa
  '/api/ind-lifecycle/loa/pdf',
  '/api/ind-lifecycle/right-of-reference', //      wired['right-of-reference']
  '/api/ind-lifecycle/right-of-reference/pdf',
  '/api/ind-lifecycle/annual-report', //           wired['annual-report']
  '/api/ind-lifecycle/annual-report/pdf',
  '/api/ind-lifecycle/annual-report/file',
  '/api/ind-lifecycle/amendment-plan', //          wired.amendment
  '/api/ind-lifecycle/amendment/file',
  // client/src/concept2cure/v2/surfaces/IndFormsPanel.tsx (embedded in the IND screen)
  '/api/ind-forms/',
  '/api/ind-forms/program-facts',
  '/api/ind-forms/1571/build',
  '/api/ind-forms/1571/pdf',
  '/api/ind-forms/1571/artifact',
  '/api/ind-forms/1571/official-upload',
];

/** What HaqManager.tsx calls. The surface is outside the release, so each is refused. */
const HAQ_CALLS = [
  '/api/haq-manager/rounds',
  '/api/haq-manager/questions',
  '/api/haq-manager/letters/L-1/questions/934/review',
  '/api/haq-manager/letters/L-1/questions/934/approve',
  '/api/haq-manager/letters/L-1/assemble',
];

/**
 * Admitted by a claimed segment without a screen calling it. The matcher has no
 * parameters, so a claimed segment admits what is mounted beneath it; each of
 * these was read and is the same deliverable's own deterministic render.
 */
const ADMITTED_UNCALLED: Record<string, string> = {
  'POST /api/ind-lifecycle/cover-letter/pdf-from-records': 'the cover letter rendered from stored records',
  'POST /api/ind-lifecycle/annual-report/line-listing': 'the 312.33(b) serious-AE line listing of the annual report',
};

const ROUTES = indLifecycleRoutes();
const isSafety = (p: string) => /\/(safety-reports?|icsr-transmissions)(\/|$)/.test(p);
const SAFETY = ROUTES.filter((r) => isSafety(r.path)).map((r) => ({ key: `${r.method} ${r.path}`, path: fill(r.path) }));
/** The register routes under /submission/:id stay unclaimed (P-32): a prefix cannot admit them without the safety routes beside them. */
const SAFETY_TOP = SAFETY.filter((r) => !r.path.startsWith('/api/ind-lifecycle/submission/'));
const SAFETY_REGISTER = SAFETY.filter((r) => r.path.startsWith('/api/ind-lifecycle/submission/'));

describe('P-32: the IND screen is served', () => {
  it.each(CALLED)('%s, called by a launch screen, is in launch scope', (path) => {
    expect(verdict(path)).toBe('launch');
  });
});

describe('P-32: agency questions stay locked until approval is a signed act', () => {
  it('the agency-questions surface is outside the launch catalog', () => {
    expect(LAUNCH_SURFACE_IDS.has('haq-manager')).toBe(false);
  });

  it.each(HAQ_CALLS)('%s is refused: out-of-scope', (path) => {
    expect(verdict(path)).toBe('out-of-scope');
  });

  it('claims only what its screen calls: the two unrelated namespaces stay with their own (locked) surfaces', () => {
    expect([...(modulesForPath('/api/haq-manager/rounds', prefixMap) ?? [])].sort()).toEqual(['haq-manager', 'report-engine']);
    expect(modulesForPath('/api/regulatory-correspondence/7', prefixMap)?.has('haq-manager')).toBe(false);
    expect(modulesForPath('/api/precedent-engine/search', prefixMap)?.has('haq-manager')).toBe(false);
  });
});

describe('P-32: 15-day safety reporting and ICSR transmission stay shut, by name', () => {
  it('enumerated the safety routes from the routers (a vacuous list would pass everything below)', () => {
    expect(SAFETY_TOP.length).toBeGreaterThanOrEqual(9);
    expect(SAFETY_REGISTER.length).toBeGreaterThanOrEqual(5);
    expect(SAFETY.map((r) => r.key)).toEqual(
      expect.arrayContaining([
        'POST /api/ind-lifecycle/safety-report',
        'POST /api/ind-lifecycle/safety-report/file',
        'POST /api/ind-lifecycle/safety-report/icsr/message',
        'GET /api/ind-lifecycle/safety-reports/{reportId}',
        'POST /api/ind-lifecycle/icsr-transmissions/{txId}/transmit',
        'POST /api/ind-lifecycle/submission/{id}/safety-reports',
        'POST /api/ind-lifecycle/submission/{id}/icsr-transmissions',
      ]),
    );
  });

  it.each(SAFETY.map((r) => [r.key, r.path]))('%s is not in launch scope', (_key, path) => {
    expect(verdict(path)).not.toBe('launch');
  });

  /* The hard refusal: claimed by a pharmacovigilance surface outside the
     release, and by nothing inside it, so the verdict is out-of-scope — refused
     whatever LAUNCH_SCOPE_API_UNATTRIBUTED says. */
  it.each(SAFETY_TOP.map((r) => [r.key, r.path]))('%s is claimed by pharmacovigilance alone: out-of-scope', (_key, path) => {
    const claimedBy = [...(modulesForPath(path, prefixMap) ?? [])];
    expect(claimedBy).toEqual(['pharmacovigilance']);
    expect(LAUNCH_SURFACE_IDS.has('pharmacovigilance')).toBe(false);
    expect(verdict(path)).toBe('out-of-scope');
  });

  it.each(SAFETY_REGISTER.map((r) => [r.key, r.path]))('%s stays unclaimed (refused in production as unattributed)', (_key, path) => {
    expect(verdict(path)).toBe('unmapped');
  });
});

describe('P-32: nothing is claimed that no screen calls', () => {
  it('/api/ind-master-data has no screen caller and is not in launch scope', () => {
    expect(verdict('/api/ind-master-data')).not.toBe('launch');
    expect(verdict('/api/ind-master-data/products/7')).not.toBe('launch');
  });

  it('the IND lifecycle routes production serves are exactly the called ones, plus the named sub-routes', () => {
    const calledRoutes = new Set(CALLED.filter((p) => p.startsWith('/api/ind-lifecycle/')));
    const served = ROUTES.filter((r) => verdict(fill(r.path)) === 'launch').map((r) => `${r.method} ${r.path}`);
    const unexplained = served.filter((k) => !calledRoutes.has(k.split(' ')[1]) && !ADMITTED_UNCALLED[k]);
    expect(unexplained, `served under /api/ind-lifecycle with no screen caller:\n  ${unexplained.join('\n  ')}`).toEqual([]);
    for (const k of Object.keys(ADMITTED_UNCALLED)) expect(served, k).toContain(k);
    /* And none of the uncalled lifecycle engines. /readiness has no screen
       caller: the readiness verdict the screen shows is evaluateIndReadiness's,
       computed by GET /api/ind-checklist over the submission's full section
       state and lifecycle issues — a second verdict from the screen's
       inventory would be a weaker one. */
    for (const p of [
      '/api/ind-lifecycle/portfolio',
      '/api/ind-lifecycle/readiness',
      '/api/ind-lifecycle/timeline',
      '/api/ind-lifecycle/action-items',
      '/api/ind-lifecycle/envelope',
      '/api/ind-lifecycle/sequence/7/dispatch-gate',
      '/api/ind-lifecycle/submission/7/cockpit',
      '/api/ind-lifecycle/amendments/7',
      '/api/ind-lifecycle/annual-reports/7',
    ]) {
      expect(verdict(p), p).not.toBe('launch');
    }
  });
});
