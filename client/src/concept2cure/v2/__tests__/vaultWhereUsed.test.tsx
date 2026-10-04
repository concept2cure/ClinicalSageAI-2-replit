// @vitest-environment jsdom
/**
 * Where each Vault version is placed (VR-14a, rows D2 and D7). Each version in
 * the list names the submission sequences and sections whose leaves carry it,
 * with the leaf's operation, so a person revising it knows the next sequence
 * needs a replace. A version the server says is placed nowhere says so. When
 * the server did not say, the row claims nothing. An official eSTAR export whose
 * record names the version as an attachment is listed too (VR-14c); none reads
 * as nothing, because exports made before their records named a source are not
 * known. Server half: tests/db/vault-where-used.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { VaultVersions, estarText, placedInText } from '../surfaces/VaultVersions';

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

  it('names each official eSTAR export that attached a version, and claims nothing when there is none', async () => {
    const use = {
      record: 'audit', recordId: '41', exportedAt: '2026-10-01T18:05:00.000Z', slot: 'root.CoverLetter',
      chapter: '/CHAPTER 1/CH1.01/', fileName: 'Cover Letter.pdf',
      retainedAs: { documentId: 'd-9', documentCode: 'eSTAR-510k-device', version: '1.0' },
    };
    onVersions = () => ok({ versions: [version(V2, '2.0', true, []), { ...version(V1, '1.0', false, []), estarUses: [use] }] });
    mount();
    expect((await screen.findByTestId(`vault-version-estar-${V1}`)).textContent)
      .toBe(' · attached to the official eSTAR exported 2026-10-01 18:05 UTC, retained as eSTAR-510k-device v1.0 (/CHAPTER 1/CH1.01/)');
    expect(screen.getByTestId(`vault-version-estar-${V2}`).textContent).toBe('');
    expect(estarText([{ ...use, retainedAs: null, chapter: null }] as never)).toBe(' · attached to the official eSTAR exported 2026-10-01 18:05 UTC');
  });

  it('several placements read as one list', () => {
    expect(placedInText([leaf({}), leaf({ submissionTitle: null, submissionId: 9, sequenceNumber: null, sequenceStatus: null, sectionCode: '2.3' })] as never))
      .toBe(' · placed in IND 123456, sequence 0000, 3.2.P.8.1 (new; sequence dispatched); '
        + 'submission 9, sequence not numbered, 2.3 (new; sequence status not recorded)');
  });
});

/**
 * Said before a new version is checked in (VR-14): the current version is
 * placed in a sequence the agency does not yet hold, and once a later version
 * exists only that one is current, so the placed one could no longer be
 * transmitted from it. A sequence the agency holds, a Delete leaf (no content)
 * and a placement of an earlier version are not that case.
 */
describe('the check-in warning names the open sequences the current version is placed in', () => {
  const settled = () => screen.findByTestId(`vault-version-placed-${V2}`);

  it('W1 names the submission, the sequence and its status when that sequence is not yet sent', async () => {
    onVersions = () => ok({ versions: [
      version(V2, '2.0', true, [leaf({ sequenceNumber: '0001', sequenceStatus: 'frozen', dispatchStatus: 'pending' })]),
      version(V1, '1.0', false, []),
    ] });
    mount();
    const warning = await screen.findByTestId('vault-checkin-warning');
    expect(warning.textContent).toContain('IND 123456, sequence 0001 (frozen)');
    expect(warning.textContent).toContain('Version 2.0 is placed in 1 sequence not');
  });

  it('W2 says nothing when the agency already holds that sequence', async () => {
    onVersions = () => ok({ versions: [
      version(V2, '2.0', true, [leaf({ sequenceNumber: '0001', sequenceStatus: 'frozen', dispatchStatus: 'sent' })]),
    ] });
    mount();
    await settled();
    expect(screen.queryByTestId('vault-checkin-warning')).toBeNull();
  });

  it('W3 says nothing when the only leaf is a Delete, which carries no content', async () => {
    onVersions = () => ok({ versions: [
      version(V2, '2.0', true, [leaf({ sequenceStatus: 'draft', dispatchStatus: null, operation: 'delete' })]),
    ] });
    mount();
    await settled();
    expect(screen.queryByTestId('vault-checkin-warning')).toBeNull();
  });

  it('W4 says nothing when only an earlier version is placed', async () => {
    onVersions = () => ok({ versions: [
      version(V2, '2.0', true, []),
      version(V1, '1.0', false, [leaf({ sequenceStatus: 'draft', dispatchStatus: 'pending' })]),
    ] });
    mount();
    await settled();
    expect(screen.queryByTestId('vault-checkin-warning')).toBeNull();
  });
});
