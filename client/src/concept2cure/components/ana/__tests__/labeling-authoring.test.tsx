// @vitest-environment jsdom
/**
 * Build-from-template labeling authoring (roadmap E9) — client tests.
 *
 *   - LabelCurrencyPanel  — the deterministic currency gate (current vs stale).
 *   - LabelingAuthoringPane — mode toggle (US/EU), section guard, currency gate,
 *     verification, and the 21 CFR Part 11 honesty guard (sample drafts are
 *     never exportable; currency verdict is the server's deterministic set).
 *   - labelingModes — required_strings derivation + section guard, per mode.
 *   - flag gating — ENABLE_ANA_DOCUMENT_STUDIO defaults off.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling Studio tests.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { LabelCurrencyPanel } from '../LabelCurrencyPanel';
import { LabelingAuthoringPane } from '../LabelingAuthoringPane';
import {
  requiredSectionHeaders,
  deriveRequiredStrings,
  checkSectionGuard,
  isLabelCurrent,
  type LabelCurrencyVerdict,
} from '../labelingModes';
import { isFeatureEnabled, featureFlags } from '@/flags/featureFlags';

afterEach(cleanup);

const currentVerdict: LabelCurrencyVerdict = { riskLevel: 'low', findings: [] };
const staleVerdict: LabelCurrencyVerdict = {
  riskLevel: 'medium',
  findings: [
    { severity: 'major', message: 'Approved market US has no current approved USPI label.', basis: 'FDA 21 CFR 201.56-201.57 (USPI)' },
  ],
};

describe('labelingModes — required_strings + section guard', () => {
  it('derives mode-specific required_strings (PLR vs QRD differ)', () => {
    expect(deriveRequiredStrings('us')).toEqual(requiredSectionHeaders('us'));
    expect(deriveRequiredStrings('us')).not.toEqual(deriveRequiredStrings('eu'));
    expect(deriveRequiredStrings('eu')).toContain('4.8 Undesirable effects');
  });

  it('section guard is complete when all headers present, flags missing ones', () => {
    const full = requiredSectionHeaders('us').join('\n');
    expect(checkSectionGuard('us', full).complete).toBe(true);
    const partial = requiredSectionHeaders('us').filter((h) => !/CONTRAINDICATIONS/.test(h)).join('\n');
    const g = checkSectionGuard('us', partial);
    expect(g.complete).toBe(false);
    expect(g.missing).toContain('4 CONTRAINDICATIONS');
  });

  it('isLabelCurrent reflects the deterministic finding set', () => {
    expect(isLabelCurrent(currentVerdict)).toBe(true);
    expect(isLabelCurrent(staleVerdict)).toBe(false);
  });
});

describe('LabelCurrencyPanel (deterministic currency gate)', () => {
  it('renders a current verdict in a live region', () => {
    render(<LabelCurrencyPanel verdict={currentVerdict} />);
    expect(screen.getByText('Label currency: current')).toBeTruthy();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('data-status')).toBe('verified');
  });

  it('renders a stale verdict with the cited findings and basis', () => {
    render(<LabelCurrencyPanel verdict={staleVerdict} />);
    expect(screen.getByText('Label currency: stale')).toBeTruthy();
    expect(screen.getByText(/no current approved USPI label/)).toBeTruthy();
    expect(screen.getByText(/FDA 21 CFR 201\.56/)).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('unverified');
  });
});

describe('LabelingAuthoringPane', () => {
  const usHeaders = requiredSectionHeaders('us').join('\n\n');
  const draft = { title: 'Examplumab USPI v1', content: usHeaders, dataSource: 'sample' as const };

  it('shows the US structure and the section guard as complete', () => {
    render(<LabelingAuthoringPane mode="us" onModeChange={() => {}} draft={draft} />);
    expect(screen.getByText(/PLR sections/)).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
  });

  it('toggles US ↔ EU mode', () => {
    const onModeChange = vi.fn();
    render(<LabelingAuthoringPane mode="us" onModeChange={onModeChange} draft={draft} />);
    const euBtn = screen.getByRole('radio', { name: 'EU' });
    expect(euBtn.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(euBtn);
    expect(onModeChange).toHaveBeenCalledWith('eu');
  });

  it('flags missing sections when the draft is incomplete', () => {
    const partial = requiredSectionHeaders('us').filter((h) => !/ADVERSE REACTIONS/.test(h)).join('\n\n');
    render(
      <LabelingAuthoringPane
        mode="us"
        onModeChange={() => {}}
        draft={{ title: 'Partial', content: partial, dataSource: 'sample' }}
      />,
    );
    expect(screen.getByText('1 missing')).toBeTruthy();
  });

  it('embeds the currency gate and the verification panel when provided', () => {
    render(
      <LabelingAuthoringPane
        mode="us"
        onModeChange={() => {}}
        draft={draft}
        currencyVerdict={currentVerdict}
        verification={{ ok: true, missingRequiredStrings: [], requiredStringsChecked: 15 }}
      />,
    );
    expect(screen.getByText('Label currency: current')).toBeTruthy();
    expect(screen.getByText('Verified against your source')).toBeTruthy();
  });

  it('HONESTY: a sample draft can never be sealed/exported, even when current + verified', () => {
    render(
      <LabelingAuthoringPane
        mode="us"
        onModeChange={() => {}}
        draft={draft}
        currencyVerdict={currentVerdict}
        verification={{ ok: true, missingRequiredStrings: [], requiredStringsChecked: 15 }}
      />,
    );
    const exportBtn = screen.getByText('Seal & export').closest('button') as HTMLButtonElement;
    expect(exportBtn.disabled).toBe(true);
    expect(screen.getByText(/Sample data/)).toBeTruthy();
  });

  it('HONESTY: a live draft exports only once current AND verified', () => {
    const onExport = vi.fn();
    const live = { ...draft, dataSource: 'live' as const };
    const { rerender } = render(
      <LabelingAuthoringPane
        mode="us"
        onModeChange={() => {}}
        draft={live}
        currencyVerdict={staleVerdict}
        verification={{ ok: true, missingRequiredStrings: [], requiredStringsChecked: 15 }}
        onExport={onExport}
      />,
    );
    // Stale currency ⇒ export blocked.
    let btn = screen.getByText('Seal & export').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    // Current + verified ⇒ export allowed.
    rerender(
      <LabelingAuthoringPane
        mode="us"
        onModeChange={() => {}}
        draft={live}
        currencyVerdict={currentVerdict}
        verification={{ ok: true, missingRequiredStrings: [], requiredStringsChecked: 15 }}
        onExport={onExport}
      />,
    );
    btn = screen.getByText('Seal & export').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('reports the required-section header count it checks', () => {
    render(<LabelingAuthoringPane mode="eu" onModeChange={() => {}} draft={{ ...draft, content: '' }} />);
    const expected = deriveRequiredStrings('eu').length;
    expect(screen.getByText(new RegExp(`${expected} required section headers checked`))).toBeTruthy();
  });
});

describe('flag gating', () => {
  it('ENABLE_ANA_DOCUMENT_STUDIO defaults off (labeling pane ships dark)', () => {
    expect(featureFlags.ENABLE_ANA_DOCUMENT_STUDIO.defaultValue).toBe(false);
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
  });
});
