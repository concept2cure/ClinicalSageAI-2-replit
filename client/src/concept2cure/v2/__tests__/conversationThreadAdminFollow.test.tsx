// @vitest-environment jsdom
/**
 * An organisation admin following a colleague's turn (AnA detach DT2, §4.2,
 * §5.1; DT2 test 9 and DT1's handover (c)).
 *
 * The admin may watch (D-1(b)) and, by design, Stop. Pause, resume, steer and
 * approvals are the asker's alone (§2.5). The server accepts an admin's cancel
 * since slice DT3 (run-control.ts applyControl, callerIsAdmin), so Stop is
 * offered and nothing else is. The composer says why it does not steer.
 *
 * DT3 review (DP-82 and the admin-cancel gap): the admin's Stop is not one
 * click. It opens the canonical reason-for-change dialog
 * (GovernedConfirmDialog), which names whose turn it is and what stopping it
 * does; the reason goes with the cancel, and a refusal (no reason, or the
 * audit row refused, so nothing changed) is said in the dialog.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { AnaChatMessage, UseAnaChatReturn } from '../../components/ana/useAnaChat';

vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
/* The thread's canvas document list reads the signed-in person (useAuth, since
   cc1607c3a); the sibling thread tests stand it in the same way. */
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return {
    ...actual,
    authService: {
      getUser: vi.fn().mockReturnValue({ id: 1, organizationId: 1 }),
      captureSessionReadGuard: actual.authService.captureSessionReadGuard.bind(actual.authService),
      on: actual.authService.on.bind(actual.authService),
    },
    useAuth: () => ({ user: { displayName: 'Test Admin', email: 'admin@test.co' } }),
  };
});
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: [], isStreaming: false, isLoadingThread: false, threadId: null, runStatus: null, pendingSteers: [],
    pause: vi.fn(), resume: vi.fn(), interject: vi.fn(), stop: vi.fn(), reset: vi.fn(), send: vi.fn(), loadThread: vi.fn(),
  }),
}));

/* useDocumentList reads the signed-in session (editor/CanvasDocumentList.tsx);
   with no AuthProvider mounted, the real useAuth throws before the thread
   renders. The thread is only reached signed in, so the mock is a signed-in
   user. The list it reads is this conversation's (the route names the thread);
   the user only scopes that read to the session. */
vi.mock('@/services/portal/authService', async original => ({
  ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: '1', organizationId: '1', displayName: 'Test Author', email: 'author@test.co' } }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

const followed = (scope: 'all' | 'cancel'): AnaChatMessage[] => [
  { id: 'm-501', serverId: 501, role: 'user', text: 'Find every stability report' } as AnaChatMessage,
  {
    id: 'f-run_live',
    role: 'assistant',
    text: '',
    streaming: true,
    follow: { runId: 'run_live', scope, status: 'running', startedAt: Date.now() - 60_000, skewMs: 0, lastBeatAt: Date.now(), highWater: 0 },
  } as AnaChatMessage,
];

function chat(scope: 'all' | 'cancel'): UseAnaChatReturn {
  return {
    messages: followed(scope),
    isStreaming: true,
    send: vi.fn(async () => undefined),
    stop: vi.fn(),
    adminStop: vi.fn(async () => ({ ok: true as const })),
    followAskerName: scope === 'cancel' ? 'Sam Rivera' : null,
    runStatus: 'running',
    pause: vi.fn(async () => true),
    resume: vi.fn(async () => true),
    interject: vi.fn(async () => true),
    pendingSteers: [],
    followScope: scope,
    reset: vi.fn(),
    loadThread: vi.fn(async () => undefined),
    threadId: 'th1',
    isLoadingThread: false,
  };
}

async function mount(c: UseAnaChatReturn) {
  (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'current', seed: null };
  render(<ConversationThread {...PROPS} shellChat={c} />);
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('9. an admin following a colleague’s turn', () => {
  it('has Stop (DT3 accepts an admin cancel), no Pause, and a composer that says only the asker can steer', async () => {
    const c = chat('cancel');
    await mount(c);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    const box = screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;
    expect(box.disabled).toBe(true);
    expect(box.placeholder).toBe('Only the person who asked can steer AnA.');
    expect(screen.getByRole('note').textContent).toBe('Only the person who asked can steer AnA.');
  });

  it("Stop asks why first, in a dialog that names the person and says what stopping does; the reason goes with the cancel", async () => {
    const c = chat('cancel');
    await mount(c);
    await act(async () => { screen.getByRole('button', { name: 'Stop' }).click(); });
    expect(c.stop).not.toHaveBeenCalled();
    expect(c.adminStop).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain("Stop Sam Rivera's turn");
    expect(dialog.textContent).toContain('cannot be continued');
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'The draft is going to the wrong agency.' } });
    fireEvent.change(dialog.querySelector('input')!, { target: { value: 'stop' } });
    await act(async () => { screen.getByRole('button', { name: /Confirm and log/ }).click(); });
    expect(c.adminStop).toHaveBeenCalledWith('The draft is going to the wrong agency.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a refused stop is said in the dialog, which stays open: nothing changed', async () => {
    const c = chat('cancel');
    const sentence = 'The turn was not stopped: the record of your stop could not be written. Nothing was changed. Try again.';
    c.adminStop = vi.fn(async () => ({ ok: false as const, message: sentence }));
    await mount(c);
    await act(async () => { screen.getByRole('button', { name: 'Stop' }).click(); });
    const dialog = screen.getByRole('dialog');
    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'The draft is going to the wrong agency.' } });
    fireEvent.change(dialog.querySelector('input')!, { target: { value: 'stop' } });
    await act(async () => { screen.getByRole('button', { name: /Confirm and log/ }).click(); });
    expect(screen.getByRole('alert').textContent).toBe(sentence);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('the asker following their own turn keeps every control, and the composer steers', async () => {
    await mount(chat('all'));
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    const box = screen.getByRole('textbox', { name: 'Steer this run' }) as HTMLTextAreaElement;
    expect(box.disabled).toBe(false);
  });

  it("the asker's Stop is their own: no dialog, straight to stop", async () => {
    const c = chat('all');
    await mount(c);
    await act(async () => { screen.getByRole('button', { name: 'Stop' }).click(); });
    expect(c.stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

/* DT3 review (2.8): a reloaded conversation whose runs could not be read says
   so on the thread, with a way to check again — never "nothing running". */
describe('a conversation whose live runs could not be read', () => {
  it('says so, and Check again reads them again', async () => {
    const c = { ...chat('all'), isStreaming: false, runStatus: null, liveRunsUnchecked: true, recheckLiveRuns: vi.fn() } as UseAnaChatReturn;
    await mount(c);
    const note = screen.getByTestId('ct-live-runs-unchecked');
    expect(note.textContent).toContain("Couldn't check whether AnA is still working here.");
    await act(async () => { screen.getByRole('button', { name: 'Check again' }).click(); });
    expect(c.recheckLiveRuns).toHaveBeenCalledTimes(1);
  });
});

/* DT3 review (2.4, 2.5), on screen: a followed turn that ended with something
   to say and no step rows — a hand-over whose answer could not be read, a poll
   answered 401 — said it only in the hook's state. The thread mounted the
   turn's record only for "reportable work", which counted none of the
   follower's lines, so the person saw an empty answer (and, at a hand-over, a
   recorded turn with nothing in it). */
describe('a followed turn that ended with something to say, and no step rows', () => {
  const settled = (follow: Record<string, unknown>, extra: Partial<AnaChatMessage> = {}): UseAnaChatReturn => ({
    ...chat('all'),
    isStreaming: false,
    runStatus: null,
    messages: [
      { id: 'm-501', serverId: 501, role: 'user', text: 'Find every stability report' } as AnaChatMessage,
      {
        id: 'f-run_live',
        role: 'assistant',
        text: '',
        streaming: false,
        follow: { runId: 'run_live', scope: 'all', status: 'running', startedAt: Date.now() - 60_000, skewMs: 0, lastBeatAt: Date.now(), highWater: 0, ...follow },
        ...extra,
      } as AnaChatMessage,
    ],
  });

  it('a hand-over whose answer could not be read says so, beside its record, never an empty answer', async () => {
    await mount(settled({ status: 'finished', answerUnreadable: true }, { turnRecord: { status: 'recorded', id: 'rec_d' } } as Partial<AnaChatMessage>));
    expect(screen.getByText("The answer couldn't be loaded. Reopen the conversation.")).toBeTruthy();
  });

  it('a poll answered 401 says the sign-in ended, in the server’s words', async () => {
    await mount(settled({ signedOut: 'Signed out after a period of inactivity. Sign in again.' }));
    expect(screen.getByText('Signed out after a period of inactivity. Sign in again.')).toBeTruthy();
    expect(screen.queryByText("Can't reach the server. Retrying.")).toBeNull();
  });
});
