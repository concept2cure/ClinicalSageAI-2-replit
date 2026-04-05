import type { Express } from 'express';
import type { Pool } from 'pg';

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

  // ── Project Hierarchy, Rules, Sentinel, Modules (parallelized) ──
  {
    const projectConfig = [
      {
        path: '/api/project-hierarchy',
        mod: '../routes/project-hierarchy',
        name: 'Project Hierarchy (Pillar 1: 4-level tree)',
      },
      {
        path: '/api/project-rules',
        mod: '../routes/project-rules',
        name: 'Project Rules Engine (Pillar 2: configurable rules)',
      },
      {
        path: '/api/sentinel',
        mod: '../routes/sentinel-routes',
        name: 'AI Sentinel (Pillar 3: proactive monitoring)',
      },
      {
        path: '/api/project-modules',
        mod: '../routes/project-modules',
        name: 'Project Module Integration (Pillar 4)',
      },
    ] as const;
    const projectResults = await Promise.allSettled(projectConfig.map(c => import(c.mod)));
    projectResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(projectConfig[i].path, r.value.default || r.value);
        console.log(`✅ ${projectConfig[i].name} routes mounted`);
      } else {
        console.error(`❌ Failed to mount ${projectConfig[i].name} routes:`, r.reason);
      }
    });
  }

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

  // ── Quality, Analytics, Planner (parallelized) ──
  {
    const qualityConfig = [
      {
        path: '/api/quality',
        mod: '../routes/quality-management-api',
        name: 'Quality Management API',
      },
      { path: '/api/analytics', mod: '../routes/analytics-routes', name: 'Analytics' },
      { path: '/api/planner', mod: '../routes/planner-routes', name: 'Planner' },
    ] as const;
    const qualityResults = await Promise.allSettled(qualityConfig.map(c => import(c.mod)));
    qualityResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(qualityConfig[i].path, r.value.default);
        console.log(`✅ ${qualityConfig[i].name} routes mounted`);
      } else {
        console.error(`❌ Failed to mount ${qualityConfig[i].name} routes:`, r.reason);
      }
    });
  }

  console.log('✅ Project + Quality route family registered');
}
