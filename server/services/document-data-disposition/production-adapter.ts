/** Production adapter for the service-owned, tenant-scoped transaction. */
import { pool } from '../../db.js';
import { writeChainedAuditRow } from '../auditService.js';
import { createDocumentDispositionService, DispositionError, type DispositionDatabase } from './service';

export const DOCUMENT_DISPOSITIONS_ENABLED_ENV = 'C2C_DOCUMENT_DISPOSITIONS_ENABLED';
export function documentDispositionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DOCUMENT_DISPOSITIONS_ENABLED_ENV] === '1';
}
export function createDefaultDocumentDispositionService() {
  return createDocumentDispositionService({
    db: pool as unknown as DispositionDatabase,
    enabled: () => documentDispositionsEnabled(),
    tokenSecret: process.env.DOCUMENT_DISPOSITION_PREVIEW_SECRET ?? process.env.SESSION_SECRET ?? '',
    audit: async (q, entry) => {
      await writeChainedAuditRow(q, entry, entry.organizationId, entry.resourceId);
      const receipt = await q.query(`SELECT id::text AS id, sha256_chain FROM audit_logs
        WHERE tenant_id=$1 AND target=$2 ORDER BY chain_seq DESC NULLS LAST,occurred_at DESC,id DESC LIMIT 1`,
        [entry.organizationId,`${entry.resourceType}:${entry.resourceId}`]);
      if (!receipt.rows[0]) throw new DispositionError(503,'AUDIT_UNAVAILABLE','The chained audit receipt is unavailable. Nothing was changed.');
      return { id:receipt.rows[0].id,sha256Chain:receipt.rows[0].sha256_chain };
    },
  });
}
