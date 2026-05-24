/**
 * Inline-route bootstrap slots.
 *
 * Phase 6 of the architecture consolidation. Absorbs the ad-hoc
 * `app.use(...)` blocks that used to live inline inside
 * `server/startup/routes.ts`. Each exported `register*` function
 * slots into the pre-HTTP-listen sequence at the exact position it
 * occupied before the refactor, so startup ordering is preserved
 * byte-for-byte.
 *
 * Future phases can further subdivide these slot families (e.g. split
 * commerce routes out of the lit/commerce slot into their own bootstrap
 * module) without touching the composition root in `startup/routes.ts`.
 *
 * @module server/bootstrap/register-inline-routes
 */

import type { Express, Request, Response } from 'express';
import type { Pool } from 'pg';
import express from 'express';
import fs from 'fs';

import { authMiddleware } from '../auth.js';
import { sanitizeAskAnaInput } from '../routes/ask-ana-utils';
import { mountBetaSafeRoutes } from '../betaRouteManifest';
import { csrSearchService } from '../services/csr-search-service';
import { getEndpointRecommenderService } from '../services/endpoint-recommender-service';

import deviceProjectsRouter from '../routes/device-projects';
import predictiveSectionsRoutes from '../routes/predictive-sections';
import foresightFeedbackRoutes from '../routes/foresight-feedback';
import { createCsrIntelligenceRoutes } from '../routes/csr-intelligence-routes';
import csrAnalyticsRouter from '../routes/csr-analytics';
import { createAuditTrailRoutes } from '../routes/audit-trail-routes';
import { createAnaRiInlineRoutes } from '../routes/ana-ri-inline-routes';
import evidenceAskRouter from '../routes/evidence-ask';
import esignatureRouter from '../routes/esignature';
import dossierReadinessRouter from '../routes/dossier-readiness';
import regulatorySubmissionsRoutes from '../routes/regulatorySubmissions';
import submissionOpsRoutes from '../routes/submission-ops';
import regulatoryProgramsRoutes from '../routes/regulatory-programs';
import savedPrecedentQueriesRoutes from '../routes/saved-precedent-queries';
import mdxRoutes from '../routes/mdx';
import mdxAnaDraftsRoutes from '../routes/mdx-ana-drafts';
import mdxVaultRoutes from '../routes/mdx-vault';
import mdxEngineeringRoutes from '../routes/mdx-engineering';
import mdxUdiRoutes from '../routes/mdx-udi';
import mdxRiskRoutes from '../routes/mdx-risk-management';
import mdxSoftwareRoutes from '../routes/mdx-software';
import mdxIvdPerformanceRoutes from '../routes/mdx-ivd-performance';
import mdxIvdrRoutes from '../routes/mdx-ivdr';
import mdxCliaRoutes from '../routes/mdx-clia';
import mdxCdxRoutes from '../routes/mdx-cdx';
import mdxLdtRoutes from '../routes/mdx-ldt';
import mdxSubmissionGatewayRoutes from '../routes/mdx-submission-gateway';
import mdxNotificationsRoutes from '../routes/mdx-notifications';
import mdxAuditRoutes from '../routes/mdx-audit';
import mdxAdminRoutes from '../routes/mdx-admin';
import mdxClinicalStudiesRoutes from '../routes/mdx-clinical-studies';
import mdxAnaMemoryRoutes from '../routes/mdx-ana-memory';
import mdxQmsRoutes from '../routes/mdx-qms';
import mdxLabelingRoutes from '../routes/mdx-labeling';
import mdxSearchRoutes from '../routes/mdx-search';
import mdxAnalyticsRoutes from '../routes/mdx-analytics';
import mdxImportsRoutes from '../routes/mdx-imports';
import regulatoryCorrespondenceRoutes from '../routes/regulatory-correspondence';
import { create510kWorkflowRoutes } from '../routes/510k-workflow-routes';
import { createPMAWorkflowRoutes } from '../routes/pma-workflow-routes';
import fdaFormsRoutes from '../routes/fda-forms.routes';
import fieldSyncRoutes from '../routes/fieldSync.routes';
import contentAssemblyRoutes from '../routes/contentAssembly.routes';
import { createMiscInlineRoutes } from '../routes/misc-inline-routes';

export interface InlineRouteContext {
  app: Express;
  pool: Pool;
}

/**
 * Slot 1 — between registerPlatformRoutes and registerCoreRoutes.
 * Device-Project CRUD.
 */
export function registerInlineEarlyRoutes({ app }: InlineRouteContext): void {
  app.use('/api/device-projects', deviceProjectsRouter);
  console.log('✅ /api/device-projects CRUD routes mounted (extracted router)');
}

/**
 * Slot 2 — between registerIntegrationRoutes and registerRegulatoryRoutes.
 * AnA Cortex + Nano Banana + Predictive Sections + Foresight deprecation alias + Biotech RAG.
 */
export async function registerInlineAnaIntelligenceRoutes({
  app,
}: InlineRouteContext): Promise<void> {
  // AnA Intelligence (10-K harvesting, observation terms).
  try {
    const anaCortexRoutes = await import('../routes/ana-cortex');
    app.use('/api/ana-cortex', anaCortexRoutes.default);
    app.use('/api/ana-1-0-ri-cortex', anaCortexRoutes.default);
    console.log('✅ AnA Cortex routes mounted (/api/ana-cortex, /api/ana-1-0-ri-cortex)');
  } catch (error) {
    console.error('❌ Failed to mount AnA Intelligence routes:', error);
  }

  // Nano Banana (Gemini image generation).
  try {
    const nanoBananaRoutes = await import('../routes/nanoBanana');
    app.use('/api/nano-banana', nanoBananaRoutes.default);
    console.log('✅ Nano Banana (Gemini image gen) routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount Nano Banana routes:', error);
  }

  // Predictive sections.
  app.use('/api/predictive-sections', predictiveSectionsRoutes);

  // Foresight AI feedback — deprecated alias.
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
}

/**
 * Slot 3 — between registerRegulatoryRoutes and registerDocumentRoutes.
 * Literature / License / Billing / Intelligence / Reports + Stability.
 */
export async function registerInlineLitCommerceRoutes({
  app,
}: InlineRouteContext): Promise<void> {
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
}

/**
 * Slot 4 — between registerDocumentRoutes and registerAiRoutes.
 * Static uploads + CSR intelligence/analytics + audit trail + AnA RI inline facades.
 */
export function registerInlinePlatformFacadesRoutes({
  app,
  pool,
}: InlineRouteContext): void {
  // Static uploads.
  const UPDIR = '/tmp/uploads';
  if (!fs.existsSync(UPDIR)) fs.mkdirSync(UPDIR, { recursive: true });
  app.use('/uploads', express.static(UPDIR));

  // CSR intelligence + analytics routers (extracted from inline).
  app.use('/api', createCsrIntelligenceRoutes(pool, csrSearchService));
  app.use('/api/csr-real-data', csrAnalyticsRouter);

  // Audit trail — append-only, signed exports, chain integrity (21 CFR Part 11).
  app.use('/api', createAuditTrailRoutes(pool));

  // Evidence Ask — single-shot grounded Q&A over the Data Room
  // (Doc System Convergence Phase 4 — Ask-Data-Room flow).
  app.use('/api/evidence', evidenceAskRouter);
  console.log('✅ Evidence Ask routes mounted (/api/evidence/ask)');

  // Electronic-signature backend (21 CFR Part 11 — verify-password,
  // verify-mfa, sign). The portal-v2 ElectronicSignature UI calls these.
  app.use('/api/esignature', esignatureRouter);
  console.log('✅ E-signature routes mounted (/api/esignature)');

  // Dossier section readiness derived from live concept2cure_artifacts
  // (Doc System Convergence Phase 5 — replaces hardcoded section status).
  app.use('/api/dossier-readiness', dossierReadinessRouter);
  console.log('✅ Dossier readiness routes mounted (/api/dossier-readiness)');

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
}

/**
 * Slot 5 — between registerAdminRoutes and registerGovernanceRoutes.
 * Authoring Router + Authoring Actions + AnA Platform Control + AI Actions (+ Redis / queue init)
 * + Phase 3 Orchestration.
 */
export async function registerInlineAiWorkflowRoutes({
  app,
}: InlineRouteContext): Promise<void> {
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
}

/**
 * Slot 6 — after registerGovernanceRoutes. Closes the pre-start sequence.
 * Regulatory Submissions + Submission Ops + Regulatory Correspondence
 * + 510k/PMA workflows + beta-safe + FDA forms + field sync + content assembly
 * + misc inline handlers.
 */
export function registerInlineSubmissionWorkflowRoutes({
  app,
  pool,
}: InlineRouteContext): void {
  // Regulatory submissions (feature-gated).
  app.use('/api/regulatory-submissions', regulatorySubmissionsRoutes);
  console.log('✅ Regulatory Submissions API routes mounted successfully (feature-gated)');

  // Submission Ops + Regulatory Correspondence + Regulatory Programs +
  // Saved Precedent Queries + MDX module health.
  app.use('/api/submission-ops', submissionOpsRoutes);
  app.use('/api/regulatory-programs', regulatoryProgramsRoutes);
  app.use('/api/saved-precedent-queries', savedPrecedentQueriesRoutes);
  app.use('/api/mdx', mdxRoutes);
  /* MDX beta-surface routers — each one backs a kit surface. Stacking
     multiple routers at the same /api/mdx prefix keeps the kit's URL
     space coherent without consolidating into a single mega-router.
     Each module owns its own audit + tenant-scope. */
  app.use('/api/mdx', mdxAnaDraftsRoutes);
  app.use('/api/mdx', mdxVaultRoutes);
  app.use('/api/mdx', mdxEngineeringRoutes);
  app.use('/api/mdx', mdxUdiRoutes);
  app.use('/api/mdx', mdxRiskRoutes);
  app.use('/api/mdx', mdxSoftwareRoutes);
  /* IVD + diagnostic surfaces (migration 20260508). */
  app.use('/api/mdx', mdxIvdPerformanceRoutes);
  app.use('/api/mdx', mdxIvdrRoutes);
  app.use('/api/mdx', mdxCliaRoutes);
  app.use('/api/mdx', mdxCdxRoutes);
  app.use('/api/mdx', mdxLdtRoutes);
  /* Multi-region submission gateway (migration 20260509). */
  app.use('/api/mdx', mdxSubmissionGatewayRoutes);
  /* Notifications + clinical studies + AnA memory (migration 20260510). */
  app.use('/api/mdx', mdxNotificationsRoutes);
  app.use('/api/mdx', mdxAuditRoutes);
  app.use('/api/mdx', mdxAdminRoutes);
  app.use('/api/mdx', mdxClinicalStudiesRoutes);
  app.use('/api/mdx', mdxAnaMemoryRoutes);
  /* QMS + Labeling + Global search + Analytics (migration 20260511). */
  app.use('/api/mdx', mdxQmsRoutes);
  app.use('/api/mdx', mdxLabelingRoutes);
  app.use('/api/mdx', mdxSearchRoutes);
  app.use('/api/mdx', mdxAnalyticsRoutes);
  /* Legacy archive importer (migration 20260512). */
  app.use('/api/mdx', mdxImportsRoutes);
  app.use('/api/regulatory-correspondence', regulatoryCorrespondenceRoutes);
  console.log('✅ Submission Ops API routes mounted successfully');
  console.log('✅ Regulatory Programs API routes mounted successfully');
  console.log('✅ Saved Precedent Queries API routes mounted successfully');
  console.log('✅ MDX module health endpoint mounted successfully');
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
