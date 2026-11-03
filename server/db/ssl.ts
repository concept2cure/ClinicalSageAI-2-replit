/**
 * SSL posture for runtime PostgreSQL (Neon and other remote databases).
 *
 * An earlier development-only exception set rejectUnauthorized=false for ANY
 * TLS connection, including a real Neon endpoint. That made the login
 * encrypted but not authenticated against the intended server. Codespaces
 * connects to managed Neon as a real remote client even with NODE_ENV=development.
 *
 * Local self-signed PostgreSQL is permitted ONLY for loopback development.
 * A managed/remote address never disables certificate verification.
 */

function databaseHost(connectionString?: string): string | null {
  if (!connectionString) return null;
  try {
    return new URL(connectionString).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isLoopbackHost(host: string | null): boolean {
  return host === 'localhost' || host === '127.0.0.1' ||
    host === '::1' || host === '[::1]';
}

export const requiresSsl = (connectionString?: string): boolean => {
  if (!connectionString) return false;
  const normalized = connectionString.toLowerCase();
  const host = databaseHost(connectionString);
  const remote = host !== null && !isLoopbackHost(host);

  // Remote PostgreSQL must not use plaintext or intentionally unauthenticated
  // SSL modes. Reject these even when a caller bypasses the Codespaces doctor.
  const mode = databaseHost(connectionString) ? new URL(connectionString).searchParams.get('sslmode') : null;
  if (['disable', 'prefer', 'allow', 'no-verify'].includes(mode ?? '')) {
    if (remote) throw new Error('Verified TLS is required for remote PostgreSQL; insecure sslmode is refused.');
    if (mode === 'disable') return false;
  }

  return remote || normalized.includes('sslmode=require') ||
    normalized.includes('sslmode=verify');
};

export const shouldUseSsl = (
  connectionString?: string,
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean => {
  const neededByUrl = requiresSsl(connectionString); // also refuses insecure remote modes
  if (nodeEnv === 'production') return true;
  return neededByUrl;
};

export const getSslConfig = (
  connectionString?: string,
  nodeEnv?: string
): { rejectUnauthorized: boolean } | false => {
  const isProduction = (nodeEnv ?? process.env.NODE_ENV) === 'production';
  // Even production must not silently downgrade a remote connection.
  const sslRequired = requiresSsl(connectionString);
  if (!sslRequired && !isProduction) return false;
  // A local explicit TLS tunnel may use a self-signed certificate in dev.
  // All REMOTE endpoints, including Neon in Codespaces, verify their cert.
  return { rejectUnauthorized: isProduction || !isLoopbackHost(databaseHost(connectionString)) };
};

/**
 * node-postgres replaces the explicit `ssl` object when the DSN includes
 * `sslmode`. A Neon copy-button URL normally contains `sslmode=require`:
 * make the connection-string parser request hostname/CA verification itself,
 * including if its semantics change between pg versions. Never silently
 * downgrade remote TLS. Preserve non-SSL query options and credentials.
 */
export function verifiedPgConnectionString(connectionString: string): string {
  let uri: URL;
  try {
    uri = new URL(connectionString);
  } catch {
    return connectionString; // connection creation will reject an invalid URI
  }
  if (!['postgres:', 'postgresql:'].includes(uri.protocol) ||
      isLoopbackHost(uri.hostname.toLowerCase())) return connectionString;
  const mode = uri.searchParams.get('sslmode');
  if (mode === 'disable' || mode === 'no-verify' || mode === 'prefer' || mode === 'allow') {
    throw new Error('Remote PostgreSQL requires verified TLS; insecure sslmode is refused.');
  }
  if (mode === 'require' || mode === 'verify-ca') {
    uri.searchParams.set('sslmode', 'verify-full');
    return uri.toString();
  }
  return connectionString;
}
