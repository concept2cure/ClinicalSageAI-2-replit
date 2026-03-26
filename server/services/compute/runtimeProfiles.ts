import { getPool } from '../../db';

export interface RuntimeProfile {
  profileKey: string;
  displayName: string;
  networkPolicy: string;
  timeoutSeconds: number;
  enabled: boolean;
  maturity: 'production-path' | 'seeded' | 'provisional' | 'stub';
}

export async function getRuntimeProfile(profileKey: string): Promise<RuntimeProfile> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT profile_key, display_name, network_policy, timeout_seconds, enabled
       FROM artifact_compute_runtime_profiles
      WHERE profile_key = $1
      LIMIT 1`,
    [profileKey]
  );

  if (!rows[0] || rows[0].enabled !== true) {
    throw new Error(`Runtime profile not available: ${profileKey}`);
  }

  return {
    profileKey: rows[0].profile_key,
    displayName: rows[0].display_name,
    networkPolicy: rows[0].network_policy,
    timeoutSeconds: rows[0].timeout_seconds,
    enabled: rows[0].enabled,
    maturity: 'seeded',
  };
}

export function inferRuntimeMaturity(format: string): RuntimeProfile['maturity'] {
  if (format === 'docx') return 'production-path';
  if (['xlsx', 'pptx', 'zip', 'html'].includes(format)) return 'provisional';
  return 'stub';
}
