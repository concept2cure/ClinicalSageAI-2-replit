/**
 * Composition root for the Concept2Cure API server.
 *
 * Responsibilities kept here:
 *   - Early process setup (dotenv, IPv4-first DNS, Sentry, OpenTelemetry)
 *   - Env validation + startup flag resolution
 *   - App construction
 *   - Shutdown + process error handler wiring
 *   - Orchestration of the owned startup modules in server/startup/*
 *
 * Everything else has been extracted. If you find yourself adding more than
 * a handful of lines here, it probably belongs in one of the startup
 * modules or in a bootstrap manifest under server/bootstrap/.
 */

// dotenv MUST load before any env var read. `override: false` so
// shell-exported values still win over the files, and so the FIRST file to
// define a key wins. .env.local is therefore loaded first: it is the
// git-ignored, machine-local file `npm run up` writes, and a developer's local
// database URL must beat the committed default — which pointed at a role with
// no grants and made every query fail on an otherwise correct install.
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local', override: false, quiet: true });
dotenvConfig({ override: false, quiet: true });

// Initialize OpenTelemetry + Sentry + IPv4 DNS ordering early, before
// anything that opens a DB connection or HTTP client.
import { initializeOpenTelemetry } from './services/telemetry/opentelemetry';
import './utils/sentry';
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
await initializeOpenTelemetry();

import express from 'express';
import { createServer, type Server as HttpServer } from 'http';
import { startDriftSentinelSchedule } from './jobs/driftSentinelSweep';
import { startAuditChainIntegritySchedule } from './jobs/auditChainIntegritySweep';
import { startCorpusIngestionSchedule } from './jobs/corpusIngestionSweep';
import { startRegulatoryHorizonSchedule } from './jobs/regulatoryHorizonScan';
import { startExternalIntelligenceSchedule } from './jobs/externalIntelligenceSweep';
import { startScheduleOfEventsSweep } from './jobs/scheduleOfEventsSweep';
import { startTaskDueSweep } from './jobs/taskDueSweep';
import { errorHandler } from './src/mw/observability.js';

// Audit + RBAC side-effect imports (initialize tables + cache on require).
import './services/auditService.js';
import './services/roleBasedAccess.js';

import { getPool } from './db';
import { runWithSystemTenantScope } from './db/tenantStore';

import { validateEnvironment, resolveStartupFlags, createDebugLogger } from './startup/env';
import { registerShutdownHandlers } from './startup/shutdown';
import { installConsoleBridge } from './utils/consoleBridge';
import {
  applyTelemetryMiddleware,
  applyCoreMiddleware,
  applyAuthBoundary,
  applyDebugRequestLogging,
} from './startup/middleware';
import { applyAuditTrailMiddleware } from './startup/audit-trail';
import {
  mountFastPathHealthEndpoints,
  mountDiagnosticEndpoints,
} from './startup/inline-endpoints';
import {
  createAiCircuitBreaker,
  registerPreStartRoutes,
  registerPostStartRoutes,
} from './startup/routes';
import {
  verifyDatabaseConnection,
  initializeEarlyServices,
  initializeParallelServices,
  mountApiCatchAll,
} from './startup/services';
import { setupFrontendServing } from './startup/frontend';

// ── Early validation (may process.exit on missing required vars) ───────────
validateEnvironment();
const flags = resolveStartupFlags();
const debugLog = createDebugLogger(flags.debug);

// Install the console → logger bridge before any further code logs
// anything in production. The bridge passes object arguments through
// the HIPAA-aware redaction walker so legacy `console.error(req.body)`
// call sites can't leak credentials / PHI to stdout. No-op outside
// production so dev / test traces stay readable.
//
// Install AFTER validateEnvironment so a missing-env hard-exit message
// reaches stderr unbridged. installConsoleBridge is statically imported (so
// esbuild bundles it into dist/index.js); it has no effect until called here.
installConsoleBridge();

const app = express();
const pool = getPool();

// ── Shutdown wiring (must run before any async work that could crash) ──────
let httpServer: HttpServer | null = null;

registerShutdownHandlers({
  getHttpServer: () => httpServer,
  pool,
});

// ── Middleware stack (order is load-bearing — see module docs) ─────────────
applyTelemetryMiddleware(app);

// Fast-path health endpoints BEFORE security/rate-limit — they need to
// short-circuit without any middleware cost.
mountFastPathHealthEndpoints(app, pool);

applyCoreMiddleware(app, debugLog);

// Must follow core middleware so parsed request bodies are available for
// safe, redacted debug logging. Fast-path health endpoints remain excluded.
if (flags.debug) {
  applyDebugRequestLogging(app, debugLog);
}

// Tamper-proof audit trail (21 CFR Part 11 §11.10(e)). Mounted after the
// core middleware so user/auth context is populated before observation,
// but before route registration so it observes every /api request that
// reaches a handler. No-op unless AUDIT_TRAIL_ENABLED=true.
applyAuditTrailMiddleware(app, pool, debugLog);

// Default-deny /api auth boundary — after the audit-trail observer (401s are
// recorded), before ANY route registration (see startup/middleware.ts).
applyAuthBoundary(app);

// Diagnostic endpoints after the security stack so they inherit CORS,
// rate-limit, structured logging, etc.
mountDiagnosticEndpoints(app, pool);

// ── Pre-HTTP-listen route registration ─────────────────────────────────────
const aiCircuitBreaker = createAiCircuitBreaker();
const routeCtx = {
  app,
  pool,
  experimentalRoutesEnabled: flags.experimentalRoutesEnabled,
  demoRoutesEnabled: flags.demoRoutesEnabled,
  testRoutesEnabled: flags.testRoutesEnabled,
};

await registerPreStartRoutes(routeCtx, aiCircuitBreaker);

// ── Server startup ─────────────────────────────────────────────────────────
async function startServer() {
  debugLog('Starting server initialization...');

  await verifyDatabaseConnection(pool);
  await initializeEarlyServices();

  if (process.env.NODE_ENV === 'production') {
    const { assertRlsCatalogPosture } = await import('./db/rlsEnforcement');
    // The posture probe issues catalog/role queries on the shared pool. Under
    // RLS_ENFORCE=on — the only value production accepts — an unscoped pool.query
    // fails closed, so declare a system scope for this estate-wide check (same
    // rationale as verifyDatabaseConnection's probe).
    await runWithSystemTenantScope('startup:assert-rls-catalog-posture', async () =>
      assertRlsCatalogPosture(pool)
    );
  }

  // Security self-test — run AFTER the DB connection is verified
  // (so the audit-chain check can query) but BEFORE any other
  // startup work or HTTP listen. In production a critical failure
  // here exits the process; in dev / non-blocking mode it logs
  // and continues. See server/startup/security-self-test.ts.
  {
    const { runBootSecuritySelfTest } = await import('./startup/security-self-test');
    await runBootSecuritySelfTest(pool);
  }

  // Schema/dependency invariants (revoked-tokens table, artifact columns,
  // Redis, …). Previously only reachable via a diagnostics route, so a fresh
  // deployment with a broken schema booted silently and crashed on first use.
  // Logs by default; with STRICT_STARTUP_INVARIANTS=true a critical failure
  // halts boot.
  {
    const { runStartupInvariants } = await import('./lib/startup-invariants');
    const invariantReport = await runStartupInvariants();

    // AnA's verdict gets its own banner, immediately, before any of the
    // remaining startup noise. The invariant panel already recorded it — but
    // the whole reason AnA was once found completely dead on a "healthy" boot
    // is that her failure looked exactly like every other log line. It does
    // not any more. See startup/ana-readiness-state.ts.
    const { logAnaReadinessBanner } = await import('./startup/ana-readiness-state');
    logAnaReadinessBanner();

    if (
      invariantReport.criticalFailures > 0 &&
      process.env.STRICT_STARTUP_INVARIANTS === 'true'
    ) {
      console.error(
        `Startup halted: ${invariantReport.criticalFailures} critical invariant failure(s) ` +
          `(STRICT_STARTUP_INVARIANTS=true). Failed: ` +
          invariantReport.invariants.filter(i => !i.passed).map(i => i.name).join(', ')
      );
      process.exit(1);
    }
  }

  // Periodic posture monitor — re-runs the self-test panel on a
  // fixed interval so drift (clamd down, audit chain broken, etc.)
  // is observed without an operator manually probing the admin
  // endpoint. Idempotent — safe across hot-reload. Disabled via
  // SECURITY_HEALTH_DISABLE_SCHEDULER=true (used in tests).
  {
    const { startSecurityHealthScheduler } = await import(
      './services/securityHealthScheduler'
    );
    startSecurityHealthScheduler(pool);
  }

  debugLog('Mounting startup route families...');
  await registerPostStartRoutes(routeCtx);
  debugLog('All startup route families mounted');

  // 404 for /api must be installed after all API routes but before the
  // frontend fallback, so unmatched /api/* gets JSON rather than HTML.
  mountApiCatchAll(app);

  // Global error handler is the last middleware in the chain.
  app.use(errorHandler);
  console.log('✅ Global error handler registered');

  httpServer = createServer(app);

  // Behind an ALB/ELB (or any L7 proxy), Node's default 5s keepAliveTimeout is
  // BELOW the proxy's idle timeout (commonly 60s). That inverts who closes an
  // idle keep-alive connection: Node closes it first, the proxy then reuses the
  // socket it still believes is open, and the client gets a sporadic 502. Set
  // keepAliveTimeout above the proxy idle window, and headersTimeout above that
  // (it must exceed keepAliveTimeout or the keep-alive window is truncated).
  // Both overridable for proxies configured with a longer idle setting.
  httpServer.keepAliveTimeout = Number(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS || 65_000);
  httpServer.headersTimeout = Number(process.env.HTTP_HEADERS_TIMEOUT_MS || 66_000);

  await setupFrontendServing(app, httpServer);

  await initializeParallelServices(httpServer, pool);

  httpServer.listen(flags.port, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${flags.port}`);
    console.log(`📊 Health check: http://localhost:${flags.port}/api/health`);
    console.log(`🔐 Login: http://localhost:${flags.port}/auth`);
    // Living Record Spine: start the Drift Sentinel periodic sweep. Self-guards
    // to a no-op unless ENABLE_DRIFT_SENTINEL=true, so default boot is unchanged.
    startDriftSentinelSchedule();
    // 21 CFR Part 11 / ISO 14971: daily audit-chain tamper-evidence sweep.
    // On by default when AUDIT_TRAIL_ENABLED=true; opt out with
    // ENABLE_AUDIT_CHAIN_CHECK=false, force on with =true.
    startAuditChainIntegritySchedule();
    // RIM precedent flywheel: periodic CT.gov ingestion into the corpus.
    // Self-guards to a no-op unless ENABLE_CORPUS_INGESTION=true.
    startCorpusIngestionSchedule();
    // Continuous learning: weekly regulatory/harmonisation horizon scan that
    // keeps AnA current across global markets. Self-guards to a no-op unless
    // ENABLE_REGULATORY_HORIZON_SCAN=true, so default boot is unchanged.
    startRegulatoryHorizonSchedule();
    // AnA's nightly external scan: regulatory agencies across all served
    // markets + study-methodology sources (SCDM, PubMed, medRxiv). Default
    // ON — disable with ENABLE_EXTERNAL_INTELLIGENCE=false.
    startExternalIntelligenceSchedule();
    // Project manager: AnA proactively reviews every active schedule of events,
    // marking slips/at-risk milestones, opening recovery tasks, firing alerts,
    // and flagging goals. Self-guards in tests; disable with
    // SCHEDULE_OF_EVENTS_SWEEP_DISABLED=true.
    startScheduleOfEventsSweep();

    // Tasking: notify assignees once at due-soon (48h) and once at overdue —
    // idempotent via task metadata markers. Self-guards in tests; disable with
    // TASK_DUE_SWEEP_DISABLED=true.
    startTaskDueSweep();
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
