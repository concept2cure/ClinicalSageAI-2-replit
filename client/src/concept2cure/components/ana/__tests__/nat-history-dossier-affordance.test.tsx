// @vitest-environment jsdom
/**
 * Tests for the E13 NatHistoryDossierAffordance — the flag-gated authoring
 * affordance for the natural-history / external-control evidence dossier.
 *
 * Covers the pure request-message composer, the export/seal honesty guard
 * (sample never exportable), the rendered panel state, and flag gating via
 * DocumentStudioPane (the dossier panel only appears when the dossier prop is
 * supplied, which Ana.tsx wires only behind ENABLE_ANA_DOCUMENT_STUDIO).
 *
 * Plain DOM assertions (no jest-dom), matching the sibling tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  NatHistoryDossierAffordance,
  composeDossierRequestMessage,
  isDossierExportable,
} from '../NatHistoryDossierAffordance';
import { DocumentStudioPane } from '../DocumentStudioPane';
import { isFeatureEnabled, setFeatureEnabled, resetFeatureFlags } from '@/flags/featureFlags';

afterEach(() => {
  cleanup();
  resetFeatureFlags();
});

describe('composeDossierRequestMessage', () => {
  it('names both source tools, the verify step, and pins the four section headers', () => {
    const msg = composeDossierRequestMessage('Spinal muscular atrophy', 'Acme Bio');
    expect(msg).toContain('search_clinical_evidence');
    expect(msg).toContain('advise_rwe_design');
    expect(msg).toContain('author_docx_native');
    expect(msg).toContain('verify_docx_against_source');
    expect(msg).toContain('Disease Natural History');
    expect(msg).toContain('Proposed External Control');
    expect(msg).toContain('Comparability and Bias Discussion');
    expect(msg).toContain('Source Evidence Table');
    expect(msg).toContain('Spinal muscular atrophy');
    expect(msg).toContain('Acme Bio');
  });

  it('requires every claim to carry a cited source (honesty contract in the prompt)', () => {
    const msg = composeDossierRequestMessage('Disease X');
    expect(msg).toMatch(/no uncited assertion/i);
  });
});

describe('isDossierExportable', () => {
  it('is true only for live provenance', () => {
    expect(isDossierExportable('live')).toBe(true);
    expect(isDossierExportable('sample')).toBe(false);
    expect(isDossierExportable('not_assessed')).toBe(false);
  });
});

describe('NatHistoryDossierAffordance', () => {
  it('renders a live region and composes the request on assemble', () => {
    const onAssemble = vi.fn();
    render(
      <NatHistoryDossierAffordance indication="Disease X" provenance="live" onAssemble={onAssemble} />,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('data-exportable')).toBe('true');
    fireEvent.click(screen.getByText('Assemble evidence dossier'));
    expect(onAssemble).toHaveBeenCalledTimes(1);
    expect(onAssemble.mock.calls[0][0]).toContain('verify_docx_against_source');
  });

  it('marks a sample dossier non-exportable and says so (honesty guard in UI)', () => {
    render(<NatHistoryDossierAffordance indication="Disease X" provenance="sample" onAssemble={vi.fn()} />);
    expect(screen.getByRole('status').getAttribute('data-exportable')).toBe('false');
    expect(screen.getByText(/not sealable or exportable/i)).toBeTruthy();
  });

  it('defaults to not_assessed (non-exportable) when no provenance given', () => {
    render(<NatHistoryDossierAffordance indication="Disease X" onAssemble={vi.fn()} />);
    expect(screen.getByRole('status').getAttribute('data-exportable')).toBe('false');
  });

  it('states the non-exportable reason in text, not colour alone (honesty + color-never-alone)', () => {
    // not_assessed: the reason is spelled out in the panel detail text.
    render(<NatHistoryDossierAffordance indication="Disease X" provenance="not_assessed" onAssemble={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('data-exportable')).toBe('false');
    expect(status.textContent).toMatch(/cannot be sealed until the evidence is live/i);
    // The status icon is decorative (aria-hidden) — meaning is carried by text.
    const ico = status.querySelector('[aria-hidden="true"]');
    expect(ico).toBeTruthy();
  });

  it('the assemble control is a real verb-labelled button', () => {
    render(<NatHistoryDossierAffordance indication="Disease X" onAssemble={vi.fn()} />);
    const btn = screen.getByText('Assemble evidence dossier').closest('button') as HTMLButtonElement;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('disables the assemble button while busy', () => {
    render(<NatHistoryDossierAffordance indication="Disease X" onAssemble={vi.fn()} busy />);
    const btn = screen.getByText('Assembling…').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('DocumentStudioPane — dossier slot (flag gating)', () => {
  const draft = { title: 'D', content: 'body', documentType: 'docx' };

  it('the studio flag ships off by default', () => {
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
  });

  it('omits the dossier panel when no dossier prop is passed (flag off path)', () => {
    render(<DocumentStudioPane draft={draft} onDownloadDocx={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText('Natural-history / external-control dossier')).toBeNull();
  });

  it('renders the dossier panel only when the dossier prop is supplied (flag-on path)', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    const onAssemble = vi.fn();
    render(
      <DocumentStudioPane
        draft={draft}
        onDownloadDocx={vi.fn()}
        onClose={vi.fn()}
        dossier={{ indication: 'Disease X', provenance: 'sample', onAssemble }}
      />,
    );
    expect(screen.getByText('Natural-history / external-control dossier')).toBeTruthy();
    fireEvent.click(screen.getByText('Assemble evidence dossier'));
    expect(onAssemble).toHaveBeenCalledTimes(1);
  });
});
