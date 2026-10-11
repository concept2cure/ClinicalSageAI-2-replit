// @vitest-environment jsdom
/**
 * Manual / Auto is a real control, separate from Ask / Agent (row 74, S4).
 *
 * Ask / Agent is the Live Drive preference (a75e38452: who operates the
 * screens) and stays exactly that — the composer's "AnA drives" switch
 * (LiveDriveSwitch, liveDriveDefaults.test.tsx). "Between steps" is the second,
 * separate question: does AnA stop and wait for the person before each further
 * step (Manual), or keep going until she judges the task done, within Auto's
 * ceilings (Auto)?
 *
 * Pinned:
 *   - the conversation's composer foot has a "Between steps" radiogroup that
 *     sets the preference, with arrow keys, and says a change applies to the
 *     NEXT message while one is running (it was pinned on the right rail's
 *     menu; the rail is gone, ONE_ANA_ONE_CANVAS.md slice 9);
 *   - "AnA drives" switches Live Drive and nothing else;
 *   - the words are the product's (ANA_RUN_POLICY_COPY), with the numbers
 *     from the shared ceilings;
 *   - Home and the conversation screen offer the same switch; nothing renders
 *     outside the shell's provider;
 *   - V2App sends the preference as the shell chat's run policy.
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

vi.mock('../dataConnect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dataConnect')>()),
  connected: () => false,
}));
vi.mock('../../../utils/authToken', () => ({ getAuthHeaders: () => ({ Authorization: 'Bearer t' }) }));
/* Home's render seams (homeEngine.test.tsx's setup). */
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: vi.fn(),
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { firstName: 'Dana' } }) }));
vi.mock('@/hooks/useGlobalRiCatalog', () => ({
  useGlobalRiCatalog: () => ({ catalog: null, loading: false, error: undefined }),
}));
/* The conversation screen's private chat — idle; the switch is what is read. */
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
import { LiveDriveControlsContext } from '../LiveDriveSwitch';
import { RunPolicyContext, RunPolicySwitch, type RunPolicyValue } from '../RunPolicySwitch';
import { ANA_MODES, ANA_RUN_POLICY_COPY } from '../registryModel';
import { AUTO_ACTIVE_MS, AUTO_MAX_ROUNDS, AUTO_WALL_MS, MAX_PAUSE_MS } from '@shared/ana/run-control-limits';
import type { AnaRunPolicy } from '@shared/ana/run-control-limits';

afterEach(cleanup);

function provider(runPolicy: AnaRunPolicy = 'auto', over: Partial<RunPolicyValue> = {}) {
  const setRunPolicy = vi.fn();
  const value: RunPolicyValue = { runPolicy, setRunPolicy, ...over };
  const wrap = (node: React.ReactNode) => <RunPolicyContext.Provider value={value}>{node}</RunPolicyContext.Provider>;
  return { setRunPolicy, wrap };
}

/** The conversation screen, idle, inside the shell's run-policy (and,
 *  optionally, Live Drive) providers — the way V2App mounts it. */
async function renderConversation(runPolicy: AnaRunPolicy = 'auto', drive = { on: true, locked: null }) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  const { setRunPolicy, wrap } = provider(runPolicy);
  const setOn = vi.fn();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
  const utils = render(
    wrap(
      <LiveDriveControlsContext.Provider
        value={{ ...drive, setOn, onStartDemo: vi.fn(), onStartTour: vi.fn() }}
      >
        <ConversationThread surface={{ id: 'conversation-thread', label: 'Conversation' } as never} segment="biotech" onNav={vi.fn()} />
      </LiveDriveControlsContext.Provider>,
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  vi.unstubAllGlobals();
  const foot = utils.container.querySelector('.ct-comp-foot [role="radiogroup"]') as HTMLElement;
  return { setRunPolicy, setOn, foot };
}

describe("the conversation's composer foot: a separate 'Between steps' switch", () => {
  it('is a named radiogroup with Manual and Auto, the current one checked', async () => {
    const { foot } = await renderConversation('auto');
    expect(foot.getAttribute('aria-label')).toBe('Between steps');
    const manual = within(foot).getByRole('radio', { name: /^Manual/ });
    const auto = within(foot).getByRole('radio', { name: /^Auto/ });
    expect(auto.getAttribute('aria-checked')).toBe('true');
    expect(manual.getAttribute('aria-checked')).toBe('false');
  });

  it('choosing Manual sets the preference', async () => {
    const { setRunPolicy, setOn, foot } = await renderConversation('auto');
    fireEvent.click(within(foot).getByRole('radio', { name: /^Manual/ }));
    expect(setRunPolicy).toHaveBeenCalledWith('manual');
    expect(setOn).not.toHaveBeenCalled();
  });

  it('arrow keys move the choice, as a radiogroup does', async () => {
    const { setRunPolicy, foot } = await renderConversation('auto');
    fireEvent.keyDown(within(foot).getByRole('radio', { name: /^Auto/ }), { key: 'ArrowLeft' });
    expect(setRunPolicy).toHaveBeenLastCalledWith('manual');
    fireEvent.keyDown(within(foot).getByRole('radio', { name: /^Auto/ }), { key: 'ArrowDown' });
    expect(setRunPolicy).toHaveBeenLastCalledWith('manual');
  });

  it('"AnA drives" still switches Live Drive, and does not touch the policy', async () => {
    const { setRunPolicy, setOn } = await renderConversation('auto');
    fireEvent.click(screen.getByRole('switch', { name: /AnA drives/ }));
    expect(setOn).toHaveBeenCalledWith(false);
    expect(setRunPolicy).not.toHaveBeenCalled();
  });
});

describe('the words', () => {
  const min = (ms: number) => `${ms / 60_000} minutes`;

  it('Auto is the product copy, with every ceiling from the shared constants — rounds whichever engine, and the wall clock', () => {
    // Review follow-through (objections 4, 13): Auto lifts Quick ask to the
    // same 20 rounds, and ends at 40 minutes in all; both are said here.
    expect(ANA_RUN_POLICY_COPY.auto.desc).toBe(
      `AnA keeps going, step after step, until she judges the task done — for up to ${AUTO_MAX_ROUNDS} rounds whichever ` +
        `engine you chose, ${min(AUTO_ACTIVE_MS)} of work or ${min(AUTO_WALL_MS)} in all. Anything that changes a record ` +
        `waits for you; if nobody answers within ${min(MAX_PAUSE_MS)}, it does not happen and she stops.`,
    );
  });

  it('Manual says what she does, and the three ways a hold ends without the person', () => {
    expect(ANA_RUN_POLICY_COPY.manual.desc).toBe(
      'AnA takes one step, then waits for you to run the next, change it or stop. ' +
        `If nobody answers within ${min(MAX_PAUSE_MS)}, or the page is closed, she stops there. ` +
        'A demonstration you start runs through without stopping.',
    );
  });

  it('Quick ask says what Auto does to it, where the engine is chosen', () => {
    const quick = ANA_MODES.find((m) => m.id === 'quick-ask')!;
    expect(quick.desc).toContain(`with Auto, up to ${AUTO_MAX_ROUNDS} rounds`);
  });

  it.each(['menu', 'foot'] as const)('%s: each radio is named by its label and described by its description', (variant) => {
    const { wrap } = provider('auto');
    render(wrap(<RunPolicySwitch variant={variant} />));
    for (const policy of ['manual', 'auto'] as const) {
      const radio = screen.getByRole('radio', { name: ANA_RUN_POLICY_COPY[policy].label });
      const described = (radio.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent);
      expect(described).toContain(ANA_RUN_POLICY_COPY[policy].desc);
    }
  });

  it('the foot shows, in words on screen, what the chosen policy does', () => {
    const { wrap } = provider('auto');
    const { container } = render(wrap(<RunPolicySwitch variant="foot" />));
    const short = container.querySelector('.ana-policy-short');
    expect(short?.textContent).toBe(ANA_RUN_POLICY_COPY.auto.short);
    expect(ANA_RUN_POLICY_COPY.auto.short).toMatch(new RegExp(`${AUTO_MAX_ROUNDS} rounds`));
  });

  it('the checked option is marked by more than colour: a check mark', () => {
    const { wrap } = provider('auto');
    render(wrap(<RunPolicySwitch variant="foot" />));
    expect(screen.getByRole('radio', { name: 'Auto' }).querySelector('.ana-policy-check[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('radio', { name: 'Manual' }).querySelector('.ana-policy-check')).toBeNull();
  });

  it('the switch does not animate under reduced motion', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../styles/app-v2.css'), 'utf8');
    const blocks = css.split(/@media \(prefers-reduced-motion: ?reduce\)/).slice(1).join('');
    expect(blocks).toMatch(/\.c2c-v2 \.ana-policy-opt\{transition:none;?\}/);
  });

  it('says a change applies to the next message while one is running', () => {
    const { wrap } = provider('manual', { streaming: true });
    render(wrap(<RunPolicySwitch variant="foot" />));
    expect(screen.getByText('Applies to your next message')).toBeTruthy();
    cleanup();
    const idle = provider('manual');
    render(idle.wrap(<RunPolicySwitch variant="foot" />));
    expect(screen.queryByText('Applies to your next message')).toBeNull();
  });

  it('renders nothing outside the shell', () => {
    const { container } = render(<RunPolicySwitch variant="foot" />);
    expect(container.innerHTML).toBe('');
  });
});

describe('the same switch where people type', () => {
  it('Home, beside AnA drives', async () => {
    const { Home } = await import('../surfaces/Surfaces');
    const { wrap, setRunPolicy } = provider('auto');
    render(wrap(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biotech" mode="standard" setMode={vi.fn()} />));
    fireEvent.click(screen.getByRole('radio', { name: /^Manual/ }));
    expect(setRunPolicy).toHaveBeenCalledWith('manual');
  });

  it('the conversation screen, in its composer foot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const { ConversationThread } = await import('../surfaces/ConversationThread');
    const { wrap } = provider('manual');
    delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
    const { container } = render(
      wrap(<ConversationThread surface={{ id: 'conversation-thread', label: 'Conversation' } as never} segment="biotech" onNav={vi.fn()} />),
    );
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    const foot = container.querySelector('.ct-comp-foot [role="radiogroup"]');
    expect(foot?.getAttribute('aria-label')).toBe('Between steps');
    expect(within(foot as HTMLElement).getByRole('radio', { name: /^Manual/ }).getAttribute('aria-checked')).toBe('true');
    vi.unstubAllGlobals();
  });
});

describe('V2App sends the preference as the shell chat’s run policy', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../V2App.tsx'), 'utf8');

  it('passes runPolicy: prefs.anaRunPolicy into the shell useAnaChat', () => {
    const call = src.slice(src.indexOf('const anaChat = useAnaChat({'));
    expect(call.slice(0, call.indexOf('});'))).toMatch(/runPolicy: prefs\.anaRunPolicy,/);
  });

  it('defaults the preference to Auto and provides the switch its context', () => {
    expect(src).toMatch(/anaRunPolicy: 'auto',/);
    expect(src).toMatch(/<RunPolicyContext\.Provider value=\{runPolicyControls\}>/);
  });
});
