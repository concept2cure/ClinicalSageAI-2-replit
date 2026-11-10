/**
 * The integrity checks the audit-trail integrity report states, bound to the
 * platform's own verifiers.
 *
 *   auditEventsLinkage  signedAuditExport.ts snapshotChainIntegrity, on the
 *                       report's tenant snapshot (audit_events, this
 *                       organisation's rows).
 *   auditLogsSeals      chain.ts verifyAuditChainSeals for this tenant, on the
 *                       admin-scope connection the tenant chain walk uses
 *                       (tenant-chain-verdict.ts): a legacy row may link to
 *                       another tenant's head, which a tenant-scoped
 *                       connection cannot see.
 *
 * A seal check needs the seal key; without it the check does not run and says
 * so (audit-integrity-service.ts reads the key's presence the same way). A
 * failure of the check itself goes to the log; the report says only that it
 * could not be run.
 *
 * The sealed rows are counted in the tenant's own scope (tenant-chain-verdict.ts
 * countTenantChainRows), not on the admin-scope connection the walk uses (P-72
 * slice 1b, 2026-10-30; docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/).
 * That connection sees the tenant's rows only through the policies' platform
 * arm: with the arm removed it counted 0 sealed rows of 3, verified none, and
 * the check said valid; the report then said no row carries a seal. A check
 * that verified fewer seals than the tenant's rows carry did not run, and says
 * so.
 *
 * @module server/services/audit/compliance-reports/integrity-checks
 */
import { createScopedLogger } from '../../../utils/logger.js';
import { verifyAuditChainSeals } from '../chain.js';
import { snapshotChainIntegrity } from '../signedAuditExport.js';
import { countTenantChainRows } from '../tenant-chain-verdict.js';
import type { IntegrityChecks, SealCheck, SqlClient } from './types';

const log = createScopedLogger('compliance-reports');

export async function verifyTenantSealsOnAdminScope(orgId: number): Promise<SealCheck> {
  if (!process.env.AUDIT_HMAC_KEY) {
    return { ran: false, reason: 'The seal key is not configured on this server, so no seal was checked.' };
  }
  try {
    const { sealed: sealedRows } = await countTenantChainRows(orgId);
    const { withTenantConnection } = await import('../../../db/withTenantConnection.js');
    return await withTenantConnection(
      { tenantId: '0', role: 'app_super_admin', source: 'request', caller: 'audit/compliance-reports seals' },
      async (c): Promise<SealCheck> => {
        const v = await verifyAuditChainSeals(c, { tenantId: orgId });
        if (v.valid && v.verified < sealedRows) {
          return {
            ran: false,
            reason: `The seal check could verify ${v.verified} of the ${sealedRows} sealed rows in this organisation's audit_logs, so the seals were not verified.`,
          };
        }
        return { ran: true, valid: v.valid, sealedRows, brokenAt: v.brokenAt };
      },
    );
  } catch (err) {
    log.error('audit_logs seal check could not run', { orgId, err: err instanceof Error ? err.message : String(err) });
    return { ran: false, reason: 'The seal check could not be run when this report was generated.' };
  }
}

/** The audit_events linkage on the report's snapshot. A query that did not run is logged with its reason. */
async function auditEventsLinkage(client: SqlClient, orgId: number) {
  const snapshot = await snapshotChainIntegrity(client as unknown as Parameters<typeof snapshotChainIntegrity>[0], orgId);
  if (snapshot.status === 'unavailable') {
    log.error('audit_events linkage check could not run', { orgId, reason: snapshot.reason ?? null });
  }
  return snapshot;
}

export const platformIntegrityChecks: IntegrityChecks = {
  auditEventsLinkage,
  auditLogsSeals: verifyTenantSealsOnAdminScope,
};
