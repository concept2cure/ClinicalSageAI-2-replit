// @vitest-environment jsdom
/**
 * Review annotations on a Vault version (plan critique 15, D2/D5): the panel
 * lists what the server returns, open by default, with each anchor in words
 * and a stale anchor said; a list that could not be read is never shown as
 * empty; a post, resolution or retraction is claimed only after the server's
 * 2xx; a passage is sent in code points. Server half:
 * tests/db/vault-version-annotations.dbtest.ts.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ApiRequestError } from '@/lib/queryClient';
import { VaultAnnotations, codePointRange, openAnnotationsSentence, type OpenByVersion } from '../surfaces/VaultAnnotations';

const PID = '11111111-1111-4111-8111-111111111111';
const DOC = '22222222-2222-4222-8222-222222222222';
const V1 = '33333333-3333-4333-8333-333333333333';
const ANN_URL = `/api/c2c/project-vault/${PID}/documents/${DOC}/annotations`;
const TEXT_URL = `/api/c2c/project-vault/${PID}/documents/${DOC}/text`;
const act = (id: string, what: string) => `/api/c2c/project-vault/${PID}/annotations/${id}/${what}`;
const SHA = 'c'.repeat(64);
const NOTE = 'Corrected in the new version.';

const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;
const refusal = (status: number, error: string, message: string) => new ApiRequestError(message, status, { success: false, error, message }, error);

const ann = (over: Record<string, unknown> = {}) => ({
  id: 'a-doc', parentId: null, versionId: DOC, versionLabel: '2.0', programId: PID, kind: 'comment',
  anchor: { kind: 'document' }, anchorCurrent: null, status: 'open', body: 'Section 2 needs the batch numbers.',
  authorId: 7, authorName: 'Rhea Reviewer', createdAt: '2026-09-30T14:05:09.000Z', resolution: null, retraction: null, replies: [],
  ...over,
});

const LIST = {
  annotations: [
    ann({ replies: [ann({ id: 'r-1', parentId: 'a-doc', anchor: null, body: 'Added in the next upload.', authorId: 9, authorName: 'Ari Author', createdAt: '2026-09-30T15:00:00.000Z' })] }),
    ann({ id: 'a-page', versionId: V1, versionLabel: '1.0', kind: 'request_changes', anchor: { kind: 'page', page: 4, pagesAtPost: 12 },
      anchorCurrent: false, body: 'Table 3 totals do not add up.', authorId: 8, authorName: 'Sam Second' }),
    ann({ id: 'a-text', kind: 'request_changes', anchor: { kind: 'text', quote: 'shall be stored at 2–8 °C', charStart: 10, charEnd: 35, textSha256: SHA },
      anchorCurrent: false, body: 'Name the excursion limits.' }),
    ann({ id: 'a-res', status: 'resolved', body: 'Missing the lot number.',
      resolution: { byId: 9, byName: 'Ari Author', at: '2026-09-30T16:30:00.000Z', note: NOTE, addressedIn: { versionId: DOC, versionLabel: '2.0' } } }),
    ann({ id: 'a-ret', status: 'retracted', body: 'Wrong section.',
      retraction: { byId: 7, byName: 'Rhea Reviewer', at: '2026-09-30T17:00:00.000Z', reason: 'Posted on the wrong document.' } }),
  ],
  openByVersion: [
    { versionId: DOC, versionLabel: '2.0', current: true, open: 2, openChangeRequests: 1 },
    { versionId: V1, versionLabel: '1.0', current: false, open: 1, openChangeRequests: 1 },
  ],
};
const EMPTY = { annotations: [], openByVersion: [{ versionId: DOC, versionLabel: '2.0', current: true, open: 0, openChangeRequests: 0 }] };

let onList: () => Response | Promise<Response>;
let onText: (url: string) => Response;
let onPost: (body: unknown) => Response | Promise<Response>;
let onAct: (url: string, body: unknown) => Response;
const onChanged = vi.fn();

beforeEach(() => {
  apiRequest.mockReset();
  onChanged.mockReset();
  onList = () => res(200, { success: true, data: LIST });
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (url === ANN_URL && method === 'GET') return onList();
    if (url === ANN_URL && method === 'POST') return onPost(body);
    if (url.startsWith(`${TEXT_URL}?`)) return onText(url);
    if (url.startsWith(`/api/c2c/project-vault/${PID}/annotations/`)) return onAct(url, body);
    throw new Error(`unexpected ${method} ${url}`);
  });
});
afterEach(() => cleanup());

const mount = (actorId: number | null = 7) =>
  render(<VaultAnnotations projectId={PID} documentId={DOC} onChanged={onChanged} actorId={actorId} />);
const cards = () => screen.findAllByTestId('vault-annotation');
const openAdd = async () => {
  fireEvent.click(await screen.findByTestId('vault-annotations-open'));
  return screen.getByTestId('vault-annotations-add');
};

describe('the list (1)', () => {
  it('lists what the server returns, open by default, with the summary, the three anchors and stale notes', async () => {
    mount();
    expect((await screen.findByTestId('vault-annotations-summary')).textContent)
      .toBe('Open: v2.0 — 2 (1 change request) · v1.0 — 1 (1 change request)');
    const [doc, page, text] = await cards();
    expect(screen.getAllByTestId('vault-annotation')).toHaveLength(3);
    expect(doc.textContent).toContain('Comment');
    expect(doc.textContent).toContain('Whole document');
    expect(doc.textContent).toContain('Rhea Reviewer · 2026-09-30 14:05 UTC');
    expect(doc.textContent).toContain('Section 2 needs the batch numbers.');
    expect(doc.textContent).not.toContain('Posted on');
    expect(within(doc).getByTestId('vault-annotation-reply').textContent).toContain('Ari Author · 2026-09-30 15:00 UTC');
    expect(page.textContent).toContain('Change request');
    expect(page.textContent).toContain('Posted on v1.0');
    expect(page.textContent).toContain('Page 4 of 12');
    expect(page.textContent).toContain("This version's page count has changed since this was posted.");
    expect(text.querySelector('blockquote')?.textContent).toBe('shall be stored at 2–8 °C');
    expect(text.textContent).toContain('The extracted text has changed since this was posted; the quote is as the reviewer saw it.');

    fireEvent.click(screen.getByRole('button', { name: /^Resolved/ }));
    const [resolved] = await cards();
    expect(screen.getAllByTestId('vault-annotation')).toHaveLength(1);
    expect(within(resolved).getByTestId('vault-annotation-outcome').textContent)
      .toBe(`Resolved by Ari Author · 2026-09-30 16:30 UTC · ${NOTE} · addressed in v2.0`);
    expect(within(resolved).queryByRole('button', { name: 'Reply' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Retracted/ }));
    expect(within((await cards())[0]).getByTestId('vault-annotation-outcome').textContent)
      .toBe('Retracted by Rhea Reviewer · 2026-09-30 17:00 UTC · Posted on the wrong document.');
  });

  it('says when nothing is open on any version', async () => {
    onList = () => res(200, { success: true, data: EMPTY });
    mount();
    expect((await screen.findByTestId('vault-annotations-summary')).textContent).toBe('No open annotations on any version of this document.');
  });
});

describe('a list that could not be read (2)', () => {
  it('a 500 says so and never reads as no open annotations', async () => {
    onList = () => { throw refusal(500, 'ANNOTATIONS_UNAVAILABLE', "This document's annotations could not be read. Nothing is shown rather than an incomplete list."); };
    mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/^The review annotations could not be read; none are shown/);
    expect(screen.getByTestId('vault-annotations').textContent).not.toMatch(/No open annotations/);
    expect(screen.queryByTestId('vault-annotation')).toBeNull();
  });

  it('a 200 that is not the expected shape says so too', async () => {
    onList = () => res(200, {});
    mount();
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read; none are shown.*not in the expected form/);
    expect(screen.getByTestId('vault-annotations').textContent).not.toMatch(/No open annotations/);
  });
});

describe('posting (3)', () => {
  it('claims a whole-document comment only once the server answered 201', async () => {
    let release!: () => void;
    onPost = () => new Promise<Response>((done) => { release = () => done(res(201, { success: true, data: { id: 'a-9' } })); });
    mount();
    const form = await openAdd();
    fireEvent.change(within(form).getByTestId('vault-annotations-body'), { target: { value: '  Check the units.  ' } });
    fireEvent.click(within(form).getByTestId('vault-annotations-post'));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('POST', ANN_URL, { kind: 'comment', body: 'Check the units.', anchor: { kind: 'document' } }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(within(form).getByTestId('vault-annotations-post').textContent).toBe('Posting…');
    expect(onChanged).not.toHaveBeenCalled();
    release();
    expect((await screen.findByRole('status')).textContent).toBe("Annotation posted. Recorded in the document's history.");
    expect(onChanged).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(apiRequest.mock.calls.filter(([m, u]) => m === 'GET' && u === ANN_URL)).toHaveLength(2));
  });

  it('a 409 shows the server message, keeps the form and claims nothing', async () => {
    onPost = () => { throw refusal(409, 'ANNOTATION_REFUSED', 'The annotation record refused this change. Nothing was changed.'); };
    mount();
    const form = await openAdd();
    fireEvent.change(within(form).getByTestId('vault-annotations-kind'), { target: { value: 'request_changes' } });
    fireEvent.change(within(form).getByTestId('vault-annotations-body'), { target: { value: 'Check the units.' } });
    fireEvent.click(within(form).getByTestId('vault-annotations-post'));
    expect((await within(form).findByRole('alert')).textContent)
      .toBe('The annotation was not posted. The annotation record refused this change. Nothing was changed.');
    expect(screen.getByTestId('vault-annotations-add')).toBe(form);
    expect((within(form).getByTestId('vault-annotations-body') as HTMLTextAreaElement).value).toBe('Check the units.');
    expect(screen.queryByRole('status')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a returned 401 is not a success either', async () => {
    onPost = () => res(401, { error: { code: 'AUTH_002', message: 'Your session has expired. Sign in again.' } });
    mount();
    const form = await openAdd();
    fireEvent.change(within(form).getByTestId('vault-annotations-body'), { target: { value: 'Check the units.' } });
    fireEvent.click(within(form).getByTestId('vault-annotations-post'));
    expect((await within(form).findByRole('alert')).textContent).toMatch(/^The annotation was not posted\./);
    expect(screen.queryByRole('status')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('passages in code points (4)', () => {
  it('codePointRange converts UTF-16 offsets and refuses a split character or an empty range', () => {
    expect(codePointRange('x𝛼 quick', 4, 9)).toEqual({ charStart: 3, quote: 'quick' });
    expect(codePointRange('x𝛼', 2, 3)).toBeNull();
    expect(codePointRange('abc', 1, 1)).toBeNull();
  });

  it('posts the selected passage at its absolute code-point offset with the hash as read', async () => {
    const TEXT = 'x𝛼 quick brown fox';
    onText = () => res(200, { success: true, data: { text: TEXT, from: 0, length: 17, totalLength: 17, textSha256: SHA, pageCount: 3 } });
    onPost = () => res(201, { success: true, data: { id: 'a-9' } });
    mount();
    const form = await openAdd();
    fireEvent.click(within(form).getByLabelText('Passage'));
    expect(within(form).getByText('A passage is anchored to the extracted text, not to a page of the file.')).toBeTruthy();
    const pre = await within(form).findByTestId('vault-annotations-text');
    expect(apiRequest).toHaveBeenCalledWith('GET', `${TEXT_URL}?from=0&length=200000`, undefined);
    const range = document.createRange();
    range.setStart(pre.firstChild!, 4);
    range.setEnd(pre.firstChild!, 9);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    fireEvent.mouseUp(pre);
    expect(within(form).getByTestId('vault-annotations-picked').textContent).toBe('quick');
    fireEvent.change(within(form).getByTestId('vault-annotations-body'), { target: { value: 'Too vague.' } });
    fireEvent.click(within(form).getByTestId('vault-annotations-post'));
    await screen.findByRole('status');
    expect(apiRequest).toHaveBeenCalledWith('POST', ANN_URL,
      { kind: 'comment', body: 'Too vague.', anchor: { kind: 'text', quote: 'quick', charStart: 3, textSha256: SHA } });
  });
});

describe('acting on an annotation (5)', () => {
  it('offers Retract only on the actor’s own annotations and replies', async () => {
    mount(7);
    const [doc, page] = await cards();
    expect(within(doc).getByRole('button', { name: 'Retract' })).toBeTruthy();
    expect(within(page).queryByRole('button', { name: 'Retract' })).toBeNull();
    expect(within(doc).queryByRole('button', { name: 'Retract reply' })).toBeNull();
    cleanup();
    mount(9);
    const [doc9] = await cards();
    expect(within(doc9).queryByRole('button', { name: 'Retract' })).toBeNull();
    expect(within(doc9).getByRole('button', { name: 'Retract reply' })).toBeTruthy();
  });

  it('a 422 on resolve shows the server message and keeps the form', async () => {
    onAct = () => { throw refusal(422, 'NOT_IN_FAMILY', 'The version named as addressing this is not a version of this document.'); };
    mount(7);
    const page = (await cards())[1];
    fireEvent.click(within(page).getByRole('button', { name: 'Resolve' }));
    const form = within(page).getByTestId('vault-annotation-resolve-form');
    const confirm = within(form).getByRole('button', { name: 'Resolve annotation' }) as HTMLButtonElement;
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'short' } });
    expect(confirm.disabled).toBe(true);
    fireEvent.change(within(form).getByRole('textbox'), { target: { value: NOTE } });
    fireEvent.change(within(form).getByTestId('vault-annotation-addressed'), { target: { value: DOC } });
    fireEvent.click(confirm);
    expect((await within(form).findByRole('alert')).textContent)
      .toBe('The annotation was not resolved. The version named as addressing this is not a version of this document.');
    expect(apiRequest).toHaveBeenCalledWith('POST', act('a-page', 'resolve'), { note: NOTE, addressedInVersionId: DOC });
    expect(screen.queryByRole('status')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('a retraction is claimed after the 200, with its reason sent', async () => {
    onAct = () => res(200, { success: true, data: {} });
    mount(7);
    const doc = (await cards())[0];
    fireEvent.click(within(doc).getByRole('button', { name: 'Retract' }));
    fireEvent.change(within(doc).getByRole('textbox'), { target: { value: 'Posted on the wrong version.' } });
    fireEvent.click(within(doc).getByRole('button', { name: 'Retract annotation' }));
    expect((await screen.findByRole('status')).textContent).toBe("Annotation retracted. Your reason is recorded in the document's history.");
    expect(apiRequest).toHaveBeenCalledWith('POST', act('a-doc', 'retract'), { reason: 'Posted on the wrong version.' });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('a reply is claimed after the 201, and its form closes', async () => {
    onAct = () => res(201, { success: true, data: { id: 'r-2' } });
    mount(9);
    const doc = (await cards())[0];
    fireEvent.click(within(doc).getByRole('button', { name: 'Reply' }));
    fireEvent.change(within(doc).getByRole('textbox'), { target: { value: 'Batch numbers added in v2.1.' } });
    fireEvent.click(within(doc).getByRole('button', { name: 'Post reply' }));
    expect((await screen.findByRole('status')).textContent).toBe("Reply posted. Recorded in the document's history.");
    expect(apiRequest).toHaveBeenCalledWith('POST', act('a-doc', 'replies'), { body: 'Batch numbers added in v2.1.' });
    await waitFor(() => expect(screen.queryByTestId('vault-annotation-reply-form')).toBeNull());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });
});

describe('page anchors (6)', () => {
  it('offers the page input when the text read gives a page count', async () => {
    onText = () => res(200, { success: true, data: { text: 'x', from: 0, length: 1, totalLength: 40, textSha256: SHA, pageCount: 12 } });
    onPost = () => res(201, { success: true, data: { id: 'a-9' } });
    mount();
    const form = await openAdd();
    fireEvent.click(within(form).getByLabelText('Page'));
    const input = (await within(form).findByTestId('vault-annotations-page')) as HTMLInputElement;
    expect(apiRequest).toHaveBeenCalledWith('GET', `${TEXT_URL}?from=0&length=1`, undefined);
    expect(input.max).toBe('12');
    fireEvent.change(within(form).getByTestId('vault-annotations-body'), { target: { value: 'See the table.' } });
    fireEvent.change(input, { target: { value: '13' } });
    expect((within(form).getByTestId('vault-annotations-post') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.click(within(form).getByTestId('vault-annotations-post'));
    await screen.findByRole('status');
    expect(apiRequest).toHaveBeenCalledWith('POST', ANN_URL, { kind: 'comment', body: 'See the table.', anchor: { kind: 'page', page: 4 } });
  });

  it('does not offer it when the version has no recorded page count', async () => {
    onText = () => res(200, { success: true, data: { text: 'x', from: 0, length: 1, totalLength: 40, textSha256: SHA, pageCount: null } });
    mount();
    const form = await openAdd();
    fireEvent.click(within(form).getByLabelText('Page'));
    expect((await within(form).findByText(/^This version has no recorded page count\./))).toBeTruthy();
    expect(within(form).queryByTestId('vault-annotations-page')).toBeNull();
    expect((within(form).getByTestId('vault-annotations-post') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('openAnnotationsSentence (7)', () => {
  const v = (versionLabel: string | null, open: number, openChangeRequests: number, current = false): OpenByVersion =>
    ({ versionId: `id-${versionLabel}`, versionLabel, current, open, openChangeRequests });
  it('says what was open, or that it could not be read', () => {
    expect(openAnnotationsSentence(null)).toBe('The open annotations on this document could not be read, so none are listed here.');
    expect(openAnnotationsSentence([v('2.0', 0, 0, true), v('1.0', 0, 0)])).toBe('No annotations were open on any version of this document.');
    expect(openAnnotationsSentence([v('2.0', 1, 1, true), v('1.0', 2, 2)]))
      .toBe('These annotations were open: v2.0 — 1 (1 change request); v1.0 — 2 (2 change requests).');
    expect(openAnnotationsSentence([v('3.0', 0, 0, true), v('2.0', 3, 0), v(null, 1, 1)]))
      .toBe('These annotations were open: v2.0 — 3 (no change requests); an unnumbered version — 1 (1 change request).');
    expect(openAnnotationsSentence([v('2.0', 1, 0, true)])).toBe('This annotation was open: v2.0 — 1 (no change requests).');
  });
});
