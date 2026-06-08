/**
 * Regression — UnifiedCERService (EU MDR CER).
 *
 * generateReport() is now wired to the real cerGenerationService, but it must
 * still FAIL CLOSED on error (e.g. a non-existent device) rather than fabricate
 * or partially fake a report. validateReport() must never certify an
 * unvalidated clinical evaluation report as conformant (no conformance engine
 * exists yet), so it always returns valid: false with a reason.
 */

import { describe, it, expect } from 'vitest';
import UnifiedCERService from '../index';

describe('UnifiedCERService — wired but never fabricates', () => {
  const svc = new UnifiedCERService({
    organizationId: 1,
    deviceId: 999_999_999, // intentionally non-existent
    userId: 1,
    regulatoryFramework: 'MDR_2017_745',
  });

  it('validateReport never certifies an unvalidated report as valid', async () => {
    const result = await svc.validateReport('report-123');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.join(' ')).toMatch(/not implemented|cannot be certified/i);
  });

  it('validateReport is deterministic across calls (no fabricated variability)', async () => {
    const a = await svc.validateReport('r1');
    const b = await svc.validateReport('r2');
    expect(a).toEqual(b);
  });

  it('generateReport fails closed for a non-existent device instead of fabricating success', async () => {
    const result = await svc.generateReport();
    // Underlying generateCER throws (device not found / DB error); the facade
    // must surface a failed result with no fabricated sections — never success.
    expect(result.status).toBe('failed');
    expect(result.sections).toEqual([]);
    expect(result.reportId).toBe('');
    expect(result.warnings?.join(' ')).toMatch(/failed/i);
  });
});
