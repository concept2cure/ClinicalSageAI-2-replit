// @vitest-environment jsdom
/**
 * A card on the readiness board can be read (rehearsal finding 5.4, GA-DEMO-06; re-checked in the running app
 * 2026-11-12, docs/evidence/F1/2026-11-12-reporting-readiness-board/).
 *
 * Each card was a 210px row with the ring beside the text, so the text ran about one word a line. It printed the
 * stored verdict ("missing") and an empty line where no indication is recorded, and what holds the project back
 * was set in the same narrow column.
 *
 * The figure and the name now share one row, and what holds the project back runs across the card's width below.
 * The verdict is said in words. Every fact the card showed is still on it (decision P-122).
 */
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { InsightsCanvas } from '../surfaces/Insights';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;
const BLOCKERS = [
  'No filing section is approved or locked (0 of 72).',
  'Administrative Forms: Required section "Administrative Forms" (1.1) has no usable current evidence',
  'Cover Letter: Required section "Cover Letter" (1.2) has no usable current evidence',
];
const PROGRAMS = [
  { projectId: 1, programId: '1ca8c7c0-e05b-4fc1-97b3-7fd2b90ca6b8', code: 'C2C-101', label: 'C2C-101', indication: null, readiness: 0, confidence: null, status: 'missing', riskLevel: 'critical', criticalBlockerCount: 23, topBlockers: BLOCKERS },
  { projectId: 2, programId: 'ee6b875d-5be3-4cdb-98e5-b89b97836338', code: 'C2C-201', label: 'C2C-201', indication: 'Plaque psoriasis', readiness: 64, confidence: null, status: 'partial', riskLevel: 'medium', criticalBlockerCount: 1, topBlockers: [] },
  { projectId: 3, programId: '7e9fa00f-cf30-4c47-b08e-e18b5292d62a', code: 'NEUR', label: 'NEUR', indication: null, readiness: 100, confidence: null, status: 'ready', riskLevel: 'low', criticalBlockerCount: 0 },
  { projectId: 4, programId: null, code: 'OLD-4', label: 'OLD-4', indication: null, readiness: null, confidence: null, status: 'on_hold', riskLevel: '', criticalBlockerCount: 0 },
];
const overview = () => ({
  data: {
    organizationId: 1, dataScope: 'accessible_projects', tier: 'enterprise', tierResolved: true, segments: ['biotech'],
    leadProgram: { projectId: 1, code: 'C2C-101', label: 'C2C-101', filing: null, indication: null, readiness: 0, scope: 'project', scopeId: '1', agency: null, pdufa: null, criticalBlockerCount: 23 },
    portfolio: { entitled: true, requiredTier: 'enterprise', summary: { truncated: false }, programs: PROGRAMS },
  },
});

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (_m: string, url: string) => (String(url).includes('/api/insights-canvas/overview') ? ok(overview()) : ok({})));
});
afterEach(() => cleanup());

async function openBoard() {
  render(<InsightsCanvas surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']} segment="biotech" onNav={() => {}} />);
  await waitFor(() => expect(document.querySelector('[data-testid="rc-find-result"]')).not.toBeNull());
  const find = document.querySelector('[data-work-area="insights"] .rc-find input') as HTMLInputElement;
  fireEvent.change(find, { target: { value: 'portfolio board view across all programs' } });
  fireEvent.keyDown(find, { key: 'Enter' });
  await waitFor(() => expect(document.querySelectorAll('.ro-port-card')).toHaveLength(PROGRAMS.length));
}
const card = (code: string) => [...document.querySelectorAll<HTMLElement>('.ro-port-card')].find((c) => c.querySelector('.ro-port-code')?.textContent === code)!;

describe('a card on the readiness board', () => {
  it('says the verdict in words, with the risk and the count of critical blockers it showed', async () => {
    await openBoard();
    expect(card('C2C-101').querySelector('.ro-port-filing')?.textContent).toBe('Not ready · Critical risk · 23 critical blockers');
    expect(card('C2C-201').querySelector('.ro-port-filing')?.textContent).toBe('Partly ready · Medium risk · 1 critical blocker');
    expect(card('NEUR').querySelector('.ro-port-filing')?.textContent).toBe('Ready · Low risk · 0 critical blockers');
    expect(card('C2C-101').textContent).not.toMatch(/\bmissing\b/);
  });

  it('shows a verdict it does not know as recorded, in words, and never as another verdict', async () => {
    await openBoard();
    expect(card('OLD-4').querySelector('.ro-port-filing')?.textContent).toBe('on hold · 0 critical blockers');
    expect(card('OLD-4').querySelector('[role="note"]')?.textContent).toBe('Readiness not computed');
  });

  it('sets what holds the project back across the card, below its figure and name', async () => {
    await openBoard();
    const c = card('C2C-101');
    const top = c.querySelector('.ro-port-top')!;
    const below = c.querySelector('.ro-port-blockers')!;
    expect(top.querySelector('.ro-port-code')?.textContent).toBe('C2C-101');
    expect(top.contains(below)).toBe(false);
    expect([...below.querySelectorAll('.ro-port-blocker')].map((b) => b.textContent)).toEqual(BLOCKERS);
    // Nothing to say: no rule and no empty block.
    expect(card('C2C-201').querySelector('.ro-port-blockers')).toBeNull();
    expect(card('NEUR').querySelector('.ro-port-blockers')).toBeNull();
  });

  it('draws no empty line where no indication is recorded, and keeps one that is', async () => {
    await openBoard();
    expect(card('C2C-101').querySelector('.ro-port-b .ro-port-ind')).toBeNull();
    expect(card('C2C-201').querySelector('.ro-port-b .ro-port-ind')?.textContent).toBe('Plaque psoriasis');
  });

  it('still opens the project it names', async () => {
    await openBoard();
    expect(screen.getByRole('button', { name: 'Open C2C-101' })).toBe(card('C2C-101'));
    expect(card('OLD-4').tagName).toBe('DIV');
  });
});

describe('the board’s cards have room for their words', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../styles/insights-v2.css'), 'utf8');
  const rule = (selector: string) => new RegExp(`${selector.replace(/[.]/g, '\\.')}\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  it('a card is a column at least 280px wide, and one a row on a phone', () => {
    expect(rule('.ro-port-grid')).toMatch(/minmax\(min\(100%,\s*280px\),\s*1fr\)/);
    expect(rule('.ro-port-card')).toMatch(/flex-direction:\s*column/);
    expect(rule('.ro-port-top')).toMatch(/display:\s*flex/);
  });
});
