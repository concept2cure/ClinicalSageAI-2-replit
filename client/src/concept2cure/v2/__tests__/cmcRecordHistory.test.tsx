// @vitest-environment jsdom
/**
 * The change-history panel — what it says in each of the four states.
 *
 * This panel is read for one reason: to find out whether a regulated record
 * was changed, by whom, and what it said before. So the state it must never
 * render is "no changes" over a read that failed — an empty §11.10(e) trail and
 * a trail that could not be read are indistinguishable to a reader, and only
 * one of them is a claim this product is entitled to make.
 */
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { CMC_REGISTER_HISTORY_PATHS, keepsRegisterHistory } from '@shared/constants/cmc-register-history';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { RecordHistoryPanel } from '../surfaces/cmcRecordHistory';

const PATH = '/api/cmc/register-history/analytical-methods/109';

function body(json: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => json } as Response;
}
/** apiRequest THROWS for every non-OK status except 401 (client/src/lib/queryClient.ts). */
function thrown(status: number) {
  return Object.assign(new Error('Request failed'), { status });
}

const CREATE = {
  at: '2026-10-18T22:02:48.000Z', act: 'cmc.register.create', label: 'Recorded',
  actorId: 3, actor: 'JM Smith', actorRef: 'user:3', reason: null,
  changed: {}, changedFields: [], signatureRef: null, signatureMeaning: null, seq: 6539, sealed: true,
};
const EDIT = {
  at: '2026-10-18T22:04:10.000Z', act: 'cmc.register.update', label: 'Changed',
  actorId: 3, actor: 'JM Smith', actorRef: 'user:3', reason: null,
  changed: { title: { from: 'Probe assay', to: 'Probe assay (rev 2)' }, status: { from: 'development', to: 'validation' } },
  changedFields: ['title', 'status'], signatureRef: null, signatureMeaning: null, seq: 6540, sealed: true,
};

function show(answer: () => Response | Promise<Response> | never) {
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) => {
    if (url !== PATH) throw new Error(`unexpected call: ${url}`);
    return answer();
  });
  return render(
    <RecordHistoryPanel registerPath="analytical-methods" recordId={109} subject="Methods · 109" onClose={() => {}} />,
  );
}

afterEach(() => cleanup());

describe('the change history of one register record', () => {
  it('names each act, the person, and what each change moved', async () => {
    show(() => body({ success: true, data: { register: 'analytical_method', recordId: '109', entries: [CREATE, EDIT], note: null } }));
    await waitFor(() => expect(screen.getByText('Recorded')).toBeTruthy());
    expect(screen.getByText('Changed')).toBeTruthy();
    expect(screen.getAllByText('JM Smith').length).toBe(2);
    expect(screen.getAllByText('user:3').length).toBe(2);
    // The before-value is on screen, which is the whole point of the panel.
    expect(screen.getByTitle('Probe assay')).toBeTruthy();
    expect(screen.getByTitle('Probe assay (rev 2)')).toBeTruthy();
    expect(screen.getByText('title')).toBeTruthy();
    expect(screen.getByText('status')).toBeTruthy();
  });

  it('counts the acts rather than implying completeness', async () => {
    show(() => body({ success: true, data: { register: 'analytical_method', recordId: '109', entries: [CREATE, EDIT], note: null } }));
    await waitFor(() => expect(screen.getByText('2 chained act(s)')).toBeTruthy());
  });

  it('reports a failed read as a failure, never as a record with no changes', async () => {
    show(() => {
      throw thrown(500);
    });
    await waitFor(() => expect(screen.getByTestId('cmc-history-error')).toBeTruthy());
    expect(screen.queryByTestId('cmc-history-empty')).toBeNull();
    expect(screen.getByText(/could not be read/i)).toBeTruthy();
    expect(screen.getByText('not read')).toBeTruthy();
  });

  it('says the audit store was unreachable when the server fails closed', async () => {
    show(() => {
      throw thrown(503);
    });
    await waitFor(() => expect(screen.getByTestId('cmc-history-error')).toBeTruthy());
    expect(screen.getByText(/audit store could not be reached/i)).toBeTruthy();
  });

  it('reports a 200 of the wrong shape as a failure too', async () => {
    /* A shape mismatch flattened to zero rows reads as "nothing changed",
       which is the one thing this panel must not say when it does not know. */
    show(() => body({ success: true, data: { register: 'analytical_method', recordId: '109' } }));
    await waitFor(() => expect(screen.getByTestId('cmc-history-error')).toBeTruthy());
  });

  it('carries the server’s own note when nothing is recorded', async () => {
    const note = 'No chained act is recorded against this record. A record created before 2026-10-18 carries no operator.';
    show(() => body({ success: true, data: { register: 'analytical_method', recordId: '109', entries: [], note } }));
    await waitFor(() => expect(screen.getByTestId('cmc-history-empty')).toBeTruthy());
    expect(screen.getByText(note)).toBeTruthy();
  });

  it('marks a row with no chain position as unsealed instead of dropping it', async () => {
    show(() =>
      body({
        success: true,
        data: { register: 'analytical_method', recordId: '109', entries: [{ ...EDIT, sealed: false, seq: null }], note: null },
      }),
    );
    await waitFor(() => expect(screen.getByText('unsealed')).toBeTruthy());
  });

  it('says an act has no recorded actor rather than naming one', async () => {
    show(() =>
      body({
        success: true,
        data: {
          register: 'analytical_method', recordId: '109',
          entries: [{ ...EDIT, actor: null, actorId: null, actorRef: null }], note: null,
        },
      }),
    );
    await waitFor(() => expect(screen.getByText('not recorded')).toBeTruthy());
  });

  it('says when a record has more acts than one read returns', async () => {
    /* What a cap hides here is the record's beginning. A history quietly
       missing its create reads as a record that was never recorded. */
    show(() =>
      body({
        success: true,
        data: { register: 'analytical_method', recordId: '109', entries: [EDIT], earlierActsNotShown: true, note: null },
      }),
    );
    await waitFor(() => expect(screen.getByRole('status')).toBeTruthy());
    expect(screen.getByText(/earlier ones, which may include when it was first recorded, are not/i)).toBeTruthy();
  });

  it('claims no truncation when the read returned everything', async () => {
    show(() => body({ success: true, data: { register: 'analytical_method', recordId: '109', entries: [CREATE, EDIT], note: null } }));
    await waitFor(() => expect(screen.getByText('Recorded')).toBeTruthy());
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows a value cleared to nothing as a change, with both sides readable', async () => {
    show(() =>
      body({
        success: true,
        data: {
          register: 'analytical_method', recordId: '109',
          entries: [{ ...EDIT, changed: { purpose: { from: 'Assay', to: null } }, changedFields: ['purpose'] }],
          note: null,
        },
      }),
    );
    await waitFor(() => expect(screen.getByText('purpose')).toBeTruthy());
    expect(screen.getByTitle('Assay')).toBeTruthy();
    expect(screen.getByTitle('—')).toBeTruthy();
  });
});

describe('the History action reaches the registers the server serves', () => {
  /* The button is mounted from RegisterCard for exactly the paths on the
     shared list. A register rendered on the surface whose segment is not on
     that list records its edits and shows none of them; the other direction —
     a listed path the server does not describe — will not compile. */
  it('offers it for every register card whose register keeps a history', () => {
    /* Two surfaces render registers: the sixteen RegisterCards, and the
       stability register, which is hand-built in CmcModule.tsx and so needs
       its own action. The test reads both — on its first run it reported
       `stability-studies` as a register keeping a history that no surface
       offered a way to read, which was true. */
    const src =
      readFileSync(join(__dirname, '..', 'surfaces', 'cmcRegisters.tsx'), 'utf8') +
      readFileSync(join(__dirname, '..', 'surfaces', 'CmcModule.tsx'), 'utf8');
    /* Two forms are in use: `path="/api/cmc/x"` and
       `path={`/api/cmc/x${projectId ? …}`}` — nine of the sixteen cards carry
       their project filter in the path, so a regex that reads only the literal
       form sees seven registers and calls the other nine unreachable. */
    const rendered = [
      ...new Set([
        ...[...src.matchAll(/path=(?:"|\{`)\/api\/cmc\/([a-z-]+)/g)].map((m) => m[1]),
        ...[...src.matchAll(/registerPath="([a-z-]+)"/g)].map((m) => m[1]),
      ]),
    ];
    expect(rendered.length).toBeGreaterThan(0);
    /* Every rendered register that the shared list claims, and nothing on the
       list that no card renders — a path nobody can reach is a claim too. */
    const unreachable = CMC_REGISTER_HISTORY_PATHS.filter((p) => !rendered.includes(p));
    expect(unreachable, 'a register keeps a history that no surface offers a way to read').toEqual([]);
  });

  it('does not offer it for a register with no history', () => {
    expect(keepsRegisterHistory('specifications')).toBe(false);
    expect(keepsRegisterHistory('batch-records')).toBe(false);
  });
});
