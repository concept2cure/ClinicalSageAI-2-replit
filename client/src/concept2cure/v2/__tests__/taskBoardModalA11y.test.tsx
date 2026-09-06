// @vitest-environment jsdom
/**
 * TaskBoard modals — a control a screen reader cannot name is a control the
 * user cannot fill in, and a modal with no keyboard exit is a trap.
 *
 * a11ySemantics.test.tsx audits every surface's DEFAULT render, so it never
 * sees these: the intake form only exists once a modal is open. The gap that
 * left behind was worst in the electronic-signature dialog, where "Meaning of
 * signature" and "Reason for sign-off" — the two fields that record what the
 * signer is attesting to under 21 CFR 11.50 — were `<label>`s sitting BESIDE
 * their control with no htmlFor, while the signing-PIN input next to them
 * carried a name. Same form, same block, one field named and two not.
 *
 * Revert-proven, both halves, against the specific regression each one guards:
 * removing one htmlFor/id pair fails the naming test, and removing the
 * useDialog call fails the Escape test. Note it is the CALL that matters, not
 * the ref — useDialog binds the key handler on `document`, and the ref only
 * carries focus into the panel — so dropping just the ref leaves Escape
 * working and this test green. Focus placement is not asserted here.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { id: 'u-1', name: 'Tester', email: 't@example.com' } }),
}));

import { TaskBoard } from '../surfaces/TaskBoard';

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () =>
    ({ ok: true, status: 200, json: async () => ({ data: [] }) }) as Response);
});
afterEach(() => cleanup());

const mount = () =>
  render(<TaskBoard {...({ onAsk: () => {} } as unknown as React.ComponentProps<typeof TaskBoard>)} />);

/** An accessible name from a real association, not from placeholder text. */
function namedControls(root: HTMLElement) {
  const out: { tag: string; named: boolean; label: string }[] = [];
  for (const el of Array.from(root.querySelectorAll('input, select, textarea'))) {
    const id = el.getAttribute('id');
    // CSS.escape is absent in this jsdom; match the attribute directly instead.
    const viaFor = id
      ? Array.from(root.querySelectorAll('label')).find((l) => l.getAttribute('for') === id)
      : null;
    const viaAria = el.getAttribute('aria-label');
    const viaWrap = el.closest('label');
    out.push({
      tag: el.tagName.toLowerCase(),
      named: Boolean(viaFor || viaAria || viaWrap),
      label: viaFor?.textContent?.trim() || viaAria || el.getAttribute('name') || id || el.tagName,
    });
  }
  return out;
}

describe('TaskBoard modals — named controls and a keyboard way out', () => {
  it('names every control in the new-task intake form', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /New task/i }));
    const dialog = await screen.findByRole('dialog', { name: /New task/i });

    const controls = namedControls(dialog as HTMLElement);
    expect(controls.length).toBeGreaterThan(5);
    expect(controls.filter((c) => !c.named)).toEqual([]);
  });

  it('announces the intake form as a dialog and closes it on Escape', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: /New task/i }));
    const dialog = await screen.findByRole('dialog', { name: /New task/i });
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /New task/i })).toBeNull());
  });
});
