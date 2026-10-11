// @vitest-environment jsdom
/**
 * What the right rail's tests pinned, pinned on the conversation.
 *
 * The rail (Shell.tsx `AnaRail`) was unmounted in slice 9 of
 * docs/design/ONE_ANA_ONE_CANVAS.md and deleted in the change that added this
 * file. AnA is talked to in one place, the conversation
 * (surfaces/ConversationThread.tsx), on the shell's one chat. Every behaviour a
 * rail test covered either already had a conversation twin, moved here, or
 * existed only in the rail. The table of old case → new case is in
 * docs/evidence/D2-ONE-ANA/2026-10-08/ana-2a-rail-code-and-nav/README.md.
 *
 * Each case renders ConversationThread on a stub of the shell's chat, the way
 * V2App mounts it, with the real upload hook (useChatUpload) and only the
 * network stubbed.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import type { AnaChatMessage, UseAnaChatReturn } from '../../components/ana/useAnaChat';

vi.mock('../dataConnect', () => ({
  connected: () => false,
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));
vi.mock('../../../utils/authToken', () => ({
  getAuthHeaders: () => ({ Authorization: 'Bearer test' }),
}));
/* The conversation screen's private chat — never the one acted on here. */
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: [],
    isStreaming: false,
    isLoadingThread: false,
    threadId: null,
    runStatus: null,
    runHold: null,
    pendingSteers: [],
    pause: vi.fn(),
    resume: vi.fn(),
    interject: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    send: vi.fn(),
    loadThread: vi.fn(),
  }),
}));

import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';
import { WORK_DOCK_KEY } from '../workDock';

const PROPS: OwnedSurfaceViewProps = {
  surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
  segment: 'biotech',
  onNav: () => {},
};

function shellChat(over: Partial<UseAnaChatReturn> = {}): UseAnaChatReturn {
  return {
    messages: [],
    isStreaming: false,
    send: vi.fn(async () => undefined),
    stop: vi.fn(),
    runStatus: null,
    runHold: null,
    pause: vi.fn(async () => true),
    resume: vi.fn(async () => true),
    interject: vi.fn(async () => true),
    pendingSteers: [],
    reset: vi.fn(),
    loadThread: vi.fn(async () => undefined),
    threadId: 'thread-1',
    isLoadingThread: false,
    ...over,
  } as UseAnaChatReturn;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

async function mount(chat: UseAnaChatReturn, props: Partial<OwnedSurfaceViewProps> = {}) {
  const utils = render(<ConversationThread {...PROPS} {...props} shellChat={chat} />);
  await settle();
  return utils;
}

/** A settled answer turn carrying the given fields. */
const answer = (over: Partial<AnaChatMessage>): AnaChatMessage[] => [
  { id: 'u-1', role: 'user', text: 'Validate the draft' } as AnaChatMessage,
  { id: 'a-1', role: 'assistant', text: 'Done.', sentAt: 1_000, completedAt: 5_000, ...over } as AnaChatMessage,
];

const composer = () => screen.getByRole('textbox', { name: 'Reply to AnA' }) as HTMLTextAreaElement;

let fetchMock: ReturnType<typeof vi.fn>;
/** What /api/chat/upload answers; every other read is refused. */
let uploadReply: () => Promise<unknown>;
beforeEach(() => {
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  try { localStorage.removeItem(WORK_DOCK_KEY); } catch { /* jsdom */ }
  uploadReply = async () => ({ ok: false, status: 500, json: async () => ({}) });
  fetchMock = vi.fn(async (url: string) =>
    url === '/api/chat/upload' ? uploadReply() : { ok: false, status: 503, json: async () => ({}) },
  );
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

/* ── From anaRailHistory.test.tsx ───────────────────────────────────────── */
describe('a draft survives a history read, and is sent once the conversation is back', () => {
  it('typed while history loads, it is held, then sent after loading', async () => {
    (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'current' };
    const loading = shellChat({ isLoadingThread: true, threadId: null });
    const { rerender } = await mount(loading);
    fireEvent.change(composer(), { target: { value: 'Continue our discussion' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(loading.send).not.toHaveBeenCalled();
    expect(composer().value).toBe('Continue our discussion');
    const loaded = shellChat({ threadId: 'thread-1' });
    await act(async () => {
      rerender(<ConversationThread {...PROPS} shellChat={loaded} />);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message to AnA' }));
    expect(loaded.send).toHaveBeenCalledTimes(1);
    expect((loaded.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('Continue our discussion');
    expect(composer().value).toBe('');
  });

  it('typed while history failed, it is held through the retry and sent after recovery', async () => {
    (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'current' };
    const failed = shellChat({ threadId: null, threadLoadError: { threadId: 'thread-b', message: 'Could not load this conversation.' } });
    const { rerender } = await mount(failed);
    fireEvent.change(composer(), { target: { value: 'My question' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(failed.send).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain("Couldn't load this conversation");
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading conversation' }));
    expect(failed.loadThread).toHaveBeenCalledWith('thread-b');
    const recovered = shellChat({ threadId: 'thread-b' });
    await act(async () => {
      rerender(<ConversationThread {...PROPS} shellChat={recovered} />);
    });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(recovered.send).toHaveBeenCalledTimes(1);
    expect((recovered.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('My question');
  });
});

/* ── From anaRailActions.test.tsx ───────────────────────────────────────── */
describe("AnA's real actions, never a fabricated result card", () => {
  it('an executed action is shown as a record — not a button, not a sample', async () => {
    await mount(shellChat({
      messages: answer({ executedActions: [{ label: 'Validated the draft', actionType: 'run_validation', executed: true }] }),
    }));
    expect(screen.getByText('Validated the draft')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Validated the draft/ })).toBeNull();
    // The removed mock stamped fabricated "(sample)" audit ids / sha256 hashes.
    expect(document.body.textContent).not.toMatch(/\(sample\)/);
    expect(document.body.textContent).not.toMatch(/AUD-\d+/);
  });

  it('a non-signature governed command shows the reason-for-change sign-off', async () => {
    await mount(shellChat({
      messages: answer({ pendingSignoffs: [{ command: 'update_task', params: {}, signatureRequired: false, message: 'Reason needed.' }] }),
    }));
    expect(screen.getByText('Reason for change required')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\(sample\)/);
  });

  it('a navigation chip that cannot say where it goes is a record, not a control', async () => {
    const onNav = vi.fn();
    await mount(
      shellChat({ messages: answer({ executedActions: [{ label: 'Open something', actionType: 'navigate', executed: true }] }) }),
      { onNav },
    );
    expect(screen.getByText('Open something')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open something/ })).toBeNull();
    expect(onNav).not.toHaveBeenCalled();
  });

  it('a "Start demonstration" chip that cannot name its script is never a button', async () => {
    const onStartDemo = vi.fn();
    const liveDrive = { on: false, onDriveEvent: vi.fn(), setOn: vi.fn(), onStartDemo } as unknown as OwnedSurfaceViewProps['liveDrive'];
    await mount(
      shellChat({ messages: answer({ executedActions: [{ label: 'Start demonstration', actionType: 'start_demo', executed: true }] }) }),
      { liveDrive },
    );
    expect(screen.queryByRole('button', { name: /Start demonstration/ })).toBeNull();
    expect(onStartDemo).not.toHaveBeenCalled();
  });

  it('a "Start demonstration" chip is inert when the shell gives no demo starter', async () => {
    const liveDrive = { on: false, onDriveEvent: vi.fn(), setOn: vi.fn() } as unknown as OwnedSurfaceViewProps['liveDrive'];
    await mount(
      shellChat({ messages: answer({ executedActions: [{ label: 'Start demonstration: Sales demonstration', actionType: 'start_demo', demoId: 'sales-flagship', demoTitle: 'Sales demonstration', executed: true }] }) }),
      { liveDrive },
    );
    expect(screen.getByText('Start demonstration: Sales demonstration')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start demonstration/ })).toBeNull();
  });

  /* The shell giving no starter while Live Drive is locked for the workspace
     is pinned on the mounted shell: shellWiring.test.tsx, "the demo starter
     under a Live Drive lock". */

  it('never rewrites what the person typed, with Live Drive on', async () => {
    const chat = shellChat();
    const liveDrive = { on: true, onDriveEvent: vi.fn(), setOn: vi.fn() } as unknown as OwnedSurfaceViewProps['liveDrive'];
    await mount(chat, { liveDrive });
    fireEvent.change(composer(), { target: { value: '/power two-arm superiority' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(chat.send).toHaveBeenCalledTimes(1);
    expect((chat.send as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('/power two-arm superiority');
  });
});

/* ── From anaMessageCarriage.test.ts (the rail's adapter, adaptChatMessage) ──
   That file existed because every rail suite passed its props in directly, so
   none saw the adapter drop a field. The conversation has no such seam to
   skip: these cases hand ConversationThread the hook's own messages, so a
   field its mapping (toTurn) drops fails here. */
describe("the person's turn stays the person's", () => {
  it('a user turn is shown as typed and grows no work record', async () => {
    await mount(shellChat({ messages: [{ id: 'u-1', role: 'user', text: 'how many patients?' } as AnaChatMessage] }));
    const turn = document.querySelector('.ct-user-b') as HTMLElement;
    expect(turn.textContent).toBe('how many patients?');
    expect(turn.closest('.ct-turn')?.querySelector('.ana-activity')).toBeNull();
  });
});

describe('why a turn stopped reaches the conversation', () => {
  const ran = [{ name: 'compute_sample_size', label: 'Sample size', status: 'success' as const, round: 1 }];

  it('a turn the round limit cut short says so under it, with the rounds it ran', async () => {
    await mount(shellChat({ messages: answer({ toolCalls: ran, stoppedReason: 'max_rounds', rounds: 12 } as Partial<AnaChatMessage>) }));
    expect(document.body.textContent).toContain("AnA reached this turn's round limit (12 rounds) before she said she was done.");
  });

  it('a turn she ended herself claims no stop', async () => {
    await mount(shellChat({ messages: answer({ toolCalls: ran } as Partial<AnaChatMessage>) }));
    expect(document.body.textContent).not.toMatch(/round limit/);
  });
});

/* ── From anaRailAttach.test.tsx ────────────────────────────────────────── */
const pdf = (name = 'protocol.pdf') => new File([new Uint8Array([1, 2, 3])], name, { type: 'application/pdf' });
const uploadOk = (over: Record<string, unknown> = {}) => async () => ({
  ok: true,
  json: async () => ({ fileId: 'file_abc', extractionMethod: 'pdf-text', extractionWords: 1200, ...over }),
});
const uploadFails = async () => ({ ok: false, status: 422, json: async () => ({ error: 'unreadable' }) });
const uploads = () => fetchMock.mock.calls.filter(([url]) => url === '/api/chat/upload');
const chip = (name: string) =>
  Array.from(document.querySelectorAll('.ct-att-chip')).find((c) => c.textContent?.includes(name)) as HTMLElement | undefined;
function pick(file: File) {
  const input = screen.getByTestId('ct-attach-input') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}
const openProject = () => {
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: 42, title: 'BX-301', code: 'BX-301' };
};

describe('the composer uploads the file itself', () => {
  it.each([
    ['enrollment.csv', 'text/csv', 'utf8'],
    ['enrollment.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'],
    ['resource.json', 'application/json', 'utf8'],
    ['define.xml', 'application/xml', 'utf8'],
  ])('sends the actual %s bytes, scoped to the open project', async (name, type, method) => {
    openProject();
    uploadReply = uploadOk({ extractionMethod: method, extractionWords: 5 });
    await mount(shellChat());
    // The picker does not refuse the type. The rail's picker listed
    // CHAT_UPLOAD_ACCEPT; the conversation's lists nothing, so it offers every
    // file and refuses an unsupported one after the pick, before any upload
    // (below). README, Not done: give it the same accept list.
    const accept = (screen.getByTestId('ct-attach-input') as HTMLInputElement).accept;
    expect(accept === '' || accept.split(',').includes(name.slice(name.lastIndexOf('.')))).toBe(true);
    pick(new File(['source bytes'], name, { type }));
    await waitFor(() => expect(uploads()).toHaveLength(1));
    const body = uploads()[0][1].body as FormData;
    expect((body.get('file') as File).name).toBe(name);
    expect((body.get('file') as File).size).toBeGreaterThan(0);
    expect(body.get('projectId')).toBe('42');
    await waitFor(() => expect(chip(name)?.textContent).toMatch(/5 words/));
  });

  it('POSTs the real File to /api/chat/upload, not just its name', async () => {
    openProject();
    uploadReply = uploadOk();
    await mount(shellChat());
    pick(pdf());
    await waitFor(() => expect(uploads()).toHaveLength(1));
    const [url, init] = uploads()[0];
    expect(url).toBe('/api/chat/upload');
    expect(init.method).toBe('POST');
    const sent = (init.body as FormData).get('file') as File;
    expect(sent).toBeInstanceOf(File);
    expect(sent.name).toBe('protocol.pdf');
    expect(sent.size).toBeGreaterThan(0);
    expect((init.body as FormData).get('projectId')).toBe('42');
  });

});

describe('the composer never claims a file it did not send', () => {
  it('names the uploaded file in the turn once it is ready, and sends it by id', async () => {
    uploadReply = uploadOk();
    const chat = shellChat();
    await mount(chat);
    pick(pdf());
    await waitFor(() => expect(chip('protocol.pdf')?.getAttribute('data-status')).toBe('ready'));
    fireEvent.change(composer(), { target: { value: 'Summarise this' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    await waitFor(() => expect(chat.send).toHaveBeenCalled());
    const [text, files] = (chat.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(text).toContain('Summarise this');
    expect(text).toContain('protocol.pdf');
    expect(files).toEqual([expect.objectContaining({ name: 'protocol.pdf', fileId: 'file_abc' })]);
  });

  it('does NOT claim an attachment when the upload failed', async () => {
    uploadReply = uploadFails;
    const chat = shellChat();
    await mount(chat);
    pick(pdf('broken.pdf'));
    await waitFor(() => expect(chip('broken.pdf')?.getAttribute('data-status')).toBe('error'));
    fireEvent.change(composer(), { target: { value: 'Read this' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    await waitFor(() => expect(chat.send).toHaveBeenCalled());
    const [text, files] = (chat.send as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(text).toContain('Read this');
    expect(text).not.toContain('broken.pdf');
    expect(text).not.toMatch(/attached/i);
    expect(files ?? []).toEqual([]);
  });

  it('refuses to send at all when only a failed upload is present', async () => {
    uploadReply = uploadFails;
    const chat = shellChat();
    await mount(chat);
    pick(pdf('broken.pdf'));
    await waitFor(() => expect(chip('broken.pdf')?.getAttribute('data-status')).toBe('error'));
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(chat.send).not.toHaveBeenCalled();
  });

  it('does not send while an upload is still in flight', async () => {
    uploadReply = () => new Promise(() => {});
    const chat = shellChat();
    await mount(chat);
    pick(pdf());
    await waitFor(() => expect(chip('protocol.pdf')?.getAttribute('data-status')).toBe('uploading'));
    fireEvent.change(composer(), { target: { value: 'Go' } });
    fireEvent.keyDown(composer(), { key: 'Enter' });
    expect(chat.send).not.toHaveBeenCalled();
  });

  it('the chip says how the file was read once it was', async () => {
    uploadReply = uploadOk();
    await mount(shellChat());
    pick(pdf());
    // "read · 1,200 words" — evidence the server got the bytes, not just a name.
    await waitFor(() => expect(chip('protocol.pdf')?.textContent).toMatch(/1,200 words/));
  });

  it('the chip gives the failure reason rather than a bare filename', async () => {
    uploadReply = uploadFails;
    await mount(shellChat());
    pick(pdf('broken.pdf'));
    await waitFor(() => expect(chip('broken.pdf')?.textContent).toMatch(/unreadable|failed/i));
  });

  it('rejects an unsupported type without a network call', async () => {
    await mount(shellChat());
    pick(new File(['x'], 'subjects.xpt', { type: 'application/octet-stream' }));
    await waitFor(() => expect(chip('subjects.xpt')?.textContent).toMatch(/Unsupported file type/));
    expect(uploads()).toHaveLength(0);
  });
});

/* ── From anaRailWorkDock.test.tsx ──────────────────────────────────────── */
describe("AnA's progress beside the conversation", () => {
  const T0 = 1_700_000_000_000;
  const live: AnaChatMessage[] = [
    { id: 'u1', role: 'user', text: 'How many patients?', sentAt: T0 } as AnaChatMessage,
    {
      id: 'a1',
      role: 'assistant',
      text: '',
      streaming: true,
      sentAt: T0,
      progress: [{ phase: 'running_tools', label: 'Running 1 step…', status: 'active', startedAt: T0 }],
      toolCalls: [{ name: 'compute_sample_size', label: 'Sample size — biostatistics engine', status: 'running', round: 1 }],
    } as AnaChatMessage,
  ];
  const running = (messages = live) => shellChat({ messages, isStreaming: true, runStatus: 'running' });

  it('shows the panel with the live turn by default', async () => {
    await mount(running());
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Progress' }).textContent).toContain('Running 1 step…');
  });

  it('renders a turn as every host does: her work, then the answer', async () => {
    await mount(shellChat({
      messages: [
        { id: 'u1', role: 'user', text: 'Draft the synopsis' } as AnaChatMessage,
        {
          id: 'a1',
          role: 'assistant',
          text: 'The synopsis is drafted.',
          sentAt: T0,
          completedAt: T0 + 5_000,
          toolCalls: [{ name: 'search_literature', label: 'Searching the literature', status: 'success' }],
        } as AnaChatMessage,
      ],
    }));
    const record = document.querySelector('.ct-col .ana-activity') as Element;
    const text = screen.getByText('The synopsis is drafted.');
    expect(record).not.toBeNull();
    expect(record.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the header chip opens and closes the panel, names it, and remembers the choice', async () => {
    await mount(running());
    const chip = screen.getByRole('button', { name: /AnA's progress/ });
    // No plan declared: the chip counts nothing.
    expect(chip.textContent).toContain('Working');
    expect(chip.textContent).not.toMatch(/of \d/);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    const panelId = chip.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)?.querySelector('h2')?.textContent).toBe('Progress');
    chip.focus();
    fireEvent.click(chip);
    expect(screen.queryByRole('heading', { name: 'Progress' })).toBeNull();
    // The chip stays mounted, so focus never falls to <body>.
    expect(document.activeElement).toBe(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(chip.hasAttribute('aria-controls')).toBe(false);
    // Remembered under the shared key, so every host honours it.
    expect(localStorage.getItem(WORK_DOCK_KEY)).toBe('hidden');
    fireEvent.click(chip);
    expect(screen.getByRole('heading', { name: 'Progress' })).toBeTruthy();
    expect(localStorage.getItem(WORK_DOCK_KEY)).toBe('shown');
  });

  it('counts her declared plan on the chip, and only that', async () => {
    await mount(running([
      live[0],
      {
        ...live[1],
        plan: [
          { title: 'Read the protocol synopsis', status: 'completed' },
          { title: 'Run the sample-size engine', status: 'in_progress' },
          { title: 'Draft the justification', status: 'pending' },
        ],
      } as AnaChatMessage,
    ]));
    expect(screen.getByRole('button', { name: /AnA's progress/ }).textContent).toContain('Step 2 of 3');
    const items = screen.getByRole('list', { name: 'Plan' }).querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[1].getAttribute('aria-current')).toBe('step');
    expect(items[0].textContent).toContain('done');
    expect(items[2].textContent).toContain('not started');
  });

  it("styles the open chip by aria-expanded — the attribute the component sets — never aria-pressed", () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/app-v2.css'), 'utf8');
    expect(css).toMatch(/\.ana-step-chip\[aria-expanded="true"\]\{/);
    expect(css).not.toMatch(/\.ana-step-chip\[aria-pressed/);
  });
});

/* ── What only the rail drew: the accepted steers and the pre-mortem ───────
   Two things the rail rendered under an answer: the steers AnA accepted
   mid-run (from anaRunControl.test.tsx and anaMessageCarriage.test.ts) and
   the CRL/RTF pre-mortem panel (from anaPremortemMount.test.tsx). Neither has
   been on screen since slice 9 stopped mounting the rail (9ff77226c): the
   hook captures both (useAnaChat `interjections`, `crlPremortem`), and
   ConversationThread's turn mapping (toTurn) dropped them. Deleting the rail
   deletes the last code that drew them, so the conversation must draw them in
   the same change (CLAUDE.md, working agreement: a deleted capability names
   its reachable replacement). These cases fail until it does. */
const premortem = () => ({
  title: 'CRL/RTF pre-mortem — BX-204 NDA',
  status: 'estimated' as const,
  approvalProbability: {
    value: 0.62, class: 'moderate' as const, denominator: 34, approved: 21, denied: 13,
    unknown: 0, confidence: 'medium' as const,
    framing: 'An estimate grounded in 34 cited precedents, not a guarantee.',
  },
  topRisks: [{
    rank: 1, title: 'Single pivotal trial without confirmatory evidence',
    severity: 'critical' as const, category: 'Clinical',
    reviewerQuestion: 'Does one trial support substantial evidence of effectiveness?',
    regulatoryBasis: '21 CFR 314.126',
    grounding: { citationId: 'c-1', citationLabel: 'CRL 2019-0442', fromCorpus: true },
  }],
  fixList: [{ order: 1, priority: 'critical' as const, action: 'Add the confirmatory analysis', addressesRisk: 'Single pivotal trial', citationId: 'c-1' }],
  riskLevel: 'high' as const,
  honestyNote: 'Estimated from cited precedent.',
  exportable: true,
  sealable: false,
  sealStatus: 'unsealed' as const,
  generatedAt: '2026-08-21T00:00:00Z',
});

describe('the steers AnA accepted are under the answer they shaped', () => {
  it('shows each accepted steer as the person\u2019s, in order', async () => {
    await mount(shellChat({ messages: answer({ text: 'Under EU MDR, Article 61(5) permits it.', interjections: ['focus on EU MDR', 'cite the article'] }) }));
    const steers = document.querySelectorAll('.ana-steers .ana-steer');
    expect(Array.from(steers).map((el) => el.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'You steered AnA: focus on EU MDR',
      'You steered AnA: cite the article',
    ]);
  });

  it('adds no steer furniture to a turn that was never steered', async () => {
    const { container } = await mount(shellChat({ messages: answer({ text: 'A plain answer.' }) }));
    expect(container.querySelector('.ana-steers')).toBeNull();
    expect(screen.queryByText(/You steered AnA/)).toBeNull();
  });
});

describe('the CRL/RTF pre-mortem is on the conversation', () => {
  it('mounts the panel for a turn that produced one, each risk bound to its precedent', async () => {
    await mount(shellChat({ messages: answer({ text: 'Here is the pre-mortem.', crlPremortem: premortem() } as Partial<AnaChatMessage>) }));
    expect(screen.getByRole('region', { name: 'CRL/RTF pre-mortem decision artifact' })).toBeTruthy();
    expect(screen.getByText(/Single pivotal trial without confirmatory evidence/)).toBeTruthy();
    expect(screen.getByText(/CRL 2019-0442/)).toBeTruthy();
  });

  it('offers no export the conversation cannot perform', async () => {
    await mount(shellChat({ messages: answer({ text: 'x', crlPremortem: premortem() } as Partial<AnaChatMessage>) }));
    const btn = screen.getByText('Export as DOCX').closest('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Export is not available from here/)).toBeTruthy();
  });

  it('adds no pre-mortem furniture to a turn that produced none', async () => {
    const { container } = await mount(shellChat({ messages: answer({ text: 'A plain answer.' }) }));
    expect(container.querySelector('.ana-premortem')).toBeNull();
  });
});
