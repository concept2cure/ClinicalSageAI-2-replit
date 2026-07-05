import { describe, it, expect } from 'vitest';
import { validatePanels } from '../definition-service';
import type { ReportCanvasPanel } from '@shared/schema/report-os';

// typeId → family, mirroring what fetchKnownTypes returns.
const KNOWN = new Map<string, string | null>([
  ['readiness.executive_digest', 'readiness'],       // report_families → standard
  ['portfolio.board_pack', 'portfolio'],             // portfolio_rollup → enterprise
  ['prediction.regulatory_forecast', 'prediction'],  // prediction_forecast_report → professional
]);

function panel(over: Partial<ReportCanvasPanel> & { reportTypeId: string }): ReportCanvasPanel {
  return { scopeType: 'project', ...over };
}

describe('validatePanels', () => {
  it('accepts entitled, known, well-scoped panels', () => {
    const issues = validatePanels([panel({ reportTypeId: 'readiness.executive_digest' })], KNOWN, 'standard');
    expect(issues).toEqual([]);
  });

  it('flags an unknown report type', () => {
    const issues = validatePanels([panel({ reportTypeId: 'does.not_exist' })], KNOWN, 'enterprise');
    expect(issues).toEqual([{ index: 0, reportTypeId: 'does.not_exist', reason: 'unknown_type' }]);
  });

  it('flags an invalid scope', () => {
    const issues = validatePanels(
      [{ reportTypeId: 'readiness.executive_digest', scopeType: 'galaxy' as any }],
      KNOWN,
      'standard',
    );
    expect(issues[0]).toMatchObject({ index: 0, reason: 'invalid_scope' });
  });

  it('flags a panel the tier does not entitle, with the required tier', () => {
    // standard tier cannot use an enterprise portfolio panel.
    const issues = validatePanels([panel({ reportTypeId: 'portfolio.board_pack' })], KNOWN, 'standard');
    expect(issues[0]).toMatchObject({ index: 0, reason: 'not_entitled', requiredTier: 'enterprise' });
  });

  it('lets enterprise through the same portfolio panel', () => {
    expect(validatePanels([panel({ reportTypeId: 'portfolio.board_pack' })], KNOWN, 'enterprise')).toEqual([]);
  });

  it('reports issues per-panel with correct indices', () => {
    const issues = validatePanels(
      [
        panel({ reportTypeId: 'readiness.executive_digest' }),  // ok
        panel({ reportTypeId: 'portfolio.board_pack' }),        // not entitled at professional
        panel({ reportTypeId: 'unknown.type' }),                // unknown
      ],
      KNOWN,
      'professional',
    );
    expect(issues.map((i) => i.index)).toEqual([1, 2]);
    expect(issues.map((i) => i.reason)).toEqual(['not_entitled', 'unknown_type']);
  });
});
