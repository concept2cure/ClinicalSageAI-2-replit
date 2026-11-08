/**
 * Boot hook: resume the CSR queues a restart stopped (2026-10-30;
 * server/services/csr/csr-queue-recovery.ts holds the sweep and its rules).
 *
 * Runs once, after the server listens (the deploy's migrations ran before the
 * process started), with the other start-up sweeps in server/index.ts. It is
 * not a schedule: a run that stalls later is taken over by the next request,
 * as before, or by the next boot.
 *
 *   - discovery under the system scope (runWithSystemTenantScope), as the
 *     other estate-wide sweeps do;
 *   - each item's access check and claim on a connection in that
 *     organization's full tenant scope, its integer id and its uuid
 *     (withOrganizationTenantConnection); an organization with no uuid has its
 *     item refused by code and not resumed;
 *   - each queue's own worker: runCSRBuildJob in the same full scope, held in
 *     AsyncLocalStorage as vaultProcessingSweep and retentionCron hold theirs
 *     (it uses the shared db, as launchCSRBuildAsync's worker uses the
 *     request's scope), runCsrAssembly and runNarrativeRun on their own
 *     connections, which open that scope themselves.
 *
 * B1 (2026-11-05, docs/evidence/D2-CSR/2026-11-05-worker-tenant-scope/): the
 * build ran under runWithOrgJobScope and the claim on withTenantConnection, both
 * with the integer id alone. The Vault's row security reads only the uuid, so a
 * recovered build's source reads saw no Vault row.
 *
 * Disabled in tests and when CSR_QUEUE_RECOVERY_DISABLED is set.
 */
import { createScopedLogger } from '../utils/logger.js';
import { getPool } from '../db';
import { runWithSystemTenantScope, runWithTenantScope } from '../db/tenantStore';
import type { CsrQueueRecoveryDeps, CsrQueueRecoverySummary } from '../services/csr/csr-queue-recovery';
import type { CsrScopeExecutor } from '../services/csr/project-scope';

const logger = createScopedLogger('csr-queue-recovery');
const CALLER = 'csr-queue-recovery';
const STARTUP_DELAY_MS = 15_000;

let started = false;

async function defaultDeps(): Promise<CsrQueueRecoveryDeps> {
  const [{ withOrganizationTenantConnection, readOrganizationTenantUuid }, { filterTenantsForBackgroundWork }, { runCSRBuildJob }, { runCsrAssembly }, { runNarrativeRun }] = await Promise.all([
    import('../db/withTenantConnection.js'), import('../services/tenant/tenant-lifecycle'),
    import('../services/csr/csr-job-runner'), import('../services/csr/csr-assembly-run'), import('../services/csr/csr-narrative-run'),
  ]);
  return {
    discover: (text, params) => runWithSystemTenantScope(CALLER, () => getPool().query(text, params)),
    withOrganization: (organizationId, fn, refuse) => withOrganizationTenantConnection(organizationId, CALLER,
      client => fn(client as unknown as CsrScopeExecutor), refuse && (client => refuse(client as unknown as CsrScopeExecutor))),
    permitted: ids => filterTenantsForBackgroundWork(ids),
    dispatch: async (item) => {
      if (item.queue === 'build') {
        const orgUuid = await readOrganizationTenantUuid(item.organizationId, CALLER);
        return runWithTenantScope({ tenantId: String(item.organizationId), orgUuid, role: null, source: 'job', caller: CALLER }, () => runCSRBuildJob(item.id));
      }
      if (item.queue === 'assembly') return runCsrAssembly(item.id, item.organizationId);
      return runNarrativeRun(item.id, item.organizationId);
    },
  };
}

/** One recovery sweep with the production wiring. */
export async function runCsrQueueRecoveryOnce(): Promise<CsrQueueRecoverySummary> {
  const { runCsrQueueRecovery } = await import('../services/csr/csr-queue-recovery');
  return runCsrQueueRecovery(await defaultDeps());
}

function isDisabled(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  return ['1', 'true', 'yes', 'on'].includes((process.env.CSR_QUEUE_RECOVERY_DISABLED || '').toLowerCase());
}

/** Start the one boot sweep. Idempotent; returns true when it was scheduled. */
export function startCsrQueueRecovery(): boolean {
  if (started) return false;
  if (isDisabled()) {
    logger.info('disabled', { controlledBy: 'CSR_QUEUE_RECOVERY_DISABLED', reason: process.env.NODE_ENV === 'test' ? 'test environment' : 'CSR_QUEUE_RECOVERY_DISABLED is set' });
    return false;
  }
  started = true;
  const timer = setTimeout(() => {
    runCsrQueueRecoveryOnce().then((summary) => {
      if (summary.found) logger.info('CSR queue recovery', { ...summary, items: summary.items.slice(0, 50) });
    }).catch((err) => {
      logger.error('CSR queue recovery failed; stalled CSR work resumes when a user asks again', { err: err instanceof Error ? err.message : String(err) });
    });
  }, STARTUP_DELAY_MS);
  timer.unref?.();
  return true;
}
