/** Shared fixture data and UI actions for the one actual Workbench assembly host. */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, vi, type Mock } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { AssemblyPlan, AssemblyPreviewInput } from '@shared/authoring/assembly';
import { DocumentWorkbench, type DocumentWorkbenchProps } from '../DocumentWorkbench';

export const PID = 'bbbbbbbb-0000-4000-8000-000000000181';
export const DOC = 'dddddddd-0000-4000-8000-000000000181';
export const SEC = 'aaaaaaaa-0000-4000-8000-000000000181';
export const SECOND = 'aaaaaaaa-0000-4000-8000-000000000182';
export const THIRD = 'aaaaaaaa-0000-4000-8000-000000000183';
export const TEMPLATE = 'cccccccc-0000-4000-8000-000000000181';
export const OTHER = 'bbbbbbbb-0000-4000-8000-000000000182';
export const SECTIONS_READ = `/api/authoring/docs/${DOC}/sections?programId=${PID}`;
export const AT = '2026-10-17T20:00:00Z';
export const doc = { id: DOC, title: 'Assembly working document', module: 'M3', product_code: null,
  section_count: 1, status: 'DRAFT', updated_at: AT, client_program_id: PID };
export const section = { id: SEC, doc_id: DOC, code: '3.2.P.8.1', title: 'Existing stability summary',
  content: '<p>Existing saved stability evidence.</p>', order_index: 7, updated_at: AT };
export const emptySection = { id: SECOND, doc_id: DOC, code: '3.2.P.8.2', title: 'Post-approval stability protocol',
  content: '', order_index: 8, updated_at: AT };
export const thirdSection = { ...emptySection, id: THIRD, code: '3.2.P.8.3', title: 'Stability data', order_index: 9 };
export const template = { id: TEMPLATE, name: 'Organization stability assembly', module: 'M3' };
export function plan(input: AssemblyPreviewInput): AssemblyPlan {
  const all = [section, emptySection, thirdSection];
  const selection = input.selection;
  const selected = selection.target === 'document' ? all : all.filter(row => row.code === selection.code);
  return { version: 1, docId: DOC, programId: PID, templateId: TEMPLATE, selection: input.selection,
    targetSnapshot: 'target-snapshot', templateSnapshot: 'template-snapshot', fingerprint: 'fingerprint-181',
    templateName: template.name, draftRegion: 'FDA', limitations: ['Working text requires human review.'], gaps: [],
    rows: selected.map(row => ({ code: row.code, title: row.title, content: row.content, ordering: row.order_index,
      disposition: row.id === SEC ? 'preserve' : 'append', ...(row.id === SEC ? { existingSectionId: SEC } : {}),
      aiDraftable: true, aiDraftableReason: 'Text drafting is permitted.', gaps: row.content ? [] : ['Scientific content is missing.'] })) };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
export const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const user = (id = '181', organizationId = '18') => ({ id, organizationId, organizationName: null,
  email: 'assembly@example.test', firstName: 'Synthetic', lastName: 'Author', displayName: 'Synthetic author',
  roles: ['author'], permissions: [], mfaEnabled: false, mfaMethods: [], mustChangePassword: false });
export const bearer = (userId = '181', organizationId = '18', visit = 'original') =>
  `fixture.${btoa(JSON.stringify({ userId: Number(userId), organizationId: Number(organizationId), visit }))}.synthetic`;
export function editorNode() { return document.querySelector('.tiptap') as HTMLElement & { editor: Editor }; }
export async function mounted(overrides: Partial<DocumentWorkbenchProps> = {}) {
  const props: DocumentWorkbenchProps = { docs: [doc], docsState: 'ready', status: 'all',
    programId: PID, onNav: vi.fn(), reloadDocs: vi.fn(async () => undefined), ...overrides };
  const view = render(React.createElement(DocumentWorkbench, props));
  await waitFor(() => expect(editorNode()?.textContent).toContain('Existing saved stability evidence.'));
  return { props, ...view };
}
export function localEdit() { act(() => { editorNode().editor.commands.insertContent('Unsaved local work. '); }); }

export function assemblyUi(apiRequest: Mock) {
  function aiCalls() { return apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && String(url).includes('/ai/draft')); }
  function assemblyCalls(stage: 'preview' | 'commit') { return apiRequest.mock.calls.filter(([method, url]) => method === 'POST' && String(url).endsWith(`/assembly/${stage}`)); }
  async function previewBuild(targetCode?: string, withAna = false) {
    fireEvent.click(screen.getByText('Build document or section'));
    const templateInput = await screen.findByLabelText('Template');
    await waitFor(() => expect((templateInput as HTMLSelectElement).options.length).toBeGreaterThan(1));
    fireEvent.change(templateInput, { target: { value: TEMPLATE } });
    await waitFor(() => expect(assemblyCalls('preview')).toHaveLength(1));
    await screen.findByRole('option', { name: `${emptySection.code} ${emptySection.title}` });
    if (targetCode) fireEvent.change(screen.getByLabelText('Build target'), { target: { value: targetCode } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview build' }));
    await waitFor(() => expect(assemblyCalls('preview')).toHaveLength(2));
    fireEvent.change(screen.getByLabelText('Reason for build'), { target: { value: 'Assemble the selected saved template sections.' } });
    if (withAna) fireEvent.click(screen.getByLabelText('Draft empty eligible sections with AnA'));
    const build = screen.getByRole('button', { name: targetCode ? 'Build section' : 'Build document' }) as HTMLButtonElement;
    await waitFor(() => expect(build.disabled).toBe(false));
    return build;
  }
  async function buildDocument(withAna = false) {
    const build = await previewBuild(undefined, withAna);
    fireEvent.click(build);
    await waitFor(() => expect(assemblyCalls('commit')).toHaveLength(1));
  }
  return { aiCalls, assemblyCalls, previewBuild, buildDocument };
}
