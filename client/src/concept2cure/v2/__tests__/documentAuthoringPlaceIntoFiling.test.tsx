// @vitest-environment jsdom
/**
 * AuthoringPlaceIntoFiling — slice 7: the authoring → filing seam.
 *
 * Follows the submissionCenterGovernedWorkspaces / authoringFilingBar idioms
 * (apiRequest mocked at the module boundary; REAL, distinctive payloads so
 * anything rendered proves the response was adopted, not a constant).
 *
 * Pins:
 *   • the dialog states the IDENTITY FACT honestly — an authoring document is
 *     uuid-keyed and cannot be referenced by a leaf, so placement is a stated
 *     snapshot derivation, never a silent one;
 *   • target picking is real: opening loads GET /api/submissions, choosing a
 *     submission loads ITS /sequences URL; frozen/dispatched sequences are
 *     excluded from selection WITH the reason shown;
 *   • the placement chain runs in order — fresh GET of the SAVED sections →
 *     POST /api/coauthor/documents (the snapshot, assembled in the canonical
 *     bridge's format) → PUT /sequences/:seqId/leaves pointing at the snapshot
 *     — and the PUT payload carries documentTable 'coauthor_documents' + the
 *     server-issued snapshot id;
 *   • a refused PUT surfaces the server's verdict VERBATIM and says the
 *     snapshot exists but nothing was placed — success is never claimed;
 *   • the honest no-content state: a document with no saved section content is
 *     refused BEFORE anything is written (no POST, no PUT);
 *   • unsaved changes block placement with the reason (the snapshot is taken
 *     from saved content only);
 *   • success reports the placement (sequence + section + leaf id) and the
 *     deep-link navigates to the Submission Center.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import {
  AuthoringPlaceIntoFiling,
  IDENTITY_STATEMENT,
  assembleSnapshot,
} from '../surfaces/AuthoringPlaceIntoFiling';

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
}

afterEach(cleanup);
beforeEach(() => apiRequest.mockReset());

describe('the dialog states the identity fact and picks real targets', () => {
  it('renders the honest derivation statement — never a silent identity swap', async () => {
    mockApi();
    renderSeam();
    fireEvent.click(screen.getByRole('button', { name: /Place into filing/ }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(document.body.textContent).toContain(IDENTITY_STATEMENT);
    // The section code is prefilled from the open section, editable.
    expect((screen.getByLabelText(/Section code/) as HTMLInputElement).value).toBe('2.7.3');
  });

  it('loads the org submissions on open and the chosen submission’s sequences', async () => {
    mockApi();
    renderSeam();
    await openAndTarget();
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions');
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/submissions/9/sequences');
  });

  it('excludes frozen sequences from selection WITH the reason shown', async () => {
    mockApi();
    renderSeam();
    await openAndTarget();
    const frozenOption = screen.getByRole('option', { name: /0001 · amendment/ }) as HTMLOptionElement;
    expect(frozenOption.disabled).toBe(true);
    expect(frozenOption.textContent).toContain('leaves immutable');
    // The reason is stated in prose too, not only encoded in a disabled control.
    expect(document.body.textContent).toContain(
      'a frozen or dispatched sequence’s leaves are immutable',
    );
    // The default selection lands on the first NON-locked sequence.
    expect((screen.getByLabelText('Sequence') as HTMLSelectElement).value).toBe('31');
  });

  it('reports a failed submissions read honestly — no target to place into', async () => {
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/submissions') {
        return { ok: false, status: 503, json: async () => ({ error: { code: 'OVERLOADED' } }) };
      }
      return undefined;
    });
    renderSeam();
    fireEvent.click(screen.getByRole('button', { name: /Place into filing/ }));
    await waitFor(() =>
      expect(document.body.textContent).toContain('Couldn’t load the submissions'),
    );
    expect(document.body.textContent).toContain('There is no target to place into');
  });
});

describe('the placement chain — snapshot then leaf, verdict verbatim', () => {
  it('places via GET saved sections → POST snapshot → PUT leaves with the snapshot id', async () => {
    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    mockApi((method, url, body) => {
      if (method === 'POST' && String(url).split('?')[0] === '/api/coauthor/documents') {
        calls.push({ method, url, body });
        return { ok: true, status: 201, json: async () => ({ success: true, document: { id: 501 } }) };
      }
      if (method === 'PUT' && url === '/api/submissions/sequences/31/leaves') {
        calls.push({ method, url, body });
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: 77, sectionCode: '2.7.3', title: 'M2.7 Clinical Summary', lifecycleOp: 'new' }),
        };
      }
      return undefined;
    });
    const { onNav, fireToast } = renderSeam();
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));

    await waitFor(() => expect(document.body.textContent).toContain('server-confirmed (leaf #77'));

    // Chain order: snapshot first, then the canonical PUT — never the reverse.
    expect(calls.map((c) => c.url)).toEqual([
      '/api/coauthor/documents',
      '/api/submissions/sequences/31/leaves',
    ]);
    // The snapshot carries the SAVED sections in the canonical bridge's format.
    expect(calls[0].body).toMatchObject({ title: 'M2.7 Clinical Summary', moduleNumber: '2.7.3' });
    const content = (calls[0].body as { content: string }).content;
    expect(content).toContain('## 2.7.3 — Summary of Clinical Efficacy');
    expect(content).toContain('ORR 38.6% in the pivotal cohort.');
    expect(content).toContain('## 2.7.4 — Summary of Clinical Safety');
    // The canonical write: the leaf points at the snapshot in the renderable store.
    expect(calls[1].body).toEqual({
      sectionCode: '2.7.3',
      title: 'M2.7 Clinical Summary',
      lifecycleOp: 'new',
      documentTable: 'coauthor_documents',
      documentId: 501,
    });
    // The SAVED sections were re-read from the server for the snapshot.
    expect(apiRequest).toHaveBeenCalledWith('GET', '/api/authoring/docs/D1/sections');
    // Success reports the placement and deep-links to the Submission Center.
    expect(document.body.textContent).toContain('sequence 0000 · original');
    expect(document.body.textContent).toContain('from Authored document #501');
    // The relation name itself must never reach the screen (guardrail 3).
    expect(document.body.textContent).not.toContain('coauthor_documents');
    expect(fireToast).toHaveBeenCalledWith(expect.stringContaining('leaf 2.7.3 in sequence 0000'));
    fireEvent.click(screen.getByRole('button', { name: /Open in Submission Center/ }));
    expect(onNav).toHaveBeenCalledWith('submission-center');
  });

  it('a refused PUT surfaces the server verdict verbatim and never claims a placement', async () => {
    let putCalls = 0;
    mockApi((method, url) => {
      if (method === 'POST' && String(url).split('?')[0] === '/api/coauthor/documents') {
        return { ok: true, status: 201, json: async () => ({ success: true, document: { id: 502 } }) };
      }
      if (method === 'PUT' && url === '/api/submissions/sequences/31/leaves') {
        putCalls += 1;
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: { code: 'INVALID_STATE', message: 'Sequence is frozen; its leaves are immutable.' },
          }),
        };
      }
      return undefined;
    });
    const { fireToast } = renderSeam();
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));

    await waitFor(() =>
      expect(document.body.textContent).toContain('Sequence is frozen; its leaves are immutable.'),
    );
    expect(putCalls).toBe(1);
    // The partial state is stated, not hidden: the snapshot exists, the leaf does not.
    expect(document.body.textContent).toContain('The filing copy was created (Authored document #502)');
    expect(document.body.textContent).not.toContain('coauthor_documents');
    expect(document.body.textContent).toContain('nothing was placed in the sequence');
    expect(document.body.textContent).not.toContain('server-confirmed (leaf');
    expect(fireToast).not.toHaveBeenCalled();
  });

  it('a failed snapshot POST stops the chain — the leaves endpoint is never called', async () => {
    let putCalls = 0;
    mockApi((method, url) => {
      if (method === 'POST' && String(url).split('?')[0] === '/api/coauthor/documents') {
        return { ok: false, status: 500, json: async () => ({ error: 'Failed to create document' }) };
      }
      if (method === 'PUT' && url === '/api/submissions/sequences/31/leaves') {
        putCalls += 1;
        return { ok: true, status: 200, json: async () => ({ id: 1 }) };
      }
      return undefined;
    });
    renderSeam();
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() =>
      expect(document.body.textContent).toContain('The filing snapshot could not be created'),
    );
    expect(document.body.textContent).toContain('Nothing was placed');
    expect(putCalls).toBe(0);
  });

  it('refuses an empty document honestly — nothing is written at all', async () => {
    const writes: string[] = [];
    mockApi((method, url) => {
      if (method === 'GET' && url === '/api/authoring/docs/D1/sections') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, sections: [{ code: '2.7.3', title: 'Efficacy', content: '' }] }),
        };
      }
      if (method !== 'GET') {
        writes.push(`${method} ${url}`);
        return { ok: true, status: 200, json: async () => ({}) };
      }
      return undefined;
    });
    renderSeam();
    await openAndTarget();
    fireEvent.click(screen.getByRole('button', { name: /Place leaf/ }));
    await waitFor(() =>
      expect(document.body.textContent).toContain(
        'This document has no saved section content yet — there is nothing to file.',
      ),
    );
    expect(writes).toEqual([]);
  });

  it('blocks placement while the section has unsaved changes, with the reason', async () => {
    mockApi();
    renderSeam({ dirty: true });
    await openAndTarget();
    const place = screen.getByRole('button', { name: /Place leaf/ }) as HTMLButtonElement;
    expect(place.disabled).toBe(true);
    expect(document.body.textContent).toContain(
      'Placement snapshots the SAVED document',
    );
  });
});

describe('assembleSnapshot mirrors the canonical bridge format', () => {
  it('renders "## code — title" headings and skips nothing silently', () => {
    const out = assembleSnapshot([
      { code: '1.1', title: 'Cover', content: 'Dear reviewer.' },
      { code: null, title: null, content: 'Loose text.' },
    ]);
    expect(out).toBe('## 1.1 — Cover\n\nDear reviewer.\n\nLoose text.');
  });
  it('keeps bare headings for content-free sections — which is why the component refuses on section content, not on the assembled string', () => {
    expect(assembleSnapshot([{ code: '1.1', title: 'Cover', content: '' }])).toBe('## 1.1 — Cover');
  });
});
