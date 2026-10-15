// @vitest-environment jsdom
/**
 * Home's engine pill shows the engine the turn actually runs on.
 *
 * Home kept its pill in local state — `React.useState('standard')` — and never
 * sent it. Home's question is seeded into ConversationThread, which V2App mounts
 * on the SHELL chat, whose effort is `effortForMode(prefs.anaMode)`. So a person
 * who picked "Deep research" on Home was answered at whatever `prefs.anaMode`
 * said, under a pill claiming Deep research: a control that lied.
 *
 * The fix binds the pill to the preference the send already reads. These tests
 * pin the three halves of that: Home renders the mode it is given, Home reports
 * a choice to its host rather than keeping it, and V2App hands Home the same
 * `prefs.anaMode` pair it hands the conversation's composer. Without props (tests, other hosts)
 * Home still works on local state. The carriage block also pins the rest of
 * the path the pill's claim depends on: Home seeds `conversation-thread`, the
 * registry keeps that screen conversation-owning, and V2App mounts it on the
 * shell chat whose effort is the preference.
 *
 * Labels come from ANA_MODES, not string literals, so a copy change to a mode
 * cannot make these pass or fail by itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';

/* The render setup of homeNoFixtureProgram.test.tsx: Home mounts with these
   three seams stubbed and nothing else. */
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { firstName: 'Dana' } }),
}));
vi.mock('@/hooks/useGlobalRiCatalog', () => ({
  useGlobalRiCatalog: () => ({ catalog: null, loading: false, error: undefined }),
}));

import { Home } from '../surfaces/Surfaces';
import { ANA_MODES } from '../registryModel';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');

function modeOf(id: string) {
  const m = ANA_MODES.find((x) => x.id === id);
  if (!m) throw new Error(`ANA_MODES has no '${id}'`);
  return m;
}
const DEEP = modeOf('deep-research');
const QUICK = modeOf('quick-ask');
const FIRST = ANA_MODES[0];

const baseProps = () => ({ onNav: vi.fn(), onAsk: vi.fn(), segment: 'biotech' });

function pill(): HTMLButtonElement {
  const el = document.querySelector('.landing-engine');
  if (!el) throw new Error('engine pill not rendered');
  return el as HTMLButtonElement;
}

function openMenu(): HTMLElement {
  fireEvent.click(pill());
  const menu = document.querySelector('.landing-mode-menu');
  if (!menu) throw new Error('engine menu did not open');
  return menu as HTMLElement;
}

function menuItem(menu: HTMLElement, mode: { effortLabel: string }): HTMLButtonElement {
  // Each mode is a radio in the engine group (EngineChoices, ADR-0015 §9).
  const btn = within(menu)
    .getAllByRole('radio')
    .find((b) => b.querySelector('.lm-label')?.textContent === mode.effortLabel);
  if (!btn) throw new Error(`no menu item for ${mode.effortLabel}`);
  return btn as HTMLButtonElement;
}

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: [] }),
  } as Response);
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_CONVO?: unknown }).C2C_CONVO;
});

describe('Home — the engine pill is the engine the turn runs on', () => {
  it('shows the mode its host gives it, not a local default', () => {
    render(<Home {...baseProps()} mode={DEEP.id} setMode={vi.fn()} />);

    expect(pill().textContent).toContain(DEEP.label);
    expect(pill().textContent).toContain(DEEP.effortLabel);
    // The first mode is the old local default; it must not be what shows.
    expect(pill().textContent).not.toContain(FIRST.label);

    // The open menu marks the same mode as the current one.
    const menu = openMenu();
    expect(menuItem(menu, DEEP).getAttribute('data-on')).toBe('true');
    expect(menuItem(menu, FIRST).hasAttribute('data-on')).toBe(false);
  });

  it('reports a choice to its host instead of keeping it', () => {
    const setMode = vi.fn();
    render(<Home {...baseProps()} mode={DEEP.id} setMode={setMode} />);

    fireEvent.click(menuItem(openMenu(), QUICK));

    expect(setMode).toHaveBeenCalledTimes(1);
    expect(setMode).toHaveBeenCalledWith(QUICK.id);
    // Controlled: until the host changes `mode`, the pill still says what the
    // next turn will run on.
    expect(pill().textContent).toContain(DEEP.label);
  });

  it('follows the host when the host changes the mode', () => {
    function Host() {
      const [mode, setMode] = React.useState(DEEP.id);
      return <Home {...baseProps()} mode={mode} setMode={setMode} />;
    }
    render(<Host />);
    // Starts on the host's mode — local state switching on click would pass
    // the second half of this test on its own.
    expect(pill().textContent).toContain(DEEP.label);

    fireEvent.click(menuItem(openMenu(), QUICK));

    expect(pill().textContent).toContain(QUICK.label);
    expect(pill().textContent).not.toContain(DEEP.label);
  });

  it('without a host binding, still renders and switches on local state', () => {
    render(<Home {...baseProps()} />);

    expect(pill().textContent).toContain(FIRST.label);
    fireEvent.click(menuItem(openMenu(), QUICK));
    expect(pill().textContent).toContain(QUICK.label);
  });

  it('a mode with no setter is not a binding: the menu still works (review objection 17)', () => {
    // Half-bound, the pill read the host's mode and the menu wrote local state
    // nothing read, so a choice silently did nothing. The props are a pair in
    // the type; a host that passes one anyway gets the working local control.
    // @ts-expect-error — mode without setMode is not a valid binding
    render(<Home {...baseProps()} mode={DEEP.id} />);

    fireEvent.click(menuItem(openMenu(), QUICK));
    expect(pill().textContent).toContain(QUICK.label);
  });

  it('sends the question to the conversation screen, not through onAsk', () => {
    // The first link of the chain the carriage block below pins: Home's
    // question is seeded into `conversation-thread`, which V2App mounts on the
    // shell chat. `onAsk` is the work screens' ask path, not Home's.
    const props = baseProps();
    render(<Home {...props} mode={DEEP.id} setMode={vi.fn()} />);
    const input = document.querySelector('.landing-input') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'What does FDA need for a pre-IND meeting?' } });
    fireEvent.click(document.querySelector('.landing-send') as HTMLButtonElement);

    expect(props.onNav).toHaveBeenCalledWith('conversation-thread');
    expect(props.onAsk).not.toHaveBeenCalled();
    expect((window as unknown as { C2C_CONVO?: { id: string; seed: string } }).C2C_CONVO).toMatchObject({
      id: 'new',
      seed: 'What does FDA need for a pre-IND meeting?',
    });
  });
});

describe('V2App hands Home the preference the shell chat sends — carriage', () => {
  // A test that passes props in directly proves Home can be bound; only the
  // host proves it IS. The shell chat's effort is effortForMode(prefs.anaMode),
  // so this is the pair that makes the pill true. The match is LAZY and
  // bounded to the one JSX element, so it cannot borrow an identical pair from
  // another element further down the file. Proven by removing either prop: red.
  const v2app = fs.readFileSync(path.join(REPO_ROOT, 'client/src/concept2cure/v2/V2App.tsx'), 'utf8');
  const views = fs.readFileSync(path.join(REPO_ROOT, 'client/src/concept2cure/v2/surfaceViews.ts'), 'utf8');

  it('the shell chat, `anaChat`, sends effortForMode(prefs.anaMode)', () => {
    expect(v2app).toMatch(/const anaChat = useAnaChat\(\{[\s\S]{0,1500}?effortLevel:\s*effortForMode\(prefs\.anaMode\)/);
  });

  it('the conversation screen is mounted on that chat (review objection 4)', () => {
    // Without shellChat, ConversationThread sends on a private chat that
    // carries no effortLevel, and the server runs 'balanced' whatever the pill
    // says. The registry must keep the screen conversation-owning, and the
    // conversation-owning branch must hand it `anaChat`.
    expect(views).toMatch(/'conversation-thread':\s*\{\s*component:\s*ConversationThread,\s*ownsConversation:\s*true\s*\}/);
    const branch = v2app.match(/\}\s*else if \(view\?\.ownsConversation\)\s*\{[\s\S]{0,600}?<V\b[\s\S]{0,400}?\/>/);
    expect(branch, 'the ownsConversation branch was not found').not.toBeNull();
    expect(branch![0]).toMatch(/\bshellChat=\{anaChat\}/);
  });

  it('Home is rendered with mode={prefs.anaMode} and setMode writing anaMode', () => {
    // `[\s\S]` rather than `[^>]`: the setMode arrow carries a `>` of its own.
    const m = v2app.match(/<Home\b[\s\S]{0,400}?\/>/);
    expect(m, 'the Home render was not found').not.toBeNull();
    const el = m![0];
    expect(el).toMatch(/\bmode=\{prefs\.anaMode\}/);
    expect(el).toMatch(/\bsetMode=\{\s*\(?\s*(\w+)\s*\)?\s*=>\s*set\(\s*'anaMode',\s*\1\s*\)\s*\}/);
  });
});
