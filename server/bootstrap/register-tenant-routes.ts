/**
 * Tenant, organization and client routes.
 *
 * ── Why these are static imports ──────────────────────────────────────────────
 * Every one of the twelve below was previously loaded as
 *
 *     tenantCoreConfig.map(c => import(c.mod))     // c.mod is a runtime string
 *
 * esbuild cannot resolve a dynamic import whose specifier is a variable, so it
 * bundled none of them. Confirmed from esbuild's own metafile: 12/12 absent from
 * dist/index.js. At runtime '../routes/tenants-simple.js' then resolved relative
 * to dist/, found nothing, and rejected — and `Promise.allSettled` turned that
 * into a console.error while the server carried on starting.
 *
 * So production came up healthy with the ENTIRE multi-tenant administration
 * layer unmounted: no /api/tenants, no /api/organizations, no /api/clients, no
 * /api/tenant-users, no /api/tenant-config. Every request to them 404s. For a
 * platform sold per-tenant that is not a missing feature, it is the product.
 *
 * The same defect was found and fixed in register-inline-routes.ts; this is one
 * of five further files carrying it, 97 route families in total. See
 * server/bootstrap/__tests__/routes-reach-the-bundle.test.ts, which now guards
 * every bootstrap file rather than the one where it was first noticed.
 */

import type { Express } from 'express';
import type { Pool } from 'pg';

import { mountAll } from './mount-routes.js';
import tenantsSimple from '../routes/tenants-simple.js';
import organizationsRoutes from '../routes/organizations-routes.js';
import clientsRoutes from '../routes/clients-routes.js';
import clientPortal from '../routes/client-portal.js';
import onboardingProposals from '../routes/onboarding-proposals.js';
import tenantUsers from '../routes/tenant-users.js';
import tenantSectionGating from '../routes/tenant-section-gating.js';
import tenantConfig from '../routes/tenant-config.js';
import tenantStats from '../routes/tenant-stats.js';
import tenantTraceability from '../routes/tenant-traceability.js';
import tenantQualityValidation from '../routes/tenant-quality-validation.js';
import tenantCtqFactors from '../routes/tenant-ctq-factors.js';

export interface TenantBootstrapContext {
  app: Express;
  pool: Pool;
}

export async function registerTenantRoutes({ app, pool: _pool }: TenantBootstrapContext) {
  // ── Tenants, Organizations, Clients ──
  mountAll(app, [
    { path: '/api/tenants', router: tenantsSimple, name: 'Tenants' },
    { path: '/api/organizations', router: organizationsRoutes, name: 'Organizations' },
    { path: '/api/clients', router: clientsRoutes, name: 'Clients' },
    { path: '/api/client-portal', router: clientPortal, name: 'Client Portal' },
    // AnA onboarding proposal ingest — read-only, writes nothing (P2).
    { path: '/api/onboarding', router: onboardingProposals, name: 'Onboarding Proposals' },
    { path: '/api/tenant-users', router: tenantUsers, name: 'Tenant Users' },
  ]);

  // ── Tenant Configuration & Gating ──
  mountAll(app, [
    { path: '/api/tenant-section-gating', router: tenantSectionGating, name: 'Tenant Section Gating' },
    { path: '/api/tenant-config', router: tenantConfig, name: 'Tenant Config' },
    { path: '/api/tenant-stats', router: tenantStats, name: 'Tenant Stats' },
    { path: '/api/tenant-traceability', router: tenantTraceability, name: 'Tenant Traceability' },
    { path: '/api/tenant-quality-validation', router: tenantQualityValidation, name: 'Tenant Quality Validation' },
    { path: '/api/tenant-ctq-factors', router: tenantCtqFactors, name: 'Tenant CTQ Factors' },
  ]);

  console.info('✅ Tenant route family registered');
}
