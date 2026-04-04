/**
 * Platform Maintenance Jobs
 *
 * Operationalizes periodic cleanup and integrity tasks:
 *   1. Token revocation cleanup — prune expired entries from revoked_tokens table
 *   2. Bridge integrity check — detect orphaned artifact links, report drift
 *   3. Bridge backfill — link documents to artifacts by title matching
 *
 * Wired into the existing Bull-queue scheduled-jobs infrastructure.
 * Runs on cron schedule when Redis is available; degrades gracefully otherwise.
 *
 * @module server/services/maintenance/platform-maintenance
 */

import { createScopedLogger } from '../../utils/logger';

const log = createScopedLogger('platform-maintenance');

// ── Token Revocation Cleanup ────────────────────────────────────────────────

export async function runTokenRevocationCleanup(): Promise<{
  expiredRemoved: number;
  status: 'completed' | 'skipped' | 'error';
  error?: string;
}> {
  try {
    const { cleanupExpiredTokens } = await import('../token-revocation.js');
    const removed = await cleanupExpiredTokens();
    log.info('Token revocation cleanup completed', { expiredRemoved: removed });
    return { expiredRemoved: removed, status: 'completed' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('Token revocation cleanup failed', { error: msg });
    return { expiredRemoved: 0, status: 'error', error: msg };
  }
}

// ── Bridge Integrity Check ──────────────────────────────────────────────────

export async function runBridgeIntegrityCheck(organizationId: number): Promise<{
  status: 'healthy' | 'drift_detected' | 'error';
  totalDocuments: number;
  linkedDocuments: number;
  orphanedLinks: number;
  error?: string;
}> {
  try {
    const { checkBridgeIntegrity } = await import('../artifact-document-bridge.js');
    const report = await checkBridgeIntegrity(organizationId);
    if (report.status === 'drift_detected') {
      log.warn('Bridge integrity drift detected', {
        organizationId,
        orphanedLinks: report.orphanedLinks,
        unlinkedDocuments: report.unlinkedDocuments,
      });
    }
    return {
      status: report.status,
      totalDocuments: report.totalDocuments,
      linkedDocuments: report.linkedDocuments,
      orphanedLinks: report.orphanedLinks,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'error', totalDocuments: 0, linkedDocuments: 0, orphanedLinks: 0, error: msg };
  }
}

// ── Bridge Backfill ─────────────────────────────────────────────────────────

export async function runBridgeBackfill(organizationId: number): Promise<{
  linked: number;
  status: 'completed' | 'skipped' | 'error';
  error?: string;
}> {
  try {
    const { backfillArtifactLinks } = await import('../artifact-document-bridge.js');
    const linked = await backfillArtifactLinks(organizationId);
    if (linked > 0) {
      log.info('Bridge backfill completed', { organizationId, linked });
    }
    return { linked, status: 'completed' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { linked: 0, status: 'error', error: msg };
  }
}

// ── Combined Maintenance Run ────────────────────────────────────────────────

export interface MaintenanceRunResult {
  tokenCleanup: Awaited<ReturnType<typeof runTokenRevocationCleanup>>;
  bridgeIntegrity: Awaited<ReturnType<typeof runBridgeIntegrityCheck>>;
  bridgeBackfill: Awaited<ReturnType<typeof runBridgeBackfill>>;
  ranAt: string;
  durationMs: number;
}

/**
 * Run all platform maintenance tasks. Suitable for cron or manual invocation.
 */
export async function runPlatformMaintenance(organizationId: number): Promise<MaintenanceRunResult> {
  const start = Date.now();

  const [tokenCleanup, bridgeIntegrity, bridgeBackfill] = await Promise.all([
    runTokenRevocationCleanup(),
    runBridgeIntegrityCheck(organizationId),
    runBridgeBackfill(organizationId),
  ]);

  const result: MaintenanceRunResult = {
    tokenCleanup,
    bridgeIntegrity,
    bridgeBackfill,
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - start,
  };

  log.info('Platform maintenance run completed', {
    tokenCleanup: tokenCleanup.status,
    bridgeIntegrity: bridgeIntegrity.status,
    bridgeBackfill: bridgeBackfill.status,
    durationMs: result.durationMs,
  });

  return result;
}
