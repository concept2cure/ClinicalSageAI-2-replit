// @vitest-environment jsdom
/**
 * EctdCompile's package download sends the review the export gate requires,
 * from the signed-in user's own confirmation.
 *
 * Until 2026-10-15 the download posted { sequenceNumber, rehearsal } and no
 * `governance` block. The export review gate (exportReviewGate.ts) refuses
 * that in production with 403 HUMAN_REVIEW_REQUIRED, so the button could
 * never deliver a package there. It now carries `governance`: not reviewed
 * until the person ticks the confirmation, then their session name and role
 * and the moment they ticked it — not the moment they pressed download.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
const session = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => session.user,
}));
const downloadBlob = vi.hoisted(() => vi.fn(() => true));
vi.mock('../download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../download')>()),
  downloadBlob,
}));

import { EctdCompile } from '../surfaces/EctdCompile';
import { ok, props, SPINE_STATUS, SPINE_COMPILE } from './ectdCompile.fixtures';

const DANA = { id: '3', email: 'dana@example.com', displayName: 'Dana Reviewer', roles: ['regulatory_affairs', 'user'], organizationId: '7' };
const TICKED = '2026-10-15T09:00:00.000Z';
const PRESSED = '2026-10-15T09:30:00.000Z';

function serve() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url === '/api/ectd-compile/42/status') return ok(SPINE_STATUS);
    if (method === 'GET' && url === '/api/ectd-compile/42/history') return ok({ compilations: [] });
    if (method === 'POST' && url === '/api/ectd-compile/42/compile') return ok(SPINE_COMPILE);
    if (method === 'POST' && url === '/api/ectd/export/55') {
      return { ok: true, status: 200, headers: new Headers({ 'Content-Disposition': 'attachment; filename="p.zip"' }), blob: async () => new Blob(['zip']) } as unknown as Response;
    }
    return ok({});
  });
}
const exportBodies = () =>
  apiRequest.mock.calls.filter((c) => c[0] === 'POST' && c[1] === '/api/ectd/export/55').map((c) => c[2] as Record<string, unknown>);

async function compiled() {
  render(<EctdCompile {...props()} />);
  await screen.findByText(/recorded on sequence 0000/);
  fireEvent.click(screen.getByRole('button', { name: /Compile eCTD/ }));
  return screen.findByRole('button', { name: /Download package \(\.zip\)/ });
}

beforeEach(() => {
  (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = { id: 42 };
  session.user = DANA;
  downloadBlob.mockClear();
  serve();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('EctdCompile package download: the review is the signed-in user’s confirmation', () => {
  it('says it was not reviewed until the person confirms, then sends their name, role and confirmation time', async () => {
    const download = await compiled();

    fireEvent.click(download);
    await waitFor(() => expect(exportBodies()).toHaveLength(1));
    expect(exportBodies()[0].governance, 'the download sent no review block').toEqual({ humanReviewApproved: false });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(TICKED));
    fireEvent.click(screen.getByRole('checkbox', { name: /I confirm my review of this compiled package's content/ }));
    vi.setSystemTime(new Date(PRESSED));
    fireEvent.click(download);
    await waitFor(() => expect(exportBodies()).toHaveLength(2));
    expect(exportBodies()[1]).toMatchObject({ sequenceNumber: '0000' });
    expect(exportBodies()[1].governance).toEqual({
      humanReviewApproved: true,
      reviewerName: 'Dana Reviewer',
      reviewerRole: 'regulatory_affairs',
      reviewTimestamp: TICKED,
    });
  });

  it('a session with no role offers no confirmation, says why, and sends not reviewed', async () => {
    session.user = { ...DANA, roles: [] };
    const download = await compiled();
    expect(screen.queryByRole('checkbox', { name: /I confirm my review/ })).toBeNull();
    expect(screen.getByRole('note').textContent).toMatch(/Your session records no role/);
    fireEvent.click(download);
    await waitFor(() => expect(exportBodies()).toHaveLength(1));
    expect(exportBodies()[0].governance).toEqual({ humanReviewApproved: false });
  });
});
