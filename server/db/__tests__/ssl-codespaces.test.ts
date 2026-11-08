import { describe, expect, it } from 'vitest';
import {
  requiresSsl, shouldUseSsl, getSslConfig, verifiedPgConnectionString,
} from '../ssl';

const neon = 'postgresql://app_service:example@ep-example-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&application_name=c2c';

describe('Codespaces/Neon PostgreSQL TLS', () => {
  it('always authenticates the remote server certificate, even in development', () => {
    expect(shouldUseSsl(neon, 'development')).toBe(true);
    expect(getSslConfig(neon, 'development')).toEqual({ rejectUnauthorized: true });
    expect(getSslConfig(neon, 'production')).toEqual({ rejectUnauthorized: true });
  });

  it('pins the connection-string SSL parser to verify-full and retains other parameters', () => {
    const url = new URL(verifiedPgConnectionString(neon));
    expect(url.searchParams.get('sslmode')).toBe('verify-full');
    expect(url.searchParams.get('application_name')).toBe('c2c');
    expect(url.username).toBe('app_service');
    expect(url.hostname).toBe('ep-example-pooler.us-east-1.aws.neon.tech');
  });

  it('refuses remote plaintext / unverified modes even outside production', () => {
    for (const mode of ['disable', 'prefer', 'no-verify', 'allow']) {
      const url = neon.replace('sslmode=require', 'sslmode=' + mode);
      expect(() => verifiedPgConnectionString(url)).toThrow(/verified TLS/);
    }
    expect(() => requiresSsl(neon.replace('sslmode=require', 'sslmode=disable')))
      .toThrow(/TLS is required/);
  });

  it('keeps local PostgreSQL and explicitly configured local TLS distinct from Neon', () => {
    const local = 'postgresql://app_service:example@127.0.0.1:5432/local?sslmode=disable';
    expect(shouldUseSsl(local, 'development')).toBe(false);
    expect(getSslConfig(local, 'development')).toBe(false);
    expect(verifiedPgConnectionString(local)).toBe(local);
    const localTls = local.replace('sslmode=disable', 'sslmode=require');
    expect(getSslConfig(localTls, 'development')).toEqual({ rejectUnauthorized: false });
    expect(verifiedPgConnectionString(localTls)).toBe(localTls);
  });

  it('does not modify an already fully-verified remote DSN', () => {
    const full = neon.replace('sslmode=require', 'sslmode=verify-full');
    expect(verifiedPgConnectionString(full)).toBe(full);
  });
});
