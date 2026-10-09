/**
 * The server's verdict on one tenant's audit_logs chain, computed by the one
 * verifier (services/audit/chain.ts verifyAuditChain) over EVERY chained row of
 * the tenant.
 *
 * It runs on a super-admin scoped connection filtered to the tenant, the
 * pattern verify-chain uses, because a legacy row may link to the GLOBAL head
 * (see chain.ts readChainRows): on a tenant-scoped client every cross-linked
 * legacy row would read as a break.
 *
 * One function for every reader that states a verdict: the audit-trail ledger,
 * a document's history (routes/c2c/project-vault.ts), and the signed audit
 * export. It was private to the ledger route until the export needed it.
 */
import { verifyAuditChain, type ChainVerificationResult } from './chain.js';

export type TenantChainVerifier = (orgId: number) => Promise<ChainVerificationResult>;

export async function verifyTenantChainOnAdminScope(orgId: number): Promise<ChainVerificationResult> {
  const { withTenantConnection } = await import('../../db/withTenantConnection.js');
  return withTenantConnection(
    { tenantId: '0', role: 'app_super_admin', source: 'request', caller: 'audit/tenant-chain-verdict' },
    (c) => verifyAuditChain(c, { tenantId: orgId }),
  );
}
