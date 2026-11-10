// @vitest-environment jsdom
/**
 * Communication's "Draft response with AnA" carries the letter (2026-10-17).
 *
 * Both of Communication's draft buttons (the lead's and each inbox card's)
 * sent AnA a sentence naming the communication and nothing else, so the turn
 * was not grounded on the letter. They now hand the letter over the way
 * Respond does: its data-room source is pinned (window.C2C_SOURCE_PINS) for
 * that one turn. Same list and same mechanism on both screens (AgencyInbox.tsx).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { CommunicationCenter } from '../surfaces/CommunicationCenter';

const PID = '22222222-2222-4222-8222-222222222222';
const COMMS_URL = `/api/concept2cure/projects/${PID}/agency-communications`;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const ROW = {
  id: 'ace_1', sourceType: 'uploaded_official_correspondence', communicationType: 'Agency letter: IR-2026-10-12.pdf',
  sourceChannel: 'Uploaded in Respond', linkedSectionCodes: [], linkedArtifactIds: ['cre_source:77'],
  receivedDate: '2026-10-16T09:00:00.000Z', urgency: 'medium', responseRequired: true, extractedIssues: ['Stability data'],
  humanReviewStatus: 'pending_review', closureStatus: 'open', auditMetadata: { visibilityTier: 'shared_client_c2c' },
};

beforeEach(() => {
  (window as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === COMMS_URL ? ok({ success: true, data: [ROW] }) : ok({ success: true, data: [] }));
});
afterEach(() => {
  cleanup();
  delete (window as { C2C_SOURCE_PINS?: unknown }).C2C_SOURCE_PINS;
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe("Communication's draft buttons carry the letter", () => {
  it('every draft button is labelled "Draft response with AnA" and pins the letter of its communication', async () => {
    const onAsk = vi.fn();
    render(<CommunicationCenter surface={'communication-center' as never} segment="biotech" onAsk={onAsk} onNav={vi.fn()} />);
    expect(await screen.findByText('Agency letter: IR-2026-10-12.pdf')).toBeTruthy();
    const drafts = screen.getAllByRole('button', { name: /Draft response with AnA/ });
    // The lead's action and the card's: no label promising a produced response.
    expect(drafts.length).toBe(2);
    expect(screen.queryByRole('button', { name: /^Draft the .* response$/ })).toBeNull();
    for (const b of drafts) {
      onAsk.mockClear();
      delete (window as { C2C_SOURCE_PINS?: unknown }).C2C_SOURCE_PINS;
      fireEvent.click(b);
      expect((window as { C2C_SOURCE_PINS?: string[] }).C2C_SOURCE_PINS).toEqual(['77']);
      expect(onAsk.mock.calls[0][0]).toMatch(/Agency letter: IR-2026-10-12\.pdf/);
      expect(onAsk.mock.calls[0][0]).toMatch(/Stability data/);
    }
  });

  /* 2026-11-10 (plan §2: one primary action per view; orange for send, the spark, focus and that one action). The
     inbox list is the same component in Communication, the HAQ manager and the project's Respond step. A filled
     orange "Draft response with AnA" on every open letter put an orange button on each row; it is a quiet button,
     so a view keeps its one primary. Found in the project page's acceptance walk (D3 §6 item 3). */
  it("each letter's draft button is quiet, never a filled primary on every row", async () => {
    render(<CommunicationCenter surface={'communication-center' as never} segment="biotech" onAsk={vi.fn()} onNav={vi.fn()} />);
    expect(await screen.findByText('Agency letter: IR-2026-10-12.pdf')).toBeTruthy();
    const onCard = screen.getAllByRole('button', { name: /Draft response with AnA/ }).filter((b) => b.closest('.cc-comm-foot'));
    expect(onCard).toHaveLength(1);
    expect(onCard[0].className).not.toMatch(/\bprimary\b/);
  });
});
