export const requiresSsl = (connectionString?: string): boolean => {
  if (!connectionString) {
    return false;
  }

  const normalized = connectionString.toLowerCase();

  if (normalized.includes('sslmode=disable') || normalized.includes('ssl=false')) {
    return false;
  }

  return (
    normalized.startsWith('postgres://') ||
    normalized.startsWith('postgresql://') ||
    normalized.includes('neon.tech') ||
    normalized.includes('neondb') ||
    normalized.includes('sslmode=require')
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
): { rejectUnauthorized: false } | false => {
  return shouldUseSsl(connectionString, nodeEnv) ? { rejectUnauthorized: false } : false;
};
