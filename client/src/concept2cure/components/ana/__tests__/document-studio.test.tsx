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
import { VerificationPanel, composeVerificationFixMessage } from '../VerificationPanel';
import { DocumentStudioPane, paginateContent } from '../DocumentStudioPane';
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

  it('offers "Ask AnA to resolve" only when unverified and a handler is given', () => {
    const onResolve = vi.fn();
    const { rerender } = render(
      <VerificationPanel
        verification={{ ok: false, missingRequiredStrings: ['CAPTION'], requiredStringsChecked: 1 }}
        onResolve={onResolve}
      />,
    );
    fireEvent.click(screen.getByText('Ask AnA to resolve'));
    expect(onResolve).toHaveBeenCalledTimes(1);

    // Verified → no resolve action.
    rerender(
      <VerificationPanel
        verification={{ ok: true, missingRequiredStrings: [], requiredStringsChecked: 1 }}
        onResolve={onResolve}
      />,
    );
    expect(screen.queryByText('Ask AnA to resolve')).toBeNull();
  });

  it('hides the resolve action when no handler is provided', () => {
    render(
      <VerificationPanel verification={{ ok: false, missingRequiredStrings: ['X'], requiredStringsChecked: 1 }} />,
    );
    expect(screen.queryByText('Ask AnA to resolve')).toBeNull();
  });
});

describe('composeVerificationFixMessage', () => {
  it('cites the missing strings and the divergence', () => {
    const msg = composeVerificationFixMessage('Smith objections v3', {
      ok: false,
      missingRequiredStrings: ['IN THE SUPERIOR COURT', 'penalty of perjury'],
      requiredStringsChecked: 2,
      divergence: { additions: 3, deletions: 1 },
    });
    expect(msg).toContain('"Smith objections v3" failed verification');
    expect(msg).toContain('"IN THE SUPERIOR COURT", "penalty of perjury"');
    expect(msg).toContain('3 added and 1 dropped line(s)');
    expect(msg).toContain('re-verify');
  });

  it('omits the divergence sentence when there is none', () => {
    const msg = composeVerificationFixMessage('Doc', {
      ok: false,
      missingRequiredStrings: ['A'],
      requiredStringsChecked: 1,
    });
    expect(msg).toContain('"A"');
    expect(msg).not.toContain('dropped line');
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

  it('hides the version picker and pager for a single short version', () => {
    render(<DocumentStudioPane draft={draft} versionCount={1} onDownloadDocx={() => {}} onClose={() => {}} />);
    expect(screen.queryByLabelText('Document version')).toBeNull();
    expect(screen.queryByText(/Page \d+ \//)).toBeNull();
  });

  it('shows a version dropdown (latest selected) and switches versions', () => {
    const onSelectVersion = vi.fn();
    render(
      <DocumentStudioPane
        draft={draft}
        versionCount={3}
        activeVersionIndex={2}
        onSelectVersion={onSelectVersion}
        onDownloadDocx={() => {}}
        onClose={() => {}}
      />,
    );
    const select = screen.getByLabelText('Document version') as HTMLSelectElement;
    expect(select.value).toBe('2');
    expect(screen.getByText('v3 (latest)')).toBeTruthy();
    fireEvent.change(select, { target: { value: '0' } });
    expect(onSelectVersion).toHaveBeenCalledWith(0);
  });

  it('paginates a long document and navigates pages', () => {
    const long = Array.from({ length: 6 }, (_, i) => `Paragraph ${i} ${'x'.repeat(400)}`).join('\n\n');
    render(
      <DocumentStudioPane
        draft={{ title: 'Long', content: long }}
        pageSize={500}
        onDownloadDocx={() => {}}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Page 1 \/ 6/)).toBeTruthy();
    const prev = screen.getByLabelText('Previous page') as HTMLButtonElement;
    const next = screen.getByLabelText('Next page') as HTMLButtonElement;
    expect(prev.disabled).toBe(true); // first page
    fireEvent.click(next);
    expect(screen.getByText(/Page 2 \/ 6/)).toBeTruthy();
  });
});

describe('paginateContent', () => {
  it('returns a single page for short content', () => {
    expect(paginateContent('one\n\ntwo', 2000)).toEqual(['one\n\ntwo']);
  });

  it('splits at paragraph boundaries when over the page size', () => {
    const pages = paginateContent(['a'.repeat(300), 'b'.repeat(300), 'c'.repeat(300)].join('\n\n'), 400);
    expect(pages.length).toBe(3);
    expect(pages[0]).toBe('a'.repeat(300));
  });

  it('never cuts a single oversized paragraph mid-block', () => {
    const big = 'z'.repeat(1000);
    const pages = paginateContent(big, 400);
    expect(pages).toEqual([big]);
  });

  it('returns one empty page for empty content', () => {
    expect(paginateContent('', 400)).toEqual(['']);
  });
});
