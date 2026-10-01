/**
 * Types for scripts/db/database-audit.mjs (plain ESM, run by deploy-migrate
 * with node). `.d.mts`, not `.d.ts`: TypeScript resolves a `.mjs` import only
 * through `.mts` / `.d.mts` (see scripts/db/migration-set.d.mts).
 */
export declare const DB_AUDIT_ENV: 'DB_AUDIT_REQUIRED';

/** '' / unset → false; 'pgaudit' → true; anything else throws. */
export declare function databaseAuditRequired(env?: Record<string, string | undefined>): boolean;

export declare function ensureDatabaseAudit(
  client: { query: (sql: string) => Promise<{ rows: any[] }> },
  options: { required: boolean; log?: (message: string) => void },
): Promise<{ state: 'recording' | 'not-loaded'; classes?: string }>;
