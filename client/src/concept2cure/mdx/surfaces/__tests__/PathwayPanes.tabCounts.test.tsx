// @vitest-environment jsdom
/**
 * The pathway tab bar counts only what it has read, and only under the name
 * of the project it was read for.
 *
 * Audit 2 [2]: the Audit trail and Correspondence tabs printed `.length` of
 * arrays that fall back to empty while a read is in flight, idle or failed, so
 * the bar said "Audit trail 0" over a failed read before the pane said
 * anything. A count is printed only for a read that finished; otherwise "—".
 *
 * Audit 2 [3]: the Approvals tab counted and badged the viewer's pending
 * e-signatures from `/api/approval-workflows/pending`, which is user and
 * organisation scoped and carries no project, under the open project's header:
 * "Approvals 3 · Pending e-sign" on a project whose three e-signatures belong to
 * others. The tab keeps its pane (signing is a working capability) but carries
 * no count and says the list covers all projects.
 *
 * PathwayPanes is shared by every pathway screen, so each case runs on all four.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';

import { PathwayPanes } from '../pathway/PathwayPanes';
import type { PathwayKey } from '../../types';

vi.mock('@/utils/authToken', () => ({
  getAuthToken: () => 'test-token',
  getOrgId: () => '7',
}));

const PATHWAYS: PathwayKey[] = ['pma', 'ivd', 'k510', 'cer'];
const PROJECT = '44444444-4444-4444-8444-444444444444';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const never = () => new Promise<Response>(() => {});

type Answer = () => Response | Promise<Response>;
function stubFeeds(feeds: { audit: Answer; correspondence: Answer; approvals: Answer }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('/api/mdx/audit')) return feeds.audit();
      if (u.includes('/agency-communications')) return feeds.correspondence(); // the project inbox (P-39 step 3, S2)
      if (u.includes('/api/approval-workflows/pending')) return feeds.approvals();
      return json({ error: 'not found' }, 404);
    }),
  );
}

function mount(pathway: PathwayKey) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <PathwayPanes pathway={pathway} workspace={<div />} onAskAna={vi.fn()} programId={PROJECT} />
    </QueryClientProvider>,
  );
}

function tabNamed(label: RegExp): HTMLElement {
  const t = screen.getAllByRole('tab').find((el) => label.test(el.querySelector('.pwt-label')?.textContent ?? ''));
  if (!t) throw new Error(`no tab ${label}`);
  return t;
}
const countOf = (t: HTMLElement) => t.querySelector('.pwt-count')?.textContent ?? null;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AUDIT_ROW = (id: string) => ({ id, when: '2026-10-01T09:00:00Z', action: 'edit', actor: 'u1', target: 'Section' });

describe.each(PATHWAYS)('PathwayPanes(%s) — tab counts', (pathway) => {
  it('a failed read is not counted as 0', async () => {
    stubFeeds({
      audit: () => json({ error: 'unavailable' }, 500),
      correspondence: () => json({ error: 'unavailable' }, 500),
      approvals: () => json({ approvals: [] }),
    });
    mount(pathway);
    fireEvent.click(tabNamed(/Audit trail/));
    await screen.findByText(/Could not load audit events/i);
    expect(countOf(tabNamed(/Audit trail/))).not.toMatch(/^\d+$/);
    fireEvent.click(screen.getAllByRole('tab')[2]);
    await screen.findByText(/Could not load correspondence/i);
    expect(countOf(screen.getAllByRole('tab')[2])).not.toMatch(/^\d+$/);
  });

  it('a read in flight is not counted as 0', () => {
    stubFeeds({ audit: never, correspondence: never, approvals: never });
    mount(pathway);
    expect(countOf(tabNamed(/Audit trail/))).not.toMatch(/^\d+$/);
    expect(countOf(screen.getAllByRole('tab')[2])).not.toMatch(/^\d+$/);
  });

  it('positive control: a finished read is counted, zero included', async () => {
    stubFeeds({
      audit: () => json({ data: { events: [AUDIT_ROW('a1'), AUDIT_ROW('a2')], actions: [], resources: [], kpis: [] } }),
      correspondence: () => json({ data: [] }),
      approvals: () => json({ approvals: [] }),
    });
    mount(pathway);
    await waitFor(() => expect(countOf(tabNamed(/Audit trail/))).toBe('2'));
    await waitFor(() => expect(countOf(screen.getAllByRole('tab')[2])).toBe('0'));
  });

  it('the Approvals tab does not count the organisation\'s queue as this project\'s', async () => {
    const pending = ['Doc A', 'Doc B', 'Doc C'].map((target, i) => ({
      id: i + 1, target, stage: 'regulatory', requested_by: 'u2', requested_at: '2026-10-01T08:00:00Z', assigned_to: 'You',
    }));
    stubFeeds({
      audit: () => json({ data: { events: [], actions: [], resources: [], kpis: [] } }),
      correspondence: () => json({ data: [] }),
      approvals: () => json({ approvals: pending }),
    });
    mount(pathway);
    const approvals = tabNamed(/Approvals/);
    // The pane still lists the queue — signing is not taken away …
    fireEvent.click(approvals);
    expect((await screen.findAllByText('Doc C')).length).toBeGreaterThan(0);
    // … but the tab neither counts nor badges it under this project …
    expect(approvals.querySelector('.pwt-count')).toBeNull();
    expect(approvals.querySelector('.badge')).toBeNull();
    // … and the tab and the pane say whose queue it is.
    expect(approvals.querySelector('.pwt-sub')?.textContent ?? '').toMatch(/all projects/i);
    expect(screen.getByTestId('ap-scope-note').textContent ?? '').toMatch(/all projects/i);
  });
});
