// @vitest-environment jsdom
/**
 * The sign-off dialog shows what a governed draft states, checked against
 * this turn's sources, before a person approves it (GRD-2 / FIG-3, AnA
 * reasoning round 3, 2026-10-05).
 *
 * WHAT WENT WRONG
 * AnA's drafted document reached the approval dialog as "sections: 3 items":
 * the person approved a draft they could not see into, and nothing had
 * checked its figures. A figure she invented went into the record with a
 * person's approval on it.
 *
 * THE RULES THIS SUITE EXISTS FOR
 * - The server's check of the draft is read from the approval frame by the
 *   one reader the strip uses, and a malformed one is no check.
 * - The dialog shows that check with the strip's own rows: what was not found
 *   is quoted, nothing earns a check mark, a verdict is named.
 * - A list in the proposal is shown by its items' titles, not "N items".
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../useGovernedAction', async (importOriginal) => {
  const real = await importOriginal<typeof import('../useGovernedAction')>();
  return {
    ...real,
    useGovernedAction: () => ({ submit: vi.fn(), decline: vi.fn(), submitting: false, error: null }),
  };
});

import { GovernedActionSignoff } from '../GovernedActionSignoff';
import { extractPendingSignoffs, pendingSignoffFromApproval, type PendingSignoff } from '../useGovernedAction';

afterEach(cleanup);

const check = {
  engine: 'answer-check/2',
  basis: 'sources',
  claims: 3,
  checked: 3,
  found: 2,
  notFound: [{ kind: 'figure', text: '31%' }],
  unchecked: [],
  fromPerson: [],
  fromInput: [],
  sources: ['tool:search_literature'],
  unreadable: [],
  verdicts: [{ text: 'is ready to file', reason: 'States a readiness verdict.' }],
};

const frame = (over: Record<string, unknown> = {}) => ({
  type: 'approval_required',
  runId: 'run_1',
  toolUseId: 'tu_9',
  action: 'draft_authoring_document',
  message: 'This action changes the record. AnA is waiting on this before she goes on.',
  data: {
    tier: 'confirm',
    reasonRequired: false,
    signatureRequired: false,
    retry: {
      command: 'draft_authoring_document',
      params: {
        title: 'Clinical overview',
        sections: [
          { title: 'Efficacy', content: 'The ORR was 47% in 212 patients.' },
          { title: 'Safety', content: 'Grade 3 events occurred in 31% of patients.' },
        ],
      },
    },
  },
  check,
  ...over,
});

describe('the approval frame carries the server\'s check of the draft', () => {
  it('reads it with the strip\'s own reader', () => {
    const s = pendingSignoffFromApproval(frame());
    expect(s?.check?.notFound).toEqual([{ kind: 'figure', text: '31%' }]);
    expect(s?.check?.engine).toBe('answer-check/2');
  });

  it('a malformed check is no check, and the prompt still opens', () => {
    const s = pendingSignoffFromApproval(frame({ check: { engine: 'answer-check/2', notFound: 'many' } }));
    expect(s).not.toBeNull();
    expect(s?.check).toBeUndefined();
  });

  it('a frame with no check opens the prompt with none', () => {
    const { check: _omit, ...without } = frame();
    expect(pendingSignoffFromApproval(without)?.check).toBeUndefined();
  });
});

describe('an end-of-turn proposal carries the check too', () => {
  it('reads the check from a HUMAN_CONFIRMATION_REQUIRED envelope in post_done, and drops a malformed one', () => {
    const envelope = (c: unknown) => ({
      success: false,
      action: 'create_artifact',
      error: 'HUMAN_CONFIRMATION_REQUIRED',
      message: 'Confirm to continue.',
      data: { tier: 'confirm', retry: { command: 'create_artifact', params: { title: 'Clinical overview', content: '31%.' } } },
      check: c,
    });
    const [ok, bad] = extractPendingSignoffs([envelope(check), envelope({ engine: 'answer-check/2' })]);
    expect(ok.check?.notFound).toEqual([{ kind: 'figure', text: '31%' }]);
    expect(bad.check).toBeUndefined();
  });
});

describe('the dialog shows the check before the person approves', () => {
  const signoff = (): PendingSignoff => pendingSignoffFromApproval(frame())!;

  it('quotes what was not found in this turn\'s sources, and names the verdict', () => {
    const { container } = render(<GovernedActionSignoff signoff={signoff()} onResolved={() => {}} onCancel={() => {}} />);
    expect(screen.getByText(/What this draft states, checked against this turn's sources/)).toBeTruthy();
    expect(screen.getByText(/1 of 3 specific claims not found in this turn's sources/)).toBeTruthy();
    expect(screen.getByText(/“31%” — figure/)).toBeTruthy();
    expect(screen.getByText(/States a verdict, not checked/)).toBeTruthy();
    expect(container.querySelector('.ana-grounding-ic.is-ok')).toBeNull();
    // Inside the dialog, so it is read before the person confirms.
    expect(container.querySelector('[role="dialog"] .ana-grounding')).toBeTruthy();
  });

  it('shows no check when the proposal carried none', () => {
    const { check: _omit, ...without } = frame();
    render(<GovernedActionSignoff signoff={pendingSignoffFromApproval(without)!} onResolved={() => {}} onCancel={() => {}} />);
    expect(screen.queryByText(/checked against this turn's sources/)).toBeNull();
  });

  it('shows a list by its items\' titles, not as "N items"', () => {
    render(<GovernedActionSignoff signoff={signoff()} onResolved={() => {}} onCancel={() => {}} />);
    expect(screen.getByText('Efficacy · Safety')).toBeTruthy();
    expect(screen.queryByText(/2 items/)).toBeNull();
  });
});
