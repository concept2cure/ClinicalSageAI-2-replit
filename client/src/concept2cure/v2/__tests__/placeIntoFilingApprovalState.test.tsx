// @vitest-environment jsdom
/**
 * Placement states the filing copy's status (docs/design/FILING_SPINE.md F17).
 *
 * Placing an authored document files a copy of it (coauthor_documents), and
 * the copy's status is fixed from the source's at the moment of placement
 * (server/services/coauthor/coauthor-snapshot.ts): APPROVED -> approved,
 * FROZEN -> finalized, anything else -> draft. Only an approved copy is
 * released: freeze, dispatch and transmit refuse a sequence with any leaf
 * whose document is not approved (server/services/ectd/dispatch-gate.ts,
 * evaluateReleaseApprovalGate; leaf-source-resolver.ts, DP-35).
 *
 * Nothing in the dialog said so. A draft placed today stays a draft copy after
 * the document is approved. Placing it again re-takes the same copy as
 * approved, but the server answers "Already placed … Nothing was written" and
 * the leaf keeps the content pin it took from the draft.
 *
 * After F17:
 *   - before placing, the dialog says what the copy will be filed as;
 *   - after placing, it states the server's copy status, and a copy that is
 *     not approved carries the freeze refusal;
 *   - where the document was already placed and its copy is now approved, it
 *     offers "Re-place approved version": the same leaf, rewritten by id
 *     through PUT /sequences/:seqId/leaves, so it is re-pinned to the approved
 *     text.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuthoringPlaceIntoFiling } from '../surfaces/AuthoringPlaceIntoFiling';

const REASON = 'Clinical summary approved for sequence 0000';
const SUBS = [{ id: 9, title: 'ZX-9 First-in-Human', applicationType: 'ind', primaryRegion: 'fda', status: 'active' }];
const SEQS = [{ id: 31, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'fda' }];
const SECTIONS = { success: true, sections: [{ code: '2.7.3', title: 'Summary of Clinical Efficacy', content: 'ORR 38.6%.' }] };

type Call = { method: string; url: string; body?: unknown };

function mockApi(copyStatus: string | undefined, leafAnswers: Array<Record<string, unknown>>) {
  const calls: Call[] = [];
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const ok = (data: unknown, status = 200) => ({ ok: true, status, json: async () => data }) as Response;
    if (method === 'GET' && url === '/api/submissions') return ok(SUBS);
    if (method === 'GET' && url === '/api/submissions/9/sequences') return ok(SEQS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'POST' && String(url).split('?')[0] === '/api/coauthor/documents') {
      calls.push({ method, url, body });
      return ok({ success: true, document: { id: 501, status: copyStatus, metadata: { source: 'authoring-document', docId: 'D1' } } }, 201);
    }
    if (method === 'PUT' && url === '/api/submissions/sequences/31/leaves') {
      calls.push({ method, url, body });
      const answer = leafAnswers.shift() ?? {};
      return ok({
        id: 77, sequenceId: 31, documentTable: 'coauthor_documents', documentId: 501, sectionCode: '2.7.3',
        title: 'M2.7 Clinical Summary', lifecycleOp: 'new', auditTrail: { persisted: true, chained: true }, ...answer,
      });
    }
    return ok([]);
  });
  return calls;
}

function renderDialog(docStatus?: string | null) {
  render(
    <AuthoringPlaceIntoFiling
      docId="D1"
      docTitle="M2.7 Clinical Summary"
      activeSectionCode="2.7.3"
      docStatus={docStatus}
      dirty={false}
      onNav={vi.fn()}
      fireToast={vi.fn()}
    />,
  );
}

async function openAndTarget() {
  fireEvent.click(screen.getByRole('button', { name: /Place into filing/ }));
  await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
  fireEvent.change(screen.getByLabelText('Target submission'), { target: { value: '9' } });
  await waitFor(() => expect(document.body.textContent).toContain('0000'));
  fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: REASON } });
}

const copyLine = () => screen.getByTestId('apf-copy-status').textContent ?? '';

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('Place into filing states what the filing copy is (F17)', () => {
  it('a draft document: "Filed as draft. Freeze will refuse it until you re-place it after approval."', async () => {
    mockApi('draft', []);
    renderDialog('DRAFT');
    await openAndTarget();
    expect(copyLine()).toContain('Filed as draft. Freeze will refuse it until you re-place it after approval.');
  });

  it('a document in review is filed as a draft too', async () => {
    mockApi('draft', []);
    renderDialog('IN_REVIEW');
    await openAndTarget();
    expect(copyLine()).toContain('Filed as draft.');
  });

  it('a frozen, unsigned document is filed as finalized, which freeze also refuses', async () => {
    mockApi('finalized', []);
    renderDialog('FROZEN');
    await openAndTarget();
    expect(copyLine()).toMatch(/Filed as finalized, not approved\. Freeze will refuse it until you re-place it after approval\./);
  });

  it('an approved document: filed as approved, with no refusal', async () => {
    mockApi('approved', []);
    renderDialog('APPROVED');
    await openAndTarget();
    expect(copyLine()).toContain('Filed as approved');
    expect(copyLine()).not.toMatch(/refuse/);
  });

  it('an unknown state claims neither: it states the rule', async () => {
    mockApi(undefined, []);
    renderDialog(null);
    await openAndTarget();
    expect(copyLine()).not.toMatch(/Filed as (draft|approved|finalized)/);
    expect(copyLine()).toMatch(/only an approved copy/i);
  });

  it("after placing, the server's copy status is stated, and a draft copy carries the refusal", async () => {
    mockApi('draft', [{}]);
    renderDialog('DRAFT');
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() => expect(document.body.textContent).toContain('server-confirmed (leaf #77'));
    expect(document.body.textContent).toMatch(/The filing copy is a draft\. Freeze will refuse it until you re-place it after approval\./);
  });

  it('already placed, and the copy is now approved: "Re-place approved version" rewrites the same leaf by id', async () => {
    const calls = mockApi('approved', [{ unchanged: true }, {}]);
    renderDialog('APPROVED');
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() => expect(document.body.textContent).toContain('Already placed'));

    fireEvent.click(await screen.findByRole('button', { name: 'Re-place approved version' }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Re-placed: leaf #77 at 2\.7\.3 now holds the approved version/));

    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(2);
    expect(puts[1].body).toEqual({
      leafId: 77,
      sectionCode: '2.7.3',
      title: 'M2.7 Clinical Summary',
      lifecycleOp: 'new',
      documentTable: 'coauthor_documents',
      documentId: 501,
      reason: REASON,
    });
  });

  it('already placed with a draft copy: no re-place is offered, and the refusal is stated', async () => {
    mockApi('draft', [{ unchanged: true }]);
    renderDialog('DRAFT');
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() => expect(document.body.textContent).toContain('Already placed'));
    expect(screen.queryByRole('button', { name: 'Re-place approved version' })).toBeNull();
    expect(document.body.textContent).toMatch(/The filing copy is a draft\./);
  });
});
