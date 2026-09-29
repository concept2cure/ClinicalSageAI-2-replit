// @vitest-environment jsdom
/**
 * ProjectHome — from the project, every record anchored to it (PF-17).
 *
 * The project page mounts ProjectRecords, which reads GET
 * /api/c2c/projects/:id/records. This pins that the panel is reachable from
 * the page a client's work starts at: it renders with the open project's
 * records, reads that project and no other, and is absent with no project.
 * The panel's own honesty rules are pinned in projectRecords.test.tsx.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = '11111111-1111-4111-8111-111111111111';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const props = () => ({
  surface: { id: 'project-home', label: 'Project' } as never,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biopharma',
});

function mockApi() {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => {
    if (url === `/api/c2c/projects/${PID}/records`) {
      return ok({
        projectId: PID,
        records: { authoringDocuments: { available: true, rows: [{ id: 'a1', title: 'Module 2.5 Clinical Overview', status: 'draft' }] } },
      });
    }
    if (url === `/api/c2c/projects/${PID}`) return ok({ id: PID, name: 'BX-301', code: 'BX301' });
    return ok({});
  });
}

afterEach(() => {
  cleanup();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

describe('ProjectHome — records in this project', () => {
  it('lists the open project’s records, read from that project', async () => {
    (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID, title: 'BX-301' };
    mockApi();
    render(<ProjectHome {...props()} />);
    expect(screen.getByRole('region', { name: 'Records in this project' })).toBeTruthy();
    expect(await screen.findByText('Module 2.5 Clinical Overview')).toBeTruthy();
    const recordReads = apiRequest.mock.calls.map((c: unknown[]) => String(c[1])).filter((u) => u.endsWith('/records'));
    expect(recordReads).toEqual([`/api/c2c/projects/${PID}/records`]);
  });

  it('with no project open, there is no records panel and no records read', () => {
    mockApi();
    render(<ProjectHome {...props()} />);
    expect(screen.queryByRole('region', { name: 'Records in this project' })).toBeNull();
    expect(apiRequest.mock.calls.some((c: unknown[]) => String(c[1]).endsWith('/records'))).toBe(false);
  });
});
