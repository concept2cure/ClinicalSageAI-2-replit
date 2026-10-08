// @vitest-environment jsdom
/**
 * Place into filing files a whole document at the document's own code, and a
 * repeat placement says what it is (QA 2026-10-08, browser walk j4-authoring,
 * docs/evidence/QA-2026-10-08/authoring/). The harness is the one
 * documentAuthoringPlaceIntoFiling.test.tsx uses.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { AuthoringPlaceIntoFiling } from '../surfaces/AuthoringPlaceIntoFiling';

const SUBS = [
  {
    id: 9,
    title: 'ZX-9 First-in-Human',
    applicationType: 'ind',
    primaryRegion: 'fda',
    status: 'active',
  },
];

const SEQS = [
  { id: 31, sequenceNumber: '0000', type: 'original', status: 'draft', region: 'fda' },
  { id: 32, sequenceNumber: '0001', type: 'amendment', status: 'frozen', region: 'fda' },
];

const SECTIONS = {
  success: true,
  sections: [
    { code: '2.7.3', title: 'Summary of Clinical Efficacy', content: 'ORR 38.6% in the pivotal cohort.' },
    { code: '2.7.4', title: 'Summary of Clinical Safety', content: 'No grade 4 events attributed.' },
  ],
};

type Handler = (method: string, url: string, body?: unknown) => Partial<Response> | undefined;

function mockApi(extra: Handler = () => undefined) {
  apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
    const hit = extra(method, url, body);
    if (hit) return hit as Response;
    if (method === 'GET' && url === '/api/submissions') {
      return { ok: true, status: 200, json: async () => SUBS } as Response;
    }
    if (method === 'GET' && url === '/api/submissions/9/sequences') {
      return { ok: true, status: 200, json: async () => SEQS } as Response;
    }
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') {
      return { ok: true, status: 200, json: async () => SECTIONS } as Response;
    }
    return { ok: true, status: 200, json: async () => [] } as Response;
  });
}

function renderSeam(overrides: Partial<React.ComponentProps<typeof AuthoringPlaceIntoFiling>> = {}) {
  const onNav = vi.fn();
  const fireToast = vi.fn();
  render(
    <AuthoringPlaceIntoFiling
      docId="D1"
      docTitle="M2.7 Clinical Summary"
      activeSectionCode="2.7.3"
      dirty={false}
      onNav={onNav}
      fireToast={fireToast}
      {...overrides}
    />,
  );
  return { onNav, fireToast };
}

/** Open the dialog and pick submission 9 → sequence 0000 (id 31). */
async function openAndTarget() {
  fireEvent.click(screen.getByRole('button', { name: /Place into filing/ }));
  await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
  fireEvent.change(screen.getByLabelText('Target submission'), { target: { value: '9' } });
  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions/9/sequences'));
  await waitFor(() => expect(document.body.textContent).toContain('0000'));
  fireEvent.change(screen.getByLabelText(/^Reason for this placement/), { target: { value: REASON } });
}

const REASON = 'Clinical summary approved for sequence 0000';

afterEach(() => { cleanup(); delete (window as unknown as { C2C_PROJECT?: unknown }).C2C_PROJECT; });
beforeEach(() => apiRequest.mockReset());

/* QA 2026-10-08 (browser walk j4-authoring, docs/evidence/QA-2026-10-08/authoring/).
   Placement files the WHOLE saved document as one leaf — the server's snapshot
   rule takes the copy's text from the source document (services/coauthor/
   coauthor-snapshot.ts: "a source's copy IS the source"). The dialog prefilled
   the OPEN section's code, so a Clinical Overview placed at 2.5.1 filed 2.5.2 …
   2.5.8 inside the 2.5.1 leaf. And a second placement of the same document,
   which the server now answers with the existing leaf, read as a new placement. */
describe('a whole document is filed at its own code, and a repeat placement says so', () => {
  const CODES = ['2.7.3', '2.7.4'];

  it('prefills the document’s own code — the parent of its sections — not the open section’s', async () => {
    mockApi();
    renderSeam({ sectionCodes: CODES });
    fireEvent.click(screen.getByRole('button', { name: /Place into filing/ }));
    await waitFor(() => expect(document.body.textContent).toContain('ZX-9 First-in-Human'));
    expect((screen.getByLabelText(/Section code/) as HTMLInputElement).value).toBe('2.7');
    expect(document.body.textContent).toMatch(/whole saved document \(2 sections\)/);
  });

  it('refuses one of the document’s own section codes — the leaf would hold the other sections too — and writes nothing', async () => {
    mockApi();
    renderSeam({ sectionCodes: CODES });
    await openAndTarget();
    fireEvent.change(screen.getByLabelText(/Section code/), { target: { value: '2.7.3' } });
    expect(document.body.textContent).toMatch(/2\.7\.3 is one section of this document/);
    expect(document.body.textContent).toContain('2.7');
    const place = screen.getByRole('button', { name: /Place leaf/ }) as HTMLButtonElement;
    expect(place.disabled).toBe(true);
    fireEvent.click(place);
    expect(apiRequest.mock.calls.filter(c => c[0] !== 'GET')).toHaveLength(0);
  });

  it('a one-section document is filed at that section’s code', async () => {
    mockApi();
    renderSeam({ sectionCodes: ['3.2.S.4.1'], activeSectionCode: '3.2.S.4.1' });
    await openAndTarget();
    expect((screen.getByLabelText(/Section code/) as HTMLInputElement).value).toBe('3.2.S.4.1');
    expect(document.body.textContent).not.toMatch(/one section of this document/);
  });

  it('a repeat placement the server answers with the existing leaf is reported as already placed, not as a new leaf', async () => {
    mockApi((method, url) => {
      if (method === 'POST' && String(url).split('?')[0] === '/api/coauthor/documents') {
        return { ok: true, status: 200, json: async () => ({ success: true, replaced: true, document: { id: 52, metadata: { source: 'authoring-document', docId: 'D1' } } }) };
      }
      if (method === 'PUT' && url === '/api/submissions/sequences/31/leaves') {
        return { ok: true, status: 200, json: async () => ({ id: 58, sequenceId: 31, documentTable: 'coauthor_documents', documentId: 52, auditTrail: null, unchanged: true, sectionCode: '2.7', title: 'M2.7 Clinical Summary', lifecycleOp: 'new' }) };
      }
      return undefined;
    });
    const { fireToast } = renderSeam({ sectionCodes: CODES });
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() => expect(document.body.textContent).toMatch(/already placed/i));
    expect(document.body.textContent).toContain('leaf #58');
    expect(document.body.textContent).not.toMatch(/Placed as leaf/);
    expect(fireToast).toHaveBeenCalledWith(expect.stringMatching(/already placed/i));
  });
});

/* QA 2026-10-08, walk 2 (j4 blocker). After the document was edited, Place
   rewrote the filing copy leaf #81 files, and the dialog said "Already placed …
   Nothing was written". The server now refuses a re-take over a copy a leaf
   files (409 FILING_COPY_PINNED) and says whether a re-take wrote the copy at
   all (`written`); the dialog shows exactly that. */
describe('a re-placement says exactly what was written', () => {
  const CODES = ['2.7.3', '2.7.4'];
  const PINNED =
    'This document is already filed: leaf #58 at 2.7 in sequence 0000 (draft) holds its filing copy (Authored document #52), ' +
    'as the document was when it was placed. The document has changed since it was placed, and a filed copy is never rewritten. ' +
    'Nothing was written. To file the document as it is now, remove that leaf in Submission Center, then place the document again.';

  const leafUnchanged = { ok: true, status: 200, json: async () => ({ id: 58, sequenceId: 31, documentTable: 'coauthor_documents', documentId: 52, auditTrail: null, unchanged: true, sectionCode: '2.7', title: 'M2.7 Clinical Summary', lifecycleOp: 'new' }) };

  it('an edited document over a filed copy: the server’s refusal verbatim, and no leaf is requested', async () => {
    let puts = 0;
    mockApi((method, url) => {
      if (method === 'POST' && String(url).split('?')[0] === '/api/coauthor/documents') {
        return { ok: false, status: 409, json: async () => ({ error: 'FILING_COPY_PINNED', code: 'FILING_COPY_PINNED', message: PINNED }) };
      }
      if (method === 'PUT') { puts += 1; return leafUnchanged; }
      return undefined;
    });
    const { fireToast } = renderSeam({ sectionCodes: CODES });
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() => expect(document.body.textContent).toContain(PINNED));
    expect(puts).toBe(0);
    expect(document.body.textContent).not.toMatch(/Already placed|Placed as leaf|could not be created/);
    expect(document.body.textContent).not.toContain('Nothing was placed');
    expect(fireToast).not.toHaveBeenCalled();
  });

  it('an unchanged re-placement says nothing was written', async () => {
    mockApi((method, url) => {
      if (method === 'POST' && String(url).split('?')[0] === '/api/coauthor/documents') {
        return { ok: true, status: 200, json: async () => ({ success: true, replaced: true, written: false, document: { id: 52, status: 'draft', metadata: { source: 'authoring-document', docId: 'D1' } } }) };
      }
      if (method === 'PUT' && url === '/api/submissions/sequences/31/leaves') return leafUnchanged;
      return undefined;
    });
    renderSeam({ sectionCodes: CODES });
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Already placed: leaf #58/));
    expect(document.body.textContent).toContain('Nothing was written.');
  });

  it('a re-placement that promoted the copy’s status says so, and never says nothing was written', async () => {
    mockApi((method, url) => {
      if (method === 'POST' && String(url).split('?')[0] === '/api/coauthor/documents') {
        return { ok: true, status: 200, json: async () => ({ success: true, replaced: true, written: true, document: { id: 52, status: 'approved', metadata: { source: 'authoring-document', docId: 'D1' } } }) };
      }
      if (method === 'PUT' && url === '/api/submissions/sequences/31/leaves') return leafUnchanged;
      return undefined;
    });
    const { fireToast } = renderSeam({ sectionCodes: CODES });
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() => expect(document.body.textContent).toMatch(/Already placed: leaf #58/));
    expect(document.body.textContent).toMatch(/now carries the document’s current status \(approved\)/);
    expect(document.body.textContent).not.toContain('Nothing was written');
    expect(fireToast).not.toHaveBeenCalledWith(expect.stringContaining('Nothing was written'));
  });
});
