/**
 * Production refuses to boot with a Moonshot (Kimi) key — ADR-0014 §1.3, P1-45.
 *
 * Moonshot is not a production lane for any tenant under any election (GDPR
 * Chapter V, APPI Art. 28, 28 CFR Part 202, supplier qualification). Until
 * P1-45 a production process started with KIMI_API_KEY or MOONSHOT_API_KEY set
 * and the gateway enabled the lane: nothing but the absence of the key in
 * Terraform kept tenant content off it. The gate fires at config load from
 * server/config/environment.ts, beside the other AI-governance boot gates, and
 * has no acceptance flag. Outside production it is a no-op: the lane remains
 * for development.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { assertAiProviderElectionPostureForProduction } from '../ai-governance-posture';

describe('assertAiProviderElectionPostureForProduction', () => {
  it.each(['MOONSHOT_API_KEY', 'KIMI_API_KEY'])('refuses %s in production, naming it and ADR-0014 §1', variable => {
    expect(() =>
      assertAiProviderElectionPostureForProduction({ NODE_ENV: 'production', [variable]: 'sk-probe' }),
    ).toThrow(new RegExp(`REFUSING TO BOOT: .*${variable}.*ADR-0014 §1`));
  });

  it('names both variables when both are set', () => {
    expect(() =>
      assertAiProviderElectionPostureForProduction({
        NODE_ENV: 'production',
        KIMI_API_KEY: 'sk-a',
        MOONSHOT_API_KEY: 'sk-b',
      }),
    ).toThrow(/KIMI_API_KEY.*MOONSHOT_API_KEY/);
  });

  it('has no acceptance: no other variable makes it boot', () => {
    expect(() =>
      assertAiProviderElectionPostureForProduction({
        NODE_ENV: 'production',
        MOONSHOT_API_KEY: 'sk-probe',
        AI_GOVERNANCE_ACCEPT_PERMISSIVE: 'true',
      }),
    ).toThrow(/MOONSHOT_API_KEY/);
  });

  it('boots in production when neither is set (or set empty)', () => {
    expect(() => assertAiProviderElectionPostureForProduction({ NODE_ENV: 'production' })).not.toThrow();
    expect(() =>
      assertAiProviderElectionPostureForProduction({ NODE_ENV: 'production', MOONSHOT_API_KEY: '' }),
    ).not.toThrow();
  });

  it('is a no-op outside production: Moonshot remains a development lane', () => {
    for (const NODE_ENV of ['development', 'test', 'staging', undefined]) {
      expect(() =>
        assertAiProviderElectionPostureForProduction({ NODE_ENV, MOONSHOT_API_KEY: 'sk', KIMI_API_KEY: 'sk' }),
      ).not.toThrow();
    }
  });
});

describe('the server configuration fires it on import (a real production boot)', () => {
  const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

  /** Import the real server/config/environment.ts in a fresh production process. */
  function loadConfig(extra: Record<string, string>): string {
    const env: Record<string, string> = {
      PATH: process.env.PATH ?? '',
      HOME: process.env.HOME ?? '',
      NODE_ENV: 'production',
      RLS_ENFORCE: 'on',
      DATABASE_URL: 'postgresql://probe@127.0.0.1:1/probe',
      // Every other production posture, satisfied, so the only refusal left to
      // observe is the one under test.
      JWT_SECRET: 'probe-jwt-secret-min-32-chars-long-aaaaaa',
      REFRESH_TOKEN_SECRET: 'probe-refresh-secret-min-32-chars-bbbbbbb',
      MFA_ENCRYPTION_KEY: 'probe-mfa-encryption-key-min-32-chars-ccc',
      AUDIT_HMAC_KEY: 'probe-audit-hmac-key-min-32-chars-ddddddd',
      AUDIT_HMAC_SECRET: 'probe-audit-hmac-secret-min-32-chars-eeeee',
      AUDIT_EXPORT_SIGNING_KEY: 'probe-audit-export-signing-key-min-32-chars',
      AI_SENSITIVE_DATA_POLICY_MODE: 'enforce',
      AI_PROVIDER_PLACEMENT_APPROVALS:
        '{"private-deployment":{"region":"us","zeroRetentionApproved":true,"approvedDataClasses":[],"approvedIntendedUses":[]}}',
      STORAGE_PROVIDER: 's3',
      AWS_S3_BUCKET: 'c2c-vault-probe',
      ...extra,
    };
    return execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '-e',
        "import('./server/config/environment.ts').then(() => console.log('LOADED'), (e) => console.log('REFUSED: ' + e.message))",
      ],
      { cwd: REPO_ROOT, env, encoding: 'utf8' },
    );
  }

  it('refuses to boot production with MOONSHOT_API_KEY set', () => {
    expect(loadConfig({ MOONSHOT_API_KEY: 'sk-probe' })).toMatch(/REFUSED: .*MOONSHOT_API_KEY/);
  }, 60_000);

  it('refuses to boot production with KIMI_API_KEY set', () => {
    expect(loadConfig({ KIMI_API_KEY: 'sk-probe' })).toMatch(/REFUSED: .*KIMI_API_KEY/);
  }, 60_000);

  it('boots production without either key (control)', () => {
    expect(loadConfig({})).toMatch(/LOADED/);
  }, 60_000);
});
