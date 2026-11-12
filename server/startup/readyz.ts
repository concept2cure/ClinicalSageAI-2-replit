/**
 * The readiness verdict /readyz serves, and who may read its detail (MR-03 Stage 7, OPS-22).
 * Split out of inline-endpoints.ts, which mounts the endpoint and keeps the per-process cache.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { probeVaultStore } from '../services/storage/store-readiness';
import { runWithSystemTenantScope } from '../db/tenantStore';
import { pingClamdCached } from '../utils/virusScan';
import {
  getSchemaReadiness,
  getSchemaReadinessDetail,
  isSchemaReadinessServing,
} from './readiness-state';
import {
  getAnaReadiness,
  getAnaReadinessDetail,
  getCapabilityRegistryDetail,
  getCapabilityRegistryState,
  isAnaReadinessServing,
} from './ana-readiness-state';

/** True when a Redis URL is configured. When false, Redis-backed
 *  dependencies (cache, distributed lock, Bull action queue) run in their
 *  in-memory fallback mode, so we treat them as "not configured" → healthy
 *  (skip), never as a failure. */
function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL || process.env.REDIS_TLS_URL);
}

/**
 * The virus scanner, as /readyz reports it (MR-08). Required in production,
 * where every upload it cannot scan is refused (middleware/uploadSafety.ts: 503
 * FILE_SCAN_UNAVAILABLE). With CLAMAV_HOST set, clamd's PING decides (cached for
 * at most 30 s); with it unset, production refuses uploads, so the scanner is
 * down. Outside production the scan is skipped, and so is this. pingClamd never
 * rejects; the try is so that anything thrown here still reads as the scanner
 * being down, never as a bare 500 from /readyz.
 */
async function virusScanReadiness(): Promise<'ok' | 'skipped' | 'down'> {
  if (process.env.NODE_ENV !== 'production') return 'skipped';
  try {
    return process.env.CLAMAV_HOST && (await pingClamdCached()) ? 'ok' : 'down';
  } catch {
    return 'down';
  }
}

/**
 * The shared session store, as /readyz reports it (MR-03 Stage 7 step 4, SEC-08).
 * Sign-in sessions are coordinated across API tasks through Postgres
 * (session_activity; decision B6, production runs no Redis). A task that cannot
 * read that table judges each session from its own memory
 * (services/session-inactivity.ts), so the idle timeout, the concurrent-session
 * limit and superseded sessions hold per task and not for the deployment. That
 * used to be a log line; a deployment whose database lacked the table, or whose
 * runtime role could not read it, read ready. Required in production; skipped
 * elsewhere, as the scanner is.
 *
 * Read as the session service reads it: organisation 0, under the system tenant
 * scope, which is the only scope the table's policy admits.
 */
export async function probeSessionStore(pool: Pool): Promise<{ status: 'ok' | 'skipped' | 'down'; detail?: string }> {
  if (process.env.NODE_ENV !== 'production') return { status: 'skipped' };
  try {
    await runWithSystemTenantScope('ops:readyz:session-store', () =>
      pool.query('SELECT 1 FROM session_activity WHERE organization_id = 0 LIMIT 1'),
    );
    return { status: 'ok' };
  } catch (err) {
    return {
      status: 'down',
      detail: `session_activity could not be read, so sessions are judged per task: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export interface ReadyzIoProbes {
  database: 'ok' | 'down';
  storage: Awaited<ReturnType<typeof probeVaultStore>>;
  sessions: Awaited<ReturnType<typeof probeSessionStore>>;
}

/** The probes that cost a round trip: the database, the Vault store and the shared session store. */
export async function probeReadyzIo(pool: Pool): Promise<ReadyzIoProbes> {
  const [database, storage, sessions] = await Promise.all([
    pool.query('select 1').then(() => 'ok' as const, () => 'down' as const),
    probeVaultStore(),
    probeSessionStore(pool),
  ]);
  return { database, storage, sessions };
}

/** Why a round-trip probe is down, for the failure body. */
function ioDetail(probes: ReadyzIoProbes): Record<string, string> {
  const detail: Record<string, string> = {};
  if (probes.storage.detail) detail.storageDetail = probes.storage.detail;
  if (probes.sessions.detail) detail.sessionsDetail = probes.sessions.detail;
  return detail;
}

/**
 * The /readyz verdict. The round-trip probes come from `io` (cached by the caller); every
 * other dependency is read from in-memory state on each hit, so a change in it shows at once.
 */
export async function computeReadiness(io: () => Promise<ReadyzIoProbes>): Promise<{ status: 200 | 503; body: Record<string, unknown> }> {
  const deps: Record<string, 'ok' | 'skipped' | 'down'> = {};
  const probes = await io();

  // Database — always required.
  deps.database = probes.database;

  // Schema — a reachable DB with missing critical tables/extensions is NOT
  // ready. The boot-time verification (startup/services.ts) records its
  // verdict here.
  //
  // This check FAILS CLOSED. 'unknown' — never verified — is a failure, not
  // a pass, and so is 'error' — verification threw. Previously both were
  // mapped to 'skipped' and served 200, so a database whose schema check had
  // crashed reported ready. See readiness-state.ts for the full incident.
  const schema = getSchemaReadiness();
  deps.schema = isSchemaReadinessServing(schema) ? 'ok' : 'down';

  // AnA — always required, and required for the same reason the database is:
  // without her this process cannot do the thing it exists to do. The boot
  // invariant (lib/startup-invariants.ts → checkAnaProvider) records the
  // verdict; this reads it.
  //
  // This check FAILS CLOSED, including on 'unknown'. Before it existed, a
  // process with no AI provider configured reported ready: true and then
  // returned 503 GATEWAY_UNAVAILABLE on every single AnA turn, which is
  // exactly how a tester came to find the platform up and AnA completely
  // dead. See ana-readiness-state.ts for the full incident.
  const ana = getAnaReadiness();
  deps.ana = isAnaReadinessServing(ana) ? 'ok' : 'down';

  // Vault storage — always required: uploads refuse without it
  // (services/storage/store-readiness.ts).
  const storage = probes.storage;
  deps.storage = storage.status;

  // The shared session store — required in production: without it each task
  // judges sessions from its own memory (probeSessionStore above).
  const sessions = probes.sessions;
  deps.sessions = sessions.status;

  deps.virusScan = await virusScanReadiness();

  // Redis + Bull action-queue worker tier. Only required when Redis is
  // configured; otherwise the platform runs on in-memory fallbacks, so we
  // skip (treat as healthy) rather than fail readiness.
  if (isRedisConfigured()) {
    try {
      const { isRedisAvailable } = await import('../services/ai-actions/redis-manager.js');
      deps.redis = isRedisAvailable() ? 'ok' : 'down';
    } catch {
      deps.redis = 'down';
    }

    // Worker tier health rides on Redis: the Bull queue cannot accept work
    // without it. getQueueMetrics() returns null when the queue isn't
    // reachable. Skip if the queue was never initialized (null with Redis
    // down is already reflected by the redis check above).
    try {
      const { getQueueMetrics } = await import('../services/ai-actions/action-queue.js');
      const metrics = await getQueueMetrics();
      deps.worker = metrics ? 'ok' : 'down';
    } catch {
      deps.worker = 'down';
    }
  } else {
    deps.redis = 'skipped';
    deps.worker = 'skipped';
  }

  const failed = Object.entries(deps)
    .filter(([, status]) => status === 'down')
    .map(([name]) => name);

  // The schema verdict is reported on BOTH paths. A 'degraded' schema still
  // serves traffic, but the operator has to be able to see which tables are
  // absent — a gap that is only visible on the failure path is a gap nobody
  // reads until it is already an outage.
  const schemaDetail = getSchemaReadinessDetail();

  // Same rule for AnA, for the same reason: 'deterministic' serves traffic
  // but is NOT a live model, and an operator who cannot see that distinction
  // on the success path will read fixtures as a working product.
  const anaDetail = getAnaReadinessDetail();

  // The capability registry seed's outcome, on BOTH paths, for the reason
  // the schema and AnA verdicts are: a degradation only visible on the
  // failure path is one nobody reads until it is an outage.
  const capabilityRegistry = getCapabilityRegistryState();
  const capabilityRegistryDetail = getCapabilityRegistryDetail();

  if (failed.length > 0) {
    const body: Record<string, unknown> = {
      ready: false,
      failed,
      dependencies: deps,
      schemaState: schema,
      anaState: ana,
      capabilityRegistry,
    };
    if (capabilityRegistry === 'failed' && capabilityRegistryDetail) {
      body.capabilityRegistryDetail = capabilityRegistryDetail;
    }
    if (deps.schema === 'down') {
      body.schemaDetail =
        schemaDetail ||
        (schema === 'unknown'
          ? 'schema was never verified — no boot-time verdict was recorded'
          : 'schema verification did not complete');
    }
    Object.assign(body, ioDetail(probes));
    if (deps.ana === 'down') {
      body.anaDetail =
        anaDetail ||
        (ana === 'unknown'
          ? 'AnA readiness was never verified — no boot-time verdict was recorded'
          : 'AnA has no usable AI provider');
    }
    return { status: 503, body };
  }

  const body: Record<string, unknown> = {
    ready: true,
    dependencies: deps,
    schemaState: schema,
    anaState: ana,
    capabilityRegistry,
  };
  if (capabilityRegistry === 'failed' && capabilityRegistryDetail) {
    body.capabilityRegistryDetail = capabilityRegistryDetail;
  }
  if (schema === 'degraded' && schemaDetail) body.schemaDetail = schemaDetail;
  if (ana === 'deterministic' && anaDetail) body.anaDetail = anaDetail;
  return { status: 200, body };
}

/**
 * Public /readyz is cheap and says only whether the task is ready (MR-03 Stage 7,
 * OPS-22). It is mounted before rate limiting and reachable through CloudFront,
 * so each hit used to run a database query, a Vault-store probe and a scanner
 * ping, and answer with every dependency's state to anyone.
 *  - The database query, the Vault-store probe and the session-store read run
 *    at most once per READYZ_CACHE_MS (default 5000, at most 10000) per
 *    process, and concurrent hits share them. The rest (schema, AnA, the
 *    registry) is in-memory state, read on every hit, so a change in it shows
 *    at once; the scanner keeps its own 30 s ping cache.
 *  - In production the body is { ready } alone, unless the caller presents
 *    READYZ_TOKEN (header x-readyz-token) or is a loopback peer, i.e. inside the
 *    task or container: CI's boot jobs and an operator's ECS exec. The TCP peer
 *    is not a header and cannot be forged; behind the ALB it is never loopback.
 *  - Outside production the full body is returned, as before (the Codespace's
 *    start-up and the doctor read it).
 * The status code is the same for every caller: the ALB, the deploy's smoke
 * test and CloudFront read it, and the smoke test reads `ready`.
 */
const READYZ_CACHE_MAX_MS = 10_000;
export function readyzCacheMs(): number {
  const raw = Number(process.env.READYZ_CACHE_MS ?? 5000);
  if (!Number.isFinite(raw) || raw < 0) return 5000;
  return Math.min(raw, READYZ_CACHE_MAX_MS);
}
function isLoopbackPeer(req: Request): boolean {
  const peer = req.socket?.remoteAddress ?? '';
  return peer === '127.0.0.1' || peer === '::1' || peer === '::ffff:127.0.0.1';
}
function presentsReadyzToken(req: Request): boolean {
  const expected = process.env.READYZ_TOKEN ?? '';
  const given = req.get('x-readyz-token') ?? '';
  if (expected.length < 32 || !given) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
export function readyzShowsDetail(req: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  return isLoopbackPeer(req) || presentsReadyzToken(req);
}
