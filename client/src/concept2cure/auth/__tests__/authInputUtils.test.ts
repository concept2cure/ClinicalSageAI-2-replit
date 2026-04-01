import { getMfaMethodLabel, normalizeEmail } from '../authInputUtils';

describe('authInputUtils', () => {
  it('normalizes email by trimming and lowercasing', () => {
    expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
  });

  it('returns human-friendly mfa labels', () => {
    expect(getMfaMethodLabel('totp')).toBe('Authenticator app');
    expect(getMfaMethodLabel('backup_code')).toBe('Recovery code');
  });
});
