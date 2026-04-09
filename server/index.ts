import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ override: false, quiet: true });
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
    const recommended = ['SENTRY_DSN', 'REDIS_URL'];
    const missingRecommended = recommended.filter(k => !process.env[k]);
    if (missingRecommended.length > 0) {
      console.warn(`⚠️  Recommended env vars not set: ${missingRecommended.join(', ')}`);
    }
  }

  // Dedicated ANTHROPIC_API_KEY check — always run, not just in production
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('');
    console.warn('='.repeat(70));
    console.warn('⚠️  ANTHROPIC_API_KEY not set — AI features will be unavailable');
    console.warn('   Set ANTHROPIC_API_KEY in your environment to enable AI capabilities.');
    console.warn('='.repeat(70));
    console.warn('');
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
      return res
        .status(response.status)
        .json({ error: 'Shadow service health check failed', details: payload });
    }
    return res.json(payload);
  } catch (error: any) {
    return res
      .status(502)
      .json({ error: 'Shadow service unavailable', message: error?.message || 'Unknown error' });
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

// CSR Intelligence routes — extracted to server/routes/csr-intelligence-routes.ts
import { createCsrIntelligenceRoutes } from './routes/csr-intelligence-routes';
app.use('/api', createCsrIntelligenceRoutes(pool, csrSearchService));

// CSR analytics routes — extracted to server/routes/csr-analytics.ts
import csrAnalyticsRouter from './routes/csr-analytics';
app.use('/api/csr-real-data', csrAnalyticsRouter);

// Reports/admin routes moved into admin bootstrap manifest

// Audit trail routes (21 CFR Part 11 — append-only, signed exports, chain integrity)
import { createAuditTrailRoutes } from './routes/audit-trail-routes';
app.use('/api', createAuditTrailRoutes(pool));

// AnA 1.0 RI endpoint + compatibility facades (search vector, endpoint recommend, retention stubs)
import { createAnaRiInlineRoutes } from './routes/ana-ri-inline-routes';
app.use(
  '/api',
  createAnaRiInlineRoutes(pool, {
    csrSearchService,
    getEndpointRecommenderService,
    sanitizeAskAnaInput,
  })
);
console.log('✅ AnA 1.0 RI + compatibility facade routes mounted');

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

// 510k Workflow routes (FDA compliance, audit trails, document orchestration)
import { create510kWorkflowRoutes } from './routes/510k-workflow-routes';
app.use('/api/510k-workflow', create510kWorkflowRoutes(pool));
console.log('✅ 510k-workflow API routes mounted successfully');

// Mount beta-safe route manifest (510(k) + tester telemetry)
mountBetaSafeRoutes(app);
console.log('✅ Beta-safe routes mounted successfully');

// Mount FDA forms routes
import fdaFormsRoutes from './routes/fda-forms.routes';
app.use('/api/fda-forms', fdaFormsRoutes);
console.log('✅ FDA forms API routes mounted successfully');

// Mount field synchronization routes
import fieldSyncRoutes from './routes/fieldSync.routes';
app.use('/api/field-sync', fieldSyncRoutes);
console.log('✅ Field Synchronization API routes mounted successfully');

// Mount content assembly routes
import contentAssemblyRoutes from './routes/contentAssembly.routes';
app.use('/api/content-assembly', contentAssemblyRoutes);
console.log('✅ Dynamic Content Assembly API routes mounted successfully');

// Misc inline handlers (templates, vault, AnA RI API, advisor, eCTD templates, drafting, workflow progression)
import { createMiscInlineRoutes } from './routes/misc-inline-routes';
app.use('/api', createMiscInlineRoutes(pool, authMiddleware));

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
  await registerAdvancedPlatformRoutes({
    app,
    pool,
    isStaticDataEnabled,
    mountStaticBusinessDataGuard,
  });

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
