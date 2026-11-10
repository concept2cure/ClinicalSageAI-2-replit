// @vitest-environment jsdom
/**
 * Labeling's empty state renders the action it describes (MDX journey M8,
 * `.design/client-journey/MDX_JOURNEY_2026-11-01.md`).
 *
 * Verified 2026-11-02: with no labeling document, the screen said "Create a
 * device IFU, package insert, or patient label to author its symbols, UDI,
 * translations and warnings here." and offered nothing to click. No client code
 * creates a labeling document. EmptyState's own contract (v2/dataConnect.tsx)
 * retires exactly this, "the PASSIVE INSTRUCTION ... If the fix is an action,
 * render the action."
 *
 * The record is started by AnA's `create_labeling_document`, which is in launch
 * scope (server/services/ana/ana-launch-scope.inventory.json) and records its
 * creator as POST /api/mdx/labeling does. So the action is the conversation, as
 * the screen's other "Ask AnA" control already is: no per-type create button
 * (RULE 4). It is offered only to a role that can write, as the screen's other
 * write controls are (canGovernedWrite).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  user: null as Record<string, unknown> | null,
  published: null as null | { summary?: string; availableActions?: string[] },
}));

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.user }));
vi.mock('../surfaceContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../surfaceContext')>()),
  usePublishSurfaceContext: (_id: string, ctx: typeof H.published) => { H.published = ctx; },
}));

import { GOVERNED_WRITE_PERMISSION } from '@shared/constants/permissions';
import { Labeling } from '../surfaces/Labeling';
import { clearShellProject, publishShellProject } from '../shellProject';

const PROGRAM_ID = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json });

beforeEach(() => {
  H.apiRequest.mockReset().mockImplementation(async () => answer(200, { data: [] }));
  H.published = null;
});
afterEach(() => { cleanup(); clearShellProject(); });

async function renderAs(user: Record<string, unknown> | null) {
  H.user = user;
  const onAsk = vi.fn();
  publishShellProject({ id: PROGRAM_ID });
  render(<Labeling {...({ onAsk, onNav: () => {} } as unknown as React.ComponentProps<typeof Labeling>)} />);
  await screen.findByText('No labeling document yet');
  return onAsk;
}

describe('no labeling document yet', () => {
  it('offers a writer the action it describes, which asks AnA to start the record', async () => {
    const onAsk = await renderAs({ name: 'E. Editor', permissions: [GOVERNED_WRITE_PERMISSION] });
    const start = screen.queryByRole('button', { name: /Ask AnA to start it/ });
    expect(start, 'the empty state describes a create and offers nothing to click').not.toBeNull();
    fireEvent.click(start!);
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(String(onAsk.mock.calls[0][0])).toMatch(/labeling document for this project/);
    expect(String(onAsk.mock.calls[0][0])).toMatch(/which kind/);
  });

  it('does not describe a create the screen itself offers', async () => {
    await renderAs({ name: 'E. Editor', permissions: [GOVERNED_WRITE_PERMISSION] });
    expect(document.body.textContent).not.toMatch(/Create a device IFU, package insert, or patient label to author/);
  });

  it('offers a viewer no start, and says why', async () => {
    await renderAs({ name: 'V. Viewer', permissions: [] });
    expect(screen.queryByRole('button', { name: /Ask AnA to start it/ })).toBeNull();
    expect(document.body.textContent).toMatch(/Your role can read labeling, not start it/);
  });

  it('tells AnA the same: a writer can have it started, a viewer cannot', async () => {
    await renderAs({ name: 'E. Editor', permissions: [GOVERNED_WRITE_PERMISSION] });
    expect(H.published?.summary).toMatch(/no labeling document yet/);
    expect(H.published?.availableActions).toEqual([expect.stringMatching(/create_labeling_document/)]);
    cleanup();
    await renderAs({ name: 'V. Viewer', permissions: [] });
    expect(H.published?.summary).toMatch(/no labeling document yet/);
    expect(H.published?.availableActions ?? []).toEqual([]);
  });
});
