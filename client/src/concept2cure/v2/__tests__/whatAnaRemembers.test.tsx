// @vitest-environment jsdom
/**
 * What AnA remembers — the read-only panel beside the conversation (D2, fold
 * ana-memory into the conversation, 2026-10-29;
 * docs/evidence/D2-ONE-ANA/2026-10-29/fold-ana-memory/).
 *
 * The two reads of the retired `ana-memory` screen that were real carry here,
 * and only those: how AnA is tuned to the person (AnaMemory.tsx:107,208-219)
 * and the "Things I got wrong" ledger (AnaMemory.tsx:223-232), now with the
 * project-scoped profile for the project the conversation is held in, which
 * the retired screen never read although every turn does
 * (relational-profile-service.ts loadRelationalOverlay).
 *
 * The panel names no user: both reads are of the session's own notes. A read
 * that failed is an error with a way to try again, a refusal is said as one, an
 * absent store is not "no notes yet", and an empty ledger says so.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { WhatAnaRemembers } from '../WhatAnaRemembers';

const PROGRAM = '5ac45b38-a1d8-4a41-9488-fac39a57b852';
const USER_PATH = '/api/mdx/ana/memory/profile';
const PROJECT_PATH = `/api/mdx/ana/memory/profile?project_id=${PROGRAM}`;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
/* apiRequest throws on a non-2xx (assertApiResponseOk), carrying the status,
   the server's code and its sentence. */
const refusal = (status: number, code: string | undefined, message: string) =>
  Object.assign(new Error(message), { status, ...(code ? { code } : {}) });

const MINE = {
  interaction_count: 12,
  last_interaction_at: '2026-10-20T03:00:00Z',
  profile_summary: 'Leads with the answer and wants the source named.',
  tone_calibration: { warmth: 'medium', humor: 'rare', formality: 'formal', detail: 'concise' },
  emotional_signals: [
    { at: '2026-10-19T03:00:00Z', signal: 'An older read' },
    { at: '2026-10-20T03:00:00Z', signal: 'Deadline pressure on the IND' },
  ],
  acknowledged_mistakes: [
    { at: '2026-10-18T12:00:00Z', mistake: 'Cited a draft as the filed protocol', correction: 'Cite the filed version only' },
  ],
};
const MINE_FOR_PROJECT = {
  interaction_count: 4,
  last_interaction_at: '2026-10-20T03:00:00Z',
  profile_summary: 'On ZX-9 the CMC section is the pressure point.',
  tone_calibration: {},
  emotional_signals: [],
  acknowledged_mistakes: [
    { at: '2026-10-19T12:00:00Z', mistake: 'Called ZX-9 a biologic', correction: 'ZX-9 is a small molecule' },
  ],
};
const PROJECT_META = { scope: 'project', projectId: 11, projectRef: PROGRAM };

type Answer = () => Promise<Response>;
function serve(user: Answer, project: Answer = async () => ok({ data: MINE_FOR_PROJECT, meta: PROJECT_META })) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === USER_PATH) return user();
    if (method === 'GET' && url === PROJECT_PATH) return project();
    throw new Error(`unexpected ${method} ${url}`);
  });
}
const mine: Answer = async () => ok({ data: MINE, meta: { scope: 'user' } });

const onClose = vi.fn();
function open(projectRef: string | number | null = PROGRAM, projectName: string | null = 'ZX-9') {
  return render(<WhatAnaRemembers projectRef={projectRef} projectName={projectName} onClose={onClose} />);
}
const yours = () => screen.getByTestId('ana-remembers-user');
const project = () => screen.getByTestId('ana-remembers-project');

afterEach(cleanup);
beforeEach(() => {
  apiRequest.mockReset();
  onClose.mockReset();
});

describe('What AnA remembers — the two real reads, for the caller alone', () => {
  it('reads the caller’s own notes and their notes for the open project, and names no user', async () => {
    serve(mine);
    open();

    expect(await within(yours()).findByText('Leads with the answer and wants the source named.')).toBeTruthy();
    expect(await within(project()).findByText('On ZX-9 the CMC section is the pressure point.')).toBeTruthy();

    const reads = apiRequest.mock.calls.map(([method, url]) => `${method} ${url}`);
    expect(reads.sort()).toEqual([`GET ${PROJECT_PATH}`, `GET ${USER_PATH}`].sort());
    for (const [, url] of apiRequest.mock.calls) expect(String(url)).not.toMatch(/user/i);
  });

  it('shows how AnA is tuned to the person: notes, the four tone settings and the latest read', async () => {
    serve(mine);
    open();
    const you = await waitFor(() => {
      const el = yours();
      expect(within(el).getByText('Leads with the answer and wants the source named.')).toBeTruthy();
      return el;
    });
    for (const [label, value] of [['Warmth', 'medium'], ['Humor', 'rare'], ['Formality', 'formal'], ['Detail', 'concise']]) {
      const cell = within(you).getByText(label).closest('.amem-tone-cell') as HTMLElement;
      expect(within(cell).getByText(value)).toBeTruthy();
    }
    expect(within(you).getByText(/Deadline pressure on the IND/)).toBeTruthy();
    expect(you.textContent).not.toContain('An older read');
  });

  it('shows the ledger of what AnA got wrong and the correction, in each scope', async () => {
    serve(mine);
    open();
    expect(await within(yours()).findByText(/Cited a draft as the filed protocol/)).toBeTruthy();
    expect(within(yours()).getByText(/Cite the filed version only/)).toBeTruthy();
    expect(await within(project()).findByText(/Called ZX-9 a biologic/)).toBeTruthy();
    expect(within(project()).getByText(/ZX-9 is a small molecule/)).toBeTruthy();
    // Each scope holds its own entries.
    expect(yours().textContent).not.toContain('Called ZX-9 a biologic');
    expect(project().textContent).not.toContain('Cited a draft as the filed protocol');
  });

  it('heads the project’s notes with the open project', async () => {
    serve(mine);
    open(PROGRAM, 'ZX-9');
    expect(await within(project()).findByRole('heading', { name: /for this project: zx-9/i })).toBeTruthy();
  });

  it('counts turns, which is what the profile counts, not conversations', async () => {
    serve(mine);
    open();
    await within(yours()).findByText('Leads with the answer and wants the source named.');
    expect(yours().textContent).toMatch(/12 turns/);
    expect(document.body.textContent).not.toMatch(/conversations? with you|across \d+ conversations/i);
  });
});

describe('What AnA remembers — honest states', () => {
  it('an empty ledger says so, in each scope', async () => {
    serve(
      async () => ok({ data: { ...MINE, acknowledged_mistakes: [] }, meta: { scope: 'user' } }),
      async () => ok({ data: { ...MINE_FOR_PROJECT, acknowledged_mistakes: [] }, meta: PROJECT_META }),
    );
    open();
    expect(await within(yours()).findByText('Nothing on the ledger yet.')).toBeTruthy();
    expect(await within(project()).findByText('Nothing on the ledger yet.')).toBeTruthy();
  });

  it('no notes yet is said as that, not as an error, and the ledger is still said to be empty', async () => {
    serve(async () => ok({ data: null, meta: { scope: 'user' } }), async () => ok({ data: null, meta: PROJECT_META }));
    open();
    expect(await within(yours()).findByText(/has not kept notes about working with you yet/i)).toBeTruthy();
    expect(await within(project()).findByText(/has not kept notes for this project yet/i)).toBeTruthy();
    expect(within(yours()).getByText('Nothing on the ledger yet.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a row AnA has not yet written notes into is not shown as blank notes', async () => {
    serve(async () => ok({ data: { ...MINE, profile_summary: null, tone_calibration: {}, emotional_signals: [], acknowledged_mistakes: [] }, meta: { scope: 'user' } }));
    open(null, null);
    expect(await within(yours()).findByText(/has not written notes about working with you yet/i)).toBeTruthy();
    expect(within(yours()).getAllByText('Not set yet')).toHaveLength(4);
  });

  it('a failed read of the caller’s notes is an error with Try again, never an empty memory; Try again reads again', async () => {
    let calls = 0;
    serve(async () => {
      calls += 1;
      if (calls === 1) throw refusal(500, undefined, 'Internal server error');
      return ok({ data: MINE, meta: { scope: 'user' } });
    });
    open();
    const alert = await within(yours()).findByRole('alert');
    expect(alert.textContent).toMatch(/could not be read/i);
    expect(alert.textContent).toMatch(/not an empty memory/i);
    expect(yours().textContent).not.toMatch(/has not kept notes/i);
    fireEvent.click(within(yours()).getByRole('button', { name: /try again/i }));
    expect(await within(yours()).findByText('Leads with the answer and wants the source named.')).toBeTruthy();
    expect(calls).toBe(2);
  });

  it('a refused read is said as a refusal, with nothing to retry', async () => {
    serve(async () => { throw refusal(403, undefined, 'Organization context required'); });
    open();
    const alert = await within(yours()).findByRole('alert');
    expect(alert.textContent).toMatch(/were not read/i);
    expect(within(yours()).queryByRole('button', { name: /try again/i })).toBeNull();
    expect(yours().textContent).not.toMatch(/has not kept notes|could not be read/i);
  });

  it('an absent store is said, not shown as no notes yet', async () => {
    serve(async () => ok({ data: null, meta: { scope: 'user', pendingStore: true } }));
    open(null, null);
    const alert = await within(yours()).findByRole('alert');
    expect(alert.textContent).toMatch(/not kept on this server/i);
    expect(yours().textContent).not.toMatch(/has not kept notes|Nothing on the ledger yet/i);
  });

  it('a project the caller cannot open is refused in the server’s terms; their own notes still show', async () => {
    serve(mine, async () => { throw refusal(403, 'ANA_PROJECT_ACCESS_DENIED', 'You do not have current access to this project.'); });
    open();
    expect(await within(yours()).findByText('Leads with the answer and wants the source named.')).toBeTruthy();
    const alert = await within(project()).findByRole('alert');
    expect(alert.textContent).toMatch(/do not have current access to this project/i);
    expect(within(project()).queryByRole('button', { name: /try again/i })).toBeNull();
    expect(project().textContent).not.toMatch(/has not kept notes for this project/i);
  });

  it('a project access check that could not run offers Try again, and says nothing about the project', async () => {
    let calls = 0;
    serve(mine, async () => {
      calls += 1;
      if (calls === 1) throw refusal(503, 'ANA_PROJECT_ACCESS_UNAVAILABLE', 'Current project access could not be verified. AnA has not read its sources.');
      return ok({ data: MINE_FOR_PROJECT, meta: PROJECT_META });
    });
    open();
    const alert = await within(project()).findByRole('alert');
    expect(alert.textContent).toMatch(/could not be checked/i);
    fireEvent.click(within(project()).getByRole('button', { name: /try again/i }));
    expect(await within(project()).findByText('On ZX-9 the CMC section is the pressure point.')).toBeTruthy();
  });

  it('an answer that does not say it is this project’s is not shown as the project’s', async () => {
    serve(mine, async () => ok({ data: MINE, meta: { scope: 'user' } }));
    open();
    const alert = await within(project()).findByRole('alert');
    expect(alert.textContent).toMatch(/did not say it was this project/i);
    expect(project().textContent).not.toContain('Leads with the answer and wants the source named.');
  });

  it('with no project open, nothing is read for a project, and the panel says only the notes above are read', async () => {
    serve(mine);
    open(null, null);
    await within(yours()).findByText('Leads with the answer and wants the source named.');
    expect(project().textContent).toMatch(/no project is open/i);
    expect(apiRequest.mock.calls.map(([, url]) => url)).toEqual([USER_PATH]);
  });

  it('speaks in words: no table or column name reaches the screen', async () => {
    serve(async () => ok({ data: null, meta: { scope: 'user' } }), async () => ok({ data: null, meta: PROJECT_META }));
    open();
    await within(yours()).findByText(/has not kept notes about working with you yet/i);
    expect(document.body.textContent).not.toMatch(/\b[a-z]+(?:_[a-z]+)+\b/);
  });
});

describe('What AnA remembers — a dialog beside the conversation', () => {
  it('is named, read-only, and closes on Close and on Escape', async () => {
    serve(mine);
    open();
    const dialog = screen.getByRole('dialog', { name: 'What AnA remembers' });
    await within(yours()).findByText('Leads with the answer and wants the source named.');
    // Read-only: nothing in it writes.
    expect(within(dialog).queryByRole('textbox')).toBeNull();
    const buttons = within(dialog).getAllByRole('button').map((b) => b.getAttribute('aria-label') || b.textContent);
    expect(buttons).toEqual(['Close']);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(apiRequest.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
});
