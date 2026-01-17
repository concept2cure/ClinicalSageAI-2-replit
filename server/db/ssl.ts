type SslConfig = { rejectUnauthorized: false } | false;

export const getSslConfig = (connectionString?: string): SslConfig => {
  if (!connectionString) {
    return false;
  }

  const shouldUseSsl =
    process.env.NODE_ENV === 'production' ||
    connectionString.includes('postgres://') ||
    connectionString.includes('postgresql://') ||
    connectionString.includes('neon.tech') ||
    connectionString.includes('neondb');

  return shouldUseSsl ? { rejectUnauthorized: false } : false;
};
