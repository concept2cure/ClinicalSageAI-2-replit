// @vitest-environment jsdom
/**
 * The placement dialog says what the chosen section already holds (QA j3 finding (a), 2026-10-08).
 *
 * A second New leaf for another document in the same section is allowed (the product's
 * readiness check reports it as info, not an error), so the dialog says so before the
 * click and places it. Placing the SAME document into the same section again changes
 * nothing, so the dialog says that and does not offer the placement. Before this, the
 * dialog gave no notice either way, and the person could file the same file twice.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { VaultPlaceIntoSubmission } from '../surfaces/VaultPlaceIntoSubmission';

const OPEN = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const OTHER_DOC = '33333333-3333-4333-8333-333333333333';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const SEQ = { id: 6, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'fda' };

function leaf(id: number, documentUuid: string, lifecycleOp = 'new') {
  return {
    id, sectionCode: '3.2.S.4.1', lifecycleOp, documentTable: 'vault_documents', documentUuid,
    documentId: null, title: `Leaf ${id}`, deletedAt: null,
  };
}

function serve(leaves: unknown[]) {
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    const path = url.split('?')[0];
    if (path === '/api/submissions') return ok([{ id: 1, title: 'Vorelinib IND', applicationType: 'ind', primaryRegion: 'fda', status: 'draft', programId: OPEN }]);
    if (path === '/api/submissions/1/sequences') return ok([SEQ]);
    if (path === '/api/submissions/sequences/6/leaves') return ok(leaves);
    return ok([]);
  });
}

async function chooseSectionAndSubmission(section: string) {
  render(<VaultPlaceIntoSubmission projectId={OPEN} documentUuid={DOC} documentTitle="Vorelinib-DS-Specification-J3-r2" mimeType="application/pdf" onClose={vi.fn()} />);
  await waitFor(() => expect(document.querySelector('#vpf-sub')).not.toBeNull());
  fireEvent.change(document.querySelector('#vpf-sub') as HTMLSelectElement, { target: { value: '1' } });
  await waitFor(() => expect(document.querySelector('#vpf-seq')).not.toBeNull());
  fireEvent.change(document.querySelector('#vpf-section') as HTMLInputElement, { target: { value: section } });
  fireEvent.change(document.querySelector('#vpf-reason') as HTMLTextAreaElement, { target: { value: 'Final specification for sequence 0000' } });
}

const placeButton = () => screen.getByRole('button', { name: 'Place into submission' }) as HTMLButtonElement;

beforeEach(() => {
  apiRequest.mockReset();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: OPEN, title: 'Vorelinib' };
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('the placement dialog and what the section already holds', () => {
  it('says that another document already holds the section, and still allows the placement as a second New leaf', async () => {
    serve([leaf(53, OTHER_DOC)]);
    await chooseSectionAndSubmission('3.2.S.4.1');

    expect(await screen.findByText(/Section 3\.2\.S\.4\.1 already holds 1 leaf in sequence 0000/)).toBeTruthy();
    expect(placeButton().disabled).toBe(false);
  });

  it('says that this document is already placed at that section, and does not offer to place it again', async () => {
    serve([leaf(54, DOC)]);
    await chooseSectionAndSubmission('3.2.S.4.1');

    expect(await screen.findByText(/This document is already placed at 3\.2\.S\.4\.1 in sequence 0000 as New/)).toBeTruthy();
    expect(placeButton().disabled).toBe(true);
  });

  it('when the same document is already placed there under another operation, it says how to change that, and does not offer the placement', async () => {
    serve([leaf(54, DOC, 'new')]);
    await chooseSectionAndSubmission('3.2.S.4.1');
    fireEvent.change(document.querySelector('#vpf-op') as HTMLSelectElement, { target: { value: 'replace' } });

    expect(await screen.findByText(/To place it as Replace, remove that leaf first/)).toBeTruthy();
    expect(placeButton().disabled).toBe(true);
  });

  it('says nothing about occupancy when the section is free', async () => {
    serve([]);
    await chooseSectionAndSubmission('3.2.S.4.1');

    await waitFor(() => expect(placeButton().disabled).toBe(false));
    expect(screen.queryByText(/already holds|already placed/)).toBeNull();
  });
});
