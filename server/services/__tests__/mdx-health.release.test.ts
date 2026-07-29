import { describe, expect, it } from 'vitest';
import { deriveMdxReleaseStatus, type MdxQualification } from '../mdx-health.service';

const passingQualification: MdxQualification = {
  status: 'pass', testedAt: '2026-07-29T00:00:00Z', codeCommit: 'abc',
  templateVersion: 'qualified-test-template', testSuiteVersion: '1', stale: false, blockers: [],
};
const pass = { status: 'pass' as const, detail: 'qualified' };

describe('deriveMdxReleaseStatus', () => {
  it('never equates schema presence with release readiness', () => {
    expect(deriveMdxReleaseStatus({
      requiredTablesPresent: true,
      dependencies: { database: pass }, workflows: { programRead: { status: 'not_run', detail: 'not run' } },
      qualification: { ...passingQualification, status: 'not_run' },
    })).toBe('not_ready');
  });

  it.each(['fail', 'unverified', 'not_run'] as const)('fails closed for dependency status %s', (status) => {
    expect(deriveMdxReleaseStatus({
      requiredTablesPresent: true, dependencies: { predicate: { status, detail: status } },
      workflows: { programRead: pass }, qualification: passingQualification,
    })).toBe('not_ready');
  });

  it('fails closed for stale qualification', () => {
    expect(deriveMdxReleaseStatus({
      requiredTablesPresent: true, dependencies: { database: pass }, workflows: { programRead: pass },
      qualification: { ...passingQualification, stale: true },
    })).toBe('not_ready');
  });

  it('caps technical qualification at controlled beta', () => {
    expect(deriveMdxReleaseStatus({
      requiredTablesPresent: true, dependencies: { database: pass }, workflows: { programRead: pass },
      qualification: passingQualification,
    })).toBe('controlled_beta');
  });
});
