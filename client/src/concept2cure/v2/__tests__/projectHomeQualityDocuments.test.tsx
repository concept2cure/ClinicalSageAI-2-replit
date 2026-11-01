// @vitest-environment jsdom
/**
 * Author lists the filing's documents first; the project's quality documents
 * have their own heading below (2026-10-31 client demo).
 *
 * GET /api/authoring/docs?programId= lists every authoring document carrying
 * the project, and a QMS controlled document (an SOP authored in the project)
 * is one: a biotech IND's Author list led with four SOPs. The authoring row
 * does not say a document is controlled; Quality's register does, by
 * `authoring_document_id`. A register that cannot be read leaves one list and
 * says so; it never hides a document.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { seedCompanySession, endCompanySession } from './_company-session-fixture';

const h = vi.hoisted(() => ({ request: vi.fn(), available: true, registerFails: false }));
vi.mock('@/lib/queryClient', async original => ({ ...(await original<typeof import('@/lib/queryClient')>()), apiRequest: h.request }));
vi.mock('@/services/portal/authService', async original => {
  const actual = await original<typeof import('@/services/portal/authService')>();
  return { ...actual, useAuth: () => ({ user: actual.authService.getUser() }), useAuthUser: () => actual.authService.getUser() };
});
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ currentOrganization: null, currentClientWorkspace: null }) }));
vi.mock('../surfaceAvailable', () => ({ useSurfaceAvailable: () => (id: string) => id !== 'quality' || h.available }));

import { ProjectHome } from '../surfaces/ProjectHome';
import { clearShellProject, publishShellProject } from '../shellProject';
import { clearNavParams } from '../navParams';
import { __resetSurfaceActionBus } from '../surfaceActions';

const A = '11111111-1111-4111-8111-111111111111';
const SOP = 'b2e049de-e7d9-4a61-8f90-ecf578ba00c2';
const IB = '894b440a-6553-4ea2-9b70-cbff987452c8';
const props = { surface: { id: 'project-home', label: 'Project home' } as never, segment: 'biotech', onAsk: vi.fn(), onNav: vi.fn() };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
const DOCS = [
  { id: SOP, title: 'SOP-001 Document Control', status: 'draft', updated_at: '2026-10-31T01:54:00Z' },
  { id: IB, title: 'IB Summary of Data and Guidance for the Investigator', module: 'M1', status: 'draft', updated_at: '2026-10-31T01:43:00Z' },
];

beforeEach(() => {
  seedCompanySession({ organizationId: '7' }); h.available = true; h.registerFails = false;
  clearNavParams(); __resetSurfaceActionBus(); clearShellProject(); publishShellProject({ id: A, title: 'C2C-101 IND', step: 'author' });
  h.request.mockReset().mockImplementation(async (_method: string, path: string) => {
    if (path === `/api/c2c/projects/${A}`) return json({ id: A, name: 'C2C-101 IND', program_type: 'IND', product_type: 'biologic', primary_agency: 'FDA', status: 'active' });
    if (path === `/api/mdx/qms/documents?program_id=${A}`) {
      if (h.registerFails) throw new Error('The quality service did not answer.');
      return json({ data: [{ id: 1, doc_number: 'C2C-SOP-001', title: 'SOP-001 Document Control', status: 'draft', authoring_document_id: SOP }], meta: {} });
    }
    if (path.startsWith('/api/authoring/docs')) return json({ documents: DOCS });
    if (path.startsWith('/api/chat/threads')) return json({ threads: [] });
    return json({});
  });
});
afterEach(() => { cleanup(); endCompanySession(); clearShellProject(); clearNavParams(); __resetSurfaceActionBus(); });

const titles = (list: HTMLElement) => Array.from(list.querySelectorAll('.cdl-row-t')).map((n) => n.textContent);

describe('Author: the filing’s documents, then the quality documents', () => {
  it('lists the controlled SOP under Quality documents, below the filing’s documents', async () => {
    render(<ProjectHome {...props} />);
    const filing = await screen.findByRole('list', { name: 'This project’s documents' });
    expect(titles(filing)).toEqual(['IB Summary of Data and Guidance for the Investigator']);
    const quality = screen.getByTestId('pj-quality-documents');
    expect(within(quality).getByRole('heading', { name: /Quality documents/ })).toBeTruthy();
    expect(titles(quality)).toEqual(['SOP-001 Document Control']);
    expect(filing.compareDocumentPosition(quality) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('a register it cannot read leaves one list, and says why', async () => {
    h.registerFails = true;
    render(<ProjectHome {...props} />);
    const filing = await screen.findByRole('list', { name: 'This project’s documents' });
    await waitFor(() => expect(titles(filing)).toEqual(['SOP-001 Document Control', 'IB Summary of Data and Guidance for the Investigator']));
    expect(screen.getByTestId('pj-quality-documents-unread').textContent).toMatch(/quality document register could not be read/);
    expect(screen.queryByTestId('pj-quality-documents')).toBeNull();
  });

  it('where Quality is not in this release, the register is not read and the list is the filing’s', async () => {
    h.available = false;
    render(<ProjectHome {...props} />);
    const filing = await screen.findByRole('list', { name: 'This project’s documents' });
    expect(titles(filing)).toHaveLength(2);
    expect(h.request.mock.calls.some(([, path]) => String(path).startsWith('/api/mdx/qms/documents'))).toBe(false);
  });
});
