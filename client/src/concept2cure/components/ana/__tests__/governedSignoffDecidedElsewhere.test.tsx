// @vitest-environment jsdom
/**
 * An approval answered on another device (AnA detach DT2, §5.6, DT2 test 8).
 *
 * The person who asked may have the sign-off open on two devices. Once one of
 * them decides, the server answers the other with NO_PENDING_APPROVAL (404) or
 * STALE_APPROVAL (409). That refusal is "Already decided on another device."
 * only when the run confirms it — the approval is no longer pending — and the
 * dialog then gives way to that line. A refusal the run does not confirm keeps
 * today's error. The run is also read before the signing step.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import { SignoffList } from '../../../v2/SignoffList';
import type { PendingSignoff } from '../useGovernedAction';
import { ALREADY_DECIDED } from '../GovernedActionSignoff';

const LIVE: PendingSignoff = {
  command: 'save_document_to_vault',
  params: { title: 'Stability plan' },
  signatureRequired: false,
  tier: 'confirm',
  message: 'AnA proposed this action. Confirm to run it under your name.',
  runId: 'run_a',
  toolUseId: 'tu_1',
};

type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const json = (status: number, body: unknown): Res => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const pending = { status: 'awaiting_approval', approval: { runId: 'run_a', toolUseId: 'tu_1' } };
const decided = { status: 'running', approval: null };
const pollBody = (state: Record<string, unknown>) => ({
  runId: 'run_a', status: 'running', serverNow: new Date().toISOString(), events: [], controls: [], highWater: 0, controlScope: 'all', ...state,
});

function serve(polls: Array<Record<string, unknown>>, signoff: Res) {
  let i = 0;
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(String(url));
    if (String(url).includes('/runs/run_a/events')) return json(200, pollBody(polls[Math.min(i++, polls.length - 1)]));
    if (String(url).includes('/governed-action')) return signoff;
    return json(404, {});
  }));
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function confirm() {
  render(<SignoffList signoffs={[LIVE]} doneClassName="done" />);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and run' }));
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe('8. an approval already decided on another device', () => {
  it('NO_PENDING_APPROVAL, confirmed by the poll: the line, and the dialog closes', async () => {
    serve([pending, decided], json(404, { success: false, error: { code: 'NO_PENDING_APPROVAL', message: 'That run is not waiting on an approval' } }));
    await confirm();
    expect(screen.getByText(ALREADY_DECIDED, { exact: false })).toBeTruthy();
    expect(ALREADY_DECIDED).toBe('Already decided on another device.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('STALE_APPROVAL, confirmed by the poll (the run waits on another step): the same', async () => {
    serve([pending, { status: 'awaiting_approval', approval: { runId: 'run_a', toolUseId: 'tu_2' } }], json(409, { success: false, error: { code: 'STALE_APPROVAL', message: 'That approval is no longer the one in flight' } }));
    await confirm();
    expect(screen.getByText(ALREADY_DECIDED, { exact: false })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a refusal the poll does not confirm keeps today’s error, and the dialog', async () => {
    serve([pending, pending], json(404, { success: false, error: { code: 'NO_PENDING_APPROVAL', message: 'That run is not waiting on an approval' } }));
    await confirm();
    expect(screen.queryByText(ALREADY_DECIDED, { exact: false })).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('That run is not waiting on an approval');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('checked before the signing step: an approval already decided is never submitted', async () => {
    const calls = serve([decided], json(200, { data: { success: true, message: 'Saved.' } }));
    await confirm();
    expect(screen.getByText(ALREADY_DECIDED, { exact: false })).toBeTruthy();
    expect(calls.some((u) => u.includes('/governed-action'))).toBe(false);
  });
});
