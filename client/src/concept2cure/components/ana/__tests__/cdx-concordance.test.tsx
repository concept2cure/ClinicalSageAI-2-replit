// @vitest-environment jsdom
/**
 * Tests for the E12 CDx claim-concordance surface:
 *   - computeCdxConcordance     — the cross-dossier verbatim claim diff.
 *   - composeConcordanceFixMessage — the "Ask AnA to resolve" message.
 *   - ConcordancePanel          — rendering of each claim state + honesty/flag.
 *   - isSealable                — the honesty guard (sample never sealable).
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  computeCdxConcordance,
  composeConcordanceFixMessage,
  type PairedDossierClaims,
} from '../cdxConcordance';
import { ConcordancePanel } from '../ConcordancePanel';
import {
  CONCORDANT_SAMPLE,
  DISCORDANT_SAMPLE,
  isSealable,
} from '../cdxConcordance.fixtures';
import { isFeatureEnabled } from '@/flags/featureFlags';

afterEach(cleanup);

const src = (side: 'drug' | 'device') => ({
  side,
  submission: side === 'drug' ? 'BLA 1' : 'PMA 1',
  locator: 'loc',
});

describe('computeCdxConcordance — verbatim claim diff', () => {
  it('reports an all-concordant pairing as concordant', () => {
    const report = computeCdxConcordance(CONCORDANT_SAMPLE.paired);
    expect(report.verdict).toBe('concordant');
    expect(report.discordantCount).toBe(0);
    expect(report.concordantCount).toBe(report.claims.length);
    expect(report.verbatim).toBe(true);
  });

  it('treats a glyph-only difference (≥ vs >=) as DISCORDANT — never fuzzy', () => {
    const report = computeCdxConcordance(DISCORDANT_SAMPLE.paired);
    const biomarker = report.claims.find((c) => c.category === 'biomarker')!;
    expect(biomarker.status).toBe('discordant');
    expect(biomarker.drugText).toBe('PD-L1 (≥1%)');
    expect(biomarker.deviceText).toBe('PD-L1 (>=1%)');
    expect(report.verdict).toBe('discordant');
  });

  it('is case- and whitespace-sensitive (verbatim, not normalized)', () => {
    const paired: PairedDossierClaims = {
      pairingId: 'p1',
      drugClaims: [{ category: 'biomarker', text: 'EGFR', source: src('drug') }],
      deviceClaims: [{ category: 'biomarker', text: 'egfr ', source: src('device') }],
    };
    const report = computeCdxConcordance(paired);
    expect(report.claims[0].status).toBe('discordant');
  });

  it('marks a claim present on only one side as missing_counterpart', () => {
    const report = computeCdxConcordance(DISCORDANT_SAMPLE.paired);
    const iu = report.claims.find((c) => c.category === 'intended_use')!;
    expect(iu.status).toBe('missing_counterpart');
    expect(iu.drugText).not.toBeNull();
    expect(iu.deviceText).toBeNull();
  });

  it('matches identical strings exactly and preserves both source pointers', () => {
    const paired: PairedDossierClaims = {
      pairingId: 'p2',
      drugClaims: [{ category: 'population', text: 'adults', source: src('drug') }],
      deviceClaims: [{ category: 'population', text: 'adults', source: src('device') }],
    };
    const report = computeCdxConcordance(paired);
    expect(report.claims[0].status).toBe('concordant');
    expect(report.claims[0].drugSource?.side).toBe('drug');
    expect(report.claims[0].deviceSource?.side).toBe('device');
  });

  it('reports categories in label-reading order regardless of input order', () => {
    const paired: PairedDossierClaims = {
      pairingId: 'p3',
      drugClaims: [
        { category: 'population', text: 'a', source: src('drug') },
        { category: 'intended_use', text: 'b', source: src('drug') },
        { category: 'biomarker', text: 'c', source: src('drug') },
      ],
      deviceClaims: [
        { category: 'population', text: 'a', source: src('device') },
        { category: 'intended_use', text: 'b', source: src('device') },
        { category: 'biomarker', text: 'c', source: src('device') },
      ],
    };
    const report = computeCdxConcordance(paired);
    expect(report.claims.map((c) => c.category)).toEqual(['intended_use', 'biomarker', 'population']);
  });
});

describe('composeConcordanceFixMessage', () => {
  it('cites each discordant category with both differing strings verbatim', () => {
    const report = computeCdxConcordance(DISCORDANT_SAMPLE.paired);
    const msg = composeConcordanceFixMessage(report);
    expect(msg).toContain('not concordant');
    expect(msg).toContain('"PD-L1 (≥1%)"');
    expect(msg).toContain('"PD-L1 (>=1%)"');
    // missing_counterpart phrased as present/absent.
    expect(msg).toContain('absent on the device side');
    expect(msg).toContain('re-check concordance');
  });
});

describe('ConcordancePanel rendering', () => {
  it('shows a concordant verdict in a polite live region with the verbatim note', () => {
    const report = computeCdxConcordance(CONCORDANT_SAMPLE.paired);
    render(<ConcordancePanel report={report} dataStatus="sample" />);
    expect(screen.getByText('CDx claims concordant across the paired dossiers')).toBeTruthy();
    expect(screen.getByText(/verbatim string comparison, not an AI judgment/)).toBeTruthy();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('data-status')).toBe('concordant');
  });

  it('renders both differing strings + source pointers for a discordant claim', () => {
    const report = computeCdxConcordance(DISCORDANT_SAMPLE.paired);
    render(<ConcordancePanel report={report} dataStatus="sample" />);
    expect(screen.getByText('CDx claims not concordant across the paired dossiers')).toBeTruthy();
    expect(screen.getByText('PD-L1 (≥1%)')).toBeTruthy();
    expect(screen.getByText('PD-L1 (>=1%)')).toBeTruthy();
    // missing counterpart note on the device side for intended_use.
    expect(screen.getByText('No such claim in the device submission.')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('discordant');
  });
});

describe('honesty guard — sample data is never sealable/exportable', () => {
  it('isSealable is true only for assessed data', () => {
    expect(isSealable('assessed')).toBe(true);
    expect(isSealable('sample')).toBe(false);
    expect(isSealable('not_assessed')).toBe(false);
  });

  it('marks sample data non-sealable in the panel and suppresses the resolve action', () => {
    const onResolve = vi.fn();
    const report = computeCdxConcordance(DISCORDANT_SAMPLE.paired);
    render(<ConcordancePanel report={report} dataStatus="sample" onResolve={onResolve} />);
    expect(screen.getByText(/not sealable or\s+exportable as a submission record/)).toBeTruthy();
    // Resolve loop is suppressed for non-assessed data.
    expect(screen.queryByText('Ask AnA to resolve')).toBeNull();
  });

  it('offers the resolve loop only for a discordant, assessed report', () => {
    const onResolve = vi.fn();
    const report = computeCdxConcordance(DISCORDANT_SAMPLE.paired);
    const { rerender } = render(
      <ConcordancePanel report={report} dataStatus="assessed" onResolve={onResolve} />,
    );
    fireEvent.click(screen.getByText('Ask AnA to resolve'));
    expect(onResolve).toHaveBeenCalledTimes(1);

    // A concordant assessed report has nothing to resolve.
    const clean = computeCdxConcordance(CONCORDANT_SAMPLE.paired);
    rerender(<ConcordancePanel report={clean} dataStatus="assessed" onResolve={onResolve} />);
    expect(screen.queryByText('Ask AnA to resolve')).toBeNull();
  });
});

describe('flag gating', () => {
  it('keeps the Document Studio surface gated off by default', () => {
    // E12 lands behind the same flag as the rest of Document Studio; it must
    // default off so the surface never ships hot.
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
  });
});
