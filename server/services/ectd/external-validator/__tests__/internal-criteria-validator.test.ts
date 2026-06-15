/**
 * Tests for the offline internal-criteria external-validator adapter.
 *
 * Proves it PROJECTS the platform's existing deterministic eCTD checks
 * (computeDispatchReadiness) into the vendor-neutral ExternalValidationReport
 * shape. Pure — no DB, no network.
 */

import { describe, it, expect } from 'vitest';
import {
  runInternalCriteriaValidation,
  internalCriteriaValidator,
  INTERNAL_VALIDATOR_NAME,
  INTERNAL_VALIDATOR_VERSION,
} from '../internal-criteria-validator';
import type { ReadinessLeaf } from '../../dispatch-readiness';

const leaf = (over: Partial<ReadinessLeaf> = {}): ReadinessLeaf => ({
  sectionCode: 'm1.2',
  title: 'Cover letter',
  lifecycleOp: 'new',
  documentTable: 'documents',
  documentId: 1,
  ...over,
});

const NOW = new Date('2026-06-15T00:00:00.000Z');

describe('runInternalCriteriaValidation', () => {
  it('projects a clean sequence into an empty, error-free report', () => {
    const report = runInternalCriteriaValidation({ leaves: [leaf()] }, NOW);
    expect(report.validatorName).toBe(INTERNAL_VALIDATOR_NAME);
    expect(report.validatorVersion).toBe(INTERNAL_VALIDATOR_VERSION);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.findings).toEqual([]);
    expect(report.ranAt).toBe('2026-06-15T00:00:00.000Z');
  });

  it('projects structural errors into error-severity findings with ruleId/location', () => {
    const report = runInternalCriteriaValidation(
      { leaves: [leaf({ lifecycleOp: 'new', documentTable: null, documentId: null })] },
      NOW,
    );
    expect(report.errorCount).toBe(1);
    const f = report.findings.find((x) => x.ruleId === 'UNRESOLVED_DOCUMENT');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('error');
    expect(f?.location).toBe('m1.2');
    expect(f?.message).toMatch(/no resolvable document/);
  });

  it('flags an empty sequence as an error (deterministic with the dispatch gate)', () => {
    const report = runInternalCriteriaValidation({ leaves: [] }, NOW);
    expect(report.errorCount).toBe(1);
    expect(report.findings[0].ruleId).toBe('EMPTY_SEQUENCE');
  });

  it('projects warnings without inflating errorCount', () => {
    const report = runInternalCriteriaValidation(
      { leaves: [leaf()], options: { requiredSections: ['m1.3'] } },
      NOW,
    );
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(1);
    expect(report.findings.some((f) => f.severity === 'warning')).toBe(true);
  });
});

describe('InternalCriteriaValidator adapter', () => {
  it('is always configured (no external dependency)', () => {
    expect(internalCriteriaValidator.isConfigured()).toBe(true);
    expect(internalCriteriaValidator.name).toBe(INTERNAL_VALIDATOR_NAME);
  });

  it('validate() reads leaves from input.payload and applies sequenceNumber', async () => {
    const report = await internalCriteriaValidator.validate({
      sequenceNumber: 'XYZ', // invalid 4-digit → structural error
      payload: { leaves: [leaf()] },
    });
    expect(report.findings.some((f) => f.ruleId === 'SEQUENCE_NUMBER_FORMAT')).toBe(true);
    expect(report.errorCount).toBeGreaterThan(0);
  });

  it('validate() defaults to an empty package when no payload is supplied', async () => {
    const report = await internalCriteriaValidator.validate({});
    expect(report.errorCount).toBe(1); // EMPTY_SEQUENCE
  });
});
