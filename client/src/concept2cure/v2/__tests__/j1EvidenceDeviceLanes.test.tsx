// @vitest-environment jsdom
/**
 * Human test J1 (2026-11-06, docs/evidence/HUMAN-TEST/J1/): on a 510(k) project's Evidence step, the project's files
 * offered three lanes, "Vault · Data room · IND documents". A device or diagnostic project files no IND; the lane is an
 * IND's (editor/IndDocumentLibrary.tsx). It is offered to a drug or biologic project only.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '0f3c1a2b-1111-4222-8333-444455556666';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const props = () => ({ surface: { id: 'project-home', label: 'Project' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/project-vault/${PID}`) return ok({ success: true, data: { tree: [] } });
    if (url.startsWith('/api/chat/threads?program_id=')) return ok({ threads: [] });
    return ok({});
  });
});
afterEach(() => { cleanup(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });

async function lanes(ws: string) {
  (window as unknown as { C2C_PROJECT: unknown }).C2C_PROJECT = { id: PID, title: 'CS-201', ws };
  const { container } = render(<ProjectHome {...props()} />);
  const tab = [...container.querySelectorAll<HTMLButtonElement>('.pj-lc-stage')].find(b => /Evidence/.test(b.textContent ?? ''));
  fireEvent.click(tab!);
  const group = await screen.findByRole('group', { name: 'Document sources' });
  return [...group.querySelectorAll('button')].map(b => b.textContent);
}

describe("a project's files offer the IND library only where an IND is filed", () => {
  it('a device project: Vault and Data room, no IND documents', async () => {
    expect(await lanes('MDX')).toEqual(['Vault', 'Data room']);
  });
  it('a biotech project keeps its IND documents', async () => {
    expect(await lanes('Biotech')).toEqual(['Vault', 'Data room', 'IND documents']);
  });
});
