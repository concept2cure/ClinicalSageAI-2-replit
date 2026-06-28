// @vitest-environment jsdom
/**
 * Tests for the AnA Document Studio surfaces:
 *   - VerificationPanel  — the "verified against your source" trust-panel
 *     (the UI for the 12th doc-surgery move).
 *   - DocumentStudioPane — the split-pane preview header + download + body.
 *
 * Plain DOM assertions (no jest-dom) to match the sibling tests in this dir.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { VerificationPanel } from '../VerificationPanel';
import { DocumentStudioPane } from '../DocumentStudioPane';
import type { VerificationResult } from '../useAnaChat';

afterEach(cleanup);

describe('VerificationPanel', () => {
  it('shows a verified verdict with the confirmed-string count and a live region', () => {
    const v: VerificationResult = {
      ok: true,
      missingRequiredStrings: [],
      requiredStringsChecked: 3,
      message: 'Verified',
    };
    render(<VerificationPanel verification={v} />);
    expect(screen.getByText('Verified against your source')).toBeTruthy();
    expect(screen.getByText(/3 of 3 required strings present verbatim/)).toBeTruthy();
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.getAttribute('data-status')).toBe('verified');
  });

  it('shows an unverified verdict and lists the missing caption strings', () => {
    const v: VerificationResult = {
      ok: false,
      missingRequiredStrings: ['IN THE SUPERIOR COURT OF KING COUNTY'],
      requiredStringsChecked: 2,
      divergence: { additions: 4, deletions: 1 },
    };
    render(<VerificationPanel verification={v} />);
    expect(screen.getByText('Not verified against your source')).toBeTruthy();
    // 1 of 2 confirmed (2 checked − 1 missing).
    expect(screen.getByText(/1 of 2 required strings present verbatim/)).toBeTruthy();
    expect(screen.getByText(/4 added \/ 1 dropped line vs\. source/)).toBeTruthy();
    expect(screen.getByText('IN THE SUPERIOR COURT OF KING COUNTY')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('unverified');
  });
});

describe('DocumentStudioPane', () => {
  const draft = { title: 'Smith objections final v3', content: '# Heading\n\nBody text.', documentType: 'docx' };

  it('renders the title, format, and document body', () => {
    render(<DocumentStudioPane draft={draft} onDownloadDocx={() => {}} onClose={() => {}} />);
    expect(screen.getByText('Smith objections final v3')).toBeTruthy();
    expect(screen.getByText('· DOCX')).toBeTruthy();
    expect(screen.getByText('Body text.')).toBeTruthy();
  });

  it('embeds the verification panel when a verification is present', () => {
    render(
      <DocumentStudioPane
        draft={draft}
        verification={{ ok: true, missingRequiredStrings: [], requiredStringsChecked: 1 }}
        onDownloadDocx={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Verified against your source')).toBeTruthy();
  });

  it('fires download and close handlers', () => {
    const onDownloadDocx = vi.fn();
    const onClose = vi.fn();
    render(<DocumentStudioPane draft={draft} onDownloadDocx={onDownloadDocx} onClose={onClose} />);
    fireEvent.click(screen.getByText('Download as DOCX'));
    fireEvent.click(screen.getByLabelText('Close preview'));
    expect(onDownloadDocx).toHaveBeenCalledWith(draft);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('reflects the downloading state on the button', () => {
    render(<DocumentStudioPane draft={draft} downloading onDownloadDocx={() => {}} onClose={() => {}} />);
    const btn = screen.getByText('Preparing…').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
