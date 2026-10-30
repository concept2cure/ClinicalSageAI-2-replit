// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * the `device-presub` row): a commitment's dossier-link button may only be
 * offered when something carries it out.
 *
 * Both buttons — the one on a question's commitment and the one on each row of
 * the Commitments tab — called `onJumpToDossier?.(…)`, and the only caller,
 * MdxSurfaceHost, renders `<PreSubManager onAskAna={onAsk} />` without it. So a
 * reviewer clicked "eSTAR §…  →" and nothing happened. The section the
 * commitment rolls into is still the server's fact, so it stays on screen as
 * text; only the dead control goes, and it comes back the moment a caller wires
 * the handler (the last case pins that the capability was not deleted).
 *
 * The text says the direction the button's arrow used to: the section is where
 * the commitment must land. Drawn bare beside "From Q1" in the same grey, it
 * read as the commitment's origin.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PreSubManager } from '../PreSubManager';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const ROW = {
  id: 'qs-1', qNumber: 'Q000001', type: 'presub', prog: 'DEV-1', progTitle: 'Device one',
  title: 'Biocompatibility strategy', stage: 'feedback', daysIn: 4, filed: '2026-09-01',
  targetDate: null, meeting: null, questions: 1, answered: 1, commitments: 1, rolledIn: 0,
  fdaTeam: 'OHT3', tone: '',
};

const DETAIL = {
  id: 'qs-1',
  summary: 'One question on the biocompatibility test plan.',
  questions: [{
    id: 'q-1', n: 1, question: 'Is the ISO 10993 plan adequate?', ourPosition: 'Yes.',
    fdaResponse: 'Recorded response.', status: 'answered',
    commitments: [{
      id: 'c-1', displayCode: 'C-1', text: 'Add a sensitisation test.',
      dossierLink: { kind: 'k510-section', label: 'Biocompatibility section', sectionId: '15' },
      rolledIn: false, rolledInAt: null, rolledInBy: null, blocker: false,
    }],
  }],
  timeline: [],
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => '',
    json: async () =>
      url === '/api/q-sub?program_id=p-1' ? { data: { rows: [ROW], count: 1 } } : { data: DETAIL },
  }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const linkButton = () =>
  screen.queryAllByRole('button').filter((b) => (b.textContent ?? '').includes('Biocompatibility section'));

describe('PreSubManager — a dossier link nothing carries out is not a button', () => {
  it('offers no dossier-link button on a question when no caller wires the jump', async () => {
    render(<PreSubManager programId="p-1" onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('Add a sensitisation test.')).toBeTruthy());
    expect(linkButton()).toHaveLength(0);
    // The section is the server's fact, so it is still said, as a destination.
    expect(screen.getByText(/Rolls into Biocompatibility section/)).toBeTruthy();
  });

  it('offers no dossier-link button on the Commitments tab either', async () => {
    render(<PreSubManager programId="p-1" onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('Add a sensitisation test.')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /^Commitments/ }));
    await waitFor(() => expect(screen.getByText('From Q1')).toBeTruthy());
    expect(linkButton()).toHaveLength(0);
    expect(screen.getByText(/Rolls into Biocompatibility section/)).toBeTruthy();
  });

  it('still offers the jump, and carries it out, once a caller wires it', async () => {
    const onJump = vi.fn();
    render(<PreSubManager programId="p-1" onAskAna={() => {}} onJumpToDossier={onJump} />);
    await waitFor(() => expect(screen.getByText('Add a sensitisation test.')).toBeTruthy());
    const [btn] = linkButton();
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(onJump).toHaveBeenCalledWith({ kind: 'k510-section', label: 'Biocompatibility section', sectionId: 15 });
  });
});
