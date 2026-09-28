import { describe, expect, it } from 'vitest';
import { describeSignatureMethod } from '../signature-method';

describe('describeSignatureMethod', () => {
  it('states what the ceremony verified', () => {
    expect(describeSignatureMethod('password+mfa')).toBe('Password and authenticator code, re-verified at signing');
    expect(describeSignatureMethod('password+totp')).toBe('Password and authenticator code, re-verified at signing');
    expect(describeSignatureMethod('password')).toBe('Password, re-verified at signing');
  });

  it('keeps a retired PIN signature as it was taken, claiming verification only where it was recorded', () => {
    expect(describeSignatureMethod('PIN', true)).toBe('Signing PIN, verified at signing');
    expect(describeSignatureMethod('PIN', false)).toBe('Signing PIN');
    expect(describeSignatureMethod('pin')).toBe('Signing PIN');
  });

  it('says so when nothing was recorded, and never invents a factor', () => {
    expect(describeSignatureMethod(null)).toBe('Not recorded');
    expect(describeSignatureMethod('')).toBe('Not recorded');
    expect(describeSignatureMethod('not recorded')).toBe('not recorded');
    expect(describeSignatureMethod('sso')).toBe('sso');
  });
});
