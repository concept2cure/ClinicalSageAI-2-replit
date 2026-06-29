// @vitest-environment jsdom
/**
 * E8 — Pre-IND / EOP2 briefing-book builder with reviewer-challenge pre-mortem.
 *
 * Client surfaces:
 *   - BriefingBookPanel        — the "anticipated FDA pushback" trust-strip.
 *   - mapBriefingPremortem     — SSE tool-result → BriefingBookPremortemResult.
 *   - DocumentStudioPane wiring — the panel renders inside the studio.
 *   - flag-gating               — ENABLE_ANA_DOCUMENT_STUDIO (default false).
 *   - honesty guard             — anticipated≠actual; sample non-exportable.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BriefingBookPanel, type BriefingBookPremortemResult } from '../BriefingBookPanel';
import { DocumentStudioPane } from '../DocumentStudioPane';
import { mapBriefingPremortem } from '../useAnaChat';
import { isFeatureEnabled, setFeatureEnabled } from '@/flags/featureFlags';

afterEach(cleanup);

const liveAssessed: BriefingBookPremortemResult = {
  anticipated: true,
  perQuestion: [
    {
      number: 1,
      question: 'Does the Agency concur with the primary endpoint?',
      challenges: [
        { severity: 'high', lens: 'biostatistics_skeptic', question: 'Is the endpoint validated for this population?' },
      ],
    },
    { number: 2, question: 'Is the safety database adequate?', challenges: [] },
  ],
  unmappedChallenges: [{ severity: 'critical', lens: 'cmc_heavy_reviewer', question: 'CMC comparability gap.' }],
  overallRisk: 'critical',
  precedentCount: 18,
  dataSource: 'live',
  sealable: true,
  assessment: 'assessed',
  summary: 'Anticipated reviewer pushback across 2 challenge(s).',
};

const fixtureNotAssessed: BriefingBookPremortemResult = {
  ...liveAssessed,
  overallRisk: 'insufficient_data',
  precedentCount: 0,
  dataSource: 'fixture',
  sealable: false,
  assessment: 'not_assessed',
};

describe('BriefingBookPanel — rendering', () => {
  it('renders anticipated challenges grouped under each sponsor question', () => {
    render(<BriefingBookPanel premortem={liveAssessed} />);
    expect(screen.getByText('Anticipated FDA pushback')).toBeTruthy();
    expect(screen.getByText('Question 1. Does the Agency concur with the primary endpoint?')).toBeTruthy();
    expect(screen.getByText('Is the endpoint validated for this population?')).toBeTruthy();
    // Question with no pushback shows the calm empty line.
    expect(screen.getByText('No anticipated pushback surfaced for this question.')).toBeTruthy();
    // Unmapped challenge surfaces under the general bucket.
    expect(screen.getByText('CMC comparability gap.')).toBeTruthy();
    expect(screen.getByText('General anticipated pushback')).toBeTruthy();
  });

  it('is a polite live region labelled for assistive tech', () => {
    render(<BriefingBookPanel premortem={liveAssessed} />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-label')).toBe('Anticipated FDA pushback');
    expect(region.getAttribute('data-risk')).toBe('critical');
  });

  it('honesty: always frames pushback as anticipated, never an actual FDA position', () => {
    render(<BriefingBookPanel premortem={liveAssessed} />);
    expect(
      screen.getByText('These are anticipated questions a reviewer may raise — not an actual FDA position.'),
    ).toBeTruthy();
  });

  it('honesty: sample data is marked not assessed and non-exportable', () => {
    render(<BriefingBookPanel premortem={fixtureNotAssessed} />);
    const notice = screen.getByTestId('brief-sample-notice');
    expect(notice.textContent).toContain('Sample data — not assessed.');
    expect(notice.textContent).toContain('cannot be sealed or exported');
    // Insufficient precedent corpus is stated plainly, not a fabricated risk.
    expect(screen.getByText(/Insufficient precedent data/)).toBeTruthy();
    expect(screen.getByText(/pattern-only, confidence: low/)).toBeTruthy();
  });

  it('does not show the sample notice for assessed live data', () => {
    render(<BriefingBookPanel premortem={liveAssessed} />);
    expect(screen.queryByTestId('brief-sample-notice')).toBeNull();
  });

  it('carries the severity as a text label (not colour alone)', () => {
    render(<BriefingBookPanel premortem={liveAssessed} />);
    // mapped challenge severity and the unmapped (general) challenge severity
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Critical')).toBeTruthy();
  });

  it('frames the overall risk as anticipated, never an actual position', () => {
    render(<BriefingBookPanel premortem={liveAssessed} />);
    expect(screen.getByText(/Critical anticipated risk/)).toBeTruthy();
  });
});

describe('DocumentStudioPane — briefing-book wiring', () => {
  const draft = { title: 'EOP2 Briefing Book', content: '# Heading\n\nBody.', documentType: 'briefing-book' };

  it('renders the briefing pre-mortem panel when provided', () => {
    render(
      <DocumentStudioPane
        draft={draft}
        briefingPremortem={liveAssessed}
        onDownloadDocx={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Anticipated FDA pushback')).toBeTruthy();
  });

  it('omits the panel when no briefing pre-mortem is present', () => {
    render(<DocumentStudioPane draft={draft} onDownloadDocx={() => {}} onClose={() => {}} />);
    expect(screen.queryByText('Anticipated FDA pushback')).toBeNull();
  });
});

describe('mapBriefingPremortem — SSE parse + honesty guard', () => {
  it('maps a fixture tool result, forcing anticipated and preserving non-sealable', () => {
    const out = mapBriefingPremortem({
      premortem: {
        anticipated: true,
        perQuestion: [{ number: 1, question: 'Q?', challenges: [] }],
        unmappedChallenges: [],
        overallRisk: 'insufficient_data',
        precedentCount: 0,
        dataSource: 'fixture',
        sealable: false,
        assessment: 'not_assessed',
        summary: 's',
      },
    });
    expect(out).not.toBeNull();
    expect(out!.anticipated).toBe(true);
    expect(out!.sealable).toBe(false);
    expect(out!.assessment).toBe('not_assessed');
  });

  it('never upgrades a non-true sealable flag to sealable', () => {
    const out = mapBriefingPremortem({
      premortem: { sealable: 'yes', assessment: 'assessed', perQuestion: [], unmappedChallenges: [] },
    });
    expect(out!.sealable).toBe(false); // only a strict true passes
  });

  it('returns null for an error envelope or a result with no premortem', () => {
    expect(mapBriefingPremortem({ error: 'boom' })).toBeNull();
    expect(mapBriefingPremortem({ content: 'x' })).toBeNull();
    expect(mapBriefingPremortem(null)).toBeNull();
  });
});

describe('flag-gating — ENABLE_ANA_DOCUMENT_STUDIO', () => {
  it('defaults to disabled', () => {
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
  });

  it('can be enabled per-org', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(true);
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', false); // restore
  });
});
