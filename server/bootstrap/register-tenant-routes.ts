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
      { path: '/api/tenants', mod: '../routes/tenants-simple.js', name: 'Tenants' },
      { path: '/api/organizations', mod: '../routes/organizations-routes.js', name: 'Organizations' },
      { path: '/api/clients', mod: '../routes/clients-routes.js', name: 'Clients' },
      { path: '/api/tenant-users', mod: '../routes/tenant-users.js', name: 'Tenant Users' },
    ] as const;
    const tenantCoreResults = await Promise.allSettled(tenantCoreConfig.map(c => import(c.mod)));
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
        mod: '../routes/tenant-section-gating',
        name: 'Tenant Section Gating',
      },
      { path: '/api/tenant-config', mod: '../routes/tenant-config', name: 'Tenant Config' },
      { path: '/api/tenant-stats', mod: '../routes/tenant-stats', name: 'Tenant Stats' },
      {
        path: '/api/tenant-traceability',
        mod: '../routes/tenant-traceability',
        name: 'Tenant Traceability',
      },
      {
        path: '/api/tenant-quality-validation',
        mod: '../routes/tenant-quality-validation',
        name: 'Tenant Quality Validation',
      },
      {
        path: '/api/tenant-ctq-factors',
        mod: '../routes/tenant-ctq-factors',
        name: 'Tenant CTQ Factors',
      },
    ] as const;
    const tenantConfigResults = await Promise.allSettled(
      tenantConfigRoutes.map(c => import(c.mod))
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
