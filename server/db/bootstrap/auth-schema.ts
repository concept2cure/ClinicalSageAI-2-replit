/**
 * The auth schema the API needs, checked at boot. No DDL.
 *
 * Until 2026-10-22 this module ran the auth-schema statements at every boot:
 * organizations and users columns, the membership junction and the module
 * catalog tables. They ran on the OWNER connection, because ALTER TABLE needs
 * ownership even when every column already exists, and that is why the API
 * task carried the RDS master credential (MR-03 Stage 3, OPS-16). The
 * statements are now migrations/20261022_auth_schema_and_seeded_organizations.sql,
 * which deploy-migrate applies as the owner. The API boots as app_service and
 * asks only whether the result is there (server/startup/services.ts sets
 * readiness from the answer).
 *
 * AUTH_SCHEMA_COLUMNS is every column that migration creates or adds, and
 * server/db/bootstrap/__tests__/auth-schema-migration.test.ts holds the two
 * to each other.
 */

/** Something that can run a parameterized query: a pg Pool or PoolClient. */
export interface AuthSchemaQueryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Table → the columns the auth routes and the module catalog read. */
export const AUTH_SCHEMA_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  organizations: [
    'uuid', 'slug', 'domain', 'logo', 'industry_mode', 'stripe_customer_id', 'settings', 'api_key',
    'stripe_subscription_id', 'billing_cycle', 'payment_status', 'trial_ends_at', 'next_billing_date',
    'seats_purchased', 'tier', 'status', 'max_users', 'max_projects', 'max_storage', 'updated_at',
  ],
  users: [
    'password_hash', 'title', 'department', 'avatar', 'bio', 'status', 'last_login',
    'default_organization_id', 'preferences', 'updated_at', 'mfa_enabled', 'mfa_secret',
    'mfa_backup_codes', 'mfa_method', 'mfa_verified_at', 'mfa_totp_last_step', 'email_otp_resends',
    'failed_login_attempts', 'locked_until', 'last_failed_login', 'password_changed_at',
    'password_history', 'must_change_password', 'reset_token', 'reset_token_expires_at',
  ],
  organization_users: [
    'id', 'organization_id', 'user_id', 'role', 'permissions', 'created_at', 'updated_at', 'persona',
  ],
  available_modules: [
    'id', 'module_id', 'name', 'description', 'category', 'icon', 'path', 'sort_order', 'metadata',
  ],
  module_subscriptions: ['id', 'organization_id', 'module_id', 'enabled', 'created_at'],
};

/**
 * The `table.column` pairs of AUTH_SCHEMA_COLUMNS the database lacks, sorted.
 * Empty when the schema is complete. Reads information_schema only, which
 * shows the runtime role the columns of every table it has a privilege on.
 */
export async function missingAuthSchema(db: AuthSchemaQueryable): Promise<string[]> {
  const tables = Object.keys(AUTH_SCHEMA_COLUMNS);
  const { rows } = await db.query(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [tables],
  );
  const present = new Set(rows.map((r) => `${String(r.table_name)}.${String(r.column_name)}`));
  const missing: string[] = [];
  for (const [table, columns] of Object.entries(AUTH_SCHEMA_COLUMNS)) {
    for (const column of columns) {
      if (!present.has(`${table}.${column}`)) missing.push(`${table}.${column}`);
    }
  }
  return missing.sort();
}
