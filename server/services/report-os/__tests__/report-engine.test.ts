/**
 * A report type runs only when an engine computes its content (QA 2026-10-08,
 * j8: every typed report came back as the readiness digest under its title).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}) }));

import {
  DOMAIN_REPORT_TYPE_IDS,
  reportEngineFor,
  reportTypeApplies,
  reportTypeNotApplicableMessage,
} from '../report-engine';
import { DOMAIN_REPORT_TYPE_IDS as PROVIDER_IDS } from '../research-compliance-report-providers';

describe('reportEngineFor', () => {
  it('routes the Executive Readiness Digest to the readiness engine', () => {
    expect(reportEngineFor('readiness.executive_digest', 'project')).toBe('readiness');
  });

  it('routes every research-compliance register to its domain provider', () => {
    for (const id of DOMAIN_REPORT_TYPE_IDS) expect(reportEngineFor(id, 'project'), id).toBe('domain');
    expect(PROVIDER_IDS).toBe(DOMAIN_REPORT_TYPE_IDS);
  });

  it('runs the evidence trace over one document only', () => {
    expect(reportEngineFor('provenance.evidence_trace_report', 'document')).toBe('lineage');
    expect(reportEngineFor('provenance.evidence_trace_report', 'project')).toBeNull();
  });

  it.each([
    'ema.rmp_psur_signal_alignment',
    'compliance.audit_assurance_pack',
    'ema.maa_readiness_assessment',
    'china_nmpa.ctd_module_gap_analysis',
    'usa_fda.estar_510k_equivalence_matrix',
    'usa_fda.pma_submission_readiness',
  ])('has no engine for %s, so it is not run', (typeId) => {
    expect(reportEngineFor(typeId, 'project')).toBeNull();
  });
});

describe('reportTypeApplies', () => {
  const device = { allowedClientSegments: ['device'] };
  it('refuses a device-only type for a biologic program', () => {
    expect(reportTypeApplies(device, ['biotech'])).toBe(false);
    expect(reportTypeNotApplicableMessage('FDA eSTAR / 510(k) Equivalence Matrix', ['device'], ['biotech'])).toMatch(
      /applies to device programs; this program is recorded as biotech/,
    );
  });
  it('allows it for a device program, and a universal type for any', () => {
    expect(reportTypeApplies(device, ['device'])).toBe(true);
    expect(reportTypeApplies({ allowedClientSegments: [] }, ['biotech'])).toBe(true);
  });
  it('does not refuse on an unknown product type', () => {
    expect(reportTypeApplies(device, [])).toBe(true);
  });
});
