// @vitest-environment jsdom
/**
 * A project switch never shows the previous project's Vault (annotation-success
 * follow-up, QA 2026-10-08).
 *
 * The Vault's read hook keeps the last payload while a new path loads, so a switch
 * that only changed the path showed the previous project's documents in the commit
 * before the loading state took the body. The body is now remounted per project and
 * starts with no data.
 *
 * The switch is rendered outside act(), as a real update is, so the commit that
 * still holds the previous project is a separate step from the effect that starts
 * the new read. Every DOM state after the switch is recorded and checked.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { ok, uploadDoc, cabinetTree, vaultPayload, props } from './_vault-surface-fixtures';

const PROJECT_A = '11111111-1111-4111-8111-111111111111';
const PROJECT_B = '77777777-7777-4777-8777-777777777777';
const DOC_A = '44444444-4444-4444-8444-444444444444';
const DOC_B = '88888888-8888-4888-8888-888888888888';
const vaultUrl = (project: string) => `/api/c2c/project-vault/${project}`;
const annotationsUrl = (project: string, doc: string) => `${vaultUrl(project)}/documents/${doc}/annotations`;

const annotations = (docId: string, body: string) => ({
  annotations: [{
    id: `a-${docId}`, parentId: null, versionId: docId, versionLabel: '1.0', programId: null, kind: 'comment',
    anchor: { kind: 'document' }, anchorCurrent: null, status: 'open', body, authorId: 7, authorName: 'Rhea Reviewer',
    createdAt: '2026-09-30T14:05:09.000Z', resolution: null, retraction: null, replies: [],
  }],
  openByVersion: [{ versionId: docId, versionLabel: '1.0', current: true, open: 1, openChangeRequests: 0 }],
});

function mockApi() {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (url === vaultUrl(PROJECT_A) && method === 'GET') {
      return ok(vaultPayload({ tree: cabinetTree([uploadDoc({ id: `up-${DOC_A}`, docId: DOC_A, title: 'Alpha protocol' })]) }));
    }
    if (url === vaultUrl(PROJECT_B) && method === 'GET') {
      // The new project's read takes a round trip.
      await new Promise((r) => setTimeout(r, 120));
      return ok(vaultPayload({ tree: cabinetTree([uploadDoc({ id: `up-${DOC_B}`, docId: DOC_B, title: 'Beta report' })]) }));
    }
    if (url === annotationsUrl(PROJECT_A, DOC_A) && method === 'GET') return ok({ success: true, data: annotations(DOC_A, 'Alpha review note') });
    if (url === annotationsUrl(PROJECT_B, DOC_B) && method === 'GET') return ok({ success: true, data: annotations(DOC_B, 'Beta review note') });
    return ok({});
  });
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  apiRequest.mockReset();
  mockApi();
  (window as any).C2C_PROJECT = { id: PROJECT_A, title: 'Study A' };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  root?.unmount();
  container?.remove();
  root = null;
  container = null;
  delete (window as any).C2C_PROJECT;
});

describe('a project switch', () => {
  it("never shows the previous project's documents or annotations, not even while the new project loads", async () => {
    root!.render(<Vault {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('Alpha review note'));

    const seen: string[] = [];
    const watch = new MutationObserver(() => { seen.push(document.body.textContent ?? ''); });
    watch.observe(document.body, { subtree: true, childList: true, characterData: true });
    (window as any).C2C_PROJECT = { id: PROJECT_B, title: 'Study B' };
    root!.render(<Vault {...props()} />);
    await waitFor(() => expect(document.body.textContent).toContain('Beta review note'));
    await new Promise((r) => setTimeout(r, 30));
    watch.disconnect();

    expect(document.body.textContent).toContain('Beta report');
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((text) => text.includes('Alpha'))).toHaveLength(0);
  });
});
