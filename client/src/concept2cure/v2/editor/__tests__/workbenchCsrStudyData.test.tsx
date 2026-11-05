// @vitest-environment jsdom
/**
 * One CSR type (D2-CSR F1, 2026-11-05; docs/evidence/D2-CSR/2026-11-05-one-csr-type/).
 *
 * New document listed the CSR twice, as `component:clinical_study_report` and `registry:ICH_CSR`, and the
 * editor showed "Build from the study's data" only for the first. The list now offers the component once
 * (builtin-authoring-templates.ts), but CSRs already made from the registry entry, or from the IND library's
 * 5.3.5.1/5.3.5.2 report templates, are CSRs to the scientific review (shared CSR_TEMPLATE_IDS), which asks
 * for the study data frozen here. So the editor recognises a CSR by the same stored template id.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest }));
vi.mock('@/services/portal/authService', async original => {
  const canonical = await original<typeof import('@/services/portal/authService')>();
  return { ...canonical,
    useAuth: () => ({ user: { displayName: 'Author', email: 'author@example.test' } }),
    authService: { getUser: vi.fn().mockReturnValue({ id: 41 }),
      captureSessionReadGuard: canonical.authService.captureSessionReadGuard.bind(canonical.authService),
      on: canonical.authService.on.bind(canonical.authService) },
  };
});
vi.mock('../../surfaces/AuthoringCollab', () => ({ AuthoringCollab: () => null }));
vi.mock('../../surfaces/AuthoringFilingBar', () => ({ AuthoringFilingBar: () => null }));
vi.mock('../../surfaces/AuthoringCreateExport', () => ({ AuthoringCreateExport: () => null }));
vi.mock('../../surfaces/AuthoringPlaceIntoFiling', () => ({ AuthoringPlaceIntoFiling: () => null }));
// The build itself is StudyDataBuild's own suite; here only whether the editor mounts it, and for which document.
vi.mock('../StudyDataBuild', async original => ({
  ...(await original<typeof import('../StudyDataBuild')>()),
  StudyDataBuild: ({ documentId, onDocumentChanged }: { documentId: string; onDocumentChanged?: () => void }) => (
    <section aria-label="Build from the study’s data">{documentId}
      <button type="button" aria-label="Approved sections imported" onClick={onDocumentChanged} /></section>),
}));
import { DocumentCanvas } from '../DocumentCanvas';
import { clearEditorTarget } from '../../editorTarget';

const DOC = 'dddddddd-0000-4000-8000-000000000105';
const SEC = 'aaaaaaaa-0000-4000-8000-000000000105';
const PID = 'bbbbbbbb-0000-4000-8000-000000000105';
const AT = '2026-11-05T10:00:00Z';
const LIMITS = ['Working scaffold, not an approval, verified evidence or a filing-readiness decision.'];
const GLOBAL_ICH = { region: 'GLOBAL', agency: 'ICH' };
/** Each built-in template a saved CSR can carry, by the id and entry recorded when it was made. */
const CSR_SOURCES = {
  'registry:ICH_CSR': { id: '5d888ae5-4216-594e-bc5e-9c8bc22f9527', filingContext: { registryId: 'ICH_CSR', ...GLOBAL_ICH } },
  'component:clinical_study_report': { id: '4331e7e3-7777-5c21-8c9b-0e2f56194e7e', filingContext: { registryId: null, ...GLOBAL_ICH } },
  'section:m5.3.5.1': { id: 'f7e72f59-71ed-5cf6-96bf-d8edea20cb84' },
  'section:m5.3.5.2': { id: 'ba5f51bc-7257-50c9-a79f-66fc30e53d68' },
} as const;
const NOT_CSR = { entryId: 'section:m1.1.1', id: 'f05db0b5-caa8-5df2-8b44-33b8d905013a' };

function recorded(entryId: string, identity: { id: string; filingContext?: Record<string, unknown> }) {
  return { ...identity, entryId, version: 1, sha256: 'a'.repeat(64), kind: 'narrative', aiDraftable: true,
    authoringMode: 'ai_draft', originalFormat: 'mixed', limitations: LIMITS };
}
const ok = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
for (const prototype of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<Record<string, unknown>>) {
  prototype.getClientRects ??= () => [];
  prototype.getBoundingClientRect ??= () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 });
}

let sectionText = '<p>The study report title page.</p>';
let sectionAt = AT;
function serve(templateSource: ReturnType<typeof recorded>) {
  const doc = { id: DOC, title: 'Renamed study report', module: 'M5', status: 'DRAFT', updated_at: AT, section_count: 1,
    template_id: templateSource.id, provenance: { source: 'template', governedWrite: 'unverified', templateSource } };
  const section = () => ({ id: SEC, doc_id: DOC, code: '1', title: 'Title Page', content: sectionText,
    order_index: 0, updated_at: sectionAt });
  apiRequest.mockImplementation(async (_method: string, url: string) => {
    if (url.startsWith('/api/authoring/docs?')) return ok({ documents: [doc] });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}`) return ok({ document: doc });
    if (url.split('?')[0] === `/api/authoring/docs/${DOC}/sections`) return ok({ sections: [section()] });
    if (url.startsWith('/api/authoring/guidance/')) return ok({ template_guidance: [] });
    if (url.includes('/sources')) return ok({ sources: [] });
    if (url.startsWith('/api/c2c/documents/')) return ok({}, 404);
    return ok({ success: true });
  });
}
async function opened() {
  render(<DocumentCanvas docId={DOC} programId={PID} conversationId={null} expanded fromThisConversation={false}
    onExpandedChange={vi.fn()} onNav={vi.fn()} onAsk={vi.fn()} fireToast={vi.fn()} />);
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('title page'));
  // The recorded template has been read: the provenance line comes from the same metadata read as the CSR test.
  await screen.findByTestId('doc-provenance');
}

beforeEach(() => {
  sectionText = '<p>The study report title page.</p>';
  sectionAt = AT;
  localStorage.clear();
  window.C2C_PROJECT = { id: PID } as typeof window.C2C_PROJECT;
  apiRequest.mockReset();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
});
afterEach(() => {
  cleanup(); localStorage.clear(); vi.unstubAllGlobals(); clearEditorTarget();
  delete window.C2C_PROJECT;
});

describe('a CSR document shows "Build from the study’s data", whichever CSR template it was made from', () => {
  it.each(Object.entries(CSR_SOURCES))('%s', async (entryId, identity) => {
    serve(recorded(entryId, identity));
    await opened();
    expect((await screen.findByRole('region', { name: 'Build from the study’s data' })).textContent).toBe(DOC);
  });

  it('a document that is not a CSR does not show it', async () => {
    serve(recorded(NOT_CSR.entryId, { id: NOT_CSR.id }));
    await opened();
    expect(screen.queryByRole('region', { name: 'Build from the study’s data' })).toBeNull();
  });
});

/* F6 (2026-11-05): the approved headings are written into this document. The editor reads its sections again
   when the build panel says the import wrote, so the person sees the imported text without reopening it. */
it('after an import into this CSR, the editor shows the imported text', async () => {
  serve(recorded('component:clinical_study_report', CSR_SOURCES['component:clinical_study_report']));
  await opened();
  sectionText = '<p>Imported from CSR build 3, heading approved.</p>';
  sectionAt = '2026-11-05T10:05:00Z';
  (await screen.findByRole('button', { name: 'Approved sections imported' })).click();
  await waitFor(() => expect(document.querySelector('.tiptap')?.textContent).toContain('Imported from CSR build 3'));
});
