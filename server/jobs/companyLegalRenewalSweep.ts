/** Company-legal renewals ride the existing hourly task deadline scheduler. */
import { getPool } from '../db/runtime';
import { runScheduledOnce } from '../db/scheduledOnce';
import { withTenantConnection } from '../db/withTenantConnection';
import { filterTenantsForBackgroundWork } from '../services/tenant/tenant-lifecycle';
import { loadCompanyDocumentProfile } from '../services/company-documents/profile';
import { notifyCompanyLegalRenewal, syncCompanyLegalRenewal } from '../services/company-documents/legal-workflow';
import { writeChainedAuditRow } from '../services/auditService';
import { ProgramReadAccessError } from '../services/c2c/current-program-access';

export interface CompanyLegalRenewalSweepSummary { organizations: number; notified: number; projected: number; errors: number; skippedNotEntitled: number }
export async function processCompanyLegalRenewals(organizationId: number) {
  return withTenantConnection({ tenantId: organizationId, source: 'job', caller: 'company-legal-renewal' }, async q => {
    await q.query('BEGIN');
    try {
      // Shares the canonical profile writer's organization lock. Evidence and
      // notification dedup cannot race a replacement, custodian edit or revoke.
      const owner = await q.query('SELECT id FROM organizations WHERE id=$1 FOR UPDATE', [organizationId]);
      if (!owner.rows.length) { await q.query('ROLLBACK'); return { notified: 0, projected: 0 }; }
      const profile = await loadCompanyDocumentProfile(organizationId, q);
      let notified = 0; let projected = 0;
      const delivered: Array<{ legalDocumentId: string; contentHash: string; notificationId: number }> = [];
      for (const document of profile.legalDocuments) {
        const userId = Number(document.workflow?.custodianUserId);
        if (!Number.isSafeInteger(userId) || userId <= 0) continue;
        // Both functions re-admit the current active custodian and project.
        // Removed access must not keep receiving a private legal notice.
        try {
          const changed = await syncCompanyLegalRenewal(q, organizationId, userId, document);
          if (changed) projected += 1;
          const notificationId = await notifyCompanyLegalRenewal(q, organizationId, document);
          if (notificationId !== null) { notified += 1; delivered.push({ legalDocumentId: document.id, contentHash: document.contentHash, notificationId }); }
        } catch (error) {
          if (error instanceof ProgramReadAccessError && [403, 404, 409].includes(error.status)) continue;
          throw error;
        }
      }
      if (projected || notified) await writeChainedAuditRow(q, { action: 'company_legal.renewal_sweep', resourceType: 'company_legal_registry',
        resourceId: String(organizationId), details: { actor: 'system:company-legal-renewal', companyDocumentRevision: profile.revision, projected, delivered } }, organizationId);
      await q.query('COMMIT'); return { notified, projected };
    } catch (error) {
      await q.query('ROLLBACK'); throw error;
    }
  });
}
/** Cross-process lease plus per-tenant row locks and durable notification keys. */
export async function runCompanyLegalRenewalSweep(): Promise<CompanyLegalRenewalSweepSummary> {
  const summary: CompanyLegalRenewalSweepSummary = { organizations: 0, notified: 0, projected: 0, errors: 0, skippedNotEntitled: 0 };
  const run = await runScheduledOnce('company-legal-renewal', async () => {
    let cursor = 0;
    for (;;) {
      const { rows } = await getPool().query(`SELECT o.id FROM organizations o WHERE o.id>$1
        AND EXISTS(SELECT 1 FROM public.company_legal_registry r WHERE r.organization_id=o.id)
        ORDER BY o.id LIMIT 200`, [cursor]);
      if (!rows.length) break;
      const ids = rows.map(row => Number(row.id));
      const entitled = await filterTenantsForBackgroundWork(ids);
      for (const organizationId of ids) {
        cursor = organizationId;
        if (!entitled.has(organizationId)) { summary.skippedNotEntitled += 1; continue; }
        try {
          const result = await processCompanyLegalRenewals(organizationId);
          summary.organizations += 1; summary.notified += result.notified; summary.projected += result.projected;
        } catch { summary.errors += 1; }
      }
    }
  });
  return run.ran ? summary : { ...summary };
}
