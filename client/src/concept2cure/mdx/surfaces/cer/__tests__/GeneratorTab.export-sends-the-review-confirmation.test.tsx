// @vitest-environment jsdom
/**
 * The CER export sends the review the export gate requires, from the
 * signed-in user's own confirmation.
 *
 * Until 2026-10-15 the Generator tab's checkbox sent humanReviewApproved: true
 * with whatever name was typed (or none) and no reviewerRole, so the gate
 * refused it (400 INCOMPLETE_HUMAN_REVIEW), and useCerExport stamped the
 * review time from the clock at the moment of export. It now sends the
 * session's name and role and the moment the person ticked the confirmation;
 * there is no free-text reviewer to type in.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/utils/authToken', () => ({ getAuthToken: () => 'test-token', getOrgId: () => '7' }));
const session = vi.hoisted(() => ({ user: null as Record<string, unknown> | null }));
vi.mock('@/services/portal/authService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/portal/authService')>()),
  useAuthUser: () => session.user,
}));

import { GeneratorTab } from '../GeneratorTab';
import type { Program } from '../../../data/programs';

const DANA = { id: '3', email: 'dana@example.com', displayName: 'Dana Reviewer', roles: ['regulatory_affairs', 'user'], organizationId: '7' };
const TICKED = '2026-10-15T09:00:00.000Z';
const PRESSED = '2026-10-15T09:30:00.000Z';

const PROGRAM: Program = {
  id: 'a2b4c6d8-0000-4000-8000-00000000cer1', title: 'IV-415 Companion Diagnostic', code: 'IV-415', pathway: 'cer',
  stage: 'Drafting', stageIdx: 1, readiness: 0, status: 'active', lead: 'Dana Reviewer', owners: [], nextBlocker: null,
  dueLabel: '', dueTone: 'ok', lastActivity: '', meta: '',
};

const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
let fetchMock: ReturnType<typeof vi.fn>;
const exportBodies = () =>
  fetchMock.mock.calls
    .filter(([url]) => url === '/api/cerv2/export/pdf')
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);

function renderTab() {
  render(
    <GeneratorTab
      program={PROGRAM} sections={[]} sectionsLoading={false} sectionsError={null} refreshSections={vi.fn()}
      includedSignalCount={0} literatureTotal={0} profile={null} onAskAna={vi.fn()}
    />,
  );
}

beforeEach(() => {
  session.user = DANA;
  fetchMock = vi.fn((url: string) =>
    url === '/api/cerv2/export/pdf'
      ? json({ governed: true, downloadable_output_ref: { encoding: 'base64', mime_type: 'application/pdf', filename: 'CER.pdf', data: btoa('pdf') } })
      : json({ sections: [], stages: [] }),
  );
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:cer') as never;
  URL.revokeObjectURL = vi.fn() as never;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('CER export: the review is the signed-in user’s confirmation', () => {
  it('sends not reviewed until confirmed, then the session name and role and the confirmation time', async () => {
    renderTab();
    const exportPdf = screen.getByRole('button', { name: /Export PDF/ });

    fireEvent.click(exportPdf);
    await waitFor(() => expect(exportBodies()).toHaveLength(1));
    expect(exportBodies()[0].governance).toEqual({ aiGenerated: true, humanReviewApproved: false });

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(TICKED));
    fireEvent.click(screen.getByRole('checkbox', { name: /the assembled content/ }));
    vi.setSystemTime(new Date(PRESSED));
    fireEvent.click(exportPdf);
    await waitFor(() => expect(exportBodies()).toHaveLength(2));
    expect(exportBodies()[1].governance, 'the review was sent without the session role or with the export-time clock').toEqual({
      aiGenerated: true,
      humanReviewApproved: true,
      reviewerName: 'Dana Reviewer',
      reviewerRole: 'regulatory_affairs',
      reviewTimestamp: TICKED,
    });
    // The reviewer is the signed-in user: there is no name to type.
    expect(screen.queryByPlaceholderText('Who reviewed this content')).toBeNull();
  });

  it('unticking the confirmation takes the review back', async () => {
    renderTab();
    const box = screen.getByRole('checkbox', { name: /the assembled content/ });
    fireEvent.click(box);
    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: /Export PDF/ }));
    await waitFor(() => expect(exportBodies()).toHaveLength(1));
    expect(exportBodies()[0].governance).toEqual({ aiGenerated: true, humanReviewApproved: false });
  });
});
