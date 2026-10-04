// @vitest-environment jsdom
/**
 * The Review surface offers an artifact's review record to the people the
 * export serves, downloads exactly what the server sent, and says so when the
 * server refuses (row D5, 2026-10-01, slice 4). The server side, including the
 * refusal when the export cannot be recorded, runs on PostgreSQL in
 * tests/db/review-record-export.dbtest.ts.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const m = vi.hoisted(() => ({ apiRequest: vi.fn(), downloadBlob: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({
  apiRequest: m.apiRequest,
  serverMessage: (p: { error?: { message?: string } } | null) => p?.error?.message ?? null,
  ApiRequestError: class ApiRequestError extends Error {
    payload: unknown;
  },
}));
vi.mock('../download', () => ({ downloadBlob: m.downloadBlob, safeFileName: (s: string) => s }));

import { ExportReviewRecord } from '../surfaces/ReviewThreads';

const thread = { threadId: 't-1', title: 'Section 12', artifactId: 'art-302', projectId: 41 };

afterEach(() => {
  cleanup();
  m.apiRequest.mockReset();
  m.downloadBlob.mockReset();
});

describe('Export review record', () => {
  it('downloads what the server sent, from the artifact’s export, and says it is recorded', async () => {
    m.apiRequest.mockResolvedValue(new Response('{"format":"review-record-export/1"}', { status: 200 }));
    m.downloadBlob.mockReturnValue(true);
    const notice = vi.fn();
    render(<ExportReviewRecord thread={thread} onNotice={notice} />);
    fireEvent.click(screen.getByRole('button', { name: /Export review record/ }));
    await waitFor(() => expect(notice).toHaveBeenCalled());
    expect(m.apiRequest).toHaveBeenCalledWith('GET', '/api/concept2cure/projects/41/artifacts/art-302/review-record/export');
    expect(m.downloadBlob.mock.calls[0][0]).toBe('review-record-art-302.json');
    expect(notice).toHaveBeenCalledWith('Review record exported. The export is recorded in the audit trail.');
  });

  it('a refusal is reported in the server’s words, and nothing is downloaded', async () => {
    m.apiRequest.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'The export was refused because it could not be recorded in the audit trail. Nothing was exported.' } }),
        { status: 503 },
      ),
    );
    const notice = vi.fn();
    render(<ExportReviewRecord thread={thread} onNotice={notice} />);
    fireEvent.click(screen.getByRole('button', { name: /Export review record/ }));
    await waitFor(() => expect(notice).toHaveBeenCalled());
    expect(m.downloadBlob).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(
      'The review record was not exported. The export was refused because it could not be recorded in the audit trail. Nothing was exported.',
      'error',
    );
  });

  it('a thread without its document is offered no export', () => {
    const { container } = render(<ExportReviewRecord thread={{ ...thread, artifactId: null }} onNotice={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});
