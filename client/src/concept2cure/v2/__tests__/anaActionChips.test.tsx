// @vitest-environment jsdom
/**
 * AnA's resolved actions are controls, in every chat that shows them.
 *
 * THE DEFECT: only the shell rail made AnA's action chips pressable. The
 * conversation thread — where the front door lands, and where most people
 * type — rendered every chip as a <span> with a check mark on it. "CMC /
 * Quality" or "Start demonstration" looked done, was never performed, and
 * could not be pressed. So a person who asked AnA to take them somewhere, with
 * Live Drive off, got a reply and a label, and nothing to click.
 *
 * AnaActionChips is now the ONE renderer for every chat. What is pinned:
 *   - each actionable kind renders a real <button> and does what it names —
 *     through the same registries and channels Live Drive uses, with the
 *     named program opened BEFORE the navigation (so "the vault for BX-301"
 *     lands on BX-301's vault, not an empty "open a program" state);
 *   - anything it cannot perform stays an inert record — no button role, no
 *     click target that does nothing;
 *   - the conversation thread actually renders chips through it (rendered,
 *     not just imported), and the other docks that run their own chat import
 *     it (a cheap guard against regressing to hand-rolled spans).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

import type { AnaChatAction, AnaChatMessage } from '../../components/ana/useAnaChat';

/* One ordered record of the side effects a chip causes, so "program opened
   BEFORE navigating" is asserted as an order, not as two separate calls. */
const calls = vi.hoisted(() => [] as string[]);

vi.mock('../shellProject', async (importOriginal) => {
  const real = await importOriginal<typeof import('../shellProject')>();
  return {
    ...real,
    publishShellProject: vi.fn((p: { id: string }) => {
      calls.push(`publish:${p.id}`);
    }),
  };
});
vi.mock('../navParams', async (importOriginal) => {
  const real = await importOriginal<typeof import('../navParams')>();
  return {
    ...real,
    stashNavParamsForTarget: vi.fn((t: string) => {
      calls.push(`stash:${t}`);
    }),
  };
});
vi.mock('../surfaceActions', async (importOriginal) => {
  const real = await importOriginal<typeof import('../surfaceActions')>();
  return {
    ...real,
    validateDriveAction: vi.fn(real.validateDriveAction),
    applySurfaceAction: vi.fn(() => {
      calls.push('apply');
      return { status: 'stashed' as const };
    }),
  };
});

/* ConversationThread's own backends — offline, the way its canvas suite runs it. */
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));
const chatMessages: { current: AnaChatMessage[] } = { current: [] };
vi.mock('../../components/ana/useAnaChat', () => ({
  useAnaChat: () => ({
    messages: chatMessages.current,
    isStreaming: false,
    isLoadingThread: false,
    loadThread: vi.fn().mockResolvedValue(undefined),
    send: vi.fn(),
    reset: vi.fn(),
    threadId: 'thread-1',
  }),
}));

import { AnaActionChip, AnaActionChips } from '../AnaActionChips';
import { publishShellProject } from '../shellProject';
import { stashNavParamsForTarget } from '../navParams';
import { applySurfaceAction, validateDriveAction } from '../surfaceActions';
import { ConversationThread } from '../surfaces/ConversationThread';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

beforeEach(() => {
  calls.length = 0;
  vi.mocked(publishShellProject).mockClear();
  vi.mocked(stashNavParamsForTarget).mockClear();
  vi.mocked(applySurfaceAction).mockClear();
  vi.mocked(validateDriveAction).mockClear();
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

const NAV: AnaChatAction = {
  label: 'Vault',
  actionType: 'navigate',
  targetId: 'vault',
  params: { tab: 'documents' },
  executed: true,
};

describe('AnaActionChip — navigate', () => {
  it('is a button that stashes the params and navigates to the target', () => {
    const onNav = vi.fn((id: string) => calls.push(`nav:${id}`));
    render(<AnaActionChip action={NAV} onNav={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: /Vault/ }));
    expect(stashNavParamsForTarget).toHaveBeenCalledWith('vault', { tab: 'documents' });
    expect(onNav).toHaveBeenCalledWith('vault');
    // No program on the chip — nothing is opened on its behalf.
    expect(publishShellProject).not.toHaveBeenCalled();
    expect(calls).toEqual(['stash:vault', 'nav:vault']);
  });

  it('opens the program the chip names BEFORE navigating to its screen', () => {
    const onNav = vi.fn((id: string) => calls.push(`nav:${id}`));
    render(
      <AnaActionChip
        action={{ ...NAV, program: { id: 'p-301', name: 'BX-301 Program', code: 'BX-301' } }}
        onNav={onNav}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Vault/ }));
    expect(publishShellProject).toHaveBeenCalledWith({ id: 'p-301', title: 'BX-301 Program', code: 'BX-301' });
    // Navigating first would mount the vault with no program open — the empty
    // state this was meant to end — and the publish would arrive too late.
    expect(calls).toEqual(['publish:p-301', 'stash:vault', 'nav:vault']);
  });

  it('without the shell navigation it is an inert record, not a dead button', () => {
    const { container } = render(<AnaActionChip action={NAV} />);
    expect(screen.queryByRole('button')).toBeNull();
    const chip = container.querySelector('span.ana-exec-chip');
    expect(chip).not.toBeNull();
    expect(chip!.className).toContain('is-done');
  });
});

describe('AnaActionChip — surface_action', () => {
  const ACT: AnaChatAction = {
    label: 'Search the vault',
    actionType: 'surface_action',
    actionId: 'vault.search',
    surfaceId: 'vault',
    params: { query: 'stability' },
  };

  it('is a button that re-validates against the registry, then hands the registry copy to the bus', () => {
    const onNav = vi.fn();
    render(<AnaActionChip action={ACT} onNav={onNav} />);
    fireEvent.click(screen.getByRole('button', { name: /Search the vault/ }));
    expect(validateDriveAction).toHaveBeenCalledWith({
      actionType: 'surface_action',
      actionId: 'vault.search',
      params: { query: 'stability' },
    });
    expect(applySurfaceAction).toHaveBeenCalledTimes(1);
    const [directive, nav] = vi.mocked(applySurfaceAction).mock.calls[0];
    expect(directive).toMatchObject({ actionId: 'vault.search', surfaceId: 'vault', params: { query: 'stability' } });
    // The bus navigates to the action's screen with the shell's own nav.
    expect(nav).toBe(onNav);
  });

  it('performs nothing when the registry refuses the payload (fail closed)', () => {
    render(
      <AnaActionChip action={{ ...ACT, actionId: 'vault.teleport' }} onNav={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Search the vault/ }));
    expect(validateDriveAction).toHaveBeenCalledTimes(1);
    expect(applySurfaceAction).not.toHaveBeenCalled();
  });
});

describe('AnaActionChip — start_demo', () => {
  const DEMO: AnaChatAction = {
    label: 'Start demonstration',
    actionType: 'start_demo',
    demoId: 'sales-flagship',
    demoTitle: 'Sales demonstration',
  };

  it('is a button only when a demo starter is provided, and starts that demo', () => {
    const onStartDemo = vi.fn();
    render(<AnaActionChip action={DEMO} onStartDemo={onStartDemo} />);
    fireEvent.click(screen.getByRole('button', { name: /Start demonstration/ }));
    expect(onStartDemo).toHaveBeenCalledWith('sales-flagship', 'Sales demonstration');
  });

  it('falls back to the chip label when the script title is absent', () => {
    const onStartDemo = vi.fn();
    render(<AnaActionChip action={{ ...DEMO, demoTitle: undefined }} onStartDemo={onStartDemo} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onStartDemo).toHaveBeenCalledWith('sales-flagship', 'Start demonstration');
  });

  it('without a demo starter it stays inert', () => {
    render(<AnaActionChip action={DEMO} onNav={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Start demonstration/)).toBeTruthy();
  });
});

describe('AnaActionChips — anything else is a record', () => {
  it('renders a governed/executed action as an inert span with its error state', () => {
    const { container } = render(
      <AnaActionChips
        onNav={vi.fn()}
        onStartDemo={vi.fn()}
        actions={[
          { label: 'Validated the draft', actionType: 'run_validation', executed: true },
          { label: 'Could not lock', actionType: 'lock_section', error: 'Section is signed.' },
        ]}
      />,
    );
    expect(screen.queryByRole('button')).toBeNull();
    const spans = container.querySelectorAll('span.ana-exec-chip');
    expect(spans).toHaveLength(2);
    expect(spans[0].className).toContain('is-done');
    expect(spans[1].className).toContain('is-err');
    expect(spans[1].getAttribute('title')).toBe('Section is signed.');
  });
});

describe('the conversation thread renders AnA’s actions as controls', () => {
  /* Rendered, not grepped: the thread is where the inert spans lived, and a
     test on the component alone could pass while the thread kept its own. */
  const PROPS: OwnedSurfaceViewProps = {
    surface: { id: 'conversation-thread', label: 'Conversation' } as OwnedSurfaceViewProps['surface'],
    segment: 'biotech',
    onNav: () => {},
  };

  it('a navigate chip in a thread turn is a button that navigates', () => {
    (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'thread-1' };
    chatMessages.current = [
      { id: 'u1', role: 'user', text: 'take me to CMC' } as AnaChatMessage,
      {
        id: 'a1',
        role: 'assistant',
        text: 'Here is the CMC screen.',
        executedActions: [{ label: 'CMC / Quality (Module 3)', actionType: 'navigate', targetId: 'cmc', executed: true }],
      } as AnaChatMessage,
    ];
    const onNav = vi.fn();
    const { container } = render(<ConversationThread {...PROPS} onNav={onNav} />);
    const executed = container.querySelector('.ana-msg-executed') as HTMLElement;
    expect(executed).not.toBeNull();
    fireEvent.click(within(executed).getByRole('button', { name: /CMC \/ Quality/ }));
    expect(onNav).toHaveBeenCalledWith('cmc');
  });

  /* A turn with no drafted document gets no `canvas`, and the thread read the
     demo starter from `canvas?.liveDrive` — so on an ordinary turn (which is
     what a "run the demo" answer is) the chip rendered inert. The starter has
     to reach every turn, not only the ones that drafted something. */
  it('a start_demo chip in an ordinary thread turn is a button that starts the demo', () => {
    (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO = { id: 'thread-1' };
    chatMessages.current = [
      { id: 'u1', role: 'user', text: 'give me the sales demo' } as AnaChatMessage,
      {
        id: 'a1',
        role: 'assistant',
        text: 'Ready when you are.',
        executedActions: [
          { label: 'Start demonstration', actionType: 'start_demo', demoId: 'sales-flagship', demoTitle: 'Sales demonstration' },
        ],
      } as AnaChatMessage,
    ];
    const onStartDemo = vi.fn();
    const liveDrive = {
      on: false,
      onDriveEvent: vi.fn(),
      onWorkSaved: vi.fn(),
      setOn: vi.fn(),
      onStartDemo,
      onStartTour: vi.fn(),
    } as unknown as OwnedSurfaceViewProps['liveDrive'];
    const { container } = render(<ConversationThread {...PROPS} liveDrive={liveDrive} />);
    const executed = container.querySelector('.ana-msg-executed') as HTMLElement;
    fireEvent.click(within(executed).getByRole('button', { name: /Start demonstration/ }));
    expect(onStartDemo).toHaveBeenCalledWith('sales-flagship', 'Sales demonstration');
  });
});

describe('every chat that shows AnA’s actions uses the one renderer', () => {
  /* Carriage guard. The docks that run their own conversation are heavy to
     mount; a hand-rolled chip map in any of them is how the thread went inert,
     so the cheap check is that each one imports the canonical renderer. */
  const FILES = [
    'client/src/concept2cure/v2/surfaces/ConversationThread.tsx',
    'client/src/concept2cure/v2/editor/DocumentWorkbench.tsx',
    'client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx',
    'client/src/concept2cure/v2/surfaces/RbmSurfaces.tsx',
  ];
  for (const rel of FILES) {
    it(`${path.basename(rel)} imports and renders AnaActionChips/AnaActionChip`, () => {
      const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
      expect(src).toMatch(/import\s*\{[^}]*\bAnaActionChips?\b[^}]*\}\s*from\s*'\.\.\/AnaActionChips'/);
      expect(src).toMatch(/<AnaActionChips?\b/);
    });
  }
});
