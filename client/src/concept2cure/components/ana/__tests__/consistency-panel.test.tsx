// @vitest-environment jsdom
/**
 * Tests for the Dossier Consistency Sweep UI (E2):
 *   - ConsistencyPanel       — the second Document Studio verification surface.
 *   - composeConsistencyFixMessage — the "Ask AnA to resolve" chat-turn payload.
 *   - DocumentStudioPane wiring — the panel renders beneath VerificationPanel.
 *   - Flag-gating             — when ENABLE_ANA_DOCUMENT_STUDIO is off the
 *     Document Studio (and therefore the ConsistencyPanel) does not surface.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ConsistencyPanel,
  composeConsistencyFixMessage,
  consistencyVerdictLabel,
} from '../ConsistencyPanel';
import { DocumentStudioPane } from '../DocumentStudioPane';
import type { ConsistencyResult } from '../useAnaChat';
import { isFeatureEnabled } from '@/flags/featureFlags';

afterEach(cleanup);

function result(partial: Partial<ConsistencyResult>): ConsistencyResult {
  return {
    verdict: 'clean',
    artifactsCompared: 3,
    draftFactsExtracted: 10,
    divergenceCount: 0,
    bySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
    divergences: [],
    ...partial,
  };
}

describe('ConsistencyPanel — verdict tiers', () => {
  it('renders a clean verdict as a live status with the artifacts-compared count', () => {
    render(<ConsistencyPanel consistency={result({ verdict: 'clean', artifactsCompared: 4 })} />);
    expect(screen.getByText('Consistent with your dossier')).toBeTruthy();
    expect(screen.getByText(/No conflicting values found across 4 artifacts/)).toBeTruthy();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('data-status')).toBe('clean');
  });

  it('renders a minor_issues verdict', () => {
    render(
      <ConsistencyPanel
        consistency={result({
          verdict: 'minor_issues',
          divergenceCount: 1,
          bySeverity: { critical: 0, high: 0, medium: 0, low: 1 },
          divergences: [
            { kind: 'numeric_divergence', severity: 'low', description: 'Shelf-life mismatch.', draftValue: '24 months', existingValue: '36 months' },
          ],
        })}
      />,
    );
    expect(screen.getByText('Minor inconsistencies')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('minor_issues');
    expect(screen.getByText('24 months')).toBeTruthy();
    expect(screen.getByText('36 months')).toBeTruthy();
  });

  it('renders a needs_review verdict with the high-severity tally and source pointer', () => {
    render(
      <ConsistencyPanel
        consistency={result({
          verdict: 'needs_review',
          divergenceCount: 1,
          bySeverity: { critical: 0, high: 1, medium: 0, low: 0 },
          divergences: [
            {
              kind: 'population_drift',
              severity: 'high',
              description: 'Study N differs between Module 2 and Module 5.',
              draftValue: 'N=240',
              existingValue: 'N=312',
              existingArtifact: 'Module 5.3.5.1 CSR',
              existingCtdSection: '5.3.5.1',
            },
          ],
        })}
      />,
    );
    expect(screen.getByText('Inconsistencies need review')).toBeTruthy();
    expect(screen.getByText(/1 high-severity/)).toBeTruthy();
    expect(screen.getByText('Population drift')).toBeTruthy();
    expect(screen.getByText(/Module 5.3.5.1 CSR/)).toBeTruthy();
    expect(screen.getByText(/5.3.5.1/)).toBeTruthy();
  });

  it('renders a blocker verdict', () => {
    render(
      <ConsistencyPanel
        consistency={result({
          verdict: 'blocker',
          divergenceCount: 1,
          bySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
          divergences: [
            { kind: 'numeric_divergence', severity: 'critical', description: 'NOAEL conflict.', draftValue: '100 mg/kg/day', existingValue: '50 mg/kg/day' },
          ],
        })}
      />,
    );
    expect(screen.getByText('Blocking inconsistencies')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('blocker');
  });
});

describe('ConsistencyPanel — resolve affordance', () => {
  it('offers "Ask AnA to resolve" only when not clean and a handler is given', () => {
    const onResolve = vi.fn();
    const { rerender } = render(
      <ConsistencyPanel
        consistency={result({ verdict: 'needs_review', divergenceCount: 1 })}
        onResolve={onResolve}
      />,
    );
    fireEvent.click(screen.getByText('Ask AnA to resolve'));
    expect(onResolve).toHaveBeenCalledTimes(1);

    // Clean → no resolve action (nothing to reconcile).
    rerender(<ConsistencyPanel consistency={result({ verdict: 'clean' })} onResolve={onResolve} />);
    expect(screen.queryByText('Ask AnA to resolve')).toBeNull();
  });

  it('hides the resolve action when no handler is provided', () => {
    render(<ConsistencyPanel consistency={result({ verdict: 'blocker', divergenceCount: 1 })} />);
    expect(screen.queryByText('Ask AnA to resolve')).toBeNull();
  });

  it('suppresses the resolve action for sample (non-sealable) content and shows the notice', () => {
    const onResolve = vi.fn();
    render(
      <ConsistencyPanel
        consistency={result({ verdict: 'needs_review', divergenceCount: 1, isSample: true })}
        onResolve={onResolve}
      />,
    );
    // Honesty contract: sample verdicts are advisory-only, never sealable.
    expect(screen.getByText(/advisory only and cannot be sealed or exported/)).toBeTruthy();
    expect(screen.queryByText('Ask AnA to resolve')).toBeNull();
  });
});

describe('composeConsistencyFixMessage', () => {
  it('cites the conflicting values and their source artifacts', () => {
    const msg = composeConsistencyFixMessage(
      'Clinical Overview 2.5',
      result({
        verdict: 'needs_review',
        divergenceCount: 1,
        divergences: [
          {
            kind: 'population_drift',
            severity: 'high',
            description: 'Study N differs.',
            draftValue: 'N=240',
            existingValue: 'N=312',
            existingArtifact: 'Module 5.3.5.1 CSR',
            existingCtdSection: '5.3.5.1',
          },
        ],
      }),
    );
    expect(msg).toContain('"Clinical Overview 2.5" diverges from the rest of the dossier');
    expect(msg).toContain('"N=240"');
    expect(msg).toContain('"N=312"');
    expect(msg).toContain('Module 5.3.5.1 CSR');
    expect(msg).toContain('re-run the consistency check');
  });

  it('describes an unresolved reference when there is no existing value', () => {
    const msg = composeConsistencyFixMessage(
      'Doc',
      result({
        verdict: 'minor_issues',
        divergences: [
          { kind: 'missing_cross_reference', severity: 'medium', description: 'References section 2.7.4 which does not exist', draftValue: '2.7.4' },
        ],
      }),
    );
    expect(msg).toContain('References section 2.7.4');
    expect(msg).not.toContain('the dossier states');
  });
});

describe('consistencyVerdictLabel', () => {
  it('maps every tier to a factual, emoji-free label', () => {
    expect(consistencyVerdictLabel('clean')).toBe('Consistent with your dossier');
    expect(consistencyVerdictLabel('minor_issues')).toBe('Minor inconsistencies');
    expect(consistencyVerdictLabel('needs_review')).toBe('Inconsistencies need review');
    expect(consistencyVerdictLabel('blocker')).toBe('Blocking inconsistencies');
  });
});

describe('DocumentStudioPane — ConsistencyPanel wiring', () => {
  const draft = { title: 'Clinical Overview 2.5', content: '# Heading\n\nBody.', documentType: 'docx' };

  it('renders the ConsistencyPanel beneath the VerificationPanel when both are present', () => {
    render(
      <DocumentStudioPane
        draft={draft}
        verification={{ ok: true, missingRequiredStrings: [], requiredStringsChecked: 1 }}
        consistency={result({ verdict: 'needs_review', divergenceCount: 1 })}
        onDownloadDocx={() => {}}
        onClose={() => {}}
      />,
    );
    // Both verification surfaces visible.
    expect(screen.getByText('Verified against your source')).toBeTruthy();
    expect(screen.getByText('Inconsistencies need review')).toBeTruthy();
  });

  it('does not render the ConsistencyPanel when no consistency result is supplied', () => {
    render(<DocumentStudioPane draft={draft} onDownloadDocx={() => {}} onClose={() => {}} />);
    expect(screen.queryByText('Consistent with your dossier')).toBeNull();
    expect(screen.queryByText('Inconsistencies need review')).toBeNull();
  });

  it('routes the resolve click through onResolveConsistency', () => {
    const onResolveConsistency = vi.fn();
    render(
      <DocumentStudioPane
        draft={draft}
        consistency={result({ verdict: 'blocker', divergenceCount: 1 })}
        onResolveConsistency={onResolveConsistency}
        onDownloadDocx={() => {}}
        onClose={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Ask AnA to resolve'));
    expect(onResolveConsistency).toHaveBeenCalledTimes(1);
  });
});

describe('flag-gating: ENABLE_ANA_DOCUMENT_STUDIO', () => {
  // The Document Studio (and with it the ConsistencyPanel) is gated by the
  // ENABLE_ANA_DOCUMENT_STUDIO flag in Ana.tsx: when the flag is off,
  // `studioEnabled` is false, `activeDocument` resolves to null, and the
  // DocumentStudioPane — including the consistency surface — is never mounted.
  // The flag ships dark (defaultValue:false), so by default no panel surfaces.
  it('defaults the flag off so the studio surfaces stay dark', () => {
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
  });
});
