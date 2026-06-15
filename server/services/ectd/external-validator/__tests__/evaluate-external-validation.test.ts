/**
 * Tests for the external-validation fail-closed gate.
 * Pure functions — no DB, no network. Mirrors pdfa-readiness.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  assessExternalValidationReadiness,
  externalValidationRequiredFromEnv,
} from '../evaluate-external-validation';
import type { ExternalValidationReport } from '../types';

const report = (over: Partial<ExternalValidationReport> = {}): ExternalValidationReport => ({
  validatorName: 'internal-criteria',
  validatorVersion: '1.0.0',
  findings: [],
  errorCount: 0,
  warningCount: 0,
  ranAt: '2026-06-15T00:00:00.000Z',
  ...over,
});

describe('assessExternalValidationReadiness', () => {
  it('blocks production when required AND the report is MISSING', () => {
    const r = assessExternalValidationReadiness({
      report: null,
      requireExternalValidation: true,
      environment: 'production',
    });
    expect(r.cleared).toBe(false);
    expect(r.reportPresent).toBe(false);
    expect(r.blockers[0]).toMatch(/no validation report is available/);
  });

  it('blocks production when required AND the report has errorCount > 0', () => {
    const r = assessExternalValidationReadiness({
      report: report({ errorCount: 2 }),
      requireExternalValidation: true,
      environment: 'production',
    });
    expect(r.cleared).toBe(false);
    expect(r.errorCount).toBe(2);
    expect(r.blockers[0]).toMatch(/2 error-severity finding/);
  });

  it('does NOT block when external validation is not required (default-off)', () => {
    const r = assessExternalValidationReadiness({
      report: null,
      requireExternalValidation: false,
      environment: 'production',
    });
    expect(r.cleared).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('does NOT block staging even when required and the report is missing', () => {
    const r = assessExternalValidationReadiness({
      report: null,
      requireExternalValidation: true,
      environment: 'staging',
    });
    expect(r.cleared).toBe(true);
  });

  it('PASSES production when required and the report has warnings only (no errors)', () => {
    const r = assessExternalValidationReadiness({
      report: report({ warningCount: 3, errorCount: 0 }),
      requireExternalValidation: true,
      environment: 'production',
    });
    expect(r.cleared).toBe(true);
    expect(r.warningCount).toBe(3);
    expect(r.errorCount).toBe(0);
  });

  it('PASSES production when required and the report is clean', () => {
    const r = assessExternalValidationReadiness({
      report: report(),
      requireExternalValidation: true,
      environment: 'production',
    });
    expect(r.cleared).toBe(true);
    expect(r.reportPresent).toBe(true);
  });
});

describe('externalValidationRequiredFromEnv', () => {
  it('is true only for the literal "true" (case-insensitive)', () => {
    expect(externalValidationRequiredFromEnv({ ECTD_REQUIRE_EVALIDATOR: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(externalValidationRequiredFromEnv({ ECTD_REQUIRE_EVALIDATOR: 'TRUE' } as NodeJS.ProcessEnv)).toBe(true);
    expect(externalValidationRequiredFromEnv({ ECTD_REQUIRE_EVALIDATOR: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(externalValidationRequiredFromEnv({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
