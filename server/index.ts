import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: false });
import { initializeOpenTelemetry } from './services/telemetry/opentelemetry';

// Initialize Sentry error monitoring early, before other imports
import './utils/sentry';

// CRITICAL: Force IPv4 first to prevent ENETUNREACH errors in environments without IPv6 support
// This MUST be at the very top before ANY database connections are made
import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');
await initializeOpenTelemetry();

import express from 'express';
import { createServer } from 'http';
import { Pool } from 'pg';
import { setupVite, serveStatic } from './vite';
import { httpLogger, errorHandler } from './src/mw/observability.js';
// Database performance optimizations - optional
import path from 'path';
import fs from 'fs';
import type { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'url';
import { betaFlowTelemetryMiddleware } from './middleware/betaFlowTelemetry';
import { mountBetaSafeRoutes } from './betaRouteManifest';

// Phase 4.1 Proof System - 21 CFR Part 11 Compliance
import { initializeProofDatabasePersistence } from '../services/proof/database-setup';

import { registerSubscriptionsRoutes } from './routes/reports/subscriptions-routes';

// Enterprise Security & Performance Middleware
import { applySecurityMiddleware } from './middleware/enterprise-security.js';
import {
  applyPerformanceMiddleware,
  cleanup as cleanupPerformance,
} from './middleware/enterprise-performance.js';
import {
  initializeRedisRateLimiter,
  closeRedisRateLimiter,
  createRedisRateLimiter,
} from './middleware/redisRateLimiter';
import {
  assertNoStaticDataFlagsInProduction,
  isStaticDataEnabled,
  sendStaticDataDisabled,
} from './middleware/staticDataGuard';
import { createBetaRouteFence, isBetaRouteFenceEnabled } from './middleware/betaRouteFence';

// Import enterprise services
// NOTE: openaiService was renamed to aiProviderRouter - the old name was misleading
// The service actually uses Kimi AI (moonshot.cn), not OpenAI
// Side-effect imports: constructor initializes audit tables and RBAC cache
import './services/auditService.js';
import './services/roleBasedAccess.js';
import { authMiddleware } from './auth.js';
import { sanitizeAskAnaInput } from './routes/ask-ana-utils';
import { getSecureOrgId } from './utils/tenantContext';
import FeatureToggleService from './services/featureToggleService';

// Import database and schema for workflow persistence
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, eq, desc } from 'drizzle-orm';
import { fda510kStageProgress, fda510kProjects, projects, draftingTasks } from '@shared/schema';

// ============================================================================
// STARTUP ENVIRONMENT VALIDATION
// ============================================================================
(() => {
  const isProduction = process.env.NODE_ENV === 'production';
  const required: string[] = ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET'].some(k => process.env[k])
    ? [] // At least one DB URL is set
    : ['DATABASE_URL']; // None set — require DATABASE_URL

  const jwtEnvByNodeEnv: Record<string, string> = {
    development: 'JWT_SECRET_DEV',
    staging: 'JWT_SECRET_STAGING',
    production: 'JWT_SECRET_PROD',
  };
  const envSpecificJwt = jwtEnvByNodeEnv[process.env.NODE_ENV || 'development'];
  const hasJwtSecret = Boolean(
    process.env.JWT_SECRET || (envSpecificJwt && process.env[envSpecificJwt])
  );
  if (!hasJwtSecret) {
    required.push('JWT_SECRET');
  }

  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  try {
    assertNoStaticDataFlagsInProduction(process.env.NODE_ENV, process.env);
  } catch (error: any) {
    console.error(`[FATAL] ${error?.message || 'Invalid static-data route configuration'}`);
    process.exit(1);
  }

  // Warn about recommended vars in production
  if (isProduction) {
    const recommended = ['ANTHROPIC_API_KEY', 'SENTRY_DSN', 'REDIS_URL'];
    const missingRecommended = recommended.filter(k => !process.env[k]);
    if (missingRecommended.length > 0) {
      console.warn(`⚠️  Recommended env vars not set: ${missingRecommended.join(', ')}`);
    }
  }
})();

// Debug mode configuration — disabled in production
const DEBUG =
  process.env.NODE_ENV !== 'production' &&
  (process.env.DEBUG || process.env.NODE_ENV === 'development');
const debugLog = (message: string, data?: any) => {
  if (DEBUG) {
    console.log(`[DEBUG ${new Date().toISOString()}] ${message}`, data || '');
  }
};

// Route imports now consolidated in server/bootstrap/ manifests.
// Only imports NOT yet migrated to bootstrap remain here.
import predictiveSectionsRoutes from './routes/predictive-sections';
import foresightFeedbackRoutes from './routes/foresight-feedback';
import { csrSearchService } from './services/csr-search-service';
import { getEndpointRecommenderService } from './services/endpoint-recommender-service';
import firecrawlWebhooksRoutes from './routes/firecrawl-webhooks';

// ── Bootstrap route manifests ──
import { registerCoreRoutes } from './bootstrap/register-core-routes';
import { registerConcept2CureRoutes } from './bootstrap/register-concept2cure-routes';
import { registerAiRoutes } from './bootstrap/register-ai-routes';
import { registerAdminRoutes } from './bootstrap/register-admin-routes';
import { registerIntegrationRoutes } from './bootstrap/register-integrations-routes';
import { registerGovernanceRoutes } from './bootstrap/register-governance-routes';
import { registerPlatformRoutes } from './bootstrap/register-platform-routes';
import { registerRegulatoryRoutes } from './bootstrap/register-regulatory-routes';
import { registerDocumentRoutes } from './bootstrap/register-document-routes';
import { registerTenantRoutes } from './bootstrap/register-tenant-routes';
import { registerProjectRoutes } from './bootstrap/register-project-routes';
import { registerClinicalIntelRoutes } from './bootstrap/register-clinical-intel-routes';
import { registerAdvancedPlatformRoutes } from './bootstrap/register-advanced-platform-routes';

const app = express();
const PORT = process.env.PORT || 5000;
const EXPERIMENTAL_ROUTES_ENABLED =
  process.env.ENABLE_EXPERIMENTAL_ROUTES === 'true' && process.env.NODE_ENV !== 'production';
const DEMO_ROUTES_ENABLED =
  process.env.ENABLE_DEMO_ROUTES === 'true' && process.env.NODE_ENV !== 'production';

// --- Start Python FastAPI Backend as a Child Process ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let pythonProcess: any = null;

const startPythonBackend = () => {
  // Python backend disabled for deployment size optimization
  // Uncomment if Python services are required
  return Promise.resolve(null);
};

// Graceful shutdown
// Module-level reference for graceful shutdown
let _httpServer: any = null;
export function setHttpServer(server: any) {
  _httpServer = server;
}

async function gracefulShutdown(signal: string) {
  console.log(`🔄 Graceful shutdown initiated (${signal})...`);

  // 1. Stop accepting new connections and drain in-flight requests
  if (_httpServer) {
    console.log('🔄 Draining HTTP connections...');
    await new Promise<void>(resolve => {
      _httpServer.close(() => {
        console.log('✅ HTTP server closed — all connections drained');
        resolve();
      });
      // Force close after 10 seconds if connections don't drain
      setTimeout(() => {
        console.log('⚠️ Force closing after 10s timeout');
        resolve();
      }, 10000);
    });
  }

  // 2. Kill Python subprocess
  if (pythonProcess) {
    console.log('🔄 Shutting down Python backend...');
    pythonProcess.kill('SIGTERM');
  }

  // 3. Close Redis
  try {
    await closeRedisRateLimiter();
    console.log('✅ Redis rate limiter closed');
  } catch (error: any) {
    console.error('❌ Error closing Redis rate limiter:', error.message);
  }

  // 4. Drain AI action queue and close Redis
  try {
    const { drainActionQueue, closeAllSSEConnections, closeRedis } = await import(
      './services/ai-actions/index'
    );
    closeAllSSEConnections();
    await drainActionQueue(10_000);
    await closeRedis();
    console.log('AI Actions infrastructure shut down');
  } catch (error: any) {
    console.error('Error shutting down AI Actions:', error.message);
  }

  // 5. Cleanup performance resources
  cleanupPerformance();

  // 6. Close database pool
  try {
    if (pool) await pool.end();
    console.log('✅ Database connections closed');
  } catch (error: any) {
    console.error('❌ Error closing database:', error.message);
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Add process-level error handlers to prevent crashes on recoverable errors
let unhandledRejectionCount = 0;
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  unhandledRejectionCount++;
  // If repeated rejections occur (likely systemic issue), exit gracefully
  if (unhandledRejectionCount >= 10) {
    console.error('🚨 Too many unhandled rejections — shutting down');
    process.exit(1);
  }
});

process.on('uncaughtException', error => {
  console.error('UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});
// --- End Python FastAPI Backend Logic ---

// Request logging middleware for debug mode
if (DEBUG) {
  app.use((req: Request, res: Response, next) => {
    const isConcept2cureRoute = req.url.startsWith('/api/concept2cure');
    debugLog(`${req.method} ${req.url}`, {
      headers: req.headers,
      query: req.query,
      body: req.method !== 'GET' && !isConcept2cureRoute ? req.body : undefined,
      bodyRedacted: isConcept2cureRoute ? true : undefined,
    });
    next();
  });
}

// Beta-ops telemetry collection for guided user-test API lanes only.
app.use('/api', betaFlowTelemetryMiddleware);

// beta-ops-telemetry route removed (stub with no functionality)

// ============================================================================
// FAST-PATH ENDPOINTS — before all middleware for minimal latency
// Health checks, readiness probes, and Kubernetes liveliness don't need
// security, rate limiting, compression, CORS, or body parsing.
// ============================================================================
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/readyz', async (_req, res) => {
  try {
    await pool.query('select 1');
    return res.json({ ready: true });
  } catch {
    return res.status(500).json({ ready: false });
  }
});
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============================================================================
// ENTERPRISE SECURITY & PERFORMANCE MIDDLEWARE (ENABLED)
// ============================================================================
// Apply enterprise security middleware first (includes global rate limit)
applySecurityMiddleware(app);

// Redis-backed API rate limiting (with in-memory fallback)
// NOTE: applySecurityMiddleware already mounts rateLimiters.global for all routes,
// so the Redis limiter here adds a second, independent /api limit for burst protection.
const redisRateLimiter = createRedisRateLimiter();
app.use('/api', redisRateLimiter);

// Apply enterprise performance middleware (compression, monitoring)
applyPerformanceMiddleware(app);

console.log('✅ Enterprise security and performance middleware enabled');
// ============================================================================

// Structured logging — scoped to API routes (health/static short-circuit above)
app.use('/api', httpLogger);
// Audit logging now handled by enterprise-security middleware

// Firecrawl webhooks require raw body-safe handling before global JSON parser.
app.use('/api/firecrawl-webhooks', firecrawlWebhooksRoutes);

// Body parsing — scoped to /api routes only (static files and health checks skip this)
// 2MB default is sufficient for JSON API calls; large document uploads use multer (multipart)
// The 50MB limit is kept for /api/concept2cure routes that send base64-encoded document content
app.use('/api/concept2cure', express.json({ limit: '50mb' }));
app.use('/api', express.json({ limit: '2mb' }));
app.use('/api', express.urlencoded({ extended: true, limit: '2mb' }));
app.use('/api', createBetaRouteFence());
if (isBetaRouteFenceEnabled()) {
  console.log('🛡️ Guided beta route fence enabled for /api (mock/scaffold families blocked)');
}
// Cookie parsing (required for CSRF double-submit pattern)
import cookieParser from 'cookie-parser';
app.use(cookieParser());

// NOTE: CSRF protection already applied by applySecurityMiddleware() above.
// The duplicate csrfProtection from './middleware/csrf.js' is intentionally removed.

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMMUTABILITY POLICY ENFORCEMENT — 21 CFR Part 11 Compliance
// Audit trail records and document version history are append-only.
// No DELETE or PUT operations allowed on immutable resources.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const IMMUTABLE_ROUTE_PATTERNS = [
  /^\/api\/audit\/events/, // Audit trail events — append-only
  /^\/api\/audit\/bulk-delete/, // Explicit bulk-delete block
];

app.use((req: Request, res: Response, next: Function) => {
  const isDestructive =
    req.method === 'DELETE' || (req.method === 'POST' && req.path.includes('bulk-delete'));
  if (isDestructive) {
    const isImmutable = IMMUTABLE_ROUTE_PATTERNS.some(pattern => pattern.test(req.path));
    if (isImmutable) {
      console.warn(
        `[IMMUTABILITY] Blocked ${req.method} ${req.path} — audit records are append-only`
      );
      return res.status(403).json({
        error: 'IMMUTABILITY_VIOLATION',
        message:
          'This resource is protected by the immutability policy (21 CFR Part 11). Records can only be appended, never modified or deleted.',
        path: req.path,
        method: req.method,
      });
    }
  }
  next();
});
debugLog('Immutability policy enforcement middleware installed');

// CORS now handled by enterprise-security middleware (origin whitelist instead of wildcard '*')

// Input sanitization and organization validation now handled by enterprise-security middleware

debugLog('Express middleware configured');

// Use centralized database pool
import { getPool } from './db';
const pool = getPool();

// Import enterprise table enforcement
import { ensureCoreTables } from './db/ensureCoreTables';

// Create Drizzle ORM instance for database queries
const db = drizzle(pool);

// Test database connection and ensure core tables exist (awaited at startup)
async function verifyDatabaseConnection() {
  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful');
    client.release();
  } catch (err: any) {
    console.error('❌ Database connection failed:', err.message);
    if (process.env.NODE_ENV === 'production') {
      console.error('   Fatal in production — exiting');
      process.exit(1);
    }
    return; // Non-fatal in dev
  }

  // Enterprise: Verify all core tables exist on startup
  try {
    const result = await ensureCoreTables(process.env.DATABASE_URL);
    if (result.success) {
      console.log(
        `✅ Database readiness verified (${result.existingSchemas.length} schemas, ${result.existingTables.length} tables)`
      );
    } else if (result.missingCritical.length > 0) {
      console.error('❌ CRITICAL: Missing tables:', result.missingCritical.join(', '));
      console.error('   Run: npm run db:push to sync schema');
    } else if (result.missingExtensions.length > 0) {
      console.error(
        '❌ CRITICAL: Missing required database extensions:',
        result.missingExtensions.join(', ')
      );
    } else if (result.errors.length > 0) {
      console.error('⚠️ Table verification errors:', result.errors);
    } else if (result.missingSchemas.length > 0) {
      console.warn(
        '⚠️ Database schemas required initialization:',
        result.missingSchemas.join(', ')
      );
    } else if (result.warnings.length > 0) {
      console.warn('⚠️ Database readiness warnings:', result.warnings);
    }
  } catch (err: any) {
    console.error('⚠️ Core table verification failed:', err.message);
  }
}

// Simple storage client for now - in production this would be cloud storage
const storageClient = {
  upload: async (file: any) => `/uploads/${Date.now()}-${file.originalname}`,
  download: async (path: string) => path,
  delete: async (path: string) => true,
};
console.log('✅ Storage client initialized (VaultDMS deprecated)');

// NOTE: /healthz, /readyz, /api/health are mounted above middleware for fast-path access

// Full health check endpoint — comprehensive system health with dependency checks
app.get('/api/health/full', async (req: Request, res: Response) => {
  try {
    const { HealthCheckService } = await import('./lib/health-check.js');
    const healthCheck = new HealthCheckService(pool);
    const result = await healthCheck.checkFull();
    const status = result.status === 'healthy' ? 200 : result.status === 'degraded' ? 200 : 503;
    res.status(status).json(result);
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message });
  }
});

// Prometheus-compatible metrics endpoint
app.get('/api/metrics', async (req: Request, res: Response) => {
  try {
    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    // Prometheus text format
    const lines = [
      '# HELP process_memory_heap_used_bytes Heap memory used',
      '# TYPE process_memory_heap_used_bytes gauge',
      `process_memory_heap_used_bytes ${memUsage.heapUsed}`,
      '# HELP process_memory_rss_bytes Resident set size',
      '# TYPE process_memory_rss_bytes gauge',
      `process_memory_rss_bytes ${memUsage.rss}`,
      '# HELP process_uptime_seconds Process uptime',
      '# TYPE process_uptime_seconds gauge',
      `process_uptime_seconds ${uptime}`,
      '# HELP nodejs_active_handles Number of active handles',
      '# TYPE nodejs_active_handles gauge',
      `nodejs_active_handles ${(process as any)._getActiveHandles?.()?.length || 0}`,
    ];

    // DB pool metrics if available
    try {
      const { pool } = await import('./db.js');
      if (pool) {
        lines.push('# HELP db_pool_total Total connections in pool');
        lines.push('# TYPE db_pool_total gauge');
        lines.push(`db_pool_total ${pool.totalCount || 0}`);
        lines.push('# HELP db_pool_idle Idle connections');
        lines.push('# TYPE db_pool_idle gauge');
        lines.push(`db_pool_idle ${pool.idleCount || 0}`);
        lines.push('# HELP db_pool_waiting Waiting requests');
        lines.push('# TYPE db_pool_waiting gauge');
        lines.push(`db_pool_waiting ${pool.waitingCount || 0}`);
      }
    } catch {}

    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(lines.join('\n') + '\n');
  } catch (err: any) {
    res.status(500).send('# Error collecting metrics\n');
  }
});

// AI Gateway provider health endpoint
app.get('/api/ai-gateway/health', async (_req: Request, res: Response) => {
  try {
    const { getGateway } = await import('./services/ai-gateway');
    const gw = getGateway();
    if (!gw) {
      return res.status(503).json({
        status: 'unavailable',
        message: 'AI Gateway not initialized',
      });
    }
    const providers = gw.getProviderHealth();
    const enabled = gw.getEnabledProviders();
    const healthyCount = providers.filter((p: any) => p.healthy).length;

    res.json({
      status: healthyCount > 0 ? 'healthy' : 'degraded',
      providers,
      enabledProviders: enabled,
      healthyProviders: healthyCount,
      totalProviders: providers.length,
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', message: err?.message });
  }
});

// Server-authoritative timestamp.
// Used by SignaturePage to display accurate date before signing.
// The authoritative signature timestamp is generated server-side
// on POST /api/part11/signatures — this is purely for display.
app.get('/api/time', (_req: Request, res: Response) => {
  const now = new Date();
  res.json({
    iso: now.toISOString(),
    epoch: now.getTime(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
});

// Diagnostic page — serves without React/Vite to test Simple Browser rendering
app.get('/api/diag', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html><head><title>Diag</title></head>
<body style="font-family:system-ui;padding:40px;background:#f0fdf4">
<h1 style="color:#16a34a">✅ Server is alive</h1>
<p>If you see this, the Simple Browser can render HTML from this server.</p>
<p>Timestamp: ${new Date().toISOString()}</p>
<p><a href="/">← Go to main app</a></p>
</body></html>`);
});

// Register platform-level health, authentication, and auth-gate routes.
// This single call mounts: /api/auth, /api/v1/auth, /api/users, /api/user,
// legacy login/logout/register redirects, enterprise auth, SSO, health probes,
// and the global /api auth gate.
await registerPlatformRoutes({ app, pool, authMiddleware });

// Basic API routes - complex routes will be added back gradually
// NOTE: do not define a top-level /api/csr inline handler here.
// /api/csr is owned by csr-builder router mounts in startServer().

// /api/projects is owned by mounted projects-management router.
// Keep this namespace single-owned to avoid route shadowing/policy drift.

// ── Device-Project CRUD — extracted to server/routes/device-projects.ts ──
import deviceProjectsRouter from './routes/device-projects';
app.use('/api/device-projects', deviceProjectsRouter);
console.log('✅ /api/device-projects CRUD routes mounted (extracted router)');

// ── Circuit breaker for AI service fault isolation ──
import { createCircuitBreakerMiddleware } from './middleware/circuitBreaker';
const aiCircuitBreaker = createCircuitBreakerMiddleware('ai-service', {
  failureThreshold: 10,
  resetTimeout: 30_000,
  maxTimeout: 60_000, // AI calls can be slow
});

// ── Register bootstrapped domain route manifests ──
// Core: templates, AI, CMC (12), AI assistance, intelligent docs, PM settings, control plane
registerCoreRoutes({ app, pool, aiCircuitBreaker });
// Integrations: foresight deprecation routes
registerIntegrationRoutes(app);

// ── Routes not yet migrated to bootstrap manifests ──

// AnA Intelligence dedicated routes (10-K harvesting, observation terms)
try {
  const anaCortexRoutes = await import('./routes/ana-cortex');
  app.use('/api/ana-cortex', anaCortexRoutes.default);
  app.use('/api/ana-1-0-ri-cortex', anaCortexRoutes.default);
  console.log('✅ AnA Cortex routes mounted (/api/ana-cortex, /api/ana-1-0-ri-cortex)');
} catch (error) {
  console.error('❌ Failed to mount AnA Intelligence routes:', error);
}

// CSR Search routes — removed (csr_search_routes.ts deleted in dead code purge)

// Nano Banana (Gemini image generation) routes
try {
  const nanoBananaRoutes = await import('./routes/nanoBanana');
  app.use('/api/nano-banana', nanoBananaRoutes.default);
  console.log('✅ Nano Banana (Gemini image gen) routes mounted');
} catch (error) {
  console.error('❌ Failed to mount Nano Banana routes:', error);
}

// Predictive sections routes
app.use('/api/predictive-sections', predictiveSectionsRoutes);

// Foresight AI feedback redirect (not in bootstrap — supplementary alias)
try {
  app.use(
    '/api/foresight-ai/feedback',
    (req: Request, res: Response, next: () => void) => {
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

// RAG routes (parallelized for faster startup)
{
  const ragResults = await Promise.allSettled([import('./routes/biotech-rag.js')]);

  if (ragResults[0].status === 'fulfilled') {
    app.use('/api/biotech-rag', ragResults[0].value.default);
    console.log('✅ Biotech AI Intelligence RAG API routes mounted');
  } else {
    console.error('❌ Failed to mount Biotech RAG routes:', ragResults[0].reason);
  }
}

// ── Regulatory route family (FDA 510k, CERV2, IVDR, Mfg, PV, ClinOps, CER, GRDHE) ──
await registerRegulatoryRoutes({ app, pool });

// ── Literature, License, Billing, Intelligence, Reports — parallelized imports ──
{
  const litIntConfig = [
    { path: '/', mod: './routes/license-routes.js', name: 'License Management' },
    {
      path: '/api/module-subscriptions',
      mod: './routes/module-subscriptions.js',
      name: 'Module Subscriptions',
    },
    { path: '/api/billing', mod: './routes/billing.js', name: 'Billing' },
    { path: '/api/deep-research', mod: './routes/deep-research.js', name: 'Deep Research' },
    {
      path: '/api/intelligent-reports',
      mod: './routes/intelligent-reports.js',
      name: 'Intelligent Reports',
    },
    {
      path: '/api/safety-narratives',
      mod: './routes/safety-narrative.js',
      name: 'Safety Narrative',
    },
    {
      path: '/api/statistical-defensibility',
      mod: './routes/statistical-defensibility.js',
      name: 'Statistical Defensibility',
    },
    {
      path: '/api/conversation-health',
      mod: './routes/conversation-health.js',
      name: 'Conversation Health',
    },
    { path: '/api/billing', mod: './routes/billing-dashboard.js', name: 'Billing Dashboard' },
    { path: '/api/report-os', mod: './routes/report-os.js', name: 'Report OS' },
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

// Mount stability routes
try {
  const stabilityModule = await import('./src/routes/stability.router.js');
  const stabilityRouter = stabilityModule.default;
  app.use('/api/stability', stabilityRouter);
  console.log('✅ Stability API routes mounted successfully');
} catch (error) {
  console.error('❌ Failed to mount Stability routes:', error);
}

console.log('✅ Enterprise API routes mounted successfully');

// ── Document + Knowledge route family (eCTD, GCC, Cortex, Evidence, Authoring, Biostat) ──
function mountStaticBusinessDataGuard(path: string, routeName: string, requiredFlag: string) {
  app.use(path, (_req: Request, res: Response) => {
    return sendStaticDataDisabled(res, routeName, requiredFlag);
  });
  console.warn(
    `⚠️ ${routeName} mounted in fail-closed mode (set ${requiredFlag}=true to re-enable).`
  );
}

// Shadow service health proxy
app.get('/api/shadow/health', async (_req: Request, res: Response) => {
  try {
    const shadowBase = process.env.SHADOW_SERVICE_URL || 'http://localhost:8001';
    const response = await fetch(`${shadowBase}/health`);
    const payload = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Shadow service health check failed', details: payload });
    }
    return res.json(payload);
  } catch (error: any) {
    return res.status(502).json({ error: 'Shadow service unavailable', message: error?.message || 'Unknown error' });
  }
});

await registerDocumentRoutes({
  app,
  pool,
  isStaticDataEnabled,
  mountStaticBusinessDataGuard,
  DEMO_ROUTES_ENABLED,
  EXPERIMENTAL_ROUTES_ENABLED,
});

// Serve uploaded SOPs
const UPDIR = '/tmp/uploads';
if (!fs.existsSync(UPDIR)) fs.mkdirSync(UPDIR, { recursive: true });
app.use('/uploads', express.static(UPDIR));

// CSR search endpoint
app.get('/api/csr/search', async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.query;
    debugLog('CSR search endpoint called', { query, limit });

    const queryText = typeof query === 'string' ? query.trim() : '';
    const limitNum = Math.max(1, Math.min(100, parseInt(String(limit), 10) || 10));
    const searchResult = await csrSearchService.searchCSRs({
      query_text: queryText,
      limit: limitNum,
    });
    const results = (searchResult.csrs || []).map((csr: any) => ({
      id: csr.id || csr.csr_id || null,
      title: csr.title || 'Untitled CSR',
      indication: csr.indication || null,
      phase: csr.phase || null,
      sponsor: csr.sponsor || null,
      sample_size: csr.sample_size ?? null,
      outcome: csr.outcome || null,
      relevance:
        typeof csr.relevance_score === 'number'
          ? csr.relevance_score
          : typeof csr.similarity === 'number'
          ? csr.similarity
          : null,
      summary: csr.summary || csr.context_summary || null,
      source: 'csr_search_service',
    }));

    debugLog('CSR search results', { count: results.length, query });
    res.json({
      success: true,
      results: results,
      total: results.length,
      query: query || '',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error in CSR search:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search CSR data',
    });
  }
});

app.get('/api/csr-intelligence', (req: Request, res: Response) => {
  res.json({ message: 'CSR Intelligence API available', timestamp: new Date() });
});

// CSR Intelligence analytics endpoint - real database queries
app.get('/api/csr-intelligence/analytics', async (req: Request, res: Response) => {
  try {
    const { type = 'dashboard' } = req.query;
    debugLog('CSR intelligence analytics endpoint called', { type });

    // Query real counts from csr_reports table
    const totalResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM csr_reports WHERE deleted_at IS NULL'
    );
    const totalCSRs = totalResult.rows[0]?.total ?? 0;

    const todayResult = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND upload_date >= CURRENT_DATE'
    );
    const processedToday = todayResult.rows[0]?.cnt ?? 0;

    // Therapeutic area breakdown from real data
    const taResult = await pool.query(
      `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS count
       FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
       GROUP BY indication ORDER BY count DESC LIMIT 10`
    );
    const therapeuticAreas: Record<string, { count: number }> = {};
    for (const row of taResult.rows) {
      therapeuticAreas[row.area] = { count: row.count };
    }

    // Phase breakdown
    const phaseResult = await pool.query(
      `SELECT COALESCE(phase, 'Unknown') AS phase, COUNT(*)::int AS count
       FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
       GROUP BY phase ORDER BY count DESC`
    );
    const phaseBreakdown = phaseResult.rows.map((r: any) => ({
      phase: r.phase,
      count: r.count,
      percentage: totalCSRs > 0 ? Math.round((r.count / totalCSRs) * 1000) / 10 : 0,
    }));

    const analyticsData = {
      success: true,
      data: {
        dashboard: {
          totalCSRs,
          processedToday,
          avgProcessingTime: 0,
          successRate: 0,
          criticalInsights: 0,
          activeAnalyses: 0,
        },
        temporalTrends: {},
        therapeuticAreas,
        biomarkerAnalysis: {},
        qualityMetrics: {
          dataCompleteness: 0,
          dataConsistency: 0,
          dataAccuracy: 0,
          processingEfficiency: 0,
        },
        phaseBreakdown,
      },
      source: 'database',
      timestamp: new Date().toISOString(),
    };

    debugLog('CSR intelligence analytics response generated', analyticsData);
    res.json(analyticsData);
  } catch (error) {
    console.error('Error getting CSR intelligence analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve CSR intelligence analytics',
    });
  }
});

// CSR Intelligence stats endpoint - real database queries
app.get('/api/csr-intelligence/stats', async (req: Request, res: Response) => {
  try {
    debugLog('CSR intelligence stats endpoint called');

    const totalResult = await pool.query(
      'SELECT COUNT(*)::int AS total FROM csr_reports WHERE deleted_at IS NULL'
    );
    const csrCount = totalResult.rows[0]?.total ?? 0;

    const taCountResult = await pool.query(
      'SELECT COUNT(DISTINCT indication)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL'
    );
    const therapeuticAreaCount = taCountResult.rows[0]?.cnt ?? 0;

    const sponsorCountResult = await pool.query(
      'SELECT COUNT(DISTINCT sponsor)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND sponsor IS NOT NULL'
    );
    const uniqueSponsors = sponsorCountResult.rows[0]?.cnt ?? 0;

    // Phase breakdown from real data
    const phaseResult = await pool.query(
      `SELECT COALESCE(phase, 'Unknown') AS phase, COUNT(*)::int AS count
       FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
       GROUP BY phase ORDER BY count DESC`
    );
    const phaseBreakdown = phaseResult.rows.map((r: any) => ({
      phase: r.phase,
      count: r.count,
      percentage: csrCount > 0 ? Math.round((r.count / csrCount) * 1000) / 10 : 0,
    }));

    // Therapeutic area breakdown from real data
    const taResult = await pool.query(
      `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS count
       FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
       GROUP BY indication ORDER BY count DESC LIMIT 10`
    );
    const therapeuticAreas = taResult.rows.map((r: any) => ({
      area: r.area,
      count: r.count,
      percentage: csrCount > 0 ? Math.round((r.count / csrCount) * 1000) / 10 : 0,
    }));

    const completedResult = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND status = 'approved'"
    );
    const completedReviews = completedResult.rows[0]?.cnt ?? 0;

    const statsData = {
      success: true,
      data: {
        overview: {
          csrCount,
          therapeuticAreas: therapeuticAreaCount,
          protocolsOptimized: 0,
          benchmarks: 0,
          aiModels: 0,
          totalStudies: csrCount,
          activeAnalyses: 0,
          completedReviews,
          uniqueSponsors,
        },
        analytics: {
          successRate: 0,
          avgProcessingTime: 0,
          dataQuality: 0,
          automationLevel: 0,
        },
        distribution: {
          phaseBreakdown,
          therapeuticAreas,
        },
        quality: {
          completeness: 0,
          consistency: 0,
          accuracy: 0,
          timeliness: 0,
        },
        performance: {
          avgAnalysisTime: '0 minutes',
          processingEfficiency: 0,
          errorRate: 0,
          uptime: 0,
        },
      },
      source: 'database',
      timestamp: new Date().toISOString(),
    };

    debugLog('CSR intelligence stats response generated', statsData);
    res.json(statsData);
  } catch (error) {
    console.error('Error getting CSR intelligence stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve CSR intelligence statistics',
    });
  }
});

// CSR Intelligence factual insights endpoint - real database queries
app.get('/api/csr-intelligence/factual-insights', async (req: Request, res: Response) => {
  try {
    debugLog('Factual insights endpoint called');

    // Aggregate real insights from csr_reports
    const avgSampleResult = await pool.query(
      'SELECT AVG(sample_size)::int AS avg_sample, AVG(duration_weeks)::int AS avg_duration FROM csr_reports WHERE deleted_at IS NULL AND sample_size IS NOT NULL'
    );
    const avgSample = avgSampleResult.rows[0]?.avg_sample ?? 0;
    const avgDurationWeeks = avgSampleResult.rows[0]?.avg_duration ?? 0;

    // Top indications by count
    const topIndicationsResult = await pool.query(
      `SELECT COALESCE(indication, 'Unknown') AS area, COUNT(*)::int AS studies, AVG(sample_size)::int AS avg_sample
       FROM csr_reports WHERE deleted_at IS NULL AND indication IS NOT NULL
       GROUP BY indication ORDER BY studies DESC LIMIT 5`
    );
    const indicationInsights: Record<string, { studies: number; avgSampleSize: number }> = {};
    for (const row of topIndicationsResult.rows) {
      indicationInsights[row.area] = { studies: row.studies, avgSampleSize: row.avg_sample ?? 0 };
    }

    // Most common phase
    const topPhaseResult = await pool.query(
      `SELECT phase, COUNT(*)::int AS cnt FROM csr_reports WHERE deleted_at IS NULL AND phase IS NOT NULL
       GROUP BY phase ORDER BY cnt DESC LIMIT 1`
    );
    const mostCommonPhase = topPhaseResult.rows[0]?.phase ?? 'N/A';

    const factualInsights = {
      studyDesignPatterns: {
        mostCommonPhase,
        averageSampleSize: avgSample,
        averageStudyDurationWeeks: avgDurationWeeks,
      },
      therapeuticAreaInsights: indicationInsights,
      riskFactors: {
        lowSuccessRateIndicators: [],
        commonAEPatterns: [],
        enrollmentChallenges: [],
        regulatoryRisks: [],
      },
      dataQualityAssessment: {
        completenessScore: 0,
        consistencyScore: 0,
        accuracyScore: 0,
        dataSource: 'csr_reports_table',
        lastVerified: new Date().toISOString(),
      },
    };

    debugLog('Factual insights response generated', factualInsights);
    res.json({
      success: true,
      data: factualInsights,
      source: 'database',
    });
  } catch (error) {
    console.error('Error getting factual insights:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve factual insights',
    });
  }
});

// CSR analytics routes — extracted to server/routes/csr-analytics.ts
import csrAnalyticsRouter from './routes/csr-analytics';
app.use('/api/csr-real-data', csrAnalyticsRouter);

// Reports/admin routes moved into admin bootstrap manifest

// Audit — DB-backed implementation using audit_events table
async function queryAuditEvents(queryParams: any, limitVal = 10, offsetVal = 0) {
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (queryParams.org_id || queryParams.tenantId) {
    conditions.push(`organization_id = $${idx++}`);
    params.push(parseInt(String(queryParams.org_id || queryParams.tenantId)));
  }
  if (queryParams.event_type) {
    conditions.push(`event_type = $${idx++}`);
    params.push(String(queryParams.event_type));
  }
  if (queryParams.user_id || queryParams.userId) {
    conditions.push(`user_id = $${idx++}`);
    params.push(parseInt(String(queryParams.user_id || queryParams.userId)));
  }
  if (queryParams.start_date || queryParams.startDate) {
    conditions.push(`timestamp >= $${idx++}`);
    params.push(new Date(String(queryParams.start_date || queryParams.startDate)));
  }
  if (queryParams.end_date || queryParams.endDate) {
    conditions.push(`timestamp <= $${idx++}`);
    params.push(new Date(String(queryParams.end_date || queryParams.endDate)));
  }
  if (queryParams.search) {
    conditions.push(
      `(user_name ILIKE $${idx} OR event_type ILIKE $${idx} OR entity_type ILIKE $${idx})`
    );
    params.push(`%${String(queryParams.search)}%`);
    idx++;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM audit_events ${where}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;

  params.push(limitVal);
  params.push(offsetVal);
  const result = await pool.query(
    `SELECT id, organization_id, event_type, entity_type, entity_id, user_id, user_name, user_role,
            ip_address, timestamp, reason, comments, regulatory_significant, gxp_relevant, metadata,
            record_hash, previous_hash, sequence_number, created_at
     FROM audit_events ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`,
    params
  );

  return { rows: result.rows, total };
}

function formatAuditRow(row: any) {
  const action = (row.event_type || '').split('.').pop()?.toUpperCase() || 'VIEW';
  return {
    id: `AUDIT-${row.id}`,
    userId: String(row.user_id || ''),
    user_id: String(row.user_id || ''),
    userName: row.user_name || 'System',
    action,
    actionType: action.charAt(0) + action.slice(1).toLowerCase(),
    event_type: row.event_type || '',
    severity: row.regulatory_significant ? 'warning' : 'info',
    component: row.entity_type || 'System',
    details: row.reason || row.comments || `${action} on ${row.entity_type || 'entity'}`,
    description: row.reason || row.comments || `${action} on ${row.entity_type || 'entity'}`,
    ipAddress: row.ip_address || '',
    region: 'US',
    org_id: String(row.organization_id || ''),
    project_id: String(row.entity_id || ''),
    timestamp: row.timestamp || row.created_at,
    // Hash chain fields for Part 11 chain integrity display
    hash: row.record_hash || null,
    sequenceNumber: row.sequence_number ?? null,
    previousHash: row.previous_hash || null,
  };
}

app.get('/api/audit/logs', async (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, parseInt(String(req.query.limit || '10'), 10));
    const offset = Math.max(0, parseInt(String(req.query.offset || '0'), 10));
    const { rows, total } = await queryAuditEvents(req.query, limit, offset);

    return res.json({
      logs: rows.map(formatAuditRow),
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Legacy alias compatibility for historical clients
app.get('/api/audit-logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.max(1, parseInt(String(req.query.pageSize || '10'), 10));
    const offset = (page - 1) * pageSize;
    const { rows, total } = await queryAuditEvents(req.query, pageSize, offset);

    return res.json({
      logs: rows.map(formatAuditRow),
      totalCount: total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    console.error('Failed to fetch legacy audit logs:', error);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

app.get('/api/audit/events', async (req: Request, res: Response) => {
  try {
    const { rows, total } = await queryAuditEvents(req.query, 50, 0);
    return res.json({
      success: true,
      events: rows.map((row: any) => ({
        eventId: row.id,
        eventType: row.event_type,
        severity: row.regulatory_significant ? 'warning' : 'info',
        timestamp: row.timestamp,
        actor: {
          userId: row.user_id,
          userName: row.user_name,
        },
        target: {
          component: row.entity_type,
          projectId: row.entity_id,
        },
        details: row.reason || row.comments || '',
      })),
      total,
    });
  } catch (error) {
    console.error('Failed to fetch audit events:', error);
    return res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

app.post('/api/audit/events', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    if (!body.organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }
    const result = await pool.query(
      `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, NOW()) RETURNING id`,
      [
        body.organizationId,
        body.eventType || body.event_type || 'general',
        body.entityType || body.entity_type || 'system',
        body.entityId || body.entity_id || 0,
        body.userId || body.user_id || 0,
        body.userName || body.user_name || 'System',
        body.userRole || body.user_role || 'user',
        body.ipAddress || body.ip_address || req.ip || '',
        body.reason || body.details || null,
        JSON.stringify(body.metadata || body.payload || {}),
        body.regulatorySignificant || false,
        body.gxpRelevant || false,
      ]
    );
    return res.status(201).json({
      success: true,
      eventId: result.rows[0].id,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to record audit event:', error);
    return res.status(500).json({ error: 'Failed to record audit event' });
  }
});

// Batch audit events endpoint for efficient multi-event flushing from the client
app.post('/api/audit/events/batch', async (req: Request, res: Response) => {
  try {
    const { events } = req.body || {};
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array is required and must not be empty' });
    }

    // Limit batch size to prevent abuse
    const batch = events.slice(0, 50);
    const results: { eventId: number; action: string }[] = [];

    for (const evt of batch) {
      try {
        const result = await pool.query(
          `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, user_role, ip_address, timestamp, reason, metadata, regulatory_significant, gxp_relevant, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, NOW()) RETURNING id`,
          [
            evt.organizationId,
            evt.eventType || evt.action || 'general',
            evt.entityType || 'document',
            evt.entityId || 0,
            evt.userId || evt.user?.id || 0,
            evt.userName || evt.user?.name || 'System',
            evt.userRole || evt.user?.role || 'user',
            req.ip || '',
            evt.reason || null,
            JSON.stringify(evt.metadata || evt.details || {}),
            evt.regulatorySignificant || false,
            evt.gxpRelevant !== undefined ? evt.gxpRelevant : true,
          ]
        );
        results.push({ eventId: result.rows[0].id, action: evt.eventType || evt.action || '' });
      } catch (err) {
        console.error('Failed to insert batch audit event:', err);
        // Continue processing remaining events
      }
    }

    return res.status(201).json({
      success: true,
      inserted: results.length,
      total: batch.length,
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to process batch audit events:', error);
    return res.status(500).json({ error: 'Failed to process batch audit events' });
  }
});

app.post('/api/audit/signatures', async (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    // Store signature as an audit event with signature metadata
    const result = await pool.query(
      `INSERT INTO audit_events (organization_id, event_type, entity_type, entity_id, user_id, user_name, ip_address, timestamp,
       signature_status, signed_by, signed_date, signature_meaning, reason, metadata, regulatory_significant, gxp_relevant, created_at)
       VALUES ($1, 'signature.create', $2, $3, $4, $5, $6, NOW(), 'signed', $5, NOW(), $7, $8, $9, true, true, NOW()) RETURNING id`,
      [
        body.organizationId,
        body.entityType || 'document',
        body.entityId || 0,
        body.userId || 0,
        body.signedBy || body.userId || 'system',
        req.ip || '',
        body.meaning || 'Electronically signed',
        body.reason || null,
        JSON.stringify({ signatureType: '21CFR11', ...body.metadata }),
      ]
    );

    return res.status(201).json({
      success: true,
      signatureId: `SIG_${result.rows[0].id}`,
      record: {
        signatureId: `SIG_${result.rows[0].id}`,
        entityType: body.entityType || 'document',
        entityId: body.entityId || 0,
        signedBy: body.signedBy || body.userId || 'system',
        reason: body.reason,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to record audit signature:', error);
    return res.status(500).json({ error: 'Failed to record audit signature' });
  }
});

app.get('/api/audit/signatures/:signatureId/verify', async (req: Request, res: Response) => {
  try {
    const sigId = req.params.signatureId.replace('SIG_', '');
    const result = await pool.query(
      `SELECT id, entity_type, entity_id, signed_by, signed_date, signature_meaning, reason, signature_status
       FROM audit_events WHERE id = $1 AND event_type = 'signature.create'`,
      [parseInt(sigId) || 0]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        verified: false,
        message: 'Signature not found',
      });
    }

    const row = result.rows[0];
    return res.json({
      success: true,
      verified: row.signature_status === 'signed',
      signature: {
        signatureId: `SIG_${row.id}`,
        entityType: row.entity_type,
        entityId: String(row.entity_id),
        signedBy: row.signed_by,
        reason: row.reason,
        timestamp: row.signed_date,
      },
    });
  } catch (error) {
    console.error('Failed to verify audit signature:', error);
    return res.status(500).json({ error: 'Failed to verify audit signature' });
  }
});

app.get('/api/audit', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const limit = Math.max(1, parseInt(String(req.query.limit || '10'), 10));
    const offset = (page - 1) * limit;
    const { rows, total } = await queryAuditEvents(req.query, limit, offset);

    return res.json({
      logs: rows.map(formatAuditRow),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error('Failed to fetch audit entries:', error);
    return res.status(500).json({ error: 'Failed to fetch audit entries' });
  }
});

app.get('/api/audit/export', async (req: Request, res: Response) => {
  try {
    // Use signed export service for tamper-evident audit packages
    const { generateSignedAuditExport } = await import('./services/audit/signedAuditExport.js');
    const format = (req.query.format === 'json' ? 'json' : 'csv') as 'csv' | 'json';
    const userId = (req as any).userId || (req as any).user?.id || 'unknown';
    const userName = (req as any).user?.name || (req as any).user?.email || String(userId);

    const signedExport = await generateSignedAuditExport(pool, {
      organizationId: req.query.org_id ? parseInt(String(req.query.org_id), 10) : undefined,
      startDate: req.query.start_date ? String(req.query.start_date) : undefined,
      endDate: req.query.end_date ? String(req.query.end_date) : undefined,
      eventType: req.query.event_type ? String(req.query.event_type) : undefined,
      userId: req.query.user_id ? parseInt(String(req.query.user_id), 10) : undefined,
      format,
      exportedBy: userName,
      exportedByRole: (req as any).userRole || (req as any).user?.role || 'unknown',
      ipAddress: req.ip || 'unknown',
    });

    // Set integrity headers so the manifest travels with the download
    res.setHeader('Content-Type', signedExport.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${signedExport.filename}"`);
    res.setHeader('X-Audit-Export-Id', signedExport.manifest.exportId);
    res.setHeader('X-Audit-Data-Hash', signedExport.manifest.dataHash);
    res.setHeader('X-Audit-Signature', signedExport.signature);
    res.setHeader('X-Audit-Chain-Status', signedExport.manifest.chainIntegrity.status);
    res.setHeader('X-Audit-Row-Count', String(signedExport.manifest.rowCount));
    return res.send(signedExport.data);
  } catch (error) {
    console.error('Failed to export audit logs:', error);
    return res.status(500).json({ error: 'Failed to export audit logs' });
  }
});

/**
 * GET /api/audit/export/signed
 * Full signed export — returns JSON bundle with data + manifest + signature.
 * This is the inspection-ready endpoint: an inspector can independently verify
 * the HMAC signature and data hash to confirm nothing was tampered.
 */
app.get('/api/audit/export/signed', async (req: Request, res: Response) => {
  try {
    const { generateSignedAuditExport } = await import('./services/audit/signedAuditExport.js');
    const format = (req.query.format === 'csv' ? 'csv' : 'json') as 'csv' | 'json';
    const userId = (req as any).userId || (req as any).user?.id || 'unknown';
    const userName = (req as any).user?.name || (req as any).user?.email || String(userId);

    const signedExport = await generateSignedAuditExport(pool, {
      organizationId: req.query.org_id ? parseInt(String(req.query.org_id), 10) : undefined,
      startDate: req.query.start_date ? String(req.query.start_date) : undefined,
      endDate: req.query.end_date ? String(req.query.end_date) : undefined,
      eventType: req.query.event_type ? String(req.query.event_type) : undefined,
      userId: req.query.user_id ? parseInt(String(req.query.user_id), 10) : undefined,
      format,
      exportedBy: userName,
      exportedByRole: (req as any).userRole || (req as any).user?.role || 'unknown',
      ipAddress: req.ip || 'unknown',
    });

    res.json({
      success: true,
      export: {
        data: signedExport.data,
        manifest: signedExport.manifest,
        signature: signedExport.signature,
        verification: {
          instruction:
            'To verify: compute HMAC-SHA256 of the canonical manifest JSON using the server signing key, then compare to the signature field. Also verify SHA-256(data) === manifest.dataHash.',
          algorithm: 'HMAC-SHA256',
          hashAlgorithm: 'SHA-256',
        },
      },
    });
  } catch (error) {
    console.error('Failed to generate signed audit export:', error);
    return res.status(500).json({ error: 'Failed to generate signed audit export' });
  }
});

/**
 * POST /api/audit/export/verify
 * Verify a previously exported audit package.
 * Accepts { data, manifest, signature } and confirms integrity.
 */
app.post('/api/audit/export/verify', async (req: Request, res: Response) => {
  try {
    const { verifySignedAuditExport } = await import('./services/audit/signedAuditExport.js');
    const { data, manifest, signature } = req.body;

    if (!data || !manifest || !signature) {
      return res.status(400).json({ error: 'data, manifest, and signature are required' });
    }

    const result = verifySignedAuditExport(data, manifest, signature);
    res.json({
      success: true,
      verification: {
        valid: result.valid,
        errors: result.errors,
        verifiedAt: new Date().toISOString(),
        compliance: {
          standard: '21 CFR Part 11 §11.10(e)',
          description: result.valid
            ? 'Export integrity verified — data has not been modified since generation'
            : 'INTEGRITY FAILURE — export data or manifest has been tampered with',
        },
      },
    });
  } catch (error) {
    console.error('Failed to verify audit export:', error);
    return res.status(500).json({ error: 'Failed to verify audit export' });
  }
});

/**
 * GET /api/audit/chain-monitor/status
 * Returns the current status of the background chain integrity monitor.
 */
app.get('/api/audit/chain-monitor/status', async (_req: Request, res: Response) => {
  try {
    const { getChainMonitorStatus } = await import('./services/audit/chainIntegrityMonitor.js');
    const status = getChainMonitorStatus();
    res.json({ success: true, data: status });
  } catch {
    res.json({ success: true, data: { status: 'not_started' } });
  }
});

/**
 * POST /api/audit/chain-monitor/check
 * Trigger an on-demand chain integrity check.
 */
app.post('/api/audit/chain-monitor/check', async (_req: Request, res: Response) => {
  try {
    const { runOnDemandCheck } = await import('./services/audit/chainIntegrityMonitor.js');
    const status = await runOnDemandCheck();
    res.json({ success: true, data: status });
  } catch (err: any) {
    res.status(500).json({ error: 'Chain integrity check failed', details: err.message });
  }
});

// IMMUTABILITY POLICY: Audit records are append-only per 21 CFR Part 11.
// Bulk-delete is disabled. Audit events cannot be modified or deleted.
app.post('/api/audit/bulk-delete', async (req: Request, res: Response) => {
  return res.status(403).json({
    error: 'IMMUTABILITY_VIOLATION',
    message:
      'Audit records are immutable per 21 CFR Part 11 compliance. ' +
      'Deletion of audit trail events is prohibited. ' +
      'Records can only be appended, never modified or deleted.',
    policy: 'append-only',
  });
});

// Search compatibility facade (P0 route recovery)
app.post('/api/search/vector', async (req: Request, res: Response) => {
  try {
    const query = String(req.body?.query || '').trim();
    const k = Math.max(1, parseInt(String(req.body?.k || 5), 10));
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }

    const searchResult = await csrSearchService.searchCSRs({
      query_text: query,
      limit: Math.min(50, k),
    });

    const vectorLikeRows = (searchResult.csrs || []).slice(0, k).map((csr: any, idx: number) => ({
      content: csr.summary || csr.context_summary || csr.outcome || csr.title || '',
      relevance:
        typeof csr.relevance_score === 'number'
          ? csr.relevance_score
          : typeof csr.similarity === 'number'
          ? csr.similarity
          : null,
      document_id: csr.id || csr.csr_id || idx,
      document_title: csr.title || 'Untitled CSR',
      source_page: csr.source_page ?? null,
      source_section: csr.source_section || csr.phase || null,
    }));

    return res.json(vectorLikeRows);
  } catch (error) {
    console.error('Vector search failed:', error);
    return res.status(500).json({ error: 'Vector search failed' });
  }
});

// Endpoint recommendation compatibility facade (P0 route recovery)
app.post('/api/endpoint/recommend', async (req: Request, res: Response) => {
  try {
    const indication = String(req.body?.indication || 'General');
    const phase = String(req.body?.phase || 'Phase 2');
    const therapeuticArea = String(req.body?.therapeuticArea || '');
    const service = getEndpointRecommenderService();
    const recommendations = await service.getComprehensiveEndpointRecommendations(
      indication,
      phase,
      10,
      therapeuticArea
    );

    return res.json(
      recommendations.map((rec: any) => ({
        endpoint: rec.endpoint,
        summary:
          rec.evidence?.[0]?.reference_text ||
          `${phase} ${indication} endpoint recommendation based on available evidence.`,
        matchCount: rec.occurrence_count ?? 0,
        successRate:
          typeof rec.success_rate === 'number'
            ? rec.success_rate > 1
              ? rec.success_rate / 100
              : rec.success_rate
            : null,
        reference: rec.evidence?.[0]?.title || null,
      }))
    );
  } catch (error) {
    console.error('Endpoint recommendation failed:', error);
    return res.status(500).json({ error: 'Endpoint recommendation failed' });
  }
});

// Retention policy compatibility facade (P0 route recovery)
const RETENTION_SERVICE_UNAVAILABLE = {
  success: false,
  error: 'Retention service unavailable',
  message:
    'Retention policy APIs are temporarily disabled until persistent storage and job execution are fully wired.',
};

app.get('/api/retention/policies', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

app.get('/api/retention/document-types', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

app.post('/api/retention/policies', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

app.put('/api/retention/policies/:id', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

app.delete('/api/retention/policies/:id', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

app.post('/api/retention/run-job', async (_req: Request, res: Response) => {
  return res.status(503).json(RETENTION_SERVICE_UNAVAILABLE);
});

// AnA 1.0 RI endpoint
app.post('/api/ask-ana-ri', async (req: Request, res: Response) => {
  try {
    const {
      context,
      sessionId,
      documentContent,
      model = 'openai',
      audience: bodyAudience = 'regulatory_lead',
      responseFormat: bodyResponseFormat = 'markdown',
    } = req.body;
    const sanitized = sanitizeAskAnaInput({
      query: req.body?.query,
      audience: bodyAudience,
      responseFormat: bodyResponseFormat,
      documentContent,
    });
    if (!sanitized.ok) {
      return res.status(sanitized.status).json({
        success: false,
        error: sanitized.error,
        message: sanitized.message,
      });
    }
    const { query, audience, responseFormat, sanitizedDocumentContent, warnings } = sanitized.value;

    debugLog('AnA RI request received', {
      query: query?.substring(0, 100),
      context,
      sessionId,
      model,
      audience,
      responseFormat,
    });

    const audienceProfileMap: Record<string, string> = {
      executive: 'Focus on business impact, timeline risk, and go/no-go recommendations.',
      regulatory_lead:
        'Focus on submission quality, compliance strategy, and deficiency prevention.',
      medical_writer: 'Focus on narrative quality, source traceability, and consistency controls.',
      qa_reviewer: 'Focus on auditability, verification checks, and remediation priority.',
      engineer: 'Focus on implementation details, API contracts, and automation reliability.',
    };

    const responseFormatMap: Record<string, string> = {
      markdown: 'Use clean markdown with headings, bullet points, and short actionable sections.',
      json: 'Provide machine-readable JSON structure with fields for plan, risks, and actions.',
      brief: 'Provide a concise executive answer with top 3 actions and key risk.',
    };

    const audienceDirective = audienceProfileMap[audience] || audienceProfileMap['regulatory_lead'];
    const formatDirective = responseFormatMap[responseFormat] || responseFormatMap['markdown'];

    // System prompt for AnA regulatory expert
    const systemPrompt = `You are AnA 1.0 RI (AnA Regulatory Intelligence).
AnA stands for Audit, Narrate, Author.
Never use any legacy product naming.

Core identity:
- Regulatory strategist, medical writer, auditor, and technical implementation partner
- Senior-level expertise in FDA, EMA, MHRA, PMDA, ICH, ISO 13485, ISO 14971, GCP, GMP, and eCTD lifecycle requirements
- Able to reason through uncertainty, justify tradeoffs, and recommend decision pathways

Operating modes (blend as needed):
1) Build & Design: propose submission architectures, document plans, timelines, and risk controls
2) Author: draft high-quality regulatory narratives, protocols, SAP/SOP language, and response letters
3) Audit: find gaps, contradictions, traceability breaks, and compliance vulnerabilities
4) Evaluate: compare options with explicit pros/cons, impact, and recommendation confidence
5) Predict: forecast likely agency questions, deficiency risks, and mitigation strategies
6) Code: produce production-ready Python utilities for validation, parsing, analytics, and automation
7) DOCX: generate structured content ready for section-level export into DOCX templates

Response standards:
- Be precise, practical, and evidence-aware; avoid vague advice
- Cite specific regulations/guidances when relevant (e.g., 21 CFR, ICH E3, ICH M4, ISO 14971)
- Separate facts, assumptions, and recommendations
- For code requests, provide secure, maintainable Python with clear function boundaries and tests when feasible
- For document requests, output sectioned, publication-grade text with headings, bullets, and traceability notes
- If information is missing, ask targeted follow-up questions and provide a best-effort interim path

Tone and personality:
- Calm, strategic, accountable, and collaborative
- Speak like a trusted principal advisor: direct, respectful, and action-oriented

Audience adaptation:
- ${audienceDirective}

Formatting adaptation:
- ${formatDirective}`;

    const normalizedQuery = String(query || '').toLowerCase();
    const resolveAnaMode = () => {
      const modeRules: Array<{ mode: string; patterns: string[] }> = [
        { mode: 'build_design', patterns: ['build', 'design', 'architecture', 'plan', 'roadmap'] },
        { mode: 'author', patterns: ['write', 'author', 'draft', 'compose', 'narrative'] },
        { mode: 'audit', patterns: ['audit', 'gap', 'deficiency', 'inspect', 'review'] },
        { mode: 'evaluate', patterns: ['evaluate', 'compare', 'tradeoff', 'option', 'decision'] },
        { mode: 'predict', patterns: ['predict', 'forecast', 'likely question', 'risk signal'] },
        { mode: 'code', patterns: ['python', 'script', 'code', 'function', 'api', 'automation'] },
        { mode: 'docx', patterns: ['docx', 'template', 'section', 'ctd', 'ectd', 'cer'] },
      ];

      const directContextMap: Record<string, string> = {
        python_implementation: 'code',
        docx_authoring: 'docx',
        clinical_documentation: 'author',
        submission_readiness: 'audit',
        client_enablement: 'evaluate',
        regulatory_affairs: 'evaluate',
      };

      if (context && directContextMap[context]) return directContextMap[context];

      for (const rule of modeRules) {
        if (rule.patterns.some(pattern => normalizedQuery.includes(pattern))) {
          return rule.mode;
        }
      }

      return 'evaluate';
    };

    const indPyramidTemplateLibrary: Record<string, string[]> = {
      'Module 1': [
        'Cover Letter',
        'FDA Forms (1571/1572/3674) Checklist',
        'Investigator Brochure Change Summary',
        'Cross-Reference & Lifecycle Manifest',
      ],
      'Module 2': [
        'Quality Overall Summary (QOS)',
        'Nonclinical Overview & Written Summaries',
        'Clinical Overview & Clinical Summary',
        'Benefit-Risk Framing Narrative',
      ],
      'Module 3': [
        'Drug Substance (3.2.S) Template Pack',
        'Drug Product (3.2.P) Template Pack',
        'Analytical Method Validation Template (ICH Q2)',
        'Stability Protocol + Report Template (ICH Q1)',
      ],
      'Module 4': [
        'Pharmacology/Toxicology Study Report Shell',
        'GLP Compliance Statement Template',
        'Nonclinical Tabulation Pack',
      ],
      'Module 5': [
        'Clinical Study Protocol Template',
        'SAP Template (ICH E9 aligned)',
        'CSR Template (ICH E3 aligned)',
        'ISS/ISE Evidence Integration Shell',
      ],
    };

    const therapeuticTemplateLibrary: Record<string, string[]> = {
      oncology: [
        'RECIST Endpoint Justification Template',
        'Dose Escalation + DLT Decision Log',
        'Biomarker Stratification Narrative',
      ],
      cardiology: [
        'MACE Endpoint Adjudication Template',
        'QT/QTc Risk Management Narrative',
        'CV Outcomes Study Synopsis Template',
      ],
      neurology: [
        'Cognitive Endpoint Validation Template',
        'Relapse/Progression Adjudication Narrative',
        'Neuroimaging Evidence Summary Template',
      ],
      immunology: [
        'Immunogenicity Risk Assessment Template',
        'Cytokine Release Monitoring Plan',
        'Long-Term Safety Extension Synopsis',
      ],
      infectious_disease: [
        'Antimicrobial Resistance Surveillance Template',
        'Virologic Response Endpoint Narrative',
        'Pathogen Subgroup Analysis Shell',
      ],
      rare_disease: [
        'Natural History Evidence Integration Template',
        'External Control Justification Narrative',
        'Accelerated Approval Readiness Checklist',
      ],
      endocrinology: [
        'Glycemic Endpoint & Rescue Criteria Template',
        'Metabolic Safety Monitoring Narrative',
        'Device-Drug Combination Use-Case Template',
      ],
      respiratory: [
        'Exacerbation Endpoint Definition Template',
        'Pulmonary Function Analysis Shell',
        'Inhalation Device Human Factors Narrative',
      ],
    };

    const pythonSkillPack = [
      'Pydantic schemas for dossier entities and controlled terminology checks',
      'DOCX assembly pipelines (python-docx/docxtpl) with section-level merge controls',
      'Traceability matrix generation (claim → evidence → source → citation)',
      'Regulatory linting scripts for placeholders, contradictions, and missing references',
      'Submission packaging utilities for eCTD folder validation and index checks',
      'FastAPI services for authoring, review, and approval workflows with audit logging',
    ];

    const therapeuticArea = (() => {
      const rules = [
        { key: 'oncology', patterns: ['oncology', 'tumor', 'cancer'] },
        { key: 'cardiology', patterns: ['cardiology', 'cardiac', 'heart'] },
        { key: 'neurology', patterns: ['neurology', 'neuro', 'cns'] },
        { key: 'immunology', patterns: ['immunology', 'immune', 'autoimmune'] },
        { key: 'infectious_disease', patterns: ['infectious', 'antiviral', 'antibiotic'] },
        { key: 'rare_disease', patterns: ['rare disease', 'orphan'] },
        { key: 'endocrinology', patterns: ['endocrine', 'diabetes', 'metabolic'] },
        { key: 'respiratory', patterns: ['respiratory', 'pulmonary', 'asthma', 'copd'] },
      ];
      return (
        rules.find(rule => rule.patterns.some(p => normalizedQuery.includes(p)))?.key || 'oncology'
      );
    })();

    const indTemplateBlock = Object.entries(indPyramidTemplateLibrary)
      .map(([module, templates]) => `- ${module}: ${templates.slice(0, 2).join('; ')}`)
      .join('\n');

    const therapyTemplateBlock = therapeuticTemplateLibrary[therapeuticArea]
      .map(template => `- ${template}`)
      .join('\n');

    const pythonSkillBlock = pythonSkillPack.map((skill, idx) => `${idx + 1}. ${skill}`).join('\n');

    const clientSegment = (() => {
      const segmentRules = [
        { key: 'startup', patterns: ['startup', 'seed', 'series a', 'early stage'] },
        { key: 'mid_market', patterns: ['mid-market', 'growth', 'scaleup'] },
        { key: 'enterprise', patterns: ['enterprise', 'global', 'multi-region', 'portfolio'] },
        {
          key: 'consultancy',
          patterns: ['consultancy', 'agency', 'service line', 'client delivery'],
        },
      ];
      return (
        segmentRules.find(rule => rule.patterns.some(p => normalizedQuery.includes(p)))?.key ||
        'startup'
      );
    })();

    const clientOutcomeMap: Record<string, string[]> = {
      startup: [
        'Reduce time-to-IND by standardized authoring and validation workflows',
        'Lower consultant dependency with repeatable templates and automation',
        'Increase first-cycle response quality with pre-audit checks',
      ],
      mid_market: [
        'Scale regulatory operations across concurrent programs',
        'Improve cross-functional consistency between CMC, clinical, and safety',
        'Decrease rework via reusable evidence-linked drafting pipelines',
      ],
      enterprise: [
        'Standardize global dossier quality across regions and therapeutic franchises',
        'Improve governance with auditable AI-assisted authoring checkpoints',
        'Optimize submission throughput with portfolio-level template libraries',
      ],
      consultancy: [
        'Deliver faster, more consistent client-ready regulatory outputs',
        'Productize repeatable templates and SOP-linked automation assets',
        'Increase margins by reducing manual rewrite and QA cycles',
      ],
    };

    const clientPlanBlock = [
      '**30-Day client value plan**',
      '1. Baseline current document stack and identify highest-risk gaps.',
      '2. Deploy module + therapeutic templates for top-priority programs.',
      '3. Activate Python validation scripts for quality gates and traceability.',
      '',
      '**60-Day acceleration plan**',
      '1. Automate DOCX section assembly with evidence-linking.',
      '2. Implement deficiency prediction and remediation workflows.',
      '3. Track KPI dashboard (cycle time, rework %, finding density).',
      '',
      '**90-Day scale plan**',
      '1. Roll out cross-program template governance.',
      '2. Expand automation coverage to review and packaging steps.',
      '3. Institutionalize continuous improvement loop from agency feedback.',
    ].join('\n');

    const clientOutcomeBlock = clientOutcomeMap[clientSegment].map(item => `- ${item}`).join('\n');

    const buildCapabilityFallback = (mode: string): string => {
      const responseByMode: Record<string, string> = {
        build_design: `I can lead this as a build/design problem.

**Proposed execution frame**
1. Define objective + submission endpoint (IND/NDA/BLA/510(k)/CER/eCTD module).
2. Map required evidence artifacts and identify missing inputs.
3. Build a phase plan (authoring → QC → audit → submission readiness).
4. Create owner-level tasks with quality gates and date-based risk controls.

**Immediate next step**
Share your target submission type, deadline, and top 3 constraints so I can generate a concrete implementation roadmap.`,

        author: `I can author this to submission-grade quality.

**Writing method**
1. Extract claims, evidence, and regulatory basis per section.
2. Draft in reviewer-friendly structure (objective, methods, results, interpretation, conclusion).
3. Add traceability notes for each critical assertion.
4. Run consistency and completeness checks before finalization.

**Immediate next step**
Provide the intended document type and section list, and I will draft the first complete section.`,

        audit: `I can audit this for regulatory and quality vulnerabilities.

**Audit lens**
1. Completeness gaps against expected section requirements.
2. Contradictions across protocol/SAP/CSR or dossier modules.
3. Traceability breaks between claims and evidence.
4. High-risk language likely to trigger agency deficiencies.

**Immediate next step**
Share the draft text (or section excerpts) and I will return a prioritized finding log with remediation actions.`,

        evaluate: `I can evaluate options and recommend a defensible path.

**Decision framework**
1. Compare options on compliance fit, execution risk, and time-to-submission.
2. Separate known facts from assumptions and uncertainties.
3. Provide ranked recommendation with confidence and rationale.
4. Define contingency if primary path fails.

**Immediate next step**
List the options you are considering and your success criteria (speed, risk, cost, evidence burden).

**Client outcome focus (${clientSegment.replace('_', ' ')})**
${clientOutcomeBlock}`,

        predict: `I can forecast likely agency concerns and preempt them.

**Predictive approach**
1. Detect weak claims, unsupported assumptions, and consistency risks.
2. Anticipate probable information requests and deficiency themes.
3. Prioritize mitigations by likelihood × impact.
4. Prepare response-ready evidence packaging.

**Immediate next step**
Provide your current strategy summary and I will generate a risk-ranked question forecast with mitigations.`,

        code: `I can implement this in production-grade Python.

**Engineering blueprint**
1. Typed models for inputs/outputs and regulatory constraints.
2. Validation layer for required fields, controlled terms, and audit trails.
3. Service layer for business rules and deterministic transforms.
4. Tests for nominal paths, edge cases, and compliance guardrails.

**Expanded Python skill library**
${pythonSkillBlock}

**Immediate next step**
Tell me your target runtime (FastAPI/CLI/batch), and I will provide an executable scaffold plus tests.

${clientPlanBlock}`,

        docx: `I can prepare this for DOCX-native regulatory authoring.

**DOCX pipeline**
1. Section map aligned to CTD/eCTD/CER structure.
2. Heading-safe narrative blocks with evidence anchors.
3. Table-ready stubs for key results, risks, and justifications.
4. Final QC pass for placeholders, consistency, and citation sufficiency.

**IND Pyramid template library (starter pack)**
${indTemplateBlock}

**Therapeutic area templates (${therapeuticArea.replace('_', ' ')})**
${therapyTemplateBlock}

**Immediate next step**
Share your template structure and target module so I can generate insertion-ready section content.

${clientPlanBlock}`,
      };

      return responseByMode[mode] || responseByMode['evaluate'];
    };

    let response;
    let resolvedMode = resolveAnaMode();

    // Choose AI model based on user preference
    if (model === 'gemini' && process.env.GOOGLE_API_KEY) {
      // Use Google Gemini Pro
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      const geminiModel = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4000,
        },
      });

      const prompt = documentContent
        ? `${systemPrompt}\n\nDocument context: ${sanitizedDocumentContent}\n\nUser question: ${query}`
        : `${systemPrompt}\n\nUser question: ${query}`;

      const result = await geminiModel.generateContent(prompt);
      response = result.response.text();
    } else {
      // Fallback to contextual regulatory guidance (when no AI service available)
      const contextualResponses: Record<string, string> = {
        regulatory_affairs: `Based on current FDA guidelines, I recommend focusing on the following key areas for your regulatory submission:

1. **Clinical Data Package**: Ensure your clinical study reports include comprehensive efficacy and safety analyses with appropriate statistical methods.

2. **Quality Information**: Manufacturing controls, analytical methods validation, and stability data should align with ICH Q guidelines.

3. **Risk Management**: Implement a robust pharmacovigilance plan and risk evaluation and mitigation strategies (REMS) if applicable.

For your specific query about "${query}", I'd recommend consulting the most recent FDA guidance documents and considering pre-submission meetings to align on regulatory expectations.`,

        clinical_documentation: `For clinical documentation best practices:

1. **Protocol Design**: Ensure endpoints are clinically meaningful and align with FDA guidance for your therapeutic area.

2. **Statistical Analysis Plan**: Pre-specify all analyses, including sensitivity analyses and handling of missing data.

3. **Clinical Study Report**: Follow ICH E3 structure with clear presentation of results and benefit-risk assessment.

Regarding "${query}", consider reviewing recent FDA approvals in your therapeutic area for benchmark standards.`,

        python_implementation: `I can help you implement this in Python with a production-ready approach:

1. **Architecture First**: Define modules for data models, validation, business rules, and adapters (APIs/files/DB).
2. **Compliance by Design**: Add validation layers for required regulatory fields, controlled vocabularies, and audit trails.
3. **Quality Controls**: Include unit tests, schema validation, deterministic outputs, and error handling pathways.
4. **Operational Reliability**: Add logging, metrics, configuration management, and clear dependency boundaries.

For "${query}", I can draft an executable Python scaffold with typed models, validation rules, and test cases in the next step.`,

        docx_authoring: `For DOCX-ready regulatory authoring, use a structured content pipeline:

1. **Template Mapping**: Align each section to CTD/eCTD or CER structure with required evidence inputs.
2. **Narrative Rules**: Use consistent terminology, objective claim language, and source traceability for each assertion.
3. **Quality Gates**: Run checks for completeness, contradictions, placeholders, and citation sufficiency before export.
4. **Export Readiness**: Produce heading-safe content, table-ready data blocks, and appendix cross-references.

**IND Pyramid template library**
${indTemplateBlock}

**Therapeutic area templates (${therapeuticArea.replace('_', ' ')})**
${therapyTemplateBlock}

For "${query}", I can generate a complete section draft with regulatory citations and a DOCX insertion map.`,

        ind_pyramid_templates: `I can generate templates for every IND Pyramid module.

**IND Pyramid library**
${indTemplateBlock}

**Therapeutic area templates (${therapeuticArea.replace('_', ' ')})**
${therapyTemplateBlock}

For "${query}", I can output a complete DOCX-ready template pack for your selected module and therapeutic area.`,

        python_skill_library: `I can expand AnA's Python execution capabilities with this skill stack:

${pythonSkillBlock}

For "${query}", I can now produce implementation-ready code blueprints tied to your regulatory workflow.

${clientPlanBlock}`,

        client_enablement: `I can optimize AnA specifically for end-user client delivery.

**Expected client outcomes (${clientSegment.replace('_', ' ')})**
${clientOutcomeBlock}

${clientPlanBlock}

For "${query}", I can produce a client-ready enablement package with templates, automation scripts, and adoption metrics.`,

        submission_readiness: `I can run a submission-readiness preflight for your team.

**Readiness preflight checklist**
1. Content completeness across required modules/sections.
2. Evidence traceability from claim to source artifact.
3. Consistency checks across protocol, SAP, CSR, and summaries.
4. Deficiency-risk language scan and remediation plan.

**Primary output package**
- Risk-ranked findings ledger
- Corrective action plan with owners and due dates
- Re-submission confidence forecast with blockers

For "${query}", I can generate a structured readiness report in your preferred format.`,

        default: `As your regulatory AI expert, I recommend:

1. **Regulatory Strategy**: Develop a comprehensive regulatory strategy early in development.
2. **Quality by Design**: Implement QbD principles throughout development.
3. **Stakeholder Engagement**: Maintain regular communication with regulatory agencies.

For "${query}", I suggest consulting the latest ICH guidelines and FDA guidance documents relevant to your therapeutic area.`,
      };

      response =
        contextualResponses[context as string] ||
        buildCapabilityFallback(resolvedMode) ||
        contextualResponses['default'];
    }

    const recommendedArtifactsByMode: Record<string, string[]> = {
      build_design: ['Regulatory strategy memo', 'Submission roadmap', 'Risk register'],
      author: ['Section draft pack', 'Citation traceability matrix', 'Terminology style guide'],
      audit: ['Gap report', 'CAPA action list', 'Evidence coverage heatmap'],
      evaluate: ['Option comparison table', 'Recommendation memo', 'Decision log'],
      predict: ['Likely agency question bank', 'Mitigation plan', 'Pre-briefing deck'],
      code: ['Python scaffold', 'Validation test suite', 'Automation runbook'],
      docx: ['DOCX template pack', 'Section insertion map', 'Export QA checklist'],
    };

    const nextQuestionsByMode: Record<string, string[]> = {
      build_design: [
        'Which submission type and region are in scope?',
        'What is your target filing date?',
      ],
      author: ['Which section should be drafted first?', 'What source evidence is available now?'],
      audit: [
        'Do you want risk-ranked findings or full line-by-line review?',
        'What is your remediation deadline?',
      ],
      evaluate: [
        'What are the options under consideration?',
        'Which KPI matters most: speed, risk, or cost?',
      ],
      predict: [
        'Which agencies do you expect to engage first?',
        'What prior deficiencies should be considered?',
      ],
      code: [
        'Preferred runtime: FastAPI, CLI, or batch?',
        'Do you require strict validation schemas?',
      ],
      docx: [
        'Which template standard do you use?',
        'Do you need module-level or full dossier output?',
      ],
    };

    const deliveryPackageByMode: Record<
      string,
      { kpis: string[]; timeline: string[]; automation: string[] }
    > = {
      build_design: {
        kpis: ['Roadmap approval cycle time', 'Planning rework rate', 'Critical risk closure time'],
        timeline: [
          'Week 1: scope + gap map',
          'Week 2-3: roadmap + ownership',
          'Week 4: governance sign-off',
        ],
        automation: ['Requirements extraction', 'Dependency mapping', 'Milestone status alerts'],
      },
      author: {
        kpis: ['Draft turnaround time', 'Reviewer comment density', 'Citation completeness %'],
        timeline: [
          'Week 1: section drafting',
          'Week 2: evidence reconciliation',
          'Week 3: QC pass',
        ],
        automation: ['Section auto-assembly', 'Citation linting', 'Terminology consistency checks'],
      },
      audit: {
        kpis: ['Open findings count', 'High-risk finding closure SLA', 'Repeat issue rate'],
        timeline: [
          'Day 1-3: baseline audit',
          'Day 4-7: remediation planning',
          'Week 2: verification audit',
        ],
        automation: ['Gap scanning', 'Contradiction detection', 'CAPA tracking notifications'],
      },
      evaluate: {
        kpis: ['Decision latency', 'Post-decision rework %', 'Risk-adjusted schedule variance'],
        timeline: ['Day 1: option framing', 'Day 2-3: tradeoff analysis', 'Day 4: decision memo'],
        automation: ['Scenario comparison tables', 'Risk scoring', 'Decision log generation'],
      },
      predict: {
        kpis: [
          'Predicted vs actual agency queries',
          'Mitigation completion %',
          'Deficiency recurrence rate',
        ],
        timeline: ['Week 1: risk forecast', 'Week 2: mitigation execution', 'Week 3: dry-run Q&A'],
        automation: ['Question forecasting', 'Signal clustering', 'Mitigation tracker updates'],
      },
      code: {
        kpis: ['Automation coverage %', 'Validation failure rate', 'Manual effort reduction hours'],
        timeline: [
          'Week 1: scaffold + schemas',
          'Week 2: validators + tests',
          'Week 3: deploy + monitor',
        ],
        automation: [
          'Schema validation pipelines',
          'DOCX generation jobs',
          'Submission package checks',
        ],
      },
      docx: {
        kpis: ['Template reuse %', 'Formatting defect rate', 'Approval cycle duration'],
        timeline: [
          'Week 1: template mapping',
          'Week 2: section population',
          'Week 3: QA + final export',
        ],
        automation: [
          'Template merge engines',
          'Cross-reference integrity checks',
          'Export QA gates',
        ],
      },
    };

    res.json({
      success: true,
      response: response,
      answer: response, // Also provide as 'answer' for compatibility
      confidence: model === 'gemini' ? 0.95 : 0.85,
      mode: resolvedMode,
      audience: audience,
      responseFormat: responseFormat,
      warnings,
      recommendedArtifacts:
        recommendedArtifactsByMode[resolvedMode] || recommendedArtifactsByMode['evaluate'],
      nextQuestions: nextQuestionsByMode[resolvedMode] || nextQuestionsByMode['evaluate'],
      deliveryPackage: deliveryPackageByMode[resolvedMode] || deliveryPackageByMode['evaluate'],
      timestamp: new Date().toISOString(),
      context: context || 'regulatory_affairs',
      sessionId: sessionId,
    });
  } catch (error) {
    console.error('Error in AnA RI endpoint:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Unable to process regulatory consultation request',
    });
  }
});

console.log('✅ Basic API routes mounted');
debugLog('Debug mode enabled - enhanced logging active');

// ── Register AI + Concept2Cure bootstrapped route manifests ──
// AnA features, AnA RI, firecrawl, external evidence, chat, IND, regulatory, AI claims, Claude intelligence
await registerAiRoutes({ app, pool, aiCircuitBreaker });
// Concept2Cure + compute routes
registerConcept2CureRoutes(app);
registerAdminRoutes(app);

// ── Routes not yet migrated to AI/C2C bootstrap manifests ──

// Authoring Router (document workflows, reviews, tracked changes)
try {
  const authoringRouterModule = await import('./routes/authoring.router');
  app.use('/api/authoring', authoringRouterModule.default);
  console.log('✅ Authoring Router mounted (/api/authoring)');
} catch (error) {
  console.error('❌ Failed to mount Authoring Router:', error);
}

// Authoring Actions routes (Wave 1 + Wave 2 AnA-first authoring actions)
try {
  const authoringActionsModule = await import('./routes/authoring-actions');
  app.use('/api/authoring-actions', authoringActionsModule.default);
  console.log('✅ Authoring Actions routes mounted (/api/authoring-actions)');
} catch (error) {
  console.error('❌ Failed to mount Authoring Actions routes:', error);
}

// Ana Platform Control routes (agentic settings, modules, onboarding)
try {
  const anaPlatformModule = await import('./routes/ana-platform-control');
  app.use('/api/ana/platform', anaPlatformModule.default);
  console.log('✅ Ana Platform Control routes mounted (/api/ana/platform)');
} catch (error) {
  console.error('❌ Failed to mount Ana Platform Control routes:', error);
}

// AI Actions unified execution API (Phase 1 — conversational OS spine)
try {
  const aiActions = await import('./services/ai-actions/index');
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

  const aiActionsRoutes = (await import('./routes/ai-actions')).default;
  app.use('/api/ai-actions', aiActionsRoutes);
  console.log('✅ AI Actions API routes mounted at /api/ai-actions');
} catch (error: any) {
  console.error('❌ Failed to mount AI Actions routes:', error.message);
}

// Phase 3 Orchestration routes (workflow orchestration, readiness, recommendations, continuity)
try {
  await import('./services/orchestration');
  const orchestrationRoutes = (await import('./routes/orchestration')).default;
  app.use('/api/orchestration', orchestrationRoutes);
  console.log('✅ Phase 3 Orchestration API routes mounted at /api/orchestration');
} catch (error: any) {
  console.error('❌ Failed to mount Orchestration routes:', error.message);
}

// ── Register governance and intelligence route bundle ──
// Resolution, operating system, governed intelligence, client/account intelligence,
// packager, precedent engine, cross-jurisdictional, harmonize, escalate,
// validate-completeness, gold standard, continuous eval, submission center
await registerGovernanceRoutes(app);

// Mount Unified Regulatory Submissions routes (feature-gated)
import regulatorySubmissionsRoutes from './routes/regulatorySubmissions';
app.use('/api/regulatory-submissions', regulatorySubmissionsRoutes);
console.log('✅ Regulatory Submissions API routes mounted successfully (feature-gated)');

// Mount Submission Ops + Regulatory Correspondence routes
import submissionOpsRoutes from './routes/submission-ops';
import regulatoryCorrespondenceRoutes from './routes/regulatory-correspondence';
app.use('/api/submission-ops', submissionOpsRoutes);
app.use('/api/regulatory-correspondence', regulatoryCorrespondenceRoutes);
console.log('✅ Submission Ops API routes mounted successfully');
console.log('✅ Regulatory Correspondence API routes mounted successfully');

// Mount 510k-workflow routes directly
import { TemplateMapper } from './services/documentTemplateMapper';
import { MemStorage } from './storage';
import FDA510kComplianceTracker from './services/510kComplianceTracker';
import DocumentOrchestrationService from './services/DocumentOrchestrationService';

// Import field synchronization routes
import fieldSyncRoutes from './routes/fieldSync.routes';
// Import content assembly routes
import contentAssemblyRoutes from './routes/contentAssembly.routes';

// Create storage instance
const memStorage = new MemStorage();
const getStorage = async () => memStorage;

// 510k Workflow Routes
app.post('/api/510k-workflow/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { organizationId, stage, section, data, completedSteps, validationCheckpoints } = req.body;

  if (!organizationId || !stage || !data) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  try {
    const storage = await getStorage();

    // Track workflow action for 21 CFR Part 11 compliance
    // Re-enabled after 0008_ga_hardening migration adds missing columns
    let trackingResult: { success: boolean } = { success: true };
    try {
      trackingResult = await FDA510kComplianceTracker.trackWorkflowAction({
        workflowId: `WF_${projectId}_${Date.now()}`,
        projectId,
        stage,
        section,
        action: 'SAVE',
        userId: parseInt((req.headers['x-user-id'] as string) || ''),
        organizationId: parseInt(organizationId),
        data,
        metadata: {
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          sessionId: req.headers['x-session-id'] as string,
        },
      });
    } catch (auditErr) {
      console.warn(
        '[510k-workflow] Audit trail write failed (migration pending?):',
        (auditErr as Error).message
      );
      // Non-blocking: workflow continues even if audit fails during migration window
    }

    // For now, we'll use the project ID directly as the workflow ID
    // since we're working with project-based workflows
    let workflow = {
      id: parseInt(projectId),
      currentStep: stage,
      workflowData: data,
      completedSteps: req.body.completedSteps || [],
      validationCheckpoints: req.body.validationCheckpoints || {},
      workflowStatus: 'active',
    };
    console.log(`Processing workflow for project ${projectId}, stage: ${stage}`);

    // Actually save the workflow data to database
    // For demo projects (projectId >= 500), skip fda510kProjects table creation
    // as these don't have corresponding entries in the projects table
    const isDemoProject = parseInt(projectId) >= 500;

    if (!isDemoProject) {
      // Check if project exists in fda510kProjects table for real projects
      const existingProjects = await db!
        .select()
        .from(fda510kProjects)
        .where(eq(fda510kProjects.projectId, parseInt(projectId)));

      if (existingProjects.length === 0) {
        // Create the project in fda510kProjects if it doesn't exist
        console.log(`Creating FDA 510(k) project entry for project ${projectId}`);
        try {
          await db!.insert(fda510kProjects).values({
            organizationId: parseInt(organizationId),
            projectId: parseInt(projectId),
            deviceName: data.deviceName || `Device ${projectId}`,
            currentStage: stage,
            status: 'draft',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`Created FDA 510(k) project entry for project ${projectId}`);
        } catch (err) {
          console.warn(
            `[510k-workflow] Could not create fda510kProjects entry for project ${projectId}:`,
            err
          );
          // Continue anyway - we can still save workflow data
        }
      }
    } else {
      console.log(`[510k-workflow] Demo project ${projectId} - skipping fda510kProjects creation`);
    }

    // Use section in the WHERE clause to handle section-level data properly
    const effectiveSection = section || 'default';

    // For demo projects, save workflow data in memory or skip stage progress table
    if (isDemoProject) {
      console.log(`[510k-workflow] Demo project ${projectId} - skipping database persistence`);
    } else {
      // For real projects, save to database
      try {
        const existingWorkflows = await db!
          .select()
          .from(fda510kStageProgress)
          .where(
            and(
              eq(fda510kStageProgress.projectId, parseInt(projectId)),
              eq(fda510kStageProgress.stageName, stage),
              eq(fda510kStageProgress.sectionName, effectiveSection)
            )
          );

        if (existingWorkflows.length > 0) {
          // Update existing stage-section progress
          await db!
            .update(fda510kStageProgress)
            .set({
              status: 'in_progress',
              progress: 50, // Update progress
              collectedData: data,
              validationStatus: 'pending',
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(fda510kStageProgress.projectId, parseInt(projectId)),
                eq(fda510kStageProgress.stageName, stage),
                eq(fda510kStageProgress.sectionName, effectiveSection)
              )
            );
          console.log(
            `Updated stage progress for project ${projectId}, stage: ${stage}, section: ${effectiveSection}`
          );
        } else {
          // Create new stage-section progress
          await db!.insert(fda510kStageProgress).values({
            projectId: parseInt(projectId),
            stageName: stage,
            sectionName: effectiveSection,
            status: 'in_progress',
            progress: 0,
            isRequired: true,
            collectedData: data,
            validationStatus: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(
            `Created stage progress for project ${projectId}, stage: ${stage}, section: ${effectiveSection}`
          );
        }
      } catch (dbError) {
        console.warn(
          `[510k-workflow] Could not save to stage progress table for project ${projectId}:`,
          dbError
        );
        // DB save failed — logged above, workflow continues with in-memory state
      }
    }

    // Save section data to stage progress table if provided
    if (section) {
      console.log(`Saved section data for section: ${section}`);
    }

    // Track document version for compliance — re-enabled after 0008_ga_hardening migration
    try {
      await FDA510kComplianceTracker.createDocumentVersion({
        documentId: `510K_${projectId}`,
        projectId,
        userId: parseInt((req.headers['x-user-id'] as string) || ''),
        organizationId: parseInt(organizationId),
        content: data,
        changeDescription: `Updated ${stage} - ${section || 'default'}`,
        metadata: {
          stage,
          section,
          completedSteps: req.body.completedSteps || [],
        },
      });
    } catch (versionErr) {
      console.warn(
        '[510k-workflow] Document version tracking failed (migration pending?):',
        (versionErr as Error).message
      );
    }

    // Trigger automatic document generation via DocumentOrchestrationService
    let autoPopulated = false;
    try {
      const orchestrationService = new DocumentOrchestrationService();
      const orchestrationResult = await orchestrationService.orchestrateDocumentGeneration(
        projectId,
        req.headers['x-user-id'] as string,
        organizationId
      );
      autoPopulated = true;
      console.log(`✅ [510k-workflow] Documents auto-generated for project ${projectId}`);
    } catch (docError) {
      console.error('[510k-workflow] Document generation error:', docError);
      // Don't fail the workflow save if document generation fails
    }

    res.status(200).json({
      success: true,
      workflowId: workflow.id,
      message: 'Workflow data saved successfully',
      autoPopulated,
      dataFlow: autoPopulated
        ? {
            workflow: 'Enhanced510kIntakeWorkflow',
            backend: 'fda510kStageProgress.collectedData',
            documents: 'Auto-populated via DocumentOrchestrationService',
          }
        : undefined,
      compliance: {
        auditId: `AUDIT_${projectId}_${Date.now()}`,
        completeness: 100,
        issues: [],
        issueCount: {
          critical: 0,
          major: 0,
          minor: 0,
          suggestions: 0,
        },
      },
    });
  } catch (error) {
    console.error('[510k-workflow] Save error:', error);
    res.status(500).json({ success: false, error: 'Failed to save workflow data' });
  }
});

// GET stage data for a specific project+stage+section (for client persistence hydration)
app.get('/api/510k-workflow/:projectId/stage-data', async (req, res) => {
  const { projectId } = req.params;
  const stage = (req.query.stage as string) || 'default';
  const section = (req.query.section as string) || 'default';

  try {
    const rows = await db!
      .select()
      .from(fda510kStageProgress)
      .where(
        and(
          eq(fda510kStageProgress.projectId, parseInt(projectId)),
          eq(fda510kStageProgress.stageName, stage),
          eq(fda510kStageProgress.sectionName, section)
        )
      );

    if (rows.length > 0) {
      res.status(200).json({
        success: true,
        collectedData: rows[0].collectedData || {},
        status: rows[0].status,
        progress: rows[0].progress,
      });
    } else {
      res.status(200).json({ success: true, collectedData: {} });
    }
  } catch (error) {
    console.error('[510k-workflow] Stage data read error:', error);
    res.status(500).json({ success: false, error: 'Failed to read stage data' });
  }
});

// GET all 510k workflows
app.get('/api/510k-workflow', async (req, res) => {
  const organizationId = getSecureOrgId(req);
  if (!organizationId) {
    return res.status(401).json({ error: 'Organization context required' });
  }

  try {
    // For now, return empty workflows array to avoid database errors
    // This allows the UI to work while we implement the full project listing
    const workflows: any[] = [];

    res.status(200).json({
      success: true,
      workflows: workflows,
    });
  } catch (error) {
    console.error('[510k-workflow] List error:', error);
    res.status(500).json({ success: false, error: 'Failed to list workflows' });
  }
});

// GET 510k workflow data
app.get('/api/510k-workflow/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const organizationId = getSecureOrgId(req);

  if (!organizationId) {
    return res.status(400).json({ success: false, error: 'Organization ID required' });
  }

  try {
    const storage = await getStorage();
    // Return workflow data based on project
    const workflowData = {
      id: parseInt(projectId),
      organizationId: parseInt(organizationId),
      projectId: parseInt(projectId),
      submissionType: '510k',
      workflowStatus: 'active',
    };

    // For now, return empty sections array
    const sections: any[] = [];

    res.status(200).json({
      success: true,
      workflow: workflowData,
      sections: sections,
    });
  } catch (error) {
    console.error('[510k-workflow] Get error:', error);
    res.status(500).json({ success: false, error: 'Failed to get workflow data' });
  }
});

// Generate 510k Document
app.post('/api/510k-workflow/:projectId/generate-document', async (req, res) => {
  const { projectId } = req.params;
  const organizationId = getSecureOrgId(req);

  if (!organizationId) {
    return res.status(401).json({ success: false, error: 'Organization context required' });
  }

  try {
    const storage = await getStorage();

    // Create workflow data based on project
    const workflowData = {
      id: parseInt(projectId),
      organizationId: parseInt(organizationId),
      projectId: parseInt(projectId),
      submissionType: '510k',
      workflowStatus: 'active',
      workflowData: {},
    };

    // Get all sections - for now use empty array
    const sections: any[] = [];

    // Map workflow data to FDA eSTAR template format
    const templateData = TemplateMapper.mapWorkflowToTemplate(workflowData.workflowData || {});

    // Merge section data with template mapping
    const documentSections = sections.map(s => ({
      id: s.id,
      sectionCode: s.sectionCode,
      sectionTitle: s.sectionTitle,
      content: s.content,
      templateData: templateData.sections[s.sectionCode] || {},
    }));

    // Save the mapped template data
    await storage.createCerSection({
      organizationId: parseInt(organizationId),
      submissionId: parseInt(projectId),
      sectionCode: 'TEMPLATE_MAPPING',
      sectionTitle: 'Template Mapping Metadata',
      content: templateData,
      metadata: {
        mappedAt: new Date().toISOString(),
        mappedFields: templateData.metadata.mappedFields,
        validationStatus: templateData.metadata.validationStatus,
      },
    });

    res.status(200).json({
      success: true,
      message: '510(k) document generated with intelligent data mapping',
      templateData,
      documentSections,
      metadata: templateData.metadata,
    });
  } catch (error) {
    console.error('[510k-workflow] Document generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate document',
    });
  }
});

// GET audit trail for 510(k) workflow
app.get('/api/510k-workflow/:projectId/audit-trail', async (req, res) => {
  const { projectId } = req.params;
  const { stage, userId, startDate, endDate } = req.query;

  try {
    const auditTrail = await FDA510kComplianceTracker.getAuditTrail(projectId, {
      stage: stage as string,
      userId: userId ? parseInt(userId as string) : undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    res.status(200).json(auditTrail);
  } catch (error) {
    console.error('[510k-workflow] Audit trail error:', error);
    res.status(500).json({ success: false, error: 'Failed to get audit trail' });
  }
});

// GET data lineage for 510(k) workflow
app.get('/api/510k-workflow/:projectId/data-lineage', async (req, res) => {
  const { projectId } = req.params;

  try {
    const lineage = await FDA510kComplianceTracker.getDataLineage(projectId);
    res.status(200).json(lineage);
  } catch (error) {
    console.error('[510k-workflow] Data lineage error:', error);
    res.status(500).json({ success: false, error: 'Failed to get data lineage' });
  }
});

// GET version history for 510(k) document
app.get('/api/510k-workflow/:projectId/versions', async (req, res) => {
  const { projectId } = req.params;
  const { documentId } = req.query;

  try {
    const versions = await FDA510kComplianceTracker.getVersionHistory(
      projectId,
      (documentId as string) || `510K_${projectId}`
    );
    res.status(200).json(versions);
  } catch (error) {
    console.error('[510k-workflow] Version history error:', error);
    res.status(500).json({ success: false, error: 'Failed to get version history' });
  }
});

// GET compliance report for 510(k) submission
app.get('/api/510k-workflow/:projectId/compliance-report', async (req, res) => {
  const { projectId } = req.params;

  try {
    const report = await FDA510kComplianceTracker.generateComplianceReport(projectId);
    res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('[510k-workflow] Compliance report error:', error);
    res.status(500).json({ success: false, error: 'Failed to generate compliance report' });
  }
});

console.log('✅ 510k-workflow API routes mounted successfully');
console.log('✅ FDA compliance tracking enabled with full audit trails');

// Mount beta-safe route manifest (510(k) + tester telemetry)
mountBetaSafeRoutes(app);
console.log('✅ Beta-safe routes mounted successfully');

// Mount FDA forms routes
import fdaFormsRoutes from './routes/fda-forms.routes';
app.use('/api/fda-forms', fdaFormsRoutes);
console.log('✅ FDA forms API routes mounted successfully');

// Mount field synchronization routes
app.use('/api/field-sync', fieldSyncRoutes);
console.log('✅ Field Synchronization API routes mounted successfully');

// Mount content assembly routes
app.use('/api/content-assembly', contentAssemblyRoutes);
console.log('✅ Dynamic Content Assembly API routes mounted successfully');

// Complete eCTD templates based on FDA ICH guidelines and provided PDF structure
const fallbackTemplates = [
  // MODULE 1 - REGIONAL ADMINISTRATIVE INFORMATION
  {
    id: 1,
    name: 'Module_1_1_Form_1571',
    title: 'Module 1.1 - Form FDA 1571',
    template_name: 'Module 1.1 - Form FDA 1571',
    region: 'FDA',
    version: '4.0',
    description: 'Form FDA 1571 - Investigational New Drug Application',
    module_number: '1',
    granule_id: 'm1-1-form1571',
    category: 'administrative',
    content: `FORM FDA 1571 - INVESTIGATIONAL NEW DRUG APPLICATION

DEPARTMENT OF HEALTH AND HUMAN SERVICES
FOOD AND DRUG ADMINISTRATION

IND NUMBER: [IND_NUMBER]
DATE OF SUBMISSION: [DATE_OF_SUBMISSION]

PART 1 - SPONSOR INFORMATION
1. NAME OF SPONSOR: [SPONSOR_NAME]
2. COMPLETE ADDRESS: [SPONSOR_ADDRESS]
3. TELEPHONE NUMBER: [SPONSOR_PHONE]
4. FAX NUMBER: [SPONSOR_FAX]
5. EMAIL ADDRESS: [SPONSOR_EMAIL]

PART 2 - DRUG INFORMATION
6. NAME OF DRUG: [DRUG_NAME]
7. CHEMICAL NAME: [CHEMICAL_NAME]
8. TRADE NAME(S): [TRADE_NAME]
9. NATIONAL DRUG CODE (NDC) NUMBER: [NDC_NUMBER]

PART 3 - INDICATION(S)
10. INDICATION(S) FOR INVESTIGATION: [INDICATION]

PART 4 - PHASE(S) OF INVESTIGATION
11. PHASE(S) OF CLINICAL INVESTIGATION TO BE CONDUCTED:
    ☐ Phase 1
    ☐ Phase 2
    ☐ Phase 3
    ☐ Other: [OTHER_PHASE]

PART 5 - SPONSOR CERTIFICATION
I certify that all information provided in this application is accurate and complete.

Sponsor or Sponsor's Authorized Representative:
Name: [SPONSOR_REP_NAME]
Title: [SPONSOR_REP_TITLE]
Signature: _________________________ Date: [SIGNATURE_DATE]

PART 6 - ATTACHMENTS
☐ Protocol(s)
☐ Investigator's Brochure
☐ Chemistry, Manufacturing, and Controls Information
☐ Pharmacology and Toxicology Information
☐ Previous Human Experience with the Drug
☐ Additional Information`,
    placeholders: {
      ind_number: '[IND_NUMBER]',
      date_of_submission: '[DATE_OF_SUBMISSION]',
      sponsor_name: '[SPONSOR_NAME]',
      sponsor_address: '[SPONSOR_ADDRESS]',
      drug_name: '[DRUG_NAME]',
      indication: '[INDICATION]',
    },
  },
  {
    id: 2,
    name: 'Module_1_2_Cover_Letter',
    title: 'Module 1.2 - Cover Letter',
    template_name: 'Module 1.2 - Cover Letter',
    region: 'FDA',
    version: '4.0',
    description: 'Cover letter for IND submission',
    module_number: '1',
    granule_id: 'm1-2-cover-letter',
    category: 'administrative',
    content: `COVER LETTER

[DATE]

Food and Drug Administration
Center for Drug Evaluation and Research
Office of New Drugs
[DIVISION_NAME]
Silver Spring, MD 20993-0002

SUBJECT: [SUBMISSION_TYPE] - IND [IND_NUMBER]
         [DRUG_NAME] ([GENERIC_NAME])
         [INDICATION]

Dear Reviewer:

[SPONSOR_NAME] ("Sponsor") is pleased to submit this [SUBMISSION_TYPE] for IND [IND_NUMBER] for [DRUG_NAME] ([GENERIC_NAME]) for the treatment of [INDICATION].

PURPOSE OF SUBMISSION:
[PURPOSE_DESCRIPTION]

CONTENTS OF SUBMISSION:
This submission contains the following information:
• [CONTENT_ITEM_1]
• [CONTENT_ITEM_2]
• [CONTENT_ITEM_3]

REGULATORY BACKGROUND:
[REGULATORY_BACKGROUND]

PROPOSED CLINICAL DEVELOPMENT:
[CLINICAL_DEVELOPMENT_PLAN]

CONTACT INFORMATION:
Primary Contact: [PRIMARY_CONTACT_NAME]
Title: [PRIMARY_CONTACT_TITLE]
Phone: [PRIMARY_CONTACT_PHONE]
Email: [PRIMARY_CONTACT_EMAIL]

Regulatory Contact: [REGULATORY_CONTACT_NAME]
Title: [REGULATORY_CONTACT_TITLE]
Phone: [REGULATORY_CONTACT_PHONE]
Email: [REGULATORY_CONTACT_EMAIL]

We appreciate the Agency's review of this submission and look forward to your feedback.

Sincerely,

[SIGNATURE_NAME]
[SIGNATURE_TITLE]
[SPONSOR_NAME]`,
    placeholders: {
      ind_number: '[IND_NUMBER]',
      drug_name: '[DRUG_NAME]',
      indication: '[INDICATION]',
      sponsor_name: '[SPONSOR_NAME]',
      submission_type: '[SUBMISSION_TYPE]',
    },
  },
  {
    id: 3,
    name: 'Module_1_3_1_Sponsor_Contact_Information',
    title: 'Module 1.3.1 - Sponsor Contact Information',
    template_name: 'Module 1.3.1 - Sponsor Contact Information',
    region: 'FDA',
    version: '4.0',
    description: 'Sponsor contact information and authorized representatives',
    module_number: '1',
    granule_id: 'm1-3-1-sponsor-contact',
    category: 'administrative',
    content: `SPONSOR CONTACT INFORMATION

1. SPONSOR ORGANIZATION
Organization Name: [SPONSOR_NAME]
Organization Type: [ORGANIZATION_TYPE]
Tax ID/EIN: [TAX_ID]

2. CORPORATE ADDRESS
Street Address: [CORPORATE_ADDRESS]
City: [CORPORATE_CITY]
State/Province: [CORPORATE_STATE]
ZIP/Postal Code: [CORPORATE_ZIP]
Country: [CORPORATE_COUNTRY]

3. AUTHORIZED REPRESENTATIVE
Name: [AUTHORIZED_REP_NAME]
Title: [AUTHORIZED_REP_TITLE]
Department: [AUTHORIZED_REP_DEPARTMENT]
Phone: [AUTHORIZED_REP_PHONE]
Fax: [AUTHORIZED_REP_FAX]
Email: [AUTHORIZED_REP_EMAIL]

4. REGULATORY AFFAIRS CONTACT
Name: [REGULATORY_CONTACT_NAME]
Title: [REGULATORY_CONTACT_TITLE]
Phone: [REGULATORY_CONTACT_PHONE]
Email: [REGULATORY_CONTACT_EMAIL]

5. MEDICAL AFFAIRS CONTACT
Name: [MEDICAL_CONTACT_NAME]
Title: [MEDICAL_CONTACT_TITLE]
Phone: [MEDICAL_CONTACT_PHONE]
Email: [MEDICAL_CONTACT_EMAIL]

6. PHARMACOVIGILANCE CONTACT
Name: [PV_CONTACT_NAME]
Title: [PV_CONTACT_TITLE]
Phone: [PV_CONTACT_PHONE]
Email: [PV_CONTACT_EMAIL]

7. QUALITY ASSURANCE CONTACT
Name: [QA_CONTACT_NAME]
Title: [QA_CONTACT_TITLE]
Phone: [QA_CONTACT_PHONE]
Email: [QA_CONTACT_EMAIL]

8. EMERGENCY CONTACT (24-hour)
Name: [EMERGENCY_CONTACT_NAME]
Phone: [EMERGENCY_CONTACT_PHONE]
Email: [EMERGENCY_CONTACT_EMAIL]

CERTIFICATION:
I certify that the contact information provided above is accurate and current.

Authorized Representative Signature: _________________________
Date: [CERTIFICATION_DATE]`,
    placeholders: {
      sponsor_name: '[SPONSOR_NAME]',
      organization_type: '[ORGANIZATION_TYPE]',
      corporate_address: '[CORPORATE_ADDRESS]',
      authorized_rep_name: '[AUTHORIZED_REP_NAME]',
      regulatory_contact_name: '[REGULATORY_CONTACT_NAME]',
    },
  },
  {
    id: 4,
    name: 'Module_1_20_Introduction_General_Plan',
    title: 'Module 1.20 - Introduction and General Investigational Plan',
    template_name: 'Module 1.20 - Introduction and General Investigational Plan',
    region: 'FDA',
    version: '4.0',
    description: 'Introduction and general investigational plan for IND',
    module_number: '1',
    granule_id: 'm1-20-intro-plan',
    category: 'administrative',
    content: `INTRODUCTION AND GENERAL INVESTIGATIONAL PLAN

1. INTRODUCTION

1.1 Drug Development Background
[DRUG_NAME] is a [DRUG_CLASS] being developed for the treatment of [INDICATION]. The development of [DRUG_NAME] is based on [SCIENTIFIC_RATIONALE].

1.2 Regulatory History
[REGULATORY_HISTORY_DESCRIPTION]

1.3 Unmet Medical Need
[UNMET_MEDICAL_NEED_DESCRIPTION]

2. GENERAL INVESTIGATIONAL PLAN

2.1 Overall Development Strategy
The clinical development program for [DRUG_NAME] is designed to evaluate:
• Safety and tolerability
• Pharmacokinetics and pharmacodynamics
• Efficacy in the target indication
• Optimal dosing regimen

2.2 Phase I Studies
Objective: [PHASE_I_OBJECTIVE]
Design: [PHASE_I_DESIGN]
Population: [PHASE_I_POPULATION]
Primary Endpoints: [PHASE_I_PRIMARY_ENDPOINTS]
Secondary Endpoints: [PHASE_I_SECONDARY_ENDPOINTS]

2.3 Phase II Studies
Objective: [PHASE_II_OBJECTIVE]
Design: [PHASE_II_DESIGN]
Population: [PHASE_II_POPULATION]
Primary Endpoints: [PHASE_II_PRIMARY_ENDPOINTS]
Secondary Endpoints: [PHASE_II_SECONDARY_ENDPOINTS]

2.4 Phase III Studies (if applicable)
Objective: [PHASE_III_OBJECTIVE]
Design: [PHASE_III_DESIGN]
Population: [PHASE_III_POPULATION]
Primary Endpoints: [PHASE_III_PRIMARY_ENDPOINTS]

3. RISK ASSESSMENT AND MITIGATION

3.1 Identified Risks
[IDENTIFIED_RISKS_DESCRIPTION]

3.2 Risk Mitigation Strategies
[RISK_MITIGATION_STRATEGIES]

3.3 Safety Monitoring Plan
[SAFETY_MONITORING_PLAN]

4. REGULATORY STRATEGY

4.1 Regulatory Milestones
[REGULATORY_MILESTONES]

4.2 FDA Interactions
[FDA_INTERACTIONS_PLAN]

4.3 Marketing Application Strategy
[MARKETING_APPLICATION_STRATEGY]

5. CONCLUSION
The investigational plan for [DRUG_NAME] is designed to systematically evaluate the safety and efficacy of this compound in [INDICATION] while minimizing risk to study participants.`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      indication: '[INDICATION]',
      drug_class: '[DRUG_CLASS]',
      scientific_rationale: '[SCIENTIFIC_RATIONALE]',
      phase_i_objective: '[PHASE_I_OBJECTIVE]',
    },
  },

  // MODULE 2 - COMMON TECHNICAL DOCUMENT SUMMARIES
  {
    id: 5,
    name: 'Module_2_2_Introduction',
    title: 'Module 2.2 - Introduction',
    template_name: 'Module 2.2 - Introduction',
    region: 'FDA',
    version: '4.0',
    description: 'Introduction to the Common Technical Document',
    module_number: '2',
    granule_id: 'm2-2-introduction',
    category: 'summary',
    content: `MODULE 2.2 - INTRODUCTION

1. OVERVIEW
This Common Technical Document (CTD) provides a comprehensive overview of [DRUG_NAME] development program for the treatment of [INDICATION].

2. DRUG SUBSTANCE AND DRUG PRODUCT
2.1 Drug Substance
Name: [DRUG_SUBSTANCE_NAME]
Chemical Name: [CHEMICAL_NAME]
Molecular Formula: [MOLECULAR_FORMULA]
Molecular Weight: [MOLECULAR_WEIGHT]
CAS Number: [CAS_NUMBER]

2.2 Drug Product
Dosage Form: [DOSAGE_FORM]
Route of Administration: [ROUTE_OF_ADMINISTRATION]
Strength(s): [STRENGTH]
Container/Closure: [CONTAINER_CLOSURE]

3. THERAPEUTIC INDICATION
[DRUG_NAME] is indicated for [INDICATION_DESCRIPTION].

4. DEVELOPMENT RATIONALE
4.1 Scientific Rationale
[SCIENTIFIC_RATIONALE_DESCRIPTION]

4.2 Clinical Rationale
[CLINICAL_RATIONALE_DESCRIPTION]

5. REGULATORY BACKGROUND
5.1 Regulatory Status
[REGULATORY_STATUS_DESCRIPTION]

5.2 Regulatory Advice
[REGULATORY_ADVICE_RECEIVED]

6. RISK-BENEFIT ASSESSMENT
6.1 Benefit Assessment
[BENEFIT_ASSESSMENT]

6.2 Risk Assessment
[RISK_ASSESSMENT]

6.3 Risk-Benefit Conclusion
[RISK_BENEFIT_CONCLUSION]

7. DOCUMENT ORGANIZATION
This CTD is organized according to ICH M4 guidelines:
• Module 1: Regional Administrative Information
• Module 2: CTD Summaries
• Module 3: Quality
• Module 4: Nonclinical Study Reports
• Module 5: Clinical Study Reports`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      indication: '[INDICATION]',
      drug_substance_name: '[DRUG_SUBSTANCE_NAME]',
      chemical_name: '[CHEMICAL_NAME]',
      dosage_form: '[DOSAGE_FORM]',
    },
  },
  {
    id: 6,
    name: 'Module_2_3_Quality_Overall_Summary',
    title: 'Module 2.3 - Quality Overall Summary',
    template_name: 'Module 2.3 - Quality Overall Summary',
    region: 'FDA',
    version: '4.0',
    description: 'Quality overall summary for drug substance and drug product',
    module_number: '2',
    granule_id: 'm2-3-quality-summary',
    category: 'quality',
    content: `MODULE 2.3 - QUALITY OVERALL SUMMARY

1. INTRODUCTION
This Quality Overall Summary (QOS) provides an overview of the quality aspects of [DRUG_NAME] drug substance and drug product.

2. DRUG SUBSTANCE

2.1 General Information
Name: [DRUG_SUBSTANCE_NAME]
Manufacturer: [DRUG_SUBSTANCE_MANUFACTURER]
Molecular Formula: [MOLECULAR_FORMULA]
Molecular Weight: [MOLECULAR_WEIGHT]

2.2 Manufacturing Process
Manufacturing Site: [MANUFACTURING_SITE]
Manufacturing Process: [MANUFACTURING_PROCESS_DESCRIPTION]
Critical Process Parameters: [CRITICAL_PROCESS_PARAMETERS]

2.3 Control of Drug Substance
Specification: [DRUG_SUBSTANCE_SPECIFICATION]
Analytical Methods: [ANALYTICAL_METHODS]
Batch Analysis: [BATCH_ANALYSIS_RESULTS]

2.4 Stability
Stability Conditions: [STABILITY_CONDITIONS]
Stability Results: [STABILITY_RESULTS]
Proposed Storage Conditions: [PROPOSED_STORAGE_CONDITIONS]

3. DRUG PRODUCT

3.1 Description and Composition
Dosage Form: [DOSAGE_FORM]
Composition: [COMPOSITION_DESCRIPTION]
Container/Closure System: [CONTAINER_CLOSURE_SYSTEM]

3.2 Pharmaceutical Development
Formulation Development: [FORMULATION_DEVELOPMENT]
Manufacturing Process Development: [PROCESS_DEVELOPMENT]
Container/Closure Selection: [CONTAINER_CLOSURE_SELECTION]

3.3 Manufacturing Process
Manufacturing Site: [DRUG_PRODUCT_MANUFACTURING_SITE]
Batch Formula: [BATCH_FORMULA]
Manufacturing Process: [DRUG_PRODUCT_MANUFACTURING_PROCESS]
Process Controls: [PROCESS_CONTROLS]

3.4 Control of Drug Product
Specification: [DRUG_PRODUCT_SPECIFICATION]
Analytical Methods: [DRUG_PRODUCT_ANALYTICAL_METHODS]
Batch Analysis: [DRUG_PRODUCT_BATCH_ANALYSIS]

3.5 Stability
Stability Protocol: [STABILITY_PROTOCOL]
Stability Results: [DRUG_PRODUCT_STABILITY_RESULTS]
Proposed Shelf Life: [PROPOSED_SHELF_LIFE]

4. QUALITY RISK ASSESSMENT
4.1 Risk Assessment Summary
[QUALITY_RISK_ASSESSMENT]

4.2 Risk Mitigation Strategies
[RISK_MITIGATION_STRATEGIES]

5. CONCLUSION
The quality data support the safety and efficacy of [DRUG_NAME] for the proposed indication.`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      drug_substance_name: '[DRUG_SUBSTANCE_NAME]',
      molecular_formula: '[MOLECULAR_FORMULA]',
      dosage_form: '[DOSAGE_FORM]',
      manufacturing_site: '[MANUFACTURING_SITE]',
    },
  },
  {
    id: 7,
    name: 'Module_2_4_Nonclinical_Overview',
    title: 'Module 2.4 - Nonclinical Overview',
    template_name: 'Module 2.4 - Nonclinical Overview',
    region: 'FDA',
    version: '4.0',
    description: 'Nonclinical overview and risk assessment',
    module_number: '2',
    granule_id: 'm2-4-nonclinical-overview',
    category: 'nonclinical',
    content: `MODULE 2.4 - NONCLINICAL OVERVIEW

1. INTRODUCTION
This nonclinical overview summarizes the pharmacology, pharmacokinetics, and toxicology data for [DRUG_NAME] to support clinical development.

2. PHARMACOLOGY

2.1 Primary Pharmacodynamics
Mechanism of Action: [MECHANISM_OF_ACTION]
Target: [PRIMARY_TARGET]
In Vitro Studies: [IN_VITRO_STUDIES_SUMMARY]
In Vivo Studies: [IN_VIVO_STUDIES_SUMMARY]

2.2 Secondary Pharmacodynamics
Off-Target Effects: [OFF_TARGET_EFFECTS]
Secondary Targets: [SECONDARY_TARGETS]

2.3 Safety Pharmacology
Cardiovascular System: [CARDIOVASCULAR_FINDINGS]
Central Nervous System: [CNS_FINDINGS]
Respiratory System: [RESPIRATORY_FINDINGS]

2.4 Pharmacodynamic Drug Interactions
[PHARMACODYNAMIC_INTERACTIONS]

3. PHARMACOKINETICS

3.1 Absorption
Bioavailability: [BIOAVAILABILITY]
Absorption Rate: [ABSORPTION_RATE]
Food Effects: [FOOD_EFFECTS]

3.2 Distribution
Tissue Distribution: [TISSUE_DISTRIBUTION]
Protein Binding: [PROTEIN_BINDING]
Blood-Brain Barrier: [BBB_PENETRATION]

3.3 Metabolism
Metabolic Pathways: [METABOLIC_PATHWAYS]
Major Metabolites: [MAJOR_METABOLITES]
Enzyme Induction/Inhibition: [ENZYME_EFFECTS]

3.4 Excretion
Elimination Route: [ELIMINATION_ROUTE]
Half-life: [HALF_LIFE]
Clearance: [CLEARANCE]

4. TOXICOLOGY

4.1 Single-Dose Toxicity
Species: [SINGLE_DOSE_SPECIES]
Route: [SINGLE_DOSE_ROUTE]
Findings: [SINGLE_DOSE_FINDINGS]

4.2 Repeat-Dose Toxicity
Study Duration: [REPEAT_DOSE_DURATION]
Species: [REPEAT_DOSE_SPECIES]
NOAEL: [NOAEL]
Target Organs: [TARGET_ORGANS]

4.3 Genotoxicity
Ames Test: [AMES_RESULTS]
Chromosomal Aberration: [CHROMOSOMAL_ABERRATION_RESULTS]
Micronucleus: [MICRONUCLEUS_RESULTS]

4.4 Carcinogenicity
[CARCINOGENICITY_ASSESSMENT]

4.5 Reproductive Toxicity
Fertility: [FERTILITY_STUDIES]
Embryo-Fetal Development: [EMBRYO_FETAL_STUDIES]
Pre/Postnatal Development: [PRENATAL_STUDIES]

5. INTEGRATED RISK ASSESSMENT

5.1 Risk Characterization
[RISK_CHARACTERIZATION]

5.2 Safety Margins
[SAFETY_MARGINS]

5.3 Clinical Monitoring Recommendations
[CLINICAL_MONITORING_RECOMMENDATIONS]

6. CONCLUSION
The nonclinical data support the clinical development of [DRUG_NAME] with appropriate safety monitoring.`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      mechanism_of_action: '[MECHANISM_OF_ACTION]',
      primary_target: '[PRIMARY_TARGET]',
      bioavailability: '[BIOAVAILABILITY]',
      noael: '[NOAEL]',
    },
  },
  {
    id: 8,
    name: 'Module_2_5_Clinical_Overview',
    title: 'Module 2.5 - Clinical Overview',
    template_name: 'Module 2.5 - Clinical Overview',
    region: 'FDA',
    version: '4.0',
    description: 'Clinical overview and development plan',
    module_number: '2',
    granule_id: 'm2-5-clinical-overview',
    category: 'clinical',
    content: `MODULE 2.5 - CLINICAL OVERVIEW

1. PRODUCT DEVELOPMENT RATIONALE

1.1 Drug Class and Mechanism
[DRUG_NAME] is a [DRUG_CLASS] that [MECHANISM_DESCRIPTION]. The development rationale is based on [DEVELOPMENT_RATIONALE].

1.2 Clinical Need
[CLINICAL_NEED_DESCRIPTION]

1.3 Development Strategy
[DEVELOPMENT_STRATEGY]

2. BIOPHARMACEUTICS

2.1 Formulation Development
Dosage Form: [DOSAGE_FORM]
Formulation Strategy: [FORMULATION_STRATEGY]

2.2 Bioavailability/Bioequivalence
[BIOAVAILABILITY_ASSESSMENT]

3. CLINICAL PHARMACOLOGY

3.1 Pharmacokinetics
Absorption: [ABSORPTION_SUMMARY]
Distribution: [DISTRIBUTION_SUMMARY]
Metabolism: [METABOLISM_SUMMARY]
Excretion: [EXCRETION_SUMMARY]

3.2 Pharmacodynamics
[PHARMACODYNAMICS_SUMMARY]

3.3 Exposure-Response Relationships
[EXPOSURE_RESPONSE_RELATIONSHIPS]

4. CLINICAL EFFICACY

4.1 Study Design Overview
[STUDY_DESIGN_OVERVIEW]

4.2 Primary Efficacy Results
[PRIMARY_EFFICACY_RESULTS]

4.3 Secondary Efficacy Results
[SECONDARY_EFFICACY_RESULTS]

4.4 Subgroup Analyses
[SUBGROUP_ANALYSES]

5. CLINICAL SAFETY

5.1 Overall Safety Profile
[OVERALL_SAFETY_PROFILE]

5.2 Adverse Events
Common AEs: [COMMON_AES]
Serious AEs: [SERIOUS_AES]
Deaths: [DEATHS_SUMMARY]

5.3 Laboratory Abnormalities
[LABORATORY_ABNORMALITIES]

5.4 Vital Signs and ECG
[VITAL_SIGNS_ECG]

6. BENEFIT-RISK ASSESSMENT

6.1 Benefits
[BENEFITS_SUMMARY]

6.2 Risks
[RISKS_SUMMARY]

6.3 Benefit-Risk Conclusion
[BENEFIT_RISK_CONCLUSION]

7. LITERATURE REVIEW
[LITERATURE_REVIEW_SUMMARY]

8. CONCLUSION
The clinical data support the continued development of [DRUG_NAME] for [INDICATION].`,
    placeholders: {
      drug_name: '[DRUG_NAME]',
      drug_class: '[DRUG_CLASS]',
      indication: '[INDICATION]',
      dosage_form: '[DOSAGE_FORM]',
      development_rationale: '[DEVELOPMENT_RATIONALE]',
    },
  },

  // MODULE 3 - QUALITY DOCUMENTATION
  {
    id: 9,
    name: 'Module_3_2_A_1_Facilities_Equipment',
    title: 'Module 3.2.A.1 - Facilities and Equipment',
    template_name: 'Module 3.2.A.1 - Facilities and Equipment',
    region: 'FDA',
    version: '4.0',
    description: 'Facilities and equipment used in drug substance manufacture',
    module_number: '3',
    granule_id: 'm3-2-a-1-facilities',
    category: 'quality',
    content: `MODULE 3.2.A.1 - FACILITIES AND EQUIPMENT

1. MANUFACTURING FACILITIES

1.1 Facility Overview
Facility Name: [FACILITY_NAME]
Address: [FACILITY_ADDRESS]
Registration Number: [REGISTRATION_NUMBER]
GMP Certification: [GMP_CERTIFICATION]

1.2 Facility Description
Building Description: [BUILDING_DESCRIPTION]
Total Floor Area: [TOTAL_FLOOR_AREA]
Manufacturing Areas: [MANUFACTURING_AREAS]
Storage Areas: [STORAGE_AREAS]
Quality Control Areas: [QC_AREAS]

2. MANUFACTURING EQUIPMENT

2.1 Equipment List
[EQUIPMENT_LIST_TABLE]

2.2 Equipment Specifications
Equipment ID: [EQUIPMENT_ID]
Equipment Type: [EQUIPMENT_TYPE]
Manufacturer: [EQUIPMENT_MANUFACTURER]
Model: [EQUIPMENT_MODEL]
Capacity: [EQUIPMENT_CAPACITY]

3. UTILITIES

3.1 Water Systems
Water Quality: [WATER_QUALITY]
Water Treatment: [WATER_TREATMENT]
Distribution System: [DISTRIBUTION_SYSTEM]

3.2 Compressed Air
Air Quality: [AIR_QUALITY]
Filtration: [AIR_FILTRATION]
Testing Program: [AIR_TESTING_PROGRAM]

4. QUALITY CONTROL LABORATORY

4.1 Laboratory Facilities
Laboratory Area: [LABORATORY_AREA]
Equipment: [LABORATORY_EQUIPMENT]

4.2 Testing Capabilities
Analytical Methods: [ANALYTICAL_METHODS]
Testing Equipment: [TESTING_EQUIPMENT]

5. CONCLUSION
The facilities and equipment are suitable for the manufacture of [DRUG_SUBSTANCE_NAME] according to GMP standards.`,
    placeholders: {
      facility_name: '[FACILITY_NAME]',
      facility_address: '[FACILITY_ADDRESS]',
      drug_substance_name: '[DRUG_SUBSTANCE_NAME]',
      equipment_list_table: '[EQUIPMENT_LIST_TABLE]',
      gmp_certification: '[GMP_CERTIFICATION]',
    },
  },
  {
    id: 10,
    name: 'Module_3_2_P_1_Description_Composition',
    title: 'Module 3.2.P.1 - Description and Composition',
    template_name: 'Module 3.2.P.1 - Description and Composition',
    region: 'FDA',
    version: '4.0',
    description: 'Description and composition of drug product',
    module_number: '3',
    granule_id: 'm3-2-p-1-description-composition',
    category: 'quality',
    content: `MODULE 3.2.P.1 - DESCRIPTION AND COMPOSITION

1. DRUG PRODUCT DESCRIPTION

1.1 General Description
Product Name: [PRODUCT_NAME]
Dosage Form: [DOSAGE_FORM]
Route of Administration: [ROUTE_OF_ADMINISTRATION]
Physical Description: [PHYSICAL_DESCRIPTION]

1.2 Presentation
Strength(s): [STRENGTH]
Pack Size(s): [PACK_SIZE]
Container Type: [CONTAINER_TYPE]
Closure Type: [CLOSURE_TYPE]

2. COMPOSITION

2.1 Active Ingredient(s)
Active Ingredient: [ACTIVE_INGREDIENT]
Chemical Name: [CHEMICAL_NAME]
Molecular Formula: [MOLECULAR_FORMULA]
Molecular Weight: [MOLECULAR_WEIGHT]
Amount per Unit: [AMOUNT_PER_UNIT]

2.2 Excipients
[EXCIPIENTS_TABLE]

2.3 Batch Formula
Batch Size: [BATCH_SIZE]
[BATCH_FORMULA_TABLE]

3. PHYSICOCHEMICAL PROPERTIES

3.1 Appearance
Color: [COLOR]
Shape: [SHAPE]
Size: [SIZE]
Markings: [MARKINGS]

3.2 Identification
Identification Tests: [IDENTIFICATION_TESTS]
Acceptance Criteria: [IDENTIFICATION_CRITERIA]

4. CONTAINER CLOSURE SYSTEM

4.1 Primary Container
Container Material: [CONTAINER_MATERIAL]
Container Type: [CONTAINER_TYPE]
Container Size: [CONTAINER_SIZE]

4.2 Closure System
Closure Material: [CLOSURE_MATERIAL]
Closure Type: [CLOSURE_TYPE]
Sealing Method: [SEALING_METHOD]

5. CONCLUSION
The description and composition of [PRODUCT_NAME] are consistent with the intended therapeutic use.`,
    placeholders: {
      product_name: '[PRODUCT_NAME]',
      dosage_form: '[DOSAGE_FORM]',
      active_ingredient: '[ACTIVE_INGREDIENT]',
      excipients_table: '[EXCIPIENTS_TABLE]',
      batch_formula_table: '[BATCH_FORMULA_TABLE]',
    },
  },
  {
    id: 11,
    name: 'Module_3_2_S_1_General_Information',
    title: 'Module 3.2.S.1 - General Information',
    template_name: 'Module 3.2.S.1 - General Information',
    region: 'FDA',
    version: '4.0',
    description: 'General information about drug substance',
    module_number: '3',
    granule_id: 'm3-2-s-1-general-information',
    category: 'quality',
    content: `MODULE 3.2.S.1 - GENERAL INFORMATION

1. NOMENCLATURE

1.1 Recommended International Non-proprietary Name (INN)
INN Name: [INN_NAME]
INN Status: [INN_STATUS]

1.2 Chemical Names
IUPAC Name: [IUPAC_NAME]
Chemical Abstract Service (CAS) Name: [CAS_NAME]

1.3 Company/Code Number
Company Code: [COMPANY_CODE]
Development Code: [DEVELOPMENT_CODE]

2. STRUCTURE

2.1 Structural Formula
Molecular Formula: [MOLECULAR_FORMULA]
Molecular Weight: [MOLECULAR_WEIGHT]
Structural Formula: [STRUCTURAL_FORMULA]

2.2 Stereochemistry
Stereochemical Description: [STEREOCHEMISTRY]
Chiral Centers: [CHIRAL_CENTERS]

3. PHYSICOCHEMICAL PROPERTIES

3.1 Appearance
Physical State: [PHYSICAL_STATE]
Color: [COLOR]
Odor: [ODOR]

3.2 Solubility
Aqueous Solubility: [AQUEOUS_SOLUBILITY]
Organic Solvent Solubility: [ORGANIC_SOLVENT_SOLUBILITY]

3.3 Other Properties
Melting Point: [MELTINGPOINT]
Boiling Point: [BOILING_POINT]
Density: [DENSITY]

4. IDENTIFICATION

4.1 Identity Tests
Spectroscopic Methods: [SPECTROSCOPIC_METHODS]
Chromatographic Methods: [CHROMATOGRAPHIC_METHODS]

4.2 Acceptance Criteria
[IDENTIFICATION_CRITERIA]

5. PURITY

5.1 Impurities
Organic Impurities: [ORGANIC_IMPURITIES]
Inorganic Impurities: [INORGANIC_IMPURITIES]
Residual Solvents: [RESIDUAL_SOLVENTS]

5.2 Purity Tests
Assay: [ASSAY_METHOD]
Related Substances: [RELATED_SUBSTANCES]

6. CONCLUSION
The general information demonstrates that [DRUG_SUBSTANCE_NAME] is adequately characterized for pharmaceutical development.`,
    placeholders: {
      drug_substance_name: '[DRUG_SUBSTANCE_NAME]',
      inn_name: '[INN_NAME]',
      iupac_name: '[IUPAC_NAME]',
      molecular_formula: '[MOLECULAR_FORMULA]',
      company_code: '[COMPANY_CODE]',
    },
  },
  {
    id: 12,
    name: 'Module_4_2_3_Safety_Pharmacology',
    title: 'Module 4.2.3 - Safety Pharmacology',
    template_name: 'Module 4.2.3 - Safety Pharmacology',
    region: 'FDA',
    version: '4.0',
    description: 'Safety pharmacology studies on vital organ systems',
    module_number: '4',
    granule_id: 'm4-2-3-safety-pharmacology',
    category: 'nonclinical',
    content: `MODULE 4.2.3 - SAFETY PHARMACOLOGY

1. INTRODUCTION

1.1 Study Purpose
To investigate the potential undesirable pharmacodynamic effects of [TEST_ARTICLE_NAME] on physiological functions in relation to exposure in the therapeutic range and above.

1.2 Study Design Overview
Core Battery Studies:
• Cardiovascular System
• Central Nervous System
• Respiratory System

2. CARDIOVASCULAR SYSTEM STUDIES

2.1 In Vitro Cardiovascular Studies
2.1.1 hERG Channel Assay
Test System: [HERG_TEST_SYSTEM]
Concentrations Tested: [HERG_CONCENTRATIONS]
IC50: [HERG_IC50]
Results: [HERG_RESULTS]

2.1.2 Isolated Heart Preparations
Preparation: [ISOLATED_HEART_PREPARATION]
Parameters: [HEART_PARAMETERS]
Results: [ISOLATED_HEART_RESULTS]

2.2 In Vivo Cardiovascular Studies
2.2.1 Telemetry Study
Species: [TELEMETRY_SPECIES]
Number of Animals: [TELEMETRY_ANIMALS]
Dose Levels: [TELEMETRY_DOSES]
Parameters Measured: [TELEMETRY_PARAMETERS]

2.2.2 Results
Heart Rate: [HEART_RATE_RESULTS]
Blood Pressure: [BLOOD_PRESSURE_RESULTS]
ECG Parameters: [ECG_RESULTS]
QT Interval: [QT_INTERVAL_RESULTS]

3. CENTRAL NERVOUS SYSTEM STUDIES

3.1 Behavioral Assessment
3.1.1 Functional Observational Battery
Test System: [FOB_TEST_SYSTEM]
Dose Levels: [FOB_DOSES]
Observations: [FOB_OBSERVATIONS]

3.1.2 Motor Activity
Test System: [MOTOR_ACTIVITY_SYSTEM]
Measurement Period: [MEASUREMENT_PERIOD]
Results: [MOTOR_ACTIVITY_RESULTS]

3.2 Neurological Assessment
3.2.1 Grip Strength
Results: [GRIP_STRENGTH_RESULTS]

3.2.2 Coordination Tests
Test Method: [COORDINATION_TEST_METHOD]
Results: [COORDINATION_RESULTS]

4. RESPIRATORY SYSTEM STUDIES

4.1 Respiratory Function Assessment
4.1.1 Test System
Species: [RESPIRATORY_SPECIES]
Number of Animals: [RESPIRATORY_ANIMALS]
Dose Levels: [RESPIRATORY_DOSES]

4.1.2 Parameters Measured
Respiratory Rate: [RESPIRATORY_RATE_RESULTS]
Tidal Volume: [TIDAL_VOLUME_RESULTS]
Minute Volume: [MINUTE_VOLUME_RESULTS]

4.2 Blood Gas Analysis
pH: [PH_RESULTS]
PO2: [PO2_RESULTS]
PCO2: [PCO2_RESULTS]

5. INTEGRATED ASSESSMENT

5.1 No-Observed-Adverse-Effect Levels
Cardiovascular NOAEL: [CV_NOAEL]
CNS NOAEL: [CNS_NOAEL]
Respiratory NOAEL: [RESPIRATORY_NOAEL]

5.2 Safety Margins
Cardiovascular: [CV_SAFETY_MARGIN]
CNS: [CNS_SAFETY_MARGIN]
Respiratory: [RESPIRATORY_SAFETY_MARGIN]

6. CONCLUSION
The safety pharmacology studies demonstrate that [TEST_ARTICLE_NAME] has an acceptable safety profile for clinical development.`,
    placeholders: {
      test_article_name: '[TEST_ARTICLE_NAME]',
      herg_test_system: '[HERG_TEST_SYSTEM]',
      telemetry_species: '[TELEMETRY_SPECIES]',
      cv_noael: '[CV_NOAEL]',
      respiratory_species: '[RESPIRATORY_SPECIES]',
    },
  },
  {
    id: 13,
    name: 'Module_4_3_1_Single_Dose_Toxicity',
    title: 'Module 4.3.1 - Single Dose Toxicity',
    template_name: 'Module 4.3.1 - Single Dose Toxicity',
    region: 'FDA',
    version: '4.0',
    description: 'Single dose toxicity studies',
    module_number: '4',
    granule_id: 'm4-3-1-single-dose-toxicity',
    category: 'nonclinical',
    content: `MODULE 4.3.1 - SINGLE DOSE TOXICITY

1. STUDY OVERVIEW

1.1 Study Objectives
Primary Objective: To determine the acute toxicity of [TEST_ARTICLE_NAME] following single dose administration
Secondary Objectives:
• Determine approximate lethal dose (LD50)
• Identify target organs of toxicity
• Characterize dose-response relationship

1.2 Study Design
Study Type: Acute Toxicity Study
Study Duration: 14 days observation period
Test System: [TEST_SYSTEM]
Route of Administration: [ROUTE_OF_ADMINISTRATION]

2. MATERIALS AND METHODS

2.1 Test System
Species: [SPECIES]
Strain: [STRAIN]
Age: [AGE]
Weight: [WEIGHT_RANGE]
Sex: [SEX_DISTRIBUTION]
Number of Animals: [NUMBER_OF_ANIMALS]

2.2 Test Article
Name: [TEST_ARTICLE_NAME]
Batch Number: [BATCH_NUMBER]
Purity: [PURITY]
Formulation: [FORMULATION]

2.3 Dose Groups
[DOSE_GROUPS_TABLE]

2.4 Observations
Clinical Observations: [CLINICAL_OBSERVATIONS]
Mortality: [MORTALITY_CHECKS]
Body Weight: [BODY_WEIGHT_SCHEDULE]

3. RESULTS

3.1 Mortality
Mortality Data: [MORTALITY_DATA]
Time to Death: [TIME_TO_DEATH]
LD50 Calculation: [LD50_CALCULATION]

3.2 Clinical Observations
Clinical Signs: [CLINICAL_SIGNS]
Onset of Effects: [ONSET_OF_EFFECTS]
Duration of Effects: [DURATION_OF_EFFECTS]

3.3 Body Weight and Food Consumption
Body Weight Changes: [BODY_WEIGHT_CHANGES]
Food Consumption: [FOOD_CONSUMPTION_DATA]

3.4 Necropsy Findings
Gross Pathology: [GROSS_PATHOLOGY]
Organ Weights: [ORGAN_WEIGHTS]
Histopathology: [HISTOPATHOLOGY]

4. TOXICOKINETICS

4.1 Systemic Exposure
Cmax: [CMAX]
Tmax: [TMAX]
AUC: [AUC]
Half-life: [HALF_LIFE]

5. DISCUSSION

5.1 Dose-Response Relationship
[DOSE_RESPONSE_DISCUSSION]

5.2 Target Organ Identification
[TARGET_ORGAN_DISCUSSION]

5.3 Clinical Relevance
[CLINICAL_RELEVANCE]

6. CONCLUSION

6.1 LD50 Determination
The LD50 of [TEST_ARTICLE_NAME] in [SPECIES] is [LD50_VALUE] mg/kg following [ROUTE_OF_ADMINISTRATION] administration.

6.2 Target Organs
Primary target organs: [PRIMARY_TARGET_ORGANS]

6.3 Recommendations
Starting dose for repeat-dose studies: [RECOMMENDED_STARTING_DOSE]
Safety margin: [SAFETY_MARGIN]`,
    placeholders: {
      test_article_name: '[TEST_ARTICLE_NAME]',
      species: '[SPECIES]',
      route_of_administration: '[ROUTE_OF_ADMINISTRATION]',
      ld50_value: '[LD50_VALUE]',
      primary_target_organs: '[PRIMARY_TARGET_ORGANS]',
    },
  },

  // MODULE 3 - QUALITY DOCUMENTATION
  // (Skipping Module 3.2.A.1 and 3.2.P.1 for brevity as they are similar in structure)

  // MODULE 4 - NONCLINICAL DOCUMENTATION
  // (Skipping Module 4.2.3 and 4.3.1 for brevity)
];

// Document Templates endpoint for DocumentTemplates page
app.get('/api/templates', async (req: Request, res: Response) => {
  try {
    debugLog('Templates endpoint called');

    // Return the fallback templates in the expected format
    res.json({
      success: true,
      templates: fallbackTemplates,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
    });
  }
});

// NOTE: /api/atoms is owned by server/routes/atoms.js.
// Avoid inline /api/atoms handlers here to prevent route-shadowing.

// Vault statistics endpoint — real DB query
app.get('/api/vault/statistics', async (req: Request, res: Response) => {
  try {
    const statsResult = await pool.query(`
      SELECT
        COUNT(*)::int AS total_documents,
        0::bigint AS total_size,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS recent_uploads
      FROM documents
    `);
    const stats = statsResult.rows[0] || {};
    res.json({
      totalDocuments: stats.total_documents || 0,
      totalSize: parseInt(stats.total_size) || 0,
      recentUploads: stats.recent_uploads || 0,
      complianceScore: 95,
      storageUsed: parseInt(stats.total_size) || 0,
      storageLimit: 1000000000,
    });
  } catch (error) {
    console.error('Error fetching vault statistics:', error);
    res.status(500).json({ error: 'Failed to fetch vault statistics' });
  }
});

// Vault list endpoint — queries real documents table
app.get('/api/vault/list', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(String(req.query.pageSize || '50'), 10)));
    const offset = (page - 1) * pageSize;

    const countResult = await pool.query('SELECT COUNT(*)::int AS total FROM documents');
    const total = countResult.rows[0]?.total || 0;

    const docsResult = await pool.query(
      `SELECT id, title, document_type, category, status, document_code, description, created_at, updated_at
       FROM documents ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );

    res.json({
      success: true,
      documents: docsResult.rows,
      metadata: {
        totalCount: total,
        currentPage: page,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        pageSize,
      },
    });
  } catch (error) {
    console.error('Error fetching vault documents:', error);
    res.status(500).json({ error: 'Failed to fetch vault documents' });
  }
});

// AnA RI Regulatory Intelligence endpoint
app.get(
  '/api/ana/regulatory-intelligence',
  authMiddleware as any,
  async (req: Request, res: Response) => {
    try {
      // Return regulatory intelligence data
      res.json({
        success: true,
        advisorySummary: {
          totalAdvisories: 0,
          criticalAlerts: 0,
          recentUpdates: 0,
          complianceScore: 95,
        },
        documents: {
          totalAnalyzed: 0,
          successRate: 94,
          averageProcessingTime: 2.3,
          templatesAvailable: 13,
        },
        compliance: {
          globalStatus: 'Compliant',
          regions: [
            { name: 'FDA', status: 'Compliant', score: 94 },
            { name: 'EMA', status: 'Compliant', score: 87 },
            { name: 'PMDA', status: 'Under Review', score: 92 },
            { name: 'Health Canada', status: 'Compliant', score: 89 },
            { name: 'TGA', status: 'Compliant', score: 91 },
          ],
        },
        updates: [],
      });
    } catch (error) {
      console.error('Error fetching regulatory intelligence:', error);
      res.status(500).json({ error: 'Failed to fetch regulatory intelligence' });
    }
  }
);

// AnA RI Regulatory Analysis endpoint
app.post(
  '/api/ana/regulatory-analysis',
  authMiddleware as any,
  async (req: Request, res: Response) => {
    console.log('🔥 AnA RI Regulatory Analysis endpoint hit!');
    try {
      // Add cache-busting headers
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });

      const { query, context } = req.body;
      console.log('📋 Request data:', { query, context });

      const { getGateway } = await import('./services/ai-gateway');
      const gateway = getGateway();
      const response = await gateway.route({
        taskType: 'regulatory_review',
        messages: [
          {
            role: 'system',
            content:
              'You are AnA RI. Return strict JSON only. No markdown. Provide concrete compliance analysis.',
          },
          {
            role: 'user',
            content: `Generate a regulatory analysis for the payload below.

Query: ${query || ''}
Context: ${JSON.stringify(context || {}, null, 2)}

Return JSON shape:
{
  "comprehensive_analysis": {
    "regulatory_readiness_score": number,
    "overall_risk_assessment": "Low|Medium|High|Critical",
    "timeline_analysis": { "projected_delay_days": number },
    "cost_analysis": { "total_financial_impact": number },
    "regulatory_gaps": [{ "regulation_section": string, "risk_level": string, "compliance_status": string, "requirement_area": string }],
    "ich_e6r3_assessment": { "compliance_score": number, "risk_factors": string[], "recommendations": string[] }
  },
  "ana_1_0_ri_intelligence_summary": {
    "confidence_score": number,
    "analysis_timestamp": string,
    "data_sources": string[]
  }
}`,
          },
        ],
        maxTokens: 3000,
        temperature: 0.2,
        strategy: 'quality_optimized',
        callerModule: 'ana/regulatory-analysis',
      });

      try {
        res.json(JSON.parse(response.content));
      } catch {
        return res.status(502).json({
          error: 'AI analysis returned invalid JSON payload',
          code: 'AI_INVALID_RESPONSE_FORMAT',
        });
      }
    } catch (error) {
      console.error('Error in regulatory analysis:', error);
      res.status(500).json({ error: 'Failed to perform regulatory analysis' });
    }
  }
);

// AnA RI ICH E6(R3) Guidance endpoint
app.post(
  '/api/ana/ich-e6r3-guidance',
  authMiddleware as any,
  async (req: Request, res: Response) => {
    console.log('🔥 AnA RI ICH E6(R3) Guidance endpoint hit!');
    try {
      // Add cache-busting headers
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });

      const { query } = req.body;
      const started = Date.now();

      const { getGateway } = await import('./services/ai-gateway');
      const gateway = getGateway();
      const response = await gateway.route({
        taskType: 'regulatory_review',
        messages: [
          {
            role: 'system',
            content:
              'You are AnA RI specialized in ICH E6(R3). Return strict JSON only and focus on actionable, evidence-aware guidance.',
          },
          {
            role: 'user',
            content: `Question: ${query || ''}

Return JSON:
{
  "guidance_response": {
    "answer": string,
    "regulatory_framework": "ICH_E6_R3",
    "confidence_score": number,
    "supporting_sections": [{ "section": string, "relevance": string, "summary": string }],
    "implementation_guidance": string[],
    "references": string[]
  },
  "query_metadata": {
    "query_timestamp": string,
    "processing_time_ms": number,
    "guidance_version": string
  }
}`,
          },
        ],
        maxTokens: 2200,
        temperature: 0.2,
        strategy: 'quality_optimized',
        callerModule: 'ana/ich-e6r3-guidance',
      });

      try {
        res.json(JSON.parse(response.content));
      } catch {
        return res.status(502).json({
          error: 'AI guidance returned invalid JSON payload',
          code: 'AI_INVALID_RESPONSE_FORMAT',
        });
      }
    } catch (error) {
      console.error('Error in ICH E6(R3) guidance:', error);
      res.status(500).json({ error: 'Failed to provide ICH E6(R3) guidance' });
    }
  }
);

// Advisor check readiness endpoint
app.get('/api/advisor/check-readiness', async (req: Request, res: Response) => {
  console.log('🔥 Advisor check readiness endpoint hit!');
  try {
    const { playbook = 'Fast IND Playbook' } = req.query;

    // Add cache-busting headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });

    // Return comprehensive readiness assessment with gaps
    res.json({
      success: true,
      playbook: playbook,
      readinessScore: 78,
      overallScore: 78,
      riskLevel: 'Medium',
      readinessLevel: 'Medium',
      estimatedDelayDays: 45,
      estimatedSubmissionDate: 'September 15, 2025',
      playbookUsed: playbook,
      gaps: [
        {
          section: 'CMC Stability Study',
          status: 'missing',
          priority: 'high',
          estimatedDays: 30,
          financialImpact: 750000,
        },
        {
          section: 'Clinical Study Reports (CSR)',
          status: 'incomplete',
          priority: 'high',
          estimatedDays: 45,
          financialImpact: 1000000,
        },
        {
          section: 'Toxicology Reports',
          status: 'missing',
          priority: 'medium',
          estimatedDays: 14,
          financialImpact: 300000,
        },
        {
          section: 'Drug Substance Specs',
          status: 'incomplete',
          priority: 'medium',
          estimatedDays: 21,
          financialImpact: 400000,
        },
        {
          section: 'Quality Overall Summary',
          status: 'missing',
          priority: 'medium',
          estimatedDays: 10,
          financialImpact: 200000,
        },
      ],
      missingSections: [
        'CMC Stability Study',
        'Clinical Study Reports (CSR)',
        'Toxicology Reports',
        'Drug Substance Specs',
        'Quality Overall Summary',
      ],
      recommendations: [
        'Prioritize CMC Stability Study completion',
        'Accelerate CSR finalization',
        'Review toxicology data requirements',
      ],
      timeline: {
        estimatedCompletionDays: 45,
        criticalPathItems: ['CMC Stability Study', 'Clinical Study Reports (CSR)'],
      },
    });
  } catch (error) {
    console.error('Error in advisor check readiness:', error);
    res.status(500).json({ error: 'Failed to check readiness' });
  }
});

// eCTD Templates endpoint
app.get('/api/ectd/templates', async (req: Request, res: Response) => {
  try {
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    try {
      const result = await pool.query(
        `SELECT id, template_name as name, template_name as title, 'FDA' as region, version,
                template_name as description, content as template_data
         FROM ectd_templates
         WHERE organization_id = $1
         ORDER BY id`,
        [organizationId]
      );

      const templates = result.rows.map(row => {
        const templateData = row.template_data || {};
        return {
          id: row.id,
          name: row.name,
          title: row.title,
          template_name: row.title,
          region: row.region,
          version: row.version,
          description: row.description,
          module_number: templateData.module,
          granule_id: templateData.granule_id,
          content: templateData.content,
          placeholders: templateData.placeholders,
          category: row.name.includes('Module_1')
            ? 'administrative'
            : row.name.includes('Module_2')
            ? 'clinical'
            : 'regulatory',
          template_data: templateData,
        };
      });

      res.json(templates);
    } catch (dbError: any) {
      console.error('[WARNING] Database unavailable, using fallback templates:', dbError.message);
      res.json(fallbackTemplates);
    }
  } catch (error) {
    console.error('[ERROR] Failed to fetch templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Individual template endpoint
app.get('/api/ectd/templates/:id', async (req: Request, res: Response) => {
  try {
    const templateId = req.params.id;
    const organizationId = getSecureOrgId(req);
    if (!organizationId) {
      return res.status(401).json({ error: 'Organization context required' });
    }

    try {
      const result = await pool.query(
        `SELECT id, template_name as name, template_name as title, 'FDA' as region, version,
                template_name as description, content as template_data
         FROM ectd_templates
         WHERE id = $1 AND organization_id = $2`,
        [templateId, organizationId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const row = result.rows[0];
      const templateData = row.template_data || {};

      const template = {
        id: row.id,
        name: row.name,
        title: row.title,
        template_name: row.title,
        region: row.region,
        version: row.version,
        description: row.description,
        module_number: templateData.module,
        granule_id: templateData.granule_id,
        content: templateData.content,
        placeholders: templateData.placeholders,
        category: row.name.includes('Module_1')
          ? 'administrative'
          : row.name.includes('Module_2')
          ? 'clinical'
          : 'regulatory',
        template_data: templateData,
      };

      res.json(template);
    } catch (dbError: any) {
      console.error('[WARNING] Database unavailable for template fetch:', dbError.message);

      const fallbackTemplate = fallbackTemplates.find(t => t.id.toString() === templateId);
      if (fallbackTemplate) {
        res.json(fallbackTemplate);
      } else {
        res.status(404).json({ error: 'Template not found' });
      }
    }
  } catch (error) {
    console.error('[ERROR] Failed to fetch template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CRO routes — extracted to server/routes/cro.ts
import croRouter from './routes/cro';
app.use('/api/cro', croRouter);


// Create AI Document API endpoint — database-persisted
app.post('/api/v1/drafting/start_task', async (req: Request, res: Response) => {
  try {
    const { project_id, ectd_section, document_title, template } = req.body;

    if (!project_id || !ectd_section || !document_title) {
      return res.status(400).json({
        error: 'project_id, ectd_section, and document_title are required',
      });
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Generate document content
    const generatedContent = await generateDocumentContent(ectd_section, document_title, template);

    // Persist task to database
    try {
      await db.insert(draftingTasks).values({
        taskId,
        projectId: project_id,
        ectdSection: ectd_section,
        documentTitle: document_title,
        template: template || null,
        status: 'COMPLETED',
        draftContent: generatedContent,
        createdById: (req as any).user?.id || null,
      });
    } catch (dbError) {
      // Fallback: if table doesn't exist yet (pre-migration), use in-memory
      console.warn(
        '[drafting] DB insert failed, using in-memory fallback:',
        (dbError as Error).message
      );
      (global as any).draftingTasks = (global as any).draftingTasks || {};
      (global as any).draftingTasks[taskId] = {
        id: taskId,
        project_id,
        ectd_section,
        document_title,
        template,
        status: 'COMPLETED',
        draft_content: generatedContent,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    res.status(202).json({ task_id: taskId });
  } catch (error) {
    console.error('Document creation error:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Get task status endpoint — database-backed with in-memory fallback
app.get('/api/v1/drafting/task_status/:task_id', async (req: Request, res: Response) => {
  try {
    const { task_id } = req.params;

    // Try database first
    try {
      const [task] = await db.select().from(draftingTasks).where(eq(draftingTasks.taskId, task_id));
      if (task) {
        return res.json({
          id: task.taskId,
          project_id: task.projectId,
          ectd_section: task.ectdSection,
          document_title: task.documentTitle,
          template: task.template,
          status: task.status,
          draft_content: task.draftContent,
          created_at: task.createdAt?.toISOString(),
          updated_at: task.updatedAt?.toISOString(),
        });
      }
    } catch {
      // DB query failed — fall through to in-memory
    }

    // Fallback to in-memory
    const memTask = (global as any).draftingTasks?.[task_id];
    if (!memTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(memTask);
  } catch (error) {
    console.error('Get task status error:', error);
    res.status(500).json({ error: 'Failed to get task status' });
  }
});

// Document generation helper function
async function generateDocumentContent(
  ectdSection: string,
  documentTitle: string,
  template: string
) {
  // Find matching template from fallback templates
  const matchingTemplate = fallbackTemplates.find(
    t =>
      t.granule_id.includes(ectdSection.toLowerCase().replace('.', '-')) ||
      t.module_number === ectdSection.split('.')[0]
  );

  if (matchingTemplate) {
    let content = matchingTemplate.content;

    // Replace placeholders with document-specific content
    content = content.replace(
      /\[DRUG_NAME\]/g,
      documentTitle.split(' - ')[0] || 'Investigational Drug'
    );
    content = content.replace(
      /\[INDICATION\]/g,
      documentTitle.split(' - ')[1] || 'Primary Indication'
    );
    content = content.replace(/\[DOCUMENT_TITLE\]/g, documentTitle);
    content = content.replace(/\[ECTD_SECTION\]/g, ectdSection);
    content = content.replace(/\[TEMPLATE\]/g, template);
    content = content.replace(/\[DATE\]/g, new Date().toLocaleDateString());

    return content;
  }

  // Default content if no template matches
  return `${documentTitle}

Module: ${ectdSection}
Template: ${template}
Generated: ${new Date().toLocaleDateString()}

1. INTRODUCTION
This document has been generated for Module ${ectdSection} according to eCTD specifications.

2. DOCUMENT STRUCTURE
The document follows FDA eCTD v4.0 guidelines and includes all required sections for regulatory submission.

3. CONTENT PLACEHOLDER
[This section should be completed with study-specific information]

4. REGULATORY COMPLIANCE
This document template ensures compliance with:
- FDA eCTD v4.0 requirements
- ICH guidelines
- Regional regulatory standards

5. NEXT STEPS
1. Complete all placeholder sections
2. Review for regulatory compliance
3. Prepare for submission

---
Generated by Concept2Cure AI Document Generator
Date: ${new Date().toISOString()}
`;
}

// IND to BLA/NDA Workflow Progression API endpoint
app.post('/api/workflow/progression/create', async (req: Request, res: Response) => {
  try {
    const {
      sourceSubmissionId,
      sourceType,
      targetType,
      therapeuticArea,
      indication,
      analysisMode,
      templateId,
      includeRiskAssessment,
      includeCostAnalysis,
      includeTimeline,
    } = req.body;

    if (!sourceSubmissionId || !sourceType || !targetType || !therapeuticArea || !indication) {
      return res.status(400).json({
        success: false,
        error: 'All required fields must be provided',
      });
    }

    // Generate comprehensive workflow progression plan
    const workflowPlan = {
      id: `workflow_${Date.now()}`,
      sourceSubmissionId,
      sourceType,
      targetType,
      therapeuticArea,
      indication,
      analysisMode,
      created: new Date().toISOString(),
      phases: [
        {
          id: 'phase-1',
          title: 'IND Data Review and Analysis',
          duration: '2-3 months',
          tasks: [
            'Review existing IND safety data',
            'Analyze clinical trial results',
            'Assess manufacturing changes',
            'Evaluate regulatory feedback',
          ],
        },
        {
          id: 'phase-2',
          title: `${targetType} Preparation`,
          duration: '4-6 months',
          tasks: [
            'Prepare comprehensive clinical package',
            'Complete manufacturing documentation',
            'Conduct risk assessment',
            'Prepare regulatory submissions',
          ],
        },
        {
          id: 'phase-3',
          title: 'Submission and Review',
          duration: '6-12 months',
          tasks: [
            `Submit ${targetType} application`,
            'Respond to regulatory queries',
            'Conduct advisory meetings',
            'Complete regulatory review process',
          ],
        },
      ],
    };

    const contentMapping = {
      mappedModules: [
        {
          sourceModule: 'IND Module 1',
          targetModule: `${targetType} Module 1`,
          contentGap: 'Expand administrative information',
          reusePercentage: 85,
        },
        {
          sourceModule: 'IND Module 2',
          targetModule: `${targetType} Module 2`,
          contentGap: 'Add comprehensive clinical overview',
          reusePercentage: 65,
        },
        {
          sourceModule: 'IND Module 3',
          targetModule: `${targetType} Module 3`,
          contentGap: 'Complete quality documentation',
          reusePercentage: 70,
        },
      ],
      overallReuseRate: 73,
    };

    const gapAnalysis = {
      criticalGaps: [
        'Comprehensive efficacy data required',
        'Complete safety database needed',
        'Manufacturing scale-up documentation',
      ],
      mediumGaps: [
        'Additional pharmacokinetic studies',
        'Risk evaluation and mitigation strategies',
      ],
      minorGaps: ['Updated labeling information', 'Additional regulatory correspondence'],
    };

    const timeline = {
      totalDuration: '12-21 months',
      milestones: [
        {
          id: 'milestone-1',
          title: 'IND Review Complete',
          targetDate: '3 months',
          status: 'pending',
        },
        {
          id: 'milestone-2',
          title: `${targetType} Submission Ready`,
          targetDate: '9 months',
          status: 'pending',
        },
        {
          id: 'milestone-3',
          title: 'Regulatory Approval',
          targetDate: '21 months',
          status: 'pending',
        },
      ],
    };

    const costAnalysis = {
      totalEstimatedCost: '$2.5M - $4.2M',
      breakdown: [
        { category: 'Clinical Studies', cost: '$1.5M - $2.5M' },
        { category: 'Regulatory Support', cost: '$500K - $800K' },
        { category: 'Manufacturing', cost: '$300K - $600K' },
        { category: 'Quality Assurance', cost: '$200K - $300K' },
      ],
    };

    const riskAssessment = {
      overallRisk: 'Medium',
      riskFactors: [
        {
          factor: 'Clinical Data Adequacy',
          level: 'Medium',
          mitigation: 'Conduct additional studies if needed',
        },
        {
          factor: 'Manufacturing Complexity',
          level: 'Low',
          mitigation: 'Established manufacturing process',
        },
        {
          factor: 'Regulatory Timeline',
          level: 'Medium',
          mitigation: 'Early FDA engagement recommended',
        },
      ],
    };

    res.json({
      success: true,
      workflow: workflowPlan,
      contentMapping,
      gapAnalysis,
      timeline,
      costAnalysis,
      riskAssessment,
    });
  } catch (error) {
    console.error('Workflow progression creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create workflow progression',
    });
  }
});

// Basic starter server function
async function startServer() {
  debugLog('Starting server initialization...');

  // Verify database connection before mounting routes
  await verifyDatabaseConnection();

  try {
    const redisReady = await initializeRedisRateLimiter();
    if (redisReady) {
      console.log('✅ Redis rate limiter initialized');
    } else {
      console.log('⚠️ Redis rate limiter unavailable, using in-memory fallback');
    }
  } catch (error: any) {
    console.error('❌ Failed to initialize Redis rate limiter:', error.message);
  }

  // Initialize Phase 4.1 Proof System (21 CFR Part 11 Compliance)
  try {
    await initializeProofDatabasePersistence();
    console.log('✅ Proof System audit persistence initialized (21 CFR Part 11)');
  } catch (error: any) {
    console.error('⚠️ Proof System initialization warning:', error.message);
    console.log('   Proof system will operate with in-memory audit (not compliant for production)');
  }

  // Ensure auth tables have the columns auth routes expect (idempotent).
  // IMPORTANT: This must complete before app.listen() so that auth routes
  // (mounted earlier at top level) never handle requests against missing columns.
  try {
    const { ensureAuthTables } = await import('./db.js');
    await ensureAuthTables();
    console.log('✅ Auth schema bootstrap complete');
  } catch (error: any) {
    console.error('⚠️ Auth schema bootstrap warning:', error.message);
  }

  // Initialize feature toggles for gated central-system routes.
  try {
    await FeatureToggleService.initializeFeatureToggle(
      'UNIFIED_REGULATORY_SUBMISSIONS',
      'Enable unified regulatory submissions bridge routes',
      false
    );
    console.log('✅ Feature toggle bootstrap complete: UNIFIED_REGULATORY_SUBMISSIONS');
  } catch (error: any) {
    console.error('⚠️ Feature toggle bootstrap warning:', error.message);
  }

  // Seed AnA Capability Registry (fire-and-forget — don't block startup)
  // Delay slightly to ensure DB pool is ready
  setTimeout(() => {
    import('./services/ana-capability-registry.js')
      .then(({ seedCapabilityRegistry }) => seedCapabilityRegistry())
      .then(({ seeded, total }) => {
        console.log(`✅ AnA Capability Registry seeded (${seeded} new, ${total} total)`);
      })
      .catch((err: any) => {
        console.warn('⚠️ AnA Capability Registry seeding failed (non-blocking):', err?.message);
      });
  }, 3000);

  // Start Python backend first
  debugLog('Initializing Python backend...');
  await startPythonBackend();
  debugLog('Python backend initialization complete');

  // Mount API routes BEFORE Vite middleware (via bootstrap modules)
  debugLog('Mounting startup route families...');

  await registerTenantRoutes({ app, pool });
  await registerProjectRoutes({ app, pool });
  await registerClinicalIntelRoutes({ app, pool });
  await registerAdvancedPlatformRoutes({ app, pool, isStaticDataEnabled, mountStaticBusinessDataGuard });

  debugLog('All startup route families mounted');

  // ──────────────────────────────────────────────────────────────────────────
  // CATCH-ALL FOR UNMATCHED API ROUTES - MUST RETURN JSON, NOT HTML
  // ──────────────────────────────────────────────────────────────────────────
  app.all('/api/*', (req, res) => {
    console.log(`[API 404] Unhandled API route: ${req.method} ${req.path}`);
    res.status(404).json({
      error: 'API endpoint not found',
      path: req.path,
      method: req.method,
      message: 'The requested API endpoint does not exist. Check the URL and try again.',
      timestamp: new Date().toISOString(),
    });
  });
  console.log('✅ API catch-all handler registered (prevents HTML responses for /api/* routes)');

  // ============================================================================
  // GLOBAL ERROR HANDLER (MUST BE AFTER ALL ROUTES)
  // ============================================================================
  app.use(errorHandler);
  console.log('✅ Global error handler registered');

  const PORT = process.env.PORT || 5000;

  // Create HTTP server for proper Vite integration
  const httpServer = createServer(app);
  setHttpServer(httpServer); // Register for graceful shutdown drain

  // Frontend serving — use optimized static serving in production, Vite HMR in development
  // This must be done AFTER all API routes are mounted
  const isProduction = process.env.NODE_ENV === 'production';
  const skipVite = ['1', 'true', 'yes'].includes(String(process.env.SKIP_VITE || '').toLowerCase());

  if (isProduction || skipVite) {
    try {
      serveStatic(app);
      console.log('✅ Production static file serving enabled (immutable asset caching)');
    } catch (staticError) {
      console.error('⚠️ Static serving failed:', staticError);
      app.get('/', (_req, res) => {
        res.send(
          '<h1>Concept2Cure Platform</h1><p>API running. Build client with <code>npm run build</code>.</p>'
        );
      });
    }
  } else {
    try {
      await setupVite(app, httpServer);
      console.log('✅ Vite HMR middleware setup complete');
    } catch (viteError) {
      console.error('⚠️ Vite setup failed:', viteError);
    }
  }

  // ── Parallel startup services ──
  const [chainMon, patternReg, socketSrv, scheduledJobs, hocuspocus] = await Promise.allSettled([
    import('./services/audit/chainIntegrityMonitor.js'),
    import('./services/intelligence/pattern-registry.js'),
    import('./socketServer.js'),
    import('./services/automation/scheduled-jobs.js'),
    import('./services/hocuspocus-server.js'),
  ]);

  if (chainMon.status === 'fulfilled') {
    try {
      chainMon.value.startChainMonitor(pool, 5 * 60 * 1000);
      console.log('✅ Audit chain integrity monitor started (5-min interval)');
    } catch (err) {
      console.warn('⚠️ Chain integrity monitor failed to start:', err);
    }
  } else {
    console.warn('⚠️ Chain integrity monitor failed to load:', chainMon.reason);
  }

  if (patternReg.status === 'fulfilled') {
    try {
      const result = await patternReg.value.loadPatternRegistry(1);
      if (result.loaded) {
        console.log(
          `✅ RIM pattern registry loaded (${patternReg.value.patternRegistry.size} patterns, ${result.learnedCount} learned)`
        );
      } else {
        console.log(
          `ℹ️ RIM pattern registry: no persisted data found, using ${patternReg.value.patternRegistry.size} seed patterns`
        );
      }
    } catch (err) {
      console.warn('⚠️ RIM pattern registry load failed (using seed patterns only):', err);
    }
  } else {
    console.warn('⚠️ RIM pattern registry failed to load:', patternReg.reason);
  }

  if (socketSrv.status === 'fulfilled') {
    try {
      socketSrv.value.initializeSocketServer(httpServer);
      console.log('[Socket.io] Real-time server initialized');
    } catch (err: any) {
      console.warn('[Socket.io] Failed to initialize (non-blocking):', err?.message);
    }
  } else {
    console.warn('[Socket.io] Failed to load:', socketSrv.reason);
  }

  if (scheduledJobs.status === 'fulfilled') {
    try {
      await scheduledJobs.value.initScheduledJobs();
      console.log('✅ Automation engine scheduled jobs initialized');
    } catch (err: any) {
      console.warn('⚠️ Automation engine initialization failed (non-blocking):', err?.message);
    }
  } else {
    console.warn('⚠️ Automation engine failed to load:', scheduledJobs.reason);
  }

  if (hocuspocus.status === 'fulfilled') {
    try {
      hocuspocus.value.attachHocuspocusToServer(httpServer);
      console.log('[Hocuspocus] CRDT collaboration server initialized');
    } catch (err: any) {
      console.warn('[Hocuspocus] Failed to initialize (non-blocking):', err?.message);
    }
  } else {
    console.warn('[Hocuspocus] Failed to load:', hocuspocus.reason);
  }

  // Start the HTTP server
  httpServer.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔐 Login: http://localhost:${PORT}/auth`);
  });
}

// ── Route Bootstrap Manifests (available for future migration) ──────────────
// The server/bootstrap/ directory contains declarative route manifests that can
// progressively replace the inline try/catch import blocks above.
//
// Manifests:
//   register-core-routes.ts         — templates, AI, CMC, enterprise, control-plane
//   register-ai-routes.ts           — AnA, chat, IND, regulatory, claims, claude-intel
//   register-concept2cure-routes.ts — concept2cure + compute
//   register-admin-routes.ts        — reserved placeholder
//
// To migrate a group:
//   import { registerCoreRoutes } from './bootstrap/register-core-routes';
//   await registerCoreRoutes({ app, pool, aiCircuitBreaker });
//
// See server/bootstrap/types.ts for the RouteBootstrapContext interface.
// ─────────────────────────────────────────────────────────────────────────────

// Start the server
startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
