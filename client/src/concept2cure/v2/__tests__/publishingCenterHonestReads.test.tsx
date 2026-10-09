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

  it('an empty answer says it is what the service returned, not a failed read', async () => {
    // A-0928-2: both bare empty states read the same as a failure that lost its
    // copy. The spec register answers v4.0 as null ("nothing qualified yet") and
    // the vocabulary listing answers with no v3.2.2 lists.
    apiRequest.mockImplementation(async (_m: string, url: string) => {
      if (url === '/api/ectd/qualification/spec-versions') {
        return { ok: true, status: 200, json: async () => ({ 'v3.2.2': null, 'v4.0': null }) } as Response;
      }
      if (url === '/api/ectd/controlled-vocab') {
        return { ok: true, status: 200, json: async () => ({ regionalIgOid: '', v4: [], v3: [] }) } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });
    render(<PublishingCenter {...props()} />);
    await waitFor(() => expect(text()).toMatch(/No spec versions/));
    expect(text()).toMatch(/specification-version register answered and lists no versions qualified for v4\.0.*not a failed read/);
    fireEvent.change(screen.getByDisplayValue(/eCTD v4\.0/), { target: { value: 'v3.2.2' } });
    await waitFor(() => expect(text()).toMatch(/No v3\.2\.2 coded-attribute lists were returned/));
    expect(text()).toMatch(/controlled-vocabulary service answered with no v3\.2\.2 lists.*not a failed read/);
    expect(text()).not.toMatch(/!/);
  });

  it('says on screen that nothing here publishes or transmits', async () => {
    apiRequest.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) } as Response);
    render(<PublishingCenter {...props()} />);
    expect(text()).toMatch(/Nothing here publishes, transmits, validates or freezes a sequence/);
    await waitFor(() => expect(text()).toMatch(/Couldn’t load spec versions/));
  });
});
