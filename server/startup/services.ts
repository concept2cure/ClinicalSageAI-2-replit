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
import { setSchemaReadiness } from './readiness-state';
import { runWithSystemTenantScope } from '../db/tenantStore';

// NOTE (D9, 2026-08-13): the `startPythonBackend()` stub that lived here (and
// always resolved null) was removed together with the dead Python stack under
// services/ (api.py / celery_app.py / ectd_generator.py — no Node caller, never
// deployed; see .github/workflows/deploy-aws.yml worker note). The only live
// Node→Python bridge is workers/artifact-compute (docx runtimes), which spawns
// per-invocation processes and needs no startup/shutdown hook.

/**
 * Tables classified "important" by ensureCoreTables that are nonetheless
 * security-load-bearing: authentication, authorization and licensing.
 *
 * The distinction matters because the flat critical-table check passes without
 * these, so a database missing every one of them reported ready. A process
 * that cannot resolve a user, a role or a permission has no safe behaviour
 * available to it — every request either errors or takes an unauthenticated
 * path — so their absence fails readiness rather than degrading it.
 *
 * Kept as an explicit list, not a prefix match, so adding a table to
 * IMPORTANT_TABLES is a deliberate decision about whether it belongs here.
 *
 * ── Why the list changed ──────────────────────────────────────────────────────
 * It previously named auth_users, auth_refresh_tokens, roles, permissions and
 * user_roles. None of those five exist, and none of them are reachable:
 *
 *   • No wired migration creates them. Their only DDL is in
 *     db/migrations/_consolidated/, a tree scripts/db/migration-set.mjs
 *     quarantines on purpose (ledger C-29 Class 3 — its creators redefine
 *     users/tenants with TEXT keys the integer-keyed RLS model cannot police).
 *   • No application code queries them. The only references anywhere in
 *     server/ are this list and its twin in ensureCoreTables.
 *
 * So the gate demanded tables that nothing provisions and nothing uses, and
 * /readyz answered 503 forever. Reproduced on a database provisioned by BOTH
 * sanctioned installers — scripts/db/install-fresh.mjs (767 tables) followed by
 * scripts/db/deploy-migrate.mjs (127/127 files) — where /api/health returned
 * 200 while /readyz reported "security-critical tables missing: auth_users,
 * auth_refresh_tokens, roles, permissions, user_roles". Behind a readiness
 * probe that service never receives traffic.
 *
 * A gate that cannot go green is not strict, it is broken — and worse, it was
 * silent about the tables authentication ACTUALLY depends on, none of which it
 * listed. Those, verified by reading the query sites rather than assuming:
 *
 *   users, organizations        resolved on every authenticated request
 *                               (already covered by CRITICAL_TABLES)
 *   organization_users          org membership and role claim — server/routes/
 *                               auth.ts reads it for every login and token issue
 *   platform_role_grants        the server-side RBAC check —
 *                               server/middleware/requirePlatformAdmin.ts,
 *                               requireBusinessAdmin.ts
 *   revoked_tokens              token revocation; without it a logged-out or
 *                               compromised token keeps working, which is the
 *                               exact failure this gate should refuse to serve
 *   licenses, audit_logs        entitlement enforcement and the Part 11 record
 *
 * That set is both satisfiable and load-bearing, so the probe now means
 * something in both directions.
 */
const SECURITY_CRITICAL_TABLES = [
  'organization_users',
  'platform_role_grants',
  'revoked_tokens',
  'licenses',
  'audit_logs',
];

/**
 * Verify that the database is reachable and that core tables/extensions exist.
 * Fatal in production, non-fatal in dev (same as pre-refactor behavior).
 */
export async function verifyDatabaseConnection(pool: Pool): Promise<void> {
  try {
    // Connectivity and schema verification belong to no tenant. Under
    // RLS_ENFORCE=on — the only value production accepts — pool.connect()
    // without a declared scope fails closed with "[tenant-rls] FAIL-CLOSED:
    // pool.connect requires an active tenant scope", which this catch reported
    // as "database unreachable" and /readyz surfaced as database: "down" on a
    // healthy connection. Declaring the scope states the intent instead.
    await runWithSystemTenantScope('startup:verify-database-connection', async () => {
      const client = await pool.connect();
      client.release();
    });
    console.log('✅ Database connection successful');
  } catch (err: any) {
    console.error('❌ Database connection failed:', err.message);
    if (process.env.NODE_ENV === 'production') {
      console.error('   Fatal in production — exiting');
      process.exit(1);
    }
    // Non-production returns early without ever running schema verification.
    // Record that explicitly: the /readyz database check would fail this probe
    // anyway, but leaving the schema flag at its default here is precisely the
    // "no verdict recorded" state the fail-closed default exists to catch.
    setSchemaReadiness('error', `database unreachable: ${err?.message ?? String(err)}`);
    return;
  }

  try {
    // Schema verification is estate-wide, not tenant work — same reason the
    // connectivity probe above declares a system scope.
    const result = await runWithSystemTenantScope('startup:ensure-core-tables', async () =>
      ensureCoreTables(process.env.DATABASE_URL)
    );
    // A regulated subsystem that is partially or wholly absent fails readiness
    // even when the flat critical-table check passes — a database that cannot
    // run the authoring loop is not ready, and /readyz must say so rather than
    // report green while those routes throw. `result.success` intentionally does
    // NOT fold in subsystems (validateCoreTables/diagnostics keep their meaning),
    // so this is checked ahead of the success branch.
    const failingSubsystem = result.subsystems.find((s) => s.readinessFailing);
    const missingSecurityTables = result.missingImportant.filter((t) =>
      SECURITY_CRITICAL_TABLES.includes(t)
    );
    if (result.missingCritical.length > 0) {
      setSchemaReadiness('missing', `missing tables: ${result.missingCritical.join(', ')}`);
      console.error('❌ CRITICAL: Missing tables:', result.missingCritical.join(', '));
      console.error('   Run: npm run db:push to sync schema');
    } else if (result.missingExtensions.length > 0) {
      setSchemaReadiness(
        'missing',
        `missing extensions: ${result.missingExtensions.join(', ')}`
      );
      console.error(
        '❌ CRITICAL: Missing required database extensions:',
        result.missingExtensions.join(', ')
      );
    } else if (failingSubsystem) {
      const detail = `${failingSubsystem.name} subsystem ${failingSubsystem.state} (missing: ${failingSubsystem.missing.join(', ')})`;
      setSchemaReadiness('missing', detail);
      console.error(`❌ CRITICAL: ${detail}`);
      console.error(
        '   Provision it as a unit: APPLY_C2C_MIGRATIONS=true npm run db:apply-c2c',
      );
      console.error(
        '   (or scripts/db/install-fresh.mjs on a fresh database). To run without',
      );
      console.error(
        '   authoring, set AUTHORING_SUBSYSTEM_OPTIONAL=true — never over a PARTIAL subsystem.',
      );
    } else if (missingSecurityTables.length > 0) {
      // Auth / RBAC / licensing tables. These are classified "important"
      // rather than "critical" by ensureCoreTables, so the flat critical check
      // above passes without them — but a database with no `organization_users`
      // or `platform_role_grants` cannot resolve membership or authorize
      // anybody, and one with no `revoked_tokens` keeps honouring tokens that
      // were logged out or compromised. Serving traffic in that state means
      // every request either fails or, worse, takes an unauthenticated path.
      // That is not degraded, it is down.
      const detail = `security-critical tables missing: ${missingSecurityTables.join(', ')}`;
      setSchemaReadiness('missing', detail);
      console.error(`❌ CRITICAL: ${detail}`);
      console.error(
        '   Auth, RBAC and licensing cannot function. Run: node scripts/db/install-fresh.mjs',
      );
      console.error('   on a fresh database, then node scripts/db/deploy-migrate.mjs.');
    } else if (result.success) {
      // Remaining "important" tables are module surfaces (CERV2 sections,
      // templates, assembly docs). Their absence breaks those modules but not
      // the platform, so this serves traffic — and names the gap, rather than
      // reporting an unqualified green that hides it.
      const otherMissingImportant = result.missingImportant.filter(
        (t) => !SECURITY_CRITICAL_TABLES.includes(t)
      );
      if (otherMissingImportant.length > 0) {
        setSchemaReadiness(
          'degraded',
          `important tables missing: ${otherMissingImportant.join(', ')}`
        );
        console.warn(
          `⚠️ Database serving DEGRADED — important tables missing: ${otherMissingImportant.join(', ')}`
        );
      } else {
        setSchemaReadiness('ready');
        // console.info, not console.log — the repo's no-console rule permits
        // warn/error/info only, and this line moved into the else branch above.
        console.info(
          `✅ Database readiness verified (${result.existingSchemas.length} schemas, ${result.existingTables.length} tables, authoring subsystem present)`
        );
      }
    } else if (result.errors.length > 0) {
      // Verification ran and reported errors. `result.success` is false, so we
      // do NOT know the schema is sound — previously this branch logged and
      // left the flag at 'unknown', which /readyz served as ready.
      const detail = `table verification errors: ${result.errors.join('; ')}`;
      setSchemaReadiness('error', detail);
      console.error('❌ CRITICAL: Table verification errors:', result.errors);
    } else if (result.missingSchemas.length > 0) {
      const detail = `schemas missing: ${result.missingSchemas.join(', ')}`;
      setSchemaReadiness('missing', detail);
      console.error('❌ CRITICAL: Database schemas required initialization:', detail);
    } else if (result.warnings.length > 0) {
      // Warnings with success=false. Not provably broken, not provably sound.
      setSchemaReadiness('error', `verification inconclusive: ${result.warnings.join('; ')}`);
      console.warn('⚠️ Database readiness warnings:', result.warnings);
    } else {
      // Explicit terminal else. `success` is false and nothing above explains
      // why — exactly the shape that used to fall through to 'unknown' and be
      // served as ready. An unexplained failure is still a failure.
      setSchemaReadiness(
        'error',
        'schema verification reported failure without a diagnosable cause'
      );
      console.error('❌ CRITICAL: Schema verification failed without a diagnosable cause.');
    }
  } catch (err: any) {
    // The check ITSELF threw. This is the branch that most needs to fail
    // closed: we know less about the schema here than in any other path, and
    // it previously left readiness at 'unknown' and served 200.
    setSchemaReadiness('error', `core table verification threw: ${err?.message ?? String(err)}`);
    console.error('❌ CRITICAL: Core table verification failed:', err?.message ?? String(err));
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

  // Login OTP is mandatory 2FA delivered by email. If SMTP is unconfigured in
  // production, NO user can complete a login — fail LOUD at boot so this is
  // caught before testers hit it, not silently one login at a time.
  try {
    const { isEmailConfigured } = await import('../services/emailService.js');
    if (isEmailConfigured()) {
      console.info('✅ Email (SMTP) configured — login OTP can be delivered');
    } else if (process.env.NODE_ENV === 'production') {
      console.error(
        '❌ CRITICAL: SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS). ' +
          'Login OTP is mandatory 2FA — NO user can log in until email delivery works. ' +
          'Configure SMTP and verify a code reaches a real inbox before onboarding testers.',
      );
    } else {
      console.warn('⚠️ SMTP not configured — login OTP codes will be logged to the console (dev only)');
    }
  } catch (error: any) {
    console.error('⚠️ Email configuration check failed:', error.message);
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

    // Activate the DB-backed per-tenant AI provider-preference resolver so a
    // client's chosen default provider (Claude-first) persists across restarts.
    // Non-fatal: if it can't load, the platform default (anthropic / Claude) applies.
    try {
      const [{ setTenantProviderResolver }, { DbTenantProviderResolver }] = await Promise.all([
        import('../services/ai-gateway/providers/provider-preference.js'),
        import('../services/ai-gateway/providers/provider-preference-db.js'),
      ]);
      setTenantProviderResolver(new DbTenantProviderResolver());
    } catch (e: any) {
      console.warn('⚠️ Tenant provider-preference resolver not activated (platform default):', e?.message);
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
  //
  // The seeder declares its own SYSTEM tenant scope (see
  // ana-capability-registry.ts): the pool refuses ANY statement issued with no
  // tenant scope once RLS_ENFORCE=on — the only value production accepts — so
  // this seed failed on every production boot, the table stayed empty, and
  // ana-context-router.ts (which reads it to route a turn to a capability) had
  // nothing to route with. The warning below called that "non-blocking"; it
  // was a silently degraded product. The outcome is now recorded for /readyz
  // (see ana-readiness-state.ts) and a failure is an error, not a warning.
  setTimeout(() => {
    Promise.all([
      import('../services/ana-capability-registry.js'),
      import('./ana-readiness-state.js'),
    ])
      .then(([{ seedCapabilityRegistry }, readiness]) =>
        seedCapabilityRegistry().then(({ seeded, total }) => {
          readiness.setCapabilityRegistryState(
            total > 0 ? 'seeded' : 'empty',
            `${seeded} new, ${total} total`
          );
          console.log(`✅ AnA Capability Registry seeded (${seeded} new, ${total} total)`);
        }, (err: any) => {
          readiness.setCapabilityRegistryState('failed', String(err?.message ?? err));
          throw err;
        })
      )
      .catch((err: any) => {
        console.error(
          '❌ AnA Capability Registry seeding FAILED — capability routing is degraded until it succeeds:',
          err?.message
        );
      });
  }, 3000);

  // Seed the global regulatory template store when it is missing seed rows
  // (fire-and-forget, count-guarded — a normal boot is one SELECT). Without
  // this the store only ever filled via a manual authed POST, so every fresh
  // estate's "Start from" picker offered nothing but a blank document.
  setTimeout(() => {
    import('../services/intelligence/template-seeds.js')
      .then(({ seedTemplatesIfMissing }) => seedTemplatesIfMissing())
      .then((r) => {
        if (r.ran) {
          console.log(`✅ Regulatory templates seeded (${r.inserted} new, ${r.updated} refreshed, ${r.sections} sections)`);
        }
      })
      .catch((err: any) => {
        console.warn('⚠️ Regulatory template seeding failed (non-blocking):', err?.message);
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
      // loadPatternRegistry declares its own system scope: this runs before
      // any request exists, and an unscoped read is refused once
      // RLS_ENFORCE=on. Before that, every production boot logged "no
      // persisted data found" — an error rendered as an empty result.
      const result = await patternReg.value.loadPatternRegistry(1);
      if (result.loaded) {
        console.log(
          `✅ RIM pattern registry loaded (${patternReg.value.patternRegistry.size} patterns, ${result.learnedCount} learned)`
        );
      } else if (result.error) {
        console.warn(
          `⚠️ RIM pattern registry load FAILED (${result.error}) — falling back to ${patternReg.value.patternRegistry.size} seed patterns; persisted learning is NOT loaded`
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
      // Register per-org default schedules (incl. the 7 AM proactive regulatory
      // digest) for every active org so the digest cron actually fires. No-op
      // when Redis is absent. Non-blocking — a failure here never stops boot.
      try {
        await scheduledJobs.value.registerDefaultSchedulesForActiveOrgs();
      } catch (err: any) {
        console.warn('⚠️ Default schedule registration failed (non-blocking):', err?.message);
      }
    } catch (err: any) {
      console.warn('⚠️ Automation engine initialization failed (non-blocking):', err?.message);
    }
    // Without Redis the Bull queue never came up, and with it went the 7 AM
    // proactive digest — the platform's ONLY unprompted surface. That used to
    // be one debug-adjacent warn and then silence (mounting is not readiness,
    // L66). Say what it means, and start the plain-interval heartbeat so the
    // digest still reaches users.
    try {
      if (!scheduledJobs.value.isSchedulerQueueActive?.()) {
        console.warn(
          '⚠️ Redis is not configured: every Bull-scheduled job is off, including the proactive ' +
            "digest — AnA's only unprompted surface. Starting the digest heartbeat fallback " +
            '(plain interval, weekdays from 07:00 UTC) so users are still reached.'
        );
        const heartbeat = await import('../services/digest/digest-heartbeat.js');
        const started = heartbeat.startDigestHeartbeat();
        if (started) {
          console.log('✅ Proactive digest heartbeat started (Redis-free fallback)');
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Digest heartbeat fallback failed to start (non-blocking):', err?.message);
    }
  } else {
    console.warn('⚠️ Automation engine failed to load:', scheduledJobs.reason);
  }

  // Report-OS subscription sweep — fires due scheduled reports. Graceful
  // no-op when Redis is absent; never blocks boot.
  try {
    const { initSubscriptionSweep } = await import(
      '../services/report-os/scheduling/worker-register'
    );
    // The sweep logs its own scheduled/disabled state via its scoped logger.
    await initSubscriptionSweep();
  } catch (err: any) {
    console.warn('⚠️ Report subscription sweep initialization failed (non-blocking):', err?.message);
  }

  if (hocuspocus.status === 'fulfilled') {
    try {
      hocuspocus.value.attachHocuspocusToServer(httpServer);
      // Report the state that is actually true. attachHocuspocusToServer is a
      // no-op unless ENABLE_COLLAB_CRDT is on, and logging "initialized"
      // unconditionally is how the previous transport break stayed invisible:
      // boot said the collaboration server was up every single time, including
      // for the entire period when no socket could physically connect to it.
      if (hocuspocus.value.isCollabEnabled()) {
        console.log('[Hocuspocus] CRDT collaboration server attached at /collab');
      } else {
        console.log(
          'ℹ️ [Hocuspocus] CRDT collaboration not attached (ENABLE_COLLAB_CRDT is not "true")'
        );
      }
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
