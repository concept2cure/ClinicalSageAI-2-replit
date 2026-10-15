// @vitest-environment jsdom
/**
 * Compare two versions of a Vault document (plan critique 15, row D2).
 *
 * An earlier version offers "Compare with" the current one. The comparison
 * says whether the bytes are the same, names each recorded detail that
 * changed, and shows the changed lines marked + and − (not by colour alone),
 * with unchanged runs collapsed. A comparison that could not be read is an
 * error, never an empty difference. Server half:
 * tests/db/vault-version-compare.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { VaultVersions } from '../surfaces/VaultVersions';
import { textSummary } from '../surfaces/VaultVersionCompare';

const PID = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const version = (id: string, v: string, current: boolean) => ({
  id, version: v, contentHash: (current ? 'b' : 'a').repeat(64), fileSize: 2048, fileName: 's.txt', uploader: 'Uma Uploader',
  uploaderId: 3, createdAt: '2026-09-30T10:00:00.000Z', current, link: current ? 'verified' : 'none', lifecycle: null,
});

const comparison = {
  from: { id: V1, version: '1.0', contentHash: 'a'.repeat(64), current: false },
  to: { id: V2, version: '2.0', contentHash: 'b'.repeat(64), current: true },
  sameBytes: false,
  details: [{ field: 'title', from: 'Stability protocol', to: 'Stability protocol, revised' }],
  text: {
    available: true, identical: false, truncated: false,
    counts: { added: 2, removed: 1, unchanged: 39 },
    hunks: [
      { kind: 'skipped', count: 16 },
      { kind: 'same', lines: ['Section 17', 'Section 18', 'Section 19'] },
      { kind: 'removed', lines: ['Section 20: 24 months.'] },
      { kind: 'added', lines: ['Section 20: 36 months.', 'Section 41: added.'] },
    ],
  },
};

let onCompare: () => Response;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url.endsWith('/versions')) return ok({ versions: [version(V2, '2.0', true), version(V1, '1.0', false)] });
    if (url.includes('/compare?against=')) return onCompare();
    return ok({});
  });
});
afterEach(cleanup);

function mount() {
  render(
    <VaultVersions
      projectId={PID} documentId={V2} title="Stability protocol" onDownload={vi.fn()} downloadingId=""
      onUploadNewVersion={vi.fn()} uploading={false}
    />,
  );
}

describe('compare two versions (critique 15)', () => {
  it('an earlier version compares with the current one: bytes, details and the changed lines', async () => {
    onCompare = () => ok(comparison);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Compare with v2.0' }));
    const panel = await screen.findByTestId('vault-version-compare');
    expect(await within(panel).findByText('v1.0 → v2.0 (current)')).toBeTruthy();
    expect(apiRequest).toHaveBeenCalledWith('GET', `/api/c2c/project-vault/${PID}/documents/${V2}/compare?against=${V1}`);
    expect(panel.textContent).toContain('Different bytes: the SHA-256 differs.');
    expect(panel.textContent).toContain('Title: “Stability protocol” → “Stability protocol, revised”');
    expect(within(panel).getByRole('status').textContent).toBe('2 lines added, 1 line removed, 39 lines unchanged.');
    const lines = within(panel).getAllByRole('listitem').map((li) => li.textContent);
    expect(lines).toContain('… 16 unchanged lines …');
    expect(lines).toContain('− Section 20: 24 months.');
    expect(lines).toContain('+ Section 20: 36 months.');
    fireEvent.click(within(panel).getByRole('button', { name: 'Close comparison' }));
    expect(screen.queryByTestId('vault-version-compare')).toBeNull();
  });

  it('the current version offers no comparison with itself', async () => {
    onCompare = () => ok(comparison);
    mount();
    await screen.findByRole('button', { name: 'Compare with v2.0' });
    expect(screen.getAllByRole('button', { name: /^Compare with/ })).toHaveLength(1);
  });

  it('a comparison that could not be read is an error, not an empty difference', async () => {
    onCompare = () => { throw new ApiRequestError('Failed', 500, { error: 'COMPARE_UNAVAILABLE' }, 'COMPARE_UNAVAILABLE'); };
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Compare with v2.0' }));
    const panel = await screen.findByTestId('vault-version-compare');
    expect((await within(panel).findByRole('alert')).textContent).toContain('could not be compared');
  });

  it('text that could not be compared says why; a capped comparison says so', () => {
    expect(textSummary({ available: false, reason: 'No text was read from v1.0, so the text cannot be compared.' }))
      .toBe('No text was read from v1.0, so the text cannot be compared.');
    expect(textSummary({ available: true, identical: false, truncated: true, counts: { added: 1, removed: 0, unchanged: 5 }, hunks: [] }))
      .toBe('1 line added, 0 lines removed, 5 lines unchanged. The comparison was capped; download both versions to see all of it.');
  });
});
