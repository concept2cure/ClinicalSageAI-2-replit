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
 * Per-schema privilege OVERRIDES for the runtime role. Any schema not listed
 * gets DEFAULT_TABLE_PRIVILEGES. `audit` is append-only (SELECT, INSERT) to
 * preserve 21 CFR Part 11 tamper-evidence; `extensions` is read-only (SELECT).
 */
export declare const SCHEMA_PRIVILEGE_OVERRIDES: Readonly<Record<string, string[]>>;

/** Full DML — the default granted on every application schema without an override. */
export declare const DEFAULT_TABLE_PRIVILEGES: readonly string[];

/** Relations the runtime role must never own nor hold more than the override on. */
export declare const APPEND_ONLY_TABLES: readonly { schema: string; name: string }[];

/** Resolve and validate the runtime role name (APP_SERVICE_DB_ROLE, default app_service). */
export declare function resolveAppServiceRole(env?: Record<string, string | undefined>): string;

/** The login role named in a connection string, or null. */
export declare function roleFromUrl(url: string | undefined | null): string | null;

export interface RuntimeRoleIdentity {
  role: string;
  source: 'RUNTIME_DB_ROLE' | 'APP_SERVICE_DB_PASSWORD' | 'APP_DATABASE_URL' | 'DATABASE_URL';
}

/**
 * Identify the runtime role from the environment (RUNTIME_DB_ROLE →
 * APP_SERVICE_DB_PASSWORD → APP_DATABASE_URL → DATABASE_URL), or null when it
 * equals `ownerRole` / nothing names one (single-role posture).
 */
export declare function resolveRuntimeRole(
  env?: Record<string, string | undefined>,
  opts?: { ownerRole?: string | null },
): RuntimeRoleIdentity | null;

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

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
  db: { query: QueryFn },
  options?: ProvisionAppServiceRoleOptions,
): Promise<ProvisionAppServiceRoleResult>;

export interface RefreshRuntimeRoleGrantsResult {
  skipped: false;
  role: string;
  schemas: string[];
  attrs: { rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean };
}

/** Re-apply the grant recipe to an EXISTING runtime role; throws if it does not exist. */
export declare function refreshRuntimeRoleGrants(
  db: { query: QueryFn },
  opts: { role: string; log?: (message: string) => void },
): Promise<RefreshRuntimeRoleGrantsResult>;

export interface EnsureRuntimeRoleResult {
  skipped: boolean;
  mode: 'minted' | 'refreshed' | 'single-role';
  role: string | null;
  owner: string;
  source?: string;
  schemas?: string[];
}

/** Installers' entry point: mint (password set), refresh (role identified), or single-role. */
export declare function ensureRuntimeRole(
  db: { query: QueryFn },
  options?: ProvisionAppServiceRoleOptions,
): Promise<EnsureRuntimeRoleResult>;

export interface RuntimeRoleGrantAudit {
  role: string;
  exists: boolean;
  attrs: { rolname: string; rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean } | null;
  relations: number;
  denied: { relation: string; missing: string[] }[];
  excess: { relation: string; held: string[] }[];
  ownedAppendOnly: string[];
  ownedInOverrideSchemas: number;
  schemasWithoutUsage: string[];
}

/** Audit `role` against the recipe on every application relation. */
export declare function auditRuntimeRoleGrants(
  db: { query: QueryFn },
  role: string,
): Promise<RuntimeRoleGrantAudit>;
