/**
 * Types for scripts/db/provision-app-role.mjs.
 *
 * `scripts/` is outside tsconfig's `include`, so the .mjs module itself is never
 * checked — but server/db/__tests__/provision-app-role.test.ts imports from it,
 * and under `noImplicitAny` an untyped import is a hard TS7016 error (fails
 * `npm run typecheck` for the whole project). Hand-written to match the .mjs,
 * which stays plain ESM so install-fresh and deploy-migrate run it directly with
 * node (no build step). Keep these signatures in step with the .mjs.
 *
 * THE EXTENSION IS LOAD-BEARING — this file must stay `.d.mts` (see the sibling
 * migration-set.d.mts for the resolution rationale): TypeScript resolves a
 * `.mjs` specifier only via `.mts` / `.d.mts`, never `.d.ts`.
 */

/**
 * Per-schema table privileges granted to the runtime role. `audit` is
 * append-only (SELECT, INSERT) to preserve 21 CFR Part 11 tamper-evidence;
 * application schemas get full DML.
 */
export declare const SCHEMA_TABLE_PRIVILEGES: Readonly<Record<string, string[]>>;

/** Resolve and validate the runtime role name (APP_SERVICE_DB_ROLE, default app_service). */
export declare function resolveAppServiceRole(env?: Record<string, string | undefined>): string;

export interface ProvisionAppServiceRoleOptions {
  env?: Record<string, string | undefined>;
  log?: (message: string) => void;
}

export interface ProvisionAppServiceRoleResult {
  skipped: boolean;
  role: string;
  schemas?: string[];
}

/**
 * Create-or-align the non-superuser runtime role and (re)apply its grants.
 * No-op (returns { skipped: true }) unless APP_SERVICE_DB_PASSWORD is set.
 * Must run on an owner/admin connection (rights to CREATE ROLE and GRANT).
 */
export declare function provisionAppServiceRole(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number }> },
  options?: ProvisionAppServiceRoleOptions,
): Promise<ProvisionAppServiceRoleResult>;
