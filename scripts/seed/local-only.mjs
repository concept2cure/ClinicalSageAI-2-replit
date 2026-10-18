/**
 * Seed scripts that write invented demonstration records — programs,
 * regulator meetings, tasks, approvals, uncited statistics — straight into a
 * database run against a database on this machine only.
 *
 * NODE_ENV was their only guard, and most had none: a UAT, staging or
 * customer database reached with NODE_ENV unset passed it, and got data
 * nobody can tell from real records (2026-10-15). CLAUDE.md RULE 1 already
 * says a scripts/seed-* runs on laptops only; this makes it true. There is no
 * override: demonstration data for a real environment goes through the
 * product's own API, titled "[Demo …]" and purgeable (npm run demo:seed).
 */

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** The host a connection string names; '' for a unix socket or no host. */
export function databaseHost(connectionString) {
  const raw = String(connectionString ?? '').trim();
  try {
    const url = new URL(raw);
    const socket = url.searchParams.get('host');
    if (socket && socket.startsWith('/')) return '';
    return url.hostname;
  } catch {
    // libpq keyword form: "host=... dbname=..."
    const m = /(?:^|\s)host=(\S+)/.exec(raw);
    if (!m) return '';
    return m[1].startsWith('/') ? '' : m[1];
  }
}

/** True for a database on this machine: loopback, or a unix socket. */
export function isLocalDatabase(connectionString) {
  const host = databaseHost(connectionString);
  return host === '' || LOOPBACK.has(host.toLowerCase());
}

/**
 * Exit unless the database is on this machine and this is not a production
 * process (a production Postgres can listen on localhost).
 */
export function assertLocalDatabase(connectionString, script) {
  const reason = process.env.NODE_ENV === 'production'
    ? 'NODE_ENV is production'
    : isLocalDatabase(connectionString) ? null : `"${databaseHost(connectionString)}" is not on this machine`;
  if (reason === null) return;
  console.error(
    `${script} writes invented demonstration data into a database on this machine only, and ${reason}. ` +
      'For a demonstration in a real environment use npm run demo:seed, which creates labelled, ' +
      'purgeable records through the API.',
  );
  process.exit(1);
}
