// @vitest-environment jsdom
/**
 * A CSR's approving reviewer can complete its scientific review in the review
 * decision, and the approval carries the map (surfaces/CsrEvidenceReview.tsx).
 *
 * The server refused every approval of a document it recognises as a CSR
 * without a `csr_evidence` map (CSR_SCIENTIFIC_REVIEW_REQUIRED,
 * server/services/authoring/csr-scientific-review.ts), and no screen could
 * send one. So a CSR could not be approved, signed, frozen, exported or filed
 * through the product (CSR path review, 2026-10-29).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { clearAuthToken, setAuthToken } from '@/utils/authToken';
import type { AuthoringReviewContext } from '@shared/authoring/peer-review';
import type { RetainedScientificRun } from '@shared/authoring/csr-scientific-review';
import { actorToken, PEER_DOC, peerContext, peerRead, peerReceipt } from './peerReviewFixtures';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), user: { id: 7, organizationId: 7 } }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => mocks.user }));
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: mocks.apiRequest }));
import { ReviewDecisionDialog } from '../surfaces/ReviewDecisionDialog';

const PROGRAM = '6f1c2a7e-9c41-4b6a-8d3e-2f0a1b2c3d4e';
const RUN = '0b6f2f5e-8a1c-4d3e-9f20-1a2b3c4d5e6f';
const S_EFF = '3f2c1a10-0000-4000-8000-000000000201';
const S_ETH = '3f2c1a10-0000-4000-8000-000000000202';

const csrContext: AuthoringReviewContext = {
  ...peerContext,
  snapshot: { id: PEER_DOC, title: 'LMN-201 RePreve Clinical Study Report', module: 'M5', locale: 'en', productCode: 'LMN-201', version: 2,
    sections: [
      { id: S_EFF, code: '11.4', title: 'Efficacy results', content: '<p>Global cure occurred in 10/12 LMN-201 participants and 4/11 on placebo.</p>' },
      { id: S_ETH, code: '5', title: 'Ethics', content: '<p>The protocol was approved by each IRB.</p>' },
    ] },
};
const runs: RetainedScientificRun[] = [{
  runId: RUN, programId: PROGRAM, releaseEligibilityVerified: true,
  studies: [{ source: { documentId: '9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f', sha256: 'c'.repeat(64), version: '1', studyId: 'CDI02',
    protocolNumber: 'LMN-201-CDI02', clinicalVerification: 'not-established', sourceApproval: 'canonical-lifecycle' },
  tables: { primaryEfficacy: { title: 'Global cure (Part B)', headers: ['Arm', 'n/N'], rows: [['LMN-201', '10/12'], ['Placebo', '4/11']] } } }],
}];

const posts = () => mocks.apiRequest.mock.calls.filter((c) => c[0] === 'POST');
const reviewPosts = () => posts().filter((c) => String(c[1]).endsWith('/review'));

beforeEach(() => {
  mocks.apiRequest.mockReset();
  setAuthToken(actorToken());
  mocks.apiRequest.mockImplementation(async (method: string, url: string) => {
    const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
    if (url.endsWith('/reviews')) return json(peerRead(csrContext));
    if (url.startsWith('/api/submission-orchestrator/runs')) return json({ runs: [{ runId: RUN, status: 'completed', startedAt: '2026-10-28T09:00:00Z' }] });
    if (url.endsWith('/csr-evidence/preview')) return json({ success: true, preview: { runs, tablesSha256: 'd'.repeat(64), snapshotHash: csrContext.snapshotHash } });
    if (method === 'POST' && url.endsWith('/review')) {
      return json({ ...peerReceipt('approved'), review: { ...peerReceipt('approved').review, reviewed_snapshot: csrContext.snapshot } });
    }
    return json({ success: true });
  });
});
afterEach(() => { cleanup(); clearAuthToken(); });

describe('the review decision for a CSR', () => {
  it('asks for the scientific review before an approval, and sends the completed map with it', async () => {
    render(<ReviewDecisionDialog documentId={PEER_DOC} programId={PROGRAM} onClose={vi.fn()} onRecorded={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Decision'), { target: { value: 'approved' } });

    // The panel appears, and the approval cannot be recorded without it.
    expect(await screen.findByRole('region', { name: 'CSR scientific review' })).toBeTruthy();
    const record = screen.getByRole('button', { name: /Record approval/ }) as HTMLButtonElement;
    expect(record.disabled).toBe(true);

    fireEvent.click(await screen.findByLabelText(/Run 0b6f2f5e/));
    fireEvent.click(screen.getByRole('button', { name: 'Read the retained tables' }));
    await screen.findByText('2. Each figure in the saved text');

    // Each figure has exactly one possible cell here, so each is proposed; the reviewer states and attests.
    fireEvent.change(screen.getByLabelText('How you checked this section (required)'), { target: { value: 'Each figure compared with the Part B table.' } });
    fireEvent.click(screen.getByLabelText('This section reports no quantitative results.'));
    expect(record.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/Every quantitative result in the saved text is mapped/));
    fireEvent.click(screen.getByLabelText(/I reviewed the analysis populations, methods and units/));

    await waitFor(() => expect(record.disabled).toBe(false));
    fireEvent.click(record);
    await waitFor(() => expect(reviewPosts()).toHaveLength(1));

    const body = reviewPosts()[0][2] as { review_status: string; csr_evidence: { runIds: string[]; expectedTablesSha256: string;
      sections: Array<{ sectionId: string; assessment: string; claims: Array<{ expectedValue: string; table: string; row: number; column: number }> }> } };
    expect(body.review_status).toBe('approved');
    expect(body.csr_evidence.runIds).toEqual([RUN]);
    expect(body.csr_evidence.expectedTablesSha256).toBe('d'.repeat(64));
    const eff = body.csr_evidence.sections.find((s) => s.sectionId === S_EFF)!;
    expect(eff.assessment).toBe('mapped-results');
    expect(eff.claims.map((c) => [c.expectedValue, c.table, c.row, c.column])).toEqual([
      ['10/12', 'primaryEfficacy', 0, 1], ['4/11', 'primaryEfficacy', 1, 1],
    ]);
    expect(body.csr_evidence.sections.find((s) => s.sectionId === S_ETH)!.assessment).toBe('no-quantitative-results');
  });

  it("a CSR the label does not name is caught by the server's refusal, and the panel opens instead of a reload", async () => {
    const unlabelled = { ...csrContext, snapshot: { ...csrContext.snapshot, title: 'RePreve final report', module: null, productCode: null } };
    mocks.apiRequest.mockImplementation(async (method: string, url: string) => {
      const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
      if (url.endsWith('/reviews')) return json(peerRead(unlabelled));
      if (url.startsWith('/api/submission-orchestrator/runs')) return json({ runs: [] });
      if (method === 'POST' && url.endsWith('/review')) {
        return json({ success: false, error: { code: 'CSR_SCIENTIFIC_REVIEW_REQUIRED', message: 'Approve this CSR only after mapping its saved result claims.' } }, 409);
      }
      return json({ success: true });
    });
    render(<ReviewDecisionDialog documentId={PEER_DOC} programId={PROGRAM} onClose={vi.fn()} onRecorded={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Decision'), { target: { value: 'approved' } });
    expect(screen.queryByRole('region', { name: 'CSR scientific review' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/clinical study report.*Nothing was recorded/);
    expect(await screen.findByRole('region', { name: 'CSR scientific review' })).toBeTruthy();
    expect(await screen.findByText(/This program has no saved package run/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Record approval/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('a document that is not a CSR approves as before, with no map', async () => {
    mocks.apiRequest.mockImplementation(async (method: string, url: string) => ({ ok: true, status: 200,
      json: async () => url.endsWith('/reviews') ? peerRead() : method === 'POST' ? peerReceipt('approved') : { success: true } }));
    render(<ReviewDecisionDialog documentId={PEER_DOC} onClose={vi.fn()} onRecorded={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Decision'), { target: { value: 'approved' } });
    expect(screen.queryByRole('region', { name: 'CSR scientific review' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Record approval/ }));
    await waitFor(() => expect(reviewPosts()).toHaveLength(1));
    expect(reviewPosts()[0][2]).not.toHaveProperty('csr_evidence');
  });
});
