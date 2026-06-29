// @vitest-environment jsdom
/**
 * Tests for the E11 IndModuleAffordance — the flag-gated authoring affordance for
 * an IND narrative module (CTD Module 2.5 / 2.7).
 *
 * Covers the pure request-message composer (names the verify step + pins the
 * figure-fidelity contract), the seal honesty guard (sample never sealable), the
 * rendered panel state, and flag gating via DocumentStudioPane (the IND-module
 * panel only appears when the indModule prop is supplied, which Ana.tsx wires only
 * behind ENABLE_ANA_DOCUMENT_STUDIO).
 *
 * Plain DOM assertions (no jest-dom), matching the sibling tests.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  IndModuleAffordance,
  composeIndModuleRequestMessage,
  isIndModuleSealable,
} from '../IndModuleAffordance';
import { DocumentStudioPane } from '../DocumentStudioPane';
import { isFeatureEnabled, setFeatureEnabled, resetFeatureFlags } from '@/flags/featureFlags';

afterEach(() => {
  cleanup();
  resetFeatureFlags();
});

describe('composeIndModuleRequestMessage', () => {
  it('names the plan/author/verify tools and pins the figure-fidelity contract', () => {
    const msg = composeIndModuleRequestMessage('2.5', 'ABC-123', 'relapsed/refractory AML');
    expect(msg).toContain('plan_ind_module_authoring');
    expect(msg).toContain('author_docx_native');
    expect(msg).toContain('verify_docx_against_source');
    expect(msg).toContain('Module 2.5');
    expect(msg).toContain('ABC-123');
    expect(msg).toContain('relapsed/refractory AML');
    // The required_strings must include every source figure → transcription fidelity.
    expect(msg).toMatch(/every source figure/i);
    expect(msg).toMatch(/missing or mistyped figure fails verification/i);
  });

  it('encodes the honesty contract (sample is never sealable) in the prompt', () => {
    const msg = composeIndModuleRequestMessage('2.7', 'XYZ', 'Disease X');
    expect(msg).toMatch(/never sealable/i);
  });
});

describe('isIndModuleSealable', () => {
  it('is true only for live provenance', () => {
    expect(isIndModuleSealable('live')).toBe(true);
    expect(isIndModuleSealable('sample')).toBe(false);
    expect(isIndModuleSealable('not_assessed')).toBe(false);
  });
});

describe('IndModuleAffordance', () => {
  it('renders a live region and composes the request on author', () => {
    const onAuthor = vi.fn();
    render(
      <IndModuleAffordance module="2.5" productName="ABC-123" indication="AML" provenance="live" onAuthor={onAuthor} />,
    );
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('data-sealable')).toBe('true');
    fireEvent.click(screen.getByText('Author Module 2.5 from source'));
    expect(onAuthor).toHaveBeenCalledTimes(1);
    expect(onAuthor.mock.calls[0][0]).toContain('verify_docx_against_source');
  });

  it('marks a sample source non-sealable and says so (honesty guard in UI)', () => {
    render(<IndModuleAffordance module="2.7" productName="X" indication="Y" provenance="sample" onAuthor={vi.fn()} />);
    expect(screen.getByRole('status').getAttribute('data-sealable')).toBe('false');
    expect(screen.getByText(/not sealable/i)).toBeTruthy();
  });

  it('defaults to not_assessed (non-sealable) when no provenance given', () => {
    render(<IndModuleAffordance module="2.5" productName="X" indication="Y" onAuthor={vi.fn()} />);
    expect(screen.getByRole('status').getAttribute('data-sealable')).toBe('false');
  });

  it('states the non-sealable reason in text, not colour alone (honesty + color-never-alone)', () => {
    render(<IndModuleAffordance module="2.5" productName="X" indication="Y" provenance="not_assessed" onAuthor={vi.fn()} />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('data-sealable')).toBe('false');
    expect(status.textContent).toMatch(/cannot be sealed until the source is live/i);
    // The status icon is decorative (aria-hidden); the verdict is in the text.
    expect(status.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it('the author control is a real verb-labelled button', () => {
    render(<IndModuleAffordance module="2.5" productName="X" indication="Y" onAuthor={vi.fn()} />);
    const btn = screen.getByText('Author Module 2.5 from source').closest('button') as HTMLButtonElement;
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('disables the author button while busy', () => {
    render(<IndModuleAffordance module="2.5" productName="X" indication="Y" onAuthor={vi.fn()} busy />);
    const btn = screen.getByText('Authoring…').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('DocumentStudioPane — IND-module slot (flag gating)', () => {
  const draft = { title: 'Module 2.5 Clinical Overview', content: 'body', documentType: 'docx' };

  it('the studio flag ships off by default', () => {
    expect(isFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO')).toBe(false);
  });

  it('omits the IND-module panel when no indModule prop is passed (flag off path)', () => {
    render(<DocumentStudioPane draft={draft} onDownloadDocx={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText(/IND Module .* verified authoring/i)).toBeNull();
  });

  it('renders the IND-module panel only when the indModule prop is supplied (flag-on path)', () => {
    setFeatureEnabled('ENABLE_ANA_DOCUMENT_STUDIO', true);
    const onAuthor = vi.fn();
    render(
      <DocumentStudioPane
        draft={draft}
        onDownloadDocx={vi.fn()}
        onClose={vi.fn()}
        indModule={{ module: '2.5', productName: 'ABC-123', indication: 'AML', provenance: 'sample', onAuthor }}
      />,
    );
    expect(screen.getByText(/IND Module 2.5 — verified authoring/i)).toBeTruthy();
    fireEvent.click(screen.getByText('Author Module 2.5 from source'));
    expect(onAuthor).toHaveBeenCalledTimes(1);
  });
});
