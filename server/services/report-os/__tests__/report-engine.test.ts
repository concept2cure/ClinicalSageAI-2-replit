/**
 * A report type runs only when an engine computes its content (QA 2026-10-08,
 * j8: every typed report came back as the readiness digest under its title).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}) }));

import {
  DOMAIN_REPORT_TYPE_IDS,
  reportEngineFor,
  reportAvailability,
  reportTypeApplies,
  reportTypeNotApplicableMessage,
} from '../report-engine';
import { REGIONAL_REPORT_TYPE_IDS } from '../regional/filing-types';
import { DOMAIN_REPORT_TYPE_IDS as PROVIDER_IDS } from '../research-compliance-report-providers';

describe('reportEngineFor', () => {
  it('intersects declared scopes with engine scope and discloses organization counts', () => {
    expect(reportAvailability('readiness.executive_digest', 'account', ['account'])).toMatchObject({ engine: 'readiness', runnable: false, computedScope: 'project' });
    expect(reportAvailability('irb.submission_register', 'account', ['account'])).toMatchObject({ runnable: true, computedScope: 'organization' });
    expect(reportAvailability('grants.portfolio_register', 'project', ['project', 'account'])).toMatchObject({ runnable: true, computedScope: 'project' });
    expect(reportAvailability('irb.submission_register', 'project', ['account'])).toMatchObject({ runnable: false });
  });
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

  it('routes the four market filing assessments to the regional engine, over one program only', () => {
    for (const id of REGIONAL_REPORT_TYPE_IDS) {
      expect(reportEngineFor(id, 'project'), id).toBe('regional');
      // A market's readiness is one program's; a program group is a group of
      // markets, and a submission scope is not ownership-checked before the
      // engine runs (regional/filing-readiness.ts).
      expect(reportEngineFor(id, 'program'), id).toBeNull();
      expect(reportEngineFor(id, 'submission'), id).toBeNull();
    }
  });

  it.each([
    'ema.rmp_psur_signal_alignment',
    'compliance.audit_assurance_pack',
    'china_nmpa.ctd_module_gap_analysis',
    'usa_fda.estar_510k_equivalence_matrix',
    // A device filing has no Module 1 at all — it is not eCTD — so no market
    // assessment is offered for one, however the market is otherwise supported.
    'usa_fda.pma_submission_readiness',
    'usa_fda.de_novo_classification_pack',
    // A market whose Module 1 the record does not model (CA, UK, CH, AU, CN,
    // KR, BR, IN, SG): widening the engine means adding that regulator's tree
    // to shared/regulatory/regional-module1.ts, not a case in the engine.
    'canada_hc.nds_snds_readiness',
    'uk_mhra.maa_readiness',
    'china_nmpa.registration_dossier_readiness',
    'korea_mfds.drug_registration_readiness',
  ])('has no engine for %s, so it is not run', (typeId) => {
    expect(reportEngineFor(typeId, 'project')).toBeNull();
  });
});

describe('reportTypeApplies', () => {
  const device = { allowedClientSegments: ['device'] };
  it('refuses a device-only type for a biologic program', () => {
    expect(reportTypeApplies(device, ['biotech'])).toBe(false);
    expect(reportTypeNotApplicableMessage('FDA eSTAR / 510(k) Equivalence Matrix', ['device'], ['biotech'])).toMatch(
      /applies to device projects; this project is recorded as biotech/,
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
