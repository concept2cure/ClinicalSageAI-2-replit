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

import express, { type Express, type Request, type Response } from 'express';
import type { Pool } from 'pg';

import { authMiddleware } from '../auth.js';
import { requireTenantContext } from '../middleware/tenantContext.js';
import { authoringObjectAuthorization } from '../middleware/authoringObjectAuthorization';
import authoringPermissionsRouter from '../routes/authoring-permissions';
import { sanitizeAskAnaInput } from '../routes/ask-ana-utils';
import { mountBetaSafeRoutes } from '../betaRouteManifest';
import { csrSearchService } from '../services/csr-search-service';
import { getEndpointRecommenderService } from '../services/endpoint-recommender-service';

import deviceProjectsRouter from '../routes/device-projects';
import predictiveSectionsRoutes from '../routes/predictive-sections';
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
import registrationsStandardsRoutes from '../routes/registrations-standards';
import validationKitRoutes from '../routes/validation-kit';
import savedPrecedentQueriesRoutes from '../routes/saved-precedent-queries';
import mdxRoutes from '../routes/mdx';
import mdxAnaDraftsRoutes from '../routes/mdx-ana-drafts';
import mdxVaultRoutes from '../routes/mdx-vault';
import mdxEngineeringRoutes from '../routes/mdx-engineering';
import mdxUdiRoutes from '../routes/mdx-udi';
import mdxRiskRoutes from '../routes/mdx-risk-management';
import mdxRbmRoutes from '../routes/mdx-rbm';
import mdxRbmDataRoutes from '../routes/mdx-rbm-data';
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
import mdxTemplatesRoutes from '../routes/mdx-templates';
import mdxPostmarketRoutes from '../routes/mdx-postmarket';
import mdxClinicalStudiesRoutes from '../routes/mdx-clinical-studies';
import mdxIndustryContextRoutes from '../routes/mdx-industry-context';
import mdxStudyArchetypesRoutes from '../routes/mdx-study-archetypes';
import mdxWorkPackagesRoutes from '../routes/mdx-work-packages';
import mdxClientReviewRoutes from '../routes/mdx-client-review';
import mdxAnaMemoryRoutes from '../routes/mdx-ana-memory';
import mdxQmsRoutes from '../routes/mdx-qms';
import mdxLabelingRoutes from '../routes/mdx-labeling';
import mdxSearchRoutes from '../routes/mdx-search';
import mdxAnalyticsRoutes from '../routes/mdx-analytics';
import mdxImportsRoutes from '../routes/mdx-imports';
import regulatoryCorrespondenceRoutes from '../routes/regulatory-correspondence';
import { createPMAWorkflowRoutes } from '../routes/pma-workflow-routes';
import fdaFormsRoutes from '../routes/fda-forms.routes';
import fieldSyncRoutes from '../routes/fieldSync.routes';
import contentAssemblyRoutes from '../routes/contentAssembly.routes';
import { createMiscInlineRoutes } from '../routes/misc-inline-routes';
import moduleSubscriptions from '../routes/module-subscriptions.js';
import moduleAccessRequests from '../routes/module-access-requests.js';
import licensing from '../routes/licensing.js';
import billing from '../routes/billing.js';
import deepResearch from '../routes/deep-research.js';
import intelligentReports from '../routes/intelligent-reports.js';
import safetyNarrative from '../routes/safety-narrative.js';
import statisticalDefensibility from '../routes/statistical-defensibility.js';
import conversationHealth from '../routes/conversation-health.js';
import billingDashboard from '../routes/billing-dashboard.js';
import reportOs from '../routes/report-os.js';
import deviceCockpit from '../routes/device-cockpit.js';
import globalMarkets from '../routes/global-markets.js';
import workspaceConfig from '../routes/workspace-config.routes.js';
import reportOsInsights from '../routes/report-os-insights.js';
import indChecklistRoutes from '../routes/ind-checklist.routes.js';
import programJourneyRoutes from '../routes/program-journey.routes.js';
import marketAccessRoutes from '../routes/market-access.routes.js';
import shadowReviewRoutes from '../routes/shadow-review.routes.js';
import labelingPiRoutes from '../routes/labeling-pi.routes.js';
import protocolDevRoutes from '../routes/protocol-dev.routes.js';
import researchAdminRoutes from '../routes/research-admin.routes.js';
import investigatorBrochureRoutes from '../routes/investigator-brochure.routes.js';
import nonclinicalSummaryRoutes from '../routes/nonclinical-summary.routes.js';
import maaModule1Routes from '../routes/maa-module1.routes.js';
import labelingSmpcRoutes from '../routes/labeling-smpc.routes.js';
import cmcChangesRoutes from '../routes/cmc-changes.routes.js';

import { mountAll } from './mount-routes.js';


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

  // Foresight AI feedback alias retired in Phase 8 (past 2026-04-01 Sunset; the
  // Foresight path surfaced fabricated dose confidence intervals). No longer mounted.

}

/**
 * Slot 3 — between registerRegulatoryRoutes and registerDocumentRoutes.
 * Literature / License / Billing / Intelligence / Reports + Stability.
 */
export async function registerInlineLitCommerceRoutes({
  app,
}: InlineRouteContext): Promise<void> {
  /*
   * Static imports, deliberately — and this is not a style preference.
   *
   * These fifteen were loaded as `litIntConfig.map(c => import(c.mod))`, a
   * dynamic import with a VARIABLE specifier. esbuild cannot resolve that at
   * build time, so it bundled none of them: `node scripts/build-server.mjs`
   * followed by esbuild's own metafile reports 15/15 absent from dist/index.js.
   * At runtime the specifier '../routes/billing.js' then resolves relative to
   * dist/, where nothing exists, and the import rejects.
   *
   * `Promise.allSettled` swallowed that into a console.error and the server
   * started normally — so `npm run start` came up healthy with the entire
   * commercial layer (licensing, module subscriptions, billing, billing
   * dashboard) and a large part of the product (report-os, deep research,
   * intelligent reports, device cockpit, global markets, safety narratives)
   * simply not mounted. Every request to them 404s.
   *
   * The literal-specifier dynamic imports elsewhere in this file are fine:
   * esbuild resolves those statically. Only the variable form is invisible to
   * it, which is exactly why this failed silently for so long — the code reads
   * identically to the working cases three functions away.
   */
  const litIntRoutes: ReadonlyArray<{ path: string; router: unknown; name: string }> = [
    { path: '/api/module-subscriptions', router: moduleSubscriptions, name: 'Module Subscriptions' },
    // Sits beside module-subscriptions deliberately: it is how a member who
    // cannot buy asks for a locked module, so it must stay reachable to an
    // organization that is locked out of everything else.
    {
      path: '/api/module-access-requests',
      router: moduleAccessRequests,
      name: 'Module Access Requests',
    },
    { path: '/api/licensing', router: licensing, name: 'Intelligent Licensing & EULA' },
    { path: '/api/billing', router: billing, name: 'Billing' },
    { path: '/api/deep-research', router: deepResearch, name: 'Deep Research' },
    { path: '/api/intelligent-reports', router: intelligentReports, name: 'Intelligent Reports' },
    { path: '/api/safety-narratives', router: safetyNarrative, name: 'Safety Narrative' },
    {
      path: '/api/statistical-defensibility',
      router: statisticalDefensibility,
      name: 'Statistical Defensibility',
    },
    { path: '/api/conversation-health', router: conversationHealth, name: 'Conversation Health' },
    { path: '/api/billing', router: billingDashboard, name: 'Billing Dashboard' },
    { path: '/api/report-os', router: reportOs, name: 'Report OS' },
    { path: '/api/device-cockpit', router: deviceCockpit, name: 'Device Cockpit' },
    { path: '/api/global-markets', router: globalMarkets, name: 'Global Markets' },
    { path: '/api/workspace', router: workspaceConfig, name: 'Workspace Config' },
    { path: '/api/insights', router: reportOsInsights, name: 'Insights' },
  ];

  for (const entry of litIntRoutes) {
    if (!entry.router) {
      // A module that resolved but exported no default is the same outcome as
      // one that never loaded, and used to be reported the same way. Keep it
      // loud rather than mounting `undefined`.
      console.error(`❌ ${entry.name} has no default export — not mounted`);
      continue;
    }
    app.use(entry.path, entry.router as never);
    console.info(`✅ ${entry.name} routes mounted successfully`);
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
}

/**
 * Slot 4 — between registerDocumentRoutes and registerAiRoutes.
 * Static uploads + CSR intelligence/analytics + audit trail + AnA RI inline facades.
 */
export function registerInlinePlatformFacadesRoutes({
  app,
  pool,
}: InlineRouteContext): void {
  // NOTE: The previous unauthenticated `/uploads` static mount over
  // `/tmp/uploads` was removed (security B-5). Real uploads are written to
  // `process.cwd()/uploads/...` and served through authenticated `/api`
  // routes; the `/tmp/uploads` directory was never written to and the mount
  // sat outside the `/api` auth gate, exposing an unauthenticated file root.

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
  // Authoring object security — mounted at the `/api` gateway immediately ahead
  // of the legacy `/api/authoring` router (below). The permission-management
  // router terminates owner/admin-controlled permission requests; the mandatory,
  // fail-closed object-authorization middleware then guards every other
  // document/section mutation. The middleware ignores non-authoring paths, so no
  // second `/api/authoring` mount is introduced and the route-mount contract
  // holds. Boot-time readiness of this surface is asserted in startup/routes.ts
  // before this slot runs. Mounted WITHOUT a swallowing try/catch on purpose: if
  // the authorization surface cannot load, startup must fail closed rather than
  // mount the authoring router unguarded.
  app.use('/api', authoringPermissionsRouter);
  app.use('/api', authoringObjectAuthorization);
  console.log('✅ Authoring object-authorization + permission routes mounted (/api)');

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

  // Data Origins — "where did this text come from" for a selected range,
  // backing the select → right-click → Data Origins interaction.
  try {
    const dataOriginsModule = await import('../routes/data-origins.routes');
    app.use('/api/data-origins', dataOriginsModule.default);
  } catch (error) {
    console.error('❌ Failed to mount Data Origins routes:', error);
  }

  // C2C universal mutation primitives (Mutation Primitives brief — Day 2).
  // Mounts all six governed-action endpoints + six reverse counterparts.
  try {
    const c2cActionsModule = await import('../routes/c2c/actions');
    app.use('/api/c2c/actions', authMiddleware, c2cActionsModule.default);
    console.info('✅ C2C Actions routes mounted (/api/c2c/actions)');
  } catch (error) {
    console.error('❌ Failed to mount C2C Actions routes:', error);
  }

  // C2C governance projections — the permission-atom engine surfaced as
  // who-can / can reads ("permission is the source of truth, derived").
  try {
    const c2cGovernanceModule = await import('../routes/c2c/governance');
    app.use('/api/c2c/governance', authMiddleware, c2cGovernanceModule.default);
    console.info('✅ C2C Governance routes mounted (/api/c2c/governance)');
  } catch (error) {
    console.error('❌ Failed to mount C2C Governance routes:', error);
  }

  // C2C regulatory commitments (source-anchored inbound + outbound obligations).
  try {
    const c2cCommitmentsModule = await import('../routes/c2c/commitments');
    app.use('/api/c2c/commitments', authMiddleware, c2cCommitmentsModule.default);
    console.info('✅ C2C Commitments routes mounted (/api/c2c/commitments)');
  } catch (error) {
    console.error('❌ Failed to mount C2C Commitments routes:', error);
  }

  // Study-design spine (validate / simulate / persist onto the CDISC PRM tables).
  try {
    const studyDesignModule = await import('../routes/study-design');
    app.use('/api/study-design', authMiddleware, studyDesignModule.default);
    console.info('✅ Study Design routes mounted (/api/study-design)');
  } catch (error) {
    console.error('❌ Failed to mount Study Design routes:', error);
  }

  // Financial disclosures — 21 CFR 54 (FCOI, Forms FDA 3454/3455 → Module 1).
  try {
    const fcoiModule = await import('../routes/financial-disclosures');
    app.use('/api/financial-disclosures', authMiddleware, fcoiModule.default);
    console.info('✅ Financial Disclosure routes mounted (/api/financial-disclosures)');
  } catch (error) {
    console.error('❌ Failed to mount Financial Disclosure routes:', error);
  }

  // HA interaction & commitment management (Pre-IND/EOP2/pre-NDA; PMR/PMC/REMS).
  try {
    const haModule = await import('../routes/ha-interactions');
    app.use('/api/ha-interactions', authMiddleware, haModule.default);
    console.info('✅ HA Interaction routes mounted (/api/ha-interactions)');
  } catch (error) {
    console.error('❌ Failed to mount HA Interaction routes:', error);
  }

  // IACUC / animal study governance (PHS Policy / AWA / OLAW; → Module 4).
  try {
    const iacucModule = await import('../routes/iacuc');
    app.use('/api/iacuc', authMiddleware, iacucModule.default);
    console.info('✅ IACUC routes mounted (/api/iacuc)');
  } catch (error) {
    console.error('❌ Failed to mount IACUC routes:', error);
  }

  // IRB / IEC submission & amendment management (Common Rule / 21 CFR 56; → Module 5).
  try {
    const irbModule = await import('../routes/irb');
    app.use('/api/irb', authMiddleware, irbModule.default);
    console.info('✅ IRB routes mounted (/api/irb)');
  } catch (error) {
    console.error('❌ Failed to mount IRB routes:', error);
  }

  // IBC / biosafety (NIH Guidelines / BMBL; CGT/mRNA clearance → IND enabling).
  try {
    const ibcModule = await import('../routes/ibc');
    app.use('/api/ibc', authMiddleware, ibcModule.default);
    console.info('✅ IBC routes mounted (/api/ibc)');
  } catch (error) {
    console.error('❌ Failed to mount IBC routes:', error);
  }

  // Nonclinical study management + SEND (ICH M4/S-series; CDISC SEND → Module 4).
  try {
    const nonclinicalModule = await import('../routes/nonclinical');
    app.use('/api/nonclinical', authMiddleware, nonclinicalModule.default);
    console.info('✅ Nonclinical/SEND routes mounted (/api/nonclinical)');
  } catch (error) {
    console.error('❌ Failed to mount Nonclinical routes:', error);
  }

  // Change assessment (510(k)-change / MDR significant-change determinations) —
  // org-scoped contract endpoint for the change-assessment surface.
  try {
    const changeAssessmentModule = await import('../routes/change-assessment.routes');
    app.use('/api/change-assessment', authMiddleware, changeAssessmentModule.default);
    console.info('✅ Change-assessment route mounted (/api/change-assessment)');
  } catch (error) {
    console.error('❌ Failed to mount change-assessment route:', error);
  }

  // Enablement / training catalog — org-scoped contract endpoint for the
  // training surface (registry apiPrefix /api/enablement).
  try {
    const enablementModule = await import('../routes/enablement');
    app.use('/api/enablement', authMiddleware, enablementModule.default);
    console.info('✅ Enablement route mounted (/api/enablement)');
  } catch (error) {
    console.error('❌ Failed to mount enablement route:', error);
  }

  // Translation platform — regulated localization workflow (projects/segments:
  // machine draft → human post-edit → back-translation → approve) + tenant
  // DNT/preferred-term glossary. Consumed by the translation surfaces via
  // client/src/concept2cure/translation/services/translationService.ts.
  try {
    const translationModule = await import('../routes/translation.routes');
    app.use('/api/translation', authMiddleware, translationModule.default);
    console.info('✅ Translation routes mounted (/api/translation)');
  } catch (error) {
    console.error('❌ Failed to mount Translation routes:', error);
  }

  // CDISC validation — deterministic SDTM domain conformance (SDTM-IG v3.4).
  try {
    const cdiscValidationModule = await import('../routes/cdisc-validation.routes');
    app.use('/api/cdisc-validation', authMiddleware, cdiscValidationModule.default);
    console.info('✅ CDISC Validation routes mounted (/api/cdisc-validation)');
  } catch (error) {
    console.error('❌ Failed to mount CDISC Validation routes:', error);
  }

  // Global Regulatory Intelligence — cross-market RA strategy (Module 1
  // requirements, review timelines, expedited programs, pathway advice).
  try {
    const globalRiModule = await import('../routes/global-ri.routes');
    app.use('/api/global-ri', authMiddleware, globalRiModule.default);
    console.info('✅ Global RI routes mounted (/api/global-ri)');
  } catch (error) {
    console.error('❌ Failed to mount Global RI routes:', error);
  }

  // Platform capabilities — one cross-surface discovery call for the UI shell.
  try {
    const platformCapabilitiesModule = await import('../routes/platform-capabilities.routes');
    app.use('/api/platform', authMiddleware, platformCapabilitiesModule.default);
    console.info('✅ Platform capabilities route mounted (/api/platform)');
  } catch (error) {
    console.error('❌ Failed to mount Platform capabilities route:', error);
  }

  // eTMF — one /api/etmf mount for both eTMF route families. They were
  // previously mounted twice at the same prefix (here and again ~260 lines
  // below), which ran authMiddleware twice per request and left a latent
  // shadowing hazard (first-registered wins the day either router adds a path
  // the other already defines). Their path sets are disjoint — etmf.routes is
  // deterministic completeness / inspection-readiness (trial-scoped), etmf is
  // governed C2C-08 CRUD (file-scoped) — so a single gateway router preserves
  // every endpoint with one auth pass. Pattern mirrors the /api/programs
  // gateway in register-document-routes.ts.
  try {
    const [etmfCompletenessModule, etmfGovernedModule] = await Promise.all([
      import('../routes/etmf.routes'),
      import('../routes/etmf'),
    ]);
    const etmfGateway = express.Router();
    etmfGateway.use(etmfCompletenessModule.default);
    etmfGateway.use(etmfGovernedModule.default);
    app.use('/api/etmf', authMiddleware, etmfGateway);
    console.info('✅ eTMF routes mounted (/api/etmf — completeness + governed CRUD)');
  } catch (error) {
    console.error('❌ Failed to mount eTMF routes:', error);
  }

  // Regulatory assessments — durable RI/CDISC/eTMF verdict snapshots per program.
  try {
    const assessmentsModule = await import('../routes/regulatory-assessments.routes');
    app.use('/api/regulatory-assessments', authMiddleware, assessmentsModule.default);
    console.info('✅ Regulatory assessments routes mounted (/api/regulatory-assessments)');
  } catch (error) {
    console.error('❌ Failed to mount Regulatory assessments routes:', error);
  }

  // eGrants / funder-milestone management (2 CFR 200; SBIR/STTR; pre→post-award).
  try {
    const grantsModule = await import('../routes/grants');
    app.use('/api/grants', authMiddleware, grantsModule.default);
    console.info('✅ eGrants routes mounted (/api/grants)');
  } catch (error) {
    console.error('❌ Failed to mount eGrants routes:', error);
  }

  // Medicare Coverage Analysis — clinical-research billing compliance (NCD 310.1; 42 CFR 405.211).
  try {
    const coverageModule = await import('../routes/coverage-analysis');
    app.use('/api/coverage-analysis', authMiddleware, coverageModule.default);
    console.info('✅ Coverage Analysis routes mounted (/api/coverage-analysis)');
  } catch (error) {
    console.error('❌ Failed to mount Coverage Analysis routes:', error);
  }

  // Research committee governance — IACUC/IRB/IBC membership, meetings, polling (PHS Policy; 45 CFR 46.107-108).
  try {
    const committeesModule = await import('../routes/committees');
    app.use('/api/committees', authMiddleware, committeesModule.default);
    console.info('✅ Research committee routes mounted (/api/committees)');
  } catch (error) {
    console.error('❌ Failed to mount Research committee routes:', error);
  }

  // Intelligent grant finder — funding profile + explainable Grants.gov opportunity matching.
  try {
    const finderModule = await import('../routes/grant-finder');
    app.use('/api/grant-finder', authMiddleware, finderModule.default);
    console.info('✅ Grant finder routes mounted (/api/grant-finder)');
  } catch (error) {
    console.error('❌ Failed to mount Grant finder routes:', error);
  }

  // CITI training full integration — completion-record import, training matrix, expiry reporting.
  try {
    const citiModule = await import('../routes/citi-training');
    app.use('/api/citi-training', authMiddleware, citiModule.default);
    console.info('✅ CITI training routes mounted (/api/citi-training)');
  } catch (error) {
    console.error('❌ Failed to mount CITI training routes:', error);
  }

  // Protocol portfolio analytics — expiration/continuing-review across IACUC + IRB.
  try {
    const portfolioModule = await import('../routes/protocol-portfolio');
    app.use('/api/protocol-portfolio', authMiddleware, portfolioModule.default);
    console.info('✅ Protocol portfolio routes mounted (/api/protocol-portfolio)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol portfolio routes:', error);
  }

  // Protocol development — structured protocol authoring (ICH M11 / E6, IACUC 3Rs, 45 CFR 46.111).
  try {
    const protocolDevModule = await import('../routes/protocol-development');
    app.use('/api/protocol-development', authMiddleware, protocolDevModule.default);
    console.info('✅ Protocol development routes mounted (/api/protocol-development)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol development routes:', error);
  }

  // Protocol risk register — likelihood × impact risk assessment (ICH E6(R2) §5.0 / ISO 14971).
  try {
    const protocolRisksModule = await import('../routes/protocol-risks');
    app.use('/api/protocol-risks', authMiddleware, protocolRisksModule.default);
    console.info('✅ Protocol risk register routes mounted (/api/protocol-risks)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol risk register routes:', error);
  }

  // Protocol amendments authoring (impact classification, reconsent triggers; 45 CFR 46.109 / 21 CFR 56.110).
  try {
    const protocolAmendmentsModule = await import('../routes/protocol-amendments');
    app.use('/api/protocol-amendments', authMiddleware, protocolAmendmentsModule.default);
    console.info('✅ Protocol amendments routes mounted (/api/protocol-amendments)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol amendments routes:', error);
  }

  // Protocol deviations & CAPA (severity, reportability, corrective actions; 45 CFR 46.108 / ICH E6).
  try {
    const protocolDeviationsModule = await import('../routes/protocol-deviations');
    app.use('/api/protocol-deviations', authMiddleware, protocolDeviationsModule.default);
    console.info('✅ Protocol deviations routes mounted (/api/protocol-deviations)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol deviations routes:', error);
  }

  // Protocol review & comment workflow (reviewer assignments, dispositions, consensus).
  try {
    const protocolReviewsModule = await import('../routes/protocol-reviews');
    app.use('/api/protocol-reviews', authMiddleware, protocolReviewsModule.default);
    console.info('✅ Protocol review routes mounted (/api/protocol-reviews)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol review routes:', error);
  }

  // Informed consent form builder (45 CFR 46.116 required-elements completeness gate).
  try {
    const protocolConsentModule = await import('../routes/protocol-consent');
    app.use('/api/protocol-consent', authMiddleware, protocolConsentModule.default);
    console.info('✅ Protocol consent routes mounted (/api/protocol-consent)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol consent routes:', error);
  }

  // NIH Data Management & Sharing Plan builder (NOT-OD-21-013 six-element completeness gate).
  try {
    const dmspModule = await import('../routes/dmsp');
    app.use('/api/dmsp', authMiddleware, dmspModule.default);
    console.info('✅ DMS plan routes mounted (/api/dmsp)');
  } catch (error) {
    console.error('❌ Failed to mount DMS plan routes:', error);
  }

  // NIH Other Support disclosure builder (person-month overcommitment + readiness gate).
  try {
    const otherSupportModule = await import('../routes/other-support');
    app.use('/api/other-support', authMiddleware, otherSupportModule.default);
    console.info('✅ Other Support routes mounted (/api/other-support)');
  } catch (error) {
    console.error('❌ Failed to mount Other Support routes:', error);
  }

  // NIH Biosketch builder (FORMS-H section completeness gate).
  try {
    const biosketchModule = await import('../routes/biosketch');
    app.use('/api/biosketch', authMiddleware, biosketchModule.default);
    console.info('✅ Biosketch routes mounted (/api/biosketch)');
  } catch (error) {
    console.error('❌ Failed to mount Biosketch routes:', error);
  }

  // Invention Disclosure / Tech Transfer (Bayh-Dole 37 CFR 401 reporting clock).
  try {
    const inventionModule = await import('../routes/invention-disclosure');
    app.use('/api/invention-disclosures', authMiddleware, inventionModule.default);
    console.info('✅ Invention disclosure routes mounted (/api/invention-disclosures)');
  } catch (error) {
    console.error('❌ Failed to mount Invention disclosure routes:', error);
  }

  // Export Control review (ITAR/EAR/OFAC + Fundamental Research Exclusion).
  try {
    const exportControlModule = await import('../routes/export-control');
    app.use('/api/export-control', authMiddleware, exportControlModule.default);
    console.info('✅ Export control routes mounted (/api/export-control)');
  } catch (error) {
    console.error('❌ Failed to mount Export control routes:', error);
  }

  // Research Agreements (MTA/DUA/CDA, HIPAA 45 CFR 164.514 execution gate).
  try {
    const agreementsModule = await import('../routes/research-agreements');
    app.use('/api/research-agreements', authMiddleware, agreementsModule.default);
    console.info('✅ Research agreement routes mounted (/api/research-agreements)');
  } catch (error) {
    console.error('❌ Failed to mount Research agreement routes:', error);
  }

  // Protocol templates library + clone-to-new-document.
  try {
    const protocolTemplatesModule = await import('../routes/protocol-templates');
    app.use('/api/protocol-templates', authMiddleware, protocolTemplatesModule.default);
    console.info('✅ Protocol templates routes mounted (/api/protocol-templates)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol templates routes:', error);
  }

  // Protocol milestones / timeline.
  try {
    const protocolMilestonesModule = await import('../routes/protocol-milestones');
    app.use('/api/protocol-milestones', authMiddleware, protocolMilestonesModule.default);
    console.info('✅ Protocol milestones routes mounted (/api/protocol-milestones)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol milestones routes:', error);
  }

  // Protocol export + ClinicalTrials.gov registration draft (FDAAA 801).
  try {
    const protocolExportModule = await import('../routes/protocol-export');
    app.use('/api/protocol-export', authMiddleware, protocolExportModule.default);
    console.info('✅ Protocol export routes mounted (/api/protocol-export)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol export routes:', error);
  }

  // Protocol schedule-of-assessments (SoA) matrix (ICH M11 / E6 schedule of activities).
  try {
    const protocolSoaModule = await import('../routes/protocol-soa');
    app.use('/api/protocol-soa', authMiddleware, protocolSoaModule.default);
    console.info('✅ Protocol SoA routes mounted (/api/protocol-soa)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol SoA routes:', error);
  }

  // Protocol budget & feasibility (per-subject costing, F&A, sponsor margin; 2 CFR 200.414).
  try {
    const protocolBudgetModule = await import('../routes/protocol-budget');
    app.use('/api/protocol-budget', authMiddleware, protocolBudgetModule.default);
    console.info('✅ Protocol budget routes mounted (/api/protocol-budget)');
  } catch (error) {
    console.error('❌ Failed to mount Protocol budget routes:', error);
  }

  // RIM-lite — registration grid + labeling (21 CFR 201; EU 2001/83/EC).
  try {
    const rimModule = await import('../routes/rim');
    app.use('/api/rim', authMiddleware, rimModule.default);
    console.info('✅ RIM-lite routes mounted (/api/rim)');
  } catch (error) {
    console.error('❌ Failed to mount RIM-lite routes:', error);
  }

  // Inspection readiness — BIMO/PAI, Form 483 responses, mock-inspection prep.
  try {
    const inspectionsModule = await import('../routes/inspections');
    app.use('/api/inspections', authMiddleware, inspectionsModule.default);
    console.info('✅ Inspection Readiness routes mounted (/api/inspections)');
  } catch (error) {
    console.error('❌ Failed to mount Inspection Readiness routes:', error);
  }

  // Controlled substances (DEA) — registrations, inventory, perpetual ledger.
  try {
    const csModule = await import('../routes/controlled-substances');
    app.use('/api/controlled-substances', authMiddleware, csModule.default);
    console.info('✅ Controlled Substances routes mounted (/api/controlled-substances)');
  } catch (error) {
    console.error('❌ Failed to mount Controlled Substances routes:', error);
  }

  // Lifecycle obligations — post-approval recurring-obligation engine.
  try {
    const lifecycleModule = await import('../routes/lifecycle');
    app.use('/api/lifecycle', authMiddleware, lifecycleModule.default);
    console.info('✅ Lifecycle Obligation routes mounted (/api/lifecycle)');
  } catch (error) {
    console.error('❌ Failed to mount Lifecycle Obligation routes:', error);
  }

  // (eTMF governed CRUD — routes/etmf — is now mounted once via the single
  // /api/etmf gateway above, alongside routes/etmf.routes. The former second
  // mount here was removed to end the double authMiddleware pass and the
  // latent route-shadowing hazard.)

  // Research compliance — roster, training-gating, compliance-checklist engine.
  try {
    const rcModule = await import('../routes/research-compliance');
    app.use('/api/research-compliance', authMiddleware, rcModule.default);
    console.info('✅ Research Compliance routes mounted (/api/research-compliance)');
  } catch (error) {
    console.error('❌ Failed to mount Research Compliance routes:', error);
  }

  // Effort certification (2 CFR 200.430) + research-security COI (NOT-OD-26-017).
  try {
    const effortModule = await import('../routes/effort-certification');
    app.use('/api/effort-certification', authMiddleware, effortModule.default);
    const rsModule = await import('../routes/research-security');
    app.use('/api/research-security', authMiddleware, rsModule.default);
    console.info('✅ Effort Certification + Research Security routes mounted');
  } catch (error) {
    console.error('❌ Failed to mount Effort/Research-Security routes:', error);
  }

  // C2C study digital twins + simulation (study/protocol design module).
  try {
    const c2cStudyTwinModule = await import('../routes/c2c/study-twin');
    app.use('/api/c2c/study-twin', authMiddleware, c2cStudyTwinModule.default);
    console.info('✅ C2C Study Twin routes mounted (/api/c2c/study-twin)');
  } catch (error) {
    console.error('❌ Failed to mount C2C Study Twin routes:', error);
  }

  // C2C document family (Phase 9 Day 3 — document + section + evidence routes).
  try {
    const c2cDocsModule = await import('../routes/c2c/documents');
    app.use('/api/c2c/documents', authMiddleware, c2cDocsModule.default);
    console.info('✅ C2C Documents routes mounted (/api/c2c/documents)');
  } catch (error) {
    console.error('❌ Failed to mount C2C Documents routes:', error);
  }

  // C2C rule-packs (Phase 9 Day 3 — top-level /api/c2c/rule-packs endpoint).
  // Thin inline handler; delegates to c2c_rule_packs table directly.
  try {
    const c2cDocsModule = await import('../routes/c2c/documents');
    app.get('/api/c2c/rule-packs', authMiddleware, (req, res, next) => {
      // Forward to the /rule-packs sub-route inside the documents router.
      //
      // The query string has to be carried across. Express 5 defines
      // `req.query` as a lazy getter that parses `req.url` at ACCESS time, and
      // the handler does not read it until after this rewrite — so assigning a
      // bare '/rule-packs' here silently discarded ?docType and ?agency and
      // the endpoint answered with every rule pack instead of the filtered
      // set. Silently: no error, just the wrong rows.
      const q = req.url.indexOf('?');
      req.url = q === -1 ? '/rule-packs' : `/rule-packs${req.url.slice(q)}`;
      c2cDocsModule.default(req, res, next);
    });
    console.info('✅ C2C Rule-packs route mounted (/api/c2c/rule-packs)');
  } catch (error) {
    console.error('❌ Failed to mount C2C Rule-packs route:', error);
  }

  // C2C Projects detail (Phase 10 — /api/c2c/projects/*).
  try {
    const c2cProjectsModule = await import('../routes/c2c/projects');
    app.use('/api/c2c/projects', authMiddleware, c2cProjectsModule.default);
    console.info('✅ C2C Projects routes mounted (/api/c2c/projects)');
  } catch (error) {
    console.error('❌ Failed to mount C2C Projects routes:', error);
  }

  // C2C Project Vault (/api/c2c/project-vault) is mounted in
  // register-clinical-intel-routes.ts — do not re-mount it here (avoids a
  // duplicate app.use of the same read-model router).

  // Vault document ingestion — the write path into the RAG corpus
  // (vault.documents). Before this route, no production code ever inserted
  // into vault.documents; documents could not enter the embedding pipeline.
  try {
    const { default: createVaultIngestRoutes } = await import('../routes/vault-ingest');
    app.use('/api/vault/ingest', authMiddleware, createVaultIngestRoutes());
    console.info('✅ Vault ingest route mounted (/api/vault/ingest)');
  } catch (error) {
    console.error('❌ Failed to mount Vault ingest route:', error);
  }

  // PDEV Evidence Picker library — org-scoped searchable evidence pool read by
  // GET /api/evidence-objects (own sub-prefix, mounted nowhere else). Populates
  // the picker's result list; before this the fetch 404'd to a permanent empty
  // state.
  try {
    const evidenceObjectsModule = await import('../routes/evidence-objects.routes');
    app.use('/api/evidence-objects', authMiddleware, evidenceObjectsModule.default);
    console.info('✅ Evidence objects route mounted (/api/evidence-objects)');
  } catch (error) {
    console.error('❌ Failed to mount Evidence objects route:', error);
  }

  // NDA/BLA cockpit CTD module readiness — org-scoped per-module completeness
  // read by GET /api/nda-cockpit/modules (own sub-prefix, mounted nowhere
  // else). Feeds the NdaCockpit "CTD readiness" panel + overall % ready; the
  // surface falls back to its fixture when the store is empty.
  try {
    const ndaCockpitModule = await import('../routes/nda-cockpit.routes');
    app.use('/api/nda-cockpit', authMiddleware, ndaCockpitModule.default);
    console.info('✅ NDA cockpit route mounted (/api/nda-cockpit)');
  } catch (error) {
    console.error('❌ Failed to mount NDA cockpit route:', error);
  }

  // Evidence surface saved RAG ask — org-scoped answer + retrieved chunks read
  // by GET /api/evidence-asks (own sub-prefix). Feeds the Evidence surface; the
  // surface falls back to its fixture when the store is empty.
  try {
    const evidenceAsksModule = await import('../routes/evidence-asks.routes');
    app.use('/api/evidence-asks', authMiddleware, evidenceAsksModule.default);
    console.info('✅ Evidence asks route mounted (/api/evidence-asks)');
  } catch (error) {
    console.error('❌ Failed to mount Evidence asks route:', error);
  }

  // Document-journey lifecycle — org-scoped per-stage journey read by GET
  // /api/doc-journey (own sub-prefix). Feeds the DocJourney surface; the
  // surface falls back to its fixture when the store is empty.
  try {
    const docJourneyModule = await import('../routes/doc-journey.routes');
    app.use('/api/doc-journey', authMiddleware, docJourneyModule.default);
    console.info('✅ Doc journey route mounted (/api/doc-journey)');
  } catch (error) {
    console.error('❌ Failed to mount Doc journey route:', error);
  }

  // Agency meetings — org-scoped list of regulatory interactions read by GET
  // /api/agency-meetings (own sub-prefix). Feeds the AgencyMeetings surface.
  try {
    const agencyMeetingsModule = await import('../routes/agency-meetings.routes');
    app.use('/api/agency-meetings', authMiddleware, agencyMeetingsModule.default);
    console.info('✅ Agency meetings route mounted (/api/agency-meetings)');
  } catch (error) {
    console.error('❌ Failed to mount Agency meetings route:', error);
  }

  // Design controls — org-scoped 820.30 traceability matrix read by GET
  // /api/design-controls (own sub-prefix). Feeds the DesignControls surface.
  try {
    const designControlsModule = await import('../routes/design-controls.routes');
    app.use('/api/design-controls', authMiddleware, designControlsModule.default);
    console.info('✅ Design controls route mounted (/api/design-controls)');
  } catch (error) {
    console.error('❌ Failed to mount Design controls route:', error);
  }

  // CRO portfolio — org-scoped CRO/sponsor oversight list read by GET
  // /api/cro-portfolio (own sub-prefix). Feeds the CroPortfolio surface.
  try {
    const croPortfolioModule = await import('../routes/cro-portfolio.routes');
    app.use('/api/cro-portfolio', authMiddleware, croPortfolioModule.default);
    console.info('✅ CRO portfolio route mounted (/api/cro-portfolio)');
  } catch (error) {
    console.error('❌ Failed to mount CRO portfolio route:', error);
  }

  // Regulatory change horizon scan — the REAL org-scoped reg_change_items store,
  // read by GET and written by POST /api/reg-change (own sub-prefix). Feeds the
  // RegChange surface.
  try {
    const regChangeModule = await import('../routes/reg-change.routes');
    app.use('/api/reg-change', authMiddleware, regChangeModule.default);
    console.info('✅ Reg change route mounted (/api/reg-change)');
  } catch (error) {
    console.error('❌ Failed to mount Reg change route:', error);
  }

  // Decision lineage — org-scoped governed-decision records read by GET
  // /api/decision-lineage (own sub-prefix). Feeds the DecisionLineage surface.
  try {
    const decisionLineageModule = await import('../routes/decision-lineage.routes');
    app.use('/api/decision-lineage', authMiddleware, decisionLineageModule.default);
    console.info('✅ Decision lineage route mounted (/api/decision-lineage)');
  } catch (error) {
    console.error('❌ Failed to mount Decision lineage route:', error);
  }

  // Dossier map — org-scoped CTD module-map completeness read by GET
  // /api/dossier-map (own sub-prefix). Feeds the DossierMap surface.
  try {
    const dossierMapModule = await import('../routes/dossier-map.routes');
    app.use('/api/dossier-map', authMiddleware, dossierMapModule.default);
    console.info('✅ Dossier map route mounted (/api/dossier-map)');
  } catch (error) {
    console.error('❌ Failed to mount Dossier map route:', error);
  }

  // Wave-3 batch: org-scoped instance-list reads, each on its own sub-prefix,
  // feeding a registered v2 surface that fails closed to its fixture.
  //
  // These twelve were the last holdout of the variable-specifier defect, and the
  // hardest to see. They were loaded as `await import(modPath)` from a tuple
  // loop, so esbuild resolved none of them and all twelve 404d in production
  // while twelve v2 surfaces sat on their fixtures with no error anywhere.
  //
  // The guard that should have caught this did not, and the reason is worth
  // recording: it stripped comments with a `/\*[\s\S]*?\*/` regex, and line 788
  // of this file contains the characters `/*` inside prose. That opened a
  // 13,294-character false comment spanning lines 788-1061 — this block among
  // them. The guard reported clean on a file it could not see a quarter of.
  // server/bootstrap/__tests__/routes-reach-the-bundle.test.ts now strips
  // comments with a state machine that knows about strings, and self-checks
  // against that exact case before it reports anything.
  mountAll(
    app,
    [
      { path: '/api/ind-checklist', router: indChecklistRoutes, name: 'IND checklist' },
      { path: '/api/program-journey', router: programJourneyRoutes, name: 'Program journey' },
      // Second router on /api/market-access. server/routes/market-access.ts is
      // mounted by register-advanced-platform-routes (CPT/HCPCS coding and the
      // coverage dossier); this one serves the instance-list reads the
      // MarketAccess surface calls. Express tries them in mount order and the
      // path sets do not overlap, so both are reachable — but the collision is
      // real and belongs in a comment rather than in someone's afternoon.
      { path: '/api/market-access', router: marketAccessRoutes, name: 'Market access (instance reads)' },
      { path: '/api/shadow-review', router: shadowReviewRoutes, name: 'Shadow review' },
      { path: '/api/labeling-pi', router: labelingPiRoutes, name: 'Labeling PI' },
      { path: '/api/protocol-dev', router: protocolDevRoutes, name: 'Protocol dev' },
      { path: '/api/research-admin', router: researchAdminRoutes, name: 'Research admin' },
      { path: '/api/investigator-brochure', router: investigatorBrochureRoutes, name: "Investigator's Brochure" },
      { path: '/api/nonclinical-summary', router: nonclinicalSummaryRoutes, name: 'Nonclinical M2.6/M4' },
      { path: '/api/maa-module1', router: maaModule1Routes, name: 'MAA Module 1' },
      { path: '/api/labeling-smpc', router: labelingSmpcRoutes, name: 'EU SmPC labeling' },
      { path: '/api/cmc-changes', router: cmcChangesRoutes, name: 'CMC change control' },
    ],
    authMiddleware,
  );

  // C2C client formatting templates — AnA document-formatting engine.
  // Extract a TemplateSpec from an upload, build/edit client templates, and
  // render documents as .docx / .pdf with the client's fonts, margins, logo.
  try {
    const c2cTemplatesModule = await import('../routes/c2c/templates');
    app.use('/api/c2c/templates', authMiddleware, c2cTemplatesModule.default);
    console.info('✅ C2C Templates routes mounted (/api/c2c/templates)');
  } catch (error) {
    console.error('❌ Failed to mount C2C Templates routes:', error);
  }

  // BLA 351(a) biologics workbench — analytical similarity, comparability,
  // immunogenicity engines (/api/biopharma/bla/*). Mounted before the programs
  // router so its multi-segment paths resolve ahead of programs' GET /:id.
  try {
    const blaWorkbenchModule = await import('../routes/biopharma/bla-workbench');
    app.use('/api/biopharma/bla', authMiddleware, blaWorkbenchModule.default);
    console.info('✅ BLA workbench routes mounted (/api/biopharma/bla)');
  } catch (error) {
    console.error('❌ Failed to mount BLA workbench routes:', error);
  }

  // Multi-region submission planning (build+submit resolver, FDA/EMA/PMDA).
  try {
    const submissionsModule = await import('../routes/biopharma/submissions');
    app.use('/api/biopharma/submissions', authMiddleware, submissionsModule.default);
    console.info('✅ Biopharma submissions routes mounted (/api/biopharma/submissions)');
  } catch (error) {
    console.error('❌ Failed to mount Biopharma submissions routes:', error);
  }

  // CTD Module 1 (regional administrative) + Module 2 (CTD summaries) home.
  try {
    const ctdModule = await import('../routes/biopharma/ctd');
    app.use('/api/biopharma/ctd', authMiddleware, ctdModule.default);
    console.info('✅ Biopharma CTD M1/M2 routes mounted (/api/biopharma/ctd)');
  } catch (error) {
    console.error('❌ Failed to mount Biopharma CTD routes:', error);
  }

  // Biopharma specialty reads — pediatric plans, orphan designations, lifecycle
  // supplements. Each mounts at its own sub-prefix (rather than the bare
  // /api/biopharma) so it resolves ahead of the programs router's GET /:id.
  try {
    const specialty = await import('../routes/biopharma-specialty.routes');
    app.use('/api/biopharma/pediatric', authMiddleware, specialty.pediatricRouter);
    app.use('/api/biopharma/orphan', authMiddleware, specialty.orphanRouter);
    app.use('/api/biopharma/supplements', authMiddleware, specialty.supplementsRouter);
    app.use('/api/biopharma/prea-milestones', authMiddleware, specialty.preaMilestonesRouter);
    app.use('/api/biopharma/orphan-rpd', authMiddleware, specialty.orphanRpdRouter);
    app.use('/api/biopharma/orphan-advocacy', authMiddleware, specialty.orphanAdvocacyRouter);
    console.info('✅ Biopharma specialty routes mounted (/api/biopharma/{pediatric,orphan,supplements,prea-milestones,orphan-rpd,orphan-advocacy})');
  } catch (error) {
    console.error('❌ Failed to mount Biopharma specialty routes:', error);
  }

  // Biopharma domain programs + meetings (Phase 10 — /api/biopharma/*).
  try {
    const biopharmaModule = await import('../routes/biopharma/programs');
    app.use('/api/biopharma', authMiddleware, biopharmaModule.default);
    console.info('✅ Biopharma routes mounted (/api/biopharma)');
  } catch (error) {
    console.error('❌ Failed to mount Biopharma routes:', error);
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

  // Persisted approval-checkpoint read (approval_checkpoints × workflow_runs).
  // Own try/catch: this lightweight read must stay up even if the heavy
  // orchestration service graph fails to import (and vice versa). Mounted at
  // its own sub-prefix (not the bare /api/orchestration) so the route-mount
  // audit sees a single mount per prefix.
  try {
    const orchestrationCheckpointRoutes = (await import('../routes/orchestration-checkpoints')).default;
    app.use('/api/orchestration/checkpoints', orchestrationCheckpointRoutes);
    console.log('✅ Orchestration checkpoint routes mounted at /api/orchestration/checkpoints');
  } catch (error: any) {
    console.error('❌ Failed to mount Orchestration checkpoint routes:', error.message);
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
  // Registrations surface — submission data-standards capability status (honest
  // shipped/not_integrated states for eSTAR, eCTD, EUDAMED M2M, IDMP/xEVMPD).
  app.use('/api/registrations', authMiddleware, registrationsStandardsRoutes);
  // GAMP 5 validation-kit — self-serve catalog + download, backed by the real
  // documents under docs/validation/ with their true (draft) status.
  app.use('/api/validation-kit', authMiddleware, validationKitRoutes);
  app.use('/api/saved-precedent-queries', savedPrecedentQueriesRoutes);
  app.use('/api/mdx', mdxRoutes);
  /* MDX beta-surface routers — each one backs a kit surface. Stacking
     multiple routers at the same /api/mdx prefix keeps the kit's URL
     space coherent without consolidating into a single mega-router.
     Each module owns its own audit + tenant-scope. */
  // mdxAnaDrafts + mdxVault query the global pool (concept2cure_artifacts,
  // ana drafts) with no tenant scope of their own — mounted with no auth here,
  // they fail closed under RLS_ENFORCE=on (and read org from req.user, which
  // nothing was populating). requireTenantContext authenticates, establishes the
  // AsyncLocalStorage tenant scope so those queries are permitted, and populates
  // req.user/req.tenantContext the handlers already read.
  // The gate is bound to the two URL sub-trees these routers own, NOT to the
  // shared /api/mdx prefix. `app.use('/api/mdx', requireTenantContext, router)`
  // reads as "gate this router" and is not that: path-mounted middleware runs
  // for every request matching the prefix, so it gated all 20+ routers stacked
  // here. `/api/mdx/notifications/unread-count` — mounted below with no auth by
  // design — answered 401 whenever tenant context was unresolved, which is the
  // 500-then-401 alternation in the UAT report's BP-02. Proven with a real
  // Express app before and after; see ledger L61.
  app.use('/api/mdx/ana-drafts', requireTenantContext);
  app.use('/api/mdx/vault', requireTenantContext);
  app.use('/api/mdx', mdxAnaDraftsRoutes);
  app.use('/api/mdx', mdxVaultRoutes);
  app.use('/api/mdx', mdxEngineeringRoutes);
  app.use('/api/mdx', mdxUdiRoutes);
  app.use('/api/mdx', mdxRiskRoutes);
  app.use('/api/mdx', mdxRbmRoutes);
  // RBM data layer: metric ingestion + the engine runs over ingested data.
  app.use('/api/mdx', mdxRbmDataRoutes);
  app.use('/api/mdx', mdxSoftwareRoutes);
  app.use('/api/mdx', mdxIndustryContextRoutes);
  /* Regulatory work-package compiler (MDX-PM-02) — read-only deterministic
     plan derived from the effective industry context; no persistence. */
  app.use('/api/mdx', mdxWorkPackagesRoutes);
  /* Client review zone (MDX-CLIENT-01) — internal-visibility items never leak. */
  app.use('/api/mdx', mdxClientReviewRoutes);
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
  app.use('/api/mdx', mdxTemplatesRoutes);
  app.use('/api/mdx', mdxPostmarketRoutes);
  app.use('/api/mdx', mdxClinicalStudiesRoutes);
  /* Study-archetype registry — read-only static registry (MDX-STUDY-01). */
  app.use('/api/mdx', mdxStudyArchetypesRoutes);
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

  // PMA workflow routes. (The legacy /api/510k-workflow family was deleted in
  // the Phase 1 consolidation — the canonical 510(k) surface is
  // /api/510k/estar/* + /api/510k/device/* over cerv2_510k_sections.)
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
