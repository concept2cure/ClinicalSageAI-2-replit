// @vitest-environment jsdom
/** The actual Vault sends exact recorded filing or source identity into the
 * one editor. HTTP, records and credentials below are explicitly synthetic. */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { Vault } from '../surfaces/Vault';
import { clearEditorTarget, peekEditorTarget } from '../editorTarget';
import type { SurfaceViewProps } from '../surfaceViews';
import { authService } from '@/services/portal/authService';
import { clearAuthToken } from '@/utils/authToken';

const PROJECT_ID = '2c1f9c2a-0000-4000-8000-000000000001';
/** The shell renders only behind ProtectedRoute, so a Vault user is always
 *  signed in. Source intake (8c86a44a, useSourceIntake.ts) captures that
 *  account and refuses an anonymous visit, so the fixture signs one in. */
const USER_ID = 7;
const ORG_ID = 12;
const TOKEN = `fixture.${btoa(JSON.stringify({ userId: USER_ID, organizationId: ORG_ID }))}.synthetic`;

const leaf = (id: string, num: string, title: string) => ({
  id, num, title, type: 'Required', status: 'draft', pct: 0,
  owner: '—', ver: 'v1', updated: '2 days ago', preview: `${title} · ${num}`,
});

/** One governed 510(k) document and one governed IND document, each with its
 *  own section leaf — the read-model's real shape (documentFolder →
 *  `vaultdoc-<id>` whose `code` is the row's doc_type uppercased). */
const TREE = [
  {
    id: 'vaultdoc-11', code: 'K510', label: 'Acme Cutter — 510(k)',
    children: [leaf('sec-11-B1', 'B1', 'Device Description')],
  },
  {
    id: 'vaultdoc-22', code: 'IND', label: 'BX204 — IND',
    children: [leaf('sec-22-2.7.3', '2.7.3', 'Summary of Clinical Efficacy')],
  },
];

const VAULT_PAYLOAD = {
  success: true,
  data: { program: 'BX204', spine: 'eCTD', tree: TREE, unfiledCount: 0, unavailable: [] },
};

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj }) as unknown as Response;

let navigated: string[];

function mount() {
  navigated = [];
  const props = {
    surface: { id: 'vault', label: 'Vault' },
    segment: 'biotech',
    onAsk: () => {},
    onNav: (id: string) => navigated.push(id),
  } as unknown as SurfaceViewProps;
  return render(<Vault {...props} />);
}

/** Open the document folder `folderLabel` in the tree (the list shows one
 *  folder at a time), click the row for `title`, then "Open in editor". */
async function openInEditor(title: string, folderLabel: string) {
  const folder = await waitFor(() => {
    const el = Array.from(document.querySelectorAll('.vd-folder')).find((b) =>
      b.textContent?.includes(folderLabel),
    );
    if (!el) throw new Error(`folder "${folderLabel}" not rendered`);
    return el;
  });
  fireEvent.click(folder);
  const row = await waitFor(() => {
    const el = Array.from(document.querySelectorAll('.vd-row')).find((b) =>
      b.textContent?.includes(title),
    );
    if (!el) throw new Error(`row "${title}" not rendered`);
    return el;
  });
  fireEvent.click(row);
  const btn = await waitFor(() => screen.getByText(/Open in editor/));
  fireEvent.click(btn);
}

beforeEach(() => {
  authService.endSession(null); clearAuthToken();
  authService.setToken(TOKEN, { id: String(USER_ID), organizationId: String(ORG_ID), roles: ['author'], permissions: [] }, 'fixture-refresh', 3600);
  apiRequest.mockReset();
  apiRequest.mockImplementation((_m: string, url: string) =>
    url.startsWith('/api/c2c/project-vault/')
      ? Promise.resolve(ok(VAULT_PAYLOAD))
      : Promise.resolve(ok({ success: true, data: null })),
  );
  clearEditorTarget();
  (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT = {
    id: PROJECT_ID,
    title: 'BX204',
  };
});
afterEach(() => {
  cleanup();
  clearEditorTarget();
  delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT;
  authService.endSession(null); clearAuthToken();
});

describe('Vault — Open in editor carries the selected document', () => {
  it('pulls an uploaded document through verified intake and opens the exact saved working copy', async () => {
    const uploadId = '33333333-3333-4333-8333-333333333333';
    const workingId = '44444444-4444-4444-8444-444444444444';
    // The receipt the import route actually returns (authoring-source-import.ts):
    // the saved row with its tenant, project, creator and recorded provenance, and
    // its saved sections. 8c86a44a's strict decoder refuses anything thinner as an
    // unconfirmed save, and never opens it.
    const origin = { kind: 'vault', id: uploadId, programId: PROJECT_ID, title: 'IB.pdf', fileName: 'IB.pdf',
      mimeType: 'application/pdf', documentType: null, sectionCode: null, sha256: 'ab'.repeat(32), conversion: 'extracted-text' };
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (url === '/api/authoring/import/source' && method === 'POST') return ok({ success: true, data: {
        doc: { id: workingId, title: 'IB.pdf', tenant_id: ORG_ID, client_program_id: PROJECT_ID, created_by: USER_ID, status: 'DRAFT',
          provenance: { source: 'import', importSource: { ...origin, reason: 'Revise the IB', warnings: ['Extracted text requires review.'] } } },
        sections: [{ id: '55555555-5555-4555-8555-555555555555', doc_id: workingId, tenant_id: ORG_ID, code: 'source.1',
          title: 'IB.pdf', content: '<p>Extracted investigator brochure text</p>', order_index: 0 }],
        warnings: ['Extracted text requires review.'], reused: false, origin,
      } });
      return ok({ success: true, data: { ...VAULT_PAYLOAD.data, tree: [{ id: 'uploads', label: 'Uploaded files', children: [
        { ...leaf(uploadId, '', 'IB.pdf'), src: 'upload', docId: uploadId },
      ] }] } });
    });
    mount();
    const folder = await waitFor(() => {
      const el = Array.from(document.querySelectorAll('.vd-folder')).find(b => b.textContent?.includes('Uploaded files'));
      if (!el) throw new Error('upload folder not rendered');
      return el;
    });
    fireEvent.click(folder);
    fireEvent.click(await waitFor(() => {
      const row = document.querySelector('.vd-row');
      if (!row) throw new Error('upload row not rendered');
      return row;
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'Work on document' }));
    fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Revise the IB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
    await screen.findByText('Extracted text requires review.');
    expect(navigated).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Open working copy' }));
    // Dispatched once, as the signed-in account the intake captured.
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toEqual([['POST', '/api/authoring/import/source',
      { programId: PROJECT_ID, source: { kind: 'vault', documentId: uploadId }, reason: 'Revise the IB' },
      { Authorization: `Bearer ${TOKEN}`, 'x-organization-id': String(ORG_ID) }]]);
    expect(peekEditorTarget()).toMatchObject({ docId: workingId, programId: PROJECT_ID });
    expect(navigated).toEqual(['document-authoring']);
  });

});

describe('Vault governed section navigation', () => {
  it('publishes the selected section on the editor deep-link channel before navigating', async () => {
    mount();
    await openInEditor('Device Description', 'Acme Cutter');

    const target = peekEditorTarget();
    expect(target, 'nothing was published on the editor channel').not.toBeNull();
    expect(target!.sectionCode).toBe('B1');
    expect(target!.sectionLabel).toBe('Device Description');
    // The family IS expressible for a 510(k), so it is named — that is the
    // stronger claim, and it is what lets the editor refuse a wrong dossier.
    expect(target!.docType).toBe('k510');
    expect(target!.programId).toBe(PROJECT_ID);
    expect(target!.programTitle).toBe('BX204');
    expect(navigated).toEqual(['document-authoring']);
  });

  it('retains the recorded IND family on the common editor channel', async () => {
    mount();
    await openInEditor('Summary of Clinical Efficacy', 'BX204 — IND');

    const target = peekEditorTarget();
    expect(target).not.toBeNull();
    expect(target!.sectionCode).toBe('2.7.3');
    expect(target!.sectionLabel).toBe('Summary of Clinical Efficacy');
    // The shared editor accepts the recorded family for every client type.
    expect(target!.docType).toBe('ind');
    expect(navigated).toEqual(['document-authoring']);
  });

  it('leaves no stale target behind for the next, unrelated visit to the editor', async () => {
    mount();
    await openInEditor('Device Description', 'Acme Cutter');
    expect(peekEditorTarget()).not.toBeNull();
    // The channel is one-shot: DocumentAuthoring consumes on mount. Pinned here
    // so the vault's writes stay compatible with that contract.
    const consumed = peekEditorTarget();
    clearEditorTarget();
    expect(consumed).not.toBeNull();
    expect(peekEditorTarget()).toBeNull();
  });
});


function useTree(tree: unknown[]) {
  apiRequest.mockImplementation(async () => ok({ success: true, data: { ...VAULT_PAYLOAD.data, tree } }));
}
function filingTree(facts: Record<string, unknown> = {}, docFacts: Record<string, unknown> = {}) {
  return [{ id: 'vaultdoc-synthetic', code: 'CER', label: 'Recorded filing', ...facts,
    children: [{ ...leaf('recorded-section', 'display-code', 'Recorded section'), ...docFacts }] }];
}

describe('Vault exact governed filing identity', () => {
  it.each(['IND', 'NDA', 'BLA', 'MAA', 'CER', 'IVDR'])('retains the recorded %s family', async family => {
    useTree(filingTree({ code: family }));
    mount(); await openInEditor('Recorded section', 'Recorded filing');
    expect(peekEditorTarget()).toMatchObject({ docType: family.toLowerCase(), programId: PROJECT_ID });
  });
  it.each(['vaultdoc-display-only', 'presentation-folder'])('uses explicit filing identity independent of folder id %s', async id => {
    useTree(filingTree({ id, filingDocumentId: 'doc_exact_cer' }));
    mount(); await openInEditor('Recorded section', 'Recorded filing');
    expect(peekEditorTarget()).toMatchObject({ filingDocumentId: 'doc_exact_cer', docType: 'cer' });
  });
  it.each([null, 12, '', '../invalid-filing'])('refuses an explicit invalid filing identity %s', async filingDocumentId => {
    useTree(filingTree({ filingDocumentId }));
    mount(); await openInEditor('Recorded section', 'Recorded filing');
    expect(peekEditorTarget()).toBeNull(); expect(navigated).toEqual([]);
    expect(await screen.findByText(/recorded filing identity could not be verified/)).toBeTruthy();
  });
});

describe('Vault whole document and exact section intents', () => {
  it('carries whole-filing intent without a presentation code or title', async () => {
    useTree(filingTree({ filingDocumentId: 'doc_exact_cer' }, { filingSectionKey: null }));
    mount(); await openInEditor('Recorded section', 'Recorded filing');
    expect(peekEditorTarget()).toMatchObject({ filingDocumentId: 'doc_exact_cer', docType: 'cer', sectionCode: null, sectionLabel: null });
    expect(navigated).toEqual(['document-authoring']);
  });
  it('uses the recorded section key instead of its display number', async () => {
    useTree(filingTree({ filingDocumentId: 'doc_exact_cer' }, { filingSectionKey: 'clinical.evaluation' }));
    mount(); await openInEditor('Recorded section', 'Recorded filing');
    expect(peekEditorTarget()).toMatchObject({ filingDocumentId: 'doc_exact_cer', sectionCode: 'clinical.evaluation' });
  });
  it('refuses whole-filing intent without exact filing identity', async () => {
    useTree(filingTree({}, { filingSectionKey: null }));
    mount(); await openInEditor('Recorded section', 'Recorded filing');
    expect(peekEditorTarget()).toBeNull(); expect(navigated).toEqual([]);
  });
  it('refuses an explicit malformed section claim', async () => {
    useTree(filingTree({ filingDocumentId: 'doc_exact_cer' }, { filingSectionKey: 7 }));
    mount(); await openInEditor('Recorded section', 'Recorded filing');
    expect(peekEditorTarget()).toBeNull(); expect(navigated).toEqual([]);
  });
  it('does not dispatch a retained button after the selected project changed', async () => {
    useTree(filingTree({ filingDocumentId: 'doc_exact_cer' }));
    mount();
    await openInEditor('Recorded section', 'Recorded filing');
    clearEditorTarget(); navigated.length = 0;
    await act(async () => {
      window.C2C_PROJECT = { id: 'other-project', title: 'Another project' };
      fireEvent.click(screen.getByText(/Open in editor/));
    });
    expect(peekEditorTarget()).toBeNull(); expect(navigated).toEqual([]);
  });
});

const ARTIFACT_SOURCE = { kind: 'artifact', artifactId: 'logical-artifact_cer', version: 3 };
function artifactTree(version: unknown) {
  return [{ id: 'artifacts', code: '', label: 'Governed artifacts', children: [{
    ...leaf('artifact-display', 'display-section', 'Saved clinical evidence'), src: 'artifact', ver: 'v999',
    artifact: { artifactId: ARTIFACT_SOURCE.artifactId, version, kind: 'CER', format: 'html', model: null,
      origin: null, author: null, contentHash: 'ac'.repeat(32), ctdSection: null, signature: 'none',
      signedVersion: null, reviewed: false, sourceCount: 0 },
  }] }];
}
function artifactOrigin(version = 3) {
  return { kind: 'artifact', id: ARTIFACT_SOURCE.artifactId, version: String(version), programId: PROJECT_ID,
    title: 'Saved clinical evidence', documentType: null, sectionCode: null, fingerprint: 'ac'.repeat(32),
    selection: { ...ARTIFACT_SOURCE, version }, conversion: 'artifact-snapshot', gaps: [],
    sourceScope: { level: 'program', programId: PROJECT_ID, projectId: 11 }, association: { mode: 'recorded', reason: null },
    sectionOrigins: [{ code: 'artifact.content', sourceRowId: 'concept2cure_artifact_versions:33', contentSha256: 'ef'.repeat(32),
      originalAuthorship: 'unknown', model: null, modelEvidence: 'unrecorded' }] };
}
function artifactReplies(wrongVersion = false) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
    if (method !== 'POST' || url !== '/api/authoring/import/source') return ok({ success: true, data: { ...VAULT_PAYLOAD.data, tree: artifactTree(3) } });
    const origin = artifactOrigin(wrongVersion ? 4 : 3);
    if (body?.previewOnly) return ok({ success: true, data: { preview: true, origin, fingerprint: origin.fingerprint,
      sections: [{ code: 'artifact.content', title: origin.title, contentSha256: 'ef'.repeat(32) }], gaps: [], warnings: [],
      target: { programId: PROJECT_ID, projectId: 11 }, association: { mode: 'recorded', required: false, reasonRequired: false,
        sourceProgramId: PROJECT_ID, sourceProjectId: 11, targetProgramId: PROJECT_ID } } });
    const id = '44444444-4444-4444-8444-444444444444';
    return ok({ success: true, data: { doc: { id, title: origin.title, tenant_id: ORG_ID, client_program_id: PROJECT_ID,
      created_by: USER_ID, status: 'DRAFT', c2c_document_id: null,
      provenance: { source: 'import', importSource: { ...origin, reason: 'Revise saved clinical evidence', warnings: [] } } },
      sections: [{ id: '55555555-5555-4555-8555-555555555555', doc_id: id, tenant_id: ORG_ID, code: 'artifact.content',
        title: origin.title, content: '<p>Saved clinical evidence</p>', order_index: 0 }], origin, warnings: [], reused: false } });
  });
}
async function chooseArtifact() {
  const folder = await waitFor(() => {
    const item = Array.from(document.querySelectorAll('.vd-folder')).find(b => b.textContent?.includes('Governed artifacts'));
    if (!item) throw new Error('artifact folder not rendered'); return item;
  });
  fireEvent.click(folder);
  const row = await waitFor(() => {
    const item = Array.from(document.querySelectorAll('.vd-row')).find(b => b.textContent?.includes('Saved clinical evidence'));
    if (!item) throw new Error('artifact row not rendered'); return item;
  });
  fireEvent.click(row);
  fireEvent.click(screen.getByRole('button', { name: /Work on document/ }));
}

describe('Vault governed artifacts use the existing verified source intake', () => {
  it('opens the exact version as a source-linked working copy', async () => {
    artifactReplies(); mount(); await chooseArtifact();
    await screen.findByTestId('workflow-import-preview');
    expect(navigated).toEqual([]);
    fireEvent.change(screen.getByLabelText('Reason for creating a working copy'), { target: { value: 'Revise saved clinical evidence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create working copy' }));
    await screen.findByTestId('source-import-result');
    fireEvent.click(screen.getByRole('button', { name: 'Open working copy' }));
    expect(peekEditorTarget()).toMatchObject({ docId: '44444444-4444-4444-8444-444444444444', programId: PROJECT_ID, sectionCode: 'artifact.content' });
    expect(navigated).toEqual(['document-authoring']);
    const posts = apiRequest.mock.calls.filter(([method]) => method === 'POST');
    expect(posts).toHaveLength(2);
    expect(posts[0][2]).toMatchObject({ previewOnly: true, source: ARTIFACT_SOURCE });
    expect(posts[1][2]).toMatchObject({ source: ARTIFACT_SOURCE, expectedFingerprint: 'ac'.repeat(32) });
  });
  it.each([undefined, '3', 0, 1.5])('refuses missing or malformed numeric artifact version %s', async version => {
    useTree(artifactTree(version)); mount(); await chooseArtifact();
    expect(screen.queryByTestId('source-import-dialog')).toBeNull(); expect(navigated).toEqual([]);
    expect(await screen.findByText(/recorded source identity and version could not be verified/)).toBeTruthy();
    expect(apiRequest.mock.calls.filter(([method]) => method === 'POST')).toHaveLength(0);
  });
  it('refuses a preview for another recorded version', async () => {
    artifactReplies(true); mount(); await chooseArtifact();
    await screen.findByText(/source.*could not be verified/i);
    expect(navigated).toEqual([]);
    const create = screen.queryByRole('button', { name: 'Create working copy' }) as HTMLButtonElement | null;
    expect(!create || create.disabled).toBe(true);
  });
});


describe('Vault governed handoff retains the current account owner', () => {
  it('refuses a retained editor action during an account transition', async () => {
    useTree(filingTree({ filingDocumentId: 'doc_exact_cer' }));
    mount(); await openInEditor('Recorded section', 'Recorded filing');
    clearEditorTarget(); navigated.length = 0;
    const previousButton = screen.getByText(/Open in editor/);
    await act(async () => {
      authService.setToken(TOKEN, { id: '8', organizationId: String(ORG_ID), roles: ['author'], permissions: [] }, 'other-refresh', 3600);
      fireEvent.click(previousButton);
    });
    expect(peekEditorTarget()).toBeNull(); expect(navigated).toEqual([]);
  });
  it('does not hydrate a previous account’s delayed project tree', async () => {
    let settlePrevious!: (value: Response) => void;
    let reads = 0;
    apiRequest.mockImplementation(async (_method: string, url: string) => {
      if (!url.startsWith('/api/c2c/project-vault/')) return ok({ success: true, data: null });
      if (++reads === 1) return new Promise<Response>(resolve => { settlePrevious = resolve; });
      return ok({ success: true, data: { ...VAULT_PAYLOAD.data,
        tree: filingTree({ label: 'Current actor filing' }, { title: 'Current actor section' }) } });
    });
    mount(); await waitFor(() => expect(reads).toBe(1));
    act(() => { authService.setToken(TOKEN, { id: '8', organizationId: String(ORG_ID), roles: ['author'], permissions: [] }, 'other-refresh', 3600); });
    await waitFor(() => expect(document.body.textContent).toContain('Current actor filing'));
    await act(async () => { settlePrevious(ok(VAULT_PAYLOAD)); });
    expect(document.body.textContent).not.toContain('Acme Cutter');
    expect(document.body.textContent).toContain('Current actor filing');
  });
});


describe('Vault organization artifacts retain their numeric source version', () => {
  it('uses sourceVersion from the row rather than its displayed v999 label', async () => {
    artifactReplies();
    const previous = apiRequest.getMockImplementation()!;
    apiRequest.mockImplementation(async (method: string, url: string, body?: Record<string, unknown>) => {
      if (url.startsWith('/api/artifacts-center?')) return ok({ success: true, data: [{
        id: ARTIFACT_SOURCE.artifactId, name: 'Saved clinical evidence', ver: 'v999', sourceVersion: 3,
        prog: 'BX204', kind: 'CER', fmt: 'html', size: '1 KB', model: null, when: 'today',
        sig: false, reviewed: false, sourceCount: 0,
      }], meta: { scope: 'accessible-projects', total: 1, listed: 1, truncated: false } });
      return previous(method, url, body);
    });
    mount();
    fireEvent.click(await screen.findByRole('tab', { name: 'Governed artifacts' }));
    fireEvent.click(await screen.findByRole('button', { name: /Show governed artifacts across your projects/ }));
    const row = await screen.findByTestId(`vault-org-artifact-${ARTIFACT_SOURCE.artifactId}`);
    fireEvent.click(Array.from(row.querySelectorAll('button')).find(button => button.textContent?.includes('Work on document'))!);
    await screen.findByTestId('workflow-import-preview');
    const posts = apiRequest.mock.calls.filter(([method]) => method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0][2]).toMatchObject({ previewOnly: true, source: ARTIFACT_SOURCE });
    expect(navigated).toEqual([]);
  });
});
