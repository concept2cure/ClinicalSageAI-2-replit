/**
 * Regression — UnifiedCERService (EU MDR CER) fails closed rather than
 * fabricating a result. Locks the fix that replaced an unconditional
 * validateReport() => { valid: true } (which falsely certified any
 * unvalidated clinical evaluation report as conformant) with an honest,
 * fail-closed result. No real validation engine exists yet, so the service
 * must never report success.
 */

import { describe, it, expect } from 'vitest';
import UnifiedCERService from '../index';

describe('UnifiedCERService — fails closed instead of fabricating', () => {
  const svc = new UnifiedCERService({ organizationId: 'org1', deviceName: 'Acme Infusion Pump' });

  it('validateReport never certifies an unvalidated report as valid', async () => {
    const result = await svc.validateReport('report-123');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.join(' ')).toMatch(/not implemented|not wired|cannot be certified/i);
  });

  it('validateReport is deterministic across calls (no fabricated variability)', async () => {
    const a = await svc.validateReport('r1');
    const b = await svc.validateReport('r2');
    expect(a).toEqual(b);
  });

  it('generateReport fails closed rather than returning a partial/fabricated report', async () => {
    const result = await svc.generateReport();
    expect(result.status).toBe('failed');
    expect(result.sections).toEqual([]);
    expect(result.warnings?.join(' ')).toMatch(/not wired/i);
  });
});
