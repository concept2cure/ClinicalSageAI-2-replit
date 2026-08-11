/**
 * Route mounting orchestration — composition root.
 *
 * After Phase 6, this file is pure orchestration: every mount is
 * delegated to a named `register*Routes` function in `server/bootstrap/`.
 * No more inline `app.use(...)` blocks. The two-phase layout mirrors
 * the original runtime sequence:
 *
 *   registerPreStartRoutes(ctx)  — runs before HTTP listen. Platform +
 *                                  all inline-slot families + AI/admin +
 *                                  document + governance + submission-workflow.
 *                                  Must complete before the frontend
 *                                  catchall is installed.
 *
 *   registerPostStartRoutes(ctx) — runs inside startServer() after the
 *                                  early services (Redis, queue, proof
 *                                  system) are ready. Mounts the tenant /
 *                                  project / clinical-intel / advanced
 *                                  platform route families, which depend
 *                                  on Phase A services.
 *
 * Startup order (and the try/catch isolation around each family) is
 * preserved byte-for-byte from the pre-refactor server/index.ts.
 */

import type { Express } from 'express';
import type { Pool } from 'pg';

import { authMiddleware } from '../auth.js';
import { isStaticDataEnabled } from '../middleware/staticDataGuard';
import { createCircuitBreakerMiddleware } from '../middleware/circuitBreaker';
import { authoringObjectAuthorization } from '../middleware/authoringObjectAuthorization';
import authoringPermissionsRouter from '../routes/authoring-permissions';
import { assertAuthoringAuthorizationReady } from './authoringAuthorizationInvariant';
import type { CircuitBreakerMiddleware } from '../bootstrap/types';
import { buildStaticBusinessDataGuard } from '../bootstrap/static-data-guard';

import { registerCoreRoutes } from '../bootstrap/register-core-routes';
import { registerConcept2CureRoutes } from '../bootstrap/register-concept2cure-routes';
import { registerAiRoutes } from '../bootstrap/register-ai-routes';
import { registerAdminRoutes } from '../bootstrap/register-admin-routes';
import { registerGovernanceRoutes } from '../bootstrap/register-governance-routes';
import { registerIndLifecycleRoutes } from '../bootstrap/register-ind-lifecycle-routes';
import { registerPlatformRoutes } from '../bootstrap/register-platform-routes';
import { registerRegulatoryRoutes } from '../bootstrap/register-regulatory-routes';
import { registerDocumentRoutes } from '../bootstrap/register-document-routes';
import { registerTenantRoutes } from '../bootstrap/register-tenant-routes';
import { registerProjectRoutes } from '../bootstrap/register-project-routes';
import { registerClinicalIntelRoutes } from '../bootstrap/register-clinical-intel-routes';
import { registerAdvancedPlatformRoutes } from '../bootstrap/register-advanced-platform-routes';
import {
  registerInlineEarlyRoutes,
  registerInlineAnaIntelligenceRoutes,
  registerInlineLitCommerceRoutes,
  registerInlinePlatformFacadesRoutes,
  registerInlineAiWorkflowRoutes,
  registerInlineSubmissionWorkflowRoutes,
} from '../bootstrap/register-inline-routes';

export interface RouteRegistrationContext {
  app: Express;
  pool: Pool;
  experimentalRoutesEnabled: boolean;
  demoRoutesEnabled: boolean;
  testRoutesEnabled: boolean;
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
 * Pre-HTTP-listen registration. See module docstring for ordering.
 */
export async function registerPreStartRoutes(
  ctx: RouteRegistrationContext,
  aiCircuitBreaker: CircuitBreakerMiddleware
): Promise<void> {
  const { app, pool, experimentalRoutesEnabled, demoRoutesEnabled, testRoutesEnabled } = ctx;
  const inlineCtx = { app, pool };

  // Platform: /api/auth, /api/v1/auth, /api/users, /api/user, legacy auth
  // redirects, enterprise auth, SSO, health probes, global /api auth gate.
  await registerPlatformRoutes({ app, pool, authMiddleware });

  // Slot 1 — Device-Project CRUD.
  registerInlineEarlyRoutes(inlineCtx);

  // Core bootstrap family (templates, AI, CMC, AI assistance, intelligent
  // docs, PM settings, control plane) + Integrations family.
  registerCoreRoutes({ app, pool, aiCircuitBreaker, testRoutesEnabled });

  // Slot 2 — AnA Cortex / Nano Banana / Predictive / Foresight alias / Biotech RAG.
  await registerInlineAnaIntelligenceRoutes(inlineCtx);

  // Regulatory family (FDA 510k, CERV2, IVDR, Mfg, PV, ClinOps, CER, GRDHE).
  await registerRegulatoryRoutes({ app, pool });

  // Slot 3 — License / Billing / Analytics / Stability.
  await registerInlineLitCommerceRoutes(inlineCtx);

  // Document + Knowledge family (eCTD, GCC, Cortex, Evidence, Authoring, Biostat).
  await registerDocumentRoutes({
    app,
    pool,
    isStaticDataEnabled,
    mountStaticBusinessDataGuard: buildStaticBusinessDataGuard(app),
    DEMO_ROUTES_ENABLED: demoRoutesEnabled,
    EXPERIMENTAL_ROUTES_ENABLED: experimentalRoutesEnabled,
  });

  // Slot 4 — Static uploads / CSR / audit trail / AnA RI inline facades.
  registerInlinePlatformFacadesRoutes(inlineCtx);

  // AI + Concept2Cure + Admin bootstrap manifests.
  await registerAiRoutes({ app, pool, aiCircuitBreaker });
  registerConcept2CureRoutes(app);
  registerAdminRoutes(app);

  // Authoring object security is mounted once at the existing `/api` gateway,
  // immediately ahead of the legacy `/api/authoring` router. The middleware
  // ignores non-authoring paths, so no second `/api/authoring` mount is added and
  // the route-mount no-regression contract stays intact.
  //
  // Permission-management routes are owner/admin controlled and terminate their
  // own requests; every other document/section mutation must pass the mandatory,
  // fail-closed object authorization middleware.
  //
  // The old authoring router contains a feature-flagged helper under
  // AUTH_ENFORCE_SECTION_PERMS. That helper is now RETIRED on the production
  // composition path: it represented a second permission system, depended on the
  // old schema shape, and could deny a request after the canonical policy had
  // already approved it. Keep the legacy function inert until it is deleted from
  // the large router in a dedicated decomposition PR.
  await assertAuthoringAuthorizationReady(pool);
  if (process.env.AUTH_ENFORCE_SECTION_PERMS === '1') {
    console.warn(
      '[authoring] AUTH_ENFORCE_SECTION_PERMS is retired; canonical mandatory object authorization is active.',
    );
  }
  process.env.AUTH_ENFORCE_SECTION_PERMS = '0';
  app.use('/api', authoringPermissionsRouter);
  app.use('/api', authoringObjectAuthorization);

  // Slot 5 — Authoring router + authoring actions + AnA platform control +
  // AI actions (+ Redis / queue init) + Phase 3 orchestration.
  await registerInlineAiWorkflowRoutes(inlineCtx);

  // Governance + intelligence bundle.
  await registerGovernanceRoutes(app);

  // IND lifecycle bundle — FDA forms, sponsor/agent/investigator master data,
  // and RA lifecycle workflows (safety reports / annual report / amendments).
  await registerIndLifecycleRoutes(app);

  // Slot 6 — Regulatory submissions / Submission ops / Correspondence /
  // 510k + PMA workflows / beta-safe / FDA forms / field sync / content
  // assembly / misc inline.
  registerInlineSubmissionWorkflowRoutes(inlineCtx);
}

/**
 * Post-init registration. Runs inside startServer() after the early
 * services have initialized. These families depend on Redis / AI Actions /
 * Proof System being ready.
 */
export async function registerPostStartRoutes(ctx: RouteRegistrationContext): Promise<void> {
  const { app, pool, testRoutesEnabled } = ctx;

  await registerTenantRoutes({ app, pool });
  await registerProjectRoutes({ app, pool });
  await registerClinicalIntelRoutes({ app, pool });
  await registerAdvancedPlatformRoutes({
    app,
    pool,
    isStaticDataEnabled,
    mountStaticBusinessDataGuard: buildStaticBusinessDataGuard(app),
    testRoutesEnabled,
  });
}
