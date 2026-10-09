/**
 * provision-app-role.mjs — the runtime database role: mint it, grant it, audit it.
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
 * ── The grant recipe is ONE function, called from every path ─────────────────
 * `grantRuntimeRolePrivileges` is the single definition of what the runtime
 * role may do. It is reached three ways:
 *
 *   provisionAppServiceRole   APP_SERVICE_DB_PASSWORD set → mint/align the role,
 *                             then the recipe (install-fresh 7/8, deploy-migrate 4/5).
 *   refreshRuntimeRoleGrants  a runtime role that already EXISTS and is
 *                             identifiable (see resolveRuntimeRole) → the recipe
 *                             only. No password is needed to grant.
 *   ensureRuntimeRole         the entry point the installers call: picks one of
 *                             the two above, or reports the single-role posture.
 *
 * ── Why refresh without a password (2026-09-21, IQ-DEV-001) ──────────────────
 * Until this change grants were refreshed ONLY when APP_SERVICE_DB_PASSWORD was
 * set. Every other split-role estate — an owner that migrates and a distinct
 * runtime role that the operator never asked this script to mint — got no
 * grants at all: after install-fresh + deploy-migrate as the owner, the runtime
 * role (`c2c` locally, measured 2026-09-20) lacked SELECT/INSERT on 183 public
 * tables the owner had created, section creation in Authoring answered 500, and
 * every Part 11 step behind it could not execute. The password gate was meant
 * to keep single-role deployments untouched; it also kept every unminted
 * split-role deployment broken. The gate now is "is a runtime role identifiable
 * and distinct from the owner" — a role that this connection did not create
 * can still be granted to, and must be.
 *
 * ── Never widen the audit store ──────────────────────────────────────────────
 * The recipe grants `audit` SELECT, INSERT only. `auditRuntimeRoleGrants` is
 * the check the deploy verifies with: it fails on any relation the role cannot
 * reach AND on any privilege beyond the append-only ceiling that the role holds
 * on an audit relation it does not own — a PUBLIC grant or a hand GRANT of
 * UPDATE on audit.tamper_proof_log fails the deploy; the recipe never grants
 * it and never will.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────────
 * Safe to re-run. The role is created or aligned; grants and default privileges
 * are re-applied. `GRANT ... ON ALL TABLES` only reaches tables that exist at
 * grant time, so this runs at the END of a from-scratch install and again after
 * every incremental deploy migration; ALTER DEFAULT PRIVILEGES covers tables the
 * owner creates in the future.
 *
 * MUST run on a connection with rights to GRANT (and, for minting, CREATE ROLE):
 * the owner/admin URL the installers already use.
 */

import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

/** A single, unqualified PostgreSQL identifier: no quoting metacharacters. */
const ROLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;

/**
 * Minimum runtime password length. Short enough not to fight a generated
 * secret, long enough to reject an obviously-placeholder value.
 */
const MIN_PASSWORD_LENGTH = 12;

/**
 * The password as PostgreSQL stores it: a SCRAM-SHA-256 verifier, computed
 * HERE so the plaintext never reaches the server.
 *
 * `ALTER ROLE … PASSWORD '<plaintext>'` is DDL, and production's RDS parameter
 * group sets log_statement = 'ddl' and exports the server log to CloudWatch.
 * So every mint wrote APP_DATABASE_URL's password, in the clear, into a log
 * group anyone with logs:GetLogEvents can read (review finding SEC-1,
 * 2026-09-24). A pre-hashed verifier is stored as given, and a log line holding
 * it discloses nothing a client can log in with. This is what psql's
 * \password does, per RFC 5802 / RFC 7677:
 *
 *   SaltedPassword = PBKDF2-HMAC-SHA-256(SASLprep(password), salt, 4096)
 *   StoredKey      = SHA-256(HMAC(SaltedPassword, "Client Key"))
 *   ServerKey      = HMAC(SaltedPassword, "Server Key")
 *
 * SASLprep is the identity on printable ASCII, which is the only input
 * accepted here — so this verifier is exactly the one the server would compute,
 * and a password outside that set is refused rather than hashed differently
 * from how the server will hash it at login.
 */
export function scramSha256Verifier(password, { salt = randomBytes(16), iterations = 4096 } = {}) {
  if (!/^[\x20-\x7e]+$/.test(password)) {
    throw new Error(
      'APP_SERVICE_DB_PASSWORD must be printable ASCII. The SCRAM verifier is computed before the ' +
        'password reaches the server, and outside ASCII that computation (SASLprep) is not ' +
        'guaranteed to match the one the server performs at login.',
    );
  }
  const salted = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
  const hmac = (key, msg) => createHmac('sha256', key).update(msg).digest();
  const storedKey = createHash('sha256').update(hmac(salted, 'Client Key')).digest();
  const serverKey = hmac(salted, 'Server Key');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}

/**
 * Table privileges granted to the runtime role, per schema.
 *
 * The role is granted on EVERY application schema that exists (discovered at
 * grant time), because the runtime touches many more than a handful: public,
 * intelligence, core, cortex, lumen, vault, precedent, compliance, clinical_ops,
 * manufacturing, labeling, ectd, … A hardcoded allowlist silently locks the role
 * out of any schema it omits, which surfaces as a `permission denied for schema
 * X` 500 the moment a feature backed by X is hit (and a "green" install would
 * not catch it). So the default is full DML on every non-system schema, with a
 * few deliberate per-schema OVERRIDES:
 *
 *   - `audit` is APPEND-ONLY (SELECT, INSERT — no UPDATE/DELETE) to preserve the
 *     21 CFR Part 11 tamper-evidence guarantee: the runtime only ever INSERTs
 *     into audit.tamper_proof_log (server/lib/tamper-proof-audit.ts); no code
 *     path updates or deletes an audit row, so withholding those privileges
 *     costs the app nothing and denies a compromised app process the ability to
 *     rewrite the audit trail.
 *   - `extensions` is READ-ONLY (SELECT): it holds extension-installed objects
 *     (types/functions the runtime references via USAGE); the app never writes
 *     extension tables.
 *
 * This does not weaken the RLS unlock: the role is still NOSUPERUSER /
 * NOBYPASSRLS and is not the table owner, so Row-Level Security filters every
 * row it touches in every schema regardless of these DML grants.
 */
export const SCHEMA_PRIVILEGE_OVERRIDES = Object.freeze({
  audit: ['SELECT', 'INSERT'],
  extensions: ['SELECT'],
});

/** Full DML — the default for every application schema without an override. */
export const DEFAULT_TABLE_PRIVILEGES = Object.freeze(['SELECT', 'INSERT', 'UPDATE', 'DELETE']);

/**
 * Relations the runtime role must NEVER own and never hold more than the
 * schema override on. Ownership confers every privilege, so a runtime role that
 * owns the Part 11 store can rewrite it no matter what was granted; the audit
 * reports that as a failure, not an observation.
 */
export const APPEND_ONLY_TABLES = Object.freeze([{ schema: 'audit', name: 'tamper_proof_log' }]);

/** System schemas the recipe and the audit never touch. */
const SYSTEM_SCHEMA_FILTER = `nspname NOT IN ('pg_catalog', 'information_schema') AND nspname !~ '^pg_'`;

function assertRoleName(name, origin) {
  if (!ROLE_NAME_RE.test(name)) {
    throw new Error(
      `${origin} "${name}" is not a valid PostgreSQL identifier (must match ^[a-z_][a-z0-9_]*$).`,
    );
  }
  return name;
}

/**
 * Resolve and validate the runtime role name (APP_SERVICE_DB_ROLE, default
 * `app_service`). Validated against a strict identifier grammar because it is
 * interpolated into DDL after being quoted by Postgres — the regex is a second
 * line of defense, not the only one.
 */
export function resolveAppServiceRole(env = process.env) {
  const name = (env.APP_SERVICE_DB_ROLE || 'app_service').trim();
  return assertRoleName(name, 'APP_SERVICE_DB_ROLE');
}

/**
 * The login role named in a connection string, or null when the string names
 * none. Accepts the `psql '…'` wrapper operators paste from consoles (as
 * connection.mjs does) and falls back to a plain scheme://user[:pw]@ scan for
 * URLs the WHATWG parser rejects (unencoded characters in the password).
 */
export function roleFromUrl(url) {
  if (!url) return null;
  const cleaned = String(url).replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
  try {
    const u = new URL(cleaned);
    return u.username ? decodeURIComponent(u.username) : null;
  } catch {
    const m = /^[a-z][a-z0-9+.-]*:\/\/([^:@/?#]+)(?::[^@]*)?@/i.exec(cleaned);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

/**
 * Identify the runtime (request-serving) role from the environment, or null
 * when the estate is single-role (the runtime IS the owner).
 *
 * Precedence — first identifiable wins:
 *   1. RUNTIME_DB_ROLE           explicit; what scripts/db/provision.mjs hands
 *                                its children so they never see the app URL.
 *   2. APP_SERVICE_DB_PASSWORD   the mint path; the role is APP_SERVICE_DB_ROLE.
 *   3. APP_DATABASE_URL          the role the server will connect as.
 *   4. DATABASE_URL              when DATABASE_OWNER_URL made a different role
 *                                the owner, DATABASE_URL is the runtime's.
 *
 * A candidate equal to `ownerRole` (the role this connection runs as, i.e. the
 * one that owns what it creates) is the single-role posture and yields null:
 * an owner needs no grants on its own tables.
 *
 * @param {Record<string, string|undefined>} env
 * @param {{ownerRole?: string|null}} [opts]
 * @returns {{role: string, source: string} | null}
 */
export function resolveRuntimeRole(env = process.env, { ownerRole = null } = {}) {
  let candidate = null;
  if (env.RUNTIME_DB_ROLE && env.RUNTIME_DB_ROLE.trim()) {
    candidate = { role: assertRoleName(env.RUNTIME_DB_ROLE.trim(), 'RUNTIME_DB_ROLE'), source: 'RUNTIME_DB_ROLE' };
    if (env.APP_SERVICE_DB_PASSWORD) {
      const minted = resolveAppServiceRole(env);
      if (minted !== candidate.role) {
        throw new Error(
          `RUNTIME_DB_ROLE=${candidate.role} conflicts with the role APP_SERVICE_DB_PASSWORD would mint ` +
            `(${minted}, from APP_SERVICE_DB_ROLE). The runtime would connect as one role while the other ` +
            'is granted. Set them to the same name.',
        );
      }
    }
  } else if (env.APP_SERVICE_DB_PASSWORD) {
    candidate = { role: resolveAppServiceRole(env), source: 'APP_SERVICE_DB_PASSWORD' };
  } else if (env.APP_DATABASE_URL && env.APP_DATABASE_URL.trim()) {
    const role = roleFromUrl(env.APP_DATABASE_URL);
    if (!role) throw new Error('APP_DATABASE_URL names no login role — cannot identify the runtime role.');
    candidate = { role: assertRoleName(role, 'APP_DATABASE_URL role'), source: 'APP_DATABASE_URL' };
  } else if (env.DATABASE_URL && env.DATABASE_URL.trim()) {
    const role = roleFromUrl(env.DATABASE_URL);
    if (role) candidate = { role: assertRoleName(role, 'DATABASE_URL role'), source: 'DATABASE_URL' };
  }
  if (!candidate) return null;
  if (ownerRole && candidate.role === ownerRole) return null;
  return candidate;
}

/** The immutable attribute set for the runtime role — the security contract. */
const ROLE_ATTRIBUTES = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION';

/**
 * The same contract, minus the three attributes PostgreSQL lets only a
 * superuser NAME in ALTER ROLE — even to set them to NO.
 *
 * On Amazon RDS the master is LOGIN CREATEROLE CREATEDB but not a superuser,
 * and `ALTER ROLE … NOSUPERUSER` from it fails with "Only roles with the
 * SUPERUSER attribute may change the SUPERUSER attribute" (likewise BYPASSRLS
 * and REPLICATION). 080_gcc has always created the role by then, so the mint
 * step took this branch and failed on RDS every time. A non-superuser cannot
 * GRANT those attributes either, so omitting them loses nothing it could have
 * asserted — the result is then READ BACK and refused if it is not safe
 * (assertRuntimeRoleAttributes), which is the part that actually protects.
 * CREATE ROLE is unaffected: naming NOSUPERUSER there is permitted.
 */
const ROLE_ATTRIBUTES_NON_SUPERUSER = 'LOGIN NOCREATEDB NOCREATEROLE';

/**
 * Read the role back and fail closed unless it is exactly what the runtime is
 * allowed to be. Checked after every mint, because the attributes the mint
 * could not name (as a non-superuser) are ones a pre-existing role may carry.
 */
async function assertRuntimeRoleAttributes(db, role) {
  const { rows } = await db.query(
    `SELECT rolcanlogin, rolsuper, rolbypassrls, rolreplication, rolcreatedb, rolcreaterole
       FROM pg_roles WHERE rolname = $1`,
    [role],
  );
  const a = rows[0];
  if (!a) throw new Error(`runtime role ${role} does not exist after minting it.`);
  const wrong = [
    !a.rolcanlogin && 'cannot LOGIN',
    a.rolsuper && 'is SUPERUSER',
    a.rolbypassrls && 'is BYPASSRLS',
    a.rolreplication && 'has REPLICATION',
    a.rolcreatedb && 'has CREATEDB',
    a.rolcreaterole && 'has CREATEROLE',
  ].filter(Boolean);
  if (wrong.length) {
    throw new Error(
      `runtime role ${role} ${wrong.join(', ')} — it must be LOGIN NOSUPERUSER NOBYPASSRLS ` +
        'NOREPLICATION NOCREATEDB NOCREATEROLE, and the connecting role cannot make it so ' +
        '(only a superuser can clear SUPERUSER, BYPASSRLS or REPLICATION). A BYPASSRLS or ' +
        'superuser runtime role reads every tenant\'s rows; refusing rather than minting it.',
    );
  }
}

/**
 * THE grant recipe. Grants the runtime role, on every application schema
 * present: USAGE; the per-schema table privileges; USAGE, SELECT on sequences;
 * EXECUTE on functions; and the same as DEFAULT PRIVILEGES for objects the
 * connecting role (the owner) creates later. Grants only — it never REVOKEs,
 * so the owner's own privileges on relations it happens to own are untouched.
 *
 * Runs inside the caller's transaction. `roleIdent` must come from quote_ident.
 *
 * @returns {Promise<string[]>} the schemas granted, as `schema(PRIVS)`.
 */
async function grantRuntimeRolePrivileges(db, roleIdent, { log = () => {} } = {}) {
  const dbIdent = (await db.query('SELECT quote_ident(current_database()) AS db_ident')).rows[0].db_ident;
  await db.query(`GRANT CONNECT ON DATABASE ${dbIdent} TO ${roleIdent}`);

  // Discover every application schema present and grant on ALL of them, so no
  // schema the runtime uses can be silently left ungranted. System schemas
  // (pg_catalog, pg_toast, pg_temp_*, information_schema) are excluded.
  const schemaRows = (
    await db.query(`SELECT nspname FROM pg_namespace WHERE ${SYSTEM_SCHEMA_FILTER} ORDER BY nspname`)
  ).rows;

  const grantedSchemas = [];
  for (const { nspname: schema } of schemaRows) {
    const privs = SCHEMA_PRIVILEGE_OVERRIDES[schema] || DEFAULT_TABLE_PRIVILEGES;

    const schemaIdentRes = await db.query('SELECT quote_ident($1) AS s', [schema]);
    const schemaIdent = schemaIdentRes.rows[0].s;
    const privList = privs.join(', ');

    await db.query(`GRANT USAGE ON SCHEMA ${schemaIdent} TO ${roleIdent}`);
    await db.query(`GRANT ${privList} ON ALL TABLES IN SCHEMA ${schemaIdent} TO ${roleIdent}`);
    await db.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schemaIdent} TO ${roleIdent}`);
    // Functions too, not just tables: functions default to PUBLIC EXECUTE, so
    // this looked redundant — until 069_gcc_multitenant_rls_expansion.sql
    // REVOKEd PUBLIC on core.can_access_program/can_write_program and granted
    // them back to nobody. Every RLS policy that calls those helpers then
    // fails for the runtime role with "permission denied for function", which
    // means every INSERT/UPDATE on the policied tables fails. The runtime
    // role must be able to execute application functions; the functions
    // themselves enforce their own logic.
    await db.query(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schemaIdent} TO ${roleIdent}`);
    // Forward coverage: tables/sequences the OWNER (the role running this)
    // creates later inherit the same grants, so a new migration never locks
    // the runtime out of a table it needs.
    await db.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaIdent} GRANT ${privList} ON TABLES TO ${roleIdent}`,
    );
    await db.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaIdent} GRANT USAGE, SELECT ON SEQUENCES TO ${roleIdent}`,
    );
    await db.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaIdent} GRANT EXECUTE ON FUNCTIONS TO ${roleIdent}`,
    );
    grantedSchemas.push(`${schema}(${privList})`);
  }

  log(`  ✓ grants applied on: ${grantedSchemas.join('; ') || '(no known schemas present)'}`);
  log(`  ✓ default privileges set — future owner-created tables auto-grant to ${roleIdent}`);
  return grantedSchemas;
}

/**
 * Create-or-align the non-superuser runtime role and (re)apply its grants.
 * No-op (returns { skipped: true }) unless APP_SERVICE_DB_PASSWORD is set — the
 * mint path needs a password; an estate whose runtime role already exists uses
 * refreshRuntimeRoleGrants (or ensureRuntimeRole, which chooses).
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
      `  • APP_SERVICE_DB_PASSWORD not set — not minting ${role}. ` +
        'Set it to mint or rotate the role; an existing runtime role is granted without it ' +
        '(ensureRuntimeRole).',
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
  // safely-quoted string literal including its surrounding quotes. What is
  // quoted is the SCRAM verifier, never the plaintext (scramSha256Verifier).
  const quoted = await db.query(
    'SELECT quote_ident($1) AS role_ident, quote_literal($2::text) AS pwd_lit, quote_ident(current_database()) AS db_ident',
    [role, scramSha256Verifier(String(password))],
  );
  const roleIdent = quoted.rows[0].role_ident;
  const pwdLit = quoted.rows[0].pwd_lit;

  await db.query('BEGIN');
  try {
    const exists =
      (await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount > 0;
    if (exists) {
      // ALTER, not DROP+CREATE: the role owns grants and may hold live
      // connections; rotating the password and re-asserting attributes in place
      // is both idempotent and non-disruptive.
      const connectingIsSuperuser = (
        await db.query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user')
      ).rows[0]?.rolsuper === true;
      const attrs = connectingIsSuperuser ? ROLE_ATTRIBUTES : ROLE_ATTRIBUTES_NON_SUPERUSER;
      await db.query(`ALTER ROLE ${roleIdent} WITH ${attrs} PASSWORD ${pwdLit}`);
      await assertRuntimeRoleAttributes(db, role);
      log(`  ✓ role ${role} aligned (LOGIN · NOSUPERUSER · NOBYPASSRLS · password set)`);
    } else {
      await db.query(`CREATE ROLE ${roleIdent} WITH ${ROLE_ATTRIBUTES} PASSWORD ${pwdLit}`);
      await assertRuntimeRoleAttributes(db, role);
      log(`  ✓ role ${role} created (LOGIN · NOSUPERUSER · NOBYPASSRLS)`);
    }

    const schemas = await grantRuntimeRolePrivileges(db, roleIdent, { log });

    await db.query('COMMIT');
    return { skipped: false, role, schemas };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/**
 * Re-apply the grant recipe to a runtime role that already exists. This is the
 * path for every estate whose runtime role this script did not mint: the role
 * is identified (resolveRuntimeRole), it must exist — a role that does not is
 * a fail-closed error, because the request-serving pool could not connect as
 * it either — and the recipe runs as-is. No password, no ALTER ROLE.
 *
 * @param {{query: Function}} db  owner/admin connection
 * @param {{role: string, log?: (msg: string) => void}} opts
 * @returns {Promise<{skipped: false, role: string, schemas: string[], attrs: object}>}
 */
export async function refreshRuntimeRoleGrants(db, { role, log = () => {} }) {
  assertRoleName(role, 'runtime role');
  const attrsRes = await db.query(
    'SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1',
    [role],
  );
  if (attrsRes.rowCount === 0) {
    throw new Error(
      `runtime role ${role} does not exist on this server — nothing to grant to, and the ` +
        'request-serving pool would fail to connect as it. Mint it by setting ' +
        'APP_SERVICE_DB_PASSWORD (scripts/db/provision-app-role.mjs), or correct ' +
        'RUNTIME_DB_ROLE / APP_DATABASE_URL / DATABASE_URL.',
    );
  }
  const attrs = attrsRes.rows[0];
  if (attrs.rolsuper || attrs.rolbypassrls) {
    log(
      `  ⚠ runtime role ${role} is ${attrs.rolsuper ? 'a superuser' : 'BYPASSRLS'} — grants are moot ` +
        'and every tenant_isolation_policy is inert on it; the readiness contract refuses it.',
    );
  }
  const roleIdent = (await db.query('SELECT quote_ident($1) AS role_ident', [role])).rows[0].role_ident;

  await db.query('BEGIN');
  try {
    log(`  • refreshing grants for existing runtime role ${role} (not minted here; no password needed)`);
    const schemas = await grantRuntimeRolePrivileges(db, roleIdent, { log });
    await db.query('COMMIT');
    return { skipped: false, role, schemas, attrs };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

/**
 * The installers' entry point. Decides, on this owner connection, which path
 * the runtime role takes:
 *
 *   APP_SERVICE_DB_PASSWORD set        → provisionAppServiceRole  (mode 'minted')
 *   a distinct runtime role identified → refreshRuntimeRoleGrants (mode 'refreshed')
 *   neither                            → nothing                  (mode 'single-role')
 *
 * @param {{query: Function}} db  owner/admin connection
 * @param {{env?: object, log?: (msg: string) => void}} [opts]
 * @returns {Promise<{skipped: boolean, mode: 'minted'|'refreshed'|'single-role', role: string|null, owner: string, source?: string, schemas?: string[]}>}
 */
export async function ensureRuntimeRole(db, { env = process.env, log = () => {} } = {}) {
  const owner = (await db.query('SELECT current_user AS role')).rows[0].role;
  const identified = resolveRuntimeRole(env, { ownerRole: owner });

  if (env.APP_SERVICE_DB_PASSWORD) {
    const minted = await provisionAppServiceRole(db, { env, log });
    return { ...minted, mode: 'minted', owner, source: 'APP_SERVICE_DB_PASSWORD' };
  }
  if (!identified) {
    log(
      `  • single-role posture: no runtime role distinct from the owner (${owner}) is identifiable ` +
        '(RUNTIME_DB_ROLE / APP_SERVICE_DB_PASSWORD / APP_DATABASE_URL / DATABASE_URL). Nothing to grant.',
    );
    return { skipped: true, mode: 'single-role', role: null, owner };
  }
  log(`  • runtime role ${identified.role} identified from ${identified.source} (owner is ${owner})`);
  const refreshed = await refreshRuntimeRoleGrants(db, { role: identified.role, log });
  return { ...refreshed, mode: 'refreshed', owner, source: identified.source };
}

/**
 * Audit what `role` can actually do against the recipe, relation by relation.
 *
 * For every table, partitioned table, view, materialized view and foreign
 * table in every application schema:
 *   - `denied`  — the role lacks USAGE on the schema or a privilege the recipe
 *                 requires there (full DML, or the schema's override);
 *   - `excess`  — on a relation in an override schema that the role does NOT
 *                 own, it holds a privilege beyond the override (UPDATE/DELETE
 *                 on an audit table). The recipe never grants those; a PUBLIC
 *                 grant or a hand GRANT did.
 *   - `ownedAppendOnly` — the role owns an APPEND_ONLY_TABLES relation, which
 *                 confers every privilege regardless of grants.
 * Relations in an override schema that the role owns (a single-role history:
 * `c2c` owns most of `audit` locally) are counted in `ownedInOverrideSchemas`
 * and not reported as excess — ownership is not a grant this recipe made or
 * can take away.
 *
 * Runs on any connection: pg_class and the privilege functions are readable by
 * every role, so the app connection can audit itself and the owner can audit
 * the app role.
 *
 * @param {{query: Function}} db
 * @param {string} role
 */
export async function auditRuntimeRoleGrants(db, role) {
  assertRoleName(role, 'runtime role');
  const attrsRes = await db.query(
    'SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname = $1',
    [role],
  );
  const empty = { role, exists: false, attrs: null, relations: 0, denied: [], excess: [], ownedAppendOnly: [], ownedInOverrideSchemas: 0, schemasWithoutUsage: [] };
  if (attrsRes.rowCount === 0) return empty;

  // OID forms of the privilege functions: they never throw on a schema the
  // role lacks USAGE on (the text form can), and need no quoting.
  const rows = (
    await db.query(
      `SELECT n.nspname AS schema, c.relname AS name, c.relkind,
              pg_get_userbyid(c.relowner) = $1 AS owned,
              has_schema_privilege($1, n.oid, 'USAGE') AS schema_usage,
              has_table_privilege($1, c.oid, 'SELECT') AS can_select,
              has_table_privilege($1, c.oid, 'INSERT') AS can_insert,
              has_table_privilege($1, c.oid, 'UPDATE') AS can_update,
              has_table_privilege($1, c.oid, 'DELETE') AS can_delete
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
          AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname !~ '^pg_'
        ORDER BY 1, 2`,
      [role],
    )
  ).rows;

  const denied = [];
  const excess = [];
  const ownedAppendOnly = [];
  const schemasWithoutUsage = new Set();
  let ownedInOverrideSchemas = 0;
  const appendOnly = new Set(APPEND_ONLY_TABLES.map((t) => `${t.schema}.${t.name}`));

  for (const r of rows) {
    const relation = `${r.schema}.${r.name}`;
    const override = SCHEMA_PRIVILEGE_OVERRIDES[r.schema];
    const required = override || DEFAULT_TABLE_PRIVILEGES;
    const held = DEFAULT_TABLE_PRIVILEGES.filter((p) => r[`can_${p.toLowerCase()}`]);
    if (!r.schema_usage) schemasWithoutUsage.add(r.schema);
    const missing = [...(r.schema_usage ? [] : ['USAGE']), ...required.filter((p) => !held.includes(p))];
    if (missing.length) denied.push({ relation, missing });
    if (override) {
      if (r.owned) {
        if (appendOnly.has(relation)) ownedAppendOnly.push(relation);
        else ownedInOverrideSchemas += 1;
      } else {
        const beyond = held.filter((p) => !override.includes(p));
        if (beyond.length) excess.push({ relation, held: beyond });
      }
    }
  }

  return {
    role,
    exists: true,
    attrs: attrsRes.rows[0],
    relations: rows.length,
    denied,
    excess,
    ownedAppendOnly,
    ownedInOverrideSchemas,
    schemasWithoutUsage: [...schemasWithoutUsage],
  };
}
