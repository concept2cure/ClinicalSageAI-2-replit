// @vitest-environment jsdom
/**
 * The engine choice is announced, not only drawn (row 74, ADR-0015 §9; WCAG
 * 2.2 AA 4.1.2 Name, Role, Value).
 *
 * Both pickers marked the current engine only with `data-on`, which no
 * assistive technology reads; the Home trigger said `aria-haspopup="true"` (a
 * menu) for a popup that was not one, and a choice left focus on a button that
 * had just been removed. Pinned on Home's pill (the rail renders the same
 * EngineChoices, pinned by its own case):
 *   - the trigger names the popup it opens (dialog) and points at it;
 *   - the popup is a named dialog holding a radio group of the modes, the
 *     current one checked;
 *   - choosing sends focus back to the trigger.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({ useAuth: () => ({ user: { firstName: 'Dana' } }) }));
vi.mock('@/hooks/useGlobalRiCatalog', () => ({
  useGlobalRiCatalog: () => ({ catalog: null, loading: false, error: undefined }),
}));

import { Home } from '../surfaces/Surfaces';
import { AnaRail } from '../Shell';
import { EngineChoices } from '../EngineChoices';
import { ANA_MODES } from '../registryModel';

const DEEP = ANA_MODES.find((m) => m.id === 'deep-research')!;
const QUICK = ANA_MODES.find((m) => m.id === 'quick-ask')!;

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [] }) } as Response);
});
afterEach(cleanup);

const trigger = () => document.querySelector('.landing-engine') as HTMLButtonElement;

describe("Home's engine pill", () => {
  it('names the popup it opens and points at it', () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biotech" mode={DEEP.id} setMode={vi.fn()} />);
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const dialog = screen.getByRole('dialog', { name: /engine/i });
    expect(trigger().getAttribute('aria-controls')).toBe(dialog.id);
  });

  it('holds a radio group of the modes, the current one checked', () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biotech" mode={DEEP.id} setMode={vi.fn()} />);
    fireEvent.click(trigger());
    const group = screen.getByRole('radiogroup', { name: /engine/i });
    const radios = Array.from(group.querySelectorAll('[role="radio"]'));
    expect(radios).toHaveLength(ANA_MODES.length);
    const checked = radios.filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain(DEEP.effortLabel);
  });

  it('a choice goes to the host and focus returns to the trigger', () => {
    const setMode = vi.fn();
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biotech" mode={DEEP.id} setMode={setMode} />);
    fireEvent.click(trigger());
    const quick = screen.getAllByRole('radio').find((r) => r.textContent?.includes(QUICK.effortLabel))!;
    fireEvent.click(quick);
    expect(setMode).toHaveBeenCalledWith(QUICK.id);
    expect(document.activeElement).toBe(trigger());
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('EngineChoices (the one implementation both pickers render)', () => {
  it('is a named radio group, the current mode checked, and reports a choice', () => {
    const onChoose = vi.fn();
    render(<EngineChoices mode={QUICK.id} onChoose={onChoose} />);
    const group = screen.getByRole('radiogroup', { name: /engine/i });
    const checked = Array.from(group.querySelectorAll('[aria-checked="true"]'));
    expect(checked.map((c) => c.textContent)).toEqual([expect.stringContaining(QUICK.effortLabel)]);
    fireEvent.click(screen.getAllByRole('radio').find((r) => r.textContent?.includes(DEEP.effortLabel))!);
    expect(onChoose).toHaveBeenCalledWith(DEEP.id);
  });
});

describe("the rail's Control & engine popup", () => {
  it('names the popup it opens, and holds the same engine radio group', () => {
    render(
      <AnaRail open setOpen={() => {}} surface={{ id: 'cmc', label: 'CMC' }} segment="biotech" mode={QUICK.id} setMode={() => {}} messages={[]} onSend={() => {}} onAct={() => {}} />,
    );
    const pull = document.querySelector('.ana-modepull') as HTMLButtonElement;
    expect(pull.getAttribute('aria-haspopup')).toBe('dialog');
    fireEvent.click(pull);
    const dialog = screen.getByRole('dialog', { name: /control & engine/i });
    expect(pull.getAttribute('aria-controls')).toBe(dialog.id);
    const checked = Array.from(screen.getByRole('radiogroup', { name: /engine/i }).querySelectorAll('[aria-checked="true"]'));
    expect(checked.map((c) => c.textContent)).toEqual([expect.stringContaining(QUICK.effortLabel)]);
  });
});
