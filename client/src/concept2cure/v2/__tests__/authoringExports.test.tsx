// @vitest-environment jsdom
/**
 * The Exports rail — is the file someone exported still this document?
 *
 * `authoring_export_history` has accrued a row per export since the store
 * shipped, each carrying `doc_sha256`: the document's content hash at that
 * moment. Three endpoints read it and none had a caller, so the product could
 * hand a regulatory author a Word file and never tell them it had gone stale.
 *
 * The trap these tests exist to hold shut is the null one. The server sends
 * `content_changed_since_last_export: null` when there is nothing to compare
 * against — no export yet, or a row stored without a hash. A `?? false`
 * anywhere on that path renders "nothing to compare" as "nothing has changed",
 * which tells an author their stale file is current. That is the worst thing
 * this rail could say, and it is one keystroke away at all times.
 *
 * The second is scope creep in the wording: the hash covers section codes and
 * content. Citation drift is a DIFFERENT question with a different answer, and
 * the two must not merge into one "out of date" badge.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import {
  AuthoringExports,
  describeStaleness,
  formatSize,
  type ExportRecord,
} from '../surfaces/AuthoringExports';

const res = (status: number, payload: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => payload }) as Response;
const rejects = (status: number, message: string) => () =>
  Promise.reject(new ApiRequestError(message, status, { error: message }));

const EXPORT_ROW = (over: Partial<ExportRecord> = {}): ExportRecord => ({
  id: 'X1',
  document_id: 'D1',
  export_type: 'docx',
  exported_by: 'ra@example.test',
  exported_at: '2026-08-20T09:00:00Z',
  file_name: 'quality-overall-summary.docx',
  file_size: 20480,
  doc_sha256: 'aaaa1111bbbb2222cccc3333',
  ...over,
});

/** The exports read, with the drift read defaulting to "no baseline". */
function wire(exportsPayload: unknown, driftPayload: unknown = { baseline: null, changed: [] }) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.includes('/diff-since-export')) return res(200, driftPayload);
    return res(200, exportsPayload);
  });
}

const OK = (over: Record<string, unknown> = {}) => ({
  success: true,
  exports: [EXPORT_ROW()],
  total: 1,
  last_export: EXPORT_ROW(),
  current_content_hash: 'aaaa1111bbbb2222cccc3333',
  content_changed_since_last_export: false,
  ...over,
});

/* Block body, deliberately. `mockReset()` returns the mock, and an arrow with
   an expression body would hand that back to Vitest — which treats a function
   returned from beforeEach as the test's teardown hook and duly calls it with
   no arguments. The mock then runs a third time per test with `url` undefined,
   inside afterEach, and every assertion downstream fails on a TypeError that
   has nothing to do with the component. */
beforeEach(() => {
  apiRequest.mockReset();
});
afterEach(() => cleanup());

/* ── The verdict, as a decision ─────────────────────────────────────────── */
describe('describeStaleness', () => {
  it('reports "cannot be checked" — never "unchanged" — when there is nothing to compare', () => {
    const v = describeStaleness(EXPORT_ROW({ doc_sha256: null }), null);
    expect(v.kind).toBe('uncheckable');
    expect(v.text).toMatch(/cannot be checked/i);
    // The failure this guards: null collapsing into the "matches" sentence.
    expect(v.text).not.toMatch(/matches the current/i);
  });

  it('says the exported file is not this document when the text drifted', () => {
    const v = describeStaleness(EXPORT_ROW(), true);
    expect(v.kind).toBe('drifted');
    expect(v.text).toMatch(/changed since the last export/i);
    expect(v.text).toMatch(/does not have this document/i);
  });

  it('states what the match actually covers, rather than implying the whole record', () => {
    const v = describeStaleness(EXPORT_ROW(), false);
    expect(v.kind).toBe('current');
    expect(v.text).toMatch(/matches the current section text/i);
    // A bare "up to date" would be read as covering citations and signatures.
    expect(v.text).toMatch(/not citations, attachments or signatures/i);
  });

  it('never-exported is its own state, not a stale one', () => {
    const v = describeStaleness(null, null);
    expect(v.kind).toBe('never-exported');
    expect(v.text).toMatch(/has not been exported/i);
  });
});

describe('formatSize', () => {
  it('returns null for unknown — never "0 B", which is a real size', () => {
    expect(formatSize(null)).toBeNull();
    expect(formatSize(undefined)).toBeNull();
    expect(formatSize(-1)).toBeNull();
    expect(formatSize(0)).toBe('0 B');
  });

  it('scales to KB and MB', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(20480)).toBe('20 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

/* ── The rail ───────────────────────────────────────────────────────────── */
describe('AuthoringExports', () => {
  it('treats a MISSING content_changed field as unknown, not as unchanged', async () => {
    // An older server that does not send the field at all.
    wire({
      success: true,
      exports: [EXPORT_ROW()],
      total: 1,
      last_export: EXPORT_ROW(),
      current_content_hash: 'ffff',
    });
    render(<AuthoringExports docId="D1" />);

    const v = await screen.findByTestId('exports-verdict');
    expect(v.getAttribute('data-verdict')).toBe('uncheckable');
    expect(v.textContent).not.toMatch(/matches the current section text/i);
  });

  it('renders a drifted document as drifted', async () => {
    wire(OK({ content_changed_since_last_export: true, current_content_hash: 'dddd' }));
    render(<AuthoringExports docId="D1" />);

    const v = await screen.findByTestId('exports-verdict');
    expect(v.getAttribute('data-verdict')).toBe('drifted');
    expect(screen.getByTestId('export-row').textContent).toMatch(/quality-overall-summary\.docx/);
  });

  it('a failed read is a failure to READ — never "never exported"', async () => {
    apiRequest.mockImplementation(rejects(500, 'Failed to list exports'));
    render(<AuthoringExports docId="D1" />);

    const err = await screen.findByTestId('exports-error');
    expect(err.textContent).toMatch(/failed read, not an empty history/i);
    expect(screen.queryByTestId('exports-verdict')).toBeNull();
    expect(screen.queryByTestId('exports-empty')).toBeNull();
  });

  it('an honest empty history is an empty, not an error', async () => {
    wire({
      success: true,
      exports: [],
      total: 0,
      last_export: null,
      current_content_hash: 'aaaa',
      content_changed_since_last_export: null,
    });
    render(<AuthoringExports docId="D1" />);

    expect((await screen.findByTestId('exports-verdict')).getAttribute('data-verdict')).toBe(
      'never-exported',
    );
    expect(screen.getByTestId('exports-empty')).toBeTruthy();
    expect(screen.queryByTestId('exports-error')).toBeNull();
  });

  it('keeps citation drift visibly separate from the text comparison', async () => {
    wire(OK(), {
      baseline: '2026-08-20T09:00:00Z',
      count: 2,
      changed: [
        { id: 'c1', section_id: 'S1', section_code: '3.2.S.1', section_title: 'General', citation_text: 'Stability report v3', source: 'dataroom', created_by: 'ra', created_at: '2026-08-21T10:00:00Z' },
        { id: 'c2', section_id: 'S2', section_code: '3.2.P.8', section_title: 'Stability', citation_text: 'Batch record 44', source: 'dataroom', created_by: 'ra', created_at: '2026-08-22T10:00:00Z' },
      ],
    });
    render(<AuthoringExports docId="D1" />);

    const drift = await screen.findByTestId('exports-citation-drift');
    expect(drift.textContent).toMatch(/2 citations added since the last export/i);
    // The whole point: it is not the same claim as the hash comparison.
    expect(drift.textContent).toMatch(/separate from the text check/i);
    expect(drift.textContent).toMatch(/3\.2\.S\.1/);
    // ...and the text verdict is untouched by it.
    expect(screen.getByTestId('exports-verdict').getAttribute('data-verdict')).toBe('current');
  });

  it('accepts the drift endpoint’s response, which carries no success field', async () => {
    wire(OK(), { baseline: '2026-08-20T09:00:00Z', count: 1, changed: [
      { id: 'c1', section_id: 'S1', section_code: '3.2.S.1', section_title: 'General', citation_text: 'Ref A', source: 'dataroom', created_by: 'ra', created_at: '2026-08-21T10:00:00Z' },
    ] });
    render(<AuthoringExports docId="D1" />);
    // Checking for `success` here would reject every good response it sends.
    await waitFor(() => expect(screen.getByTestId('exports-citation-drift')).toBeTruthy());
  });

  it('re-reads when the host reports a save or an export', async () => {
    wire(OK());
    const { rerender } = render(<AuthoringExports docId="D1" refreshKey={0} />);
    await screen.findByTestId('exports-verdict');
    const first = apiRequest.mock.calls.length;

    wire(OK({ content_changed_since_last_export: true }));
    rerender(<AuthoringExports docId="D1" refreshKey={1} />);

    await waitFor(() =>
      expect(screen.getByTestId('exports-verdict').getAttribute('data-verdict')).toBe('drifted'),
    );
    expect(apiRequest.mock.calls.length).toBeGreaterThan(first);
  });
});
