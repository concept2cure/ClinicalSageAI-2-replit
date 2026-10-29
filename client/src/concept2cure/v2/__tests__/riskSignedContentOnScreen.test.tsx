// @vitest-environment jsdom
/**
 * The risk register says whether an accepted hazard's residual-risk acceptance
 * still binds the hazard and the controls it accepted (D5, 21 CFR Part 11
 * §11.70; docs/evidence/D5-SIGNED-CONTENT-ON-SCREEN/2026-10-29/).
 *
 * GET /api/mdx/risk-items/:id carries `signedContent` (readSignedContentStates);
 * the register read only the list, which does not. The drawer of a selected
 * accepted hazard now reads it and says it in words. The acceptance's own
 * benefit-risk rationale and controls can be edited after it is signed, so
 * "Changed since it was signed" is the state that matters here.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

type Published = { summary?: string; facts?: Record<string, any> };
const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  calls: [] as Array<{ method: string; path: string }>,
  published: null as null | Published,
}));

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => ({ id: 5, name: 'Sam Signer', mfaEnabled: false }) }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (_id: string, ctx: Published) => { H.published = ctx; },
}));
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: () => undefined,
  EsignModal: (p: { action: string; onSign: (i: Record<string, string>) => Promise<unknown> }) => (
    <div role="dialog" aria-label={p.action}>
      <button onClick={() => { void p.onSign({ meaning: 'approval', reason: 'Residual risk reviewed', password: 'pw' }).catch(() => undefined); }}>stub-sign</button>
    </div>
  ),
}));

import { Risk } from '../surfaces/Risk';

const hazard = (id: number, over: Record<string, unknown> = {}) => ({
  id, ref_code: 'HZ-' + id, hazard: 'Hazard ' + id, hazardous_situation: 'Situation', harm: 'Mis-dosing of insulin',
  sequence_of_events: '', severity: 4, probability: 3, detectability: 3, residual_probability: 1,
  control_strategy: 'design_reduce', source: 'fmea', status: 'verified', acceptable: null, ...over,
});
const ACCEPTED = hazard(41, { status: 'accepted', acceptable: true });
const OPEN = hazard(42, { status: 'open' });
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json });
const facet = (state: string, over: Record<string, unknown> = {}) => ({
  state, signatureId: 314, signerName: 'Quinn Quality', signedAt: '2026-10-29T10:00:00.000Z', meaning: 'approval',
  bindingBasis: 'risk-residual-acceptance-content-sha256', signedDigest: 'a'.repeat(64), currentDigest: 'b'.repeat(64), reason: null, ...over,
});
const CHANGED_REASON = 'The record changed after it was signed: its content digest is not the one the signature bound.';

let list: unknown[];
let details: Record<number, () => Promise<unknown>>;
let patchAnswer: () => Promise<unknown>;

beforeEach(() => {
  H.calls.length = 0;
  H.published = null;
  list = [ACCEPTED, OPEN];
  details = {
    41: async () => answer(200, { data: { ...ACCEPTED, controls: [], signedContent: facet('changed', { reason: CHANGED_REASON }) } }),
    42: async () => answer(200, { data: { ...OPEN, controls: [], signedContent: facet('unsigned') } }),
  };
  patchAnswer = async () => answer(200, { data: { ...OPEN, status: 'accepted', acceptable: true }, signedAt: '2026-10-29T11:00:00.000Z' });
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string) => {
    H.calls.push({ method, path });
    if (method === 'PATCH') return patchAnswer();
    if (path === '/api/mdx/risk-items') return answer(200, { data: list });
    const id = Number(path.replace('/api/mdx/risk-items/', ''));
    if (details[id]) return details[id]();
    return answer(200, { data: null });
  });
});
afterEach(() => cleanup());

const settle = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function mount() {
  render(<Risk {...({ surface: { id: 'risk' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as React.ComponentProps<typeof Risk>)} />);
  await screen.findAllByText('Hazard 41');
  await settle();
}
const drawer = () => document.querySelector('.risk-drawer') as HTMLElement;
const line = () => within(drawer()).queryByTestId('risk-acceptance-signature');
const detailReads = (id: number) => H.calls.filter((c) => c.method === 'GET' && c.path === '/api/mdx/risk-items/' + id).length;
const select = (id: number) => fireEvent.click(document.querySelector(`.riskmx-dot[title^="HZ-${id} /"]`) as HTMLElement);

describe("an accepted hazard's acceptance signature, in words", () => {
  it('a hazard edited after its acceptance says "Changed since it was signed", with the reason', async () => {
    await mount();
    expect(detailReads(41)).toBe(1);
    const shown = line() as HTMLElement;
    expect(shown.textContent).toContain('Acceptance signature:');
    expect(shown.querySelector('.rd-chip')?.textContent).toBe('Changed since it was signed');
    expect(shown.textContent).toContain('Signed by Quinn Quality');
    expect(shown.textContent).toContain(CHANGED_REASON);
  });

  it('a hazard unchanged since its acceptance says "Signed content unchanged"', async () => {
    details[41] = async () => answer(200, { data: { ...ACCEPTED, signedContent: facet('matches', { currentDigest: 'a'.repeat(64) }) } });
    await mount();
    expect(line()?.querySelector('.rd-chip')?.textContent).toBe('Signed content unchanged');
  });

  it('an acceptance signed before content binding says it cannot be verified', async () => {
    details[41] = async () => answer(200, { data: { ...ACCEPTED, signedContent: facet('unverified', { bindingBasis: 'governed-action-sha256-chain' }) } });
    await mount();
    expect(line()?.querySelector('.rd-chip')?.textContent).toBe('Signed before content binding; not verifiable');
  });

  it('a read that failed says "Signature state could not be read", never "Not signed"', async () => {
    details[41] = async () => answer(500, { error: 'boom' });
    await mount();
    expect(line()?.getAttribute('data-state')).toBe('unavailable');
    expect(line()?.textContent).toContain('Signature state could not be read');
    expect(drawer().textContent).not.toContain('Not signed');
  });

  it("an answer for another hazard is not this hazard's state", async () => {
    details[41] = async () => answer(200, { data: { ...OPEN, signedContent: facet('matches') } });
    await mount();
    expect(line()?.getAttribute('data-state')).toBe('unavailable');
  });
});

describe('only an accepted hazard is read for it', () => {
  it('a hazard not accepted reads nothing more and shows no acceptance signature', async () => {
    await mount();
    select(42);
    await settle();
    expect(detailReads(42)).toBe(0);
    expect(line()).toBeNull();
  });

  it('a hazard accepted here is read once the signature is confirmed', async () => {
    list = [OPEN];
    details[42] = async () => answer(200, { data: { ...OPEN, status: 'accepted', acceptable: true, signedContent: facet('matches') } });
    render(<Risk {...({ surface: { id: 'risk' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as React.ComponentProps<typeof Risk>)} />);
    await screen.findAllByText('Hazard 42');
    expect(detailReads(42)).toBe(0);
    fireEvent.click(within(drawer()).getByRole('button', { name: /Accept residual/ }));
    fireEvent.click(screen.getByText('stub-sign'));
    await waitFor(() => expect(line()?.getAttribute('data-state')).toBe('matches'));
    expect(detailReads(42)).toBe(1);
  });
});

describe("AnA's context carries the acceptance signature", () => {
  it('the selected hazard carries its state, and the summary says it', async () => {
    await mount();
    const ctx = H.published as Published;
    expect(ctx.facts?.selected.residualAcceptanceSignature).toMatchObject({
      state: 'changed', words: 'Changed since it was signed', signedBy: 'Quinn Quality', reason: CHANGED_REASON,
    });
    expect(ctx.summary).toContain('Its residual-risk acceptance signature: Changed since it was signed');
  });

  it('a state not read is told as not read, not as unsigned', async () => {
    details[41] = async () => answer(500, { error: 'boom' });
    await mount();
    const sig = (H.published as Published).facts?.selected.residualAcceptanceSignature;
    expect(sig.state).toBe('unavailable');
    expect(sig.note).toContain('not a statement that the record is unsigned');
  });

  it('a hazard not accepted carries no acceptance signature', async () => {
    list = [OPEN];
    render(<Risk {...({ surface: { id: 'risk' }, onAsk: vi.fn(), onNav: vi.fn() } as unknown as React.ComponentProps<typeof Risk>)} />);
    await screen.findAllByText('Hazard 42');
    await settle();
    expect((H.published as Published).facts?.selected.residualAcceptanceSignature).toBeNull();
  });
});
