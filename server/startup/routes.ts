/**
 * Route mounting orchestration.
 *
 * Extracted from server/index.ts. The registration happens in two waves:
 *
 *   registerPreStartRoutes(ctx)  — runs before HTTP listen. Mounts platform
 *                                  routes, bootstrap manifests, and the
 *                                  majority of ad-hoc routers. Must complete
 *                                  before the frontend catchall is installed.
 *
 *   registerPostStartRoutes(ctx) — runs inside startServer() after early
 *                                  services initialize. Mounts the last
 *                                  tenant / project / clinical-intel / advanced
 *                                  platform route families, which currently
 *                                  require services that boot in Phase A.
 *
 * Middleware order and logging are preserved exactly. Each try/catch here
 * mirrors the original behavior so one router failure does not prevent
 * the rest from mounting.
 */

import type { Express, Request, Response } from 'express';
import type { Pool } from 'pg';
import express from 'express';
import fs from 'fs';

import { authMiddleware } from '../auth.js';
import { sanitizeAskAnaInput } from '../routes/ask-ana-utils';
import { mountBetaSafeRoutes } from '../betaRouteManifest';
import {
  isStaticDataEnabled,
  sendStaticDataDisabled,
} from '../middleware/staticDataGuard';
import { csrSearchService } from '../services/csr-search-service';
import { getEndpointRecommenderService } from '../services/endpoint-recommender-service';
import { createCircuitBreakerMiddleware } from '../middleware/circuitBreaker';
import type { CircuitBreakerMiddleware } from '../bootstrap/types';

import deviceProjectsRouter from '../routes/device-projects';
import predictiveSectionsRoutes from '../routes/predictive-sections';
import foresightFeedbackRoutes from '../routes/foresight-feedback';
import { createCsrIntelligenceRoutes } from '../routes/csr-intelligence-routes';
import csrAnalyticsRouter from '../routes/csr-analytics';
import { createAuditTrailRoutes } from '../routes/audit-trail-routes';
import { createAnaRiInlineRoutes } from '../routes/ana-ri-inline-routes';
import regulatorySubmissionsRoutes from '../routes/regulatorySubmissions';
import submissionOpsRoutes from '../routes/submission-ops';
import regulatoryCorrespondenceRoutes from '../routes/regulatory-correspondence';
import { create510kWorkflowRoutes } from '../routes/510k-workflow-routes';
import { createPMAWorkflowRoutes } from '../routes/pma-workflow-routes';
import fdaFormsRoutes from '../routes/fda-forms.routes';
import fieldSyncRoutes from '../routes/fieldSync.routes';
import contentAssemblyRoutes from '../routes/contentAssembly.routes';
import { createMiscInlineRoutes } from '../routes/misc-inline-routes';

import { registerCoreRoutes } from '../bootstrap/register-core-routes';
import { registerConcept2CureRoutes } from '../bootstrap/register-concept2cure-routes';
import { registerAiRoutes } from '../bootstrap/register-ai-routes';
import { registerAdminRoutes } from '../bootstrap/register-admin-routes';
import { registerIntegrationRoutes } from '../bootstrap/register-integrations-routes';
import { registerGovernanceRoutes } from '../bootstrap/register-governance-routes';
import { registerPlatformRoutes } from '../bootstrap/register-platform-routes';
import { registerRegulatoryRoutes } from '../bootstrap/register-regulatory-routes';
import { registerDocumentRoutes } from '../bootstrap/register-document-routes';
import { registerTenantRoutes } from '../bootstrap/register-tenant-routes';
import { registerProjectRoutes } from '../bootstrap/register-project-routes';
import { registerClinicalIntelRoutes } from '../bootstrap/register-clinical-intel-routes';
import { registerAdvancedPlatformRoutes } from '../bootstrap/register-advanced-platform-routes';

export interface RouteRegistrationContext {
  app: Express;
  pool: Pool;
  experimentalRoutesEnabled: boolean;
  demoRoutesEnabled: boolean;
}

/**
 * AI circuit breaker. Created once per process and shared between the
 * core/AI bootstrap manifests that need it.
 */
export function createAiCircuitBreaker(): CircuitBreakerMiddleware {
  return createCircuitBreakerMiddleware('ai-service', {
    failureThreshold: 10,
    resetTimeout: 30_000,
    maxTimeout: 60_000, // AI calls can be slow
  });
}

/**
 * Mounted as the fallback for static-data families that are disabled.
 * Kept identical to the pre-refactor helper, including the warning log.
 */
function buildStaticBusinessDataGuard(app: Express) {
  return function mountStaticBusinessDataGuard(
    path: string,
    routeName: string,
    requiredFlag: string
  ) {
    app.use(path, (_req: Request, res: Response) => {
      return sendStaticDataDisabled(res, routeName, requiredFlag);
    });
    console.warn(
      `⚠️ ${routeName} mounted in fail-closed mode (set ${requiredFlag}=true to re-enable).`
    );
  };
}

/**
 * Pre-HTTP-listen registration. See module docstring for ordering.
 */
export async function registerPreStartRoutes(
  ctx: RouteRegistrationContext,
  aiCircuitBreaker: CircuitBreakerMiddleware
): Promise<void> {
  const { app, pool, experimentalRoutesEnabled, demoRoutesEnabled } = ctx;

  // Platform: /api/auth, /api/v1/auth, /api/users, /api/user, legacy auth redirects,
  // enterprise auth, SSO, health probes, global /api auth gate.
  await registerPlatformRoutes({ app, pool, authMiddleware });

  // Device-Project CRUD (extracted router).
  app.use('/api/device-projects', deviceProjectsRouter);
  console.log('✅ /api/device-projects CRUD routes mounted (extracted router)');

  // Core bootstrap family (templates, AI, CMC, AI assistance, intelligent docs, PM settings, control plane)
  registerCoreRoutes({ app, pool, aiCircuitBreaker });
  // Integrations family (foresight deprecation routes)
  registerIntegrationRoutes(app);

  // AnA Intelligence (10-K harvesting, observation terms) — not yet in a manifest.
  try {
    const anaCortexRoutes = await import('../routes/ana-cortex');
    app.use('/api/ana-cortex', anaCortexRoutes.default);
    app.use('/api/ana-1-0-ri-cortex', anaCortexRoutes.default);
    console.log('✅ AnA Cortex routes mounted (/api/ana-cortex, /api/ana-1-0-ri-cortex)');
  } catch (error) {
    console.error('❌ Failed to mount AnA Intelligence routes:', error);
  }

  // Nano Banana (Gemini image generation) — not yet in a manifest.
  try {
    const nanoBananaRoutes = await import('../routes/nanoBanana');
    app.use('/api/nano-banana', nanoBananaRoutes.default);
    console.log('✅ Nano Banana (Gemini image gen) routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount Nano Banana routes:', error);
  }

  // Predictive sections.
  app.use('/api/predictive-sections', predictiveSectionsRoutes);

  // Foresight AI feedback — deprecated alias, not in a manifest.
  try {
    app.use(
      '/api/foresight-ai/feedback',
      (_req: Request, res: Response, next: () => void) => {
        res.setHeader('Deprecation', 'true');
        res.setHeader('Sunset', '2026-04-01');
        res.setHeader('Link', '<https://docs.concept2cure.ai/api/cortex>; rel="canonical"');
        next();
      },
      (req, _res, next) => {
        req.url = `/feedback${req.url}`;
        next();
      },
      foresightFeedbackRoutes
    );
  } catch (error) {
    console.error('Failed to mount foresight-ai/feedback alias:', error);
  }

  // RAG routes (parallel startup for faster boot).
  {
    const ragResults = await Promise.allSettled([import('../routes/biotech-rag.js')]);
    if (ragResults[0].status === 'fulfilled') {
      app.use('/api/biotech-rag', ragResults[0].value.default);
      console.log('✅ Biotech AI Intelligence RAG API routes mounted');
    } else {
      console.error('❌ Failed to mount Biotech RAG routes:', ragResults[0].reason);
    }
  }

  // Regulatory family (FDA 510k, CERV2, IVDR, Mfg, PV, ClinOps, CER, GRDHE).
  await registerRegulatoryRoutes({ app, pool });

  // Literature / License / Billing / Intelligence / Reports — parallel imports.
  {
    const litIntConfig = [
      { path: '/', mod: '../routes/license-routes.js', name: 'License Management' },
      {
        path: '/api/module-subscriptions',
        mod: '../routes/module-subscriptions.js',
        name: 'Module Subscriptions',
      },
      { path: '/api/billing', mod: '../routes/billing.js', name: 'Billing' },
      { path: '/api/deep-research', mod: '../routes/deep-research.js', name: 'Deep Research' },
      {
        path: '/api/intelligent-reports',
        mod: '../routes/intelligent-reports.js',
        name: 'Intelligent Reports',
      },
      {
        path: '/api/safety-narratives',
        mod: '../routes/safety-narrative.js',
        name: 'Safety Narrative',
      },
      {
        path: '/api/statistical-defensibility',
        mod: '../routes/statistical-defensibility.js',
        name: 'Statistical Defensibility',
      },
      {
        path: '/api/conversation-health',
        mod: '../routes/conversation-health.js',
        name: 'Conversation Health',
      },
      { path: '/api/billing', mod: '../routes/billing-dashboard.js', name: 'Billing Dashboard' },
      { path: '/api/report-os', mod: '../routes/report-os.js', name: 'Report OS' },
    ] as const;
    const litIntResults = await Promise.allSettled(litIntConfig.map(c => import(c.mod)));
    litIntResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        app.use(litIntConfig[i].path, r.value.default);
        console.log(`✅ ${litIntConfig[i].name} routes mounted successfully`);
      } else {
        console.error(`❌ Failed to mount ${litIntConfig[i].name} routes:`, r.reason);
      }
    });
  }

  // Stability routes.
  try {
    const stabilityModule = await import('../src/routes/stability.router.js');
    const stabilityRouter = stabilityModule.default;
    app.use('/api/stability', stabilityRouter);
    console.log('✅ Stability API routes mounted successfully');
  } catch (error) {
    console.error('❌ Failed to mount Stability routes:', error);
  }

  console.log('✅ Enterprise API routes mounted successfully');

  // Document + Knowledge family (eCTD, GCC, Cortex, Evidence, Authoring, Biostat).
  await registerDocumentRoutes({
    app,
    pool,
    isStaticDataEnabled,
    mountStaticBusinessDataGuard: buildStaticBusinessDataGuard(app),
    DEMO_ROUTES_ENABLED: demoRoutesEnabled,
    EXPERIMENTAL_ROUTES_ENABLED: experimentalRoutesEnabled,
  });

  // Static uploads.
  const UPDIR = '/tmp/uploads';
  if (!fs.existsSync(UPDIR)) fs.mkdirSync(UPDIR, { recursive: true });
  app.use('/uploads', express.static(UPDIR));

  // CSR intelligence + analytics routers (extracted from inline).
  app.use('/api', createCsrIntelligenceRoutes(pool, csrSearchService));
  app.use('/api/csr-real-data', csrAnalyticsRouter);

  // Audit trail — append-only, signed exports, chain integrity (21 CFR Part 11).
  app.use('/api', createAuditTrailRoutes(pool));

  // AnA 1.0 RI endpoint + compatibility facades.
  app.use(
    '/api',
    createAnaRiInlineRoutes(pool, {
      csrSearchService,
      getEndpointRecommenderService,
      sanitizeAskAnaInput,
    })
  );
  console.log('✅ AnA 1.0 RI + compatibility facade routes mounted');

  // AI + Concept2Cure + Admin bootstrap manifests.
  await registerAiRoutes({ app, pool, aiCircuitBreaker });
  registerConcept2CureRoutes(app);
  registerAdminRoutes(app);

  // Authoring Router (document workflows, reviews, tracked changes).
  try {
    const authoringRouterModule = await import('../routes/authoring.router');
    app.use('/api/authoring', authoringRouterModule.default);
    console.log('✅ Authoring Router mounted (/api/authoring)');
  } catch (error) {
    console.error('❌ Failed to mount Authoring Router:', error);
  }

  // Authoring Actions (Wave 1 + Wave 2 AnA-first authoring actions).
  try {
    const authoringActionsModule = await import('../routes/authoring-actions');
    app.use('/api/authoring-actions', authoringActionsModule.default);
    console.log('✅ Authoring Actions routes mounted (/api/authoring-actions)');
  } catch (error) {
    console.error('❌ Failed to mount Authoring Actions routes:', error);
  }

  // Ana Platform Control (agentic settings, modules, onboarding).
  try {
    const anaPlatformModule = await import('../routes/ana-platform-control');
    app.use('/api/ana/platform', anaPlatformModule.default);
    console.log('✅ Ana Platform Control routes mounted (/api/ana/platform)');
  } catch (error) {
    console.error('❌ Failed to mount Ana Platform Control routes:', error);
  }

  // AI Actions unified execution API (Phase 1 — conversational OS spine).
  try {
    const aiActions = await import('../services/ai-actions/index');
    console.log('✅ AI Action handlers registered');

    const redisOk = await aiActions.initializeRedis();
    console.log(
      redisOk
        ? '✅ AI Actions Redis connected'
        : '⚠️  AI Actions Redis unavailable (in-memory fallback)'
    );

    const queueOk = await aiActions.initializeActionQueue();
    console.log(
      queueOk
        ? '✅ AI Actions async queue initialized'
        : '⚠️  AI Actions queue unavailable (sync fallback)'
    );

    aiActions.initializeSSEBroadcaster();

    const aiActionsRoutes = (await import('../routes/ai-actions')).default;
    app.use('/api/ai-actions', aiActionsRoutes);
    console.log('✅ AI Actions API routes mounted at /api/ai-actions');
  } catch (error: any) {
    console.error('❌ Failed to mount AI Actions routes:', error.message);
  }

  // Phase 3 Orchestration (workflow orchestration, readiness, recommendations, continuity).
  try {
    await import('../services/orchestration');
    const orchestrationRoutes = (await import('../routes/orchestration')).default;
    app.use('/api/orchestration', orchestrationRoutes);
    console.log('✅ Phase 3 Orchestration API routes mounted at /api/orchestration');
  } catch (error: any) {
    console.error('❌ Failed to mount Orchestration routes:', error.message);
  }

  // Governance + intelligence bundle.
  await registerGovernanceRoutes(app);

  // Regulatory submissions (feature-gated).
  app.use('/api/regulatory-submissions', regulatorySubmissionsRoutes);
  console.log('✅ Regulatory Submissions API routes mounted successfully (feature-gated)');

  // Submission Ops + Regulatory Correspondence.
  app.use('/api/submission-ops', submissionOpsRoutes);
  app.use('/api/regulatory-correspondence', regulatoryCorrespondenceRoutes);
  console.log('✅ Submission Ops API routes mounted successfully');
  console.log('✅ Regulatory Correspondence API routes mounted successfully');

  // 510k + PMA workflow routes.
  app.use('/api/510k-workflow', create510kWorkflowRoutes(pool));
  console.log('✅ 510k-workflow API routes mounted successfully');
  app.use('/api/pma-workflow', createPMAWorkflowRoutes(pool));
  console.log('✅ PMA-workflow API routes mounted successfully');

  // Beta-safe routes (510(k) + tester telemetry).
  mountBetaSafeRoutes(app);
  console.log('✅ Beta-safe routes mounted successfully');

  // FDA forms, field sync, content assembly.
  app.use('/api/fda-forms', fdaFormsRoutes);
  console.log('✅ FDA forms API routes mounted successfully');
  app.use('/api/field-sync', fieldSyncRoutes);
  console.log('✅ Field Synchronization API routes mounted successfully');
  app.use('/api/content-assembly', contentAssemblyRoutes);
  console.log('✅ Dynamic Content Assembly API routes mounted successfully');

  // Misc inline handlers (templates, vault, AnA RI API, advisor, eCTD templates, drafting).
  app.use('/api', createMiscInlineRoutes(pool, authMiddleware));
}

/**
 * Post-init registration. Runs inside startServer() after the early services
 * have initialized. These families were historically registered here so they
 * could depend on Redis / AI Actions / Proof System being ready.
 */
export async function registerPostStartRoutes(ctx: RouteRegistrationContext): Promise<void> {
  const { app, pool } = ctx;

  await registerTenantRoutes({ app, pool });
  await registerProjectRoutes({ app, pool });
  await registerClinicalIntelRoutes({ app, pool });
  await registerAdvancedPlatformRoutes({
    app,
    pool,
    isStaticDataEnabled,
    mountStaticBusinessDataGuard: buildStaticBusinessDataGuard(app),
  });
}
