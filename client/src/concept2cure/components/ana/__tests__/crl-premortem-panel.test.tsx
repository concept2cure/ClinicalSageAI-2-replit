// @vitest-environment jsdom
/**
 * E14 — CrlPremortemPanel tests: the board-ready CRL/RTF pre-mortem decision
 * artifact surface. Covers the honesty framing (probability shown as an
 * estimate), risk grounding (every risk cites a precedent), the fix-list, and
 * the export/exportability guard (sample/not_assessed non-exportable; estimated
 * exportable but marked unsealed). Plain DOM assertions to match sibling tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { CrlPremortemPanel, type CrlPremortemArtifact } from '../CrlPremortemPanel';

afterEach(cleanup);

function artifact(over: Partial<CrlPremortemArtifact> = {}): CrlPremortemArtifact {
  return {
    title: 'CRL/RTF Pre-Mortem — Decision Artifact',
    status: 'estimated',
    riskLevel: 'high',
    approvalProbability: {
      value: 2 / 3,
      class: 'high',
      denominator: 4,
      approved: 2,
      denied: 1,
      unknown: 1,
      confidence: 'medium',
      framing:
        'ESTIMATE — approximately 67% (2 of 3 comparable precedents reached approval). This is a precedent-grounded estimate, NOT a guarantee.',
    },
    topRisks: [
      {
        rank: 1,
        title: 'No control arm',
        severity: 'critical',
        category: 'reviewer_trigger',
        reviewerQuestion: 'Why is there no concurrent control?',
        regulatoryBasis: '21 CFR 314.126',
        grounding: { citationId: 'K3', citationLabel: 'K323456 (CRL)', fromCorpus: true },
      },
    ],
    fixList: [
      { order: 1, priority: 'critical', action: 'Add a concurrent control arm.', addressesRisk: 'No control arm', citationId: 'K3' },
    ],
    precedentCitations: [{ id: 'K3', label: 'K323456', outcome: 'CRL' }],
    honestyNote: 'This artifact is a precedent-grounded ESTIMATE, not a guarantee.',
    exportable: true,
    sealable: true,
    sealStatus: 'unsealed',
    generatedAt: '2026-06-29T00:00:00.000Z',
    ...over,
  };
}

describe('CrlPremortemPanel', () => {
  it('frames the approval probability as an estimate, never a guarantee', () => {
    render(<CrlPremortemPanel artifact={artifact()} />);
    expect(screen.getByText('~67%')).toBeTruthy();
    expect(screen.getByText(/precedent-grounded estimate, NOT a guarantee/)).toBeTruthy();
    const strip = screen.getByText('Approval-probability estimate').closest('[role="status"]')!;
    expect(strip.getAttribute('aria-live')).toBe('polite');
  });

  it('renders each top risk bound to its grounding precedent', () => {
    render(<CrlPremortemPanel artifact={artifact()} />);
    expect(screen.getByText('No control arm')).toBeTruthy();
    expect(screen.getByText(/Grounding: K323456 \(CRL\)/)).toBeTruthy();
  });

  it('renders the prioritized fix-list', () => {
    render(<CrlPremortemPanel artifact={artifact()} />);
    expect(screen.getByText('Add a concurrent control arm.')).toBeTruthy();
  });

  it('marks the artifact unsealed', () => {
    render(<CrlPremortemPanel artifact={artifact()} />);
    expect(screen.getByText('Unsealed draft')).toBeTruthy();
  });

  it('exports an estimated artifact and fires the handler', () => {
    const onExport = vi.fn();
    render(<CrlPremortemPanel artifact={artifact()} onExport={onExport} />);
    const btn = screen.getByText('Export as DOCX').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it('disables export and states the reason for a not_assessed artifact', () => {
    const onExport = vi.fn();
    const a = artifact({
      status: 'not_assessed',
      exportable: false,
      sealable: false,
      approvalProbability: {
        value: null,
        class: null,
        denominator: 0,
        approved: 0,
        denied: 0,
        unknown: 0,
        confidence: 'low',
        framing: 'Approval probability NOT ESTIMATED: no precedent with a known approve/deny outcome is available.',
      },
    });
    render(<CrlPremortemPanel artifact={a} onExport={onExport} />);
    const btn = screen.getByText('Export as DOCX').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onExport).not.toHaveBeenCalled();
    expect(screen.getByText(/pattern-only read/)).toBeTruthy();
    expect(screen.getByText('Not estimated')).toBeTruthy();
  });

  it('disables export for a sample artifact', () => {
    const a = artifact({ status: 'sample', exportable: false, sealable: false });
    render(<CrlPremortemPanel artifact={a} />);
    const btn = screen.getByText('Export as DOCX').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/sample artifact/)).toBeTruthy();
  });

  it('wires the disabled export button to its reason via aria-describedby', () => {
    const a = artifact({ status: 'sample', exportable: false, sealable: false });
    render(<CrlPremortemPanel artifact={a} />);
    const btn = screen.getByText('Export as DOCX').closest('button') as HTMLButtonElement;
    const describedBy = btn.getAttribute('aria-describedby');
    expect(describedBy).toBe('premortem-export-reason');
    const reason = document.getElementById(describedBy!);
    expect(reason).not.toBeNull();
    expect(reason!.textContent).toMatch(/Not exportable/);
  });

  it('exportable artifact has no dangling aria-describedby', () => {
    render(<CrlPremortemPanel artifact={artifact()} />);
    const btn = screen.getByText('Export as DOCX').closest('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-describedby')).toBeNull();
  });

  it('labels the panel and the estimate strip for assistive tech', () => {
    render(<CrlPremortemPanel artifact={artifact()} />);
    expect(screen.getByRole('region', { name: 'CRL/RTF pre-mortem decision artifact' })).toBeTruthy();
    const strip = screen.getByText('Approval-probability estimate').closest('[role="status"]')!;
    expect(strip.getAttribute('aria-live')).toBe('polite');
  });
});
