// @vitest-environment jsdom
/**
 * The review dialog names sections and the independent checks in words (sales rehearsal 2026-11-10: rB-F13 and B1).
 *  - A working field of an IND Module 1 form is stored as "1.14.4.1:work:3"; the reader sees "1.14.4.1", then the title.
 *  - With no checks required, the dialog called them "(optional)" beside a placement that then demanded them. It now
 *    says what the server answered: not required for this document, and when they are.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { setAuthToken, clearAuthToken } from '@/utils/authToken';
import type { AuthoringReviewContext, IndependentCheckContext } from '@shared/authoring/peer-review';
import { actorToken, PEER_DOC, peerContext, peerRead } from '../../__tests__/peerReviewFixtures';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn(), user: { id: 7, organizationId: 7 } }));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => mocks.user }));
vi.mock('@/lib/queryClient', async (original) => ({ ...await original<typeof import('@/lib/queryClient')>(), apiRequest: mocks.apiRequest }));
import { ReviewDecisionDialog } from '../ReviewDecisionDialog';

const WORK_SECTION = '3f2c1a10-0000-4000-8000-000000000102';
const response = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const withSections = (over: Partial<AuthoringReviewContext> = {}): AuthoringReviewContext => ({ ...peerContext,
  snapshot: { ...peerContext.snapshot, sections: [...peerContext.snapshot.sections,
    { id: WORK_SECTION, code: '1.14.4.1:work:3', title: 'Pharmacology and toxicology summary', content: '<p>Saved summary.</p>' }] },
  ...over });

function show(context: AuthoringReviewContext) {
  mocks.apiRequest.mockImplementation(async () => response(peerRead(context)));
  render(<ReviewDecisionDialog documentId={PEER_DOC} onClose={vi.fn()} onRecorded={vi.fn()} />);
}

beforeEach(() => { mocks.apiRequest.mockReset(); setAuthToken(actorToken()); });
afterEach(() => { cleanup(); clearAuthToken(); });

describe('the review dialog speaks in words', () => {
  it('names a working field by its section number and title, never its stored key', async () => {
    show(withSections());
    const heading = await screen.findByRole('heading', { name: /Pharmacology and toxicology summary/ });
    expect(heading.textContent).toBe('1.14.4.1 · Pharmacology and toxicology summary');
    expect(document.body.textContent).not.toMatch(/:work:/);
    expect(screen.getByRole('heading', { name: '2.5.1 · Dose rationale' })).toBeTruthy();
  });

  it('says checks are not required for this document, instead of "(optional)"', async () => {
    show(withSections({ canRunIndependentChecks: true }));
    const step = await screen.findByRole('region', { name: 'Independent saved-document checks' });
    expect(step.querySelector('h3')?.textContent).toBe('Independent checks');
    expect(step.textContent).not.toMatch(/optional/i);
    expect(step.textContent).toMatch(/Not required for this document\./);
    // V-W1-1: the dialog states only what the server answered, never a rule of its own about when checks are required.
    expect(step.textContent).not.toMatch(/required when/i);
    expect(screen.getByRole('button', { name: 'Run independent checks' })).toBeTruthy();
  });

  it('a finding names its section in words', async () => {
    const check: IndependentCheckContext = { required: true, receiptId: '3f2c1a10-0000-4000-8000-000000000088', snapshotHash: peerContext.snapshotHash,
      checkerVersion: 'v1', standing: 'current', semanticVerified: false, hardBlockCount: 0,
      findings: [{ findingId: 'f'.repeat(64), category: 'empty_section', severity: 'low', hard: false, open: true, current: true,
        sectionId: WORK_SECTION, description: 'This saved section has no accepted text.' }] };
    show(withSections({ canRunIndependentChecks: true, independentCheck: check }));
    const finding = await screen.findByRole('region', { name: 'Finding 1' });
    expect(finding.textContent).toMatch(/1\.14\.4\.1 — Pharmacology and toxicology summary/);
    expect(finding.textContent).not.toMatch(/:work:/);
    // V-W1-2: a document that requires checks is never told they are not required.
    expect(screen.getByRole('region', { name: 'Independent saved-document checks' }).textContent).not.toMatch(/Not required/);
  });

  it('a section with neither a number nor a title reads "Untitled section"', async () => {
    show({ ...peerContext, snapshot: { ...peerContext.snapshot, sections: [...peerContext.snapshot.sections,
      { id: WORK_SECTION, code: 'title_page', title: '', content: '<p>Saved.</p>' }] } });
    expect(await screen.findByRole('heading', { name: 'Untitled section' })).toBeTruthy();
  });
});
