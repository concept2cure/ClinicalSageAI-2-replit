/**
 * provision-app-role.mjs — provision the NON-SUPERUSER runtime database role.
 *
 * ── Why this exists (the RLS unlock) ──────────────────────────────────────────
 * PostgreSQL Row-Level Security only filters rows for a role that is neither a
 * superuser nor holds BYPASSRLS, and — for the table owner — only when the table
 * carries FORCE ROW LEVEL SECURITY. The application has historically connected
 * with the same owner/admin credentials the migrations use (DATABASE_URL), which
 * is a superuser on most managed providers. Under those credentials RLS is inert
 * no matter what `app.rls_enforce` says, and the boot-time catalog posture check
 * (server/db/rlsEnforcement.ts → assertRlsCatalogPosture) fails closed in
 * production: "runtime role postgres is a PostgreSQL superuser".
 *
 * This provisions a dedicated, least-privilege LOGIN role — `app_service` by
 * default — that the runtime connects as (via APP_DATABASE_URL; see
 * server/db/getDatabaseUrl.ts). It is explicitly NOSUPERUSER / NOBYPASSRLS, so
 * the tenant_isolation_policy actually filters, and it is not the table owner,
 * so it cannot sidestep RLS even without FORCE. Migrations keep running as the
 * owner (DATABASE_URL); only the request-serving pool downgrades.
 *
 * ── Backward compatibility (opt-in) ───────────────────────────────────────────
 * This is a NO-OP unless APP_SERVICE_DB_PASSWORD is set. A deployment that has
 * not split the roles yet provisions nothing and keeps connecting as the owner —
 * exactly today's behavior. The split activates only when an operator sets
 * APP_SERVICE_DB_PASSWORD here (to mint the role) AND points the runtime at it
 * with APP_DATABASE_URL.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 * Safe to re-run. The role is created or aligned; grants and default privileges
 * are re-applied. `GRANT ... ON ALL TABLES` only reaches tables that exist at
 * grant time, so this runs at the END of a from-scratch install and again after
 * every incremental deploy migration; ALTER DEFAULT PRIVILEGES covers tables the
 * owner creates in the future.
 *
 * MUST run on a connection with rights to CREATE ROLE and GRANT (the owner/admin
 * URL the installers already use).
 */

/** A single, unqualified PostgreSQL identifier: no quoting metacharacters. */
const ROLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Minimum runtime password length. Short enough not to fight a generated
 * secret, long enough to reject an obviously-placeholder value.
 */
const MIN_PASSWORD_LENGTH = 12;

/**
 * Per-schema table privileges granted to the runtime role.
 *
 * `audit` is APPEND-ONLY (SELECT, INSERT — no UPDATE/DELETE) to preserve the
 * 21 CFR Part 11 tamper-evidence guarantee: the runtime only ever INSERTs into
 * audit.tamper_proof_log (server/lib/tamper-proof-audit.ts); no code path
 * updates or deletes an audit row, so withholding those privileges costs the
 * app nothing and denies a compromised app process the ability to rewrite the
 * audit trail. Application schemas get full DML. Only schemas that actually
 * exist are touched.
 */
export const SCHEMA_TABLE_PRIVILEGES = Object.freeze({
  public: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  audit: ['SELECT', 'INSERT'],
  vault: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  precedent: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
});

/**
 * Resolve and validate the runtime role name (APP_SERVICE_DB_ROLE, default
 * `app_service`). Validated against a strict identifier grammar because it is
 * interpolated into DDL after being quoted by Postgres — the regex is a second
 * line of defense, not the only one.
 */
export function resolveAppServiceRole(env = process.env) {
  const name = (env.APP_SERVICE_DB_ROLE || 'app_service').trim();
  if (!ROLE_NAME_RE.test(name)) {
    throw new Error(
      `APP_SERVICE_DB_ROLE "${name}" is not a valid PostgreSQL identifier ` +
        '(must match ^[a-z_][a-z0-9_]*$).',
    );
  }
  return name;
}

/** The immutable attribute set for the runtime role — the security contract. */
const ROLE_ATTRIBUTES = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION';

/**
 * Create-or-align the non-superuser runtime role and (re)apply its grants.
 *
 * @param {{query: Function}} db  A pg Pool or Client on an owner/admin connection.
 * @param {{env?: object, log?: (msg: string) => void}} [opts]
 * @returns {Promise<{skipped: boolean, role: string, schemas?: string[]}>}
 */
export async function provisionAppServiceRole(db, { env = process.env, log = () => {} } = {}) {
  const role = resolveAppServiceRole(env);
  const password = env.APP_SERVICE_DB_PASSWORD;

  if (!password) {
    log(
      `  • APP_SERVICE_DB_PASSWORD not set — skipping ${role} provisioning. ` +
        'The runtime will connect as the owner (DATABASE_URL); set APP_SERVICE_DB_PASSWORD ' +
        'and point the app at APP_DATABASE_URL to enforce RLS as a non-superuser.',
    );
    return { skipped: true, role };
  }
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `APP_SERVICE_DB_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  // Never string-concat a password (or identifier) into DDL: let Postgres quote
  // both. quote_ident yields a safely-quoted identifier; quote_literal yields a
  // safely-quoted string literal including its surrounding quotes.
  const quoted = await db.query(
    'SELECT quote_ident($1) AS role_ident, quote_literal($2::text) AS pwd_lit, quote_ident(current_database()) AS db_ident',
    [role, String(password)],
  );
  const roleIdent = quoted.rows[0].role_ident;
  const pwdLit = quoted.rows[0].pwd_lit;
  const dbIdent = quoted.rows[0].db_ident;

  await db.query('BEGIN');
  try {
    const exists =
      (await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount > 0;
    if (exists) {
      // ALTER, not DROP+CREATE: the role owns grants and may hold live
      // connections; rotating the password and re-asserting attributes in place
      // is both idempotent and non-disruptive.
      await db.query(`ALTER ROLE ${roleIdent} WITH ${ROLE_ATTRIBUTES} PASSWORD ${pwdLit}`);
      log(`  ✓ role ${role} aligned (LOGIN · NOSUPERUSER · NOBYPASSRLS · password set)`);
    } else {
      await db.query(`CREATE ROLE ${roleIdent} WITH ${ROLE_ATTRIBUTES} PASSWORD ${pwdLit}`);
      log(`  ✓ role ${role} created (LOGIN · NOSUPERUSER · NOBYPASSRLS)`);
    }

    await db.query(`GRANT CONNECT ON DATABASE ${dbIdent} TO ${roleIdent}`);

    const grantedSchemas = [];
    for (const [schema, privs] of Object.entries(SCHEMA_TABLE_PRIVILEGES)) {
      const present =
        (
          await db.query('SELECT 1 FROM information_schema.schemata WHERE schema_name = $1', [
            schema,
          ])
        ).rowCount > 0;
      if (!present) continue;

      const schemaIdentRes = await db.query('SELECT quote_ident($1) AS s', [schema]);
      const schemaIdent = schemaIdentRes.rows[0].s;
      const privList = privs.join(', ');

      await db.query(`GRANT USAGE ON SCHEMA ${schemaIdent} TO ${roleIdent}`);
      await db.query(`GRANT ${privList} ON ALL TABLES IN SCHEMA ${schemaIdent} TO ${roleIdent}`);
      await db.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schemaIdent} TO ${roleIdent}`,
      );
      // Forward coverage: tables/sequences the OWNER (the role running this)
      // creates later inherit the same grants, so a new migration never locks
      // the runtime out of a table it needs.
      await db.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaIdent} GRANT ${privList} ON TABLES TO ${roleIdent}`,
      );
      await db.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaIdent} GRANT USAGE, SELECT ON SEQUENCES TO ${roleIdent}`,
      );
      grantedSchemas.push(`${schema}(${privList})`);
    }

    await db.query('COMMIT');
    log(`  ✓ grants applied on: ${grantedSchemas.join('; ') || '(no known schemas present)'}`);
    log(`  ✓ default privileges set — future owner-created tables auto-grant to ${role}`);
    return { skipped: false, role, schemas: grantedSchemas };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  }
}
