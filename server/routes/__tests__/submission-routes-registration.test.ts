/**
 * Submission routes ↔ capabilities index — a no-drift invariant.
 *
 * The capabilities index (regulatory-capabilities-index) is what the UI calls to
 * discover the regulatory layer. This test imports the real submissions router,
 * extracts every registered route, and asserts that EVERY route the capabilities
 * index advertises is actually mounted — so the discovery catalog can never claim a
 * route that isn't there. (Pairs with the capabilities↔AnA-tools test.)
 */
import { describe, it, expect } from 'vitest';
import router from '../submissions';
import { REGULATORY_CAPABILITIES } from '../../services/market-specs/regulatory-capabilities-index';

/** Extract "METHOD /path" entries from an Express router's layer stack. */
function registeredRoutes(r: { stack?: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }): Set<string> {
  const out = new Set<string>();
  for (const layer of r.stack ?? []) {
    const route = layer.route;
    if (!route) continue;
    for (const method of Object.keys(route.methods)) {
      if (route.methods[method]) out.add(`${method.toUpperCase()} ${route.path}`);
    }
  }
  return out;
}

describe('submission routes ↔ capabilities index', () => {
  const routes = registeredRoutes(router as never);

  it('mounts a non-trivial number of routes', () => {
    expect(routes.size).toBeGreaterThan(20);
  });

  it('mounts every route the capabilities index advertises', () => {
    for (const c of REGULATORY_CAPABILITIES) {
      if (c.route) {
        expect(routes.has(c.route), `capability "${c.id}" advertises route "${c.route}" which is not mounted`).toBe(true);
      }
    }
  });

  it('has the keystone device + market routes mounted', () => {
    for (const r of [
      'POST /device/blueprint',
      'GET /regulatory-capabilities',
      'POST /device/udi/validate',
      'POST /device/sterilization',
      'GET /market-specs',
      'GET /device/cer/:reportId/assess-stored',
    ]) {
      expect(routes.has(r), `${r} must be mounted`).toBe(true);
    }
  });
});
