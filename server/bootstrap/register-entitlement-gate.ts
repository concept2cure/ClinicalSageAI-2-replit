/**
 * Module entitlement gate registrar.
 *
 * The gate is a single `app.use(...)`, but it still belongs behind a registrar:
 * `server/startup/routes.ts` is a pure composition root and every mount there
 * delegates to a `register*Routes` function (enforced by
 * tests/routes/route-ownership.test.ts; see docs/audits/ROUTE_OWNERSHIP.md).
 *
 * Its position is load-bearing and is preserved exactly by the call site: it
 * mounts AFTER the family that establishes the global /api auth gate — it needs
 * a resolved organization context — and BEFORE every feature route family, so
 * that it covers all of them. Mounting it per-family instead is precisely how a
 * new family silently ships ungated.
 *
 * Inert unless MODULE_ENFORCEMENT is set: 'report' logs what it WOULD deny and
 * serves the request, 'enforce' denies. Default 'off'.
 *
 * @module server/bootstrap/register-entitlement-gate
 */

import type { Express } from 'express';

import { moduleEntitlementGate } from '../middleware/moduleEntitlementGate';

/** Mount the module entitlement gate across every downstream route family. */
export function registerEntitlementGate({ app }: { app: Express }): void {
  app.use(moduleEntitlementGate());
}
