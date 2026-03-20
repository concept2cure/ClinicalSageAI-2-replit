export const requiresSsl = (connectionString?: string): boolean => {
  if (!connectionString) {
    return false;
  }

  const normalized = connectionString.toLowerCase();

  // Explicitly disabled SSL takes priority
  if (normalized.includes('sslmode=disable')) {
    return false;
  }

  return (
    normalized.includes('neon.tech') ||
    normalized.includes('neondb') ||
    normalized.includes('sslmode=require') ||
    normalized.includes('sslmode=verify')
  );
};

export const shouldUseSsl = (
  connectionString?: string,
  nodeEnv: string | undefined = process.env.NODE_ENV
): boolean => {
  if (nodeEnv === 'production') {
    return true;
  }

  return requiresSsl(connectionString);
};

export const getSslConfig = (
  connectionString?: string,
  nodeEnv?: string
): { rejectUnauthorized: boolean } | false => {
  if (!shouldUseSsl(connectionString, nodeEnv)) {
    return false;
  }
  // In production, verify SSL certificates to prevent MITM attacks.
  // In development, allow self-signed certs for local Postgres/tunnels.
  const isProduction = (nodeEnv || process.env.NODE_ENV) === 'production';
  return { rejectUnauthorized: isProduction };
};
