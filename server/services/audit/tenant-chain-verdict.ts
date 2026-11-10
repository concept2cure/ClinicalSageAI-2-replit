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
 *
 * A walk that could not see the tenant's rows is not a verdict (P-72 slice 1b,
 * 2026-10-30; docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1b/). The
 * admin-scope connection sees another tenant's rows only through the policies'
 * platform arm. On a production-shaped database with that arm removed, the walk
 * read none of the tenant's 3 chained rows and answered ok, rowsChecked 0, and
 * every reader then said "no chained rows exist". So the tenant's chained rows
 * are first counted in the tenant's OWN scope (countTenantChainRows), where its
 * policies admit every one of them with or without that arm. A walk that read
 * fewer is `ok: null` with a `reason`, whatever it found, and its head is not
 * checked on that connection: a row or an anchored head it cannot see would
 * read as a break. `ok: true, rowsChecked: 0` now means
 * what every reader already says of it (audited-export.ts tenantChainVerdict,
 * NO_CHAINED_ROWS_REASON): the tenant has no chained row. The walk stays on
 * the admin scope until the design's platform door gives it the legacy rows'
 * cross-tenant context (docs/design/PLATFORM_SCOPE_AS_A_ROLE_2026-10-29.md §3.4,
 * platform_audit_chain_links).
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
  /** Why `ok` is null when the walk itself gave no verdict: it could not read every chained row of the tenant. */
  reason?: string;
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

/** The head's verdict when the walk could not read the tenant's rows: not checked on that connection. */
function headNotChecked(read: number, chained: number): TenantChainHead {
  return {
    verified: false,
    status: 'unavailable',
    anchorKey: null,
    anchoredAt: null,
    breaks: [],
    reason: `${HEAD_NOT_VERIFIED}: the verifier could read ${read} of this organisation's ${chained} chained rows`,
  };
}

/** How many of the tenant's audit_logs rows are chained, and how many carry a seal. */
export interface TenantChainRowCount {
  chained: number;
  sealed: number;
}

/**
 * The tenant's chained and sealed audit_logs rows, counted in the tenant's own
 * scope (its tenant id, no role), where audit_logs' tenant arm admits every
 * one of them with or without the platform arm. The count a verifier's
 * coverage is held to; also used by the seal check
 * (compliance-reports/integrity-checks.ts).
 */
export async function countTenantChainRows(orgId: number): Promise<TenantChainRowCount> {
  const { withTenantConnection } = await import('../../db/withTenantConnection.js');
  return withTenantConnection(
    { tenantId: String(orgId), role: null, source: 'request', caller: 'audit/tenant-chain-verdict count' },
    async (c) => {
      const { rows } = await c.query(
        `SELECT count(*)::int AS chained, count(hmac_seal)::int AS sealed
           FROM audit_logs WHERE tenant_id = $1 AND sha256_chain IS NOT NULL`,
        [orgId],
      );
      return { chained: Number(rows[0]?.chained ?? 0), sealed: Number(rows[0]?.sealed ?? 0) };
    },
  );
}

export async function verifyTenantChainOnAdminScope(orgId: number): Promise<TenantChainVerification> {
  // Counted first: a row written between the count and the walk can only make the walk read more.
  const counted = await countTenantChainRows(orgId);
  const { withTenantConnection } = await import('../../db/withTenantConnection.js');
  return withTenantConnection(
    { tenantId: '0', role: 'app_super_admin', source: 'request', caller: 'audit/tenant-chain-verdict' },
    async (c) => {
      const walk = await verifyAuditChain(c, { tenantId: orgId });
      // A walk over a subset is no verdict either way: a row it cannot see would also read as a break.
      const read = walk.legacyRows + walk.sequencedRows;
      if (read < counted.chained) {
        return {
          ...walk,
          ok: null,
          head: headNotChecked(read, counted.chained),
          reason: `The verifier could read ${read} of this organisation's ${counted.chained} chained audit_logs rows, so the chain is not verified.`,
        };
      }
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
