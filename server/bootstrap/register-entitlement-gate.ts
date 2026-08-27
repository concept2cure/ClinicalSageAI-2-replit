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
 * Off unless a mode is set: 'report' records what it WOULD deny and serves the
 * request, 'enforce' denies. Default 'off'.
 *
 * The mode is no longer read from the deployment's environment alone. It is a
 * governed platform setting a master admin changes from the licensing console,
 * with the environment value as the fallback when nothing is stored — see
 * services/entitlements/enforcement-mode.ts for the precedence and the
 * propagation window. So this gate can become live without a redeploy, and a
 * comment claiming otherwise would send somebody looking in the wrong place.
 *
 * @module server/bootstrap/register-entitlement-gate
 */

import type { Express } from 'express';

import { moduleEntitlementGate } from '../middleware/moduleEntitlementGate';

/** Mount the module entitlement gate across every downstream route family. */
export function registerEntitlementGate({ app }: { app: Express }): void {
  app.use(moduleEntitlementGate());
}
