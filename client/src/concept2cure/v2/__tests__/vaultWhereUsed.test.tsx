// @vitest-environment jsdom
/**
 * Where each Vault version is placed (VR-14a, rows D2 and D7). Each version in
 * the list names the submission sequences and sections whose leaves carry it,
 * with the leaf's operation, so a person revising it knows the next sequence
 * needs a replace. A version the server says is placed nowhere says so. When
 * the server did not say, the row claims nothing. Server half:
 * tests/db/vault-where-used.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { VaultVersions, placedInText } from '../surfaces/VaultVersions';

const PID = '11111111-1111-4111-8111-111111111111';
const V2 = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const leaf = (over: Record<string, unknown>) => ({
  leafId: 1, submissionId: 7, submissionTitle: 'IND 123456', applicationType: 'ind', sequenceId: 70,
  sequenceNumber: '0000', region: 'fda', sequenceStatus: 'dispatched', sectionCode: '3.2.P.8.1',
  leafTitle: 'Stability summary', operation: 'new', ...over,
});
const version = (id: string, v: string, current: boolean, placements?: unknown[]) => ({
  id, version: v, contentHash: (current ? 'b' : 'a').repeat(64), fileSize: 2048, fileName: 's.txt', uploader: 'Uma Uploader',
  uploaderId: 3, createdAt: '2026-09-30T10:00:00.000Z', current, link: 'none', lifecycle: null,
  ...(placements ? { placements } : {}),
});

let onVersions: () => Response;
beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => (url.endsWith('/versions') ? onVersions() : ok({})));
});
afterEach(cleanup);

const mount = () => render(
  <VaultVersions projectId={PID} documentId={V2} title="Stability summary" onDownload={vi.fn()} downloadingId=""
    onUploadNewVersion={vi.fn()} uploading={false} />,
);

describe('where each version is placed (VR-14a)', () => {
  it('names each sequence and section that carries a version, with the operation', async () => {
    onVersions = () => ok({ versions: [
      version(V2, '2.0', true, [leaf({ leafId: 2, sequenceId: 71, sequenceNumber: '0001', sequenceStatus: 'draft', operation: 'replace' })]),
      version(V1, '1.0', false, [leaf({})]),
    ] });
    mount();
    expect((await screen.findByTestId(`vault-version-placed-${V2}`)).textContent)
      .toBe(' · placed in IND 123456, sequence 0001, 3.2.P.8.1 (replace; sequence draft)');
    expect(screen.getByTestId(`vault-version-placed-${V1}`).textContent)
      .toBe(' · placed in IND 123456, sequence 0000, 3.2.P.8.1 (new; sequence dispatched)');
  });

  it('a version placed nowhere says so, and a row the server said nothing about claims nothing', async () => {
    onVersions = () => ok({ versions: [version(V2, '2.0', true, []), version(V1, '1.0', false)] });
    mount();
    expect((await screen.findByTestId(`vault-version-placed-${V2}`)).textContent).toBe(' · not placed in any submission');
    expect(screen.getByTestId(`vault-version-placed-${V1}`).textContent).toBe('');
  });

  it('several placements read as one list', () => {
    expect(placedInText([leaf({}), leaf({ submissionTitle: null, submissionId: 9, sequenceNumber: null, sequenceStatus: null, sectionCode: '2.3' })] as never))
      .toBe(' · placed in IND 123456, sequence 0000, 3.2.P.8.1 (new; sequence dispatched); '
        + 'submission 9, sequence not numbered, 2.3 (new; sequence status not recorded)');
  });
});
