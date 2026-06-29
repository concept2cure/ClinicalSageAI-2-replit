// @vitest-environment jsdom
/**
 * E3 — PerAuthoringPanel UI tests: the flag-gating contract, the verbatim
 * figures list, the honesty verdict (sample / not-assessed PERs cannot be
 * authored), and the live-region accessibility of the verdict.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PerAuthoringPanel } from '../PerAuthoringPanel';
import type { PerStudyBundle } from '../perAuthoring';
import { isFeatureEnabled, setFeatureEnabled, resetFeatureFlags } from '../../../../flags/featureFlags';

afterEach(() => {
  cleanup();
  resetFeatureFlags();
});

function fullBundle(): PerStudyBundle {
  return {
    per: {
      device_name: 'Acme HBV Assay',
      per_version: 'v1.0',
      scientific_validity_done: true,
      benefit_risk_conclusion: 'Benefits outweigh residual risks.',
    },
    analytical: [
      {
        study_type: 'limit_of_detection',
        title: 'LoD study',
        pass_fail: 'pass',
        metrics: [{ kind: 'lod', value: 0.42, unit: 'IU/mL' }],
      },
    ],
    clinical: [
      {
        title: 'Pivotal study',
        sensitivity_pct: 96.4,
        sensitivity_lower: 92.1,
        sensitivity_upper: 98.7,
        specificity_pct: 98.9,
      },
    ],
  };
}

describe('ENABLE_ANA_DOCUMENT_STUDIO flag-gating', () => {
  it('defaults off, so a host gates the PER affordance behind it', () => {
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
    // Host pattern: only mount the panel when the flag is on.
    const mount = (b: PerStudyBundle) =>
      isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO') ? <PerAuthoringPanel bundle={b} /> : null;
    const { container } = render(<>{mount(fullBundle())}</>);
    expect(container.querySelector('[aria-label="IVDR PER authoring"]')).toBeNull();
  });

  it('renders when the flag is enabled', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    const mount = (b: PerStudyBundle) =>
      isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO') ? <PerAuthoringPanel bundle={b} /> : null;
    render(<>{mount(fullBundle())}</>);
    expect(screen.getByLabelText('IVDR PER authoring')).toBeTruthy();
  });
});

describe('PerAuthoringPanel content', () => {
  it('lists the Annex XIII sections and the enforced figures', () => {
    render(<PerAuthoringPanel bundle={fullBundle()} />);
    expect(screen.getByText('Analytical Performance')).toBeTruthy();
    expect(screen.getByText('Clinical Performance')).toBeTruthy();
    expect(screen.getByText('0.42 IU/mL')).toBeTruthy();
    expect(screen.getByText('96.4% (95% CI: 92.1–98.7%)')).toBeTruthy();
  });

  it('shows a ready verdict (live region) and enables authoring when fully recorded', () => {
    const onAuthor = vi.fn();
    render(<PerAuthoringPanel bundle={fullBundle()} onAuthorAndVerify={onAuthor} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('data-status')).toBe('ready');
    const btn = screen.getByText('Author PER and verify').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onAuthor).toHaveBeenCalledTimes(1);
    expect(onAuthor.mock.calls[0][0].requiredStrings.length).toBeGreaterThan(0);
  });
});

describe('PerAuthoringPanel honesty guard', () => {
  it('blocks authoring for a sample PER and lists the reason', () => {
    const b = fullBundle();
    b.per.isSample = true;
    const onAuthor = vi.fn();
    render(<PerAuthoringPanel bundle={b} onAuthorAndVerify={onAuthor} />);
    expect(screen.getByText('Not sealable or exportable yet.')).toBeTruthy();
    expect(screen.getByText(/built on sample data/i)).toBeTruthy();
    const btn = screen.getByText('Author PER and verify').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onAuthor).not.toHaveBeenCalled();
  });

  it('blocks authoring when a pillar is not assessed', () => {
    const b = fullBundle();
    b.clinical = [];
    render(<PerAuthoringPanel bundle={b} />);
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('blocked');
    expect(screen.getByText(/clinical performance has not been assessed/i)).toBeTruthy();
  });
});
