// @vitest-environment jsdom
/**
 * eCTD Co-Author — fixture-free contract (GA real-data standard).
 *
 * The surface used to render inline fixtures behind a "Sample data" pill: a
 * hardcoded eCTD tree (ECTD_TREE), a fabricated provenance-traced artifact
 * (ECTD_ARTIFACT — masthead + per-paragraph source/model/confidence/audit and
 * invented trial results), a pre-seeded thread reporting a COMPLETED
 * `attach_sources_to_document` tool call that never ran, and client-side
 * validation/compliance stand-ins. All retired.
 *
 * These tests pin the honest states the surface may now render:
 *   • the eCTD backbone tree + artifact from the org's REAL coauthor documents
 *     (GET /api/coauthor/documents), the selected document's real content, and
 *     real validation/compliance from the server routes;
 *   • honest EMPTY (no documents) and honest ERROR / UNAVAILABLE states;
 *   • no SampleTag, no fabricated tool call, no retired fixture string.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));

import { EctdCoauthor } from '../surfaces/EctdCoauthor';

/* jsdom has no layout: ProseMirror's scroll-into-view asks for client rects
   the moment an insert moves the selection. Same shim as
   richSectionEditorUnsaved.test.tsx. */
const emptyRects = function () {
  return [] as unknown as DOMRectList;
};
for (const proto of [Range.prototype, Element.prototype, Text.prototype] as unknown as Array<
  Record<string, unknown>
>) {
  if (typeof proto.getClientRects !== 'function') proto.getClientRects = emptyRects;
  if (typeof proto.getBoundingClientRect !== 'function') {
    proto.getBoundingClientRect = function () {
      return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 } as DOMRect;
    };
  }
}

const onAsk = vi.fn();
const props = () => ({ surface: { id: 'ectd-coauthor', label: 'eCTD' } as any, onAsk, onNav: vi.fn(), segment: 'biopharma' });

const ok = (obj: unknown) => ({ ok: true, status: 200, json: async () => obj } as Response);
const fail = (status: number) => ({ ok: false, status, json: async () => ({ error: 'nope' }) } as Response);

/* A REAL org-scoped documents payload — deliberately NOT the retired fixture,
   so anything rendered proves the response was adopted rather than a codebase
   constant. Route shape is { documents: [...], total, message } and each row
   carries content/status/moduleNumber straight from coauthor_documents. */
const REAL_DOCS = {
  documents: [
    {
      id: 7001,
      title: 'Clinical Overview — ZX-9',
      content: '<h2>2.5.1 Development Rationale</h2><p>ZX-9 is a first-in-class oral agent evaluated in relapsed disease.</p>',
      status: 'review',
      moduleNumber: '2.5',
      moduleName: 'Common Technical Document Summaries',
      updatedAt: '2026-07-20T00:00:00Z',
    },
    {
      id: 7002,
      title: 'Drug Product — ZX-9',
      content: '',
      status: 'draft',
      moduleNumber: '3.2.P',
      moduleName: 'Quality',
      updatedAt: '2026-07-18T00:00:00Z',
    },
    {
      id: 7003,
      title: 'Integrated Summary of Safety',
      content: '<p>ISS narrative for ZX-9.</p>',
      status: 'approved',
      moduleNumber: '5.3',
      moduleName: 'Clinical Study Reports',
      updatedAt: '2026-07-10T00:00:00Z',
    },
  ],
  total: 3,
  message: 'Found 3 document(s)',
};

const EMPTY_DOCS = { documents: [], total: 0, message: 'No co-author documents yet' };

/* REAL server outputs for the two governed checks (route shapes). */
const REAL_VALIDATION = {
  success: true,
  validation: {
    documentId: 7001,
    isValid: false,
    errorCount: 1,
    warningCount: 1,
    totalSections: 4,
    findings: [
      { type: 'missing-section', severity: 'error', module: '2', sectionId: '2.3', message: 'Required eCTD section 2.3 is missing from Module 2 (Common Technical Document Summaries).' },
      { type: 'incomplete-section', severity: 'warning', sectionId: '2.5.5', message: 'Section "Overview of Safety" (2.5.5) has status "pending".' },
    ],
    validatedAt: '2026-07-31T00:00:00Z',
  },
};

const REAL_COMPLIANCE = {
  success: true,
  compliance: {
    documentId: 7001,
    standard: 'ICH M4',
    complianceScore: 83,
    totalChecks: 9,
    compliantCount: 7,
    nonCompliantCount: 2,
    checks: [
      { ruleId: 'M4-004', description: 'Module 2.5 Clinical Overview or Module 2.7 Clinical Summary present', status: 'compliant', module: '2.5' },
      { ruleId: 'M4-006', description: 'Module 3.2.P Drug Product present', status: 'compliant', module: '3.2.P' },
    ],
    checkedAt: '2026-07-31T00:00:00Z',
  },
};

/* Fixture strings that must NEVER appear once the fixtures are gone. */
const RETIRED = [
  'Sample data',
  'Sample artifact',
  'BX-301',
  'anti-BCMA',
  'Relapsed multiple myeloma',
  'Concept2Cure',
  '38.6%',
  'Cytokine release syndrome',
  'attach_sources_to_document',
  'run_validation',
  'Required eCTD section 3.2.P is missing content',
];

/** Read the value cell of the tree-footer KPI whose label matches. */
function footRow(label: string): string {
  const row = Array.from(document.querySelectorAll('.ec-tree-foot-row')).find((el) =>
    (el.querySelector('span')?.textContent || '').includes(label),
  );
  return row?.querySelector('b')?.textContent?.trim() || '';
}

afterEach(cleanup);
beforeEach(() => {
  onAsk.mockReset();
  apiRequest.mockReset();
});

describe('EctdCoauthor — real documents render per panel (no fixture)', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return ok(REAL_DOCS);
      if (method === 'POST' && /\/validate$/.test(url)) return ok(REAL_VALIDATION);
      if (method === 'GET' && /\/compliance$/.test(url)) return ok(REAL_COMPLIANCE);
      return ok({});
    });
  });

  it('renders the REAL eCTD tree + selected document content', async () => {
    render(<EctdCoauthor {...props()} />);

    // Tree leaves are the org's real documents, bucketed into ICH M4 modules.
    expect(await screen.findByText('Drug Product — ZX-9')).toBeTruthy();
    expect(screen.getByText('Integrated Summary of Safety')).toBeTruthy();

    // The artifact renders the active document's real persisted content.
    expect(screen.getByText('ZX-9 is a first-in-class oral agent evaluated in relapsed disease.')).toBeTruthy();

    // No provenance pill and no retired fixture content.
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });

  it('derives tree-footer KPIs from the real rows (not hardcoded)', async () => {
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — ZX-9');

    // 3 real documents; 1 approved (7003); readiness = (1 + 1*0.5)/3 = 50%.
    expect(footRow('Documents')).toBe('3');
    expect(footRow('Approved')).toBe('1');
    expect(footRow('Status roll-up')).toBe('50%');
  });

  it('renders REAL server validation findings when Validation is opened', async () => {
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — ZX-9');

    const validationTab = Array.from(document.querySelectorAll('.ec-art-tab'))
      .find((b) => /validation/i.test(b.textContent || '')) as HTMLElement;
    fireEvent.click(validationTab);

    // The real finding from the mocked route renders — not a client stand-in.
    expect(await screen.findByText(/Required eCTD section 2\.3 is missing from Module 2/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/1 error/);
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });

  it('renders the REAL ICH M4 compliance score when Compliance is opened', async () => {
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — ZX-9');

    const complianceTab = Array.from(document.querySelectorAll('.ec-art-tab'))
      .find((b) => /compliance/i.test(b.textContent || '')) as HTMLElement;
    fireEvent.click(complianceTab);

    await waitFor(() => expect(document.querySelector('.ec-cscore-num')?.textContent).toMatch(/83/));
    expect(screen.getByText('M4-004')).toBeTruthy();
    // The retired hardcoded 78% score must be gone.
    expect(document.body.textContent).not.toContain('78%');
  });

  /*
   * This test used to assert the defect: that the pane forwarded the question
   * to the shell's `onAsk` and showed nothing. The surface is registered
   * `ownsConversation: true`, so that rail is never drawn here — the question
   * went into a hidden column and, because `ask()` persists `anaOpen`, turned
   * up later on the next surface that did draw one. The pane runs its own
   * `useAnaChat` now and answers where it was asked.
   */
  it('answers in its own pane and never writes to the rail this screen hides', async () => {
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — ZX-9');

    const box = document.querySelector('.ec-composer textarea') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Tighten the efficacy paragraph' } });
    fireEvent.click(document.querySelector('.ec-send') as HTMLElement);

    // The turn lands in THIS pane, visibly, with AnA answering beneath it.
    await waitFor(() =>
      expect(document.querySelector('.ec-msg-user')?.textContent).toMatch(/Tighten the efficacy paragraph/),
    );
    expect(document.querySelector('.ec-msg-ai')).not.toBeNull();
    // And nothing is handed to the shell's conversation.
    expect(onAsk).not.toHaveBeenCalled();
  });
});

describe('EctdCoauthor — honest empty state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return ok(EMPTY_DOCS);
      return ok({});
    });
  });

  it('shows an EmptyState — never a fixture — when the org has no documents', async () => {
    render(<EctdCoauthor {...props()} />);

    expect(await screen.findByText('No eCTD documents yet')).toBeTruthy();
    // KPI count is the honest zero, not a fixture length.
    expect(footRow('Documents')).toBe('0');
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    expect(document.querySelector('.ec-tree-children')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});

describe('EctdCoauthor — honest error state', () => {
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return fail(403);
      return ok({});
    });
  });

  it("shows an error EmptyState — never a fixture — when the read fails", async () => {
    render(<EctdCoauthor {...props()} />);

    expect(await screen.findByText("Couldn't load eCTD documents")).toBeTruthy();
    expect(document.querySelector('.c2c-sample-tag')).toBeNull();
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });
});

describe('EctdCoauthor — tree search really filters (no dead input)', () => {
  /* The "Find section..." input used to be a literal noop (onChange={() => {}}).
     It now filters the loaded backbone client-side on title / section number,
     with an honest no-match note. */
  beforeEach(() => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return ok(REAL_DOCS);
      return ok({});
    });
  });

  it('filters by title and section number, says so on no match, and clears', async () => {
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — ZX-9');

    const input = screen.getByLabelText('Find a section') as HTMLInputElement;

    // Title match: only the safety document's module remains in the tree.
    fireEvent.change(input, { target: { value: 'safety' } });
    expect(screen.getByText('Integrated Summary of Safety')).toBeTruthy();
    expect(screen.queryByText('Drug Product — ZX-9')).toBeNull();

    // Section-number match.
    fireEvent.change(input, { target: { value: '3.2.P' } });
    expect(screen.getByText('Drug Product — ZX-9')).toBeTruthy();
    expect(screen.queryByText('Integrated Summary of Safety')).toBeNull();

    // No match → an honest note naming the query, never a silent empty tree.
    fireEvent.change(input, { target: { value: 'zzz-nothing' } });
    expect(screen.getByText(/No sections match "zzz-nothing"/)).toBeTruthy();

    // Clearing restores the full backbone.
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('Drug Product — ZX-9')).toBeTruthy();
    expect(screen.getByText('Integrated Summary of Safety')).toBeTruthy();
  });
});

describe('EctdCoauthor — no fabricated validation or compliance results', () => {
  it('reports validation as unavailable rather than inventing findings', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return ok(REAL_DOCS);
      if (method === 'POST' && /\/validate$/.test(url)) return fail(503);
      return ok({});
    });
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — ZX-9');

    const validationTab = Array.from(document.querySelectorAll('.ec-art-tab'))
      .find((b) => /validation/i.test(b.textContent || '')) as HTMLElement;
    fireEvent.click(validationTab);

    await waitFor(() => expect(document.body.textContent).toMatch(/validation service did not return a result/i));
    for (const s of RETIRED) expect(document.body.textContent).not.toContain(s);
  });

  it('reports compliance as unavailable rather than inventing a score', async () => {
    apiRequest.mockImplementation(async (method: string, url: string) => {
      if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return ok(REAL_DOCS);
      if (method === 'GET' && /\/compliance$/.test(url)) return fail(503);
      return ok({});
    });
    render(<EctdCoauthor {...props()} />);
    await screen.findByText('Drug Product — ZX-9');

    const complianceTab = Array.from(document.querySelectorAll('.ec-art-tab'))
      .find((b) => /compliance/i.test(b.textContent || '')) as HTMLElement;
    fireEvent.click(complianceTab);

    await waitFor(() => expect(document.body.textContent).toMatch(/compliance service did not return a result/i));
    // The retired hardcoded 78% ICH M4 score must not appear.
    expect(document.body.textContent).not.toContain('78%');
    expect(document.querySelector('.ec-cscore-num')).toBeNull();
  });
});

describe('EctdCoauthor — the Co-Author can AUTHOR', () => {
  it('mounts the ONE canonical editor over the document and saves through the store’s own PUT', async () => {
    /* Until this shipped, the artifact pane rendered coauthor_documents.content
       read-only through dangerouslySetInnerHTML, and the empty state told the
       author to go draft "in the authoring editor" — a surface named Co-Author
       that could not author. The canonical RichSectionEditor holds the content
       now, and its one save path is this store's own PUT. */
    try { localStorage.clear(); } catch { /* ignore */ }
    const put = vi.fn();
    apiRequest.mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'GET' && String(url).split('?')[0] === '/api/coauthor/documents') return ok(REAL_DOCS);
      if (method === 'PUT' && url === '/api/coauthor/documents/7001') {
        put(body);
        return ok({
          success: true,
          document: { ...REAL_DOCS.documents[0], content: (body as { content: string }).content },
        });
      }
      return fail(404);
    });
    render(<EctdCoauthor {...props()} />);

    await waitFor(() => expect(document.querySelector('.rse-root .tiptap')).toBeTruthy());
    // The read-only artifact body is gone; the editor holds the real content.
    expect(document.querySelector('.ec-doc-body')).toBeNull();
    expect(document.body.textContent).toContain('Development Rationale');

    const el = document.querySelector('.rse-body .tiptap') as HTMLElement & {
      editor?: { chain: () => any };
    };
    expect(el.editor).toBeTruthy();
    el.editor!.chain().focus().insertContent(' Amended for cycle 2.').run();

    const save = await waitFor(() => {
      const b = Array.from(document.querySelectorAll('button')).find((x) =>
        (x.textContent || '').includes('Save ('),
      ) as HTMLButtonElement | undefined;
      if (!b || b.disabled) throw new Error('save control not enabled yet');
      return b;
    });
    fireEvent.click(save);

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(String((put.mock.calls[0][0] as { content: string }).content)).toContain(
      'Amended for cycle 2.',
    );
    // The footer reports the CONFIRMED save — not an optimistic echo.
    await waitFor(() => expect(document.body.textContent).toContain('All changes saved'));
  });
});
