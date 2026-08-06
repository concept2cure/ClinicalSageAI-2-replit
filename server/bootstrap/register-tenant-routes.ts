import type { Express } from 'express';
import type { Pool } from 'pg';

export interface TenantBootstrapContext {
  app: Express;
  pool: Pool;
}

export async function registerTenantRoutes({ app, pool }: TenantBootstrapContext) {
  // ── Tenants, Organizations, Clients (parallelized) ──
  {
    const tenantCoreConfig = [
      { path: '/api/tenants', load: () => import('../routes/tenants-simple.js'), name: 'Tenants' },
      { path: '/api/organizations', load: () => import('../routes/organizations-routes.js'), name: 'Organizations' },
      { path: '/api/clients', load: () => import('../routes/clients-routes.js'), name: 'Clients' },
      { path: '/api/client-portal', load: () => import('../routes/client-portal.js'), name: 'Client Portal' },
      // AnA onboarding proposal ingest — read-only, writes nothing (P2).
      { path: '/api/onboarding', load: () => import('../routes/onboarding-proposals.js'), name: 'Onboarding Proposals' },
      { path: '/api/tenant-users', load: () => import('../routes/tenant-users.js'), name: 'Tenant Users' },
    ] as const;
    const tenantCoreResults = await Promise.allSettled(tenantCoreConfig.map(c => c.load()));
    tenantCoreResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(tenantCoreConfig[i].path, r.value.default);
        console.log(`✅ ${tenantCoreConfig[i].name} routes mounted successfully`);
      } else {
        console.error(`❌ Failed to mount ${tenantCoreConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // ── Tenant Configuration & Gating (parallelized) ──
  {
    const tenantConfigRoutes = [
      {
        path: '/api/tenant-section-gating',
        load: () => import('../routes/tenant-section-gating'),
        name: 'Tenant Section Gating',
      },
      { path: '/api/tenant-config', load: () => import('../routes/tenant-config'), name: 'Tenant Config' },
      { path: '/api/tenant-stats', load: () => import('../routes/tenant-stats'), name: 'Tenant Stats' },
      {
        path: '/api/tenant-traceability',
        load: () => import('../routes/tenant-traceability'),
        name: 'Tenant Traceability',
      },
      {
        path: '/api/tenant-quality-validation',
        load: () => import('../routes/tenant-quality-validation'),
        name: 'Tenant Quality Validation',
      },
      {
        path: '/api/tenant-ctq-factors',
        load: () => import('../routes/tenant-ctq-factors'),
        name: 'Tenant CTQ Factors',
      },
    ] as const;
    const tenantConfigResults = await Promise.allSettled(
      tenantConfigRoutes.map(c => c.load())
    );
    tenantConfigResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(tenantConfigRoutes[i].path, r.value.default);
        console.log(`✅ ${tenantConfigRoutes[i].name} routes mounted`);
      } else {
        console.error(`❌ Failed to mount ${tenantConfigRoutes[i].name} routes:`, r.reason);
      }
    });
  }

  console.log('✅ Tenant route family registered');
}
