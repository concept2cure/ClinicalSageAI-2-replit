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
import { cleanup, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
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
  return screen.getByText(status);
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
  return screen.findByText(`priority: ${priority}`);
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

  it('an ACTIVE program still reads green — the good state stays reachable', () => {
    // Over-correction guard.
    const chip = mountWithStatus('active');
    expect(chip.className).toMatch(/tone-ok/);
  });
});

describe('ProjectHome — the priority chip reflects its value, not a fixed warn', () => {
  /* Same defect one chip over: `<span className="rd-chip tone-warn">priority:
     {priority}</span>` wore an amber warning for "priority: low". */
  it('a LOW priority is not rendered as a warning', async () => {
    const chip = await mountWithPriority('low');
    expect(chip.className, 'low must not read as a warning').not.toMatch(/tone-warn/);
    expect(chip.className).toMatch(/tone-idle/);
  });

  it('a CRITICAL priority still warns — the alert stays reachable', async () => {
    const chip = await mountWithPriority('critical');
    expect(chip.className).toMatch(/tone-warn/);
  });
});
