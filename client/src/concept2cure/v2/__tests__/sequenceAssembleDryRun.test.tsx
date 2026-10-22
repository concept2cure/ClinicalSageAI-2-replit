// @vitest-environment jsdom
/**
 * F10 / F11 (docs/design/FILING_SPINE.md §7.2): the Dispatch tab assembles a
 * test package.
 *
 * POST /api/submissions/sequences/:seqId/assemble (server/routes/submissions.ts)
 * drives the real eCTD publisher off the sequence's canonical leaves and
 * answers what it built and what would stop it being transmitted. It had no
 * client caller. The Dispatch tab now calls it, and shows the server's answer
 * as the server wrote it.
 *
 * Pins:
 *   • the button POSTs to the sequence's own assemble route, and the server's
 *     transmit blockers are shown verbatim;
 *   • the tab says plainly that this is a test package and nothing is sent;
 *   • the button is disabled while the request runs (no double POST);
 *   • a 422 (ECTD_ASSEMBLE_BLOCKED) shows the server's words, and no package
 *     is claimed; a refusal whose own audit entry was not persisted says so;
 *   • a 5xx or a dropped connection is reported as unknown, never as "not
 *     assembled": the server may have built the package and audited it;
 *   • an empty blocker list is not an all-clear: no ok tone, and the sentence
 *     is scoped to the leaves the server checked;
 *   • an assembly whose audit entry was not persisted says so.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiRequestError } from '@/lib/queryClient';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { DispatchWorkspace } from '../surfaces/SubmissionSeqWorkspaces';

const SEQ = { id: 7, sequenceNumber: '0001', type: 'amendment', status: 'validated', region: 'fda', validationStatus: 'passed' };
const SUB = { id: 5, title: 'ZX-9 First-in-Human', applicationType: 'ind', primaryRegion: 'fda', programId: null };

const READINESS = {
  sequenceId: 7, region: 'fda', sequenceStatus: 'validated', validationErrors: 0,
  unacknowledgedShadowCriticals: 0, shadowReviewRunCount: 1, shadowReviewMissing: false,
  gate: { cleared: false, blockers: ['A 21 CFR Part 11 release signature is required.'] },
  freezeGate: { cleared: false, blockers: ['A 21 CFR Part 11 release signature is required.'] },
  dispatchGateOnSigning: { cleared: false, blockers: ['A 21 CFR Part 11 release signature is required.'] },
  readiness: { errors: 0, warnings: 0, infos: 0, findings: [] }, leafCount: 3,
  signer: { state: 'independent', sources: [] },
};

const ASSEMBLED = {
  ok: true,
  sha256: '9f2c4e1ab37d55e0c1f8a6b2d4e7f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
  format: 'ectd-3.2.2',
  sizeBytes: 48213,
  materialized: 2,
  skipped: [],
  unresolvedLeaves: [{ documentTable: 'vault_documents', documentId: 12 }],
  unfinalized: 1,
  unfinalizedSections: [{ sectionCode: '2.7.3', status: 'draft' }],
  transmitBlockers: [
    '1 leaf source(s) could not be materialized into the package (vault_documents:12)',
    '1 leaf document(s) are not approved (2.7.3: draft)',
  ],
  auditTrail: { persisted: true, chained: true },
};

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data: payload }) }) as Response;
const raw = (payload: unknown, status = 200) => ({ ok: status < 400, status, json: async () => payload }) as Response;

function serve(assemble: () => Promise<Response> | Response) {
  apiRequest.mockImplementation(async (method: string, rawUrl: unknown) => {
    const url = String(rawUrl ?? '');
    if (url.endsWith('/dispatch-readiness')) return ok(READINESS);
    if (method === 'POST' && url === '/api/submissions/sequences/7/assemble') return assemble();
    return ok([]);
  });
}

const text = () => document.body.textContent ?? '';
const assembleButton = () => screen.getByRole('button', { name: /Assemble a test package/ });
const assembleCalls = () => apiRequest.mock.calls.filter((c) => c[0] === 'POST' && String(c[1]).endsWith('/assemble'));

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('Dispatch tab: assemble a test package', () => {
  it('POSTs the sequence assemble route and shows the server blockers verbatim', async () => {
    serve(() => raw(ASSEMBLED));
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    expect(text()).toMatch(/test package/i);
    expect(text()).toMatch(/Nothing is sent/);

    fireEvent.click(assembleButton());
    await waitFor(() => expect(text()).toContain('1 leaf document(s) are not approved (2.7.3: draft)'));
    expect(assembleCalls()).toHaveLength(1);
    expect(assembleCalls()[0][2]).toEqual({});
    expect(text()).toContain('1 leaf source(s) could not be materialized into the package (vault_documents:12)');
    // What was built, as the server reported it.
    expect(text()).toMatch(/2 leaves materialized/);
    expect(text()).toContain('9f2c4e1ab37d');
    // A test package is never presented as sent.
    expect(text()).not.toMatch(/was transmitted|has been sent|sent to the agency/i);
    expect(text()).toMatch(/Nothing was sent/);
  });

  it('the button is disabled while the request runs', async () => {
    let release: (r: Response) => void = () => undefined;
    serve(() => new Promise<Response>((r) => { release = r; }));
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    fireEvent.click(assembleButton());
    await waitFor(() => expect((screen.getByRole('button', { name: /Assembling the test package/ }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Assembling the test package/ }));
    expect(assembleCalls()).toHaveLength(1);
    release(raw({ ...ASSEMBLED, transmitBlockers: [] }));
    await waitFor(() => expect(text()).toMatch(/assembled and discarded/));
    expect((assembleButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('an empty blocker list is not shown as ready to send', async () => {
    serve(() => raw({ ...ASSEMBLED, unresolvedLeaves: [], unfinalized: 0, transmitBlockers: [] }));
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    fireEvent.click(assembleButton());
    await waitFor(() => expect(text()).toMatch(/assembled and discarded/));
    expect(text()).toContain('The server found nothing in the placed leaves that would stop transmission.');
    expect(text()).toMatch(/placeholder agency identifiers, and the dispatch gate on this tab still applies/);
    expect(text()).not.toMatch(/Nothing in the test package stops transmission/);
    const verdict = screen.getAllByRole('status').find((n) => /assembled and discarded/.test(n.textContent ?? ''));
    expect(verdict?.className).not.toMatch(/tone-ok/);
    // The hash is labelled as the test package's own, not a package to send.
    expect(text()).toMatch(/test package SHA-256 9f2c4e1ab37d/);
    expect(text()).toMatch(/carries no agency identifiers/);
  });

});

describe('Dispatch tab: a test package that failed or was refused', () => {
  it('a 503 is reported as unknown, never as not assembled', async () => {
    serve(() => {
      throw new ApiRequestError('The service is temporarily unavailable.', 503, { error: 'The service is temporarily unavailable.' });
    });
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    fireEvent.click(assembleButton());
    await waitFor(() => expect(text()).toMatch(/Whether the test package was assembled could not be confirmed/));
    expect(text()).toMatch(/Check the sequence's audit trail before assembling again/);
    expect(text()).not.toMatch(/No test package was assembled/);
  });

  it('a dropped connection is reported as unknown, never as not assembled', async () => {
    serve(() => {
      throw new TypeError('Failed to fetch');
    });
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    fireEvent.click(assembleButton());
    await waitFor(() => expect(text()).toContain('Whether the test package was assembled could not be confirmed. Check the sequence'));
    expect(text()).not.toMatch(/No test package was assembled|Failed to fetch/);
  });

  it('a refused assembly whose audit entry was not persisted says so', async () => {
    serve(() => {
      throw new ApiRequestError(
        'Leaf 3.2.S.4.1 resolves outside the staging root.',
        422,
        {
          error: { code: 'ECTD_ASSEMBLE_BLOCKED', message: 'Leaf 3.2.S.4.1 resolves outside the staging root.' },
          auditTrail: { persisted: false, message: 'The audit entry for this refusal could not be written. This has been logged for follow-up.' },
        },
        'ECTD_ASSEMBLE_BLOCKED',
      );
    });
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    fireEvent.click(assembleButton());
    await waitFor(() => expect(text()).toMatch(/No test package was assembled — Leaf 3.2.S.4.1 resolves outside the staging root/));
    expect(text()).toContain('The audit entry for this refusal could not be written.');
  });

  it('a role refusal says nothing about a refusal audit entry', async () => {
    serve(() => raw({ error: { code: 'FORBIDDEN', message: 'Your role cannot assemble this sequence.' } }, 403));
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    fireEvent.click(assembleButton());
    await waitFor(() => expect(text()).toMatch(/No test package was assembled/));
    expect(text()).not.toMatch(/refusal audit entry/);
  });

  it('a 422 shows the server words and claims no package', async () => {
    serve(() => raw({
      error: { code: 'ECTD_ASSEMBLE_BLOCKED', message: 'Sequence 0001 has no leaves to assemble. Place at least one document first.' },
      auditTrail: { persisted: true, chained: true },
    }, 422));
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    fireEvent.click(assembleButton());
    await waitFor(() => expect(text()).toContain('Sequence 0001 has no leaves to assemble. Place at least one document first.'));
    expect(text()).toMatch(/No test package was assembled/);
    expect(text()).not.toMatch(/materialized/);
  });

  it('an assembly whose audit entry was not persisted says so', async () => {
    serve(() => raw({
      ...ASSEMBLED,
      transmitBlockers: [],
      auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'The 21 CFR Part 11 audit entry for this transition could not be written. The action itself completed. This has been logged for follow-up.' },
    }));
    render(<DispatchWorkspace sub={SUB} seq={SEQ} onGoverned={vi.fn()} />);
    await waitFor(() => expect(text()).toMatch(/Dispatch blocked/));
    fireEvent.click(assembleButton());
    await waitFor(() => expect(text()).toContain('The 21 CFR Part 11 audit entry for this transition could not be written.'));
  });
});
