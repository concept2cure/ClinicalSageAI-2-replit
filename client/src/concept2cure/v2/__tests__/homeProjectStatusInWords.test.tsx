// @vitest-environment jsdom
/**
 * Home says a project's status in words, as Projects does.
 *
 * Home's project rows joined the stored status as it is kept: "Biotech · Planning · active", and for a paused
 * project "on_hold". Projects puts the same value through `enumWords` (surfaces/projectWords.ts) and reads
 * "Active", "On hold". Home is the first screen a person opens, so it showed a stored code where the next screen
 * showed a word (demo-day re-walk and executive map, 2026-11-12; released by the coordinating session).
 * One wording, the one Projects already uses: no second mapping.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { firstName: 'Dana' } }),
}));

import { Home } from '../surfaces/Surfaces';
import { enumWords } from '../surfaces/projectWords';

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const PROGRAMS = [
  { id: 'p-1', title: 'Program 1', code: 'ZX-1', status: 'active', ws: 'Biotech', stage: 'Planning' },
  { id: 'p-2', title: 'Program 2', code: 'ZX-2', status: 'on_hold', ws: 'Biotech', stage: 'Planning' },
  { id: 'p-3', title: 'Program 3', code: 'ZX-3', status: '', ws: 'Biotech', stage: 'Planning' },
];

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) =>
    Promise.resolve(ok(url.startsWith('/api/c2c/projects') ? { data: PROGRAMS } : { data: [] })));
});
afterEach(cleanup);

const props = () => ({ surface: { id: 'home' } as never, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biopharma' });
const line = (title: string) => screen.getByText(new RegExp(title)).closest('button')!.querySelector('.home-row-m')!.textContent;

describe('Home project rows', () => {
  it('say the status in the words Projects uses, never the stored value', async () => {
    render(<Home {...props()} />);
    await screen.findByText(/Program 1/);
    expect(line('Program 1')).toBe(`Biotech · Planning · ${enumWords('active')}`);
    expect(line('Program 1')).toBe('Biotech · Planning · Active');
    expect(line('Program 2')).toBe(`Biotech · Planning · ${enumWords('on_hold')}`);
    expect(line('Program 2')).not.toMatch(/on_hold/);
  });

  it('say nothing for a status that is not recorded', async () => {
    render(<Home {...props()} />);
    await screen.findByText(/Program 3/);
    expect(line('Program 3')).toBe('Biotech · Planning');
  });
});
