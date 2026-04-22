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
import {
  isStaticDataEnabled,
  sendStaticDataDisabled,
} from '../middleware/staticDataGuard';
import { createCircuitBreakerMiddleware } from '../middleware/circuitBreaker';
import type { CircuitBreakerMiddleware } from '../bootstrap/types';

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
 * Fallback mount for static-data families that are disabled. Kept
 * identical to the pre-refactor helper, including the warning log.
 */
function buildStaticBusinessDataGuard(app: Express) {
  return function mountStaticBusinessDataGuard(
    path: string,
    routeName: string,
    requiredFlag: string
  ) {
    app.use(path, (_req, res) => {
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
  const inlineCtx = { app, pool };

  // Platform: /api/auth, /api/v1/auth, /api/users, /api/user, legacy auth
  // redirects, enterprise auth, SSO, health probes, global /api auth gate.
  await registerPlatformRoutes({ app, pool, authMiddleware });

  // Slot 1 — Device-Project CRUD.
  registerInlineEarlyRoutes(inlineCtx);

  // Core bootstrap family (templates, AI, CMC, AI assistance, intelligent
  // docs, PM settings, control plane) + Integrations family.
  registerCoreRoutes({ app, pool, aiCircuitBreaker });
  registerIntegrationRoutes(app);

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

  // Slot 5 — Authoring router + authoring actions + AnA platform control +
  // AI actions (+ Redis / queue init) + Phase 3 orchestration.
  await registerInlineAiWorkflowRoutes(inlineCtx);

  // Governance + intelligence bundle.
  await registerGovernanceRoutes(app);

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
