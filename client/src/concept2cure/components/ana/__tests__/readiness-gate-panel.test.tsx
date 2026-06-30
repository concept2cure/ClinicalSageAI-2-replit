// @vitest-environment jsdom
/**
 * Tests for the E10 readiness-gate UI:
 *   - ReadinessGatePanel — green (ready) vs blocked rendering; the seal action
 *     enabled only when the gate is sealable; deep-link follow; honesty (sample
 *     / not-assessed never seals).
 *   - DocumentStudioPane — the flag-gated eCTD affordance (shown only when
 *     ectdEnabled) and the assemble action wiring.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ReadinessGatePanel } from '../ReadinessGatePanel';
import { DocumentStudioPane } from '../DocumentStudioPane';
import { aggregateReadiness } from '../ectdReadiness';
import {
  SAMPLE_ASSEMBLED_M2_5,
  SAMPLE_STRUCTURAL_OK,
  SAMPLE_STRUCTURAL_FAIL,
  SAMPLE_CONSISTENCY_CLEAN,
  SAMPLE_CONSISTENCY_BLOCKER,
} from '../ectdReadinessFixtures';

afterEach(cleanup);

const liveAssembled = { ...SAMPLE_ASSEMBLED_M2_5, sample: false };
const readyGate = aggregateReadiness({
  assembled: liveAssembled,
  structural: SAMPLE_STRUCTURAL_OK,
  consistency: SAMPLE_CONSISTENCY_CLEAN,
});
const blockedGate = aggregateReadiness({
  assembled: { ...liveAssembled, moduleNumber: '5.3.5' },
  structural: SAMPLE_STRUCTURAL_FAIL,
  consistency: SAMPLE_CONSISTENCY_BLOCKER,
});
const sampleGate = aggregateReadiness({
  assembled: SAMPLE_ASSEMBLED_M2_5, // sample: true
  structural: SAMPLE_STRUCTURAL_OK,
  consistency: SAMPLE_CONSISTENCY_CLEAN,
});

describe('ReadinessGatePanel — green (ready)', () => {
  it('renders a ready verdict in a live region with both checks green', () => {
    render(<ReadinessGatePanel gate={readyGate} onSeal={() => {}} />);
    expect(screen.getByText(/Ready for submission/)).toBeTruthy();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('data-status')).toBe('ready');
    expect(screen.getByText(/Structural validation:/)).toBeTruthy();
    expect(screen.getByText(/Dossier consistency:/)).toBeTruthy();
  });

  it('enables the seal action only when the gate is sealable', () => {
    const onSeal = vi.fn();
    render(<ReadinessGatePanel gate={readyGate} onSeal={onSeal} />);
    const btn = screen.getByText(/Seal and submit/).closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onSeal).toHaveBeenCalledTimes(1);
  });
});

describe('ReadinessGatePanel — blocked', () => {
  it('renders a blocked verdict and lists the blocking items', () => {
    render(<ReadinessGatePanel gate={blockedGate} onSeal={() => {}} />);
    expect(screen.getByText(/Blocked — resolve before submission/)).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('blocked');
    const blockers = screen.getByLabelText('Blocking items');
    expect(blockers.querySelectorAll('li').length).toBe(blockedGate.blockingItems.length);
  });

  it('DISABLES the seal action while blocked (honesty contract)', () => {
    const onSeal = vi.fn();
    render(<ReadinessGatePanel gate={blockedGate} onSeal={onSeal} />);
    const btn = screen.getByText(/Seal and submit/).closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSeal).not.toHaveBeenCalled();
    expect(screen.getByText(/Available once every blocking item is resolved\./)).toBeTruthy();
  });

  it('follows a blocking item deep link', () => {
    const onFollowLink = vi.fn();
    render(<ReadinessGatePanel gate={blockedGate} onSeal={() => {}} onFollowLink={onFollowLink} />);
    const withLink = blockedGate.blockingItems.find(b => b.deepLink);
    expect(withLink).toBeTruthy();
    fireEvent.click(screen.getAllByText(withLink!.deepLink!.label)[0]);
    expect(onFollowLink).toHaveBeenCalled();
  });

  it('gives each deep-link an accessible name carrying its blocking item', () => {
    render(<ReadinessGatePanel gate={blockedGate} onSeal={() => {}} onFollowLink={() => {}} />);
    const withLink = blockedGate.blockingItems.find(b => b.deepLink)!;
    const btn = screen.getByRole('button', {
      name: `${withLink.deepLink!.label}: ${withLink.label}`,
    });
    expect(btn).toBeTruthy();
  });

  it('disabled seal states the reason in text (not colour alone)', () => {
    render(<ReadinessGatePanel gate={sampleGate} onSeal={() => {}} />);
    const btn = screen.getByText(/Seal and submit/).closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Available once the module is assembled from live artifacts/)).toBeTruthy();
  });
});

describe('ReadinessGatePanel — honesty for sample / not-assessed', () => {
  it('a sample gate is not_assessed and never sealable', () => {
    const onSeal = vi.fn();
    render(<ReadinessGatePanel gate={sampleGate} onSeal={onSeal} />);
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('not_assessed');
    const btn = screen.getByText(/Seal and submit/).closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSeal).not.toHaveBeenCalled();
  });

  it('contains no emoji in any rendered label', () => {
    const { container } = render(<ReadinessGatePanel gate={blockedGate} onSeal={() => {}} />);
    // Basic emoji ranges — the regulatory surface forbids emoji.
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(container.textContent || '')).toBe(false);
  });
});

describe('DocumentStudioPane — eCTD affordance flag gating', () => {
  const draft = { title: 'Clinical Overview', content: '# Heading\n\nBody.', documentType: 'docx' };

  it('hides the eCTD affordance when ectdEnabled is false/omitted', () => {
    render(<DocumentStudioPane draft={draft} onDownloadDocx={() => {}} onClose={() => {}} />);
    expect(screen.queryByLabelText('Assemble eCTD module')).toBeNull();
    expect(screen.queryByText(/Assemble module and check readiness/)).toBeNull();
  });

  it('shows the assemble affordance when ectdEnabled and fires onAssembleModule', () => {
    const onAssembleModule = vi.fn();
    render(
      <DocumentStudioPane
        draft={draft}
        ectdEnabled
        onAssembleModule={onAssembleModule}
        onDownloadDocx={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText('Assemble eCTD module')).toBeTruthy();
    fireEvent.click(screen.getByText(/Assemble module and check readiness/));
    // Default module choice is 2.5.
    expect(onAssembleModule).toHaveBeenCalledWith('2.5');
  });

  it('renders the readiness gate (not the affordance) once a verdict exists', () => {
    render(
      <DocumentStudioPane
        draft={draft}
        ectdEnabled
        readinessGate={readyGate}
        onAssembleModule={() => {}}
        onReadinessSubmit={() => {}}
        onDownloadDocx={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.queryByText(/Assemble module and check readiness/)).toBeNull();
    expect(screen.getByText(/Ready for submission/)).toBeTruthy();
  });
});
