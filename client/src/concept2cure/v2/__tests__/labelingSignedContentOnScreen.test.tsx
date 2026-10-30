// @vitest-environment jsdom
/**
 * The Labeling screen says whether each signature still binds the label it
 * signed, and warns a translation's creator before they try to approve it
 * (D5, 21 CFR Part 11 §11.70; docs/evidence/D5-SIGNED-CONTENT-ON-SCREEN/2026-10-29/).
 *
 * GET /api/mdx/labeling/:id carries `signedContent` on the document and on each
 * translation (readSignedContentStates) and `approvalSigner.state` on each
 * translation (signerIndependenceOf). No client read either. Here:
 *   - each state is said in its own words, beside the signer and the time;
 *   - a read that failed, or a facet this client cannot read, is "could not be
 *     read", never "Not signed";
 *   - a translation that was never signed and is not approved says nothing;
 *   - the creator of a translation in review is told they cannot approve it,
 *     and Approve is not offered as if it would work;
 *   - AnA's context carries the same states.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

type Published = { summary?: string; facts?: Record<string, any>; availableActions?: string[] };
const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  calls: [] as Array<{ method: string; path: string }>,
  published: null as null | Published,
  user: { id: 3, name: 'Ana Author', mfaEnabled: false } as Record<string, unknown> | null,
}));

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.user }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (_id: string, ctx: Published) => { H.published = ctx; },
}));
vi.mock('../../_shared/components/EsignModal', () => ({
  esignSignerOf: () => undefined,
  EsignModal: (p: { action: string; onSign: (i: Record<string, string>) => Promise<unknown> }) => (
    <div role="dialog" aria-label={p.action}>
      <button onClick={() => { void p.onSign({ meaning: 'approval', reason: 'Back-translation checked', password: 'pw' }).catch(() => undefined); }}>stub-sign</button>
    </div>
  ),
}));

import { Labeling } from '../surfaces/Labeling';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROGRAM_ID = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const KEYED = `/api/mdx/labeling?program_id=${PROGRAM_ID}`;
const DETAIL = '/api/mdx/labeling/4';
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json });
const row = (id: number, language: string, status: string) => ({
  id, language, translation_method: 'human', back_translation_verified: true, status,
});

/** One facet as readSignedContentStates writes it. */
const facet = (state: string, over: Record<string, unknown> = {}) => ({
  state, signatureId: 314, signerName: 'Sam Signer', signedAt: '2026-10-29T10:00:00.000Z', meaning: 'approval',
  bindingBasis: 'labeling-translation-content-sha256', signedDigest: 'a'.repeat(64), currentDigest: 'a'.repeat(64), reason: null, ...over,
});
const UNSIGNED = {
  state: 'unsigned', signatureId: null, signerName: null, signedAt: null, meaning: null, bindingBasis: null,
  signedDigest: null, currentDigest: null, reason: 'No signature has been given on this record.',
};
const CHANGED_REASON = 'The record changed after it was signed: its content digest is not the one the signature bound.';

let doc: Record<string, unknown>;
let translations: Array<Record<string, unknown>>;
/** Per translation id: its signedContent and approvalSigner in the document's GET. */
let onDetail: Record<number, { signedContent?: unknown; approvalSigner?: unknown }>;
let docFacet: unknown;
let detailAnswer: () => Promise<unknown>;
let patchAnswer: (body: Record<string, unknown>) => Promise<unknown>;

const detailBody = () => ({
  data: {
    ...doc, signedContent: docFacet, symbols: [],
    translations: translations.map((t) => ({ ...t, ...(onDetail[t.id as number] ?? {}) })),
  },
});

beforeEach(() => {
  H.calls.length = 0;
  H.published = null;
  H.user = { id: 3, name: 'Ana Author', mfaEnabled: false };
  doc = { id: 4, device_name: 'Aurora CGM', doc_kind: 'ifu', version: '3', organization_id: 7, status: 'draft', udi_di: null };
  translations = [row(12, 'de', 'approved'), row(13, 'fr', 'pending')];
  onDetail = { 12: { signedContent: facet('matches'), approvalSigner: { state: 'independent' } }, 13: { signedContent: UNSIGNED, approvalSigner: { state: 'independent' } } };
  docFacet = UNSIGNED;
  detailAnswer = async () => answer(200, detailBody());
  patchAnswer = async () => answer(201, { data: { ...translations[0], status: 'approved' }, signedAt: '2026-10-29T11:00:00.000Z' });
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string, body?: Record<string, unknown>) => {
    H.calls.push({ method, path });
    if (method === 'PATCH') return patchAnswer(body ?? {});
    if (method === 'POST') return answer(201, { data: row(91, 'pt', 'pending') });
    if (path === KEYED) return answer(200, { data: [doc] });
    if (path === DETAIL) return detailAnswer();
    if (path === `${DETAIL}/translations`) return answer(200, { data: translations });
    return answer(200, { data: [] });
  });
});
afterEach(() => { cleanup(); clearShellProject(); });

const settle = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function mount() {
  publishShellProject({ id: PROGRAM_ID });
  render(<Labeling {...({ onAsk: () => {}, onNav: () => {} } as unknown as React.ComponentProps<typeof Labeling>)} />);
  await screen.findByText('German');
  await settle();
}
const rowOf = (name: string) => screen.getByText(name).closest('.ct-row') as HTMLElement;
const signatureOf = (id: number) => screen.queryByTestId('labeling-translation-signature-' + id);
const detailReads = () => H.calls.filter((c) => c.method === 'GET' && c.path === DETAIL).length;

describe("an approved translation's signature, in words", () => {
  it.each([
    ['matches', {}, 'Signed content unchanged'],
    ['changed', { reason: CHANGED_REASON }, 'Changed since it was signed'],
    ['unverified', { bindingBasis: 'governed-action-sha256-chain', reason: 'This signature was taken before its content was bound.' }, 'Signed before content binding; not verifiable'],
    ['unverified', { reason: "The record's content could not be read to compare with the signature." }, 'Signed; the signed content could not be verified'],
    ['withdrawn', { reason: 'Every signature on this record has been withdrawn.' }, 'Signature withdrawn'],
  ])('%s says "%s"', async (state, over, words) => {
    onDetail[12] = { signedContent: facet(state, over), approvalSigner: { state: 'independent' } };
    await mount();
    const line = signatureOf(12) as HTMLElement;
    expect(line.getAttribute('data-state')).toBe(state);
    // Words first: the chip says the state; its tone is not the only signal.
    expect(line.querySelector('.rd-chip')?.textContent).toBe(words);
    expect(line.textContent).toContain('Approval signature:');
    expect(line.textContent).toContain('Signed by Sam Signer');
    expect(line.textContent).toContain('2026-10-29 10:00:00 UTC');
  });

  it("a changed signature gives the server's reason; a pre-binding one does not repeat it", async () => {
    onDetail[12] = { signedContent: facet('changed', { reason: CHANGED_REASON }) };
    await mount();
    expect(signatureOf(12)?.textContent).toContain(CHANGED_REASON);
    expect(signatureOf(12)?.querySelector('.rd-chip')?.className).toContain('tone-err');
  });

  it('a translation whose source moved on after its approval says "Source changed since it was signed", with the reason (P-64)', async () => {
    const reason = 'The source it translates changed after it was signed: it was signed against labeling-document:4 at version 2, which is now at version 3.';
    onDetail[12] = { signedContent: facet('source-changed', { reason }), approvalSigner: { state: 'independent' } };
    await mount();
    expect(signatureOf(12)?.getAttribute('data-state')).toBe('source-changed');
    expect(signatureOf(12)?.querySelector('.rd-chip')?.textContent).toBe('Source changed since it was signed');
    expect(signatureOf(12)?.textContent).toContain(reason);
  });

  it('an approved translation with no signature says "Not signed"', async () => {
    onDetail[12] = { signedContent: UNSIGNED };
    await mount();
    expect(signatureOf(12)?.getAttribute('data-state')).toBe('unsigned');
    expect(signatureOf(12)?.textContent).toContain('Not signed');
  });

  it('a translation never signed and not approved says nothing', async () => {
    await mount();
    expect(signatureOf(13)).toBeNull();
  });

  it('a translation in review whose approval was withdrawn says so', async () => {
    translations[1] = row(13, 'fr', 'review');
    onDetail[13] = { signedContent: facet('withdrawn'), approvalSigner: { state: 'independent' } };
    await mount();
    expect(signatureOf(13)?.textContent).toContain('Signature withdrawn');
  });
});

describe('a state that could not be read is never "Not signed"', () => {
  it('the document read failing says "Signature state could not be read"', async () => {
    detailAnswer = async () => answer(500, { error: 'boom' });
    await mount();
    expect(signatureOf(12)?.getAttribute('data-state')).toBe('unavailable');
    expect(signatureOf(12)?.textContent).toContain('Signature state could not be read');
    expect(document.body.textContent).not.toContain('Not signed');
  });

  it('a facet this client cannot read is unavailable', async () => {
    onDetail[12] = { signedContent: { state: 'signed-ish' } };
    await mount();
    expect(signatureOf(12)?.getAttribute('data-state')).toBe('unavailable');
  });

  it('a translation the document read did not carry is unavailable', async () => {
    delete onDetail[12];
    translations = [row(13, 'fr', 'pending')];
    const listed = [row(12, 'de', 'approved'), row(13, 'fr', 'pending')];
    H.apiRequest.mockImplementation(async (method: string, path: string) => {
      H.calls.push({ method, path });
      if (path === KEYED) return answer(200, { data: [doc] });
      if (path === DETAIL) return detailAnswer();
      if (path === `${DETAIL}/translations`) return answer(200, { data: listed });
      return answer(200, { data: [] });
    });
    await mount();
    expect(signatureOf(12)?.getAttribute('data-state')).toBe('unavailable');
  });

  it("an answer for another document is not this document's state", async () => {
    detailAnswer = async () => answer(200, { data: { ...detailBody().data, id: 5 } });
    await mount();
    expect(signatureOf(12)?.getAttribute('data-state')).toBe('unavailable');
  });
});

describe("the label document's signature", () => {
  it('an approved document shows its state above the lead', async () => {
    doc.status = 'approved';
    docFacet = facet('changed', { bindingBasis: 'labeling-document-content-sha256', reason: CHANGED_REASON });
    await mount();
    const line = screen.getByTestId('labeling-document-signature');
    expect(line.textContent).toContain('Label signature:');
    expect(line.textContent).toContain('Changed since it was signed');
  });

  it('an effective document whose read failed says it could not be read', async () => {
    doc.status = 'effective';
    detailAnswer = async () => answer(503, { error: 'unavailable' });
    await mount();
    expect(screen.getByTestId('labeling-document-signature').textContent).toContain('Signature state could not be read');
  });

  it('a draft never signed shows nothing', async () => {
    await mount();
    expect(screen.queryByTestId('labeling-document-signature')).toBeNull();
  });
});

describe('the read', () => {
  it("is the open project's document, read once, and again after an approval signed here", async () => {
    translations = [row(12, 'de', 'review')];
    onDetail[12] = { signedContent: UNSIGNED, approvalSigner: { state: 'independent' } };
    await mount();
    expect(detailReads()).toBe(1);
    onDetail[12] = { signedContent: facet('matches'), approvalSigner: { state: 'independent' } };
    fireEvent.click(within(rowOf('German')).getByRole('button', { name: /Approve/ }));
    fireEvent.click(screen.getByText('stub-sign'));
    await waitFor(() => expect(signatureOf(12)?.getAttribute('data-state')).toBe('matches'));
    expect(detailReads()).toBe(2);
  });

  it('is read again after a translation is added here, so its creator is warned once it is in review', async () => {
    await mount();
    expect(detailReads()).toBe(1);
    onDetail[91] = { signedContent: UNSIGNED, approvalSigner: { state: 'author' } };
    translations = [...translations, row(91, 'pt', 'pending')];
    fireEvent.click(screen.getAllByText(/Add translation/)[0].closest('button') as HTMLElement);
    fireEvent.change(await screen.findByLabelText(/Language code/), { target: { value: 'pt' } });
    fireEvent.change(screen.getByLabelText(/Translation method/), { target: { value: 'human' } });
    const dialog = screen.getByRole('dialog', { name: 'Add translation' });
    fireEvent.click(dialog.querySelector('button.de-btn.primary') as HTMLElement);
    await screen.findByText('Portuguese');
    await waitFor(() => expect(detailReads()).toBe(2));
    patchAnswer = async (body) => answer(200, { data: row(91, 'pt', String(body.status)) });
    fireEvent.click(within(rowOf('Portuguese')).getByRole('button', { name: /Advance/ }));
    await waitFor(() => expect(within(rowOf('Portuguese')).getByText('In progress')).toBeTruthy());
    fireEvent.click(within(rowOf('Portuguese')).getByRole('button', { name: /Advance/ }));
    await waitFor(() => expect((within(rowOf('Portuguese')).getByRole('button', { name: /Approve/ }) as HTMLButtonElement).disabled).toBe(true));
    expect(within(rowOf('Portuguese')).getByTestId('labeling-own-translation')).toBeTruthy();
  });
});

describe("a translation's creator is told before approving", () => {
  beforeEach(() => {
    translations = [row(12, 'de', 'review'), row(13, 'fr', 'review')];
    onDetail = {
      12: { signedContent: UNSIGNED, approvalSigner: { state: 'author' } },
      13: { signedContent: UNSIGNED, approvalSigner: { state: 'independent' } },
    };
  });

  it('Approve is not offered as if it would work: it is disabled and described by the reason', async () => {
    await mount();
    const approve = within(rowOf('German')).getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    const note = document.getElementById(approve.getAttribute('aria-describedby') ?? '');
    expect(note?.textContent).toBe(
      'You added this translation, so you cannot approve it. Separation of duties requires a different colleague with signing rights to approve it.',
    );
    fireEvent.click(approve);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(H.calls.filter((c) => c.method === 'PATCH')).toEqual([]);
  });

  it("another reviewer's translation is offered as before", async () => {
    await mount();
    const approve = within(rowOf('French')).getByRole('button', { name: /Approve/ }) as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    expect(within(rowOf('French')).queryByTestId('labeling-own-translation')).toBeNull();
  });

  it.each([['unresolved'], ['unverified'], ['not read']])('%s offers Approve with no warning: the server decides', async (state) => {
    onDetail[12] = { signedContent: UNSIGNED, ...(state === 'not read' ? {} : { approvalSigner: { state } }) };
    await mount();
    expect((within(rowOf('German')).getByRole('button', { name: /Approve/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryAllByTestId('labeling-own-translation')).toHaveLength(0);
  });

  it('a read that failed offers Approve with no warning', async () => {
    detailAnswer = async () => answer(500, { error: 'boom' });
    await mount();
    expect((within(rowOf('German')).getByRole('button', { name: /Approve/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('AnA is told the same, and is not offered the approval the screen withholds', async () => {
    await mount();
    const ctx = H.published as Published;
    expect(ctx.facts?.translations.find((t: { id: string }) => t.id === '12').approvalSigner).toBe('author');
    expect(ctx.summary).toContain('The signed-in user added the German translation in review, so they cannot approve it');
    expect(ctx.availableActions).toContain(
      'Not approve the German translation: the signed-in user added it, and a different colleague with signing rights must approve',
    );
  });

  it('a viewer sees no creator note: they are offered nothing to approve', async () => {
    H.user = { id: 3, name: 'Ana Author', permissions: ['read'] };
    await mount();
    expect(screen.queryAllByTestId('labeling-own-translation')).toHaveLength(0);
  });
});

describe("AnA's context carries the signature states", () => {
  it("the document's and each translation's state, and the summary says a change", async () => {
    doc.status = 'approved';
    docFacet = facet('matches', { bindingBasis: 'labeling-document-content-sha256' });
    onDetail[12] = { signedContent: facet('changed', { reason: CHANGED_REASON }), approvalSigner: { state: 'independent' } };
    await mount();
    const ctx = H.published as Published;
    expect(ctx.facts?.document.signedContent).toMatchObject({ state: 'matches', words: 'Signed content unchanged', signedBy: 'Sam Signer' });
    expect(ctx.facts?.translations.find((t: { id: string }) => t.id === '12').signedContent)
      .toMatchObject({ state: 'changed', words: 'Changed since it was signed', reason: CHANGED_REASON });
    expect(ctx.summary).toContain("The label's signature: Signed content unchanged.");
    expect(ctx.summary).toContain('Translation approval signatures: German, Changed since it was signed.');
  });

  it('a state not read is told as not read, not as unsigned', async () => {
    detailAnswer = async () => answer(500, { error: 'boom' });
    await mount();
    const t = (H.published as Published).facts?.translations.find((x: { id: string }) => x.id === '12');
    expect(t.signedContent.state).toBe('unavailable');
    expect(t.signedContent.note).toContain('not a statement that the record is unsigned');
  });
});
