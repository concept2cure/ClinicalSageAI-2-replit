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

/** Env var names checked, in order, by the incremental appliers. */
export const APPLY_URL_VARS = ['DATABASE_URL', 'DATABASE_NEON_NEW_SECRET', 'NEON_DATABASE_URL'];

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
  const u = String(url).toLowerCase();
  if (u.includes('sslmode=disable') || u.includes('@localhost') || u.includes('@127.0.0.1')) {
    return false;
  }
  return { rejectUnauthorized: true };
}
