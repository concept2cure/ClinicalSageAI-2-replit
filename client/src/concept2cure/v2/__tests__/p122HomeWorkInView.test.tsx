// @vitest-environment jsdom
/**
 * P-122 §3 item 1 (2026-11-10): Home shows the person's projects and their due
 * tasks at 1440×900 without scrolling, beneath a compact greeting and the
 * composer.
 *
 * WHY THIS EXISTS
 * 4a5cc0d22 ("Home and sidebar take Claude's shape", 2026-10-31) put the
 * composer first and started the page 22vh down (`padding-top:max(40px,22vh)`),
 * with the setup checklist, Your projects and Your open items stacked in one
 * 680px column beneath it. At 1440×900 the first project row sat at about 750px
 * and Your open items at about 1030px: below the fold. The founder opened the
 * product and did not see his work (P-122).
 *
 * WHAT IS PINNED
 *   - Your projects and Your open items sit side by side in one `.home-work`
 *     row, beneath the composer, so both start at the same height;
 *   - the page starts near the top: no viewport-height pad on `.home-start`;
 *   - the row is two columns wherever two fit, one on a phone.
 * jsdom draws no layout, so the fold itself is measured in Chromium at
 * 1440×900 (docs/evidence/DESIGN/P-122/home-projects/, measurements.json).
 * The composer, the order a client reads Home in, and Recents are pinned in
 * homeStartHere.test.tsx and railRecents.test.tsx, and are unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
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

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;
const PROGRAMS = Array.from({ length: 3 }, (_, i) => ({
  id: `p-${i + 1}`, title: `Program ${i + 1}`, code: `ZX-${i + 1}`, status: 'active', ws: 'Biotech', stage: 'Planning',
}));

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) =>
    Promise.resolve(ok(url.startsWith('/api/c2c/projects') ? { data: PROGRAMS } : { data: [] })));
});
afterEach(cleanup);

const CSS = fs.readFileSync(path.resolve(__dirname, '../styles/surfaces-v2.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
/** Every declaration block whose selector list names `selector` exactly, at any media level. */
function rules(selector: string): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(CSS); m; m = re.exec(CSS)) {
    if (m[1].split(',').map((s) => s.trim()).includes(selector)) out.push(m[2]);
  }
  return out;
}

describe('Home: your projects and your open items, in view beneath the composer (P-122 §3.1)', () => {
  it('puts Your projects and Your open items side by side in one row, after the composer', async () => {
    render(<Home onNav={vi.fn()} onAsk={vi.fn()} segment="biopharma" />);
    await screen.findByTestId('home-projects');
    const work = document.querySelector('.home-work');
    expect(work, 'one row holds the work').toBeTruthy();
    const projects = screen.getByRole('heading', { level: 2, name: 'Your projects' }).closest('section');
    const tasks = screen.getByRole('heading', { level: 2, name: 'Your open items' }).closest('section');
    expect(projects?.parentElement).toBe(work);
    expect(tasks?.parentElement).toBe(work);
    const ask = document.querySelector('.home-ask') as HTMLElement;
    expect(ask.compareDocumentPosition(work as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('starts Home near the top: no viewport-height pad above the greeting', () => {
    const pads = rules('.c2c-v2 .landing.home-start');
    expect(pads.length).toBeGreaterThan(0);
    for (const body of pads) expect(body, 'the 22vh pad pushed the work below the fold').not.toMatch(/\d+(\.\d+)?vh/);
  });

  it('lays the row out in two columns wherever two fit, and one on a phone', () => {
    const grid = rules('.c2c-v2 .home-work').join(';');
    expect(grid).toMatch(/display:\s*grid/);
    // auto-fit over a minimum column: two columns in the 1040px work area, one at 390px.
    expect(grid).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*\d+px\),\s*1fr\)\)/);
    const width = rules('.c2c-v2 .home-start .landing-center').join(';');
    const max = Number(/max-width:\s*(\d+)px/.exec(width)?.[1] ?? 0);
    const min = Number(/minmax\(min\(100%,\s*(\d+)px\)/.exec(grid)?.[1] ?? 0);
    expect(max, 'the work area holds two columns').toBeGreaterThanOrEqual(2 * min + 24);
    expect(min, 'a 390px phone takes one column').toBeGreaterThan(390 / 2);
  });
});
