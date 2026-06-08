/**
 * Background service and subsystem initialization.
 *
 * Extracted from server/index.ts `startServer()`. Preserves:
 *  - DB connection verification + core-table readiness check
 *  - Redis rate limiter init
 *  - Phase 4.1 Proof System init (21 CFR Part 11)
 *  - Auth table column bootstrap (idempotent)
 *  - Feature toggle bootstrap (UNIFIED_REGULATORY_SUBMISSIONS)
 *  - AnA Capability Registry seeding (delayed, non-blocking)
 *  - Python backend stub (disabled, kept for future)
 *  - Parallel startup services (chain monitor, pattern registry,
 *    socket server, scheduled jobs, hocuspocus)
 *
 * All failures are non-fatal except DB connection in production.
 */

import type { Server } from 'http';
import type { Pool } from 'pg';
import {
  initializeRedisRateLimiter,
} from '../middleware/redisRateLimiter';
import { initializeProofDatabasePersistence } from '../../services/proof/database-setup';
import FeatureToggleService from '../services/featureToggleService';
import { ensureCoreTables } from '../db/ensureCoreTables';

/** Python backend is currently disabled (size optimization). Kept as a stub
 * so the graceful-shutdown handler can address it if it gets re-enabled. */
export function startPythonBackend(): Promise<null> {
  return Promise.resolve(null);
}

/**
 * Verify that the database is reachable and that core tables/extensions exist.
 * Fatal in production, non-fatal in dev (same as pre-refactor behavior).
 */
export async function verifyDatabaseConnection(pool: Pool): Promise<void> {
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
    return;
  }

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

/**
 * Initialize subsystems that must be ready before HTTP listen.
 * All failures are logged and non-fatal.
 */
export async function initializeEarlyServices(): Promise<void> {
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

  try {
    await initializeProofDatabasePersistence();
    console.log('✅ Proof System audit persistence initialized (21 CFR Part 11)');
  } catch (error: any) {
    console.error('⚠️ Proof System initialization warning:', error.message);
    console.log('   Proof system will operate with in-memory audit (not compliant for production)');
  }

  // Ensure auth tables have the columns auth routes expect (idempotent).
  // Must complete before app.listen() since auth routes are already mounted.
  // Imported from the explicit bootstrap path rather than the db facade so
  // the "startup calls bootstrap intentionally" boundary is visible here.
  try {
    const { ensureAuthTables } = await import('../db/bootstrap/index.js');
    await ensureAuthTables();
    console.log('✅ Auth schema bootstrap complete');
  } catch (error: any) {
    console.error('⚠️ Auth schema bootstrap warning:', error.message);
  }

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

  // AnA fix F8: pre-warm the AI Gateway so the very first chat request
  // doesn't pay the 200–500 ms provider-init penalty.
  try {
    const { getGateway } = await import('../services/ai-gateway/index.js');
    const gw = getGateway();

    // Activate the DB-backed per-org placement resolver so the gateway applies
    // each org's required residency / zero-retention as request defaults.
    // Non-fatal: if it can't load, the gateway falls back to explicit-only.
    try {
      const [{ setOrgPlacementResolver }, { DbOrgPlacementResolver }] = await Promise.all([
        import('../services/ai-gateway/providers/org-placement.js'),
        import('../services/ai-gateway/providers/org-placement-db.js'),
      ]);
      setOrgPlacementResolver(new DbOrgPlacementResolver());
    } catch (e: any) {
      console.warn('⚠️ Org placement resolver not activated (explicit-only):', e?.message);
    }

    const providers = gw.getEnabledProviders();
    console.log(
      `✅ AI Gateway pre-warmed (${providers.length} provider${providers.length === 1 ? '' : 's'} ready)`
    );
  } catch (error: any) {
    console.warn(
      '⚠️ AI Gateway pre-warm failed — first chat request will lazy-init:',
      error?.message
    );
  }

  // Seed AnA Capability Registry (fire-and-forget — don't block startup).
  // Delay slightly to ensure DB pool is ready.
  setTimeout(() => {
    import('../services/ana-capability-registry.js')
      .then(({ seedCapabilityRegistry }) => seedCapabilityRegistry())
      .then(({ seeded, total }) => {
        console.log(`✅ AnA Capability Registry seeded (${seeded} new, ${total} total)`);
      })
      .catch((err: any) => {
        console.warn('⚠️ AnA Capability Registry seeding failed (non-blocking):', err?.message);
      });
  }, 3000);
}

/**
 * Initialize long-lived services attached to the HTTP server.
 * Runs in parallel; each failure is isolated.
 */
export async function initializeParallelServices(httpServer: Server, pool: Pool): Promise<void> {
  const [chainMon, patternReg, socketSrv, scheduledJobs, hocuspocus] = await Promise.allSettled([
    import('../services/audit/chainIntegrityMonitor.js'),
    import('../services/intelligence/pattern-registry.js'),
    import('../socketServer.js'),
    import('../services/automation/scheduled-jobs.js'),
    import('../services/hocuspocus-server.js'),
  ]);

  if (chainMon.status === 'fulfilled') {
    // Gate the monitor by the same AUDIT_TRAIL_ENABLED flag that gates
    // the audit-trail middleware (server/startup/audit-trail.ts). Running
    // the monitor without the schema provisioned produces a noisy 5-min
    // log spam loop in dev environments. When the flag is on, the monitor
    // self-verifies the chain in-process every 5 minutes — no operator
    // cron required, which is the win that closes the ALCOA+ end-to-end
    // story for 21 CFR Part 11 §11.10(e).
    if (process.env.AUDIT_TRAIL_ENABLED === 'true') {
      try {
        chainMon.value.startChainMonitor(pool, 5 * 60 * 1000);
        console.log('✅ Audit chain integrity monitor started (5-min interval, in-process)');
      } catch (err) {
        console.warn('⚠️ Chain integrity monitor failed to start:', err);
      }
    } else {
      console.log(
        'ℹ️ Audit chain integrity monitor skipped (AUDIT_TRAIL_ENABLED is not "true")'
      );
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
}

/**
 * Mount the 404 catch-all for unmatched /api/* routes. Must be registered
 * after all API routes but before the global error handler and frontend
 * serving, so `/api/*` gets a JSON 404 rather than an HTML fallback.
 */
export function mountApiCatchAll(app: import('express').Express): void {
  app.all('/api/{*path}', (req, res) => {
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
}
