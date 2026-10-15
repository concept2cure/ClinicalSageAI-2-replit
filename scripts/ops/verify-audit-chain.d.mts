/**
 * Types for scripts/ops/verify-audit-chain.mjs, for the TypeScript tests that
 * import it (server/services/audit/__tests__/chain-head-on-demand.test.ts and
 * chain-anchor.dbtest.ts). `scripts/` is outside tsconfig's `include`; under
 * `noImplicitAny` an untyped import is TS7016. Same pattern, and the same
 * load-bearing `.d.mts` extension, as scripts/db/provision-app-role.d.mts.
 * Keep in step with the .mjs.
 */
import type { AuditAnchorStore, ChainHeadVerdict } from '../../server/services/audit/chain-anchor';

export interface AuditChainTableReport {
  table: string;
  status: 'ok' | 'broken' | 'unverifiable';
  rows?: number;
  chainedRows?: number;
  reason?: string;
  firstBreak?: Record<string, unknown>;
  /** public.audit_logs only: the chain head against the latest anchor, or why it was not checked. */
  head?: ChainHeadVerdict;
  [key: string]: unknown;
}

export interface AuditChainReport {
  verifiedAt: string;
  verdict: 'ok' | 'broken' | 'unverifiable';
  /** 0 every link verified; 1 a break was found; 2 the verifier could not run or a table could not be checked. */
  exitCode: 0 | 1 | 2;
  tables: AuditChainTableReport[];
}

export declare function resolveChainSecret(env?: Record<string, string | undefined>): {
  secret: string | null;
  source: string;
};

export declare function verifyAuditChains(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  env?: Record<string, string | undefined>,
  options?: { anchorStore?: AuditAnchorStore | null },
): Promise<AuditChainReport>;

export declare function renderReport(report: AuditChainReport): string;
