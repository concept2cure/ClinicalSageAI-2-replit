// @vitest-environment jsdom
/**
 * The outline's basis has to be on the screen, not just in the database.
 *
 * `migrations/20260810c_rule_pack_provenance.sql` recorded whether each filing
 * outline was transcribed from a regulation that enumerates its own contents
 * or constructed by reasoning about one that does not. Recording it changed
 * nothing a customer could see: the editor rendered a reasoned construction
 * and a verbatim transcription of 21 CFR 814.20(b) identically, so a filer
 * drafting against the former had no way to know that is what they were doing.
 *
 * These tests are the check on that. They assert what a person reads, and the
 * falsification test asserts that the band is not a constant — that two
 * different provenances actually produce two different statements.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('@/services/portal/authService', () => ({
  useAuth: () => ({ user: { displayName: 'Test Author', email: 'author@test.co' } }),
}));

import { DocumentAuthoring } from '../surfaces/DocumentAuthoring';

const PROJECT_ID = '11111111-2222-3333-4444-555555555555';
const DOC_ID = 'C2CDOC-1';

function ok(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as Response;
}

const AUTHORING_DOCS = {
  success: true,
  documents: [
    {
      id: 'D1', title: 'Technical Documentation', module: 'M3', product_code: 'ABC',
      status: 'draft', updated_at: '2026-08-01T10:00:00Z', section_count: 1,
    },
  ],
};
const AUTHORING_SECTIONS = {
  success: true,
  sections: [
    {
      id: 'S1', doc_id: 'D1', code: 'A', title: 'Device description',
      content: 'The device is a single-use catheter.', order_index: 0,
      comment_count: 0, revision_count: 1, citation_count: 0,
      updated_at: '2026-08-01T10:00:00Z',
    },
  ],
};

/** The outline payload, with whatever `provenance` the case under test wants. */
function outlineResponse(provenance: unknown) {
  const document: Record<string, unknown> = {
    id: DOC_ID, title: 'Technical Documentation', doc_type: 'mdr', agency: 'ema',
    status: 'draft', readiness: 20,
  };
  // `undefined` models a server that predates the provenance work and omits
  // the field entirely — distinct from one that sends an undeclared object.
  if (provenance !== undefined) document.provenance = provenance;
  return {
    document,
    outline: [
      { key: 'A', parent_key: null, label: 'Device description', mandatory: true, path_order: 1, status: 'todo', draft_source: null, has_content: false, version: 1 },
    ],
  };
}

function wire(provenance: unknown) {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (method: string, url: string) => {
    if (method === 'GET' && url.startsWith('/api/authoring/docs?')) return ok(AUTHORING_DOCS);
    if (method === 'GET' && url === '/api/authoring/docs/D1/sections') return ok(AUTHORING_SECTIONS);
    if (method === 'GET' && url.startsWith('/api/c2c/documents?projectId=')) {
      return ok({ documents: [{ id: DOC_ID, doc_type: 'mdr', agency: 'ema', title: 'Technical Documentation', rule_pack_version: 'v1', status: 'draft', readiness: 20 }] });
    }
    if (method === 'GET' && url === `/api/c2c/documents/${DOC_ID}/outline`) {
      return ok(outlineResponse(provenance));
    }
    return ok({ success: true });
  });
}

const props = () => ({
  surface: { id: 'document-authoring', label: 'Authoring' } as any,
  onAsk: vi.fn(),
  onNav: vi.fn(),
  segment: 'biotech',
});

beforeEach(() => {
  (window as any).C2C_PROJECT = { id: PROJECT_ID };
});
afterEach(() => {
  cleanup();
  delete (window as any).C2C_PROJECT;
});

/** The rendered basis band, once the outline has loaded. */
async function bandText(): Promise<string> {
  const chip = await screen.findByText(/outline basis/i);
  const band = chip.closest('.ed-prov');
  expect(band).toBeTruthy();
  return band!.textContent ?? '';
}

describe('the filing outline says what it was built from', () => {
  it('a reasoned construction says so, and says to check it against the regulation', async () => {
    wire({
      sourceBasis: 'reasoned_construction',
      confidence: 'low',
      reviewStatus: 'unreviewed',
      governingRule: 'UK MDR 2002',
      uncertainties: null,
    });
    render(<DocumentAuthoring {...props()} />);

    const text = await bandText();
    expect(text).toMatch(/Constructed/i);
    expect(text).toMatch(/Check it against the regulation/i);
    expect(text).toContain('UK MDR 2002');

    const chip = document.querySelector('.ed-prov-chip') as HTMLElement;
    expect(chip.dataset.tone).toBe('warn');
  });

  // The substitution this whole thread exists to prevent. A faithful
  // transcription of FDA regulation is still not an outline a regulatory
  // professional has signed off, and must not be dressed as one.
  it('an unreviewed transcription is not painted as verified', async () => {
    wire({
      sourceBasis: 'statutory_transcription',
      confidence: 'high',
      reviewStatus: 'unreviewed',
      governingRule: '21 CFR 814.20(b) — Application contents',
      uncertainties: 'Confirm module placement before filing.',
    });
    render(<DocumentAuthoring {...props()} />);

    const text = await bandText();
    expect(text).toMatch(/transcribed from a regulation/i);
    expect(text).toContain('21 CFR 814.20(b)');
    expect(text).toContain('Confirm module placement before filing.');
    expect(text).toMatch(/Not reviewed by a regulatory professional/i);

    const chip = document.querySelector('.ed-prov-chip') as HTMLElement;
    expect(chip.dataset.tone).not.toBe('ok');
    expect(chip.dataset.tone).toBe('idle');
  });

  // An older API omits `provenance` entirely. The qualification must not
  // silently disappear — the absence of a claim is itself the claim.
  it('a server that sends no provenance renders "basis undeclared", not nothing', async () => {
    wire(undefined);
    render(<DocumentAuthoring {...props()} />);

    const text = await bandText();
    expect(text).toMatch(/Basis undeclared/i);
    expect(text).toMatch(/Treat nothing in it as verified/i);

    const chip = document.querySelector('.ed-prov-chip') as HTMLElement;
    expect(chip.dataset.tone).toBe('err');
  });

  it('an unrecognised basis is refused rather than shown to the filer', async () => {
    wire({ sourceBasis: 'reviewed_by_fda', confidence: 'high', reviewStatus: 'reviewed' });
    render(<DocumentAuthoring {...props()} />);

    const text = await bandText();
    expect(text).not.toMatch(/reviewed_by_fda/i);
    expect(text).toMatch(/Basis undeclared/i);
  });

  // THE FALSIFICATION — without this, every assertion above would still pass
  // if the band were a hardcoded string that never read the data at all.
  it('two different provenances produce two different statements', async () => {
    wire({ sourceBasis: 'reasoned_construction', confidence: 'low', reviewStatus: 'unreviewed', governingRule: null, uncertainties: null });
    const first = render(<DocumentAuthoring {...props()} />);
    const constructedText = await bandText();
    const constructedTone = (document.querySelector('.ed-prov-chip') as HTMLElement).dataset.tone;
    first.unmount();

    wire({ sourceBasis: 'harmonised_standard', confidence: 'high', reviewStatus: 'reviewed', governingRule: 'ICH M4', uncertainties: null });
    render(<DocumentAuthoring {...props()} />);
    await waitFor(async () => expect(await bandText()).toMatch(/ICH M4/));
    const reviewedText = await bandText();
    const reviewedTone = (document.querySelector('.ed-prov-chip') as HTMLElement).dataset.tone;

    expect(reviewedText).not.toBe(constructedText);
    expect(reviewedTone).not.toBe(constructedTone);
    // And only the reviewed one is green.
    expect(reviewedTone).toBe('ok');
    expect(reviewedText).not.toMatch(/Not reviewed by a regulatory professional/i);
  });
});
