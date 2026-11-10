/**
 * Shared connection resolution for the db provisioning scripts.
 *
 * Both the URL precedence and the TLS decision were previously copy-pasted per
 * script, which is how they drifted: one applier verified the server
 * certificate, another disabled verification outright. TLS posture on the
 * connection that carries schema DDL is not a per-script detail, so it lives
 * here once.
 */

/** Env var names checked, in order, by the from-scratch installer. */
export const INSTALL_URL_VARS = [
  'DATABASE_URL',
  'DATABASE_URL_ADMIN',
  'NEON_DATABASE_URL',
  'NEON_DATABASE_URL_ADMIN',
];

/**
 * Env var names checked, in order, by the incremental appliers.
 *
 * DATABASE_OWNER_URL leads (2026-09-21): it is the owner/admin connection
 * scripts/db/provision.mjs documents for provisioning and for the deploy-time
 * migrate job. When it is set, DATABASE_URL is the RUNTIME's connection, and
 * deploy-migrate identifies the runtime role from it to refresh grants
 * (provision-app-role.mjs → resolveRuntimeRole). Migrating as the runtime role
 * while DATABASE_OWNER_URL names the owner would make the runtime the owner of
 * every new table — the single-role posture the split exists to end.
 */
export const APPLY_URL_VARS = [
  'DATABASE_OWNER_URL',
  'DATABASE_URL',
  'DATABASE_NEON_NEW_SECRET',
  'NEON_DATABASE_URL',
];

/**
 * First non-empty URL among `names`, with a leading `psql '…'` wrapper stripped
 * (operators routinely paste the whole copy-button command out of a console).
 *
 * @throws if none of the names is set.
 */
export function resolveDatabaseUrl(names = INSTALL_URL_VARS) {
  for (const name of names) {
    const v = process.env[name];
    if (v) return v.replace(/^psql\s+'?/i, '').replace(/'?\s*$/, '');
  }
  throw new Error(`No database URL found in environment (looked for: ${names.join(', ')})`);
}

/**
 * TLS settings for `url`.
 *
 * Local/socket Postgres uses no TLS. Everything else — a managed database
 * reached over a network — VERIFIES the server certificate. Provisioning
 * connections carry schema DDL and admin credentials, so `rejectUnauthorized:
 * false` on them would hand a MITM the whole schema.
 *
 * If a managed provider presents a certificate chained to a CA that is not in
 * Node's default trust store (AWS RDS is the common case — it uses the Amazon
 * RDS CA bundle), supply it via the standard `NODE_EXTRA_CA_CERTS=/path/to/
 * rds-ca-bundle.pem` rather than turning verification off.
 */
export function sslFor(url) {
  const value = String(url);
  let uri;
  try { uri = new URL(value); } catch { throw new Error('Invalid PostgreSQL URL for TLS verification'); }
  if (!['postgres:', 'postgresql:'].includes(uri.protocol)) {
    throw new Error('Invalid PostgreSQL scheme for TLS verification');
  }
  const host = uri.hostname.toLowerCase();
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  const mode = uri.searchParams.get('sslmode');
  if (!local && ['disable', 'prefer', 'allow', 'no-verify'].includes(mode)) {
    throw new Error('Verified TLS required for a remote PostgreSQL connection');
  }
  if (local && (mode === 'disable' || mode === null)) return false;
  return { rejectUnauthorized: !local };
}

/**
 * For a read-only runtime connection (e.g. Codespaces diagnosis), ensure
 * node-postgres's URI parser requests full hostname and CA verification.
 * Its connectionString sslmode overrides a separately passed SSL object.
 * Do not apply this helper to local disposable development databases.
 */
export function verifiedPgConnectionString(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return url; }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return url;
  const host = parsed.hostname.toLowerCase();
  if (['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) return url;
  const mode = parsed.searchParams.get('sslmode');
  if (['disable', 'no-verify', 'prefer', 'allow'].includes(mode)) {
    throw new Error('Remote PostgreSQL requires verified TLS; insecure sslmode is refused.');
  }
  if (mode === 'require' || mode === 'verify-ca') {
    parsed.searchParams.set('sslmode', 'verify-full');
    return parsed.toString();
  }
  return url;
}
