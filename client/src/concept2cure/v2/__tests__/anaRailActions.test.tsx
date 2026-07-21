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
import { cleanup, render, screen } from '@testing-library/react';

// The rail's co-author context read — keep it offline/empty so the rail renders
// without a backend (the messages under test are passed as props).
vi.mock('../dataConnect', () => ({
  useLive: () => ({ data: null, sample: true, loading: false }),
  connected: () => false,
  SampleTag: ({ sample }: { sample: boolean }) => (
    <span data-testid="sample-tag">{sample ? 'Sample data' : 'Live'}</span>
  ),
}));

import { AnaRail, type AnaMessage } from '../Shell';

afterEach(() => cleanup());

const surface = { id: 'cmc', label: 'CMC' };

function renderRail(messages: AnaMessage[], onAct = vi.fn(), onSend = vi.fn()) {
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
    />,
  );
  return { onAct, onSend };
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
});
