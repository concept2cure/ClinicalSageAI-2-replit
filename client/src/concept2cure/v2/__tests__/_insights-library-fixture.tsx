/** Bounded reporting-library fixtures shared by read and retained-export interactions. */
import React from 'react';
import type { Mock } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { InsightsCanvas } from '../surfaces/Insights';
import { CANVAS_REPORT_TYPES } from './_insights-catalog-fixture';
import type { OwnedSurfaceViewProps } from '../surfaceViews';

export const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;

export const OVERVIEW = {
  data: {
    organizationId: 1,
    tier: 'enterprise',
    segments: ['pharma'],
    reportTypes: CANVAS_REPORT_TYPES,
    leadProgram: {
      projectId: 11, code: 'BX204', label: 'BX204', filing: 'NDA', indication: null,
      readiness: 70, scope: 'project', scopeId: '11', agency: null, pdufa: null, criticalBlockerCount: 0,
    },
    portfolio: { programs: null },
  },
};

/** Two real run rows, shaped as GET /api/report-os/runs enriches them. */
export const RUNS = [
  {
    id: 41, runUuid: 'aaaaaaaa-0000-4000-8000-000000000001', scopeType: 'project', scopeId: '11',
    reportTypeId: 'readiness.executive_digest', reportTypeLabel: 'Executive Readiness Digest',
    status: 'final', confidence: 82, createdAt: '2026-10-02T09:00:00.000Z',
    completedAt: '2026-10-02T09:00:12.000Z', regionCode: 'US', agency: 'FDA',
  },
  {
    id: 42, runUuid: 'aaaaaaaa-0000-4000-8000-000000000002', scopeType: 'project', scopeId: '11',
    reportTypeId: 'etmf.completeness_pack', reportTypeLabel: 'eTMF Completeness & Gap Pack',
    status: 'partial', confidence: null, createdAt: '2026-10-03T09:00:00.000Z', completedAt: null,
  },
];

export const SUBS = [
  {
    id: 7, reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '11',
    schedule: { cadence: 'weekly', hour: 8, minute: 0, dayOfWeek: 2 },
    recipients: [], format: 'pdf', channel: 'platform', persona: null, enabled: true,
    lastRunAt: '2026-10-06T08:00:00.000Z', nextRunAt: '2026-10-13T08:00:00.000Z',
    createdAt: '2026-09-01T08:00:00.000Z',
  },
];

export const BUNDLES = [
  {
    bundleId: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Pre-approval inspection pack',
    createdAt: '2026-10-04T10:00:00.000Z', createdBy: 3, projectIds: [11], runIds: [41],
    items: [{
      runId: 41, runUuid: 'aaaaaaaa-0000-4000-8000-000000000001',
      reportTypeId: 'readiness.executive_digest', reportTypeLabel: 'Executive Readiness Digest',
      scopeType: 'project', scopeId: '11', status: 'final', confidence: 82,
      createdAt: '2026-10-02T09:00:00.000Z',
    }],
  },
];

/** Mutation fixtures mirror the routes' 201 record / 200 desired-state receipts. */
export function libraryWriteResponse(method: string, url: string, value: unknown): Response | null {
  const body = value as Record<string, unknown>;
  if (method === 'POST' && url === '/api/insights/subscriptions') {
    return { ...ok({ data: { ...SUBS[0], ...body, id: 8, enabled: body.enabled ?? true, recipients: body.recipients ?? [] } }), status: 201 } as Response;
  }
  if (method === 'PATCH' && url === '/api/insights/subscriptions/7') return ok({ data: { ...SUBS[0], enabled: body.enabled } });
  if (method === 'POST' && url === '/api/report-os/bundles') {
    const runIds = body.runIds as number[];
    return { ...ok({ data: { ...BUNDLES[0], name: body.name, runIds, items: RUNS.filter(run => runIds.includes(run.id)).map(run => ({ ...run, runId: run.id })) } }), status: 201 } as Response;
  }
  return null;
}

/** Routes this suite serves. Anything else answers an empty object, so a call
 *  to an unexpected route shows up as a missing assertion rather than a pass. */
export function route(url: string): Response {
  if (url.includes('/api/insights-canvas/overview')) return ok(OVERVIEW);
  if (url.startsWith('/api/report-os/runs')) return ok({ data: RUNS });
  if (url.startsWith('/api/insights/subscriptions')) return ok({ data: SUBS });
  if (url.startsWith('/api/report-os/bundles')) return ok({ data: BUNDLES });
  return ok({});
}

export async function renderCanvas() {
  render(
    <InsightsCanvas
      surface={{ id: 'insights', label: 'Insights' } as OwnedSurfaceViewProps['surface']}
      segment="pharma"
      onNav={() => {}}
    />,
  );
  await waitFor(() => expect(document.querySelector('.rc-ana-head')).not.toBeNull());
}

/** Click one of the artifact pane's tabs by its visible name. */
export async function openTab(name: RegExp) {
  fireEvent.click(await screen.findByRole('tab', { name }));
}

export const requestCalls = (request: Mock, method: string, prefix: string) =>
  request.mock.calls.filter(([m, u]) => m === method && String(u).startsWith(prefix));

