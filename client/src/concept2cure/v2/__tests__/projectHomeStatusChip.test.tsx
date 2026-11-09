// @vitest-environment jsdom
/**
 * The program-header status chip draws its tone from the value it shows.
 *
 * ── The finding (honest-state audit) ─────────────────────────────────────────
 * The header chip was `<span className="rd-chip tone-ok">{status}</span>` —
 * hardcoded GREEN for whatever `status` held. `status` is a real recorded
 * value (`sel?.status || prog?.status`) that can be blocked, at_risk, on_hold,
 * suspended. So a program recorded as BLOCKED wore a green pill: a health
 * verdict the surface drew without consulting the value it was tied to. A
 * director scanning the top of the landing page for at-a-glance health read
 * green-next-to-"blocked" as good news.
 *
 * The file already had the right pattern for milestones (SCHED_STATUS_TONE);
 * the program chip had simply never used one. Now it maps the values that carry
 * a verdict and defaults everything else to NEUTRAL — an unknown status must
 * never read as healthy.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
/* useDocumentList reads the signed-in session (CanvasDocumentList.tsx); with
   no AuthProvider mounted, the real useAuth throws before Project home renders. */
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(), useAuth: () => ({ user: null }) }));
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { ProjectHome } from '../surfaces/ProjectHome';

const PID = 'proj_12';
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data } as Response);
const props = () => ({ surface: { id: 'project-home', label: 'Project' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' });

/** Status reaches the chip through `sel` (window.C2C_PROJECT) — no fetch needed. */
function mountWithStatus(status: string) {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301', status };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async () => ok({}));
  render(<ProjectHome {...props()} />);
  /* Said in words, not as stored (2026-10-31): "at_risk" reads "At risk". */
  const words = status.replace(/_/g, ' ');
  return screen.getByText(words.charAt(0).toUpperCase() + words.slice(1));
}

/** Priority comes only from the program read; liveGetOrNull hands the body
 *  through as the data (the schedule harness feeds raw objects the same way). */
async function mountWithPriority(priority: string) {
  (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) =>
    url === `/api/c2c/projects/${PID}` ? ok({ priority }) : ok({}),
  );
  render(<ProjectHome {...props()} />);
  return screen.findByText(`${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority`);
}

afterEach(() => { cleanup(); delete (window as any).C2C_PROJECT; });
beforeEach(() => apiRequest.mockReset());

describe('ProjectHome — the status chip reflects its value, not a fixed green', () => {
  it('a BLOCKED program does not wear a green pill', () => {
    const chip = mountWithStatus('blocked');
    expect(chip.className, 'blocked must not read as healthy').not.toMatch(/tone-ok/);
    expect(chip.className).toMatch(/tone-warn/);
  });

  it('an AT_RISK program does not wear a green pill', () => {
    const chip = mountWithStatus('at_risk');
    expect(chip.className).not.toMatch(/tone-ok/);
    expect(chip.className).toMatch(/tone-warn/);
  });

  it('an UNKNOWN status is neutral — never assumed healthy', () => {
    // The column is free text. A value the map has never seen must not default
    // to green; that default is exactly the original defect.
    const chip = mountWithStatus('zebra');
    expect(chip.className).not.toMatch(/tone-ok/);
    expect(chip.className).toMatch(/tone-idle/);
  });

  /* D3-1 (2026-11-06, D3.md §4.2): the byline says the status only when it says something. "Active" is the
     ordinary state, so it is a fact in Project knowledge, never a chip that could read as an alert. */
  it('an ACTIVE program is the ordinary state: no status chip in the byline, nothing reads as an alert', async () => {
    (window as any).C2C_PROJECT = { id: PID, title: 'BX-301', status: 'active' };
    apiRequest.mockReset();
    apiRequest.mockImplementation(async () => ok({}));
    render(<ProjectHome {...props()} />);
    await waitFor(() => expect(document.querySelector('.pj-title')?.textContent).toBe('BX-301'));
    const byline = document.querySelector('.pj-byline');
    expect(byline?.textContent ?? '').not.toMatch(/Active/);
    expect(document.querySelector('.pj-top .rd-chip.tone-warn, .pj-top .rd-chip.tone-err')).toBeNull();
  });
});

describe('ProjectHome — the priority chip reflects its value, not a fixed warn', () => {
  /* Same defect one chip over: `<span className="rd-chip tone-warn">priority:
     {priority}</span>` wore an amber warning for "priority: low". */
  /* D3-1: an ordinary priority is a fact in Project knowledge, not a byline chip, so it can never read as a warning. */
  it('a LOW priority is not in the byline, and reads as a plain fact in Project knowledge', async () => {
    (window as any).C2C_PROJECT = { id: PID, title: 'BX-301' };
    apiRequest.mockReset();
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === `/api/c2c/projects/${PID}` ? ok({ id: PID, priority: 'low' }) : ok({}));
    render(<ProjectHome {...props()} />);
    const facts = await screen.findByRole('region', { name: /project identity/i });
    const priority = Array.from(facts.querySelectorAll('dl.pj-fact')).find((dl) => dl.querySelector('dt')?.textContent === 'Priority');
    expect(priority?.querySelector('dd')?.textContent).toBe('Low');
    expect(document.querySelector('.pj-byline')?.textContent ?? '').not.toMatch(/priority/i);
  });

  it('a CRITICAL priority still warns — the alert stays reachable', async () => {
    const chip = await mountWithPriority('critical');
    expect(chip.className).toMatch(/tone-warn/);
  });
});
