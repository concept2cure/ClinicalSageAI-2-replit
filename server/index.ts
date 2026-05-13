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
// shell-exported values still win over .env.
import { config as dotenvConfig } from 'dotenv';
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
import { errorHandler } from './src/mw/observability.js';

// Audit + RBAC side-effect imports (initialize tables + cache on require).
import './services/auditService.js';
import './services/roleBasedAccess.js';

import { getPool } from './db';

import { validateEnvironment, resolveStartupFlags, createDebugLogger } from './startup/env';
import { registerShutdownHandlers } from './startup/shutdown';
import {
  applyTelemetryMiddleware,
  applyCoreMiddleware,
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
  startPythonBackend,
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
// Dynamic import (top-level await isn't on by default for this file)
// kept synchronous via a separate require — `consoleBridge.ts` has no
// async deps. We do this AFTER validateEnvironment so a missing-env
// hard-exit message reaches stderr unbridged.
{
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { installConsoleBridge } = require('./utils/consoleBridge');
  installConsoleBridge();
}

const app = express();
const pool = getPool();

// ── Shutdown wiring (must run before any async work that could crash) ──────
let httpServer: HttpServer | null = null;
let pythonProcess: { kill: (signal: string) => void } | null = null;

registerShutdownHandlers({
  getHttpServer: () => httpServer,
  getPythonProcess: () => pythonProcess,
  pool,
});

// ── Middleware stack (order is load-bearing — see module docs) ─────────────
if (flags.debug) {
  applyDebugRequestLogging(app, debugLog);
}

applyTelemetryMiddleware(app);

// Fast-path health endpoints BEFORE security/rate-limit — they need to
// short-circuit without any middleware cost.
mountFastPathHealthEndpoints(app, pool);

applyCoreMiddleware(app, debugLog);

// Tamper-proof audit trail (21 CFR Part 11 §11.10(e)). Mounted after the
// core middleware so user/auth context is populated before observation,
// but before route registration so it observes every /api request that
// reaches a handler. No-op unless AUDIT_TRAIL_ENABLED=true.
applyAuditTrailMiddleware(app, pool, debugLog);

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
};

await registerPreStartRoutes(routeCtx, aiCircuitBreaker);

// ── Server startup ─────────────────────────────────────────────────────────
async function startServer() {
  debugLog('Starting server initialization...');

  await verifyDatabaseConnection(pool);
  await initializeEarlyServices();

  debugLog('Initializing Python backend...');
  pythonProcess = await startPythonBackend();
  debugLog('Python backend initialization complete');

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

  await setupFrontendServing(app, httpServer);

  await initializeParallelServices(httpServer, pool);

  httpServer.listen(flags.port, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${flags.port}`);
    console.log(`📊 Health check: http://localhost:${flags.port}/api/health`);
    console.log(`🔐 Login: http://localhost:${flags.port}/auth`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
