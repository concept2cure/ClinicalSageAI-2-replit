// @vitest-environment jsdom
/**
 * AnaRail governed-action rendering — the shell rail must surface ANA's REAL
 * work: the actions it actually executed, and, for a governed command, the REAL
 * Part 11 sign-off prompt (GovernedActionSignoff → /api/ana-ri/governed-action).
 * The fabricated action-result card + demonstration e-sign gate were removed;
 * this locks that no "(sample)" fake audit/hash is ever rendered again.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// The rail's co-author context read — keep it offline/empty so the rail renders
// without a backend (the messages under test are passed as props).
vi.mock('../dataConnect', () => ({
  connected: () => false,
}));

import { AnaRail, type AnaMessage } from '../Shell';

afterEach(() => cleanup());

const surface = { id: 'cmc', label: 'CMC' };

function renderRail(
  messages: AnaMessage[],
  onAct = vi.fn(),
  onSend = vi.fn(),
  onNav = vi.fn(),
) {
  render(
    <AnaRail
      open
      setOpen={() => {}}
      surface={surface}
      segment="biotech"
      mode="standard"
      setMode={() => {}}
      messages={messages}
      onSend={onSend}
      onAct={onAct}
      onNav={onNav}
    />,
  );
  return { onAct, onSend, onNav };
}

describe('AnaRail — real ANA action rendering', () => {
  it('renders the real executed actions ANA reports (not a fabricated result card)', () => {
    renderRail([
      {
        role: 'ana',
        body: 'I validated the current draft.',
        executedActions: [
          { label: 'Validated the draft', actionType: 'run_validation', executed: true },
        ],
      },
    ]);
    expect(screen.getByText('Validated the draft')).toBeTruthy();
    // The removed mock stamped fabricated "(sample)" audit ids / sha256 hashes.
    expect(document.body.textContent).not.toMatch(/\(sample\)/);
    expect(document.body.textContent).not.toMatch(/AUD-\d+/);
  });

  it('renders the REAL Part 11 sign-off prompt for a governed action ANA proposed', () => {
    renderRail([
      {
        role: 'ana',
        body: 'Promoting this artifact needs your sign-off.',
        pendingSignoffs: [
          {
            command: 'promote_artifact',
            params: { targetId: 'a-1' },
            signatureRequired: true,
            message: 'Promote artifact a-1 to approved.',
          },
        ],
      },
    ]);
    // GovernedActionSignoff renders its real §11 prompt + a reason-for-change field.
    expect(screen.getByText(/Electronic signature required|Reason for change required/)).toBeTruthy();
    expect(screen.getByText('Reason for change')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\(sample\)/);
  });

  it('a non-signature governed command shows the reason-for-change sign-off', () => {
    renderRail([
      {
        role: 'ana',
        body: 'Recorded.',
        pendingSignoffs: [
          { command: 'update_task', params: {}, signatureRequired: false, message: 'Reason needed.' },
        ],
      },
    ]);
    expect(screen.getByText('Reason for change required')).toBeTruthy();
  });

  /* The navigation loop: `shared/navigation` + `navigate_to` produced a
     validated directive for a long time, and nothing carried it to a control the
     user could press. These lock the closed half. */
  it('renders a navigation target AnA resolved as a button that navigates', () => {
    const { onNav, onAct } = renderRail([
      {
        role: 'ana',
        body: 'The CMC workspace is where that specification lives.',
        executedActions: [
          { label: 'Open CMC', actionType: 'navigate', targetId: 'cmc', path: '/cmc', executed: true },
        ],
      },
    ]);
    const chip = screen.getByRole('button', { name: /Open CMC/ });
    fireEvent.click(chip);
    expect(onNav).toHaveBeenCalledWith('cmc');
    // It navigates rather than handing the label back to AnA as a new question,
    // which is what every other chip does and would loop here.
    expect(onAct).not.toHaveBeenCalled();
  });

  it('does not offer a navigation chip that cannot say where it goes', () => {
    const { onNav } = renderRail([
      {
        role: 'ana',
        body: 'Somewhere.',
        executedActions: [{ label: 'Open something', actionType: 'navigate', executed: true }],
      },
    ]);
    // Still reported as an executed action, but inert: a control with no target
    // must not look like one with a target.
    expect(screen.getByText('Open something')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open something/ })).toBeNull();
    expect(onNav).not.toHaveBeenCalled();
  });

  it('leaves every non-navigation executed action inert', () => {
    const { onNav } = renderRail([
      {
        role: 'ana',
        body: 'Done.',
        executedActions: [
          { label: 'Validated the draft', actionType: 'run_validation', executed: true },
        ],
      },
    ]);
    expect(screen.queryByRole('button', { name: /Validated the draft/ })).toBeNull();
    expect(onNav).not.toHaveBeenCalled();
  });
});

/* "Show me the system" in chat, without Live Drive switched on. The server
   fetches the script with start_product_demo and, because the moves can only
   be offered, sends a `start_demo` chip. The chip must call the SAME startDemo
   the Control menu's Demonstrations list calls — never a second path. */
describe('AnaRail — the "Start demonstration" chip', () => {
  const demoChip = {
    label: 'Start demonstration: Sales demonstration',
    actionType: 'start_demo',
    demoId: 'sales-flagship',
    demoTitle: 'Sales demonstration',
    executed: true,
  };
  const message: AnaMessage = { role: 'ana', body: 'Here is the demonstration.', executedActions: [demoChip] };

  function renderWithDrive(locked: { reason: string; requiredTier?: string | null } | null) {
    const onStartDemo = vi.fn();
    const onNav = vi.fn();
    const onAct = vi.fn();
    render(
      <AnaRail
        open
        setOpen={() => {}}
        surface={surface}
        segment="biotech"
        mode="standard"
        setMode={() => {}}
        messages={[message]}
        onSend={vi.fn()}
        onAct={onAct}
        onNav={onNav}
        liveDrive={{ on: false, locked, setOn: () => {}, onStartDemo }}
      />,
    );
    return { onStartDemo, onNav, onAct };
  }

  it('invokes the rail\'s own startDemo with the script id and title', () => {
    const { onStartDemo, onNav, onAct } = renderWithDrive(null);
    fireEvent.click(screen.getByRole('button', { name: /Start demonstration: Sales demonstration/ }));
    expect(onStartDemo).toHaveBeenCalledWith('sales-flagship', 'Sales demonstration');
    expect(onNav).not.toHaveBeenCalled();
    expect(onAct).not.toHaveBeenCalled();
  });

  it('is inert when Live Drive is locked for the workspace — same rule as the Control menu', () => {
    const { onStartDemo } = renderWithDrive({ reason: 'not_entitled', requiredTier: 'professional' });
    expect(screen.getByText('Start demonstration: Sales demonstration')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start demonstration/ })).toBeNull();
    expect(onStartDemo).not.toHaveBeenCalled();
  });

  it('is inert when the rail has no demo starter at all', () => {
    renderRail([message]);
    expect(screen.getByText('Start demonstration: Sales demonstration')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start demonstration/ })).toBeNull();
  });

  it('a chip that cannot name its script is never a button', () => {
    const onStartDemo = vi.fn();
    render(
      <AnaRail
        open
        setOpen={() => {}}
        surface={surface}
        segment="biotech"
        mode="standard"
        setMode={() => {}}
        messages={[{ role: 'ana', body: 'x', executedActions: [{ label: 'Start demonstration', actionType: 'start_demo', executed: true }] }]}
        onSend={vi.fn()}
        onAct={vi.fn()}
        onNav={vi.fn()}
        liveDrive={{ on: false, locked: null, setOn: () => {}, onStartDemo }}
      />,
    );
    expect(screen.queryByRole('button', { name: /Start demonstration/ })).toBeNull();
    expect(onStartDemo).not.toHaveBeenCalled();
  });
});
