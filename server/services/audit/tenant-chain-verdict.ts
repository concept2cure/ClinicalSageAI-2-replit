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
 * a document's history (routes/c2c/project-vault.ts), the signed audit
 * export, the exports and reports that state audited-export.ts
 * walkTenantChain, and verify-chain for a caller who is not a platform
 * administrator. It was private to the ledger route until the export needed it.
 *
 * The walk cannot see the newest rows removed (security plan P0-8), so the
 * tenant's anchored head is checked too (chain-anchor.ts verifyChainHead,
 * scoped to this organisation): a missing or changed head makes `ok` false,
 * and `head` carries that verdict, or says the verdict is the walk only when
 * no anchor could be consulted.
 *
 * An anchor that cannot be read does NOT throw here (fix round DP-72,
 * 2026-10-01). The anchor is one estate-wide object outside the database, and
 * a tenant reading its own audit trail must not depend on it: one malformed or
 * unreadable anchor would otherwise answer 500 to every tenant's ledger and
 * document history. So the head step alone is caught: the walk's result is
 * returned with `head.status: 'unavailable'` and `ok: null` (not verified,
 * neither ok nor broken), and the reader shows its entries with that verdict.
 * A walk that fails still throws. The operator verifiers (verify-chain for a
 * platform administrator, ops:verify-audit-chain, the sweep) call
 * verifyChainHead directly and keep throwing, where an error is the answer.
 */
import { createScopedLogger } from '../../utils/logger.js';
import { verifyAuditChain, type ChainVerificationResult } from './chain.js';
import { HEAD_NOT_VERIFIED, verifyChainHead, type ChainHeadVerdict } from './chain-anchor.js';

const log = createScopedLogger('audit/tenant-chain-verdict');

/**
 * The head as a tenant verdict carries it: verifyChainHead's verdict, or
 * `unavailable` when the anchor could not be read (store, KMS or document).
 */
export type TenantChainHead = Omit<ChainHeadVerdict, 'status'> & {
  status: ChainHeadVerdict['status'] | 'unavailable';
};

/**
 * The walk's counts and first break, and the head's own verdict.
 *
 * `ok` is true when the walk holds and no anchored head is broken, false when
 * either breaks, and null when the walk holds but the anchor could not be read:
 * not verified, which every reader states as such (never ok, never broken).
 */
export type TenantChainVerification = Omit<ChainVerificationResult, 'ok'> & {
  ok: boolean | null;
  head: TenantChainHead;
};

/** What a reader accepts: the verdict above, or a walk with no head (an injected verifier). */
export type TenantChainVerifier = (
  orgId: number,
) => Promise<Omit<TenantChainVerification, 'head'> & { head?: TenantChainHead }>;

/** The head's verdict when the anchor could not be read. Plain words; the cause goes to the log. */
function headUnavailable(): TenantChainHead {
  return {
    verified: false,
    status: 'unavailable',
    anchorKey: null,
    anchoredAt: null,
    breaks: [],
    reason: `${HEAD_NOT_VERIFIED}: the anchor could not be read, so this verdict is not verified`,
  };
}

export async function verifyTenantChainOnAdminScope(orgId: number): Promise<TenantChainVerification> {
  const { withTenantConnection } = await import('../../db/withTenantConnection.js');
  return withTenantConnection(
    { tenantId: '0', role: 'app_super_admin', source: 'request', caller: 'audit/tenant-chain-verdict' },
    async (c) => {
      const walk = await verifyAuditChain(c, { tenantId: orgId });
      let head: TenantChainHead;
      try {
        head = await verifyChainHead(c, { organizationId: orgId });
      } catch (err) {
        log.error('chain head not verified: the anchor could not be read', {
          orgId,
          err: err instanceof Error ? err.message : String(err),
        });
        head = headUnavailable();
      }
      const ok = !walk.ok || head.status === 'broken' ? false : head.status === 'unavailable' ? null : true;
      return { ...walk, ok, head };
    },
  );
}
