// @vitest-environment jsdom
/**
 * The Section check panel shows what the record says the section must contain.
 *
 * The panel (DocumentWorkbench, data-testid="section-check") rendered only the
 * scan's heuristic flags. Its section-specific expectations came from a table
 * of five CMC codes inside the route handler, so an author drafting 2.5, 2.7.3,
 * 2.7.4 or 4.2.3 was shown nothing at all about the section's required
 * content — while server/services/ind/ctd/authoring-guidance.ts has carried
 * `keyContentElements` for every registered code since the record landed.
 *
 * The scan now serves the record's own elements (`record_requirements`) as a
 * READ-ONLY statement, and the panel renders them quietly under its existing
 * note. What is pinned here is what the AUTHOR sees:
 *   · the record's elements for 2.5, named as what the record says the section
 *     must contain and as NOT verified by this check, with their basis;
 *   · a parent code's contained sections rather than an empty list;
 *   · a code the record does not index read as the resolver's own reason —
 *     never as "nothing required" and never as an empty list;
 *   · the panel's existing restraint: still "not a compliance determination",
 *     and the unsaved-edits warning untouched.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queryClient')>()),
  apiRequest,
}));
vi.mock('@/services/portal/authService', async original => ({ ...await original<typeof import('@/services/portal/authService')>(),
  useAuth: () => ({ user: { id: '7', email: 'ra@example.test', displayName: 'R. Author' } }),
}));

/* jsdom has no layout; ProseMirror asks for client rects on mount. */
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

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const ok = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload } as Response);

const DOCS = {
  success: true,
  documents: [
    { id: 'D1', title: 'Clinical Overview', module: 'M2', product_code: 'ABC', status: 'draft', updated_at: null, section_count: 1 },
  ],
};
const SECTIONS = {
  success: true,
  sections: [
    { id: 'S1', doc_id: 'D1', code: '2.5', title: 'Clinical Overview', content: '<p>Text.</p>', order_index: 0, comment_count: 0, revision_count: 1, citation_count: 0, updated_at: null },
  ],
};

const RECORD_ELEMENTS = [
  'Product development rationale linking unmet need, MOA, and program design (2.5.1)',
  'Overview of efficacy: pivotal trial designs, endpoints, results, and consistency across studies (2.5.4)',
  'Benefit-risk conclusions integrating efficacy and safety for the proposed use (2.5.6)',
];

function props() {
  return { surface: { id: 'document-authoring', label: 'Authoring' } as any, onAsk: vi.fn(), onNav: vi.fn(), segment: 'biotech' };
}

/** Wire the scan to answer with `record_requirements` as the server sends it. */
function wireScan(recordRequirements: unknown) {
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(SECTIONS);
    if (method === 'POST' && url === '/api/authoring/sections/S1/ai/deficiency-scan') {
      return ok({
        success: true,
        scan_results: {
          section_id: 'S1',
          section_code: '2.5',
          signal_type: 'heuristic_quality',
          quality_score: 80,
          checks_run: 5,
          checks_passed: 4,
          deficiency_count: 0,
          deficiencies: [],
          record_requirements: recordRequirements,
          scanned_at: '2026-10-11T12:00:00Z',
        },
      });
    }
    return ok({ success: true, revisions: [], comments: [], sources: [] });
  });
}

async function openCheck() {
  render(<DocumentAuthoring {...props()} />);
  fireEvent.click(await screen.findByRole('button', { name: /check/i }));
  return screen.findByTestId('section-check');
}

beforeEach(() => {
  apiRequest.mockReset();
  try { localStorage.clear(); } catch { /* ignore */ }
});
afterEach(() => cleanup());

describe('the section check shows the record’s required content', () => {
  it('lists the record’s elements for 2.5, named as the record’s statement and as unverified, with its basis', async () => {
    wireScan({
      indexed: true,
      source: 'exact',
      answered_by: '2.5',
      title: 'Clinical Overview',
      elements: RECORD_ELEMENTS,
      verified_by_this_check: false,
      note: 'What the record states section 2.5 must contain. This check does not verify these elements.',
      basis: 'ICH M4E CTD content, as compiled in the platform record (recall — not checked against the regulator’s text)',
    });
    const panel = await openCheck();

    // The author sees the record's own words, every one of them.
    for (const el of RECORD_ELEMENTS) expect(panel.textContent).toContain(el);
    // Framed as the record's statement about 2.5, not as a result of this check.
    expect(panel.textContent).toMatch(/record/i);
    expect(panel.textContent).toMatch(/2\.5/);
    expect(panel.textContent).toMatch(/does not verify/i);
    // The basis travels with the statement, and recall says recall.
    expect(panel.textContent).toMatch(/recall — not checked against the regulator/);
    // The panel keeps its restraint.
    expect(panel.textContent).toContain('not a compliance determination');
    expect(panel.textContent).not.toMatch(/compliant|%/);
  });

  it('shows a parent code’s contained sections instead of an empty list', async () => {
    wireScan({
      indexed: true,
      source: 'parent',
      answered_by: '4.2.3',
      title: '4.2.3 — the sections it contains',
      elements: [],
      contains: [
        { code: '4.2.3.3', title: 'Genotoxicity' },
        { code: '4.2.3.4', title: 'Carcinogenicity' },
      ],
      verified_by_this_check: false,
      note: 'The record carries requirements for each section 4.2.3 contains. This check does not verify them.',
      basis: 'ICH M4S CTD content, as compiled in the platform record (recall — not checked against the regulator’s text)',
    });
    const panel = await openCheck();

    expect(panel.textContent).toMatch(/4\.2\.3\.3/);
    expect(panel.textContent).toContain('Genotoxicity');
    expect(panel.textContent).toContain('Carcinogenicity');
  });

  it('names the containing section when the answer came from an ancestor entry', async () => {
    wireScan({
      indexed: true,
      source: 'ancestor',
      answered_by: '3.2.S.4',
      title: 'Control of Drug Substance',
      elements: ['Specification with tests, acceptance criteria, and justification'],
      verified_by_this_check: false,
      note: 'What the record states section 3.2.S.4 must contain. This check does not verify these elements.',
      basis: 'ICH M4Q CTD content, as compiled in the platform record (recall — not checked against the regulator’s text)',
    });
    const panel = await openCheck();

    expect(panel.textContent).toMatch(/3\.2\.S\.4/);
    // The author is told this is the containing section's entry, not this section's own.
    expect(panel.textContent).toMatch(/containing section|has no entry of its own/i);
  });

  it('reads a code the record does not index as not indexed — never as nothing required', async () => {
    wireScan({
      indexed: false,
      reason:
        'The platform’s guidance has no entry for "9.9.9". It is not stated here; do not supply requirements from memory as if it were.',
    });
    const panel = await openCheck();

    expect(panel.textContent).toMatch(/not indexed/i);
    expect(panel.textContent).toContain('has no entry for "9.9.9"');
    expect(panel.textContent).not.toMatch(/nothing required|no requirements|all requirements met/i);
  });

  it('says nothing about required content when the server sent no record statement', async () => {
    wireScan(undefined);
    const panel = await openCheck();

    // Honest silence — not an empty "must contain" list, which would read as
    // "nothing required".
    expect(panel.textContent).not.toMatch(/must contain/i);
    expect(panel.textContent).toContain('not a compliance determination');
  });
});
