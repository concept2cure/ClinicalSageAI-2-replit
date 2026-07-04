import { describe, it, expect } from 'vitest';
import {
  reportTypeToFeatureKey,
  decideReportEntitlement,
} from '../entitlement-map';
import { REPORT_TYPE_SEED } from '../taxonomy';

describe('reportTypeToFeatureKey', () => {
  it('maps prediction forecast types to prediction_forecast_report', () => {
    expect(reportTypeToFeatureKey('prediction.regulatory_forecast', 'prediction')).toBe('prediction_forecast_report');
    expect(reportTypeToFeatureKey('readiness.forecast_trajectory', 'readiness')).toBe('prediction_forecast_report');
  });

  it('maps CRL/RTF pre-mortem types to crl_rtf_premortem', () => {
    expect(reportTypeToFeatureKey('prediction.crl_rtf_premortem', 'prediction')).toBe('crl_rtf_premortem');
    expect(reportTypeToFeatureKey('usa_fda.rtf_premortem', 'usa_fda_premortem')).toBe('crl_rtf_premortem');
  });

  it('maps portfolio/board-pack types to portfolio_rollup', () => {
    expect(reportTypeToFeatureKey('portfolio.board_pack', 'portfolio')).toBe('portfolio_rollup');
    expect(reportTypeToFeatureKey('account.rollup_summary', 'account')).toBe('portfolio_rollup');
  });

  it('defaults every governed report family to report_families', () => {
    expect(reportTypeToFeatureKey('readiness.executive_digest', 'readiness')).toBe('report_families');
    expect(reportTypeToFeatureKey('usa_fda.estar_510k_equivalence_matrix', 'usa_fda_510k')).toBe('report_families');
    expect(reportTypeToFeatureKey('compliance.audit_assurance_pack', 'compliance_audit')).toBe('report_families');
  });

  it('assigns a feature key to every seeded report type (no orphans)', () => {
    for (const t of REPORT_TYPE_SEED) {
      const key = reportTypeToFeatureKey(t.typeId, t.family);
      expect([
        'report_families', 'prediction_forecast_report', 'crl_rtf_premortem', 'portfolio_rollup',
      ]).toContain(key);
    }
  });
});

describe('decideReportEntitlement (tier gating)', () => {
  it('free tier is locked out of every paid report family', () => {
    const d = decideReportEntitlement('readiness.executive_digest', 'readiness', 'free');
    expect(d.entitled).toBe(false);
    expect(d.feature).toBe('report_families');
    expect(d.requiredTier).toBe('standard');
  });

  it('standard unlocks report_families but not prediction/portfolio', () => {
    expect(decideReportEntitlement('readiness.executive_digest', 'readiness', 'standard').entitled).toBe(true);
    expect(decideReportEntitlement('prediction.regulatory_forecast', 'prediction', 'standard').entitled).toBe(false);
    expect(decideReportEntitlement('portfolio.board_pack', 'portfolio', 'standard').entitled).toBe(false);
  });

  it('professional unlocks prediction + premortem but not enterprise portfolio', () => {
    expect(decideReportEntitlement('prediction.regulatory_forecast', 'prediction', 'professional').entitled).toBe(true);
    expect(decideReportEntitlement('prediction.crl_rtf_premortem', 'prediction', 'professional').entitled).toBe(true);
    expect(decideReportEntitlement('portfolio.board_pack', 'portfolio', 'professional').entitled).toBe(false);
  });

  it('enterprise unlocks everything, including portfolio_rollup', () => {
    expect(decideReportEntitlement('portfolio.board_pack', 'portfolio', 'enterprise').entitled).toBe(true);
    expect(decideReportEntitlement('prediction.regulatory_forecast', 'prediction', 'enterprise').entitled).toBe(true);
    expect(decideReportEntitlement('readiness.executive_digest', 'readiness', 'enterprise').entitled).toBe(true);
  });
});
