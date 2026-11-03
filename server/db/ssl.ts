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

  // Explicitly disabled SSL is allowed ONLY for a local database. Remote
  // configuration with sslmode=disable is a refusal, not a downgrade.
  if (/([?&])sslmode=disable(?:&|$)/.test(normalized)) {
    if (remote) throw new Error('TLS is required for remote PostgreSQL; sslmode=disable is refused.');
    return false;
  }

  return remote || normalized.includes('sslmode=require') ||
    normalized.includes('sslmode=verify');
};

export const shouldUseSsl = (
  connectionString?: string,
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean => {
  if (nodeEnv === 'production') return true;
  return requiresSsl(connectionString);
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
