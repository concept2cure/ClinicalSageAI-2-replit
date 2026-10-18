// @vitest-environment jsdom
/**
 * Meetings & commitments reads the one commitments register through its two
 * doors (2026-10-18, review of 0308ee25).
 *
 * A commitment made in an answer to a project's agency letter belongs to that
 * project: it is read and fulfilled through
 * /api/concept2cure/projects/:pid/commitments, behind project admission and
 * the letter's visibility. The organisation's own commitments stay on
 * /api/ha-interactions. These cases pin that the tab lists both, names the
 * letter and question a project commitment came from, fulfils each through its
 * own door, and shows an error rather than a shorter list when either read
 * fails. The server half is tests/db/agency-response-signed-approval.dbtest.ts
 * ("the commitments register").
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { CommunicationCenter } from '../surfaces/CommunicationCenter';

const PID = '22222222-2222-4222-8222-222222222222';
const ORG_URL = '/api/ha-interactions/commitments';
const PROJECT_URL = `/api/concept2cure/projects/${PID}/commitments`;
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
const failed = () => ({ ok: false, status: 503, json: async () => ({}) }) as Response;

const row = (over: Record<string, unknown>) => ({
  commitment_type: 'pmc', regulatory_basis: null, due_date: '2027-06-30', status: 'open', fulfilled_date: null,
  effectiveStatus: 'open', project_id: null, source_communication_event_id: null, source_question_id: null, ...over,
});
const PROJECT_ROW = row({
  id: 11, description: 'Submit 24-month stability data', project_id: 42, source_communication_event_id: 'ace_1',
  source_question_id: 7, source_communication_type: 'Information request', source_question_ref: 'Q2',
});
const ORG_ROW = row({ id: 12, commitment_type: 'pmr', description: 'Pediatric study (PREA)' });

const posts: Array<{ url: string; body: unknown }> = [];
let projectAnswer: () => Response;

beforeEach(() => {
  (window as { C2C_PROJECT?: unknown }).C2C_PROJECT = { id: PID };
  posts.length = 0;
  projectAnswer = () => ok({ success: true, data: { commitments: [PROJECT_ROW], summary: {} } });
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    if (method === 'POST') {
      posts.push({ url, body });
      return ok({ success: true, data: { status: 'fulfilled' } });
    }
    if (url === ORG_URL) return ok({ success: true, data: { commitments: [ORG_ROW], summary: {} } });
    if (url === PROJECT_URL) return projectAnswer();
    return ok({ success: true, data: [] });
  });
});
afterEach(() => {
  cleanup();
  delete (window as { C2C_PROJECT?: unknown }).C2C_PROJECT;
});

async function openCommitments() {
  render(<CommunicationCenter surface={'communication-center' as never} segment="biotech" onAsk={vi.fn()} onNav={vi.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: /^Meetings & commitments$/ }));
}

async function fulfil(description: string) {
  const rowEl = (await screen.findByText(description)).closest('.cc-row') as HTMLElement;
  fireEvent.click(rowEl.querySelector('button.cc-btn') as HTMLButtonElement);
  fireEvent.change(screen.getByLabelText(/^How it was met/), { target: { value: 'Final report submitted in sequence 0042' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record as fulfilled' }));
}

describe('Meetings & commitments, through both doors of the one register', () => {
  it("lists the project's commitments, naming the letter and question, beside the organisation's own", async () => {
    await openCommitments();
    expect(await screen.findByText('Submit 24-month stability data')).toBeTruthy();
    expect(screen.getByText('Pediatric study (PREA)')).toBeTruthy();
    expect(screen.getByText(/made in the answer to Q2 of Information request/)).toBeTruthy();
  });

  it("fulfils a project's commitment through the project's door, and the organisation's through its own", async () => {
    await openCommitments();
    await fulfil('Submit 24-month stability data');
    await waitFor(() => expect(posts.map((p) => p.url)).toEqual([`${PROJECT_URL}/11/fulfill`]));
    await fulfil('Pediatric study (PREA)');
    await waitFor(() => expect(posts.map((p) => p.url)).toEqual([`${PROJECT_URL}/11/fulfill`, `${ORG_URL}/12/fulfill`]));
  });

  it("shows an error, not the organisation's list alone, when the project's read fails", async () => {
    projectAnswer = failed;
    await openCommitments();
    expect(await screen.findByText("Couldn't load regulatory commitments")).toBeTruthy();
    expect(screen.queryByText('Pediatric study (PREA)')).toBeNull();
  });

  it('says what the empty register will show, without a status the register never returns', async () => {
    projectAnswer = () => ok({ success: true, data: { commitments: [], summary: {} } });
    apiRequest.mockImplementation(async (_m: string, url: string) =>
      url === ORG_URL || url === PROJECT_URL ? ok({ success: true, data: { commitments: [], summary: {} } }) : ok({ success: true, data: [] }),
    );
    await openCommitments();
    const hint = await screen.findByText(/appear here with their status/);
    expect(hint.textContent).not.toMatch(/on-track|due-soon/);
  });
});
