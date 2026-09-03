// @vitest-environment jsdom
/**
 * PublishingCenter — the vocabulary and spec panels say what they know.
 *
 * The v3.2.2 vocabulary panel skipped the loading / error / empty ladder: in
 * flight, failed, wrong shape and genuinely empty all rendered "Vocabulary
 * unavailable — sign in to your tenant", asserting a cause the read does not
 * know. And 'idle' (the pre-effect first frame) fell through to "No spec
 * versions" / "No codes" — an empty verdict before the read had started.
 * Revert-proven: both cases fail with the gating removed.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { PublishingCenter } from '../surfaces/PublishingCenter';

const props = () => ({ surface: { id: 'ectd-publishing', label: 'Publishing' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });
const text = () => document.body.textContent ?? '';

beforeEach(() => apiRequest.mockReset());
afterEach(() => cleanup());

describe('PublishingCenter — honest reads', () => {
  it('a failed vocabulary read is a failed read, not "sign in to browse"', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response);
    render(<PublishingCenter {...props()} />);
    await waitFor(() => expect(text()).toMatch(/Couldn’t load spec versions/));
    fireEvent.change(screen.getByDisplayValue(/eCTD v4\.0/), { target: { value: 'v3.2.2' } });
    await waitFor(() => expect(text()).toMatch(/Couldn’t load the v3\.2\.2 vocabulary/));
    expect(text()).not.toMatch(/Sign in to your tenant/);
    expect(text()).not.toMatch(/Vocabulary unavailable/);
  });

  it('the first frame and an in-flight read never render an empty verdict', async () => {
    // Every read answers, but only after a beat — long enough to assert the
    // in-flight frame, short enough that nothing dangles into teardown.
    apiRequest.mockImplementation(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve({ ok: false, status: 500, json: async () => ({}) } as Response), 150)),
    );
    render(<PublishingCenter {...props()} />);
    expect(text()).toMatch(/Loading spec versions/);
    expect(text()).not.toMatch(/No spec versions/);
    expect(text()).not.toMatch(/No codes/);
    await waitFor(() => expect(text()).toMatch(/Couldn’t load spec versions/));
  });

  it('says on screen that nothing here publishes or transmits', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    render(<PublishingCenter {...props()} />);
    expect(text()).toMatch(/Nothing here publishes, transmits, validates or freezes a sequence/);
    await waitFor(() => expect(text()).toMatch(/Couldn’t load spec versions/));
  });
});
