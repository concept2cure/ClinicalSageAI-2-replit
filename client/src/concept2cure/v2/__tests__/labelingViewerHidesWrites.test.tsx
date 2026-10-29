// @vitest-environment jsdom
/**
 * A viewer is not offered the labeling write controls (D5, 2026-10-29;
 * docs/evidence/D5-LABELING-TRANSLATION-SIGNATURE/2026-10-29/followups/).
 *
 * Every labeling write route carries requireEditorAccess (43fb57cc), which
 * admits GOVERNED_WRITE_ROLES only, and the session derives
 * GOVERNED_WRITE_PERMISSION from that same set. The screen offered Add
 * translation, Advance and Approve to everyone, so a viewer clicked and was
 * refused after the click. It now asks canGovernedWrite, as the task board and
 * the Vault panels do: a permissions array without the permission withholds the
 * controls; no permissions array (a session stored before the field existed)
 * offers them, and the server still decides.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';

const H = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  calls: [] as Array<{ method: string; path: string }>,
  user: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest: (...a: unknown[]) => H.apiRequest(...a),
}));
vi.mock('@/services/portal/authService', () => ({ useAuthUser: () => H.user }));

import { GOVERNED_WRITE_PERMISSION } from '@shared/constants/permissions';
import { Labeling } from '../surfaces/Labeling';
import { clearShellProject, publishShellProject } from '../shellProject';

const DOC = { id: 4, device_name: 'Aurora CGM', doc_kind: 'ifu', version: '3', organization_id: 7, status: 'draft' };
const PROGRAM_ID = '0b6f1c1e-4d2a-4c55-9a1e-3f7b2d9c8e10';
const row = (id: number, language: string, status: string) => ({
  id, language, translation_method: 'human', back_translation_verified: true, status,
});
const answer = (status: number, json: unknown) => ({ ok: status < 300, status, json: async () => json });

beforeEach(() => {
  H.calls.length = 0;
  H.apiRequest.mockReset().mockImplementation(async (method: string, path: string) => {
    H.calls.push({ method, path });
    if (path === `/api/mdx/labeling?program_id=${PROGRAM_ID}`) return answer(200, { data: [DOC] });
    if (path.endsWith('/translations')) return answer(200, { data: [row(12, 'de', 'review'), row(13, 'fr', 'pending')] });
    return answer(200, { data: [] });
  });
});
afterEach(() => { cleanup(); clearShellProject(); });

async function renderAs(user: Record<string, unknown> | null) {
  H.user = user;
  publishShellProject({ id: PROGRAM_ID });
  render(<Labeling {...({ onAsk: () => {}, onNav: () => {} } as unknown as React.ComponentProps<typeof Labeling>)} />);
  await screen.findByText('German');
}
const rowOf = (name: string) => screen.getByText(name).closest('.ct-row') as HTMLElement;
const writeControls = () => ({
  approve: within(rowOf('German')).queryByRole('button', { name: /Approve/ }) !== null,
  advance: within(rowOf('French')).queryByRole('button', { name: /Advance/ }) !== null,
  addTranslation: screen.queryAllByRole('button', { name: /Add (a )?translation/ }).length,
});

describe('a viewer', () => {
  it('is offered no write control: no Approve, no Advance, no Add translation', async () => {
    await renderAs({ name: 'V. Viewer', permissions: [] });
    expect(writeControls()).toEqual({ approve: false, advance: false, addTranslation: 0 });
  });

  it('is told the screen is view only, and the translations are still shown', async () => {
    await renderAs({ name: 'V. Viewer', permissions: [] });
    expect(screen.getByTestId('labeling-view-only').textContent).toMatch(/View only/);
    expect(screen.getByText('French')).toBeTruthy();
    expect(H.calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });
});

describe('an editor, and a session that does not say', () => {
  it('an editor is offered Approve, Advance and Add translation', async () => {
    await renderAs({ name: 'E. Editor', permissions: [GOVERNED_WRITE_PERMISSION] });
    expect(writeControls()).toEqual({ approve: true, advance: true, addTranslation: 2 });
    expect(screen.queryByTestId('labeling-view-only')).toBeNull();
  });

  it('a session with no permissions array is offered them: the server decides (canGovernedWrite)', async () => {
    await renderAs({ name: 'Old Session' });
    expect(writeControls()).toEqual({ approve: true, advance: true, addTranslation: 2 });
  });
});
