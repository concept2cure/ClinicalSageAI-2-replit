// @vitest-environment jsdom
/**
 * Slice 0 of the placement map (.design/client-journey/INFORMATION_ARCHITECTURE.md,
 * the `device-presub` row): the header's primary button says what it does.
 *
 * It read "New Q-Sub", which names a form. There is no form: the click sends
 * AnA a prompt, and AnA's `create_q_sub` is what records the Q-Sub (it runs in
 * production because `device-presub` is in the launch catalog). A Q-Sub AnA
 * records starts in Planning, so the request is to start one, not to file one
 * — "Filed" is a later stage on this screen's own strip (ESG transmit).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { PreSubManager } from '../PreSubManager';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true, status: 200, text: async () => '', json: async () => ({ data: { rows: [], count: 0 } }),
  })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('PreSubManager — the Q-Sub button says it asks AnA', () => {
  it('is labelled as a request to AnA, not as a form', async () => {
    render(<PreSubManager programId="p-1" onAskAna={() => {}} />);
    await waitFor(() => expect(screen.getByText('No Q-Subs yet')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^New Q-Sub$/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ask AnA to start a Q-Sub' })).toBeTruthy();
  });

  it('sends AnA a request to start a Q-Sub, not to file one', async () => {
    const onAskAna = vi.fn();
    render(<PreSubManager programId="p-1" onAskAna={onAskAna} />);
    await waitFor(() => expect(screen.getByText('No Q-Subs yet')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Ask AnA to start a Q-Sub' }));
    expect(onAskAna).toHaveBeenCalledTimes(1);
    const prompt = onAskAna.mock.calls[0][0] as string;
    expect(prompt).toMatch(/^Start a new Q-Submission/);
    expect(prompt).not.toMatch(/\bFile\b/);
  });

  /* The prompt asked AnA to "seed the question list". `create_q_sub` takes
     program_id, q_sub_type, title, fda_team, target_date and summary, nothing
     writes q_sub_questions, and the briefing section `write_q_sub_section`
     drafts is not read by this screen — so AnA would report questions the
     Questions tab then shows as 0/0. The request is what the tool records, for
     the project the host publishes to AnA as the one in context. */
  it('asks only for what create_q_sub records, for the project in context', async () => {
    const onAskAna = vi.fn();
    render(<PreSubManager programId="p-1" onAskAna={onAskAna} />);
    await waitFor(() => expect(screen.getByText('No Q-Subs yet')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Ask AnA to start a Q-Sub' }));
    const prompt = onAskAna.mock.calls[0][0] as string;
    expect(prompt).not.toMatch(/question/i);
    expect(prompt).not.toMatch(/\bseed\b/i);
    expect(prompt).toMatch(/for this project/);
    for (const field of [/\btype\b/, /\btitle\b/, /FDA team/, /target meeting date/, /\bsummary\b/]) {
      expect(prompt).toMatch(field);
    }
  });
});
