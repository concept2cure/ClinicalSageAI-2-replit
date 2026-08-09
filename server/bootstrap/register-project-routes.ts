/**
 * Project-tree, quality and analytics routes.
 *
 * The seven routers below were loaded as `config.map(c => import(c.mod))` with a
 * runtime string. esbuild cannot resolve that, so all seven were absent from
 * dist/index.js and 404d in production while `Promise.allSettled` reduced the
 * failure to a console.error. Static now, for the reasons written out at length
 * in register-tenant-routes.ts.
 */

import type { Express } from 'express';
import type { Pool } from 'pg';

import { mountAll } from './mount-routes.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import projectHierarchy from '../routes/project-hierarchy.js';
import projectRules from '../routes/project-rules.js';
import sentinelRoutes from '../routes/sentinel-routes.js';
import projectModules from '../routes/project-modules.js';
import qualityManagementApi from '../routes/quality-management-api.js';
import analyticsRoutes from '../routes/analytics-routes.js';
import plannerRoutes from '../routes/planner-routes.js';

export interface ProjectBootstrapContext {
  app: Express;
  pool: Pool;
}

export async function registerProjectRoutes({ app, pool }: ProjectBootstrapContext) {
  // ── Projects Management ──
  try {
    const projectsRoutes = await import('../routes/projects-management');
    app.use('/api/projects', projectsRoutes.default || projectsRoutes);
  } catch (error) {
    console.error('Failed to mount project routes:', error);
  }

  // ── Project Hierarchy, Rules, Sentinel, Modules ──
  mountAll(app, [
    {
      path: '/api/project-hierarchy',
      router: projectHierarchy,
      name: 'Project Hierarchy (Pillar 1: 4-level tree)',
    },
    {
      path: '/api/project-rules',
      router: projectRules,
      name: 'Project Rules Engine (Pillar 2: configurable rules)',
    },
    {
      path: '/api/sentinel',
      router: sentinelRoutes,
      name: 'AI Sentinel (Pillar 3: proactive monitoring)',
    },
    {
      path: '/api/project-modules',
      router: projectModules,
      name: 'Project Module Integration (Pillar 4)',
    },
  ]);

  // ── Sentinel Background Scheduler (Pillar 3) ──
  try {
    const { getSentinelScheduler } = await import('../services/sentinel/scheduler');
    const scheduler = getSentinelScheduler(pool);
    scheduler
      .start()
      .then(() => {
        console.log('✅ AI Sentinel background scheduler started');
      })
      .catch((err: unknown) => {
        console.error('Failed to start sentinel scheduler:', err);
      });
  } catch (error) {
    console.error('Failed to initialize sentinel scheduler:', error);
  }

  // ── Memory Consolidation Scheduler (E8) ──
  try {
    const { initMemoryConsolidationScheduler } = await import(
      '../services/memory-consolidation-job'
    );
    initMemoryConsolidationScheduler();
    console.log('✅ Memory consolidation scheduler initialized');
  } catch (error) {
    console.error('Failed to initialize memory consolidation scheduler:', error);
  }

  // ── Quality, Analytics, Planner ──
  // Quality's handlers use getDb(req) === requestDb(req), which needs
  // req.dbClient — established only by requireTenantContext. Mounted without it,
  // every quality query threw MissingRequestDbContextError (→ 500) under
  // RLS_ENFORCE=on. Gate it so the request-scoped client (and tenant scope) are
  // present. Analytics/Planner keep their existing mount (separate audit).
  mountAll(app, [
    { path: '/api/quality', router: qualityManagementApi, name: 'Quality Management API' },
  ], requireTenantContext);
  mountAll(app, [
    { path: '/api/analytics', router: analyticsRoutes, name: 'Analytics' },
    { path: '/api/planner', router: plannerRoutes, name: 'Planner' },
  ]);

  console.log('✅ Project + Quality route family registered');
}
