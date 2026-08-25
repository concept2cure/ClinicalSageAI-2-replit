// @vitest-environment jsdom
/**
 * saveToAuthoring — the failure semantics that decide whether work is lost.
 *
 * Three surfaces end in "Open in document editor". Each must create a governed
 * document, write its text as a section, and navigate ONLY then. The case that
 * matters is the half-failure: the document POST succeeds and the section POST
 * does not. The document now exists and is empty. If the caller navigates
 * anyway, the user arrives at an editor that does not contain the thing they
 * just spent time on, with no indication that anything went wrong.
 *
 * That is why the result is a union rather than a thrown error or a bare doc
 * id: `ok: false` is the signal that says "stay put", and it has to be
 * unmissable at the call site. `no-ghost-globals.contract.test.ts` checks that
 * each surface HAS the early return; this file checks that the value it
 * branches on is right.
 *
 * The three source surfaces each carried their own copy of this sequence before
 * it was extracted, which meant three copies of this branch and three chances
 * for one to drift.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { saveToAuthoring } from '../authoringHandoff';

const res = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const HANDOFF = {
  title: 'Statistical Analysis Plan',
  module: 'M5',
  code: 'statistical_document',
  content: '# SAP\n\nThe text the user made.',
  subject: 'the document',
};

beforeEach(() => {
  apiRequest.mockReset();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('saveToAuthoring', () => {
  it('writes the document and its section, then reports ok', async () => {
    apiRequest
      .mockResolvedValueOnce(res(200, { document: { id: 4711 } }))
      .mockResolvedValueOnce(res(200, { section: { id: 9 } }));

    const r = await saveToAuthoring(HANDOFF);

    expect(r.ok).toBe(true);
    expect(r.ok && r.docId).toBe('4711');

    // Both POSTs, in order, with the section carrying the user's text and
    // pointing at the document that was just created.
    expect(apiRequest).toHaveBeenCalledTimes(2);
    const [m1, u1, b1] = apiRequest.mock.calls[0];
    expect([m1, u1]).toEqual(['POST', '/api/authoring/docs']);
    expect(b1).toMatchObject({ title: HANDOFF.title, module: 'M5' });

    const [m2, u2, b2] = apiRequest.mock.calls[1];
    expect([m2, u2]).toEqual(['POST', '/api/authoring/sections']);
    expect(b2).toMatchObject({ doc_id: '4711', code: HANDOFF.code, content: HANDOFF.content });
  });

  it('says so when the new document is not bound to a filing', async () => {
    // The server reports binding on every create and both client create paths
    // used to drop it, so a document it had DECLINED to attach to the project's
    // filing read as plain success. "Saved" and "saved into the filing you
    // think you are writing" are different facts.
    apiRequest
      .mockResolvedValueOnce(res(200, {
        document: { id: 4711 },
        governance: { bound: false, reason: 'This project has no governed document yet.' },
      }))
      .mockResolvedValueOnce(res(200, { section: { id: 9 } }));

    const r = await saveToAuthoring(HANDOFF);

    // Still ok: the document and its text are real, so the caller must still
    // navigate. What changes is that the message stops overstating.
    expect(r.ok).toBe(true);
    expect(r.ok && r.message).toMatch(/Not bound to a filing/);
    expect(r.ok && r.message).toMatch(/no governed document yet/);
  });

  it('stays quiet when the document IS bound', async () => {
    apiRequest
      .mockResolvedValueOnce(res(200, {
        document: { id: 4711 },
        governance: { bound: true, c2cDocumentId: 'doc_ind_7' },
      }))
      .mockResolvedValueOnce(res(200, { section: { id: 9 } }));

    const r = await saveToAuthoring(HANDOFF);
    expect(r.ok && r.message).not.toMatch(/Not bound/);
  });

  it('invents no warning when the server reports no binding at all', async () => {
    // An older server that does not send `governance` has not told us the
    // document is unbound. Warning from silence would be its own dishonesty.
    apiRequest
      .mockResolvedValueOnce(res(200, { document: { id: 4711 } }))
      .mockResolvedValueOnce(res(200, { section: { id: 9 } }));

    const r = await saveToAuthoring(HANDOFF);
    expect(r.ok && r.message).not.toMatch(/Not bound/);
  });

  it('reports NOT ok when the section write fails, even though the document exists', async () => {
    apiRequest
      .mockResolvedValueOnce(res(200, { document: { id: 4711 } }))
      .mockResolvedValueOnce(res(500, { error: 'section insert failed' }));

    const r = await saveToAuthoring(HANDOFF);

    // The whole point. A document was created, so a naive implementation has a
    // doc id in hand and every reason to feel successful — and navigating on it
    // is how the user's text disappears.
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/didn’t save/);
    expect(r.message).toMatch(/Staying here/);
  });

  it('reports NOT ok when the document write fails, and never attempts the section', async () => {
    apiRequest.mockResolvedValueOnce(res(500, { error: 'no' }));

    const r = await saveToAuthoring(HANDOFF);

    expect(r.ok).toBe(false);
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(r.message).toMatch(/Nothing was saved; the document is still here/);
  });

  it('names the 401 as a session problem rather than a server error', async () => {
    // A signed-out user retrying a 500 forever is a worse outcome than being
    // told to sign in, and the two are indistinguishable from the toast unless
    // this branch exists.
    apiRequest.mockResolvedValueOnce(res(401, {}));

    const r = await saveToAuthoring(HANDOFF);

    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/isn’t authenticated/);
    expect(r.message).toMatch(/Nothing was saved/);
  });

  it('never throws — a transport failure comes back as a message', async () => {
    // If this rejected, a caller doing `await saveToAuthoring(...)` outside a
    // try would blow past its own guard.
    apiRequest.mockRejectedValueOnce(new Error('offline'));

    const r = await saveToAuthoring(HANDOFF);

    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/offline/);
    expect(r.message).toMatch(/Nothing was saved/);
  });

  it('scopes the document to the project when one is in context, and omits it when not', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 'prog-7' };
    apiRequest
      .mockResolvedValueOnce(res(200, { document: { id: 1 } }))
      .mockResolvedValueOnce(res(200, { section: { id: 1 } }));
    await saveToAuthoring(HANDOFF);
    expect(apiRequest.mock.calls[0][2]).toMatchObject({ client_program_id: 'prog-7' });

    // A non-string id is not a program id — sending it would scope the document
    // to something the editor's filter will never match.
    apiRequest.mockReset();
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 7 };
    apiRequest
      .mockResolvedValueOnce(res(200, { document: { id: 1 } }))
      .mockResolvedValueOnce(res(200, { section: { id: 1 } }));
    await saveToAuthoring(HANDOFF);
    expect(apiRequest.mock.calls[0][2]).not.toHaveProperty('client_program_id');
  });

  it('carries the caller’s module rather than defaulting it', () => {
    /*
     * Not a runtime assertion — a statement of the contract. The server falls
     * back to 'M3' when `module` is absent, which is right for CMC quality
     * documentation and wrong for a statistical document or a protocol
     * analysis (both M5). Making `module` required on AuthoringHandoff keeps
     * that decision at the surface that knows the answer; if it were optional
     * here, two of the three callers would silently file under the wrong CTD
     * module. This test exists so that deleting the `module` field from the
     * interface fails something.
     */
    const h: Parameters<typeof saveToAuthoring>[0] = HANDOFF;
    expect(h.module).toBe('M5');
  });
});
